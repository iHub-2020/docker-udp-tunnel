/*
 * File: app/static/js/app.js
 * Author: iHub-2020
 * Date: 2026-01-14
 * Version: 3.1.0
 * Description: Frontend logic for UDP Tunnel Manager - Fixed all element ID mismatches
 * Changes: 
 *   - ✅ Fixed all element IDs to match index.html
 *   - ✅ Fixed modal field IDs (edit* prefix)
 *   - ✅ Fixed table body IDs
 *   - ✅ Fixed diagnostics modal IDs
 *   - ✅ Fixed tab switching logic
 *   - ✅ Improved error handling
 */

(function() {
    'use strict';

    // ==================== State Management ====================
    let config = {
        global: {
            enabled: false,
            keep_iptables: true,
            wait_lock: true,
            retry_on_error: true,
            log_level: 'info'
        },
        servers: [],
        clients: []
    };
    
    let originalConfig = null;
    let modalState = { type: null, mode: 'add', index: -1 };
    let diagAutoRefresh = null;

    // ==================== Utility Functions ====================
    
    /**
     * Get element by ID with error logging
     */
    function getEl(id) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`Element not found: #${id}`);
        }
        return el;
    }

    /**
     * Get element by selector
     */
    function getElBySelector(selector) {
        const el = document.querySelector(selector);
        if (!el) {
            console.warn(`Element not found: ${selector}`);
        }
        return el;
    }

    /**
     * Set text content safely
     */
    function setText(id, text) {
        const el = getEl(id);
        if (el) el.textContent = text;
    }

    /**
     * Set input value safely
     */
    function setVal(id, value) {
        const el = getEl(id);
        if (el) el.value = value;
    }

    /**
     * Set checkbox state safely
     */
    function setCheck(id, checked) {
        const el = getEl(id);
        if (el) el.checked = !!checked;
    }

    /**
     * Get input value safely
     */
    function getVal(id) {
        const el = getEl(id);
        return el ? el.value : '';
    }

    /**
     * Get checkbox state safely
     */
    function getCheck(id) {
        const el = getEl(id);
        return el ? el.checked : false;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show/hide element
     */
    function setDisplay(selector, display) {
        const el = typeof selector === 'string' && selector.startsWith('.') 
            ? getElBySelector(selector) 
            : getEl(selector);
        if (el) el.style.display = display;
    }

    // ==================== API Functions ====================

    /**
     * Load configuration from server
     */
    async function loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            config = {
                global: {
                    enabled: false,
                    keep_iptables: true,
                    wait_lock: true,
                    retry_on_error: true,
                    log_level: 'info',
                    ...data.global
                },
                servers: Array.isArray(data.servers) ? data.servers : [],
                clients: Array.isArray(data.clients) ? data.clients : []
            };
            
            originalConfig = JSON.parse(JSON.stringify(config));
            applyConfigToUI();
            renderServerTable();
            renderClientTable();
            
            console.log('Configuration loaded successfully');
        } catch (error) {
            console.error('Failed to load configuration:', error);
            alert('Failed to load configuration from server.');
        }
    }

    /**
     * Load status from server
     */
    async function loadStatus() {
        try {
            const response = await fetch('/api/status');
            if (!response.ok) return;
            
            const data = await response.json();
            updateStatusDisplay(data);
        } catch (error) {
            console.error('Failed to load status:', error);
        }
    }

    /**
     * Load diagnostics data
     */
    async function loadDiagnostics() {
        try {
            const [statusRes, logsRes, diagRes] = await Promise.all([
                fetch('/api/status'),
                fetch('/api/logs?lines=100'),
                fetch('/api/diagnostics')
            ]);
            
            const status = await statusRes.json();
            const logs = await logsRes.json();
            const diag = await diagRes.json();
            
            // Merge diagnostics into status
            status.binary = diag.binary;
            status.iptables = diag.iptables;
            
            updateDiagnosticsDisplay(status, logs);
        } catch (error) {
            console.error('Failed to load diagnostics:', error);
        }
    }

    // ==================== UI Update Functions ====================

    /**
     * Apply loaded config to UI elements
     */
    function applyConfigToUI() {
        // Fixed IDs to match HTML
        setCheck('enableService', config.global.enabled);
        setCheck('keepIptables', config.global.keep_iptables);
        setCheck('waitIptables', config.global.wait_lock);
        setCheck('retryOnError', config.global.retry_on_error);
        setVal('logLevel', config.global.log_level || 'info');
    }

    /**
     * Collect config from UI elements
     */
    function collectConfigFromUI() {
        // Fixed IDs to match HTML
        config.global.enabled = getCheck('enableService');
        config.global.keep_iptables = getCheck('keepIptables');
        config.global.wait_lock = getCheck('waitIptables');
        config.global.retry_on_error = getCheck('retryOnError');
        config.global.log_level = getVal('logLevel');
    }

    /**
     * Update status display
     */
    function updateStatusDisplay(data) {
        const tunnels = data.tunnels || [];
        const activeCount = tunnels.filter(t => t.running).length;
        const isRunning = activeCount > 0;
        
        // Update status badge (Fixed ID)
        const badge = getEl('serviceStatus');
        if (badge) {
            badge.textContent = isRunning ? 'Running' : 'Stopped';
            badge.className = 'status-badge ' + (isRunning ? 'running' : 'stopped');
        }
        
        // Update tunnel count (Fixed ID)
        const countEl = getEl('tunnelCount');
        if (countEl) {
            // Update only the number, preserve the translated text
            const tunnelsText = countEl.querySelector('[data-i18n="tunnels_active"]');
            if (tunnelsText) {
                countEl.innerHTML = `(${activeCount} <span data-i18n="tunnels_active">${tunnelsText.textContent}</span>)`;
            } else {
                countEl.textContent = `(${activeCount} tunnels active)`;
            }
        }
        
        // Update status tables
        updateStatusTables(tunnels);
    }

    /**
     * Update server and client status tables
     */
    function updateStatusTables(tunnels) {
        // Server status table (Fixed ID)
        const serverBody = getEl('serverStatusBody');
        if (serverBody) {
            serverBody.innerHTML = '';
            if (config.servers.length === 0) {
                serverBody.innerHTML = '<tr class="empty-row"><td colspan="6" data-i18n="no_server_instances">No server instances.</td></tr>';
            } else {
                config.servers.forEach((server, index) => {
                    const status = tunnels.find(t => t.id === `server_${index}`) || {};
                    const running = status.running ? 'running' : 'stopped';
                    const runningText = status.running ? 'Running' : 'Stopped';
                    const row = `
                        <tr>
                            <td>${escapeHtml(server.alias || 'Server ' + index)}</td>
                            <td><span class="status-badge ${running}" data-i18n="${running}">${runningText}</span></td>
                            <td>${server.listen_ip || '0.0.0.0'}:${server.listen_port}</td>
                            <td>${server.forward_ip}:${server.forward_port}</td>
                            <td>${server.raw_mode || 'faketcp'}</td>
                            <td>${status.pid || '-'}</td>
                        </tr>
                    `;
                    serverBody.innerHTML += row;
                });
            }
        }
        
        // Client status table (Fixed ID)
        const clientBody = getEl('clientStatusBody');
        if (clientBody) {
            clientBody.innerHTML = '';
            if (config.clients.length === 0) {
                clientBody.innerHTML = '<tr class="empty-row"><td colspan="6" data-i18n="no_client_instances">No client instances.</td></tr>';
            } else {
                config.clients.forEach((client, index) => {
                    const status = tunnels.find(t => t.id === `client_${index}`) || {};
                    const running = status.running ? 'running' : 'stopped';
                    const runningText = status.running ? 'Running' : 'Stopped';
                    const row = `
                        <tr>
                            <td>${escapeHtml(client.alias || 'Client ' + index)}</td>
                            <td><span class="status-badge ${running}" data-i18n="${running}">${runningText}</span></td>
                            <td>${client.local_ip || '127.0.0.1'}:${client.local_port}</td>
                            <td>${client.server_ip}:${client.server_port}</td>
                            <td>${client.raw_mode || 'faketcp'}</td>
                            <td>${status.pid || '-'}</td>
                        </tr>
                    `;
                    clientBody.innerHTML += row;
                });
            }
        }
    }

    /**
     * Update diagnostics modal display
     */
    function updateDiagnosticsDisplay(status, logs) {
        const tunnels = status.tunnels || [];
        
        // Tunnel table (Fixed: diagTunnelTable is the table, need tbody)
        const table = getEl('diagTunnelTable');
        let tunnelBody = table ? table.querySelector('tbody') : getEl('diagTunnelBody');
        
        if (tunnelBody) {
            tunnelBody.innerHTML = '';
            
            // Render servers
            config.servers.forEach((server, index) => {
                const id = `server_${index}`;
                const st = tunnels.find(t => t.id === id) || {};
                const statusClass = st.running ? 'running' : (server.enabled !== false ? 'stopped' : 'disabled');
                const statusText = st.running ? 'Running' : (server.enabled !== false ? 'Stopped' : 'Disabled');
                
                const row = `
                    <tr>
                        <td>${escapeHtml(server.alias || 'Server')}</td>
                        <td data-i18n="server">Server</td>
                        <td><span class="status-text ${statusClass}" data-i18n="${statusClass}">${statusText}</span></td>
                        <td>${server.listen_ip || '0.0.0.0'}:${server.listen_port}</td>
                        <td>${server.forward_ip}:${server.forward_port}</td>
                        <td>${server.raw_mode || 'faketcp'} / ${server.cipher_mode || 'xor'}</td>
                        <td>${st.pid || '-'}</td>
                    </tr>
                `;
                tunnelBody.innerHTML += row;
            });
            
            // Render clients
            config.clients.forEach((client, index) => {
                const id = `client_${index}`;
                const st = tunnels.find(t => t.id === id) || {};
                const statusClass = st.running ? 'running' : (client.enabled !== false ? 'stopped' : 'disabled');
                const statusText = st.running ? 'Running' : (client.enabled !== false ? 'Stopped' : 'Disabled');
                
                const row = `
                    <tr>
                        <td>${escapeHtml(client.alias || 'Client')}</td>
                        <td data-i18n="client">Client</td>
                        <td><span class="status-text ${statusClass}" data-i18n="${statusClass}">${statusText}</span></td>
                        <td>${client.local_ip || '127.0.0.1'}:${client.local_port}</td>
                        <td>${client.server_ip}:${client.server_port}</td>
                        <td>${client.raw_mode || 'faketcp'} / ${client.cipher_mode || 'xor'}</td>
                        <td>${st.pid || '-'}</td>
                    </tr>
                `;
                tunnelBody.innerHTML += row;
            });
            
            if (config.servers.length === 0 && config.clients.length === 0) {
                tunnelBody.innerHTML = '<tr class="empty-row"><td colspan="7" data-i18n="no_tunnels">No tunnels configured.</td></tr>';
            }
        }
        
        // Logs (Fixed ID)
        let logLines = [];
        if (logs.logs && typeof logs.logs === 'string') {
            logLines = logs.logs.split('\n').filter(l => l.trim());
        } else if (logs.lines && Array.isArray(logs.lines)) {
            logLines = logs.lines;
        }
        
        const logContent = getEl('logContent');
        if (logContent) {
            if (logLines.length > 0) {
                logContent.innerHTML = logLines.map(formatLogLine).join('\n');
            } else {
                logContent.innerHTML = '<span class="log-line" data-i18n="no_logs">No recent logs.</span>';
            }
            
            // Auto scroll to bottom (use class selector)
            const logContainer = getElBySelector('.log-container');
            if (logContainer) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }
        
        // Update timestamp (Fixed ID)
        const timestamp = getEl('logTimestamp');
        if (timestamp) {
            timestamp.textContent = new Date().toLocaleTimeString();
        }
    }

    /**
     * Format log line with highlighting
     */
    function formatLogLine(line) {
        const escaped = escapeHtml(line.replace(/\x1b\[[0-9;]*m/g, ''));
        return `<span class="log-line">${escaped.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="log-time">$1</span>')}</span>`;
    }

    /**
     * Render server configuration table
     */
    function renderServerTable() {
        const tbody = getEl('serverTableBody'); // Fixed ID
        if (!tbody) {
            console.error('Server table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        if (config.servers.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6" data-i18n="no_server_instances">No server instances.</td></tr>';
            return;
        }
        
        config.servers.forEach((server, index) => {
            const row = `
                <tr>
                    <td>${escapeHtml(server.alias || 'Server ' + index)}</td>
                    <td>
                        <input type="checkbox" class="checkbox" 
                               ${server.enabled !== false ? 'checked' : ''} 
                               onchange="window.config.servers[${index}].enabled = this.checked">
                    </td>
                    <td>${server.listen_port || ''}</td>
                    <td>${escapeHtml(server.forward_ip || '')}</td>
                    <td>${server.forward_port || ''}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="window.openEditModal('server', ${index})" data-i18n="edit">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteInstance('server', ${index})" data-i18n="delete">Delete</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    }

    /**
     * Render client configuration table
     */
    function renderClientTable() {
        const tbody = getEl('clientTableBody'); // Fixed ID
        if (!tbody) {
            console.error('Client table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        if (config.clients.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6" data-i18n="no_client_instances">No client instances.</td></tr>';
            return;
        }
        
        config.clients.forEach((client, index) => {
            const row = `
                <tr>
                    <td>${escapeHtml(client.alias || 'Client ' + index)}</td>
                    <td>
                        <input type="checkbox" class="checkbox" 
                               ${client.enabled !== false ? 'checked' : ''} 
                               onchange="window.config.clients[${index}].enabled = this.checked">
                    </td>
                    <td>${escapeHtml(client.server_ip || '')}</td>
                    <td>${client.server_port || ''}</td>
                    <td>${client.local_port || ''}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="window.openEditModal('client', ${index})" data-i18n="edit">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteInstance('client', ${index})" data-i18n="delete">Delete</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    }

    // ==================== Global Window Functions ====================

    /**
     * Toggle theme between light and dark
     */
    window.toggleTheme = function() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('udp_tunnel_theme', newTheme);
        
        console.log(`Theme switched to: ${newTheme}`);
    };

    /**
     * Toggle dropdown menu
     */
    window.toggleDropdown = function(id) {
        const dropdown = getEl(id);
        // Close other dropdowns
        document.querySelectorAll('.icon-dropdown').forEach(d => {
            if (d.id !== id) d.classList.remove('open');
        });
        if (dropdown) {
            dropdown.classList.toggle('open');
        }
    };

    /**
     * Set language (for i18n.js)
     */
    window.setLanguage = function(lang) {
        if (window.I18n && window.I18n.setLanguage) {
            window.I18n.setLanguage(lang);
            window.toggleDropdown('langDropdown'); // Close dropdown
        }
    };

    /**
     * Open diagnostics modal
     */
    window.openDiagModal = function() {
        const modal = getEl('diagModal'); // Fixed ID
        if (modal) {
            modal.classList.add('show');
            loadDiagnostics();
            
            // Auto-refresh every 3 seconds
            if (diagAutoRefresh) {
                clearInterval(diagAutoRefresh);
            }
            diagAutoRefresh = setInterval(loadDiagnostics, 3000);
        } else {
            console.error('Diagnostics modal not found');
        }
    };

    /**
     * Close diagnostics modal
     */
    window.closeDiagModal = function() {
        const modal = getEl('diagModal'); // Fixed ID
        if (modal) {
            modal.classList.remove('show');
        }
        
        if (diagAutoRefresh) {
            clearInterval(diagAutoRefresh);
            diagAutoRefresh = null;
        }
    };

    /**
     * Close modal (generic)
     */
    window.closeModal = function(id) {
        const modal = getEl(id);
        if (modal) {
            modal.classList.remove('show');
        }
        
        // If it's diag modal, stop refresh
        if (id === 'diagModal' && diagAutoRefresh) {
            clearInterval(diagAutoRefresh);
            diagAutoRefresh = null;
        }
    };

    /**
     * Refresh logs in diagnostics
     */
    window.refreshLogs = function() {
        loadDiagnostics();
    };

    /**
     * Scroll logs to bottom
     */
    window.scrollLogsToBottom = function() {
        const container = getElBySelector('.log-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    };

    /**
     * Save configuration and apply
     */
    window.saveAndApply = async function() {
        try {
            collectConfigFromUI();
            
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save configuration');
            }
            
            originalConfig = JSON.parse(JSON.stringify(config));
            alert('Configuration saved and applied successfully!');
            loadStatus();
            
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save configuration: ' + error.message);
        }
    };

    /**
     * Save configuration only (without applying)
     */
    window.saveOnly = async function() {
        try {
            collectConfigFromUI();
            
            const response = await fetch('/api/config?apply=false', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save configuration');
            }
            
            originalConfig = JSON.parse(JSON.stringify(config));
            alert('Configuration saved (not applied).');
            
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save configuration: ' + error.message);
        }
    };

    /**
     * Reset configuration to last saved state
     */
    window.resetConfig = function() {
        if (originalConfig && confirm('Discard all unsaved changes?')) {
            config = JSON.parse(JSON.stringify(originalConfig));
            applyConfigToUI();
            renderServerTable();
            renderClientTable();
        }
    };

    /**
     * Open modal to add new instance
     */
    window.openAddModal = function(type) {
        console.log(`Opening add modal for: ${type}`);
        
        modalState = { type, mode: 'add', index: -1 };
        
        // Set title (Fixed ID)
        const titleEl = getEl('editModalTitle');
        if (titleEl) {
            if (type === 'server') {
                titleEl.setAttribute('data-i18n', 'new_server');
                titleEl.textContent = 'New Server';
            } else {
                titleEl.setAttribute('data-i18n', 'new_client');
                titleEl.textContent = 'New Client';
            }
        }
        
        // Show/hide appropriate fields using class selectors
        document.querySelectorAll('.server-field').forEach(el => {
            el.style.display = type === 'server' ? '' : 'none';
        });
        document.querySelectorAll('.client-field').forEach(el => {
            el.style.display = type === 'client' ? '' : 'none';
        });
        
        // Reset form to defaults (Fixed IDs with 'edit' prefix)
        setCheck('editEnable', true);
        setVal('editAlias', type === 'server' ? 'New Server' : 'New Client');
        setVal('editPassword', '');
        setVal('editRawMode', 'faketcp');
        setVal('editCipherMode', 'xor');
        setVal('editAuthMode', 'simple');
        setCheck('editAutoIptables', true);
        setVal('editExtraArgs', '');
        setVal('editSourceIp', '');
        setVal('editSourcePort', '');
        setVal('editSeqMode', '3');
        
        if (type === 'server') {
            setVal('editWanAddress', '0.0.0.0');
            setVal('editWanPort', '29900');
            setVal('editForwardIp', '127.0.0.1');
            setVal('editForwardPort', '51820');
        } else {
            setVal('editVpsAddress', '');
            setVal('editVpsPort', '29900');
            setVal('editLocalAddress', '127.0.0.1');
            setVal('editLocalPort', '3333');
        }
        
        // Switch to basic tab (Fixed IDs)
        const basicTab = getEl('basicTab');
        const advancedTab = getEl('advancedTab');
        if (basicTab) basicTab.classList.add('active');
        if (advancedTab) advancedTab.classList.remove('active');
        
        // Update tab buttons
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-target') === 'basicTab');
        });
        
        // Show modal (Fixed ID)
        const modal = getEl('editModal');
        if (modal) {
            modal.classList.add('show');
        } else {
            console.error('Edit modal not found');
        }
    };

    /**
     * Open modal to edit existing instance
     */
    window.openEditModal = function(type, index) {
        console.log(`Opening edit modal for: ${type}[${index}]`);
        
        modalState = { type, mode: 'edit', index };
        
        const item = type === 'server' ? config.servers[index] : config.clients[index];
        if (!item) {
            console.error(`Item not found: ${type}[${index}]`);
            return;
        }
        
        // Set title (Fixed ID)
        const titleEl = getEl('editModalTitle');
        if (titleEl) {
            titleEl.textContent = item.alias || (type === 'server' ? 'Server' : 'Client');
        }
        
        // Show/hide appropriate fields
        document.querySelectorAll('.server-field').forEach(el => {
            el.style.display = type === 'server' ? '' : 'none';
        });
        document.querySelectorAll('.client-field').forEach(el => {
            el.style.display = type === 'client' ? '' : 'none';
        });
        
        // Populate form with existing values (Fixed IDs with 'edit' prefix)
        setCheck('editEnable', item.enabled !== false);
        setVal('editAlias', item.alias || '');
        setVal('editPassword', item.password || '');
        setVal('editRawMode', item.raw_mode || 'faketcp');
        setVal('editCipherMode', item.cipher_mode || 'xor');
        setVal('editAuthMode', item.auth_mode || 'simple');
        setCheck('editAutoIptables', item.auto_iptables !== false);
        setVal('editExtraArgs', item.extra_args || '');
        setVal('editSourceIp', item.source_ip || '');
        setVal('editSourcePort', item.source_port || '');
        setVal('editSeqMode', item.seq_mode || '3');
        
        if (type === 'server') {
            setVal('editWanAddress', item.listen_ip || '0.0.0.0');
            setVal('editWanPort', item.listen_port || '29900');
            setVal('editForwardIp', item.forward_ip || '127.0.0.1');
            setVal('editForwardPort', item.forward_port || '51820');
        } else {
            setVal('editVpsAddress', item.server_ip || '');
            setVal('editVpsPort', item.server_port || '29900');
            setVal('editLocalAddress', item.local_ip || '127.0.0.1');
            setVal('editLocalPort', item.local_port || '3333');
        }
        
        // Switch to basic tab (Fixed IDs)
        const basicTab = getEl('basicTab');
        const advancedTab = getEl('advancedTab');
        if (basicTab) basicTab.classList.add('active');
        if (advancedTab) advancedTab.classList.remove('active');
        
        // Update tab buttons
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-target') === 'basicTab');
        });
        
        // Show modal (Fixed ID)
        const modal = getEl('editModal');
        if (modal) {
            modal.classList.add('show');
        }
    };

    /**
     * Save modal data (called from Save button in modal)
     */
    window.saveModalData = function() {
        console.log('Saving modal data...');
        
        const isServer = modalState.type === 'server';
        
        // Validation (Fixed IDs with 'edit' prefix)
        if (isServer) {
            if (!getVal('editForwardIp')) {
                alert('Forward To IP is required for server instances.');
                return;
            }
        } else {
            if (!getVal('editVpsAddress')) {
                alert('VPS Address is required for client instances.');
                return;
            }
        }
        
        // Build item object (Fixed IDs with 'edit' prefix)
        const item = {
            enabled: getCheck('editEnable'),
            alias: getVal('editAlias'),
            password: getVal('editPassword'),
            raw_mode: getVal('editRawMode'),
            cipher_mode: getVal('editCipherMode'),
            auth_mode: getVal('editAuthMode'),
            auto_iptables: getCheck('editAutoIptables'),
            extra_args: getVal('editExtraArgs')
        };
        
        if (isServer) {
            item.listen_ip = getVal('editWanAddress');
            item.listen_port = parseInt(getVal('editWanPort')) || 29900;
            item.forward_ip = getVal('editForwardIp');
            item.forward_port = parseInt(getVal('editForwardPort')) || 51820;
        } else {
            item.server_ip = getVal('editVpsAddress');
            item.server_port = parseInt(getVal('editVpsPort')) || 29900;
            item.local_ip = getVal('editLocalAddress');
            item.local_port = parseInt(getVal('editLocalPort')) || 3333;
            item.source_ip = getVal('editSourceIp');
            const sourcePort = getVal('editSourcePort');
            item.source_port = sourcePort ? parseInt(sourcePort) : '';
            item.seq_mode = parseInt(getVal('editSeqMode')) || 3;
        }
        
        // Add or update
        if (modalState.mode === 'add') {
            if (isServer) {
                config.servers.push(item);
            } else {
                config.clients.push(item);
            }
        } else {
            if (isServer) {
                config.servers[modalState.index] = item;
            } else {
                config.clients[modalState.index] = item;
            }
        }
        
        // Close modal and refresh tables (Fixed ID)
        window.closeModal('editModal');
        renderServerTable();
        renderClientTable();
        
        console.log('Modal data saved successfully');
    };

    /**
     * Delete instance
     */
    window.deleteInstance = function(type, index) {
        const item = type === 'server' ? config.servers[index] : config.clients[index];
        const name = item ? (item.alias || `${type} ${index}`) : `${type} ${index}`;
        
        if (confirm(`Are you sure you want to delete "${name}"?`)) {
            if (type === 'server') {
                config.servers.splice(index, 1);
            } else {
                config.clients.splice(index, 1);
            }
            
            renderServerTable();
            renderClientTable();
            
            console.log(`Deleted ${type}[${index}]`);
        }
    };

    /**
     * Toggle password visibility (Fixed ID)
     */
    window.togglePassword = function(inputId, btn) {
        const input = getEl(inputId);
        if (input) {
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🔒';
            } else {
                input.type = 'password';
                btn.textContent = '👁';
            }
        }
    };

    // ==================== Initialization ====================

    /**
     * Initialize application
     */
    function init() {
        console.log('UDP Tunnel Manager - Initializing...');
        
        // Set theme (Fixed: use data-theme on documentElement)
        const savedTheme = localStorage.getItem('udp_tunnel_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Tab switching for sub-tabs (Config/Status tabs)
        document.querySelectorAll('.sub-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const container = this.closest('.section-body');
                const targetId = this.getAttribute('data-target');
                
                // Update tab buttons
                container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Update content
                container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const targetEl = getEl(targetId);
                if (targetEl) targetEl.classList.add('active');
                
                // Load status if switching to status tab
                if (targetId.includes('Status')) {
                    loadStatus();
                }
            });
        });
        
        // Tab switching for modal tabs (Basic/Advanced)
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const container = this.closest('.modal');
                const targetId = this.getAttribute('data-target');
                
                // Update tab buttons
                container.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Update content
                container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const targetEl = getEl(targetId);
                if (targetEl) targetEl.classList.add('active');
            });
        });
        
        // Modal overlay click handlers (Fixed IDs)
        const editModal = getEl('editModal');
        if (editModal) {
            editModal.addEventListener('click', function(e) {
                if (e.target === editModal) {
                    window.closeModal('editModal');
                }
            });
        }
        
        const diagModal = getEl('diagModal');
        if (diagModal) {
            diagModal.addEventListener('click', function(e) {
                if (e.target === diagModal) {
                    window.closeDiagModal();
                }
            });
        }
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.icon-dropdown')) {
                document.querySelectorAll('.icon-dropdown').forEach(d => d.classList.remove('open'));
            }
        });
        
        // Initial data load
        loadConfig();
        loadStatus();
        
        // Auto-refresh status every 5 seconds
        setInterval(loadStatus, 5000);
        
        console.log('UDP Tunnel Manager - Ready');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose config for inline checkbox handlers
    window.config = config;

})();

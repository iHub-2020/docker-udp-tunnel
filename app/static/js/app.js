/*
 * File: app/static/js/app.js
 * Author: iHub-2020
 * Date: 2026-01-14
 * Version: 3.0.0
 * Description: Frontend logic for UDP Tunnel Manager - Complete rewrite for stability
 * Changes: 
 *   - Refactored element selection to match index.html structure
 *   - Fixed modal data saving function naming
 *   - Improved error handling and logging
 *   - Simplified DOM manipulation logic
 *   - Added proper validation for all form inputs
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
    function setDisplay(id, display) {
        const el = getEl(id);
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
        setCheck('cfg-enabled', config.global.enabled);
        setCheck('cfg-keep-iptables', config.global.keep_iptables);
        setCheck('cfg-wait-lock', config.global.wait_lock);
        setCheck('cfg-retry-on-error', config.global.retry_on_error);
        setVal('cfg-log-level', config.global.log_level || 'info');
    }

    /**
     * Collect config from UI elements
     */
    function collectConfigFromUI() {
        config.global.enabled = getCheck('cfg-enabled');
        config.global.keep_iptables = getCheck('cfg-keep-iptables');
        config.global.wait_lock = getCheck('cfg-wait-lock');
        config.global.retry_on_error = getCheck('cfg-retry-on-error');
        config.global.log_level = getVal('cfg-log-level');
    }

    /**
     * Update status display
     */
    function updateStatusDisplay(data) {
        const tunnels = data.tunnels || [];
        const activeCount = tunnels.filter(t => t.running).length;
        const isRunning = activeCount > 0;
        
        // Update status badge
        const badge = getEl('status-badge');
        if (badge) {
            badge.textContent = isRunning ? 'Running' : 'Stopped';
            badge.className = 'status-badge ' + (isRunning ? 'running' : 'stopped');
        }
        
        // Update tunnel count
        setText('tunnel-count', `(${activeCount} tunnels active)`);
        
        // Update status tables
        updateStatusTables(tunnels);
    }

    /**
     * Update server and client status tables
     */
    function updateStatusTables(tunnels) {
        // Server status table
        const serverBody = getEl('server-status-table-body');
        if (serverBody) {
            serverBody.innerHTML = '';
            if (config.servers.length === 0) {
                serverBody.innerHTML = '<tr class="empty-row"><td colspan="6">No server instances.</td></tr>';
            } else {
                config.servers.forEach((server, index) => {
                    const status = tunnels.find(t => t.id === `server_${index}`) || {};
                    const row = `
                        <tr>
                            <td>${escapeHtml(server.alias || 'Server ' + index)}</td>
                            <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">
                                ${status.running ? 'Running' : 'Stopped'}
                            </span></td>
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
        
        // Client status table
        const clientBody = getEl('client-status-table-body');
        if (clientBody) {
            clientBody.innerHTML = '';
            if (config.clients.length === 0) {
                clientBody.innerHTML = '<tr class="empty-row"><td colspan="6">No client instances.</td></tr>';
            } else {
                config.clients.forEach((client, index) => {
                    const status = tunnels.find(t => t.id === `client_${index}`) || {};
                    const row = `
                        <tr>
                            <td>${escapeHtml(client.alias || 'Client ' + index)}</td>
                            <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">
                                ${status.running ? 'Running' : 'Stopped'}
                            </span></td>
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
        const activeCount = tunnels.filter(t => t.running).length;
        
        // Service status
        const statusEl = getEl('diag-service-status');
        if (statusEl) {
            if (activeCount > 0) {
                statusEl.innerHTML = `<span class="status-text running">Running</span> <span class="status-count">(${activeCount} active)</span>`;
            } else {
                statusEl.innerHTML = '<span class="status-text stopped">Stopped</span>';
            }
        }
        
        // Tunnel table
        const tunnelBody = getEl('diag-tunnel-table');
        if (tunnelBody) {
            tunnelBody.innerHTML = '';
            
            // Render servers
            config.servers.forEach((server, index) => {
                const id = `server_${index}`;
                const st = tunnels.find(t => t.id === id) || {};
                const statusClass = st.running ? 'running' : (server.enabled ? 'stopped' : 'disabled');
                const statusText = st.running ? 'Running' : (server.enabled ? 'Stopped' : 'Disabled');
                
                const row = `
                    <tr>
                        <td>${escapeHtml(server.alias || 'Server')}</td>
                        <td>server</td>
                        <td><span class="status-text ${statusClass}">${statusText}</span></td>
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
                const statusClass = st.running ? 'running' : (client.enabled ? 'stopped' : 'disabled');
                const statusText = st.running ? 'Running' : (client.enabled ? 'Stopped' : 'Disabled');
                
                const row = `
                    <tr>
                        <td>${escapeHtml(client.alias || 'Client')}</td>
                        <td>client</td>
                        <td><span class="status-text ${statusClass}">${statusText}</span></td>
                        <td>${client.local_ip || '127.0.0.1'}:${client.local_port}</td>
                        <td>${client.server_ip}:${client.server_port}</td>
                        <td>${client.raw_mode || 'faketcp'} / ${client.cipher_mode || 'xor'}</td>
                        <td>${st.pid || '-'}</td>
                    </tr>
                `;
                tunnelBody.innerHTML += row;
            });
        }
        
        // Binary status
        if (status.binary) {
            const binaryEl = getEl('diag-binary');
            if (binaryEl) {
                const iconClass = status.binary.installed ? 'success' : 'error';
                const icon = status.binary.installed ? '✓' : '✗';
                binaryEl.innerHTML = `<span class="status-icon ${iconClass}">${icon}</span> ${status.binary.text || 'Unknown'} <span class="diag-hash">(${status.binary.hash || 'N/A'})</span>`;
            }
        }
        
        // Iptables status
        if (status.iptables) {
            const iptablesEl = getEl('diag-iptables');
            if (iptablesEl) {
                const chains = status.iptables.chains || [];
                if (status.iptables.present && chains.length > 0) {
                    iptablesEl.innerHTML = `<span class="status-icon success">✓</span> ${status.iptables.text} <code class="diag-code">${chains.slice(0, 2).join(' ')}</code>`;
                } else {
                    iptablesEl.innerHTML = `<span class="status-icon error">✗</span> ${status.iptables.text || 'No active rules'}`;
                }
            }
        }
        
        // Logs
        let logLines = [];
        if (logs.logs && typeof logs.logs === 'string') {
            logLines = logs.logs.split('\n').filter(l => l.trim());
        } else if (logs.lines && Array.isArray(logs.lines)) {
            logLines = logs.lines;
        }
        
        const logContent = getEl('log-content');
        if (logContent) {
            if (logLines.length > 0) {
                logContent.innerHTML = logLines.map(formatLogLine).join('\n');
            } else {
                logContent.innerHTML = 'No recent logs.';
            }
            
            // Auto scroll to bottom
            const logContainer = getEl('log-container');
            if (logContainer) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }
        
        // Update timestamp
        setText('diag-log-time', `Last updated: ${new Date().toLocaleTimeString()}`);
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
        const tbody = getEl('server-table-body');
        if (!tbody) {
            console.error('Server table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        if (config.servers.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No server instances.</td></tr>';
            return;
        }
        
        config.servers.forEach((server, index) => {
            const row = `
                <tr>
                    <td>${escapeHtml(server.alias || 'Server ' + index)}</td>
                    <td>
                        <input type="checkbox" class="checkbox" 
                               ${server.enabled !== false ? 'checked' : ''} 
                               onchange="config.servers[${index}].enabled = this.checked">
                    </td>
                    <td>${server.listen_port || ''}</td>
                    <td>${escapeHtml(server.forward_ip || '')}</td>
                    <td>${server.forward_port || ''}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="window.openEditModal('server', ${index})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteInstance('server', ${index})">Delete</button>
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
        const tbody = getEl('client-table-body');
        if (!tbody) {
            console.error('Client table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        if (config.clients.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No client instances.</td></tr>';
            return;
        }
        
        config.clients.forEach((client, index) => {
            const row = `
                <tr>
                    <td>${escapeHtml(client.alias || 'Client ' + index)}</td>
                    <td>
                        <input type="checkbox" class="checkbox" 
                               ${client.enabled !== false ? 'checked' : ''} 
                               onchange="config.clients[${index}].enabled = this.checked">
                    </td>
                    <td>${escapeHtml(client.server_ip || '')}</td>
                    <td>${client.server_port || ''}</td>
                    <td>${client.local_port || ''}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="window.openEditModal('client', ${index})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteInstance('client', ${index})">Delete</button>
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
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('udp_tunnel_theme', newTheme);
        
        console.log(`Theme switched to: ${newTheme}`);
    };

    /**
     * Toggle dropdown menu
     */
    window.toggleDropdown = function(id) {
        const el = getEl(id);
        if (el) {
            el.classList.toggle('show');
        }
    };

    /**
     * Switch between Config and Status tabs
     */
    window.switchSubTab = function(section, tab) {
        console.log(`Switching ${section} to ${tab}`);
        
        // Update buttons
        const configBtn = getEl(`${section}-config-btn`);
        const statusBtn = getEl(`${section}-status-btn`);
        
        if (configBtn) {
            configBtn.classList.toggle('active', tab === 'config');
        }
        if (statusBtn) {
            statusBtn.classList.toggle('active', tab === 'status');
        }
        
        // Update content
        setDisplay(`${section}-config`, tab === 'config' ? 'block' : 'none');
        setDisplay(`${section}-status`, tab === 'status' ? 'block' : 'none');
        
        // Load status if switching to status tab
        if (tab === 'status') {
            loadStatus();
        }
    };

    /**
     * Switch between Basic and Advanced modal tabs
     */
    window.switchModalTab = function(tab) {
        console.log(`Switching modal tab to: ${tab}`);
        
        // Update tab buttons
        const basicBtn = getEl('tab-basic');
        const advBtn = getEl('tab-advanced');
        
        if (basicBtn) {
            basicBtn.classList.toggle('active', tab === 'basic');
        }
        if (advBtn) {
            advBtn.classList.toggle('active', tab === 'advanced');
        }
        
        // Update content
        setDisplay('modal-basic', tab === 'basic' ? 'block' : 'none');
        setDisplay('modal-advanced', tab === 'advanced' ? 'block' : 'none');
    };

    /**
     * Open diagnostics modal
     */
    window.openDiagModal = function() {
        const overlay = getEl('diag-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            loadDiagnostics();
            
            // Auto-refresh every 3 seconds
            if (diagAutoRefresh) {
                clearInterval(diagAutoRefresh);
            }
            diagAutoRefresh = setInterval(loadDiagnostics, 3000);
        } else {
            console.error('Diagnostics overlay not found');
        }
    };

    /**
     * Close diagnostics modal
     */
    window.closeDiagModal = function() {
        const overlay = getEl('diag-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        if (diagAutoRefresh) {
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
        const container = getEl('log-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    };

    /**
     * Save configuration and apply
     */
    window.saveAndApply = async function() {
        const btn = getEl('btn-save');
        const originalText = btn ? btn.innerHTML : '';
        
        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Saving...';
            }
            
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
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
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
    window.reset = function() {
        if (originalConfig && confirm('Discard all unsaved changes?')) {
            config = JSON.parse(JSON.stringify(originalConfig));
            applyConfigToUI();
            renderServerTable();
            renderClientTable();
        }
    };

    // Alias for compatibility
    window.resetConfig = window.reset;

    /**
     * Open modal to add new instance
     */
    window.openAddModal = function(type) {
        console.log(`Opening add modal for: ${type}`);
        
        modalState = { type, mode: 'add', index: -1 };
        
        // Set title
        setText('modal-title', type === 'server' ? 'New Server' : 'New Client');
        
        // Show/hide appropriate fields
        setDisplay('server-fields', type === 'server' ? 'block' : 'none');
        setDisplay('client-fields', type === 'client' ? 'block' : 'none');
        setDisplay('client-advanced-fields', type === 'client' ? 'block' : 'none');
        
        // Reset form to defaults
        setCheck('modal-enabled', true);
        setVal('modal-alias', type === 'server' ? 'New Server' : 'New Client');
        setVal('modal-password', '');
        setVal('modal-raw-mode', 'faketcp');
        setVal('modal-cipher-mode', 'xor');
        setVal('modal-auth-mode', 'simple');
        setCheck('modal-auto-iptables', true);
        setVal('modal-extra-args', '');
        
        if (type === 'server') {
            setVal('modal-listen-ip', '0.0.0.0');
            setVal('modal-listen-port', '29900');
            setVal('modal-forward-ip', '127.0.0.1');
            setVal('modal-forward-port', '51820');
        } else {
            setVal('modal-server-ip', '');
            setVal('modal-server-port', '29900');
            setVal('modal-local-ip', '127.0.0.1');
            setVal('modal-local-port', '3333');
            setVal('modal-source-ip', '');
            setVal('modal-source-port', '');
            setVal('modal-seq-mode', '3');
        }
        
        // Switch to basic tab
        window.switchModalTab('basic');
        
        // Show modal
        const overlay = getEl('modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        } else {
            console.error('Modal overlay not found');
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
        
        // Set title
        setText('modal-title', item.alias || (type === 'server' ? 'Server' : 'Client'));
        
        // Show/hide appropriate fields
        setDisplay('server-fields', type === 'server' ? 'block' : 'none');
        setDisplay('client-fields', type === 'client' ? 'block' : 'none');
        setDisplay('client-advanced-fields', type === 'client' ? 'block' : 'none');
        
        // Populate form with existing values
        setCheck('modal-enabled', item.enabled !== false);
        setVal('modal-alias', item.alias || '');
        setVal('modal-password', item.password || '');
        setVal('modal-raw-mode', item.raw_mode || 'faketcp');
        setVal('modal-cipher-mode', item.cipher_mode || 'xor');
        setVal('modal-auth-mode', item.auth_mode || 'simple');
        setCheck('modal-auto-iptables', item.auto_iptables !== false);
        setVal('modal-extra-args', item.extra_args || '');
        
        if (type === 'server') {
            setVal('modal-listen-ip', item.listen_ip || '0.0.0.0');
            setVal('modal-listen-port', item.listen_port || '29900');
            setVal('modal-forward-ip', item.forward_ip || '127.0.0.1');
            setVal('modal-forward-port', item.forward_port || '51820');
        } else {
            setVal('modal-server-ip', item.server_ip || '');
            setVal('modal-server-port', item.server_port || '29900');
            setVal('modal-local-ip', item.local_ip || '127.0.0.1');
            setVal('modal-local-port', item.local_port || '3333');
            setVal('modal-source-ip', item.source_ip || '');
            setVal('modal-source-port', item.source_port || '');
            setVal('modal-seq-mode', item.seq_mode || '3');
        }
        
        // Switch to basic tab
        window.switchModalTab('basic');
        
        // Show modal
        const overlay = getEl('modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    };

    /**
     * Close modal
     */
    window.closeModal = function() {
        const overlay = getEl('modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    };

    /**
     * Save modal data (called from Save button)
     */
    window.saveModalData = function() {
        console.log('Saving modal data...');
        
        const isServer = modalState.type === 'server';
        
        // Validation
        if (isServer) {
            if (!getVal('modal-forward-ip')) {
                alert('Forward To IP is required for server instances.');
                return;
            }
        } else {
            if (!getVal('modal-server-ip')) {
                alert('VPS Address is required for client instances.');
                return;
            }
        }
        
        // Build item object
        const item = {
            enabled: getCheck('modal-enabled'),
            alias: getVal('modal-alias'),
            password: getVal('modal-password'),
            raw_mode: getVal('modal-raw-mode'),
            cipher_mode: getVal('modal-cipher-mode'),
            auth_mode: getVal('modal-auth-mode'),
            auto_iptables: getCheck('modal-auto-iptables'),
            extra_args: getVal('modal-extra-args')
        };
        
        if (isServer) {
            item.listen_ip = getVal('modal-listen-ip');
            item.listen_port = parseInt(getVal('modal-listen-port')) || 29900;
            item.forward_ip = getVal('modal-forward-ip');
            item.forward_port = parseInt(getVal('modal-forward-port')) || 51820;
        } else {
            item.server_ip = getVal('modal-server-ip');
            item.server_port = parseInt(getVal('modal-server-port')) || 29900;
            item.local_ip = getVal('modal-local-ip');
            item.local_port = parseInt(getVal('modal-local-port')) || 3333;
            item.source_ip = getVal('modal-source-ip');
            item.source_port = getVal('modal-source-port');
            item.seq_mode = parseInt(getVal('modal-seq-mode')) || 3;
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
        
        // Close modal and refresh tables
        window.closeModal();
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
     * Toggle password visibility
     */
    window.togglePassword = function() {
        const input = getEl('modal-password');
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    };

    // ==================== Initialization ====================

    /**
     * Initialize application
     */
    function init() {
        console.log('UDP Tunnel Manager - Initializing...');
        
        // Set theme
        const savedTheme = localStorage.getItem('udp_tunnel_theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        
        // Modal overlay click handlers
        const modalOverlay = getEl('modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function(e) {
                if (e.target === modalOverlay) {
                    window.closeModal();
                }
            });
        }
        
        const diagOverlay = getEl('diag-overlay');
        if (diagOverlay) {
            diagOverlay.addEventListener('click', function(e) {
                if (e.target === diagOverlay) {
                    window.closeDiagModal();
                }
            });
        }
        
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

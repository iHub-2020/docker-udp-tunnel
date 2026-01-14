/*
 * File: app/static/js/app.js
 * Author: iHub-2020
 * Date: 2026-01-14
 * Version: 2.9.5
 * Description: Frontend logic for UDP Tunnel Manager
 * Updated: Fixed saveModalData naming, added toggleDropdown, improved DOM selectors for tables and modals.
 */

(function() { 

    // ==================== State ====================
    let config = {
        global: { enabled: false, keep_iptables: true, wait_lock: true, retry_on_error: true, log_level: 'info' },
        servers: [],
        clients: []
    };
    let originalConfig = null;
    let modalState = { type: null, mode: 'add', index: -1 };
    let diagAutoRefresh = null;

    // ==================== Utility & DOM Helper ====================
    // Robust element finder: tries ID, then Class, then Query Selector
    function $(idOrSelector) { 
        let el = document.getElementById(idOrSelector);
        if (!el) {
            el = document.querySelector('.' + idOrSelector);
        }
        if (!el && idOrSelector.includes('[')) {
            el = document.querySelector(idOrSelector);
        }
        return el;
    }

    // Helper to find an element by multiple possible IDs
    function findEl(ids) {
        for (let id of ids) {
            let el = document.getElementById(id);
            if (el) return el;
            el = document.querySelector('.' + id);
            if (el) return el;
        }
        return null;
    }

    function setText(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    function setVal(id, val) {
        const el = $(id);
        if (el) el.value = val;
    }

    function setCheck(id, checked) {
        const el = $(id);
        if (el) el.checked = checked;
    }

    function setDisplay(id, display) {
        const el = $(id);
        if (el) el.style.display = display;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== Global Functions (Exposed to Window) ====================

    // 1. Top Bar Actions
    window.toggleTheme = function() {
        console.log('toggleTheme called');
        const body = document.body;
        const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('udp_tunnel_theme', newTheme);
        
        // Try to toggle icons if they exist
        const moon = findEl(['theme-icon-moon', 'icon-moon']);
        const sun = findEl(['theme-icon-sun', 'icon-sun']);
        if (moon) moon.style.display = newTheme === 'dark' ? 'block' : 'none';
        if (sun) sun.style.display = newTheme === 'light' ? 'block' : 'none';
    };

    // Fix for "toggleDropdown is not defined"
    window.toggleDropdown = function(id) {
        console.log(`toggleDropdown called for: ${id}`);
        const el = $(id);
        if (el) {
            el.classList.toggle('show');
            el.style.display = el.style.display === 'block' ? 'none' : 'block';
        } else {
            console.warn(`Dropdown element ${id} not found`);
        }
    };

    // 2. Tabs (Config / Status)
    window.switchSubTab = function(section, tab) {
        console.log(`switchSubTab called: ${section}, ${tab}`);
        
        // Buttons
        const configBtn = findEl([`${section}-config-btn`, `btn-${section}-config`]) || document.querySelector(`[onclick*="switchSubTab('${section}', 'config')"]`);
        const statusBtn = findEl([`${section}-status-btn`, `btn-${section}-status`]) || document.querySelector(`[onclick*="switchSubTab('${section}', 'status')"]`);
        
        if (configBtn && statusBtn) {
            configBtn.classList.toggle('active', tab === 'config');
            statusBtn.classList.toggle('active', tab === 'status');
        }

        // Content Areas
        const configContent = findEl([`${section}-config`, `${section}-settings`, `${section}-config-content`]);
        const statusContent = findEl([`${section}-status`, `${section}-state`, `${section}-status-content`]);

        if (configContent) configContent.style.display = tab === 'config' ? 'block' : 'none';
        if (statusContent) statusContent.style.display = tab === 'status' ? 'block' : 'none';

        if (tab === 'status') loadStatus();
    };

    // 3. Modal Tabs (Basic / Advanced)
    window.switchModalTab = function(tab) {
        console.log(`switchModalTab called: ${tab}`);
        
        // Update Tab Buttons
        const basicBtn = findEl(['tab-basic', 'btn-tab-basic']) || document.querySelector(`[onclick*="switchModalTab('basic')"]`);
        const advBtn = findEl(['tab-advanced', 'btn-tab-advanced']) || document.querySelector(`[onclick*="switchModalTab('advanced')"]`);
        
        if (basicBtn) basicBtn.classList.toggle('active', tab === 'basic');
        if (advBtn) advBtn.classList.toggle('active', tab === 'advanced');
        
        // Show/Hide Content
        // Try multiple IDs for the content containers
        const basicContent = findEl(['modal-basic', 'basic-settings', 'tab-content-basic']);
        const advContent = findEl(['modal-advanced', 'advanced-settings', 'tab-content-advanced']);
        
        if (basicContent) basicContent.style.display = tab === 'basic' ? 'block' : 'none';
        if (advContent) advContent.style.display = tab === 'advanced' ? 'block' : 'none';
    };

    // 4. Diagnostics
    window.openDiagModal = function() {
        console.log('openDiagModal called');
        // Try to find the modal by various IDs
        const overlay = findEl(['diag-overlay', 'diagnostics-modal', 'modal-diagnostics', 'diag-modal']);
        
        if (overlay) {
            overlay.style.display = 'flex';
            loadDiagnostics();
            if (diagAutoRefresh) clearInterval(diagAutoRefresh);
            diagAutoRefresh = setInterval(loadDiagnostics, 3000);
        } else {
            console.error('Diagnostics overlay element not found. Checked: diag-overlay, diagnostics-modal, modal-diagnostics');
            alert('Error: Diagnostics modal not found in DOM.');
        }
    };

    window.closeDiagModal = function() {
        const overlay = findEl(['diag-overlay', 'diagnostics-modal', 'modal-diagnostics', 'diag-modal']);
        if (overlay) overlay.style.display = 'none';
        if (diagAutoRefresh) {
            clearInterval(diagAutoRefresh);
            diagAutoRefresh = null;
        }
    };

    window.refreshLogs = function() { loadDiagnostics(); };
    window.scrollLogsToBottom = function() {
        const container = $('log-container');
        if (container) container.scrollTop = container.scrollHeight;
    };

    // 5. Main Actions
    window.saveAndApply = async function() {
        console.log('saveAndApply called');
        const btn = findEl(['btn-save', 'save-apply-btn']) || document.querySelector('.btn-primary');
        const originalText = btn ? btn.innerHTML : '';
        
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }

        try {
            collectConfigFromUI();
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (res.ok) {
                originalConfig = JSON.parse(JSON.stringify(config));
                alert('Configuration saved and applied.');
                loadStatus();
            } else {
                throw new Error('Save failed');
            }
        } catch (e) {
            console.error('Failed to save config:', e);
            alert('Failed to save configuration.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };

    window.saveOnly = async function() {
        console.log('saveOnly called');
        try {
            collectConfigFromUI();
            const res = await fetch('/api/config?apply=false', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (res.ok) {
                originalConfig = JSON.parse(JSON.stringify(config));
                alert('Configuration saved (not applied).');
            }
        } catch (e) {
            console.error('Failed to save config:', e);
            alert('Failed to save configuration.');
        }
    };

    window.reset = function() { window.resetConfig(); };
    window.resetConfig = function() {
        console.log('resetConfig called');
        if (originalConfig && confirm('Discard unsaved changes?')) {
            config = JSON.parse(JSON.stringify(originalConfig));
            applyConfigToUI();
            renderServerTable();
            renderClientTable();
        }
    };

    // 6. Instance Management
    window.openAddModal = function(type) {
        console.log(`openAddModal called: ${type}`);
        modalState = { type, mode: 'add', index: -1 };
        
        setText('modal-title', type === 'server' ? 'New Server' : 'New Client');
        
        // Toggle fields visibility
        const serverFields = findEl(['server-fields', 'fields-server']);
        const clientFields = findEl(['client-fields', 'fields-client']);
        const clientAdvFields = findEl(['client-advanced-fields', 'fields-client-advanced']);
        
        if (serverFields) serverFields.style.display = type === 'server' ? 'block' : 'none';
        if (clientFields) clientFields.style.display = type === 'client' ? 'block' : 'none';
        if (clientAdvFields) clientAdvFields.style.display = type === 'client' ? 'block' : 'none';
        
        // Reset inputs
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
        
        window.switchModalTab('basic');
        const overlay = findEl(['modal-overlay', 'edit-modal', 'config-modal']);
        if (overlay) overlay.style.display = 'flex';
        else console.error('Edit modal overlay not found');
    };

    window.openEditModal = function(type, index) {
        console.log(`openEditModal called: ${type}, ${index}`);
        modalState = { type, mode: 'edit', index };
        const item = type === 'server' ? config.servers[index] : config.clients[index];
        
        if (!item) return;

        setText('modal-title', item.alias || (type === 'server' ? 'Server' : 'Client'));
        
        const serverFields = findEl(['server-fields', 'fields-server']);
        const clientFields = findEl(['client-fields', 'fields-client']);
        const clientAdvFields = findEl(['client-advanced-fields', 'fields-client-advanced']);
        
        if (serverFields) serverFields.style.display = type === 'server' ? 'block' : 'none';
        if (clientFields) clientFields.style.display = type === 'client' ? 'block' : 'none';
        if (clientAdvFields) clientAdvFields.style.display = type === 'client' ? 'block' : 'none';
        
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
        
        window.switchModalTab('basic');
        const overlay = findEl(['modal-overlay', 'edit-modal', 'config-modal']);
        if (overlay) overlay.style.display = 'flex';
    };

    window.closeModal = function() {
        const overlay = findEl(['modal-overlay', 'edit-modal', 'config-modal']);
        if (overlay) overlay.style.display = 'none';
    };

    // FIX: Renamed from saveModal to saveModalData to match HTML
    window.saveModalData = function() {
        console.log('saveModalData called');
        const isServer = modalState.type === 'server';
        
        // Validation
        if (isServer) {
            if (!$('modal-forward-ip').value) { alert('Forward IP is required'); return; }
        } else {
            if (!$('modal-server-ip').value) { alert('Server IP is required'); return; }
        }

        const item = {
            enabled: $('modal-enabled').checked,
            alias: $('modal-alias').value,
            password: $('modal-password').value,
            raw_mode: $('modal-raw-mode').value,
            cipher_mode: $('modal-cipher-mode').value,
            auth_mode: $('modal-auth-mode').value,
            auto_iptables: $('modal-auto-iptables').checked,
            extra_args: $('modal-extra-args').value
        };
        
        if (isServer) {
            item.listen_ip = $('modal-listen-ip').value;
            item.listen_port = parseInt($('modal-listen-port').value) || 29900;
            item.forward_ip = $('modal-forward-ip').value;
            item.forward_port = parseInt($('modal-forward-port').value) || 51820;
        } else {
            item.server_ip = $('modal-server-ip').value;
            item.server_port = parseInt($('modal-server-port').value) || 29900;
            item.local_ip = $('modal-local-ip').value;
            item.local_port = parseInt($('modal-local-port').value) || 3333;
            item.source_ip = $('modal-source-ip').value;
            item.source_port = $('modal-source-port').value;
            item.seq_mode = parseInt($('modal-seq-mode').value) || 3;
        }
        
        if (modalState.mode === 'add') {
            isServer ? config.servers.push(item) : config.clients.push(item);
        } else {
            isServer ? config.servers[modalState.index] = item : config.clients[modalState.index] = item;
        }
        
        window.closeModal();
        renderServerTable();
        renderClientTable();
    };

    window.deleteInstance = function(type, index) {
        console.log(`deleteInstance called: ${type}, ${index}`);
        if (confirm('Are you sure you want to delete this instance?')) {
            if (type === 'server') {
                config.servers.splice(index, 1);
            } else {
                config.clients.splice(index, 1);
            }
            // Force re-render
            renderServerTable();
            renderClientTable();
        }
    };

    window.togglePassword = function() {
        console.log('togglePassword called');
        const input = $('modal-password');
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        } else {
            console.error('Password input not found (expected id="modal-password")');
        }
    };

    // ==================== Internal Logic ====================

    async function loadConfig() {
        try {
            const res = await fetch('/api/config');
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            
            config = {
                global: { enabled: false, keep_iptables: true, wait_lock: true, retry_on_error: true, log_level: 'info', ...data.global },
                servers: Array.isArray(data.servers) ? data.servers : [],
                clients: Array.isArray(data.clients) ? data.clients : []
            };
            
            originalConfig = JSON.parse(JSON.stringify(config));
            applyConfigToUI();
            renderServerTable();
            renderClientTable();
        } catch (e) {
            console.error('Failed to load config:', e);
        }
    }

    async function loadStatus() {
        try {
            const res = await fetch('/api/status');
            if (!res.ok) return;
            const data = await res.json();
            updateStatusDisplay(data);
        } catch (e) {
            console.error('Failed to load status:', e);
        }
    }

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
            
            status.binary = diag.binary;
            status.iptables = diag.iptables;
            
            updateDiagnosticsDisplay(status, logs);
        } catch (e) {
            console.error('Failed to load diagnostics:', e);
        }
    }

    function applyConfigToUI() {
        setCheck('cfg-enabled', config.global.enabled);
        setCheck('cfg-keep-iptables', config.global.keep_iptables);
        setCheck('cfg-wait-lock', config.global.wait_lock);
        setCheck('cfg-retry-on-error', config.global.retry_on_error);
        setVal('cfg-log-level', config.global.log_level || 'info');
    }

    function collectConfigFromUI() {
        if ($('cfg-enabled')) config.global.enabled = $('cfg-enabled').checked;
        if ($('cfg-keep-iptables')) config.global.keep_iptables = $('cfg-keep-iptables').checked;
        if ($('cfg-wait-lock')) config.global.wait_lock = $('cfg-wait-lock').checked;
        if ($('cfg-retry-on-error')) config.global.retry_on_error = $('cfg-retry-on-error').checked;
        if ($('cfg-log-level')) config.global.log_level = $('cfg-log-level').value;
    }

    function updateStatusDisplay(data) {
        const tunnels = data.tunnels || [];
        const activeCount = tunnels.filter(t => t.running).length;
        const isRunning = activeCount > 0;
        
        const badge = findEl(['status-badge', 'service-status-badge']);
        if (badge) {
            badge.textContent = isRunning ? 'Running' : 'Stopped';
            badge.className = 'status-badge ' + (isRunning ? 'running' : 'stopped');
        }
        
        setText('tunnel-count', `(${activeCount} tunnels active)`);
        updateStatusTables(tunnels);
    }

    function updateStatusTables(tunnels) {
        const serverBody = findEl(['server-status-table-body', 'server-status-list']);
        if (serverBody) {
            serverBody.innerHTML = '';
            config.servers.forEach((s, i) => {
                const status = tunnels.find(t => t.id === `server_${i}`) || {};
                serverBody.innerHTML += `
                    <tr>
                        <td>${escapeHtml(s.alias || 'Server ' + i)}</td>
                        <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">${status.running ? 'Running' : 'Stopped'}</span></td>
                        <td>${s.listen_ip || '0.0.0.0'}:${s.listen_port}</td>
                        <td>${s.forward_ip}:${s.forward_port}</td>
                        <td>${s.raw_mode || 'faketcp'}</td>
                        <td>${status.pid || '-'}</td>
                    </tr>`;
            });
            if (config.servers.length === 0) serverBody.innerHTML = `<tr class="empty-row"><td colspan="6">No server instances.</td></tr>`;
        }
        
        const clientBody = findEl(['client-status-table-body', 'client-status-list']);
        if (clientBody) {
            clientBody.innerHTML = '';
            config.clients.forEach((c, i) => {
                const status = tunnels.find(t => t.id === `client_${i}`) || {};
                clientBody.innerHTML += `
                    <tr>
                        <td>${escapeHtml(c.alias || 'Client ' + i)}</td>
                        <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">${status.running ? 'Running' : 'Stopped'}</span></td>
                        <td>${c.local_ip || '127.0.0.1'}:${c.local_port}</td>
                        <td>${c.server_ip}:${c.server_port}</td>
                        <td>${c.raw_mode || 'faketcp'}</td>
                        <td>${status.pid || '-'}</td>
                    </tr>`;
            });
            if (config.clients.length === 0) clientBody.innerHTML = `<tr class="empty-row"><td colspan="6">No client instances.</td></tr>`;
        }
    }

    function updateDiagnosticsDisplay(status, logs) {
        const tunnels = status.tunnels || [];
        const activeCount = tunnels.filter(t => t.running).length;
        
        const statusEl = $('diag-service-status');
        if (statusEl) {
            statusEl.innerHTML = activeCount > 0
                ? `<span class="status-text running">Running</span> <span class="status-count">(${activeCount} active)</span>`
                : `<span class="status-text stopped">Stopped</span>`;
        }
        
        const tunnelBody = $('diag-tunnel-table');
        if (tunnelBody) {
            tunnelBody.innerHTML = '';
            const renderRow = (item, type, idx) => {
                const id = `${type}_${idx}`;
                const st = tunnels.find(t => t.id === id) || {};
                const statusClass = st.running ? 'running' : (item.enabled ? 'stopped' : 'disabled');
                const statusText = st.running ? 'Running' : (item.enabled ? 'Stopped' : 'Disabled');
                return `
                    <tr>
                        <td>${escapeHtml(item.alias || (type === 'server' ? 'Server' : 'Client'))}</td>
                        <td>${type}</td>
                        <td><span class="status-text ${statusClass}">${statusText}</span></td>
                        <td>${(type === 'server' ? item.listen_ip : item.local_ip) || '0.0.0.0'}:${type === 'server' ? item.listen_port : item.local_port}</td>
                        <td>${(type === 'server' ? item.forward_ip : item.server_ip)}:${type === 'server' ? item.forward_port : item.server_port}</td>
                        <td>${item.raw_mode || 'faketcp'} / ${item.cipher_mode || 'xor'}</td>
                        <td>${st.pid || '-'}</td>
                    </tr>`;
            };
            config.servers.forEach((s, i) => tunnelBody.innerHTML += renderRow(s, 'server', i));
            config.clients.forEach((c, i) => tunnelBody.innerHTML += renderRow(c, 'client', i));
        }
        
        if (status.binary && $('diag-binary')) {
            const iconClass = status.binary.installed ? 'success' : 'error';
            $('diag-binary').innerHTML = `<span class="status-icon ${iconClass}">${status.binary.installed ? '✓' : '✗'}</span> ${status.binary.text || 'Unknown'} <span class="diag-hash">(${status.binary.hash || 'N/A'})</span>`;
        }
        
        if (status.iptables && $('diag-iptables')) {
            const chains = status.iptables.chains || [];
            if (status.iptables.present && chains.length > 0) {
                $('diag-iptables').innerHTML = `<span class="status-icon success">✓</span> ${status.iptables.text} <code class="diag-code">${chains.slice(0, 2).join(' ')}</code>`;
            } else {
                $('diag-iptables').innerHTML = `<span class="status-icon error">✗</span> ${status.iptables.text || 'No active rules'}`;
            }
        }
        
        let logLines = [];
        if (logs.logs && typeof logs.logs === 'string') logLines = logs.logs.split('\n').filter(l => l.trim());
        else if (logs.lines && Array.isArray(logs.lines)) logLines = logs.lines;
        
        if ($('log-content')) {
            $('log-content').innerHTML = logLines.length > 0 ? logLines.map(formatLogLine).join('\n') : 'No recent logs.';
            const logContainer = $('log-container');
            if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        setText('diag-log-time', `Last updated: ${new Date().toLocaleTimeString()}`);
    }

    function formatLogLine(line) {
        const escaped = escapeHtml(line.replace(/\x1b[[0-9;]*m/g, ''));
        return `<span class="log-line">${escaped.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="log-time">$1</span>')}</span>`;
    }

    function renderServerTable() {
        // Try multiple IDs to find the table body
        const tbody = findEl(['server-table-body', 'server-list', 'table-servers-body']);
        if (!tbody) {
            console.error('Server table body not found! Checked: server-table-body, server-list');
            return;
        }
        
        tbody.innerHTML = '';
        if (config.servers.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No server instances.</td></tr>`;
            return;
        }
        config.servers.forEach((s, i) => {
            tbody.innerHTML += `
                <tr>
                    <td>${escapeHtml(s.alias || 'Server ' + i)}</td>
                    <td><input type="checkbox" class="checkbox" ${s.enabled ? 'checked' : ''} onchange="config.servers[${i}].enabled=this.checked"></td>
                    <td>${s.listen_port || ''}</td>
                    <td>${escapeHtml(s.forward_ip || '')}</td>
                    <td>${s.forward_port || ''}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="window.openEditModal('server',${i})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteInstance('server',${i})">Delete</button>
                    </td>
                </tr>`;
        });
        console.log('Server table rendered');
    }

    function renderClientTable() {
        const tbody = findEl(['client-table-body', 'client-list', 'table-clients-body']);
        if (!tbody) {
            console.error('Client table body not found! Checked: client-table-body, client-list');
            return;
        }
        
        tbody.innerHTML = '';
        if (config.clients.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No client instances.</td></tr>`;
            return;
        }
        config.clients.forEach((c, i) => {
            tbody.innerHTML += `
                <tr>
                    <td>${escapeHtml(c.alias || 'Client ' + i)}</td>
                    <td><input type="checkbox" class="checkbox" ${c.enabled ? 'checked' : ''} onchange="config.clients[${i}].enabled=this.checked"></td>
                    <td>${escapeHtml(c.server_ip || '')}</td>
                    <td>${c.server_port || ''}</td>
                    <td>${c.local_port || ''}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="window.openEditModal('client',${i})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteInstance('client',${i})">Delete</button>
                    </td>
                </tr>`;
        });
        console.log('Client table rendered');
    }

    // ==================== Init ====================
    document.addEventListener('DOMContentLoaded', () => {
        console.log('App initialized');
        
        // Theme Init
        const savedTheme = localStorage.getItem('udp_tunnel_theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        
        // Modal Overlay Click Listeners
        const modalOverlay = findEl(['modal-overlay', 'edit-modal', 'config-modal']);
        if (modalOverlay) {
            modalOverlay.addEventListener('click', e => {
                if (e.target === modalOverlay) window.closeModal();
            });
        }
        
        const diagOverlay = findEl(['diag-overlay', 'diagnostics-modal', 'modal-diagnostics']);
        if (diagOverlay) {
            diagOverlay.addEventListener('click', e => {
                if (e.target === diagOverlay) window.closeDiagModal();
            });
        }

        // Initial Load
        loadConfig();
        loadStatus();
        setInterval(loadStatus, 5000);
    });

})();

/*
 * File: app/static/js/app.js
 * Author: iHub-2020
 * Date: 2026-01-14
 * Version: 2.8.0
 * Description: Frontend logic for UDP Tunnel Manager (Fixes & HTML Alignment)
 * Updated: Aligned function names with index.html (saveAndApply, openDiagModal), added DOM null-safety
 * GitHub: https://github.com/iHub-2020/docker-udp-tunnel
 */

// ==================== State ====================
let config = {
    global: { enabled: false, keep_iptables: true, wait_lock: true, retry_on_error: true, log_level: 'info' },
    servers: [],
    clients: []
};
let originalConfig = null;
let modalState = { type: null, mode: 'add', index: -1 };
let diagAutoRefresh = null;
let statusAutoRefresh = null;

// ==================== Utility & DOM Safety ====================
function $(id) { return document.getElementById(id); }

// Helper functions to prevent "Cannot set properties of null" errors
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

// ==================== Dropdown & UI Interactions ====================
function toggleDropdown(id) {
    const el = $(id);
    if (!el) return;
    
    document.querySelectorAll('.icon-dropdown').forEach(d => {
        if (d.id !== id) d.classList.remove('open');
    });
    el.classList.toggle('open');
}

function togglePassword() {
    const input = $('modal-password');
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', e => {
    if (!e.target.closest('.icon-dropdown')) {
        document.querySelectorAll('.icon-dropdown').forEach(d => d.classList.remove('open'));
    }
});

// ==================== Language ====================
function setLanguage(lang) {
    if (typeof I18n !== 'undefined') {
        I18n.setLanguage(lang).then(() => {
            document.querySelectorAll('.icon-dropdown').forEach(d => d.classList.remove('open'));
            renderServerTable();
            renderClientTable();
            loadStatus();
        });
    }
}

// ==================== Theme ====================
function toggleTheme() {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('udp_tunnel_theme', newTheme);
    
    setDisplay('theme-icon-moon', newTheme === 'dark' ? 'block' : 'none');
    setDisplay('theme-icon-sun', newTheme === 'light' ? 'block' : 'none');
}

// ==================== Tabs ====================
function switchSubTab(section, tab) {
    const configTabBtn = document.querySelector(`[data-tab="${section}-config"]`);
    const statusTabBtn = document.querySelector(`[data-tab="${section}-status"]`);
    
    if (configTabBtn) configTabBtn.classList.toggle('active', tab === 'config');
    if (statusTabBtn) statusTabBtn.classList.toggle('active', tab === 'status');

    setDisplay(`${section}-config-content`, tab === 'config' ? 'block' : 'none');
    setDisplay(`${section}-status-content`, tab === 'status' ? 'block' : 'none');

    if (tab === 'status') {
        loadStatus();
    }
}

function switchModalTab(tab) {
    document.querySelectorAll('.modal-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    setDisplay('modal-basic', tab === 'basic' ? 'block' : 'none');
    setDisplay('modal-advanced', tab === 'advanced' ? 'block' : 'none');
}

// ==================== API ====================
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
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

// Renamed from saveConfig to match index.html "saveAndApply()"
async function saveAndApply() {
    const btn = $('btn-save'); // Assuming ID might be btn-save
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = I18n.t('saving') || 'Saving...';
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
            alert(I18n.t('config_saved'));
            loadStatus();
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        console.error('Failed to save config:', e);
        alert(I18n.t('config_save_failed'));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function saveConfigOnly() {
    try {
        collectConfigFromUI();
        const res = await fetch('/api/config?apply=false', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (res.ok) {
            originalConfig = JSON.parse(JSON.stringify(config));
            alert(I18n.t('config_saved_only'));
        }
    } catch (e) {
        console.error('Failed to save config:', e);
        alert(I18n.t('config_save_failed'));
    }
}

function resetConfig() {
    if (originalConfig) {
        if (confirm(I18n.t('confirm_reset') || 'Discard unsaved changes?')) {
            config = JSON.parse(JSON.stringify(originalConfig));
            applyConfigToUI();
            renderServerTable();
            renderClientTable();
        }
    }
}

// ==================== Config UI ====================
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

// ==================== Status Display ====================
function updateStatusDisplay(data) {
    const tunnels = data.tunnels || [];
    const activeCount = tunnels.filter(t => t.running).length;
    const isRunning = activeCount > 0;
    
    const badge = $('status-badge');
    if (badge) {
        badge.textContent = isRunning ? I18n.t('running') : I18n.t('stopped');
        badge.className = 'status-badge ' + (isRunning ? 'running' : 'stopped');
    }
    
    setText('tunnel-count', `(${I18n.t('tunnels_active', { count: activeCount })})`);
    updateStatusTables(tunnels);
}

function updateStatusTables(tunnels) {
    const serverBody = $('server-status-table-body');
    if (serverBody) {
        serverBody.innerHTML = '';
        config.servers.forEach((s, i) => {
            const status = tunnels.find(t => t.id === `server_${i}`) || {};
            serverBody.innerHTML += `
                <tr>
                    <td>${escapeHtml(s.alias || 'Server ' + i)}</td>
                    <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">${status.running ? I18n.t('running') : I18n.t('stopped')}</span></td>
                    <td>${s.listen_ip || '0.0.0.0'}:${s.listen_port}</td>
                    <td>${s.forward_ip}:${s.forward_port}</td>
                    <td>${s.raw_mode || 'faketcp'}</td>
                    <td>${status.pid || '-'}</td>
                </tr>`;
        });
        if (config.servers.length === 0) {
            serverBody.innerHTML = `<tr class="empty-row"><td colspan="6">${I18n.t('no_server_instances')}</td></tr>`;
        }
    }
    
    const clientBody = $('client-status-table-body');
    if (clientBody) {
        clientBody.innerHTML = '';
        config.clients.forEach((c, i) => {
            const status = tunnels.find(t => t.id === `client_${i}`) || {};
            clientBody.innerHTML += `
                <tr>
                    <td>${escapeHtml(c.alias || 'Client ' + i)}</td>
                    <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">${status.running ? I18n.t('running') : I18n.t('stopped')}</span></td>
                    <td>${c.local_ip || '127.0.0.1'}:${c.local_port}</td>
                    <td>${c.server_ip}:${c.server_port}</td>
                    <td>${c.raw_mode || 'faketcp'}</td>
                    <td>${status.pid || '-'}</td>
                </tr>`;
        });
        if (config.clients.length === 0) {
            clientBody.innerHTML = `<tr class="empty-row"><td colspan="6">${I18n.t('no_client_instances')}</td></tr>`;
        }
    }
}

// ==================== Diagnostics ====================
// Renamed from openDiagnostics to match index.html "openDiagModal()"
function openDiagModal() {
    setDisplay('diag-overlay', 'flex');
    loadDiagnostics();
    diagAutoRefresh = setInterval(loadDiagnostics, 3000);
}

// Renamed/Aliased to match potential HTML usage
function closeDiagModal() {
    setDisplay('diag-overlay', 'none');
    if (diagAutoRefresh) {
        clearInterval(diagAutoRefresh);
        diagAutoRefresh = null;
    }
}

function stripAnsi(text) {
    return text.replace(/\x1b[[0-9;]*m/g, '');
}

function updateDiagnosticsDisplay(status, logs) {
    const tunnels = status.tunnels || [];
    const activeCount = tunnels.filter(t => t.running).length;
    
    const statusHtml = activeCount > 0
        ? `<span class="status-text running">${I18n.t('running')}</span> <span class="status-count">(${I18n.t('tunnels_active', { count: activeCount })})</span>`
        : `<span class="status-text stopped">${I18n.t('stopped')}</span>`;
    
    const statusEl = $('diag-service-status');
    if (statusEl) statusEl.innerHTML = statusHtml;
    
    const tunnelBody = $('diag-tunnel-table');
    if (tunnelBody) {
        tunnelBody.innerHTML = '';
        
        const renderRow = (item, type, idx) => {
            const id = `${type}_${idx}`;
            const st = tunnels.find(t => t.id === id) || {};
            const statusClass = st.running ? 'running' : (item.enabled ? 'stopped' : 'disabled');
            const statusText = st.running ? I18n.t('running') : (item.enabled ? I18n.t('stopped') : I18n.t('disabled'));
            
            let local = type === 'server' ? `${item.listen_ip || '0.0.0.0'}:${item.listen_port}` : `${item.local_ip || '127.0.0.1'}:${item.local_port}`;
            let remote = type === 'server' ? `${item.forward_ip}:${item.forward_port}` : `${item.server_ip}:${item.server_port}`;
            
            return `
                <tr>
                    <td>${escapeHtml(item.alias || (type === 'server' ? 'Server' : 'Client'))}</td>
                    <td>${I18n.t(type)}</td>
                    <td><span class="status-text ${statusClass}">${statusText}</span></td>
                    <td>${local}</td>
                    <td>${remote}</td>
                    <td>${item.raw_mode || 'faketcp'} / ${item.cipher_mode || 'xor'}</td>
                    <td>${st.pid || '-'}</td>
                </tr>`;
        };

        config.servers.forEach((s, i) => tunnelBody.innerHTML += renderRow(s, 'server', i));
        config.clients.forEach((c, i) => tunnelBody.innerHTML += renderRow(c, 'client', i));
        
        if (config.servers.length === 0 && config.clients.length === 0) {
            tunnelBody.innerHTML = `<tr class="empty-row"><td colspan="7">${I18n.t('no_instances')}</td></tr>`;
        }
    }
    
    if (status.binary && $('diag-binary')) {
        const icon = status.binary.installed ? '✓' : '✗';
        const iconClass = status.binary.installed ? 'success' : 'error';
        $('diag-binary').innerHTML = `<span class="status-icon ${iconClass}">${icon}</span> ${status.binary.text || 'Unknown'} <span class="diag-hash">(${status.binary.hash || 'N/A'})</span>`;
    }
    
    if (status.iptables && $('diag-iptables')) {
        const chains = status.iptables.chains || [];
        if (status.iptables.present && chains.length > 0) {
            const chainCodes = chains.slice(0, 2).map(c => `<code class="diag-code">${c}</code>`).join(' ');
            $('diag-iptables').innerHTML = `<span class="status-icon success">✓</span> ${status.iptables.text} ${chainCodes}`;
        } else {
            $('diag-iptables').innerHTML = `<span class="status-icon error">✗</span> ${status.iptables.text || I18n.t('no_active_rules')}`;
        }
    }
    
    let logLines = [];
    if (logs.logs && typeof logs.logs === 'string') {
        logLines = logs.logs.split('\n').filter(line => line.trim());
    } else if (logs.lines && Array.isArray(logs.lines)) {
        logLines = logs.lines;
    }
    
    if ($('log-content')) {
        $('log-content').innerHTML = logLines.length > 0
            ? logLines.map(formatLogLine).join('\n')
            : I18n.t('no_recent_logs');
            
        const logContainer = $('log-container');
        if (logContainer) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }
    
    setText('diag-log-time', `${I18n.t('last_updated')}: ${new Date().toLocaleTimeString()}`);
}

function formatLogLine(line) {
    const cleaned = stripAnsi(line);
    const escaped = escapeHtml(cleaned);
    
    let formatted = escaped
        .replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="log-time">$1</span>')
        .replace(/[INFO]/g, '<span class="log-level-info">[INFO]</span>')
        .replace(/[WARN]/g, '<span class="log-level-warn">[WARN]</span>')
        .replace(/[WARNING]/g, '<span class="log-level-warn">[WARNING]</span>')
        .replace(/[ERROR]/g, '<span class="log-level-error">[ERROR]</span>')
        .replace(/[FATAL]/g, '<span class="log-level-error">[FATAL]</span>')
        .replace(/[System]/g, '<span class="log-system">[System]</span>')
        .replace(/[New Server]/g, '<span class="log-server">[New Server]</span>')
        .replace(/[New Client]/g, '<span class="log-client">[New Client]</span>');
    
    return `<span class="log-line">${formatted}</span>`;
}

function refreshLogs() {
    loadDiagnostics();
}

function scrollLogsToBottom() {
    const container = $('log-container');
    if (container) container.scrollTop = container.scrollHeight;
}

// ==================== Tables ====================
function renderServerTable() {
    const tbody = $('server-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (config.servers.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${I18n.t('no_server_instances')}</td></tr>`;
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
                    <button class="btn btn-outline btn-sm" onclick="openEditModal('server',${i})">${I18n.t('edit')}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInstance('server',${i})">${I18n.t('delete')}</button>
                </td>
            </tr>`;
    });
}

function renderClientTable() {
    const tbody = $('client-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (config.clients.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${I18n.t('no_client_instances')}</td></tr>`;
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
                    <button class="btn btn-outline btn-sm" onclick="openEditModal('client',${i})">${I18n.t('edit')}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInstance('client',${i})">${I18n.t('delete')}</button>
                </td>
            </tr>`;
    });
}

// ==================== Modal ====================
function openAddModal(type) {
    modalState = { type, mode: 'add', index: -1 };
    
    // Safe DOM manipulation
    setText('modal-title', type === 'server' ? I18n.t('new_server') : I18n.t('new_client'));
    
    setDisplay('server-fields', type === 'server' ? 'block' : 'none');
    setDisplay('client-fields', type === 'client' ? 'block' : 'none');
    setDisplay('client-advanced-fields', type === 'client' ? 'block' : 'none');
    
    setCheck('modal-enabled', true);
    setVal('modal-alias', type === 'server' ? 'New Server' : 'New Client');
    setVal('modal-password', '');
    setVal('modal-raw-mode', 'faketcp');
    setVal('modal-cipher-mode', 'xor');
    setVal('modal-auth-mode', 'simple');
    setCheck('modal-auto-iptables', true);
    setVal('modal-extra-args', '');
    
    const pwdInput = $('modal-password');
    if (pwdInput) pwdInput.type = 'password';
    
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
    
    switchModalTab('basic');
    setDisplay('modal-overlay', 'flex');
}

function openEditModal(type, index) {
    modalState = { type, mode: 'edit', index };
    const item = type === 'server' ? config.servers[index] : config.clients[index];
    
    setText('modal-title', item.alias || (type === 'server' ? 'Server' : 'Client'));
    
    setDisplay('server-fields', type === 'server' ? 'block' : 'none');
    setDisplay('client-fields', type === 'client' ? 'block' : 'none');
    setDisplay('client-advanced-fields', type === 'client' ? 'block' : 'none');
    
    setCheck('modal-enabled', item.enabled !== false);
    setVal('modal-alias', item.alias || '');
    setVal('modal-password', item.password || '');
    setVal('modal-raw-mode', item.raw_mode || 'faketcp');
    setVal('modal-cipher-mode', item.cipher_mode || 'xor');
    setVal('modal-auth-mode', item.auth_mode || 'simple');
    setCheck('modal-auto-iptables', item.auto_iptables !== false);
    setVal('modal-extra-args', item.extra_args || '');
    
    const pwdInput = $('modal-password');
    if (pwdInput) pwdInput.type = 'password';
    
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
    
    switchModalTab('basic');
    setDisplay('modal-overlay', 'flex');
}

function closeModal() {
    setDisplay('modal-overlay', 'none');
}

function saveModal() {
    const isServer = modalState.type === 'server';
    
    // Basic Validation
    if (isServer) {
        if (!$('modal-forward-ip').value) {
            alert(I18n.t('error_missing_ip') || 'Forward IP is required');
            return;
        }
    } else {
        if (!$('modal-server-ip').value) {
            alert(I18n.t('error_missing_ip') || 'Server IP is required');
            return;
        }
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
    
    closeModal();
    renderServerTable();
    renderClientTable();
}

function deleteInstance(type, index) {
    if (confirm(I18n.t('confirm_delete'))) {
        type === 'server' ? config.servers.splice(index, 1) : config.clients.splice(index, 1);
        renderServerTable();
        renderClientTable();
    }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
    // Theme Init
    const savedTheme = localStorage.getItem('udp_tunnel_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    setDisplay('theme-icon-moon', savedTheme === 'dark' ? 'block' : 'none');
    setDisplay('theme-icon-sun', savedTheme === 'light' ? 'block' : 'none');
    
    // Event Bindings (Fallback if onclick is missing in HTML, but HTML has them)
    // We keep these just in case, but the main fix is the function renaming above.
    const btnTogglePwd = document.querySelector('.btn-toggle-password');
    if (btnTogglePwd) btnTogglePwd.onclick = togglePassword;

    // Modal Overlay Click
    const modalOverlay = $('modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    
    // Diagnostics Overlay Click
    const diagOverlay = $('diag-overlay');
    if (diagOverlay) {
        diagOverlay.addEventListener('click', e => {
            if (e.target === diagOverlay) closeDiagModal();
        });
    }

    // Wait for i18n to initialize, then load data
    const checkI18n = setInterval(() => {
        if (typeof I18n !== 'undefined' && I18n.translations && Object.keys(I18n.translations).length > 0) {
            clearInterval(checkI18n);
            loadConfig();
            loadStatus();
            statusAutoRefresh = setInterval(loadStatus, 5000);
        }
    }, 50);
});

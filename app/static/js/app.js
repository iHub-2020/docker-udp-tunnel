/*
 * File: app/static/js/app.js
 * Author: iHub-2020
 * Date: 2026-01-14
 * Version: 2.7.0
 * Description: Frontend logic for UDP Tunnel Manager (Enhanced)
 * Updated: Added password toggle, button bindings, input validation, and UI feedback
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

// ==================== Utility ====================
function $(id) { return document.getElementById(id); }

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== Dropdown & UI Interactions ====================
function toggleDropdown(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Close others
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

document.addEventListener('click', e => {
    // Close dropdowns when clicking outside
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
            loadStatus(); // Refresh status to translate badges
        });
    }
}

// ==================== Theme ====================
function toggleTheme() {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('udp_tunnel_theme', newTheme);
    
    const moonIcon = $('theme-icon-moon');
    const sunIcon = $('theme-icon-sun');
    if (moonIcon) moonIcon.style.display = newTheme === 'dark' ? 'block' : 'none';
    if (sunIcon) sunIcon.style.display = newTheme === 'light' ? 'block' : 'none';
}

// ==================== Tabs ====================
function switchSubTab(section, tab) {
    // Update Tab Buttons
    const configTabBtn = document.querySelector(`[data-tab="${section}-config"]`);
    const statusTabBtn = document.querySelector(`[data-tab="${section}-status"]`);
    
    if (configTabBtn) configTabBtn.classList.toggle('active', tab === 'config');
    if (statusTabBtn) statusTabBtn.classList.toggle('active', tab === 'status');

    // Update Content Visibility
    const configContent = $(`${section}-config-content`);
    const statusContent = $(`${section}-status-content`);
    
    if (configContent) configContent.style.display = tab === 'config' ? 'block' : 'none';
    if (statusContent) statusContent.style.display = tab === 'status' ? 'block' : 'none';

    if (tab === 'status') {
        loadStatus();
    }
}

function switchModalTab(tab) {
    document.querySelectorAll('.modal-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    const basicTab = $('modal-basic');
    const advancedTab = $('modal-advanced');
    
    if (basicTab) basicTab.style.display = tab === 'basic' ? 'block' : 'none';
    if (advancedTab) advancedTab.style.display = tab === 'advanced' ? 'block' : 'none';
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
        alert(I18n.t('load_error') || 'Failed to load configuration.');
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

async function saveConfig() {
    const btn = $('btn-save');
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
    const btn = $('btn-save-only');
    if (btn) btn.disabled = true;

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
    } finally {
        if (btn) btn.disabled = false;
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
    if ($('cfg-enabled')) $('cfg-enabled').checked = config.global.enabled;
    if ($('cfg-keep-iptables')) $('cfg-keep-iptables').checked = config.global.keep_iptables;
    if ($('cfg-wait-lock')) $('cfg-wait-lock').checked = config.global.wait_lock;
    if ($('cfg-retry-on-error')) $('cfg-retry-on-error').checked = config.global.retry_on_error;
    if ($('cfg-log-level')) $('cfg-log-level').value = config.global.log_level || 'info';
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
    
    const countEl = $('tunnel-count');
    if (countEl) {
        countEl.textContent = `(${I18n.t('tunnels_active', { count: activeCount })})`;
    }
    
    updateStatusTables(tunnels);
}

function updateStatusTables(tunnels) {
    // Server Status Table
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
    
    // Client Status Table
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
function openDiagnostics() {
    $('diag-overlay').style.display = 'flex';
    loadDiagnostics();
    diagAutoRefresh = setInterval(loadDiagnostics, 3000);
}

function closeDiagnostics() {
    $('diag-overlay').style.display = 'none';
    if (diagAutoRefresh) {
        clearInterval(diagAutoRefresh);
        diagAutoRefresh = null;
    }
}

function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function updateDiagnosticsDisplay(status, logs) {
    const tunnels = status.tunnels || [];
    const activeCount = tunnels.filter(t => t.running).length;
    
    // Service Status
    const statusHtml = activeCount > 0
        ? `<span class="status-text running">${I18n.t('running')}</span> <span class="status-count">(${I18n.t('tunnels_active', { count: activeCount })})</span>`
        : `<span class="status-text stopped">${I18n.t('stopped')}</span>`;
    if ($('diag-service-status')) $('diag-service-status').innerHTML = statusHtml;
    
    // Tunnel Table
    const tunnelBody = $('diag-tunnel-table');
    if (tunnelBody) {
        tunnelBody.innerHTML = '';
        
        // Helper to render rows
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
    
    // Binary Check
    if (status.binary && $('diag-binary')) {
        const icon = status.binary.installed ? '✓' : '✗';
        const iconClass = status.binary.installed ? 'success' : 'error';
        $('diag-binary').innerHTML = `<span class="status-icon ${iconClass}">${icon}</span> ${status.binary.text || 'Unknown'} <span class="diag-hash">(${status.binary.hash || 'N/A'})</span>`;
    }
    
    // Iptables Check
    if (status.iptables && $('diag-iptables')) {
        const chains = status.iptables.chains || [];
        if (status.iptables.present && chains.length > 0) {
            const chainCodes = chains.slice(0, 2).map(c => `<code class="diag-code">${c}</code>`).join(' ');
            $('diag-iptables').innerHTML = `<span class="status-icon success">✓</span> ${status.iptables.text} ${chainCodes}`;
        } else {
            $('diag-iptables').innerHTML = `<span class="status-icon error">✗</span> ${status.iptables.text || I18n.t('no_active_rules')}`;
        }
    }
    
    // Logs
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
            
        // Auto scroll if near bottom or first load
        const logContainer = $('log-container');
        if (logContainer) {
            // Simple auto-scroll logic: always scroll to bottom on refresh
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }
    
    if ($('diag-log-time')) {
        $('diag-log-time').textContent = `${I18n.t('last_updated')}: ${new Date().toLocaleTimeString()}`;
    }
}

function formatLogLine(line) {
    const cleaned = stripAnsi(line);
    const escaped = escapeHtml(cleaned);
    
    let formatted = escaped
        .replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="log-time">$1</span>')
        .replace(/\[INFO\]/g, '<span class="log-level-info">[INFO]</span>')
        .replace(/\[WARN\]/g, '<span class="log-level-warn">[WARN]</span>')
        .replace(/\[WARNING\]/g, '<span class="log-level-warn">[WARNING]</span>')
        .replace(/\[ERROR\]/g, '<span class="log-level-error">[ERROR]</span>')
        .replace(/\[FATAL\]/g, '<span class="log-level-error">[FATAL]</span>')
        .replace(/\[System\]/g, '<span class="log-system">[System]</span>')
        .replace(/\[New Server\]/g, '<span class="log-server">[New Server]</span>')
        .replace(/\[New Client\]/g, '<span class="log-client">[New Client]</span>');
    
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
    $('modal-title').textContent = type === 'server' ? I18n.t('new_server') : I18n.t('new_client');
    
    // Toggle fields visibility
    $('server-fields').style.display = type === 'server' ? 'block' : 'none';
    $('client-fields').style.display = type === 'client' ? 'block' : 'none';
    $('client-advanced-fields').style.display = type === 'client' ? 'block' : 'none';
    
    // Reset fields
    $('modal-enabled').checked = true;
    $('modal-alias').value = type === 'server' ? 'New Server' : 'New Client';
    $('modal-password').value = '';
    $('modal-raw-mode').value = 'faketcp';
    $('modal-cipher-mode').value = 'xor';
    $('modal-auth-mode').value = 'simple';
    $('modal-auto-iptables').checked = true;
    $('modal-extra-args').value = '';
    
    // Reset password visibility
    const pwdInput = $('modal-password');
    if (pwdInput) pwdInput.type = 'password';
    
    if (type === 'server') {
        $('modal-listen-ip').value = '0.0.0.0';
        $('modal-listen-port').value = '29900';
        $('modal-forward-ip').value = '127.0.0.1';
        $('modal-forward-port').value = '51820';
    } else {
        $('modal-server-ip').value = '';
        $('modal-server-port').value = '29900';
        $('modal-local-ip').value = '127.0.0.1';
        $('modal-local-port').value = '3333';
        $('modal-source-ip').value = '';
        $('modal-source-port').value = '';
        $('modal-seq-mode').value = '3';
    }
    
    switchModalTab('basic');
    $('modal-overlay').style.display = 'flex';
}

function openEditModal(type, index) {
    modalState = { type, mode: 'edit', index };
    const item = type === 'server' ? config.servers[index] : config.clients[index];
    
    $('modal-title').textContent = item.alias || (type === 'server' ? 'Server' : 'Client');
    
    $('server-fields').style.display = type === 'server' ? 'block' : 'none';
    $('client-fields').style.display = type === 'client' ? 'block' : 'none';
    $('client-advanced-fields').style.display = type === 'client' ? 'block' : 'none';
    
    $('modal-enabled').checked = item.enabled !== false;
    $('modal-alias').value = item.alias || '';
    $('modal-password').value = item.password || '';
    $('modal-raw-mode').value = item.raw_mode || 'faketcp';
    $('modal-cipher-mode').value = item.cipher_mode || 'xor';
    $('modal-auth-mode').value = item.auth_mode || 'simple';
    $('modal-auto-iptables').checked = item.auto_iptables !== false;
    $('modal-extra-args').value = item.extra_args || '';
    
    // Reset password visibility
    const pwdInput = $('modal-password');
    if (pwdInput) pwdInput.type = 'password';
    
    if (type === 'server') {
        $('modal-listen-ip').value = item.listen_ip || '0.0.0.0';
        $('modal-listen-port').value = item.listen_port || '29900';
        $('modal-forward-ip').value = item.forward_ip || '127.0.0.1';
        $('modal-forward-port').value = item.forward_port || '51820';
    } else {
        $('modal-server-ip').value = item.server_ip || '';
        $('modal-server-port').value = item.server_port || '29900';
        $('modal-local-ip').value = item.local_ip || '127.0.0.1';
        $('modal-local-port').value = item.local_port || '3333';
        $('modal-source-ip').value = item.source_ip || '';
        $('modal-source-port').value = item.source_port || '';
        $('modal-seq-mode').value = item.seq_mode || '3';
    }
    
    switchModalTab('basic');
    $('modal-overlay').style.display = 'flex';
}

function closeModal() {
    $('modal-overlay').style.display = 'none';
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
    const moonIcon = $('theme-icon-moon');
    const sunIcon = $('theme-icon-sun');
    if (moonIcon) moonIcon.style.display = savedTheme === 'dark' ? 'block' : 'none';
    if (sunIcon) sunIcon.style.display = savedTheme === 'light' ? 'block' : 'none';
    
    // Event Bindings for Main Buttons (Robustness check)
    const btnSave = $('btn-save');
    const btnSaveOnly = $('btn-save-only');
    const btnReset = $('btn-reset');
    
    if (btnSave) btnSave.onclick = saveConfig;
    if (btnSaveOnly) btnSaveOnly.onclick = saveConfigOnly;
    if (btnReset) btnReset.onclick = resetConfig;

    // Password Toggle Binding
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
            if (e.target === diagOverlay) closeDiagnostics();
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

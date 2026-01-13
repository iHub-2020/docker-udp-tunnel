/*
 * File: app/static/js/app.js
 * Author: iHub-2020
 * Date: 2026-01-13
 * Version: 2.5.1
 * Description: Frontend logic for UDP Tunnel Manager
 * Updated: Fixed log parsing to handle string format from API
 * GitHub: https://github.com/iHub-2020/docker-udp-tunnel
 */

// ==================== State ====================
let currentLang = 'zh';
let config = {
    global: { enabled: false, keep_iptables: true, wait_lock: true, retry_on_error: true, log_level: 'info' },
    servers: [],
    clients: []
};
let originalConfig = null;
let modalState = { type: null, mode: 'add', index: -1 };
let diagAutoRefresh = null;

// ==================== i18n ====================
const i18n = {
    zh: {
        serviceStatus: '服务状态:',
        running: '运行中',
        stopped: '已停止',
        disabled: '已禁用',
        tunnelsActive: '个隧道运行中',
        generalSettings: '常规设置',
        generalSettingsDesc: 'udp2raw 守护进程的全局设置。',
        serverInstances: '服务端实例',
        serverModeDesc: '服务端模式: OpenWrt 监听来自远程客户端的连接。',
        clientInstances: '客户端实例',
        clientModeDesc: '客户端模式: OpenWrt 连接到远程 udp2raw 服务器 (VPS)。',
        config: '配置',
        status: '状态',
        name: '名称',
        enable: '启用',
        wanPort: 'WAN 监听端口',
        forwardIP: '转发目标 IP',
        forwardPort: '转发目标端口',
        vpsAddr: 'VPS 地址',
        vpsPort: 'VPS 端口',
        localPort: '本地监听端口',
        actions: '操作',
        edit: '编辑',
        delete: '删除',
        addServer: '添加服务端',
        addClient: '添加客户端',
        saveApply: '保存并应用',
        saveOnly: '仅保存',
        reset: '重置',
        noServers: '未配置服务端实例。',
        noClients: '未配置客户端实例。',
        basicSettings: '基本设置',
        advancedSettings: '高级设置',
        close: '关闭',
        save: '保存',
        confirmDelete: '确定要删除此实例吗？',
        configSaved: '配置已保存并应用！',
        logLevel: '日志等级',
        diagnostics: '诊断页面',
        server: '服务端',
        client: '客户端',
        mode: '模式',
        local: '本地',
        remote: '远程',
        protocol: '协议'
    },
    en: {
        serviceStatus: 'Service:',
        running: 'Running',
        stopped: 'Stopped',
        disabled: 'Disabled',
        tunnelsActive: 'tunnels active',
        generalSettings: 'General Settings',
        generalSettingsDesc: 'Global settings for the udp2raw daemon.',
        serverInstances: 'Server Instances',
        serverModeDesc: 'Server Mode: OpenWrt listens for connections from remote clients.',
        clientInstances: 'Client Instances',
        clientModeDesc: 'Client Mode: OpenWrt connects to a remote udp2raw server (VPS).',
        config: 'Config',
        status: 'Status',
        name: 'Name',
        enable: 'Enable',
        wanPort: 'WAN Listen Port',
        forwardIP: 'Forward To IP',
        forwardPort: 'Forward To Port',
        vpsAddr: 'VPS Address',
        vpsPort: 'VPS Port',
        localPort: 'Local Listen Port',
        actions: 'Actions',
        edit: 'Edit',
        delete: 'Delete',
        addServer: 'Add Server',
        addClient: 'Add Client',
        saveApply: 'Save & Apply',
        saveOnly: 'Save Only',
        reset: 'Reset',
        noServers: 'No server instances configured.',
        noClients: 'No client instances configured.',
        basicSettings: 'Basic Settings',
        advancedSettings: 'Advanced Settings',
        close: 'Close',
        save: 'Save',
        confirmDelete: 'Are you sure you want to delete this instance?',
        configSaved: 'Configuration saved and applied!',
        logLevel: 'Log Level',
        diagnostics: 'Diagnostics',
        server: 'Server',
        client: 'Client',
        mode: 'Mode',
        local: 'Local',
        remote: 'Remote',
        protocol: 'Protocol'
    }
};

function t(key) { return i18n[currentLang]?.[key] || i18n.en[key] || key; }
function $(id) { return document.getElementById(id); }

// ==================== Dropdown ====================
function toggleDropdown(id) {
    const el = document.getElementById(id);
    document.querySelectorAll('.icon-dropdown').forEach(d => {
        if (d.id !== id) d.classList.remove('open');
    });
    el.classList.toggle('open');
}

document.addEventListener('click', e => {
    if (!e.target.closest('.icon-dropdown')) {
        document.querySelectorAll('.icon-dropdown').forEach(d => d.classList.remove('open'));
    }
});

// ==================== Language ====================
function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('udp_tunnel_lang', lang);
    document.querySelectorAll('.icon-dropdown').forEach(d => d.classList.remove('open'));
    updateUITexts();
}

function updateUITexts() {
    $('status-label').textContent = t('serviceStatus');
    $('general-settings-title').textContent = t('generalSettings');
    $('general-settings-desc').textContent = t('generalSettingsDesc');
    $('server-instances-title').textContent = t('serverInstances') + ' (-s)';
    $('server-mode-desc').textContent = t('serverModeDesc');
    $('client-instances-title').textContent = t('clientInstances') + ' (-c)';
    $('client-mode-desc').textContent = t('clientModeDesc');
    $('sub-tab-server-config').textContent = t('config');
    $('sub-tab-server-status').textContent = t('status');
    $('sub-tab-client-config').textContent = t('config');
    $('sub-tab-client-status').textContent = t('status');
    $('th-s-name').textContent = t('name');
    $('th-s-enable').textContent = t('enable');
    $('th-s-wan-port').textContent = t('wanPort');
    $('th-s-forward-ip').textContent = t('forwardIP');
    $('th-s-forward-port').textContent = t('forwardPort');
    $('th-s-actions').textContent = t('actions');
    $('th-c-vps-addr').textContent = t('vpsAddr');
    $('th-c-vps-port').textContent = t('vpsPort');
    $('th-c-local-port').textContent = t('localPort');
    $('btn-add-server').textContent = t('addServer');
    $('btn-add-client').textContent = t('addClient');
    $('btn-save-apply').textContent = t('saveApply');
    $('btn-save').textContent = t('saveOnly');
    $('btn-reset').textContent = t('reset');
    $('no-servers-text').textContent = t('noServers');
    $('no-clients-text').textContent = t('noClients');
    $('modal-tab-basic').textContent = t('basicSettings');
    $('modal-tab-advanced').textContent = t('advancedSettings');
    $('modal-btn-close').textContent = t('close');
    $('modal-btn-save').textContent = t('save');
    $('label-log-level').textContent = t('logLevel');
    $('btn-diagnostics').querySelector('span').textContent = t('diagnostics');
    renderServerTable();
    renderClientTable();
}

// ==================== Theme ====================
function toggleTheme() {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('udp_tunnel_theme', newTheme);
    $('theme-icon-moon').style.display = newTheme === 'dark' ? 'block' : 'none';
    $('theme-icon-sun').style.display = newTheme === 'light' ? 'block' : 'none';
}

// ==================== Sub Tabs ====================
function switchSubTab(section, tab) {
    const configTab = document.querySelector(`[data-tab="${section}-config"]`);
    const statusTab = document.querySelector(`[data-tab="${section}-status"]`);
    const configContent = $(`${section}-config-content`);
    const statusContent = $(`${section}-status-content`);
    
    if (tab === 'config') {
        configTab.classList.add('active');
        statusTab.classList.remove('active');
        configContent.style.display = 'block';
        statusContent.style.display = 'none';
    } else {
        configTab.classList.remove('active');
        statusTab.classList.add('active');
        configContent.style.display = 'none';
        statusContent.style.display = 'block';
        loadStatus();
    }
}

function switchModalTab(tab) {
    document.querySelectorAll('.modal-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    $('modal-basic').style.display = tab === 'basic' ? 'block' : 'none';
    $('modal-advanced').style.display = tab === 'advanced' ? 'block' : 'none';
}

// ==================== API ====================
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        config = {
            global: { enabled: false, keep_iptables: true, wait_lock: true, retry_on_error: true, log_level: 'info', ...data.global },
            servers: data.servers || [],
            clients: data.clients || []
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
            fetch('/api/logs?lines=50'),
            fetch('/api/diagnostics')
        ]);
        const status = await statusRes.json();
        const logs = await logsRes.json();
        const diag = await diagRes.json();
        // 合并 diagnostics 数据到 status
        status.binary = diag.binary;
        status.iptables = diag.iptables;
        updateDiagnosticsDisplay(status, logs);
    } catch (e) {
        console.error('Failed to load diagnostics:', e);
    }
}

async function saveConfig() {
    try {
        collectConfigFromUI();
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (res.ok) {
            originalConfig = JSON.parse(JSON.stringify(config));
            alert(t('configSaved'));
            loadStatus();
        }
    } catch (e) {
        console.error('Failed to save config:', e);
        alert('Failed to save configuration');
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
            alert('Configuration saved!');
        }
    } catch (e) {
        console.error('Failed to save config:', e);
    }
}

function resetConfig() {
    if (originalConfig) {
        config = JSON.parse(JSON.stringify(originalConfig));
        applyConfigToUI();
        renderServerTable();
        renderClientTable();
    }
}

// ==================== Config UI ====================
function applyConfigToUI() {
    $('cfg-enabled').checked = config.global.enabled;
    $('cfg-keep-iptables').checked = config.global.keep_iptables;
    $('cfg-wait-lock').checked = config.global.wait_lock;
    $('cfg-retry-on-error').checked = config.global.retry_on_error;
    $('cfg-log-level').value = config.global.log_level || 'info';
}

function collectConfigFromUI() {
    config.global.enabled = $('cfg-enabled').checked;
    config.global.keep_iptables = $('cfg-keep-iptables').checked;
    config.global.wait_lock = $('cfg-wait-lock').checked;
    config.global.retry_on_error = $('cfg-retry-on-error').checked;
    config.global.log_level = $('cfg-log-level').value;
}

// ==================== Status Display ====================
function updateStatusDisplay(data) {
    const tunnels = data.tunnels || [];
    const activeCount = tunnels.filter(t => t.running).length;
    const isRunning = activeCount > 0;
    
    $('status-badge').textContent = isRunning ? t('running') : t('stopped');
    $('status-badge').className = 'status-badge ' + (isRunning ? 'running' : 'stopped');
    $('tunnel-count').textContent = `(${activeCount} ${t('tunnelsActive')})`;
    
    updateStatusTables(tunnels);
}

function updateStatusTables(tunnels) {
    const serverBody = $('server-status-table-body');
    serverBody.innerHTML = '';
    config.servers.forEach((s, i) => {
        const status = tunnels.find(t => t.id === `server_${i}`) || {};
        serverBody.innerHTML += `
            <tr>
                <td>${escapeHtml(s.alias || 'Server ' + i)}</td>
                <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">${status.running ? t('running') : t('stopped')}</span></td>
                <td>${s.listen_ip || '0.0.0.0'}:${s.listen_port}</td>
                <td>${s.forward_ip}:${s.forward_port}</td>
                <td>${s.raw_mode || 'faketcp'}</td>
                <td>${status.pid || '-'}</td>
            </tr>`;
    });
    if (config.servers.length === 0) {
        serverBody.innerHTML = '<tr class="empty-row"><td colspan="6">No server instances.</td></tr>';
    }
    
    const clientBody = $('client-status-table-body');
    clientBody.innerHTML = '';
    config.clients.forEach((c, i) => {
        const status = tunnels.find(t => t.id === `client_${i}`) || {};
        clientBody.innerHTML += `
            <tr>
                <td>${escapeHtml(c.alias || 'Client ' + i)}</td>
                <td><span class="status-badge ${status.running ? 'running' : 'stopped'}">${status.running ? t('running') : t('stopped')}</span></td>
                <td>${c.local_ip || '127.0.0.1'}:${c.local_port}</td>
                <td>${c.server_ip}:${c.server_port}</td>
                <td>${c.raw_mode || 'faketcp'}</td>
                <td>${status.pid || '-'}</td>
            </tr>`;
    });
    if (config.clients.length === 0) {
        clientBody.innerHTML = '<tr class="empty-row"><td colspan="6">No client instances.</td></tr>';
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

// Strip ANSI color codes from text
function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function updateDiagnosticsDisplay(status, logs) {
    const tunnels = status.tunnels || [];
    const activeCount = tunnels.filter(t => t.running).length;
    
    // Service status
    const statusHtml = activeCount > 0
        ? `<span class="status-text running">${t('running')}</span> <span class="status-count">(${activeCount} tunnels active)</span>`
        : `<span class="status-text stopped">${t('stopped')}</span>`;
    $('diag-service-status').innerHTML = statusHtml;
    
    // Tunnel table
    const tunnelBody = $('diag-tunnel-table');
    tunnelBody.innerHTML = '';
    
    config.servers.forEach((s, i) => {
        const st = tunnels.find(t => t.id === `server_${i}`) || {};
        const statusClass = st.running ? 'running' : (s.enabled ? 'stopped' : 'disabled');
        const statusText = st.running ? t('running') : (s.enabled ? t('stopped') : t('disabled'));
        tunnelBody.innerHTML += `
            <tr>
                <td>${escapeHtml(s.alias || 'Server')}</td>
                <td>服务端</td>
                <td><span class="status-text ${statusClass}">${statusText}</span></td>
                <td>${s.listen_ip || '0.0.0.0'}:${s.listen_port}</td>
                <td>${s.forward_ip}:${s.forward_port}</td>
                <td>${s.raw_mode || 'faketcp'} / ${s.cipher_mode || 'xor'}</td>
                <td>${st.pid || '-'}</td>
            </tr>`;
    });
    
    config.clients.forEach((c, i) => {
        const st = tunnels.find(t => t.id === `client_${i}`) || {};
        const statusClass = st.running ? 'running' : (c.enabled ? 'stopped' : 'disabled');
        const statusText = st.running ? t('running') : (c.enabled ? t('stopped') : t('disabled'));
        tunnelBody.innerHTML += `
            <tr>
                <td>${escapeHtml(c.alias || 'Client')}</td>
                <td>客户端</td>
                <td><span class="status-text ${statusClass}">${statusText}</span></td>
                <td>${c.local_ip || '127.0.0.1'}:${c.local_port}</td>
                <td>${c.server_ip}:${c.server_port}</td>
                <td>${c.raw_mode || 'faketcp'} / ${c.cipher_mode || 'xor'}</td>
                <td>${st.pid || '-'}</td>
            </tr>`;
    });
    
    if (config.servers.length === 0 && config.clients.length === 0) {
        tunnelBody.innerHTML = '<tr class="empty-row"><td colspan="7">No tunnel instances configured.</td></tr>';
    }
    
	// Binary & iptables
    if (status.binary) {
        const icon = status.binary.installed ? '✓' : '✗';
        const iconClass = status.binary.installed ? 'success' : 'error';
        $('diag-binary').innerHTML = `<span class="status-icon ${iconClass}">${icon}</span> ${status.binary.text || 'Unknown'} <span class="diag-hash">(${status.binary.hash || 'N/A'})</span>`;
    }
    
	if (status.iptables) {
        const chains = status.iptables.chains || [];		
		if (status.iptables.present && chains.length > 0) {
			const chainCodes = chains.slice(0, 2).map(c => `<code class="diag-code">${c}</code>`).join(' ');
			$('diag-iptables').innerHTML = `<span class="status-icon success">✓</span> ${status.iptables.text} ${chainCodes}`;
        } else {
            $('diag-iptables').innerHTML = `<span class="status-icon error">✗</span> ${status.iptables.text || 'No active rules'}`;
        }
    }
    
    // Logs - handle both string format and array format
    let logLines = [];
    if (logs.logs && typeof logs.logs === 'string') {
        // API returns logs as a single string with \n separators
        logLines = logs.logs.split('\n').filter(line => line.trim());
    } else if (logs.lines && Array.isArray(logs.lines)) {
        // Alternative format: array of lines
        logLines = logs.lines;
    }
    
    $('log-content').innerHTML = logLines.length > 0
        ? logLines.map(formatLogLine).join('\n')
        : 'No recent logs.';
    
    // Auto-scroll to bottom
    const logContainer = $('log-container');
    if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    // Timestamp
    $('diag-log-time').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

function formatLogLine(line) {
    // Strip ANSI codes first, then escape HTML
    const cleaned = stripAnsi(line);
    const escaped = escapeHtml(cleaned);
    
    // Apply syntax highlighting
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
    container.scrollTop = container.scrollHeight;
}

// ==================== Tables ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function renderServerTable() {
    const tbody = $('server-table-body');
    tbody.innerHTML = '';
    if (config.servers.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" id="no-servers-text">${t('noServers')}</td></tr>`;
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
                    <button class="btn btn-outline btn-sm" onclick="openEditModal('server',${i})">${t('edit')}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInstance('server',${i})">${t('delete')}</button>
                </td>
            </tr>`;
    });
}

function renderClientTable() {
    const tbody = $('client-table-body');
    tbody.innerHTML = '';
    if (config.clients.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" id="no-clients-text">${t('noClients')}</td></tr>`;
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
                    <button class="btn btn-outline btn-sm" onclick="openEditModal('client',${i})">${t('edit')}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInstance('client',${i})">${t('delete')}</button>
                </td>
            </tr>`;
    });
}

// ==================== Modal ====================
function openAddModal(type) {
    modalState = { type, mode: 'add', index: -1 };
    $('modal-title').textContent = type === 'server' ? 'New Server' : 'New Client';
    $('server-fields').style.display = type === 'server' ? 'block' : 'none';
    $('client-fields').style.display = type === 'client' ? 'block' : 'none';
    $('client-advanced-fields').style.display = type === 'client' ? 'block' : 'none';
    
    $('modal-enabled').checked = true;
    $('modal-alias').value = type === 'server' ? 'New Server' : 'New Client';
    $('modal-password').value = '';
    $('modal-raw-mode').value = 'faketcp';
    $('modal-cipher-mode').value = 'xor';
    $('modal-auth-mode').value = 'simple';
    $('modal-auto-iptables').checked = true;
    $('modal-extra-args').value = '';
    
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
    if (confirm(t('confirmDelete'))) {
        type === 'server' ? config.servers.splice(index, 1) : config.clients.splice(index, 1);
        renderServerTable();
        renderClientTable();
    }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
    currentLang = localStorage.getItem('udp_tunnel_lang') || 'zh';
    const savedTheme = localStorage.getItem('udp_tunnel_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    $('theme-icon-moon').style.display = savedTheme === 'dark' ? 'block' : 'none';
    $('theme-icon-sun').style.display = savedTheme === 'light' ? 'block' : 'none';
    
    loadConfig();
    loadStatus();
    updateUITexts();
    
    setInterval(loadStatus, 5000);
    
    $('modal-overlay').addEventListener('click', e => {
        if (e.target === $('modal-overlay')) closeModal();
    });
    
    $('diag-overlay').addEventListener('click', e => {
        if (e.target === $('diag-overlay')) closeDiagnostics();
    });
});
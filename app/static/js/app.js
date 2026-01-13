/*
 * File: app/static/js/app.js
 * Author: AI Assistant
 * Date: 2026-01-13
 * Version: 1.0.0
 * Description: Vue.js frontend logic
 */
const { createApp } = Vue;

createApp({
    data() {
        return {
            currentTab: 'global',
            saving: false,
            status: {
                tunnels: [],
                global_running: false
            },
            config: {
                global: { enabled: false, keep_iptables: true },
                servers: [],
                clients: []
            },
            // 默认实例模板
            serverTemplate: {
                enabled: true,
                alias: 'New Server',
                listen_port: 29900,
                forward_ip: '127.0.0.1',
                forward_port: 51820,
                password: 'password',
                raw_mode: 'faketcp',
                cipher_mode: 'xor',
                auto_rule: true
            },
            clientTemplate: {
                enabled: true,
                alias: 'New Client',
                server_ip: '',
                server_port: 29900,
                local_port: 3333,
                password: 'password',
                raw_mode: 'faketcp',
                cipher_mode: 'xor',
                auto_rule: true
            }
        }
    },
    mounted() {
        this.loadConfig();
        this.loadStatus();
        // 轮询状态
        setInterval(this.loadStatus, 5000);
    },
    methods: {
        async loadConfig() {
            try {
                const res = await axios.get('/api/config');
                this.config = res.data;
            } catch (e) {
                console.error("Failed to load config", e);
            }
        },
        async loadStatus() {
            try {
                const res = await axios.get('/api/status');
                this.status = res.data;
            } catch (e) {
                console.error("Failed to load status", e);
            }
        },
        async saveConfig() {
            this.saving = true;
            try {
                await axios.post('/api/config', this.config);
                alert('Configuration saved and applied successfully!');
                await this.loadStatus();
            } catch (e) {
                alert('Failed to save configuration.');
            } finally {
                this.saving = false;
            }
        },
        addInstance(type) {
            const template = type === 'servers' ? this.serverTemplate : this.clientTemplate;
            // 深拷贝模板
            this.config[type].push(JSON.parse(JSON.stringify(template)));
        },
        removeInstance(type, index) {
            if(confirm('Are you sure you want to delete this instance?')) {
                this.config[type].splice(index, 1);
            }
        }
    }
}).mount('#app');
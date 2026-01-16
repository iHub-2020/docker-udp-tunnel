# ----------------------------------------------------------------------
# File: app/config_manager.py
# Author: iHub-2020
# Date: 2026-01-16
# Version: 1.2.0
# Description: Handles reading and writing JSON configuration
# Updated: 
#   - Added new fields for LuCI compatibility (listen_ip, local_ip,
#     source_ip, source_port, seq_mode, wait_lock, theme)
#   - Added advanced parameters: lower_level, dev, disable_anti_replay, 
#     disable_bpf
#   - Changed extra_args default from "" to []
# ----------------------------------------------------------------------
import json
import os
import logging

class ConfigManager:
    def __init__(self, config_path=None):
        self.logger = logging.getLogger("ConfigManager")
        # 如果传入了路径则使用，否则使用默认
        self.config_path = config_path if config_path else "/app/config/udp-tunnel.json"

    def load(self):
        """读取配置文件，如果不存在则返回默认结构"""
        if not os.path.exists(self.config_path):
            self.logger.warning(f"Config file not found at {self.config_path}, using default.")
            return self.get_default_config()
        
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                # 合并默认值，确保新字段存在
                return self._merge_defaults(config)
        except Exception as e:
            self.logger.error(f"Failed to load config: {e}")
            return self.get_default_config()

    def save(self, config_data):
        """保存配置文件"""
        try:
            # 确保目录存在
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
            return True
        except Exception as e:
            self.logger.error(f"Failed to save config: {e}")
            return False

    def _merge_defaults(self, config):
        """合并默认值，确保配置文件向后兼容"""
        default = self.get_default_config()
        
        # 合并 global 设置
        for key, value in default['global'].items():
            if key not in config.get('global', {}):
                config.setdefault('global', {})[key] = value
        
        # 合并 servers 默认字段
        for server in config.get('servers', []):
            for key, value in self._get_server_template().items():
                if key not in server:
                    server[key] = value
        
        # 合并 clients 默认字段
        for client in config.get('clients', []):
            for key, value in self._get_client_template().items():
                if key not in client:
                    client[key] = value
        
        return config

    def _get_server_template(self):
        """Server 实例模板"""
        return {
            "enabled": False,
            "alias": "New Server",
            "listen_ip": "0.0.0.0",
            "listen_port": 29900,
            "forward_ip": "127.0.0.1",
            "forward_port": 51820,
            "password": "password",
            "raw_mode": "faketcp",
            "cipher_mode": "xor",
            "auth_mode": "simple",
            "auto_iptables": True,
            "lower_level": "",
            "dev": "",
            "disable_anti_replay": False,
            "disable_bpf": False,
            "extra_args": []
        }

    def _get_client_template(self):
        """Client 实例模板"""
        return {
            "enabled": False,
            "alias": "New Client",
            "server_ip": "1.2.3.4",
            "server_port": 29900,
            "local_ip": "127.0.0.1",
            "local_port": 3333,
            "password": "password",
            "raw_mode": "faketcp",
            "cipher_mode": "xor",
            "auth_mode": "simple",
            "auto_iptables": True,
            "source_ip": "",
            "source_port": "",
            "seq_mode": 3,
            "lower_level": "",
            "dev": "",
            "disable_anti_replay": False,
            "disable_bpf": False,
            "extra_args": []
        }

    def get_default_config(self):
        """返回默认配置结构"""
        return {
            "global": {
                "enabled": False,
                "keep_iptables": True,
                "wait_lock": True,
                "retry_on_error": True,
                "log_level": "info",
                "theme": "dark"
            },
            "servers": [],
            "clients": []
        }

# ----------------------------------------------------------------------
# File: app/config_manager.py
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Handles reading and writing JSON configuration
# ----------------------------------------------------------------------
import json
import os
import logging

CONFIG_PATH = "/app/config/udp-tunnel.json"

class ConfigManager:
    def __init__(self):
        self.logger = logging.getLogger("ConfigManager")

    def load_config(self):
        """读取配置文件，如果不存在则返回默认结构"""
        if not os.path.exists(CONFIG_PATH):
            return self.get_default_config()
        
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load config: {e}")
            return self.get_default_config()

    def save_config(self, config_data):
        """保存配置文件"""
        try:
            with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
            return True
        except Exception as e:
            self.logger.error(f"Failed to save config: {e}")
            return False

    def get_default_config(self):
        """返回默认配置结构"""
        return {
            "global": {
                "enabled": False,
                "keep_iptables": True,
                "retry_on_error": True,
                "log_level": "info"
            },
            "servers": [],
            "clients": []

        }

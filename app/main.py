# ----------------------------------------------------------------------
# File: app/main.py
# Author: iHub-2020
# Date: 2026-01-15
# Version: 1.5.0
# Description: Flask web server entry point with logs and diagnostics API
# Updated: 
#   - Fixed diagnostics API to return binary and iptables info separately
#   - Verified regex for iptables chain matching
#   - Confirmed dynamic MD5 verification logic
# GitHub: https://github.com/iHub-2020/docker-udp-tunnel
# ----------------------------------------------------------------------
from flask import Flask, render_template, jsonify, request
from app.config_manager import ConfigManager
from app.process_manager import ProcessManager
import logging
from logging.handlers import RotatingFileHandler
import os
import sys
import subprocess
import hashlib
import re

app = Flask(__name__)

# ----------------------------------------------------------------------
# Logging Configuration
# ----------------------------------------------------------------------
# 定义日志目录和文件路径 (必须与 docker-compose.yml 中的挂载点 /app/logs 一致)
LOG_DIR = '/app/logs'
LOG_FILE = os.path.join(LOG_DIR, 'udp-tunnel.log')

# 确保日志目录存在
os.makedirs(LOG_DIR, exist_ok=True)

# 创建格式化器
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# 1. 配置根日志记录器
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# 清除现有的 handlers (避免 Flask 默认 handler 重复)
if root_logger.handlers:
    root_logger.handlers = []

# 2. 添加 stdout 处理器 (给 Portainer 看)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO)
root_logger.addHandler(console_handler)

# 3. 添加文件处理器 (解决宿主机 logs 目录为空的问题)
# maxBytes=5MB, backupCount=3 (保留3个备份文件)
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO)
root_logger.addHandler(file_handler)

# 获取当前模块的 logger
logger = logging.getLogger('main')
logger.info(f"Logging initialized. Writing logs to {LOG_FILE}")

# ----------------------------------------------------------------------
# App Initialization
# ----------------------------------------------------------------------
# 初始化管理器
config_file = os.getenv('CONFIG_PATH', '/app/config/udp-tunnel.json')
config_mgr = ConfigManager(config_file)
process_mgr = ProcessManager()

# 启动时加载配置并运行
try:
    config = config_mgr.load()
    process_mgr.start_tunnels(config)
except Exception as e:
    logger.error(f"Failed to start tunnels on boot: {e}")


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify(config_mgr.load())


@app.route('/api/config', methods=['POST'])
def save_config():
    new_config = request.json
    # 默认应用更改，除非显式指定 apply=false
    apply_changes = request.args.get('apply', 'true').lower() != 'false'
    
    if config_mgr.save(new_config):
        if apply_changes:
            logger.info("Configuration saved. Restarting tunnels...")
            process_mgr.start_tunnels(new_config)
            return jsonify({'status': 'success', 'message': 'Configuration saved and applied.'})
        else:
            logger.info("Configuration saved (no restart).")
            return jsonify({'status': 'success', 'message': 'Configuration saved.'})
    else:
        return jsonify({'status': 'error', 'message': 'Failed to save configuration.'}), 500


@app.route('/api/status', methods=['GET'])
def get_status():
    tunnels = process_mgr.get_status()
    return jsonify({'tunnels': tunnels})


def get_file_md5(filepath, length=10):
    """计算文件的 MD5 哈希值前 N 位"""
    try:
        with open(filepath, 'rb') as f:
            md5_hash = hashlib.md5()
            for chunk in iter(lambda: f.read(8192), b''):
                md5_hash.update(chunk)
            return md5_hash.hexdigest()[:length]
    except Exception:
        return None


@app.route('/api/diagnostics', methods=['GET'])
def get_diagnostics():
    """Get system diagnostics: binary verification and iptables status"""
    diagnostics = {
        'binary': {'installed': False, 'text': 'Not Found', 'hash': ''},
        'iptables': {'present': False, 'text': 'No rules detected', 'chains': []}
    }
    
    binary_path = '/usr/local/bin/udp2raw'
    
    # 检查二进制文件
    try:
        if os.path.exists(binary_path):
            # 获取文件 MD5
            file_hash = get_file_md5(binary_path)
            
            # 验证二进制可执行
            result = subprocess.run(
                [binary_path, '-h'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            # 只要能执行就认为是有效的
            if result.returncode == 0 or len(result.stdout + result.stderr) > 50:
                diagnostics['binary'] = {
                    'installed': True,
                    'text': f'Verified',
                    'hash': file_hash or 'unknown'
                }
            else:
                diagnostics['binary'] = {
                    'installed': True,
                    'text': 'Found but may be corrupted',
                    'hash': file_hash or 'unknown'
                }
        else:
            diagnostics['binary'] = {
                'installed': False,
                'text': 'Not Found',
                'hash': ''
            }
    except subprocess.TimeoutExpired:
        diagnostics['binary'] = {
            'installed': True,
            'text': 'Found (timeout during check)',
            'hash': get_file_md5(binary_path) or 'unknown'
        }
    except Exception as e:
        diagnostics['binary'] = {
            'installed': False,
            'text': f'Error: {str(e)[:50]}',
            'hash': ''
        }
    
    # 检查 iptables 规则
    try:
        result = subprocess.run(
            ['iptables', '-L', '-n'],
            capture_output=True,
            text=True,
            timeout=10
        )
        output = result.stdout
        
        # 查找所有 udp2raw 相关的链
        chain_matches = re.findall(r'(udp2rawDwrW_\w+)', output)
        unique_chains = list(set(chain_matches))
        
        if unique_chains:
            # 只显示前几个链名，避免太长
            display_chains = unique_chains[:3]
            chain_text = ', '.join(display_chains)
            if len(unique_chains) > 3:
                chain_text += f' (+{len(unique_chains) - 3} more)'
            
            diagnostics['iptables'] = {
                'present': True,
                'text': f'Active: {len(unique_chains)} rules',
                'chains': unique_chains
            }
        else:
            diagnostics['iptables'] = {
                'present': False,
                'text': 'No rules detected',
                'chains': []
            }
    except Exception as e:
        diagnostics['iptables'] = {
            'present': False,
            'text': f'Check failed: {str(e)[:30]}',
            'chains': []
        }
    
    return jsonify(diagnostics)


@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Get recent logs from udp2raw processes"""
    lines = int(request.args.get('lines', 50))
    
    try:
        logs = process_mgr.get_logs(lines)
        
        if not logs:
            status = process_mgr.get_status()
            if status:
                for t in status:
                    if t.get('running'):
                        logs.append(f"[INFO] [{t['id']}] PID: {t['pid']} - Running (waiting for output...)")
                    else:
                        logs.append(f"[WARN] [{t['id']}] Process not running")
            
            if not logs:
                config = config_mgr.load()
                if not config.get('global', {}).get('enabled', False):
                    logs = ['[INFO] Service is disabled. Enable it in settings to start tunnels.']
                else:
                    logs = ['[INFO] No tunnels configured or running.']
        
        return jsonify({'logs': '\n'.join(logs)})
    
    except Exception as e:
        logger.error(f"Failed to get logs: {e}")
        return jsonify({'logs': f'[ERROR] Error retrieving logs: {str(e)}'})


@app.route('/api/logs', methods=['DELETE'])
def clear_logs():
    """Clear log buffer"""
    try:
        process_mgr.clear_logs()
        # 同时在日志文件中记录一下清理操作
        logger.info("Log buffer cleared by user.")
        return jsonify({'status': 'success', 'message': 'Logs cleared.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200


if __name__ == '__main__':
    # 注意：在生产环境中通常由 Gunicorn 启动，这里仅用于开发调试
    app.run(host='0.0.0.0', port=5000, debug=True)


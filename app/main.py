# ----------------------------------------------------------------------
# File: app/main.py
# Author: iHub-2020
# Date: 2026-01-15
# Version: 2.0.0
# Description: Flask web server with session-based authentication
# Updated: 
#   - ✅ Added login/logout routes
#   - ✅ Added session management with @login_required decorator
#   - ✅ Password configurable via WEB_PASSWORD env var (default: admin)
#   - ✅ Fixed diagnostics iptables regex to capture all chains
# GitHub: https://github.com/iHub-2020/docker-udp-tunnel
# ----------------------------------------------------------------------
from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from functools import wraps
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
app.secret_key = os.getenv('SECRET_KEY', os.urandom(24).hex())

# ----------------------------------------------------------------------
# Authentication Configuration
# ----------------------------------------------------------------------
# Password from environment variable (default: admin)
WEB_PASSWORD = os.getenv('WEB_PASSWORD', 'admin')

def login_required(f):
    """Decorator to protect routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# ----------------------------------------------------------------------
# Logging Configuration
# ----------------------------------------------------------------------
LOG_DIR = '/app/logs'
LOG_FILE = os.path.join(LOG_DIR, 'udp-tunnel.log')
os.makedirs(LOG_DIR, exist_ok=True)

log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

if root_logger.handlers:
    root_logger.handlers = []

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO)
root_logger.addHandler(console_handler)

file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO)
root_logger.addHandler(file_handler)

logger = logging.getLogger('main')
logger.info(f"Logging initialized. Writing logs to {LOG_FILE}")

# ----------------------------------------------------------------------
# App Initialization
# ----------------------------------------------------------------------
config_file = os.getenv('CONFIG_PATH', '/app/config/udp-tunnel.json')
config_mgr = ConfigManager(config_file)
process_mgr = ProcessManager()

try:
    config = config_mgr.load()
    process_mgr.start_tunnels(config)
except Exception as e:
    logger.error(f"Failed to start tunnels on boot: {e}")


# ----------------------------------------------------------------------
# Authentication Routes
# ----------------------------------------------------------------------
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        password = request.form.get('password', '')
        if password == WEB_PASSWORD:
            session['logged_in'] = True
            session.permanent = True
            logger.info(f"User logged in from {request.remote_addr}")
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        else:
            logger.warning(f"Failed login attempt from {request.remote_addr}")
            return render_template('login.html', error='Invalid password')
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    logger.info("User logged out")
    return redirect(url_for('login'))


# ----------------------------------------------------------------------
# Protected Routes
# ----------------------------------------------------------------------
@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/api/config', methods=['GET'])
@login_required
def get_config():
    return jsonify(config_mgr.load())


@app.route('/api/config', methods=['POST'])
@login_required
def save_config():
    new_config = request.json
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
@login_required
def get_status():
    tunnels = process_mgr.get_status()
    return jsonify({'tunnels': tunnels})


def get_file_md5(filepath, length=10):
    """Calculate MD5 hash of file (first N chars)"""
    try:
        with open(filepath, 'rb') as f:
            md5_hash = hashlib.md5()
            for chunk in iter(lambda: f.read(8192), b''):
                md5_hash.update(chunk)
            return md5_hash.hexdigest()[:length]
    except Exception:
        return None


@app.route('/api/diagnostics', methods=['GET'])
@login_required
def get_diagnostics():
    """Get system diagnostics: binary verification and iptables status"""
    diagnostics = {
        'binary': {'installed': False, 'text': 'Not Found', 'hash': ''},
        'iptables': {'present': False, 'text': 'No rules detected', 'chains': []}
    }
    
    binary_path = '/usr/local/bin/udp2raw'
    
    # Check binary
    try:
        if os.path.exists(binary_path):
            file_hash = get_file_md5(binary_path)
            
            result = subprocess.run(
                [binary_path, '-h'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0 or len(result.stdout + result.stderr) > 50:
                diagnostics['binary'] = {
                    'installed': True,
                    'text': 'Verified',
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
    
    # ✅ Check iptables rules - FIXED: capture ALL chains
    try:
        result = subprocess.run(
            ['iptables', '-L', '-n'],
            capture_output=True,
            text=True,
            timeout=10
        )
        output = result.stdout
        
        # Find all udp2raw-related chains
        chain_matches = re.findall(r'(udp2rawDwrW_\w+)', output)
        unique_chains = list(set(chain_matches))
        
        if unique_chains:
            diagnostics['iptables'] = {
                'present': True,
                'text': f'Active ({len(unique_chains)} rules)',
                'chains': unique_chains  # ✅ Return ALL chains
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
@login_required
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
@login_required
def clear_logs():
    """Clear log buffer"""
    try:
        process_mgr.clear_logs()
        logger.info("Log buffer cleared by user.")
        return jsonify({'status': 'success', 'message': 'Logs cleared.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/service/start', methods=['POST'])
@login_required
def start_service():
    """Start udp2raw processes (like /etc/init.d/udp2raw start)"""
    try:
        # 读取配置但不修改
        config = config_mgr.load()
        
        # 直接启动进程（相当于 service udp2raw start）
        process_mgr.start_tunnels(config)
        
        logger.info("Service started manually by user")
        return jsonify({'status': 'success', 'message': 'Service started successfully'})
    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/service/stop', methods=['POST'])
@login_required
def stop_service():
    """Stop all udp2raw processes (like /etc/init.d/udp2raw stop)"""
    try:
        # 只停止进程，不修改配置（相当于 service udp2raw stop）
        process_mgr.stop_all()
        
        logger.info("Service stopped manually by user")
        return jsonify({'status': 'success', 'message': 'Service stopped successfully'})
    except Exception as e:
        logger.error(f"Failed to stop service: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/health')
def health_check():
    """Health check endpoint (no auth required)"""
    return jsonify({'status': 'healthy'}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)



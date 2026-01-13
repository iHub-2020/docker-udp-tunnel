# ----------------------------------------------------------------------
# File: app/main.py
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Flask web server entry point
# ----------------------------------------------------------------------
from flask import Flask, render_template, jsonify, request
from config_manager import ConfigManager
from process_manager import ProcessManager
import logging

app = Flask(__name__)

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('main')

config_mgr = ConfigManager('/app/config/udp-tunnel.json')
process_mgr = ProcessManager()

# 启动时加载配置并运行
config = config_mgr.load()
process_mgr.start_tunnels(config)

@app.route('/')
def index():
    # 纯前端渲染，不再通过 render_template 传参，避免 Jinja2 冲突
    return render_template('index.html')

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify(config_mgr.load())

@app.route('/api/config', methods=['POST'])
def save_config():
    new_config = request.json
    config_mgr.save(new_config)
    # 保存后重启服务
    process_mgr.start_tunnels(new_config)
    return jsonify({'status': 'success', 'message': 'Configuration saved and applied.'})

@app.route('/api/status', methods=['GET'])
def get_status():
    tunnels = process_mgr.get_status()
    global_running = len(tunnels) > 0
    return jsonify({
        'global_running': global_running,
        'tunnels': tunnels
    })

@app.route('/health')
def health_check():
    # 简单的健康检查，只要 web 服务活着就返回 200
    return jsonify({'status': 'healthy'}), 200

if __name__ == '__main__':
    # 开发模式
    app.run(host='0.0.0.0', port=5000, debug=True)

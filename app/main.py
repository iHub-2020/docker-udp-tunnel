# ----------------------------------------------------------------------
# File: app/main.py
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Flask web server entry point
# ----------------------------------------------------------------------
from flask import Flask, render_template, jsonify, request
from app.config_manager import ConfigManager
from app.process_manager import ProcessManager
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

app = Flask(__name__)
config_mgr = ConfigManager()
process_mgr = ProcessManager()

# 启动时加载配置并运行
initial_config = config_mgr.load_config()
process_mgr.start_from_config(initial_config)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify(config_mgr.load_config())

@app.route('/api/config', methods=['POST'])
def save_config():
    new_config = request.json
    if config_mgr.save_config(new_config):
        # 保存后自动重启服务应用新配置
        process_mgr.start_from_config(new_config)
        return jsonify({"status": "success", "message": "Configuration saved and applied."})
    else:
        return jsonify({"status": "error", "message": "Failed to save configuration."}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        "tunnels": process_mgr.get_status(),
        "global_running": len(process_mgr.processes) > 0
    })

if __name__ == '__main__':

    app.run(host='0.0.0.0', port=5000)

#!/bin/bash
# ----------------------------------------------------------------------
# File: entrypoint.sh
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Startup script to initialize config and start Flask
# ----------------------------------------------------------------------

# 确保配置目录存在
if [ ! -f "/app/config/udp-tunnel.json" ]; then
    echo "Config file not found, creating default..."
    echo '{"global": {"enabled": false}, "servers": [], "clients": []}' > /app/config/udp-tunnel.json
fi

# 启动 Python 后端应用
# 使用 unbuffered 模式以便在 docker logs 中实时查看日志
echo "Starting UDP Tunnel Web Interface..."
exec python3 -u -m app.main

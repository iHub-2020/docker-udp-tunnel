#!/bin/bash
# ----------------------------------------------------------------------
# File: entrypoint.sh
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Startup script to initialize config and start Flask
# ----------------------------------------------------------------------

#!/bin/bash

# 确保配置目录存在
if [ ! -f "/app/config/udp-tunnel.json" ]; then
    echo "Initializing default configuration..."
    echo '{"global": {"enabled": false, "log_level": "info"}, "servers": [], "clients": []}' > /app/config/udp-tunnel.json
fi

# SSL 证书处理
CERT_DIR="/app/config/certs"
mkdir -p "$CERT_DIR"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "Generating self-signed SSL certificate..."
    openssl req -x509 -newkey rsa:4096 -nodes -out "$CERT_FILE" -keyout "$KEY_FILE" -days 3650 -subj "/CN=udp-tunnel-web"
fi

# 启动 Gunicorn (启用 SSL, 4个 worker, 绑定所有接口)
echo "Starting UDP Tunnel Web Interface with SSL..."
exec gunicorn --bind 0.0.0.0:5000 \
    --workers 1 \
    --threads 4 \
    --certfile "$CERT_FILE" \
    --keyfile "$KEY_FILE" \
    --access-logfile - \
    --error-logfile - \
    "app.main:app"

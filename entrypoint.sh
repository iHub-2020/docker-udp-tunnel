#!/bin/bash
# ----------------------------------------------------------------------
# File: entrypoint.sh
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.1.0
# Description: Startup script to initialize config and start Flask with HTTP/HTTPS toggle
# Updated: Added permission handling for mounted volumes with HOST_UID/HOST_GID
# ----------------------------------------------------------------------

set -e

echo "=== UDP Tunnel Web Manager Starting ==="

# 0. 处理挂载目录权限
# 如果设置了 HOST_UID/HOST_GID，确保目录可写
if [ -n "$HOST_UID" ] && [ -n "$HOST_GID" ]; then
    echo "Adjusting permissions for HOST_UID=$HOST_UID, HOST_GID=$HOST_GID"
    # 确保 root 可以写入这些目录（目录本身权限）
    chmod 755 /app/config /app/logs 2>/dev/null || true
fi

# 确保日志目录可写
touch /app/logs/udp2raw.log 2>/dev/null || true
chmod 644 /app/logs/udp2raw.log 2>/dev/null || true

# 1. 初始化默认配置
CONFIG_FILE="/app/config/udp-tunnel.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Initializing default configuration..."
    # 确保目录存在
    mkdir -p $(dirname "$CONFIG_FILE")
    cat > "$CONFIG_FILE" << 'EOF'
{
    "global": {
        "enabled": false,
        "keep_iptables": true,
        "wait_lock": true,
        "retry_on_error": true,
        "log_level": "info",
        "theme": "dark"
    },
    "servers": [],
    "clients": []
}
EOF
    echo "Default configuration created at $CONFIG_FILE"
fi

# 2. 准备 Gunicorn 基础参数
# 绑定所有接口，1个 worker (因为 udp2raw 管理是单例的)，4个线程处理并发请求
GUNICORN_CMD="gunicorn --bind 0.0.0.0:5000 --workers 1 --threads 4 --access-logfile - --error-logfile - app.main:app"

# 3. 判断启动模式 (HTTP vs HTTPS)
# 默认为 false (HTTP)，除非环境变量明确设置为 true
ENABLE_HTTPS=${ENABLE_HTTPS:-false}

if [ "$ENABLE_HTTPS" = "true" ]; then
    echo "Starting UDP Tunnel Web Interface in HTTPS mode..."
    
    CERT_DIR="/app/config/certs"
    mkdir -p "$CERT_DIR"
    CERT_FILE="$CERT_DIR/server.crt"
    KEY_FILE="$CERT_DIR/server.key"

    # 如果证书不存在，生成自签名证书
    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        echo "Generating self-signed SSL certificate..."
        openssl req -x509 -newkey rsa:4096 -nodes \
            -out "$CERT_FILE" \
            -keyout "$KEY_FILE" \
            -days 3650 \
            -subj "/CN=udp-tunnel-web"
    fi
    
    # 追加 SSL 参数
    GUNICORN_CMD="$GUNICORN_CMD --certfile $CERT_FILE --keyfile $KEY_FILE"
else
    echo "Starting UDP Tunnel Web Interface in HTTP mode..."
fi

echo "Config file: $CONFIG_FILE"
echo "Log file: /app/logs/udp2raw.log"

# 4. 执行启动命令
# 使用 exec 替换当前 shell 进程，确保信号能正确传递给 Gunicorn
exec $GUNICORN_CMD
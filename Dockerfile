# ----------------------------------------------------------------------
# File: Dockerfile
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Docker image build instructions for UDP Tunnel
# ----------------------------------------------------------------------

FROM python:3.9-alpine

# 安装基础依赖 (iptables 是 udp2raw 必须的)
RUN apk add --no-cache \
    iptables \
    libcap \
    curl \
    openssl \
    bash

WORKDIR /app

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 下载 udp2raw 二进制文件 (根据架构自动选择或固定 amd64，这里演示 amd64)
# 实际部署建议根据构建平台下载对应的 binary
RUN wget https://github.com/wangyu-/udp2raw-tunnel/releases/download/20230206.0/udp2raw_binaries.tar.gz \
    && tar -xzvf udp2raw_binaries.tar.gz \
    && mv udp2raw_amd64 /usr/local/bin/udp2raw \
    && chmod +x /usr/local/bin/udp2raw \
    && rm udp2raw_binaries.tar.gz version.txt

# 复制应用代码
COPY . .

# 创建配置和日志目录
RUN mkdir -p /app/config /app/logs

# 赋予脚本执行权限
RUN chmod +x entrypoint.sh

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -k -f https://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]

# ----------------------------------------------------------------------
# File: Dockerfile
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Docker image build instructions for UDP Tunnel
# ----------------------------------------------------------------------

# 使用轻量级 Python 基础镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖 (wget用于下载udp2raw, iptables用于raw socket操作)
RUN apt-get update && apt-get install -y \
    wget \
    tar \
    iptables \
    procps \
    && rm -rf /var/lib/apt/lists/*

# 下载并安装 udp2raw 二进制文件 (使用官方预编译版本)
# 注意：这里默认下载 amd64 版本，如果是 arm 架构需修改链接
RUN wget https://github.com/wangyu-/udp2raw-tunnel/releases/download/20230206.0/udp2raw_binaries.tar.gz \
    && tar -xzvf udp2raw_binaries.tar.gz \
    && mv udp2raw_amd64 /usr/bin/udp2raw \
    && chmod +x /usr/bin/udp2raw \
    && rm udp2raw_binaries.tar.gz version.txt

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY app/ /app/app/
COPY entrypoint.sh /app/

# 设置权限
RUN chmod +x /app/entrypoint.sh

# 暴露端口 (Web UI)
EXPOSE 5000

# 启动脚本
ENTRYPOINT ["/app/entrypoint.sh"]

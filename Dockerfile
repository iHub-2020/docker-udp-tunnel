# ----------------------------------------------------------------------
# File: Dockerfile
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Docker image build instructions for UDP Tunnel
# ----------------------------------------------------------------------

FROM python:3.9-alpine

# 1. 安装运行时依赖
# iptables: udp2raw 核心依赖
# libcap: 权限控制
# curl: 健康检查用
# openssl: 生成 SSL 证书用
# bash: 脚本支持
# libstdc++: udp2raw 二进制文件通常需要
# gcompat: 让 Alpine (musl) 能运行 glibc 编译的二进制文件 (关键修复)
RUN apk add --no-cache \
    iptables \
    libcap \
    curl \
    openssl \
    bash \
    libstdc++ \
    gcompat

WORKDIR /app

# 2. 复制依赖文件
COPY requirements.txt .

# 3. 安装构建依赖 -> 安装 Python 库 -> 删除构建依赖
# psutil 编译需要: gcc, musl-dev, linux-headers, python3-dev
RUN apk add --no-cache --virtual .build-deps \
    gcc \
    musl-dev \
    linux-headers \
    python3-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apk del .build-deps

# 4. 下载 udp2raw 二进制文件
# 注意：这里下载的是官方 release，通常是 glibc 编译的，所以上面安装了 gcompat
RUN wget https://github.com/wangyu-/udp2raw-tunnel/releases/download/20230206.0/udp2raw_binaries.tar.gz \
    && tar -xzvf udp2raw_binaries.tar.gz \
    && mv udp2raw_amd64 /usr/local/bin/udp2raw \
    && chmod +x /usr/local/bin/udp2raw \
    && rm -rf udp2raw_binaries.tar.gz version.txt

# 5. 复制应用代码
COPY . .

# 6. 创建配置和日志目录
RUN mkdir -p /app/config /app/logs

# 7. 赋予脚本执行权限
RUN chmod +x entrypoint.sh

# 8. 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -k -f https://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]

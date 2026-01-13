# ----------------------------------------------------------------------
# File: Dockerfile
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.1
# Description: Docker image build instructions for UDP Tunnel
# ----------------------------------------------------------------------

FROM python:3.9-alpine

# 1. 安装运行时依赖
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

# 3. 安装 Python 依赖
RUN apk add --no-cache --virtual .build-deps \
    gcc \
    musl-dev \
    linux-headers \
    python3-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apk del .build-deps

# 4. 下载 udp2raw 二进制文件
# 修正：确保解压后路径正确。udp2raw release 包结构通常包含多个架构
RUN wget https://github.com/wangyu-/udp2raw-tunnel/releases/download/20230206.0/udp2raw_binaries.tar.gz \
    && tar -xzvf udp2raw_binaries.tar.gz \
    && cp udp2raw_amd64 /usr/local/bin/udp2raw \
    && chmod +x /usr/local/bin/udp2raw \
    && rm -rf udp2raw_binaries.tar.gz version.txt udp2raw_amd64 udp2raw_x86 udp2raw_ar*

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
<!--
File: README.md
Author: iHub-2020
Date: 2026-01-13
Version: 1.0.1
Description: Project documentation and usage guide
-->

# Docker UDP Tunnel Manager

这是一个基于 Web 界面的 `udp2raw-tunnel` 管理工具，运行在 Docker 容器中。它旨在替代 OpenWrt 上的 luci-app-udp-tunnel 插件，提供跨平台的 UDP 隧道管理能力。

## 功能特性

- **Web 管理界面**：基于 Vue.js 3 和 Bootstrap 5 的现代化 UI。
- **Docker 化部署**：环境隔离，内置 Python 环境和 udp2raw 二进制文件。
- **HTTPS 支持**：支持一键切换 HTTP/HTTPS 模式，自动生成自签名证书。
- **配置持久化**：所有配置保存在 JSON 文件中，重启容器不丢失。
- **实时状态**：可查看隧道进程的运行状态和 PID。

## 目录结构

```text
docker-udp-tunnel/
├── app/                    # 核心代码
│   ├── config_manager.py   # 配置读写
│   ├── main.py             # Flask 入口
│   ├── process_manager.py  # 进程管理
│   ├── static/             # 静态资源 (JS/CSS)
│   └── templates/          # HTML 模板
├── config/                 # [挂载] 配置存储
├── logs/                   # [挂载] 日志存储
├── docker-compose.yml      # 编排文件
├── Dockerfile              # 镜像构建文件
├── entrypoint.sh           # 启动脚本
└── requirements.txt        # Python 依赖
```
快速开始
1. 前置要求
安装 Docker 和 Docker Compose。
宿主机网络：宿主机需要支持 iptables。
权限：容器需要 NET_ADMIN 权限（已在 compose 文件中配置）。
2. 构建并启动
在项目根目录下运行：

```bash
# 构建镜像并后台启动
docker-compose up -d --build
```
3. 访问界面
默认配置下（HTTP 模式）：

地址：http://YOUR_IP:5000
4. 开启 HTTPS (可选)
编辑 docker-compose.yml，修改环境变量：

```yaml
environment:
  - ENABLE_HTTPS=true
```
重启容器后，访问 https://YOUR_IP:5000（浏览器会提示自签名证书不安全，请忽略并继续）。

配置参数说明
参数	说明
Raw Mode	底层发包模式。推荐 faketcp（伪装成 TCP 连接），可绕过 UDP QOS。
Cipher Mode	加密模式。xor 速度快消耗低，aes128cbc 更安全。
Listen Port	本地监听端口。
Forward To	流量转发的目标地址和端口。
Password	隧道密码，服务端和客户端必须严格一致。
Seq Mode	序列号模式，用于对抗伪造 TCP 检测，推荐默认。
注意事项
Host 模式：推荐保持 network_mode: host。如果使用 Bridge 模式，udp2raw 无法捕获物理网卡的流量，需要极其复杂的 iptables NAT 配置。
FakeTCP 规则：在此模式下，程序会自动添加 iptables 规则以丢弃内核对伪造 TCP 包的 RST 响应。请勿在容器运行时手动清除宿主机的 iptables INPUT 链规则，否则会导致连接中断。
日志查看：
```bash
docker logs -f udp-tunnel-web
```
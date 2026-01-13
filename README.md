<!--
File: README.md
Author: AI Assistant
Date: 2026-01-13
Version: 1.0.0
Description: Project documentation and usage guide
-->

# Docker UDP Tunnel

这是一个基于 Web 界面的 `udp2raw-tunnel` 管理工具，运行在 Docker 容器中。它旨在替代 OpenWrt 上的 LUCI 插件，提供跨平台的 UDP 隧道管理能力。

## 功能特性

- **Web 管理界面**：基于 Vue.js 和 Bootstrap 的现代化 UI，复刻了 LUCI 的操作体验。
- **Docker 化部署**：环境隔离，依赖自包含（内置 Python 和 udp2raw 二进制）。
- **多实例管理**：支持同时配置多个 Server 或 Client 实例。
- **配置持久化**：所有配置保存在 JSON 文件中，重启容器不丢失。
- **实时状态**：可查看隧道进程的运行状态。

## 目录结构

```text
docker-udp-tunnel/
├── app                     # 源码
│   ├── config_manager.py
│   ├── main.py
│   ├── process_manager.py
│   ├── static
│   │   ├── css
│   │   │   └── style.css
│   │   └── js
│   │       └── app.js
│   └── templates
│       └── index.html
├── config                 # 配置挂载目录
│   └── udp-tunnel.json
├── docker-compose.yml     # 编排文件
├── Dockerfile             # 镜像构建文件
├── entrypoint.sh          # 启动脚本
├── README.md
└── requirements.txt       # Python 依赖
```

## 快速开始
1. 前置要求
安装 Docker 和 Docker Compose。
宿主机需要支持 iptables（因为 udp2raw 需要操作防火墙规则）。
2. 构建并启动
在项目根目录下运行：

```bash
docker-compose up -d --build
```
3. 访问界面
打开浏览器访问：http://localhost:5000

4. 查看日志
如果遇到问题，可以查看容器日志：

```bash
docker logs -f udp-tunnel-web
```
## 配置说明
核心参数解释
参数	说明
Raw Mode	底层发包模式。推荐 faketcp（伪装成 TCP 连接），可绕过 UDP QOS。
Cipher Mode	加密模式。xor 速度快，aes128cbc 更安全。
Listen Port	本地监听端口。
Forward To	流量转发的目标地址和端口。
Password	隧道密码，服务端和客户端必须一致。
## 注意事项
权限问题：容器必须以 --cap-add=NET_ADMIN 运行，且推荐使用 network_mode: host，否则 udp2raw 无法操作 raw socket 和 iptables。
FakeTCP 模式：在此模式下，udp2raw 会自动添加 iptables 规则以丢弃内核对伪造 TCP 包的 RST 响应。请勿手动清除容器内的 iptables 规则。
手动配置
虽然推荐使用 Web 界面，但您也可以直接修改 config/udp-tunnel.json 文件，修改后需重启容器生效。

#### 12. `config/udp-tunnel.json` (可选样例)
虽然 `entrypoint.sh` 会在文件不存在时自动生成默认配置，但您可以手动创建此文件以预设一些配置。

```json
{
    "global": {
        "enabled": false,
        "keep_iptables": true,
        "retry_on_error": true,
        "log_level": "info"
    },
    "servers": [
        {
            "enabled": false,
            "alias": "Example Server",
            "listen_port": 29900,
            "forward_ip": "127.0.0.1",
            "forward_port": 51820,
            "password": "your_password",
            "raw_mode": "faketcp",
            "cipher_mode": "xor",
            "auth_mode": "md5",
            "auto_rule": true
        }
    ],
    "clients": [
        {
            "enabled": false,
            "alias": "Example Client",
            "server_ip": "1.2.3.4",
            "server_port": 29900,
            "local_port": 3333,
            "password": "your_password",
            "raw_mode": "faketcp",
            "cipher_mode": "xor",
            "auth_mode": "md5",
            "auto_rule": true
        }
    ]

}


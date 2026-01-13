<!--
File: README.md
Author: iHub-2020
Date: 2026-01-13
Version: 1.0.2
Description: Project documentation and usage guide
-->

# Docker UDP Tunnel Manager

基于 Web 界面的 `udp2raw-tunnel` 管理工具，运行在 Docker 容器中。旨在替代 OpenWrt 上的 luci-app-udp-tunnel 插件，提供跨平台的 UDP 隧道管理能力。

## 功能特性

- **Web 管理界面**：现代化响应式 UI，支持深色主题
- **Docker 化部署**：环境隔离，内置 Python 环境和 udp2raw 二进制文件
- **多隧道管理**：支持同时运行多个服务端/客户端隧道
- **实时状态监控**：查看隧道进程状态、PID、iptables 规则
- **配置持久化**：JSON 配置文件，重启容器不丢失
- **HTTPS 支持**：可选开启，自动生成自签名证书

## 目录结构

```text
docker-udp-tunnel/
├── app/                      # 应用核心代码
│   ├── main.py               # Flask Web 服务入口
│   ├── config_manager.py     # 配置文件读写管理
│   ├── process_manager.py    # udp2raw 进程生命周期管理
│   ├── static/               # 前端静态资源
│   │   ├── css/
│   │   │   └── style.css     # 界面样式
│   │   └── js/
│   │       └── app.js        # 前端交互逻辑
│   └── templates/
│       └── index.html        # 主页面模板
├── config/                   # [挂载卷] 配置存储目录
│   └── udp-tunnel.json       # 隧道配置文件
├── docker-compose.yml        # Docker Compose 编排文件
├── Dockerfile                # 镜像构建定义
├── entrypoint.sh             # 容器启动入口脚本
├── requirements.txt          # Python 依赖列表
├── LICENSE                   # 开源许可证
└── README.md                 # 项目文档
```
## 快速开始
### 1. 前置要求
安装 Docker 和 Docker Compose
宿主机支持 iptables
容器需要 NET_ADMIN 权限（已在 compose 文件中配置）
### 2. 构建并启动
```bash
# 克隆项目
git clone https://github.com/iHub-2020/docker-udp-tunnel.git
cd docker-udp-tunnel

# 构建镜像并后台启动
docker-compose up -d --build
```
### 3. 访问界面
默认 HTTP 模式：http://YOUR_IP:5000

### 4. 开启 HTTPS（可选）
编辑 docker-compose.yml：

```yaml
environment:
  - ENABLE_HTTPS=true
```
重启容器后访问 https://YOUR_IP:5000（浏览器会提示证书不安全，忽略即可）。

### 配置参数说明
参数	说明
Mode	服务端 (Server) 或客户端 (Client)
Raw Mode	底层发包模式。faketcp 伪装成 TCP，可绕过 UDP QoS
Cipher Mode	加密模式。xor 速度快，aes128cbc 更安全
Listen Port	本地监听端口
Forward To	流量转发的目标地址和端口
Password	隧道密钥，服务端与客户端必须一致
Seq Mode	序列号模式（仅客户端），用于对抗 TCP 检测
### 注意事项
Host 网络模式：推荐保持 network_mode: host。Bridge 模式下 udp2raw 无法正常捕获流量。

iptables 规则：FakeTCP 模式下程序会自动添加 iptables 规则。容器运行时请勿手动清除宿主机的 INPUT 链规则，否则会导致连接中断。

### 查看日志：

```bash
docker logs -f udp-tunnel-web
```
### 许可证
MIT License

```markdown

## 主要改动

1. **更新目录树** - 补全所有文件并添加说明
2. **去除框架名称** - "Vue.js 3 和 Bootstrap 5" → "现代化响应式 UI，支持深色主题"
3. **新增功能描述** - 添加了"多隧道管理"和"实时状态监控"
4. **补充参数表格** - 添加了 Mode 参数说明
5. **精简语句** - 删除冗余描述，更简洁
6. **添加克隆命令** - 快速开始部分更完整
7. **添加许可证章节** - 对应 LICENSE 文件
```

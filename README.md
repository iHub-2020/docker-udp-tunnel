# docker-app-udp2raw

> 规范名称：`docker-app-udp2raw`
> 底层核心项目：`udp2raw`
> 对应 LuCI 插件：`luci-app-udp2raw`

`docker-app-udp2raw` 是一个面向 `udp2raw` 的 Docker 化管理端项目，提供 Web 管理界面、配置持久化、运行状态查看与日志诊断能力，用于与 OpenWrt 侧的 `luci-app-udp2raw` 保持命名和职责对齐。

## 功能特性

- 基于 `udp2raw` 的服务端 / 客户端实例管理
- Web 管理界面与 JSON 配置持久化
- 实时状态、日志与 iptables 规则诊断
- 支持 HTTP / HTTPS 切换
- 适合独立 Docker 主机与 OpenWrt 配置端配套部署

## 目录结构

```text
docker-app-udp2raw/
├── app/                      # Web 应用代码
├── config/                   # 默认配置目录
│   └── udp2raw.json          # 运行配置文件
├── docker-compose.yml        # Docker Compose 编排
├── Dockerfile                # 镜像构建定义
├── entrypoint.sh             # 容器启动入口
└── README.md                 # 项目说明
```

## 快速开始

```bash
git clone https://github.com/iHub-2020-Org/docker-app-udp2raw.git
cd docker-app-udp2raw
docker compose up -d --build
```

默认访问地址：
- HTTP: `http://YOUR_IP:5000`
- HTTPS: 设置 `ENABLE_HTTPS=true` 后访问 `https://YOUR_IP:5000`

## 命名说明

本项目历史上曾使用 `udp-tunner-docker` / `docker-udp-tunnel` 作为仓库或项目名称。为避免后续继续混淆，现统一按底层核心项目 `udp2raw` 命名为：

- Docker 项目：`docker-app-udp2raw`
- LuCI 插件：`luci-app-udp2raw`
- 核心后端：`udp2raw`

## 常用命令

```bash
# 查看容器日志
docker logs -f docker-app-udp2raw

# 查看应用日志
tail -f ./logs/udp2raw-manager.log
tail -f ./logs/udp2raw.log
```

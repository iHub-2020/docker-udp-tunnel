# ----------------------------------------------------------------------
# File: app/process_manager.py
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.0.0
# Description: Manages udp2raw subprocesses based on configuration
# ----------------------------------------------------------------------
import subprocess
import logging
import shlex
import time
import psutil

class ProcessManager:
    def __init__(self):
        self.processes = {}  # 存储进程对象: {id: subprocess.Popen}
        self.logger = logging.getLogger("ProcessManager")
        self.binary_path = "/usr/bin/udp2raw"

    def stop_all(self):
        """停止所有运行中的 udp2raw 进程"""
        self.logger.info("Stopping all tunnels...")
        for pid, proc in self.processes.items():
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
        self.processes = {}

    def start_from_config(self, config):
        """根据配置启动所有隧道"""
        self.stop_all() # 先清理旧进程

        if not config.get("global", {}).get("enabled", False):
            self.logger.info("Service is globally disabled.")
            return

        # 启动服务端实例
        for idx, server in enumerate(config.get("servers", [])):
            if server.get("enabled"):
                self._start_instance("server", idx, server)

        # 启动客户端实例
        for idx, client in enumerate(config.get("clients", [])):
            if client.get("enabled"):
                self._start_instance("client", idx, client)

    def _start_instance(self, mode, idx, cfg):
        """启动单个实例"""
        cmd = [self.binary_path]

        # 模式选择 (-s or -c)
        if mode == "server":
            cmd.append("-s")
            # Server: Listen on WAN (-l), Forward to Local (-r)
            cmd.extend(["-l", f"{cfg.get('listen_addr', '0.0.0.0')}:{cfg.get('listen_port')}"])
            cmd.extend(["-r", f"{cfg.get('forward_ip', '127.0.0.1')}:{cfg.get('forward_port')}"])
        else:
            cmd.append("-c")
            # Client: Listen on Local (-l), Forward to Remote (-r)
            cmd.extend(["-l", f"{cfg.get('local_addr', '127.0.0.1')}:{cfg.get('local_port')}"])
            cmd.extend(["-r", f"{cfg.get('server_ip')}:{cfg.get('server_port')}"])

        # 通用参数
        cmd.extend(["-k", str(cfg.get("password", "passwd"))])
        
        if cfg.get("raw_mode"):
            cmd.extend(["--raw-mode", cfg.get("raw_mode")])
        
        if cfg.get("cipher_mode"):
            cmd.extend(["--cipher-mode", cfg.get("cipher_mode")])
            
        if cfg.get("auth_mode"):
            cmd.extend(["--auth-mode", cfg.get("auth_mode")])

        # 自动添加 iptables 规则 (-a)
        if cfg.get("auto_rule", True):
            cmd.append("-a")

        # 高级参数
        if cfg.get("source_ip"):
            cmd.extend(["--source-ip", cfg.get("source_ip")])
            
        if cfg.get("source_port"):
            cmd.extend(["--source-port", str(cfg.get("source_port"))])
            
        if cfg.get("seq_mode"):
             cmd.extend(["--seq-mode", str(cfg.get("seq_mode"))])
             
        if cfg.get("extra_args"):
            # 安全地分割额外参数字符串
            cmd.extend(shlex.split(cfg.get("extra_args")))

        # 启动进程
        try:
            self.logger.info(f"Starting {mode} #{idx}: {' '.join(cmd)}")
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            self.processes[f"{mode}_{idx}"] = proc
        except Exception as e:
            self.logger.error(f"Failed to start {mode} #{idx}: {e}")

    def get_status(self):
        """获取当前运行状态"""
        status_list = []
        for key, proc in self.processes.items():
            is_running = proc.poll() is None
            status_list.append({
                "id": key,
                "running": is_running,
                "pid": proc.pid if is_running else None
            })

        return status_list

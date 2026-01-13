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
import os

logger = logging.getLogger(__name__)

class ProcessManager:
    def __init__(self):
        self.processes = {}  # 存储子进程对象

    def stop_all(self):
        """停止所有隧道进程"""
        logger.info("Stopping all tunnels...")
        for pid, proc in self.processes.items():
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
        self.processes = {}
        # 清理可能残留的 iptables 规则 (如果非 docker host 模式可能需要)
        # os.system("iptables -F") 

    def start_tunnels(self, config):
        """根据配置启动隧道"""
        self.stop_all()

        if not config.get('global', {}).get('enabled', False):
            logger.info("Service is globally disabled.")
            return

        global_conf = config.get('global', {})
        
        # 1. 启动 Servers
        for idx, server in enumerate(config.get('servers', [])):
            if server.get('enabled'):
                self._start_instance('server', server, global_conf, idx)

        # 2. 启动 Clients
        for idx, client in enumerate(config.get('clients', [])):
            if client.get('enabled'):
                self._start_instance('client', client, global_conf, idx)

    def _start_instance(self, mode, instance_conf, global_conf, index):
        """构建并执行 udp2raw 命令"""
        cmd = ["udp2raw"]

        # 模式选择
        if mode == 'server':
            cmd.append("-s")
            # 服务端监听地址
            listen_addr = instance_conf.get('listen_ip', '0.0.0.0')
            listen_port = instance_conf.get('listen_port', 29900)
            cmd.append(f"-l{listen_addr}:{listen_port}")
            
            # 服务端转发目标
            forward_ip = instance_conf.get('forward_ip', '127.0.0.1')
            forward_port = instance_conf.get('forward_port', 51820)
            cmd.append(f"-r{forward_ip}:{forward_port}")
            
        else:
            cmd.append("-c")
            # 客户端监听本地
            local_ip = instance_conf.get('local_ip', '127.0.0.1')
            local_port = instance_conf.get('local_port', 3333)
            cmd.append(f"-l{local_ip}:{local_port}")
            
            # 客户端连接远程
            remote_ip = instance_conf.get('server_ip', '127.0.0.1')
            remote_port = instance_conf.get('server_port', 29900)
            cmd.append(f"-r{remote_ip}:{remote_port}")

        # --- 通用核心参数 (补全缺失参数) ---
        
        # 密码
        cmd.append(f"-k{instance_conf.get('password', 'secret')}")
        
        # Raw Mode (faketcp, udp, icmp)
        raw_mode = instance_conf.get('raw_mode', 'faketcp')
        cmd.append(f"--raw-mode={raw_mode}")
        
        # Cipher Mode (xor, aes128cbc, none)
        cipher_mode = instance_conf.get('cipher_mode', 'aes128cbc')
        cmd.append(f"--cipher-mode={cipher_mode}")
        
        # Auth Mode (md5, hmac_sha1, simple, none)
        auth_mode = instance_conf.get('auth_mode', 'hmac_sha1')
        cmd.append(f"--auth-mode={auth_mode}")
        
        # 自动添加 iptables (-a)
        if instance_conf.get('auto_rule', True):
            cmd.append("-a")
            
        # --- 高级参数 ---
        
        # Seq Mode (模拟 TCP 序列号行为)
        if 'seq_mode' in instance_conf:
            cmd.append(f"--seq-mode={instance_conf['seq_mode']}")
            
        # Source IP (伪造源 IP)
        if 'source_ip' in instance_conf and instance_conf['source_ip']:
            cmd.append(f"--source-ip={instance_conf['source_ip']}")
            
        # Log Level
        log_level = instance_conf.get('log_level', global_conf.get('log_level', 'info'))
        level_map = {'fatal': 1, 'error': 2, 'warn': 3, 'info': 4, 'debug': 5, 'trace': 6}
        cmd.append(f"--log-level={level_map.get(log_level, 4)}")

        # Extra Arguments (用户自定义参数)
        if instance_conf.get('extra_args'):
            cmd.extend(shlex.split(instance_conf['extra_args']))

        # 启动进程
        logger.info(f"Starting {mode} #{index+1}: {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            self.processes[f"{mode}_{index}"] = proc
        except Exception as e:
            logger.error(f"Failed to start {mode} #{index+1}: {e}")

    def get_status(self):
        """获取当前运行状态"""
        status_list = []
        for key, proc in self.processes.items():
            is_running = proc.poll() is None
            status_list.append({
                'id': key,
                'running': is_running,
                'pid': proc.pid if is_running else None
            })
        return status_list

# ----------------------------------------------------------------------
# File: app/process_manager.py
# Author: iHub-2020
# Date: 2026-01-13
# Version: 1.7.0
# Description: Manages udp2raw subprocesses based on configuration
# Updated: 
#   - Added persistent log file support (/app/logs/udp2raw.log)
#   - Kept memory buffer for quick access
#   - Fixed permission handling for mounted volumes
#   - Fixed: Changed --option=value to --option value format for udp2raw compatibility
#   - Added: Auto cleanup of residual iptables rules on stop_all()
#   - Fixed: iptables cleanup now uses line-number based deletion for reliability
# ----------------------------------------------------------------------
import subprocess
import logging
import shlex
import os
import sys
import threading
import fcntl
import errno
import re
from collections import deque
from datetime import datetime

logger = logging.getLogger("ProcessManager")


class ProcessManager:
    def __init__(self):
        self.processes = {}
        self.bin_path = "/usr/local/bin/udp2raw"
        self.log_buffer = deque(maxlen=500)
        self.log_lock = threading.Lock()
        self.log_threads = []
        self._stop_event = threading.Event()
        
        # 日志文件路径
        self.log_file_path = "/app/logs/udp2raw.log"
        self._init_log_file()

    def _init_log_file(self):
        """初始化日志文件，确保可写"""
        try:
            log_dir = os.path.dirname(self.log_file_path)
            if not os.path.exists(log_dir):
                os.makedirs(log_dir, mode=0o755, exist_ok=True)
            
            # 尝试创建/打开文件
            if not os.path.exists(self.log_file_path):
                with open(self.log_file_path, 'w') as f:
                    f.write("")
            
            # 测试写入
            with open(self.log_file_path, 'a') as f:
                f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [System] Process Manager initialized\n")
            
            logger.info(f"Log file initialized: {self.log_file_path}")
        except Exception as e:
            logger.error(f"Failed to initialize log file: {e}")
            # 回退到 /tmp
            self.log_file_path = "/tmp/udp2raw.log"
            logger.warning(f"Falling back to: {self.log_file_path}")
            try:
                with open(self.log_file_path, 'w') as f:
                    f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [System] Process Manager initialized (fallback)\n")
            except:
                pass

    def _set_non_blocking(self, fd):
        """将文件描述符设置为非阻塞模式"""
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

    def _log_reader(self, proc, alias):
        """异步读取进程输出并存入缓冲区 - 使用非阻塞 I/O"""
        try:
            # 获取 stdout 的文件描述符并设置非阻塞
            fd = proc.stdout.fileno()
            self._set_non_blocking(fd)
            
            buffer = ""
            
            while not self._stop_event.is_set():
                # 检查进程是否已退出
                if proc.poll() is not None:
                    # 读取剩余数据
                    try:
                        remaining = os.read(fd, 65536)
                        if remaining:
                            buffer += remaining.decode('utf-8', errors='replace')
                    except (OSError, IOError):
                        pass
                    
                    # 处理剩余 buffer
                    if buffer:
                        for line in buffer.strip().split('\n'):
                            if line.strip():
                                self._add_log(alias, line.strip())
                    
                    self._add_log(alias, f"Process exited with code {proc.returncode}")
                    break
                
                # 尝试非阻塞读取
                try:
                    data = os.read(fd, 4096)
                    if data:
                        buffer += data.decode('utf-8', errors='replace')
                        
                        # 按行处理
                        while '\n' in buffer:
                            line, buffer = buffer.split('\n', 1)
                            if line.strip():
                                self._add_log(alias, line.strip())
                    else:
                        # EOF
                        break
                        
                except OSError as e:
                    if e.errno == errno.EAGAIN or e.errno == errno.EWOULDBLOCK:
                        # 没有数据可读，等待一下再试
                        self._stop_event.wait(0.2)
                    else:
                        raise
                        
        except Exception as e:
            logger.error(f"Error reading from {alias}: {e}")
            self._add_log(alias, f"Log reader error: {e}")

    def _add_log(self, alias, message):
        """添加日志到缓冲区和文件"""
        if message:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            log_line = f"[{timestamp}] [{alias}] {message}"
            
            # 添加到内存缓冲区
            with self.log_lock:
                self.log_buffer.append(log_line)
            
            # 写入到文件
            try:
                with open(self.log_file_path, 'a', encoding='utf-8') as f:
                    f.write(log_line + '\n')
                    f.flush()
            except Exception as e:
                logger.error(f"Failed to write log to file: {e}")
            
            # 同时输出到 Python 日志，方便 Portainer 查看
            logger.info(f"[{alias}] {message}")

    def get_logs(self, lines=50):
        """获取最近的日志（优先从文件读取）"""
        # 尝试从文件读取
        if os.path.exists(self.log_file_path):
            try:
                with open(self.log_file_path, 'r', encoding='utf-8', errors='replace') as f:
                    all_lines = f.readlines()
                if all_lines:
                    return [line.strip() for line in all_lines[-lines:] if line.strip()]
            except Exception as e:
                logger.error(f"Failed to read log file: {e}")
        
        # 回退到内存缓冲区
        with self.log_lock:
            log_list = list(self.log_buffer)
        return log_list[-lines:] if len(log_list) > lines else log_list

    def clear_logs(self):
        """清空日志缓冲区和文件"""
        with self.log_lock:
            self.log_buffer.clear()
        
        # 清空文件
        try:
            with open(self.log_file_path, 'w') as f:
                pass
            self._add_log("System", "Logs cleared")
        except Exception as e:
            logger.error(f"Failed to clear log file: {e}")

    def _cleanup_iptables(self):
        """清理 udp2raw 残留的 iptables 规则（使用行号删除法）"""
        try:
            # 第一步：从 INPUT 链删除所有 udp2raw 相关规则（按行号）
            deleted_rules = 0
            max_iterations = 100  # 防止无限循环
            
            for _ in range(max_iterations):
                # 获取带行号的 INPUT 链规则
                result = subprocess.run(
                    ['iptables', '-L', 'INPUT', '-n', '--line-numbers'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                # 查找第一条 udp2raw 规则的行号
                rule_num = None
                for line in result.stdout.split('\n'):
                    if 'udp2rawDwrW' in line:
                        match = re.match(r'^(\d+)', line.strip())
                        if match:
                            rule_num = match.group(1)
                            break
                
                if rule_num is None:
                    break  # 没有更多规则了
                
                # 删除该行号的规则
                del_result = subprocess.run(
                    ['iptables', '-D', 'INPUT', rule_num],
                    capture_output=True,
                    timeout=5
                )
                
                if del_result.returncode == 0:
                    deleted_rules += 1
                else:
                    break  # 删除失败，退出
            
            # 第二步：获取所有 udp2raw 链并删除
            result = subprocess.run(
                ['iptables', '-L', '-n'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            # 查找所有 udp2rawDwrW 链
            chains = re.findall(r'Chain (udp2rawDwrW_\w+)', result.stdout)
            chains = list(set(chains))  # 去重
            
            deleted_chains = 0
            for chain in chains:
                try:
                    # 清空链
                    subprocess.run(
                        ['iptables', '-F', chain],
                        capture_output=True,
                        timeout=5
                    )
                    
                    # 删除链
                    del_result = subprocess.run(
                        ['iptables', '-X', chain],
                        capture_output=True,
                        timeout=5
                    )
                    
                    if del_result.returncode == 0:
                        deleted_chains += 1
                        
                except Exception as e:
                    logger.debug(f"Could not remove chain {chain}: {e}")
            
            if deleted_rules > 0 or deleted_chains > 0:
                logger.info(f"Cleaned {deleted_rules} rules and {deleted_chains} chains")
                self._add_log("System", f"Cleaned {deleted_rules} rules, {deleted_chains} chains")
            else:
                logger.info("No udp2raw iptables rules to clean")
            
        except Exception as e:
            logger.warning(f"Failed to cleanup iptables: {e}")
            self._add_log("System", f"iptables cleanup warning: {e}")

    def stop_all(self):
        """停止所有隧道进程"""
        logger.info("Stopping all tunnels...")
        self._stop_event.set()
        
        pids = list(self.processes.keys())
        for key in pids:
            proc = self.processes[key]
            if proc.poll() is None:
                logger.info(f"Terminating {key} (PID: {proc.pid})")
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    logger.warning(f"Force killing {key}")
                    proc.kill()
                    proc.wait(timeout=1)
        
        self.processes = {}
        
        # 清理 iptables 残留规则
        self._cleanup_iptables()
        
        # 等待日志线程结束
        for t in self.log_threads:
            t.join(timeout=2)
        self.log_threads = []
        self._stop_event.clear()

    def start_tunnels(self, config):
        """根据配置启动隧道"""
        self.stop_all()
        self._add_log("System", "Applying configuration...")

        if not config.get('global', {}).get('enabled', False):
            logger.info("Service is globally disabled.")
            self._add_log("System", "Service is globally disabled")
            return

        global_conf = config.get('global', {})
        
        for idx, server in enumerate(config.get('servers', [])):
            if server.get('enabled'):
                self._start_instance('server', server, global_conf, idx)

        for idx, client in enumerate(config.get('clients', [])):
            if client.get('enabled'):
                self._start_instance('client', client, global_conf, idx)

    def _start_instance(self, mode, instance_conf, global_conf, index):
        """构建并执行 udp2raw 命令"""
        if not os.path.exists(self.bin_path):
            error_msg = f"udp2raw binary not found at {self.bin_path}"
            logger.error(error_msg)
            self._add_log("System", error_msg)
            return

        cmd = [self.bin_path]

        if mode == 'server':
            cmd.append("-s")
            listen_addr = instance_conf.get('listen_ip', '0.0.0.0')
            listen_port = instance_conf.get('listen_port', 29900)
            cmd.extend(["-l", f"{listen_addr}:{listen_port}"])
            
            forward_ip = instance_conf.get('forward_ip', '127.0.0.1')
            forward_port = instance_conf.get('forward_port', 51820)
            cmd.extend(["-r", f"{forward_ip}:{forward_port}"])
        else:
            cmd.append("-c")
            local_ip = instance_conf.get('local_ip', '127.0.0.1')
            local_port = instance_conf.get('local_port', 3333)
            cmd.extend(["-l", f"{local_ip}:{local_port}"])
            
            remote_ip = instance_conf.get('server_ip', '127.0.0.1')
            remote_port = instance_conf.get('server_port', 29900)
            cmd.extend(["-r", f"{remote_ip}:{remote_port}"])

        cmd.extend(["-k", instance_conf.get('password', 'secret')])
        
        # 使用空格分隔而不是等号 (udp2raw 要求)
        raw_mode = instance_conf.get('raw_mode', 'faketcp')
        cmd.extend(["--raw-mode", raw_mode])
        
        cipher_mode = instance_conf.get('cipher_mode', 'xor')
        cmd.extend(["--cipher-mode", cipher_mode])
        
        auth_mode = instance_conf.get('auth_mode', 'simple')
        cmd.extend(["--auth-mode", auth_mode])
        
        if instance_conf.get('auto_iptables', True):
            cmd.append("-a")
            
        if mode == 'client':
            if instance_conf.get('source_ip'):
                cmd.extend(["--source-ip", instance_conf['source_ip']])
            if instance_conf.get('source_port'):
                cmd.extend(["--source-port", str(instance_conf['source_port'])])
            seq_mode = instance_conf.get('seq_mode', 3)
            if seq_mode is not None:
                cmd.extend(["--seq-mode", str(seq_mode)])

        if global_conf.get('wait_lock', True):
            cmd.append("--wait-lock")
            
        log_level = global_conf.get('log_level', 'info')
        level_map = {'fatal': 0, 'error': 1, 'warn': 2, 'info': 3, 'debug': 4, 'trace': 5}
        cmd.extend(["--log-level", str(level_map.get(log_level, 3))])

        # 额外参数
        if instance_conf.get('extra_args'):
            cmd.extend(shlex.split(instance_conf['extra_args']))

        alias = instance_conf.get('alias', f'{mode}_{index}')
        cmd_str = ' '.join(cmd)
        logger.info(f"Starting {mode} [{alias}]: {cmd_str}")
        self._add_log(alias, f"Starting: {cmd_str}")
        
        try:
            # 使用二进制模式，手动处理非阻塞 I/O
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=0,  # 无缓冲
            )
            
            key = f"{mode}_{index}"
            self.processes[key] = proc
            logger.info(f"Started {mode} [{alias}] with PID: {proc.pid}")
            self._add_log(alias, f"Started with PID: {proc.pid}")
            
            # 启动日志读取线程
            log_thread = threading.Thread(
                target=self._log_reader,
                args=(proc, alias),
                daemon=True,
                name=f"log_reader_{alias}"
            )
            log_thread.start()
            self.log_threads.append(log_thread)
            
        except Exception as e:
            error_msg = f"Failed to start: {e}"
            logger.error(f"Failed to start {mode} [{alias}]: {e}")
            self._add_log(alias, error_msg)

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
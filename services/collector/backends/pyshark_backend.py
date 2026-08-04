"""FF 业务流量采集器 - Pyshark 主后端

底层调用 Wireshark 的 TShark，与 Wireshark GUI 共享同一套抓包引擎。
实现说明：通过 Wireshark/TShark 的 library 接口与编程语言联动。
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

import pyshark
from pyshark.tshark import tshark as _tshark


class PysharkCapture:
    """基于 Pyshark (TShark) 的业务流量采集器。

    用法:
        cap = PysharkCapture(iface="WLAN")
        pcap_path = cap.capture(count=500)
    """

    def __init__(self, iface: Optional[str] = None):
        """
        Args:
            iface: 网卡友好名称或关键词（如 'WLAN'、'以太网'）。
                   为 None 时自动选择第一个非环回网卡。
        """
        self.iface = iface

    @staticmethod
    def _resolve_iface(hint: Optional[str] = None) -> str:
        """解析网卡名称。支持友好名称关键词模糊匹配。"""
        # get_all_tshark_interfaces_names 返回交替的 [设备名, 友好名称, ...]
        all_names = _tshark.get_all_tshark_interfaces_names()
        if not all_names:
            raise RuntimeError("未找到任何可用网卡，请检查 Npcap 是否已安装")

        # 构建友好名称列表（偶数索引 = 设备名，奇数索引 = 友好名称）
        friendly_map = {}
        for i in range(0, len(all_names), 2):
            if i + 1 < len(all_names):
                friendly_map[all_names[i + 1]] = all_names[i]

        if hint is None:
            # 跳过环回和远程，选第一个真实物理网卡
            for friendly, device in friendly_map.items():
                fl = friendly.lower()
                if "loopback" not in fl and "cisco" not in fl and "ssh" not in fl \
                        and "udp" not in fl and "wifi" not in fl and "remote" not in fl:
                    # 优先排除虚拟网卡
                    if "vether" not in fl and "hyper-v" not in fl and "default switch" not in fl \
                            and "本地连接*" not in friendly and "蓝牙" not in fl:
                        return device
            # 回退：选第一个非环回的
            for friendly, device in friendly_map.items():
                if "loopback" not in friendly.lower():
                    return device
            return list(friendly_map.values())[0]

        hint_lower = hint.lower()
        # 先在友好名称中找
        for friendly, device in friendly_map.items():
            if hint_lower in friendly.lower():
                return device
        # 再在设备名中找
        raw_ifaces = _tshark.get_tshark_interfaces()
        for iface in raw_ifaces:
            if hint_lower in iface.lower():
                return iface

        raise RuntimeError(
            f"未找到匹配网卡 '{hint}'，可用: "
            + ", ".join([n for n in friendly_map if "loopback" not in n.lower()][:10])
        )

    @staticmethod
    def _require_tshark():
        """确保 tshark 可执行（新版 pyshark 用 get_process_path 而非 get_tshark_path）。"""
        try:
            path = _tshark.get_process_path()
            if path:
                return
        except Exception:
            pass
        # 手动搜索常见安装路径
        candidates = [
            r"C:\Program Files\Wireshark\tshark.exe",
            r"C:\Wireshark\tshark.exe",
            os.path.expanduser(r"~\AppData\Local\Programs\Wireshark\tshark.exe"),
        ]
        for path in candidates:
            if os.path.exists(path):
                os.environ["PATH"] = os.path.dirname(path) + os.pathsep + os.environ.get("PATH", "")
                return
        raise RuntimeError(
            "TShark (Wireshark 命令行工具) 未找到。\n"
            "请安装 Wireshark: https://www.wireshark.org/download.html\n"
            "安装时勾选 'Install TShark'。\n"
            "或手动将 tshark.exe 所在目录加入 PATH 环境变量。"
        )

    def capture(self, count: int = 500, timeout: int = 30,
                output_path: Optional[str] = None) -> str:
        """执行实时抓包。

        Args:
            count: 抓取包数（默认 500）。
            timeout: 超时秒数。
            output_path: PCAP 输出路径，默认自动生成临时文件。

        Returns:
            PCAP 文件的绝对路径。
        """
        self._require_tshark()
        iface = self._resolve_iface(self.iface)
        out = Path(output_path) if output_path else Path(tempfile.mktemp(suffix=".pcap"))

        print(f"[Wireshark库] 开始抓包  网卡={self.iface or 'auto'}  数量={count}  超时={timeout}s")
        print(f"[Wireshark库] 底层命令: tshark -i {iface} -w {out} -c {count}")

        capture = pyshark.LiveCapture(
            interface=iface,
            output_file=str(out),
            bpf_filter=None,
            use_json=True,
            include_raw=True,
        )
        capture.sniff(packet_count=count, timeout=timeout)
        capture.close()

        actual = out.stat().st_size if out.exists() else 0
        print(f"[Wireshark库] 抓包完成  文件大小={actual/1024:.1f}KB  -> {out}")
        return str(out)

    def list_interfaces(self) -> list[str]:
        """列出可用网卡友好名称。"""
        all_names = _tshark.get_all_tshark_interfaces_names()
        friendly = [all_names[i + 1] for i in range(0, len(all_names), 2) if i + 1 < len(all_names)]
        return friendly

    def __repr__(self) -> str:
        return f"PysharkCapture(iface={self.iface!r})"

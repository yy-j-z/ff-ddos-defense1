"""Scapy 实时抓包后端。

直接用 scapy.sniff() 抓取实时流量，零额外依赖（Npcap/WinPcap 已在底层）。
这就是「Wireshark library 联动」在代码层面的实现——Scapy 底层调的就是 libpcap/Npcap，
与 Wireshark/TShark 共享同一套抓包引擎。
"""

from __future__ import annotations

import tempfile
import time
from pathlib import Path
from typing import Optional

from scapy.all import sniff, wrpcap  # type: ignore
from scapy.packet import Packet  # type: ignore


class ScapyLiveCapture:
    """基于 Scapy 的实时流量采集器。"""

    def __init__(self, iface: Optional[str] = None, count: int = 200, timeout: int = 30):
        """
        Args:
            iface: 网卡名称或描述关键词（如 'Wi-Fi'、'Realtek*'）。为 None 则用默认网卡。
            count: 抓取包数。
            timeout: 超时秒数。
        """
        self.iface = iface
        self.count = count
        self.timeout = timeout

    def capture(self, output_path: Optional[str] = None) -> str:
        """执行抓包，返回 PCAP 文件路径。"""
        if output_path:
            out = Path(output_path)
        else:
            out = Path(tempfile.mktemp(suffix=".pcap"))

        print(f"[collector] 开始抓包  iface={self.iface or 'default'}  count={self.count}  timeout={self.timeout}s")

        packets: list[Packet] = sniff(
            iface=self.iface,
            count=self.count,
            timeout=self.timeout,
            store=True,
        )

        wrpcap(str(out), packets)
        print(f"[collector] 抓包完成  packets={len(packets)}  -> {out}")
        return str(out)

    def __repr__(self) -> str:
        return f"ScapyLiveCapture(iface={self.iface!r}, count={self.count})"

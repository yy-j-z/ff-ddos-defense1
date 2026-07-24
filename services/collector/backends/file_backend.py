"""文件加载后端——直接从已有 PCAP 文件加载，不进行实时抓包。

用于：预置样本、历史数据、公开数据集（如 CIC-IDS2017）的重放分析。
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional


class FileCapture:
    """从已有 PCAP 文件加载。"""

    def __init__(self, path: str):
        """
        Args:
            path: PCAP 文件路径（也可以是目录，自动找 .pcap 文件）。
        """
        self.source = Path(path)

    def capture(self, output_path: Optional[str] = None) -> str:
        """复制或返回 PCAP 文件路径。"""
        if self.source.is_dir():
            # 目录模式：找第一个 .pcap
            pcaps = sorted(self.source.glob("*.pcap"))
            if not pcaps:
                raise FileNotFoundError(f"目录 {self.source} 中没有 .pcap 文件")
            src = pcaps[0]
            print(f"[collector-file] 从目录选择: {src}")
        else:
            src = self.source

        if not src.exists():
            raise FileNotFoundError(f"PCAP 文件不存在: {src}")

        if output_path and output_path != str(src):
            out = Path(output_path)
            shutil.copy2(str(src), str(out))
            print(f"[collector-file] 复制: {src} -> {out}")
            return str(out)

        print(f"[collector-file] 使用: {src}")
        return str(src)

    def __repr__(self) -> str:
        return f"FileCapture(path={self.source!r})"

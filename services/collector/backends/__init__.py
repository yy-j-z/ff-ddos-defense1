"""采集后端注册。

主后端: pyshark (Wireshark 的 Python 库，需安装 Wireshark/TShark)
备用后端: live (Scapy，零依赖)
文件后端: file (加载已有 PCAP)
"""

from .pyshark_backend import PysharkCapture
from .scapy_backend import ScapyLiveCapture
from .file_backend import FileCapture

BACKENDS = {
    "pyshark": PysharkCapture,
    "live": ScapyLiveCapture,
    "file": FileCapture,
}


def get_backend(name: str, **kwargs):
    cls = BACKENDS.get(name)
    if not cls:
        raise ValueError(f"未知后端 '{name}'，可用: {', '.join(BACKENDS)}")
    return cls(**kwargs)

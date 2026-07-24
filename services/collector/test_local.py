"""采集器本地冒烟测试。

验证: file 后端 → 加载已有 PCAP → 送 Analyzer → 出 BusinessProfile
"""

import sys
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent  # services/collector/
PROJECT_ROOT = HERE.parent.parent         # ff-main/
sys.path.insert(0, str(PROJECT_ROOT))

from collector.backends.file_backend import FileCapture


def test_file_backend():
    """用已有样本跑通采集管线。"""
    samples_dir = PROJECT_ROOT / "samples"
    pcap = samples_dir / "ecommerce.pcap"
    assert pcap.exists(), f"样本不存在: {pcap}"

    backend = FileCapture(path=str(pcap))
    result = backend.capture()
    assert result == str(pcap), f"file 后端应直接返回原路径"
    print(f"[OK] FileCapture: {pcap.name}  →  {result}")


def test_analyzer_flow():
    """模拟采集器送 Analyzer 全流程（如果 Analyzer 在运行）。"""
    import requests
    from collector.main import analyze_pcap

    samples_dir = PROJECT_ROOT / "samples"
    pcap = samples_dir / "ecommerce.pcap"

    try:
        profile = analyze_pcap(str(pcap), "http://127.0.0.1:8001")
        print(f"[OK] Analyzer 管线: profile 包含 {len(profile)} 个字段")
        assert "summary" in profile
        assert "protocols" in profile
        assert "topApis" in profile
        print(f"  摘要: {profile['summary']}")
        print(f"  API 数: {len(profile['topApis'])}")
        print(f"  UA 分布: {len(profile['userAgentDistribution'])} 种")
    except requests.ConnectionError:
        print(f"[SKIP] Analyzer 未启动 (http://127.0.0.1:8001)，跳过管线测试")


def test_live_backend():
    """验证 live 后端（scapy）可以初始化但不真正抓包（怕没权限）。"""
    from collector.backends.scapy_backend import ScapyLiveCapture
    backend = ScapyLiveCapture(iface=None, count=5)
    assert backend is not None
    print(f"[OK] ScapyLiveCapture 初始化成功: {backend}")


def test_pyshark_backend():
    """验证 pyshark 后端的初始化逻辑（不执行抓包，仅检查 tshark 检测逻辑）。"""
    from collector.backends.pyshark_backend import PysharkCapture
    try:
        backend = PysharkCapture(iface="Wi-Fi")
        print(f"[OK] PysharkCapture 初始化成功")
    except RuntimeError as e:
        print(f"[INFO] PysharkCapture: {e}")
        print("  若已安装 Wireshark，请将 tshark.exe 所在目录加入 PATH")
        print("  测试环境下此非阻塞性失败可接受")


if __name__ == "__main__":
    print("=" * 50)
    print("FF Collector 冒烟测试")
    print("=" * 50)
    test_file_backend()
    test_live_backend()
    test_pyshark_backend()
    test_analyzer_flow()
    print("\n" + "=" * 50)
    print("冒烟测试完成")
    print("=" * 50)

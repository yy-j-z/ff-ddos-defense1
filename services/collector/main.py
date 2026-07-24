"""FF 业务流量采集器 — 基于 Wireshark 库的自动化抓包管线

Pyshark（Wireshark 的 Python 库）是主后端。
当 TShark 不可用时，自动降级到 Scapy 实时抓包或文件加载模式。
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

from .backends import get_backend

ANALYZER_URL = os.getenv("ANALYZER_URL", "http://127.0.0.1:8001")
COLLECTOR_OUT = os.getenv("COLLECTOR_OUT", "./captures")


def analyze_pcap(pcap_path: str, url: str) -> dict:
    """上传 PCAP 到 Analyzer，返回 BusinessProfile JSON。"""
    with open(pcap_path, "rb") as f:
        resp = requests.post(
            f"{url}/analyze",
            files={"file": (os.path.basename(pcap_path), f, "application/octet-stream")},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.json()


def run_pipeline(backend_name: str, output_name: str | None = None,
                 analyzer_url: str = ANALYZER_URL, out_dir: str = COLLECTOR_OUT,
                 no_analyze: bool = False, **backend_kwargs) -> dict:
    """采集 → 分析 → 保存 全流程。"""
    out_root = Path(out_dir)
    out_root.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    backend = get_backend(backend_name, **backend_kwargs)
    ts = time.strftime("%Y%m%d_%H%M%S")
    name = output_name or f"capture_{ts}"

    pcap_path = backend.capture(
        count=backend_kwargs.get("count", 500),
        timeout=backend_kwargs.get("timeout", 30),
        output_path=str(out_root / f"{name}.pcap")
    )
    t1 = time.time()
    print(f"[管线] 采集完成  耗时={t1 - t0:.1f}s  文件={pcap_path}")

    if no_analyze:
        return {"pcap": pcap_path}

    print(f"[管线] 发送到 Analyzer ({analyzer_url}) ...")
    try:
        profile = analyze_pcap(pcap_path, analyzer_url)
    except requests.ConnectionError:
        print(f"[管线] ⚠ Analyzer 未连接 ({analyzer_url})，跳过分析")
        return {"pcap": pcap_path, "profile": {"status": "skipped"}}

    t2 = time.time()
    print(f"[管线] 分析完成  耗时={t2 - t1:.1f}s")

    json_path = out_root / f"{name}_profile.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    print(f"[管线] 结果已保存 -> {json_path}")

    summary = profile.get("summary", "")
    qps = profile.get("qpsBaseline", {})
    apis = profile.get("topApis", [])
    print(f"\n📊 分析摘要:")
    print(f"   {summary}")
    print(f"   QPS: avg={qps.get('avg')} p99={qps.get('p99')}")
    if apis:
        print(f"   主要接口: {apis[0]['method']} {apis[0]['path']} ({apis[0]['ratio']*100:.0f}%)")

    return {"pcap": pcap_path, "profile": profile}


def main():
    ap = argparse.ArgumentParser(
        description="FF 业务流量采集器 — 基于 Wireshark 库的自动化抓包管线",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
后端选择:
  pyshark       Wireshark 库（默认）— 需安装 Wireshark + 将 tshark 加入 PATH
  live          Scapy 实时抓包      — 零依赖的备用方案
  file          加载已有 PCAP       — 离线分析已有样本

示例:
  # 列出可用网卡
  python -m services.collector.main --list-ifaces

  # 用 Wireshark 库实时抓包并分析（需先装 tshark）
  python -m services.collector.main pyshark --iface "Wi-Fi" --count 500

  # 加载已有样本并分析
  python -m services.collector.main file --path samples/ecommerce.pcap

  # 仅抓包不分析
  python -m services.collector.main pyshark --iface "以太网" --count 200 --no-analyze
        """,
    )
    ap.add_argument("backend", nargs="?", default="pyshark",
                    choices=["pyshark", "live", "file"],
                    help="采集后端 (默认 pyshark = Wireshark 库)")
    ap.add_argument("--iface", help="网卡名称/关键词")
    ap.add_argument("--count", type=int, default=500, help="抓取包数 (默认 500)")
    ap.add_argument("--timeout", type=int, default=30, help="抓包超时秒数")
    ap.add_argument("--path", help="PCAP 文件路径 (file 后端使用)")
    ap.add_argument("--name", help="输出文件名前缀")
    ap.add_argument("--out-dir", default=COLLECTOR_OUT)
    ap.add_argument("--analyzer-url", default=ANALYZER_URL)
    ap.add_argument("--no-analyze", action="store_true", help="仅抓包不分析")
    ap.add_argument("--list-ifaces", action="store_true", help="列出可用网卡后退出")

    args = ap.parse_args()

    if args.list_ifaces:
        from .pyshark_backend import PysharkCapture
        try:
            ifaces = PysharkCapture().list_interfaces()
            print("可用网卡 (Wireshark/TShark):")
            for i, name in enumerate(ifaces, 1):
                print(f"  [{i}] {name}")
        except Exception as e:
            print(f"⚠ 无法列出网卡: {e}")
            print("请先安装 Wireshark (https://www.wireshark.org/download.html)")
            print("并确保 tshark.exe 在 PATH 中。")
        return

    kwargs = {}
    if args.backend in ("pyshark", "live"):
        if args.iface:
            kwargs["iface"] = args.iface
        kwargs["count"] = args.count
        kwargs["timeout"] = args.timeout
    elif args.backend == "file":
        kwargs["path"] = args.path or "./samples/ecommerce.pcap"

    run_pipeline(args.backend, output_name=args.name,
                 analyzer_url=args.analyzer_url, out_dir=args.out_dir,
                 no_analyze=args.no_analyze, **kwargs)


if __name__ == "__main__":
    main()

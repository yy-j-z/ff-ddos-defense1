"""Generate a sample PCAP for local testing.

Run: `python gen_sample.py [output_path]` (default: sample.pcap).
Creates ~10 HTTP GETs to /api/products, 5 POSTs to /api/login, and 2 fake
TLS ClientHello packets. Not invoked at container start; for tests only.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from scapy.all import wrpcap  # type: ignore
from scapy.layers.inet import IP, TCP  # type: ignore
from scapy.packet import Raw  # type: ignore


def _http_req(method: str, path: str, ua: str, src: str, dst: str, sport: int, dport: int = 80) -> bytes:
    body = ""
    if method == "POST":
        body = "user=admin&pass=guess"
    headers = (
        f"{method} {path} HTTP/1.1\r\n"
        f"Host: example.com\r\n"
        f"User-Agent: {ua}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"\r\n{body}"
    )
    return headers.encode()


def build_packets():
    base_t = time.time()
    pkts = []

    uas = [
        "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) Safari/605.1.15",
        "okhttp/4.9.3",
    ]

    sport = 40000
    # 10 GETs
    for i in range(10):
        payload = _http_req("GET", "/api/products", uas[i % len(uas)], "10.0.0.10", "10.0.0.1", sport + i)
        p = IP(src="10.0.0.10", dst="10.0.0.1") / TCP(sport=sport + i, dport=80, flags="PA") / Raw(load=payload)
        p.time = base_t + i * 0.1
        pkts.append(p)

    # 5 POSTs
    for i in range(5):
        payload = _http_req("POST", "/api/login", uas[i % len(uas)], "10.0.0.11", "10.0.0.1", sport + 100 + i)
        p = IP(src="10.0.0.11", dst="10.0.0.1") / TCP(sport=sport + 100 + i, dport=80, flags="PA") / Raw(load=payload)
        p.time = base_t + 1.0 + i * 0.2
        pkts.append(p)

    # 2 fake TLS ClientHello (record header 0x16 0x03 0x01)
    tls_payload = b"\x16\x03\x01\x00\x40" + b"\x01\x00\x00\x3c\x03\x03" + b"\x00" * 58
    for i in range(2):
        p = IP(src="10.0.0.12", dst="10.0.0.1") / TCP(sport=sport + 200 + i, dport=443, flags="PA") / Raw(load=tls_payload)
        p.time = base_t + 2.0 + i * 0.3
        pkts.append(p)

    return pkts


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "sample.pcap"
    pkts = build_packets()
    wrpcap(str(out), pkts)
    print(f"wrote {len(pkts)} packets to {out}")


if __name__ == "__main__":
    main()

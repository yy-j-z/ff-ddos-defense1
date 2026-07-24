"""生成多个演示用 PCAP 文件。

用法: <analyzer venv python> samples/gen_samples.py
为每种业务场景生成一个 .pcap,供 Dashboard「新建 Session」上传演示。
"""
from __future__ import annotations

import random
import time
from pathlib import Path

from scapy.all import wrpcap  # type: ignore
from scapy.layers.inet import IP, TCP, UDP, ICMP  # type: ignore
from scapy.layers.dns import DNS, DNSQR  # type: ignore
from scapy.packet import Raw  # type: ignore

OUT = Path(__file__).parent

# 伪 TLS ClientHello 记录头(0x16=Handshake, 0x0301=TLS1.0 record)
TLS_HELLO = b"\x16\x03\x01\x00\x40\x01\x00\x00\x3c\x03\x03" + bytes(random.getrandbits(8) for _ in range(58))


def http_req(method: str, path: str, host: str, ua: str, body: str = "") -> bytes:
    extra = f"Content-Length: {len(body)}\r\n" if body else ""
    return (
        f"{method} {path} HTTP/1.1\r\n"
        f"Host: {host}\r\n"
        f"User-Agent: {ua}\r\n"
        f"Accept: application/json\r\n"
        f"{extra}\r\n{body}"
    ).encode()


def http_pkt(src: str, dst: str, sport: int, payload: bytes, t: float, dport: int = 80):
    p = IP(src=src, dst=dst) / TCP(sport=sport, dport=dport, flags="PA") / Raw(load=payload)
    p.time = t
    return p


def tls_pkt(src: str, dst: str, sport: int, t: float):
    p = IP(src=src, dst=dst) / TCP(sport=sport, dport=443, flags="PA") / Raw(load=TLS_HELLO)
    p.time = t
    return p


def weighted(items):
    r = random.random()
    acc = 0.0
    for val, w in items:
        acc += w
        if r <= acc:
            return val
    return items[-1][0]


def build_ecommerce():
    """中型电商:移动端 UA 为主,登录/下单/浏览接口集中。"""
    base = time.time()
    pkts = []
    uas = [
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15", 0.42),
        ("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120", 0.28),
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", 0.21),
        ("okhttp/4.9.3", 0.09),
    ]
    apis = [
        ("GET", "/api/product/list", 0.40),
        ("POST", "/api/login", 0.25),
        ("POST", "/api/cart/checkout", 0.20),
        ("GET", "/api/user/profile", 0.15),
    ]
    dst = "10.0.0.1"
    for i in range(220):
        method, path = weighted([((m, p), w) for m, p, w in apis])
        ua = weighted(uas)
        src = f"172.16.{random.randint(0,4)}.{random.randint(2,254)}"
        body = "user=u&pass=p" if method == "POST" else ""
        # 流量随时间起伏(模拟峰谷),时间跨度约 30s
        t = base + (i / 220.0) * 30 + random.uniform(0, 0.05)
        pkts.append(http_pkt(src, dst, 40000 + i, http_req(method, path, "shop.example.com", ua, body), t, dport=443))
        if i % 18 == 0:
            pkts.append(tls_pkt(src, dst, 50000 + i, t - 0.01))
    return pkts


def build_api_gateway():
    """API 网关:服务端调用为主,UA 多为 SDK/curl,接口分散。"""
    base = time.time()
    pkts = []
    uas = [
        ("Java/17.0.2 okhttp", 0.30),
        ("python-requests/2.31.0", 0.25),
        ("Go-http-client/2.0", 0.20),
        ("axios/1.6.2", 0.15),
        ("curl/8.4.0", 0.10),
    ]
    apis = [
        ("GET", "/api/v1/orders", 0.30),
        ("POST", "/api/v1/payments", 0.22),
        ("GET", "/api/v1/inventory", 0.18),
        ("PUT", "/api/v1/orders/status", 0.16),
        ("GET", "/api/v1/health", 0.14),
    ]
    dst = "10.1.0.1"
    for i in range(180):
        method, path = weighted([((m, p), w) for m, p, w in apis])
        ua = weighted(uas)
        src = f"10.8.{random.randint(0,8)}.{random.randint(2,254)}"
        body = '{"k":"v"}' if method in ("POST", "PUT") else ""
        t = base + (i / 180.0) * 25 + random.uniform(0, 0.04)
        pkts.append(http_pkt(src, dst, 41000 + i, http_req(method, path, "api.example.com", ua, body), t, dport=443))
        if i % 12 == 0:
            pkts.append(tls_pkt(src, dst, 51000 + i, t - 0.01))
    return pkts


def build_login_heavy():
    """登录密集:大量 POST /api/login,提示暴力破解攻击面。"""
    base = time.time()
    pkts = []
    uas = [
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119", 0.6),
        ("Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0", 0.4),
    ]
    dst = "10.2.0.1"
    for i in range(160):
        # 90% 打登录接口
        if random.random() < 0.9:
            method, path = "POST", "/api/login"
            body = f"user=admin&pass=try{i}"
        else:
            method, path = "GET", "/api/captcha"
            body = ""
        ua = weighted(uas)
        src = f"203.0.113.{random.randint(2,254)}"
        t = base + (i / 160.0) * 20 + random.uniform(0, 0.03)
        pkts.append(http_pkt(src, dst, 42000 + i, http_req(method, path, "auth.example.com", ua, body), t, dport=443))
    return pkts


def build_mixed_protocol():
    """混合协议:TCP/UDP/ICMP/DNS 混杂,协议占比更分散。"""
    base = time.time()
    pkts = []
    dst = "10.3.0.1"
    for i in range(150):
        t = base + (i / 150.0) * 30 + random.uniform(0, 0.05)
        src = f"192.168.{random.randint(0,3)}.{random.randint(2,254)}"
        r = random.random()
        if r < 0.55:  # TCP HTTP
            payload = http_req("GET", "/", "Mozilla/5.0", "svc.example.com", "")
            pkts.append(http_pkt(src, dst, 43000 + i, payload, t))
        elif r < 0.78:  # UDP
            p = IP(src=src, dst=dst) / UDP(sport=44000 + i, dport=5000) / Raw(load=b"\x00" * 32)
            p.time = t
            pkts.append(p)
        elif r < 0.90:  # DNS query
            p = IP(src=src, dst="8.8.8.8") / UDP(sport=45000 + i, dport=53) / DNS(rd=1, qd=DNSQR(qname="example.com"))
            p.time = t
            pkts.append(p)
        else:  # ICMP
            p = IP(src=src, dst=dst) / ICMP()
            p.time = t
            pkts.append(p)
    return pkts


def main():
    scenarios = {
        "ecommerce.pcap": build_ecommerce,
        "api-gateway.pcap": build_api_gateway,
        "login-heavy.pcap": build_login_heavy,
        "mixed-protocol.pcap": build_mixed_protocol,
    }
    for name, fn in scenarios.items():
        pkts = fn()
        out = OUT / name
        wrpcap(str(out), pkts)
        print(f"wrote {len(pkts):>4} packets -> {out}")


if __name__ == "__main__":
    main()

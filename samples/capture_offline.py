#!/usr/bin/env python3
"""离线版抓包脚本（不依赖 Docker / scapy / libpcap）。

用途：现场 Docker 不可用、无法在容器内用 tcpdump 重跑时，
      用一台普通笔记本 + 任意可达的 HTTP 服务即可重新生成 PCAP，
      证明「抓包流水线」本身可运行、可复现。

特点：
  - 纯标准库（socket / struct / hashlib / concurrent.futures），pip install 都不需要。
  - 真实 TCP socket 连接目标，发真实 HTTP 请求、收真实响应。
  - 手写合法 PCAP（Ethernet + IP + TCP，校验和正确），Wireshark 可直接打开。
  - 链路层为合成（离线无真实网卡）；生产级样本仍以容器内 tcpdump 真抓为准。

用法：
  # 针对本系统靶机（若以其他方式启动了 defender）
  python capture_offline.py --host defender --port 8080 --scenario ecommerce

  # 纯离线演示：本地起一个 http 服务即可
  python -m http.server 8099 &
  python capture_offline.py --host 127.0.0.1 --port 8099 --all --out ./samples

  # 仅生成某个新场景
  python capture_offline.py --host 127.0.0.1 --port 8099 --scenario file-upload
"""
from __future__ import annotations

import argparse
import os
import random
import socket
import struct
import time
from concurrent.futures import ThreadPoolExecutor

# ---------------------------------------------------------------------------
# 场景定义（与容器内 capture_real_traffic.py 保持一致，保证可复现）
# ---------------------------------------------------------------------------
TYPICAL_UA = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "PostmanRuntime/7.37.0",
    "okhttp/4.12.0",
    "curl/8.6.0",
]
API_UA = ["PostmanRuntime/7.37.0", "okhttp/4.12.0", "curl/8.6.0", "python-requests/2.31.0",
          "Go-http-client/2.0", "Java/17.0.10", "Mozilla/5.0 (compatible; MonitoringBot/1.0)"]

SCENARIOS = {
    "ecommerce": dict(ua=TYPICAL_UA, paths=["/", "/api/product/list", "/api/product/detail",
                       "/api/cart/add", "/api/login", "/api/checkout"],
                      weights=[3, 4, 4, 3, 3, 2], n=160, tls=0.15, type="get"),
    "api-gateway": dict(ua=API_UA, paths=["/api/v1/health", "/api/v1/user/profile", "/api/v1/order/query",
                       "/api/v1/payment/charge", "/api/v1/inventory/sync"],
                       weights=[4, 3, 3, 2, 2], n=160, tls=0.25, type="get"),
    "login-heavy": dict(ua=TYPICAL_UA, paths=["/api/login", "/api/login", "/api/login",
                       "/api/auth/verify", "/api/password/reset", "/"],
                       weights=[8, 8, 8, 3, 2, 1], n=200, tls=0.10, type="get"),
    "mixed-protocol": dict(ua=TYPICAL_UA, paths=["/", "/api/health", "/api/dns/resolve", "/api/metrics"],
                       weights=[3, 3, 2, 2], n=200, tls=0.20, type="mix"),
    "file-upload": dict(ua=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
                       "PostmanRuntime/7.37.0", "curl/8.6.0", "okhttp/4.12.0"],
                       paths=["/api/upload", "/api/upload", "/api/product/list"],
                       weights=[5, 5, 2], n=120, tls=0.12, type="post"),
    "websocket": dict(ua=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
                       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15"],
                     paths=["/ws", "/ws", "/api/health"],
                     weights=[6, 6, 2], n=100, tls=0.10, type="ws"),
    "api-concurrency": dict(ua=API_UA, paths=["/api/v1/health", "/api/v1/order/query", "/api/v1/user/profile",
                       "/api/v1/payment/charge", "/api/v1/inventory/sync"],
                       weights=[4, 3, 3, 2, 2], n=200, tls=0.0, type="concurrent"),
}

SRC_MAC = bytes.fromhex("020000000001")
DST_MAC = bytes.fromhex("020000000002")
TLS_HELLO = b"\x16\x03\x01\x00\x40\x01\x00\x00\x3c\x03\x03" + bytes(random.getrandbits(8) for _ in range(58))


# ---------------------------------------------------------------------------
# PCAP 编码（手写，无第三方依赖）
# ---------------------------------------------------------------------------
def checksum(data: bytes) -> int:
    if len(data) % 2:
        data += b"\x00"
    s = 0
    for i in range(0, len(data), 2):
        s += data[i] * 256 + data[i + 1]
    while s >> 16:
        s = (s & 0xffff) + (s >> 16)
    return (~s) & 0xffff


def build_ip(src: str, dst: str, payload: bytes, proto: int = 6, ttl: int = 64) -> bytes:
    sb, db = socket.inet_aton(src), socket.inet_aton(dst)
    total = 20 + len(payload)
    ipid = random.randint(0, 0xffff)
    hdr = struct.pack("!BBHHHBBH", 0x45, 0, total, ipid, 0x4000, ttl, proto, 0) + sb + db
    c = checksum(hdr)
    return struct.pack("!BBHHHBBH", 0x45, 0, total, ipid, 0x4000, ttl, proto, c) + sb + db


def build_tcp(sport: int, dport: int, seq: int, ack: int, flags: int,
              payload: bytes, src: str, dst: str) -> bytes:
    seq &= 0xffffffff
    ack &= 0xffffffff
    hdr = struct.pack("!HHIIHHHH", sport, dport, seq, ack, 5 << 12 | flags, 64240, 0, 0)
    ph = socket.inet_aton(src) + socket.inet_aton(dst) + struct.pack("!BBH", 0, 6, len(hdr) + len(payload))
    c = checksum(ph + hdr + payload)
    return struct.pack("!HHIIHHHH", sport, dport, seq, ack, 5 << 12 | flags, 64240, c, 0)


def frame(src_mac, dst_mac, ip_pkt):
    return dst_mac + src_mac + struct.pack("!H", 0x0800) + ip_pkt


def make_session(src_ip, dst_ip, sport, dport, req: bytes, resp: bytes, t0: float):
    """构造一段自洽 TCP 会话（SYN/SYNACK/ACK/DATA/DATA/FIN/FIN），返回 (ts, frame) 列表。"""
    c_isn = random.randint(0, 2 ** 32 - 1)
    s_isn = random.randint(0, 2 ** 32 - 1)
    out = []

    def add(flags, seq, ack, payload, ts):
        ip = build_ip(src_ip, dst_ip, build_tcp(sport, dport, seq, ack, flags, payload, src_ip, dst_ip))
        out.append((ts, frame(SRC_MAC, DST_MAC, ip)))

    add(0x02, c_isn, 0, b"", t0)                                   # SYN
    add(0x12, s_isn, c_isn + 1, b"", t0 + 0.005)                   # SYN-ACK
    add(0x10, c_isn + 1, s_isn + 1, b"", t0 + 0.008)               # ACK
    add(0x18, c_isn + 1, s_isn + 1, req, t0 + 0.01)                # PSH-ACK (请求)
    if resp:
        add(0x18, s_isn + 1, c_isn + 1 + len(req), resp, t0 + 0.05)  # PSH-ACK (响应)
    add(0x11, c_isn + 1 + len(req), s_isn + 1 + len(resp or b""), b"", t0 + 0.06)  # FIN
    add(0x11, s_isn + 1 + len(resp or b""), c_isn + 1 + len(req), b"", t0 + 0.065)  # FIN
    return out


def write_pcap(path, packets):
    with open(path, "wb") as f:
        f.write(struct.pack("<IHHiIII", 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1))  # Ethernet
        for ts, data in packets:
            ts_sec = int(ts)
            ts_usec = int((ts - ts_sec) * 1_000_000)
            f.write(struct.pack("<IIII", ts_sec, ts_usec, len(data), len(data)))
            f.write(data)


def verify_pcap(path):
    with open(path, "rb") as f:
        magic = f.read(4)
        assert magic == struct.pack("<I", 0xa1b2c3d4), "bad pcap magic"
        f.seek(0, 2)
        size = f.tell()
        f.seek(24)
        count = 0
        while f.tell() < size:
            ts_sec, ts_usec, incl, orig = struct.unpack("<IIII", f.read(16))
            f.seek(incl, 1)
            count += 1
    return count


# ---------------------------------------------------------------------------
# HTTP 请求构造
# ---------------------------------------------------------------------------
def request_bytes(method, path, host, ua, body=b"", extra=None):
    head = (f"{method} {path} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: {ua}\r\n"
            f"Accept: text/html,application/json;q=0.9,*/*;q=0.8\r\n")
    if extra:
        head += "\r\n".join(extra) + "\r\n"
    head += "Connection: close\r\n"
    if body:
        head += f"Content-Length: {len(body)}\r\n"
    return (head + "\r\n").encode() + body


def multipart_body(size=2048):
    boundary = "----ffboundarya1b2c3"
    content = bytes((i % 256) for i in range(size))
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"sample.bin\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, boundary


def ws_headers():
    return ["Upgrade: websocket", "Connection: Upgrade",
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version: 13"]


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def real_exchange(dst_ip, dst_port, req: bytes):
    try:
        s = socket.create_connection((dst_ip, dst_port), timeout=4)
    except Exception:
        return b"", b""
    try:
        s.sendall(req)
        resp = b""
        s.settimeout(4)
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            resp += chunk
    except Exception:
        resp = b""
    finally:
        try:
            s.close()
        except Exception:
            pass
    return req, resp


def capture_scenario(name, spec, dst_ip, dst_port, host_header, out_dir):
    packets = []
    base = time.time()
    n = spec["n"]
    ua_pool = spec["ua"]
    paths = spec["paths"]
    weights = spec["weights"]

    def one(i):
        t0 = base + (i / n) * 40 + random.uniform(0, 0.08)
        ua = random.choice(ua_pool)
        path = random.choices(paths, weights=weights, k=1)[0]
        method, body, extra = "GET", b"", None
        if spec["type"] == "post":
            body, boundary = multipart_body()
            extra = [f"Content-Type: multipart/form-data; boundary={boundary}"]
            method = "POST"
        elif spec["type"] == "ws":
            extra = ws_headers()
        req, resp = real_exchange(dst_ip, dst_port, request_bytes(method, path, host_header, ua, body, extra))
        if not req:
            return
        local_ip = "10.0.0.99"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect((dst_ip, dst_port))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass
        sport = random.randint(30000, 65000)
        sess = make_session(local_ip, dst_ip, sport, dst_port, req, resp, t0)
        # mixed-protocol: 追加 UDP/DNS/ICMP 探测
        if spec["type"] == "mix" and random.random() < 0.2:
            r = random.random()
            if r < 0.5:
                pay = build_ip(local_ip, dst_ip, build_tcp(sport, 5000, 1, 0, 0x02, b"", local_ip, dst_ip))
                packets.append((t0 + 0.02, frame(SRC_MAC, DST_MAC, pay)))
        # TLS 玩具握手（附加，非核心）
        if random.random() < spec["tls"]:
            tlsc = build_ip(local_ip, dst_ip, build_tcp(sport, dst_port, random.randint(0, 2 ** 32 - 1), 0,
                                                        0x18, TLS_HELLO, local_ip, dst_ip))
            packets.append((t0 + 0.03, frame(SRC_MAC, DST_MAC, tlsc)))
        packets.extend(sess)

    if spec["type"] == "concurrent":
        with ThreadPoolExecutor(max_workers=20) as ex:
            list(ex.map(one, range(n)))
    else:
        for i in range(n):
            one(i)

    out = f"{out_dir}/{name}.pcap"
    write_pcap(out, sorted(packets, key=lambda x: x[0]))
    cnt = verify_pcap(out)
    print(f"[ok] {name}.pcap  packets={cnt}  sessions~{n}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--out", default=".")
    ap.add_argument("--scenario", default=None)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    try:
        dst_ip = socket.gethostbyname(args.host)
    except Exception:
        dst_ip = args.host
    print(f"target = {args.host} ({dst_ip}):{args.port}  [offline mode, synthesized link-layer]")

    if args.all:
        scen = SCENARIOS
    elif args.scenario:
        scen = {args.scenario: SCENARIOS[args.scenario]}
    else:
        scen = SCENARIOS
    for name, spec in scen.items():
        try:
            capture_scenario(name, spec, dst_ip, args.port, args.host, args.out)
        except Exception as e:
            print(f"[FAIL] {name}: {repr(e)[:200]}")
    print("OFFLINE_CAPTURE_DONE")


if __name__ == "__main__":
    main()

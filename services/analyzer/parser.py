"""PCAP parsing logic via Scapy.

Extracts a BusinessProfile-shaped dict from a raw PCAP file. All values fall
back to safe defaults when the capture lacks a particular feature, so the
caller can always emit a valid BusinessProfile.
"""
from __future__ import annotations

import hashlib
import math
import re
from collections import Counter, defaultdict
from typing import Any, Dict, List, Tuple

from scapy.all import rdpcap  # type: ignore
from scapy.layers.inet import IP, TCP, UDP, ICMP  # type: ignore
from scapy.packet import Raw  # type: ignore

try:
    from scapy.layers.tls.handshake import TLSClientHello  # type: ignore
    from scapy.layers.tls.record import TLS  # type: ignore

    _HAVE_TLS = True
except Exception:  # pragma: no cover - TLS layer is optional
    _HAVE_TLS = False


HTTP_METHODS = (b"GET", b"POST", b"PUT", b"DELETE", b"PATCH", b"HEAD", b"OPTIONS")
_UA_RE = re.compile(rb"User-Agent:\s*([^\r\n]+)", re.IGNORECASE)
_REQ_LINE_RE = re.compile(rb"^([A-Z]+)\s+(\S+)\s+HTTP/")


def _ratio(num: int, den: int) -> float:
    if den <= 0:
        return 0.0
    return round(num / den, 4)


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * pct
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(s[int(k)])
    return float(s[f] + (s[c] - s[f]) * (k - f))


def _parse_http(payload: bytes) -> Tuple[str, str, str] | None:
    """Returns (method, path, user_agent) when payload looks like an HTTP request."""
    if not payload.startswith(HTTP_METHODS):
        return None
    # First line
    line_end = payload.find(b"\r\n")
    head = payload[: line_end if line_end > 0 else 256]
    m = _REQ_LINE_RE.match(head)
    if not m:
        return None
    method = m.group(1).decode("ascii", errors="ignore")
    path = m.group(2).decode("ascii", errors="ignore")
    ua_match = _UA_RE.search(payload[: min(len(payload), 4096)])
    ua = ua_match.group(1).decode("ascii", errors="ignore").strip() if ua_match else ""
    return method, path, ua


def _ja3_like(ch_bytes: bytes) -> str:
    """Cheap JA3-ish fingerprint: SHA1 of the ClientHello bytes prefix.

    A real JA3 would extract version/ciphers/extensions/curves/ec-formats; in
    the interest of robustness we hash a stable prefix so the same hello yields
    the same fingerprint. Marked `ja3-approx:` so consumers know it isn't a
    canonical JA3.
    """
    digest = hashlib.sha1(ch_bytes[:512]).hexdigest()
    return f"ja3-approx:{digest}"


def _vuln_heuristics(top_apis: List[Dict[str, Any]], qps_p99: float) -> List[str]:
    vulns: List[str] = []
    paths = {a["path"].lower(): a for a in top_apis}

    if any("login" in p or "signin" in p or "auth" in p for p in paths):
        vulns.append("登录类接口未观察到验证码挑战,易被慢速凭据暴力探测")
    if any("search" in p or "query" in p for p in paths):
        vulns.append("搜索类接口可能放大后端计算,适合做放大型 HTTP flood")
    if any(a["method"].upper() == "GET" and a["ratio"] >= 0.3 for a in top_apis):
        vulns.append("存在高占比 GET 接口,缺乏速率限制时可被高并发 flood")
    if qps_p99 > 0 and qps_p99 < 50:
        vulns.append("基线 QPS 较低,任何放大的攻击都会显著拉升曲线,需关注突发检测阈值")
    if not vulns:
        vulns.append("未观察到明显特征接口,可尝试通用 L7/L4 攻击作为基线")
    return vulns


def analyze_pcap(path: str) -> Dict[str, Any]:
    packets = rdpcap(path)

    proto_counts = Counter()
    per_second: Dict[int, int] = defaultdict(int)
    api_counter: Counter = Counter()
    ua_counter: Counter = Counter()
    tls_fps: List[str] = []
    tls_seen: set = set()

    first_ts: float | None = None

    for pkt in packets:
        ts = float(getattr(pkt, "time", 0.0) or 0.0)
        if first_ts is None or ts < first_ts:
            first_ts = ts
        bucket = int(ts)
        per_second[bucket] += 1

        if pkt.haslayer(TCP):
            proto_counts["tcp"] += 1
        elif pkt.haslayer(UDP):
            proto_counts["udp"] += 1
        elif pkt.haslayer(ICMP):
            proto_counts["icmp"] += 1
        else:
            proto_counts["other"] += 1

        if pkt.haslayer(Raw):
            payload = bytes(pkt[Raw].load)
            parsed = _parse_http(payload)
            if parsed:
                method, path, ua = parsed
                api_counter[(method, path)] += 1
                if ua:
                    ua_counter[ua] += 1
            elif _HAVE_TLS and pkt.haslayer(TCP):
                try:
                    tls = TLS(payload)
                    if tls.haslayer(TLSClientHello):
                        fp = _ja3_like(payload)
                        if fp not in tls_seen:
                            tls_seen.add(fp)
                            tls_fps.append(fp)
                except Exception:
                    pass
            else:
                # Heuristic ClientHello detection without TLS layer: 0x16 0x03
                if pkt.haslayer(TCP) and len(payload) > 5 and payload[0] == 0x16 and payload[1] == 0x03:
                    fp = _ja3_like(payload)
                    if fp not in tls_seen:
                        tls_seen.add(fp)
                        tls_fps.append(fp)

    total_pkts = sum(proto_counts.values()) or 1
    protocols = {
        "tcp": _ratio(proto_counts["tcp"], total_pkts),
        "udp": _ratio(proto_counts["udp"], total_pkts),
        "icmp": _ratio(proto_counts["icmp"], total_pkts),
        "other": _ratio(proto_counts["other"], total_pkts),
    }
    # Normalize float drift so they sum <= 1
    s = sum(protocols.values())
    if s > 1.0:
        scale = 1.0 / s
        protocols = {k: round(v * scale, 4) for k, v in protocols.items()}

    rps_values = list(per_second.values())
    qps_avg = round(sum(rps_values) / len(rps_values), 2) if rps_values else 0.0
    qps_p99 = round(_percentile([float(v) for v in rps_values], 0.99), 2)

    api_total = sum(api_counter.values())
    top_apis: List[Dict[str, Any]] = []
    for (method, path), cnt in api_counter.most_common(10):
        top_apis.append({"path": path, "method": method, "ratio": _ratio(cnt, api_total)})

    ua_total = sum(ua_counter.values())
    ua_dist: List[Dict[str, Any]] = []
    for ua, cnt in ua_counter.most_common(10):
        ua_dist.append({"ua": ua, "ratio": _ratio(cnt, ua_total)})

    vulnerabilities = _vuln_heuristics(top_apis, qps_p99)

    summary_parts: List[str] = []
    summary_parts.append(f"共 {total_pkts} 个数据包")
    if top_apis:
        summary_parts.append(f"主要接口 {top_apis[0]['method']} {top_apis[0]['path']}")
    summary_parts.append(f"基线 QPS avg={qps_avg} p99={qps_p99}")
    if tls_fps:
        summary_parts.append(f"发现 {len(tls_fps)} 个 TLS 指纹")
    summary = "; ".join(summary_parts)

    return {
        "summary": summary,
        "protocols": protocols,
        "qpsBaseline": {"avg": qps_avg, "p99": qps_p99},
        "topApis": top_apis,
        "tlsFingerprints": tls_fps[:5],
        "userAgentDistribution": ua_dist,
        "vulnerabilities": vulnerabilities,
    }

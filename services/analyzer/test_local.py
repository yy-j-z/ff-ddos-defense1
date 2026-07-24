"""Local smoke test for the PCAP analyzer.

Generates a sample PCAP, feeds it through the FastAPI app via TestClient, and
asserts the response shape matches BusinessProfileSchema.

Run: `python test_local.py` from services/analyzer/.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from fastapi.testclient import TestClient  # noqa: E402

import gen_sample  # noqa: E402
from main import app  # noqa: E402
from parser import analyze_pcap  # noqa: E402
from scapy.all import wrpcap  # type: ignore  # noqa: E402


def _make_pcap() -> Path:
    tmp = Path(tempfile.mkdtemp()) / "sample.pcap"
    wrpcap(str(tmp), gen_sample.build_packets())
    return tmp


def test_parser_direct():
    pcap = _make_pcap()
    profile = analyze_pcap(str(pcap))
    assert profile["summary"], "summary missing"
    p = profile["protocols"]
    for k in ("tcp", "udp", "icmp", "other"):
        assert k in p, f"protocols missing {k}"
        assert 0.0 <= p[k] <= 1.0, f"protocols.{k} out of range: {p[k]}"
    assert p["tcp"] > 0, "expected TCP packets"
    assert profile["qpsBaseline"]["avg"] >= 0
    assert profile["qpsBaseline"]["p99"] >= 0
    apis = profile["topApis"]
    assert len(apis) >= 2, f"expected multiple apis, got {apis}"
    methods = {a["method"] for a in apis}
    assert "GET" in methods and "POST" in methods, f"missing methods: {methods}"
    paths = {a["path"] for a in apis}
    assert "/api/products" in paths and "/api/login" in paths
    assert isinstance(profile["userAgentDistribution"], list)
    assert len(profile["userAgentDistribution"]) >= 1
    assert isinstance(profile["vulnerabilities"], list) and profile["vulnerabilities"]
    assert isinstance(profile.get("tlsFingerprints"), list)
    print("test_parser_direct ok:", {k: (len(v) if isinstance(v, list) else v) for k, v in profile.items()})


def test_endpoint():
    pcap = _make_pcap()
    client = TestClient(app)
    with open(pcap, "rb") as f:
        resp = client.post("/analyze", files={"file": ("sample.pcap", f, "application/octet-stream")})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for key in ("summary", "protocols", "qpsBaseline", "topApis", "userAgentDistribution", "vulnerabilities"):
        assert key in body, f"missing {key}"
    print("test_endpoint ok")


def test_health():
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}
    print("test_health ok")


if __name__ == "__main__":
    test_health()
    test_parser_direct()
    test_endpoint()
    print("ALL OK")

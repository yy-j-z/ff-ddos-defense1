"""Local smoke test for attack strategies.

Runs each strategy directly against an ephemeral local HTTP server for a few
seconds and asserts the result schema matches AttackJobResult.

Run: `python test_local.py` from services/attacker/.
"""
from __future__ import annotations

import asyncio
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from strategies import MetricsCollector, build_result  # noqa: E402
from strategies import http_flood, slowloris  # noqa: E402


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *_a, **_k):
        pass


def _start_server() -> tuple[ThreadingHTTPServer, int]:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, port


def _assert_result_shape(result: dict) -> None:
    for key in (
        "playbookId", "totalRequests", "successfulRequests", "blockedRequests",
        "errors", "avgLatencyMs", "startedAt", "finishedAt", "rawMetrics",
    ):
        assert key in result, f"result missing {key}"
    assert isinstance(result["rawMetrics"], list)
    for s in result["rawMetrics"]:
        assert {"ts", "rps", "blocked"} <= s.keys()


async def _run_strategy(runner, playbook):
    m = MetricsCollector()
    started = datetime.now(timezone.utc)
    sampler = asyncio.create_task(m.sampler())
    try:
        await runner(playbook, m)
    finally:
        m.stop()
        try:
            await asyncio.wait_for(sampler, timeout=2.0)
        except asyncio.TimeoutError:
            sampler.cancel()
    finished = datetime.now(timezone.utc)
    return build_result(playbook["id"], m, started, finished)


async def main():
    srv, port = _start_server()
    target = f"http://127.0.0.1:{port}"
    try:
        # http_flood
        pb_flood = {
            "id": "pb-test-flood",
            "round": 0,
            "intent": "smoke",
            "strategy": "http_flood",
            "parameters": {
                "targetUrl": target,
                "targetEndpoints": ["/", "/api/x"],
                "concurrentConnections": 8,
                "requestsPerSecond": 20,
                "durationSec": 3,
                "userAgents": ["UA-A", "UA-B"],
            },
            "expectedBypass": "n/a",
            "hypothesis": "n/a",
        }
        r1 = await _run_strategy(http_flood.run, pb_flood)
        _assert_result_shape(r1)
        assert r1["totalRequests"] > 0, f"http_flood produced no requests: {r1}"
        assert r1["successfulRequests"] > 0, f"http_flood no successes: {r1}"
        print("http_flood ok:", {k: r1[k] for k in ("totalRequests", "successfulRequests", "blockedRequests", "errors")})

        # slowloris (short duration so test completes quickly)
        pb_slow = {
            "id": "pb-test-slow",
            "round": 0,
            "intent": "smoke",
            "strategy": "slowloris",
            "parameters": {
                "targetUrl": target,
                "targetEndpoints": ["/"],
                "concurrentConnections": 5,
                "sendIntervalMs": 500,
                "durationSec": 3,
                "userAgents": ["UA-Slow"],
            },
            "expectedBypass": "n/a",
            "hypothesis": "n/a",
        }
        r2 = await _run_strategy(slowloris.run, pb_slow)
        _assert_result_shape(r2)
        assert r2["totalRequests"] > 0, f"slowloris produced no records: {r2}"
        print("slowloris ok:", {k: r2[k] for k in ("totalRequests", "successfulRequests", "blockedRequests", "errors")})

        print("ALL OK")
    finally:
        srv.shutdown()


if __name__ == "__main__":
    asyncio.run(main())

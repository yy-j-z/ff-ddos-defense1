"""Attacker Worker — consumes BullMQ `attack-jobs` and runs attack strategies.

Implementation note (BullMQ Python trade-off):
We attempted to use the official `bullmq` PyPI package, but its async Worker
API has caveats (no Python 3.12 wheel for some sub-deps, awkward error
handling, slim docs). To keep the worker robust and easy to debug we instead
use `bullmq` Worker class when import succeeds, and fall back to a thin
direct-Redis consumer that BLMOVEs jobs from `bull:attack-jobs:wait` to a
processing list and writes results back to `bull:attack-jobs:<id>` hashes.
Jobs added by the Node BullMQ Queue API are visible via the same Redis keys,
so both producers/consumers stay protocol-compatible.

Each job's data is AttackJobData = { sessionId, playbook }. Result is
AttackJobResult (see web/lib/types.ts).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import traceback
from datetime import datetime, timezone
from typing import Any, Dict
from urllib.parse import urlparse

from strategies import MetricsCollector, build_result
from strategies import http_flood, slowloris, syn_flood, hulk_flood, slow_headers

logging.basicConfig(
    level=logging.INFO,
    format="[attacker-worker] %(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("attacker.worker")


ATTACK_QUEUE = "attack-jobs"
STRATEGIES = {
    "slowloris": slowloris.run,
    "http_flood": http_flood.run,
    "syn_flood": syn_flood.run,
    "hulk_flood": hulk_flood.run,
    "slow_headers": slow_headers.run,
}


# ───────────────────────── Safety guards ────────────────────────────────
# Defense-in-depth: the web orchestrator already forces targetUrl to DEFENDER_URL
# and clamps scope, but the worker MUST NOT trust the job it pops off Redis.
# Anyone able to enqueue a job could otherwise aim real attack traffic at an
# arbitrary host or dial intensity to infinity. These limits are the last line.
def _allowed_hosts() -> set[str]:
    raw = os.getenv("ATTACK_ALLOWED_HOSTS", "defender,target,localhost,127.0.0.1")
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


MAX_RPS = int(os.getenv("ATTACK_MAX_RPS", "5000"))
MAX_CONNECTIONS = int(os.getenv("ATTACK_MAX_CONNECTIONS", "2000"))
MAX_DURATION_SEC = int(os.getenv("ATTACK_MAX_DURATION_SEC", "300"))


class TargetNotAllowed(Exception):
    """Raised when a job targets a host outside the allowlist."""


def _clamp_int(value: Any, default: int, lo: int, hi: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = default
    return max(lo, min(hi, n))


def sanitize_playbook(playbook: Dict[str, Any]) -> Dict[str, Any]:
    """Enforce the target allowlist and clamp intensity params in place.

    Raises TargetNotAllowed if the target host is not permitted — the job is
    then rejected rather than executed.
    """
    params = playbook.get("parameters")
    if not isinstance(params, dict):
        params = {}
        playbook["parameters"] = params

    target_url = params.get("targetUrl", "http://defender:8080")
    host = (urlparse(target_url).hostname or "").lower()
    allowed = _allowed_hosts()
    if host not in allowed:
        raise TargetNotAllowed(
            f"target host {host!r} (from {target_url!r}) not in allowlist {sorted(allowed)}"
        )

    params["durationSec"] = _clamp_int(params.get("durationSec", 30), 30, 1, MAX_DURATION_SEC)
    params["concurrentConnections"] = _clamp_int(
        params.get("concurrentConnections", 100), 100, 1, MAX_CONNECTIONS
    )
    if params.get("requestsPerSecond") is not None:
        params["requestsPerSecond"] = _clamp_int(params.get("requestsPerSecond"), 50, 1, MAX_RPS)
    return playbook


async def run_playbook(job_data: Dict[str, Any]) -> Dict[str, Any]:
    session_id = job_data.get("sessionId", "unknown")
    playbook = job_data.get("playbook") or {}
    strategy = playbook.get("strategy")
    playbook_id = playbook.get("id", "unknown")

    try:
        playbook = sanitize_playbook(playbook)
    except TargetNotAllowed as exc:
        log.error("REJECTED session=%s playbook=%s: %s", session_id, playbook_id, exc)
        return {
            "playbookId": playbook_id,
            "totalRequests": 0,
            "successfulRequests": 0,
            "blockedRequests": 0,
            "errors": 1,
            "avgLatencyMs": 0.0,
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "rawMetrics": [],
            "rejected": str(exc),
        }

    log.info("=" * 60)
    log.info("session=%s playbook=%s strategy=%s round=%s", session_id, playbook_id, strategy, playbook.get("round"))
    log.info("intent: %s", playbook.get("intent"))
    log.info("parameters: %s", json.dumps(playbook.get("parameters", {}), ensure_ascii=False))
    log.info("=" * 60)

    runner = STRATEGIES.get(strategy)
    if not runner:
        log.error("unknown strategy: %s", strategy)
        return {
            "playbookId": playbook_id,
            "totalRequests": 0,
            "successfulRequests": 0,
            "blockedRequests": 0,
            "errors": 1,
            "avgLatencyMs": 0.0,
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "rawMetrics": [],
        }

    metrics = MetricsCollector()
    started = datetime.now(timezone.utc)
    sampler_task = asyncio.create_task(metrics.sampler())
    try:
        # 最终兜底: 策略内部即使还有未覆盖的挂起点(如底层库卡死),
        # worker 也必须在 durationSec + 30s 内强制收尾, 绝不无限挂起。
        # 这样 web 端 waitForAttack 总能拿到真实结果(而非空等后转 mock)。
        run_timeout = float(playbook.get("parameters", {}).get("durationSec", 30)) + 30.0
        try:
            await asyncio.wait_for(runner(playbook, metrics), timeout=run_timeout)
        except asyncio.TimeoutError:
            log.error("strategy timed out after %.0fs, forcing finish", run_timeout)
            metrics.record(error=True)
    except Exception as exc:  # noqa: BLE001
        log.error("strategy crashed: %s\n%s", exc, traceback.format_exc())
        metrics.record(error=True)
    finally:
        metrics.stop()
        try:
            await asyncio.wait_for(sampler_task, timeout=2.0)
        except asyncio.TimeoutError:
            sampler_task.cancel()

    finished = datetime.now(timezone.utc)
    result = build_result(playbook_id, metrics, started, finished)
    log.info("result: total=%d ok=%d blocked=%d err=%d avg=%.1fms samples=%d",
             result["totalRequests"], result["successfulRequests"], result["blockedRequests"],
             result["errors"], result["avgLatencyMs"], len(result["rawMetrics"]))
    return result


# ───────────────────────── BullMQ consumer ──────────────────────────────

async def _consume_with_bullmq(redis_url: str) -> None:
    """Preferred path: use the bullmq Python package's Worker."""
    from bullmq import Worker  # type: ignore

    log.info("using bullmq.Worker (queue=%s)", ATTACK_QUEUE)

    async def processor(job, _job_token):
        return await run_playbook(job.data or {})

    worker = Worker(ATTACK_QUEUE, processor, {"connection": redis_url})
    stop_event = asyncio.Event()

    def _stop(*_a):
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            pass

    await stop_event.wait()
    await worker.close()


async def _consume_with_redis(redis_url: str) -> None:
    """Fallback: thin direct-Redis loop (BLPOP) for BullMQ wait list.

    Trade-off: skips BullMQ's advanced features (delays, retries, rate-limit)
    but is dependency-light. Writes results into `bull:{queue}:{jobId}` hash
    under field `returnvalue` and moves the job id into `completed` set,
    matching enough of the BullMQ wire format for the web side to poll.
    """
    import redis.asyncio as redis  # type: ignore

    log.info("using direct-redis fallback consumer (queue=%s)", ATTACK_QUEUE)
    r = redis.from_url(redis_url, decode_responses=True)

    wait_key = f"bull:{ATTACK_QUEUE}:wait"
    active_key = f"bull:{ATTACK_QUEUE}:active"
    completed_key = f"bull:{ATTACK_QUEUE}:completed"

    while True:
        try:
            popped = await r.brpoplpush(wait_key, active_key, timeout=5)
            if not popped:
                continue
            job_id = popped
            job_key = f"bull:{ATTACK_QUEUE}:{job_id}"
            data_str = await r.hget(job_key, "data")
            if not data_str:
                log.warning("job %s has no data, skipping", job_id)
                await r.lrem(active_key, 1, job_id)
                continue

            try:
                job_data = json.loads(data_str)
            except json.JSONDecodeError as exc:
                log.error("job %s data not JSON: %s", job_id, exc)
                await r.lrem(active_key, 1, job_id)
                continue

            try:
                result = await run_playbook(job_data)
                await r.hset(job_key, mapping={
                    "returnvalue": json.dumps(result),
                    "finishedOn": str(int(datetime.now(timezone.utc).timestamp() * 1000)),
                })
                await r.zadd(completed_key, {job_id: int(datetime.now(timezone.utc).timestamp() * 1000)})
            except Exception as exc:  # noqa: BLE001
                log.error("job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
                await r.hset(job_key, mapping={"failedReason": str(exc)})
            finally:
                await r.lrem(active_key, 1, job_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.error("consumer loop error: %s", exc)
            await asyncio.sleep(2.0)


async def main_async() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    log.info("booted, redis=%s strategies=%s", redis_url, list(STRATEGIES))

    try:
        await _consume_with_bullmq(redis_url)
    except ImportError as exc:
        log.warning("bullmq import failed (%s); using direct redis fallback", exc)
        await _consume_with_redis(redis_url)
    except Exception as exc:  # noqa: BLE001
        log.error("bullmq worker crashed: %s; switching to direct redis", exc)
        await _consume_with_redis(redis_url)


def main() -> None:
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        log.info("interrupted, exiting")


if __name__ == "__main__":
    main()

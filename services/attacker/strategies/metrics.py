"""Shared metrics collection for attack strategies.

Each strategy reports per-request outcomes through `MetricsCollector.record(...)`.
A background task periodically snapshots into a per-second `rawMetrics` list
matching the AttackJobResult contract.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List


@dataclass
class MetricsCollector:
    total: int = 0
    successful: int = 0
    blocked: int = 0  # HTTP 429 or explicit block signal
    errors: int = 0
    latency_sum_ms: float = 0.0
    latency_count: int = 0

    _bucket_total: int = 0
    _bucket_blocked: int = 0
    _raw_metrics: List[Dict[str, Any]] = field(default_factory=list)
    _started_at: float = field(default_factory=time.time)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _stop: bool = False

    def record(self, *, success: bool = False, blocked: bool = False, error: bool = False, latency_ms: float | None = None) -> None:
        self.total += 1
        self._bucket_total += 1
        if blocked:
            self.blocked += 1
            self._bucket_blocked += 1
        if success:
            self.successful += 1
        if error:
            self.errors += 1
        if latency_ms is not None:
            self.latency_sum_ms += latency_ms
            self.latency_count += 1

    async def sampler(self) -> None:
        """Run as a background task. Flushes counters every second into rawMetrics."""
        while not self._stop:
            await asyncio.sleep(1.0)
            self._raw_metrics.append({
                "ts": int(time.time()),
                "rps": self._bucket_total,
                "blocked": self._bucket_blocked,
            })
            self._bucket_total = 0
            self._bucket_blocked = 0

    def stop(self) -> None:
        self._stop = True

    @property
    def raw_metrics(self) -> List[Dict[str, Any]]:
        return list(self._raw_metrics)

    @property
    def avg_latency_ms(self) -> float:
        if self.latency_count == 0:
            return 0.0
        return round(self.latency_sum_ms / self.latency_count, 2)


def build_result(playbook_id: str, m: MetricsCollector, started_at: datetime, finished_at: datetime) -> Dict[str, Any]:
    return {
        "playbookId": playbook_id,
        "totalRequests": m.total,
        "successfulRequests": m.successful,
        "blockedRequests": m.blocked,
        "errors": m.errors,
        "avgLatencyMs": m.avg_latency_ms,
        "startedAt": started_at.astimezone(timezone.utc).isoformat(),
        "finishedAt": finished_at.astimezone(timezone.utc).isoformat(),
        "rawMetrics": m.raw_metrics,
    }

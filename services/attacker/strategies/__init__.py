"""Attack strategy implementations.

Each strategy exposes an async `run(playbook: dict, metrics: MetricsCollector)`
returning an AttackJobResult-shaped dict.
"""
from .metrics import MetricsCollector, build_result

__all__ = ["MetricsCollector", "build_result"]

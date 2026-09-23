from __future__ import annotations

from threading import RLock
from typing import Mapping


class PrometheusRegistry:
    """Small Prometheus text exposition registry with labels and gauges/counters."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._values: dict[tuple[str, tuple[tuple[str, str], ...]], float] = {}
        self._types: dict[str, str] = {}

    @staticmethod
    def _key(name: str, labels: Mapping[str, str] | None) -> tuple[str, tuple[tuple[str, str], ...]]:
        return name, tuple(sorted((str(k), str(v)) for k, v in (labels or {}).items()))

    def set_gauge(self, name: str, value: float, labels: Mapping[str, str] | None = None) -> None:
        with self._lock:
            self._types[name] = "gauge"; self._values[self._key(name, labels)] = float(value)

    def inc_counter(self, name: str, amount: float = 1.0, labels: Mapping[str, str] | None = None) -> None:
        with self._lock:
            self._types[name] = "counter"; key = self._key(name, labels); self._values[key] = self._values.get(key, 0.0) + float(amount)

    def render(self) -> str:
        with self._lock:
            values, types = dict(self._values), dict(self._types)
        lines: list[str] = []
        emitted: set[str] = set()
        for (name, labels), value in sorted(values.items()):
            if name not in emitted:
                lines.extend([f"# TYPE {name} {types.get(name, 'gauge')}"]); emitted.add(name)
            label_text = "{" + ",".join(f'{key}="{value.replace(chr(92), chr(92)+chr(92)).replace(chr(34), chr(92)+chr(34))}"' for key, value in labels) + "}" if labels else ""
            lines.append(f"{name}{label_text} {value:g}")
        return "\n".join(lines) + "\n"


metrics_registry = PrometheusRegistry()


def refresh_operational_metrics(snapshot: dict) -> None:
    metrics_registry.set_gauge("quant_strategy_count", len(snapshot.get("all_strategies", [])))
    metrics_registry.set_gauge("quant_production_strategy_count", len(snapshot.get("production_strategies", [])))
    metrics_registry.set_gauge("quant_canary_strategy_count", len(snapshot.get("canary_strategies", [])))
    for state, count in snapshot.get("lease_summary", {}).items():
        metrics_registry.set_gauge("quant_task_lease_count", count, {"state": state})

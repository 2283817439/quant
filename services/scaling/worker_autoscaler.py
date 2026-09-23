from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class BacklogSnapshot:
    backlog: int
    running: int = 0
    timestamp: float = 0.0


@dataclass
class WorkerScalingPolicy:
    min_workers: int = 2
    max_workers: int = 20
    target_backlog_per_worker: int = 10
    scale_down_cooldown_seconds: float = 60.0

    def __post_init__(self) -> None:
        if not (0 < self.min_workers <= self.max_workers):
            raise ValueError("worker bounds are invalid")
        if self.target_backlog_per_worker < 1:
            raise ValueError("target backlog must be positive")

    def desired_workers(self, snapshot: BacklogSnapshot, current_workers: int, now: float | None = None,
                        last_scale_at: float | None = None) -> int:
        now = now if now is not None else time.time()
        target = max(self.min_workers, min(self.max_workers, math.ceil(snapshot.backlog / self.target_backlog_per_worker)))
        if snapshot.backlog == 0 and last_scale_at is not None and now - last_scale_at < self.scale_down_cooldown_seconds:
            return max(self.min_workers, current_workers)
        return target


class PrometheusQueueAutoscaler:
    """Reads a Prometheus backlog gauge and delegates replica changes to a callback."""

    def __init__(self, prometheus_url: str, policy: WorkerScalingPolicy,
                 set_workers: Callable[[int], None], query: str = "quant_task_queue_backlog") -> None:
        self.prometheus_url = prometheus_url.rstrip("/")
        self.policy = policy
        self.set_workers = set_workers
        self.query = query

    def read_snapshot(self) -> BacklogSnapshot:
        import requests
        response = requests.get(f"{self.prometheus_url}/api/v1/query", params={"query": self.query}, timeout=5)
        response.raise_for_status()
        results = response.json().get("data", {}).get("result", [])
        backlog = int(float(results[0]["value"][1])) if results else 0
        return BacklogSnapshot(backlog=backlog, timestamp=time.time())

    def reconcile(self, current_workers: int, last_scale_at: float | None = None) -> int:
        desired = self.policy.desired_workers(self.read_snapshot(), current_workers, last_scale_at=last_scale_at)
        if desired != current_workers:
            self.set_workers(desired)
        return desired

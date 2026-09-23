from __future__ import annotations

import itertools
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Callable, Iterable


@dataclass(frozen=True)
class BacktestJob:
    experiment_id: str
    trial_id: str
    parameters: dict[str, Any]
    dataset: str
    submitted_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(frozen=True)
class BacktestResult:
    experiment_id: str
    trial_id: str
    parameters: dict[str, Any]
    metrics: dict[str, float]
    status: str = "succeeded"
    error: str | None = None


class InMemoryResultStore:
    def __init__(self) -> None:
        self._lock = RLock(); self._results: dict[str, BacktestResult] = {}

    def save(self, result: BacktestResult) -> None:
        with self._lock:
            self._results[result.trial_id] = result

    def list(self, experiment_id: str) -> list[BacktestResult]:
        with self._lock:
            return [item for item in self._results.values() if item.experiment_id == experiment_id]


class RedisResultStore:
    def __init__(self, url: str = "redis://localhost:6379/0", prefix: str = "quant:backtest:") -> None:
        try:
            import redis
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Redis result store requires redis-py") from exc
        self.client = redis.Redis.from_url(url, decode_responses=True); self.prefix = prefix

    def save(self, result: BacktestResult) -> None:
        key = f"{self.prefix}result:{result.trial_id}"
        self.client.set(key, json.dumps(asdict(result), sort_keys=True)); self.client.sadd(f"{self.prefix}experiment:{result.experiment_id}", result.trial_id)

    def list(self, experiment_id: str) -> list[BacktestResult]:
        ids = self.client.smembers(f"{self.prefix}experiment:{experiment_id}"); results = []
        for trial_id in ids:
            raw = self.client.get(f"{self.prefix}result:{trial_id}")
            if raw:
                data = json.loads(raw); results.append(BacktestResult(**data))
        return results


class DistributedBacktestCluster:
    """Splits a parameter grid into idempotent Redis queue jobs."""

    def __init__(self, queue: Any, result_store: Any | None = None, task_type: str = "backtest.run") -> None:
        self.queue = queue; self.result_store = result_store or InMemoryResultStore(); self.task_type = task_type

    @staticmethod
    def expand_grid(parameter_grid: dict[str, Iterable[Any]]) -> list[dict[str, Any]]:
        keys = list(parameter_grid)
        values = [list(parameter_grid[key]) for key in keys]
        return [dict(zip(keys, combination)) for combination in itertools.product(*values)]

    def submit_grid(self, experiment_id: str, parameter_grid: dict[str, Iterable[Any]], dataset: str,
                    max_attempts: int = 2) -> list[BacktestJob]:
        jobs = []
        for parameters in self.expand_grid(parameter_grid):
            trial_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{experiment_id}:{json.dumps(parameters, sort_keys=True)}"))
            job = BacktestJob(experiment_id, trial_id, parameters, dataset); jobs.append(job)
            self.queue.enqueue(self.task_type, asdict(job), max_attempts=max_attempts, task_id=trial_id)
        return jobs

    def aggregate(self, experiment_id: str, metric: str = "sharpe_ratio", descending: bool = True) -> list[BacktestResult]:
        results = self.result_store.list(experiment_id)
        return sorted(results, key=lambda result: result.metrics.get(metric, float("-inf")), reverse=descending)


class BacktestWorkerHandler:
    def __init__(self, runner: Callable[[dict[str, Any], str], dict[str, float]], result_store: Any) -> None:
        self.runner, self.result_store = runner, result_store

    def __call__(self, payload: dict[str, Any]) -> dict[str, Any]:
        job = BacktestJob(**payload)
        try:
            metrics = self.runner(job.parameters, job.dataset)
            result = BacktestResult(job.experiment_id, job.trial_id, job.parameters, metrics)
        except Exception as exc:  # persisted result allows the experiment to finish with failed trials
            result = BacktestResult(job.experiment_id, job.trial_id, job.parameters, {}, "failed", str(exc))
        self.result_store.save(result)
        return asdict(result)

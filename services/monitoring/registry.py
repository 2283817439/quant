from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock
from typing import Any


class MonitoringRegistry:
    """Process-local projection for a dashboard; production can back it with Redis."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._strategies: dict[str, dict[str, Any]] = {}
        self._leases: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def strategy(self, strategy_id: str, version: str, status: str, **extra: Any) -> None:
        with self._lock:
            self._strategies[f"{strategy_id}:{version}"] = {
                "strategy_id": strategy_id, "version": version, "status": status,
                "updated_at": self._now(), **extra,
            }

    def lease_claimed(self, task_id: str, worker_id: str, lease_token: str | None, state: str = "running") -> None:
        with self._lock:
            self._leases[task_id] = {"task_id": task_id, "worker_id": worker_id, "lease_token": lease_token, "state": state, "updated_at": self._now()}

    def lease_completed(self, task_id: str, worker_id: str, state: str) -> None:
        with self._lock:
            current = self._leases.setdefault(task_id, {"task_id": task_id})
            current.update({"worker_id": worker_id, "state": state, "updated_at": self._now()})

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            strategies = list(self._strategies.values())
            leases = list(self._leases.values())
        return {
            "generated_at": self._now(),
            "production_strategies": [item for item in strategies if item["status"] == "promoted"],
            "canary_strategies": [item for item in strategies if item["status"] == "canary"],
            "all_strategies": strategies,
            "task_leases": leases,
            "lease_summary": {
                "running": sum(item.get("state") == "running" for item in leases),
                "succeeded": sum(item.get("state") == "succeeded" for item in leases),
                "failed": sum(item.get("state") in {"retry_wait", "dead_letter"} for item in leases),
            },
        }


monitoring_registry = MonitoringRegistry()

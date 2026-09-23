from __future__ import annotations

import os
from typing import Any


def create_task_queue(*, path: str = "data/tasks.db", observer: Any | None = None):
    """Create the configured queue without changing Worker business code.

    ``TASK_QUEUE_BACKEND=redis`` selects Redis; any other value uses SQLite.
    """
    backend = os.getenv("TASK_QUEUE_BACKEND", "sqlite").lower()
    if backend == "redis":
        from services.redis_backend import RedisTaskQueue
        return RedisTaskQueue(os.getenv("REDIS_URL", "redis://localhost:6379/0"), observer=observer)
    if backend != "sqlite":
        raise ValueError(f"unsupported TASK_QUEUE_BACKEND: {backend}")
    from .store import SqliteTaskQueue
    return SqliteTaskQueue(path, observer=observer)

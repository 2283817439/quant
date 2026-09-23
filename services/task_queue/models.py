from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class TaskState(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    RETRY_WAIT = "retry_wait"
    DEAD_LETTER = "dead_letter"


@dataclass(frozen=True)
class QueuedTask:
    id: str
    task_type: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int
    available_at: datetime
    lease_until: datetime | None = None


@dataclass(frozen=True)
class TaskFailure:
    task_id: str
    error: str
    attempts: int
    retrying: bool

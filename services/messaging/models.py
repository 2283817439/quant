from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class OutboxMessage:
    id: str
    aggregate_type: str
    aggregate_id: str
    message_type: str
    payload: dict[str, Any]
    attempts: int
    available_at: datetime
    lease_until: datetime | None = None


@dataclass(frozen=True)
class InboxClaim:
    consumer_name: str
    message_id: str
    is_new: bool

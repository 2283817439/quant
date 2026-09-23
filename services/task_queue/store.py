from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from .models import QueuedTask, TaskFailure, TaskState


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _task_from_row(row: Any) -> QueuedTask:
    raw_payload = row["payload_json"]
    if isinstance(raw_payload, str):
        raw_payload = json.loads(raw_payload)
    raw_available_at = row["available_at"]
    if not isinstance(raw_available_at, datetime):
        raw_available_at = datetime.fromisoformat(str(raw_available_at).replace("Z", "+00:00"))
    raw_lease_until = row["lease_until"]
    if raw_lease_until is not None and not isinstance(raw_lease_until, datetime):
        raw_lease_until = datetime.fromisoformat(str(raw_lease_until).replace("Z", "+00:00"))
    return QueuedTask(
        id=str(row["id"]),
        task_type=row["task_type"],
        payload=raw_payload,
        attempts=int(row["attempts"]),
        max_attempts=int(row["max_attempts"]),
        available_at=raw_available_at,
        lease_until=raw_lease_until,
    )


class SqliteTaskQueue:
    """Durable development queue with leasing and at-least-once semantics."""

    def __init__(self, path: str | Path = "data/tasks.db") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS task_queue (
                    id TEXT PRIMARY KEY,
                    task_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    state TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    available_at TEXT NOT NULL,
                    lease_until TEXT,
                    worker_id TEXT,
                    result_json TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )"""
            )
            db.execute("CREATE INDEX IF NOT EXISTS idx_task_claim ON task_queue(state, available_at)")

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=30.0)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def enqueue(self, task_type: str, payload: dict[str, Any], max_attempts: int = 3,
                available_at: datetime | None = None, task_id: str | None = None) -> str:
        task_id = task_id or str(uuid.uuid4())
        now = _now()
        available_at = available_at or now
        with self._connection() as db:
            db.execute(
                """INSERT INTO task_queue
                (id, task_type, payload_json, state, attempts, max_attempts, available_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)""",
                (task_id, task_type, json.dumps(payload, sort_keys=True), TaskState.QUEUED,
                 max(1, max_attempts), available_at.isoformat(), now.isoformat(), now.isoformat()),
            )
        return task_id

    def claim(self, worker_id: str, lease_seconds: int = 60) -> QueuedTask | None:
        now = _now()
        lease_until = now + timedelta(seconds=lease_seconds)
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                """UPDATE task_queue SET state = ?, lease_until = NULL, worker_id = NULL, updated_at = ?
                WHERE state = ? AND lease_until IS NOT NULL AND lease_until < ?""",
                (TaskState.RETRY_WAIT, now.isoformat(), TaskState.RUNNING, now.isoformat()),
            )
            row = db.execute(
                """SELECT * FROM task_queue
                WHERE state IN (?, ?) AND available_at <= ?
                ORDER BY available_at, created_at LIMIT 1""",
                (TaskState.QUEUED, TaskState.RETRY_WAIT, now.isoformat()),
            ).fetchone()
            if not row:
                return None
            db.execute(
                """UPDATE task_queue SET state = ?, attempts = attempts + 1,
                lease_until = ?, worker_id = ?, updated_at = ? WHERE id = ?""",
                (TaskState.RUNNING, lease_until.isoformat(), worker_id, now.isoformat(), row["id"]),
            )
            row = dict(row)
            row["attempts"] += 1
            row["lease_until"] = lease_until.isoformat()
        return _task_from_row(row)

    def complete(self, task_id: str, worker_id: str, result: Any = None) -> None:
        with self._connection() as db:
            updated = db.execute(
                """UPDATE task_queue SET state = ?, result_json = ?, lease_until = NULL,
                worker_id = NULL, updated_at = ? WHERE id = ? AND state = ? AND worker_id = ?""",
                (TaskState.SUCCEEDED, json.dumps(result, default=str), _now().isoformat(),
                 task_id, TaskState.RUNNING, worker_id),
            )
            if updated.rowcount != 1:
                raise RuntimeError(f"task lease lost: {task_id}")

    def fail(self, task_id: str, worker_id: str, error: str, retry_delay_seconds: int = 5) -> TaskFailure:
        now = _now()
        with self._connection() as db:
            row = db.execute("SELECT attempts, max_attempts FROM task_queue WHERE id = ? AND worker_id = ?", (task_id, worker_id)).fetchone()
            if not row:
                raise RuntimeError(f"task lease lost: {task_id}")
            retrying = row["attempts"] < row["max_attempts"]
            state = TaskState.RETRY_WAIT if retrying else TaskState.DEAD_LETTER
            available_at = now + timedelta(seconds=max(0, retry_delay_seconds))
            db.execute(
                """UPDATE task_queue SET state = ?, available_at = ?, lease_until = NULL,
                worker_id = NULL, error = ?, updated_at = ? WHERE id = ? AND worker_id = ?""",
                (state, available_at.isoformat(), error[:4000], now.isoformat(), task_id, worker_id),
            )
        return TaskFailure(task_id, error[:4000], row["attempts"], retrying)

    def counts(self) -> dict[str, int]:
        with self._connection() as db:
            rows = db.execute("SELECT state, COUNT(*) AS count FROM task_queue GROUP BY state").fetchall()
        return {row["state"]: row["count"] for row in rows}


class PostgresTaskQueue:
    """PostgreSQL queue using row locks and ``SKIP LOCKED`` for horizontal workers."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 10) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("PostgreSQL queue requires psycopg[binary] and psycopg-pool") from exc
        self._pool = ConnectionPool(
            dsn, min_size=min_size, max_size=max_size,
            kwargs={"row_factory": dict_row}, open=True,
        )
        with self._pool.connection() as db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS task_queue (
                    id UUID PRIMARY KEY, task_type TEXT NOT NULL, payload_json JSONB NOT NULL,
                    state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3, available_at TIMESTAMPTZ NOT NULL,
                    lease_until TIMESTAMPTZ, worker_id TEXT, result_json JSONB, error TEXT,
                    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
                ); CREATE INDEX IF NOT EXISTS idx_task_claim ON task_queue(state, available_at);"""
            )

    def close(self) -> None:
        self._pool.close()

    def enqueue(self, task_type: str, payload: dict[str, Any], max_attempts: int = 3,
                available_at: datetime | None = None, task_id: str | None = None) -> str:
        task_id = task_id or str(uuid.uuid4())
        now = _now(); available_at = available_at or now
        with self._pool.connection() as db:
            db.execute(
                """INSERT INTO task_queue (id, task_type, payload_json, state, max_attempts, available_at, created_at, updated_at)
                VALUES (%s, %s, %s::jsonb, 'queued', %s, %s, %s, %s)""",
                (task_id, task_type, json.dumps(payload), max(1, max_attempts), available_at, now, now),
            )
        return task_id

    def claim(self, worker_id: str, lease_seconds: int = 60) -> QueuedTask | None:
        now = _now(); lease_until = now + timedelta(seconds=lease_seconds)
        with self._pool.connection() as db:
            row = db.execute(
                """WITH candidate AS (
                    SELECT id FROM task_queue WHERE state IN ('queued', 'retry_wait')
                    AND available_at <= %s AND (lease_until IS NULL OR lease_until < %s)
                    ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
                ) UPDATE task_queue SET state='running', attempts=attempts+1,
                    lease_until=%s, worker_id=%s, updated_at=%s
                WHERE id IN (SELECT id FROM candidate) RETURNING *""",
                (now, now, lease_until, worker_id, now),
            ).fetchone()
        return _task_from_row(row) if row else None

    def complete(self, task_id: str, worker_id: str, result: Any = None) -> None:
        with self._pool.connection() as db:
            result_row = db.execute(
                "UPDATE task_queue SET state='succeeded', result_json=%s::jsonb, lease_until=NULL, worker_id=NULL, updated_at=%s WHERE id=%s AND state='running' AND worker_id=%s",
                (json.dumps(result, default=str), _now(), task_id, worker_id),
            )
            if result_row.rowcount != 1:
                raise RuntimeError(f"task lease lost: {task_id}")

    def fail(self, task_id: str, worker_id: str, error: str, retry_delay_seconds: int = 5) -> TaskFailure:
        with self._pool.connection() as db:
            row = db.execute("SELECT attempts, max_attempts FROM task_queue WHERE id=%s AND worker_id=%s", (task_id, worker_id)).fetchone()
            if not row:
                raise RuntimeError(f"task lease lost: {task_id}")
            retrying = row["attempts"] < row["max_attempts"]
            state = "retry_wait" if retrying else "dead_letter"
            db.execute("UPDATE task_queue SET state=%s, available_at=%s, lease_until=NULL, worker_id=NULL, error=%s, updated_at=%s WHERE id=%s AND worker_id=%s", (state, _now() + timedelta(seconds=retry_delay_seconds), error[:4000], _now(), task_id, worker_id))
        return TaskFailure(task_id, error[:4000], row["attempts"], retrying)

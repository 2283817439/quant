from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from .models import InboxClaim, OutboxMessage


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _decode(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _outbox(row: Any) -> OutboxMessage:
    available = row["available_at"]
    lease = row["lease_until"]
    if not isinstance(available, datetime):
        available = datetime.fromisoformat(str(available).replace("Z", "+00:00"))
    if lease and not isinstance(lease, datetime):
        lease = datetime.fromisoformat(str(lease).replace("Z", "+00:00"))
    return OutboxMessage(str(row["id"]), row["aggregate_type"], row["aggregate_id"], row["message_type"], _decode(row["payload_json"]), int(row["attempts"]), available, lease)


class SqliteReliableMessageStore:
    def __init__(self, path: str | Path = "data/messaging.db") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS outbox_messages (
                id TEXT PRIMARY KEY, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
                message_type TEXT NOT NULL, payload_json TEXT NOT NULL, idempotency_key TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
                available_at TEXT NOT NULL, lease_until TEXT, worker_id TEXT,
                published_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                UNIQUE (aggregate_type, idempotency_key)
            );
            CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox_messages(state, available_at);
            CREATE TABLE IF NOT EXISTS inbox_messages (
                consumer_name TEXT NOT NULL, message_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'received',
                received_at TEXT NOT NULL, processed_at TEXT, last_error TEXT,
                PRIMARY KEY (consumer_name, message_id)
            );
            """)

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=30.0)
        db.row_factory = sqlite3.Row
        try:
            yield db; db.commit()
        except Exception:
            db.rollback(); raise
        finally:
            db.close()

    def publish(self, aggregate_type: str, aggregate_id: str, message_type: str,
                payload: dict[str, Any], idempotency_key: str) -> str:
        message_id = str(uuid.uuid4()); now = _now()
        with self._connection() as db:
            row = db.execute("SELECT id FROM outbox_messages WHERE aggregate_type=? AND idempotency_key=?", (aggregate_type, idempotency_key)).fetchone()
            if row:
                return row["id"]
            db.execute("""INSERT INTO outbox_messages
                (id, aggregate_type, aggregate_id, message_type, payload_json, idempotency_key, available_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", (message_id, aggregate_type, aggregate_id, message_type, json.dumps(payload, sort_keys=True), idempotency_key, now.isoformat(), now.isoformat(), now.isoformat()))
        return message_id

    def claim_outbox(self, worker_id: str, lease_seconds: int = 60) -> OutboxMessage | None:
        now = _now(); lease = now + timedelta(seconds=lease_seconds)
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("UPDATE outbox_messages SET state='pending', lease_until=NULL, worker_id=NULL WHERE state='publishing' AND lease_until < ?", (now.isoformat(),))
            row = db.execute("SELECT * FROM outbox_messages WHERE state='pending' AND available_at <= ? ORDER BY created_at LIMIT 1", (now.isoformat(),)).fetchone()
            if not row:
                return None
            db.execute("UPDATE outbox_messages SET state='publishing', attempts=attempts+1, lease_until=?, worker_id=?, updated_at=? WHERE id=?", (lease.isoformat(), worker_id, now.isoformat(), row["id"]))
            row = dict(row); row["attempts"] += 1; row["lease_until"] = lease.isoformat()
        return _outbox(row)

    def mark_published(self, message_id: str, worker_id: str) -> None:
        with self._connection() as db:
            result = db.execute("UPDATE outbox_messages SET state='published', published_at=?, lease_until=NULL, worker_id=NULL, updated_at=? WHERE id=? AND state='publishing' AND worker_id=?", (_now().isoformat(), _now().isoformat(), message_id, worker_id))
            if result.rowcount != 1: raise RuntimeError(f"outbox lease lost: {message_id}")

    def mark_publish_failed(self, message_id: str, worker_id: str, error: str, retry_delay_seconds: int = 5) -> None:
        with self._connection() as db:
            result = db.execute("UPDATE outbox_messages SET state='pending', available_at=?, lease_until=NULL, worker_id=NULL, last_error=?, updated_at=? WHERE id=? AND state='publishing' AND worker_id=?", ((_now() + timedelta(seconds=retry_delay_seconds)).isoformat(), error[:4000], _now().isoformat(), message_id, worker_id))
            if result.rowcount != 1: raise RuntimeError(f"outbox lease lost: {message_id}")

    def begin_consume(self, consumer_name: str, message_id: str) -> InboxClaim:
        now = _now().isoformat()
        with self._connection() as db:
            try:
                db.execute("INSERT INTO inbox_messages(consumer_name, message_id, received_at) VALUES (?, ?, ?)", (consumer_name, message_id, now))
                return InboxClaim(consumer_name, message_id, True)
            except sqlite3.IntegrityError:
                row = db.execute("SELECT state FROM inbox_messages WHERE consumer_name=? AND message_id=?", (consumer_name, message_id)).fetchone()
                if row and row["state"] == "failed":
                    db.execute("UPDATE inbox_messages SET state='received', last_error=NULL WHERE consumer_name=? AND message_id=?", (consumer_name, message_id))
                    return InboxClaim(consumer_name, message_id, True)
                return InboxClaim(consumer_name, message_id, False)

    def mark_processed(self, consumer_name: str, message_id: str) -> None:
        with self._connection() as db:
            db.execute("UPDATE inbox_messages SET state='processed', processed_at=?, last_error=NULL WHERE consumer_name=? AND message_id=?", (_now().isoformat(), consumer_name, message_id))

    def mark_consume_failed(self, consumer_name: str, message_id: str, error: str) -> None:
        with self._connection() as db:
            db.execute("UPDATE inbox_messages SET state='failed', last_error=? WHERE consumer_name=? AND message_id=?", (error[:4000], consumer_name, message_id))


class PostgresReliableMessageStore:
    """PostgreSQL implementation using unique constraints and SKIP LOCKED."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 10) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("reliable messaging requires psycopg[binary] and psycopg-pool") from exc
        self._pool = ConnectionPool(dsn, min_size=min_size, max_size=max_size, kwargs={"row_factory": dict_row}, open=True)

    def close(self) -> None:
        self._pool.close()

    def publish(self, aggregate_type: str, aggregate_id: str, message_type: str, payload: dict[str, Any], idempotency_key: str) -> str:
        message_id = str(uuid.uuid4()); now = _now()
        with self._pool.connection() as db:
            row = db.execute("""INSERT INTO outbox_messages(id, aggregate_type, aggregate_id, message_type, payload_json, idempotency_key, available_at, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
                ON CONFLICT(aggregate_type, idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id""", (message_id, aggregate_type, aggregate_id, message_type, json.dumps(payload), idempotency_key, now, now, now)).fetchone()
        return str(row["id"])

    def claim_outbox(self, worker_id: str, lease_seconds: int = 60) -> OutboxMessage | None:
        now = _now(); lease = now + timedelta(seconds=lease_seconds)
        with self._pool.connection() as db:
            row = db.execute("""WITH candidate AS (SELECT id FROM outbox_messages WHERE state='pending' AND available_at <= %s AND (lease_until IS NULL OR lease_until < %s) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
                UPDATE outbox_messages SET state='publishing', attempts=attempts+1, lease_until=%s, worker_id=%s, updated_at=%s WHERE id IN (SELECT id FROM candidate) RETURNING *""", (now, now, lease, worker_id, now)).fetchone()
        return _outbox(row) if row else None

    def mark_published(self, message_id: str, worker_id: str) -> None:
        with self._pool.connection() as db:
            result = db.execute("UPDATE outbox_messages SET state='published', published_at=%s, lease_until=NULL, worker_id=NULL, updated_at=%s WHERE id=%s AND state='publishing' AND worker_id=%s", (_now(), _now(), message_id, worker_id))
            if result.rowcount != 1: raise RuntimeError(f"outbox lease lost: {message_id}")

    def mark_publish_failed(self, message_id: str, worker_id: str, error: str, retry_delay_seconds: int = 5) -> None:
        with self._pool.connection() as db:
            result = db.execute("UPDATE outbox_messages SET state='pending', available_at=%s, lease_until=NULL, worker_id=NULL, last_error=%s, updated_at=%s WHERE id=%s AND state='publishing' AND worker_id=%s", (_now() + timedelta(seconds=retry_delay_seconds), error[:4000], _now(), message_id, worker_id))
            if result.rowcount != 1: raise RuntimeError(f"outbox lease lost: {message_id}")

    def begin_consume(self, consumer_name: str, message_id: str) -> InboxClaim:
        with self._pool.connection() as db:
            row = db.execute("INSERT INTO inbox_messages(consumer_name, message_id, received_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING message_id", (consumer_name, message_id, _now())).fetchone()
            if not row:
                row = db.execute("UPDATE inbox_messages SET state='received', last_error=NULL WHERE consumer_name=%s AND message_id=%s AND state='failed' RETURNING message_id", (consumer_name, message_id)).fetchone()
        return InboxClaim(consumer_name, message_id, bool(row))

    def mark_processed(self, consumer_name: str, message_id: str) -> None:
        with self._pool.connection() as db:
            db.execute("UPDATE inbox_messages SET state='processed', processed_at=%s, last_error=NULL WHERE consumer_name=%s AND message_id=%s", (_now(), consumer_name, message_id))

    def mark_consume_failed(self, consumer_name: str, message_id: str, error: str) -> None:
        with self._pool.connection() as db:
            db.execute("UPDATE inbox_messages SET state='failed', last_error=%s WHERE consumer_name=%s AND message_id=%s", (error[:4000], consumer_name, message_id))

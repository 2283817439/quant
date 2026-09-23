from __future__ import annotations

import hashlib
import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

from services.messaging.models import OutboxMessage


class PostgresControlPlaneStore:
    """PostgreSQL control plane with atomic business state and Outbox writes."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 10) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("PostgreSQL support requires psycopg[binary] and psycopg-pool") from exc
        self._pool = ConnectionPool(dsn, min_size=min_size, max_size=max_size, kwargs={"row_factory": dict_row}, open=True)
        self._initialize()

    @contextmanager
    def _connection(self) -> Iterator[Any]:
        with self._pool.connection() as connection:
            yield connection

    def close(self) -> None:
        self._pool.close()

    def _initialize(self) -> None:
        with self._connection() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS control_plane_events (
                    sequence BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
                    payload_json JSONB NOT NULL, correlation_id TEXT NOT NULL, previous_hash TEXT NOT NULL,
                    event_hash TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL
                );
                CREATE TABLE IF NOT EXISTS strategy_versions (
                    strategy_id TEXT NOT NULL, version TEXT NOT NULL, artifact_uri TEXT NOT NULL,
                    status TEXT NOT NULL, metrics_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
                    promoted_at TIMESTAMPTZ, PRIMARY KEY (strategy_id, version)
                );
                CREATE TABLE IF NOT EXISTS control_flags (
                    name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outbox_messages (
                    id UUID PRIMARY KEY, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
                    message_type TEXT NOT NULL, payload_json JSONB NOT NULL, idempotency_key TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
                    available_at TIMESTAMPTZ NOT NULL, lease_until TIMESTAMPTZ, worker_id TEXT,
                    published_at TIMESTAMPTZ, last_error TEXT, created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL, UNIQUE (aggregate_type, idempotency_key)
                );
                CREATE INDEX IF NOT EXISTS idx_control_outbox_claim ON outbox_messages(state, available_at);
            """)

    def _append_event_and_outbox(self, db: Any, event_type: str, aggregate_id: str,
                                 payload: dict[str, Any], correlation_id: str,
                                 idempotency_key: str) -> dict[str, Any]:
        created_at = datetime.now(timezone.utc)
        payload_json = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
        previous = db.execute("SELECT event_hash FROM control_plane_events ORDER BY sequence DESC LIMIT 1").fetchone()
        previous_hash = previous["event_hash"] if previous else "GENESIS"
        canonical = "|".join((event_type, aggregate_id, payload_json, correlation_id, previous_hash, created_at.isoformat()))
        event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        row = db.execute(
            """INSERT INTO control_plane_events
            (event_type, aggregate_id, payload_json, correlation_id, previous_hash, event_hash, created_at)
            VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s) RETURNING sequence""",
            (event_type, aggregate_id, payload_json, correlation_id, previous_hash, event_hash, created_at),
        ).fetchone()
        message_id = str(uuid.uuid4())
        db.execute(
            """INSERT INTO outbox_messages
            (id, aggregate_type, aggregate_id, message_type, payload_json, idempotency_key, available_at, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)""",
            (message_id, "control_plane", aggregate_id, event_type, payload_json,
             idempotency_key, created_at, created_at, created_at),
        )
        return {"sequence": row["sequence"], "event_type": event_type, "aggregate_id": aggregate_id,
                "payload": payload, "correlation_id": correlation_id, "previous_hash": previous_hash,
                "event_hash": event_hash, "created_at": created_at.isoformat(), "outbox_id": message_id}

    def append_event(self, event_type: str, aggregate_id: str, payload: dict[str, Any], correlation_id: str) -> dict[str, Any]:
        with self._connection() as db:
            return self._append_event_and_outbox(db, event_type, aggregate_id, payload, correlation_id,
                                                 f"event:{event_type}:{aggregate_id}:{correlation_id}")

    def verify_event_chain(self) -> bool:
        with self._connection() as db:
            rows = db.execute("SELECT * FROM control_plane_events ORDER BY sequence").fetchall()
        previous_hash = "GENESIS"
        for row in rows:
            payload_json = json.dumps(row["payload_json"], sort_keys=True, ensure_ascii=False, default=str)
            canonical = "|".join((row["event_type"], row["aggregate_id"], payload_json, row["correlation_id"], row["previous_hash"], row["created_at"].isoformat()))
            if row["previous_hash"] != previous_hash or hashlib.sha256(canonical.encode()).hexdigest() != row["event_hash"]:
                return False
            previous_hash = row["event_hash"]
        return True

    def register_strategy(self, strategy_id: str, version: str, artifact_uri: str,
                          metrics: dict[str, Any], correlation_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self._connection() as db:
            db.execute("""INSERT INTO strategy_versions
                (strategy_id, version, artifact_uri, status, metrics_json, created_at)
                VALUES (%s, %s, %s, 'candidate', %s::jsonb, %s)""",
                (strategy_id, version, artifact_uri, json.dumps(metrics), now))
            self._append_event_and_outbox(db, "strategy.candidate_registered", f"{strategy_id}:{version}",
                                          {"artifact_uri": artifact_uri, "metrics": metrics}, correlation_id,
                                          f"strategy.candidate_registered:{strategy_id}:{version}")

    def set_status(self, strategy_id: str, version: str, status: str, correlation_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self._connection() as db:
            result = db.execute("""UPDATE strategy_versions SET status=%s,
                promoted_at=CASE WHEN %s='promoted' THEN %s ELSE promoted_at END
                WHERE strategy_id=%s AND version=%s""", (status, status, now, strategy_id, version))
            if result.rowcount != 1:
                raise KeyError(f"strategy version not found: {strategy_id}:{version}")
            self._append_event_and_outbox(db, "strategy.status_changed", f"{strategy_id}:{version}",
                                          {"status": status}, correlation_id,
                                          f"strategy.status_changed:{strategy_id}:{version}:{status}:{correlation_id}")

    def list_strategies(self) -> list[dict[str, Any]]:
        with self._connection() as db:
            return list(db.execute("SELECT * FROM strategy_versions ORDER BY created_at DESC"))

    def set_flag(self, name: str, value: str, correlation_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self._connection() as db:
            db.execute("""INSERT INTO control_flags(name, value, updated_at) VALUES (%s, %s, %s)
                ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at""", (name, value, now))
            self._append_event_and_outbox(db, "control.flag_changed", name, {"value": value}, correlation_id,
                                          f"control.flag_changed:{name}:{value}:{correlation_id}")

    def get_flag(self, name: str, default: str = "") -> str:
        with self._connection() as db:
            row = db.execute("SELECT value FROM control_flags WHERE name=%s", (name,)).fetchone()
        return row["value"] if row else default

    def claim_outbox(self, worker_id: str, lease_seconds: int = 60) -> OutboxMessage | None:
        now = datetime.now(timezone.utc); lease = now + timedelta(seconds=lease_seconds)
        with self._connection() as db:
            row = db.execute("""WITH candidate AS (
                SELECT id FROM outbox_messages WHERE state='pending' AND available_at<=%s
                AND (lease_until IS NULL OR lease_until<%s) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
                UPDATE outbox_messages SET state='publishing', attempts=attempts+1, lease_until=%s,
                worker_id=%s, updated_at=%s WHERE id IN (SELECT id FROM candidate) RETURNING *""",
                (now, now, lease, worker_id, now)).fetchone()
        if not row:
            return None
        return OutboxMessage(str(row["id"]), row["aggregate_type"], row["aggregate_id"], row["message_type"], row["payload_json"], int(row["attempts"]), row["available_at"], row["lease_until"])

    def mark_outbox_published(self, message_id: str, worker_id: str) -> None:
        with self._connection() as db:
            result = db.execute("UPDATE outbox_messages SET state='published', published_at=%s, lease_until=NULL, worker_id=NULL, updated_at=%s WHERE id=%s AND state='publishing' AND worker_id=%s", (datetime.now(timezone.utc), datetime.now(timezone.utc), message_id, worker_id))
            if result.rowcount != 1:
                raise RuntimeError(f"outbox lease lost: {message_id}")

    def mark_outbox_failed(self, message_id: str, worker_id: str, error: str, retry_delay_seconds: int = 5) -> None:
        with self._connection() as db:
            result = db.execute("UPDATE outbox_messages SET state='pending', available_at=%s, lease_until=NULL, worker_id=NULL, last_error=%s, updated_at=%s WHERE id=%s AND state='publishing' AND worker_id=%s", (datetime.now(timezone.utc) + timedelta(seconds=retry_delay_seconds), error[:4000], datetime.now(timezone.utc), message_id, worker_id))
            if result.rowcount != 1:
                raise RuntimeError(f"outbox lease lost: {message_id}")

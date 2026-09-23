from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator


class PostgresControlPlaneStore:
    """PostgreSQL implementation of the control-plane store contract.

    The driver is imported lazily so local backtests do not require PostgreSQL.
    Use a connection string such as ``postgresql://user:pass@host/db``.
    """

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 10) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover - exercised in deployment
            raise RuntimeError(
                "PostgreSQL support requires psycopg[binary] and psycopg-pool"
            ) from exc
        self._dict_row = dict_row
        self._pool = ConnectionPool(
            dsn, min_size=min_size, max_size=max_size,
            kwargs={"row_factory": dict_row}, open=True,
        )
        self._initialize()

    @contextmanager
    def _connection(self) -> Iterator[Any]:
        with self._pool.connection() as connection:
            yield connection

    def close(self) -> None:
        self._pool.close()

    def _initialize(self) -> None:
        with self._connection() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS control_plane_events (
                    sequence BIGSERIAL PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    aggregate_id TEXT NOT NULL,
                    payload_json JSONB NOT NULL,
                    correlation_id TEXT NOT NULL,
                    previous_hash TEXT NOT NULL,
                    event_hash TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMPTZ NOT NULL
                );
                CREATE TABLE IF NOT EXISTS strategy_versions (
                    strategy_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    artifact_uri TEXT NOT NULL,
                    status TEXT NOT NULL,
                    metrics_json JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    promoted_at TIMESTAMPTZ,
                    PRIMARY KEY (strategy_id, version)
                );
                CREATE TABLE IF NOT EXISTS control_flags (
                    name TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );
                """
            )

    def append_event(self, event_type: str, aggregate_id: str, payload: dict[str, Any],
                     correlation_id: str) -> dict[str, Any]:
        created_at = datetime.now(timezone.utc)
        payload_json = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
        with self._connection() as db:
            previous = db.execute(
                "SELECT event_hash FROM control_plane_events ORDER BY sequence DESC LIMIT 1"
            ).fetchone()
            previous_hash = previous["event_hash"] if previous else "GENESIS"
            canonical = "|".join((event_type, aggregate_id, payload_json, correlation_id,
                                   previous_hash, created_at.isoformat()))
            event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            row = db.execute(
                """INSERT INTO control_plane_events
                (event_type, aggregate_id, payload_json, correlation_id,
                 previous_hash, event_hash, created_at)
                VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s)
                RETURNING sequence""",
                (event_type, aggregate_id, payload_json, correlation_id,
                 previous_hash, event_hash, created_at),
            ).fetchone()
        return {"sequence": row["sequence"], "event_type": event_type,
                "aggregate_id": aggregate_id, "payload": payload,
                "correlation_id": correlation_id, "previous_hash": previous_hash,
                "event_hash": event_hash, "created_at": created_at.isoformat()}

    def verify_event_chain(self) -> bool:
        with self._connection() as db:
            rows = db.execute("SELECT * FROM control_plane_events ORDER BY sequence").fetchall()
        previous_hash = "GENESIS"
        for row in rows:
            payload_json = json.dumps(row["payload_json"], sort_keys=True, ensure_ascii=False, default=str)
            created_at = row["created_at"].isoformat()
            canonical = "|".join((row["event_type"], row["aggregate_id"], payload_json,
                                   row["correlation_id"], row["previous_hash"], created_at))
            if row["previous_hash"] != previous_hash or hashlib.sha256(canonical.encode()).hexdigest() != row["event_hash"]:
                return False
            previous_hash = row["event_hash"]
        return True

    def register_strategy(self, strategy_id: str, version: str, artifact_uri: str,
                          metrics: dict[str, Any], correlation_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self._connection() as db:
            db.execute(
                """INSERT INTO strategy_versions
                (strategy_id, version, artifact_uri, status, metrics_json, created_at)
                VALUES (%s, %s, %s, 'candidate', %s::jsonb, %s)""",
                (strategy_id, version, artifact_uri, json.dumps(metrics), now),
            )
        self.append_event("strategy.candidate_registered", f"{strategy_id}:{version}",
                          {"artifact_uri": artifact_uri, "metrics": metrics}, correlation_id)

    def set_status(self, strategy_id: str, version: str, status: str, correlation_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self._connection() as db:
            result = db.execute(
                """UPDATE strategy_versions SET status = %s,
                promoted_at = CASE WHEN %s = 'promoted' THEN %s ELSE promoted_at END
                WHERE strategy_id = %s AND version = %s""",
                (status, status, now, strategy_id, version),
            )
            if result.rowcount != 1:
                raise KeyError(f"strategy version not found: {strategy_id}:{version}")
        self.append_event("strategy.status_changed", f"{strategy_id}:{version}",
                          {"status": status}, correlation_id)

    def list_strategies(self) -> list[dict[str, Any]]:
        with self._connection() as db:
            return list(db.execute("SELECT * FROM strategy_versions ORDER BY created_at DESC"))

    def set_flag(self, name: str, value: str, correlation_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self._connection() as db:
            db.execute(
                """INSERT INTO control_flags(name, value, updated_at) VALUES (%s, %s, %s)
                ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at""",
                (name, value, now),
            )
        self.append_event("control.flag_changed", name, {"value": value}, correlation_id)

    def get_flag(self, name: str, default: str = "") -> str:
        with self._connection() as db:
            row = db.execute("SELECT value FROM control_flags WHERE name = %s", (name,)).fetchone()
        return row["value"] if row else default

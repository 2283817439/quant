from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


class ControlPlaneStore:
    """SQLite reference store with an append-only hash-chained event log.

    Production deployments can replace this adapter with PostgreSQL while
    keeping the lifecycle contract unchanged.  No event row is updated or
    deleted after it is written.
    """

    def __init__(self, path: str | Path = "data/control_plane.db") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30.0)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS control_plane_events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    aggregate_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    correlation_id TEXT NOT NULL,
                    previous_hash TEXT NOT NULL,
                    event_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS strategy_versions (
                    strategy_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    artifact_uri TEXT NOT NULL,
                    status TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    promoted_at TEXT,
                    PRIMARY KEY (strategy_id, version)
                );
                CREATE TABLE IF NOT EXISTS control_flags (
                    name TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

    def append_event(
        self,
        event_type: str,
        aggregate_id: str,
        payload: dict[str, Any],
        correlation_id: str,
    ) -> dict[str, Any]:
        created_at = datetime.now(timezone.utc).isoformat()
        payload_json = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
        with self._connection() as db:
            previous = db.execute(
                "SELECT event_hash FROM control_plane_events ORDER BY sequence DESC LIMIT 1"
            ).fetchone()
            previous_hash = previous["event_hash"] if previous else "GENESIS"
            canonical = "|".join(
                (event_type, aggregate_id, payload_json, correlation_id, previous_hash, created_at)
            )
            event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            db.execute(
                """INSERT INTO control_plane_events
                (event_type, aggregate_id, payload_json, correlation_id,
                 previous_hash, event_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (event_type, aggregate_id, payload_json, correlation_id, previous_hash, event_hash, created_at),
            )
            sequence = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        return {
            "sequence": sequence,
            "event_type": event_type,
            "aggregate_id": aggregate_id,
            "payload": payload,
            "correlation_id": correlation_id,
            "previous_hash": previous_hash,
            "event_hash": event_hash,
            "created_at": created_at,
        }

    def verify_event_chain(self) -> bool:
        with self._connection() as db:
            rows = db.execute(
                "SELECT * FROM control_plane_events ORDER BY sequence ASC"
            ).fetchall()
        previous_hash = "GENESIS"
        for row in rows:
            if row["previous_hash"] != previous_hash:
                return False
            canonical = "|".join(
                (
                    row["event_type"], row["aggregate_id"], row["payload_json"],
                    row["correlation_id"], row["previous_hash"], row["created_at"],
                )
            )
            if hashlib.sha256(canonical.encode("utf-8")).hexdigest() != row["event_hash"]:
                return False
            previous_hash = row["event_hash"]
        return True

    def register_strategy(self, strategy_id: str, version: str, artifact_uri: str,
                          metrics: dict[str, Any], correlation_id: str) -> None:
        created_at = datetime.now(timezone.utc).isoformat()
        with self._connection() as db:
            db.execute(
                """INSERT INTO strategy_versions
                (strategy_id, version, artifact_uri, status, metrics_json, created_at)
                VALUES (?, ?, ?, 'candidate', ?, ?)""",
                (strategy_id, version, artifact_uri, json.dumps(metrics, sort_keys=True), created_at),
            )
        self.append_event("strategy.candidate_registered", f"{strategy_id}:{version}", {
            "artifact_uri": artifact_uri, "metrics": metrics,
        }, correlation_id)

    def set_status(self, strategy_id: str, version: str, status: str,
                   correlation_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as db:
            result = db.execute(
                "UPDATE strategy_versions SET status = ?, promoted_at = CASE WHEN ? = 'promoted' THEN ? ELSE promoted_at END WHERE strategy_id = ? AND version = ?",
                (status, status, now, strategy_id, version),
            )
            if result.rowcount != 1:
                raise KeyError(f"strategy version not found: {strategy_id}:{version}")
        self.append_event("strategy.status_changed", f"{strategy_id}:{version}", {
            "status": status,
        }, correlation_id)

    def list_strategies(self) -> list[dict[str, Any]]:
        with self._connection() as db:
            rows = db.execute(
                "SELECT * FROM strategy_versions ORDER BY created_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def set_flag(self, name: str, value: str, correlation_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as db:
            db.execute(
                "INSERT INTO control_flags(name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                (name, value, now),
            )
        self.append_event("control.flag_changed", name, {"value": value}, correlation_id)

    def get_flag(self, name: str, default: str = "") -> str:
        with self._connection() as db:
            row = db.execute("SELECT value FROM control_flags WHERE name = ?", (name,)).fetchone()
        return row["value"] if row else default

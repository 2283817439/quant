from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class LockHandle:
    name: str
    owner: str
    fencing_token: int
    lease_until: datetime


class SqliteLockManager:
    """Development lock manager with atomic lease acquisition and fencing."""

    def __init__(self, path: str | Path = "data/coordination.db") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS distributed_locks (
                name TEXT PRIMARY KEY, owner TEXT NOT NULL, fencing_token INTEGER NOT NULL,
                lease_until TEXT NOT NULL, updated_at TEXT NOT NULL)""")

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

    def acquire(self, name: str, owner: str | None = None, lease_seconds: int = 30) -> LockHandle | None:
        owner = owner or str(uuid.uuid4()); now = _now(); until = now + timedelta(seconds=max(1, lease_seconds))
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM distributed_locks WHERE name=?", (name,)).fetchone()
            if row and row["lease_until"] > now.isoformat() and row["owner"] != owner:
                return None
            token = (row["fencing_token"] + 1) if row else 1
            db.execute("""INSERT INTO distributed_locks(name, owner, fencing_token, lease_until, updated_at)
                VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,
                fencing_token=excluded.fencing_token, lease_until=excluded.lease_until, updated_at=excluded.updated_at""", (name, owner, token, until.isoformat(), now.isoformat()))
        return LockHandle(name, owner, token, until)

    def renew(self, handle: LockHandle, lease_seconds: int = 30) -> LockHandle | None:
        until = _now() + timedelta(seconds=max(1, lease_seconds))
        with self._connection() as db:
            row = db.execute("UPDATE distributed_locks SET lease_until=?, updated_at=? WHERE name=? AND owner=? AND fencing_token=?", (until.isoformat(), _now().isoformat(), handle.name, handle.owner, handle.fencing_token))
            if row.rowcount != 1:
                return None
        return LockHandle(handle.name, handle.owner, handle.fencing_token, until)

    def release(self, handle: LockHandle) -> bool:
        with self._connection() as db:
            row = db.execute("UPDATE distributed_locks SET owner='', lease_until=?, updated_at=? WHERE name=? AND owner=? AND fencing_token=?", (_now().isoformat(), _now().isoformat(), handle.name, handle.owner, handle.fencing_token))
            return row.rowcount == 1


class PostgresLockManager:
    """PostgreSQL lock manager using row locks and monotonic fencing tokens."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 10) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("distributed locks require psycopg[binary] and psycopg-pool") from exc
        self._pool = ConnectionPool(dsn, min_size=min_size, max_size=max_size, kwargs={"row_factory": dict_row}, open=True)
        with self._pool.connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS distributed_locks (
                name TEXT PRIMARY KEY, owner TEXT NOT NULL, fencing_token BIGINT NOT NULL,
                lease_until TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)""")

    def close(self) -> None:
        self._pool.close()

    def acquire(self, name: str, owner: str | None = None, lease_seconds: int = 30) -> LockHandle | None:
        owner = owner or str(uuid.uuid4()); now = _now(); until = now + timedelta(seconds=max(1, lease_seconds))
        with self._pool.connection() as db:
            row = db.execute("SELECT * FROM distributed_locks WHERE name=%s FOR UPDATE", (name,)).fetchone()
            if row and row["lease_until"] > now and row["owner"] != owner:
                return None
            token = (row["fencing_token"] + 1) if row else 1
            db.execute("""INSERT INTO distributed_locks(name, owner, fencing_token, lease_until, updated_at)
                VALUES (%s, %s, %s, %s, %s) ON CONFLICT(name) DO UPDATE SET owner=EXCLUDED.owner,
                fencing_token=EXCLUDED.fencing_token, lease_until=EXCLUDED.lease_until, updated_at=EXCLUDED.updated_at""", (name, owner, token, until, now))
        return LockHandle(name, owner, token, until)

    def renew(self, handle: LockHandle, lease_seconds: int = 30) -> LockHandle | None:
        until = _now() + timedelta(seconds=max(1, lease_seconds))
        with self._pool.connection() as db:
            row = db.execute("UPDATE distributed_locks SET lease_until=%s, updated_at=%s WHERE name=%s AND owner=%s AND fencing_token=%s", (until, _now(), handle.name, handle.owner, handle.fencing_token))
            if row.rowcount != 1:
                return None
        return LockHandle(handle.name, handle.owner, handle.fencing_token, until)

    def release(self, handle: LockHandle) -> bool:
        with self._pool.connection() as db:
            row = db.execute("UPDATE distributed_locks SET owner='', lease_until=%s, updated_at=%s WHERE name=%s AND owner=%s AND fencing_token=%s", (_now(), _now(), handle.name, handle.owner, handle.fencing_token))
            return row.rowcount == 1

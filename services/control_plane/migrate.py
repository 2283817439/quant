from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any


class PostgresMigrationRunner:
    """Applies ordered SQL files exactly once under a PostgreSQL advisory lock."""

    def __init__(self, dsn: str, migrations_dir: str | Path | None = None) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("migrations require psycopg[binary] and psycopg-pool") from exc
        root = Path(migrations_dir) if migrations_dir else Path(__file__).resolve().parents[2] / "migrations" / "postgres"
        self.migrations_dir = root
        self._pool = ConnectionPool(
            dsn, min_size=1, max_size=2, kwargs={"row_factory": dict_row}, open=True
        )

    def close(self) -> None:
        self._pool.close()

    def apply(self) -> list[str]:
        files = sorted(self.migrations_dir.glob("*.sql"))
        applied: list[str] = []
        with self._pool.connection() as db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )"""
            )
            db.execute("SELECT pg_advisory_xact_lock(hashtext('quant:postgres:migrations'))")
            known = {row["version"]: row["checksum"] for row in db.execute("SELECT version, checksum FROM schema_migrations")}
            for migration in files:
                sql = migration.read_text(encoding="utf-8")
                checksum = __import__("hashlib").sha256(sql.encode("utf-8")).hexdigest()
                if migration.name in known:
                    if known[migration.name] != checksum:
                        raise RuntimeError(f"migration checksum changed: {migration.name}")
                    continue
                db.execute(sql)
                db.execute(
                    "INSERT INTO schema_migrations(version, checksum) VALUES (%s, %s)",
                    (migration.name, checksum),
                )
                applied.append(migration.name)
        return applied


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply quant PostgreSQL migrations")
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--migrations-dir", default=None)
    args = parser.parse_args()
    runner = PostgresMigrationRunner(args.dsn, args.migrations_dir)
    try:
        for name in runner.apply():
            print(f"applied {name}")
    finally:
        runner.close()


if __name__ == "__main__":
    main()

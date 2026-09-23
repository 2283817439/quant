from __future__ import annotations

import argparse
import asyncio
import hashlib
from pathlib import Path


class TimescaleRetentionManager:
    def __init__(self, dsn: str, migrations_dir: str | Path | None = None) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Timescale maintenance requires psycopg[binary] and psycopg-pool") from exc
        self.migrations_dir = Path(migrations_dir) if migrations_dir else Path(__file__).resolve().parents[2] / "migrations" / "timescale"
        self.pool = ConnectionPool(dsn, min_size=1, max_size=2, kwargs={"row_factory": dict_row}, open=True)

    def apply(self) -> list[str]:
        applied: list[str] = []
        with self.pool.connection() as db:
            db.execute("CREATE TABLE IF NOT EXISTS timescale_schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
            known = {row["version"]: row["checksum"] for row in db.execute("SELECT version, checksum FROM timescale_schema_migrations")}
            for path in sorted(self.migrations_dir.glob("*.sql")):
                checksum = hashlib.sha256(path.read_bytes()).hexdigest()
                if path.name in known:
                    if known[path.name] != checksum: raise RuntimeError(f"Timescale migration checksum changed: {path.name}")
                    continue
                db.execute(path.read_text(encoding="utf-8"))
                db.execute("INSERT INTO timescale_schema_migrations(version, checksum) VALUES (%s, %s)", (path.name, checksum)); applied.append(path.name)
        return applied

    def close(self) -> None:
        self.pool.close()

    async def run_forever(self, interval_seconds: float = 3600) -> None:
        while True:
            await asyncio.to_thread(self.apply)
            await asyncio.sleep(max(60, interval_seconds))


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--dsn", required=True); parser.add_argument("--interval", type=float, default=3600); parser.add_argument("--once", action="store_true")
    args = parser.parse_args(); manager = TimescaleRetentionManager(args.dsn)
    try:
        if args.once: manager.apply()
        else: asyncio.run(manager.run_forever(args.interval))
    finally: manager.close()


if __name__ == "__main__": main()

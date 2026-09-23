from __future__ import annotations

import json
from dataclasses import asdict
from typing import Iterable

from .models import OrderBookSnapshot, TradeEvent


class InMemoryMarketStore:
    def __init__(self) -> None:
        self.trades: list[TradeEvent] = []; self.order_books: list[OrderBookSnapshot] = []

    def append_trades(self, events: Iterable[TradeEvent]) -> int:
        batch = list(events); self.trades.extend(batch); return len(batch)

    def append_order_books(self, snapshots: Iterable[OrderBookSnapshot]) -> int:
        batch = list(snapshots); self.order_books.extend(batch); return len(batch)


class TimescaleMarketStore:
    """Batch writer for PostgreSQL with TimescaleDB hypertables."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 4) -> None:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("TimescaleMarketStore requires psycopg[binary] and psycopg-pool") from exc
        self._pool = ConnectionPool(dsn, min_size=min_size, max_size=max_size, kwargs={"row_factory": dict_row}, open=True)

    def append_trades(self, events: Iterable[TradeEvent]) -> int:
        rows = [(e.timestamp, e.venue, e.symbol, e.trade_id, e.price, e.quantity, e.side, json.dumps(e.raw or {})) for e in events]
        if not rows: return 0
        with self._pool.connection() as db:
            db.executemany("""INSERT INTO market_trades (time, venue, symbol, trade_id, price, quantity, side, raw_json)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT (venue, trade_id, time) DO NOTHING""", rows)
        return len(rows)

    def append_order_books(self, snapshots: Iterable[OrderBookSnapshot]) -> int:
        rows = [(s.timestamp, s.venue, s.symbol, s.sequence, json.dumps([asdict(x) for x in s.bids]), json.dumps([asdict(x) for x in s.asks])) for s in snapshots]
        if not rows: return 0
        with self._pool.connection() as db:
            db.executemany("""INSERT INTO market_order_books (time, venue, symbol, sequence, bids_json, asks_json)
                VALUES (%s,%s,%s,%s,%s::jsonb,%s::jsonb)""", rows)
        return len(rows)

    def close(self) -> None:
        self._pool.close()


class ClickHouseMarketStore:
    """HTTP JSONEachRow batch writer for ClickHouse."""

    def __init__(self, url: str = "http://localhost:8123", database: str = "quant", username: str = "default", password: str = "", timeout: float = 10.0) -> None:
        self.url, self.database, self.auth, self.timeout = url.rstrip("/"), database, (username, password), timeout

    def _insert(self, table: str, rows: list[dict]) -> int:
        if not rows: return 0
        import requests
        body = "".join(json.dumps(row, default=str) + "\n" for row in rows)
        response = requests.post(f"{self.url}/", params={"query": f"INSERT INTO {self.database}.{table} FORMAT JSONEachRow"}, data=body.encode(), auth=self.auth, timeout=self.timeout)
        response.raise_for_status(); return len(rows)

    def append_trades(self, events: Iterable[TradeEvent]) -> int:
        return self._insert("market_trades", [{"time": e.timestamp.isoformat(), "venue": e.venue, "symbol": e.symbol, "trade_id": e.trade_id, "price": e.price, "quantity": e.quantity, "side": e.side or "", "raw_json": json.dumps(e.raw or {})} for e in events])

    def append_order_books(self, snapshots: Iterable[OrderBookSnapshot]) -> int:
        return self._insert("market_order_books", [{"time": s.timestamp.isoformat(), "venue": s.venue, "symbol": s.symbol, "sequence": s.sequence or 0, "bids_json": json.dumps([asdict(x) for x in s.bids]), "asks_json": json.dumps([asdict(x) for x in s.asks])} for s in snapshots])

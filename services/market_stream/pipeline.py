from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterable, Callable
from datetime import datetime, timezone
from typing import Any

from services.liquidity import LiquidityRiskGate
from services.market_data_store import OrderBookSnapshot, TradeEvent
from services.metrics import metrics_registry
from services.streaming import MarketTick

logger = logging.getLogger(__name__)


class RealtimeMarketPersistencePipeline:
    """Consumes live events, batches writes, and updates liquidity risk state."""

    def __init__(self, store: Any, venue: str, batch_size: int = 500, flush_interval: float = 1.0,
                 liquidity_gate: LiquidityRiskGate | None = None,
                 on_liquidity: Callable[[LiquidityRiskGate], Any] | None = None) -> None:
        self.store, self.venue = store, venue
        self.batch_size, self.flush_interval = max(1, batch_size), max(0.05, flush_interval)
        self.liquidity_gate, self.on_liquidity = liquidity_gate, on_liquidity
        self._trades: list[TradeEvent] = []; self._books: list[OrderBookSnapshot] = []
        self._lock = asyncio.Lock(); self._last_flush = datetime.now(timezone.utc)

    async def ingest(self, event: MarketTick | TradeEvent | OrderBookSnapshot) -> None:
        async with self._lock:
            if isinstance(event, MarketTick):
                event = TradeEvent(event.timestamp, self.venue, event.symbol, f"tick-{int(event.timestamp.timestamp() * 1_000_000_000)}", event.price, event.volume)
            if isinstance(event, TradeEvent):
                self._trades.append(event)
            elif isinstance(event, OrderBookSnapshot):
                self._books.append(event)
                if self.liquidity_gate:
                    self.liquidity_gate.update(event)
                    if self.on_liquidity: self.on_liquidity(self.liquidity_gate)
            else:
                raise TypeError(f"unsupported market event: {type(event)!r}")
            metrics_registry.inc_counter("quant_market_events_ingested_total", labels={"venue": self.venue, "type": type(event).__name__})
            metrics_registry.set_gauge("quant_market_buffered_events", len(self._trades) + len(self._books))
            if len(self._trades) + len(self._books) >= self.batch_size:
                await self._flush_locked()

    async def flush(self) -> tuple[int, int]:
        async with self._lock:
            return await self._flush_locked()

    async def _flush_locked(self) -> tuple[int, int]:
        trades, books = self._trades, self._books
        self._trades, self._books = [], []
        if not trades and not books: return 0, 0
        try:
            if trades: await asyncio.to_thread(self.store.append_trades, trades)
            if books: await asyncio.to_thread(self.store.append_order_books, books)
            metrics_registry.inc_counter("quant_market_batches_flushed_total")
            metrics_registry.set_gauge("quant_market_buffered_events", 0)
            self._last_flush = datetime.now(timezone.utc)
            return len(trades), len(books)
        except Exception:
            self._trades[0:0] = trades; self._books[0:0] = books
            metrics_registry.inc_counter("quant_market_write_failures_total")
            raise

    async def run(self, events: AsyncIterable[MarketTick | TradeEvent | OrderBookSnapshot], stop_event: asyncio.Event | None = None) -> None:
        stop_event = stop_event or asyncio.Event()
        async def periodic_flush() -> None:
            while not stop_event.is_set():
                try: await asyncio.wait_for(stop_event.wait(), timeout=self.flush_interval)
                except asyncio.TimeoutError:
                    try: await self.flush()
                    except Exception: logger.exception("market batch flush failed")
        flusher = asyncio.create_task(periodic_flush())
        try:
            async for event in events:
                await self.ingest(event)
                if stop_event.is_set(): break
        finally:
            stop_event.set(); flusher.cancel(); await asyncio.gather(flusher, return_exceptions=True)
            await self.flush()

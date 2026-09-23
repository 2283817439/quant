from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Iterable

from services.streaming import MarketTick

logger = logging.getLogger(__name__)


class BinanceWebSocketAdapter:
    """Public Binance trade stream adapter; normalizes trades into MarketTick."""

    def __init__(self, symbols: Iterable[str], base_url: str = "wss://stream.binance.com:9443/stream",
                 reconnect_initial: float = 1.0, reconnect_max: float = 30.0) -> None:
        self.symbols = tuple(symbol.lower().replace("/", "") for symbol in symbols)
        if not self.symbols:
            raise ValueError("at least one Binance symbol is required")
        self.base_url = base_url
        self.reconnect_initial = max(0.1, reconnect_initial)
        self.reconnect_max = max(self.reconnect_initial, reconnect_max)
        self._stop = asyncio.Event()

    @property
    def stream_url(self) -> str:
        streams = "/".join(f"{symbol}@trade" for symbol in self.symbols)
        return f"{self.base_url}?streams={streams}"

    @staticmethod
    def parse_trade_message(message: str | bytes) -> MarketTick:
        payload = json.loads(message)
        data = payload.get("data", payload)
        timestamp_ms = int(data.get("T", data.get("E", 0)))
        return MarketTick(
            symbol=str(data["s"]).upper(),
            price=float(data["p"]),
            volume=float(data["q"]),
            timestamp=datetime.fromtimestamp(timestamp_ms / 1000, timezone.utc),
        )

    async def ticks(self):
        """Yield normalized ticks forever until stop() or cancellation."""
        try:
            import websockets
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Binance adapter requires websockets") from exc
        delay = self.reconnect_initial
        while not self._stop.is_set():
            try:
                async with websockets.connect(self.stream_url, ping_interval=20, ping_timeout=20) as socket:
                    delay = self.reconnect_initial
                    async for message in socket:
                        if self._stop.is_set():
                            break
                        yield self.parse_trade_message(message)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - reconnect is the adapter contract
                logger.warning("Binance stream disconnected: %s; retrying in %.1fs", exc, delay)
                if not self._stop.is_set():
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=delay)
                    except asyncio.TimeoutError:
                        pass
                delay = min(self.reconnect_max, delay * 2)

    async def run(self, on_tick: Callable[[MarketTick], Any | Awaitable[Any]]) -> None:
        async for tick in self.ticks():
            result = on_tick(tick)
            if asyncio.iscoroutine(result):
                await result

    def stop(self) -> None:
        self._stop.set()

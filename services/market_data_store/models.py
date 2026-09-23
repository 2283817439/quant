from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class TradeEvent:
    timestamp: datetime
    venue: str
    symbol: str
    trade_id: str
    price: float
    quantity: float
    side: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class OrderBookLevel:
    price: float
    quantity: float


@dataclass(frozen=True)
class OrderBookSnapshot:
    timestamp: datetime
    venue: str
    symbol: str
    bids: tuple[OrderBookLevel, ...]
    asks: tuple[OrderBookLevel, ...]
    sequence: int | None = None

    @property
    def best_bid(self) -> float | None:
        return max((level.price for level in self.bids), default=None)

    @property
    def best_ask(self) -> float | None:
        return min((level.price for level in self.asks), default=None)

    @property
    def mid_price(self) -> float | None:
        if self.best_bid is None or self.best_ask is None:
            return None
        return (self.best_bid + self.best_ask) / 2

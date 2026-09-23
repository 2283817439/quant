from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any


class OrderSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderState(StrEnum):
    ACCEPTED = "accepted"
    NEW = "new"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELED = "canceled"
    REJECTED = "rejected"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class OrderRequest:
    symbol: str
    side: OrderSide
    quantity: float
    order_type: str = "MARKET"
    limit_price: float | None = None
    strategy_id: str = "unknown"
    client_order_id: str | None = None
    reduce_only: bool = False

    def notional(self, reference_price: float | None = None) -> float:
        price = self.limit_price or reference_price
        if price is None:
            raise ValueError("a reference price is required for market-order risk checks")
        return abs(self.quantity * price)


@dataclass(frozen=True)
class OrderResult:
    venue: str
    exchange_order_id: str
    client_order_id: str | None
    state: OrderState
    filled_quantity: float = 0.0
    average_price: float | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OrderUpdate:
    venue: str
    exchange_order_id: str
    state: OrderState
    filled_quantity: float
    average_price: float | None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    raw: dict[str, Any] = field(default_factory=dict)

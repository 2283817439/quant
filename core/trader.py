"""Broker-neutral trade executor used by the API bridge.

The real QMT integration can be attached through ``bind``.  This module keeps
API startup independent from the optional vendor SDK and provides a small,
safe in-memory adapter for health checks and local development.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class _LocalTrader:
    """Minimal query surface expected by ``web_api.LiveBridgeSession``."""

    asset: dict[str, Any] = field(default_factory=lambda: {
        "total_asset": 0.0,
        "available_cash": 0.0,
        "market_value": 0.0,
        "frozen_cash": 0.0,
    })

    def query_stock_asset(self, _account: Any) -> dict[str, Any]:
        return dict(self.asset)

    def query_stock_positions(self, _account: Any) -> list[dict[str, Any]]:
        return []


class TradeExecutor:
    """Lifecycle wrapper for an optional broker connection.

    ``start`` intentionally does not claim a live broker connection; callers
    must provide a vendor-specific trader through ``bind``.  This prevents a
    local development process from placing orders accidentally.
    """

    def __init__(self, _database: Any = None) -> None:
        self._database = _database
        self._engine: Any = None
        self._trader: Any = _LocalTrader()
        self._account: Any = None
        self._account_id: str = ""
        self.status = False

    def bind(self, engine: Any) -> None:
        self._engine = engine

    def start(self) -> bool:
        # A bound engine may replace _trader during vendor integration.  The
        # local adapter remains read-only and is suitable for smoke tests.
        self.status = True
        return True

    def disconnect(self) -> None:
        self.status = False
        self._engine = None

    @staticmethod
    def _split_order(order: Any, num_slices: int) -> list[Any]:
        if num_slices <= 0:
            raise ValueError("num_slices must be positive")
        if order.volume <= 0:
            raise ValueError("order volume must be positive")
        base, remainder = divmod(order.volume, num_slices)
        if base == 0:
            raise ValueError("num_slices cannot exceed order volume")
        children = []
        for index in range(num_slices):
            child = order.copy()
            child.volume = base + (1 if index < remainder else 0)
            child.order_id = index + 1
            children.append(child)
        return children

    def execute_twap(self, order: Any, duration_minutes: int, num_slices: int) -> list[Any]:
        if duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")
        return self._split_order(order, num_slices)

    def execute_vwap(self, order: Any, duration_minutes: int, volume_profile: str = "uniform") -> list[Any]:
        if volume_profile != "uniform":
            raise ValueError("only the uniform volume profile is available without a broker adapter")
        return self.execute_twap(order, duration_minutes, max(1, duration_minutes // 5))

    def submit_order(self, *_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("No broker adapter is configured; order submission is disabled")

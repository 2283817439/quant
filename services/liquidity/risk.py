from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from services.market_data_store import OrderBookSnapshot
from services.metrics import metrics_registry
from services.monitoring import monitoring_registry


@dataclass(frozen=True)
class LiquidityMetrics:
    symbol: str
    spread_bps: float
    bid_depth: float
    ask_depth: float
    imbalance: float
    mid_price: float | None
    estimated_impact_bps: float


@dataclass(frozen=True)
class LiquidityDecision:
    allowed: bool
    action: Literal["allow", "reduce", "block"]
    reason: str
    max_quantity: float | None
    metrics: LiquidityMetrics


def _depth(levels, mid: float, band_bps: float) -> float:
    threshold = mid * band_bps / 10_000
    return sum(level.quantity for level in levels if abs(level.price - mid) <= threshold)


def compute_liquidity_metrics(snapshot: OrderBookSnapshot, order_quantity: float = 0.0, band_bps: float = 50.0) -> LiquidityMetrics:
    mid = snapshot.mid_price
    if mid is None or mid <= 0:
        return LiquidityMetrics(snapshot.symbol, float("inf"), 0.0, 0.0, 0.0, None, float("inf"))
    best_bid, best_ask = snapshot.best_bid or mid, snapshot.best_ask or mid
    spread_bps = max(0.0, (best_ask - best_bid) / mid * 10_000)
    bid_depth, ask_depth = _depth(snapshot.bids, mid, band_bps), _depth(snapshot.asks, mid, band_bps)
    total = bid_depth + ask_depth
    imbalance = (bid_depth - ask_depth) / total if total else 0.0
    side_depth = min(bid_depth, ask_depth) if order_quantity <= 0 else max(min(bid_depth, ask_depth), 1e-12)
    impact = (order_quantity / side_depth * 10_000) if side_depth else float("inf")
    return LiquidityMetrics(snapshot.symbol, spread_bps, bid_depth, ask_depth, imbalance, mid, impact)


class LiquidityRiskGate:
    def __init__(self, max_spread_bps: float = 30.0, min_depth: float = 1.0,
                 max_impact_bps: float = 100.0, reduce_at_fraction: float = 0.5) -> None:
        self.max_spread_bps, self.min_depth, self.max_impact_bps = max_spread_bps, min_depth, max_impact_bps
        self.reduce_at_fraction = min(max(reduce_at_fraction, 0.1), 0.95)
        self.latest: dict[str, LiquidityMetrics] = {}

    def update(self, snapshot: OrderBookSnapshot) -> LiquidityMetrics:
        metrics = compute_liquidity_metrics(snapshot)
        self.latest[snapshot.symbol] = metrics
        labels = {"symbol": snapshot.symbol}
        metrics_registry.set_gauge("quant_liquidity_spread_bps", metrics.spread_bps, labels)
        metrics_registry.set_gauge("quant_liquidity_bid_depth", metrics.bid_depth, labels)
        metrics_registry.set_gauge("quant_liquidity_ask_depth", metrics.ask_depth, labels)
        metrics_registry.set_gauge("quant_liquidity_imbalance", metrics.imbalance, labels)
        monitoring_registry.liquidity(snapshot.symbol, {
            "spread_bps": metrics.spread_bps,
            "bid_depth": metrics.bid_depth,
            "ask_depth": metrics.ask_depth,
            "imbalance": metrics.imbalance,
            "mid_price": metrics.mid_price,
            "estimated_impact_bps": metrics.estimated_impact_bps,
        })
        return metrics

    def check(self, symbol: str, quantity: float, snapshot: OrderBookSnapshot | None = None) -> LiquidityDecision:
        metrics = self.update(snapshot) if snapshot is not None else self.latest.get(symbol)
        if metrics is None:
            return LiquidityDecision(False, "block", "no recent order-book snapshot", 0.0, LiquidityMetrics(symbol, float("inf"), 0, 0, 0, None, float("inf")))
        metrics = compute_liquidity_metrics(snapshot, quantity) if snapshot is not None else metrics
        if metrics.spread_bps > self.max_spread_bps:
            return LiquidityDecision(False, "block", "spread exceeds limit", 0.0, metrics)
        if min(metrics.bid_depth, metrics.ask_depth) < self.min_depth:
            return LiquidityDecision(False, "block", "market depth below limit", 0.0, metrics)
        if metrics.estimated_impact_bps > self.max_impact_bps:
            return LiquidityDecision(False, "block", "estimated market impact exceeds limit", 0.0, metrics)
        if metrics.estimated_impact_bps > self.max_impact_bps * self.reduce_at_fraction:
            allowed = min(metrics.bid_depth, metrics.ask_depth) * self.max_impact_bps * self.reduce_at_fraction / max(metrics.estimated_impact_bps, 1e-12)
            return LiquidityDecision(True, "reduce", "order size reduced by liquidity impact", allowed, metrics)
        return LiquidityDecision(True, "allow", "liquidity within limits", quantity, metrics)

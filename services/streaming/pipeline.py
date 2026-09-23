from __future__ import annotations

import asyncio
import math
import statistics
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, AsyncIterable, Callable

from services.metrics import metrics_registry


@dataclass(frozen=True)
class MarketTick:
    symbol: str
    price: float
    volume: float
    timestamp: datetime


@dataclass(frozen=True)
class IncrementalEvaluation:
    symbol: str
    timestamp: datetime
    signal: float
    return_1: float
    equity: float
    cumulative_return: float
    max_drawdown: float
    observations: int

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class StreamingFactorEngine:
    def __init__(self, window: int = 32) -> None:
        if window < 3:
            raise ValueError("window must be at least 3")
        self.window = window
        self._prices: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=window))
        self._volumes: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=window))

    def update(self, tick: MarketTick) -> dict[str, float]:
        if tick.price <= 0 or tick.volume < 0:
            raise ValueError("tick price must be positive and volume non-negative")
        prices, volumes = self._prices[tick.symbol], self._volumes[tick.symbol]
        previous = prices[-1] if prices else tick.price
        prices.append(float(tick.price)); volumes.append(float(tick.volume))
        return_1 = tick.price / previous - 1.0 if previous else 0.0
        base = prices[0]
        returns = [prices[i] / prices[i - 1] - 1.0 for i in range(1, len(prices)) if prices[i - 1] > 0]
        volume_mean = statistics.fmean(volumes) if volumes else 0.0
        volume_std = statistics.pstdev(volumes) if len(volumes) > 1 else 0.0
        return {
            "price": float(tick.price), "return_1": return_1,
            "momentum": tick.price / base - 1.0 if base else 0.0,
            "volatility": statistics.pstdev(returns) if len(returns) > 1 else 0.0,
            "volume_zscore": (tick.volume - volume_mean) / volume_std if volume_std else 0.0,
            "sample_count": float(len(prices)),
        }


class StreamingEvaluationPipeline:
    """Consumes live ticks and evaluates a signal function without full reruns."""

    def __init__(self, signal_function: Callable[[dict[str, float]], float], window: int = 32,
                 initial_equity: float = 1.0, on_evaluation: Callable[[IncrementalEvaluation], Any] | None = None) -> None:
        self.factor_engine = StreamingFactorEngine(window)
        self.signal_function = signal_function
        self.on_evaluation = on_evaluation
        self.equity = initial_equity
        self._peak = initial_equity
        self._previous_price: dict[str, float] = {}
        self._returns: deque[float] = deque(maxlen=window * 10)
        self._observations = 0
        self.latest: IncrementalEvaluation | None = None

    def process(self, tick: MarketTick) -> IncrementalEvaluation:
        factors = self.factor_engine.update(tick)
        signal = max(-1.0, min(1.0, float(self.signal_function(factors))))
        previous = self._previous_price.get(tick.symbol, tick.price)
        market_return = tick.price / previous - 1.0 if previous else 0.0
        strategy_return = signal * market_return
        self.equity *= 1.0 + strategy_return
        self._peak = max(self._peak, self.equity)
        drawdown = max(0.0, (self._peak - self.equity) / self._peak) if self._peak else 0.0
        self._previous_price[tick.symbol] = tick.price
        self._returns.append(strategy_return); self._observations += 1
        evaluation = IncrementalEvaluation(tick.symbol, tick.timestamp, signal, market_return, self.equity, self.equity - 1.0, drawdown, self._observations)
        self.latest = evaluation
        metrics_registry.inc_counter("quant_market_ticks_total", labels={"symbol": tick.symbol})
        metrics_registry.set_gauge("quant_incremental_equity", self.equity)
        metrics_registry.set_gauge("quant_incremental_drawdown", drawdown)
        if self.on_evaluation:
            result = self.on_evaluation(evaluation)
            if asyncio.iscoroutine(result):
                raise RuntimeError("async on_evaluation requires process_async")
        return evaluation

    async def process_async(self, tick: MarketTick) -> IncrementalEvaluation:
        result = self.process(tick)
        return result

    async def run(self, ticks: AsyncIterable[MarketTick]) -> None:
        async for tick in ticks:
            await self.process_async(tick)

    def snapshot(self) -> dict[str, Any]:
        latest = self.latest.as_dict() if self.latest else None
        mean_return = statistics.fmean(self._returns) if self._returns else 0.0
        volatility = statistics.pstdev(self._returns) if len(self._returns) > 1 else 0.0
        return {"latest": latest, "observations": self._observations, "equity": self.equity, "mean_return": mean_return, "volatility": volatility}

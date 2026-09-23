import asyncio
from datetime import datetime, timezone

import pytest

from ai import get_ai_assistant
from config.config import config
from services.liquidity import LiquidityRiskGate, compute_liquidity_metrics
from services.market_data_store import InMemoryMarketStore, OrderBookLevel, OrderBookSnapshot
from services.market_stream import RealtimeMarketPersistencePipeline
from services.intelligence import QuantIntelligenceEngine, Regime
from services.streaming import MarketTick


def book():
    now = datetime.now(timezone.utc)
    return OrderBookSnapshot(now, "paper", "BTCUSDT", (OrderBookLevel(99.9, 10),), (OrderBookLevel(100.1, 10),), 1)


def test_liquidity_metrics_and_fail_closed_gate():
    snapshot = book(); metrics = compute_liquidity_metrics(snapshot, 1)
    assert metrics.mid_price == 100.0 and metrics.spread_bps == pytest.approx(20)
    gate = LiquidityRiskGate(max_spread_bps=10)
    decision = gate.check("BTCUSDT", 1, snapshot)
    assert not decision.allowed and decision.action == "block"


def test_realtime_pipeline_flushes_ticks_and_books():
    async def run():
        store = InMemoryMarketStore(); gate = LiquidityRiskGate(max_spread_bps=30)
        pipeline = RealtimeMarketPersistencePipeline(store, "paper", batch_size=10, liquidity_gate=gate)
        await pipeline.ingest(MarketTick("BTCUSDT", 100, 1, datetime.now(timezone.utc)))
        await pipeline.ingest(book()); await pipeline.flush()
        assert len(store.trades) == 1 and len(store.order_books) == 1
        assert gate.latest["BTCUSDT"].mid_price == 100
    asyncio.run(run())


def test_ai_engine_is_explainable_and_size_aware():
    engine = QuantIntelligenceEngine()
    insight = engine.analyze({"momentum": 0.04, "volatility": 0.01, "spread_bps": 5, "depth": 20}, {"momentum": 0.8, "ml": 0.6})
    assert insight.regime == Regime.TRENDING_UP and insight.action == "buy"
    assistant = get_ai_assistant(config)
    assert assistant.recommend_position_size({"spread_bps": 200, "depth": 1}, 10) == 0

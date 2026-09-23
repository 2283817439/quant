import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from services.ml import HotReloadingRLPolicy, OnlineRLPolicy
from services.monitoring import MonitoringRegistry


def test_online_rl_updates_and_hot_reloads(tmp_path):
    path = tmp_path / "rl.json"
    policy = OnlineRLPolicy(epsilon=0)
    policy.train_history([{"context": "trending_up", "action": "buy", "reward": 1.0}] * 5)
    policy.save(path)
    hot = HotReloadingRLPolicy(path, OnlineRLPolicy(epsilon=0))
    assert hot.reload_if_changed()
    assert hot.decide("trending_up", explore=False).action == "buy"
    state = json.loads(path.read_text()); state["values"]["trending_up"]["sell"] = 2.0; path.write_text(json.dumps(state))
    assert hot.reload_if_changed()
    assert hot.decide("trending_up", explore=False).action == "sell"


def test_monitoring_snapshot_contains_ai_and_liquidity():
    registry = MonitoringRegistry(); registry.ai_insight({"regime": "range", "confidence": 0.8, "recommended_size_multiplier": 1.0}); registry.liquidity("BTCUSDT", {"spread_bps": 5})
    snapshot = registry.snapshot()
    assert snapshot["ai_insight"]["regime"] == "range"
    assert snapshot["liquidity"][0]["spread_bps"] == 5


def test_timescale_retention_sql_declares_aggregates_and_retention():
    sql = Path("migrations/timescale/002_retention_downsampling.sql").read_text()
    assert "continuous" in sql and "add_retention_policy" in sql and "time_bucket" in sql

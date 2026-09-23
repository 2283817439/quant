import json
from datetime import timezone
from pathlib import Path

from services.market_adapters import BinanceWebSocketAdapter
from services.scaling import BacklogSnapshot, WorkerScalingPolicy


def test_binance_trade_message_is_normalized():
    tick = BinanceWebSocketAdapter.parse_trade_message('{"stream":"btcusdt@trade","data":{"e":"trade","s":"BTCUSDT","p":"65000.10","q":"0.01","T":1700000000000}}')
    assert tick.symbol == "BTCUSDT"
    assert tick.price == 65000.10
    assert tick.volume == 0.01
    assert tick.timestamp.tzinfo == timezone.utc
    assert BinanceWebSocketAdapter(["BTC/USDT"]).stream_url.endswith("streams=btcusdt@trade")


def test_backlog_scaling_policy_bounds_and_cooldown():
    policy = WorkerScalingPolicy(min_workers=2, max_workers=10, target_backlog_per_worker=10, scale_down_cooldown_seconds=60)
    assert policy.desired_workers(BacklogSnapshot(75), 2, now=100) == 8
    assert policy.desired_workers(BacklogSnapshot(0), 8, now=120, last_scale_at=100) == 8
    assert policy.desired_workers(BacklogSnapshot(0), 8, now=200, last_scale_at=100) == 2


def test_grafana_dashboard_is_valid_and_has_core_panels():
    dashboard = json.loads(Path("monitoring/grafana/quant-operations-dashboard.json").read_text())
    titles = {panel["title"] for panel in dashboard["panels"]}
    assert {"Production Strategies", "Queue Backlog", "Incremental Equity", "Task Lease States"}.issubset(titles)
    assert dashboard["refresh"] == "5s"

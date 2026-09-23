from datetime import datetime, timezone

from services.distributed_backtest import BacktestWorkerHandler, DistributedBacktestCluster, InMemoryResultStore
from services.market_data_store import InMemoryMarketStore, OrderBookLevel, OrderBookSnapshot, TradeEvent


class FakeQueue:
    def __init__(self): self.jobs = []
    def enqueue(self, task_type, payload, max_attempts=3, task_id=None, **kwargs):
        self.jobs.append((task_type, payload, task_id)); return task_id


def test_grid_is_split_idempotently_and_aggregated():
    queue, store = FakeQueue(), InMemoryResultStore()
    cluster = DistributedBacktestCluster(queue, store)
    jobs = cluster.submit_grid("exp-1", {"short": [5, 10], "long": [20, 50]}, "daily.csv")
    assert len(jobs) == 4 and len({job.trial_id for job in jobs}) == 4
    handler = BacktestWorkerHandler(lambda params, dataset: {"sharpe_ratio": params["short"] / params["long"]}, store)
    for _, payload, _ in queue.jobs: handler(payload)
    ranked = cluster.aggregate("exp-1")
    assert ranked[0].metrics["sharpe_ratio"] == 0.5


def test_market_store_preserves_trades_and_order_book_levels():
    store = InMemoryMarketStore(); timestamp = datetime.now(timezone.utc)
    trade = TradeEvent(timestamp, "binance", "BTCUSDT", "1", 65000, 0.01, "buy")
    book = OrderBookSnapshot(timestamp, "binance", "BTCUSDT", (OrderBookLevel(64999, 1),), (OrderBookLevel(65001, 2),), 7)
    assert store.append_trades([trade]) == 1
    assert store.append_order_books([book]) == 1
    assert store.order_books[0].mid_price == 65000

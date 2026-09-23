from datetime import datetime, timedelta, timezone

import pytest

from services.coordination import SqliteLockManager
from services.feedback import EvaluationMetrics, EvaluationStore, FeedbackLoop
from services.task_queue import SqliteTaskQueue


def test_lock_competition_and_fencing(tmp_path):
    locks = SqliteLockManager(tmp_path / "locks.db")
    first = locks.acquire("backtest", owner="node-a", lease_seconds=30)
    assert first is not None
    assert locks.acquire("backtest", owner="node-b", lease_seconds=30) is None
    assert locks.release(first) is True
    second = locks.acquire("backtest", owner="node-b", lease_seconds=30)
    assert second is not None and second.fencing_token > first.fencing_token
    assert locks.renew(first) is None


def test_stale_worker_cannot_ack_after_lease_replacement(tmp_path):
    queue = SqliteTaskQueue(tmp_path / "tasks.db")
    task_id = queue.enqueue("job", {})
    first = queue.claim("node-a", lease_seconds=1)
    assert first and first.lease_token
    with queue._connection() as db:
        db.execute("UPDATE task_queue SET lease_until=? WHERE id=?", ((datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(), task_id))
    second = queue.claim("node-b", lease_seconds=30)
    assert second and second.lease_token != first.lease_token
    with pytest.raises(RuntimeError):
        queue.complete(task_id, "node-a", {}, first.lease_token)
    queue.complete(task_id, "node-b", {}, second.lease_token)
    assert queue.counts()["succeeded"] == 1


def test_feedback_loop_finds_best_parameters(tmp_path):
    store = EvaluationStore(tmp_path / "eval.db")

    def evaluate(params):
        distance = abs(params["fast"] - 3.0) + abs(params["slow"] - 7.0)
        return EvaluationMetrics(
            sharpe=3.0 - distance,
            max_drawdown=0.05 + distance * 0.01,
            out_of_sample_return=0.2 - distance * 0.02,
            trade_count=100,
            stability_score=0.9,
        )

    result = FeedbackLoop(store, evaluate).optimize(
        "mean_reversion", {"fast": (1.0, 5.0), "slow": (5.0, 9.0)}, iterations=20, initial_points=9
    )
    assert result.best_trial.metrics.sharpe >= 2.0
    assert len(store.list_trials("mean_reversion")) == 20
    assert store.best("mean_reversion").trial_id == result.best_trial.trial_id

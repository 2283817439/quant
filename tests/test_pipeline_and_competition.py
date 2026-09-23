from concurrent.futures import ThreadPoolExecutor

from services.control_plane import CanaryHealth, CandidateMetrics, ControlPlaneStore, StrategyLifecycle, StrategyPromotionPipeline
from services.task_queue import SqliteTaskQueue


def metrics():
    return CandidateMetrics(1.5, 0.08, 0.12, 100, turnover=4.0, stability_score=0.85)


def test_shadow_canary_production_pipeline(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    pipeline = StrategyPromotionPipeline(StrategyLifecycle(store))
    result = pipeline.run("alpha", "v1", "sha256:alpha", metrics(), CanaryHealth(0.04, 0, 0.005, 0.05))
    assert result.status == "promoted"
    assert result.stages == ("candidate", "shadow", "canary", "production")
    assert store.list_strategies()[0]["status"] == "promoted"


def test_canary_failure_never_reaches_production(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    pipeline = StrategyPromotionPipeline(StrategyLifecycle(store))
    result = pipeline.run("alpha", "v2", "sha256:alpha2", metrics(), CanaryHealth(0.15, 0, 0.0, 0.0))
    assert result.status == "rejected"
    assert result.reason == "canary_drawdown_limit"
    assert result.stages == ("candidate", "shadow")
    assert store.list_strategies()[0]["status"] == "rejected"


def test_many_nodes_only_one_claims_task(tmp_path):
    queue = SqliteTaskQueue(tmp_path / "tasks.db")
    queue.enqueue("backtest", {"strategy": "alpha"})
    def claim(node):
        task = queue.claim(node, lease_seconds=30)
        return task.id if task else None
    with ThreadPoolExecutor(max_workers=8) as executor:
        claimed = list(executor.map(claim, [f"node-{i}" for i in range(8)]))
    assert [item for item in claimed if item] == [claimed[next(i for i, item in enumerate(claimed) if item)]]

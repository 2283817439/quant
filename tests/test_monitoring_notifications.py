from services.control_plane import CanaryHealth, CandidateMetrics, ControlPlaneStore, StrategyLifecycle, StrategyPromotionPipeline
from services.monitoring import MonitoringRegistry
from services.notifications import CompositeNotifier, PromotionNotification


class RecordingNotifier:
    def __init__(self):
        self.events = []

    def send(self, notification):
        self.events.append(notification)


def good_metrics():
    return CandidateMetrics(1.5, 0.08, 0.12, 100, turnover=4.0, stability_score=0.85)


def test_pipeline_updates_monitor_and_notifies_success(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    monitor = MonitoringRegistry()
    notifier = RecordingNotifier()
    pipeline = StrategyPromotionPipeline(StrategyLifecycle(store), monitor=monitor, notifier=notifier)
    result = pipeline.run("alpha", "v1", "sha256:a", good_metrics(), CanaryHealth(0.03, 0))
    assert result.status == "promoted"
    assert notifier.events[0].event == "strategy.production"
    snapshot = monitor.snapshot()
    assert snapshot["production_strategies"][0]["strategy_id"] == "alpha"


def test_pipeline_notifies_canary_rejection(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    notifier = RecordingNotifier()
    pipeline = StrategyPromotionPipeline(StrategyLifecycle(store), notifier=notifier)
    result = pipeline.run("alpha", "v2", "sha256:b", good_metrics(), CanaryHealth(0.20, 0))
    assert result.status == "rejected"
    assert notifier.events[0].event == "strategy.rejected"
    assert notifier.events[0].reason == "canary_drawdown_limit"


def test_composite_notifier_fail_open():
    class Broken:
        def send(self, _):
            raise RuntimeError("offline")
    CompositeNotifier(Broken(), fail_open=True).send(PromotionNotification("x", "s", "v", "rejected"))

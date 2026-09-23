from datetime import datetime, timezone
from pathlib import Path

from services.metrics import PrometheusRegistry, refresh_operational_metrics
from services.monitoring import MonitoringRegistry
from services.streaming import MarketTick, StreamingEvaluationPipeline, StreamingFactorEngine


def test_prometheus_render_and_operational_gauges():
    registry = PrometheusRegistry()
    registry.set_gauge("quant_test_gauge", 2, {"role": "worker"})
    registry.inc_counter("quant_test_total", labels={"kind": "tick"})
    text = registry.render()
    assert "# TYPE quant_test_gauge gauge" in text
    assert 'quant_test_gauge{role="worker"} 2' in text
    monitor = MonitoringRegistry()
    monitor.strategy("s", "v1", "promoted")
    refresh_operational_metrics(monitor.snapshot())


def test_streaming_factors_and_incremental_evaluation():
    engine = StreamingFactorEngine(window=4)
    now = datetime.now(timezone.utc)
    first = engine.update(MarketTick("AAA", 100, 10, now))
    second = engine.update(MarketTick("AAA", 101, 12, now))
    assert first["sample_count"] == 1
    assert second["return_1"] > 0
    pipeline = StreamingEvaluationPipeline(lambda factors: 1.0 if factors["momentum"] > 0 else 0.0)
    pipeline.process(MarketTick("AAA", 100, 10, now))
    result = pipeline.process(MarketTick("AAA", 102, 11, now))
    assert result.signal == 1.0
    assert result.equity > 1.0
    assert pipeline.snapshot()["observations"] == 2


def test_compose_contains_required_services():
    compose = Path("docker-compose.yml").read_text()
    for service in ("postgres:", "redis:", "api:", "worker-1:", "worker-2:"):
        assert service in compose
    assert "TASK_QUEUE_BACKEND: redis" in compose

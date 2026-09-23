import pytest

from services.execution import ExecutionGateway, ExecutionRiskPolicy, OrderRequest, OrderSide, OrderState, PaperExecutionAdapter
from services.ml import AdaptiveFactorEnsemble


def test_paper_gateway_routes_and_emits_status():
    events = []
    gateway = ExecutionGateway(
        {"paper": PaperExecutionAdapter(lambda _: 100.0)},
        policy=ExecutionRiskPolicy(max_order_notional=1_000, max_daily_notional=2_000),
        price_provider=lambda _: 100.0,
        on_update=events.append,
    )
    result = gateway.submit(OrderRequest("BTCUSDT", OrderSide.BUY, 2, strategy_id="s1"))
    assert result.state == OrderState.FILLED
    assert events[0].state == OrderState.FILLED
    with pytest.raises(PermissionError):
        gateway.submit(OrderRequest("BTCUSDT", OrderSide.BUY, 20))


def test_gateway_kill_switch_is_fail_closed():
    gateway = ExecutionGateway({"paper": PaperExecutionAdapter()}, kill_switch=lambda: True, price_provider=lambda _: 1)
    with pytest.raises(PermissionError, match="kill switch"):
        gateway.submit(OrderRequest("BTCUSDT", OrderSide.BUY, 1))


def test_adaptive_ensemble_changes_weights_after_feedback():
    model = AdaptiveFactorEnsemble(["momentum", "value"], learning_rate=0.5)
    first = model.predict({"momentum": 1.0, "value": 0.0})
    model.update(1.0, {"momentum": 1.0, "value": 0.0})
    second = model.predict({"momentum": 1.0, "value": 0.0})
    assert second.weights["momentum"] > first.weights["momentum"]
    assert abs(sum(second.weights.values()) - 1.0) < 1e-9

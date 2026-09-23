from services.control_plane import CandidateMetrics, ControlPlaneStore, StrategyLifecycle


def test_event_chain_and_promotion_gate(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    lifecycle = StrategyLifecycle(store)
    metrics = CandidateMetrics(
        sharpe=1.4,
        max_drawdown=0.12,
        out_of_sample_return=0.08,
        trade_count=80,
        turnover=4.0,
        stability_score=0.85,
    )
    lifecycle.register_candidate("rotation", "2026.09.23-001", "sha256:abc", metrics)
    lifecycle.promote_to_shadow("rotation", "2026.09.23-001")
    result = lifecycle.promote_to_production("rotation", "2026.09.23-001", metrics)
    assert result.accepted is True
    assert store.list_strategies()[0]["status"] == "promoted"
    assert store.verify_event_chain() is True


def test_failed_candidate_is_rejected(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    lifecycle = StrategyLifecycle(store)
    metrics = CandidateMetrics(
        sharpe=0.2,
        max_drawdown=0.45,
        out_of_sample_return=-0.1,
        trade_count=4,
        risk_breaches=1,
    )
    lifecycle.register_candidate("bad", "v1", "sha256:bad", metrics)
    result = lifecycle.promote_to_canary("bad", "v1", metrics)
    assert result.accepted is False
    assert set(result.reasons) >= {"sharpe", "max_drawdown", "risk_breaches"}
    assert store.list_strategies()[0]["status"] == "rejected"


def test_kill_switch_blocks_production(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    store.set_flag("kill_switch", "on", "test")
    lifecycle = StrategyLifecycle(store)
    metrics = CandidateMetrics(1.4, 0.12, 0.08, 80, turnover=4.0, stability_score=0.85)
    lifecycle.register_candidate("safe", "v1", "sha256:safe", metrics)
    result = lifecycle.promote_to_production("safe", "v1", metrics)
    assert result.accepted is False
    assert result.reasons == ("kill_switch_enabled",)

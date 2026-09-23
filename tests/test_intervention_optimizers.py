from services.control_plane import ControlPlaneStore, LiveInterventionController
from services.feedback import BayesianOptimizer, EvaluationMetrics, EvaluationStore, GeneticOptimizer


class FakeExecution:
    def __init__(self):
        self.actions = []

    def cancel_all(self):
        self.actions.append("cancel_all")

    def flatten_all(self):
        self.actions.append("flatten_all")


def test_kill_switch_intervention_blocks_and_clears(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    execution = FakeExecution()
    controller = LiveInterventionController(store, execution)
    result = controller.trigger_from_risk(0.25, 0.20, source="risk-test")
    assert result and controller.can_submit_orders() is False
    assert execution.actions == ["cancel_all"]
    assert "block_new_orders" in result.actions
    assert controller.trigger_from_risk(0.30, 0.20) is None
    cleared = controller.clear_kill_switch("operator acknowledged", source="test")
    assert cleared.activated is False
    assert controller.can_submit_orders() is True
    assert store.verify_event_chain() is True


def test_manual_intervention_can_flatten_positions(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    execution = FakeExecution()
    result = LiveInterventionController(store, execution).activate_kill_switch("incident", flatten=True)
    assert execution.actions == ["cancel_all", "flatten_all"]
    assert "flatten_positions" in result.actions


def evaluate(params):
    distance = abs(params["x"] - 0.7) + abs(params["y"] - 0.3)
    return EvaluationMetrics(2.5 - distance * 3, 0.05 + distance * 0.1, 0.15 - distance * 0.1, 100, stability_score=0.9)


def test_genetic_and_bayesian_optimizers_record_feedback(tmp_path):
    store = EvaluationStore(tmp_path / "eval.db")
    genetic = GeneticOptimizer(store, evaluate, seed=3)
    _, genetic_best, genetic_trials, _ = genetic.optimize("ga", {"x": (0.0, 1.0), "y": (0.0, 1.0)}, generations=4, population_size=6)
    assert len(genetic_trials) == 24
    assert genetic_best.metrics.sharpe > 1.0

    bayesian = BayesianOptimizer(store, evaluate, seed=4)
    _, bayes_best, bayes_trials, _ = bayesian.optimize("bo", {"x": (0.0, 1.0), "y": (0.0, 1.0)}, iterations=12, initial_points=4)
    assert len(bayes_trials) == 12
    assert bayes_best.metrics.sharpe > 0.5
    assert len(store.list_trials("ga")) == 24
    assert len(store.list_trials("bo")) == 12

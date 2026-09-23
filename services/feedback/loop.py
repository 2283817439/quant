from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any, Callable

from .models import EvaluationMetrics, ParameterTrial
from .store import EvaluationStore

Evaluator = Callable[[dict[str, Any]], EvaluationMetrics]


@dataclass(frozen=True)
class OptimizationResult:
    strategy_id: str
    best_trial: ParameterTrial
    trials: tuple[ParameterTrial, ...]
    objective: str


class FeedbackLoop:
    """Backtest-driven, bounded parameter search with persistent feedback.

    The evaluator is deliberately injected: production uses a replayable
    backtest service, while tests can use a deterministic simulator. Search is
    adaptive after the initial grid: it refines around the best observed point
    and records every result for later warm starts and auditability.
    """

    def __init__(self, store: EvaluationStore, evaluator: Evaluator) -> None:
        self.store = store
        self.evaluator = evaluator

    def optimize(self, strategy_id: str, bounds: dict[str, tuple[float, float]],
                 iterations: int = 20, objective: str = "risk_adjusted_return",
                 initial_points: int = 8) -> OptimizationResult:
        if not bounds or iterations < 1:
            raise ValueError("bounds and positive iterations are required")
        if any(low >= high for low, high in bounds.values()):
            raise ValueError("each parameter must have low < high")
        candidates = self._initial_candidates(bounds, min(initial_points, iterations))
        trials: list[ParameterTrial] = []
        best: ParameterTrial | None = None
        for index in range(iterations):
            params = candidates[index] if index < len(candidates) else self._refine(bounds, best.parameters if best else self._midpoint(bounds), index)
            metrics = self.evaluator(params)
            score = self.score(metrics, objective)
            trial = self.store.record(strategy_id, params, metrics, score, "exploration" if index < len(candidates) else "refinement")
            trials.append(trial)
            if best is None or trial.score > best.score:
                best = trial
        assert best is not None
        return OptimizationResult(strategy_id, best, tuple(trials), objective)

    @staticmethod
    def score(metrics: EvaluationMetrics, objective: str) -> float:
        if objective == "sharpe":
            return metrics.sharpe
        if objective == "return":
            return metrics.out_of_sample_return
        if objective == "min_drawdown":
            return -metrics.max_drawdown
        if objective != "risk_adjusted_return":
            raise ValueError(f"unsupported objective: {objective}")
        # Penalize drawdown, turnover and risk breaches; reward stable OOS results.
        return (metrics.sharpe + metrics.out_of_sample_return + 0.25 * metrics.stability_score
                - 1.5 * metrics.max_drawdown - 0.02 * metrics.turnover
                - 2.0 * metrics.risk_breaches)

    @staticmethod
    def _midpoint(bounds: dict[str, tuple[float, float]]) -> dict[str, float]:
        return {name: (low + high) / 2 for name, (low, high) in bounds.items()}

    @staticmethod
    def _initial_candidates(bounds: dict[str, tuple[float, float]], count: int) -> list[dict[str, float]]:
        levels = []
        for low, high in bounds.values():
            levels.append([low, (low + high) / 2, high])
        grid = [dict(zip(bounds.keys(), values)) for values in itertools.product(*levels)]
        midpoint = FeedbackLoop._midpoint(bounds)
        ordered = [midpoint] + [item for item in grid if item != midpoint]
        return ordered[:count]

    @staticmethod
    def _refine(bounds: dict[str, tuple[float, float]], center: dict[str, Any], iteration: int) -> dict[str, float]:
        params: dict[str, float] = {}
        radius = 0.25 / (1 + iteration // max(1, len(bounds)))
        for name, (low, high) in bounds.items():
            value = float(center[name])
            direction = -1.0 if (iteration + sum(ord(c) for c in name)) % 2 else 1.0
            value += direction * (high - low) * radius
            params[name] = max(low, min(high, value))
        return params

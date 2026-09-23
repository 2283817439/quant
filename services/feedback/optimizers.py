from __future__ import annotations

import random
from typing import Any

from .models import EvaluationMetrics, ParameterTrial
from .store import EvaluationStore


class GeneticOptimizer:
    """Deterministic bounded genetic optimizer over a backtest evaluator."""

    def __init__(self, store: EvaluationStore, evaluator, seed: int = 7) -> None:
        self.store = store
        self.evaluator = evaluator
        self.random = random.Random(seed)

    def optimize(self, strategy_id: str, bounds: dict[str, tuple[float, float]],
                 generations: int = 8, population_size: int = 8, mutation_rate: float = 0.25,
                 objective: str = "risk_adjusted_return"):
        if not bounds or generations < 1 or population_size < 2:
            raise ValueError("bounds, generations, and population_size are required")
        names = list(bounds)
        population = [self._random_point(bounds) for _ in range(population_size)]
        trials: list[ParameterTrial] = []
        for generation in range(generations):
            scored = []
            for params in population:
                metrics = self.evaluator(params)
                score = self._score(metrics, objective)
                trial = self.store.record(strategy_id, params, metrics, score, f"genetic:g{generation}")
                trials.append(trial); scored.append((score, params))
            scored.sort(key=lambda item: item[0], reverse=True)
            elites = [params for _, params in scored[:max(2, population_size // 2)]]
            next_population = elites[:]
            while len(next_population) < population_size:
                left = self.random.choice(elites); right = self.random.choice(elites)
                child = {name: (left[name] + right[name]) / 2 for name in names}
                for name, (low, high) in bounds.items():
                    if self.random.random() < mutation_rate:
                        child[name] += self.random.uniform(-0.15, 0.15) * (high - low)
                    child[name] = max(low, min(high, child[name]))
                next_population.append(child)
            population = next_population
        best = max(trials, key=lambda trial: trial.score)
        return strategy_id, best, tuple(trials), objective

    def _random_point(self, bounds):
        return {name: self.random.uniform(low, high) for name, (low, high) in bounds.items()}

    @staticmethod
    def _score(metrics: EvaluationMetrics, objective: str) -> float:
        if objective == "sharpe": return metrics.sharpe
        if objective == "return": return metrics.out_of_sample_return
        if objective == "min_drawdown": return -metrics.max_drawdown
        return (metrics.sharpe + metrics.out_of_sample_return + 0.25 * metrics.stability_score
                - 1.5 * metrics.max_drawdown - 0.02 * metrics.turnover - 2.0 * metrics.risk_breaches)


class BayesianOptimizer:
    """Lightweight deterministic Bayesian-style optimizer.

    It uses a kernel-weighted surrogate over completed trials and chooses the
    next point by upper confidence bound. This keeps the dependency footprint
    small while providing exploitation/exploration feedback from prior trials.
    """

    def __init__(self, store: EvaluationStore, evaluator, seed: int = 11) -> None:
        self.store = store
        self.evaluator = evaluator
        self.random = random.Random(seed)

    def optimize(self, strategy_id: str, bounds: dict[str, tuple[float, float]],
                 iterations: int = 20, initial_points: int = 5, kappa: float = 1.5,
                 objective: str = "risk_adjusted_return"):
        if iterations < max(2, initial_points) or not bounds:
            raise ValueError("iterations must be >= initial_points >= 2")
        names = list(bounds)
        candidates = [self._random_point(bounds) for _ in range(iterations * 8)]
        trials: list[ParameterTrial] = []
        observed: list[tuple[dict[str, float], float]] = []
        for index in range(iterations):
            if index < initial_points:
                point = candidates[index]
                phase = "bayesian:initial"
            else:
                point = max(candidates, key=lambda candidate: self._ucb(candidate, observed, bounds, kappa))
                candidates.remove(point); phase = "bayesian:acquisition"
            metrics = self.evaluator(point)
            score = GeneticOptimizer._score(metrics, objective)
            trial = self.store.record(strategy_id, point, metrics, score, phase)
            trials.append(trial); observed.append((point, score))
        best = max(trials, key=lambda trial: trial.score)
        return strategy_id, best, tuple(trials), objective

    def _random_point(self, bounds):
        return {name: self.random.uniform(low, high) for name, (low, high) in bounds.items()}

    @staticmethod
    def _ucb(point, observed, bounds, kappa):
        if not observed:
            return 0.0
        distances = []
        for params, score in observed:
            distance = sum(((point[name] - params[name]) / (high - low)) ** 2 for name, (low, high) in bounds.items())
            weight = max(1e-6, 1.0 / (1.0 + distance * 20.0))
            distances.append((weight, score))
        total = sum(weight for weight, _ in distances)
        mean = sum(weight * score for weight, score in distances) / total
        variance = sum(weight * (score - mean) ** 2 for weight, score in distances) / total
        return mean + kappa * (variance ** 0.5) + 0.05 / (1.0 + total)

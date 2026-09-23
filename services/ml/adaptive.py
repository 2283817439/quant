from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import Any, Iterable

from services.metrics import metrics_registry


@dataclass(frozen=True)
class ModelPrediction:
    score: float
    weights: dict[str, float]
    backend: str
    observations: int


class AdaptiveFactorEnsemble:
    """Online factor combiner; updates weights from realized forward returns."""

    def __init__(self, factor_names: Iterable[str], learning_rate: float = 0.05, decay: float = 0.995) -> None:
        self.factor_names = tuple(factor_names)
        if not self.factor_names or learning_rate <= 0 or not 0 < decay <= 1:
            raise ValueError("invalid adaptive ensemble configuration")
        self.learning_rate, self.decay = learning_rate, decay
        self._logits = {name: 0.0 for name in self.factor_names}
        self._last_factors: dict[str, float] | None = None
        self._observations = 0

    def _weights(self) -> dict[str, float]:
        maximum = max(self._logits.values())
        exps = {name: math.exp(value - maximum) for name, value in self._logits.items()}
        total = sum(exps.values()) or 1.0
        return {name: value / total for name, value in exps.items()}

    def predict(self, factors: dict[str, float]) -> ModelPrediction:
        values = {name: float(factors.get(name, 0.0)) for name in self.factor_names}
        weights = self._weights(); score = sum(weights[name] * values[name] for name in self.factor_names)
        self._last_factors = values; self._observations += 1
        metrics_registry.set_gauge("quant_ml_factor_score", score)
        metrics_registry.set_gauge("quant_ml_model_observations", self._observations)
        return ModelPrediction(score, weights, "online_softmax", self._observations)

    def update(self, realized_return: float, factors: dict[str, float] | None = None) -> ModelPrediction | None:
        values = factors or self._last_factors
        if values is None:
            return None
        prediction = self.predict(values)
        error = float(realized_return) - prediction.score
        for name in self.factor_names:
            self._logits[name] = self.decay * self._logits[name] + self.learning_rate * error * values.get(name, 0.0)
        return ModelPrediction(prediction.score, self._weights(), "online_softmax", self._observations)

    def weights(self) -> dict[str, float]:
        return self._weights()


class XGBoostRealtimeFactorModel:
    """Optional rolling XGBoost regressor; dependency is loaded only when selected."""

    def __init__(self, factor_names: Iterable[str], retrain_every: int = 25, max_samples: int = 2000) -> None:
        self.factor_names = tuple(factor_names); self.retrain_every = max(1, retrain_every)
        self.features: deque[list[float]] = deque(maxlen=max_samples); self.targets: deque[float] = deque(maxlen=max_samples)
        self.model: Any = None; self.observations = 0

    def _vector(self, factors: dict[str, float]) -> list[float]:
        return [float(factors.get(name, 0.0)) for name in self.factor_names]

    def update(self, factors: dict[str, float], realized_return: float) -> None:
        try:
            from xgboost import XGBRegressor
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("XGBoost backend requires optional xgboost package") from exc
        self.features.append(self._vector(factors)); self.targets.append(float(realized_return)); self.observations += 1
        if len(self.features) >= max(10, len(self.factor_names) * 3) and self.observations % self.retrain_every == 0:
            self.model = XGBRegressor(n_estimators=80, max_depth=3, learning_rate=0.05, objective="reg:squarederror", n_jobs=1, random_state=7)
            self.model.fit(list(self.features), list(self.targets), verbose=False)

    def predict(self, factors: dict[str, float]) -> float:
        if self.model is None:
            return 0.0
        return float(self.model.predict([self._vector(factors)])[0])

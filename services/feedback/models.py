from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class EvaluationMetrics:
    sharpe: float
    max_drawdown: float
    out_of_sample_return: float
    trade_count: int
    turnover: float = 0.0
    stability_score: float = 1.0
    risk_breaches: int = 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    def as_candidate_metrics(self):
        """Convert evaluation output to the control-plane promotion contract."""
        from services.control_plane.models import CandidateMetrics

        return CandidateMetrics(
            sharpe=self.sharpe,
            max_drawdown=self.max_drawdown,
            out_of_sample_return=self.out_of_sample_return,
            trade_count=self.trade_count,
            risk_breaches=self.risk_breaches,
            turnover=self.turnover,
            stability_score=self.stability_score,
        )


@dataclass(frozen=True)
class ParameterTrial:
    trial_id: int
    strategy_id: str
    parameters: dict[str, Any]
    metrics: EvaluationMetrics
    score: float
    phase: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "trial_id": self.trial_id,
            "strategy_id": self.strategy_id,
            "parameters": self.parameters,
            "metrics": self.metrics.as_dict(),
            "score": self.score,
            "phase": self.phase,
        }

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class CandidateMetrics:
    """Metrics required before a strategy can leave research state."""

    sharpe: float
    max_drawdown: float
    out_of_sample_return: float
    trade_count: int
    risk_breaches: int = 0
    turnover: float = 0.0
    stability_score: float = 1.0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PromotionPolicy:
    """Conservative default gate; values are fractions, not percentages."""

    min_sharpe: float = 1.0
    max_drawdown: float = 0.20
    min_out_of_sample_return: float = 0.0
    min_trade_count: int = 30
    max_risk_breaches: int = 0
    max_turnover: float = 12.0
    min_stability_score: float = 0.60


@dataclass(frozen=True)
class PromotionResult:
    strategy_id: str
    version: str
    accepted: bool
    reasons: tuple[str, ...] = field(default_factory=tuple)
    checks: dict[str, bool] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "strategy_id": self.strategy_id,
            "version": self.version,
            "accepted": self.accepted,
            "reasons": list(self.reasons),
            "checks": self.checks,
            "metrics": self.metrics,
        }

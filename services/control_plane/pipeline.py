from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .lifecycle import StrategyLifecycle
from .models import CandidateMetrics, PromotionResult
from services.notifications import PromotionNotification


@dataclass(frozen=True)
class CanaryHealth:
    max_drawdown: float
    risk_breaches: int
    fill_error_rate: float = 0.0
    signal_drift: float = 0.0


@dataclass(frozen=True)
class PipelinePolicy:
    max_canary_drawdown: float = 0.10
    max_canary_risk_breaches: int = 0
    max_fill_error_rate: float = 0.02
    max_signal_drift: float = 0.20


@dataclass(frozen=True)
class PipelineResult:
    strategy_id: str
    version: str
    status: str
    stages: tuple[str, ...]
    reason: str | None = None
    promotion: PromotionResult | None = None


class StrategyPromotionPipeline:
    """Automates guarded Shadow -> Canary -> Production promotion."""

    def __init__(self, lifecycle: StrategyLifecycle, policy: PipelinePolicy | None = None, monitor: Any | None = None, notifier: Any | None = None) -> None:
        self.lifecycle = lifecycle
        self.policy = policy or PipelinePolicy()
        self.monitor = monitor
        self.notifier = notifier

    def _notify(self, notification: PromotionNotification) -> None:
        if self.notifier:
            self.notifier.send(notification)

    def run(self, strategy_id: str, version: str, artifact_uri: str,
            research_metrics: CandidateMetrics, canary_health: CanaryHealth) -> PipelineResult:
        self.lifecycle.register_candidate(strategy_id, version, artifact_uri, research_metrics)
        stages = ["candidate"]
        if self.monitor:
            self.monitor.strategy(strategy_id, version, "candidate", artifact_uri=artifact_uri)
        self.lifecycle.promote_to_shadow(strategy_id, version)
        stages.append("shadow")
        if self.monitor:
            self.monitor.strategy(strategy_id, version, "shadow")
        health_reason = self._check_canary_health(canary_health)
        if health_reason:
            self.lifecycle.store.set_status(strategy_id, version, "rejected", self.lifecycle._correlation_id())
            if self.monitor:
                self.monitor.strategy(strategy_id, version, "rejected", reason=health_reason)
            self._notify(PromotionNotification("strategy.rejected", strategy_id, version, "rejected", health_reason, tuple(stages)))
            return PipelineResult(strategy_id, version, "rejected", tuple(stages), health_reason)
        canary = self.lifecycle.promote_to_canary(strategy_id, version, research_metrics)
        if not canary.accepted:
            if self.monitor:
                self.monitor.strategy(strategy_id, version, "rejected", reason="research_gate_failed")
            self._notify(PromotionNotification("strategy.rejected", strategy_id, version, "rejected", "research_gate_failed", tuple(stages)))
            return PipelineResult(strategy_id, version, "rejected", tuple(stages), "research_gate_failed", canary)
        stages.append("canary")
        if self.monitor:
            self.monitor.strategy(strategy_id, version, "canary")
        production = self.lifecycle.promote_to_production(strategy_id, version, research_metrics)
        if not production.accepted:
            if self.monitor:
                self.monitor.strategy(strategy_id, version, "rejected", reason=",".join(production.reasons))
            self._notify(PromotionNotification("strategy.rejected", strategy_id, version, "rejected", ",".join(production.reasons), tuple(stages)))
            return PipelineResult(strategy_id, version, "rejected", tuple(stages), ",".join(production.reasons), production)
        stages.append("production")
        if self.monitor:
            self.monitor.strategy(strategy_id, version, "promoted")
        self._notify(PromotionNotification("strategy.production", strategy_id, version, "promoted", stages=tuple(stages)))
        return PipelineResult(strategy_id, version, "promoted", tuple(stages), promotion=production)

    def _check_canary_health(self, health: CanaryHealth) -> str | None:
        policy = self.policy
        if health.max_drawdown > policy.max_canary_drawdown:
            return "canary_drawdown_limit"
        if health.risk_breaches > policy.max_canary_risk_breaches:
            return "canary_risk_breach"
        if health.fill_error_rate > policy.max_fill_error_rate:
            return "canary_fill_error_rate"
        if health.signal_drift > policy.max_signal_drift:
            return "canary_signal_drift"
        return None

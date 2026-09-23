from __future__ import annotations

from uuid import uuid4

from .models import CandidateMetrics, PromotionPolicy, PromotionResult
from .store import ControlPlaneStore


class StrategyLifecycle:
    """State machine for research -> shadow -> canary -> production.

    A candidate can only be promoted after deterministic metric checks pass.
    AI may propose a candidate, but it cannot bypass this service.
    """

    def __init__(self, store: ControlPlaneStore, policy: PromotionPolicy | None = None) -> None:
        self.store = store
        self.policy = policy or PromotionPolicy()

    def register_candidate(self, strategy_id: str, version: str, artifact_uri: str,
                           metrics: CandidateMetrics) -> None:
        self.store.register_strategy(
            strategy_id, version, artifact_uri, metrics.as_dict(), self._correlation_id()
        )

    def evaluate(self, strategy_id: str, version: str,
                 metrics: CandidateMetrics) -> PromotionResult:
        policy = self.policy
        checks = {
            "sharpe": metrics.sharpe >= policy.min_sharpe,
            "max_drawdown": metrics.max_drawdown <= policy.max_drawdown,
            "out_of_sample_return": metrics.out_of_sample_return >= policy.min_out_of_sample_return,
            "trade_count": metrics.trade_count >= policy.min_trade_count,
            "risk_breaches": metrics.risk_breaches <= policy.max_risk_breaches,
            "turnover": metrics.turnover <= policy.max_turnover,
            "stability_score": metrics.stability_score >= policy.min_stability_score,
        }
        reasons = tuple(name for name, passed in checks.items() if not passed)
        result = PromotionResult(
            strategy_id=strategy_id,
            version=version,
            accepted=not reasons,
            reasons=reasons,
            checks=checks,
            metrics=metrics.as_dict(),
        )
        self.store.append_event(
            "strategy.evaluated", f"{strategy_id}:{version}", result.as_dict(), self._correlation_id()
        )
        return result

    def promote_to_shadow(self, strategy_id: str, version: str) -> None:
        self.store.set_status(strategy_id, version, "shadow", self._correlation_id())

    def promote_to_canary(self, strategy_id: str, version: str, metrics: CandidateMetrics) -> PromotionResult:
        result = self.evaluate(strategy_id, version, metrics)
        if result.accepted:
            self.store.set_status(strategy_id, version, "canary", self._correlation_id())
        else:
            self.store.set_status(strategy_id, version, "rejected", self._correlation_id())
        return result

    def promote_to_production(self, strategy_id: str, version: str, metrics: CandidateMetrics) -> PromotionResult:
        result = self.evaluate(strategy_id, version, metrics)
        if result.accepted and self.store.get_flag("kill_switch", "off") != "on":
            self.store.set_status(strategy_id, version, "promoted", self._correlation_id())
            return result
        if result.accepted:
            result = PromotionResult(
                strategy_id=strategy_id,
                version=version,
                accepted=False,
                reasons=("kill_switch_enabled",),
                checks=result.checks,
                metrics=result.metrics,
            )
        self.store.set_status(strategy_id, version, "rejected", self._correlation_id())
        return result

    def rollback(self, strategy_id: str, version: str, reason: str) -> None:
        self.store.set_status(strategy_id, version, "rolled_back", self._correlation_id())
        self.store.append_event(
            "strategy.rollback_requested", f"{strategy_id}:{version}",
            {"reason": reason}, self._correlation_id()
        )

    @staticmethod
    def _correlation_id() -> str:
        return str(uuid4())

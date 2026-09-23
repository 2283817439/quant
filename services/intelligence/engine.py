from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Any

from services.metrics import metrics_registry


class Regime(StrEnum):
    TRENDING_UP = "trending_up"
    TRENDING_DOWN = "trending_down"
    RANGE = "range"
    HIGH_VOLATILITY = "high_volatility"
    ILLIQUID = "illiquid"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class AIInsight:
    regime: Regime
    score: float
    confidence: float
    action: str
    risk_level: str
    reasons: tuple[str, ...]
    recommended_size_multiplier: float

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class QuantIntelligenceEngine:
    """Deterministic, explainable AI layer for real-time decision support."""

    def __init__(self, confidence_threshold: float = 0.55) -> None:
        self.confidence_threshold = confidence_threshold

    def classify_regime(self, factors: dict[str, float]) -> Regime:
        volatility = abs(float(factors.get("volatility", 0)))
        momentum = float(factors.get("momentum", factors.get("return_1", 0)))
        spread = float(factors.get("spread_bps", 0))
        depth = float(factors.get("depth", factors.get("bid_depth", 0)))
        if depth <= 0 or spread > 100:
            return Regime.ILLIQUID
        if volatility > 0.04:
            return Regime.HIGH_VOLATILITY
        if momentum > 0.02:
            return Regime.TRENDING_UP
        if momentum < -0.02:
            return Regime.TRENDING_DOWN
        return Regime.RANGE

    def analyze(self, factors: dict[str, float], signals: dict[str, float] | None = None) -> AIInsight:
        signals = signals or {"momentum": float(factors.get("momentum", 0)), "value": float(factors.get("value", 0)), "ml": float(factors.get("ml_score", 0))}
        clean = [max(-1.0, min(1.0, float(value))) for value in signals.values()]
        score = sum(clean) / len(clean) if clean else 0.0
        dispersion = max(clean) - min(clean) if clean else 1.0
        regime = self.classify_regime(factors)
        confidence = max(0.0, min(1.0, (1.0 - dispersion / 2.0) * min(1.0, len(clean) / 3.0)))
        reasons = []
        if regime == Regime.ILLIQUID: reasons.append("盘口流动性不足或价差过宽")
        if regime == Regime.HIGH_VOLATILITY: reasons.append("滚动波动率处于高位")
        if score > 0: reasons.append("多因子合成信号偏多")
        elif score < 0: reasons.append("多因子合成信号偏空")
        else: reasons.append("多因子信号缺乏方向一致性")
        if dispersion > 1.0: reasons.append("因子分歧较大，降低置信度")
        blocked = regime == Regime.ILLIQUID or confidence < self.confidence_threshold
        action = "hold" if blocked else ("buy" if score > 0.15 else "sell" if score < -0.15 else "hold")
        risk_level = "high" if regime in {Regime.ILLIQUID, Regime.HIGH_VOLATILITY} else "medium" if confidence < 0.75 else "low"
        multiplier = 0.0 if regime == Regime.ILLIQUID else 0.5 if regime == Regime.HIGH_VOLATILITY or confidence < self.confidence_threshold else 1.0
        insight = AIInsight(regime, score, confidence, action, risk_level, tuple(reasons), multiplier)
        metrics_registry.set_gauge("quant_ai_confidence", confidence)
        metrics_registry.set_gauge("quant_ai_signal_score", score)
        metrics_registry.inc_counter("quant_ai_insights_total", labels={"regime": regime.value, "action": action})
        return insight

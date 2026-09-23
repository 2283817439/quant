"""Small, deterministic AI facade with an offline rule-based fallback."""
from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

from services.intelligence import AIInsight, QuantIntelligenceEngine
from services.ml import HotReloadingRLPolicy


class QuantAssistant:
    def __init__(self, config: Any, database: Any = None) -> None:
        self.config = config
        self.database = database
        self.llm_provider = config.get("ai.llm_provider", "rules")
        self.intelligence = QuantIntelligenceEngine(
            float(config.get("ai.confidence_threshold", 0.55))
        )
        rl_path = config.get("ai.rl_model_path")
        self.rl_policy = HotReloadingRLPolicy(Path(rl_path)) if rl_path else None

    def call_llm(self, prompt: str, max_tokens: int = 200) -> str:
        del max_tokens
        # Network/model calls are intentionally opt-in.  A deterministic answer
        # keeps health checks and backtests functional without Ollama/API keys.
        if self.llm_provider not in {"local", "openai", "rules"}:
            return self._rule_answer(prompt)
        if self.llm_provider == "rules":
            return self._rule_answer(prompt)
        return self._rule_answer(prompt) + "（当前使用离线规则引擎；配置模型后可启用 LLM。）"

    def analyze_market(self, factors: dict[str, float], signals: dict[str, float] | None = None) -> AIInsight:
        """Return structured regime, confidence, action, and risk guidance."""
        return self.intelligence.analyze(factors, signals)

    def explain_signal(self, factors: dict[str, float], signals: dict[str, float] | None = None) -> dict[str, Any]:
        return self.analyze_market(factors, signals).as_dict()

    def recommend_position_size(self, factors: dict[str, float], base_size: float, signals: dict[str, float] | None = None) -> float:
        if base_size < 0:
            raise ValueError("base_size must be non-negative")
        return base_size * self.analyze_market(factors, signals).recommended_size_multiplier

    def analyze_with_rl(self, factors: dict[str, float], signals: dict[str, float] | None = None) -> dict[str, Any]:
        insight = self.analyze_market(factors, signals)
        if self.rl_policy is None:
            return {"insight": insight.as_dict(), "rl": None}
        decision = self.rl_policy.decide(insight.regime.value, explore=False)
        if decision.action == "hold":
            insight = replace(insight, action="hold", recommended_size_multiplier=0.0,
                              reasons=insight.reasons + ("Online RL 策略建议观望",))
        return {"insight": insight.as_dict(), "rl": {"action": decision.action, "value": decision.value, "confidence": decision.confidence}}

    def update_rl_from_backtest(self, samples: list[dict[str, Any]], persist: bool = True) -> int:
        if self.rl_policy is None:
            return 0
        count = 0
        for sample in samples:
            self.rl_policy.update(str(sample["context"]), str(sample["action"]), float(sample["reward"]), persist=False)
            count += 1
        if persist:
            self.rl_policy.policy.save(self.rl_policy.path)
        return count

    @staticmethod
    def _rule_answer(prompt: str) -> str:
        if "风控" in prompt:
            return "风控检查应覆盖仓位上限、单日亏损、最大回撤、订单合法性、流动性和交易频率。"
        if "策略" in prompt:
            return "制定交易策略应先明确假设，再进行数据清洗、回测、压力测试和小规模仿真，最后设置风险边界。"
        if "预测" in prompt or "走势" in prompt:
            return "市场走势无法可靠确定；建议结合趋势、波动率和风险预算，并避免仅凭单一指标交易。"
        return "这是量化系统的离线规则助手。请提供策略、数据或风险约束，我会给出可执行的分析建议。"


def get_ai_assistant(config: Any, database: Any = None) -> QuantAssistant:
    return QuantAssistant(config, database)

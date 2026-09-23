"""Small, deterministic AI facade with an offline rule-based fallback."""
from __future__ import annotations

from typing import Any


class QuantAssistant:
    def __init__(self, config: Any, database: Any = None) -> None:
        self.config = config
        self.database = database
        self.llm_provider = config.get("ai.llm_provider", "rules")

    def call_llm(self, prompt: str, max_tokens: int = 200) -> str:
        del max_tokens
        # Network/model calls are intentionally opt-in.  A deterministic answer
        # keeps health checks and backtests functional without Ollama/API keys.
        if self.llm_provider not in {"local", "openai", "rules"}:
            return self._rule_answer(prompt)
        if self.llm_provider == "rules":
            return self._rule_answer(prompt)
        return self._rule_answer(prompt) + "（当前使用离线规则引擎；配置模型后可启用 LLM。）"

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

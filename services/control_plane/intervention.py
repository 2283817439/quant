from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from .store import ControlPlaneStore


class ExecutionIntervention(Protocol):
    def cancel_all(self) -> Any: ...
    def flatten_all(self) -> Any: ...


@dataclass(frozen=True)
class InterventionResult:
    activated: bool
    mode: str
    reason: str
    correlation_id: str
    actions: tuple[str, ...]


class LiveInterventionController:
    """Fail-closed intervention boundary; real broker adapters are injected."""

    def __init__(self, store: ControlPlaneStore, execution: ExecutionIntervention | None = None) -> None:
        self.store = store
        self.execution = execution

    def can_submit_orders(self) -> bool:
        return self.store.get_flag("kill_switch", "off") != "on"

    def activate_kill_switch(self, reason: str, source: str = "operator", flatten: bool = False) -> InterventionResult:
        correlation_id = str(uuid4())
        self.store.set_flag("kill_switch", "on", correlation_id)
        self.store.append_event("trading.intervention_activated", source, {
            "mode": "kill_switch", "reason": reason, "flatten": flatten,
        }, correlation_id)
        actions = ["block_new_orders"]
        if self.execution is not None:
            self.execution.cancel_all()
            actions.append("cancel_all_orders")
            if flatten:
                self.execution.flatten_all()
                actions.append("flatten_positions")
        return InterventionResult(True, "kill_switch", reason, correlation_id, tuple(actions))

    def clear_kill_switch(self, reason: str, source: str = "operator") -> InterventionResult:
        correlation_id = str(uuid4())
        self.store.set_flag("kill_switch", "off", correlation_id)
        self.store.append_event("trading.intervention_cleared", source, {"reason": reason}, correlation_id)
        return InterventionResult(False, "normal", reason, correlation_id, ("allow_after_gates",))

    def trigger_from_risk(self, drawdown: float, threshold: float, source: str = "risk-service") -> InterventionResult | None:
        if drawdown < threshold or self.store.get_flag("kill_switch", "off") == "on":
            return None
        return self.activate_kill_switch(
            reason=f"drawdown {drawdown:.4f} >= threshold {threshold:.4f}",
            source=source,
            flatten=False,
        )

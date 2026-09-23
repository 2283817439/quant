from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import RLock
from typing import Any, Iterable

from services.metrics import metrics_registry


@dataclass(frozen=True)
class RLDecision:
    context: str
    action: str
    value: float
    confidence: float
    exploration: bool


class OnlineRLPolicy:
    """Small contextual bandit suitable for online feedback and safe hot reload."""

    def __init__(self, actions: Iterable[str] = ("buy", "hold", "sell"), learning_rate: float = 0.08,
                 epsilon: float = 0.05) -> None:
        self.actions = tuple(actions); self.learning_rate = learning_rate; self.epsilon = epsilon
        self._values: dict[str, dict[str, float]] = {}; self._counts: dict[str, dict[str, int]] = {}; self._lock = RLock()

    def decide(self, context: str, explore: bool = True) -> RLDecision:
        import random
        with self._lock:
            values = self._values.setdefault(context, {action: 0.0 for action in self.actions})
            counts = self._counts.setdefault(context, {action: 0 for action in self.actions})
            exploring = explore and random.random() < self.epsilon
            action = random.choice(self.actions) if exploring else max(self.actions, key=lambda item: values[item])
            confidence = min(1.0, counts[action] / 20.0)
            return RLDecision(context, action, values[action], confidence, exploring)

    def update(self, context: str, action: str, reward: float) -> None:
        if action not in self.actions:
            raise ValueError(f"unknown action: {action}")
        with self._lock:
            values = self._values.setdefault(context, {item: 0.0 for item in self.actions})
            counts = self._counts.setdefault(context, {item: 0 for item in self.actions})
            values[action] += self.learning_rate * (float(reward) - values[action]); counts[action] += 1
            metrics_registry.inc_counter("quant_rl_updates_total", labels={"action": action, "context": context})
            metrics_registry.set_gauge("quant_rl_reward", float(reward))

    def train_history(self, samples: Iterable[dict[str, Any]]) -> int:
        count = 0
        for sample in samples:
            self.update(str(sample["context"]), str(sample["action"]), float(sample["reward"])); count += 1
        return count

    def state_dict(self) -> dict[str, Any]:
        with self._lock:
            return {"actions": self.actions, "learning_rate": self.learning_rate, "epsilon": self.epsilon, "values": self._values, "counts": self._counts}

    def load_state_dict(self, state: dict[str, Any]) -> None:
        with self._lock:
            if tuple(state.get("actions", self.actions)) != self.actions:
                raise ValueError("RL action space mismatch")
            self._values = {str(k): {str(a): float(v) for a, v in value.items()} for k, value in state.get("values", {}).items()}
            self._counts = {str(k): {str(a): int(v) for a, v in value.items()} for k, value in state.get("counts", {}).items()}

    def save(self, path: str | Path) -> None:
        target = Path(path); target.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(self.state_dict(), handle, ensure_ascii=False, sort_keys=True); handle.flush(); os.fsync(handle.fileno())
            os.replace(temp, target)
        finally:
            if os.path.exists(temp): os.unlink(temp)


class HotReloadingRLPolicy:
    def __init__(self, path: str | Path, policy: OnlineRLPolicy | None = None) -> None:
        self.path = Path(path); self.policy = policy or OnlineRLPolicy(); self._mtime_ns: int | None = None

    def reload_if_changed(self) -> bool:
        if not self.path.exists(): return False
        mtime = self.path.stat().st_mtime_ns
        if self._mtime_ns == mtime: return False
        state = json.loads(self.path.read_text(encoding="utf-8")); self.policy.load_state_dict(state); self._mtime_ns = mtime
        metrics_registry.inc_counter("quant_rl_model_reload_total"); return True

    def decide(self, context: str, explore: bool = False) -> RLDecision:
        self.reload_if_changed(); return self.policy.decide(context, explore)

    def update(self, context: str, action: str, reward: float, persist: bool = True) -> None:
        self.reload_if_changed(); self.policy.update(context, action, reward)
        if persist: self.policy.save(self.path); self._mtime_ns = self.path.stat().st_mtime_ns

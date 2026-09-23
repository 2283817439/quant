from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Callable

from .models import OrderRequest, OrderResult, OrderState, OrderUpdate


@dataclass(frozen=True)
class ExecutionRiskPolicy:
    max_order_notional: float = 10_000.0
    max_daily_notional: float = 100_000.0
    allowed_symbols: frozenset[str] | None = None


class ExecutionGateway:
    """Fail-closed router: risk check -> venue selection -> submit -> status callback."""

    def __init__(self, adapters: dict[str, Any], policy: ExecutionRiskPolicy | None = None,
                 kill_switch: Callable[[], bool] | None = None,
                 price_provider: Callable[[str], float] | None = None,
                 liquidity_gate: Any | None = None,
                 on_update: Callable[[OrderUpdate], Any] | None = None) -> None:
        if not adapters:
            raise ValueError("at least one execution adapter is required")
        self.adapters = adapters; self.policy = policy or ExecutionRiskPolicy(); self.kill_switch = kill_switch or (lambda: False); self.price_provider = price_provider or (lambda _symbol: 0.0); self.liquidity_gate = liquidity_gate; self.on_update = on_update; self.daily_notional = 0.0

    def _validate(self, request: OrderRequest) -> float:
        if self.kill_switch():
            raise PermissionError("kill switch is enabled")
        if request.quantity <= 0:
            raise ValueError("order quantity must be positive")
        if request.order_type.upper() == "LIMIT" and (request.limit_price is None or request.limit_price <= 0):
            raise ValueError("limit orders require a positive limit_price")
        symbol = request.symbol.upper().replace("/", "")
        if self.policy.allowed_symbols is not None and symbol not in self.policy.allowed_symbols:
            raise PermissionError(f"symbol is not allowed: {symbol}")
        notional = request.notional(self.price_provider(symbol))
        if notional > self.policy.max_order_notional:
            raise PermissionError("order exceeds max_order_notional")
        if self.daily_notional + notional > self.policy.max_daily_notional:
            raise PermissionError("order exceeds max_daily_notional")
        return notional

    def _select(self, request: OrderRequest, venues: list[str] | None = None) -> tuple[str, Any]:
        candidates = venues or list(self.adapters)
        available = [(venue, self.adapters[venue]) for venue in candidates if venue in self.adapters]
        if not available:
            raise ValueError("no configured execution venue")
        # Deterministic routing hook: callers can order candidates by liquidity/cost.
        return available[0]

    def submit(self, request: OrderRequest, venues: list[str] | None = None) -> OrderResult:
        if self.liquidity_gate is not None:
            decision = self.liquidity_gate.check(request.symbol.upper().replace("/", ""), request.quantity)
            if not decision.allowed:
                raise PermissionError(f"liquidity gate blocked order: {decision.reason}")
            if decision.action == "reduce" and decision.max_quantity is not None:
                request = replace(request, quantity=min(request.quantity, decision.max_quantity))
        notional = self._validate(request)
        venue, adapter = self._select(request, venues)
        try:
            result = adapter.submit(request)
            self.daily_notional += notional
            self._emit(OrderUpdate(result.venue, result.exchange_order_id, result.state, result.filled_quantity, result.average_price, raw=result.raw))
            return result
        except Exception as exc:
            self._emit(OrderUpdate(venue, request.client_order_id or "unknown", OrderState.REJECTED, 0.0, None, raw={"error": str(exc)}))
            raise

    def refresh(self, venue: str, exchange_order_id: str, symbol: str) -> OrderUpdate:
        if venue not in self.adapters:
            raise ValueError(f"unknown venue: {venue}")
        update = self.adapters[venue].get_status(exchange_order_id, symbol); self._emit(update); return update

    def cancel(self, venue: str, exchange_order_id: str, symbol: str) -> OrderResult:
        if venue not in self.adapters:
            raise ValueError(f"unknown venue: {venue}")
        result = self.adapters[venue].cancel(exchange_order_id, symbol)
        self._emit(OrderUpdate(result.venue, result.exchange_order_id, result.state, result.filled_quantity, result.average_price, raw=result.raw)); return result

    def reset_daily_limits(self) -> None:
        self.daily_notional = 0.0

    def _emit(self, update: OrderUpdate) -> None:
        if self.on_update:
            self.on_update(update)

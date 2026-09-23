from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from typing import Any, Callable
from urllib.parse import urlencode

import requests

from .models import OrderRequest, OrderResult, OrderSide, OrderState, OrderUpdate


def _state(value: str) -> OrderState:
    return {
        "NEW": OrderState.NEW, "PARTIALLY_FILLED": OrderState.PARTIALLY_FILLED,
        "FILLED": OrderState.FILLED, "CANCELED": OrderState.CANCELED,
        "CANCELLED": OrderState.CANCELED, "REJECTED": OrderState.REJECTED,
    }.get(value.upper(), OrderState.UNKNOWN)


class PaperExecutionAdapter:
    venue = "paper"

    def __init__(self, price_provider: Callable[[str], float] | None = None) -> None:
        self.price_provider = price_provider or (lambda _symbol: 1.0)
        self.orders: dict[str, OrderResult] = {}

    def submit(self, request: OrderRequest) -> OrderResult:
        order_id = str(uuid.uuid4()); price = request.limit_price or self.price_provider(request.symbol)
        result = OrderResult(self.venue, order_id, request.client_order_id, OrderState.FILLED, request.quantity, price, {"paper": True})
        self.orders[order_id] = result
        return result

    def get_status(self, exchange_order_id: str, symbol: str) -> OrderUpdate:
        result = self.orders[exchange_order_id]
        return OrderUpdate(self.venue, result.exchange_order_id, result.state, result.filled_quantity, result.average_price, raw=result.raw)

    def cancel(self, exchange_order_id: str, symbol: str) -> OrderResult:
        result = self.orders[exchange_order_id]
        canceled = OrderResult(self.venue, result.exchange_order_id, result.client_order_id, OrderState.CANCELED, result.filled_quantity, result.average_price, result.raw)
        self.orders[exchange_order_id] = canceled
        return canceled


class BinanceSpotAdapter:
    """Signed Binance Spot REST adapter; credentials must be supplied explicitly."""

    venue = "binance"

    def __init__(self, api_key: str, api_secret: str, base_url: str = "https://api.binance.com", timeout: float = 5.0) -> None:
        if not api_key or not api_secret:
            raise ValueError("Binance API credentials are required")
        self.api_key, self.api_secret, self.base_url, self.timeout = api_key, api_secret, base_url.rstrip("/"), timeout
        self.session = requests.Session(); self.session.headers.update({"X-MBX-APIKEY": api_key})

    def _signed_request(self, method: str, path: str, params: dict[str, Any]) -> dict[str, Any]:
        payload = {**params, "timestamp": int(time.time() * 1000), "recvWindow": 5000}
        query = urlencode(payload)
        payload["signature"] = hmac.new(self.api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        response = self.session.request(method, f"{self.base_url}{path}", params=payload, timeout=self.timeout)
        response.raise_for_status(); return response.json()

    def submit(self, request: OrderRequest) -> OrderResult:
        params = {"symbol": request.symbol.upper().replace("/", ""), "side": request.side.value, "type": request.order_type, "quantity": f"{request.quantity:.12f}"}
        if request.limit_price is not None:
            params.update({"price": f"{request.limit_price:.12f}", "timeInForce": "GTC"})
        if request.client_order_id:
            params["newClientOrderId"] = request.client_order_id
        raw = self._signed_request("POST", "/api/v3/order", params)
        fills = raw.get("fills") or []
        filled = float(raw.get("executedQty") or 0); avg = (sum(float(f["price"]) * float(f["qty"]) for f in fills) / filled) if filled else None
        return OrderResult(self.venue, str(raw["orderId"]), raw.get("clientOrderId"), _state(raw.get("status", "UNKNOWN")), filled, avg, raw)

    def get_status(self, exchange_order_id: str, symbol: str) -> OrderUpdate:
        raw = self._signed_request("GET", "/api/v3/order", {"symbol": symbol.upper().replace("/", ""), "orderId": exchange_order_id})
        return OrderUpdate(self.venue, str(raw["orderId"]), _state(raw.get("status", "UNKNOWN")), float(raw.get("executedQty") or 0), None, raw=raw)

    def cancel(self, exchange_order_id: str, symbol: str) -> OrderResult:
        raw = self._signed_request("DELETE", "/api/v3/order", {"symbol": symbol.upper().replace("/", ""), "orderId": exchange_order_id})
        return OrderResult(self.venue, str(raw["orderId"]), raw.get("clientOrderId"), _state(raw.get("status", "CANCELED")), float(raw.get("executedQty") or 0), None, raw)


class CcxtExchangeAdapter:
    """Optional CCXT adapter for Binance, OKX, Bybit, Coinbase, and other CCXT venues."""

    def __init__(self, exchange_id: str, config: dict[str, Any]) -> None:
        try:
            import ccxt
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("CcxtExchangeAdapter requires optional ccxt package") from exc
        exchange_class = getattr(ccxt, exchange_id, None)
        if exchange_class is None:
            raise ValueError(f"unsupported CCXT exchange: {exchange_id}")
        self.venue = exchange_id; self.exchange = exchange_class(config)

    def submit(self, request: OrderRequest) -> OrderResult:
        raw = self.exchange.create_order(request.symbol, request.order_type.lower(), request.side.value.lower(), request.quantity, request.limit_price, {"reduceOnly": request.reduce_only})
        return OrderResult(self.venue, str(raw["id"]), request.client_order_id, _state(raw.get("status", "open")), float(raw.get("filled") or 0), raw.get("average"), raw)

    def get_status(self, exchange_order_id: str, symbol: str) -> OrderUpdate:
        raw = self.exchange.fetch_order(exchange_order_id, symbol)
        return OrderUpdate(self.venue, str(raw["id"]), _state(raw.get("status", "unknown")), float(raw.get("filled") or 0), raw.get("average"), raw=raw)

    def cancel(self, exchange_order_id: str, symbol: str) -> OrderResult:
        raw = self.exchange.cancel_order(exchange_order_id, symbol)
        return OrderResult(self.venue, str(raw["id"]), None, OrderState.CANCELED, float(raw.get("filled") or 0), raw.get("average"), raw)

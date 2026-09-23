"""Broker/exchange-neutral live execution gateway."""

from .gateway import ExecutionGateway, ExecutionRiskPolicy
from .models import OrderRequest, OrderResult, OrderSide, OrderState, OrderUpdate
from .adapters import BinanceSpotAdapter, CcxtExchangeAdapter, PaperExecutionAdapter

__all__ = [
    "BinanceSpotAdapter", "CcxtExchangeAdapter", "ExecutionGateway", "ExecutionRiskPolicy",
    "OrderRequest", "OrderResult", "OrderSide", "OrderState", "OrderUpdate", "PaperExecutionAdapter",
]

"""
Adapter 工厂：根据名称返回对应的执行器
"""
from __future__ import annotations

from typing import Any, Dict

from .base import BaseAdapter
from .quant_local import QuantLocalAdapter

_ADAPTERS = {
    "quant_local": QuantLocalAdapter,
}


def load_adapter(name: str, settings: Dict[str, Any]) -> BaseAdapter:
    adapter_cls = _ADAPTERS.get(name)
    if not adapter_cls:
        raise ValueError(f"Unknown adapter: {name}")
    return adapter_cls(name=name, settings=settings or {})

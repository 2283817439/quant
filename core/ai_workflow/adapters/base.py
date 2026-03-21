from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseAdapter(ABC):
    """适配器抽象"""

    def __init__(self, name: str, settings: Dict[str, Any]) -> None:
        self.name = name
        self.settings = settings or {}

    @abstractmethod
    def execute(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """执行一步操作并返回结构化结果"""

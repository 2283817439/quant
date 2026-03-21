"""
AI 配置加载器：读取 config/ai_config.json 并提供缓存访问
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

_AI_CONFIG_PATH = Path(__file__).resolve().parent / "ai_config.json"
_CACHE: Dict[str, Any] | None = None


def load_ai_config(force_reload: bool = False) -> Dict[str, Any]:
    """
    读取 AI 配置 JSON。
    :param force_reload: 为 True 时强制重新加载
    """
    global _CACHE
    if _CACHE is None or force_reload:
        if not _AI_CONFIG_PATH.exists():
            _CACHE = {}
        else:
            with _AI_CONFIG_PATH.open("r", encoding="utf-8") as fh:
                _CACHE = json.load(fh)
    return _CACHE or {}


def get_ai_workflow_settings(force_reload: bool = False) -> Dict[str, Any]:
    """快捷返回 ai_workflow 配置块"""
    config = load_ai_config(force_reload=force_reload)
    return config.get("ai_workflow", {})

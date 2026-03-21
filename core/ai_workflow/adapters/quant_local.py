from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import requests

from config.ai_settings import get_ai_workflow_settings

from .base import BaseAdapter

logger = logging.getLogger("AIWorkflowEngine.QuantAdapter")


class QuantLocalAdapter(BaseAdapter):
    """直接调用本地量化服务（market_data_api / qmt_api_service）的适配器"""

    def __init__(self, name: str, settings: Dict[str, Any]) -> None:
        super().__init__(name, settings)
        ai_settings = get_ai_workflow_settings()
        defaults = (ai_settings.get("adapters", {}).get("quant_local") or {}).copy()
        defaults.update(settings or {})
        endpoints = defaults.get("endpoints", {})
        self.market_api = endpoints.get("market_api", "http://127.0.0.1:8080/market")
        self.trading_api = endpoints.get("trading_api", "http://127.0.0.1:8080/qmt")
        self.monitor_api = endpoints.get("monitor_api", self.trading_api)

    def execute(self, step: Dict[str, Any]) -> Dict[str, Any]:
        action = step.get("action")
        params = step.get("params") or {}

        if action == "market.indices":
            return self._get(self.market_api, "/api/market/indices")
        if action == "market.heat":
            return self._get(self.market_api, "/api/market/heat")
        if action == "market.capital_flow":
            return self._get(self.market_api, "/api/market/capital-flow")
        if action == "monitor.pool.list":
            status = params.get("status")
            suffix = f"?status={status}" if status else ""
            return self._get(self.monitor_api, f"/ai/monitor/pool{suffix}")
        if action == "monitor.pool.add":
            return self._post(self.monitor_api, "/ai/monitor/pool", params)
        if action == "monitor.pool.update":
            entry_id = params.get("id")
            if not entry_id:
                raise ValueError("monitor.pool.update requires params.id")
            return self._patch(self.monitor_api, f"/ai/monitor/pool/{entry_id}", params.get("payload") or {})
        if action == "monitor.pool.delete":
            entry_id = params.get("id")
            if not entry_id:
                raise ValueError("monitor.pool.delete requires params.id")
            return self._delete(self.monitor_api, f"/ai/monitor/pool/{entry_id}")
        if action == "monitor.pool.fills":
            limit = params.get("limit", 50)
            return self._get(self.monitor_api, f"/ai/monitor/fills?limit={limit}")

        raise ValueError(f"Unsupported action for quant_local: {action}")

    # --------------------------------------------------------------- HTTP utils
    def _get(self, base: str, path: str) -> Dict[str, Any]:
        url = base.rstrip("/") + path
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return {"status": resp.status_code, "data": resp.json()}

    def _post(self, base: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = base.rstrip("/") + path
        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        return {"status": resp.status_code, "data": resp.json()}

    def _patch(self, base: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = base.rstrip("/") + path
        resp = requests.patch(url, json=payload, timeout=60)
        resp.raise_for_status()
        return {"status": resp.status_code, "data": resp.json()}

    def _delete(self, base: str, path: str) -> Dict[str, Any]:
        url = base.rstrip("/") + path
        resp = requests.delete(url, timeout=30)
        resp.raise_for_status()
        data: Optional[Any]
        try:
            data = resp.json()
        except ValueError:
            data = None
        return {"status": resp.status_code, "data": data}

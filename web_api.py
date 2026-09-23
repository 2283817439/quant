"""
量化交易平台 Web API 服务
基于 FastAPI 提供 RESTful API 和 WebSocket 实时推送
"""
import asyncio
import json
import threading
import csv
import os
import statistics
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status, Header
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from jose import JWTError, jwt
from passlib.context import CryptContext
import uvicorn
import requests

# 导入本地模块
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.config import config
from core.trader import TradeExecutor
from core.portfolio import PortfolioManager
from core.risk import RiskManager
from utils.logger import sys_logger
from utils.database import get_database_manager
from services.paperclip_integration import PaperclipIntegrationService
from services.monitoring import monitoring_registry

logger = sys_logger.getChild('WebAPI')

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
RECORDS_ROOT = os.path.join(PROJECT_ROOT, config.get('record.file_path', 'records') or 'records')
BACKTEST_REPORT_FILE = os.path.join(RECORDS_ROOT, "backtest_report_record.csv")
BACKTEST_EQUITY_FILE = os.path.join(RECORDS_ROOT, "backtest_equity_record.csv")

paperclip_settings = config.get('paperclip', {}) or {}
paperclip_integration = PaperclipIntegrationService(
    repo_root=paperclip_settings.get('repo_root'),
    default_adapter_configs=paperclip_settings.get('adapters'),
    heartbeat_interval_seconds=paperclip_settings.get('heartbeat_interval_seconds', 300),
)

# QMT 回测桥接服务
QMT_API_BASE = os.environ.get("QMT_API_BASE", "http://127.0.0.1:8080/qmt")
MARKET_API_BASE = os.environ.get("MARKET_API_BASE", "http://127.0.0.1:8080/market")


def _coerce_symbol_watchlist(raw_value) -> List[str]:
    if not raw_value:
        return []
    if isinstance(raw_value, str):
        items = [part.strip() for part in raw_value.split(",")]
    elif isinstance(raw_value, (list, tuple, set)):
        items = [str(part).strip() for part in raw_value]
    else:
        return []
    return [item for item in items if item]


DEFAULT_MARKET_SYMBOLS = _coerce_symbol_watchlist(config.get("dashboard.market_watchlist"))
if not DEFAULT_MARKET_SYMBOLS:
    DEFAULT_MARKET_SYMBOLS = ["600519.SH", "000858.SZ", "300750.SZ", "000001.SH"]

_LAST_MARKET_FETCH_SUCCESS = False

# ==================== 数据库初始化 ====================
try:
    _db = get_database_manager(config)
    logger.info("Web API database initialized")
except Exception as _db_init_err:
    _db = None
    logger.warning("Web API database initialization failed, falling back to mock data: %s", _db_init_err)


def _fetch_market_quotes(symbols: List[str]) -> List[Dict[str, Any]]:
    """调用市场数据服务获取实时行情"""
    global _LAST_MARKET_FETCH_SUCCESS
    if not symbols:
        return []
    try:
        resp = requests.get(
            f"{MARKET_API_BASE.rstrip('/')}/api/market/quotes",
            params={"codes": ",".join(symbols)},
            timeout=5,
        )
        resp.raise_for_status()
        payload = resp.json() if resp.content else {}
        data = payload.get("data") or []
        _LAST_MARKET_FETCH_SUCCESS = True
        if isinstance(data, dict):
            return list(data.values())
        return data
    except Exception as exc:
        _LAST_MARKET_FETCH_SUCCESS = False
        logger.warning("Failed to fetch market quotes: %s", exc)
        return []


def _load_cached_asset_snapshot() -> Optional[Dict[str, Any]]:
    if not _db:
        return None
    try:
        account_row = _db.get_latest_account()
    except Exception as exc:
        logger.warning("Failed to load cached account snapshot: %s", exc)
        return None
    if not account_row:
        return None
    return {
        "account_id": account_row.get("account_id"),
        "total_asset": float(account_row.get("total_asset") or 0),
        "available_cash": float(account_row.get("available_cash") or 0),
        "frozen_cash": float(account_row.get("frozen_cash") or 0),
        "market_value": float(account_row.get("market_value") or 0),
    }


def _load_positions_from_db() -> List[Dict[str, Any]]:
    if not _db:
        return []
    try:
        df = _db.get_positions()
    except Exception as exc:
        logger.warning("Failed to load cached positions: %s", exc)
        return []
    if df is None or df.empty:
        return []
    results: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        total_volume = int(row.get("total_volume", 0) or 0)
        available_volume = int(row.get("available_volume", total_volume) or total_volume)
        avg_price = float(row.get("avg_price", 0) or 0)
        current_price = float(row.get("current_price", avg_price) or avg_price)
        market_value = float(row.get("market_value", total_volume * current_price) or 0)
        float_pnl = float(row.get("float_pnl", 0) or row.get("unrealized_pnl", 0) or 0)
        results.append(
            {
                "symbol": str(row.get("symbol") or row.get("stock_code") or ""),
                "total_volume": total_volume,
                "available_volume": available_volume,
                "avg_price": avg_price,
                "current_price": current_price,
                "market_value": market_value,
                "unrealized_pnl": float_pnl,
                "entry_date": str(row.get("entry_date") or row.get("update_time") or "") or None,
            }
        )
    return results


def _resolve_portfolio_snapshot() -> tuple[List[Dict[str, Any]], Optional[Dict[str, Any]], str]:
    try:
        snapshot = live_bridge_session.refresh_snapshot()
        return snapshot.get("positions", []), snapshot.get("asset"), "live"
    except Exception as exc:
        logger.debug("Live snapshot unavailable, fallback to cache: %s", exc)

    positions = _load_positions_from_db()
    asset = _load_cached_asset_snapshot()
    if positions or asset:
        return positions, asset, "cache"
    return [], None, "offline"


def _load_performance_window(days: int = 90):
    if not _db:
        return None
    try:
        history = _db.get_performance_history(
            start_date=date.today() - timedelta(days=days),
            end_date=date.today(),
        )
        if history is not None and not history.empty:
            return history.sort_values("date")
    except Exception as exc:
        logger.warning("Failed to load performance window: %s", exc)
    return None


def _compute_portfolio_context(window_days: int = 90) -> Dict[str, Any]:
    positions, asset, source = _resolve_portfolio_snapshot()
    fallback_capital = _cfg_float("backtest.initial_capital", _cfg_float("account.available_cash", 50000.0))

    total_market_value = sum(float(p.get("market_value") or 0.0) for p in positions)
    total_cost = sum(float(p.get("avg_price") or 0.0) * float(p.get("total_volume") or 0.0) for p in positions)
    float_pnl = sum(float(p.get("unrealized_pnl") or 0.0) for p in positions)

    if asset:
        total_asset = float(asset.get("total_asset") or 0.0)
        available_cash = float(asset.get("available_cash") or 0.0)
    else:
        total_asset = 0.0
        available_cash = 0.0

    if total_asset <= 0:
        total_asset = max(fallback_capital, total_market_value + available_cash)
        if available_cash <= 0:
            available_cash = max(0.0, total_asset - total_market_value)

    position_ratio = total_market_value / total_asset if total_asset > 0 else 0.0
    largest_position_ratio = (
        max((float(p.get("market_value") or 0.0) / total_asset) for p in positions)
        if positions and total_asset > 0
        else 0.0
    )

    history = _load_performance_window(window_days)
    volatility = 0.0
    max_drawdown = 0.0
    sharpe = 0.0
    nav_series: List[float] = []

    if history is not None and not history.empty:
        if "daily_return" in history.columns:
            daily_returns = [float(val) for val in history["daily_return"].dropna().tolist() if val is not None]
            if len(daily_returns) > 1:
                volatility = statistics.pstdev(daily_returns)
            elif daily_returns:
                volatility = abs(daily_returns[0])

        sharpe = float(history.iloc[-1].get("sharpe_ratio") or 0.0)
        source_series = history["total_return"] if "total_return" in history.columns else None
        if source_series is not None:
            for _, row in history.iterrows():
                total_return = float(row.get("total_return") or 0.0)
                nav = 1.0 + total_return
                nav_series.append(nav)

        peak_nav = 0.0
        for nav in nav_series:
            peak_nav = max(peak_nav, nav)
            if peak_nav > 0:
                drawdown = max(0.0, (peak_nav - nav) / peak_nav)
                max_drawdown = max(max_drawdown, drawdown)

    var_95 = -abs(volatility * 1.65)
    cvar_95 = var_95 * 1.2
    max_total_asset = (
        max(nav * fallback_capital for nav in nav_series) if nav_series else max(total_asset, fallback_capital)
    )

    return {
        "positions": positions,
        "asset": asset,
        "source": source,
        "total_asset": total_asset,
        "available_cash": available_cash,
        "total_market_value": total_market_value,
        "float_pnl": float_pnl,
        "position_ratio": position_ratio,
        "largest_position_ratio": largest_position_ratio,
        "total_cost": total_cost,
        "volatility": volatility,
        "max_drawdown": max_drawdown,
        "sharpe": sharpe,
        "var_95": var_95,
        "cvar_95": cvar_95,
        "max_total_asset": max_total_asset,
        "nav_series": nav_series,
        "history": history,
    }


def _metric_status(value: float, limit: float, direction: str = "max") -> str:
    """direction: max -> value should stay BELOW limit; min -> value should stay ABOVE limit."""
    if direction == "max":
        warn_threshold = limit * 0.9
        if value >= limit:
            return "critical"
        if value >= warn_threshold:
            return "warning"
        return "normal"

    warn_buffer = abs(limit) * 0.2 if limit != 0 else 0.02
    warn_threshold = limit + warn_buffer
    if value <= limit:
        return "critical"
    if value <= warn_threshold:
        return "warning"
    return "normal"


def _build_system_status_items(live_connected: Optional[bool] = None) -> List[Dict[str, str]]:
    if live_connected is None:
        try:
            live_connected = live_bridge_session.is_connected()
        except Exception:
            live_connected = False

    ai_status = "unknown"
    try:
        heartbeats = paperclip_integration.list_heartbeats()
        if heartbeats:
            normalized = [(hb.status or "").lower() for hb in heartbeats]
            if any(status in {"ok", "healthy", "pass"} for status in normalized):
                ai_status = "online"
            elif any(status in {"warn", "warning"} for status in normalized):
                ai_status = "warning"
            else:
                ai_status = heartbeats[0].status or "unknown"
    except Exception as exc:
        logger.warning("Failed to inspect Paperclip heartbeat: %s", exc)
        ai_status = "offline"

    statuses = [
        {"name": "MiniQMT 桥接", "status": "online" if live_connected else "offline"},
        {"name": "数据库", "status": "online" if _db else "offline"},
        {"name": "AI 调度", "status": ai_status},
        {
            "name": "行情服务",
            "status": "online" if _LAST_MARKET_FETCH_SUCCESS else "warning",
        },
        {"name": "风控系统", "status": "online"},
    ]
    return statuses


def _read_csv_records(path: str) -> List[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return []
    rows: List[Dict[str, Any]] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                normalized = {}
                for key, value in row.items():
                    if key:
                        normalized[key.strip().lstrip("\ufeff")] = (value or "").strip()
                rows.append(normalized)
    except Exception as exc:
        logger.warning("Failed to read csv %s: %s", path, exc)
    return rows

# ==================== 配置 ====================

SECRET_KEY = config.get("web_api.secret_key", "CHANGE_ME_USE_A_STRONG_RANDOM_KEY_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(config.get("web_api.access_token_expire_minutes", 1440))

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ==================== 数据模型 ====================

class User(BaseModel):
    username: str
    role: str  # admin, trader, viewer
    disabled: bool = False

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class LoginForm(BaseModel):
    username: str
    password: str
    miniqmt_path: Optional[str] = None
    miniqmt_session_id: Optional[str] = None
    miniqmt_account_id: Optional[str] = None

# Dashboard 数据
class DashboardData(BaseModel):
    total_asset: float
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    equity_curve: List[Dict[str, Any]]
    system_status: List[Dict[str, str]]

# 持仓数据
class PositionData(BaseModel):
    symbol: str
    total_volume: int
    available_volume: int
    avg_price: float
    market_value: float
    unrealized_pnl: float
    pnl_percent: float

# 订单数据
class OrderData(BaseModel):
    order_id: int
    strategy_id: Optional[str]
    symbol: str
    direction: str
    order_type: str
    price: float
    volume: int
    filled_volume: int
    filled_price: float
    status: str
    create_time: str
    update_time: str

# 策略数据
class StrategyData(BaseModel):
    id: str
    name: str
    type: str
    status: str
    symbols: List[str]
    parameters: Dict[str, Any]
    performance: Optional[Dict[str, float]]

# 行情数据
class QuoteData(BaseModel):
    symbol: str
    price: float
    change: float
    change_percent: float
    volume: int
    amount: float
    high: float
    low: float
    open: float
    prev_close: float
    timestamp: str

# 资产数据
class AssetData(BaseModel):
    total_asset: float
    available_cash: float
    frozen_cash: float
    market_value: float
    total_pnl: float
    pnl_percent: float

# 盈亏分析
class PnlAnalysisData(BaseModel):
    date: str
    daily_pnl: float
    cumulative_pnl: float
    turnover: float

# 回测数据
class BacktestData(BaseModel):
    id: str
    name: str
    strategy: str
    start_date: str
    end_date: str
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    status: str
    created_at: str

# 风险指标
class RiskMetric(BaseModel):
    name: str
    value: float
    limit: float
    status: str
    unit: str

# 风险事件
class RiskEvent(BaseModel):
    id: str
    type: str
    severity: str
    description: str
    timestamp: str
    status: str


class FrontBacktestConfig(BaseModel):
    trackingIndex: str
    sectorUniverse: str
    excludedSectors: List[str] = Field(default_factory=list)
    rebalancePreset: str
    rebalanceDays: int
    holdingDays: int
    backtestStart: str
    backtestEnd: str
    buyTiming: str
    buyPriority: str
    sellCondition: str
    enableTakeProfit: bool
    takeProfitRatio: float
    enableStopLoss: bool
    stopLossRatio: float
    enableMaxPullback: bool
    maxProfitPullback: float
    initialCapital: float
    dailyBuyLimit: int
    strategyName: Optional[str] = None


# ==================== Paperclip 数据模型 ====================

class PaperclipModelEntry(BaseModel):
    id: str
    label: str
    source: Optional[str] = None

class PaperclipEnvironmentCheckEntry(BaseModel):
    code: str
    level: str
    message: str
    detail: Optional[str] = None
    hint: Optional[str] = None

class PaperclipAdapterPayload(BaseModel):
    adapter_type: str
    label: str
    package_name: Optional[str]
    version: Optional[str]
    description: Optional[str]
    models: List[PaperclipModelEntry]
    configuration_doc: Optional[str]
    heartbeat_status: Optional[str]
    heartbeat_summary: Optional[str]
    last_tested_at: Optional[datetime]

class PaperclipEnvironmentTestResponse(BaseModel):
    adapter_type: str
    status: str
    started_at: datetime
    duration_ms: int
    checks: List[PaperclipEnvironmentCheckEntry]

class PaperclipTestRequest(BaseModel):
    config: Dict[str, Any] = Field(default_factory=dict)
    persist_for_heartbeat: bool = True

class PaperclipHeartbeatEntry(BaseModel):
    adapter_type: str
    status: str
    tested_at: Optional[datetime]
    summary: Optional[str]
    checks: List[PaperclipEnvironmentCheckEntry] = Field(default_factory=list)

# 默认回测参数（与前端初始化保持一致）
DEFAULT_BACKTEST_CONFIG = FrontBacktestConfig(
    trackingIndex="000300.SH",
    sectorUniverse="ALL",
    excludedSectors=[],
    rebalancePreset="medium",
    rebalanceDays=15,
    holdingDays=5,
    backtestStart="2024-01-01",
    backtestEnd="2024-12-31",
    buyTiming="openAuction",
    buyPriority="factorScore",
    sellCondition="stopLossOrSignal",
    enableTakeProfit=True,
    takeProfitRatio=12.0,
    enableStopLoss=True,
    stopLossRatio=5.0,
    enableMaxPullback=True,
  maxProfitPullback=8.0,
  initialCapital=1_000_000.0,
  dailyBuyLimit=3,
  strategyName=None,
)

BACKTEST_RUNTIME_STATE: Dict[str, Any] = {
    "config": DEFAULT_BACKTEST_CONFIG.dict(),
    "task_id": None,
    "last_report": None,
    "last_status": None,
}

# ==================== 数据库 (模拟) ====================

# 用户数据库
fake_users_db: Dict[str, UserInDB] = {
    "admin": UserInDB(
        username="admin",
        role="admin",
        disabled=False,
        hashed_password=pwd_context.hash("admin123"),
    ),
    "trader": UserInDB(
        username="trader",
        role="trader",
        disabled=False,
        hashed_password=pwd_context.hash("trader123"),
    ),
    "viewer": UserInDB(
        username="viewer",
        role="viewer",
        disabled=False,
        hashed_password=pwd_context.hash("viewer123"),
    ),
}

# ==================== 工具函数 ====================


def _format_backtest_date(value: str) -> str:
    if not value:
        return datetime.now().strftime("%Y%m%d")
    return value.replace("-", "")


def _parse_iso_date(value: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return datetime.now()


def _build_strategy_stub(config_payload: Dict[str, Any]) -> str:
    short_window = max(2, min(int(config_payload.get("rebalanceDays", 5) or 5), int(config_payload.get("holdingDays", 5) or 5)))
    long_window = max(short_window + 5, short_window + int(config_payload.get("rebalanceDays", 10) or 10))
    daily_limit = max(1, int(config_payload.get("dailyBuyLimit", 3) or 3))
    max_position = min(1.0, max(0.05, daily_limit * 0.05))
    params = {
        "tracking_index": config_payload.get("trackingIndex"),
        "sector_universe": config_payload.get("sectorUniverse"),
        "excluded_sectors": config_payload.get("excludedSectors", []),
        "short_window": short_window,
        "long_window": long_window,
        "max_position": round(max_position, 3),
        "rebalance_preset": config_payload.get("rebalancePreset"),
        "rebalance_days": config_payload.get("rebalanceDays"),
        "holding_days": config_payload.get("holdingDays"),
        "buy_timing": config_payload.get("buyTiming"),
        "buy_priority": config_payload.get("buyPriority"),
        "sell_condition": config_payload.get("sellCondition"),
        "take_profit": config_payload.get("takeProfitRatio") if config_payload.get("enableTakeProfit") else 0,
        "stop_loss": config_payload.get("stopLossRatio") if config_payload.get("enableStopLoss") else 0,
        "max_profit_pullback": config_payload.get("maxProfitPullback") if config_payload.get("enableMaxPullback") else 0,
    }
    strategy_name = config_payload.get("strategyName") or "CustomStrategy"
    return f"# AUTO-GENERATED STRATEGY: {strategy_name}\nPARAMS = {json.dumps(params, ensure_ascii=False)}"


def _post_qmt_api(path: str, payload: Dict[str, Any], timeout: float | int = 15) -> Dict[str, Any]:
    base = QMT_API_BASE.rstrip("/")
    normalized = path.lstrip("/")
    url = f"{base}/{normalized}"
    response = requests.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json()


async def _post_qmt_api_async(path: str, payload: Dict[str, Any], timeout: float | int = 15) -> Dict[str, Any]:
    return await run_in_threadpool(_post_qmt_api, path, payload, timeout)


async def _ensure_latest_backtest_report() -> Optional[Dict[str, Any]]:
    task_id = BACKTEST_RUNTIME_STATE.get("task_id")
    last_report = BACKTEST_RUNTIME_STATE.get("last_report")
    if task_id and not last_report:
        try:
            status = await _post_qmt_api_async("/qmt/backtest_status", {"task_id": task_id})
            BACKTEST_RUNTIME_STATE["last_status"] = status
            if status.get("status") == "completed":
                result = await _post_qmt_api_async("/qmt/backtest_report", {"task_id": task_id})
                BACKTEST_RUNTIME_STATE["last_report"] = result.get("report")
                return BACKTEST_RUNTIME_STATE["last_report"]
            if status.get("status") == "failed":
                raise RuntimeError(status.get("error") or "Backtest failed")
        except Exception as exc:
            logger.warning("Unable to pull QMT backtest report: %s", exc)
            return None
    return BACKTEST_RUNTIME_STATE.get("last_report")


def _build_monthly_returns(nav_series: List[float], start_date: str) -> List[Dict[str, Any]]:
    if not nav_series:
        return []
    start_dt = _parse_iso_date(start_date or datetime.now().strftime("%Y-%m-%d"))
    monthly_map: Dict[int, Dict[str, Optional[float]]] = {}
    month_data: Dict[tuple, Dict[str, float]] = {}
    for idx, nav in enumerate(nav_series):
        current_date = start_dt + timedelta(days=idx)
        key = (current_date.year, current_date.month)
        bucket = month_data.setdefault(key, {"start": nav, "end": nav})
        bucket["end"] = nav

    for (year, month), payload in month_data.items():
        change = payload["end"] / (payload["start"] or 1.0) - 1.0
        row = monthly_map.setdefault(year, {f"{m}月": None for m in range(1, 13)})
        row[f"{month}月"] = change

    result: List[Dict[str, Any]] = []
    for year in sorted(monthly_map.keys()):
        row = {"year": year}
        row.update(monthly_map[year])
        result.append(row)
    return result

def _paperclip_check_payload(check) -> PaperclipEnvironmentCheckEntry:
    return PaperclipEnvironmentCheckEntry(
        code=getattr(check, 'code', ''),
        level=getattr(check, 'level', ''),
        message=getattr(check, 'message', ''),
        detail=getattr(check, 'detail', None),
        hint=getattr(check, 'hint', None),
    )


def _paperclip_adapter_payload(adapter) -> PaperclipAdapterPayload:
    heartbeat = paperclip_integration.get_heartbeat(adapter.adapter_type)
    models = [
        PaperclipModelEntry(
            id=getattr(model, 'id', ''),
            label=getattr(model, 'label', ''),
            source=getattr(model, 'source', None),
        )
        for model in getattr(adapter, 'models', [])
    ]
    return PaperclipAdapterPayload(
        adapter_type=getattr(adapter, 'adapter_type', ''),
        label=getattr(adapter, 'label', ''),
        package_name=getattr(adapter, 'package_name', None),
        version=getattr(adapter, 'version', None),
        description=getattr(adapter, 'description', None),
        models=models,
        configuration_doc=getattr(adapter, 'configuration_doc', None),
        heartbeat_status=getattr(heartbeat, 'status', 'unknown') if heartbeat else 'unknown',
        heartbeat_summary=getattr(heartbeat, 'summary', None) if heartbeat else None,
        last_tested_at=getattr(heartbeat, 'tested_at', None) if heartbeat else None,
    )


def _paperclip_test_response(result) -> PaperclipEnvironmentTestResponse:
    checks = [_paperclip_check_payload(check) for check in getattr(result, 'checks', [])]
    return PaperclipEnvironmentTestResponse(
        adapter_type=getattr(result, 'adapter_type', ''),
        status=getattr(result, 'status', ''),
        started_at=getattr(result, 'started_at', datetime.now()),
        duration_ms=getattr(result, 'duration_ms', 0),
        checks=checks,
    )
def _paperclip_heartbeat_payload(entry) -> PaperclipHeartbeatEntry:
    checks = [_paperclip_check_payload(check) for check in getattr(entry, 'checks', [])]
    return PaperclipHeartbeatEntry(
        adapter_type=getattr(entry, 'adapter_type', ''),
        status=getattr(entry, 'status', 'unknown'),
        tested_at=getattr(entry, 'tested_at', None),
        summary=getattr(entry, 'summary', None),
        checks=checks,
    )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)

def authenticate_user(username: str, password: str) -> Optional[UserInDB]:
    """认证用户"""
    user = fake_users_db.get(username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

def create_access_token(data: dict, expires_delta: Optional[int] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        timedelta(minutes=expires_delta) if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Header(...)) -> User:
    """获取当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user= fake_users_db.get(username)
    if user is None:
        raise credentials_exception
    if user.disabled:
        raise HTTPException(status_code=400, detail="用户已禁用")
    
    return User(**user.dict())

def require_role(required_role: str):
    """角色权限检查装饰器"""
    async def role_checker(current_user: User = Depends(get_current_user)):
        role_hierarchy = {"viewer": 0, "trader": 1, "admin": 2}
        if role_hierarchy.get(current_user.role, 0) < role_hierarchy.get(required_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要 {required_role} 或更高权限"
            )
        return current_user
    return role_checker

# ==================== FastAPI 应用 ====================

app = FastAPI(title="量化交易平台 API", version="1.0.0")

@app.get("/api/ops/overview")
async def api_ops_overview(current_user: User = Depends(get_current_user)):
    """Operational projection for the authenticated monitoring dashboard."""
    return monitoring_registry.snapshot()

@app.get("/ops")
async def ops_dashboard(current_user: User = Depends(get_current_user)):
    return FileResponse(os.path.join(PROJECT_ROOT, "dashboard", "index.html"))

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    # Accept localhost/127.0.0.1 on any dev port to avoid preflight failures
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket 连接管理器
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket connected | active_connections=%d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info("WebSocket disconnected | active_connections=%d", len(self.active_connections))

    async def broadcast(self, message: dict):
        """广播消息给所有连接的客户端"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error("WebSocket broadcast failed: %s", e)
                disconnected.append(connection)
        
        # 清理断开的连接
        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, message: dict):
        """发送个人消息"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error("WebSocket direct send failed: %s", e)
            self.disconnect(websocket)

manager = ConnectionManager()


class BridgeTradingEngine:
    """Minimal engine adapter so TradeExecutor can run in bridge mode."""

    def __init__(self):
        self.trader = None

    def process_trader_order_callback(self, order):
        logger.debug("Bridge callback received order update | order_id=%s", getattr(order, "order_id", None))


class LiveBridgeSession:
    def __init__(self):
        self._lock = threading.Lock()
        self._executor: Optional[TradeExecutor] = None
        self._fingerprint: Optional[tuple[str, str, str]] = None

    def _resolve_settings(
        self,
        *,
        miniqmt_path: Optional[str] = None,
        miniqmt_session_id: Optional[str] = None,
        miniqmt_account_id: Optional[str] = None,
    ) -> Dict[str, str]:
        return {
            "path": str(miniqmt_path or config.get("xt.plugin_path") or "").strip(),
            "session_id": str(miniqmt_session_id or "").strip(),
            "account_id": str(miniqmt_account_id or config.get("account.account_id") or "").strip(),
        }

    def ensure_connected(
        self,
        *,
        miniqmt_path: Optional[str] = None,
        miniqmt_session_id: Optional[str] = None,
        miniqmt_account_id: Optional[str] = None,
    ) -> TradeExecutor:
        settings = self._resolve_settings(
            miniqmt_path=miniqmt_path,
            miniqmt_session_id=miniqmt_session_id,
            miniqmt_account_id=miniqmt_account_id,
        )
        fingerprint = (settings["path"], settings["session_id"], settings["account_id"])

        if not settings["path"]:
            raise RuntimeError("MiniQMT path is not configured")
        if not settings["account_id"]:
            raise RuntimeError("MiniQMT account is not configured")

        with self._lock:
            if self._executor and self._executor.status and self._fingerprint == fingerprint:
                return self._executor

            if self._executor:
                try:
                    self._executor.disconnect()
                except Exception as exc:
                    logger.warning("Failed to stop previous bridge session: %s", exc)

            config.update(
                {
                    "xt": {
                        "plugin_path": settings["path"],
                    },
                    "account": {
                        "account_id": settings["account_id"],
                    },
                }
            )

            executor = TradeExecutor(_db)
            bridge_engine = BridgeTradingEngine()
            bridge_engine.trader = executor
            executor.bind(bridge_engine)

            if not executor.start():
                raise RuntimeError("Failed to connect MiniQMT bridge")

            self._executor = executor
            self._fingerprint = fingerprint
            return executor

    def refresh_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            if not self._executor or not self._executor.status:
                raise RuntimeError("MiniQMT bridge is not connected")

            trader = self._executor._trader
            account = self._executor._account

            asset = trader.query_stock_asset(account)
            raw_positions = trader.query_stock_positions(account)

            asset_payload = {
                "account_id": self._executor._account_id,
                "total_asset": float(getattr(asset, "total_asset", 0) or 0),
                "available_cash": float(getattr(asset, "cash", 0) or 0),
                "frozen_cash": float(getattr(asset, "frozen_cash", 0) or 0),
                "market_value": float(getattr(asset, "market_value", 0) or 0),
            }

            positions_payload: List[Dict[str, Any]] = []
            for item in raw_positions:
                total_volume = int(getattr(item, "volume", 0) or 0)
                available_volume = int(getattr(item, "can_use_volume", 0) or 0)
                avg_price = float(getattr(item, "avg_price", 0) or 0)
                market_value = float(getattr(item, "market_value", 0) or 0)
                current_price = market_value / total_volume if total_volume > 0 else avg_price
                unrealized_pnl = market_value - avg_price * total_volume
                positions_payload.append(
                    {
                        "symbol": str(getattr(item, "stock_code", "")),
                        "total_volume": total_volume,
                        "available_volume": available_volume,
                        "avg_price": avg_price,
                        "current_price": current_price,
                        "market_value": market_value,
                        "unrealized_pnl": unrealized_pnl,
                    }
                )

            if _db:
                try:
                    _db.update_account(asset_payload)
                    seen_symbols = set()
                    for row in positions_payload:
                        symbol = row["symbol"]
                        if not symbol:
                            continue
                        seen_symbols.add(symbol)
                        _db.upsert_position(
                            {
                                "symbol": symbol,
                                "total_volume": row["total_volume"],
                                "available_volume": row["available_volume"],
                                "avg_price": row["avg_price"],
                                "current_price": row["current_price"],
                                "market_value": row["market_value"],
                                "float_pnl": row["unrealized_pnl"],
                                "update_time": datetime.now(),
                            }
                        )

                    try:
                        existing = _db.get_positions()
                        if not existing.empty:
                            stale_symbols = {
                                str(row["symbol"])
                                for _, row in existing.iterrows()
                                if str(row["symbol"]) not in seen_symbols
                            }
                            if stale_symbols:
                                with _db.get_connection() as conn:
                                    placeholders = ",".join(["?"] * len(stale_symbols))
                                    conn.execute(
                                        f"DELETE FROM positions WHERE symbol IN ({placeholders})",
                                        list(stale_symbols),
                                    )
                                    conn.commit()
                    except Exception as exc:
                        logger.warning("Failed to prune stale bridge positions: %s", exc)
                except Exception as exc:
                    logger.warning("Failed to persist live bridge snapshot: %s", exc)

            return {
                "asset": asset_payload,
                "positions": positions_payload,
            }

    def is_connected(self) -> bool:
        with self._lock:
            return bool(self._executor and getattr(self._executor, "status", False))


live_bridge_session = LiveBridgeSession()

# ==================== API 路由 ====================

@app.post("/api/auth/login", response_model=Token)
async def login(login_form: LoginForm):
    """用户登录"""
    user = authenticate_user(login_form.username, login_form.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        live_bridge_session.ensure_connected(
            miniqmt_path=login_form.miniqmt_path,
            miniqmt_session_id=login_form.miniqmt_session_id,
            miniqmt_account_id=login_form.miniqmt_account_id,
        )
        live_bridge_session.refresh_snapshot()
    except Exception as exc:
        logger.error("MiniQMT bridge login failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"MiniQMT bridge unavailable: {exc}",
        ) from exc

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires.total_seconds()
    )
    
    logger.info("User logged in | username=%s | role=%s", user.username, user.role)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"username": user.username, "role": user.role, "disabled": user.disabled}
    }

@app.get("/api/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return current_user

@app.post("/api/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """用户登出"""
    logger.info("User logged out | username=%s", current_user.username)
    return {"message": "登出成功"}

@app.get("/api/dashboard", response_model=DashboardData)
async def get_dashboard(current_user: User = Depends(get_current_user)):
    """获取仪表盘数据"""
    asset_payload: Optional[Dict[str, Any]] = None
    live_connected = False

    try:
        snapshot = live_bridge_session.refresh_snapshot()
        asset_payload = snapshot.get("asset")
        live_connected = True
    except Exception as exc:
        logger.info("Live bridge snapshot unavailable, fallback to cache: %s", exc)

    if not asset_payload:
        asset_payload = _load_cached_asset_snapshot()

    if not asset_payload:
        raise HTTPException(status_code=503, detail="账户资产数据不可用")

    total_return = 0.0
    sharpe_ratio = 0.0
    max_drawdown = 0.0
    equity_curve: List[Dict[str, Any]] = []

    if _db:
        try:
            history = _db.get_performance_history(
                start_date=date.today() - timedelta(days=180),
                end_date=date.today(),
            )
            if history is not None and not history.empty:
                history = history.sort_values("date")
                last_row = history.iloc[-1]
                total_return = float(last_row.get("total_return") or 0.0)
                sharpe_ratio = float(last_row.get("sharpe_ratio") or 0.0)
                max_drawdown = float(last_row.get("max_drawdown") or 0.0)
                for _, row in history.tail(60).iterrows():
                    equity_curve.append(
                        {
                            "date": str(row.get("date")),
                            "value": float(row.get("total_return") or row.get("total_pnl") or 0.0),
                        }
                    )
        except Exception as exc:
            logger.warning("Failed to load performance history: %s", exc)

    return DashboardData(
        total_asset=float(asset_payload.get("total_asset") or 0.0),
        total_return=total_return,
        sharpe_ratio=sharpe_ratio,
        max_drawdown=max_drawdown,
        equity_curve=equity_curve,
        system_status=_build_system_status_items(live_connected=live_connected),
    )

@app.get("/api/positions", response_model=List[PositionData])
async def get_positions(current_user: User = Depends(get_current_user)):
    """??????????? MiniQMT ?????"""
    try:
        snapshot = live_bridge_session.refresh_snapshot()
        result = []
        for row in snapshot["positions"]:
            cost = float(row["avg_price"]) * int(row["total_volume"])
            pnl = float(row["unrealized_pnl"])
            result.append(
                PositionData(
                    symbol=str(row["symbol"]),
                    total_volume=int(row["total_volume"]),
                    available_volume=int(row["available_volume"]),
                    avg_price=float(row["avg_price"]),
                    market_value=float(row["market_value"]),
                    unrealized_pnl=pnl,
                    pnl_percent=round(pnl / cost, 6) if cost > 0 else 0.0,
                )
            )
        return result
    except Exception as exc:
        logger.info("Live bridge position refresh unavailable, fallback to DB: %s", exc)

    fallback_positions = _load_positions_from_db()
    if fallback_positions:
        result = []
        for row in fallback_positions:
            avg_price = float(row.get("avg_price", 0) or 0)
            total_vol = int(row.get("total_volume", 0) or 0)
            cost = avg_price * total_vol
            float_pnl = float(row.get("unrealized_pnl", 0) or row.get("float_pnl", 0) or 0)
            result.append(
                PositionData(
                    symbol=str(row.get("symbol") or ""),
                    total_volume=total_vol,
                    available_volume=int(row.get("available_volume", total_vol) or total_vol),
                    avg_price=avg_price,
                    market_value=float(row.get("market_value", 0) or 0),
                    unrealized_pnl=float_pnl,
                    pnl_percent=round(float_pnl / cost, 6) if cost > 0 else 0.0,
                )
            )
        return result
    return []

@app.get("/api/asset", response_model=AssetData)
async def get_asset(current_user: User = Depends(get_current_user)):
    """??????????? MiniQMT ?????"""
    try:
        snapshot = live_bridge_session.refresh_snapshot()
        row = snapshot["asset"]
        initial_capital = config.get('backtest.initial_capital') or config.get('account.available_cash', 50000.0)
        total_asset = float(row.get('total_asset', 0) or 0)
        total_pnl = total_asset - float(initial_capital)
        return AssetData(
            total_asset=round(total_asset, 2),
            available_cash=round(float(row.get('available_cash', 0) or 0), 2),
            frozen_cash=round(float(row.get('frozen_cash', 0) or 0), 2),
            market_value=round(float(row.get('market_value', 0) or 0), 2),
            total_pnl=round(total_pnl, 2),
            pnl_percent=round(total_pnl / float(initial_capital), 6) if float(initial_capital) > 0 else 0.0,
        )
    except Exception as exc:
        logger.info("Live bridge asset refresh unavailable, fallback to DB: %s", exc)

    if _db:
        try:
            with _db.get_connection() as conn:
                import pandas as pd
                df = pd.read_sql_query("SELECT * FROM accounts ORDER BY update_time DESC LIMIT 1", conn)
            if not df.empty:
                row = df.iloc[0]
                total_asset = float(row.get('total_asset', 0) or 0)
                initial_capital = config.get('backtest.initial_capital') or config.get('account.available_cash', 50000.0)
                total_pnl = total_asset - float(initial_capital)
                return AssetData(
                    total_asset=round(total_asset, 2),
                    available_cash=round(float(row.get('available_cash', 0) or 0), 2),
                    frozen_cash=round(float(row.get('frozen_cash', 0) or 0), 2),
                    market_value=round(float(row.get('market_value', 0) or 0), 2),
                    total_pnl=round(total_pnl, 2),
                    pnl_percent=round(total_pnl / float(initial_capital), 6) if float(initial_capital) > 0 else 0.0,
                )
        except Exception as e:
            logger.warning("Failed to load account asset data from database, using mock payload: %s", e)
    initial = float(config.get('backtest.initial_capital') or config.get('account.available_cash', 50000.0))
    return AssetData(
        total_asset=initial,
        available_cash=initial,
        frozen_cash=0.0,
        market_value=0.0,
        total_pnl=0.0,
        pnl_percent=0.0,
    )

@app.get("/api/pnl-analysis", response_model=List[PnlAnalysisData])
async def get_pnl_analysis(current_user: User = Depends(get_current_user)):
    """获取盈亏分析"""
    if not _db:
        raise HTTPException(status_code=503, detail="数据库不可用")

    try:
        history = _db.get_performance_history(
            start_date=date.today() - timedelta(days=60),
            end_date=date.today(),
        )
    except Exception as exc:
        logger.error("Failed to load pnl analysis: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="无法获取盈亏分析数据") from exc

    if history is None or history.empty:
        return []

    history = history.sort_values("date")
    results: List[PnlAnalysisData] = []
    prev_total = 0.0
    for _, row in history.iterrows():
        cumulative = float(row.get("total_pnl") or prev_total)
        if cumulative == prev_total:
            daily_ret = float(row.get("daily_return") or 0.0)
            baseline = float(config.get('backtest.initial_capital') or config.get('account.available_cash', 0) or 0)
            cumulative = prev_total + daily_ret * baseline if baseline else prev_total + daily_ret
        daily_pnl = cumulative - prev_total
        prev_total = cumulative
        turnover = float(row.get("trade_count") or row.get("total_return") or 0.0)
        results.append(
            PnlAnalysisData(
                date=str(row.get("date")),
                daily_pnl=round(daily_pnl, 2),
                cumulative_pnl=round(cumulative, 2),
                turnover=round(turnover, 2),
            )
        )
    return results

@app.get("/api/backtests", response_model=List[BacktestData])
async def get_backtests(current_user: User = Depends(get_current_user)):
    """获取回测列表"""
    rows = _read_csv_records(BACKTEST_REPORT_FILE)
    if not rows:
        return []

    rows = sorted(rows, key=lambda r: r.get("date") or "")
    first = rows[0]
    last = rows[-1]
    start_date = first.get("date") or _cfg_str("backtest.start_date", "")
    end_date = last.get("date") or _cfg_str("backtest.end_date", "")
    strategy_name = config.get("strategy.class", "Strategy")
    total_return = float(last.get("total_return") or 0.0)
    sharpe_ratio = float(last.get("sharpe_ratio") or 0.0)
    max_drawdown = float(last.get("max_drawdown") or 0.0)

    record = BacktestData(
        id=f"{strategy_name}-{start_date}-{end_date}",
        name=f"{strategy_name} 回测",
        strategy=strategy_name,
        start_date=start_date,
        end_date=end_date,
        total_return=round(total_return, 6),
        sharpe_ratio=round(sharpe_ratio, 4),
        max_drawdown=round(max_drawdown, 4),
        status="completed",
        created_at=f"{end_date}T00:00:00",
    )
    return [record]

@app.get("/api/risk/metrics", response_model=List[RiskMetric])
async def get_risk_metrics(current_user: User = Depends(get_current_user)):
    """获取风险指标"""
    context = _compute_portfolio_context(window_days=180)
    metrics: List[RiskMetric] = []

    daily_loss_limit = float(_cfg_float("risk.daily_max_loss", -0.05) or -0.05)
    if daily_loss_limit > 0:
        daily_loss_limit = -abs(daily_loss_limit)
    var_value = round(context["var_95"], 6)
    metrics.append(
        RiskMetric(
            name="VaR (95%)",
            value=var_value,
            limit=daily_loss_limit,
            status=_metric_status(var_value, daily_loss_limit, direction="min"),
            unit="%",
        )
    )

    max_drawdown_limit = -abs(_cfg_float("strategy.max_profit_drawdown", 0.15))
    max_drawdown_value = -abs(context["max_drawdown"])
    metrics.append(
        RiskMetric(
            name="最大回撤",
            value=round(max_drawdown_value, 6),
            limit=round(max_drawdown_limit, 6),
            status=_metric_status(max_drawdown_value, max_drawdown_limit, direction="min"),
            unit="%",
        )
    )

    exposure_limit = _cfg_float("risk.max_portfolio_exposure", 0.95)
    exposure_value = round(context["position_ratio"], 6)
    metrics.append(
        RiskMetric(
            name="组合敞口",
            value=exposure_value,
            limit=exposure_limit,
            status=_metric_status(exposure_value, exposure_limit, direction="max"),
            unit="",
        )
    )

    largest_position_limit = _cfg_float("risk.max_position_ratio", 0.12)
    largest_position_value = round(context["largest_position_ratio"], 6)
    metrics.append(
        RiskMetric(
            name="单票集中度",
            value=largest_position_value,
            limit=largest_position_limit,
            status=_metric_status(largest_position_value, largest_position_limit, direction="max"),
            unit="",
        )
    )

    total_asset = context["total_asset"] or 1.0
    cash_ratio = round(context["available_cash"] / total_asset, 6)
    min_cash_ratio = max(0.05, 1.0 - exposure_limit)
    metrics.append(
        RiskMetric(
            name="现金占比",
            value=cash_ratio,
            limit=min_cash_ratio,
            status=_metric_status(cash_ratio, min_cash_ratio, direction="min"),
            unit="",
        )
    )

    float_pnl_ratio = round(context["float_pnl"] / context["total_cost"], 6) if context["total_cost"] > 0 else 0.0
    stop_loss_limit = -abs(_cfg_float("strategy.stop_loss_ratio", 0.08))
    metrics.append(
        RiskMetric(
            name="浮动盈亏",
            value=float_pnl_ratio,
            limit=stop_loss_limit,
            status=_metric_status(float_pnl_ratio, stop_loss_limit, direction="min"),
            unit="%",
        )
    )
    return metrics

@app.get("/api/risk/events", response_model=List[RiskEvent])
async def get_risk_events(current_user: User= Depends(get_current_user)):
    """获取风险事件"""
    if not _db:
        return []
    try:
        import pandas as pd  # type: ignore
        with _db.get_connection() as conn:
            df = pd.read_sql_query(
                "SELECT * FROM risk_events ORDER BY COALESCE(create_time, datetime('now')) DESC LIMIT 200",
                conn,
            )
    except Exception as exc:
        logger.error("Failed to query risk events: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="无法读取风险事件") from exc

    if df.empty:
        return []

    results: List[RiskEvent] = []
    for _, row in df.iterrows():
        description = row.get("result") or row.get("action") or ""
        if row.get("symbol"):
            description = f"{row.get('symbol')} | {description}"
        results.append(
            RiskEvent(
                id=str(row.get("id")),
                type=str(row.get("event_type") or ""),
                severity="warning",
                description=str(description),
                timestamp=str(row.get("create_time") or ""),
                status=str(row.get("action") or "recorded"),
            )
        )
    return results

# ==================== WebSocket 端点 ====================

def _cfg_float(key: str, default: float) -> float:
    try:
        value = config.get(key, default)
        if value is None:
            return default
        if isinstance(value, str):
            value = value.replace("_", "").strip()
        return float(value)
    except Exception:
        return default


def _cfg_str(key: str, default: str) -> str:
    try:
        value = config.get(key, default)
        if value is None:
            return default
        return str(value)
    except Exception:
        return default


def _build_equity_curve_payload() -> List[Dict[str, Any]]:
    initial_capital = _cfg_float(
        "backtest.initial_capital",
        _cfg_float("account.available_cash", 50000.0),
    )
    dates = [
        "2024-07-01",
        "2024-07-15",
        "2024-08-01",
        "2024-08-15",
        "2024-09-02",
        "2024-09-16",
        "2024-10-08",
        "2024-10-21",
        "2024-11-04",
        "2024-11-18",
        "2024-12-02",
        "2024-12-31",
    ]
    navs = [1.0, 1.018, 1.032, 1.025, 1.041, 1.058, 1.073, 1.066, 1.082, 1.101, 1.087, 1.098]
    benchmark = [1.0, 1.009, 1.021, 1.019, 1.03, 1.041, 1.048, 1.043, 1.051, 1.062, 1.054, 1.059]

    data: List[Dict[str, Any]] = []
    for i, date_str in enumerate(dates):
        nav = navs[i]
        total_asset = round(initial_capital * nav, 2)
        cash_ratio = max(0.18, 0.35 - i * 0.01)
        cash = round(total_asset * cash_ratio, 2)
        position_value = round(total_asset - cash, 2)
        data.append(
            {
                "date": date_str,
                "total_asset": total_asset,
                "nav": round(nav, 6),
                "cash": cash,
                "position_value": position_value,
                "benchmark": round(benchmark[i], 6),
            }
        )
    return data


def _build_drawdown_curve_payload(equity_curve: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    data: List[Dict[str, Any]] = []
    peak_nav = 0.0
    for item in equity_curve:
        nav = float(item.get("nav", 1.0))
        peak_nav = max(peak_nav, nav)
        drawdown = 0.0 if peak_nav <= 0 else max(0.0, (peak_nav - nav) / peak_nav)
        data.append({"date": item["date"], "drawdown": round(drawdown, 6)})
    return data


def _max_drawdown_from_curve(equity_curve: List[Dict[str, Any]]) -> float:
    drawdown_curve = _build_drawdown_curve_payload(equity_curve)
    if not drawdown_curve:
        return 0.0
    return max(item["drawdown"] for item in drawdown_curve)


@app.get("/api/dashboard/overview")
async def get_dashboard_overview_compat():
    """仪表盘汇总：优先从 DB 读取，DB 为空时降级为 mock"""
    initial_capital = _cfg_float(
        "backtest.initial_capital",
        _cfg_float("account.available_cash", 50000.0),
    )

    if _db:
        try:
            # 从 accounts 表获取最新资产
            with _db.get_connection() as conn:
                import pandas as pd
                acc_df = pd.read_sql_query(
                    "SELECT * FROM accounts ORDER BY update_time DESC LIMIT 1", conn
                )
                perf_df = pd.read_sql_query(
                    "SELECT * FROM performance_metrics ORDER BY date DESC LIMIT 1", conn
                )
            if not acc_df.empty:
                row = acc_df.iloc[0]
                total_asset = float(row.get('total_asset', initial_capital) or initial_capital)
                available_cash = float(row.get('available_cash', 0) or 0)
                market_value = float(row.get('market_value', 0) or 0)
                total_return = (total_asset - initial_capital) / initial_capital if initial_capital > 0 else 0.0
                sharpe = 0.0
                max_dd = 0.0
                trade_count = 0
                if not perf_df.empty:
                    pr = perf_df.iloc[0]
                    sharpe = float(pr.get('sharpe_ratio') or 0)
                    max_dd = float(pr.get('max_drawdown') or 0)
                    trade_count = int(pr.get('trade_count') or 0)
                return {
                    "total_asset": round(total_asset, 2),
                    "initial_capital": round(initial_capital, 2),
                    "total_return": round(total_return, 6),
                    "total_pnl": round(total_asset - initial_capital, 2),
                    "available_cash": round(available_cash, 2),
                    "position_value": round(market_value, 2),
                    "position_count": 0,  # 由 /api/positions 端点提供精确数量
                    "data_start": _cfg_str("backtest.start_date", ""),
                    "data_end": _cfg_str("backtest.end_date", ""),
                    "trading_days": 0,
                    "total_return_pct": round(total_return, 6),
                    "annual_return": round(total_return * 2.0, 6),
                    "max_drawdown": round(max_dd, 6),
                    "sharpe_ratio": round(sharpe, 4),
                    "trade_count": trade_count,
                }
        except Exception as e:
            logger.warning("Failed to load dashboard overview from database, using mock payload: %s", e)

    # 降级到原有 mock 实现
    equity_curve = _build_equity_curve_payload()
    latest = equity_curve[-1]
    total_asset = float(latest["total_asset"])
    total_return = 0.0 if initial_capital <= 0 else (total_asset - initial_capital) / initial_capital
    position_value = float(latest["position_value"])
    available_cash = float(latest["cash"])
    max_drawdown = _max_drawdown_from_curve(equity_curve)
    trading_days = 126
    return {
        "total_asset": round(total_asset, 2),
        "initial_capital": round(initial_capital, 2),
        "total_return": round(total_return, 6),
        "total_pnl": round(total_asset - initial_capital, 2),
        "available_cash": round(available_cash, 2),
        "position_value": round(position_value, 2),
        "position_count": 5,
        "data_start": _cfg_str("backtest.start_date", "20240701"),
        "data_end": _cfg_str("backtest.end_date", "20241231"),
        "trading_days": trading_days,
        "total_return_pct": round(total_return, 6),
        "annual_return": round(total_return * 252 / trading_days, 6),
        "max_drawdown": round(max_drawdown, 6),
        "sharpe_ratio": 1.72,
        "trade_count": 48,
    }


@app.get("/api/equity/curve")
async def get_equity_curve_compat():
    """权益曲线：优先从 DB 读取，DB 为空时降级为 mock"""
    if _db:
        try:
            df = _db.get_performance_history()
            if not df.empty:
                df = df.sort_values('date')
                initial_capital = float(
                    config.get('backtest.initial_capital') or
                    config.get('account.available_cash', 50000.0)
                )
                data = []
                peak_nav = 0.0
                for _, row in df.iterrows():
                    total_return = float(row.get('total_return') or 0)
                    nav = round(1.0 + total_return, 6)
                    total_asset = round(initial_capital * nav, 2)
                    peak_nav = max(peak_nav, nav)
                    data.append({
                        "date": str(row['date']),
                        "total_asset": total_asset,
                        "nav": nav,
                        "cash": 0.0,
                        "position_value": total_asset,
                        "benchmark": 1.0,
                    })
                return {"data": data}
        except Exception as e:
            logger.warning("Failed to load equity curve from database, using mock payload: %s", e)
    return {"data": _build_equity_curve_payload()}


@app.get("/api/equity/drawdown")
async def get_equity_drawdown_compat():
    return {"data": _build_drawdown_curve_payload(_build_equity_curve_payload())}


@app.get("/api/backtest/config")
async def get_backtest_config():
    return BACKTEST_RUNTIME_STATE["config"]


@app.post("/api/backtest/run")
async def run_backtest_with_config(payload: FrontBacktestConfig):
    BACKTEST_RUNTIME_STATE["config"] = payload.dict()
    try:
        strategy_code = _build_strategy_stub(BACKTEST_RUNTIME_STATE["config"])
        backtest_payload = {
            "strategy_code": strategy_code,
            "backtest_config": {
                "start": _format_backtest_date(payload.backtestStart),
                "end": _format_backtest_date(payload.backtestEnd),
                "benchmark": payload.trackingIndex,
                "initialCapital": payload.initialCapital,
                "sectorUniverse": payload.sectorUniverse,
                "excludedSectors": payload.excludedSectors,
                "rebalancePreset": payload.rebalancePreset,
                "rebalanceDays": payload.rebalanceDays,
                "holdingDays": payload.holdingDays,
                "buyTiming": payload.buyTiming,
                "buyPriority": payload.buyPriority,
                "sellCondition": payload.sellCondition,
                "enableTakeProfit": payload.enableTakeProfit,
                "takeProfitRatio": payload.takeProfitRatio,
                "enableStopLoss": payload.enableStopLoss,
                "stopLossRatio": payload.stopLossRatio,
                "enableMaxPullback": payload.enableMaxPullback,
                "maxProfitPullback": payload.maxProfitPullback,
                "dailyBuyLimit": payload.dailyBuyLimit,
                "strategyName": payload.strategyName,
            },
        }
        response = await _post_qmt_api_async("/qmt/submit_backtest", backtest_payload, timeout=60)
        BACKTEST_RUNTIME_STATE["task_id"] = response.get("task_id")
        BACKTEST_RUNTIME_STATE["last_report"] = None
        return {"task_id": BACKTEST_RUNTIME_STATE["task_id"], "status": "submitted"}
    except Exception as exc:
        logger.error("Failed to submit backtest config to QMT service: %s", exc)
        raise HTTPException(status_code=500, detail=f"回测任务提交失败: {exc}")


@app.get("/api/backtest/run/status")
async def get_backtest_run_status():
    task_id = BACKTEST_RUNTIME_STATE.get("task_id")
    if not task_id:
        return {"status": "idle"}
    try:
        status = await _post_qmt_api_async("/qmt/backtest_status", {"task_id": task_id})
        BACKTEST_RUNTIME_STATE["last_status"] = status
        return status
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取回测状态失败: {exc}")


@app.get("/api/backtest/report")
async def get_backtest_report_compat():
    report = await _ensure_latest_backtest_report()
    if report:
        metrics = report.get("metrics", {})
        config_snapshot = BACKTEST_RUNTIME_STATE.get("config", {})
        return {
            "total_return": metrics.get("total_return"),
            "annual_return": metrics.get("annual_return"),
            "volatility": metrics.get("volatility"),
            "max_drawdown": metrics.get("max_drawdown"),
            "max_drawdown_duration": metrics.get("max_drawdown_duration", 0),
            "var_95": metrics.get("var_95"),
            "cvar_95": metrics.get("cvar_95"),
            "sharpe_ratio": metrics.get("sharpe_ratio"),
            "sortino_ratio": metrics.get("sortino_ratio"),
            "calmar_ratio": metrics.get("calmar_ratio"),
            "information_ratio": metrics.get("information_ratio"),
            "beta": metrics.get("beta"),
            "alpha": metrics.get("alpha"),
            "trade_count": metrics.get("trade_count", 0),
            "win_rate": metrics.get("win_rate"),
            "profit_loss_ratio": metrics.get("profit_loss_ratio"),
            "data_points": report.get("data_points", 0),
            "start_date": config_snapshot.get("backtestStart"),
            "end_date": config_snapshot.get("backtestEnd"),
        }

    equity_curve = _build_equity_curve_payload()
    max_drawdown = _max_drawdown_from_curve(equity_curve)
    total_return = float(equity_curve[-1]["nav"]) - 1.0
    return {
        "total_return": round(total_return, 6),
        "annual_return": round(total_return * 2.0, 6),
        "volatility": 0.1821,
        "max_drawdown": round(max_drawdown, 6),
        "max_drawdown_duration": 23,
        "var_95": -0.023,
        "cvar_95": -0.032,
        "sharpe_ratio": 1.72,
        "sortino_ratio": 2.03,
        "calmar_ratio": 1.18,
        "information_ratio": 0.64,
        "beta": 0.87,
        "alpha": 0.061,
        "trade_count": 48,
        "win_rate": 0.5625,
        "profit_loss_ratio": 1.47,
        "data_points": len(equity_curve),
        "start_date": _cfg_str("backtest.start_date", "20240701"),
        "end_date": _cfg_str("backtest.end_date", "20241231"),
    }


@app.get("/api/backtest/monthly_returns")
async def get_backtest_monthly_returns_compat():
    report = await _ensure_latest_backtest_report()
    if report and report.get("nav_series"):
        monthly = _build_monthly_returns(report["nav_series"], BACKTEST_RUNTIME_STATE["config"].get("backtestStart", "2024-01-01"))
        if monthly:
            return {"data": monthly}
    return {
        "data": [
            {
                "year": 2024,
                "1月": None,
                "2月": None,
                "3月": None,
                "4月": None,
                "5月": None,
                "6月": None,
                "7月": 0.021,
                "8月": 0.013,
                "9月": 0.024,
                "10月": 0.009,
                "11月": 0.017,
                "12月": 0.014,
            }
        ]
    }


@app.get("/api/positions/current")
async def get_positions_current_compat():
    context = _compute_portfolio_context(window_days=30)
    positions = sorted(context["positions"], key=lambda row: float(row.get("market_value") or 0.0), reverse=True)
    payload: List[Dict[str, Any]] = []

    for row in positions:
        total_volume = int(row.get("total_volume", 0) or 0)
        available_volume = int(row.get("available_volume", total_volume) or total_volume)
        avg_price = float(row.get("avg_price", 0) or 0)
        current_price = float(row.get("current_price", row.get("cur_price", avg_price)) or avg_price)
        market_value = float(row.get("market_value", total_volume * current_price) or 0)
        float_pnl = float(row.get("unrealized_pnl", row.get("float_pnl", 0)) or 0)
        cost = avg_price * total_volume if total_volume > 0 else 0.0
        entry_date = row.get("entry_date") or datetime.now().date().isoformat()
        payload.append(
            {
                "symbol": str(row.get("symbol") or ""),
                "total_volume": total_volume,
                "available_volume": available_volume,
                "avg_price": round(avg_price, 4),
                "cur_price": round(current_price, 4),
                "market_value": round(market_value, 2),
                "float_pnl": round(float_pnl, 2),
                "return_rate": round(float_pnl / cost, 6) if cost > 0 else 0.0,
                "entry_date": entry_date,
            }
        )

    summary = {
        "position_count": len(payload),
        "total_market_value": round(context["total_market_value"], 2),
        "total_float_pnl": round(context["float_pnl"], 2),
        "available_cash": round(context["available_cash"], 2),
        "total_asset": round(context["total_asset"], 2),
        "position_ratio": round(context["position_ratio"], 6),
    }
    return {
        "positions": payload,
        "summary": summary,
    }


@app.get("/api/risk/status")
async def get_risk_status_compat():
    context = _compute_portfolio_context(window_days=180)
    initial_capital = _cfg_float("backtest.initial_capital", _cfg_float("account.available_cash", 50000.0))
    current_asset = context["total_asset"]
    max_historical_asset = max(context["max_total_asset"], current_asset)
    current_drawdown = (
        (max_historical_asset - current_asset) / max_historical_asset if max_historical_asset > 0 else 0.0
    )
    total_return = (current_asset - initial_capital) / initial_capital if initial_capital > 0 else 0.0
    volatility = context["volatility"]

    alerts: List[Dict[str, Any]] = []
    drawdown_limit = _cfg_float("strategy.max_profit_drawdown", 0.15)
    exposure_limit = _cfg_float("risk.max_portfolio_exposure", 0.95)
    single_limit = _cfg_float("risk.max_position_ratio", 0.12)
    cash_floor = max(0.05, 1 - exposure_limit)
    cash_ratio = context["available_cash"] / current_asset if current_asset > 0 else 0.0

    if current_drawdown >= drawdown_limit:
        alerts.append(
            {
                "level": "CRITICAL",
                "rule": "max_drawdown",
                "detail": f"组合回撤 {current_drawdown:.2%} 超过阈值 {drawdown_limit:.0%}",
                "timestamp": datetime.now().isoformat(),
            }
        )
    elif current_drawdown >= drawdown_limit * 0.7:
        alerts.append(
            {
                "level": "WARNING",
                "rule": "drawdown_near_limit",
                "detail": f"组合回撤 {current_drawdown:.2%} 接近阈值",
                "timestamp": datetime.now().isoformat(),
            }
        )

    if context["position_ratio"] >= exposure_limit:
        alerts.append(
            {
                "level": "CRITICAL",
                "rule": "exposure_overflow",
                "detail": "组合敞口超过设定上限",
                "timestamp": datetime.now().isoformat(),
            }
        )
    elif context["position_ratio"] >= exposure_limit * 0.9:
        alerts.append(
            {
                "level": "WARNING",
                "rule": "exposure_near_limit",
                "detail": "组合敞口接近上限",
                "timestamp": datetime.now().isoformat(),
            }
        )

    if context["largest_position_ratio"] >= single_limit:
        alerts.append(
            {
                "level": "CRITICAL",
                "rule": "single_position_limit",
                "detail": "单票集中度超过上限",
                "timestamp": datetime.now().isoformat(),
            }
        )

    if cash_ratio <= cash_floor:
        alerts.append(
            {
                "level": "WARNING",
                "rule": "low_liquidity",
                "detail": "现金占比偏低，建议保留更多流动性",
                "timestamp": datetime.now().isoformat(),
            }
        )

    status = "NORMAL"
    if any(alert["level"] == "CRITICAL" for alert in alerts):
        status = "CRITICAL"
    elif any(alert["level"] == "WARNING" for alert in alerts):
        status = "WARNING"

    risk_params = {
        "max_single_position_ratio": single_limit,
        "max_total_position_ratio": exposure_limit,
        "stop_loss_ratio": _cfg_float("strategy.stop_loss_ratio", 0.08),
        "max_profit_drawdown": drawdown_limit,
        "max_drawdown": drawdown_limit,
        "daily_max_loss": abs(_cfg_float("risk.daily_max_loss", -0.05)),
        "new_high_timeout_days": int(_cfg_float("strategy.new_high_timeout", 45)),
    }

    return {
        "current_drawdown": round(current_drawdown, 6),
        "max_historical_asset": round(max_historical_asset, 2),
        "current_asset": round(current_asset, 2),
        "total_return": round(total_return, 6),
        "volatility": round(volatility, 6),
        "risk_params": risk_params,
        "alerts": alerts,
        "status": status,
    }


@app.get("/api/risk/position_analysis")
async def get_risk_position_analysis_compat():
    context = _compute_portfolio_context(window_days=90)
    total_asset = context["total_asset"] or _cfg_float("account.available_cash", 50000.0)
    stop_loss_ratio = _cfg_float("strategy.stop_loss_ratio", 0.08)
    take_profit_ratio = _cfg_float("strategy.max_profit_drawdown", 0.15)
    max_position_ratio = _cfg_float("risk.max_position_ratio", 0.12)

    analysis: List[Dict[str, Any]] = []
    for row in context["positions"]:
        market_value = float(row.get("market_value", 0) or 0)
        float_pnl = float(row.get("unrealized_pnl", row.get("float_pnl", 0)) or 0)
        total_volume = int(row.get("total_volume", 0) or 0)
        avg_price = float(row.get("avg_price", 0) or 0)
        current_price = float(row.get("current_price", avg_price) or avg_price)
        cost = avg_price * total_volume if total_volume > 0 else 0.0
        loss_ratio = max(0.0, -float_pnl / cost) if cost > 0 else 0.0
        position_ratio = market_value / total_asset if total_asset > 0 else 0.0
        risk_level = "LOW"
        if loss_ratio >= stop_loss_ratio or position_ratio >= max_position_ratio * 1.05:
            risk_level = "HIGH"
        elif loss_ratio >= stop_loss_ratio * 0.6 or position_ratio >= max_position_ratio * 0.85:
            risk_level = "MEDIUM"

        analysis.append(
            {
                "symbol": str(row.get("symbol") or ""),
                "position_ratio": round(position_ratio, 6),
                "market_value": round(market_value, 2),
                "float_pnl": round(float_pnl, 2),
                "loss_ratio": round(loss_ratio, 6),
                "risk_level": risk_level,
                "stop_loss_price": round(avg_price * (1 - stop_loss_ratio), 4),
                "take_profit_price": round(avg_price * (1 + take_profit_ratio), 4),
            }
        )

    return {"data": analysis, "total_asset": round(total_asset, 2)}


@app.get("/api/strategy/info")
async def get_strategy_info_compat():
    parameters = {
        "short_window": int(_cfg_float("strategy.short_window", 60)),
        "long_window": int(_cfg_float("strategy.long_window", 180)),
        "volatility_window": int(_cfg_float("strategy.volatility_window", 30)),
        "trend_ratio": _cfg_float("strategy.trend_ratio", 0.0),
        "stop_loss_ratio": _cfg_float("strategy.stop_loss_ratio", 0.08),
        "max_profit_drawdown": _cfg_float("strategy.max_profit_drawdown", 0.15),
        "new_high_timeout": int(_cfg_float("strategy.new_high_timeout", 45)),
    }

    performance = {}
    if _db:
        try:
            history = _db.get_performance_history(
                strategy_name=config.get("strategy.class")
            )
            if history is not None and not history.empty:
                latest = history.sort_values("date").iloc[-1]
                performance = {
                    "total_return": float(latest.get("total_return") or 0.0),
                    "max_drawdown": float(latest.get("max_drawdown") or 0.0),
                    "sharpe_ratio": float(latest.get("sharpe_ratio") or 0.0),
                    "trade_count": int(latest.get("trade_count") or 0),
                    "last_update": str(latest.get("date")),
                }
        except Exception as exc:
            logger.warning("Failed to load strategy performance: %s", exc)

    return {
        "name": config.get("strategy.name", config.get("strategy.class", "Strategy")),
        "description": config.get("strategy.description", "量化策略信息"),
        "version": config.get("strategy.version", "1.0"),
        "index": _cfg_str("index", "399001.SZ"),
        "frequency": _cfg_str("strategy.frequency", "daily"),
        "target_count": int(_cfg_float("strategy.target_count", 10)),
        "symbols": config.get("strategy.symbols", []),
        "parameters": parameters,
        "performance": performance,
        "backtest_period": {
            "start": _cfg_str("backtest.start_date", "20240701"),
            "end": _cfg_str("backtest.end_date", "20241231"),
        },
        "account": {
            "initial_capital": _cfg_float("backtest.initial_capital", 50000.0),
            "commission_rate": _cfg_float("account.commission_rate", 0.0003),
            "stamp_duty_rate": _cfg_float("account.stamp_duty_rate", 0.001),
            "slippage_rate": _cfg_float("account.slippage_rate", 0.001),
        },
    }


@app.get("/api/backtest/metrics/history")
async def get_backtest_metrics_history_compat():
    history = _load_performance_window(365)
    records: List[Dict[str, Any]] = []

    if history is not None and not history.empty:
        for _, row in history.iterrows():
            records.append(
                {
                    "date": str(row.get("date")),
                    "total_return": float(row.get("total_return") or 0.0),
                    "daily_return": float(row.get("daily_return") or 0.0),
                    "max_drawdown": float(row.get("max_drawdown") or 0.0),
                    "sharpe_ratio": float(row.get("sharpe_ratio") or 0.0),
                    "trade_count": int(row.get("trade_count") or 0),
                    "total_pnl": float(row.get("total_pnl") or 0.0),
                }
            )
        return {"data": records}

    rows = _read_csv_records(BACKTEST_REPORT_FILE)
    for row in rows:
        records.append(
            {
                "date": row.get("date"),
                "total_return": float(row.get("total_return") or 0.0),
                "daily_return": float(row.get("daily_return") or 0.0),
                "max_drawdown": float(row.get("max_drawdown") or 0.0),
                "sharpe_ratio": float(row.get("sharpe_ratio") or 0.0),
                "trade_count": int(row.get("trade_count") or 0),
                "total_pnl": float(row.get("total_pnl") or 0.0),
            }
        )
    return {"data": records}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 连接"""
    await manager.connect(websocket)
    try:
        while True:
            # 接收客户端消息 (心跳等)
            data = await websocket.receive_text()
            logger.debug("Received WebSocket message: %s", data)
            
            # 回复确认
            await manager.send_personal(
                websocket,
                {"type": "heartbeat_ack", "timestamp": datetime.now().isoformat()}
            )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        manager.disconnect(websocket)

# ==================== Paperclip 集成 ====================

@app.get("/api/paperclip/adapters", response_model=List[PaperclipAdapterPayload])
async def api_list_paperclip_adapters(current_user: User = Depends(get_current_user)):
    adapters = paperclip_integration.list_adapters()
    return [_paperclip_adapter_payload(adapter) for adapter in adapters]


@app.get("/api/paperclip/adapters/{adapter_type}/models", response_model=List[PaperclipModelEntry])
async def api_get_paperclip_models(adapter_type: str, current_user: User = Depends(get_current_user)):
    adapter = paperclip_integration.get_adapter(adapter_type)
    if not adapter:
        raise HTTPException(status_code=404, detail="Adapter not found")
    return [
        PaperclipModelEntry(
            id=getattr(model, 'id', ''),
            label=getattr(model, 'label', ''),
            source=getattr(model, 'source', None),
        )
        for model in getattr(adapter, 'models', [])
    ]


@app.post("/api/paperclip/adapters/{adapter_type}/test", response_model=PaperclipEnvironmentTestResponse)
async def api_test_paperclip_adapter(
    adapter_type: str,
    payload: PaperclipTestRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        result = paperclip_integration.run_environment_test(
            adapter_type,
            adapter_config=payload.config,
            persist_for_heartbeat=payload.persist_for_heartbeat,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _paperclip_test_response(result)


@app.get("/api/paperclip/heartbeat", response_model=List[PaperclipHeartbeatEntry])
async def api_list_paperclip_heartbeats(current_user: User = Depends(get_current_user)):
    heartbeats = paperclip_integration.list_heartbeats()
    return [_paperclip_heartbeat_payload(entry) for entry in heartbeats]


@app.post("/api/paperclip/heartbeat/refresh")
async def api_refresh_paperclip_heartbeat(current_user: User = Depends(get_current_user)):
    paperclip_integration.run_heartbeat_cycle()
    return {"status": "ok"}

# ==================== 后台任务 ====================

async def broadcast_market_data():
    """定期广播行情数据"""
    symbols = DEFAULT_MARKET_SYMBOLS
    while True:
        try:
            quotes = await asyncio.to_thread(_fetch_market_quotes, symbols)
            if quotes:
                await manager.broadcast({
                    "type": "market_data",
                    "data": quotes,
                    "timestamp": datetime.now().isoformat()
                })
            await asyncio.sleep(3)  # 每 3 秒更新一次
        except Exception as e:
            logger.error("Failed to broadcast market data: %s", e)

async def broadcast_system_status():
    """定期广播系统状态"""
    while True:
        try:
            status_data = _build_system_status_items()
            await manager.broadcast({
                "type": "system_status",
                "data": status_data,
                "timestamp": datetime.now().isoformat()
            })
            
            await asyncio.sleep(10)  # 每 10 秒更新一次
        except Exception as e:
            logger.error("Failed to broadcast system status: %s", e)

@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("Web API service started")
    paperclip_integration.start_heartbeat()
    # 启动后台任务
    asyncio.create_task(broadcast_market_data())
    asyncio.create_task(broadcast_system_status())

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("Web API service stopped")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)







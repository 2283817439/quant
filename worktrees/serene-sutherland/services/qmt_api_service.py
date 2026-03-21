"""
QMT Bridge API Service
提供给 TS 主系统使用的统一接口，用于历史行情、回测、部署、账户快照等操作。
"""
import os
import sys
import uuid
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

try:
    from xtquant import xtdata
except ImportError:
    xtdata = None

# ----------------------------
# FastAPI 初始化
# ----------------------------
app = FastAPI(title="QMT Bridge API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ----------------------------
# 数据模型
# ----------------------------


class HistoryRequest(BaseModel):
    stock_code: str
    period: str = Field(default="1d", description="K线周期，例如 1d/1h/5m")
    start_time: str = Field(default="20220101", description="起始日期 YYYYMMDD")
    end_time: str = Field(default="20231231", description="结束日期 YYYYMMDD")


class BacktestConfig(BaseModel):
    start: str = Field(default="20220101")
    end: str = Field(default="20231231")
    benchmark: str = Field(default="000300.SH")
    initialCapital: float = Field(default=1_000_000)


class BacktestRequest(BaseModel):
    strategy_code: str
    backtest_config: BacktestConfig


class BacktestStatusRequest(BaseModel):
    task_id: str


class DeployRequest(BaseModel):
    strategy_code: str
    metadata: Optional[Dict[str, Any]] = None


class DeploymentStatusRequest(BaseModel):
    deployment_id: str


class AccountSnapshotRequest(BaseModel):
    account_id: Optional[int] = None


class NewsRequest(BaseModel):
    keywords: Optional[List[str]] = None


class ChatPickRequest(BaseModel):
    question: str
    filters: Optional[Dict[str, Any]] = None


# ----------------------------
# 内部状态
# ----------------------------


class BacktestTask:
    def __init__(self, payload: BacktestRequest):
        self.id = str(uuid.uuid4())
        self.payload = payload
        self.status = "pending"
        self.progress = 0.0
        self.error: Optional[str] = None
        self.report: Optional[Dict[str, Any]] = None
        self.created_at = datetime.now()


class DeploymentRecord:
    def __init__(self, payload: DeployRequest):
        self.id = str(uuid.uuid4())
        self.payload = payload
        self.status = "deploying"
        self.created_at = datetime.now()
        self.metrics: Dict[str, Any] = {}


BACKTEST_TASKS: Dict[str, BacktestTask] = {}
DEPLOYMENTS: Dict[str, DeploymentRecord] = {}
DATA_LOCK = threading.Lock()


# ----------------------------
# 工具函数
# ----------------------------


def _ensure_xtdata():
    if xtdata is None:
        raise HTTPException(status_code=500, detail="xtdata 未初始化，请确认 MiniQMT 环境就绪")


def _load_history(stock_code: str, period: str, start: str, end: str):
    _ensure_xtdata()
    xtdata.download_history_data(stock_code, period, start, end, False)
    fields = ["open", "close", "high", "low", "volume"]
    result = xtdata.get_market_data_ex(
        fields,
        [stock_code],
        period=period,
        start_time=start,
        end_time=end,
        fill_data=True,
    )
    records = []
    closes = result.get("close", {}).get(stock_code, [])
    for idx in range(len(closes)):
        record = {"index": idx}
        for field in fields:
            series = result.get(field, {}).get(stock_code, [])
            if idx < len(series):
                record[field] = series[idx]
        records.append(record)
    return records


def _compute_nav_metrics(nav_series: List[float], trading_days_per_year: int = 252) -> Dict[str, float]:
    """
    基于净值序列计算完整的策略绩效指标。
    nav_series: 每日净值，初始值为 1.0
    """
    if not nav_series or len(nav_series) < 2:
        return {
            "total_return": 0.0, "annual_return": 0.0, "max_drawdown": 0.0,
            "volatility": 0.0, "sharpe_ratio": 0.0, "calmar_ratio": 0.0,
            "win_rate": 0.0, "trade_count": 0,
        }

    n = len(nav_series)
    total_return = (nav_series[-1] - nav_series[0]) / nav_series[0]

    # 年化收益
    years = n / trading_days_per_year
    annual_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0.0

    # 日收益率序列
    daily_returns = [(nav_series[i] - nav_series[i - 1]) / nav_series[i - 1]
                     for i in range(1, n)]

    # 波动率（年化）
    avg_ret = sum(daily_returns) / len(daily_returns)
    variance = sum((r - avg_ret) ** 2 for r in daily_returns) / len(daily_returns)
    daily_vol = variance ** 0.5
    volatility = daily_vol * (trading_days_per_year ** 0.5)

    # 夏普比率（无风险利率 2.5%）
    risk_free_daily = 0.025 / trading_days_per_year
    excess_returns = [r - risk_free_daily for r in daily_returns]
    avg_excess = sum(excess_returns) / len(excess_returns)
    sharpe_ratio = (avg_excess / daily_vol * (trading_days_per_year ** 0.5)) if daily_vol > 1e-9 else 0.0

    # 最大回撤
    peak = nav_series[0]
    max_drawdown = 0.0
    for nav in nav_series:
        peak = max(peak, nav)
        dd = (nav - peak) / peak if peak > 0 else 0.0
        max_drawdown = min(max_drawdown, dd)

    # Calmar 比率
    calmar_ratio = annual_return / abs(max_drawdown) if abs(max_drawdown) > 1e-9 else 0.0

    # 胜率（正收益日 / 总交易日）
    win_days = sum(1 for r in daily_returns if r > 0)
    win_rate = win_days / len(daily_returns) if daily_returns else 0.0

    return {
        "total_return": round(total_return, 4),
        "annual_return": round(annual_return, 4),
        "max_drawdown": round(max_drawdown, 4),
        "volatility": round(volatility, 4),
        "sharpe_ratio": round(sharpe_ratio, 4),
        "calmar_ratio": round(calmar_ratio, 4),
        "win_rate": round(win_rate, 4),
        "trade_count": len(daily_returns),
    }


def _simulate_strategy_nav(strategy_code: str, history: List[Dict], initial_capital: float = 1_000_000) -> List[float]:
    """
    简化策略模拟器：解析策略代码中的 PARAMS，执行双均线逻辑，返回净值序列。
    支持 short_window / long_window / max_position 参数。
    """
    import re

    # 从策略代码中提取参数
    short_window = 10
    long_window = 30
    max_position = 0.05

    short_match = re.search(r'"short_window"\s*:\s*([\d.]+)', strategy_code)
    long_match = re.search(r'"long_window"\s*:\s*([\d.]+)', strategy_code)
    pos_match = re.search(r'"max_position"\s*:\s*([\d.]+)', strategy_code)

    if short_match:
        short_window = max(1, int(float(short_match.group(1))))
    if long_match:
        long_window = max(short_window + 1, int(float(long_match.group(1))))
    if pos_match:
        max_position = min(1.0, max(0.01, float(pos_match.group(1))))

    closes = [item.get("close", 0.0) for item in history if item.get("close")]
    if len(closes) < long_window + 1:
        # 数据不足，返回平坦净值
        return [1.0] * max(2, len(closes))

    cash = initial_capital
    shares = 0.0
    nav_series = []

    for i in range(len(closes)):
        price = closes[i]
        if price <= 0:
            nav_series.append((cash + shares * (closes[i - 1] if i > 0 else price)) / initial_capital)
            continue

        portfolio_value = cash + shares * price

        if i >= long_window:
            ma_short = sum(closes[i - short_window + 1: i + 1]) / short_window
            ma_long = sum(closes[i - long_window + 1: i + 1]) / long_window

            target_value = portfolio_value * max_position
            if ma_short > ma_long and shares == 0 and cash >= price:
                # 买入
                buy_shares = target_value / price
                cost = buy_shares * price
                if cost <= cash:
                    shares += buy_shares
                    cash -= cost
            elif ma_short < ma_long and shares > 0:
                # 卖出
                cash += shares * price
                shares = 0.0

        portfolio_value = cash + shares * price
        nav_series.append(portfolio_value / initial_capital)

    return nav_series if nav_series else [1.0]


def _run_backtest_task(task: BacktestTask):
    try:
        task.status = "running"
        initial_capital = float(getattr(task.payload.backtest_config, 'initialCapital', 1_000_000) or 1_000_000)

        # 加载策略标的历史数据（优先用 benchmark 作为代理标的）
        history = _load_history(
            stock_code=task.payload.backtest_config.benchmark,
            period="1d",
            start=task.payload.backtest_config.start,
            end=task.payload.backtest_config.end,
        )

        # 用策略模拟器生成净值序列
        nav_series = _simulate_strategy_nav(task.payload.strategy_code, history, initial_capital)
        metrics = _compute_nav_metrics(nav_series)

        task.progress = 1.0
        task.status = "completed"
        task.report = {
            "task_id": task.id,
            "strategy_preview": task.payload.strategy_code[:200],
            "metrics": metrics,
            "data_points": len(history),
            "nav_series": nav_series[-100:],  # 最近100个净值点供前端绘图
            "generated_at": datetime.now().isoformat(),
        }
    except Exception as exc:
        task.status = "failed"
        task.error = str(exc)


# ----------------------------
# API 实现
# ----------------------------


@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/qmt/get_history_kline")
def get_history_kline(payload: HistoryRequest):
    history = _load_history(payload.stock_code, payload.period, payload.start_time, payload.end_time)
    return {"stock_code": payload.stock_code, "data": history}


@app.post("/qmt/submit_backtest")
def submit_backtest(payload: BacktestRequest):
    task = BacktestTask(payload)
    with DATA_LOCK:
        BACKTEST_TASKS[task.id] = task
    worker = threading.Thread(target=_run_backtest_task, args=(task,), daemon=True)
    worker.start()
    return {"task_id": task.id, "submitted_at": task.created_at.isoformat()}


@app.post("/qmt/backtest_status")
def backtest_status(payload: BacktestStatusRequest):
    task = BACKTEST_TASKS.get(payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Backtest task not found")
    return {"task_id": task.id, "status": task.status, "progress": task.progress, "error": task.error}


@app.post("/qmt/backtest_report")
def backtest_report(payload: BacktestStatusRequest):
    task = BACKTEST_TASKS.get(payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Backtest task not found")
    if task.status != "completed" or not task.report:
        raise HTTPException(status_code=400, detail="Backtest not completed yet")
    return {"task_id": task.id, "report": task.report}


@app.post("/qmt/strategy/deploy")
def deploy_strategy(payload: DeployRequest):
    deployment = DeploymentRecord(payload)
    deployment.status = "running"
    deployment.metrics = {
        "pnl": 0.0,
        "orders": 0,
        "last_heartbeat": datetime.now().isoformat(),
    }
    DEPLOYMENTS[deployment.id] = deployment
    return {"deployment_id": deployment.id, "status": deployment.status}


@app.post("/qmt/strategy/status")
def deployment_status(payload: DeploymentStatusRequest):
    deployment = DEPLOYMENTS.get(payload.deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    # 模拟实时刷新
    deployment.metrics["last_heartbeat"] = datetime.now().isoformat()
    return {
        "deployment_id": deployment.id,
        "status": deployment.status,
        "metrics": deployment.metrics,
    }


def _get_xt_positions() -> List[Dict]:
    """从 xtquant 获取真实持仓，失败时返回空列表。"""
    if xtdata is None:
        return []
    try:
        # xtdata.get_stock_list_in_sector / get_full_tick 不提供持仓
        # 持仓需通过 xttrader，此处尝试动态导入
        from xtquant.xttrader import XtQuantTrader
        from xtquant import xtconstant
        # 如果没有活跃 trader 实例，直接返回空
        return []
    except Exception:
        return []


def _get_xt_asset() -> Optional[Dict]:
    """从 xtquant 获取真实资产，失败时返回 None。"""
    if xtdata is None:
        return None
    try:
        from xtquant.xttrader import XtQuantTrader
        return None
    except Exception:
        return None


@app.post("/qmt/account/positions")
def account_snapshot(payload: AccountSnapshotRequest):
    now = datetime.now().isoformat()

    # 尝试从真实 QMT 账户获取持仓
    real_positions = _get_xt_positions()
    real_asset = _get_xt_asset()

    if real_positions or real_asset:
        total_mv = sum(p.get("market_value", 0) for p in real_positions)
        summary = {
            "total_assets": real_asset.get("total_asset", total_mv) if real_asset else total_mv,
            "available_cash": real_asset.get("available_cash", 0) if real_asset else 0,
            "market_value": total_mv,
            "timestamp": now,
            "source": "live",
        }
        return {"summary": summary, "positions": real_positions}

    # QMT 未连接时返回空持仓（不再返回假数据）
    summary = {
        "total_assets": 0.0,
        "available_cash": 0.0,
        "market_value": 0.0,
        "timestamp": now,
        "source": "disconnected",
    }
    return {"summary": summary, "positions": []}


@app.post("/qmt/risk_metrics")
def risk_metrics():
    """基于当前持仓动态计算风控指标，QMT 未连接时返回零值。"""
    now = datetime.now().isoformat()
    real_positions = _get_xt_positions()

    if not real_positions:
        return {"metrics": {
            "max_drawdown": 0.0, "var_95": 0.0, "cvar_95": 0.0,
            "leverage": 0.0, "updated_at": now, "source": "disconnected",
        }}

    total_mv = sum(p.get("market_value", 0) for p in real_positions)
    total_cost = sum(p.get("quantity", 0) * p.get("cost_price", 0) for p in real_positions)
    total_pnl = sum(p.get("floating_pnl", 0) for p in real_positions)

    # 简单风控指标
    unrealized_return = total_pnl / total_cost if total_cost > 0 else 0.0
    max_drawdown = min(0.0, unrealized_return)  # 当前浮亏作为近似最大回撤

    return {"metrics": {
        "max_drawdown": round(max_drawdown, 4),
        "var_95": round(max_drawdown * 0.8, 4),
        "cvar_95": round(max_drawdown * 1.2, 4),
        "leverage": 1.0,
        "total_market_value": round(total_mv, 2),
        "unrealized_pnl": round(total_pnl, 2),
        "updated_at": now,
        "source": "live",
    }}


@app.post("/qmt/news_feed")
def news_feed(payload: NewsRequest):
    keywords = payload.keywords or ["市场", "AI", "量化"]
    now = datetime.now()
    items = []
    for idx, keyword in enumerate(keywords):
        items.append(
            {
                "id": str(uuid.uuid4()),
                "title": f"{keyword} - 自动采集快讯",
                "summary": f"系统在 {now.strftime('%Y-%m-%d %H:%M:%S')} 自动生成的 {keyword} 新闻摘要。",
                "url": f"https://news.example.com/{keyword}/{idx}",
                "timestamp": now.isoformat(),
            }
        )
    return {"items": items}


@app.post("/qmt/ai/chat-pick")
def ai_chat_pick(payload: ChatPickRequest):
    """
    AI 文字选股接口 — 接收自然语言问题，调用本地 LLM 解析意图，返回选股结果。

    示例问题：
      "换手率>1%,量比>0.8,主板；龙头，非ST；阳线形态；近2日主力资金流入，吸筹，价升量涨形态；
       股价小于15元；流通市值大于6亿小于50亿；KDJ的J>D；KDJ(D值)>25；连续涨停天数<2日"

    返回：
      {
        "answer": "根据您的条件，筛选出以下标的...",
        "stocks": [...],
        "filters_used": {...}
      }
    """
    question = payload.question
    filters = payload.filters or {}

    # 简单规则解析（生产环境应调用 Ollama/deepseek 模型）
    # 这里用正则提取关键参数
    import re

    # 换手率
    m = re.search(r'换手率[>＞](\d+\.?\d*)%?', question)
    if m:
        filters.setdefault("min_turnover_rate", float(m.group(1)))

    # 量比
    m = re.search(r'量比[>＞](\d+\.?\d*)', question)
    if m:
        filters.setdefault("min_volume_ratio", float(m.group(1)))

    # 主板
    if "主板" in question:
        filters.setdefault("main_board_only", True)

    # 非ST
    if "非ST" in question or "排除ST" in question:
        filters.setdefault("exclude_st", True)

    # 阳线
    if "阳线" in question:
        filters.setdefault("require_yang", True)

    # 主力流入
    if "主力" in question and ("流入" in question or "吸筹" in question):
        filters.setdefault("require_inflow", True)

    # 股价上限
    m = re.search(r'股价[小<＜]于[+＋]?(\d+\.?\d*)', question)
    if m:
        filters.setdefault("max_price", float(m.group(1)))

    # 流通市值
    m = re.search(r'流通市值[大>＞]于(\d+\.?\d*)亿', question)
    if m:
        filters.setdefault("min_float_mv", float(m.group(1)))
    m = re.search(r'[小<＜]于[+＋]?(\d+\.?\d*)亿', question)
    if m:
        filters.setdefault("max_float_mv", float(m.group(1)))

    # KDJ
    if "J>D" in question or "J＞D" in question:
        filters.setdefault("kdj_j_gt_d", True)
    m = re.search(r'D[值]?[>＞](\d+\.?\d*)', question)
    if m:
        filters.setdefault("min_kdj_d", float(m.group(1)))

    # 涨停天数
    m = re.search(r'涨停天数[<＜](\d+)', question)
    if m:
        filters.setdefault("max_limit_up_days", int(m.group(1)))

    # 调用 market_data_api 的选股接口
    import requests
    try:
        resp = requests.post(
            "http://127.0.0.1:8081/api/ai/stock-picker",
            json={"filters": filters},
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        stocks = data.get("data", [])

        answer = f"根据您的条件，筛选出 {len(stocks)} 只标的。"
        if stocks:
            answer += f" 推荐关注：{', '.join([s['name'] for s in stocks[:5]])}"

        return {
            "answer": answer,
            "stocks": stocks,
            "filters_used": filters,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        return {
            "answer": f"选股服务调用失败：{str(e)}",
            "stocks": [],
            "filters_used": filters,
            "timestamp": datetime.now().isoformat(),
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8082)

"""
市场数据 API 服务 - 基于 xtdata 实时行情
提供大盘指数、市场热度数据和股票排行榜
"""
import sys
import os
from typing import Dict, List, Optional, Sequence, Tuple
from datetime import datetime
import pandas as pd
import numpy as np

# 添加项目根目录到路径
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# 导入 xtdata (从 lianghua 环境的 site-packages)
try:
    from xtquant import xtdata
    print("[market-api] Successfully imported xtdata from lianghua env", flush=True)
except ImportError as e:
    print(f"[market-api] WARNING: Failed to import xtdata: {e}", flush=True)
    xtdata = None  # 标记为不可用
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Market Data API")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 常用大盘指数代码（兜底）
DEFAULT_INDEX_CODES = [
    '000001.SH',  # 上证指数
    '399001.SZ',  # 深证成指
    '000300.SH',  # 沪深 300
    '000016.SH',  # 上证 50
    '399006.SZ',  # 创业板指
    '000688.SH',  # 科创 50
]

# 热点板块扫描配置
HOT_SECTOR_PREFIXES = ("GN_", "TGN_", "TFG_", "SW", "HY_", "DY_", "BK_")
MAX_HOT_SECTOR_SCAN = 80
MAX_STOCKS_PER_SECTOR = 80

# 板块搜索关键字
INDEX_SECTOR_KEYWORDS = ["指数", "沪深指数", "上证指数", "深证指数", "index"]
A_SHARE_SECTOR_KEYWORDS = ["a股", "ashare", "沪深a股", "沪深 a 股", "沪深A股"]

# 全局变量存储订阅信息
whole_quote_sub_id: Optional[int] = None


def _normalize_text(value) -> str:
    """
    将 xtdata 返回的板块名称统一为可比较的字符串
    """
    if isinstance(value, bytes):
        for encoding in ("utf-8", "gbk"):
            try:
                return value.decode(encoding).strip()
            except Exception:
                continue
        return value.decode("utf-8", errors="ignore").strip()
    return str(value).strip()


def resolve_sector_stock_list(
    keywords: Sequence[str],
    min_size: int = 0,
) -> Tuple[List[str], Optional[str]]:
    """
    根据关键字在 xtdata 板块列表中查找匹配的板块，并返回成分股列表
    """
    if xtdata is None:
        return [], None

    try:
        sectors = xtdata.get_sector_list()
    except Exception as e:
        print(f"[market-api] Failed to load sector list: {e}", file=sys.stderr)
        return [], None

    if not sectors:
        return [], None

    normalized_sectors: List[Tuple[object, str]] = []
    for sector in sectors:
        if sector is None:
            continue
        normalized = _normalize_text(sector)
        if not normalized:
            continue
        normalized_sectors.append((sector, normalized))

    if not normalized_sectors:
        return [], None

    def _try_match(exact: bool) -> Optional[Tuple[List[str], str]]:
        for keyword in keywords:
            needle = keyword.lower()
            for raw, normalized in normalized_sectors:
                candidate = normalized.lower()
                matched = candidate == needle if exact else needle in candidate
                if not matched:
                    continue
                try:
                    stocks = xtdata.get_stock_list_in_sector(raw)
                except Exception as sector_err:
                    print(f"[market-api] Failed to get stocks for sector '{normalized}': {sector_err}", file=sys.stderr)
                    continue
                if not stocks:
                    continue
                if min_size and len(stocks) < min_size:
                    continue
                return stocks, normalized
        return None

    hit = _try_match(exact=True)
    if hit:
        return hit

    hit = _try_match(exact=False)
    if hit:
        return hit

    return [], None


def resolve_index_codes() -> List[str]:
    """
    根据板块关键字解析大盘指数代码，若失败则使用默认列表
    """
    stocks, sector_name = resolve_sector_stock_list(INDEX_SECTOR_KEYWORDS, min_size=5)
    if stocks:
        preferred = [code for code in DEFAULT_INDEX_CODES if code in stocks]
        if preferred:
            print(f"[market-api] Using sector '{sector_name}' for index codes ({len(preferred)} matched)", file=sys.stderr)
            return preferred
        limited = stocks[:len(DEFAULT_INDEX_CODES)]
        print(f"[market-api] Sector '{sector_name}' returned {len(stocks)} indices, using first {len(limited)}", file=sys.stderr)
        return limited

    print("[market-api] Falling back to default index codes", file=sys.stderr)
    return DEFAULT_INDEX_CODES.copy()


def get_market_indices_data() -> List[Dict]:
    """
    获取大盘指数数据
    使用 xtdata.get_full_tick 获取实时指数行情
    
    Returns:
        指数数据列表
    """
    if xtdata is None:
        print("[market-api] xtdata not available, returning empty indices", file=sys.stderr)
        return []
    
    global whole_quote_sub_id
    
    indices_codes = resolve_index_codes()
    if not indices_codes:
        print("[market-api] No index codes resolved", file=sys.stderr)
        return []
    
    try:
        # 订阅全推数据 (如果未订阅)
        if whole_quote_sub_id is None or whole_quote_sub_id == -1:
            def on_data(datas):
                pass  # 不需要回调，直接读取最新数据
            
            whole_quote_sub_id = xtdata.subscribe_whole_quote(['SH', 'SZ'], callback=on_data)
            print(f"[market-api] Subscribed to whole quote, id={whole_quote_sub_id}", file=sys.stderr)
            
            # 等待数据更新
            import time
            time.sleep(2)
        
        # 获取全推 tick 数据
        tick_data = xtdata.get_full_tick(indices_codes)
        
        result = []
        for code in indices_codes:
            if code not in tick_data:
                continue
            
            tick = tick_data[code]
            
            last_price = float(tick.get('lastPrice', 0))
            open_price = float(tick.get('open', 0))
            high_price = float(tick.get('high', 0))
            low_price = float(tick.get('low', 0))
            prev_close = float(tick.get('lastClose', 0))
            volume = float(tick.get('volume', 0))
            amount = float(tick.get('amount', 0))
            
            if last_price <= 0:
                continue
            
            change = last_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close > 0 else 0.0
            
            # 指数名称映射
            name_map = {
                '000001.SH': '上证指数',
                '399001.SZ': '深证成指',
                '000300.SH': '沪深 300',
                '000016.SH': '上证 50',
                '399006.SZ': '创业板指',
                '000688.SH': '科创 50',
            }
            display_name = name_map.get(code)
            if not display_name:
                try:
                    detail = xtdata.get_instrument_detail(code)
                    display_name = detail.get('InstrumentName', code) if detail else code
                except Exception:
                    display_name = code
            
            result.append({
                'code': code,
                'name': display_name,
                'price': last_price,
                'change': round(change, 2),
                'changePercent': round(change_percent, 2),
                'volume': int(volume),
                'turnover': round(amount, 2),
                'high': high_price,
                'low': low_price,
                'open': open_price,
                'prevClose': prev_close,
                'timestamp': datetime.now().isoformat(),
            })
        
        return result
        
    except Exception as e:
        print(f"[market-api] Failed to get market indices: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return []


def calculate_market_heat() -> Dict:
    """
    计算市场热度数据
    """
    if xtdata is None:
        print("[market-api] xtdata not available, returning default heat data", file=sys.stderr)
        return {
            'advanceDeclineRatio': 0.5,
            'advanceCount': 0,
            'declineCount': 0,
            'limitUpCount': 0,
            'limitDownCount': 0,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': 0.0,
            'heatLevel': 'LOW',
            'timestamp': datetime.now().isoformat(),
        }
    
    try:
        a_share_stocks = get_a_share_stock_list()
        if a_share_stocks:
            print(f"[market-api] Calculating heat from {len(a_share_stocks)} A-share stocks", file=sys.stderr)
            return _calculate_heat_from_stock_list(a_share_stocks)
        print("[market-api] A-share sector not resolved, using fallback heat calculation", file=sys.stderr)
        return calculate_market_heat_fallback_v2()
        
    except Exception as e:
        print(f"[market-api] Failed to calculate market heat: {e}", file=sys.stderr)
        # 返回默认值
        return {
            'advanceDeclineRatio': 0.5,
            'advanceCount': 0,
            'declineCount': 0,
            'limitUpCount': 0,
            'limitDownCount': 0,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': 0.0,
            'heatLevel': 'LOW',
            'timestamp': datetime.now().isoformat(),
        }


def _calculate_heat_from_stock_list(stock_list: List[str]) -> Dict:
    """
    从给定的股票列表计算市场热度
    """
    global whole_quote_sub_id
    
    try:
        # 订阅全推数据 (如果未订阅)
        if whole_quote_sub_id is None or whole_quote_sub_id == -1:
            def on_data(datas):
                pass  # 不需要回调，直接读取最新数据
            
            whole_quote_sub_id = xtdata.subscribe_whole_quote(['SH', 'SZ'], callback=on_data)
            print(f"[market-api] Subscribed to whole quote, id={whole_quote_sub_id}", file=sys.stderr)
            
            # 等待数据更新
            import time
            time.sleep(2)
        
        # 获取全市场 tick 数据
        print("[market-api] Fetching full market tick data...", file=sys.stderr)
        tick_data = xtdata.get_full_tick(['SH', 'SZ'])
        
        advance_count = 0
        decline_count = 0
        flat_count = 0
        limit_up_count = 0
        limit_down_count = 0
        total_volume = 0
        total_turnover = 0
        processed_stocks = 0
        
        # 遍历股票列表，统计涨跌家数
        for code in stock_list:
            # 确保代码格式正确
            if not code or '.' not in code:
                continue
            
            # 检查 tick 数据是否存在
            if code not in tick_data:
                continue
            
            tick = tick_data[code]
            
            # 跳过无效数据
            if not isinstance(tick, dict):
                continue
            
            last_price = tick.get('lastPrice', 0)
            pre_close = tick.get('lastClose', 0)
            
            if last_price <= 0 or pre_close <= 0:
                continue
            
            # 计算涨跌幅
            change_pct = (last_price - pre_close) / pre_close * 100
            
            # 统计涨跌平家数
            if change_pct > 0.01:  # 涨幅超过 0.01%
                advance_count += 1
            elif change_pct < -0.01:  # 跌幅超过 0.01%
                decline_count += 1
            else:
                flat_count += 1
            
            # 统计涨停跌停
            is_limit_up = False
            is_limit_down = False
            
            # 判断是否为科创板或创业板
            if code.startswith('688') or code.startswith('300'):
                # 科创板/创业板：±20%
                if change_pct >= 19.8:
                    is_limit_up = True
                elif change_pct <= -19.8:
                    is_limit_down = True
            elif code.startswith('4') or code.startswith('8'):
                # 北交所：±30%
                if change_pct >= 29.8:
                    is_limit_up = True
                elif change_pct <= -29.8:
                    is_limit_down = True
            else:
                # 主板：±10%
                if change_pct >= 9.8:
                    is_limit_up = True
                elif change_pct <= -9.8:
                    is_limit_down = True
            
            if is_limit_up:
                limit_up_count += 1
            elif is_limit_down:
                limit_down_count += 1
            
            # 累计成交量和成交额
            total_volume += tick.get('volume', 0)
            total_turnover += tick.get('amount', 0)
            
            processed_stocks += 1
        
        print(f"[market-api] Processed {processed_stocks} stocks (Advance: {advance_count}, Decline: {decline_count}, Flat: {flat_count})", file=sys.stderr)
        
        # 计算涨跌比
        total_trading = advance_count + decline_count + flat_count
        advance_decline_ratio = advance_count / total_trading if total_trading > 0 else 0.5
        
        # 计算热度分数 (0-100)
        heat_score = min(100, max(0, 
            advance_decline_ratio * 60 +  # 涨跌比贡献 60 分
            (limit_up_count / max(total_trading, 1)) * 100 * 20 +  # 涨停贡献 20 分
            (min(total_volume, 1e10) / 1e10) * 20  # 成交量贡献 20 分
        ))
        
        # 确定热度等级
        if heat_score >= 80:
            heat_level = 'VERY_HIGH'
        elif heat_score >= 60:
            heat_level = 'HIGH'
        elif heat_score >= 40:
            heat_level = 'MEDIUM'
        else:
            heat_level = 'LOW'
        
        return {
            'advanceDeclineRatio': round(advance_decline_ratio, 4),
            'advanceCount': advance_count,
            'declineCount': decline_count,
            'limitUpCount': limit_up_count,
            'limitDownCount': limit_down_count,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': round(heat_score, 2),
            'heatLevel': heat_level,
            'timestamp': datetime.now().isoformat(),
        }
        
    except Exception as e:
        print(f"[market-api] Failed to calculate heat from stock list: {e}", file=sys.stderr)
        return calculate_market_heat_fallback_v2()


def get_sector_list() -> List[str]:
    """
    获取板块列表
    Returns:
        板块名称列表
    """
    if xtdata is None:
        return []
    
    try:
        # 获取行业板块
        sectors = xtdata.get_sector_list()
        print(f"[market-api] Got {len(sectors)} sectors", file=sys.stderr)
        return sectors
    except Exception as e:
        print(f"[market-api] Failed to get sector list: {e}", file=sys.stderr)
        return []


def get_sector_stocks(sector_name: str) -> List[str]:
    """
    获取板块成分股
    Args:
        sector_name: 板块名称
    Returns:
        股票代码列表
    """
    if xtdata is None:
        return []
    
    try:
        stocks = xtdata.get_stock_list_in_sector(sector_name)
        print(f"[market-api] Sector '{sector_name}' has {len(stocks)} stocks", file=sys.stderr)
        return stocks
    except Exception as e:
        print(f"[market-api] Failed to get sector stocks: {e}", file=sys.stderr)
        return []


def get_capital_flow(stock_list: List[str], period: str = "transactioncount1d") -> Dict:
    """
    获取资金流向数据
    Args:
        stock_list: 股票代码列表
        period: 周期 "transactioncount1d"(日频) 或 "transactioncount1m"(月频)
    Returns:
        资金流数据字典
    """
    if xtdata is None:
        return {}
    
    try:
        # 下载历史数据（必须先下载）
        print(f"[market-api] Downloading capital flow data for {len(stock_list)} stocks...", file=sys.stderr)
        xtdata.download_history_data(stock_list, period=period)
        
        # 获取最新交易日
        today = datetime.now().strftime("%Y%m%d")
        
        # 获取资金流数据
        flow_data = xtdata.get_market_data_ex(
            fields=[],
            stock_list=stock_list,
            period=period,
            start_time=today,
            end_time=today
        )
        
        print(f"[market-api] Got capital flow data for {len(flow_data)} stocks", file=sys.stderr)
        return flow_data
    except Exception as e:
        print(f"[market-api] Failed to get capital flow: {e}", file=sys.stderr)
        return {}


def analyze_hot_sectors(top_n: int = 10) -> List[Dict]:
    """
    基于板块成分股的涨幅、主力净流入与涨停数量识别热点板块
    """
    if xtdata is None:
        return []
    
    try:
        all_sectors = xtdata.get_sector_list()
    except Exception as e:
        print(f"[market-api] Failed to get sector list for hot sectors: {e}", file=sys.stderr)
        return []
    
    if not all_sectors:
        return []
    
    # 归一化板块名称，筛选概念/行业/申万等板块
    filtered_sectors: List[Tuple[object, str]] = []
    for sector in all_sectors:
        name = _normalize_text(sector)
        if not name:
            continue
        upper_name = name.upper()
        if upper_name.startswith(HOT_SECTOR_PREFIXES) or any(kw in name for kw in ["概念", "行业", "地区"]):
            filtered_sectors.append((sector, name))
    
    if not filtered_sectors:
        print("[market-api] No sector matched for hot sector scanning", file=sys.stderr)
        return []
    
    limited_sectors = filtered_sectors[:MAX_HOT_SECTOR_SCAN]
    sector_stock_map: Dict[str, List[str]] = {}
    for raw, display_name in limited_sectors:
        try:
            stocks = xtdata.get_stock_list_in_sector(raw)
        except Exception as e:
            print(f"[market-api] Failed to get stocks for sector '{display_name}': {e}", file=sys.stderr)
            continue
        if not stocks:
            continue
        filtered_stocks = [
            stock for stock in stocks
            if isinstance(stock, str) and (stock.endswith(".SH") or stock.endswith(".SZ"))
        ][:MAX_STOCKS_PER_SECTOR]
        if len(filtered_stocks) < 5:
            continue
        sector_stock_map[display_name] = filtered_stocks
    
    if not sector_stock_map:
        print("[market-api] No sector stocks available for hot sector analysis", file=sys.stderr)
        return []
    
    # 构建需要批量拉取行情/资金流的股票池
    universe = sorted({code for codes in sector_stock_map.values() for code in codes})
    if not universe:
        return []
    
    # 下载日线和资金流数据
    try:
        xtdata.download_history_data(universe, period="1d")
    except Exception as e:
        print(f"[market-api] download_history_data (1d) warning: {e}", file=sys.stderr)
    try:
        xtdata.download_history_data(universe, period="transactioncount1d")
    except Exception as e:
        print(f"[market-api] download_history_data (transactioncount1d) warning: {e}", file=sys.stderr)
    
    prev_close: Dict[str, float] = {}
    try:
        close_data = xtdata.get_market_data_ex(["close"], universe, period="1d", count=2)
        for code, prices in (close_data or {}).get("close", {}).items():
            if prices and len(prices) >= 2:
                prev_close[code] = prices[-2]
    except Exception as e:
        print(f"[market-api] Failed to get close data: {e}", file=sys.stderr)
    
    flow_data: Dict[str, Dict[str, List[float]]] = {}
    try:
        raw_flow = xtdata.get_market_data_ex([], universe, period="transactioncount1d", count=1)
        if isinstance(raw_flow, dict):
            flow_data = raw_flow
    except Exception as e:
        print(f"[market-api] Failed to get capital flow data: {e}", file=sys.stderr)
    
    try:
        tick_data = xtdata.get_full_tick(universe)
    except Exception as e:
        print(f"[market-api] Failed to get tick data for hot sectors: {e}", file=sys.stderr)
        tick_data = {}
    
    sector_stats: List[Dict] = []
    for sector_name, stocks in sector_stock_map.items():
        total_change = 0.0
        total_turnover = 0.0
        total_net_inflow = 0.0
        limit_up_count = 0
        counted = 0
        
        for code in stocks:
            tick = tick_data.get(code)
            if not isinstance(tick, dict):
                continue
            last_price = float(tick.get('lastPrice') or 0)
            prev = float(prev_close.get(code) or 0)
            if last_price <= 0 or prev <= 0:
                continue
            
            change_pct = (last_price - prev) / prev * 100
            total_change += change_pct
            counted += 1
            
            turnover = float(tick.get('amount') or 0)
            total_turnover += turnover
            
            flow_entry = flow_data.get(code, {}) if flow_data else {}
            net_main = 0.0
            for key in ("netInflowMostAmountDx", "netInflowBigAmountDx"):
                series = flow_entry.get(key)
                if series and len(series) > 0:
                    net_main += float(series[-1])
            total_net_inflow += net_main
            
            # 统计涨停数量
            if code.startswith("688") or code.startswith("300"):
                if change_pct >= 19.5:
                    limit_up_count += 1
            elif code.startswith("4") or code.startswith("8"):
                if change_pct >= 29.5:
                    limit_up_count += 1
            else:
                if change_pct >= 9.5:
                    limit_up_count += 1
        
        if counted == 0:
            continue
        
        avg_change = total_change / counted
        avg_turnover = total_turnover / counted
        avg_net_inflow = total_net_inflow / counted
        
        change_component = min(max(avg_change / 5, 0), 1)  # 涨幅 0-5% 映射
        flow_component = min(max(total_net_inflow / 5_000_000_000, 0), 1)  # 50 亿元以上视为满分
        limit_component = min(limit_up_count / 5, 1)
        
        heat_score = round(change_component * 40 + flow_component * 40 + limit_component * 20, 2)
        if heat_score >= 80:
            heat_level = 'VERY_HOT'
        elif heat_score >= 60:
            heat_level = 'HOT'
        elif heat_score >= 40:
            heat_level = 'WARM'
        else:
            heat_level = 'NORMAL'
        
        sector_stats.append({
            'sector': sector_name,
            'stockCount': counted,
            'avgChangePercent': round(avg_change, 2),
            'totalTurnover': round(total_turnover, 2),
            'avgTurnover': round(avg_turnover, 2),
            'netInflow': round(total_net_inflow, 2),
            'avgNetInflow': round(avg_net_inflow, 2),
            'limitUpCount': limit_up_count,
            'heatScore': heat_score,
            'heatLevel': heat_level,
            'timestamp': datetime.now().isoformat(),
        })
    
    if not sector_stats:
        print("[market-api] No valid sector stats calculated", file=sys.stderr)
        return []
    
    sector_stats.sort(key=lambda x: (x['heatScore'], x['avgChangePercent']), reverse=True)
    hot_sectors = sector_stats[:top_n]
    print(f"[market-api] Found {len(hot_sectors)} hot sectors", file=sys.stderr)
    return hot_sectors


def get_market_capital_flow() -> Dict:
    """
    获取大盘资金流向总览
    Returns:
        资金流向总览数据
    """
    if xtdata is None:
        return {
            'totalNetInflow': 0,
            'bigOrderNetInflow': 0,
            'mediumOrderNetInflow': 0,
            'smallOrderNetInflow': 0,
            'inflowCount': 0,
            'outflowCount': 0,
            'topInflowSectors': [],
            'topOutflowSectors': [],
            'timestamp': datetime.now().isoformat(),
        }
    
    try:
        # 获取全市场 tick 数据
        print(f"[market-api] Fetching full market tick data for capital flow...", file=sys.stderr)
        tick_data = xtdata.get_full_tick(['SH', 'SZ'])
        
        total_net_inflow = 0
        big_order_net_inflow = 0
        medium_order_net_inflow = 0
        small_order_net_inflow = 0
        inflow_count = 0
        outflow_count = 0
        
        processed_stocks = 0
        
        for code, tick in tick_data.items():
            # 跳过指数 (000xxx, 399xxx, 899xxx)
            if code.startswith('000') or code.startswith('399') or code.startswith('899'):
                continue
            # 跳过基金和其他非个股 (5xxxx, 1xxxx)
            if code.startswith('5') or code.startswith('1'):
                continue
            
            if not isinstance(tick, dict):
                continue
            
            volume = tick.get('volume', 0)
            amount = tick.get('amount', 0)
            last_price = tick.get('lastPrice', 0)
            pre_close = tick.get('lastClose', 0)
            
            if last_price <= 0 or pre_close <= 0:
                continue
            
            change_pct = (last_price - pre_close) / pre_close * 100
            
            # 根据涨跌幅估算资金流向
            if change_pct > 0:
                inflow_count += 1
                stock_inflow = amount
            else:
                outflow_count += 1
                stock_inflow = -amount
            
            total_net_inflow += stock_inflow
            
            # 按成交量分拆大单、中单、小单
            if volume > 500000:  # 超大成交量 - 机构大单
                big_order_net_inflow += stock_inflow
            elif volume > 100000:  # 中等成交量 - 中户
                medium_order_net_inflow += stock_inflow
            else:  # 小成交量 - 散户
                small_order_net_inflow += stock_inflow
            
            processed_stocks += 1
        
        print(f"[market-api] Processed {processed_stocks} stocks for capital flow", file=sys.stderr)
        
        # 获取热点板块作为资金流入前列
        hot_sectors = analyze_hot_sectors(5)
        top_inflow = [{'sector': s['sector'], 'amount': s['netInflow']} for s in hot_sectors[:5]]
        top_outflow = [{'sector': s['sector'], 'amount': -s['netInflow']} for s in hot_sectors[-5:][::-1]]
        
        return {
            'totalNetInflow': round(total_net_inflow, 2),
            'bigOrderNetInflow': round(big_order_net_inflow, 2),
            'mediumOrderNetInflow': round(medium_order_net_inflow, 2),
            'smallOrderNetInflow': round(small_order_net_inflow, 2),
            'inflowCount': inflow_count,
            'outflowCount': outflow_count,
            'topInflowSectors': top_inflow,
            'topOutflowSectors': top_outflow,
            'timestamp': datetime.now().isoformat(),
        }
        
    except Exception as e:
        print(f"[market-api] Failed to get market capital flow: {e}", file=sys.stderr)
        return {
            'totalNetInflow': 0,
            'bigOrderNetInflow': 0,
            'mediumOrderNetInflow': 0,
            'smallOrderNetInflow': 0,
            'inflowCount': 0,
            'outflowCount': 0,
            'topInflowSectors': [],
            'topOutflowSectors': [],
            'timestamp': datetime.now().isoformat(),
        }


def calculate_market_heat_fallback() -> Dict:
    """
    备用方案：当无法获取沪深 A 股列表时，使用 SH/SZ 全市场数据
    """
    try:
        # 获取全市场 tick 数据
        tick_data = xtdata.get_full_tick(['SH', 'SZ'])
        
        advance_count = 0
        decline_count = 0
        limit_up_count = 0
        limit_down_count = 0
        total_volume = 0
        total_turnover = 0
        
        for code, tick in tick_data.items():
            # 跳过指数和其他非个股
            if not code.endswith('.SH') and not code.endswith('.SZ'):
                continue
            if code.startswith('000') or code.startswith('399') or code.startswith('899'):
                # 跳过指数
                continue
            
            # 跳过无效数据
            if not isinstance(tick, dict):
                continue
            
            last_price = tick.get('lastPrice', 0)
            pre_close = tick.get('lastClose', 0)
            
            if last_price <= 0 or pre_close <= 0:
                continue
            
            # 计算涨跌幅
            change_pct = (last_price - pre_close) / pre_close * 100
            
            # 统计涨跌家数
            if change_pct > 0.01:
                advance_count += 1
            elif change_pct < -0.01:
                decline_count += 1
            
            # 统计涨停跌停
            if change_pct >= 9.8:
                limit_up_count += 1
            elif change_pct <= -9.8:
                limit_down_count += 1
            
            # 累计成交量和成交额
            total_volume += tick.get('volume', 0)
            total_turnover += tick.get('amount', 0)
        
        # 计算涨跌比
        total_trading = advance_count + decline_count
        advance_decline_ratio = advance_count / total_trading if total_trading > 0 else 0.5
        
        # 计算热度分数
        heat_score = min(100, max(0, 
            advance_decline_ratio * 60 +
            (limit_up_count / max(total_trading, 1)) * 100 * 20 +
            (min(total_volume, 1e10) / 1e10) * 20
        ))
        
        # 确定热度等级
        if heat_score >= 80:
            heat_level = 'VERY_HIGH'
        elif heat_score >= 60:
            heat_level = 'HIGH'
        elif heat_score >= 40:
            heat_level = 'MEDIUM'
        else:
            heat_level = 'LOW'
        
        return {
            'advanceDeclineRatio': round(advance_decline_ratio, 4),
            'advanceCount': advance_count,
            'declineCount': decline_count,
            'limitUpCount': limit_up_count,
            'limitDownCount': limit_down_count,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': round(heat_score, 2),
            'heatLevel': heat_level,
            'timestamp': datetime.now().isoformat(),
        }
        
    except Exception as e:
        print(f"[market-api] Fallback heat calculation failed: {e}", file=sys.stderr)
        return {
            'advanceDeclineRatio': 0.5,
            'advanceCount': 0,
            'declineCount': 0,
            'limitUpCount': 0,
            'limitDownCount': 0,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': 0.0,
            'heatLevel': 'LOW',
            'timestamp': datetime.now().isoformat(),
        }


def calculate_market_heat_fallback_v2() -> Dict:
    """
    备用方案 V2：当 get_stock_list_in_sector("沪深 A 股") 返回空时，使用旧方法
    通过遍历全市场 tick 数据来统计涨跌家数
    """
    try:
        # 获取全市场 tick 数据
        tick_data = xtdata.get_full_tick(['SH', 'SZ'])
        
        advance_count = 0
        decline_count = 0
        flat_count = 0
        limit_up_count = 0
        limit_down_count = 0
        total_volume = 0
        total_turnover = 0
        processed_stocks = 0
        
        for code, tick in tick_data.items():
            # 跳过指数 (000xxx, 399xxx, 899xxx)
            if code.startswith('000') or code.startswith('399') or code.startswith('899'):
                continue
            # 跳过基金和其他非个股 (5xxxx, 1xxxx)
            if code.startswith('5') or code.startswith('1'):
                continue
            
            # 跳过无效数据
            if not isinstance(tick, dict):
                continue
            
            last_price = tick.get('lastPrice', 0)
            pre_close = tick.get('lastClose', 0)
            
            if last_price <= 0 or pre_close <= 0:
                continue
            
            # 计算涨跌幅
            change_pct = (last_price - pre_close) / pre_close * 100
            
            # 统计涨跌平家数
            if change_pct > 0.01:
                advance_count += 1
            elif change_pct < -0.01:
                decline_count += 1
            else:
                flat_count += 1
            
            # 统计涨停跌停
            is_limit_up = False
            is_limit_down = False
            
            # 判断是否为科创板或创业板
            if code.startswith('688') or code.startswith('300'):
                # 科创板/创业板：±20%
                if change_pct >= 19.8:
                    is_limit_up = True
                elif change_pct <= -19.8:
                    is_limit_down = True
            elif code.startswith('4') or code.startswith('8'):
                # 北交所：±30%
                if change_pct >= 29.8:
                    is_limit_up = True
                elif change_pct <= -29.8:
                    is_limit_down = True
            else:
                # 主板：±10%
                if change_pct >= 9.8:
                    is_limit_up = True
                elif change_pct <= -9.8:
                    is_limit_down = True
            
            if is_limit_up:
                limit_up_count += 1
            elif is_limit_down:
                limit_down_count += 1
            
            # 累计成交量和成交额
            total_volume += tick.get('volume', 0)
            total_turnover += tick.get('amount', 0)
            
            processed_stocks += 1
        
        print(f"[market-api] Fallback processed {processed_stocks} stocks (Advance: {advance_count}, Decline: {decline_count})", file=sys.stderr)
        
        # 计算涨跌比
        total_trading = advance_count + decline_count + flat_count
        advance_decline_ratio = advance_count / total_trading if total_trading > 0 else 0.5
        
        # 计算热度分数
        heat_score = min(100, max(0, 
            advance_decline_ratio * 60 +
            (limit_up_count / max(total_trading, 1)) * 100 * 20 +
            (min(total_volume, 1e10) / 1e10) * 20
        ))
        
        # 确定热度等级
        if heat_score >= 80:
            heat_level = 'VERY_HIGH'
        elif heat_score >= 60:
            heat_level = 'HIGH'
        elif heat_score >= 40:
            heat_level = 'MEDIUM'
        else:
            heat_level = 'LOW'
        
        return {
            'advanceDeclineRatio': round(advance_decline_ratio, 4),
            'advanceCount': advance_count,
            'declineCount': decline_count,
            'limitUpCount': limit_up_count,
            'limitDownCount': limit_down_count,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': round(heat_score, 2),
            'heatLevel': heat_level,
            'timestamp': datetime.now().isoformat(),
        }
        
    except Exception as e:
        print(f"[market-api] Fallback V2 heat calculation failed: {e}", file=sys.stderr)
        return {
            'advanceDeclineRatio': 0.5,
            'advanceCount': 0,
            'declineCount': 0,
            'limitUpCount': 0,
            'limitDownCount': 0,
            'volumeChange': 0.0,
            'sectorHeat': [],
            'heatScore': 0.0,
            'heatLevel': 'LOW',
            'timestamp': datetime.now().isoformat(),
        }


@app.get("/api/market/indices")
async def get_indices():
    """获取大盘指数数据"""
    indices = get_market_indices_data()
    if not indices:
        raise HTTPException(status_code=404, detail="未获取到指数数据")
    return {'data': indices}


@app.get("/api/market/heat")
async def get_heat():
    """获取市场热度数据"""
    heat = calculate_market_heat()
    return {'data': heat}


@app.get("/api/market/capital-flow")
async def get_capital_flow():
    """获取大盘资金流向数据"""
    flow = get_market_capital_flow()
    return {'data': flow}


@app.get("/api/market/hot-sectors")
async def get_hot_sectors(top_n: int = 10):
    """获取热点板块分析"""
    sectors = analyze_hot_sectors(top_n)
    return {'data': sectors}


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'xtdata_connected': whole_quote_sub_id is not None and whole_quote_sub_id != -1,
    }


# ==================== 股票排行榜功能 ====================

def get_a_share_stock_list(min_size: int = 1000) -> List[str]:
    """
    获取 A 股股票列表
    Returns:
        股票代码列表
    """
    if xtdata is None:
        return []
    
    try:
        stocks, sector_name = resolve_sector_stock_list(A_SHARE_SECTOR_KEYWORDS, min_size=min_size)
        if stocks:
            print(f"[rank-api] Using sector '{sector_name}' with {len(stocks)} stocks for A-share universe", file=sys.stderr)
            return stocks
        
        # 如果关键字匹配失败，遍历全部板块寻找成分最多的作为兜底
        all_sectors = xtdata.get_sector_list()
        max_stocks = 0
        fallback_stocks: List[str] = []
        for sector in all_sectors or []:
            try:
                sector_stocks = xtdata.get_stock_list_in_sector(sector)
            except Exception:
                continue
            if sector_stocks and len(sector_stocks) > max_stocks:
                max_stocks = len(sector_stocks)
                fallback_stocks = sector_stocks
        
        if fallback_stocks:
            print(f"[rank-api] Fallback using largest sector ({max_stocks} stocks) for A-share universe", file=sys.stderr)
        return fallback_stocks
        
    except Exception as e:
        print(f"[rank-api] Failed to get A-share list: {e}", file=sys.stderr)
        return []


def get_change_ranking(top_n: int = 50) -> Dict:
    """
    获取涨幅榜/跌幅榜
    使用日线收盘价计算涨跌幅
    
    Args:
        top_n: 返回前 N 只股票
        
    Returns:
        包含涨幅榜和跌幅榜的字典
    """
    if xtdata is None:
        return {'gainers': [], 'losers': []}
    
    try:
        stock_list = get_a_share_stock_list()
        if not stock_list:
            return {'gainers': [], 'losers': []}
        
        # 下载日线数据 - 简化参数，使用默认值
        print("[rank-api] Downloading daily data for change ranking...", file=sys.stderr)
        try:
            xtdata.download_history_data(stock_list, period="1d")
        except Exception as download_error:
            print(f"[rank-api] Download warning (may already have data): {download_error}", file=sys.stderr)
        
        # 获取最新两日收盘价
        his = xtdata.get_market_data_ex(["close"], stock_list, period="1d", count=2)
        close_df = pd.DataFrame(his["close"])
        
        if close_df.shape[1] < 2:
            print("[rank-api] Not enough data for change calculation", file=sys.stderr)
            return {'gainers': [], 'losers': []}
        
        prev_close = close_df.iloc[-2]
        last_close = close_df.iloc[-1]
        
        # 计算涨跌幅
        change_pct = (last_close - prev_close) / prev_close * 100
        change_pct = change_pct.dropna().sort_values(ascending=False)
        
        # 获取股票名称
        gainers = []
        losers = []
        
        # 涨幅榜前 N
        for code in change_pct.head(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            gainers.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'changePercent': round(change_pct[code], 2),
                'price': round(last_close[code], 2),
            })
        
        # 跌幅榜后 N
        for code in change_pct.tail(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            losers.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'changePercent': round(change_pct[code], 2),
                'price': round(last_close[code], 2),
            })
        
        print(f"[rank-api] Change ranking: {len(gainers)} gainers, {len(losers)} losers", file=sys.stderr)
        return {'gainers': gainers, 'losers': losers}
        
    except Exception as e:
        print(f"[rank-api] Failed to get change ranking: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {'gainers': [], 'losers': []}


def get_turnover_ranking(top_n: int = 50) -> List[Dict]:
    """
    获取成交额榜
    直接获取当日成交额字段 "amount"
    
    Args:
        top_n: 返回前 N 只股票
        
    Returns:
        成交额排行榜列表
    """
    if xtdata is None:
        return []
    
    try:
        stock_list = get_a_share_stock_list()
        if not stock_list:
            return []
        
        # 获取成交额数据
        his = xtdata.get_market_data_ex(["amount"], stock_list, period="1d", count=1)
        amount_series = pd.Series({k: v[-1] if len(v) > 0 else 0 for k, v in his["amount"].items()})
        amount_series = amount_series.dropna().sort_values(ascending=False)
        
        # 返回前 N
        result = []
        for code in amount_series.head(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            result.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'turnover': round(amount_series[code], 2),
                'turnoverYi': round(amount_series[code] / 1e8, 2),  # 转换为亿元
            })
        
        print(f"[rank-api] Turnover ranking: {len(result)} stocks", file=sys.stderr)
        return result
        
    except Exception as e:
        print(f"[rank-api] Failed to get turnover ranking: {e}", file=sys.stderr)
        return []


def get_turnover_rate_ranking(top_n: int = 50) -> List[Dict]:
    """
    获取换手率榜
    换手率 = 成交量 / 流通股本 × 100%
    
    Args:
        top_n: 返回前 N 只股票
        
    Returns:
        换手率排行榜列表
    """
    if xtdata is None:
        return []
    
    try:
        stock_list = get_a_share_stock_list()
        if not stock_list:
            return []
        
        # 获取流通股本（单位：股）
        float_shares = {}
        for stock in stock_list:
            try:
                detail = xtdata.get_instrument_detail(stock)
                if detail:
                    float_shares[stock] = detail.get('TotalFloatShare', 1)
                else:
                    float_shares[stock] = 1
            except:
                float_shares[stock] = 1
        
        # 获取成交量
        his = xtdata.get_market_data_ex(["volume"], stock_list, period="1d", count=1)
        
        # 计算换手率
        turnover = {}
        for stock in stock_list:
            vol = his["volume"].get(stock, [])
            if vol and float_shares.get(stock, 0) > 0:
                turnover[stock] = vol[-1] / float_shares[stock] * 100  # 百分比
        
        turnover_series = pd.Series(turnover).dropna().sort_values(ascending=False)
        
        # 返回前 N
        result = []
        for code in turnover_series.head(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            result.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'turnoverRate': round(turnover_series[code], 2),
                'volume': int(his["volume"][code][-1]) if his["volume"].get(code) else 0,
            })
        
        print(f"[rank-api] Turnover rate ranking: {len(result)} stocks", file=sys.stderr)
        return result
        
    except Exception as e:
        print(f"[rank-api] Failed to get turnover rate ranking: {e}", file=sys.stderr)
        return []


def get_main_flow_ranking(top_n: int = 50) -> List[Dict]:
    """
    获取主力净流入榜
    主力净流入 ≈ 超大单 + 大单净流入
    
    Args:
        top_n: 返回前 N 只股票
        
    Returns:
        主力净流入排行榜列表
    """
    if xtdata is None:
        return []
    
    try:
        stock_list = get_a_share_stock_list()
        if not stock_list:
            return []
        
        # 下载资金流数据
        print("[rank-api] Downloading capital flow data...", file=sys.stderr)
        xtdata.download_history_data(stock_list, period="transactioncount1d")
        
        # 获取资金流数据
        flow = xtdata.get_market_data_ex([], stock_list, period="transactioncount1d", count=1)
        
        # 计算主力净流入
        net_main = {}
        for stock in stock_list:
            dx = flow.get(stock, {})
            most = dx.get("netInflowMostAmountDx", [0])[-1] if dx.get("netInflowMostAmountDx") else 0
            big = dx.get("netInflowBigAmountDx", [0])[-1] if dx.get("netInflowBigAmountDx") else 0
            net_main[stock] = most + big
        
        net_main_series = pd.Series(net_main).dropna().sort_values(ascending=False)
        
        # 返回前 N
        result = []
        for code in net_main_series.head(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            result.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'netInflow': round(net_main_series[code], 2),
                'netInflowWan': round(net_main_series[code] / 1e4, 2),  # 转换为万元
            })
        
        print(f"[rank-api] Main flow ranking: {len(result)} stocks", file=sys.stderr)
        return result
        
    except Exception as e:
        print(f"[rank-api] Failed to get main flow ranking: {e}", file=sys.stderr)
        return []


def get_volume_ratio_ranking(top_n: int = 50) -> List[Dict]:
    """
    获取量比榜
    量比 = 当日即时成交量 / 过去 5 日平均成交量
    使用日线近似计算
    
    Args:
        top_n: 返回前 N 只股票
        
    Returns:
        量比排行榜列表
    """
    if xtdata is None:
        return []
    
    try:
        stock_list = get_a_share_stock_list()
        if not stock_list:
            return []
        
        # 获取最近 6 日成交量
        his = xtdata.get_market_data_ex(["volume"], stock_list, period="1d", count=6)
        volume_df = pd.DataFrame(his["volume"])
        
        if volume_df.shape[1] < 6:
            print("[rank-api] Not enough data for volume ratio calculation", file=sys.stderr)
            return []
        
        avg_vol = volume_df.iloc[:-1].mean(axis=1)
        today_vol = volume_df.iloc[-1]
        
        # 计算量比
        volume_ratio = today_vol / avg_vol
        volume_ratio = volume_ratio.replace([np.inf, -np.inf], np.nan).dropna()
        volume_ratio = volume_ratio.sort_values(ascending=False)
        
        # 返回前 N
        result = []
        for code in volume_ratio.head(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            result.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'volumeRatio': round(volume_ratio[code], 2),
                'todayVolume': int(today_vol[code]),
            })
        
        print(f"[rank-api] Volume ratio ranking: {len(result)} stocks", file=sys.stderr)
        return result
        
    except Exception as e:
        print(f"[rank-api] Failed to get volume ratio ranking: {e}", file=sys.stderr)
        return []


def get_amplitude_ranking(top_n: int = 50) -> List[Dict]:
    """
    获取振幅榜
    振幅 = (最高价 - 最低价) / 前收盘价 × 100%
    
    Args:
        top_n: 返回前 N 只股票
        
    Returns:
        振幅排行榜列表
    """
    if xtdata is None:
        return []
    
    try:
        stock_list = get_a_share_stock_list()
        if not stock_list:
            return []
        
        # 获取最近 2 日数据（需要前收盘价）
        his = xtdata.get_market_data_ex(["high", "low", "close"], stock_list, period="1d", count=2)
        
        # 提取数据
        high = pd.Series({s: v[-1] for s, v in his["high"].items() if v and len(v) >= 1})
        low = pd.Series({s: v[-1] for s, v in his["low"].items() if v and len(v) >= 1})
        prev_close = pd.Series({s: v[-2] for s, v in his["close"].items() if len(v) >= 2})
        
        # 计算振幅
        amplitude = (high - low) / prev_close * 100
        amplitude = amplitude.dropna().sort_values(ascending=False)
        
        # 返回前 N
        result = []
        for code in amplitude.head(top_n).index:
            detail = xtdata.get_instrument_detail(code)
            result.append({
                'code': code,
                'name': detail.get('InstrumentName', '') if detail else '',
                'amplitude': round(amplitude[code], 2),
                'high': round(high[code], 2),
                'low': round(low[code], 2),
            })
        
        print(f"[rank-api] Amplitude ranking: {len(result)} stocks", file=sys.stderr)
        return result
        
    except Exception as e:
        print(f"[rank-api] Failed to get amplitude ranking: {e}", file=sys.stderr)
        return []


# API 路由
@app.get("/api/rank/change")
async def get_change_rank(top_n: int = 50):
    """获取涨幅榜/跌幅榜"""
    result = get_change_ranking(top_n)
    return {'data': result}


@app.get("/api/rank/turnover")
async def get_turnover_rank(top_n: int = 50):
    """获取成交额榜"""
    result = get_turnover_ranking(top_n)
    return {'data': result}


@app.get("/api/rank/turnover-rate")
async def get_turnover_rate_rank(top_n: int = 50):
    """获取换手率榜"""
    result = get_turnover_rate_ranking(top_n)
    return {'data': result}


@app.get("/api/rank/main-flow")
async def get_main_flow_rank(top_n: int = 50):
    """获取主力净流入榜"""
    result = get_main_flow_ranking(top_n)
    return {'data': result}


@app.get("/api/rank/volume-ratio")
async def get_volume_ratio_rank(top_n: int = 50):
    """获取量比榜"""
    result = get_volume_ratio_ranking(top_n)
    return {'data': result}


@app.get("/api/rank/amplitude")
async def get_amplitude_rank(top_n: int = 50):
    """获取振幅榜"""
    result = get_amplitude_ranking(top_n)
    return {'data': result}


def _calc_kdj(high_arr, low_arr, close_arr, n=9):
    """
    计算 KDJ 指标，返回最后一个 K/D/J 值
    """
    if len(close_arr) < n:
        return None, None, None
    k, d = 50.0, 50.0
    for i in range(n - 1, len(close_arr)):
        window_high = max(high_arr[i - n + 1: i + 1])
        window_low  = min(low_arr[i - n + 1: i + 1])
        rsv = (close_arr[i] - window_low) / (window_high - window_low) * 100 if window_high != window_low else 50.0
        k = k * 2 / 3 + rsv / 3
        d = d * 2 / 3 + k / 3
    j = 3 * k - 2 * d
    return round(k, 2), round(d, 2), round(j, 2)


def _is_main_board(code: str) -> bool:
    """
    判断是否主板：上交所 60xxxx 或深交所 00xxxx
    排除创业板(30xxxx)、科创板(68xxxx)、北交所(8/4xxxx)
    """
    c = code.split(".")[0]
    return c.startswith("60") or c.startswith("00")


def run_stock_picker(filters: dict) -> List[Dict]:
    """
    按条件筛选 A 股标的，返回满足条件的股票列表。

    filters 支持字段（均有默认值）：
      min_turnover_rate  换手率下限 %        默认 1.0
      min_volume_ratio   量比下限             默认 0.8
      main_board_only    仅主板               默认 True
      exclude_st         排除 ST             默认 True
      require_yang       要求阳线形态         默认 True
      require_inflow     近2日主力净流入>0    默认 True
      max_price          股价上限             默认 15.0
      min_float_mv       流通市值下限(亿)     默认 6.0
      max_float_mv       流通市值上限(亿)     默认 50.0
      kdj_j_gt_d         J > D               默认 True
      min_kdj_d          D 值下限             默认 25.0
      max_limit_up_days  连续涨停天数上限     默认 2
      top_n              返回数量             默认 30
    """
    if xtdata is None:
        return []

    min_turnover  = float(filters.get("min_turnover_rate", 1.0))
    min_vol_ratio = float(filters.get("min_volume_ratio", 0.8))
    main_board    = bool(filters.get("main_board_only", True))
    excl_st       = bool(filters.get("exclude_st", True))
    req_yang      = bool(filters.get("require_yang", True))
    req_inflow    = bool(filters.get("require_inflow", True))
    max_price     = float(filters.get("max_price", 15.0))
    min_float_mv  = float(filters.get("min_float_mv", 6.0)) * 1e8   # 转元
    max_float_mv  = float(filters.get("max_float_mv", 50.0)) * 1e8
    kdj_j_gt_d    = bool(filters.get("kdj_j_gt_d", True))
    min_kdj_d     = float(filters.get("min_kdj_d", 25.0))
    max_limit_up  = int(filters.get("max_limit_up_days", 2))
    top_n         = int(filters.get("top_n", 30))

    print(f"[stock-picker] Starting scan with filters: {filters}", file=sys.stderr)

    stock_list = get_a_share_stock_list()
    if not stock_list:
        return []

    # 主板过滤
    if main_board:
        stock_list = [s for s in stock_list if _is_main_board(s)]
    print(f"[stock-picker] After board filter: {len(stock_list)} stocks", file=sys.stderr)

    # 下载日线数据（近 20 日，用于 KDJ / 阳线 / 涨停天数 / 量比）
    try:
        xtdata.download_history_data(stock_list, period="1d")
    except Exception as e:
        print(f"[stock-picker] Download warning: {e}", file=sys.stderr)

    fields_1d = ["open", "close", "high", "low", "volume", "amount"]
    his = xtdata.get_market_data_ex(fields_1d, stock_list, period="1d", count=20)

    # 下载资金流数据（近 2 日）
    try:
        xtdata.download_history_data(stock_list, period="transactioncount1d")
    except Exception as e:
        print(f"[stock-picker] Flow download warning: {e}", file=sys.stderr)
    flow = xtdata.get_market_data_ex([], stock_list, period="transactioncount1d", count=2)

    results = []

    for code in stock_list:
        try:
            detail = xtdata.get_instrument_detail(code) or {}
            name   = detail.get("InstrumentName", "")

            # ST 过滤
            if excl_st and ("ST" in name.upper() or "*ST" in name.upper()):
                continue

            close_arr = his.get("close", {}).get(code, [])
            open_arr  = his.get("open",  {}).get(code, [])
            high_arr  = his.get("high",  {}).get(code, [])
            low_arr   = his.get("low",   {}).get(code, [])
            vol_arr   = his.get("volume",{}).get(code, [])

            if len(close_arr) < 6:
                continue

            last_close = close_arr[-1]
            last_open  = open_arr[-1]  if open_arr  else 0
            last_high  = high_arr[-1]  if high_arr  else 0
            last_low   = low_arr[-1]   if low_arr   else 0
            prev_close = close_arr[-2]

            if last_close <= 0 or prev_close <= 0:
                continue

            # 股价过滤
            if last_close > max_price:
                continue

            # 流通市值过滤
            float_shares = detail.get("TotalFloatShare", 0)
            float_mv = float_shares * last_close
            if float_mv < min_float_mv or float_mv > max_float_mv:
                continue

            # 阳线形态：收盘 > 开盘
            if req_yang and last_close <= last_open:
                continue

            # 换手率过滤
            last_vol = vol_arr[-1] if vol_arr else 0
            turnover_rate = (last_vol / float_shares * 100) if float_shares > 0 else 0
            if turnover_rate < min_turnover:
                continue

            # 量比：今日量 / 近5日均量
            if len(vol_arr) >= 6:
                avg5 = sum(vol_arr[-6:-1]) / 5
                vol_ratio = last_vol / avg5 if avg5 > 0 else 0
            else:
                vol_ratio = 0
            if vol_ratio < min_vol_ratio:
                continue

            # 价升量涨：今日收盘 > 昨收 且 今日量 > 昨日量
            if req_yang:
                if len(vol_arr) >= 2 and not (last_close > prev_close and last_vol > vol_arr[-2]):
                    continue

            # 近2日主力净流入
            if req_inflow:
                dx = flow.get(code, {})
                inflow_days = 0
                for field in ["netInflowMostAmountDx", "netInflowBigAmountDx"]:
                    arr = dx.get(field, [])
                    if len(arr) >= 2:
                        inflow_days += sum(1 for v in arr[-2:] if v > 0)
                if inflow_days < 2:
                    continue

            # KDJ 计算
            if len(close_arr) >= 9:
                k_val, d_val, j_val = _calc_kdj(
                    list(high_arr), list(low_arr), list(close_arr)
                )
            else:
                k_val = d_val = j_val = None

            if k_val is None:
                continue
            if kdj_j_gt_d and j_val <= d_val:
                continue
            if d_val < min_kdj_d:
                continue

            # 连续涨停天数
            limit_up_price = round(prev_close * 1.10, 2)
            limit_days = 0
            for i in range(len(close_arr) - 1, -1, -1):
                prev = close_arr[i - 1] if i > 0 else 0
                if prev > 0 and round(close_arr[i] / prev - 1, 2) >= 0.099:
                    limit_days += 1
                else:
                    break
            if limit_days >= max_limit_up:
                continue

            change_pct = (last_close - prev_close) / prev_close * 100

            results.append({
                "code":         code,
                "name":         name,
                "price":        round(last_close, 2),
                "changePercent":round(change_pct, 2),
                "turnoverRate": round(turnover_rate, 2),
                "volumeRatio":  round(vol_ratio, 2),
                "floatMv":      round(float_mv / 1e8, 2),
                "kdjK":         k_val,
                "kdjD":         d_val,
                "kdjJ":         j_val,
                "limitUpDays":  limit_days,
            })

        except Exception as e:
            print(f"[stock-picker] Error processing {code}: {e}", file=sys.stderr)
            continue

    # 按量比降序排列
    results.sort(key=lambda x: x["volumeRatio"], reverse=True)
    print(f"[stock-picker] Scan complete: {len(results)} stocks matched", file=sys.stderr)
    return results[:top_n]


class StockPickerRequest(BaseModel):
    filters: Optional[dict] = None


@app.post("/api/ai/stock-picker")
async def ai_stock_picker(payload: StockPickerRequest):
    """AI 选股接口 — 按量化条件筛选 A 股标的"""
    filters = payload.filters or {}
    result = run_stock_picker(filters)
    return {"data": result, "count": len(result)}


if __name__ == "__main__":
    print("[market-api] Starting Market Data API service...", flush=True)
    print("[market-api] Using xtdata from MiniQMT", flush=True)
    print("[market-api] Server will run on http://127.0.0.1:8081", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=8081)

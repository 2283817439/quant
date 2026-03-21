"""
行情数据管理器：处理实时行情订阅和历史数据获取
"""
import time
import pandas as pd
from typing import Dict, List
from datetime import date
import xtquant  # noqa: F401  # Ensure interpreter-provided xtquant is available
from xtquant import xtdata
from config.config import ConfigManager
from core.exceptions import MarketDataError
from utils.logger import sys_logger

xtdata.enable_hello = False

logger = sys_logger.getChild('Market')

# 常用指数的成分股缓存 (用于fallback或离线回测)
INDEX_SYMBOLS_CACHE = {
    '000300.SH': [  # 沪深300 - 权重最大的成分股
        '600016.SH', '600000.SH', '601988.SH', '601398.SH', '601328.SH', 
        '601166.SH', '601939.SH', '601288.SH', '002142.SZ', '600015.SH',
        '600036.SH', '601169.SH', '601601.SH', '601628.SH', '601319.SH',
        '601336.SH', '600905.SH', '600909.SH', '601211.SH', '601901.SH',
        '600048.SH', '601588.SH', '000002.SZ', '000651.SZ', '601678.SH',
        '601669.SH', '600383.SH', '600011.SH', '600025.SH', '601088.SH',
        '601188.SH', '601898.SH', '600028.SH', '601857.SH', '600519.SH',
        '000858.SZ', '000568.SZ', '600887.SH', '000333.SZ', '000001.SZ',
        '601666.SH', '601933.SH', '601965.SH', '600309.SH', '600837.SH',
        '600276.SH', '002230.SZ', '300347.SZ', '300498.SZ', '300593.SZ',
        '600446.SH', '600655.SH', '601099.SH', '600689.SH', '600754.SH',
        '600584.SH', '002415.SZ', '002008.SZ', '600745.SH', '600031.SH',
        '601012.SH', '601633.SH', '601766.SH', '601388.SH', '000333.SZ',
        '000895.SZ', '000926.SZ', '000989.SZ', '001696.SZ', '002003.SZ',
        '600519.SH', '600050.SH', '601728.SH', '600030.SH', '000002.SZ',
    ],
    
    '000905.SH': [  # 中证500
        '000421.SZ', '000858.SZ', '000895.SZ', '000926.SZ',
        '000989.SZ', '001696.SZ', '001872.SZ', '002003.SZ',
    ],
    
    '399006.SZ': [  # 创业板指数
        '300001.SZ', '300002.SZ', '300015.SZ', '300017.SZ',
        '300033.SZ', '300070.SZ', '300072.SZ', '300144.SZ',
    ]
}

class MarketDataManager:
    def __init__(self, config: ConfigManager):
        """
        初始化行情管理器
        :param config: 配置管理器实例
        """
        self._config = config

        self._history_data: Dict[str, pd.DataFrame] = {}   # 各标的的历史股价数据
        self._financial_data: Dict[str, pd.DataFrame] = {} # 各标的的历史财务数据
        self._symbol_cache: Dict[str, List[str]] = {}      # 成分股缓存

        self.done = False

    def bind(self, engine):
        self._engine = engine
        self._symbol_cache = {}  # 成分股缓存

    def get_index_symbols(self, index: str) -> List[str]:
        """
        获取指数的成分股列表
        根据迅投API文档的get_stock_list_in_sector方法：
        获取指定板块的所有股票列表
        
        优先级：
        1. 先尝试xtdata.get_stock_list_in_sector() - 实时获取
        2. 如果失败，回退到本地缓存
        
        :param index: 指数代码，如 '000300.SH'（沪深300）
        :return: 成分股代码列表，如 ['600000.SH', '600001.SH', ...]
        """
        # 检查缓存
        if index in self._symbol_cache:
            cached_symbols = self._symbol_cache[index]
            if cached_symbols:
                logger.debug("Using cached index constituents | index=%s | count=%d", index, len(cached_symbols))
                return cached_symbols
        
        # 尝试通过xtdata API获取
        try:
            logger.info("Loading index constituents from xtdata | index=%s", index)
            symbols = xtdata.get_stock_list_in_sector(index)
            
            if symbols and len(symbols) > 0:
                logger.info("Loaded index constituents from xtdata | index=%s | count=%d", index, len(symbols))
                # 缓存结果
                self._symbol_cache[index] = symbols
                return symbols
            else:
                logger.warning("xtdata returned an empty constituent list | index=%s", index)
                
        except Exception as e:
            logger.warning("Failed to load index constituents from xtdata | index=%s | error=%s: %s", index, type(e).__name__, str(e))
        
        # Fallback: 使用本地缓存
        if index in INDEX_SYMBOLS_CACHE:
            symbols = INDEX_SYMBOLS_CACHE[index]
            logger.info("Using fallback index constituents cache | index=%s | count=%d", index, len(symbols))
            self._symbol_cache[index] = symbols
            return symbols
        else:
            logger.error("Failed to load index constituents | index=%s | reason=unknown index or xtdata failure", index)
            logger.error("Supported fallback indices: %s", list(INDEX_SYMBOLS_CACHE.keys()))
            return []

    def load_history_k_day_data(self, symbol: str, data: pd.DataFrame) -> None:
        """加载标的的历史股价数据
        :param symbol: 标的代码
        :param data: 包含DatetimeIndex的DataFrame（需有close字段）
        """
        if not isinstance(data.index, pd.DatetimeIndex):
            raise ValueError("历史股价数据索引必须是DatetimeIndex")

        self._history_data[symbol] = data.sort_index(ascending=True)
        logger.debug("Loaded history price series | symbol=%s | range=%s~%s | rows=%d", 
                   symbol, data.index[0].date(), data.index[-1].date(), len(data)) 

    def load_financial_data(self, symbol: str, data: pd.DataFrame) -> None:
        """加载标的的历史财务数据
        :param symbol: 标的代码
        :param data: 包含DatetimeIndex的DataFrame（需有close字段）
        """
        if not isinstance(data.index, pd.DatetimeIndex):
            raise ValueError("历史财务数据索引必须是DatetimeIndex")

        self._financial_data[symbol] = data.sort_index(ascending=True)
        logger.debug("Loaded financial series | symbol=%s | range=%s~%s | rows=%d", 
                   symbol, data.index[0].date(), data.index[-1].date(), len(data))     

    def get_latest_data(self, symbols: list):
        """
        获取最新股票数据
        :param symbol: 标的代码
        :return: 包含最新数据的dict
        """

        try:
            # 下载数据
            logger.info("Downloading latest tick snapshot")
            data = xtdata.get_full_tick(symbols)

            return data

        except Exception as e:
            logger.error(f"Failed to download latest data: {str(e)}")
            raise MarketDataError("Latest data download failed") from e    

    def download_history_data(self, symbols: list, start_date: date, end_date: date):
        """
        下载历史K线数据（批量）
        根据迅投API文档的download_history_data2方法：
        批量下载历史K线数据，使用回调方式通知进度
        
        :param symbols: 标的代码列表
        :param start_date: 开始日期
        :param end_date: 结束日期
        :return: None (数据通过load_history_k_day_data加载)
        """
        
        if not symbols or len(symbols) == 0:
            logger.warning("Skipping history download because symbol list is empty")
            return

        # 数据格式转换
        start = start_date.strftime('%Y%m%d')
        end   = end_date.strftime('%Y%m%d')

        # 下载完成标记
        self.done = False

        # 回调函数
        def on_progress(data):
            logger.debug(data)
            finished = data['finished']
            total = data['total']

            logger.info("下载历史数据进度: %d/%d", finished, total)

            if finished >= total:
                self.done = True

        try:
            # 下载数据
            logger.info("Downloading history data | symbols=%d | range=%s~%s", len(symbols), start, end)
            logger.info("History download symbols preview: %s", f"{symbols[:5]}{'...' if len(symbols) > 5 else ''}")
            
            xtdata.download_history_data2(
                stock_list=symbols,
                period='1d',
                start_time=start,
                end_time=end,
                callback=on_progress
            )  

            # 等待下载完成
            while not self.done:
                time.sleep(1)

            logger.info("History data download completed")

            # 加载数据
            loaded_count = 0
            failed_count = 0

            for idx, symbol in enumerate(symbols):
                try:
                    df = self.get_history_data(symbol, start_date, end_date)

                    if not df.empty:
                        #数据清洗
                        data = df[df['volume'] != 0]

                        self.load_history_k_day_data(symbol, data)
                        loaded_count += 1
                    else:
                        logger.debug("No valid history rows for symbol %s", symbol)

                    logger.info("加载历史股价数据进度: %d/%d", idx + 1, len(symbols))

                except Exception as e:
                    failed_count += 1
                    logger.warning("Failed to load downloaded history data | symbol=%s | error=%s", symbol, str(e))

            logger.info("History data load completed | success=%d | failed=%d", loaded_count, failed_count)

        except Exception as e:
            logger.error("History data download failed: %s", str(e), exc_info=True)
            raise MarketDataError("History data download failed") from e

    def get_history_data(self, symbol: str, start_date: date, end_date: date):
        """
        获取历史K线数据
        :param symbol: 标的代码
        :param start: 开始日期 (YYYYMMDD)
        :param end: 结束日期 (YYYYMMDD)
        :return: 包含OHLCV数据的表格
        """

        # 数据格式转换
        start = start_date.strftime('%Y%m%d')
        end   = end_date.strftime('%Y%m%d')

        try:
            # 获取数据
            data = xtdata.get_market_data(
                field_list=['open', 'high', 'low', 'close', 'volume'],
                stock_list=[symbol],
                period='1d',
                dividend_type='front_ratio',
                start_time=start,
                end_time=end
            )

            # 将每个DataFrame的行合并成一个大的DataFrame
            df = pd.concat(data.values(), axis=0).T
            df.columns = data.keys()
            df.index = pd.to_datetime(df.index)
            df.index.name = 'date'
            df = df.sort_index(ascending=True)

            if not df.empty:
                # 成功日志（包含关键信息）
                logger.debug(
                    f"Loaded history data | symbol={symbol} | range={start_date.strftime('%Y-%m-%d')}~{end_date.strftime('%Y-%m-%d')} | "
                    f"rows={len(df)} | latest={df.index[-1].strftime('%Y-%m-%d')}"
                )

                logger.debug("History data sample head:\n%s", df.head(5))

                logger.debug("History data sample tail:\n%s", df.tail(3))

            else:
                logger.warning(
                    f"No history k-line data available | symbol={symbol} | range={start_date.strftime('%Y-%m-%d')}~{end_date.strftime('%Y-%m-%d')}"
                )

            return df

        except Exception as e:
            logger.error(f"Failed to get history data for {symbol}: {str(e)}")
            raise MarketDataError(f"History data get failed for {symbol}") from e

    def get_local_history_data(self, symbol: str, start_date: date, end_date: date):
        """
        从本地获取历史K线数据
        :param symbol: 标的代码
        :param start: 开始日期 (YYYYMMDD)
        :param end: 结束日期 (YYYYMMDD)
        :return: 包含OHLCV数据的表格
        """

        try:
            df = pd.DataFrame()

            hist_data = self._history_data.get(symbol)

            if not (hist_data is None or hist_data.empty):            
                df = hist_data
                df = df[(df.index >= pd.to_datetime(start_date)) & (df.index <= pd.to_datetime(end_date))].copy()               

            return df

        except Exception as e:
            logger.error(f"Failed to get local history data for {symbol}: {str(e)}")
            raise MarketDataError(f"Local history data get failed for {symbol}") from e


    def download_financial_data(self, symbols: list, start_date: date, end_date: date):
        # 数据格式转换
        start = start_date.strftime('%Y%m%d')
        end   = end_date.strftime('%Y%m%d')

        # 下载完成标记
        self.done = False

        # 回调函数
        def on_progress(data):
            logger.debug(data)

            finished = data['finished']
            total = data['total']

            logger.info("下载财务数据进度: %d/%d", finished, total)

            if finished >= total:
                self.done = True

        try:
            # 下载财务数据
            logger.debug("Downloading financial data | range=%s~%s", start, end)

            financial_table_list = ['Capital']

            xtdata.download_financial_data2(
                stock_list = symbols,
                table_list = financial_table_list,
                start_time = start,
                end_time = end,
                callback = on_progress
            )

            # 等待下载完成
            while not self.done:
                time.sleep(1)

            logger.info("Financial data download completed")

            for idx, symbol in enumerate(symbols):
                df = self.get_financial_data(symbol, start_date, end_date)

                if not df.empty:
                    #数据清洗
                    data = df[df['total_capital'] != 0]

                    self.load_financial_data(symbol, data)
                    logger.info("加载历史财务数据进度: %d/%d", idx + 1, len(symbols))

        except Exception as e:
            logger.error("Failed to download financial data: %s", str(e))
            raise MarketDataError("financial data download failed") from e              

    def get_financial_data(self, symbol: str, start_date: date, end_date: date):
        """
        获取历史财务数据
        :param symbol: 标的代码
        :param start: 开始日期 (YYYYMMDD)
        :param end: 结束日期 (YYYYMMDD)
        :return: 包含历史财务数据的表格
        """

        # 数据格式转换
        start = start_date.strftime('%Y%m%d')
        end   = end_date.strftime('%Y%m%d')

        try:
            # 下载财务数据
            logger.debug("Loading financial data | symbol=%s | range=%s~%s", symbol, start, end)

            financial_table_list = ['Capital']

            # 获取财务数据
            data = xtdata.get_financial_data(
                stock_list = [symbol], 
                table_list = financial_table_list, 
                start_time = start, 
                end_time = end
            )

            df = data[symbol]['Capital']

            if not df.empty:
                #提取关键参数
                df = df[['m_timetag', 'total_capital']].copy()
                df['m_timetag'] = pd.to_datetime(df['m_timetag'], format='%Y%m%d')
                df = df.rename(columns={'m_timetag': 'date'}).set_index('date').sort_index().copy()

                # 成功日志（包含关键信息）
                logger.debug(
                    f"Loaded financial data | symbol={symbol} | range={start_date.strftime('%Y-%m-%d')}~{end_date.strftime('%Y-%m-%d')} | "
                    f"rows={len(df)} | latest={df.index[-1].strftime('%Y-%m-%d')}"
                )

                logger.debug("Financial data sample head:\n%s", df.head(5))
                logger.debug("Financial data sample tail:\n%s", df.tail(3))

            else:
                logger.warning(
                    f"No financial data available | symbol={symbol} | range={start_date.strftime('%Y-%m-%d')}~{end_date.strftime('%Y-%m-%d')}"
                )

            return df

        except Exception as e:
            logger.error(f"Failed to get financial data for {symbol}: {str(e)}")
            raise MarketDataError(f"financial data get failed for {symbol}") from e            

    def get_local_financial_data(self, symbol: str, start_date: date, end_date: date):
        """
        获取历史财务数据
        :param symbol: 标的代码
        :param start: 开始日期 (YYYYMMDD)
        :param end: 结束日期 (YYYYMMDD)
        :return: 包含历史财务数据的表格
        """

        # 数据格式转换

        try:
            df = pd.DataFrame()

            fin_data = self._financial_data.get(symbol)

            if not (fin_data is None or fin_data.empty):
                df = fin_data
                df = df[(df.index >= pd.to_datetime(start_date)) & (df.index <= pd.to_datetime(end_date))].copy()      

            return df

        except Exception as e:
            logger.error(f"Failed to get local financial data for {symbol}: {str(e)}")
            raise MarketDataError(f"Local financial data get failed for {symbol}") from e            

    def subscribe_quote(self, symbols: list, period: str = '1m'):
        """
        订阅实时行情数据（K线或Tick）
        根据迅投API文档: subscribe_quote用于订阅行情数据推送，
        订阅后会首先返回当前最新的全推数据，之后每个数据变化都会推送一次
        
        :param symbols: 标的代码列表，如['000001.SZ', '000002.SZ']
        :param period: 数据周期，如'1m'（1分钟）, '5m'（5分钟）, '1d'（日K）等
        :return: None
        """
        def on_data(datas):
            """
            行情数据回调函数
            当订阅的行情数据有更新时，此函数会被调用
            :param datas: 包含实时数据的dict，格式: {field: {stock_code: DataFrame}}
            """
            try:
                if not datas:
                    return

                # 处理接收到的实时数据
                logger.debug("Received realtime market data fields: %s", list(datas.keys()))

                # 将数据传递给引擎的实时行情处理器
                if hasattr(self._engine, 'process_market_data'):
                    self._engine.process_market_data(datas, period)
                
            except Exception as e:
                logger.error("Realtime market data handler failed: %s", str(e), exc_info=True)

        try:
            logger.info("Subscribing to realtime quotes | symbols=%d | period=%s", len(symbols), period)
            
            # 订阅行情推送
            xtdata.subscribe_quote(
                stock_list=symbols,
                period=period,
                start_time=0,  # 0表示从当前时间开始订阅
                end_time=0,
                callback=on_data
            )
            
            logger.info("Realtime quote subscription established | symbols=%d", len(symbols))

        except Exception as e:
            logger.error("Realtime quote subscription failed: %s", str(e))
            raise MarketDataError(f"Real-time quote subscription failed") from e

    def unsubscribe_quote(self, symbols: list, period: str = '1m'):
        """
        取消订阅实时行情数据
        
        :param symbols: 标的代码列表
        :param period: 数据周期
        :return: None
        """
        try:
            logger.info("Unsubscribing realtime quotes | symbols=%d | period=%s", len(symbols), period)
            
            xtdata.unsubscribe_quote(
                stock_list=symbols,
                period=period
            )
            
            logger.info("Realtime quote subscription cancelled")

        except Exception as e:
            logger.error("Realtime quote unsubscribe failed: %s", str(e))
            raise MarketDataError(f"Real-time quote unsubscribe failed") from e

    def run_event_loop(self):
        """
        阻塞式运行xtdata事件循环
        此方法会一直阻塞，接收和处理实时行情数据
        需要在单独的线程中运行
        
        :return: None
        """
        try:
            logger.info("Starting xtdata event loop")
            xtdata.run()  # 这将一直阻塞并接收回调
            
        except Exception as e:
            logger.error("xtdata event loop failed: %s", str(e), exc_info=True)
            raise MarketDataError(f"xtdata event loop failed") from e

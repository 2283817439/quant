"""实盘引擎：对接迅投QMT接口，驱动策略在真实市场中实时执行"""
import os
import time
import threading
import pandas as pd
from datetime import datetime, date, timedelta
from config.config import ConfigManager
from core.models import Order, OrderStatus
from core.engine_base import BaseEngine
from core.market import MarketDataManager
from core.trader import TradeExecutor
from core.strategy_registry import create_strategy
import strategy.FactorCapitalStrategy  # noqa: F401 — 触发 @register() 装饰器注册
from core.portfolio import PortfolioManager
from core.risk import RiskManager
from core.watchdog import WatchDog
from utils.logger import sys_logger

logger = sys_logger.getChild('LiveEngine')

class Engine(BaseEngine):
    def __init__(self, config: ConfigManager):
        super().__init__(config, logger)

class LiveEngine(Engine):
    """实时引擎核心类，负责在实时环境中执行策略。"""

    EQUITY_RECORD_PREFIX = "live_equity_record"
    ORDERS_RECORD_PREFIX = "live_orders_record"

    def __init__(self, config: ConfigManager):
        """初始化实时引擎。"""
        super().__init__(config)

        # 组件初始化
        self._init()

        # 组件绑定引擎
        self._bind()

        self.parameters = self.strategy.parameters
        logger.debug("Live engine created | strategy=%s", type(self.strategy).__name__)

    def _init(self):
        """初始化系统组件"""
        logger.debug("Initializing live components...")
        market = MarketDataManager(self._config)
        portfolio = PortfolioManager(self._config)
        risk = RiskManager(portfolio, market, config=self._config)
        strategy = create_strategy(self._config.get('strategy.class', 'FactorCapitalStrategy'), self._config)
        self._init_core_components(
            risk_manager=risk,
            strategy=strategy,
            market=market,
            portfolio=portfolio,
        )

        self.trader = TradeExecutor()
        logger.debug("Trade executor initialized")

        self.watchdog = WatchDog()
        logger.debug("Watchdog initialized")

        self._init_flag = True
        logger.info("Live components initialized")

    def _bind(self):
        """系统组件绑定"""
        logger.debug("Binding live components...")
        self._bind_core_components()

        self.trader.bind(self)
        logger.debug("Trade executor bound")

        self.watchdog.bind(self)
        logger.debug("Watchdog bound")

        self._bind_flag = True
        logger.info("Live components bound")

    def start(self):
        if not self.trader.start():
            raise ValueError("Live engine failed to start")

        self._initialize_database()

        logger.info("Loading local snapshot...")
        self.load_snapshot()

        logger.info("Querying broker state...")
        self.query_server()

        logger.info("Displaying local positions...")
        self.display_local()        

        # 启动实时行情数据订阅（如果配置启用）
        self._start_market_data_subscription()

        # 开启看门狗
        self.watchdog.start()

    def _start_market_data_subscription(self) -> None:
        """
        启动实时行情数据订阅
        在单独的线程中运行xtdata事件循环，以接收实时行情推送
        """
        try:
            # 获取需要订阅的标的列表
            symbols_to_subscribe = list(set(self.portfolio.symbols + self._benchmark))
            
            if not symbols_to_subscribe:
                logger.warning("没有标的需要订阅实时行情")
                return

            logger.info("准备订阅实时行情数据 | 标的数: %d", len(symbols_to_subscribe))

            # 订阅1分钟K线数据（用于策略信号产生）
            try:
                self.market.subscribe_quote(
                    symbols=symbols_to_subscribe,
                    period='1m'
                )
                logger.info("已订阅1分钟K线数据")
            except Exception as e:
                logger.error(f"订阅1分钟K线数据失败: {str(e)}", exc_info=True)

            # 订阅Tick数据（用于实时价格更新）
            try:
                self.market.subscribe_quote(
                    symbols=symbols_to_subscribe,
                    period='tick'
                )
                logger.info("已订阅Tick数据")
            except Exception as e:
                logger.error(f"订阅Tick数据失败: {str(e)}", exc_info=True)

            # 在单独的线程中运行xtdata事件循环
            # 此线程将阻塞并接收实时行情推送
            market_data_thread = threading.Thread(
                target=self._run_market_data_loop,
                name="MarketDataThread",
                daemon=True  # 设置为守护线程，主程序退出时自动关闭
            )
            market_data_thread.start()
            logger.info("实时行情数据订阅线程已启动")

        except Exception as e:
            logger.error(f"启动实时行情订阅失败: {str(e)}", exc_info=True)
            # 记录但不中断主流程

    def _run_market_data_loop(self) -> None:
        """
        运行xtdata事件循环（在单独的线程中执行）
        此方法将持续阻塞，接收和处理实时行情数据回调
        """
        try:
            logger.info("xtdata事件循环启动，开始接收实时行情数据...")
            self.market.run_event_loop()  # 这将阻塞并接收回调
        except Exception as e:
            logger.error(f"xtdata事件循环异常: {str(e)}", exc_info=True)
        finally:
            logger.warning("xtdata事件循环已退出")

    def close(self):
        logger.info("Saving live snapshot before shutdown...")
        self.portfolio.save_snapshot()

        logger.info("Displaying local positions...")
        self.display_local()             

        self.watchdog.shutdown()

        self.trader.disconnect()

    def process_market_data(self, datas: dict, period: str) -> None:
        """
        处理实时行情数据回调
        根据迅投API文档，订阅的行情数据会通过此回调函数推送
        
        :param datas: 行情数据字典，格式: {field: {stock_code: DataFrame}}
        :param period: 数据周期，如'1m', '5m', '1d'等
        :return: None
        """
        try:
            if not datas:
                return

            logger.debug("处理实时行情数据推送 | 周期: %s | 字段数: %d", period, len(datas))

            # 遍历推送的数据
            for field_name, field_data in datas.items():
                try:
                    for stock_code, df in field_data.items():
                        if df.empty:
                            continue
                            
                        # 获取最新的行情数据（最后一行）
                        latest_data = df.iloc[-1] if len(df) > 0 else None
                        if latest_data is None:
                            continue

                        logger.debug("实时数据: %s | %s | %s | 最新数据: %s", 
                                   stock_code, period, field_name, latest_data.to_dict())

                        # 如果是价格数据，更新历史数据缓存
                        if field_name in ['close', 'open', 'high', 'low', 'volume']:
                            self._update_history_data_cache(stock_code, df)

                        # 将最新数据推送给策略处理（如果策略实现了on_market_data方法）
                        if hasattr(self.strategy, 'on_market_data'):
                            self.strategy.on_market_data(stock_code, period, latest_data)

                except Exception as e:
                    logger.error(f"处理标的 {stock_code} 的实时数据异常: {str(e)}", exc_info=True)

        except Exception as e:
            logger.error(f"实时行情数据处理异常: {str(e)}", exc_info=True)

    def _update_history_data_cache(self, symbol: str, df: pd.DataFrame) -> None:
        """
        更新历史数据缓存（用实时数据更新内存中的历史数据）
        
        :param symbol: 标的代码
        :param df: 包含最新数据的DataFrame
        :return: None
        """
        try:
            if symbol not in self._history_data:
                # 如果缓存中不存在此标的，则新建条目
                self._history_data[symbol] = df.copy()
                logger.debug(f"为标的 {symbol} 创建历史数据缓存，共 {len(df)} 条数据")
            else:
                # 合并新数据到现有缓存
                existing_df = self._history_data[symbol]
                
                # 找出新增的行（时间戳不在现有数据中）
                if existing_df.index.name == df.index.name or (existing_df.index.name is None and df.index.name is None):
                    # 如果索引相同，直接合并并去重
                    merged_df = pd.concat([existing_df, df])
                    merged_df = merged_df[~merged_df.index.duplicated(keep='last')]  # 保留最新的数据
                    self._history_data[symbol] = merged_df.sort_index(ascending=True)
                    
                    logger.debug(f"已更新标的 {symbol} 的历史数据缓存，当前共 {len(self._history_data[symbol])} 条数据")

        except Exception as e:
            logger.error(f"更新历史数据缓存异常 {symbol}: {str(e)}", exc_info=True)

    def on_date_change(self, date: date) -> None:
        """执行跨日操作"""
        super().on_date_change(date)

    def prepare(self) -> None:
        """准备实时运行所需的行情与财务数据。"""
        history_end = self._current_date - timedelta(days=1)
        self._download_prepare_datasets(
            symbols=self._build_symbol_universe(include_index=True),
            history_start=history_end - timedelta(days=10),
            history_end=history_end,
            financial_start=self._current_date - timedelta(days=2 * 365),
            financial_end=self._current_date,
        )

    def pre_market(self) -> None:
        """执行开盘前的数据准备。"""
        self.prepare()

        end_date = self._current_date - timedelta(days=1)
        start_date = end_date - timedelta(days=10)
        self._load_local_history_window(
            symbols=self._build_symbol_universe(include_index=False),
            start_date=start_date,
            end_date=end_date,
        )

        self.update_equity()

        if self.strategy.is_execution_day():
            self.strategy.pre_market()

    def on_open(self) -> None:
        """执行开盘交易"""        
        if self.strategy.is_execution_day():
            self.portfolio.rebalance_portfolio_exposure()
            self.strategy.on_open()

    def on_trade(self) -> None:
        """执行交易时段"""        
        if self.strategy.is_execution_day():
            self.strategy.on_trade()

    def on_close(self) -> None:
        """执行收盘交易"""    
        if self.strategy.is_execution_day():
            self.strategy.on_close()

    def post_market(self) -> None:
        """执行收盘后的收尾与持久化。"""
        self.cancel_orders()

        self.save_snapshot()

        self._persist_positions_to_db(
            account_payload={
                'account_id': self._config.get('account.account_id', 'live'),
                'total_asset': self.portfolio.total_equity,
                'available_cash': self.portfolio.available_cash,
                'frozen_cash': self.portfolio.total_cash - self.portfolio.available_cash,
                'market_value': self.portfolio.total_market_value,
            }
        )

        logger.info("Displaying local positions...")
        self.display_local()

    def sync_server(self):
        """同步资金与持仓到本地组合状态。"""
        available_cash = self.trader.query_asset()
        self.portfolio.update_available_cash(available_cash)

        dict_positions = self.trader.query_positions()
        self.portfolio.overwrite_positions(dict_positions)

    def query_server(self):
        """查询券商侧资金与持仓状态。"""
        self.trader.query_asset()

        self.trader.query_positions() 

    def display_local(self):
        super().display_local()

    def load_snapshot(self):
        """加载本地快照。"""
        super().load_snapshot()

    def save_snapshot(self):
        """保存本地快照。"""
        super().save_snapshot()

    def is_trading_day(self, date: date = None): 
        return super().is_trading_day(date)

    def load_history_k_day_data(self, symbol: str, data: pd.DataFrame) -> None:
        """加载指定标的的历史 K 线数据。"""
        super().load_history_k_day_data(symbol, data)

    def get_latest_data(self, symbols: list):
        """
        获取最新股票数据
        :param symbol: 标的代码
        :return: 包含最新数据的dict
        """
        data = self.market.get_latest_data(symbols)

        return data

    def _reset_daily_state(self) -> None:
        super()._reset_daily_state()

    def add_order(self, order: Order) -> bool:
        logger.debug("Queueing live order")
        try:
            return self._queue_order(order)

        except Exception:
            logger.error("Failed to queue live order", exc_info=True)
            raise ValueError("Failed to queue live order")

    def place_orders(self) -> None:
        """提交订单并与持仓管理器交互"""
        logger.info("Submitting queued live orders")
        i = 0

        for _id, _order in self._orders.items():
            #只提交状态为PENDING的订单
            if _order.status == OrderStatus.PENDING:
                res = self.trader.place_order(_order)
                if res:
                    _order.update_status(OrderStatus.SUBMITTED)
                else:
                    _order.update_status(OrderStatus.REJECTED)
                i += 1

        logger.info("Submitted live orders: %d", i)

    def wait_orders_completion(self) -> None:
        """等待订单执行完成"""
        logger.info("Waiting for live orders to complete...")
        start_time = datetime.now()

        # 超时计数器
        timeout_cnt = 0

        # 已发送订单列表
        pending_ids = []

        for _id, _order in self._orders.items():
            if _order.status == OrderStatus.SUBMITTED:
                pending_ids.append(_id)

        while True:
            done = True
            for _id in pending_ids:
                # 检查交易订单记录
                if _id in self._trader_orders:
                    status = self._trader_orders[_id].status
                    if status not in (
                        OrderStatus.FILLED,
                        OrderStatus.CANCELLED,
                        OrderStatus.REJECTED
                    ):
                        done = False
                        break                    
                else:
                    done = False
                    break

            if not done:
                time.sleep(0.5)
                timeout_cnt += 1
                if timeout_cnt > 60:
                    logger.warning("Live order execution timed out after %.2f seconds", (datetime.now() - start_time).total_seconds())
                    return
            else:
                logger.info("Live orders completed in %.2f seconds", (datetime.now() - start_time).total_seconds())
                return

    def cancel_orders(self) -> None:
        """撤销订单并与持仓管理器交互"""
        logger.info("Cancelling submitted live orders")
        i = 0

        for _id, _order in self._trader_orders.items():
            #只能撤销订单状态为SUBMITTED的订单
            if _order.status == OrderStatus.SUBMITTED:
                res = self.trader.cancel_order(_order)
                if res:
                    # 修改订单状态
                    _order.update_status(OrderStatus.CANCELLED, 0, 0)
                    # 解冻订单锁定资产
                    _order = self._orders[_order.id]
                    self.portfolio.unfreeze_order_locked_asset(_order)

                i += 1

        logger.info("Cancelled live orders: %d", i)

    def query_positions(self) -> None:
        self.trader.query_positions()

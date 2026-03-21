"""回测引擎：在模拟环境中驱动策略按历史日期逐日执行"""
import os
import glob
import random
import pandas as pd
from datetime import datetime, date, timedelta
from config.config import ConfigManager
from .analyzer import PerformanceAnalyzer
from .visualizer import BacktestVisualizer
from .benchmark import BenchmarkCalculator
from core.models import Order, OrderStatus
from core.engine_base import BaseEngine
from core.market import MarketDataManager
from core.strategy_registry import create_strategy
import strategy.FactorCapitalStrategy  # noqa: F401 — 触发 @register() 装饰器注册
from core.portfolio import PortfolioManager
from core.risk import RiskManager
from utils.logger import sys_logger

logger = sys_logger.getChild('BackEngine')

class Engine(BaseEngine):
    def __init__(self, config: ConfigManager):
        super().__init__(config, logger)

class BackTestEngine(Engine):
    """回测引擎核心类，负责在回测环境中执行策略。"""

    EQUITY_RECORD_PREFIX = "backtest_equity_record"
    ORDERS_RECORD_PREFIX = "backtest_orders_record"
    REPORT_RECORD_PREFIX = "backtest_report_record"

    def __init__(self, config: ConfigManager):
        """初始化回测引擎。"""
        super().__init__(config)

        self._random_seed = self._config.get('seed')

        # 随机种子
        if self._random_seed is not None:
            random.seed(self._random_seed)

        # 组件初始化
        self._init()

        # 组件绑定引擎
        self._bind()

        self.parameters = self.strategy.parameters

        # 输出记录
        self.total_orders_count = 0
        logger.debug("Backtest engine created | strategy=%s", type(self.strategy).__name__)

    def _init(self):
        """初始化系统组件"""
        logger.debug("Initializing backtest components...")
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

        self.analyzer = PerformanceAnalyzer(self._config)
        logger.debug("Analyzer initialized")

        self.benchmark_calc = BenchmarkCalculator()
        logger.debug("Benchmark calculator initialized")

        self.visualizer = BacktestVisualizer()
        logger.debug("Backtest visualizer initialized")

        self._init_flag = True
        logger.info("Backtest components initialized")

    def _bind(self):
        """系统组件绑定"""
        logger.debug("Binding backtest components...")
        self._bind_core_components()

        self.analyzer.bind(self)
        logger.debug("Analyzer bound")

        self.benchmark_calc.bind(self)
        logger.debug("Benchmark calculator bound")

        self.visualizer.bind(self)
        logger.debug("Backtest visualizer bound")

        self._bind_flag = True
        logger.info("Backtest components bound")

    def start(self):
        if self._config.get('mode') == 'backtest':
            self.clean_old_records()
        self._initialize_database()

    def close(self):
        """关闭回测引擎"""
        logger.info("回测引擎关闭，清理资源")
        self._orders.clear()
        self._trader_orders.clear()
        self._history_data.clear()

    def on_date_change(self, date: date) -> None:
        """执行跨日操作"""
        super().on_date_change(date)

    def prepare(self, start_date: date, end_date: date) -> None:
        """准备回测所需的行情与财务数据。"""
        today = datetime.now().date()
        self._download_prepare_datasets(
            symbols=self._build_symbol_universe(include_index=True),
            history_start=start_date - timedelta(days=10),
            history_end=end_date,
            financial_start=today - timedelta(days=2 * 365),
            financial_end=today,
        )

    def pre_market(self) -> None:
        """执行开盘前的数据准备。"""
        end_date = self._current_date - timedelta(days=1)
        start_date = end_date - timedelta(days=10)
        self._load_local_history_window(
            symbols=self._build_symbol_universe(include_index=False),
            start_date=start_date,
            end_date=end_date,
        )

        self.update_equity()
        self.report(120)

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
        self._persist_positions_to_db()

    def sync_server(self):
        """回测模式下保留接口兼容，不执行服务端同步。"""
        logger.debug("Skipping server sync in backtest mode")

    def query_server(self):
        """回测模式下保留接口兼容，不查询服务端状态。"""
        logger.debug("Skipping server status query in backtest mode")

    def query_positions(self) -> None:
        """回测模式下保留接口兼容，不查询服务端持仓。"""
        logger.debug("Skipping server position query in backtest mode")

    def display_local(self):
        super().display_local()

    def load_snapshot(self):
        """加载本地快照"""
        try:
            super().load_snapshot(latest=True)
            logger.info("Backtest snapshot loaded")
        except Exception as e:
            logger.error("Failed to load local snapshot: %s", str(e), exc_info=True)

    def save_snapshot(self):
        """存储本地快照"""
        try:
            filepath = super().save_snapshot(tag=self._current_date.strftime("%Y%m%d"))
            logger.debug("Backtest snapshot saved to %s", filepath)
        except Exception as e:
            logger.error("Failed to save local snapshot: %s", str(e), exc_info=True)

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
        data = {}

        # 加载历史数据
        end_date   = self._current_date
        start_date = end_date - timedelta(days=10)

        for symbol in symbols:
            df = self.market.get_local_history_data(symbol, start_date, end_date)

            if not df.empty:
                #数据清洗
                df = df[df['volume'] != 0]

                data[symbol] = {'lastPrice': df.iloc[-1]['close']}

        return data

    def _reset_daily_state(self) -> None:
        super()._reset_daily_state()

    def add_order(self, order: Order):
        logger.debug("Queueing backtest order")
        try:
            self._queue_order(order, count_total_orders=True)
        except Exception:
            logger.error("Failed to queue backtest order", exc_info=True)
            raise ValueError("Failed to queue backtest order")

    def place_orders(self) -> None:
        """提交订单并与持仓管理器交互"""
        logger.info("Submitting queued backtest orders")
        i = 0

        for _id, _order in self._orders.items():
            # 只提交状态为PENDING的订单
            if _order.status == OrderStatus.PENDING:
                # 生成回调订单
                order = _order.copy()

                # 更新发送订单列表
                _order.update_status(OrderStatus.FILLED)

                # 更新回调订单数据
                order.update_status(OrderStatus.FILLED, _order.volume, _order.price)
                self.process_trader_order_callback(order)
                i += 1

        logger.info("Submitted backtest orders: %d", i)

    def wait_orders_completion(self) -> None:
        """
        等待订单执行完成
        回测模式中订单立即成交，此方法仅用于接口兼容性
        """
        logger.debug("Backtest orders settle immediately; skipping wait")

    def cancel_orders(self) -> None:
        """撤销订单并与持仓管理器交互（回测模式：直接标记取消并解冻资产）"""
        logger.info("Cancelling submitted backtest orders")
        i = 0

        for _id, _order in list(self._trader_orders.items()):
            if _order.status == OrderStatus.SUBMITTED:
                try:
                    _order.update_status(OrderStatus.CANCELLED, 0, 0)
                    orig_order = self._orders.get(_order.id)
                    if orig_order:
                        self.portfolio.unfreeze_order_locked_asset(orig_order)
                    i += 1
                except Exception as e:
                    logger.error("Failed to cancel backtest order %s: %s", _id, e)

        logger.info("Cancelled backtest orders: %d", i)

    def _should_persist_order_csv(self) -> bool:
        return self._config.get('mode') == 'backtest'

    def _should_persist_equity_csv(self) -> bool:
        return self._config.get('mode') == 'backtest'

    def _persist_equity_csv(self, df_equity: pd.DataFrame) -> None:
        os.makedirs(self._record_file_path, exist_ok=True)
        filepath = os.path.join(self._record_file_path, f"{self.EQUITY_RECORD_PREFIX}.csv")
        self.df_equity.to_csv(filepath, mode='w', header=True, index=False, encoding='utf-8-sig')
        logger.info("Saved equity record to %s", filepath)

    def _persist_equity_snapshot_to_db(self, snapshot: dict) -> None:
        if not self.db:
            return

        try:
            daily_return = 0.0
            if len(self.df_equity) >= 2:
                prev_equity = self.df_equity['总资产'].iloc[-2]
                curr_equity = self.df_equity['总资产'].iloc[-1]
                if prev_equity > 0:
                    daily_return = (curr_equity - prev_equity) / prev_equity

            total_return = None
            if hasattr(self.portfolio, '_initial_cash') and self.portfolio._initial_cash:
                total_return = round(snapshot['总资产'] / self.portfolio._initial_cash - 1, 6)

            self.db.insert_performance({
                'date': self._current_date,
                'strategy_name': type(self.strategy).__name__,
                'daily_return': round(daily_return, 6),
                'total_return': total_return,
            })
            self.db.update_account({
                'account_id': self._config.get('account.account_id', 'backtest'),
                'total_asset': snapshot['总资产'],
                'available_cash': snapshot['可用现金'],
                'frozen_cash': snapshot['总现金'] - snapshot['可用现金'],
                'market_value': snapshot['持仓市值'],
            })
        except Exception as exc:
            logger.warning("Failed to persist equity data: %s", exc)

    def clean_old_records(self) -> None:
        """
        清理所有历史日志文件（包括轮换文件）
        :param log_path: 主日志文件路径（如 logs/app.log）
        """
        try:
            # 获取日志目录和基本文件名
            # filename = f"{self.EQUITY_RECORD_PREFIX}"
            filepath = os.path.join(self._record_file_path, "backtest*.csv")

            # 匹配所有相关日志文件
            old_logs = glob.glob(filepath)

            # 删除文件
            for f in old_logs:
                try:
                    os.remove(f)
                    logger.info(f"已删除旧日志文件: {f}")  # 调试用，正式环境可注释
                except Exception as e:
                    logger.error(f"删除日志文件失败 {f}: {str(e)}")
        except Exception as e:
            logger.error(f"清理日志异常: {str(e)}")

    def report(self, windows=0):
        logger.info(f"生成分析报告, windows = {windows}...")
        dict_report = self.analyzer.analyze(windows)

        # 追加基准对比指标（仅全量报告时执行）
        if self._benchmark and windows == 0:
            try:
                df_equity = self.analyzer.gen_df_equity(windows)
                for bm_symbol in self._benchmark:
                    bm_stats = self.benchmark_calc.compare(
                        strategy_equity=df_equity['equity'],
                        benchmark_symbol=bm_symbol,
                    )
                    dict_report.update(bm_stats)
            except Exception as e:
                logger.warning(f"基准对比计算失败，跳过: {e}")

        df_report = pd.DataFrame(dict_report, index=[0])

        if self._config.get('mode') == 'backtest':
            # 创建记录目录
            os.makedirs(self._record_file_path, exist_ok=True)

            filename = f"{self.REPORT_RECORD_PREFIX}"
            filepath = os.path.join(self._record_file_path, f"{filename}.csv")

            header = not os.path.exists(filepath)
            df_report.to_csv(filepath, mode='a', header=header, index=False, encoding='utf-8-sig')

            logger.info(f"成功保存报告记录至 {filepath}")

        # 写入汇总绩效到数据库（仅全量报告）
        if self.db and windows == 0:
            try:
                self.db.insert_performance({
                    'date':          dict_report.get('date', self._current_date),
                    'strategy_name': type(self.strategy).__name__,
                    'total_return':  dict_report.get('total_return'),
                    'daily_return':  None,
                    'max_drawdown':  dict_report.get('max_drawdown'),
                    'sharpe_ratio':  dict_report.get('sharpe_ratio'),
                    'win_rate':      None,
                    'profit_factor': None,
                    'trade_count':   dict_report.get('trade_count'),
                    'total_pnl':     None,
                })
            except Exception as _db_e:
                logger.warning(f"汇总绩效写入数据库失败: {_db_e}")

        return dict_report

    def plot(self):
        # 可视化
        self.visualizer.plot()

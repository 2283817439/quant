"""
小市值因子策略（优化版）
优化内容：
  1. 实现止损逻辑（stop_loss_ratio）
  2. 实现止盈回撤逻辑（max_profit_drawdown）
  3. 实现新高超时退出（new_high_timeout）
  4. 修复 _calculate_position_size 使用正确的 per_trade_risk
  5. 增加卖出原因日志，便于事后分析
"""
import pandas as pd
from datetime import datetime, timedelta
from core.strategy import BaseStrategy
from core.strategy_registry import register
from config.config import ConfigManager
from core.models import Order, OrderDirection, OrderType
from utils.logger import sys_logger

logger = sys_logger.getChild('Strategy')

# 卖出原因枚举（便于日志分析）
class SellReason:
    NOT_IN_TARGET    = "不在目标池"
    STOP_LOSS        = "触发止损"
    PROFIT_DRAWDOWN  = "止盈回撤"
    NEW_HIGH_TIMEOUT = "新高超时"


@register()
class FactorCapitalStrategy(BaseStrategy):
    """小市值因子策略"""

    def __init__(self, config: ConfigManager):
        super().__init__(strategy_name='FactorCapitalStrategy')

        self._config = config
        self.index     = self._config.get('index')
        self.frequency = self._config.get('strategy.frequency')

        # ── 策略参数（从配置读取，优化后均已启用） ──
        self.stop_loss_ratio    = self._config.get('strategy.stop_loss_ratio',    0.08)
        self.max_profit_drawdown = self._config.get('strategy.max_profit_drawdown', 0.15)
        self.new_high_timeout   = self._config.get('strategy.new_high_timeout',    45)

        self.current_date  = None
        self._current_date = None

        self._latest_data   = {}
        self._financial_data = {}
        self.target_symbols  = []
        self.index_symbols   = []

        self._validate_symbols()

        self.parameters = (
            f"FactorCapitalStrategy: index={self.index}, frequency={self.frequency}, "
            f"stop_loss={self.stop_loss_ratio:.0%}, "
            f"profit_drawdown={self.max_profit_drawdown:.0%}, "
            f"new_high_timeout={self.new_high_timeout}d"
        )
        logger.info(f"因子策略初始化完成 | {self.parameters}")

    def _validate_symbols(self):
        symbols = self._config.get('symbols', [])
        invalid = [s for s in symbols if not self._is_valid_symbol(s)]
        if invalid:
            raise ValueError(f"检测到非法股票代码: {invalid}")
        self.symbols = symbols

    def _is_valid_symbol(self, symbol: str) -> bool:
        if not symbol:
            return False
        parts = symbol.split('.')
        if len(parts) != 2:
            return False
        code, market = parts
        return len(code) == 6 and market in ['SH', 'SZ'] and code.isdigit()

    def load_latest_data(self, symbol: str, data: dict) -> None:
        if data:
            self._latest_data[symbol] = data
            logger.debug(f"加载 {symbol} 最新数据")

    def load_financial_data(self, symbol: str, data: pd.DataFrame) -> None:
        if data is not None and not data.empty:
            self._financial_data[symbol] = data
            logger.debug(f"加载 {symbol} 财务数据，数据量: {len(data)}")

    def on_open(self) -> None:
        logger.debug("策略开盘交易处理")

    def on_trade(self) -> None:
        logger.debug("策略交易时段处理")

    @property
    def _current_date(self):
        return self.current_date

    @_current_date.setter
    def _current_date(self, value):
        self.current_date = value

    def is_execution_day(self) -> bool:
        """判断是否为执行日"""
        try:
            if self.frequency == 'daily':
                return True
            elif self.frequency == 'weekly':
                current_date = self._current_date
                first_day = current_date - timedelta(days=current_date.weekday())
                for delta in range(0, (current_date - first_day).days):
                    if self.engine.is_trading_day(first_day + timedelta(days=delta)):
                        return False
                return True
            elif self.frequency == 'monthly':
                current_date = self._current_date
                first_day = current_date.replace(day=1)
                for delta in range(0, (current_date - first_day).days):
                    if self.engine.is_trading_day(first_day + timedelta(days=delta)):
                        return False
                return True
            return False
        except Exception as e:
            logger.error(f"is_execution_day 异常: {str(e)}", exc_info=True)
            return False

    def _calculate_position_size(self, price: float, direction: OrderDirection, available_cash: float) -> int:
        """基于风险管理的头寸计算"""
        if not self.portfolio or not self.risk:
            raise RuntimeError("组件未初始化")

        if direction != OrderDirection.BUY:
            return 0

        max_position_ratio = self.risk.params.max_position_ratio  # 0.12
        per_trade_risk     = self.risk.params.per_trade_risk       # 0.15

        # 实际投入 = min(最大仓位约束, 单次风险约束) × 可用资金
        max_investment    = available_cash * max_position_ratio
        risk_investment   = available_cash * per_trade_risk
        actual_investment = min(max_investment, risk_investment)

        min_lot_cost = price * 100
        if actual_investment < min_lot_cost:
            return 0

        shares   = int(actual_investment // min_lot_cost)
        position = shares * 100

        logger.debug(
            f"头寸计算 | 可用:{available_cash:,.0f} 最大投入:{max_investment:,.0f} "
            f"实际投入:{actual_investment:,.0f} 数量:{position}"
        )
        return position

    def _calc_target_symbols(self):
        """计算目标股票列表（市值最小的前10只）"""
        self.target_symbols = []
        data_records = []

        for symbol in self.index_symbols:
            try:
                latest_data = self._latest_data.get(symbol)
                if not latest_data:
                    continue
                fin_data = self._financial_data.get(symbol)
                if fin_data is None or fin_data.empty:
                    continue

                latest_price   = latest_data['lastPrice']
                latest_capital = fin_data['total_capital'].iloc[-1]

                if latest_price <= 0 or latest_capital <= 0:
                    continue

                data_records.append({
                    'symbol':        symbol,
                    'close':         latest_price,
                    'total_capital': latest_capital
                })
            except Exception as e:
                logger.error(f"处理 {symbol} 异常: {str(e)}", exc_info=True)

        if not data_records:
            logger.error("无有效数据，目标列表置空")
            return

        df = pd.DataFrame(data_records)
        df['market_cap'] = df['close'] * df['total_capital']
        df_sorted = df.sort_values('market_cap', ascending=True)

        target_count = 10
        target_df = df_sorted.head(target_count) if len(df_sorted) >= target_count else df_sorted
        self.target_symbols = target_df['symbol'].tolist()

        logger.info(
            "目标标的 | 数量:%d | 市值范围:[%.2f亿~%.2f亿] | %s",
            len(self.target_symbols),
            target_df['market_cap'].min() / 1e8,
            target_df['market_cap'].max() / 1e8,
            self.target_symbols
        )

    # ────────────────────────────────────────────────────────────────
    # 核心优化：卖出判断逻辑（新增止损/止盈/超时）
    # ────────────────────────────────────────────────────────────────
    def _should_sell(self, symbol: str, price: float) -> tuple:
        """
        判断是否应该卖出该标的
        返回 (should_sell: bool, reason: str)
        """
        # 1. 不在目标池：最基础的卖出信号
        if symbol not in self.target_symbols:
            return True, SellReason.NOT_IN_TARGET

        position = self.portfolio.get_position(symbol)
        if not position or position.avg_price <= 0:
            return False, ""

        avg_price     = position.avg_price
        highest_price = position.highest_price
        highest_date  = position.highest_date

        # 2. 止损：当前价格相对成本亏损超过 stop_loss_ratio
        if self.stop_loss_ratio < 1.0:
            loss_ratio = (price - avg_price) / avg_price
            if loss_ratio <= -self.stop_loss_ratio:
                return True, f"{SellReason.STOP_LOSS}({loss_ratio:.1%} < -{self.stop_loss_ratio:.0%})"

        # 3. 止盈回撤：从持仓最高价回撤超过 max_profit_drawdown
        if self.max_profit_drawdown < 1.0 and highest_price > avg_price:
            drawdown_from_high = (price - highest_price) / highest_price
            if drawdown_from_high <= -self.max_profit_drawdown:
                profit_from_cost = (highest_price - avg_price) / avg_price
                return True, (f"{SellReason.PROFIT_DRAWDOWN}"
                              f"(峰值盈利:{profit_from_cost:.1%} 回撤:{drawdown_from_high:.1%})")

        # 4. 新高超时：连续超过 new_high_timeout 个交易日未创新高
        if self.new_high_timeout < 9999 and highest_date is not None and self.current_date is not None:
            # 用日历天数近似，乘以 1.4 将交易日换算为自然日
            timeout_days = int(self.new_high_timeout * 1.4)
            days_since_high = (self.current_date - highest_date).days
            if days_since_high >= timeout_days:
                return True, (f"{SellReason.NEW_HIGH_TIMEOUT}"
                              f"({days_since_high}自然日/{self.new_high_timeout}交易日未创新高)")

        return False, ""

    def _generate_sell_orders(self):
        """卖单生成（含止损/止盈/超时判断）"""
        try:
            logger.info("开始处理卖单 | 持仓数: %d", len(self.portfolio.symbols))
            sold_count = 0

            for symbol in list(self.portfolio.symbols):
                latest_data = self._latest_data.get(symbol)
                if not latest_data:
                    logger.warning(f"{symbol} 无最新数据，跳过卖出判断")
                    continue

                price = round(latest_data['lastPrice'], 2)
                should_sell, reason = self._should_sell(symbol, price)

                if not should_sell:
                    continue

                position      = self.portfolio.get_position(symbol)
                position_size = position.available_volume if position else 0

                if position_size <= 0:
                    logger.warning(f"{symbol} 可用持仓为0，跳过")
                    continue

                logger.info("生成卖单 | %s %d股@%.3f | 原因: %s",
                            symbol, position_size, price, reason)

                order = Order(
                    symbol=symbol,
                    direction=OrderDirection.SELL,
                    price=price,
                    volume=position_size,
                    type=OrderType.MARKET
                )
                self.engine.add_order(order)
                sold_count += 1

            logger.info("卖单生成完成 | 共 %d 只", sold_count)
        except Exception as e:
            logger.error(f"卖单生成异常: {str(e)}", exc_info=True)

    def _generate_buy_orders(self):
        """买单生成"""
        try:
            logger.info("开始处理买单")
            to_buy = [s for s in self.target_symbols if s not in self.portfolio.symbols]

            if not to_buy:
                logger.info("持仓无变化，无需买入")
                return

            max_portfolio_exposure = self.risk.params.max_portfolio_exposure
            total_equity           = self.portfolio.total_equity
            total_market_value     = self.portfolio.total_market_value

            available_cash_exposure = total_equity * max_portfolio_exposure - total_market_value
            available_cash = min(self.portfolio.available_cash, max(available_cash_exposure, 0))
            available_cash_per_symbol = available_cash // len(to_buy) if to_buy else 0

            bought_count = 0
            for symbol in to_buy:
                latest_data = self._latest_data.get(symbol)
                if not latest_data:
                    continue
                price = round(latest_data['lastPrice'], 2)

                position_size = self._calculate_position_size(price, OrderDirection.BUY, available_cash_per_symbol)

                if position_size <= 0:
                    logger.warning(f"资金不足跳过 | {symbol} @{price:.2f}")
                    continue

                logger.info("生成买单 | %s %d股@%.3f", symbol, position_size, price)
                order = Order(
                    symbol=symbol,
                    direction=OrderDirection.BUY,
                    price=price,
                    volume=position_size,
                    type=OrderType.MARKET
                )
                self.engine.add_order(order)
                bought_count += 1

            logger.info("买单生成完成 | 共 %d 只", bought_count)
        except Exception as e:
            logger.error(f"买单生成异常: {str(e)}", exc_info=True)

    def pre_market(self) -> None:
        """开盘前准备：加载财务数据"""
        self.index_symbols = self.market.get_index_symbols(index=self.index)
        self.symbols = list(set(self.index_symbols + self.portfolio.symbols))

        end_date   = datetime.now().date()
        start_date = end_date - timedelta(days=2*365)

        logger.info("加载财务数据: %s ~ %s", start_date, end_date)
        for idx, symbol in enumerate(self.symbols):
            df = self.market.get_local_financial_data(symbol, start_date, end_date)
            if not df.empty:
                data = df[df['total_capital'] != 0]
                self.load_financial_data(symbol, data)
                logger.debug("已加载 %s 财务数据 %d条 | %d/%d", symbol, len(data), idx, len(self.symbols))

    def on_close(self) -> None:
        """收盘执行：更新数据 → 计算目标 → 卖 → 买"""
        # 更新最新价格
        data = self.engine.get_latest_data(self.symbols)
        for idx, symbol in enumerate(self.symbols):
            if data.get(symbol):
                self.load_latest_data(symbol, data[symbol])
                logger.debug("已加载 %s 最新价 | %d/%d", symbol, idx, len(self.symbols))

        # 计算目标持仓
        self._calc_target_symbols()

        # 卖出（含止损/止盈/超时）→ 提交 → 等待
        self._generate_sell_orders()
        self.engine.place_orders()
        self.engine.wait_orders_completion()

        # 买入 → 提交 → 等待
        self._generate_buy_orders()
        self.engine.place_orders()
        self.engine.wait_orders_completion()

    def generate_signals(self, current_time: datetime) -> list:
        """实现抽象方法（订单逻辑在 on_close 中，此处返回空）"""
        if not self.is_execution_day():
            return []
        return []

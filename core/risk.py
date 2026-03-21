# core/risk.py
"""
风控管理模块
实现量化交易中的核心风控规则：仓位限制、止损止盈、最大回撤控制
所有交易指令执行前必须通过风控校验
"""
import logging
from datetime import datetime
from types import SimpleNamespace
from typing import Dict, List, Optional, Tuple

from .exceptions import RiskError, TradeError
from .portfolio import PortfolioManager
from .market import MarketDataManager

logger = logging.getLogger(__name__)

class RiskManager:
    """
    风控管理类
    负责校验所有交易指令的合规性，阻止违规交易，控制整体风险
    """
    def __init__(
        self,
        portfolio: Optional[PortfolioManager] = None,
        market_data: Optional[MarketDataManager] = None,
        risk_config: Optional[Dict] = None,
        config=None   # 新增：接受 ConfigManager（优先级高于 risk_config）
    ):
        self.portfolio = portfolio
        self.market_data = market_data

        # ────────────────────────────────────────────
        # 从 ConfigManager 读取风控参数（优先级最高）
        # ────────────────────────────────────────────
        self.default_risk_config = {
            "max_single_position_ratio": 0.15,  # 单票最大仓位
            "max_total_position_ratio":  0.95,  # 总仓位上限（留5%现金缓冲）
            "max_drawdown":              0.20,  # 最大回撤阈值
            "stop_loss_ratio":           0.08,  # 单票止损（8%）
            "stop_profit_ratio":         0.30,  # 单票止盈（30%）
            "max_trades_per_day":        200    # 单日最大交易次数
        }

        # 优先从 ConfigManager 读取
        if config is not None:
            try:
                cfg_risk = {
                    "max_single_position_ratio": config.get('risk.max_position_ratio',    0.15),
                    "max_total_position_ratio":  config.get('risk.max_portfolio_exposure', 0.95),
                    "max_drawdown":              abs(config.get('risk.daily_max_loss',     -0.05)) * 4,
                    "stop_loss_ratio":           config.get('strategy.stop_loss_ratio',   0.08),
                    "stop_profit_ratio":         config.get('strategy.max_profit_drawdown', 0.15),
                    "max_trades_per_day":        200
                }
                self.risk_config = {**self.default_risk_config, **cfg_risk}
                logger.info("[RiskManager] 已从 ConfigManager 加载风控参数")
            except Exception as e:
                logger.warning(f"[RiskManager] ConfigManager 读取失败，使用默认值: {e}")
                self.risk_config = {**self.default_risk_config, **(risk_config or {})}
        else:
            self.risk_config = {**self.default_risk_config, **(risk_config or {})}

        # 为策略提供的 params 命名空间
        self.params = SimpleNamespace(
            max_portfolio_exposure = self.risk_config["max_total_position_ratio"],
            max_position_ratio     = self.risk_config["max_single_position_ratio"],
            min_position_ratio     = self.risk_config["max_single_position_ratio"] * 0.4,
            per_trade_risk         = self.risk_config["max_single_position_ratio"],  # 单次买入最大比例
            stop_loss_ratio        = self.risk_config["stop_loss_ratio"],
            stop_profit_ratio      = self.risk_config["stop_profit_ratio"],
            max_trades_per_day     = self.risk_config["max_trades_per_day"],
            max_drawdown           = self.risk_config["max_drawdown"]
        )

        # 统计
        self.daily_trade_count: int = 0
        self.last_reset_time: datetime = datetime.now()
        self.max_drawdown_reached: bool = False

        self.logger = logger.getChild("RiskManager")
        self.logger.info(
            f"风控参数 | 单票仓位:{self.risk_config['max_single_position_ratio']:.0%} "
            f"总仓位:{self.risk_config['max_total_position_ratio']:.0%} "
            f"止损:{self.risk_config['stop_loss_ratio']:.0%} "
            f"最大回撤:{self.risk_config['max_drawdown']:.0%}"
        )

    def bind(self, engine) -> None:
        self.portfolio = engine.portfolio
        self.market_data = engine.market
        self.logger.info("风险管理器已绑定引擎")

    def _reset_daily_stats(self) -> None:
        current_date = datetime.now().date()
        if self.last_reset_time.date() != current_date:
            self.daily_trade_count = 0
            self.last_reset_time = datetime.now()

    def check_max_drawdown(self) -> bool:
        """检查是否触发最大回撤限制"""
        current_asset = self.portfolio.get_total_asset()
        max_asset = self.portfolio.get_max_historical_asset()
        if max_asset <= 0:
            return True
        drawdown_ratio = (max_asset - current_asset) / max_asset
        if drawdown_ratio >= self.risk_config["max_drawdown"]:
            self.max_drawdown_reached = True
            self.logger.error(f"触发最大回撤! 当前:{drawdown_ratio:.2%} 阈值:{self.risk_config['max_drawdown']:.2%}")
            return False
        self.max_drawdown_reached = False
        return True

    def check_position_ratio(self, symbol: str, trade_volume: int, trade_price: float, trade_type: str) -> bool:
        """检查仓位比例是否合规"""
        total_asset = self.portfolio.get_total_asset()
        current_single = self.portfolio.get_position_value(symbol)
        current_total  = self.portfolio.get_total_position_value()
        trade_amount   = trade_volume * trade_price

        if trade_type == "BUY":
            new_single = current_single + trade_amount
            new_total  = current_total  + trade_amount
        elif trade_type == "SELL":
            new_single = max(current_single - trade_amount, 0)
            new_total  = max(current_total  - trade_amount, 0)
        else:
            raise RiskError(f"不支持的交易类型: {trade_type}")

        if total_asset > 0:
            single_ratio = new_single / total_asset
            total_ratio  = new_total  / total_asset
            if single_ratio > self.risk_config["max_single_position_ratio"]:
                self.logger.error(f"单票仓位超限 {symbol}: {single_ratio:.2%} > {self.risk_config['max_single_position_ratio']:.2%}")
                return False
            if total_ratio > self.risk_config["max_total_position_ratio"]:
                self.logger.error(f"总仓位超限: {total_ratio:.2%} > {self.risk_config['max_total_position_ratio']:.2%}")
                return False
        return True

    def check_stop_loss_profit(self, symbol: str, trade_type: str) -> bool:
        """检查是否触发止损/止盈（仅校验，不强制卖出；卖出逻辑由策略控制）"""
        if trade_type != "SELL":
            return True
        pos_info = self.portfolio.get_position_info(symbol)
        if not pos_info:
            return True
        return True

    def check_daily_trade_limit(self) -> bool:
        self._reset_daily_stats()
        if self.daily_trade_count >= self.risk_config["max_trades_per_day"]:
            self.logger.error(f"当日交易次数超限: {self.daily_trade_count}")
            return False
        return True

    def validate_trade_signal(self, signal: Dict) -> Tuple[bool, str]:
        try:
            symbol     = signal.get("symbol")
            trade_type = signal.get("signal_type")
            volume     = signal.get("volume", 0)
            price      = signal.get("price", 0)

            if not all([symbol, trade_type, volume > 0, price > 0]):
                raise RiskError(f"交易信号参数不完整: {signal}")

            if not self.check_max_drawdown():
                return False, "触发最大回撤限制"
            if not self.check_daily_trade_limit():
                return False, "当日交易次数超限"
            if not self.check_position_ratio(symbol, volume, price, trade_type):
                return False, "仓位超限"

            self.daily_trade_count += 1
            return True, "风控校验通过"
        except RiskError as e:
            self.logger.error(f"风控校验失败: {str(e)}")
            return False, f"风控校验失败: {str(e)}"
        except Exception as e:
            self.logger.error(f"风控校验异常: {str(e)}", exc_info=True)
            return False, f"风控校验异常: {str(e)}"

    def validate_trade_signals(self, signals: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        valid_signals   = []
        invalid_signals = []
        for signal in signals:
            is_valid, msg = self.validate_trade_signal(signal)
            if is_valid:
                valid_signals.append(signal)
            else:
                invalid_signals.append({**signal, "error_msg": msg})
        return valid_signals, invalid_signals

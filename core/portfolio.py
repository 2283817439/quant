import os
import json
import gzip
import pandas as pd
from datetime import datetime, date
from typing import Dict, Callable, Optional
from config.config import ConfigManager
from core.models import Order, OrderType, OrderDirection, Position
from utils.logger import sys_logger

logger = sys_logger.getChild('Portfolio')

class PortfolioManager:
    """持仓管理器"""
    SNAPSHOT_VERSION = "0.3"
    SNAPSHOT_PREFIX = "portfolio_snapshot"

    def __init__(self, config: ConfigManager):
        self.config = config
        self.logger = logger

        self._snapshot_file_path = self.config.get('snapshot.file_path')

        self.available_cash = self.config.get('account.available_cash')
        self.total_cash = self.available_cash

        # 记录历史最高总资产（用于最大回撤计算）
        self._peak_equity: float = self.available_cash

        self._positions: Dict[str, Position] = {}
        self._orders: Dict[str, Order] = {}

        self.commission_rate = self.config.get('account.commission_rate')
        self.stamp_duty_rate = self.config.get('account.stamp_duty_rate')
        self.slippage_rate = self.config.get('account.slippage_rate')
        self.minimum_commission_fee = self.config.get('account.minimum_commission_fee')

    def bind(self, engine):
        self.engine = engine
        self.risk = self.engine.risk

    @property
    def symbols(self):
        return sorted(list(self._positions.keys()))

    @property
    def positions(self):
        return self._positions

    def get_position(self, symbol) -> Optional[Position]:
        return self._positions.get(symbol)

    # ────────────────────────────────────────────────
    # 新增：RiskManager 所需的资产查询接口（原来缺失导致 AttributeError）
    # ────────────────────────────────────────────────
    def get_total_asset(self) -> float:
        """获取当前总资产"""
        return self.total_equity

    def get_max_historical_asset(self) -> float:
        """获取历史最高总资产（用于回撤计算）"""
        current = self.total_equity
        if current > self._peak_equity:
            self._peak_equity = current
        return self._peak_equity

    def get_position_value(self, symbol: str) -> float:
        """获取单票持仓市值"""
        pos = self._positions.get(symbol)
        return pos.market_value if pos else 0.0

    def get_total_position_value(self) -> float:
        """获取总持仓市值"""
        return self.total_market_value

    def get_position_info(self, symbol: str) -> Optional[dict]:
        """获取持仓信息（供 RiskManager 使用）"""
        pos = self._positions.get(symbol)
        if not pos:
            return None
        return {
            "cost_price": pos.avg_price,
            "cur_price":  pos.cur_price,
            "volume":     pos.total_volume,
        }

    # ────────────────────────────────────────────────
    # 资金管理
    # ────────────────────────────────────────────────
    def update_available_cash(self, available_cash: float) -> None:
        self.logger.info(f'可用现金更新: {self.available_cash:,.3f} -> {available_cash:,.3f}')
        self.available_cash = available_cash
        self.total_cash = available_cash

    def overwrite_positions(self, positions: Dict[str, Position] = None) -> None:
        if not positions:
            self.logger.info("无持仓数据输入, 清空本地持仓")
            self._positions.clear()
            return
        self._positions = positions.copy()
        self.display_positions()

    def add_positions(self, positions: Dict[str, Position]) -> None:
        if not positions:
            return
        for _id in positions:
            self._positions[_id] = positions[_id]
        self.display_positions()

    def display_equity(self) -> None:
        dict_cash = {
            '总资产':   self.total_equity,
            '总资金':   self.total_cash,
            '持仓市值': self.total_market_value,
            '可用资金': self.available_cash,
            '冻结资金': self.total_cash - self.available_cash
        }
        df_cash = pd.DataFrame(dict_cash, index=[0])
        self.logger.info(f'当前本地资金:\n{df_cash}')

    def display_positions(self) -> None:
        list_positions = []
        for symbol in self._positions:
            position = self._positions[symbol]
            dict_position = {
                '证券代码': position.symbol,
                '持仓数量': position.total_volume,
                '可用数量': position.available_volume,
                '成本价':   position.avg_price,
                '当前价格': position.cur_price,
                '当前市值': position.market_value,
                '浮动盈亏': position.float_pnl,
                '买入时间': position.entry_date,
            }
            list_positions.append(dict_position)
        df_positions = pd.DataFrame(list_positions)
        self.logger.info(f"当前本地持仓:\n{df_positions}")

    # ────────────────────────────────────────────────
    # 订单冻结/解冻
    # ────────────────────────────────────────────────
    def _calc_fee(self, direction: OrderDirection, price: float, volume: int) -> float:
        trade_amount = price * volume
        commission = trade_amount * self.commission_rate
        stamp_duty = trade_amount * self.stamp_duty_rate if direction == OrderDirection.SELL else 0.0
        return round(max(commission, self.minimum_commission_fee) + stamp_duty, 2)

    def freeze_order_locked_asset(self, order: Order) -> None:
        self.logger.debug("执行冻结订单锁定资产")
        try:
            if order.direction == OrderDirection.BUY:
                fee = self._calc_fee(order.direction, order.price, order.volume)
                total_cost = order.price * order.volume + fee
                old = self.available_cash
                self.available_cash -= total_cost
                self.logger.info("冻结资金 | %s %s %d@%.3f | %.3f -> %.3f",
                                 order.symbol, order.direction.value, order.volume, order.price,
                                 old, self.available_cash)
            else:
                position = self._positions[order.symbol]
                old = position.available_volume
                position.available_volume -= order.volume
                self.logger.info("冻结持仓 | %s %s %d | %d -> %d",
                                 order.symbol, order.direction.value, order.volume,
                                 old, position.available_volume)
            self._orders[order.id] = order.copy()
        except Exception:
            self.logger.error("冻结订单资产异常", exc_info=True)
            raise ValueError("冻结订单资产异常")

    def unfreeze_order_locked_asset(self, order: Order) -> None:
        self.logger.debug("执行解冻订单锁定资产")
        try:
            if order.direction == OrderDirection.BUY:
                fee = self._calc_fee(order.direction, order.price, order.volume)
                total_cost = order.price * order.volume + fee
                old = self.available_cash
                self.available_cash += total_cost
                self.logger.info("解冻资金 | %s %s %d@%.3f | %.3f -> %.3f",
                                 order.symbol, order.direction.value, order.volume, order.price,
                                 old, self.available_cash)
            else:
                if self._positions.get(order.symbol):
                    position = self._positions[order.symbol]
                    old = position.available_volume
                    position.available_volume += order.volume
                    self.logger.info("解冻持仓 | %s %d | %d -> %d",
                                     order.symbol, order.volume, old, position.available_volume)
            if self._orders.get(order.id):
                del self._orders[order.id]
        except Exception:
            self.logger.error("解冻订单锁定资产异常", exc_info=True)
            raise ValueError("解冻订单锁定资产异常")

    def unfreeze_all(self) -> None:
        self.logger.info("解冻所有冻结资金和持仓")
        self._orders.clear()
        self.available_cash = self.total_cash
        for symbol in self._positions:
            position = self._positions[symbol]
            position.available_volume = position.total_volume

    # ────────────────────────────────────────────────
    # 交易执行
    # ────────────────────────────────────────────────
    def check_trade(self, order: Order) -> bool:
        fee = self._calc_fee(order.direction, order.price, order.volume)
        total_cost = order.price * order.volume + fee

        if order.direction == OrderDirection.BUY:
            if self.available_cash < total_cost:
                self.logger.warning(f"资金不足 {order.symbol} {order.volume}股@{order.price} 需{total_cost:,.3f} 可用{self.available_cash:,.3f}")
                return False
            return True
        else:
            if order.symbol not in self._positions:
                self.logger.warning(f"尝试卖出未持仓标的 {order.symbol}")
                return False
            position = self._positions[order.symbol]
            if position.available_volume < order.volume:
                self.logger.warning(f"可用持仓不足 {order.symbol} 可用:{position.available_volume} 卖出:{order.volume}")
                return False
            return True

    def apply_trade(self, order: Order) -> None:
        fee = self._calc_fee(order.direction, order.filled_price, order.filled_volume)

        if order.direction == OrderDirection.BUY:
            self._handle_buy(order.symbol, order.filled_volume, order.filled_price, fee)
        else:
            self._handle_sell(order.symbol, order.filled_volume, order.filled_price, fee)

        self.logger.info(
            f"持仓更新 | {order.direction.value} {order.symbol} {order.filled_volume}股 "
            f"@ {order.filled_price:.3f} 手续费:{fee:.3f} 可用现金:{self.available_cash:,.3f}"
        )
        self.display_equity()
        self.display_positions()

    def _handle_buy(self, symbol: str, volume: int, price: float, fee: float) -> None:
        total_cost = price * volume + fee
        self.available_cash -= total_cost
        self.total_cash -= total_cost

        if symbol not in self._positions:
            self._positions[symbol] = Position(symbol)

        position = self._positions[symbol]
        position.update_position(volume, 0, price)   # ← 修正拼写（原为 update_positon）
        position.entry_date = self.engine.current_date

        # 更新历史最高资产
        if self.total_equity > self._peak_equity:
            self._peak_equity = self.total_equity

    def _handle_sell(self, symbol: str, volume: int, price: float, fee: float) -> None:
        position = self._positions[symbol]
        net_proceeds = price * volume - fee
        self.available_cash += net_proceeds
        self.total_cash += net_proceeds
        position.update_position(-volume, -volume, price)   # ← 修正拼写

        if position.total_volume <= 0:
            del self._positions[symbol]

    # ────────────────────────────────────────────────
    # 市值更新
    # ────────────────────────────────────────────────
    def update_market_value(self, date: date, price_getter: Callable[[str], float]) -> None:
        for symbol, pos in self._positions.items():
            latest_price = price_getter(symbol)
            if latest_price > 0:
                pos.update_price(date, latest_price)
        # 更新历史最高总资产
        if self.total_equity > self._peak_equity:
            self._peak_equity = self.total_equity

    @property
    def total_equity(self) -> float:
        return self.total_cash + self.total_market_value

    @property
    def total_market_value(self) -> float:
        return sum(pos.market_value for pos in self._positions.values())

    def reset(self) -> None:
        self.available_cash = 0
        self._positions.clear()
        self.logger.info("持仓管理器已重置")

    def rebalance_portfolio_exposure(self) -> None:
        """持仓组合风险敞口再平衡"""
        try:
            current_mv = self.total_market_value
            equity = self.total_equity
            target = self.risk.risk_config.get('max_total_position_ratio', 0.95)

            if equity <= 0:
                return

            current_ratio = current_mv / equity
            if current_ratio <= target:
                self.logger.info(f"风险敞口 {current_ratio:.2%} ≤ 目标 {target:.2%}，无需调整")
                return

            target_mv = target * equity
            excess_mv = current_mv - target_mv
            self.logger.info(f"风险敞口再平衡 | 当前 {current_ratio:.2%} → 目标 {target:.2%} | 需减少 ¥{excess_mv:,.2f}")

            positions = sorted(self._positions.values(), key=lambda x: x.market_value, reverse=True)
            total_mv = current_mv
            remaining_excess = excess_mv
            orders_created = 0

            for pos in positions:
                if remaining_excess <= 0:
                    break
                allocation_ratio = pos.market_value / total_mv
                target_sell_mv = excess_mv * allocation_ratio
                target_volume = int(round(target_sell_mv / (pos.cur_price * 100) + 0.5)) * 100
                actual_volume = min(target_volume, pos.available_volume)
                actual_volume = max(actual_volume, 0)

                if actual_volume < 100:
                    continue

                order = Order(
                    symbol=pos.symbol,
                    direction=OrderDirection.SELL,
                    price=pos.cur_price,
                    volume=actual_volume,
                    type=OrderType.MARKET
                )
                # 修复：add_order 返回 None，不能用 if 判断；直接调用
                self.engine.add_order(order)
                orders_created += 1
                remaining_excess -= actual_volume * pos.cur_price

            if orders_created > 0:
                self.engine.place_orders()
                self.engine.wait_orders_completion()
                self.logger.info(f"风险敞口已平衡 | 共生成 {orders_created} 个卖单")

        except Exception as e:
            self.logger.error(f"风险敞口再平衡失败: {str(e)}", exc_info=True)

    # ────────────────────────────────────────────────
    # 快照管理
    # ────────────────────────────────────────────────
    def save_snapshot(self, tag: str = None) -> str:
        try:
            os.makedirs(self._snapshot_file_path, exist_ok=True)
            snapshot_data = {
                "version": self.SNAPSHOT_VERSION,
                "timestamp": datetime.now().isoformat(),
                "available_cash": self.available_cash,
                "total_cash": self.total_cash,
                "peak_equity": self._peak_equity,
                "positions": {
                    symbol: {
                        "total_volume": pos.total_volume,
                        "available_volume": pos.available_volume,
                        "avg_price": pos.avg_price,
                        "cur_price": pos.cur_price,
                        "highest_price": pos.highest_price,
                        "highest_date": pos.highest_date.strftime("%Y-%m-%d") if pos.highest_date else "",
                        "market_value": round(pos.market_value, 2),
                        "float_pnl": pos.float_pnl,
                        "entry_date": pos.entry_date.strftime("%Y-%m-%d") if pos.entry_date else ""
                    }
                    for symbol, pos in self._positions.items()
                }
            }
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{self.SNAPSHOT_PREFIX}_{timestamp}"
            if tag:
                filename += f"_{tag}"
            filepath = os.path.join(self._snapshot_file_path, f"{filename}.json.gz")
            with gzip.open(filepath, 'wt', encoding='utf-8') as f:
                json.dump(snapshot_data, f, ensure_ascii=False, indent=4)
            self.logger.info(f"快照已保存至 {filepath}")
            return filepath
        except Exception as e:
            self.logger.error(f"快照保存失败: {str(e)}", exc_info=True)
            raise RuntimeError(f"无法保存快照: {str(e)}")

    def load_snapshot(self, filepath: str = None, latest: bool = True) -> None:
        try:
            if not filepath and latest:
                filepath = self._find_latest_snapshot()
            if not filepath or not os.path.exists(filepath):
                self.logger.warning(f"快照文件不存在: {filepath}")
                return
            with gzip.open(filepath, 'r') as f:
                snapshot_data = json.load(f)

            if snapshot_data.get("version") != self.SNAPSHOT_VERSION:
                self.logger.error(f"快照版本不匹配: {snapshot_data.get('version')} vs {self.SNAPSHOT_VERSION}")

            self.available_cash = snapshot_data["available_cash"]
            self.total_cash = snapshot_data["total_cash"]
            self._peak_equity = snapshot_data.get("peak_equity", self.total_cash)
            self._positions.clear()

            for symbol, pos_data in snapshot_data["positions"].items():
                position = Position(symbol)
                position.total_volume     = pos_data["total_volume"]
                position.available_volume = pos_data["available_volume"]
                position.avg_price        = pos_data["avg_price"]
                position.cur_price        = pos_data["cur_price"]
                position.highest_price    = pos_data.get("highest_price", 0.0)
                position.market_value     = pos_data["market_value"]
                position.float_pnl        = pos_data["float_pnl"]
                hd = pos_data.get("highest_date", "")
                position.highest_date = datetime.strptime(hd, "%Y-%m-%d").date() if hd else None
                ed = pos_data.get("entry_date", "")
                position.entry_date = datetime.strptime(ed, "%Y-%m-%d").date() if ed else None
                self._positions[symbol] = position

            self.logger.info(f"快照加载成功: {filepath}")
            self.display_equity()
            self.display_positions()
        except Exception as e:
            self.logger.error(f"快照加载失败: {str(e)}", exc_info=True)
            raise RuntimeError(f"无法加载快照: {str(e)}")

    def _find_latest_snapshot(self) -> str:
        try:
            files = [
                os.path.join(self._snapshot_file_path, f)
                for f in os.listdir(self._snapshot_file_path)
                if f.startswith(self.SNAPSHOT_PREFIX) and f.endswith(".json.gz")
            ]
            if not files:
                return ""
            return max(files, key=os.path.getctime)
        except Exception as e:
            self.logger.error(f"查找最新快照失败: {str(e)}")
            return ""

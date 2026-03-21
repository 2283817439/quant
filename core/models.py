"""
数据模型定义：包含订单、持仓等核心数据结构
"""
import random
from datetime import datetime, date
from enum import Enum
from copy import copy
from utils.logger import sys_logger

logger = sys_logger.getChild('Model')

class OrderStatus(Enum):
    """订单状态枚举"""
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIAL_FILLED = "PARTIAL_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    UNKNOWN = "UNKNOWN"

class OrderDirection(Enum):
    """订单方向枚举"""
    BUY = "BUY"
    SELL = "SELL"

class OrderType(Enum):
    """订单报价类型"""
    FIX = 'FIX'
    MARKET = 'MARKET'

class Order:
    """订单数据模型"""

    def __init__(self, symbol: str, direction: OrderDirection, price: float, volume: int, type: OrderType = OrderType.FIX):
        if not symbol.endswith(('.SH', '.SZ')):
            logger.warning(f"非标准证券代码格式: {symbol}")
        if price < 0:
            raise ValueError("委托价格必须大于0")
        if volume % 100 != 0:
            raise ValueError("委托数量必须为整手数（100的倍数）")

        self.id = self._generate_id()
        self.order_id = 0
        self.symbol = symbol
        self.direction = direction
        self.price = price
        self.type = type
        self.volume = volume
        self.filled_volume = 0
        self.filled_price = 0
        self.status = OrderStatus.PENDING
        self.create_time = datetime.now()
        self.update_time = self.create_time

        logger.debug(f"创建订单类实例 {self.order_id} {self.symbol} {direction.value} {volume}股 @ {price:.2f}")

    def _generate_id(self) -> str:
        return datetime.now().strftime('%Y%m%d%H%M%S') + str(random.randint(100, 999))

    def set_id(self, id: int) -> None:
        self.id = id

    def set_order_id(self, order_id: int) -> None:
        self.order_id = order_id

    def copy(self):
        return copy(self)

    def update_status(self, new_status: OrderStatus, filled_volume: int = 0, filled_price: float = 0) -> None:
        if self.status in [OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED]:
            error_msg = f"禁止更新终态订单 {self.order_id} 当前状态:{self.status}"
            logger.error(error_msg)
            raise ValueError(error_msg)

        if filled_volume < 0 or filled_volume > self.volume:
            error_msg = f"无效成交数量 {filled_volume}，范围应为0-{self.volume}"
            logger.error(error_msg)
            raise ValueError(error_msg)

        if filled_price < 0:
            error_msg = f"无效成交价格 {filled_price}, 必须大于0"
            logger.error(error_msg)
            raise ValueError(error_msg)

        log_msg = (f"订单状态更新 {self.order_id}: {self.status.name} -> {new_status.name} "
                   f"成交: {self.filled_volume} -> {filled_volume}, 均价 {filled_price}")
        logger.debug(log_msg)

        self.status = new_status
        if new_status == OrderStatus.FILLED:
            self.filled_volume = filled_volume
            self.filled_price = filled_price
        self.update_time = datetime.now()

class Position:
    """持仓数据模型"""

    def __init__(self, symbol: str, volume: int = 0, price: float = 0):
        self.symbol = symbol
        self.total_volume = volume
        self.available_volume = volume
        self.avg_price = 0.0
        self.highest_price = 0.0
        self.highest_date = None
        self.cur_price = 0.0
        self.market_value = 0.0
        self.float_pnl = 0.0
        self.entry_date = None

    def update_position(self, volume, available_volume, price: float = 0):
        """更新持仓数量和均价"""
        self.available_volume += available_volume

        if self.avg_price == 0:
            self.avg_price = price

        if volume != 0:
            new_volume = self.total_volume + volume
            if new_volume != 0:
                new_avg_price = (self.avg_price * self.total_volume + price * volume) / new_volume
            else:
                new_avg_price = 0
            self.total_volume = new_volume
            self.avg_price = new_avg_price

        self.cur_price = price
        self.market_value = self.total_volume * price
        self.float_pnl = self.market_value - (self.total_volume * self.avg_price)

    def update_price(self, date: date, price: float) -> None:
        """根据最新价格更新市值和盈亏"""
        if price > 0 and price > self.highest_price:
            self.highest_price = price
            self.highest_date = date

        self.cur_price = price
        self.market_value = self.total_volume * price
        self.float_pnl = self.market_value - (self.total_volume * self.avg_price)

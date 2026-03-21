"""
Strategy Submission
===================
Name: Small Cap Rotation Strategy
Submitted At: 2026-03-15T23:13:00.493Z
Status: Pending Review
"""

"""
Small Cap Rotation Strategy - v2.0.0
Factor-driven small cap rotation with risk control constraints.

指数跟踪：399001.SZ
调仓频率：{
  daily: "日频",
  weekly: "周频",
  monthly: "月频",
}[strategy.frequency]
目标持仓数：10 只
回测区间：20240701 至 20241231
"""

from typing import List, Dict
import pandas as pd
from datetime import datetime, date


class Strategy:
    """
    Small Cap Rotation Strategy
    
    策略逻辑说明:
    1. 基于多因子选股模型
    2. 使用均线趋势过滤
    3. 动态风控机制
    """
    
    def __init__(self, context):
        self.context = context
        self.short_window = 60
        self.long_window = 180
        self.volatility_window = 30
        
    def initialize(self):
        """初始化策略"""
        self.log(f"策略启动 | 初始资金：￥{strategy.account.initial_capital:,}")
        
    def on_data(self, data: pd.DataFrame):
        """
        处理行情数据
        
        :param data: 包含 OHLCV 的 DataFrame
        """
        # TODO: 实现您的策略逻辑
        pass
        
    def generate_signals(self) -> List[str]:
        """
        生成交易信号
        
        :return: 标的代码列表
        """
        # TODO: 实现信号生成逻辑
        return []
        
    def on_rebalance(self):
        """调仓日操作"""
        symbols = self.generate_signals()
        self.log(f"生成本轮换仓信号 | 标的数：{len(symbols)}")
        
    def log(self, message: str):
        """记录日志"""
        print(f"[{datetime.now()}] {message}")

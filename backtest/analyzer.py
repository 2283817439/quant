import pandas as pd
import numpy as np
from typing import Dict
from config.config import ConfigManager
from utils.logger import sys_logger

logger = sys_logger.getChild('Analyzer')

class PerformanceAnalyzer:
    """回测绩效分析模块"""

    def __init__(self, config: ConfigManager):

        self.engine = None
        self._config = config

        self.initial_capital = self._config.get('backtest.initial_capital')  # 可用现金

    def bind(self, engine):
        self.engine = engine

    def gen_df_equity(self, windows=0):
        """生成df_equity"""
        df_equity = self.engine.df_equity.reset_index(drop=True).copy()
        df_equity = df_equity.rename(columns={'日期': 'date', '总资产': 'equity'})
        df_equity = df_equity[['date', 'equity']].copy()
        df_equity = df_equity.set_index('date')
        df_equity.index = pd.to_datetime(df_equity.index)

        if windows == 0:    
            return df_equity
        else:
            df_equity = df_equity.tail(windows)

        return df_equity

    def analyze(self, windows=0) -> Dict:
        """生成完整绩效报告"""
        df_equity = self.gen_df_equity(windows)

        self.returns = self._calculate_returns(df_equity)

        self.total_return   = round(self._total_return(df_equity), 3)
        self.annual_return  = round(self._annual_return(df_equity), 3)
        self.max_drawdown   = round(self._max_drawdown(df_equity), 3)
        self.sharpe_ratio   = round(self._sharpe_ratio(), 3)
        self.trade_count    = self.engine.total_orders_count

        stats = {
            'date': df_equity.index[-1].date(),       
            'total_return':  self.total_return,
            'annual_return': self.annual_return,
            'max_drawdown':  self.max_drawdown,
            'sharpe_ratio':  self.sharpe_ratio,
            'trade_count':   self.trade_count
        }

        for k, v in stats.items():
            logger.info("Performance metric | %-15s = %s", k, v)

        return stats

    def _calculate_returns(self, df_equity) -> pd.Series:
        """计算日收益率"""
        df_equity['daily_return'] = df_equity['equity'].pct_change()
        return df_equity['daily_return'].dropna()

    def _total_return(self, df_equity) -> float:
        """累计收益率"""
        return (df_equity['equity'].iloc[-1] / df_equity['equity'].iloc[0]) - 1

    def _annual_return(self, df_equity) -> float:
        """年化收益率"""
        days = (df_equity.index[-1] - df_equity.index[0]).days
        if not (days == 0) :
            return (1 + self.total_return) ** (365 / days) - 1
        else:
            return np.nan

    def _max_drawdown(self, df_equity) -> float:
        """最大回撤"""
        peak = df_equity['equity'].cummax()
        drawdown = (df_equity['equity'] - peak) / peak
        return drawdown.min()

    def _sharpe_ratio(self, risk_free_rate=0.03) -> float:
        """夏普比率（假设年化无风险收益率3%）"""
        excess_ret = self.returns - risk_free_rate / 252
        if excess_ret.std(ddof=1) == 0:
            return np.nan
        return np.sqrt(252) * excess_ret.mean() / excess_ret.std(ddof=1)

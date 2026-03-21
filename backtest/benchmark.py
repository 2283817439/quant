"""
基准对比计算器
计算策略相对于基准指数（如沪深300）的 alpha、beta、超额收益等指标
"""
import numpy as np
import pandas as pd
from typing import Dict, Optional
from utils.logger import sys_logger

logger = sys_logger.getChild('Benchmark')


class BenchmarkCalculator:
    """基准对比分析器，绑定到 BackTestEngine 后使用"""

    def __init__(self):
        self.engine = None

    def bind(self, engine) -> None:
        self.engine = engine

    def get_benchmark_returns(self, symbol: str) -> Optional[pd.Series]:
        """
        从引擎历史数据缓存中获取基准品种日收益率序列
        :param symbol: 基准品种代码，如 '000300.SH'
        :return: 日收益率 Series，index 为 date
        """
        try:
            if symbol not in self.engine._history_data:
                logger.warning(f"基准 {symbol} 无历史数据，跳过基准对比")
                return None

            df = self.engine._history_data[symbol]
            if df.empty or 'close' not in df.columns:
                return None

            close = df['close'].copy()
            close.index = pd.to_datetime(close.index).normalize()
            returns = close.pct_change().dropna()
            return returns

        except Exception as e:
            logger.error(f"获取基准收益率异常: {e}", exc_info=True)
            return None

    def compare(self, strategy_equity: pd.Series, benchmark_symbol: str,
                risk_free_rate: float = 0.03) -> Dict:
        """
        对比策略权益与基准，计算 alpha / beta / 信息比率 / 跟踪误差

        :param strategy_equity: 策略每日总权益 Series（index 为 date）
        :param benchmark_symbol: 基准品种代码
        :param risk_free_rate: 年化无风险利率
        :return: 指标 dict
        """
        result: Dict = {
            'benchmark_symbol':  benchmark_symbol,
            'benchmark_return':  None,
            'alpha':             None,
            'beta':              None,
            'information_ratio': None,
            'tracking_error':    None,
        }

        try:
            bm_returns = self.get_benchmark_returns(benchmark_symbol)
            if bm_returns is None or bm_returns.empty:
                return result

            # 策略日收益率
            strategy_equity = strategy_equity.copy()
            strategy_equity.index = pd.to_datetime(strategy_equity.index).normalize()
            strategy_returns = strategy_equity.pct_change().dropna()

            # 对齐时间轴
            common_idx = strategy_returns.index.intersection(bm_returns.index)
            if len(common_idx) < 5:
                logger.warning("策略与基准共同交易日不足 5 天，跳过对比计算")
                return result

            s_ret = strategy_returns.loc[common_idx]
            b_ret = bm_returns.loc[common_idx]

            # 基准累计收益
            bm_total_return = float((1 + b_ret).prod() - 1)

            # Beta = Cov(strategy, benchmark) / Var(benchmark)
            cov_matrix = np.cov(s_ret.values, b_ret.values)
            var_bm = cov_matrix[1, 1]
            beta = float(cov_matrix[0, 1] / var_bm) if var_bm > 1e-10 else 0.0

            # Alpha = 年化策略收益 - 无风险 - Beta × (年化基准收益 - 无风险)
            n_days = len(common_idx)
            annual_factor = 252 / n_days
            strategy_total = float((1 + s_ret).prod() - 1)
            annual_strategy = (1 + strategy_total) ** annual_factor - 1
            annual_bm = (1 + bm_total_return) ** annual_factor - 1
            alpha = annual_strategy - risk_free_rate - beta * (annual_bm - risk_free_rate)

            # 超额收益日序列
            excess = s_ret.values - b_ret.values
            tracking_error = float(np.std(excess, ddof=1) * np.sqrt(252))
            information_ratio = (float(np.mean(excess)) * 252 / tracking_error
                                 if tracking_error > 1e-10 else 0.0)

            result.update({
                'benchmark_return':  round(bm_total_return, 6),
                'alpha':             round(alpha, 6),
                'beta':              round(beta, 6),
                'information_ratio': round(information_ratio, 4),
                'tracking_error':    round(tracking_error, 6),
            })

            logger.info(
                "基准对比 | %s | 基准收益:%.2f%% alpha:%.4f beta:%.4f IR:%.4f TE:%.4f",
                benchmark_symbol,
                bm_total_return * 100,
                alpha, beta, information_ratio, tracking_error
            )

        except Exception as e:
            logger.error(f"基准对比计算异常: {e}", exc_info=True)

        return result

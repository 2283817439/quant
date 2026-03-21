import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import seaborn as sns

class BacktestVisualizer:
    """回测结果可视化"""
    def __init__(self):
        """初始化可视化器"""
        self.engine = None
        self.df_equity = None
        self.df_orders = None

    def bind(self, engine):
        self.engine = engine

    def plot(self) -> None:
        self.df_equity = self.engine.df_equity.copy()

        self.df_equity = self.df_equity.reset_index(drop=True)
        self.df_equity = self.df_equity.rename(columns={'日期': 'date', '总资产': 'equity', '持仓市值': 'market'})

        # 转换基准列名（中文基准_ -> 英文benchmark_）
        self.df_equity = self.df_equity.rename(columns={
            col: col.replace('基准_', 'benchmark_') 
            for col in self.df_equity.columns if col.startswith('基准_')
        })

        self.df_equity = self.df_equity.set_index('date')
        self.df_equity.index = pd.to_datetime(self.df_equity.index)

        # 获取所有基准列
        benchmark_cols = [c for c in self.df_equity.columns if c.startswith('benchmark_')]

        # 归一化基准曲线（与策略初始值对齐）
        if not self.df_equity.empty and 'equity' in self.df_equity.columns:
            initial_equity = self.df_equity['equity'].iloc[0]
            for col in benchmark_cols:
                if self.df_equity[col].iloc[0] != 0:
                    scale_factor = initial_equity / self.df_equity[col].iloc[0]
                    self.df_equity[col] = self.df_equity[col] * scale_factor

        self.df_orders = self.engine.df_orders
        if self.df_orders is not None and not self.df_orders.empty and '日期' in self.df_orders.columns:
            self.df_orders = self.df_orders.reset_index(drop=True)
            self.df_orders = self.df_orders.set_index('日期')
            self.df_orders.index = pd.to_datetime(self.df_orders.index)
        else:
            # 如果没有订单数据，创建空 DataFrame
            self.df_orders = pd.DataFrame()        

        self.plot_equity_vs_benchmark()

    def plot_equity_vs_benchmark(self, title='Equity VS Benchmark') -> None:
        """绘制资金曲线（优化版）"""
        # 创建 Figure 和 Axes
        fig, ax = plt.subplots(figsize=(26, 12))

        # 绘制策略曲线
        self.df_equity[['equity', 'market']].plot(
            ax=ax,
            linewidth=3,
            color='#1f77b4',
            label='Equity'
        )

        # 绘制所有基准曲线
        benchmark_cols = [c for c in self.df_equity.columns if c.startswith('benchmark_')]
        colors = plt.cm.tab10.colors  # 使用标准颜色循环

        for idx, col in enumerate(benchmark_cols):
            # 提取股票代码作为图例标签（示例：benchmark_000001 -> 000001.SH）
            symbol = col.replace('benchmark_', '')

            self.df_equity[col].plot(
                ax=ax,
                linewidth=1.5,
                linestyle='--',
                color=colors[(idx+1) % len(colors)],  # 跳过策略使用的第一个颜色
                label=symbol
            )  

        # 添加统计表格
        stats_table_data = [
            ['Total Return', f"{self.engine.analyzer.total_return:.2%}"],
            ['Annual Return', f"{self.engine.analyzer.annual_return:.2%}"],
            ['Max Drawdown', f"{self.engine.analyzer.max_drawdown:.2%}"],
            ['Sharpe Ratio', f"{self.engine.analyzer.sharpe_ratio:.2f}"],
            ['Trade Count', self.engine.analyzer.trade_count]
        ]

        table = ax.table(
            cellText=stats_table_data,
            loc='upper left', 
            colWidths=[0.2, 0.15],
            cellLoc='left',        # 左对齐文本
            bbox=[0.01, 0.73, 0.25, 0.25]  # 精确控制位置, 左下角坐标 (百分比): [x, y, width, height] 
        )

        table.set_fontsize(20)
        table.auto_set_column_width([0, 1])  # 自动调整列宽

        # 设置标题和标签
        ax.set_title(
            f'{title}\n{self.engine.parameters}',
            fontsize=20,
            pad=10  # 标题与图表间距
        )
        ax.set_ylabel('Equity', fontsize=24)
        ax.set_xlabel('Date', fontsize=24)

        df = self.df_equity
        df_orders = self.df_orders

        # 绘制买入标记（检查 df_orders 是否有数据和 '方向' 列）
        if not df_orders.empty and '方向' in df_orders.columns and not df_orders[df_orders['方向'] == 'BUY'].empty:
            # 获取有效买入信号
            buy_signals = df_orders[df_orders['方向'] == 'BUY'].copy()
            # 对齐索引
            valid_dates = buy_signals.index.intersection(df.index)
            equity_values = df.loc[valid_dates, 'equity']

            ax.scatter(valid_dates,
                       equity_values,
                       s=400,
                       marker='^',  # 三角形标记买入
                       color='#2ca02c',  # 绿色
                       edgecolors='darkgreen',
                       linewidths=1.5,
                       alpha=0.5,
                       zorder=3,  # 确保标记在前景
                       label='Buy')

        # 绘制卖出标记（检查 df_orders 是否有数据和 '方向' 列）
        if not df_orders.empty and '方向' in df_orders.columns and not df_orders[df_orders['方向'] == 'SELL'].empty:
            # 获取有效卖出信号
            sell_signals = df_orders[df_orders['方向'] == 'SELL'].copy()
            # 对齐索引
            valid_dates = sell_signals.index.intersection(df.index)
            equity_values = df.loc[valid_dates, 'equity']

            ax.scatter(valid_dates,
                       equity_values,
                       s=400,
                       marker='v',  # 倒三角形标记卖出
                       color='#d62728',  # 红色
                       edgecolors='darkred',
                       linewidths=1.5,
                       alpha=0.5,
                       zorder=3,
                       label='Sell')

        # 优化图例和网格
        ax.legend(
            loc='upper right',
            fontsize=20,
            frameon=True,
            shadow=False,
            facecolor='white',
            framealpha=0.7
        )

        ax.grid(True, linestyle='--', alpha=0.6)

        # 设置 y 轴从 0 开始
        #ax.set_ylim(bottom=0)

        # 新增y轴格式化设置（关键修改）
        ax.yaxis.set_major_formatter(
            ticker.FuncFormatter(lambda x, pos: f'{x:,.0f}')
        )

        # ============= 新增：坐标轴刻度优化 =============
        # 设置刻度标签字体
        ax.tick_params(axis='both', 
                      labelsize=20,    # 主刻度字体大小
                      length=8,        # 刻度线长度
                      width=4,         # 刻度线宽度
                      colors='#333333') # 刻度颜色

        plt.tight_layout()  # 自动调整子图间距
        plt.show()
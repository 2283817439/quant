"""
主程序入口
"""
import os
import sys
import logging
import subprocess
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.model_selection import ParameterGrid
from concurrent.futures import ProcessPoolExecutor
from backtest.backtestsystem import BackTestSystem
from config.config import config
from utils.logger import sys_logger, close_logger


logger = sys_logger.getChild('Optimize')

OPTIMIZE_RECORD_PREFIX = "optimize_result_record"

# 配置日志格式
formatter = logging.Formatter("%(asctime)s - %(processName)s - %(levelname)s - %(message)s")

# 设置pandas打印选项，强制显示所有行和列
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 10000)
pd.set_option('display.max_colwidth', None)  # 显示完整列内容
pd.set_option('display.unicode.east_asian_width', True)

def optimize_strategy():
    """参数优化核心逻辑"""
    # config = ConfigManager()

    # 从配置读取参数空间
    param_grid = config.get('optimize.param_grid', {
        'short_window': [5, 10, 20],
        'long_window': [20, 50, 100],
        'stop_loss_ratio': [0.05, 0.08, 0.10]
    })

    # 获取优化指标配置
    optimize_metric = config.get('optimize.metric', 'sharpe_ratio')
    parallel_workers = config.get('optimize.workers', 4)

    logger.warning(f"开始参数优化 | 参数组合数: {len(ParameterGrid(param_grid))}")

    start_time = datetime.now()

    # 并行回测
    with ProcessPoolExecutor(max_workers=parallel_workers) as executor:
        futures = []

        for params in ParameterGrid(param_grid):
            futures.append(executor.submit(run_backtest, params))

        # 收集结果
        results = [f.result() for f in futures]

    # 分析最优参数
    results_df = pd.DataFrame(results)
    results_df.sort_values(by='sharpe_ratio', inplace=True, ascending=True)

    logger.warning(f'\n{results_df}')

    best_params = results_df.loc[results_df[optimize_metric].idxmax()]

    logger.warning("运行时长: %.2f秒", (datetime.now() - start_time).total_seconds())
    logger.warning(f"参数优化完成 | 最佳参数: {best_params.to_dict()}")

    # 创建记录目录
    record_file_path = config.get('record.file_path')
    os.makedirs(record_file_path, exist_ok=True)

    filename = f"{OPTIMIZE_RECORD_PREFIX}"
    filepath = os.path.join(record_file_path, f"{filename}.csv")

    # header = not os.path.exists(filepath)
    results_df.to_csv(filepath, mode='a', header=True, index=False, encoding='utf-8-sig')

    logger.warning(f"成功保存资金记录至 {filepath}")

def run_backtest(params: dict) -> dict:
    """单组参数回测执行"""   
    try:
        start_time = datetime.now()

        # 更新配置参数
        config.update({'strategy': params})

        # 运行回测
        # 初始化交易系统
        with BackTestSystem(config) as system:
            logger.warning(f"{os.getpid()} 回测系统开始执行")
            run = True
            try:
                # 系统预热（加载策略参数等）
                system.start()

                # 主循环
                logger.info("进入主运行循环")
                while run:
                    try:
                        run = system.run()
                    except Exception as e:
                        logger.critical("主循环运行异常: %s", str(e), exc_info=True)
                        raise

                # 生成报告
                stats = system.engine.report()

            except Exception as e:
                logger.critical("回测系统运行时异常: %s", str(e), exc_info=True)
                raise

        return {
            **params,
            'sharpe_ratio': stats['sharpe_ratio'],
            'max_drawdown': stats['max_drawdown'],
            'annual_return': stats['annual_return']
        }
    except Exception as e:
        logger.critical("系统级异常导致终止: %s", str(e), exc_info=True)
        return {
            **params,
            'sharpe_ratio': np.nan,
            'max_drawdown': np.nan,
            'annual_return': np.nan
        }
    finally:
        logger.warning(f"{os.getpid()} 回测系统执行完成, 运行时长:{(datetime.now() - start_time).total_seconds()}")          

def set_terminal_title(title: str = ""):
    """设置终端窗口标题（仅限Windows）"""
    try:
        full_title = f"{title} mode: optimize {os.getcwd()}"
        command = f'$Host.UI.RawUI.WindowTitle = "{full_title}"'

        subprocess.run(["powershell", "-Command", command], check=True)  
        logger.warning("终端标题已更新: %s", full_title)
    except subprocess.CalledProcessError as e:
        logger.warning("终端标题更新失败: %s", str(e))    

def main():
    set_terminal_title("QMT OptimizeSystem")
    optimize_strategy()
    close_logger()
    sys.exit(0)

if __name__ == "__main__":
    main()
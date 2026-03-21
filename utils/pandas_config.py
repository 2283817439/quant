"""
pandas 全局显示配置
集中管理 pd.set_option 调用，避免在各模块重复设置。
在引擎初始化早期调用一次 configure() 即可。
"""
import pandas as pd


def configure() -> None:
    """统一设置 pandas 显示选项（适配中文列名与宽表输出）"""
    pd.set_option('display.max_rows', None)
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 10000)
    pd.set_option('display.max_colwidth', None)
    pd.set_option('display.unicode.east_asian_width', True)

# core/exceptions.py
"""
量化交易平台自定义异常类
统一管理项目中的业务异常，便于错误捕获和处理
"""

class QuantTradeBaseError(Exception):
    """量化交易平台基础异常类（所有自定义异常的父类）"""
    def __init__(self, message: str = "量化交易平台发生未知错误"):
        self.message = message
        super().__init__(self.message)


# ---------------------- 核心模块异常 ----------------------
class MarketDataError(QuantTradeBaseError):
    """市场数据相关异常（如数据获取失败、数据格式错误等）"""
    def __init__(self, message: str = "市场数据异常"):
        super().__init__(f"[市场数据错误] {message}")


class PortfolioError(QuantTradeBaseError):
    """持仓管理相关异常（如持仓不足、重复开仓等）"""
    def __init__(self, message: str = "持仓管理异常"):
        super().__init__(f"[持仓错误] {message}")


class RiskError(QuantTradeBaseError):
    """风控相关异常（如触发止损、仓位超限等）"""
    def __init__(self, message: str = "风控异常"):
        super().__init__(f"[风控错误] {message}")


class StrategyError(QuantTradeBaseError):
    """策略相关异常（如策略初始化失败、信号生成错误等）"""
    def __init__(self, message: str = "策略异常"):
        super().__init__(f"[策略错误] {message}")


class TradeError(QuantTradeBaseError):
    """交易执行相关异常（如下单失败、撤单失败等）"""
    def __init__(self, message: str = "交易执行异常"):
        super().__init__(f"[交易错误] {message}")


class RetryableError(TradeError):
    """可重试的交易错误（如网络波动、券商接口临时不可用等）"""
    def __init__(self, message: str = "可重试的交易错误", retry_times: int = 3):
        self.retry_times = retry_times
        super().__init__(f"{message}（建议重试次数：{retry_times}）")


# ---------------------- 回测/实盘模块异常 ----------------------
class BacktestError(QuantTradeBaseError):
    """回测相关异常"""
    def __init__(self, message: str = "回测异常"):
        super().__init__(f"[回测错误] {message}")


class LiveTradeError(QuantTradeBaseError):
    """实盘交易相关异常"""
    def __init__(self, message: str = "实盘交易异常"):
        super().__init__(f"[实盘错误] {message}")


# 新增：交易系统核心异常
class TradingSystemError(QuantTradeBaseError):
    """交易系统（实盘）核心异常（如初始化失败、连接异常、心跳中断等）"""
    def __init__(self, message: str = "交易系统运行异常"):
        super().__init__(f"[交易系统错误] {message}")

# ---------------------- 配置/工具模块异常 ----------------------
class ConfigError(QuantTradeBaseError):
    """配置相关异常（如配置文件缺失、配置项错误等）"""
    def __init__(self, message: str = "配置异常"):
        super().__init__(f"[配置错误] {message}")


class DatabaseError(QuantTradeBaseError):
    """数据库相关异常（如连接失败、查询错误等）"""
    def __init__(self, message: str = "数据库异常"):
        super().__init__(f"[数据库错误] {message}")
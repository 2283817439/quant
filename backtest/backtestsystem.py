from datetime import datetime, timedelta

from config.config import ConfigManager
from core.exceptions import TradingSystemError
from core.system_base import BaseTradingSystem
from utils.logger import sys_logger

from .backtestengine import BackTestEngine

logger = sys_logger.getChild("BackSystem")


class BackTestSystem(BaseTradingSystem):
    MODE = "backtest"
    ENGINE_LABEL = "backtest engine"

    def __init__(self, config: ConfigManager):
        super().__init__(config, logger)
        self._start_date = datetime.strptime(self._config.get("backtest.start_date"), "%Y%m%d").date()
        self._end_date = datetime.strptime(self._config.get("backtest.end_date"), "%Y%m%d").date()
        self._today = self._start_date
        self._current_date = self._start_date

    def _create_engine(self):
        return BackTestEngine(self._config)

    def _before_engine_start(self) -> None:
        logger.info("Preparing historical datasets...")
        self.engine.prepare(self._start_date, self._end_date)

    def run(self) -> bool:
        should_continue = self._next()
        super().run()
        return should_continue

    def _next(self) -> bool:
        self._today = self._current_date + timedelta(days=1)
        return self._today <= self._end_date

    def _check_date_change(self) -> None:
        today = self._today
        if today == self._current_date:
            return

        logger.info(
            "Trading date changed: %s -> %s",
            self._current_date.strftime("%Y-%m-%d"),
            today.strftime("%Y-%m-%d"),
        )
        self._current_date = today
        self.engine.on_date_change(today)
        self._reset_daily_status()
        self._trading_status["is_trading_day"] = self.engine.is_trading_day(today)
        logger.info(
            "Trading day status: %s",
            "trading day" if self._trading_status["is_trading_day"] else "non-trading day",
        )

    def _handle_trading_phases(self) -> None:
        if not self._trading_status["is_trading_day"]:
            return

        self._pre_market()
        self._on_open()
        self._on_trade()
        self._on_close()
        self._post_market()

    def _loop(self):
        if not self._init_flag:
            raise TradingSystemError("Trading engine is not initialized")

        try:
            self._check_date_change()
            self._handle_trading_phases()
        except Exception as exc:
            error_msg = f"Main loop failed: {str(exc)}"
            logger.critical(error_msg, exc_info=True)
            raise TradingSystemError(error_msg) from exc

import time
from datetime import datetime, timedelta, time as dt_time

from config.config import config
from core.exceptions import TradingSystemError
from core.system_base import BaseTradingSystem
from utils.logger import sys_logger

from .liveengine import LiveEngine

logger = sys_logger.getChild("LiveSystem")


class LiveSystem(BaseTradingSystem):
    MODE = "live"
    ENGINE_LABEL = "live trading engine"

    def __init__(self):
        super().__init__(config, logger)
        self._current_date = datetime.now(self._timezone).date()

    def _create_engine(self):
        return LiveEngine(self._config)

    def _check_date_change(self) -> None:
        now = datetime.now(self._timezone)
        if now.time() < dt_time(8, 55):
            adjusted_date = (now - timedelta(days=1)).date()
        else:
            adjusted_date = now.date()

        if adjusted_date == self._current_date:
            return

        logger.info(
            "Trading date changed: %s -> %s",
            self._current_date.strftime("%Y-%m-%d"),
            adjusted_date.strftime("%Y-%m-%d"),
        )
        self._current_date = adjusted_date
        self.engine.on_date_change(adjusted_date)
        self._reset_daily_status()
        self._trading_status["is_trading_day"] = self.engine.is_trading_day(now)
        logger.info(
            "Trading day status: %s",
            "trading day" if self._trading_status["is_trading_day"] else "non-trading day",
        )

    def _handle_trading_phases(self) -> None:
        if not self._trading_status["is_trading_day"]:
            return

        now = datetime.now(self._timezone).time()

        if not self._trading_status["pre_market"] and now >= dt_time(9, 0):
            self._pre_market()

        if not self._trading_status["on_open"] and now >= dt_time(9, 30):
            self._on_open()

        if dt_time(9, 30) <= now < dt_time(15, 0):
            self._on_trade()

        if not self._trading_status["on_close"] and now >= dt_time(14, 55):
            self._on_close()

        if not self._trading_status["post_market"] and now >= dt_time(15, 0):
            self._post_market()

    def _loop(self):
        if not self._init_flag:
            raise TradingSystemError("Trading engine is not initialized")

        try:
            self._check_date_change()
            self._handle_trading_phases()
            time.sleep(1)
        except Exception as exc:
            error_msg = f"Main loop failed: {str(exc)}"
            logger.critical(error_msg, exc_info=True)
            raise TradingSystemError(error_msg) from exc

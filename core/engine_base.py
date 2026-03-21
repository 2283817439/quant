import os
import threading
from datetime import datetime, date, time as dt_time
from typing import Dict, Iterable, Optional

import pandas as pd
import pytz
from chinese_calendar import is_holiday, is_workday

from core.market import MarketDataManager
from core.models import OrderDirection
from core.portfolio import PortfolioManager
from utils.pandas_config import configure as _configure_pandas

# 统一设置 pandas 显示选项（各引擎模块不再重复调用）
_configure_pandas()


class BaseEngine:
    def __init__(self, config, logger):
        self._config = config
        self._logger = logger

        self.market = None
        self.portfolio = None
        self.risk = None
        self.strategy = None
        self.trader = None

        self._init_flag = False
        self._bind_flag = False
        self._record_file_path = self._config.get("record.file_path")
        self._benchmark = self._config.get("benchmark")

        self._timezone = pytz.timezone("Asia/Shanghai")
        self._current_date = datetime.now(self._timezone).date()

        self._lock = threading.Lock()
        self.db = None
        self._orders: Dict[str, object] = {}
        self._trader_orders: Dict[str, object] = {}
        self._history_data: Dict[str, pd.DataFrame] = {}

        self.df_equity = pd.DataFrame()
        self.df_orders = pd.DataFrame()
        self._trading_time: Dict[str, dt_time] = {
            "morning_open": dt_time(9, 30),
            "morning_close": dt_time(11, 30),
            "afternoon_open": dt_time(13, 0),
            "afternoon_close": dt_time(15, 0),
        }

    @property
    def current_date(self):
        return self._current_date

    @current_date.setter
    def current_date(self, trading_date: date):
        self._current_date = trading_date
        if self.strategy is not None and hasattr(self.strategy, "current_date"):
            self.strategy.current_date = trading_date

    def _init_core_components(self, risk_manager, strategy, market=None, portfolio=None):
        self.market = market or MarketDataManager(self._config)
        self._logger.debug("Market component initialized")

        self.portfolio = portfolio or PortfolioManager(self._config)
        self._logger.debug("Portfolio component initialized")

        self.risk = risk_manager
        self._logger.debug("Risk component initialized")

        self.strategy = strategy
        self._logger.debug("Strategy component initialized")

    def _bind_core_components(self):
        self.market.bind(self)
        self._logger.debug("Market component bound")

        self.portfolio.bind(self)
        self._logger.debug("Portfolio component bound")

        self.risk.bind(self)
        self._logger.debug("Risk component bound")

        self.strategy.bind(self)
        self._logger.debug("Strategy component bound")

    def _initialize_database(self):
        from utils.database import get_database_manager

        try:
            self.db = get_database_manager(self._config)
            self._logger.info("Database connection initialized")
        except Exception as exc:
            self._logger.warning("Database initialization failed, skipping DB writes: %s", exc)
            self.db = None

    def on_date_change(self, trading_date: date) -> None:
        self.current_date = trading_date
        self._reset_daily_state()
        self.portfolio.unfreeze_all()
        self.display_local()

    def display_local(self):
        self.portfolio.display_equity()
        self.portfolio.display_positions()

    def load_snapshot(self, latest: bool = True):
        self.portfolio.load_snapshot(latest=latest)

    def save_snapshot(self, tag: Optional[str] = None):
        return self.portfolio.save_snapshot(tag=tag)

    def is_trading_day(self, trading_date: date = None):
        trading_date = trading_date or datetime.now(self._timezone).date()

        if hasattr(trading_date, "date"):
            try:
                trading_date = trading_date.date()
            except TypeError:
                pass

        if trading_date.weekday() >= 5:
            return False

        if is_holiday(trading_date):
            return False

        if is_workday(trading_date):
            return True

        return False

    def load_history_k_day_data(self, symbol: str, data: pd.DataFrame) -> None:
        if not isinstance(data.index, pd.DatetimeIndex):
            raise ValueError("Historical data index must be DatetimeIndex")

        self._history_data[symbol] = data.sort_index(ascending=True)
        self._logger.debug(
            "Loaded %s history data | range: %s ~ %s | rows: %d",
            symbol,
            data.index[0].date(),
            data.index[-1].date(),
            len(data),
        )

    def _reset_daily_state(self) -> None:
        self._orders.clear()
        self._trader_orders.clear()
        self._logger.info("Daily order records reset")

    def _build_symbol_universe(self, include_index: bool = True) -> list[str]:
        symbols = list(self.portfolio.symbols) + list(self._benchmark or [])
        if include_index:
            index_symbols = self.market.get_index_symbols(index=self.strategy.index)
            symbols.extend(index_symbols)
        return sorted(set(symbols))

    def _download_prepare_datasets(
        self,
        symbols: Iterable[str],
        history_start: date,
        history_end: date,
        financial_start: Optional[date] = None,
        financial_end: Optional[date] = None,
    ) -> None:
        symbol_list = list(symbols)
        self._logger.info(
            "Downloading history data: %s -> %s | symbols=%d",
            history_start.strftime("%Y-%m-%d"),
            history_end.strftime("%Y-%m-%d"),
            len(symbol_list),
        )
        self.market.download_history_data(symbol_list, history_start, history_end)

        if financial_start and financial_end:
            self._logger.info(
                "Downloading financial data: %s -> %s | symbols=%d",
                financial_start.strftime("%Y-%m-%d"),
                financial_end.strftime("%Y-%m-%d"),
                len(symbol_list),
            )
            self.market.download_financial_data(symbol_list, financial_start, financial_end)

    def _load_local_history_window(
        self,
        symbols: Iterable[str],
        start_date: date,
        end_date: date,
    ) -> Dict[str, pd.DataFrame]:
        symbol_list = list(symbols)
        history_window: Dict[str, pd.DataFrame] = {}
        self._logger.info(
            "Loading local history window: %s -> %s | symbols=%d",
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d"),
            len(symbol_list),
        )

        for symbol in symbol_list:
            df = self.market.get_local_history_data(symbol, start_date, end_date)
            if df.empty:
                continue

            data = df[df["volume"] != 0]
            if data.empty:
                self._logger.debug("Skipping %s history window because all rows have zero volume", symbol)
                continue

            self.load_history_k_day_data(symbol, data)
            history_window[symbol] = data
            self._logger.debug("Loaded local history window for %s | rows=%d", symbol, len(data))

        return history_window

    def _persist_positions_to_db(self, account_payload: Optional[dict] = None) -> None:
        if not self.db:
            return

        try:
            for symbol, pos in self.portfolio._positions.items():
                self.db.upsert_position(
                    {
                        "symbol": symbol,
                        "total_volume": pos.total_volume,
                        "available_volume": pos.available_volume,
                        "avg_price": pos.avg_price,
                        "current_price": pos.cur_price,
                        "market_value": pos.market_value,
                        "float_pnl": pos.float_pnl,
                        "entry_date": pos.entry_date,
                        "highest_price": pos.highest_price,
                        "highest_date": pos.highest_date,
                    }
                )

            if account_payload:
                self.db.update_account(account_payload)
        except Exception as exc:
            self._logger.warning("Failed to persist position/account snapshot: %s", exc)

    def _should_persist_order_csv(self) -> bool:
        return True

    def _queue_order(self, order, *, count_total_orders: bool = False) -> bool:
        # 风控校验：仓位比例 + 最大回撤 + 日内交易次数
        if self.risk is not None:
            signal = {
                "symbol":      order.symbol,
                "signal_type": order.direction.value,
                "volume":      order.volume,
                "price":       order.price,
            }
            passed, reason = self.risk.validate_trade_signal(signal)
            if not passed:
                self._logger.warning(
                    "Order blocked by risk manager | %s %s %d@%.3f | reason=%s",
                    order.symbol, order.direction.value, order.volume, order.price, reason,
                )
                return False

        if not self.portfolio.check_trade(order):
            return False

        if count_total_orders and hasattr(self, "total_orders_count"):
            self.total_orders_count += 1

        self.portfolio.freeze_order_locked_asset(order)
        self._orders[order.id] = order.copy()
        self._logger.info(
            "Queued order | id=%s | %s %s %d shares @ %.3f",
            order.id,
            order.symbol,
            order.direction.value,
            order.volume,
            order.price,
        )
        return True

    def _is_valid_order_status_transition(self, old_status, new_status) -> bool:
        valid_transitions = {
            "PENDING": {"SUBMITTED", "REJECTED"},
            "SUBMITTED": {"PARTIAL_FILLED", "FILLED", "CANCELLED", "REJECTED"},
            "PARTIAL_FILLED": {"FILLED", "CANCELLED"},
        }
        return new_status.value in valid_transitions.get(old_status.value, set())

    def process_trader_order_callback(self, order) -> None:
        self._logger.debug(
            "Processing order callback | order=%s | %s %s %s",
            order.order_id,
            order.status.value,
            order.symbol,
            order.direction.value,
        )

        try:
            existing = self._trader_orders.get(order.id)

            if not (existing or self._orders.get(order.id)):
                self._logger.debug(
                    "Received callback for unknown order %s %d shares @ %.3f",
                    order.id,
                    order.volume,
                    order.price,
                )
                return

            if existing:
                update_existing = self._update_existing_trader_order(existing, order)
            else:
                self._add_new_trader_order(order)
                update_existing = True

            if update_existing:
                if order.status.value == "FILLED":
                    self._process_trader_filled_order(order)
                elif order.status.value == "REJECTED":
                    self.portfolio.unfreeze_order_locked_asset(self._orders[order.id])
        except Exception as exc:
            self._logger.error("Order callback failed: %s", exc, exc_info=True)
            raise ValueError("Order callback failed") from exc

    def _update_existing_trader_order(self, existing, order) -> bool:
        if not self._is_valid_order_status_transition(existing.status, order.status):
            self._logger.warning(
                "Invalid order status transition: %s -> %s | order=%s",
                existing.status,
                order.status,
                order.order_id,
            )
            return False

        old_status = existing.status
        existing.update_status(order.status, order.filled_volume, order.filled_price)
        self._logger.info(
            "Updated trader order | order=%s | %s -> %s %s | filled=%d/%d avg=%.3f",
            order.order_id,
            old_status.value,
            order.status.value,
            order.symbol,
            order.filled_volume,
            order.volume,
            order.filled_price,
        )
        return True

    def _add_new_trader_order(self, order) -> None:
        self._logger.info(
            "Registered trader order | order=%s | %s %s | filled=%d/%d avg=%.3f",
            order.order_id,
            order.status.value,
            order.symbol,
            order.filled_volume,
            order.volume,
            order.filled_price,
        )
        self._trader_orders[order.id] = order.copy()

    def _build_filled_order_record(self, order, pnl: float, holding_days: int) -> dict:
        return {
            "日期": self._current_date,
            "股票": order.symbol,
            "方向": order.direction.value,
            "成交量": order.filled_volume,
            "成交价": order.filled_price,
            "成交总额": round(order.filled_price * order.filled_volume, 2),
            "盈利": round(pnl, 2),
            "持仓天数": holding_days,
        }

    def _append_order_record(self, record: dict) -> None:
        df_order = pd.DataFrame(record, index=[0])

        if self._should_persist_order_csv():
            os.makedirs(self._record_file_path, exist_ok=True)
            filepath = os.path.join(self._record_file_path, f"{self.ORDERS_RECORD_PREFIX}.csv")
            header = not os.path.exists(filepath)
            df_order.to_csv(filepath, mode="a", header=header, index=False, encoding="utf-8-sig")
            self._logger.debug("Saved filled order record to %s", filepath)

        self.df_orders = pd.concat([self.df_orders, df_order])

    def _persist_order_to_db(self, order, pnl: float) -> None:
        if not self.db:
            return

        try:
            self.db.insert_order(
                {
                    "order_id": order.order_id,
                    "strategy_id": type(self.strategy).__name__,
                    "symbol": order.symbol,
                    "direction": order.direction.value,
                    "order_type": order.type.value if hasattr(order, "type") else "MARKET",
                    "price": order.price,
                    "volume": order.volume,
                    "filled_volume": order.filled_volume,
                    "filled_price": order.filled_price,
                    "status": order.status.value,
                    "create_time": order.create_time,
                    "update_time": datetime.now(self._timezone),
                    "remark": round(pnl, 2),
                }
            )
        except Exception as exc:
            self._logger.warning("Failed to persist order record: %s", exc)

    def _process_trader_filled_order(self, order) -> None:
        self._logger.info(
            "Applying filled order | order=%s | %s %s %d shares @ %s",
            order.order_id,
            order.symbol,
            order.direction.value,
            order.filled_volume,
            order.filled_price,
        )

        try:
            original_order = self._orders[order.id]
            self.portfolio.unfreeze_order_locked_asset(original_order)

            if original_order.direction == OrderDirection.SELL:
                position = self.portfolio.get_position(order.symbol)
                avg_price = position.avg_price
                entry_date = position.entry_date
                pnl = (order.filled_price - avg_price) * order.filled_volume
                holding_days = (self._current_date - entry_date).days + 1 if entry_date else 0
            else:
                pnl = 0.0
                holding_days = 0

            self.portfolio.apply_trade(order)
            self._logger.info(
                "Filled order | order=%s | %s %s %s %d shares @ %.3f",
                order.order_id,
                self._current_date.strftime("%Y-%m-%d"),
                order.symbol,
                order.direction.value,
                order.filled_volume,
                order.filled_price,
            )

            record = self._build_filled_order_record(order, pnl, holding_days)
            self._append_order_record(record)
            self._persist_order_to_db(order, pnl)
        except ValueError as exc:
            self._logger.error("Order execution failed: %s", exc)
        except Exception as exc:
            self._logger.error("Order processing failed: %s", exc, exc_info=True)

    def _should_persist_equity_csv(self) -> bool:
        return True

    def _get_latest_price_from_history(self, symbol: str) -> float:
        try:
            if symbol not in self._history_data:
                self._logger.warning("Missing history data for symbol %s", symbol)
                return 0.0

            return round(self._history_data[symbol].iloc[-1]["close"], 2)
        except Exception as exc:
            self._logger.error("Failed to resolve latest price for %s: %s", symbol, exc, exc_info=True)
            return 0.0

    def _build_equity_snapshot(self) -> dict:
        self.portfolio.update_market_value(self._current_date, price_getter=self._get_latest_price_from_history)

        snapshot = {
            "日期": self._current_date,
            "总资产": round(self.portfolio.total_equity, 2),
            "总现金": round(self.portfolio.total_cash, 2),
            "可用现金": round(self.portfolio.available_cash, 2),
            "持仓市值": round(self.portfolio.total_market_value, 2),
        }

        for symbol in self.portfolio.symbols:
            try:
                position = self.portfolio.get_position(symbol)
                snapshot[symbol] = round(position.market_value, 2) if position else 0.0
            except Exception as exc:
                self._logger.error("Failed to resolve market value for %s: %s", symbol, exc, exc_info=True)
                snapshot[symbol] = 0.0

        for symbol in self._benchmark:
            price = self._get_latest_price_from_history(symbol)
            snapshot[f"基准_{symbol}"] = price

        return snapshot

    def _append_equity_snapshot(self, snapshot: dict) -> pd.DataFrame:
        df_equity = pd.DataFrame(snapshot, index=[0])
        self.df_equity = pd.concat([self.df_equity, df_equity], ignore_index=True)
        return df_equity

    def _persist_equity_csv(self, df_equity: pd.DataFrame) -> None:
        os.makedirs(self._record_file_path, exist_ok=True)
        filepath = os.path.join(self._record_file_path, f"{self.EQUITY_RECORD_PREFIX}.csv")
        header = not os.path.exists(filepath)
        df_equity.to_csv(filepath, mode="a", header=header, index=False, encoding="utf-8-sig")
        self._logger.info("Saved equity record to %s", filepath)

    def _persist_equity_snapshot_to_db(self, snapshot: dict) -> None:
        return

    def update_equity(self) -> None:
        try:
            snapshot = self._build_equity_snapshot()
            df_equity = self._append_equity_snapshot(snapshot)
            self._logger.debug("Updated equity snapshot\n%s", df_equity)

            if self._should_persist_equity_csv():
                self._persist_equity_csv(df_equity)

            self._persist_equity_snapshot_to_db(snapshot)
        except Exception as exc:
            self._logger.error("Equity update failed on %s: %s", self._current_date, exc, exc_info=True)
            raise ValueError("Equity update failed") from exc

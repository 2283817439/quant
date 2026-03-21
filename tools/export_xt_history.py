import argparse
import json
import os
import sys
import time
from typing import Iterable, List

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import numpy  # noqa: F401
import pandas  # noqa: F401
import pytz  # noqa: F401

import xtquant  # noqa: F401  # Ensure interpreter-provided xtquant is available

from xtquant import xtdata  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export stock daily history from xtdata as NDJSON.")
    parser.add_argument("--symbols", default="", help="Comma separated symbols, e.g. 000001.SZ,600000.SH")
    parser.add_argument("--index", action="append", default=[], help="Index code(s) used to expand constituents")
    parser.add_argument("--start", required=True, help="Start date, YYYYMMDD or YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="End date, YYYYMMDD or YYYY-MM-DD")
    parser.add_argument("--adjustment", default="front_ratio", choices=["none", "front_ratio", "back_ratio"])
    return parser.parse_args()


def normalize_date(value: str) -> str:
    return value.replace("-", "").strip()


def infer_exchange(symbol: str) -> str:
    if symbol.endswith(".SH"):
        return "SSE"
    if symbol.endswith(".SZ"):
        return "SZSE"
    if symbol.endswith(".BJ"):
        return "BSE"
    return "OTHER"


def resolve_symbols(args: argparse.Namespace) -> List[str]:
    values = []
    if args.symbols:
        values.extend([item.strip() for item in args.symbols.split(",") if item.strip()])

    for index_code in args.index:
        try:
            sector_symbols = xtdata.get_stock_list_in_sector(index_code) or []
            values.extend(sector_symbols)
            print(f"[history-export] loaded {len(sector_symbols)} constituents from {index_code}", file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"[history-export] failed to expand index {index_code}: {exc}", file=sys.stderr, flush=True)

    deduped = sorted(set(values))
    if not deduped:
        raise ValueError("No symbols provided. Use --symbols or --index.")
    return deduped


def wait_download(symbols: List[str], start: str, end: str) -> None:
    state = {"finished": 0, "total": 0, "done": False}

    def on_progress(payload):
        state["finished"] = int(payload.get("finished", 0))
        state["total"] = int(payload.get("total", 0))
        if state["total"] > 0:
            print(
                f"[history-export] download progress {state['finished']}/{state['total']}",
                file=sys.stderr,
                flush=True,
            )
        if state["finished"] >= state["total"] and state["total"] > 0:
            state["done"] = True

    xtdata.download_history_data2(
        stock_list=symbols,
        period="1d",
        start_time=start,
        end_time=end,
        callback=on_progress,
    )

    while not state["done"]:
        time.sleep(1)


def emit_record(record: dict) -> None:
    print(json.dumps(record, ensure_ascii=False), flush=True)


def export_symbol(symbol: str, start: str, end: str, adjustment: str) -> int:
    fields = ["open", "high", "low", "close", "volume", "amount"]
    data = xtdata.get_market_data(
        field_list=fields,
        stock_list=[symbol],
        period="1d",
        dividend_type=adjustment,
        start_time=start,
        end_time=end,
    )

    open_df = data.get("open")
    if open_df is None or open_df.empty or symbol not in open_df.index:
        return 0

    emit_record(
        {
            "type": "security",
            "symbol": symbol,
            "exchange": infer_exchange(symbol),
            "market": "CN_A",
            "assetType": "stock",
            "currency": "CNY",
            "listStatus": "listed",
            "name": None,
            "metadata": {"source": "xtdata"},
        }
    )

    count = 0
    dates: Iterable[str] = list(open_df.columns)
    for raw_date in dates:
        row = {
            "type": "bar",
            "symbol": symbol,
            "tradeDate": f"{raw_date[0:4]}-{raw_date[4:6]}-{raw_date[6:8]}",
            "adjustmentType": adjustment,
            "open": float(data["open"].loc[symbol, raw_date]),
            "high": float(data["high"].loc[symbol, raw_date]),
            "low": float(data["low"].loc[symbol, raw_date]),
            "close": float(data["close"].loc[symbol, raw_date]),
            "volume": float(data["volume"].loc[symbol, raw_date]),
            "amount": float(data["amount"].loc[symbol, raw_date]) if "amount" in data else 0.0,
            "turnoverRate": None,
            "amplitude": None,
            "changePercent": None,
            "dataSource": "xtdata",
        }
        emit_record(row)
        count += 1

    return count


def main() -> int:
    args = parse_args()
    start = normalize_date(args.start)
    end = normalize_date(args.end)
    symbols = resolve_symbols(args)

    print(f"[history-export] exporting {len(symbols)} symbols {start} -> {end}", file=sys.stderr, flush=True)
    wait_download(symbols, start, end)

    total_rows = 0
    for idx, symbol in enumerate(symbols, start=1):
        try:
            rows = export_symbol(symbol, start, end, args.adjustment)
            total_rows += rows
            print(
                f"[history-export] exported {symbol} rows={rows} ({idx}/{len(symbols)})",
                file=sys.stderr,
                flush=True,
            )
        except Exception as exc:
            print(f"[history-export] failed {symbol}: {exc}", file=sys.stderr, flush=True)

    print(f"[history-export] completed rows={total_rows}", file=sys.stderr, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

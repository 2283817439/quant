#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Minimal HTTP bridge that exposes ths_api (TongHuaShun) data/trade services.

Run this script inside the 同花顺交易客户端的脚本环境 so that the built-in ths_api
package is available. The server listens on 127.0.0.1:9015 by default and
provides the /api/* routes expected by quant_teade_platform.
"""
from __future__ import print_function

import json
import logging
import os
import threading
import time
try:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from socketserver import ThreadingMixIn
    from urllib.parse import parse_qs, urlparse
except ImportError:
    from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer  # type: ignore
    from SocketServer import ThreadingMixIn  # type: ignore
    from urlparse import urlparse, parse_qs  # type: ignore

try:
    from ths_api import *  # noqa: F401,F403
except Exception as exc:  # noqa: BLE001
    raise SystemExit("ths_api not available. Please run inside 同花顺客户端脚本环境: %s" % exc)

AUTH_TOKEN = os.environ.get("THS_BRIDGE_TOKEN", "local-ths-token")
HOST = os.environ.get("THS_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("THS_BRIDGE_PORT", "9015"))
PRICE_EPSILON = 1e-3

LOGGER = logging.getLogger("ths_bridge")
if not LOGGER.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s][%(levelname)s] %(message)s"))
    LOGGER.addHandler(handler)
LOGGER.setLevel(logging.INFO)

try:
    HQ_API = hq.ths_hq_api()
except Exception as exc:  # noqa: BLE001
    LOGGER.warning("Failed to instantiate hq.ths_hq_api(): %s", exc)
    HQ_API = None

ORDER_ID_MAP = {}
ORDER_MAP_LOCK = threading.Lock()

SELL_LABELS = set(["卖", "沽", "賣", "鍗栧嚭"])


def _float(value):
    try:
        return float(value)
    except Exception:
        return 0.0


def _int(value):
    try:
        return int(float(value))
    except Exception:
        return 0


def _status_from_text(text):
    if not text:
        return "pending"
    if isinstance(text, bytes):
        try:
            text = text.decode("utf-8", "ignore")
        except Exception:
            text = str(text)
    if any(token in text for token in ["撤", "cancel"]):
        return "cancelled"
    if "部" in text and "成" in text:
        return "partial"
    if "全" in text and "成" in text:
        return "filled"
    if "已" in text and "成" in text:
        return "filled"
    if "成" in text:
        return "filled"
    return "pending"


def _combine_datetime(date_str, time_str):
    if not date_str and not time_str:
        return None
    date_str = date_str or ""
    time_str = time_str or ""
    if len(date_str) == 8 and date_str.isdigit():
        date_fmt = "%s-%s-%s" % (date_str[0:4], date_str[4:6], date_str[6:8])
    else:
        date_fmt = date_str
    if len(time_str.split(":")) == 3:
        time_fmt = time_str
    else:
        time_fmt = time_str.replace(",", ":")
    return (date_fmt + "T" + time_fmt).strip("T")


def _iter_order_rows(source):
    if not source:
        return
    if isinstance(source, dict):
        for value in source.values():
            if isinstance(value, dict):
                yield value
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        yield item
    elif isinstance(source, list):
        for item in source:
            if isinstance(item, dict):
                yield item


def _normalize_order(row):
    if not row:
        return None
    symbol = row.get("zqdm") or row.get("symbol")
    direction_text = row.get("cz") or row.get("direction") or "buy"
    direction = "sell" if any(label in str(direction_text) for label in SELL_LABELS) else "buy"
    order_id = str(row.get("htbh") or row.get("order_id") or row.get("no") or row.get("xh") or "")
    status = _status_from_text(row.get("bz") or row.get("status"))
    filled_volume = _int(row.get("cjsl"))
    total_volume = _int(row.get("wtsl") or row.get("volume"))
    price = _float(row.get("wtjg") or row.get("price"))
    filled_price = _float(row.get("cjjj") or row.get("filled_price"))
    update_time = row.get("gxsj") or row.get("update_time") or row.get("wtsj")
    create_time = _combine_datetime(row.get("wtrq"), row.get("wtsj")) or update_time
    return {
        "order_id": order_id,
        "symbol": symbol,
        "direction": direction,
        "order_type": row.get("order_type", "limit"),
        "price": price,
        "volume": total_volume,
        "filled_volume": filled_volume,
        "filled_price": filled_price,
        "status": status,
        "create_time": create_time,
        "update_time": update_time,
    }


def _list_active_orders():
    rows = []
    pending = getattr(xd, "g_order", {})
    for row in _iter_order_rows(pending):
        normalized = _normalize_order(row)
        if normalized:
            rows.append(normalized)
    return rows


def _list_positions():
    positions = []
    holding = getattr(xd, "g_position", {})
    for symbol, row in holding.items():
        quantity = _float(row.get("gpye") or row.get("sjsl") or row.get("position"))
        cost_price = _float(row.get("cbj") or row.get("cost_price"))
        market_value = _float(row.get("sz"))
        if market_value <= 0 and quantity > 0:
            market_value = quantity * _float(row.get("sj") or row.get("price"))
        floating = _float(row.get("yk") or row.get("floating_profit"))
        positions.append({
            "symbol": symbol,
            "total_volume": quantity,
            "avg_price": cost_price,
            "market_value": market_value,
            "unrealized_pnl": floating,
        })
    return positions


def _asset_snapshot():
    money = getattr(xd, "g_money", {})
    total_asset = _float(money.get("zzc") or money.get("total_asset") or money.get("zjye"))
    available_cash = _float(money.get("kyje") or money.get("cash"))
    market_value = _float(money.get("sz"))
    if market_value <= 0:
        holdings = _list_positions()
        market_value = sum(item.get("market_value", 0.0) for item in holdings)
    if total_asset <= 0:
        total_asset = market_value + available_cash
    return {
        "total_asset": total_asset,
        "available_cash": available_cash,
        "market_value": market_value,
    }


def _is_price_match(a, b):
    return abs(_float(a) - _float(b)) <= PRICE_EPSILON


def _find_contract_id(symbol, direction, price, volume):
    deadline = time.time() + 3.0
    while time.time() < deadline:
        for row in _iter_order_rows(getattr(xd, "g_order", {})):
            if row.get("zqdm") != symbol:
                continue
            if _int(row.get("wtsl")) != volume:
                continue
            if not _is_price_match(row.get("wtjg"), price):
                continue
            normalized = _normalize_order(row)
            if normalized and normalized.get("order_id"):
                return normalized.get("order_id")
        time.sleep(0.2)
    return None


def _ensure_token(handler):
    token = handler.headers.get("token")
    if token != AUTH_TOKEN:
        handler.send_response(401)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": "unauthorized"}).encode("utf-8"))
        return False
    return True


def _json_body(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("Failed to parse JSON body: %s", exc)
        return {}


def _quote_symbols(symbols):
    if not symbols:
        return []
    if HQ_API is None:
        return []
    joined = ",".join(symbols)
    try:
        data = HQ_API.get_quote(joined)
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("hq_api.get_quote failed: %s", exc)
        return []
    quotes = []
    if isinstance(data, dict):
        for code, row in data.items():
            price = _float(row.get("price"))
            prev = _float(row.get("pre_close") or row.get("close_yesterday"))
            change = price - prev
            percent = (change / prev) * 100 if prev else 0.0
            quotes.append({
                "symbol": code,
                "price": price,
                "change": change,
                "change_percent": percent,
                "volume": _float(row.get("volume")),
                "amount": _float(row.get("amount")),
                "high": _float(row.get("high")),
                "low": _float(row.get("low")),
                "open": _float(row.get("open")),
                "prev_close": prev,
                "timestamp": row.get("datetime") or time.strftime("%Y-%m-%dT%H:%M:%S"),
            })
    return quotes


class _ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class ThsBridgeHandler(BaseHTTPRequestHandler):
    server_version = "ths-bridge/1.0"

    def log_message(self, fmt, *args):
        LOGGER.info("%s - %s", self.client_address[0], fmt % args)

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json({"status": "ok", "token_required": True})
            return
        if parsed.path == "/api/asset":
            if not _ensure_token(self):
                return
            self._send_json(_asset_snapshot())
            return
        if parsed.path == "/api/positions":
            if not _ensure_token(self):
                return
            self._send_json(_list_positions())
            return
        if parsed.path == "/api/orders":
            if not _ensure_token(self):
                return
            self._send_json(_list_active_orders())
            return
        if parsed.path == "/api/quotes":
            if not _ensure_token(self):
                return
            params = parse_qs(parsed.query or "")
            symbols_param = params.get("symbols")
            symbols = []
            if symbols_param:
                symbols = [code.strip() for code in symbols_param[0].split(",") if code.strip()]
            self._send_json(_quote_symbols(symbols))
            return
        self.send_error(404, "unknown endpoint")

    def do_POST(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/login":
            _json_body(self)
            self._send_json({"access_token": AUTH_TOKEN})
            return
        if parsed.path == "/api/orders":
            if not _ensure_token(self):
                return
            payload = _json_body(self)
            symbol = payload.get("symbol")
            side = payload.get("direction", "buy")
            price = payload.get("price")
            volume = _int(payload.get("volume"))
            if not symbol or volume <= 0:
                self.send_error(400, "invalid symbol or volume")
                return
            if price in ("mrj1", "mcj1", "zxjg", "dtjg", "ztjg"):
                price_arg = price
            else:
                price_arg = "{0:.3f}".format(_float(price))
            cmd_parts = [side, symbol, price_arg, str(volume), "-notip"]
            cmd_line = " ".join(cmd_parts)
            LOGGER.info("send ths cmd: %s", cmd_line)
            try:
                cmd_ret = xd.cmd(cmd_line)
            except Exception as exc:  # noqa: BLE001
                LOGGER.error("ths cmd failed: %s", exc)
                self.send_error(500, "ths_api cmd error: %s" % exc)
                return
            contract_id = None
            if isinstance(cmd_ret, dict):
                contract_id = cmd_ret.get("htbh") or cmd_ret.get("no") or cmd_ret.get("order_id")
            if not contract_id:
                contract_id = _find_contract_id(symbol, side, price, volume)
            if not contract_id:
                contract_id = payload.get("order_id") or ("local-" + str(int(time.time() * 1000)))
            with ORDER_MAP_LOCK:
                ORDER_ID_MAP[str(payload.get("order_id") or contract_id)] = str(contract_id)
            self._send_json({"success": True, "order_id": str(contract_id)})
            return
        self.send_error(404, "unsupported POST")

    def do_DELETE(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/orders/"):
            if not _ensure_token(self):
                return
            order_id = parsed.path.rsplit("/", 1)[-1]
            mapping_id = order_id
            with ORDER_MAP_LOCK:
                mapping_id = ORDER_ID_MAP.get(order_id, order_id)
            cmd_line = "cancel -h {0}".format(mapping_id)
            try:
                xd.cmd(cmd_line)
            except Exception as exc:  # noqa: BLE001
                LOGGER.error("cancel failed: %s", exc)
                self.send_error(500, "cancel failed: %s" % exc)
                return
            self._send_json({"success": True})
            return
        self.send_error(404, "unsupported DELETE")

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = _ThreadingHTTPServer((HOST, PORT), ThsBridgeHandler)
    LOGGER.info("ths_bridge listening on %s:%s (token=%s)", HOST, PORT, AUTH_TOKEN)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("bridge shutting down")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

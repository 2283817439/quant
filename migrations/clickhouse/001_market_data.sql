CREATE DATABASE IF NOT EXISTS quant;

CREATE TABLE IF NOT EXISTS quant.market_trades
(
    time DateTime64(6, 'UTC'),
    venue LowCardinality(String),
    symbol LowCardinality(String),
    trade_id String,
    price Float64,
    quantity Float64,
    side LowCardinality(String),
    raw_json String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (venue, symbol, time, trade_id)
TTL time + INTERVAL 365 DAY;

CREATE TABLE IF NOT EXISTS quant.market_order_books
(
    time DateTime64(6, 'UTC'),
    venue LowCardinality(String),
    symbol LowCardinality(String),
    sequence UInt64,
    bids_json String,
    asks_json String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (venue, symbol, time, sequence)
TTL time + INTERVAL 90 DAY;

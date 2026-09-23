CREATE MATERIALIZED VIEW IF NOT EXISTS market_trades_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    venue,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(quantity) AS volume,
    count(*) AS trade_count
FROM market_trades
GROUP BY bucket, venue, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_trades_1m',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW IF NOT EXISTS market_order_books_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    venue,
    symbol,
    last(bids_json, time) AS bids_json,
    last(asks_json, time) AS asks_json,
    max(sequence) AS last_sequence
FROM market_order_books
GROUP BY bucket, venue, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_order_books_1m',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');

SELECT add_retention_policy('market_trades', INTERVAL '30 days');
SELECT add_retention_policy('market_order_books', INTERVAL '7 days');
SELECT add_retention_policy('market_trades_1m', INTERVAL '365 days');
SELECT add_retention_policy('market_order_books_1m', INTERVAL '365 days');

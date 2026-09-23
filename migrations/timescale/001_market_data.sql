CREATE TABLE IF NOT EXISTS market_trades (
    time TIMESTAMPTZ NOT NULL,
    venue TEXT NOT NULL,
    symbol TEXT NOT NULL,
    trade_id TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    side TEXT,
    raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (venue, trade_id, time)
);
SELECT create_hypertable('market_trades', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_market_trades_symbol_time ON market_trades (symbol, time DESC);

CREATE TABLE IF NOT EXISTS market_order_books (
    time TIMESTAMPTZ NOT NULL,
    venue TEXT NOT NULL,
    symbol TEXT NOT NULL,
    sequence BIGINT,
    bids_json JSONB NOT NULL,
    asks_json JSONB NOT NULL
);
SELECT create_hypertable('market_order_books', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_market_order_books_symbol_time ON market_order_books (symbol, time DESC);

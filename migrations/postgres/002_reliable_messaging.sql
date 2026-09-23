CREATE TABLE IF NOT EXISTS outbox_messages (
    id UUID PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    idempotency_key TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ,
    worker_id TEXT,
    published_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (aggregate_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox_messages(state, available_at);

CREATE TABLE IF NOT EXISTS inbox_messages (
    consumer_name TEXT NOT NULL,
    message_id UUID NOT NULL,
    state TEXT NOT NULL DEFAULT 'received',
    received_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    last_error TEXT,
    PRIMARY KEY (consumer_name, message_id)
);
CREATE INDEX IF NOT EXISTS idx_inbox_state ON inbox_messages(consumer_name, state);

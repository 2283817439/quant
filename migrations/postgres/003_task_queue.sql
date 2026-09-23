CREATE TABLE IF NOT EXISTS task_queue (
    id UUID PRIMARY KEY,
    task_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    available_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ,
    worker_id TEXT,
    result_json JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_claim ON task_queue(state, available_at);

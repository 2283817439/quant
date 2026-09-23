CREATE TABLE IF NOT EXISTS control_plane_events (
    sequence BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    correlation_id TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_versions (
    strategy_id TEXT NOT NULL,
    version TEXT NOT NULL,
    artifact_uri TEXT NOT NULL,
    status TEXT NOT NULL,
    metrics_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    promoted_at TIMESTAMPTZ,
    PRIMARY KEY (strategy_id, version)
);

CREATE TABLE IF NOT EXISTS control_flags (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

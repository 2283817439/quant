# Industrial AI Quant Architecture

## Scope

方案 B 将当前混合单体演进为可独立部署的分布式交易平台。第一阶段只允许研究、回测、模拟盘和 shadow trading；真实下单必须经过独立的风险服务、审批门禁和 kill switch。AI 只能生成候选策略、参数和实验计划，不能直接修改生产策略或绕过风险校验。

## Target services

| Service | Responsibility | State boundary |
|---|---|---|
| API Gateway | Authentication, tenant isolation, rate limits, request correlation | Stateless |
| Control Plane | Strategy/model registry, experiments, approvals, rollout, rollback, kill switch | PostgreSQL |
| Market Data Service | Vendor adapters, normalization, quality checks, replayable data snapshots | Object storage + time-series store |
| Feature Service | Point-in-time feature computation and feature lineage | Feature store |
| Research Service | AI-assisted hypothesis and strategy generation in a sandbox | Artifact store |
| Backtest Service | Reproducible backtests, walk-forward validation, stress tests | Job queue + artifact store |
| Simulation Service | Paper trading and shadow execution against recorded/live market data | Event log |
| Risk Service | Pre-trade/post-trade checks, exposure, drawdown, limits and circuit breakers | Strongly consistent DB/cache |
| Execution Service | Idempotent order routing, broker adapters, reconciliation | Broker state + event log |
| Observability | Metrics, traces, audit events, incident alerts | Metrics/log/trace backend |

The repository currently contains a reference implementation of the control-plane primitives in `services/control_plane`. The SQLite adapter is intentionally replaceable by PostgreSQL and exists to make the lifecycle deterministic in development and CI.

## Self-evolution lifecycle

1. Create a hypothesis and immutable candidate artifact.
2. Register the candidate with source commit, data snapshot, feature version, dependency lockfile, and configuration hash.
3. Run deterministic backtest, walk-forward validation, leakage checks, cost/slippage simulation, and stress tests.
4. Evaluate the candidate against a policy gate. The default gate requires minimum Sharpe, bounded drawdown, positive out-of-sample return, sufficient trade count, zero risk breaches, bounded turnover, and stability.
5. Deploy to shadow mode and compare live signals, fills, exposure, latency, and drift against the incumbent.
6. Deploy to canary with a fixed capital and exposure budget.
7. Promote only through the control plane. Every transition emits an append-only, hash-chained audit event.
8. Roll back automatically when risk or data-quality thresholds are breached. The kill switch blocks production promotion and trading actions.

## Event and command rules

Commands are authenticated requests to change state. Events are immutable facts. Every command must carry a correlation ID and actor identity. Order commands must have an idempotency key; duplicate commands return the original result instead of placing a second order. Event consumers must be replayable and tolerate at-least-once delivery.

## Data and model governance

Every experiment records the exact market-data snapshot, point-in-time feature definitions, strategy artifact digest, Python/Node lockfile digests, random seed, broker simulator configuration, and evaluation metrics. Production promotion is impossible without these references. Artifacts are immutable and addressed by content digest.

## Failure containment

The default safety posture is fail-closed:

- Missing market data or stale quotes stop new orders.
- Unknown strategy versions cannot run.
- Risk-service timeout stops new orders.
- Broker reconciliation mismatch pauses execution.
- Kill switch prevents promotion and order submission.
- Shadow and canary limits are smaller than production limits.
- No AI-generated code is executed in the trading process; research runs in a sandbox.

## Delivery phases

### Phase 1: control plane foundation

Complete the registry, event chain, promotion gate, kill switch, correlation IDs, and deterministic tests. Replace SQLite with PostgreSQL for shared deployments.

### Phase 2: asynchronous execution

Introduce a durable queue, outbox/inbox tables, idempotent workers, market-data snapshots, and a backtest job runner. Persist job status instead of keeping it only in process memory.

### Phase 3: simulation and risk isolation

Add paper/shadow execution, a dedicated risk service, exposure snapshots, reconciliation, circuit breakers, and incident alerts. Keep real broker adapters disabled by default.

### Phase 4: production canary

Require two-person or policy-based approval, fixed capital budgets, automatic rollback, disaster recovery drills, and a controlled broker enablement process. Production trading remains a deployment decision, not an AI decision.

## PostgreSQL control plane and task execution

`PostgresControlPlaneStore` implements the same lifecycle contract as the SQLite reference store. It uses pooled connections, JSONB payloads, UTC timestamps, and the same hash-chained event model. Shared deployments should set a PostgreSQL DSN through secret management and run migrations as a separate release step.

`SqliteTaskQueue` is intended for development and CI. `PostgresTaskQueue` uses row-level locks with `FOR UPDATE SKIP LOCKED`, leases, and at-least-once delivery so multiple worker processes can consume the same queue. `AsyncTaskExecutor` supports async or synchronous handlers, bounded worker counts, retry budgets, dead-letter state, and graceful shutdown. Handlers must be idempotent because a worker crash after side effects and before acknowledgement can cause a redelivery.

Recommended production topology:

```text
API Gateway -> Control Plane API -> PostgreSQL
                              \\-> Task Queue (PostgreSQL + SKIP LOCKED)
                                      |-> Backtest workers
                                      |-> Feature workers
                                      |-> Simulation workers
                                      |-> Evaluation workers
```

For higher throughput, the queue contract can later be moved to a dedicated broker without changing task handlers; the PostgreSQL queue is the first durable step and avoids introducing another operational dependency prematurely.

## PostgreSQL migrations and reliable messaging

PostgreSQL schema changes are versioned under `migrations/postgres`. The migration runner creates `schema_migrations`, takes a transaction-scoped advisory lock, applies files in lexical order, records a SHA-256 checksum, and refuses to continue if an already-applied migration was modified. Run it as a release step, not from every application worker:

```bash
python -m services.control_plane.migrate --dsn "$DATABASE_URL"
```

The Outbox pattern writes a business change and its outgoing message in the same database transaction boundary. A publisher claims pending messages with a lease and marks them published only after the downstream publish succeeds. A crash can cause redelivery, so publishers and consumers must be idempotent.

The Inbox pattern uses `(consumer_name, message_id)` as a unique key. Duplicate deliveries are ignored after successful processing. Failed deliveries are moved back to `received` on the next attempt, while successfully processed deliveries remain terminal. This gives at-least-once delivery with deduplicated consumer effects; exactly-once delivery is not assumed.

## Transactional Outbox and Publisher Worker

Control-plane business writes now insert the domain row, immutable audit event, and pending Outbox message on the same database transaction. If any part fails, all three are rolled back. The PostgreSQL and SQLite control-plane stores expose the same lease-based Outbox interface.

`OutboxPublisherWorker` claims messages with a lease, invokes an idempotent sink, and acknowledges only after the sink succeeds. `TaskQueueEventSink` maps event types to durable task types and uses the Outbox message ID as the task ID. Therefore a publisher retry cannot create a second task even if the process crashes after queue insertion and before Outbox acknowledgement.

```text
business command
  └─ same DB transaction ─┬─ domain state
                          ├─ audit event
                          └─ outbox_messages(pending)

OutboxPublisherWorker
  └─ lease -> TaskQueueEventSink -> task_queue(task_id=message_id) -> acknowledge
```

This remains **at-least-once** delivery. The task handler and any downstream consumer must remain idempotent. A production deployment should run multiple Publisher Worker instances against PostgreSQL; row locks and `SKIP LOCKED` distribute pending messages safely.

## Distributed locks, fenced Worker leases, and feedback loop

Multi-node coordination uses PostgreSQL row-backed leases. A lock acquisition returns an owner, lease expiry, and monotonically increasing fencing token. Releasing a lock preserves the token counter; a later owner receives a larger token. Consumers of shared resources must reject commands carrying an older token.

Task claims now also receive a per-claim fencing token. Completion and failure acknowledgements require the same token, so a paused Worker whose lease expired cannot acknowledge or overwrite the result after another node has reclaimed the task. This prevents stale Worker commits; handlers still need idempotency because a crash after an external side effect can produce at-least-once redelivery.

The feedback loop in `services/feedback` injects a replayable backtest evaluator, scores each trial with Sharpe, out-of-sample return, drawdown, turnover, stability, and risk-breach penalties, persists every trial, and adaptively refines candidates around the best observed parameters. The resulting metrics can be converted to `CandidateMetrics` and passed to the existing lifecycle gate. The optimizer never promotes a strategy by itself; production promotion remains controlled by the strategy lifecycle and its approval/safety gates.

## Live intervention and optimizer extensions

`LiveInterventionController` is the fail-closed boundary for live intervention. A risk-service or operator trigger activates the kill switch, emits an auditable event, blocks new orders, and optionally invokes injected broker actions for cancel-all and flatten-all. The default controller has no broker adapter, so tests cannot place real orders. Clearing the switch is explicit and restores order permission only after the caller's external approval gates.

Automated tests cover drawdown-triggered activation, duplicate-trigger suppression, manual flattening, event-chain integrity, and clearing behavior. These are simulation tests and do not connect to a real broker.

The feedback package now includes two optimizer extensions:

- `GeneticOptimizer`: bounded populations, elite selection, arithmetic crossover, deterministic seeded mutation, and per-generation persistence.
- `BayesianOptimizer`: a lightweight kernel-weighted surrogate with an upper-confidence-bound acquisition function, deterministic seeded exploration, and persisted initial/acquisition trials.

Both optimizers use the same injected backtest evaluator and `EvaluationMetrics` contract as the original feedback loop. They propose and rank parameters; promotion remains a separate control-plane decision through `CandidateMetrics`, lifecycle checks, shadow deployment, canary limits, and the kill switch.

## Redis production backend, operations dashboard, and promotion alerts

`services/redis_backend.py` provides production adapters for distributed locks and task queues. Redis locks use an atomic `SET NX PX` lease, a separate monotonic fencing counter, and Lua compare-and-renew/release scripts. The Redis task queue uses a sorted ready set, an active-lease set, hashes for task state, atomic Lua claim/recovery, and fenced completion/failure transitions. Expired active leases are requeued atomically on the next claim. SQLite remains the local fallback; production workers should be configured with a shared Redis URL and unique queue prefix.

The process-local `MonitoringRegistry` is a dashboard projection. `GET /ops` serves the authenticated operations page and `GET /api/ops/overview` returns production strategies, Canary strategies, task lease owners, fencing tokens, and lease summary counts. The dashboard refreshes every three seconds and requires the existing Bearer token. For multi-process production deployments, the registry should be replaced or fed by a Redis-backed projection/event consumer so every API replica observes the same state.

`services/notifications` adds `WebhookNotifier`, `SmtpNotifier`, and `CompositeNotifier`. The promotion pipeline emits `strategy.rejected` and `strategy.production` events. Notification failures are fail-open by default so an unavailable alert channel cannot silently change the trading decision; operators may choose fail-closed behavior for deployments where notification delivery is a hard gate. URLs, SMTP credentials, and recipients are intentionally configuration-only and are not enabled by this change.

## Prometheus metrics, streaming evaluation, and Docker Compose

The API exposes `GET /metrics` using Prometheus text format. It exports strategy counts, Production and Canary counts, lease counts by state, market tick counters, incremental equity, and incremental drawdown. The endpoint intentionally remains unauthenticated for normal Prometheus scraping; place it behind the deployment network or ingress policy. The existing authenticated `/api/ops/overview` remains the dashboard data endpoint.

`services/streaming` provides a `MarketTick` contract, rolling `StreamingFactorEngine`, and `StreamingEvaluationPipeline`. Each tick updates momentum, one-tick return, rolling volatility, volume z-score, and sample count, then evaluates the injected signal function and updates equity, cumulative return, drawdown, and observation counters without rerunning a full backtest. The pipeline supports asynchronous tick iterables and callback hooks for persistence or control-plane evaluation. It is intentionally a deterministic computation boundary; the live market adapter is responsible for authentication, reconnects, and venue-specific normalization.

`docker-compose.yml` starts PostgreSQL, Redis, the Python API, and two horizontally independent Workers. The API applies PostgreSQL migrations before starting. Workers use `TASK_QUEUE_BACKEND=redis` and share the Redis URL, so claim/fencing behavior is coordinated across nodes. Persistent volumes are provided for PostgreSQL and Redis AOF data. Copy the environment variables from the Compose file into a production `.env` and replace the development database password before deployment.

## Grafana, exchange WebSocket adapter, and Worker autoscaling

`monitoring/grafana/quant-operations-dashboard.json` is an importable Grafana dashboard using the Prometheus datasource variable `DS_PROMETHEUS`. It includes Production/Canary counts, Redis queue backlog, incremental equity and drawdown, market tick throughput, lease state counts, and API availability. The default refresh interval is five seconds.

`services/market_adapters/binance.py` implements a public Binance combined trade-stream adapter. It normalizes trade messages into `MarketTick`, supports multiple symbols, reconnects with bounded exponential backoff, sends WebSocket ping frames through the client library, and stops cleanly on cancellation. It is intentionally a market-data adapter only: credentials, account/order permissions, and venue-specific execution remain outside this public stream component.

`services/scaling/worker_autoscaler.py` implements a backlog-based policy with minimum/maximum replicas, target backlog per Worker, and scale-down cooldown. `deploy/k8s/worker-hpa.yaml` maps the `quant_task_queue_backlog` external Prometheus metric to Kubernetes HPA with two to twenty replicas and conservative scale-down behavior. Redis updates the backlog gauge on enqueue and claim. A Prometheus Adapter installation is required to expose the metric as a Kubernetes external metric.

## Live execution gateway and adaptive factor model

`services/execution` defines a venue-neutral order contract, a fail-closed risk policy, status events, and a deterministic router. `PaperExecutionAdapter` is the safe default for tests. `BinanceSpotAdapter` implements signed Spot REST submission/status/cancel calls. `CcxtExchangeAdapter` provides an optional bridge for CCXT-supported venues such as Binance, OKX, Bybit, and Coinbase when the optional `ccxt` package is installed. The gateway checks the kill switch, quantity/order-type validity, symbol allowlists, per-order notional, and daily notional before selecting a configured venue. It emits `OrderUpdate` callbacks on accepted, rejected, filled, canceled, and refreshed states. Real credentials are never read implicitly; callers must inject an adapter explicitly.

`services/ml/adaptive.py` provides `AdaptiveFactorEnsemble`, an online softmax-weighted factor combiner. It updates factor logits from realized forward returns, exposes normalized dynamic weights, and publishes model score/observation metrics. `XGBoostRealtimeFactorModel` is an optional rolling regressor with lazy import, bounded history, periodic retraining, and deterministic seed. The online model is dependency-free and should be used as the always-available fallback; XGBoost should be enabled only after offline validation, feature drift checks, and shadow/canary promotion gates.

## Distributed backtest cluster and high-frequency market storage

`services/distributed_backtest` splits a Cartesian parameter grid into deterministic, idempotent Redis queue jobs. `DistributedBacktestCluster.submit_grid` creates a stable UUID trial ID for each parameter combination, so retry or duplicate scheduling cannot create a second logical trial. Workers register `backtest.run`; `BacktestWorkerHandler` invokes an injected `module:function` runner and persists success or failed-trial results in `RedisResultStore`. `aggregate` returns ranked experiment results. The existing fenced Redis queue provides horizontal Worker leases and retries; no Celery broker is required.

`services/market_data_store` defines normalized `TradeEvent`, `OrderBookLevel`, and `OrderBookSnapshot` records. `TimescaleMarketStore` batches inserts through psycopg into hypertables, with duplicate trade protection. `ClickHouseMarketStore` batches JSONEachRow inserts over HTTP into MergeTree tables. `InMemoryMarketStore` is provided for unit tests and local development. Schemas are separate from the normal PostgreSQL migration chain because TimescaleDB extension availability and ClickHouse deployment are environment-specific:

- `migrations/timescale/001_market_data.sql`
- `migrations/clickhouse/001_market_data.sql`

Set `BACKTEST_RUNNER=module:function` on Worker containers to enable actual backtest execution. The function must accept `(parameters, dataset)` and return a JSON-compatible metrics dictionary. The default Worker entrypoint does not invent trading results and will reject a `backtest.run` task when no runner is configured.

## Realtime Timescale ingestion, liquidity risk, and AI intelligence

`services/market_stream/RealtimeMarketPersistencePipeline` consumes `MarketTick`, `TradeEvent`, and `OrderBookSnapshot` events, batches them by size or time, writes them asynchronously through `TimescaleMarketStore`, and retries a failed batch by restoring it to the in-memory buffer. It also updates the `LiquidityRiskGate` from each order-book snapshot. A production source can connect the Binance adapter or another venue adapter directly to `pipeline.ingest`/`pipeline.run`.

`services/liquidity` computes spread in basis points, bid/ask depth, book imbalance, and estimated market impact. The gate fails closed when no recent book exists, the spread is too wide, depth is insufficient, or impact exceeds the limit. Borderline orders can be reduced to a safe quantity. These metrics are exported as `quant_liquidity_*` Prometheus series and can be passed to `ExecutionGateway` as its `liquidity_gate`.

`services/intelligence` upgrades the compatibility `ai.py` facade into an explainable decision-support layer. It classifies market regime, fuses momentum/value/ML signals, estimates confidence, emits reasons, and recommends a position-size multiplier. The module is deterministic and does not pretend to be a predictive guarantee; external LLM or ML models remain optional advisory components behind the existing promotion and risk gates.

## AI dashboard, online RL, and Timescale retention

The `/ops` dashboard now includes the latest AI regime, action, confidence, recommended position-size multiplier, explainable reasons, and per-symbol liquidity table. `MonitoringRegistry` receives projections from the AI engine and liquidity gate, while `/api/ops/overview` remains the authenticated source for the browser.

`services/ml/online_rl.py` provides a bounded contextual bandit with `buy`, `hold`, and `sell` actions. Historical backtest samples can be replayed through `train_history` or `QuantAssistant.update_rl_from_backtest`. Model files are written atomically and `HotReloadingRLPolicy` reloads only when the model file mtime changes. The default decision path is exploitation-only (`explore=False`) for live orders; exploration should be restricted to backtest or Shadow mode. RL output remains advisory and is still constrained by liquidity, risk, kill-switch, and promotion gates.

`migrations/timescale/002_retention_downsampling.sql` creates one-minute continuous aggregates for trades and order-book snapshots, refreshes them every minute, keeps raw trades for 30 days, raw order books for 7 days, and aggregates for 365 days. `services/timescale/maintenance.py` applies these migrations idempotently with checksums and runs continuously in the `timescale-maintenance` Compose service. Compose now uses `timescale/timescaledb:latest-pg16`; production deployments should pin an approved image tag rather than floating `latest`.

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

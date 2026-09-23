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

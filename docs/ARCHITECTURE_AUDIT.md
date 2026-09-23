# Architecture Audit

## Scope and conclusion

The repository was audited by tracing imports from the Python API, live engine, backtest engine, control plane, task queue, execution gateway, market adapters, streaming pipeline, and tests. The core modules are not dead code: `core/*`, `live/*`, `backtest/*`, `services/control_plane/*`, `services/task_queue/*`, `services/messaging/*`, `services/execution/*`, `services/market_data_store/*`, and the monitoring modules have active import or test references. They should not be deleted as cleanup.

## Safe findings

`main_optimize.py` contains the original in-process `ProcessPoolExecutor` optimizer, while `services/distributed_backtest` provides the newer Redis-based cluster. They are different deployment modes rather than duplicate imports. The former remains useful for local/offline optimization; the latter is the production horizontal path. The recommended next consolidation is to make `main_optimize.py` a thin client of the distributed scheduler, but deleting it now would break an existing CLI entrypoint.

The former rule-based `ai.py` was not unused: tests and the API import it. It has therefore been retained as the compatibility facade and upgraded to delegate structured analysis to `services/intelligence`. The new engine adds regime detection, signal fusion, confidence, explainable reasons, and position-size recommendations without requiring an external LLM.

The process-local monitoring registry is intentionally a projection, not a source of truth. In a multi-process deployment it should be fed from Redis/PostgreSQL events; replacing it outright would be unsafe until the projection consumer is deployed.

## Redundancy risks to monitor

There are multiple operational entry scripts (`main.py`, `main_live.py`, `main_livetest.py`, and GUI/manual feature harnesses). They are legacy compatibility surfaces and are not imported by the production API. They should be deprecated and moved under an explicit `tools/legacy` boundary in a separate change after confirming external operator usage. This task does not delete them.

The original `core.RiskManager` and the newer execution gateway have overlapping pre-trade checks. They serve different boundaries: portfolio-aware stock-system validation versus venue-neutral live order gating. The new liquidity gate is attached to the execution boundary rather than replacing portfolio risk checks. A future consolidation should use a single risk decision contract and preserve both adapters during migration.

## New closed-loop path

The intended production flow is now:

```text
WebSocket market adapter
  -> RealtimeMarketPersistencePipeline
  -> TimescaleDB/ClickHouse batch store
  -> LiquidityRiskGate + factor/AI insight
  -> ExecutionGateway
  -> Outbox/status callbacks
  -> Prometheus/Grafana and control-plane events
```

No module was removed in this audit because no deletion was both safe and proven by import/reference analysis.

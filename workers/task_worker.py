from __future__ import annotations

import asyncio
import os
import socket
import importlib
from datetime import datetime, timezone

from services.task_queue import AsyncTaskExecutor, create_task_queue
from services.distributed_backtest import BacktestWorkerHandler, RedisResultStore


def handle_task(payload: dict) -> dict:
    """Safe default handler; domain task handlers can be registered here."""
    return {"accepted": True, "worker": os.getenv("WORKER_ID", socket.gethostname()), "received_at": datetime.now(timezone.utc).isoformat(), "payload": payload}

def handle_backtest(payload: dict) -> dict:
    target = os.getenv("BACKTEST_RUNNER")
    if not target or ":" not in target:
        raise RuntimeError("BACKTEST_RUNNER must be module:function for backtest.run workers")
    module_name, function_name = target.split(":", 1)
    runner = getattr(importlib.import_module(module_name), function_name)
    store = RedisResultStore(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    return BacktestWorkerHandler(runner, store)(payload)


async def main() -> None:
    queue = create_task_queue()
    executor = AsyncTaskExecutor(
        queue,
        handlers={"noop": handle_task, "backtest": handle_task, "backtest.run": handle_backtest, "evaluate": handle_task},
        workers=int(os.getenv("WORKER_CONCURRENCY", "2")),
        worker_id=os.getenv("WORKER_ID"),
    )
    await executor.start()
    try:
        await asyncio.Event().wait()
    finally:
        await executor.stop()
        close = getattr(queue, "close", None)
        if close:
            close()


if __name__ == "__main__":
    asyncio.run(main())

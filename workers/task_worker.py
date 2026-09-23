from __future__ import annotations

import asyncio
import os
import socket
from datetime import datetime, timezone

from services.task_queue import AsyncTaskExecutor, create_task_queue


def handle_task(payload: dict) -> dict:
    """Safe default handler; domain task handlers can be registered here."""
    return {"accepted": True, "worker": os.getenv("WORKER_ID", socket.gethostname()), "received_at": datetime.now(timezone.utc).isoformat(), "payload": payload}


async def main() -> None:
    queue = create_task_queue()
    executor = AsyncTaskExecutor(
        queue,
        handlers={"noop": handle_task, "backtest": handle_task, "evaluate": handle_task},
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

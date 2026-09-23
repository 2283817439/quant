from __future__ import annotations

import asyncio
import inspect
import logging
import socket
from collections.abc import Awaitable, Callable
from typing import Any

from .models import QueuedTask

logger = logging.getLogger(__name__)
Handler = Callable[[dict[str, Any]], Any | Awaitable[Any]]


class AsyncTaskExecutor:
    """Horizontal-safe async worker pool over a lease-based durable queue."""

    def __init__(self, queue: Any, handlers: dict[str, Handler], workers: int = 2,
                 poll_interval: float = 0.5, lease_seconds: int = 60,
                 retry_delay_seconds: int = 5, worker_id: str | None = None) -> None:
        if workers < 1:
            raise ValueError("workers must be positive")
        self.queue = queue
        self.handlers = handlers
        self.workers = workers
        self.poll_interval = max(0.05, poll_interval)
        self.lease_seconds = max(5, lease_seconds)
        self.retry_delay_seconds = max(0, retry_delay_seconds)
        self.worker_id = worker_id or f"{socket.gethostname()}-worker"
        self._stop = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []

    async def submit(self, task_type: str, payload: dict[str, Any], max_attempts: int = 3) -> str:
        if task_type not in self.handlers:
            raise KeyError(f"no handler registered for task type: {task_type}")
        return await asyncio.to_thread(self.queue.enqueue, task_type, payload, max_attempts)

    async def start(self) -> None:
        if self._tasks:
            return
        self._stop.clear()
        self._tasks = [asyncio.create_task(self._worker_loop(index)) for index in range(self.workers)]

    async def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        if not self._tasks:
            return
        done, pending = await asyncio.wait(self._tasks, timeout=timeout)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._tasks.clear()

    async def _worker_loop(self, index: int) -> None:
        worker_id = f"{self.worker_id}-{index}"
        while not self._stop.is_set():
            task: QueuedTask | None = await asyncio.to_thread(
                self.queue.claim, worker_id, self.lease_seconds
            )
            if task is None:
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.poll_interval)
                except asyncio.TimeoutError:
                    continue
                continue
            try:
                result = self.handlers[task.task_type](task.payload)
                if inspect.isawaitable(result):
                    result = await result
                await asyncio.to_thread(self.queue.complete, task.id, worker_id, result)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - task failures are persisted
                logger.exception("task failed: %s", task.id)
                try:
                    await asyncio.to_thread(
                        self.queue.fail, task.id, worker_id, str(exc), self.retry_delay_seconds
                    )
                except Exception:  # noqa: BLE001
                    logger.exception("failed to persist task failure: %s", task.id)

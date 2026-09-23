from __future__ import annotations

import asyncio
import inspect
import logging
import socket
from collections.abc import Awaitable, Callable
from typing import Any

from .models import OutboxMessage

logger = logging.getLogger(__name__)
Sink = Callable[[OutboxMessage], Any | Awaitable[Any]]


class OutboxPublisherWorker:
    """Publishes leased Outbox messages with at-least-once delivery.

    The worker marks a message published only after the sink succeeds. If the
    process crashes after the sink succeeds but before acknowledgement, the
    message is redelivered; sinks must therefore be idempotent.
    """

    def __init__(self, store: Any, sink: Sink, workers: int = 1,
                 poll_interval: float = 0.5, lease_seconds: int = 60,
                 retry_delay_seconds: int = 5, worker_id: str | None = None) -> None:
        if workers < 1:
            raise ValueError("workers must be positive")
        self.store = store
        self.sink = sink
        self.workers = workers
        self.poll_interval = max(0.05, poll_interval)
        self.lease_seconds = max(5, lease_seconds)
        self.retry_delay_seconds = max(0, retry_delay_seconds)
        self.worker_id = worker_id or f"{socket.gethostname()}-outbox"
        self._stop = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []

    async def start(self) -> None:
        if self._tasks:
            return
        self._stop.clear()
        self._tasks = [asyncio.create_task(self._loop(index)) for index in range(self.workers)]

    async def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        if not self._tasks:
            return
        _, pending = await asyncio.wait(self._tasks, timeout=timeout)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._tasks.clear()

    async def publish_once(self, worker_suffix: str = "0") -> bool:
        worker_id = f"{self.worker_id}-{worker_suffix}"
        message = await asyncio.to_thread(self.store.claim_outbox, worker_id, self.lease_seconds)
        if message is None:
            return False
        try:
            result = self.sink(message)
            if inspect.isawaitable(result):
                await result
            await asyncio.to_thread(self.store.mark_outbox_published, message.id, worker_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - persisted for retry
            logger.exception("outbox publish failed: %s", message.id)
            await asyncio.to_thread(
                self.store.mark_outbox_failed, message.id, worker_id,
                str(exc), self.retry_delay_seconds,
            )
        return True

    async def _loop(self, index: int) -> None:
        while not self._stop.is_set():
            claimed = await self.publish_once(str(index))
            if claimed:
                continue
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.poll_interval)
            except asyncio.TimeoutError:
                pass


class TaskQueueEventSink:
    """Converts an Outbox event into an idempotent durable task."""

    def __init__(self, queue: Any, task_type_by_message: dict[str, str] | None = None,
                 default_task_type: str | None = None, max_attempts: int = 3) -> None:
        self.queue = queue
        self.task_type_by_message = task_type_by_message or {}
        self.default_task_type = default_task_type
        self.max_attempts = max_attempts

    def __call__(self, message: OutboxMessage) -> str:
        task_type = self.task_type_by_message.get(message.message_type, self.default_task_type)
        if not task_type:
            raise KeyError(f"no task mapping for message type: {message.message_type}")
        task_id = self.queue.enqueue(
            task_type,
            {
                "message_id": message.id,
                "message_type": message.message_type,
                "aggregate_type": message.aggregate_type,
                "aggregate_id": message.aggregate_id,
                "payload": message.payload,
            },
            max_attempts=self.max_attempts,
            task_id=message.id,
        )
        return task_id

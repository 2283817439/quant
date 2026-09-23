import asyncio

from services.task_queue import AsyncTaskExecutor, SqliteTaskQueue


def test_queue_retries_and_dead_letters(tmp_path):
    queue = SqliteTaskQueue(tmp_path / "tasks.db")
    task_id = queue.enqueue("always_fail", {"x": 1}, max_attempts=2)
    first = queue.claim("worker-a", lease_seconds=30)
    assert first and first.id == task_id and first.attempts == 1
    failure = queue.fail(task_id, "worker-a", "boom", retry_delay_seconds=0)
    assert failure.retrying is True
    second = queue.claim("worker-a", lease_seconds=30)
    assert second and second.attempts == 2
    failure = queue.fail(task_id, "worker-a", "boom", retry_delay_seconds=0)
    assert failure.retrying is False
    assert queue.counts()["dead_letter"] == 1


def test_async_executor_processes_success_and_retries(tmp_path):
    async def scenario():
        queue = SqliteTaskQueue(tmp_path / "tasks.db")
        attempts = {"count": 0}

        async def flaky(payload):
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise RuntimeError("transient")
            return {"value": payload["value"] * 2}

        executor = AsyncTaskExecutor(
            queue, {"flaky": flaky}, workers=1, poll_interval=0.01,
            retry_delay_seconds=0, lease_seconds=10,
        )
        await executor.start()
        task_id = await executor.submit("flaky", {"value": 21}, max_attempts=2)
        for _ in range(100):
            if queue.counts().get("succeeded") == 1:
                break
            await asyncio.sleep(0.01)
        await executor.stop()
        assert task_id
        assert attempts["count"] == 2
        assert queue.counts()["succeeded"] == 1

    asyncio.run(scenario())

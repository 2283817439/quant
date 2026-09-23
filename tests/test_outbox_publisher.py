import asyncio

from services.control_plane import ControlPlaneStore
from services.messaging import OutboxPublisherWorker, TaskQueueEventSink
from services.task_queue import SqliteTaskQueue


def test_business_write_and_outbox_are_atomic(tmp_path):
    store = ControlPlaneStore(tmp_path / "control.db")
    try:
        with store._connection() as db:
            db.execute("INSERT INTO strategy_versions(strategy_id, version, artifact_uri, status, metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?)", ("x", "v1", "sha", "candidate", "{}", "now"))
            store._append_event_and_outbox(db, "test.event", "x:v1", {"ok": True}, "corr", "test:x:v1")
            raise RuntimeError("force rollback")
    except RuntimeError:
        pass
    assert store.list_strategies() == []
    with store._connection() as db:
        assert db.execute("SELECT COUNT(*) AS c FROM control_plane_events").fetchone()["c"] == 0
        assert db.execute("SELECT COUNT(*) AS c FROM outbox_messages").fetchone()["c"] == 0


def test_publisher_bridges_outbox_to_task_queue(tmp_path):
    async def scenario():
        store = ControlPlaneStore(tmp_path / "control.db")
        queue = SqliteTaskQueue(tmp_path / "tasks.db")
        store.register_strategy("rotation", "v1", "sha256:a", {"sharpe": 1.2}, "corr")
        sink = TaskQueueEventSink(queue, {"strategy.candidate_registered": "evaluate_strategy"})
        worker = OutboxPublisherWorker(store, sink, poll_interval=0.01, retry_delay_seconds=0)
        await worker.start()
        for _ in range(100):
            if queue.counts().get("queued") == 1:
                break
            await asyncio.sleep(0.01)
        await worker.stop()
        assert queue.counts()["queued"] == 1
        message = queue.claim("task-worker")
        assert message and message.task_type == "evaluate_strategy"
        assert message.payload["message_type"] == "strategy.candidate_registered"
        with store._connection() as db:
            assert db.execute("SELECT state FROM outbox_messages").fetchone()["state"] == "published"

    asyncio.run(scenario())

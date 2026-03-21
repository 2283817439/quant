from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta
from typing import Dict, Optional

from config.ai_settings import get_ai_workflow_settings
from utils.logger import sys_logger

from .adapters import load_adapter
from .models import AIEvent, AIWorkflow, AIWorkflowRun, AIWorkflowTask
from .skills_loader import AISkillLoader
from .storage import AIWorkflowStore

logger = sys_logger.getChild("AIWorkflowEngine")


class AIWorkflowEngine:
    """
    轻量级调度/Runner 内核

    - 依据 ai_workflow.scheduler 配置定期扫描需要触发的工作流
    - 将要运行的工作流写入 ai_workflow_runs，并逐步派发任务
    - 任务执行的核心逻辑在后续步骤中通过 Adapter/Skill 实现，这里只提供骨架
    """

    def __init__(self, store: Optional[AIWorkflowStore] = None) -> None:
        settings = get_ai_workflow_settings()
        scheduler = settings.get("scheduler", {})
        self._interval = max(int(scheduler.get("interval_seconds", 15)), 5)
        self._max_parallel_runs = max(int(scheduler.get("max_parallel_runs", 2)), 1)
        self._adapter_settings = settings.get("adapters", {})
        skills_conf = settings.get("skills", {})
        self._store = store or AIWorkflowStore()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._workflow_cache: Dict[int, AIWorkflow] = {}
        self._adapter_cache = {}
        self._skill_loader = AISkillLoader(self._store, roots=skills_conf.get("roots"))
        # 预加载技能/工作流
        try:
            self._skill_loader.sync()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Skill loader failed during init: %s", exc)

    # ----------------------------------------------------------------- Lifecycle
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="ai-workflow-engine", daemon=True)
        self._thread.start()
        logger.info("AI workflow engine started, interval=%ss", self._interval)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=self._interval * 2)
            self._thread = None
        logger.info("AI workflow engine stopped")

    def run_once(self) -> None:
        """提供给单元测试或手动触发"""
        self._tick()

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            self._tick()
            self._stop_event.wait(self._interval)

    # ------------------------------------------------------------------ Scheduler
    def _tick(self) -> None:
        try:
            workflows = self._store.list_workflows(enabled_only=True)
            now = datetime.now()
            self._workflow_cache = {wf.id: wf for wf in workflows if wf.id is not None}
            for workflow in workflows:
                self._maybe_schedule_run(workflow, now)
            self._dispatch_pending_runs()
        except Exception as exc:  # noqa: BLE001
            logger.exception("AI workflow engine tick failed: %s", exc)

    def _maybe_schedule_run(self, workflow: AIWorkflow, now: datetime) -> None:
        if not workflow.is_enabled or workflow.id is None:
            return

        if workflow.schedule_cron is None:
            return  # 手动触发

        if workflow.next_run_at and workflow.next_run_at > now:
            return

        running = self._store.list_runs(status="running", workflow_id=workflow.id, limit=workflow.max_concurrency)
        pending = self._store.list_runs(status="pending", workflow_id=workflow.id, limit=workflow.max_concurrency)
        if len(running) + len(pending) >= workflow.max_concurrency:
            return

        run = AIWorkflowRun(
            workflow_id=workflow.id,
            status="pending",
            trigger_type="scheduler",
            trigger_payload={
                "reason": "cron",
                "schedule": workflow.schedule_cron,
            },
        )
        created = self._store.create_run(run)
        interval = self._next_interval_seconds(workflow)
        self._store.update_workflow(
            workflow.code,
            {
                "last_run_at": now,
                "next_run_at": now + timedelta(seconds=interval),
            },
        )
        logger.info(
            "Scheduled workflow %s (run_id=%s)",
            workflow.code,
            created.id,
        )

    def _next_interval_seconds(self, workflow: AIWorkflow) -> int:
        interval = self._interval
        config_interval = (workflow.config or {}).get("interval_seconds")
        if isinstance(config_interval, (int, float)) and config_interval > 0:
            interval = int(config_interval)
        return max(interval, self._interval)

    # -------------------------------------------------------------------- Runner
    def _dispatch_pending_runs(self) -> None:
        running = self._store.list_runs(status="running", limit=self._max_parallel_runs)
        available_slots = max(self._max_parallel_runs - len(running), 0)
        if available_slots == 0:
            return

        pending = self._store.list_runs(status="pending", limit=available_slots)
        for run in pending:
            workflow = self._lookup_workflow(run.workflow_id)
            if not workflow:
                logger.warning("Run %s references missing workflow %s", run.id, run.workflow_id)
                self._store.update_run(run.id, {"status": "failed", "error": "workflow_not_found"})
                continue
            self._execute_run(workflow, run)

    def _lookup_workflow(self, workflow_id: int) -> Optional[AIWorkflow]:
        cached = self._workflow_cache.get(workflow_id)
        if cached:
            return cached
        workflows = self._store.list_workflows(enabled_only=False)
        for workflow in workflows:
            if workflow.id is not None:
                self._workflow_cache[workflow.id] = workflow
            if workflow.id == workflow_id:
                return workflow
        return None

    def _execute_run(self, workflow: AIWorkflow, run: AIWorkflowRun) -> None:
        if run.id is None:
            return

        self._store.update_run(
            run.id,
            {
                "status": "running",
                "started_at": datetime.now(),
            },
        )

        steps = (workflow.config or {}).get("steps", [])
        if not steps:
            logger.info("Workflow %s has no steps, marking run %s as succeeded", workflow.code, run.id)
            self._store.log_event(
                AIEvent(
                    run_id=run.id,
                    event_type="workflow.no_steps",
                    message="Workflow has no steps configured; skipped.",
                )
            )
            self._store.update_run(
                run.id,
                {
                    "status": "succeeded",
                    "finished_at": datetime.now(),
                    "result": {"steps": 0},
                },
            )
            return

        succeeded = True
        for idx, step in enumerate(steps, start=1):
            step_payload = step if isinstance(step, dict) else {}
            adapter_name = step_payload.get("adapter") or "quant_local"
            task = self._store.create_task(
                AIWorkflowTask(
                    run_id=run.id,
                    parent_task_id=None,
                    step_name=step_payload.get("name") or f"step-{idx}",
                    adapter=adapter_name,
                    skill_name=step_payload.get("skill"),
                    status="running",
                    input_payload=step_payload,
                )
            )
            self._store.log_event(
                AIEvent(
                    run_id=run.id,
                    task_id=task.id,
                    event_type="task.started",
                    message=f"Executing step {idx}/{len(steps)}",
                    payload={"step": step},
                )
            )

            try:
                adapter = self._get_adapter(adapter_name)
                output = adapter.execute(step_payload)
                self._store.update_task(
                    task.id,
                    {
                        "status": "succeeded",
                        "finished_at": datetime.now(),
                        "output_payload": output,
                    },
                )
                self._store.log_event(
                    AIEvent(
                        run_id=run.id,
                        task_id=task.id,
                        event_type="task.succeeded",
                        message="Step finished",
                        payload=output,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                succeeded = False
                logger.exception("AI task %s failed: %s", task.id, exc)
                self._store.update_task(
                    task.id,
                    {
                        "status": "failed",
                        "finished_at": datetime.now(),
                        "error": str(exc),
                    },
                )
                self._store.log_event(
                    AIEvent(
                        run_id=run.id,
                        task_id=task.id,
                        event_type="task.failed",
                        level="ERROR",
                        message=str(exc),
                    )
                )
                break

        final_status = "succeeded" if succeeded else "failed"
        self._store.update_run(
            run.id,
            {
                "status": final_status,
                "finished_at": datetime.now(),
                "result": {"steps": len(steps), "success": succeeded},
            },
        )

    def _get_adapter(self, name: str):
        adapter = self._adapter_cache.get(name)
        if adapter:
            return adapter
        settings = self._adapter_settings.get(name, {})
        adapter = load_adapter(name, settings)
        self._adapter_cache[name] = adapter
        return adapter


engine_singleton: Optional[AIWorkflowEngine] = None


def get_engine(store: Optional[AIWorkflowStore] = None) -> AIWorkflowEngine:
    global engine_singleton
    if engine_singleton is None:
        engine_singleton = AIWorkflowEngine(store=store)
    return engine_singleton

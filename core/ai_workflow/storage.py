from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from typing import Any, Dict, List, Optional

from config.config import ConfigManager
from utils.database import DatabaseManager, get_database_manager

from .models import AIEvent, AISkill, AIWorkflow, AIWorkflowRun, AIWorkflowTask


def _coerce_datetime(value: Any) -> Optional[datetime]:
    """Convert common database timestamp representations to datetime."""

    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value)
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            try:
                return datetime.fromtimestamp(float(text))
            except (OSError, OverflowError, ValueError):
                return None
    return None


class AIWorkflowStore:
    """面向 Python 服务的工作流存储封装"""

    def __init__(
        self,
        config: Optional[ConfigManager] = None,
        db: Optional[DatabaseManager] = None,
    ) -> None:
        self._db = db or get_database_manager(config)

    # ------------------------------------------------------------------ Skills
    def register_skill(self, skill: AISkill) -> AISkill:
        skill_id = self._db.upsert_ai_skill(
            {
                "name": skill.name,
                "version": skill.version,
                "description": skill.description,
                "runtime": skill.runtime,
                "entrypoint": skill.entrypoint,
                "parameters_schema": skill.parameters_schema,
                "tags": skill.tags,
                "checksum": skill.checksum,
                "file_path": skill.file_path,
                "enabled": skill.enabled,
                "last_loaded_at": skill.last_loaded_at,
            }
        )
        return replace(skill, id=skill_id)

    def list_skills(self, enabled_only: bool = True) -> List[AISkill]:
        rows = self._db.list_ai_skills(enabled_only=enabled_only)
        return [self._row_to_skill(row) for row in rows]

    # ---------------------------------------------------------------- Workflows
    def upsert_workflow(self, workflow: AIWorkflow) -> AIWorkflow:
        workflow_id = self._db.upsert_ai_workflow(
            {
                "code": workflow.code,
                "name": workflow.name,
                "description": workflow.description,
                "schedule_cron": workflow.schedule_cron,
                "timezone": workflow.timezone,
                "is_enabled": workflow.is_enabled,
                "max_concurrency": workflow.max_concurrency,
                "default_agent": workflow.default_agent,
                "budget_limit": workflow.budget_limit,
                "timeout_seconds": workflow.timeout_seconds,
                "config": workflow.config,
                "last_run_at": workflow.last_run_at,
                "next_run_at": workflow.next_run_at,
            }
        )
        return replace(workflow, id=workflow_id)

    def update_workflow(self, code: str, patch: Dict[str, Any]) -> bool:
        return self._db.update_ai_workflow(code, patch)

    def get_workflow(self, code: str) -> Optional[AIWorkflow]:
        raw = self._db.get_ai_workflow_by_code(code)
        return self._row_to_workflow(raw) if raw else None

    def list_workflows(self, enabled_only: bool = False) -> List[AIWorkflow]:
        rows = self._db.list_ai_workflows(enabled_only=enabled_only)
        return [self._row_to_workflow(row) for row in rows]

    # ------------------------------------------------------------ Workflow runs
    def create_run(self, run: AIWorkflowRun) -> AIWorkflowRun:
        run_id = self._db.insert_ai_workflow_run(
            {
                "workflow_id": run.workflow_id,
                "status": run.status,
                "trigger_type": run.trigger_type,
                "trigger_payload": run.trigger_payload,
                "started_at": run.started_at,
                "finished_at": run.finished_at,
                "cost": run.cost,
                "result": run.result,
                "error": run.error,
                "retry_count": run.retry_count,
            }
        )
        return replace(run, id=run_id, created_at=datetime.now())

    def update_run(self, run_id: int, patch: Dict[str, Any]) -> bool:
        return self._db.update_ai_workflow_run(run_id, patch)

    def get_run(self, run_id: int) -> Optional[AIWorkflowRun]:
        raw = self._db.get_ai_workflow_run(run_id)
        return self._row_to_run(raw) if raw else None

    def list_runs(
        self, status: Optional[str] = None, workflow_id: Optional[int] = None, limit: int = 50
    ) -> List[AIWorkflowRun]:
        rows = self._db.list_ai_workflow_runs(status=status, workflow_id=workflow_id, limit=limit)
        return [self._row_to_run(row) for row in rows]

    # ------------------------------------------------------------------- Tasks
    def create_task(self, task: AIWorkflowTask) -> AIWorkflowTask:
        task_id = self._db.insert_ai_task(
            {
                "run_id": task.run_id,
                "parent_task_id": task.parent_task_id,
                "step_name": task.step_name,
                "adapter": task.adapter,
                "skill_name": task.skill_name,
                "status": task.status,
                "attempt": task.attempt,
                "input_payload": task.input_payload,
                "output_payload": task.output_payload,
                "error": task.error,
                "started_at": task.started_at,
                "finished_at": task.finished_at,
            }
        )
        return replace(task, id=task_id, created_at=datetime.now())

    def update_task(self, task_id: int, patch: Dict[str, Any]) -> bool:
        return self._db.update_ai_task(task_id, patch)

    def list_tasks(
        self, run_id: Optional[int] = None, status: Optional[str] = None, limit: int = 100
    ) -> List[AIWorkflowTask]:
        rows = self._db.list_ai_tasks(run_id=run_id, status=status, limit=limit)
        return [self._row_to_task(row) for row in rows]

    def list_events(
        self, run_id: Optional[int] = None, task_id: Optional[int] = None, limit: int = 200
    ) -> List[AIEvent]:
        rows = self._db.list_ai_events(run_id=run_id, task_id=task_id, limit=limit)
        return [self._row_to_event(row) for row in rows]

    # ------------------------------------------------------------------ Events
    def log_event(self, event: AIEvent) -> AIEvent:
        event_id = self._db.append_ai_event(
            {
                "run_id": event.run_id,
                "task_id": event.task_id,
                "event_type": event.event_type,
                "level": event.level,
                "message": event.message,
                "payload": event.payload,
            }
        )
        return replace(event, id=event_id, created_at=datetime.now())

    # ----------------------------------------------------------------- Helpers
    @staticmethod
    def _row_to_skill(row: Dict[str, Any]) -> AISkill:
        return AISkill(
            id=row.get("id"),
            name=row["name"],
            entrypoint=row.get("entrypoint", ""),
            version=row.get("version", "1.0.0"),
            description=row.get("description"),
            runtime=row.get("runtime", "python"),
            parameters_schema=row.get("parameters_schema"),
            tags=row.get("tags"),
            checksum=row.get("checksum"),
            file_path=row.get("file_path"),
            enabled=bool(row.get("enabled", 1)),
            created_at=_coerce_datetime(row.get("created_at")),
            updated_at=_coerce_datetime(row.get("updated_at")),
            last_loaded_at=_coerce_datetime(row.get("last_loaded_at")),
        )

    @staticmethod
    def _row_to_workflow(row: Dict[str, Any]) -> AIWorkflow:
        return AIWorkflow(
            id=row.get("id"),
            code=row["code"],
            name=row["name"],
            description=row.get("description"),
            schedule_cron=row.get("schedule_cron"),
            timezone=row.get("timezone", "Asia/Shanghai"),
            is_enabled=bool(row.get("is_enabled", 1)),
            max_concurrency=row.get("max_concurrency", 1),
            default_agent=row.get("default_agent"),
            budget_limit=row.get("budget_limit"),
            timeout_seconds=row.get("timeout_seconds"),
            config=row.get("config"),
            last_run_at=_coerce_datetime(row.get("last_run_at")),
            next_run_at=_coerce_datetime(row.get("next_run_at")),
            created_at=_coerce_datetime(row.get("created_at")),
            updated_at=_coerce_datetime(row.get("updated_at")),
        )

    @staticmethod
    def _row_to_run(row: Dict[str, Any]) -> AIWorkflowRun:
        return AIWorkflowRun(
            id=row.get("id"),
            workflow_id=row["workflow_id"],
            status=row["status"],
            trigger_type=row.get("trigger_type", "manual"),
            trigger_payload=row.get("trigger_payload"),
            started_at=_coerce_datetime(row.get("started_at")),
            finished_at=_coerce_datetime(row.get("finished_at")),
            cost=row.get("cost", 0) or 0,
            result=row.get("result"),
            error=row.get("error"),
            retry_count=row.get("retry_count", 0) or 0,
            created_at=_coerce_datetime(row.get("created_at")),
        )

    @staticmethod
    def _row_to_task(row: Dict[str, Any]) -> AIWorkflowTask:
        return AIWorkflowTask(
            id=row.get("id"),
            run_id=row["run_id"],
            parent_task_id=row.get("parent_task_id"),
            step_name=row.get("step_name"),
            adapter=row.get("adapter", ""),
            skill_name=row.get("skill_name"),
            status=row["status"],
            attempt=row.get("attempt", 0) or 0,
            input_payload=row.get("input_payload"),
            output_payload=row.get("output_payload"),
            error=row.get("error"),
            started_at=_coerce_datetime(row.get("started_at")),
            finished_at=_coerce_datetime(row.get("finished_at")),
            created_at=_coerce_datetime(row.get("created_at")),
        )

    @staticmethod
    def _row_to_event(row: Dict[str, Any]) -> AIEvent:
        return AIEvent(
            id=row.get("id"),
            run_id=row.get("run_id"),
            task_id=row.get("task_id"),
            event_type=row.get("event_type", ""),
            level=row.get("level", "INFO"),
            message=row.get("message", ""),
            payload=row.get("payload"),
            created_at=_coerce_datetime(row.get("created_at")),
        )

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

JSONDict = Dict[str, Any]


@dataclass(slots=True)
class AISkill:
    """技能元数据"""

    name: str
    entrypoint: str
    version: str = "1.0.0"
    description: Optional[str] = None
    runtime: str = "python"
    parameters_schema: Optional[JSONDict] = None
    tags: Optional[List[str]] = None
    checksum: Optional[str] = None
    file_path: Optional[str] = None
    enabled: bool = True
    id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_loaded_at: Optional[datetime] = None


@dataclass(slots=True)
class AIWorkflow:
    """自动化工作流配置"""

    code: str
    name: str
    schedule_cron: Optional[str] = None
    timezone: str = "Asia/Shanghai"
    is_enabled: bool = True
    max_concurrency: int = 1
    default_agent: Optional[str] = None
    budget_limit: Optional[float] = None
    timeout_seconds: Optional[int] = None
    config: Optional[JSONDict] = None
    id: Optional[int] = None
    description: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass(slots=True)
class AIWorkflowRun:
    """一次工作流运行实例"""

    workflow_id: int
    status: str
    trigger_type: str
    id: Optional[int] = None
    trigger_payload: Optional[JSONDict] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    cost: float = 0.0
    result: Optional[JSONDict] = None
    error: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[datetime] = None


@dataclass(slots=True)
class AIWorkflowTask:
    """运行中的任务节点"""

    run_id: int
    adapter: str
    status: str
    id: Optional[int] = None
    parent_task_id: Optional[int] = None
    step_name: Optional[str] = None
    skill_name: Optional[str] = None
    attempt: int = 0
    input_payload: Optional[JSONDict] = None
    output_payload: Optional[JSONDict] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


@dataclass(slots=True)
class AIEvent:
    """任务/运行事件"""

    event_type: str
    message: str
    run_id: Optional[int] = None
    task_id: Optional[int] = None
    level: str = "INFO"
    payload: Optional[JSONDict] = None
    id: Optional[int] = None
    created_at: Optional[datetime] = None

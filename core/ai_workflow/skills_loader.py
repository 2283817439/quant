from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Tuple

import yaml

from config.ai_settings import get_ai_workflow_settings
from utils.database import PaperclipSkillSyncer
from utils.logger import sys_logger

from .models import AISkill, AIWorkflow
from .storage import AIWorkflowStore

logger = sys_logger.getChild("AISkillLoader")


class AISkillLoader:
    """从 ai-skills 目录加载技能并注册到数据库"""

    def __init__(
        self,
        store: AIWorkflowStore,
        roots: Optional[List[str]] = None,
    ) -> None:
        settings = get_ai_workflow_settings()
        skills_conf = settings.get("skills", {})
        configured_roots = roots or skills_conf.get("roots", ["ai-skills/builtin"])
        self._roots = [Path(path).resolve() for path in configured_roots]
        self._store = store
        self._company_id = int(skills_conf.get("company_id", 1))
        self._skill_syncer = PaperclipSkillSyncer()

    def sync(self) -> None:
        synced_records = []
        for skill_file in self._iter_skill_files():
            try:
                data = self._load_file(skill_file)
                if not data:
                    continue
                if "name" not in data:
                    logger.warning("Skill file %s missing required 'name', skipping", skill_file)
                    continue
                skill = AISkill(
                    name=data["name"],
                    entrypoint=data.get("entrypoint", ""),
                    version=data.get("version", "1.0.0"),
                    description=data.get("description"),
                    runtime=data.get("runtime", "python"),
                    parameters_schema=data.get("parameters_schema"),
                    tags=data.get("tags"),
                    checksum=data.get("checksum"),
                    file_path=str(skill_file),
                )
                registered = self._store.register_skill(skill)
                logger.info("Registered AI skill %s (id=%s)", registered.name, registered.id)
                synced_records.append(self._build_sync_record(data, skill_file))

                workflow_def = data.get("workflow")
                if workflow_def:
                    workflow = AIWorkflow(
                        code=workflow_def["code"],
                        name=workflow_def.get("name", data["name"]),
                        description=workflow_def.get("description", data.get("description")),
                        schedule_cron=workflow_def.get("schedule_cron"),
                        timezone=workflow_def.get("timezone", "Asia/Shanghai"),
                        is_enabled=workflow_def.get("is_enabled", True),
                        max_concurrency=workflow_def.get("max_concurrency", 1),
                        default_agent=workflow_def.get("default_agent"),
                        budget_limit=workflow_def.get("budget_limit"),
                        timeout_seconds=workflow_def.get("timeout_seconds"),
                        config=self._merge_workflow_config(workflow_def.get("config"), data.get("steps")),
                    )
                    saved = self._store.upsert_workflow(workflow)
                    logger.info("Upserted workflow %s (id=%s)", saved.code, saved.id)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed to load skill from %s: %s", skill_file, exc)
        if synced_records:
            try:
                self._skill_syncer.sync(self._company_id, synced_records)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed to sync skills to Paperclip MySQL: %s", exc)

    def _iter_skill_files(self):
        for root in self._roots:
            if not root.exists():
                logger.debug("Skill root %s does not exist, skipping", root)
                continue
            for path in root.rglob("*"):
                if not path.is_file():
                    continue
                suffix = path.suffix.lower()
                if suffix == ".json":
                    yield path
                elif suffix in {".md", ".markdown"} and path.name.lower() in {"skill.md", "skill.markdown"}:
                    yield path

    def _load_file(self, path: Path) -> Optional[dict]:
        suffix = path.suffix.lower()
        if suffix == ".json":
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        if suffix in {".md", ".markdown"}:
            return self._load_markdown_skill(path)
        logger.warning("Unsupported skill file type for %s", path)
        return None

    def _load_markdown_skill(self, path: Path) -> Optional[dict]:
        content = path.read_text(encoding="utf-8")
        front_matter, body = self._extract_front_matter(content)
        if front_matter is None:
            logger.warning("Skill %s missing YAML front matter, skipping", path)
            return None

        metadata = yaml.safe_load(front_matter) or {}
        if not isinstance(metadata, dict):
            logger.warning("Skill %s front matter must be a mapping", path)
            return None

        if "name" not in metadata:
            logger.warning("Skill %s front matter missing required 'name' field", path)
            return None

        description = metadata.get("description") or self._extract_description_from_body(body)
        if description:
            metadata["description"] = description

        return metadata

    @staticmethod
    def _extract_front_matter(content: str) -> Tuple[Optional[str], str]:
        lines = content.splitlines()
        if not lines:
            return None, ""

        start_idx = None
        for idx, line in enumerate(lines):
            if line.strip() == "---":
                start_idx = idx
                break
            if line.strip():
                # Encountered non-empty before front matter marker
                return None, content

        if start_idx is None:
            return None, content

        end_idx = None
        for idx in range(start_idx + 1, len(lines)):
            if lines[idx].strip() == "---":
                end_idx = idx
                break

        if end_idx is None:
            return None, content

        front_matter = "\n".join(lines[start_idx + 1 : end_idx])
        body = "\n".join(lines[end_idx + 1 :])
        return front_matter, body

    @staticmethod
    def _extract_description_from_body(body: str) -> Optional[str]:
        for line in body.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            return stripped
        return None

    @staticmethod
    def _merge_workflow_config(config: Optional[dict], steps: Optional[list]) -> dict:
        merged = dict(config or {})
        if steps:
            merged["steps"] = steps
        return merged

    def _build_sync_record(self, data: dict, path: Path) -> dict:
        code = data.get("code")
        if not code:
            try:
                code = path.read_text(encoding="utf-8")
            except OSError:
                code = ""
        parameters = data.get("parameters")
        if parameters is None:
            parameters = data.get("parameters_schema")
        return {
            "name": data["name"],
            "description": data.get("description"),
            "category": data.get("category"),
            "version": data.get("version", "1.0.0"),
            "code": code,
            "parameters": parameters,
        }

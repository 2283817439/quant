"""Local Paperclip adapter registry used by the API.

The production Paperclip server is optional.  This fallback keeps the
quantitative API startable and exposes explicit health status instead of
failing import-time when that external service is absent.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from threading import Event, Thread
from time import monotonic
from typing import Any


@dataclass
class Check:
    code: str
    level: str
    message: str
    detail: str | None = None
    hint: str | None = None


@dataclass
class Model:
    id: str
    label: str
    source: str | None = None


@dataclass
class Adapter:
    adapter_type: str
    label: str
    package_name: str | None = None
    version: str | None = None
    description: str | None = None
    models: list[Model] = field(default_factory=list)
    configuration_doc: str | None = None


@dataclass
class TestResult:
    adapter_type: str
    status: str
    started_at: datetime
    duration_ms: int
    checks: list[Check] = field(default_factory=list)


@dataclass
class Heartbeat:
    adapter_type: str
    status: str
    tested_at: datetime | None = None
    summary: str | None = None
    checks: list[Check] = field(default_factory=list)


class PaperclipIntegrationService:
    def __init__(self, *_args: Any, heartbeat_interval_seconds: int = 300, **_kwargs: Any) -> None:
        self.heartbeat_interval_seconds = max(30, int(heartbeat_interval_seconds))
        self._heartbeats: dict[str, Heartbeat] = {}
        self._stop = Event()
        self._thread: Thread | None = None
        self._adapters = [
            Adapter(
                adapter_type="local",
                label="Local quant adapter",
                package_name="quant",
                version="1.0",
                description="Read-only local adapter for development and health checks.",
                models=[Model(id="local", label="Local runtime", source="built-in")],
            )
        ]

    def list_adapters(self) -> list[Adapter]:
        return list(self._adapters)

    def get_adapter(self, adapter_type: str) -> Adapter | None:
        return next((item for item in self._adapters if item.adapter_type == adapter_type), None)

    def get_heartbeat(self, adapter_type: str) -> Heartbeat | None:
        return self._heartbeats.get(adapter_type)

    def list_heartbeats(self) -> list[Heartbeat]:
        return list(self._heartbeats.values())

    def run_environment_test(self, adapter_type: str, adapter_config: dict[str, Any] | None = None,
                             persist_for_heartbeat: bool = True) -> TestResult:
        del adapter_config
        started = datetime.now()
        begin = monotonic()
        if self.get_adapter(adapter_type) is None:
            raise ValueError(f"Unknown adapter type: {adapter_type}")
        result = TestResult(
            adapter_type=adapter_type,
            status="passed",
            started_at=started,
            duration_ms=max(1, int((monotonic() - begin) * 1000)),
            checks=[Check(code="runtime", level="info", message="Local adapter is available")],
        )
        if persist_for_heartbeat:
            self._heartbeats[adapter_type] = Heartbeat(
                adapter_type=adapter_type,
                status=result.status,
                tested_at=started,
                summary="Local adapter health check passed",
                checks=result.checks,
            )
        return result

    def run_heartbeat_cycle(self) -> None:
        for adapter in self._adapters:
            self.run_environment_test(adapter.adapter_type)

    def start_heartbeat(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self.run_heartbeat_cycle()
        self._thread = Thread(target=self._heartbeat_loop, name="paperclip-heartbeat", daemon=True)
        self._thread.start()

    def _heartbeat_loop(self) -> None:
        while not self._stop.wait(self.heartbeat_interval_seconds):
            self.run_heartbeat_cycle()

    def stop_heartbeat(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self._thread = None

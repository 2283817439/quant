from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .models import EvaluationMetrics, ParameterTrial


class EvaluationStore:
    """SQLite reference store; production can map this schema to PostgreSQL."""

    def __init__(self, path: str | Path = "data/evaluations.db") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS strategy_trials (
                trial_id INTEGER PRIMARY KEY AUTOINCREMENT, strategy_id TEXT NOT NULL,
                parameters_json TEXT NOT NULL, metrics_json TEXT NOT NULL,
                score REAL NOT NULL, phase TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS idx_strategy_trials ON strategy_trials(strategy_id, score DESC)")

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=30.0)
        db.row_factory = sqlite3.Row
        try:
            yield db; db.commit()
        except Exception:
            db.rollback(); raise
        finally:
            db.close()

    def record(self, strategy_id: str, parameters: dict[str, Any], metrics: EvaluationMetrics,
               score: float, phase: str) -> ParameterTrial:
        with self._connection() as db:
            row = db.execute("INSERT INTO strategy_trials(strategy_id, parameters_json, metrics_json, score, phase) VALUES (?, ?, ?, ?, ?) RETURNING trial_id", (strategy_id, json.dumps(parameters, sort_keys=True), json.dumps(metrics.as_dict(), sort_keys=True), score, phase)).fetchone()
        return ParameterTrial(int(row["trial_id"]), strategy_id, parameters, metrics, score, phase)

    def best(self, strategy_id: str) -> ParameterTrial | None:
        with self._connection() as db:
            row = db.execute("SELECT * FROM strategy_trials WHERE strategy_id=? ORDER BY score DESC, trial_id ASC LIMIT 1", (strategy_id,)).fetchone()
        if not row:
            return None
        return ParameterTrial(int(row["trial_id"]), strategy_id, json.loads(row["parameters_json"]), EvaluationMetrics(**json.loads(row["metrics_json"])), float(row["score"]), row["phase"])

    def list_trials(self, strategy_id: str) -> list[ParameterTrial]:
        with self._connection() as db:
            rows = db.execute("SELECT * FROM strategy_trials WHERE strategy_id=? ORDER BY trial_id", (strategy_id,)).fetchall()
        return [ParameterTrial(int(row["trial_id"]), strategy_id, json.loads(row["parameters_json"]), EvaluationMetrics(**json.loads(row["metrics_json"])), float(row["score"]), row["phase"]) for row in rows]

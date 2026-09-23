from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path
from statistics import mean
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.feedback import BayesianOptimizer, EvaluationMetrics, EvaluationStore, GeneticOptimizer

BOUNDS = {"x": (0.0, 1.0), "y": (0.0, 1.0), "z": (0.0, 1.0)}
OPTIMUM = {"x": 0.72, "y": 0.28, "z": 0.61}


def benchmark_evaluator(params: dict[str, Any]) -> EvaluationMetrics:
    distance = sum((float(params[name]) - OPTIMUM[name]) ** 2 for name in OPTIMUM) ** 0.5
    sharpe = 3.0 - 4.0 * distance
    drawdown = 0.04 + 0.10 * distance
    return EvaluationMetrics(
        sharpe=sharpe,
        max_drawdown=drawdown,
        out_of_sample_return=0.20 - 0.08 * distance,
        trade_count=200,
        turnover=4.0 + distance,
        stability_score=0.92 - 0.10 * distance,
    )


def _distance(params: dict[str, Any]) -> float:
    return sum((float(params[name]) - OPTIMUM[name]) ** 2 for name in OPTIMUM) ** 0.5


def _curve(trials, checkpoints: list[int]) -> list[dict[str, float]]:
    result = []
    for checkpoint in checkpoints:
        prefix = trials[:checkpoint]
        best = max(prefix, key=lambda trial: trial.score)
        result.append({"evaluations": checkpoint, "best_score": best.score, "distance": _distance(best.parameters)})
    return result


def run_benchmark(repetitions: int = 3) -> dict[str, Any]:
    reports: dict[str, list[dict[str, Any]]] = {"genetic": [], "bayesian": []}
    with tempfile.TemporaryDirectory(prefix="quant-benchmark-") as directory:
        for repetition in range(repetitions):
            ga_store = EvaluationStore(Path(directory) / f"ga-{repetition}.db")
            start = time.perf_counter()
            _, best, trials, _ = GeneticOptimizer(ga_store, benchmark_evaluator, seed=100 + repetition).optimize(
                f"ga-{repetition}", BOUNDS, generations=8, population_size=10
            )
            elapsed = time.perf_counter() - start
            reports["genetic"].append({
                "elapsed_seconds": elapsed, "evaluations": len(trials),
                "best_score": best.score, "best_distance": _distance(best.parameters),
                "convergence": _curve(trials, [10, 20, 40, 80]),
            })

            bo_store = EvaluationStore(Path(directory) / f"bo-{repetition}.db")
            start = time.perf_counter()
            _, best, trials, _ = BayesianOptimizer(bo_store, benchmark_evaluator, seed=200 + repetition).optimize(
                f"bo-{repetition}", BOUNDS, iterations=80, initial_points=10
            )
            elapsed = time.perf_counter() - start
            reports["bayesian"].append({
                "elapsed_seconds": elapsed, "evaluations": len(trials),
                "best_score": best.score, "best_distance": _distance(best.parameters),
                "convergence": _curve(trials, [10, 20, 40, 80]),
            })

    summary = {}
    for name, entries in reports.items():
        summary[name] = {
            "mean_elapsed_seconds": mean(entry["elapsed_seconds"] for entry in entries),
            "mean_evaluations": mean(entry["evaluations"] for entry in entries),
            "mean_best_score": mean(entry["best_score"] for entry in entries),
            "mean_best_distance": mean(entry["best_distance"] for entry in entries),
            "runs": entries,
        }
    return {"bounds": BOUNDS, "optimum": OPTIMUM, "repetitions": repetitions, "summary": summary}


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark quant parameter optimizers")
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    report = run_benchmark(max(1, args.repetitions))
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()

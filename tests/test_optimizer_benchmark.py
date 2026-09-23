from benchmarks.optimizer_benchmark import run_benchmark


def test_optimizer_benchmark_reports_convergence():
    report = run_benchmark(repetitions=1)
    assert set(report["summary"]) == {"genetic", "bayesian"}
    for summary in report["summary"].values():
        assert summary["mean_evaluations"] > 0
        assert summary["mean_best_distance"] >= 0
        assert len(summary["runs"][0]["convergence"]) == 4

# Optimizer Benchmarks

Run the reproducible comparison from the repository root:

```bash
python3 benchmarks/optimizer_benchmark.py --repetitions 5 --output benchmarks/results.json
```

The benchmark uses the same bounded three-dimensional objective, the same number of evaluator calls, fixed seeds, and a temporary evaluation store. It reports elapsed time, evaluation count, best objective score, distance to the known optimum, and best-so-far convergence at 10, 20, 40, and 80 evaluations.

A two-repetition smoke run in this environment produced the following illustrative result:

| Optimizer | Evaluations | Mean elapsed | Mean best score | Mean distance to optimum |
|---|---:|---:|---:|---:|
| Genetic | 80 | 0.066 s | 3.0370 | 0.0592 |
| Bayesian-style UCB | 80 | 3.059 s | 2.9720 | 0.0744 |

These timings are environment-dependent and should not be treated as production capacity guarantees. The current Bayesian-style implementation evaluates a larger acquisition candidate pool, so it spends more CPU in surrogate scoring. The benchmark is intended to expose that trade-off and to compare convergence, not to claim that one optimizer is universally superior.

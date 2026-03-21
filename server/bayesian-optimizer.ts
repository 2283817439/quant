/**
 * Bayesian optimizer.
 */

export interface ParameterRange {
  min: number;
  max: number;
}

export interface ParameterRanges {
  [key: string]: ParameterRange;
}

export interface BayesianOptimizationResult {
  parameters: Record<string, number>;
  objectiveValue: number;
  uncertainty: number;
  iteration: number;
}

export interface BayesianOptimizationCallback {
  onIteration: (result: BayesianOptimizationResult) => Promise<void>;
  onProgress: (progress: number, iteration: number, total: number) => Promise<void>;
}

class SimpleGaussianProcess {
  private observations: Array<{ x: Record<string, number>; y: number }> = [];
  private paramNames: string[] = [];

  constructor(paramNames: string[]) {
    this.paramNames = paramNames;
  }

  addObservation(x: Record<string, number>, y: number) {
    this.observations.push({ x, y });
  }

  predict(x: Record<string, number>): { mean: number; std: number } {
    if (this.observations.length === 0) {
      return { mean: 0, std: 1 };
    }

    let totalWeight = 0;
    let weightedMean = 0;

    for (const obs of this.observations) {
      const distance = this.euclideanDistance(x, obs.x);
      const weight = Math.exp(-distance * distance);
      totalWeight += weight;
      weightedMean += weight * obs.y;
    }

    const mean = totalWeight > 0 ? weightedMean / totalWeight : 0;

    let minDistance = Infinity;
    for (const obs of this.observations) {
      const distance = this.euclideanDistance(x, obs.x);
      minDistance = Math.min(minDistance, distance);
    }

    const std = Math.exp(-minDistance * minDistance) + 0.1;
    return { mean, std };
  }

  private euclideanDistance(x1: Record<string, number>, x2: Record<string, number>): number {
    let sum = 0;
    for (const param of this.paramNames) {
      const diff = (x1[param] || 0) - (x2[param] || 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

function acquisitionFunctionUCB(mean: number, std: number, kappa = 2.576): number {
  return mean + kappa * std;
}

function generateRandomParameters(parameterRanges: ParameterRanges): Record<string, number> {
  const parameters: Record<string, number> = {};
  for (const paramName in parameterRanges) {
    const range = parameterRanges[paramName];
    parameters[paramName] = range.min + Math.random() * (range.max - range.min);
  }
  return parameters;
}

function findBestCandidate(
  gp: SimpleGaussianProcess,
  parameterRanges: ParameterRanges,
  numCandidates = 1000
): Record<string, number> {
  let bestParameters = generateRandomParameters(parameterRanges);
  let bestAcquisitionValue = -Infinity;

  for (let i = 0; i < numCandidates; i++) {
    const candidate = generateRandomParameters(parameterRanges);
    const { mean, std } = gp.predict(candidate);
    const acquisitionValue = acquisitionFunctionUCB(mean, std);

    if (acquisitionValue > bestAcquisitionValue) {
      bestAcquisitionValue = acquisitionValue;
      bestParameters = candidate;
    }
  }

  return bestParameters;
}

export async function executeBayesianOptimization(
  parameterRanges: ParameterRanges,
  evaluationFunction: (parameters: Record<string, number>) => Promise<number>,
  callback: BayesianOptimizationCallback,
  maxIterations = 50,
  initialSamples = 5
): Promise<BayesianOptimizationResult[]> {
  const paramNames = Object.keys(parameterRanges);
  const gp = new SimpleGaussianProcess(paramNames);
  const results: BayesianOptimizationResult[] = [];

  for (let i = 0; i < initialSamples && i < maxIterations; i++) {
    const parameters = generateRandomParameters(parameterRanges);

    try {
      const objectiveValue = await evaluationFunction(parameters);
      gp.addObservation(parameters, objectiveValue);

      const result: BayesianOptimizationResult = {
        parameters,
        objectiveValue,
        uncertainty: 1,
        iteration: i + 1,
      };

      results.push(result);
      await callback.onIteration(result);
      await callback.onProgress(((i + 1) / maxIterations) * 100, i + 1, maxIterations);
    } catch (error) {
      console.error(`Error evaluating parameters at iteration ${i + 1}:`, error);
    }
  }

  for (let i = initialSamples; i < maxIterations; i++) {
    const candidate = findBestCandidate(gp, parameterRanges);

    try {
      const objectiveValue = await evaluationFunction(candidate);
      const { std } = gp.predict(candidate);
      gp.addObservation(candidate, objectiveValue);

      const result: BayesianOptimizationResult = {
        parameters: candidate,
        objectiveValue,
        uncertainty: std,
        iteration: i + 1,
      };

      results.push(result);
      await callback.onIteration(result);
      await callback.onProgress(((i + 1) / maxIterations) * 100, i + 1, maxIterations);
    } catch (error) {
      console.error(`Error evaluating parameters at iteration ${i + 1}:`, error);
    }
  }

  return results;
}

export function findOptimalParameters(
  results: BayesianOptimizationResult[],
  maximize = true
): BayesianOptimizationResult | null {
  if (results.length === 0) return null;

  let optimal = results[0];
  for (const result of results) {
    if (maximize) {
      if (result.objectiveValue > optimal.objectiveValue) {
        optimal = result;
      }
    } else if (result.objectiveValue < optimal.objectiveValue) {
      optimal = result;
    }
  }

  return optimal;
}

export function getBayesianOptimizationStatistics(results: BayesianOptimizationResult[]) {
  if (results.length === 0) {
    return {
      count: 0,
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      avgUncertainty: 0,
    };
  }

  const values = results.map((r) => r.objectiveValue);
  const uncertainties = results.map((r) => r.uncertainty);

  const count = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / count;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count;
  const std = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[count - 1];
  const avgUncertainty = uncertainties.reduce((a, b) => a + b, 0) / count;

  return {
    count,
    mean,
    std,
    min,
    max,
    avgUncertainty,
  };
}

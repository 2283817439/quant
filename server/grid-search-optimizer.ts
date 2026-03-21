/**
 * Grid search optimizer.
 */

export interface ParameterRange {
  min: number;
  max: number;
  step: number;
}

export interface ParameterRanges {
  [key: string]: ParameterRange;
}

export interface GridSearchResult {
  parameters: Record<string, number>;
  objectiveValue: number;
  iteration: number;
}

export interface GridSearchCallback {
  onIteration: (result: GridSearchResult) => Promise<void>;
  onProgress: (progress: number, iteration: number, total: number) => Promise<void>;
}

export function generateGridParameters(parameterRanges: ParameterRanges): Record<string, number>[] {
  const paramNames = Object.keys(parameterRanges);
  const paramValues: number[][] = [];

  for (const paramName of paramNames) {
    const range = parameterRanges[paramName];
    const values: number[] = [];
    for (let value = range.min; value <= range.max + 1e-10; value += range.step) {
      values.push(parseFloat(value.toFixed(6)));
    }
    paramValues.push(values);
  }

  const combinations: Record<string, number>[] = [];
  const indices = new Array(paramNames.length).fill(0);

  while (true) {
    const combination: Record<string, number> = {};
    for (let i = 0; i < paramNames.length; i++) {
      combination[paramNames[i]] = paramValues[i][indices[i]];
    }
    combinations.push(combination);

    let carry = 1;
    for (let i = paramNames.length - 1; i >= 0 && carry; i--) {
      indices[i] += carry;
      if (indices[i] >= paramValues[i].length) {
        indices[i] = 0;
      } else {
        carry = 0;
      }
    }

    if (carry) break;
  }

  return combinations;
}

export function calculateGridSearchIterations(parameterRanges: ParameterRanges): number {
  let total = 1;
  for (const paramName in parameterRanges) {
    const range = parameterRanges[paramName];
    const count = Math.round((range.max - range.min) / range.step) + 1;
    total *= count;
  }
  return total;
}

export async function executeGridSearch(
  parameterRanges: ParameterRanges,
  evaluationFunction: (parameters: Record<string, number>) => Promise<number>,
  callback: GridSearchCallback,
  maxIterations?: number
): Promise<GridSearchResult[]> {
  const allParameters = generateGridParameters(parameterRanges);
  const totalIterations = Math.min(allParameters.length, maxIterations || allParameters.length);
  const results: GridSearchResult[] = [];

  for (let i = 0; i < totalIterations; i++) {
    const parameters = allParameters[i];

    try {
      const objectiveValue = await evaluationFunction(parameters);

      const result: GridSearchResult = {
        parameters,
        objectiveValue,
        iteration: i + 1,
      };

      results.push(result);

      await callback.onIteration(result);
      await callback.onProgress(
        ((i + 1) / totalIterations) * 100,
        i + 1,
        totalIterations
      );
    } catch (error) {
      console.error(`Error evaluating parameters at iteration ${i + 1}:`, error);
    }
  }

  return results;
}

export function findOptimalParameters(
  results: GridSearchResult[],
  maximize = true
): GridSearchResult | null {
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

export function getGridSearchStatistics(results: GridSearchResult[]) {
  if (results.length === 0) {
    return {
      count: 0,
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      median: 0,
    };
  }

  const values = results.map((r) => r.objectiveValue);
  const count = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / count;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count;
  const std = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[count - 1];
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  return {
    count,
    mean,
    std,
    min,
    max,
    median,
  };
}

export function limitGridSearchSpace(
  parameterRanges: ParameterRanges,
  maxIterations: number
): ParameterRanges {
  const limited: ParameterRanges = {};
  const paramNames = Object.keys(parameterRanges);
  const targetValuesPerParam = Math.pow(maxIterations, 1 / paramNames.length);

  for (const paramName of paramNames) {
    const range = parameterRanges[paramName];
    const currentCount = Math.round((range.max - range.min) / range.step) + 1;
    const targetCount = Math.max(2, Math.floor(targetValuesPerParam));

    if (currentCount <= targetCount) {
      limited[paramName] = range;
    } else {
      const newStep = (range.max - range.min) / (targetCount - 1);
      limited[paramName] = {
        min: range.min,
        max: range.max,
        step: newStep,
      };
    }
  }

  return limited;
}

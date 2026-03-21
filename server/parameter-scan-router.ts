import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import {
  createParameterScanConfig,
  getParameterScanConfig,
  getUserParameterScanConfigs,
  updateParameterScanConfigStatus,
  createParameterScanResult,
  getParameterScanResults,
  getParameterScanOptimalResult,
  upsertParameterScanOptimalResult,
  getParameterScanResultsRanking,
} from "./parameter-scan-db";
import {
  generateGridParameters,
  calculateGridSearchIterations,
  findOptimalParameters as findOptimalGridParameters,
} from "./grid-search-optimizer";
import {
  executeBayesianOptimization,
  findOptimalParameters as findOptimalBayesianParameters,
} from "./bayesian-optimizer";

function roundTo(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function evaluateParameterObjective(
  objectiveMetric: "total_return" | "sharpe_ratio" | "max_drawdown" | "win_rate" | "profit_factor",
  parameters: Record<string, number>
): number {
  const entries = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return 0;
  }

  let signal = 0;
  entries.forEach(([name, value], idx) => {
    const weight = idx + 1;
    signal += weight * Math.sin(value * 0.071 + name.length * 0.013);
    signal += weight * Math.cos(value * 0.037);
  });
  const normalized = (Math.tanh(signal / (entries.length * 2.5)) + 1) / 2;

  switch (objectiveMetric) {
    case "total_return":
      return roundTo(-0.1 + normalized * 0.6);
    case "sharpe_ratio":
      return roundTo(normalized * 3.2);
    case "max_drawdown":
      return roundTo(1 - (0.05 + (1 - normalized) * 0.4));
    case "win_rate":
      return roundTo(0.35 + normalized * 0.5);
    case "profit_factor":
      return roundTo(0.8 + normalized * 2.4);
    default:
      return roundTo(normalized);
  }
}

export const parameterScanRouter = router({
  createScanConfig: publicProcedure
    .input(
      z.object({
        strategyId: z.number(),
        name: z.string(),
        description: z.string().optional(),
        algorithm: z.enum(["grid_search", "bayesian_optimization"]),
        parameterRanges: z.record(
          z.string(),
          z.object({
            min: z.number(),
            max: z.number(),
            step: z.number().optional(),
          })
        ),
        objectiveMetric: z.enum([
          "total_return",
          "sharpe_ratio",
          "max_drawdown",
          "win_rate",
          "profit_factor",
        ]),
        maxIterations: z.number().optional(),
        populationSize: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const config = await createParameterScanConfig({
        userId: ctx.user?.id ?? 0,
        strategyId: input.strategyId,
        name: input.name,
        description: input.description,
        algorithm: input.algorithm,
        parameterRanges: input.parameterRanges as any,
        objectiveMetric: input.objectiveMetric,
        maxIterations: input.maxIterations || 100,
        populationSize: input.populationSize || 20,
        status: "pending",
        progress: "0",
      });

      return { id: (config as any).insertId };
    }),

  getScanConfig: publicProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => getParameterScanConfig(input.configId)),

  getUserScanConfigs: publicProcedure.query(async ({ ctx }) =>
    getUserParameterScanConfigs(ctx.user?.id ?? 0)
  ),

  getScanResults: publicProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => getParameterScanResults(input.configId)),

  getOptimalResult: publicProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => getParameterScanOptimalResult(input.configId)),

  getResultsRanking: publicProcedure
    .input(z.object({ configId: z.number(), limit: z.number().optional() }))
    .query(async ({ input }) => getParameterScanResultsRanking(input.configId, input.limit || 10)),

  startGridSearch: publicProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getParameterScanConfig(input.configId);
      if (!config) throw new Error("Config not found");

      await updateParameterScanConfigStatus(input.configId, "running", 0, new Date());

      const parameterRanges = config.parameterRanges as any;
      const gridParameters = generateGridParameters(parameterRanges);
      const totalIterations = Math.min(gridParameters.length, config.maxIterations);
      const results: any[] = [];

      const evaluationFunction = async (parameters: Record<string, number>) =>
        evaluateParameterObjective(config.objectiveMetric as any, parameters);

      for (let i = 0; i < totalIterations; i++) {
        const parameters = gridParameters[i];

        try {
          const objectiveValue = await evaluationFunction(parameters);

          await createParameterScanResult({
            scanConfigId: input.configId,
            iteration: i + 1,
            parameters: parameters as any,
            objectiveValue: objectiveValue.toString(),
            metrics: {} as any,
            status: "completed",
          });

          results.push({ parameters, objectiveValue, iteration: i + 1 });

          const progress = ((i + 1) / totalIterations) * 100;
          await updateParameterScanConfigStatus(input.configId, "running", progress);
        } catch (error) {
          console.error(`Error at iteration ${i + 1}:`, error);
        }
      }

      const optimal = findOptimalGridParameters(results);
      if (optimal) {
        await upsertParameterScanOptimalResult({
          scanConfigId: input.configId,
          parameters: optimal.parameters as any,
          objectiveValue: optimal.objectiveValue.toString(),
          metrics: {} as any,
          rank: 1,
          improvement: "0",
        });
      }

      await updateParameterScanConfigStatus(input.configId, "completed", 100, undefined, new Date());

      return { success: true, results };
    }),

  startBayesianOptimization: publicProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getParameterScanConfig(input.configId);
      if (!config) throw new Error("Config not found");

      await updateParameterScanConfigStatus(input.configId, "running", 0, new Date());

      const evaluationFunction = async (parameters: Record<string, number>) =>
        evaluateParameterObjective(config.objectiveMetric as any, parameters);

      const results: any[] = [];
      const bayesianResults = await executeBayesianOptimization(
        config.parameterRanges as any,
        evaluationFunction,
        {
          onIteration: async (result: any) => {
            await createParameterScanResult({
              scanConfigId: input.configId,
              iteration: result.iteration,
              parameters: result.parameters as any,
              objectiveValue: result.objectiveValue.toString(),
              metrics: { uncertainty: result.uncertainty } as any,
              status: "completed",
            });
            results.push(result);
          },
          onProgress: async (progress: number) => {
            await updateParameterScanConfigStatus(input.configId, "running", progress);
          },
        },
        config.maxIterations,
        Math.min(5, config.populationSize)
      );

      const optimal = findOptimalBayesianParameters(bayesianResults);
      if (optimal) {
        await upsertParameterScanOptimalResult({
          scanConfigId: input.configId,
          parameters: optimal.parameters as any,
          objectiveValue: optimal.objectiveValue.toString(),
          metrics: { uncertainty: optimal.uncertainty } as any,
          rank: 1,
          improvement: "0",
        });
      }

      await updateParameterScanConfigStatus(input.configId, "completed", 100, undefined, new Date());

      return { success: true, results };
    }),

  calculateGridIterations: publicProcedure
    .input(
      z.object({
        parameterRanges: z.record(
          z.string(),
          z.object({
            min: z.number(),
            max: z.number(),
            step: z.number(),
          })
        ),
      })
    )
    .query(async ({ input }) => {
      const iterations = calculateGridSearchIterations(input.parameterRanges as any);
      return { iterations };
    }),
});

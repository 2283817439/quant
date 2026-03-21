import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { executeGridSearch, getTotalCombinations, validateParameterRanges, type GridSearchProgress } from "./optimization/grid-search";
import { executeBayesianOptimization, validateBayesianConfig, type BayesianOptimizationProgress } from "./optimization/bayesian-optimization";

// 存储优化任务的状态
const optimizationTasks = new Map<
  number,
  | { type: 'grid'; progress: GridSearchProgress; config: any }
  | { type: 'bayesian'; progress: BayesianOptimizationProgress; config: any }
>();

let taskIdCounter = 0;

export const optimizationRouter = router({
  // ============ 网格搜索 ============
  
  /**
   * 启动网格搜索任务
   */
  startGridSearch: publicProcedure
    .input(
      z.object({
        strategyId: z.number(),
        parameterRanges: z.array(
          z.object({
            name: z.string(),
            values: z.array(z.number()),
          })
        ),
        backtestStart: z.string(),
        backtestEnd: z.string(),
        initialCapital: z.number(),
        targetCount: z.number(),
        frequency: z.enum(['daily', 'weekly', 'monthly']),
        objective: z.enum(['max_sharpe', 'max_return', 'min_drawdown', 'max_calmar']),
      })
    )
    .mutation(async ({ input }) => {
      // 验证参数范围
      const validation = validateParameterRanges(input.parameterRanges);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.errors.join(', '),
        });
      }

      const taskId = ++taskIdCounter;
      
      // 异步执行网格搜索
      (async () => {
        try {
          const progress = await executeGridSearch({
            strategyId: input.strategyId,
            parameterRanges: input.parameterRanges,
            backtestStart: input.backtestStart,
            backtestEnd: input.backtestEnd,
            initialCapital: input.initialCapital,
            targetCount: input.targetCount,
            frequency: input.frequency,
            objective: input.objective,
          });
          
          optimizationTasks.set(taskId, { type: 'grid', progress, config: input });
        } catch (error) {
          console.error('[Optimization] Grid search failed:', error);
          optimizationTasks.delete(taskId);
        }
      })();

      return { taskId, totalCombinations: getTotalCombinations(input.parameterRanges) };
    }),

  /**
   * 获取网格搜索任务进度
   */
  getGridSearchProgress: publicProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const task = optimizationTasks.get(input.taskId);
      
      if (!task || task.type !== 'grid') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '任务不存在或不是网格搜索任务',
        });
      }

      return task.progress;
    }),

  // ============ 贝叶斯优化 ============
  
  /**
   * 启动贝叶斯优化任务
   */
  startBayesianOptimization: publicProcedure
    .input(
      z.object({
        strategyId: z.number(),
        parameterBounds: z.array(
          z.object({
            name: z.string(),
            min: z.number(),
            max: z.number(),
          })
        ),
        backtestStart: z.string(),
        backtestEnd: z.string(),
        initialCapital: z.number(),
        targetCount: z.number(),
        frequency: z.enum(['daily', 'weekly', 'monthly']),
        objective: z.enum(['max_sharpe', 'max_return', 'min_drawdown', 'max_calmar']),
        nIterations: z.number().min(10).max(200),
        nInitialPoints: z.number().min(2).max(50),
        acquisitionFunction: z.enum(['ei', 'ucb', 'pi']).default('ei'),
        kappa: z.number().default(2.0),
        xi: z.number().default(0.01),
      })
    )
    .mutation(async ({ input }) => {
      // 验证配置
      const validation = validateBayesianConfig(input);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.errors.join(', '),
        });
      }

      const taskId = ++taskIdCounter;
      
      // 异步执行贝叶斯优化
      (async () => {
        try {
          const progress = await executeBayesianOptimization({
            strategyId: input.strategyId,
            parameterBounds: input.parameterBounds,
            backtestStart: input.backtestStart,
            backtestEnd: input.backtestEnd,
            initialCapital: input.initialCapital,
            targetCount: input.targetCount,
            frequency: input.frequency,
            objective: input.objective,
            nIterations: input.nIterations,
            nInitialPoints: input.nInitialPoints,
            acquisitionFunction: input.acquisitionFunction,
            kappa: input.kappa,
            xi: input.xi,
          });
          
          optimizationTasks.set(taskId, { type: 'bayesian', progress, config: input });
        } catch (error) {
          console.error('[Optimization] Bayesian optimization failed:', error);
          optimizationTasks.delete(taskId);
        }
      })();

      return { taskId };
    }),

  /**
   * 获取贝叶斯优化任务进度
   */
  getBayesianOptimizationProgress: publicProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const task = optimizationTasks.get(input.taskId);
      
      if (!task || task.type !== 'bayesian') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '任务不存在或不是贝叶斯优化任务',
        });
      }

      return task.progress;
    }),

  // ============ 通用任务管理 ============
  
  /**
   * 获取所有优化任务列表
   */
  getAllTasks: publicProcedure.query(async () => {
    const tasks = Array.from(optimizationTasks.entries()).map(([id, task]) => ({
      id,
      type: task.type,
      status: task.type === 'grid' 
        ? task.progress.completed === task.progress.total ? 'completed' : 'running'
        : task.progress.iteration >= task.progress.totalIterations ? 'completed' : 'running',
      progress: task.type === 'grid'
        ? {
            completed: task.progress.completed,
            total: task.progress.total,
            percentage: Math.round((task.progress.completed / task.progress.total) * 100),
          }
        : {
            iteration: task.progress.iteration,
            total: task.progress.totalIterations,
            percentage: Math.round((task.progress.iteration / task.progress.totalIterations) * 100),
          },
      bestScore: task.type === 'grid'
        ? task.progress.bestResult?.score
        : task.progress.currentBest?.score,
    }));

    return tasks.sort((a, b) => b.id - a.id);
  }),

  /**
   * 获取任务详情（包含最优结果）
   */
  getTaskDetail: publicProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const task = optimizationTasks.get(input.taskId);
      
      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '任务不存在',
        });
      }

      if (task.type === 'grid') {
        return {
          type: 'grid',
          progress: task.progress,
          bestResult: task.progress.bestResult,
          config: task.config,
        };
      } else {
        return {
          type: 'bayesian',
          progress: task.progress,
          bestResult: task.progress.currentBest,
          config: task.config,
        };
      }
    }),
});

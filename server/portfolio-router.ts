/**
 * 策略组合优化 tRPC 路由
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import * as portfolioDb from "./portfolio-optimization-db";

export const portfolioRouter = router({
  // 创建组合
  createPortfolio: publicProcedure
    .input(
      z.object({
        portfolioName: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const portfolio = await portfolioDb.createPortfolio({
        userId: ctx.user?.id ?? 0,
        portfolioName: input.portfolioName,
        description: input.description,
        isActive: true,
      });
      return { success: true, portfolioId: portfolio.id };
    }),

  // 获取用户的组合列表
  getPortfolios: publicProcedure.query(async ({ ctx }) => {
    const portfolios = await portfolioDb.getUserPortfolios(ctx.user?.id ?? 0);
    return portfolios;
  }),

  // 获取组合详情
  getPortfolioDetail: publicProcedure
    .input(z.object({ portfolioId: z.number().int() }))
    .query(async ({ input }) => {
      const portfolio = await portfolioDb.getPortfolioDetail(input.portfolioId);
      return portfolio;
    }),

  // 添加策略到组合
  addStrategy: publicProcedure
    .input(
      z.object({
        portfolioId: z.number().int(),
        strategyId: z.number().int(),
        weight: z.number().min(0).max(1),
        minWeight: z.number().min(0).max(1).optional(),
        maxWeight: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await portfolioDb.addStrategyToPortfolio(
        input.portfolioId,
        input.strategyId,
        input.weight,
        input.minWeight,
        input.maxWeight
      );
      return { success: true };
    }),

  // 更新策略权重
  updateStrategyWeight: publicProcedure
    .input(
      z.object({
        portfolioId: z.number().int(),
        strategyId: z.number().int(),
        newWeight: z.number().min(0).max(1),
      })
    )
    .mutation(async ({ input }) => {
      await portfolioDb.updateStrategyWeight(
        input.portfolioId,
        input.strategyId,
        input.newWeight
      );
      return { success: true };
    }),

  // 删除策略
  removeStrategy: publicProcedure
    .input(
      z.object({
        portfolioId: z.number().int(),
        strategyId: z.number().int(),
      })
    )
    .mutation(async ({ input }) => {
      await portfolioDb.removeStrategyFromPortfolio(input.portfolioId, input.strategyId);
      return { success: true };
    }),

  // 计算最优权重
  calculateOptimalWeights: publicProcedure
    .input(
      z.object({
        portfolioId: z.number().int(),
        strategies: z.array(
          z.object({
            strategyId: z.number().int(),
            returns: z.array(z.number()),
            risks: z.array(z.number()),
          })
        ),
        constraints: z
          .object({
            minWeight: z.number().optional(),
            maxWeight: z.number().optional(),
            targetReturn: z.number().optional(),
            targetRisk: z.number().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ input }) => {
      const result = await portfolioDb.calculateOptimalWeights(
        input.portfolioId,
        input.strategies,
        input.constraints
      );
      return result;
    }),

  // 获取组合性能快照
  getSnapshots: publicProcedure
    .input(
      z.object({
        portfolioId: z.number().int(),
        limit: z.number().int().default(30),
      })
    )
    .query(async ({ input }) => {
      const snapshots = await portfolioDb.getPortfolioSnapshots(input.portfolioId, input.limit);
      return snapshots;
    }),

  // 对比多个组合
  comparePortfolios: publicProcedure
    .input(z.object({ portfolioIds: z.array(z.number().int()) }))
    .query(async ({ input }) => {
      const comparison = await portfolioDb.comparePortfolios(input.portfolioIds);
      return comparison;
    }),

  // 获取再平衡建议
  getRebalancingSuggestions: publicProcedure
    .input(z.object({ portfolioId: z.number().int() }))
    .query(async ({ input }) => {
      const suggestions = await portfolioDb.getRebalancingSuggestions(input.portfolioId);
      return suggestions;
    }),

  // 获取组合对标分析
  getBenchmarkAnalysis: publicProcedure
    .input(
      z.object({
        portfolioId: z.number().int(),
        benchmarkIndexId: z.number().int(),
      })
    )
    .query(async ({ input }) => {
      // 获取组合性能
      const snapshots = await portfolioDb.getPortfolioSnapshots(input.portfolioId, 1);
      const portfolio = await portfolioDb.getPortfolioDetail(input.portfolioId);

      if (snapshots.length === 0) {
        return null;
      }

      const snapshot = snapshots[0];

      return {
        portfolioId: input.portfolioId,
        portfolioName: portfolio.portfolioName,
        benchmarkIndexId: input.benchmarkIndexId,
        portfolioReturn: snapshot.totalReturn,
        portfolioSharpe: snapshot.sharpeRatio,
        portfolioDrawdown: snapshot.maxDrawdown,
        portfolioVolatility: snapshot.volatility,
        diversificationRatio: snapshot.diversificationRatio,
        correlation: snapshot.correlation,
        strategies: portfolio.strategies.map((s) => ({
          strategyId: s.strategyId,
          strategyName: s.strategyName,
          weight: s.weight,
          contribution: s.weight * snapshot.totalReturn,
        })),
      };
    }),
});

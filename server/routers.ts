import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as benchmarkDb from "./benchmark-db";
import * as benchmarkCalculator from "./benchmark-calculator";
import { tradingRouter } from "./trading-router";
import { executionMonitorRouter } from "./execution-monitor-router";
import { optimizationRouter } from "./optimization-router";
import { portfolioRouter } from "./portfolio-router";
import { parameterScanRouter } from "./parameter-scan-router";
import { strategyRouter } from "./strategy-router";
import { paperclipRouter } from "./paperclip-router"; // Paperclip AI Agent 编排系统
import { aiRouter } from "./ai-router";
import { schedulerRouter } from "./scheduler-router";

export const appRouter = router({
  system: systemRouter,
  trading: tradingRouter,
  monitor: executionMonitorRouter,
  optimization: optimizationRouter,
  portfolio: portfolioRouter,
  parameterScan: parameterScanRouter,
  strategy: strategyRouter, // 策略代码管理路由（包含保存、提交等功能）
  paperclip: paperclipRouter, // Paperclip AI Agent 编排系统
  ai: aiRouter,
  scheduler: schedulerRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ============ 回测管理 ============
  backtest: router({
    // 创建回测记录
    create: publicProcedure
      .input(
        z.object({
          strategyId: z.number(),
          name: z.string(),
          description: z.string().optional(),
          backtestStart: z.string(),
          backtestEnd: z.string(),
          tradingDays: z.number(),
          initialCapital: z.number(),
          finalAsset: z.number(),
          totalReturn: z.number(),
          annualReturn: z.number(),
          totalPnl: z.number(),
          maxDrawdown: z.number(),
          maxDrawdownDays: z.number(),
          volatility: z.number(),
          sharpeRatio: z.number(),
          sortinoRatio: z.number(),
          calmarRatio: z.number(),
          infoRatio: z.number(),
          benchmarkReturn: z.number(),
          alpha: z.number(),
          beta: z.number(),
          totalTrades: z.number(),
          winTrades: z.number(),
          lossTrades: z.number(),
          winRate: z.number(),
          profitLossRatio: z.number(),
          var95: z.number(),
          cvar95: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await db.createBacktestRecord({
          userId: ctx.user?.id ?? 0,
          strategyId: input.strategyId,
          name: input.name,
          description: input.description,
          backtestStart: input.backtestStart,
          backtestEnd: input.backtestEnd,
          tradingDays: input.tradingDays,
          initialCapital: input.initialCapital.toString(),
          finalAsset: input.finalAsset.toString(),
          totalReturn: input.totalReturn.toString(),
          annualReturn: input.annualReturn.toString(),
          totalPnl: input.totalPnl.toString(),
          maxDrawdown: input.maxDrawdown.toString(),
          maxDrawdownDays: input.maxDrawdownDays,
          volatility: input.volatility.toString(),
          sharpeRatio: input.sharpeRatio.toString(),
          sortinoRatio: input.sortinoRatio.toString(),
          calmarRatio: input.calmarRatio.toString(),
          infoRatio: input.infoRatio.toString(),
          benchmarkReturn: input.benchmarkReturn.toString(),
          alpha: input.alpha.toString(),
          beta: input.beta.toString(),
          totalTrades: input.totalTrades,
          winTrades: input.winTrades,
          lossTrades: input.lossTrades,
          winRate: input.winRate.toString(),
          profitLossRatio: input.profitLossRatio.toString(),
          var95: input.var95.toString(),
          cvar95: input.cvar95.toString(),
          status: "completed",
        });
        return { success: true };
      }),

    // 获取回测历史列表
    list: publicProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return await db.getBacktestRecordsByUserId(ctx.user?.id ?? 0, input.limit, input.offset);
      }),

    // 获取回测详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getBacktestRecordById(input.id);
      }),

    // 获取策略的回测历史
    listByStrategy: publicProcedure
      .input(z.object({ strategyId: z.number() }))
      .query(async ({ input }) => {
        return await db.getBacktestRecordsByStrategyId(input.strategyId);
      }),

    // 对比多次回测
    compare: publicProcedure
      .input(z.object({ recordIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        return await db.compareBacktestRecords(input.recordIds);
      }),

    // 获取多条回测记录详情（用于对比分析）
    getMultiple: publicProcedure
      .input(z.object({ recordIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        return await db.getMultipleBacktestRecords(input.recordIds);
      }),

    // 获取用户回测统计
    statistics: publicProcedure.query(async ({ ctx }) => {
      return await db.getBacktestStatistics(ctx.user?.id ?? 0);
    }),
  }),

  // ============ 净值曲线 ============
  equity: router({
    // 保存净值曲线
    save: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number(),
          curves: z.array(
            z.object({
              date: z.string(),
              nav: z.number(),
              benchmark: z.number(),
              asset: z.number(),
              cash: z.number(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const data = input.curves.map((c: any) => ({
          backtestRecordId: input.backtestRecordId,
          date: c.date,
          nav: c.nav.toString(),
          benchmark: c.benchmark.toString(),
          asset: c.asset.toString(),
          cash: c.cash.toString(),
        }));
        await db.createEquityCurves(data);
        return { success: true };
      }),

    // 获取净值曲线
    get: publicProcedure
      .input(z.object({ backtestRecordId: z.number() }))
      .query(async ({ input }) => {
        return await db.getEquityCurvesByBacktestId(input.backtestRecordId);
      }),
  }),

  // ============ 交易明细 ============
  trades: router({
    // 保存交易明细
    save: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number(),
          trades: z.array(
            z.object({
              tradeDate: z.string(),
              tradeTime: z.string(),
              symbol: z.string(),
              direction: z.enum(["BUY", "SELL"]),
              volume: z.number(),
              price: z.number(),
              amount: z.number(),
              commission: z.number(),
              stampDuty: z.number(),
              slippage: z.number(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const data = input.trades.map((t: any) => ({
          backtestRecordId: input.backtestRecordId,
          tradeDate: t.tradeDate,
          tradeTime: t.tradeTime,
          symbol: t.symbol,
          direction: t.direction,
          volume: t.volume,
          price: t.price.toString(),
          amount: t.amount.toString(),
          commission: t.commission.toString(),
          stampDuty: t.stampDuty.toString(),
          slippage: t.slippage.toString(),
        }));
        await db.createTrades(data);
        return { success: true };
      }),

    // 获取交易明细
    get: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number(),
          limit: z.number().default(100),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        return await db.getTradesByBacktestId(input.backtestRecordId, input.limit, input.offset);
      }),

    // 按标的查询交易
    getBySymbol: publicProcedure
      .input(z.object({ backtestRecordId: z.number(), symbol: z.string() }))
      .query(async ({ input }) => {
        return await db.getTradesBySymbol(input.backtestRecordId, input.symbol);
      }),
  }),

  // ============ 持仓快照 ============
  positions: router({
    // 保存持仓快照
    save: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number(),
          positions: z.array(
            z.object({
              snapshotDate: z.string(),
              symbol: z.string(),
              totalVolume: z.number(),
              availableVolume: z.number(),
              avgPrice: z.number(),
              currentPrice: z.number(),
              marketValue: z.number(),
              floatPnl: z.number(),
              returnRate: z.number(),
              entryDate: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const data = input.positions.map((p: any) => ({
          backtestRecordId: input.backtestRecordId,
          snapshotDate: p.snapshotDate,
          symbol: p.symbol,
          totalVolume: p.totalVolume,
          availableVolume: p.availableVolume,
          avgPrice: p.avgPrice.toString(),
          currentPrice: p.currentPrice.toString(),
          marketValue: p.marketValue.toString(),
          floatPnl: p.floatPnl.toString(),
          returnRate: p.returnRate.toString(),
          entryDate: p.entryDate,
        }));
        await db.createPositionSnapshots(data);
        return { success: true };
      }),

    // 获取持仓快照
    get: publicProcedure
      .input(z.object({ backtestRecordId: z.number(), snapshotDate: z.string().optional() }))
      .query(async ({ input }) => {
        return await db.getPositionSnapshotsByBacktestId(input.backtestRecordId, input.snapshotDate);
      }),

    // 获取最新持仓快照
    getLatest: publicProcedure
      .input(z.object({ backtestRecordId: z.number() }))
      .query(async ({ input }) => {
        return await db.getLatestPositionSnapshot(input.backtestRecordId);
      }),
  }),

  // ============ 风控告警 ============
  riskAlerts: router({
    // 保存风控告警
    save: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number(),
          alerts: z.array(
            z.object({
              level: z.enum(["INFO", "WARNING", "CRITICAL"]),
              rule: z.string(),
              detail: z.string(),
              metric: z.string().optional(),
              value: z.number().optional(),
              threshold: z.number().optional(),
              alertDate: z.string(),
              alertTime: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const data = input.alerts.map((a: any) => ({
          backtestRecordId: input.backtestRecordId,
          level: a.level,
          rule: a.rule,
          detail: a.detail,
          metric: a.metric,
          value: a.value?.toString(),
          threshold: a.threshold?.toString(),
          alertDate: a.alertDate,
          alertTime: a.alertTime,
        }));
        await db.createRiskAlerts(data);
        return { success: true };
      }),

    // 获取风控告警
    get: publicProcedure
      .input(z.object({ backtestRecordId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRiskAlertsByBacktestId(input.backtestRecordId);
      }),

    // 按级别获取告警
    getByLevel: publicProcedure
      .input(z.object({ backtestRecordId: z.number(), level: z.enum(["INFO", "WARNING", "CRITICAL"]) }))
      .query(async ({ input }) => {
        return await db.getRiskAlertsByLevel(input.backtestRecordId, input.level);
      }),
  }),

  // ============ 月度收益 ============
  monthlyReturns: router({
    // 保存月度收益
    save: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number(),
          returns: z.array(
            z.object({
              year: z.number(),
              month: z.number(),
              returnRate: z.number(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const data = input.returns.map((r: any) => ({
          backtestRecordId: input.backtestRecordId,
          year: r.year,
          month: r.month,
          returnRate: r.returnRate.toString(),
        }));
        await db.createMonthlyReturns(data);
        return { success: true };
      }),

    // 获取月度收益
    get: publicProcedure
      .input(z.object({ backtestRecordId: z.number() }))
      .query(async ({ input }) => {
        return await db.getMonthlyReturnsByBacktestId(input.backtestRecordId);
      }),
  }),

  // ============ 数据备份 ============
  backup: router({
    // 创建备份
    create: publicProcedure
      .input(
        z.object({
          backupType: z.enum(["full", "incremental", "manual"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.createBackup({
          userId: ctx.user?.id ?? 0,
          backupType: input.backupType,
          status: "pending",
        });
      }),

    // 获取备份列表
    list: publicProcedure.query(async ({ ctx }) => {
      return await db.getBackupsByUserId(ctx.user?.id ?? 0);
    }),

    // 更新备份状态
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "running", "completed", "failed"]),
          recordCount: z.number().optional(),
          fileSize: z.number().optional(),
          errorMessage: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await db.updateBackup(input.id, {
          status: input.status,
          recordCount: input.recordCount,
          fileSize: input.fileSize,
          errorMessage: input.errorMessage,
          endTime: new Date(),
        });
      }),
  }),

  // ============ 对标管理 ============
  benchmark: router({
    // 获取所有基准指数
    getIndices: publicProcedure.query(async () => {
      const indices = await benchmarkDb.getBenchmarkIndices(true);
      return indices;
    }),

    // 获取策略的对标配置
    getStrategyBenchmarks: publicProcedure
      .input(z.object({ strategyId: z.number().int() }))
      .query(async ({ input }) => {
        const benchmarks = await benchmarkDb.getStrategyBenchmarks(input.strategyId);
        return benchmarks;
      }),

    // 添加策略对标
    addStrategyBenchmark: publicProcedure
      .input(
        z.object({
          strategyId: z.number().int(),
          benchmarkIndexId: z.number().int(),
          weight: z.number().default(1.0),
        })
      )
      .mutation(async ({ input }) => {
        await benchmarkDb.createStrategyBenchmark({
          strategyId: input.strategyId,
          benchmarkIndexId: input.benchmarkIndexId,
          weight: input.weight.toString(),
          isActive: true,
        });
        return { success: true };
      }),

    // 删除策略对标
    removeStrategyBenchmark: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await benchmarkDb.deleteStrategyBenchmark(input.id);
        return { success: true };
      }),

    // 获取回测的对标分析结果
    getAnalysis: publicProcedure
      .input(z.object({ backtestRecordId: z.number().int() }))
      .query(async ({ input }) => {
        const analysis = await benchmarkDb.getBenchmarkAnalysisByBacktest(input.backtestRecordId);
        return analysis;
      }),

    // 计算对标分析
    calculateAnalysis: publicProcedure
      .input(
        z.object({
          backtestRecordId: z.number().int(),
          benchmarkIndexIds: z.array(z.number().int()),
        })
      )
      .mutation(async ({ input }) => {
        const results = await benchmarkCalculator.calculateMultipleBenchmarkAnalysis(
          input.backtestRecordId,
          input.benchmarkIndexIds
        );

        // 保存到数据库
        for (const result of results) {
          await benchmarkDb.createBenchmarkAnalysis(result);
        }

        return { success: true, count: results.length };
      }),

    // 对比多个回测
    compareBacktests: publicProcedure
      .input(
        z.object({
          backtestRecordIds: z.array(z.number().int()),
          benchmarkIndexId: z.number().int(),
        })
      )
      .query(async ({ input }) => {
        const comparisons = [];
        for (const backtestId of input.backtestRecordIds) {
          const analysis = await benchmarkDb.getBenchmarkAnalysisByBacktestAndBenchmark(
            backtestId,
            input.benchmarkIndexId
          );
          if (analysis) {
            comparisons.push({
              ...analysis,
            });
          }
        }
        return comparisons;
      }),

    // 初始化默认基准指数
    initializeDefaults: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Only admins can initialize defaults");
      }
      const results = await benchmarkDb.initializeDefaultBenchmarks();
      return { success: true, results };
    }),
  }),
});

export type AppRouter = typeof appRouter;

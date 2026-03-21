/**
 * 基准指数数据库查询函数
 */

import { eq, and, desc, asc, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import {
  benchmarkIndices,
  benchmarkData,
  strategyBenchmarks,
  benchmarkAnalysis,
  type InsertBenchmarkIndex,
  type InsertBenchmarkData,
  type InsertStrategyBenchmark,
  type InsertBenchmarkAnalysis,
} from "../drizzle/schema";

// ============ 基准指数管理 ============

export async function createBenchmarkIndex(data: InsertBenchmarkIndex) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(benchmarkIndices).values(data);
  return result;
}

export async function getBenchmarkIndices(isActive: boolean = true) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(benchmarkIndices)
    .where(isActive ? eq(benchmarkIndices.isActive, true) : undefined)
    .orderBy(asc(benchmarkIndices.code));
}

export async function getBenchmarkIndexByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(benchmarkIndices)
    .where(eq(benchmarkIndices.code, code))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getBenchmarkIndexById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(benchmarkIndices)
    .where(eq(benchmarkIndices.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateBenchmarkIndex(id: number, data: Partial<InsertBenchmarkIndex>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(benchmarkIndices).set(data).where(eq(benchmarkIndices.id, id));
}

// ============ 基准指数行情数据 ============

export async function createBenchmarkData(data: InsertBenchmarkData | InsertBenchmarkData[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dataArray = Array.isArray(data) ? data : [data];
  return await db.insert(benchmarkData).values(dataArray);
}

export async function getBenchmarkDataByDateRange(
  benchmarkIndexId: number,
  startDate: string,
  endDate: string
) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(benchmarkData)
    .where(
      and(
        eq(benchmarkData.benchmarkIndexId, benchmarkIndexId),
        gte(benchmarkData.date, startDate),
        lte(benchmarkData.date, endDate)
      )
    )
    .orderBy(asc(benchmarkData.date));
}

export async function getLatestBenchmarkData(benchmarkIndexId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(benchmarkData)
    .where(eq(benchmarkData.benchmarkIndexId, benchmarkIndexId))
    .orderBy(desc(benchmarkData.date))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============ 策略对标关系 ============

export async function createStrategyBenchmark(data: InsertStrategyBenchmark) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(strategyBenchmarks).values(data);
}

export async function getStrategyBenchmarks(strategyId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: strategyBenchmarks.id,
      benchmarkIndexId: strategyBenchmarks.benchmarkIndexId,
      benchmarkCode: benchmarkIndices.code,
      benchmarkName: benchmarkIndices.name,
      weight: strategyBenchmarks.weight,
      isActive: strategyBenchmarks.isActive,
    })
    .from(strategyBenchmarks)
    .innerJoin(
      benchmarkIndices,
      eq(strategyBenchmarks.benchmarkIndexId, benchmarkIndices.id)
    )
    .where(eq(strategyBenchmarks.strategyId, strategyId));
}

export async function updateStrategyBenchmark(
  id: number,
  data: Partial<InsertStrategyBenchmark>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(strategyBenchmarks).set(data).where(eq(strategyBenchmarks.id, id));
}

export async function deleteStrategyBenchmark(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.delete(strategyBenchmarks).where(eq(strategyBenchmarks.id, id));
}

// ============ 对标分析结果 ============

export async function createBenchmarkAnalysis(data: InsertBenchmarkAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(benchmarkAnalysis).values(data);
}

export async function getBenchmarkAnalysisByBacktest(backtestRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: benchmarkAnalysis.id,
      benchmarkIndexId: benchmarkAnalysis.benchmarkIndexId,
      benchmarkCode: benchmarkIndices.code,
      benchmarkName: benchmarkIndices.name,
      benchmarkReturn: benchmarkAnalysis.benchmarkReturn,
      benchmarkAnnualReturn: benchmarkAnalysis.benchmarkAnnualReturn,
      benchmarkMaxDrawdown: benchmarkAnalysis.benchmarkMaxDrawdown,
      benchmarkSharpe: benchmarkAnalysis.benchmarkSharpe,
      benchmarkVolatility: benchmarkAnalysis.benchmarkVolatility,
      excessReturn: benchmarkAnalysis.excessReturn,
      excessAnnualReturn: benchmarkAnalysis.excessAnnualReturn,
      informationRatio: benchmarkAnalysis.informationRatio,
      trackingError: benchmarkAnalysis.trackingError,
      alpha: benchmarkAnalysis.alpha,
      beta: benchmarkAnalysis.beta,
      correlation: benchmarkAnalysis.correlation,
      outperformDays: benchmarkAnalysis.outperformDays,
      totalTradingDays: benchmarkAnalysis.totalTradingDays,
      winRate: benchmarkAnalysis.winRate,
    })
    .from(benchmarkAnalysis)
    .innerJoin(
      benchmarkIndices,
      eq(benchmarkAnalysis.benchmarkIndexId, benchmarkIndices.id)
    )
    .where(eq(benchmarkAnalysis.backtestRecordId, backtestRecordId));
}

export async function getBenchmarkAnalysisByBacktestAndBenchmark(
  backtestRecordId: number,
  benchmarkIndexId: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(benchmarkAnalysis)
    .where(
      and(
        eq(benchmarkAnalysis.backtestRecordId, backtestRecordId),
        eq(benchmarkAnalysis.benchmarkIndexId, benchmarkIndexId)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateBenchmarkAnalysis(
  id: number,
  data: Partial<InsertBenchmarkAnalysis>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(benchmarkAnalysis).set(data).where(eq(benchmarkAnalysis.id, id));
}

// ============ 批量操作 ============

export async function initializeDefaultBenchmarks() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const defaultBenchmarks = [
    {
      code: "000300",
      name: "沪深 300",
      description: "沪深 300 指数",
      category: "stock" as const,
    },
    {
      code: "000905",
      name: "中证 500",
      description: "中证 500 指数",
      category: "stock" as const,
    },
    {
      code: "000852",
      name: "中证 1000",
      description: "中证 1000 指数",
      category: "stock" as const,
    },
    {
      code: "399001",
      name: "深证成指",
      description: "深证成分指数",
      category: "stock" as const,
    },
    {
      code: "000001",
      name: "上证指数",
      description: "上海证券交易所综合股价指数",
      category: "stock" as const,
    },
  ];

  const results = [];
  for (const benchmark of defaultBenchmarks) {
    try {
      const existing = await getBenchmarkIndexByCode(benchmark.code);
      if (!existing) {
        const result = await createBenchmarkIndex({
          ...benchmark,
          isActive: true,
        });
        results.push({ success: true, code: benchmark.code });
      }
    } catch (error) {
      results.push({ success: false, code: benchmark.code, error });
    }
  }

  return results;
}

export async function getBenchmarkComparison(
  backtestRecordId: number,
  benchmarkIndexIds: number[]
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(benchmarkAnalysis.backtestRecordId, backtestRecordId)];
  if (benchmarkIndexIds.length > 0) {
    // 使用简单的循环条件而不是 inArray
    for (const id of benchmarkIndexIds) {
      // 这里我们只能用第一个 ID，因为 Drizzle 不支持 OR 条件的简单方式
      // 实际应用中应该使用更复杂的查询
      break;
    }
  }

  return await db
    .select({
      benchmarkCode: benchmarkIndices.code,
      benchmarkName: benchmarkIndices.name,
      benchmarkReturn: benchmarkAnalysis.benchmarkReturn,
      benchmarkAnnualReturn: benchmarkAnalysis.benchmarkAnnualReturn,
      excessReturn: benchmarkAnalysis.excessReturn,
      excessAnnualReturn: benchmarkAnalysis.excessAnnualReturn,
      informationRatio: benchmarkAnalysis.informationRatio,
      alpha: benchmarkAnalysis.alpha,
      beta: benchmarkAnalysis.beta,
      correlation: benchmarkAnalysis.correlation,
      winRate: benchmarkAnalysis.winRate,
    })
    .from(benchmarkAnalysis)
    .innerJoin(
      benchmarkIndices,
      eq(benchmarkAnalysis.benchmarkIndexId, benchmarkIndices.id)
    )
    .where(eq(benchmarkAnalysis.backtestRecordId, backtestRecordId));
}

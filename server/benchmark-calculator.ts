/**
 * 对标对比计算引擎
 * 计算策略与基准指数的超额收益、信息比率、Alpha、Beta 等指标
 */

import * as db from "./benchmark-db";
import * as backTestDb from "./db";
import { type InsertBenchmarkAnalysis } from "../drizzle/schema";

interface EquityCurveData {
  date: string;
  nav: number;
  benchmark?: number;
}

interface BenchmarkCalculationResult {
  benchmarkReturn: number;
  benchmarkAnnualReturn: number;
  benchmarkMaxDrawdown: number;
  benchmarkSharpe: number;
  benchmarkVolatility: number;
  excessReturn: number;
  excessAnnualReturn: number;
  informationRatio: number;
  trackingError: number;
  alpha: number;
  beta: number;
  correlation: number;
  outperformDays: number;
  totalTradingDays: number;
  winRate: number;
}

/**
 * 计算年化收益率
 */
function calculateAnnualReturn(totalReturn: number, tradingDays: number): number {
  if (tradingDays === 0) return 0;
  const years = tradingDays / 252; // 一年约 252 个交易日
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

/**
 * 计算最大回撤
 */
function calculateMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) return 0;

  let maxDrawdown = 0;
  let peak = 1;

  for (const ret of returns) {
    peak = Math.max(peak, peak * (1 + ret));
    const drawdown = (peak - peak * (1 + ret)) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return maxDrawdown;
}

/**
 * 计算波动率（年化）
 */
function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  return stdDev * Math.sqrt(252); // 年化
}

/**
 * 计算夏普比率
 */
function calculateSharpe(returns: number[], riskFreeRate: number = 0.02): number {
  if (returns.length === 0) return 0;

  const totalReturn = returns.reduce((a, b) => a * (1 + b), 1) - 1;
  const annualReturn = calculateAnnualReturn(totalReturn, returns.length);
  const volatility = calculateVolatility(returns);

  if (volatility === 0) return 0;
  return (annualReturn - riskFreeRate) / volatility;
}

/**
 * 计算相关系数
 */
function calculateCorrelation(series1: number[], series2: number[]): number {
  if (series1.length !== series2.length || series1.length < 2) return 0;

  const n = series1.length;
  const mean1 = series1.reduce((a, b) => a + b, 0) / n;
  const mean2 = series2.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator1 = 0;
  let denominator2 = 0;

  for (let i = 0; i < n; i++) {
    const dev1 = series1[i] - mean1;
    const dev2 = series2[i] - mean2;
    numerator += dev1 * dev2;
    denominator1 += dev1 * dev1;
    denominator2 += dev2 * dev2;
  }

  const denominator = Math.sqrt(denominator1 * denominator2);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * 计算 Beta 系数
 */
function calculateBeta(strategyReturns: number[], benchmarkReturns: number[]): number {
  if (strategyReturns.length !== benchmarkReturns.length || strategyReturns.length < 2) {
    return 0;
  }

  const n = strategyReturns.length;
  const benchmarkMean = benchmarkReturns.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let benchmarkVariance = 0;

  for (let i = 0; i < n; i++) {
    const benchmarkDev = benchmarkReturns[i] - benchmarkMean;
    covariance += (strategyReturns[i] - benchmarkMean) * benchmarkDev;
    benchmarkVariance += benchmarkDev * benchmarkDev;
  }

  if (benchmarkVariance === 0) return 0;
  return covariance / benchmarkVariance;
}

/**
 * 计算 Alpha 值
 */
function calculateAlpha(
  strategyReturn: number,
  benchmarkReturn: number,
  beta: number,
  riskFreeRate: number = 0.02
): number {
  return strategyReturn - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate));
}

/**
 * 计算跟踪误差
 */
function calculateTrackingError(
  strategyReturns: number[],
  benchmarkReturns: number[]
): number {
  if (strategyReturns.length !== benchmarkReturns.length) return 0;

  const differences = strategyReturns.map((sr, i) => sr - benchmarkReturns[i]);
  const variance =
    differences.reduce((sum, diff) => sum + diff * diff, 0) / differences.length;

  return Math.sqrt(variance) * Math.sqrt(252); // 年化
}

/**
 * 计算信息比率
 */
function calculateInformationRatio(
  excessReturn: number,
  trackingError: number
): number {
  if (trackingError === 0) return 0;
  return excessReturn / trackingError;
}

/**
 * 计算胜率
 */
function calculateWinRate(
  strategyReturns: number[],
  benchmarkReturns: number[]
): { outperformDays: number; winRate: number } {
  if (strategyReturns.length !== benchmarkReturns.length) {
    return { outperformDays: 0, winRate: 0 };
  }

  let outperformDays = 0;
  for (let i = 0; i < strategyReturns.length; i++) {
    if (strategyReturns[i] > benchmarkReturns[i]) {
      outperformDays++;
    }
  }

  return {
    outperformDays,
    winRate: strategyReturns.length > 0 ? outperformDays / strategyReturns.length : 0,
  };
}

/**
 * 主计算函数：计算策略与基准指数的对标分析
 */
export async function calculateBenchmarkAnalysis(
  backtestRecordId: number,
  benchmarkIndexId: number
): Promise<BenchmarkCalculationResult | null> {
  try {
    // 获取回测数据
    const backtestRecord = await backTestDb.getBacktestRecordById(backtestRecordId);
    if (!backtestRecord) {
      console.error(`Backtest record ${backtestRecordId} not found`);
      return null;
    }

    // 获取策略的净值曲线
    const equityCurves = await backTestDb.getEquityCurvesByBacktestId(backtestRecordId);
    if (equityCurves.length === 0) {
      console.error(`No equity curves found for backtest ${backtestRecordId}`);
      return null;
    }

    // 获取基准指数数据
    const benchmarkIndex = await db.getBenchmarkIndexById(benchmarkIndexId);
    if (!benchmarkIndex) {
      console.error(`Benchmark index ${benchmarkIndexId} not found`);
      return null;
    }

    // 获取基准指数的历史数据
    const firstDate = equityCurves[0].date;
    const lastDate = equityCurves[equityCurves.length - 1].date;

    const benchmarkDataPoints = await db.getBenchmarkDataByDateRange(
      benchmarkIndexId,
      firstDate,
      lastDate
    );

    if (benchmarkDataPoints.length === 0) {
      console.error(`No benchmark data found for period ${firstDate} to ${lastDate}`);
      return null;
    }

    // 对齐数据
    const strategyReturns: number[] = [];
    const benchmarkReturns: number[] = [];
    let prevStrategyNav = 1;
    let prevBenchmarkClose = parseFloat(benchmarkDataPoints[0].close.toString());

    for (const curve of equityCurves) {
      const benchmarkData = benchmarkDataPoints.find((bd) => bd.date === curve.date);
      if (benchmarkData) {
        const strategyReturn = (((curve.nav as unknown as number) - prevStrategyNav) / prevStrategyNav);
        const benchmarkCloseNum = parseFloat(benchmarkData.close.toString());
        const benchmarkReturn = (benchmarkCloseNum - prevBenchmarkClose) / prevBenchmarkClose;

        strategyReturns.push(strategyReturn);
        benchmarkReturns.push(benchmarkReturn);

        prevStrategyNav = curve.nav as unknown as number;
        prevBenchmarkClose = benchmarkCloseNum;
      }
    }

    if (strategyReturns.length === 0) {
      console.error("No aligned data for comparison");
      return null;
    }

    // 计算总收益
    const strategyTotalReturn = ((equityCurves[equityCurves.length - 1].nav as unknown as number) - 1);
    const lastBenchmarkClose = parseFloat(benchmarkDataPoints[benchmarkDataPoints.length - 1].close.toString());
    const firstBenchmarkClose = parseFloat(benchmarkDataPoints[0].close.toString());
    const benchmarkTotalReturn = (lastBenchmarkClose - firstBenchmarkClose) / firstBenchmarkClose;

    // 计算各项指标
    const tradingDays = equityCurves.length;
    const benchmarkAnnualReturn = calculateAnnualReturn(benchmarkTotalReturn, tradingDays);
    const benchmarkVolatility = calculateVolatility(benchmarkReturns);
    const benchmarkSharpe = calculateSharpe(benchmarkReturns);
    const benchmarkMaxDrawdown = calculateMaxDrawdown(benchmarkReturns);

    const strategyAnnualReturn = calculateAnnualReturn(strategyTotalReturn, tradingDays);
    const excessReturn = strategyTotalReturn - benchmarkTotalReturn;
    const excessAnnualReturn = strategyAnnualReturn - benchmarkAnnualReturn;

    const beta = calculateBeta(strategyReturns, benchmarkReturns);
    const alpha = calculateAlpha(strategyAnnualReturn, benchmarkAnnualReturn, beta);
    const correlation = calculateCorrelation(strategyReturns, benchmarkReturns);
    const trackingError = calculateTrackingError(strategyReturns, benchmarkReturns);
    const informationRatio = calculateInformationRatio(excessAnnualReturn, trackingError);

    const { outperformDays, winRate } = calculateWinRate(strategyReturns, benchmarkReturns);

    return {
      benchmarkReturn: benchmarkTotalReturn,
      benchmarkAnnualReturn,
      benchmarkMaxDrawdown,
      benchmarkSharpe,
      benchmarkVolatility,
      excessReturn,
      excessAnnualReturn,
      informationRatio,
      trackingError,
      alpha,
      beta,
      correlation,
      outperformDays,
      totalTradingDays: tradingDays,
      winRate,
    };
  } catch (error) {
    console.error("Error calculating benchmark analysis:", error);
    return null;
  }
}

/**
 * 批量计算多个基准指数的对标分析
 */
export async function calculateMultipleBenchmarkAnalysis(
  backtestRecordId: number,
  benchmarkIndexIds: number[]
): Promise<InsertBenchmarkAnalysis[]> {
  const results: InsertBenchmarkAnalysis[] = [];

  for (const benchmarkIndexId of benchmarkIndexIds) {
    const analysis = await calculateBenchmarkAnalysis(backtestRecordId, benchmarkIndexId);
    if (analysis) {
      results.push({
        backtestRecordId,
        benchmarkIndexId,
        benchmarkReturn: analysis.benchmarkReturn.toString(),
        benchmarkAnnualReturn: analysis.benchmarkAnnualReturn.toString(),
        benchmarkMaxDrawdown: analysis.benchmarkMaxDrawdown.toString(),
        benchmarkSharpe: analysis.benchmarkSharpe.toString(),
        benchmarkVolatility: analysis.benchmarkVolatility.toString(),
        excessReturn: analysis.excessReturn.toString(),
        excessAnnualReturn: analysis.excessAnnualReturn.toString(),
        informationRatio: analysis.informationRatio.toString(),
        trackingError: analysis.trackingError.toString(),
        alpha: analysis.alpha.toString(),
        beta: analysis.beta.toString(),
        correlation: analysis.correlation.toString(),
        outperformDays: analysis.outperformDays,
        totalTradingDays: analysis.totalTradingDays,
        winRate: analysis.winRate.toString(),
      });
    }
  }

  return results;
}

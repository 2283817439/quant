/**
 * 回测任务管理数据库操作
 */

import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";

/**
 * 回测任务表（需要添加到 Schema）
 */
interface BacktestTask {
  id: number;
  userId: number;
  strategyId: number;
  taskName: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number; // 0-100
  
  // 回测参数
  initialCapital: number;
  backtestStart: string;
  backtestEnd: string;
  targetCount: number;
  frequency: string;
  
  // 结果
  totalReturn: number | null;
  annualReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  
  // 时间
  startTime: Date;
  endTime: Date | null;
  estimatedEndTime: Date | null;
  errorMessage: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建回测任务
 */
export async function createBacktestTask(data: Omit<BacktestTask, 'id' | 'createdAt' | 'updatedAt'>) {
  // 实际实现中应使用真实数据库
  console.log("[BacktestTask] Creating task:", data);
  return { id: Date.now(), ...data };
}

/**
 * 获取用户的回测任务列表
 */
export async function getUserBacktestTasks(userId: number, limit = 50) {
  // 模拟数据
  return [
    {
      id: 1,
      userId,
      strategyId: 1,
      taskName: "小市值因子策略 - 2024年回测",
      status: "completed" as const,
      progress: 100,
      initialCapital: 1000000,
      backtestStart: "2024-01-01",
      backtestEnd: "2024-12-31",
      targetCount: 10,
      frequency: "daily",
      totalReturn: 0.2530,
      annualReturn: 0.2530,
      sharpeRatio: 1.8234,
      maxDrawdown: -0.1523,
      winRate: 0.5432,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-01-02"),
      estimatedEndTime: null,
      errorMessage: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02"),
    },
    {
      id: 2,
      userId,
      strategyId: 1,
      taskName: "小市值因子策略 - 2023年回测",
      status: "completed" as const,
      progress: 100,
      initialCapital: 1000000,
      backtestStart: "2023-01-01",
      backtestEnd: "2023-12-31",
      targetCount: 10,
      frequency: "daily",
      totalReturn: 0.1850,
      annualReturn: 0.1850,
      sharpeRatio: 1.2345,
      maxDrawdown: -0.2145,
      winRate: 0.4892,
      startTime: new Date("2023-01-01"),
      endTime: new Date("2023-01-02"),
      estimatedEndTime: null,
      errorMessage: null,
      createdAt: new Date("2023-01-01"),
      updatedAt: new Date("2023-01-02"),
    },
  ];
}

/**
 * 获取回测任务详情
 */
export async function getBacktestTaskById(taskId: number) {
  // 模拟数据
  return {
    id: taskId,
    userId: 1,
    strategyId: 1,
    taskName: "小市值因子策略 - 2024年回测",
    status: "completed" as const,
    progress: 100,
    initialCapital: 1000000,
    backtestStart: "2024-01-01",
    backtestEnd: "2024-12-31",
    targetCount: 10,
    frequency: "daily",
    totalReturn: 0.2530,
    annualReturn: 0.2530,
    sharpeRatio: 1.8234,
    maxDrawdown: -0.1523,
    winRate: 0.5432,
    startTime: new Date("2024-01-01"),
    endTime: new Date("2024-01-02"),
    estimatedEndTime: null,
    errorMessage: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };
}

/**
 * 更新回测任务进度
 */
export async function updateBacktestTaskProgress(
  taskId: number,
  progress: number,
  status?: "pending" | "running" | "completed" | "failed"
) {
  console.log(`[BacktestTask] Updating task ${taskId}: progress=${progress}, status=${status}`);
  return { success: true };
}

/**
 * 完成回测任务
 */
export async function completeBacktestTask(
  taskId: number,
  results: {
    totalReturn: number;
    annualReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  }
) {
  console.log(`[BacktestTask] Completing task ${taskId}:`, results);
  return { success: true };
}

/**
 * 失败回测任务
 */
export async function failBacktestTask(taskId: number, errorMessage: string) {
  console.log(`[BacktestTask] Task ${taskId} failed: ${errorMessage}`);
  return { success: true };
}

/**
 * 对比两个回测任务
 */
export async function compareBacktestTasks(taskId1: number, taskId2: number) {
  const task1 = await getBacktestTaskById(taskId1);
  const task2 = await getBacktestTaskById(taskId2);

  return {
    task1,
    task2,
    comparison: {
      returnDiff: (task1.totalReturn || 0) - (task2.totalReturn || 0),
      sharpeDiff: (task1.sharpeRatio || 0) - (task2.sharpeRatio || 0),
      drawdownDiff: (task1.maxDrawdown || 0) - (task2.maxDrawdown || 0),
      winRateDiff: (task1.winRate || 0) - (task2.winRate || 0),
    },
  };
}

/**
 * 获取回测任务的参数优化建议
 */
export async function getOptimizationSuggestions(taskId: number) {
  const task = await getBacktestTaskById(taskId);

  const suggestions = [];

  // 基于夏普比率的建议
  if ((task.sharpeRatio || 0) < 1.0) {
    suggestions.push({
      type: "risk_adjustment",
      title: "风险调整建议",
      description: "当前策略夏普比率较低，建议增加风险管理措施或调整参数",
      priority: "high",
    });
  }

  // 基于最大回撤的建议
  if ((task.maxDrawdown || 0) < -0.2) {
    suggestions.push({
      type: "drawdown_control",
      title: "回撤控制建议",
      description: "最大回撤超过 20%，建议增加止损机制或降低单笔头寸",
      priority: "high",
    });
  }

  // 基于胜率的建议
  if ((task.winRate || 0) < 0.5) {
    suggestions.push({
      type: "win_rate_improvement",
      title: "胜率改进建议",
      description: "胜率低于 50%，建议优化选股逻辑或调整持仓周期",
      priority: "medium",
    });
  }

  // 基于年化收益的建议
  if ((task.annualReturn || 0) > 0.3) {
    suggestions.push({
      type: "performance_excellent",
      title: "性能优异",
      description: "当前策略表现优异，可考虑增加资金投入",
      priority: "low",
    });
  }

  return suggestions;
}

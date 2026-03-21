import { runRemoteBacktest } from "./qmt-backtest-runner";

/**
 * 网格搜索优化算法
 * 
 * 功能：
 * 1. 支持多参数组合扫描
 * 2. 自动并行执行回测任务
 * 3. 返回最优参数组合
 * 4. 支持自定义目标函数（最大化夏普、最大化收益、最小化回撤等）
 */

export interface ParameterRange {
  name: string;
  values: number[];
}

export interface GridSearchConfig {
  strategyId: number;
  parameterRanges: ParameterRange[];
  backtestStart: string;
  backtestEnd: string;
  initialCapital: number;
  targetCount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  objective: 'max_sharpe' | 'max_return' | 'min_drawdown' | 'max_calmar' | 'custom';
  customObjective?: (metrics: GridSearchResult) => number;
}

export interface GridSearchResult {
  parameters: Record<string, number>;
  totalReturn: number;
  annualReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  volatility: number;
  tradeCount: number;
  score: number;
}

export interface GridSearchProgress {
  total: number;
  completed: number;
  failed: number;
  current: number;
  results: GridSearchResult[];
  bestResult?: GridSearchResult;
}

/**
 * 生成所有参数组合
 */
function generateParameterCombinations(ranges: ParameterRange[]): Record<string, number>[] {
  if (ranges.length === 0) return [{}];

  const combinations: Record<string, number>[] = [];
  const current: Record<string, number> = {};

  function generate(index: number) {
    if (index === ranges.length) {
      combinations.push({ ...current });
      return;
    }

    const range = ranges[index];
    for (const value of range.values) {
      current[range.name] = value;
      generate(index + 1);
    }
  }

  generate(0);
  return combinations;
}

/**
 * 计算目标函数得分
 */
function calculateScore(result: GridSearchResult, objective: GridSearchConfig['objective'], customFn?: GridSearchConfig['customObjective']): number {
  switch (objective) {
    case 'max_sharpe':
      return result.sharpeRatio;
    case 'max_return':
      return result.totalReturn;
    case 'min_drawdown':
      return -result.maxDrawdown;
    case 'max_calmar':
      return result.calmarRatio;
    case 'custom':
      return customFn ? customFn(result) : result.sharpeRatio;
    default:
      return result.sharpeRatio;
  }
}

/**
 * 执行单次回测（模拟实现，实际应调用后端回测引擎）
 */
async function executeBacktest(
  strategyId: number,
  parameters: Record<string, number>,
  config: GridSearchConfig
): Promise<GridSearchResult> {
  const metrics = await runRemoteBacktest({
    strategyId,
    parameters,
    backtestStart: config.backtestStart,
    backtestEnd: config.backtestEnd,
    benchmark: '000300.SH',
    initialCapital: config.initialCapital,
  });

  return {
    parameters,
    totalReturn: metrics.totalReturn,
    annualReturn: metrics.annualReturn,
    sharpeRatio: metrics.sharpeRatio,
    maxDrawdown: metrics.maxDrawdown,
    calmarRatio: metrics.calmarRatio,
    winRate: metrics.winRate,
    volatility: metrics.volatility,
    tradeCount: metrics.tradeCount,
    score: 0,
  };
}

const GRID_SEARCH_CONCURRENCY = 5;

/**
 * 执行网格搜索（并发执行，最多 GRID_SEARCH_CONCURRENCY 个并行回测）
 */
export async function executeGridSearch(config: GridSearchConfig): Promise<GridSearchProgress> {
  const combinations = generateParameterCombinations(config.parameterRanges);

  const progress: GridSearchProgress = {
    total: combinations.length,
    completed: 0,
    failed: 0,
    current: 0,
    results: [],
  };

  console.log(`[GridSearch] 开始执行，共 ${combinations.length} 个参数组合，并发数 ${GRID_SEARCH_CONCURRENCY}`);

  // 并发执行，使用滑动窗口控制并发数
  let index = 0;

  async function runNext(): Promise<void> {
    if (index >= combinations.length) return;
    const i = index++;
    const params = combinations[i];
    progress.current = Math.max(progress.current, i + 1);

    try {
      const result = await executeBacktest(config.strategyId, params, config);
      result.score = calculateScore(result, config.objective, config.customObjective);
      progress.results.push(result);
      progress.completed++;
      if (!progress.bestResult || result.score > progress.bestResult.score) {
        progress.bestResult = result;
      }
      console.log(`[GridSearch] 进度：${progress.completed}/${combinations.length}, 最优得分：${progress.bestResult?.score?.toFixed(4)}`);
    } catch (error) {
      console.error(`[GridSearch] 组合 ${i + 1} 失败:`, error);
      progress.failed++;
    }

    // 继续处理下一个
    await runNext();
  }

  // 启动初始并发槽
  const workers = Array.from(
    { length: Math.min(GRID_SEARCH_CONCURRENCY, combinations.length) },
    () => runNext()
  );
  await Promise.all(workers);

  console.log(`[GridSearch] 完成，最优结果：`, progress.bestResult);
  return progress;
}

/**
 * 获取参数组合总数
 */
export function getTotalCombinations(ranges: ParameterRange[]): number {
  return ranges.reduce((product, range) => product * range.values.length, 1);
}

/**
 * 验证参数范围配置
 */
export function validateParameterRanges(ranges: ParameterRange[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (ranges.length === 0) {
    errors.push('至少需要一个参数范围');
  }

  ranges.forEach((range, index) => {
    if (!range.name || range.name.trim() === '') {
      errors.push(`参数 ${index + 1} 缺少名称`);
    }

    if (!range.values || range.values.length === 0) {
      errors.push(`参数 "${range.name}" 缺少取值`);
    }

    if (range.values.length > 20) {
      errors.push(`参数 "${range.name}" 的取值过多（${range.values.length}个），建议不超过 20 个`);
    }
  });

  const totalCombinations = getTotalCombinations(ranges);
  if (totalCombinations > 1000) {
    errors.push(`参数组合总数过多（${totalCombinations}个），建议不超过 1000 个`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

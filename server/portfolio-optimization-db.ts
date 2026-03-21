/**
 * 策略组合优化数据库操作
 */

/**
 * 策略组合表
 */
interface StrategyPortfolio {
  id: number;
  userId: number;
  portfolioName: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 组合中的策略权重
 */
interface PortfolioStrategy {
  id: number;
  portfolioId: number;
  strategyId: number;
  weight: number; // 0-1
  minWeight?: number;
  maxWeight?: number;
  rebalanceFrequency: "daily" | "weekly" | "monthly";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 组合性能快照
 */
interface PortfolioSnapshot {
  id: number;
  portfolioId: number;
  date: Date;
  totalReturn: number;
  annualReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  volatility: number;
  correlation: number;
  diversificationRatio: number;
  createdAt: Date;
}

/**
 * 创建策略组合
 */
export async function createPortfolio(data: Omit<StrategyPortfolio, 'id' | 'createdAt' | 'updatedAt'>) {
  console.log("[PortfolioOptimization] Creating portfolio:", data);
  return { id: Date.now(), ...data, createdAt: new Date(), updatedAt: new Date() };
}

/**
 * 获取用户的组合列表
 */
export async function getUserPortfolios(userId: number) {
  // 模拟数据
  return [
    {
      id: 1,
      userId,
      portfolioName: "均衡组合",
      description: "多因子策略均衡组合",
      isActive: true,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-03-06"),
    },
    {
      id: 2,
      userId,
      portfolioName: "激进组合",
      description: "高收益高风险组合",
      isActive: false,
      createdAt: new Date("2023-12-01"),
      updatedAt: new Date("2024-02-01"),
    },
  ];
}

/**
 * 获取组合详情
 */
export async function getPortfolioDetail(portfolioId: number) {
  return {
    id: portfolioId,
    userId: 1,
    portfolioName: "均衡组合",
    description: "多因子策略均衡组合",
    isActive: true,
    strategies: [
      {
        id: 1,
        portfolioId,
        strategyId: 1,
        strategyName: "小市值因子策略",
        weight: 0.4,
        minWeight: 0.2,
        maxWeight: 0.6,
        rebalanceFrequency: "monthly" as const,
        currentReturn: 0.253,
        currentSharpe: 1.8234,
      },
      {
        id: 2,
        portfolioId,
        strategyId: 2,
        strategyName: "价值因子策略",
        weight: 0.3,
        minWeight: 0.15,
        maxWeight: 0.5,
        rebalanceFrequency: "monthly" as const,
        currentReturn: 0.185,
        currentSharpe: 1.2345,
      },
      {
        id: 3,
        portfolioId,
        strategyId: 3,
        strategyName: "动量因子策略",
        weight: 0.3,
        minWeight: 0.15,
        maxWeight: 0.5,
        rebalanceFrequency: "monthly" as const,
        currentReturn: 0.142,
        currentSharpe: 0.9876,
      },
    ],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-03-06"),
  };
}

/**
 * 添加策略到组合
 */
export async function addStrategyToPortfolio(
  portfolioId: number,
  strategyId: number,
  weight: number,
  minWeight?: number,
  maxWeight?: number
) {
  console.log(`[PortfolioOptimization] Adding strategy ${strategyId} to portfolio ${portfolioId} with weight ${weight}`);
  return { success: true };
}

/**
 * 更新组合中策略的权重
 */
export async function updateStrategyWeight(
  portfolioId: number,
  strategyId: number,
  newWeight: number
) {
  console.log(
    `[PortfolioOptimization] Updating weight for strategy ${strategyId} in portfolio ${portfolioId} to ${newWeight}`
  );
  return { success: true };
}

/**
 * 删除组合中的策略
 */
export async function removeStrategyFromPortfolio(portfolioId: number, strategyId: number) {
  console.log(`[PortfolioOptimization] Removing strategy ${strategyId} from portfolio ${portfolioId}`);
  return { success: true };
}

/**
 * 计算最优权重
 */
export async function calculateOptimalWeights(
  portfolioId: number,
  strategies: Array<{ strategyId: number; returns: number[]; risks: number[] }>,
  constraints?: {
    minWeight?: number;
    maxWeight?: number;
    targetReturn?: number;
    targetRisk?: number;
  }
) {
  // 简化的权重优化算法
  const n = strategies.length;
  const weights: Record<number, number> = {};

  // 基于夏普比率的权重分配
  let totalSharpe = 0;
  const sharpeRatios: Record<number, number> = {};

  strategies.forEach((s) => {
    const avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    const variance =
      s.returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / s.returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;
    sharpeRatios[s.strategyId] = sharpe;
    totalSharpe += sharpe;
  });

  strategies.forEach((s) => {
    weights[s.strategyId] = totalSharpe > 0 ? sharpeRatios[s.strategyId] / totalSharpe : 1 / n;
  });

  return {
    weights,
    expectedReturn: calculatePortfolioReturn(strategies, weights),
    expectedRisk: calculatePortfolioRisk(strategies, weights),
    sharpeRatio: calculatePortfolioSharpe(strategies, weights),
  };
}

/**
 * 获取组合性能快照
 */
export async function getPortfolioSnapshots(portfolioId: number, limit = 30) {
  // 模拟数据
  const snapshots = [];
  for (let i = 0; i < limit; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (limit - i));
    snapshots.push({
      id: i,
      portfolioId,
      date,
      totalReturn: 0.15 + Math.random() * 0.1,
      annualReturn: 0.18 + Math.random() * 0.08,
      sharpeRatio: 1.5 + Math.random() * 0.5,
      maxDrawdown: -0.12 - Math.random() * 0.08,
      winRate: 0.55 + Math.random() * 0.1,
      volatility: 0.15 + Math.random() * 0.05,
      correlation: 0.6 + Math.random() * 0.2,
      diversificationRatio: 1.8 + Math.random() * 0.3,
      createdAt: date,
    });
  }
  return snapshots;
}

/**
 * 对比多个组合
 */
export async function comparePortfolios(portfolioIds: number[]) {
  const portfolios = await Promise.all(
    portfolioIds.map((id) => getPortfolioDetail(id))
  );

  // 计算组合统计
  const stats = portfolios.map((p) => {
    const strategies = p.strategies;
    const weightedReturn = strategies.reduce((sum, s) => sum + s.weight * s.currentReturn, 0);
    const weightedSharpe = strategies.reduce((sum, s) => sum + s.weight * s.currentSharpe, 0);

    return {
      portfolioId: p.id,
      portfolioName: p.portfolioName,
      expectedReturn: weightedReturn,
      expectedSharpe: weightedSharpe,
      diversificationScore: calculateDiversificationScore(strategies),
    };
  });

  return {
    portfolios,
    stats,
  };
}

/**
 * 获取组合再平衡建议
 */
export async function getRebalancingSuggestions(portfolioId: number) {
  const portfolio = await getPortfolioDetail(portfolioId);
  const suggestions: any[] = [];

  portfolio.strategies.forEach((s) => {
    // 检查权重偏离
    if (s.minWeight && s.weight < s.minWeight) {
      suggestions.push({
        type: "underweight",
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        currentWeight: s.weight,
        recommendedWeight: s.minWeight,
        reason: `权重低于最小值 ${s.minWeight}，建议增加配置`,
      });
    }

    if (s.maxWeight && s.weight > s.maxWeight) {
      suggestions.push({
        type: "overweight",
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        currentWeight: s.weight,
        recommendedWeight: s.maxWeight,
        reason: `权重超过最大值 ${s.maxWeight}，建议减少配置`,
      });
    }

    // 基于性能的建议
    if (s.currentSharpe < 1.0) {
      suggestions.push({
        type: "performance_concern",
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        currentSharpe: s.currentSharpe,
        reason: "夏普比率较低，考虑降低权重或替换策略",
      });
    }
  });

  return suggestions as any[];
}

/**
 * 计算组合收益
 */
function calculatePortfolioReturn(
  strategies: Array<{ strategyId: number; returns: number[] }>,
  weights: Record<number, number>
): number {
  let totalReturn = 0;
  strategies.forEach((s) => {
    const avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    totalReturn += weights[s.strategyId] * avgReturn;
  });
  return totalReturn;
}

/**
 * 计算组合风险
 */
function calculatePortfolioRisk(
  strategies: Array<{ strategyId: number; returns: number[]; risks: number[] }>,
  weights: Record<number, number>
): number {
  let totalRisk = 0;
  strategies.forEach((s) => {
    const avgRisk = s.risks.reduce((a, b) => a + b, 0) / s.risks.length;
    totalRisk += weights[s.strategyId] * avgRisk;
  });
  return totalRisk;
}

/**
 * 计算组合夏普比率
 */
function calculatePortfolioSharpe(
  strategies: Array<{ strategyId: number; returns: number[]; risks: number[] }>,
  weights: Record<number, number>
): number {
  const ret = calculatePortfolioReturn(strategies, weights);
  const risk = calculatePortfolioRisk(strategies, weights);
  return risk > 0 ? ret / risk : 0;
}

/**
 * 计算多样化评分
 */
function calculateDiversificationScore(strategies: any[]): number {
  // 基于策略数量和权重分散度的评分
  const n = strategies.length;
  const weights = strategies.map((s) => s.weight);
  const avgWeight = 1 / n;
  const variance = weights.reduce((sum, w) => sum + Math.pow(w - avgWeight, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // 标准差越小，多样化越好
  return Math.max(0, 1 - stdDev);
}

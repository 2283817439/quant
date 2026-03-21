import { runRemoteBacktest } from "./qmt-backtest-runner";

/**
 * 贝叶斯优化算法
 * 
 * 使用高斯过程（Gaussian Process）作为代理模型，
 * 通过采集函数（Acquisition Function）指导搜索方向，
 * 在较少的迭代次数内找到最优参数组合。
 * 
 * 优势：
 * 1. 相比网格搜索，用更少的迭代找到最优解
 * 2. 适合高维参数空间和昂贵的目标函数评估
 * 3. 支持多种采集函数：EI（期望改进）、UCB（置信上界）、PI（概率改进）
 */

export interface BayesianOptimizationConfig {
  strategyId: number;
  parameterBounds: ParameterBound[];
  backtestStart: string;
  backtestEnd: string;
  initialCapital: number;
  targetCount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  objective: 'max_sharpe' | 'max_return' | 'min_drawdown' | 'max_calmar';
  nIterations: number;
  nInitialPoints: number;
  acquisitionFunction: 'ei' | 'ucb' | 'pi';
  kappa: number; // UCB 的探索参数
  xi: number; // EI 的探索参数
}

export interface ParameterBound {
  name: string;
  min: number;
  max: number;
}

export interface BayesianOptimizationResult {
  parameters: Record<string, number>;
  score: number;
  metrics: {
    totalReturn: number;
    annualReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    winRate: number;
    volatility: number;
    tradeCount: number;
  };
  iteration: number;
}

export interface BayesianOptimizationProgress {
  iteration: number;
  totalIterations: number;
  currentBest: BayesianOptimizationResult | null;
  history: Array<{
    parameters: Record<string, number>;
    score: number;
    metrics: BayesianOptimizationResult["metrics"];
    iteration: number;
  }>;
}

/**
 * 简单的随机森林替代方案（由于无法使用外部库，使用简化版本）
 * 实际生产环境应使用 scikit-learn 或 GPyOpt
 */

// 随机种子生成器
class RandomGenerator {
  private seed: number;

  constructor(seed: number = Math.random() * 10000) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  uniform(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  gaussian(mean: number = 0, std: number = 1): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * std;
  }
}

/**
 * 简化的代理模型（Surrogate Model）
 * 使用加权平均模拟高斯过程
 */
class SurrogateModel {
  private points: Array<{ params: number[]; score: number }> = [];
  private rng: RandomGenerator;

  constructor(rng: RandomGenerator) {
    this.rng = rng;
  }

  addPoint(params: number[], score: number) {
    this.points.push({ params, score });
  }

  /**
   * 预测给定点的得分和不确定性
   */
  predict(params: number[]): { mean: number; std: number } {
    if (this.points.length === 0) {
      return { mean: 0, std: 1 };
    }

    // 计算与所有已知点的距离
    const distances = this.points.map((point) => ({
      dist: Math.sqrt(params.reduce((sum, p, i) => sum + Math.pow(p - point.params[i], 2), 0)),
      score: point.score,
    }));

    // 找到最近的 k 个点
    distances.sort((a, b) => a.dist - b.dist);
    const k = Math.min(5, distances.length);
    const nearest = distances.slice(0, k);

    // 加权平均
    const weights = nearest.map((d) => 1 / (d.dist + 1e-6));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const mean = nearest.reduce((sum, d, i) => sum + weights[i] * d.score, 0) / totalWeight;

    // 标准差估计
    const variance = nearest.reduce((sum, d, i) => {
      return sum + weights[i] * Math.pow(d.score - mean, 2);
    }, 0) / totalWeight;

    return { mean, std: Math.sqrt(variance) + 0.1 };
  }
}

/**
 * 采集函数
 */
class AcquisitionFunction {
  constructor(
    private type: 'ei' | 'ucb' | 'pi',
    private kappa: number = 2.0,
    private xi: number = 0.01
  ) {}

  calculate(mean: number, std: number, bestScore: number): number {
    switch (this.type) {
      case 'ei': // Expected Improvement
        if (std < 1e-6) return 0;
        const z = (mean - bestScore - this.xi) / std;
        return (mean - bestScore - this.xi) * this.cdf(z) + std * this.pdf(z);

      case 'ucb': // Upper Confidence Bound
        return mean + this.kappa * std;

      case 'pi': // Probability of Improvement
        if (std < 1e-6) return mean > bestScore ? 1 : 0;
        const z2 = (mean - bestScore - this.xi) / std;
        return this.cdf(z2);

      default:
        return mean;
    }
  }

  private pdf(x: number): number {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
  }

  private cdf(x: number): number {
    // 近似实现
    return 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))));
  }
}

/**
 * 执行单次回测（与网格搜索共享实现）
 */
async function executeBayesianBacktest(
  strategyId: number,
  parameters: Record<string, number>,
  config: BayesianOptimizationConfig
): Promise<{ score: number; metrics: any }> {
  const metrics = await runRemoteBacktest({
    strategyId,
    parameters,
    backtestStart: config.backtestStart,
    backtestEnd: config.backtestEnd,
    benchmark: '000300.SH',
    initialCapital: config.initialCapital,
  });

  let score: number;
  switch (config.objective) {
    case 'max_sharpe':
      score = metrics.sharpeRatio;
      break;
    case 'max_return':
      score = metrics.totalReturn;
      break;
    case 'min_drawdown':
      score = -metrics.maxDrawdown;
      break;
    case 'max_calmar':
      score = metrics.calmarRatio;
      break;
  }

  return { score, metrics };
}

/**
 * 将参数从归一化空间转换到实际空间
 */
function normalizeParams(
  params: number[],
  bounds: ParameterBound[]
): Record<string, number> {
  const result: Record<string, number> = {};
  bounds.forEach((bound, i) => {
    result[bound.name] = params[i];
  });
  return result;
}

/**
 * 生成初始随机点
 */
function generateInitialPoints(
  bounds: ParameterBound[],
  nPoints: number,
  rng: RandomGenerator
): number[][] {
  const points: number[][] = [];
  for (let i = 0; i < nPoints; i++) {
    const point = bounds.map((bound) => rng.uniform(bound.min, bound.max));
    points.push(point);
  }
  return points;
}

/**
 * 执行贝叶斯优化
 */
export async function executeBayesianOptimization(
  config: BayesianOptimizationConfig
): Promise<BayesianOptimizationProgress> {
  const rng = new RandomGenerator();
  const model = new SurrogateModel(rng);
  const acquisition = new AcquisitionFunction(
    config.acquisitionFunction,
    config.kappa,
    config.xi
  );

  let bestScore = -Infinity;
  let bestResult: BayesianOptimizationResult | null = null;
  const history: BayesianOptimizationProgress['history'] = [];

  console.log(`[BayesianOpt] 开始优化，共 ${config.nIterations} 次迭代`);

  // 1. 初始点评估
  const initialPoints = generateInitialPoints(config.parameterBounds, config.nInitialPoints, rng);
  
  for (let i = 0; i < initialPoints.length; i++) {
    const params = normalizeParams(initialPoints[i], config.parameterBounds);
    const { score, metrics } = await executeBayesianBacktest(config.strategyId, params, config);

    model.addPoint(initialPoints[i], score);
    history.push({ parameters: params, score, metrics, iteration: i + 1 });

    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        parameters: params,
        score,
        metrics,
        iteration: i + 1,
      };
    }

    console.log(`[BayesianOpt] 初始点 ${i + 1}/${initialPoints.length}, 得分：${score.toFixed(4)}`);
  }

  // 2. 贝叶斯优化迭代
  for (let iter = initialPoints.length + 1; iter <= config.nIterations; iter++) {
    // 在参数空间采样候选点
    const candidates: Array<{ params: number[]; acqValue: number }> = [];
    for (let c = 0; c < 100; c++) {
      const candidate = config.parameterBounds.map((bound) => rng.uniform(bound.min, bound.max));
      const { mean, std } = model.predict(candidate);
      const acqValue = acquisition.calculate(mean, std, bestScore);
      candidates.push({ params: candidate, acqValue });
    }

    // 选择采集函数值最大的点
    candidates.sort((a, b) => b.acqValue - a.acqValue);
    const bestCandidate = candidates[0].params;

    // 评估该点
    const params = normalizeParams(bestCandidate, config.parameterBounds);
    const { score, metrics } = await executeBayesianBacktest(config.strategyId, params, config);

    model.addPoint(bestCandidate, score);
    history.push({ parameters: params, score, metrics, iteration: iter });

    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        parameters: params,
        score,
        metrics,
        iteration: iter,
      };
      console.log(`[BayesianOpt] 迭代 ${iter}/${config.nIterations}, 新最优得分：${score.toFixed(4)}`);
    } else {
      console.log(`[BayesianOpt] 迭代 ${iter}/${config.nIterations}, 得分：${score.toFixed(4)}`);
    }
  }

  console.log(`[BayesianOpt] 优化完成，最优得分：${bestScore.toFixed(4)}`);

  return {
    iteration: config.nIterations,
    totalIterations: config.nIterations,
    currentBest: bestResult,
    history,
  };
}

/**
 * 验证配置
 */
export function validateBayesianConfig(config: BayesianOptimizationConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.parameterBounds.length === 0) {
    errors.push('至少需要一个参数边界');
  }

  config.parameterBounds.forEach((bound, index) => {
    if (!bound.name || bound.name.trim() === '') {
      errors.push(`参数 ${index + 1} 缺少名称`);
    }

    if (bound.min >= bound.max) {
      errors.push(`参数 "${bound.name}" 的最小值必须小于最大值`);
    }
  });

  if (config.nIterations < 10) {
    errors.push('迭代次数过少，建议至少 10 次');
  }

  if (config.nIterations > 200) {
    errors.push('迭代次数过多，建议不超过 200 次');
  }

  if (config.nInitialPoints < 2) {
    errors.push('初始点数过少，建议至少 2 个');
  }

  if (config.nInitialPoints > config.nIterations / 2) {
    errors.push('初始点数不应超过总迭代次数的一半');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

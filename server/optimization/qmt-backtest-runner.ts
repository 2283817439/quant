import { QmtToolEngine } from "../ai/toolkit";

const qmtEngine = new QmtToolEngine();

export interface RemoteBacktestContext {
  strategyId: number;
  parameters: Record<string, number>;
  backtestStart: string;
  backtestEnd: string;
  benchmark?: string;
  initialCapital?: number;
}

export interface RemoteBacktestMetrics {
  totalReturn: number;
  annualReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  volatility: number;
  tradeCount: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildStrategyCode(context: RemoteBacktestContext): string {
  const paramEntries = Object.entries(context.parameters)
    .map(([key, value]) => `    "${key}": ${value}`)
    .join(",\n");

  return `# Auto-generated tuning strategy
# Strategy ID: ${context.strategyId}
# Backtest: ${context.backtestStart} -> ${context.backtestEnd}
# Benchmark: ${context.benchmark ?? "000300.SH"}

PARAMS = {
${paramEntries}
}

def init(context):
    context.params = PARAMS
    context.index = 0

def handlebar(context, data_dict):
    for symbol, data in data_dict.items():
        if len(data['close']) < 30:
            continue
        short = int(context.params.get('short_window', 10))
        long = int(context.params.get('long_window', 30))
        if short <= 0 or long <= 0 or short >= long:
            continue
        ma_short = data['close'][-short:].mean()
        ma_long = data['close'][-long:].mean()
        position = context.get_position(symbol)
        if ma_short > ma_long and not position:
            context.order_target_percent(symbol, min(context.params.get('max_position', 0.05), 0.2))
        elif ma_short < ma_long and position:
            context.order_target_percent(symbol, 0)

def on_order(context, order):
    pass
`;
}

function normalizeMetrics(report: any): RemoteBacktestMetrics {
  const metrics = report?.metrics ?? {};
  const totalReturn = Number(metrics.total_return ?? metrics.totalReturn ?? 0);
  const annualReturn = Number(metrics.annual_return ?? metrics.annualReturn ?? totalReturn);
  const sharpeRatio = Number(metrics.sharpe_ratio ?? metrics.sharpeRatio ?? 0);
  const maxDrawdown = Number(metrics.max_drawdown ?? metrics.maxDrawdown ?? 0);
  const calmarRatio = Number(metrics.calmar_ratio ?? metrics.calmarRatio ?? 0);
  const winRate = Number(metrics.win_rate ?? metrics.winRate ?? 0);
  const volatility = Number(metrics.volatility ?? 0);
  const tradeCount = Number(metrics.trade_count ?? metrics.tradeCount ?? 0);
  return {
    totalReturn,
    annualReturn,
    sharpeRatio,
    maxDrawdown,
    calmarRatio,
    winRate,
    volatility,
    tradeCount,
  };
}

export async function runRemoteBacktest(
  context: RemoteBacktestContext
): Promise<RemoteBacktestMetrics> {
  const strategyCode = buildStrategyCode(context);
  const submission = await qmtEngine.submitBacktest({
    strategy_code: strategyCode,
    backtest_config: {
      start: context.backtestStart,
      end: context.backtestEnd,
      benchmark: context.benchmark ?? "000300.SH",
      initialCapital: context.initialCapital ?? 1_000_000,
    },
  });

  let status = "pending";
  let attempts = 0;
  while (status === "pending" || status === "running") {
    const poll = await qmtEngine.getBacktestStatus({ task_id: submission.task_id });
    status = poll.status;
    if (status === "completed") break;
    if (status === "failed") {
      throw new Error(`Remote backtest failed: ${poll.status}`);
    }
    attempts += 1;
    if (attempts > 120) {
      throw new Error("Remote backtest timeout");
    }
    await sleep(2000);
  }

  const report = await qmtEngine.getBacktestReport({ task_id: submission.task_id });
  return normalizeMetrics(report.report);
}

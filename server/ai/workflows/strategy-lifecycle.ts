import { QmtToolEngine } from "../toolkit";
import { appendLog, StrategyTaskRecord, updateTask } from "../task-store";
import { OpenClawHarness } from "../openclaw-agent";

const toolEngine = new QmtToolEngine();
const harness = new OpenClawHarness();

function generateStrategyCode(task: StrategyTaskRecord, contextPlan: string): string {
  const symbols = task.input.symbols?.length ? task.input.symbols.join(", ") : "沪深300 成分股";
  const objective = task.input.objective ?? {};
  return `# Auto-generated strategy for ${task.input.title}
# Context plan:
# ${contextPlan.replace(/\n/g, "\n# ")}

from typing import Any

symbols = [${symbols
    .split(",")
    .map((code) => `"${code.trim()}"`)
    .join(", ")}]

def init(context):
    context.symbols = symbols
    context.max_drawdown = ${objective.maxDrawdown ?? 0.12}

def handlebar(context, data_dict):
    for symbol in context.symbols:
        data = data_dict.get(symbol)
        if not data:
            continue
        ma_short = data['close'][-10:].mean()
        ma_long = data['close'][-30:].mean()
        position = context.get_position(symbol)
        if ma_short > ma_long and not position:
            context.order_target_percent(symbol, 0.05)
        elif ma_short < ma_long and position:
            context.order_target_percent(symbol, 0)

def on_order(context, order):
    pass
`;
}

export async function runStrategyLifecycle(task: StrategyTaskRecord) {
  appendLog(task.id, "解析需求并调用 OpenClaw 生成计划");
  updateTask(task.id, { status: "analyzing" });
  const plan = await harness.runPlanningStep(
    task.id,
    `需求: ${task.input.description}\n目标: ${JSON.stringify(task.input.objective ?? {})}`
  );

  appendLog(task.id, "生成策略代码");
  updateTask(task.id, { status: "generating" });
  const code = generateStrategyCode(task, plan);

  appendLog(task.id, "提交 QMT 回测任务");
  updateTask(task.id, { status: "backtesting" });
  const backtest = await toolEngine.submitBacktest({
    strategy_code: code,
    backtest_config: {
      start: task.input.backtestRange?.start ?? "20220101",
      end: task.input.backtestRange?.end ?? "20231231",
      benchmark: task.input.benchmark ?? "000300.SH",
    },
  });

  let status = "pending";
  while (status === "pending" || status === "running") {
    const poll = await toolEngine.getBacktestStatus({ task_id: backtest.task_id });
    status = poll.status;
    appendLog(task.id, `回测状态：${status}${poll.progress ? ` (${poll.progress}%)` : ""}`);
    if (status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const report = await toolEngine.getBacktestReport({ task_id: backtest.task_id });
  appendLog(task.id, "回测完成，解析指标");

  if (task.input.deployToSimulation) {
    appendLog(task.id, "部署至模拟账户");
    updateTask(task.id, { status: "deploying" });
    const deployment = await toolEngine.deployStrategy({
      strategy_code: code,
      metadata: {
        taskId: task.id,
        benchmark: task.input.benchmark,
      },
    });
    appendLog(task.id, `部署完成，ID=${deployment.deployment_id}`);
  }

  updateTask(task.id, {
    status: "completed",
    result: {
      plan,
      backtest: report.report,
      generatedCode: code,
    },
  });
}

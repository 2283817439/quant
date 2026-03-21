import * as db from "./db";
import * as tradingDb from "./trading-db";
import { getSettingsFallback } from "./_core/settings-fallback";
import {
  getParameterScanConfig,
  getParameterScanOptimalResult,
  getUserParameterScanConfigs,
} from "./parameter-scan-db";
import { sendNotification } from "./notification-provider";
import { getExecutionAdapterForAccount } from "./trading-router";
import { detectStopLossPositions, getRiskControlConfig, validateOrderRisk } from "./risk-control-service";
import { createStateStore } from "./state-store";

export type MetricStatus = "normal" | "warning" | "critical";
export type EventLevel = "info" | "warning" | "critical";
export type EventType = "engine" | "order" | "risk" | "optimization" | "notification";
export type NotificationChannel = "in_app" | "email" | "sms";

export type MonitorEvent = {
  id: string;
  type: EventType;
  level: EventLevel;
  title: string;
  message: string;
  strategyId?: number;
  createdAt: Date;
};

export type RiskMetricSnapshot = {
  key: string;
  label: string;
  value: number;
  threshold: number;
  unit: string;
  direction: "max" | "min";
  status: MetricStatus;
};

export type NotificationMessage = {
  id: string;
  channel: NotificationChannel;
  level: EventLevel;
  title: string;
  message: string;
  target: string;
  status: "sent" | "failed" | "read";
  createdAt: Date;
};

export type ChannelSetting = {
  enabled: boolean;
  target: string;
};

export type AlertThresholdConfig = {
  maxDrawdown: number;
  maxDailyLoss: number;
  maxVar95: number;
  maxConcentration: number;
};

export type AlertConfig = {
  thresholds: AlertThresholdConfig;
  channels: Record<NotificationChannel, ChannelSetting>;
};

export type StrategyExecutionSnapshot = {
  strategyId: number;
  strategyName: string;
  isRunning: boolean;
  startedAt: Date | null;
  lastHeartbeat: Date | null;
  cycleCount: number;
  ordersToday: number;
  pnl: number;
  baseCapital: number;
  boundAccountId: number | null;
  lastExecutionAt: Date | null;
  autoOptimizeEnabled: boolean;
  optimizeIntervalMinutes: number;
  autoOptimizeScanConfigId: number | null;
  nextOptimizeAt: Date | null;
  lastOptimizationAt: Date | null;
  appliedScanConfigId: number | null;
  appliedObjectiveValue: number | null;
  latestParameters: Record<string, number>;
};

export type MonitorSnapshot = {
  generatedAt: Date;
  execution: StrategyExecutionSnapshot[];
  riskMetrics: RiskMetricSnapshot[];
  events: MonitorEvent[];
  alerts: RiskMetricSnapshot[];
  notifications: NotificationMessage[];
};

type StrategyRuntimeState = {
  strategyId: number;
  strategyName: string;
  isRunning: boolean;
  startedAt: Date | null;
  lastHeartbeat: Date | null;
  cycleCount: number;
  ordersToday: number;
  pnl: number;
  baseCapital: number;
  positionMarketValue: number;
  boundAccountId: number | null;
  lastExecutionAt: Date | null;
  stopLossTriggeredSymbols: Set<string>;
  autoOptimizeEnabled: boolean;
  optimizeIntervalMinutes: number;
  autoOptimizeScanConfigId: number | null;
  nextOptimizeAt: Date | null;
  lastOptimizationAt: Date | null;
  appliedScanConfigId: number | null;
  appliedObjectiveValue: number | null;
  latestParameters: Record<string, number>;
};

type AutoOptimizeJob = {
  enabled: boolean;
  intervalMinutes: number;
  scanConfigId: number | null;
  running: boolean;
  timer: NodeJS.Timeout;
};

type UserMonitorState = {
  engines: Map<number, StrategyRuntimeState>;
  events: MonitorEvent[];
  notifications: NotificationMessage[];
  alertConfig: AlertConfig;
  metricStatus: Map<string, MetricStatus>;
  autoJobs: Map<number, AutoOptimizeJob>;
  seq: number;
  notificationSeq: number;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeParameterKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

function defaultAlertConfig(): AlertConfig {
  return {
    thresholds: {
      maxDrawdown: 0.12,
      maxDailyLoss: 0.06,
      maxVar95: 0.04,
      maxConcentration: 0.35,
    },
    channels: {
      in_app: { enabled: true, target: "" },
      email: { enabled: false, target: "" },
      sms: { enabled: false, target: "" },
    },
  };
}

type PersistedMonitorState = {
  alertConfig: AlertConfig;
  metricStatus: Record<string, MetricStatus>;
};

const monitorStateStore = createStateStore<Record<number, PersistedMonitorState>>("execution-monitor");

export class ExecutionMonitorService {
  private readonly userStates = new Map<number, UserMonitorState>();
  private readonly persistedSnapshots: Record<number, PersistedMonitorState>;

  constructor() {
    this.persistedSnapshots = monitorStateStore.load() ?? {};
  }

  private getState(userId: number): UserMonitorState {
    const existing = this.userStates.get(userId);
    if (existing) {
      return existing;
    }

    const created: UserMonitorState = {
      engines: new Map<number, StrategyRuntimeState>(),
      events: [],
      notifications: [],
      alertConfig: defaultAlertConfig(),
      metricStatus: new Map<string, MetricStatus>(),
      autoJobs: new Map<number, AutoOptimizeJob>(),
      seq: 1,
      notificationSeq: 1,
    };
    const persisted = this.persistedSnapshots[userId];
    if (persisted) {
      created.alertConfig = persisted.alertConfig ?? defaultAlertConfig();
      created.metricStatus = new Map<string, MetricStatus>(Object.entries(persisted.metricStatus ?? {}));
    }

    this.userStates.set(userId, created);
    this.persistUserState(userId);
    return created;
  }

  private persistUserState(userId: number): void {
    const state = this.userStates.get(userId);
    if (!state) return;
    this.persistedSnapshots[userId] = {
      alertConfig: state.alertConfig,
      metricStatus: Object.fromEntries(state.metricStatus.entries()),
    };
    monitorStateStore.save(this.persistedSnapshots);
  }

  private nextEventId(state: UserMonitorState): string {
    const id = `evt_${Date.now()}_${state.seq}`;
    state.seq += 1;
    return id;
  }

  private nextNotificationId(state: UserMonitorState): string {
    const id = `ntf_${Date.now()}_${state.notificationSeq}`;
    state.notificationSeq += 1;
    return id;
  }

  private pushEvent(
    state: UserMonitorState,
    event: Omit<MonitorEvent, "id" | "createdAt">
  ): MonitorEvent {
    const record: MonitorEvent = {
      id: this.nextEventId(state),
      createdAt: new Date(),
      ...event,
    };

    state.events.unshift(record);
    if (state.events.length > 300) {
      state.events.length = 300;
    }

    return record;
  }

  private pushNotification(
    state: UserMonitorState,
    message: Omit<NotificationMessage, "id" | "createdAt">
  ): NotificationMessage {
    const record: NotificationMessage = {
      id: this.nextNotificationId(state),
      createdAt: new Date(),
      ...message,
    };

    state.notifications.unshift(record);
    if (state.notifications.length > 300) {
      state.notifications.length = 300;
    }

    return record;
  }

  private async syncStrategies(userId: number): Promise<void> {
    const state = this.getState(userId);

    let strategies: Awaited<ReturnType<typeof db.getStrategiesByUserId>> = [];
    try {
      strategies = await db.getStrategiesByUserId(userId);
    } catch {
      strategies = [];
    }

    if (strategies.length === 0) {
      for (const strategyId of Array.from(state.autoJobs.keys())) {
        this.stopAutoOptimizeJob(userId, strategyId);
      }
      state.engines.clear();
      return;
    }

    const keepIds = new Set<number>();
    for (const strategy of strategies) {
      keepIds.add(strategy.id);
      const existing = state.engines.get(strategy.id);
      const baseCapital = asNumber(strategy.initialCapital, 1_000_000);

      if (existing) {
        existing.strategyName = strategy.name;
        existing.baseCapital = baseCapital;
        existing.positionMarketValue = existing.positionMarketValue ?? 0;
        existing.boundAccountId = existing.boundAccountId ?? null;
        existing.lastExecutionAt = existing.lastExecutionAt ?? null;
        existing.stopLossTriggeredSymbols = existing.stopLossTriggeredSymbols ?? new Set<string>();
        continue;
      }

      state.engines.set(strategy.id, {
        strategyId: strategy.id,
        strategyName: strategy.name,
        isRunning: false,
        startedAt: null,
        lastHeartbeat: null,
        cycleCount: 0,
        ordersToday: 0,
        pnl: 0,
        baseCapital,
        positionMarketValue: 0,
        boundAccountId: null,
        lastExecutionAt: null,
        stopLossTriggeredSymbols: new Set<string>(),
        autoOptimizeEnabled: false,
        optimizeIntervalMinutes: 60,
        autoOptimizeScanConfigId: null,
        nextOptimizeAt: null,
        lastOptimizationAt: null,
        appliedScanConfigId: null,
        appliedObjectiveValue: null,
        latestParameters: {
          short_window: asNumber(strategy.shortWindow, 20),
          long_window: asNumber(strategy.longWindow, 60),
          volatility_window: asNumber(strategy.volatilityWindow, 30),
          target_count: asNumber(strategy.targetCount, 10),
          trend_ratio: asNumber(strategy.trendRatio, 0.5),
          stop_loss_ratio: asNumber(strategy.stopLossRatio, 0.08),
        },
      });
    }

    for (const [strategyId, engine] of Array.from(state.engines.entries())) {
      if (!keepIds.has(strategyId)) {
        if (engine.isRunning) {
          this.stopAutoOptimizeJob(userId, strategyId);
        }
        state.engines.delete(strategyId);
      }
    }
  }

  private pumpEngineRuntime(state: UserMonitorState): void {
    const now = new Date();

    for (const engine of Array.from(state.engines.values())) {
      if (!engine.isRunning) {
        continue;
      }

      engine.lastHeartbeat = now;
      engine.cycleCount += 1;
    }
  }

  private async runStrategyExecution(userId: number, state: UserMonitorState): Promise<void> {
    let connectedAccounts: Array<
      Awaited<ReturnType<typeof tradingDb.getTradingAccountsByUserId>>[number]
    > = [];
    try {
      connectedAccounts = (await tradingDb.getTradingAccountsByUserId(userId)).filter(
        (item) => item.isConnected
      );
    } catch (error) {
      this.pushEvent(state, {
        type: "engine",
        level: "warning",
        title: "自动执行暂不可用",
        message: `读取交易账户失败: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    for (const engine of Array.from(state.engines.values())) {
      if (!engine.isRunning || engine.strategyId <= 0) {
        continue;
      }

      if (engine.lastExecutionAt && Date.now() - engine.lastExecutionAt.getTime() < 15_000) {
        continue;
      }

      const account =
        connectedAccounts.find((item) => item.strategyId === engine.strategyId) ?? connectedAccounts[0];

      if (!account) {
        engine.boundAccountId = null;
        if (engine.cycleCount % 20 === 0) {
          this.pushEvent(state, {
            type: "engine",
            level: "warning",
            strategyId: engine.strategyId,
            title: "未发现可用实盘账户",
            message: `${engine.strategyName} 未绑定已连接交易账户，自动执行已跳过。`,
          });
        }
        continue;
      }

      engine.boundAccountId = account.id;

      try {
        const { adapter } = await getExecutionAdapterForAccount(userId, account.id);

        const positions = (await adapter.getPositions()).map((item) => ({
          symbol: item.symbol,
          quantity: item.quantity,
          costPrice: item.costPrice,
          currentPrice: item.currentPrice,
          marketValue: asNumber((item as { marketValue?: unknown }).marketValue, item.quantity * item.currentPrice),
          floatingProfit: asNumber((item as { floatingProfit?: unknown }).floatingProfit),
        }));
        engine.positionMarketValue = roundTo(
          positions.reduce((sum, item) => sum + Math.max(0, item.marketValue), 0),
          2
        );
        engine.pnl = roundTo(
          positions.reduce((sum, item) => sum + item.floatingProfit, 0),
          2
        );

        const riskConfig = getRiskControlConfig(account.config);
        const stopLossTargets = detectStopLossPositions(positions, riskConfig);

        for (const position of stopLossTargets) {
          if (engine.stopLossTriggeredSymbols.has(position.symbol)) {
            continue;
          }

          const quantity = Math.max(1, Math.floor(position.quantity));
          const risk = await validateOrderRisk({
            accountId: account.id,
            accountConfig: account.config,
            quantity,
            price: position.currentPrice,
          });

          if (!risk.allowed) {
            this.pushEvent(state, {
              type: "risk",
              level: "warning",
              strategyId: engine.strategyId,
              title: "止损单被风控拦截",
              message: `${position.symbol} 止损触发，但订单未通过风控: ${risk.reason}`,
            });
            continue;
          }

          const orderId = await adapter.submitOrder(
            position.symbol,
            "sell",
            quantity,
            position.currentPrice
          );

          await tradingDb.saveOrder({
            accountId: account.id,
            orderId,
            symbol: position.symbol,
            side: "sell",
            quantity,
            price: position.currentPrice.toString(),
            status: "pending",
            filledQuantity: 0,
            submitTime: new Date(),
          });

          await tradingDb.saveTradeLog({
            accountId: account.id,
            orderId,
            eventType: "order_submitted",
            symbol: position.symbol,
            quantity,
            price: position.currentPrice.toString(),
            description: `STOP_LOSS SELL ${quantity} ${position.symbol} @ ${position.currentPrice}`,
          });

          engine.stopLossTriggeredSymbols.add(position.symbol);
          engine.ordersToday += 1;

          this.pushEvent(state, {
            type: "risk",
            level: "critical",
            strategyId: engine.strategyId,
            title: "触发自动止损",
            message: `${position.symbol} 跌破止损阈值，已自动提交卖出 ${quantity} 股。`,
          });
        }

        const targetCount = Math.max(
          1,
          Math.round(asNumber(engine.latestParameters.target_count, 10))
        );
        const settingsFallback = getSettingsFallback();
        const symbol = (
          process.env.STRATEGY_EXEC_DEFAULT_SYMBOL ||
          settingsFallback.indexSymbol ||
          ""
        ).trim();
        if (!symbol) {
          if (engine.cycleCount % 40 === 0) {
            this.pushEvent(state, {
              type: "engine",
              level: "warning",
              strategyId: engine.strategyId,
              title: "自动下单已跳过",
              message: "未配置 STRATEGY_EXEC_DEFAULT_SYMBOL，无法执行自动买入。",
            });
          }
          engine.lastExecutionAt = new Date();
          continue;
        }

        const heldSymbols = new Set(
          positions.filter((item) => item.quantity > 0).map((item) => item.symbol)
        );
        if (heldSymbols.has(symbol) || heldSymbols.size >= targetCount) {
          engine.lastExecutionAt = new Date();
          continue;
        }

        const pendingOrders = await adapter.getOrders("pending");
        const hasPendingBuy = pendingOrders.some(
          (item) => item.side === "buy" && item.symbol === symbol
        );
        if (hasPendingBuy) {
          engine.lastExecutionAt = new Date();
          continue;
        }

        const configuredPrice = Number.parseFloat(process.env.STRATEGY_EXEC_DEFAULT_PRICE || "");
        const fallbackPrice = positions.find((item) => item.symbol === symbol)?.currentPrice ?? 0;
        const price = roundTo(
          Number.isFinite(configuredPrice) && configuredPrice > 0 ? configuredPrice : fallbackPrice,
          2
        );
        if (!(price > 0)) {
          if (engine.cycleCount % 40 === 0) {
            this.pushEvent(state, {
              type: "engine",
              level: "warning",
              strategyId: engine.strategyId,
              title: "自动下单已跳过",
              message: `标的 ${symbol} 未获取到有效价格，请配置 STRATEGY_EXEC_DEFAULT_PRICE。`,
            });
          }
          engine.lastExecutionAt = new Date();
          continue;
        }

        const configuredQuantity = Number.parseInt(process.env.STRATEGY_EXEC_DEFAULT_QUANTITY || "", 10);
        const quantity =
          Number.isFinite(configuredQuantity) && configuredQuantity > 0
            ? configuredQuantity
            : Math.max(100, Math.round(targetCount * 10));

        const risk = await validateOrderRisk({
          accountId: account.id,
          accountConfig: account.config,
          quantity,
          price,
        });

        if (!risk.allowed) {
          this.pushEvent(state, {
            type: "risk",
            level: "warning",
            strategyId: engine.strategyId,
            title: "策略下单被风控拦截",
            message: risk.reason || "风险控制策略拒绝下单",
          });
          engine.lastExecutionAt = new Date();
          continue;
        }

        const orderId = await adapter.submitOrder(symbol, "buy", quantity, price);

        await tradingDb.saveOrder({
          accountId: account.id,
          orderId,
          symbol,
          side: "buy",
          quantity,
          price: price.toString(),
          status: "pending",
          filledQuantity: 0,
          submitTime: new Date(),
        });

        await tradingDb.saveTradeLog({
          accountId: account.id,
          orderId,
          eventType: "order_submitted",
          symbol,
          quantity,
          price: price.toString(),
          description: `AUTO BUY ${quantity} ${symbol} @ ${price}`,
        });

        engine.ordersToday += 1;
        engine.lastExecutionAt = new Date();

        this.pushEvent(state, {
          type: "order",
          level: "info",
          strategyId: engine.strategyId,
          title: "自动策略下单",
          message: `${engine.strategyName} 已自动提交买单 ${symbol} ${quantity} @ ${price} (账户#${account.id})`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.pushEvent(state, {
          type: "engine",
          level: "critical",
          strategyId: engine.strategyId,
          title: "策略自动执行失败",
          message,
        });
      }
    }
  }

  private buildRiskMetrics(state: UserMonitorState): RiskMetricSnapshot[] {
    const thresholds = state.alertConfig.thresholds;
    const engines = Array.from(state.engines.values());
    const running = engines.filter((engine) => engine.isRunning);

    const totalBase = engines.reduce((sum, item) => sum + item.baseCapital, 0) || 1_000_000;
    const totalPnl = engines.reduce((sum, item) => sum + item.pnl, 0);
    const drawdown = roundTo(Math.max(0, -totalPnl / totalBase), 4);
    const dailyLoss = roundTo(Math.max(0, -totalPnl / totalBase), 4);

    const totalPositionValue = Math.max(
      0,
      engines.reduce((sum, item) => sum + Math.max(0, item.positionMarketValue), 0)
    );
    const largestPositionValue = engines.reduce(
      (max, item) => Math.max(max, Math.max(0, item.positionMarketValue)),
      0
    );
    const runningConcentration =
      totalPositionValue > 0 ? roundTo(largestPositionValue / totalPositionValue, 4) : 0;

    const var95 = roundTo(
      Math.min(0.2, Math.max(0, drawdown * 0.6 + dailyLoss * 0.25 + runningConcentration * 0.15)),
      4
    );

    const composeStatus = (value: number, threshold: number): MetricStatus => {
      if (value >= threshold * 1.3) {
        return "critical";
      }
      if (value >= threshold) {
        return "warning";
      }
      return "normal";
    };

    return [
      {
        key: "drawdown",
        label: "组合回撤",
        value: drawdown,
        threshold: thresholds.maxDrawdown,
        unit: "%",
        direction: "max",
        status: composeStatus(drawdown, thresholds.maxDrawdown),
      },
      {
        key: "daily_loss",
        label: "日内亏损",
        value: dailyLoss,
        threshold: thresholds.maxDailyLoss,
        unit: "%",
        direction: "max",
        status: composeStatus(dailyLoss, thresholds.maxDailyLoss),
      },
      {
        key: "var95",
        label: "VaR(95)",
        value: var95,
        threshold: thresholds.maxVar95,
        unit: "%",
        direction: "max",
        status: composeStatus(var95, thresholds.maxVar95),
      },
      {
        key: "concentration",
        label: "持仓集中度",
        value: runningConcentration,
        threshold: thresholds.maxConcentration,
        unit: "%",
        direction: "max",
        status: composeStatus(runningConcentration, thresholds.maxConcentration),
      },
    ];
  }

  private dispatchAlertNotifications(
    state: UserMonitorState,
    metric: RiskMetricSnapshot
  ): Promise<void> {
    return this.dispatchAlertNotificationsInternal(state, metric);
  }

  private async dispatchAlertNotificationsInternal(
    state: UserMonitorState,
    metric: RiskMetricSnapshot
  ): Promise<void> {
    const level: EventLevel = metric.status === "critical" ? "critical" : "warning";

    const alertTitle = `${metric.label} 超阈值`;
    const alertMessage = `${metric.label} 当前 ${(metric.value * 100).toFixed(2)}%，阈值 ${(metric.threshold * 100).toFixed(2)}%。`;

    this.pushEvent(state, {
      type: "risk",
      level,
      title: alertTitle,
      message: alertMessage,
    });

    const channels = state.alertConfig.channels;

    const channelEntries: Array<[NotificationChannel, ChannelSetting]> = [
      ["in_app", channels.in_app],
      ["email", channels.email],
      ["sms", channels.sms],
    ];

    for (const [channel, config] of channelEntries) {
      if (!config.enabled) {
        continue;
      }

      const target = config.target || (channel === "in_app" ? "in_app" : "");
      const result = await sendNotification({
        channel,
        level,
        title: alertTitle,
        message: alertMessage,
        target,
      });

      const notification = this.pushNotification(state, {
        channel,
        level,
        title: alertTitle,
        message: alertMessage,
        target,
        status: result.ok ? "sent" : "failed",
      });

      this.pushEvent(state, {
        type: "notification",
        level: result.ok ? "info" : "warning",
        title: `${channel.toUpperCase()} 通知${result.ok ? "已发送" : "失败"}`,
        message: `${notification.title} -> ${target || "默认通道"} (${result.provider}: ${result.providerMessage})`,
      });
    }
  }

  private async evaluateAlertTransitions(
    userId: number,
    state: UserMonitorState,
    metrics: RiskMetricSnapshot[],
  ): Promise<void> {
    for (const metric of metrics) {
      const previous = state.metricStatus.get(metric.key) ?? "normal";
      const current = metric.status;

      if (current !== previous) {
        state.metricStatus.set(metric.key, current);
        this.persistUserState(userId);

        if (current === "normal") {
          this.pushEvent(state, {
            type: "risk",
            level: "info",
            title: `${metric.label} 已恢复`,
            message: `${metric.label} 回落至安全区间。`,
          });
          continue;
        }

        await this.dispatchAlertNotifications(state, metric);
      }
    }
  }

  private toSnapshot(engine: StrategyRuntimeState): StrategyExecutionSnapshot {
    return {
      strategyId: engine.strategyId,
      strategyName: engine.strategyName,
      isRunning: engine.isRunning,
      startedAt: engine.startedAt,
      lastHeartbeat: engine.lastHeartbeat,
      cycleCount: engine.cycleCount,
      ordersToday: engine.ordersToday,
      pnl: roundTo(engine.pnl, 2),
      baseCapital: engine.baseCapital,
      boundAccountId: engine.boundAccountId,
      lastExecutionAt: engine.lastExecutionAt,
      autoOptimizeEnabled: engine.autoOptimizeEnabled,
      optimizeIntervalMinutes: engine.optimizeIntervalMinutes,
      autoOptimizeScanConfigId: engine.autoOptimizeScanConfigId,
      nextOptimizeAt: engine.nextOptimizeAt,
      lastOptimizationAt: engine.lastOptimizationAt,
      appliedScanConfigId: engine.appliedScanConfigId,
      appliedObjectiveValue: engine.appliedObjectiveValue,
      latestParameters: engine.latestParameters,
    };
  }

  async getSnapshot(userId: number, eventLimit = 80): Promise<MonitorSnapshot> {
    await this.syncStrategies(userId);

    const state = this.getState(userId);

    this.pumpEngineRuntime(state);
    await this.runStrategyExecution(userId, state);

    const riskMetrics = this.buildRiskMetrics(state);
    await this.evaluateAlertTransitions(userId, state, riskMetrics);

    const alerts = riskMetrics.filter((metric) => metric.status !== "normal");

    return {
      generatedAt: new Date(),
      execution: Array.from(state.engines.values())
        .map((engine) => this.toSnapshot(engine))
        .sort((a, b) => a.strategyId - b.strategyId),
      riskMetrics,
      alerts,
      events: state.events.slice(0, Math.max(10, Math.min(eventLimit, 200))),
      notifications: state.notifications.slice(0, 80),
    };
  }

  async startEngine(userId: number, strategyId: number): Promise<{ success: true }> {
    await this.syncStrategies(userId);

    const state = this.getState(userId);
    const engine = state.engines.get(strategyId);
    if (!engine) {
      throw new Error("Strategy not found");
    }

    if (!engine.isRunning) {
      engine.isRunning = true;
      engine.startedAt = new Date();
      engine.lastHeartbeat = new Date();
      engine.lastExecutionAt = null;
      engine.stopLossTriggeredSymbols.clear();
      this.pushEvent(state, {
        type: "engine",
        level: "info",
        title: "策略引擎已启动",
        strategyId,
        message: `${engine.strategyName} 已进入执行状态。`,
      });
    }

    return { success: true };
  }

  async stopEngine(userId: number, strategyId: number): Promise<{ success: true }> {
    await this.syncStrategies(userId);

    const state = this.getState(userId);
    const engine = state.engines.get(strategyId);
    if (!engine) {
      throw new Error("Strategy not found");
    }

    if (engine.isRunning) {
      engine.isRunning = false;
      this.pushEvent(state, {
        type: "engine",
        level: "warning",
        title: "策略引擎已停止",
        strategyId,
        message: `${engine.strategyName} 已停止执行。`,
      });
    }

    return { success: true };
  }

  async getAlertConfig(userId: number): Promise<AlertConfig> {
    const state = this.getState(userId);
    return state.alertConfig;
  }

  async updateAlertConfig(userId: number, config: AlertConfig): Promise<AlertConfig> {
    const state = this.getState(userId);
    state.alertConfig = config;
    this.persistUserState(userId);

    this.pushEvent(state, {
      type: "risk",
      level: "info",
      title: "风控阈值已更新",
      message: "告警阈值与通知通道配置已保存。",
    });

    return state.alertConfig;
  }

  async getNotifications(userId: number, limit = 50): Promise<NotificationMessage[]> {
    const state = this.getState(userId);
    return state.notifications.slice(0, Math.max(1, Math.min(limit, 200)));
  }

  async markNotificationRead(userId: number, notificationId: string): Promise<{ success: true }> {
    const state = this.getState(userId);
    const target = state.notifications.find((item) => item.id === notificationId);
    if (!target) {
      throw new Error("Notification not found");
    }

    target.status = "read";
    return { success: true };
  }

  async sendTestNotification(
    userId: number,
    input: {
      channel: NotificationChannel;
      target?: string;
      title?: string;
      message?: string;
    }
  ): Promise<{ success: boolean; provider: string; providerMessage: string }> {
    const state = this.getState(userId);
    const level: EventLevel = "warning";
    const title = input.title?.trim() || "测试告警通知";
    const message = input.message?.trim() || "这是一条来自执行监控系统的测试通知。";
    const target = input.target?.trim() || (input.channel === "in_app" ? "in_app" : "");

    const result = await sendNotification({
      channel: input.channel,
      level,
      title,
      message,
      target,
    });

    const notification = this.pushNotification(state, {
      channel: input.channel,
      level,
      title,
      message,
      target,
      status: result.ok ? "sent" : "failed",
    });

    this.pushEvent(state, {
      type: "notification",
      level: result.ok ? "info" : "warning",
      title: `${input.channel.toUpperCase()} 测试通知${result.ok ? "已发送" : "失败"}`,
      message: `${notification.title} -> ${target || "默认通道"} (${result.provider}: ${result.providerMessage})`,
    });

    return {
      success: result.ok,
      provider: result.provider,
      providerMessage: result.providerMessage,
    };
  }

  private mapOptimalParameters(parameters: Record<string, number>): {
    updateData: Record<string, unknown>;
    appliedParameters: Record<string, number>;
  } {
    const normalized = new Map<string, number>();
    for (const [key, value] of Object.entries(parameters)) {
      normalized.set(normalizeParameterKey(key), value);
    }

    const pick = (aliases: string[]): number | undefined => {
      for (const alias of aliases) {
        const value = normalized.get(normalizeParameterKey(alias));
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    };

    const updateData: Record<string, unknown> = {};
    const appliedParameters: Record<string, number> = {};

    const shortWindow = pick(["short_window", "shortWindow", "fast_ma", "ma_fast"]);
    if (shortWindow !== undefined) {
      const value = Math.max(1, Math.round(shortWindow));
      updateData.shortWindow = value;
      appliedParameters.short_window = value;
    }

    const longWindow = pick(["long_window", "longWindow", "slow_ma", "ma_slow"]);
    if (longWindow !== undefined) {
      const value = Math.max(2, Math.round(longWindow));
      updateData.longWindow = value;
      appliedParameters.long_window = value;
    }

    const volatilityWindow = pick(["volatility_window", "volatilityWindow"]);
    if (volatilityWindow !== undefined) {
      const value = Math.max(2, Math.round(volatilityWindow));
      updateData.volatilityWindow = value;
      appliedParameters.volatility_window = value;
    }

    const targetCount = pick(["target_count", "targetCount"]);
    if (targetCount !== undefined) {
      const value = Math.max(1, Math.round(targetCount));
      updateData.targetCount = value;
      appliedParameters.target_count = value;
    }

    const trendRatio = pick(["trend_ratio", "trendRatio"]);
    if (trendRatio !== undefined) {
      const value = roundTo(trendRatio, 4);
      updateData.trendRatio = value.toString();
      appliedParameters.trend_ratio = value;
    }

    const stopLossRatio = pick(["stop_loss_ratio", "stopLossRatio"]);
    if (stopLossRatio !== undefined) {
      const value = roundTo(stopLossRatio, 4);
      updateData.stopLossRatio = value.toString();
      appliedParameters.stop_loss_ratio = value;
    }

    const maxProfitDrawdown = pick(["max_profit_drawdown", "maxProfitDrawdown"]);
    if (maxProfitDrawdown !== undefined) {
      const value = roundTo(maxProfitDrawdown, 4);
      updateData.maxProfitDrawdown = value.toString();
      appliedParameters.max_profit_drawdown = value;
    }

    const newHighTimeout = pick(["new_high_timeout", "newHighTimeout", "new_high_timeout_days"]);
    if (newHighTimeout !== undefined) {
      const value = Math.max(1, Math.round(newHighTimeout));
      updateData.newHighTimeout = value;
      appliedParameters.new_high_timeout = value;
    }

    return { updateData, appliedParameters };
  }

  private normalizeParameterValues(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const raw = value as Record<string, unknown>;
    const result: Record<string, number> = {};

    for (const [key, val] of Object.entries(raw)) {
      const numeric = asNumber(val, Number.NaN);
      if (Number.isFinite(numeric)) {
        result[key] = numeric;
      }
    }

    return result;
  }

  private async resolveOptimalResult(
    userId: number,
    strategyId: number,
    scanConfigId?: number
  ): Promise<{ scanConfigId: number; objectiveValue: number; parameters: Record<string, number> }> {
    if (scanConfigId !== undefined) {
      const config = await getParameterScanConfig(scanConfigId);
      if (!config || config.userId !== userId) {
        throw new Error("Scan config not found");
      }
      if (config.strategyId !== strategyId) {
        throw new Error("Scan config does not belong to this strategy");
      }

      const optimal = await getParameterScanOptimalResult(scanConfigId);
      if (!optimal) {
        throw new Error("No optimal result found for this scan config");
      }

      return {
        scanConfigId,
        objectiveValue: asNumber(optimal.objectiveValue),
        parameters: this.normalizeParameterValues(optimal.parameters),
      };
    }

    const configs = await getUserParameterScanConfigs(userId);
    const candidates = configs
      .filter((config) => config.strategyId === strategyId)
      .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());

    for (const config of candidates) {
      const optimal = await getParameterScanOptimalResult(config.id);
      if (!optimal) {
        continue;
      }

      const normalized = this.normalizeParameterValues(optimal.parameters);
      if (Object.keys(normalized).length === 0) {
        continue;
      }

      return {
        scanConfigId: config.id,
        objectiveValue: asNumber(optimal.objectiveValue),
        parameters: normalized,
      };
    }

    throw new Error("No available optimal parameters for this strategy");
  }

  private async applyOptimalParametersInternal(
    userId: number,
    input: { strategyId: number; scanConfigId?: number },
    source: "manual" | "scheduler"
  ): Promise<{
    success: true;
    strategyId: number;
    strategyName: string;
    scanConfigId: number;
    objectiveValue: number;
    appliedParameters: Record<string, number>;
  }> {
    await this.syncStrategies(userId);

    const state = this.getState(userId);
    const engine = state.engines.get(input.strategyId);
    if (!engine) {
      throw new Error("Strategy not found");
    }

    const optimal = await this.resolveOptimalResult(userId, input.strategyId, input.scanConfigId);

    const { updateData, appliedParameters } = this.mapOptimalParameters(optimal.parameters);
    if (Object.keys(appliedParameters).length === 0) {
      throw new Error("No recognized strategy parameters in optimal result");
    }

    const strategy = await db.getStrategyById(input.strategyId);
    if (strategy && strategy.userId !== userId) {
      throw new Error("Strategy not found");
    }

    if (strategy) {
      await db.updateStrategy(input.strategyId, updateData as any);
    }

    engine.latestParameters = {
      ...engine.latestParameters,
      ...appliedParameters,
    };
    engine.lastOptimizationAt = new Date();
    engine.appliedScanConfigId = optimal.scanConfigId;
    engine.appliedObjectiveValue = optimal.objectiveValue;

    const modeLabel = source === "scheduler" ? "定时调优" : "手动调优";
    this.pushEvent(state, {
      type: "optimization",
      level: "info",
      strategyId: input.strategyId,
      title: `${modeLabel}参数已应用`,
      message: `${engine.strategyName} 已应用扫描 #${optimal.scanConfigId} 的最优参数。`,
    });

    return {
      success: true,
      strategyId: engine.strategyId,
      strategyName: engine.strategyName,
      scanConfigId: optimal.scanConfigId,
      objectiveValue: optimal.objectiveValue,
      appliedParameters,
    };
  }

  async applyOptimalParameters(
    userId: number,
    input: { strategyId: number; scanConfigId?: number }
  ): Promise<{
    success: true;
    strategyId: number;
    strategyName: string;
    scanConfigId: number;
    objectiveValue: number;
    appliedParameters: Record<string, number>;
  }> {
    return this.applyOptimalParametersInternal(userId, input, "manual");
  }

  private stopAutoOptimizeJob(userId: number, strategyId: number): void {
    const state = this.getState(userId);
    const job = state.autoJobs.get(strategyId);
    if (!job) {
      return;
    }

    clearInterval(job.timer);
    state.autoJobs.delete(strategyId);
  }

  private async runAutoOptimization(userId: number, strategyId: number): Promise<void> {
    const state = this.getState(userId);
    const job = state.autoJobs.get(strategyId);
    if (!job || job.running) {
      return;
    }

    const engine = state.engines.get(strategyId);
    if (!engine || !engine.autoOptimizeEnabled) {
      return;
    }

    job.running = true;
    try {
      await this.applyOptimalParametersInternal(
        userId,
        {
          strategyId,
          scanConfigId: job.scanConfigId ?? undefined,
        },
        "scheduler"
      );
      engine.nextOptimizeAt = new Date(Date.now() + job.intervalMinutes * 60_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushEvent(state, {
        type: "optimization",
        level: "critical",
        strategyId,
        title: "定时调优失败",
        message,
      });
    } finally {
      job.running = false;
    }
  }

  async setAutoOptimization(
    userId: number,
    input: {
      strategyId: number;
      enabled: boolean;
      intervalMinutes: number;
      scanConfigId?: number;
    }
  ): Promise<{ success: true; nextOptimizeAt: Date | null }> {
    await this.syncStrategies(userId);

    const state = this.getState(userId);
    const engine = state.engines.get(input.strategyId);
    if (!engine) {
      throw new Error("Strategy not found");
    }

    this.stopAutoOptimizeJob(userId, input.strategyId);

    engine.autoOptimizeEnabled = input.enabled;
    engine.optimizeIntervalMinutes = input.intervalMinutes;
    engine.autoOptimizeScanConfigId = input.scanConfigId ?? null;

    if (!input.enabled) {
      engine.nextOptimizeAt = null;
      this.pushEvent(state, {
        type: "optimization",
        level: "warning",
        strategyId: input.strategyId,
        title: "自动调优已关闭",
        message: `${engine.strategyName} 不再自动应用最优参数。`,
      });
      return { success: true, nextOptimizeAt: null };
    }

    const intervalMinutes = Math.max(1, Math.floor(input.intervalMinutes));
    const timer = setInterval(() => {
      void this.runAutoOptimization(userId, input.strategyId);
    }, intervalMinutes * 60_000);
    timer.unref?.();

    state.autoJobs.set(input.strategyId, {
      enabled: true,
      intervalMinutes,
      scanConfigId: input.scanConfigId ?? null,
      timer,
      running: false,
    });

    engine.nextOptimizeAt = new Date(Date.now() + intervalMinutes * 60_000);

    this.pushEvent(state, {
      type: "optimization",
      level: "info",
      strategyId: input.strategyId,
      title: "自动调优已启用",
      message: `${engine.strategyName} 将每 ${intervalMinutes} 分钟重优化一次。`,
    });

    return { success: true, nextOptimizeAt: engine.nextOptimizeAt };
  }
}

export const executionMonitorService = new ExecutionMonitorService();



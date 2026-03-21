import * as tradingDb from "./trading-db";
import { getSettingsFallback } from "./_core/settings-fallback";

export type RiskControlConfig = {
  maxSingleOrderAmount: number;
  maxDailyOrderAmount: number;
  maxDailyOrderCount: number;
  stopLossRatio: number;
  autoStopLossEnabled: boolean;
};

export type RiskValidationResult = {
  allowed: boolean;
  reason?: string;
  config: RiskControlConfig;
  amount: number;
  dailyAmount: number;
  dailyCount: number;
};

export type PositionLike = {
  symbol: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown, fallback: number): number {
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

function asInt(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback);
  const parsed = Math.floor(n);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}

export function getRiskControlConfig(accountConfig: unknown): RiskControlConfig {
  const cfg = asRecord(accountConfig);
  const settingsFallback = getSettingsFallback();

  const maxSingleOrderAmount = Math.max(
    1,
    asNumber(cfg.maxSingleOrderAmount, asNumber(process.env.RISK_MAX_SINGLE_ORDER_AMOUNT, 200_000))
  );

  const maxDailyOrderAmount = Math.max(
    maxSingleOrderAmount,
    asNumber(cfg.maxDailyOrderAmount, asNumber(process.env.RISK_MAX_DAILY_ORDER_AMOUNT, 2_000_000))
  );

  const maxDailyOrderCount = Math.max(
    1,
    asInt(cfg.maxDailyOrderCount, asInt(process.env.RISK_MAX_DAILY_ORDER_COUNT, 200))
  );

  const stopLossRatio = Math.min(
    0.9,
    Math.max(
      0,
      asNumber(
        cfg.stopLossRatio,
        asNumber(
          process.env.RISK_STOP_LOSS_RATIO,
          settingsFallback.strategyStopLossRatio ?? 0.08
        )
      )
    )
  );

  const autoStopLossEnabled = asBoolean(
    cfg.autoStopLossEnabled,
    asBoolean(process.env.RISK_AUTO_STOP_LOSS_ENABLED, true)
  );

  return {
    maxSingleOrderAmount,
    maxDailyOrderAmount,
    maxDailyOrderCount,
    stopLossRatio,
    autoStopLossEnabled,
  };
}

function isSameDate(date: Date, target: Date): boolean {
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

export async function validateOrderRisk(input: {
  accountId: number;
  accountConfig: unknown;
  quantity: number;
  price: number;
}): Promise<RiskValidationResult> {
  const config = getRiskControlConfig(input.accountConfig);
  const amount = input.quantity * input.price;

  if (amount > config.maxSingleOrderAmount) {
    return {
      allowed: false,
      reason: `单笔金额超限: ${amount.toFixed(2)} > ${config.maxSingleOrderAmount.toFixed(2)}`,
      config,
      amount,
      dailyAmount: 0,
      dailyCount: 0,
    };
  }

  const orders = await tradingDb.getOrders(input.accountId);
  const now = new Date();

  let dailyAmount = 0;
  let dailyCount = 0;

  for (const order of orders) {
    const submitTime = order.submitTime instanceof Date
      ? order.submitTime
      : new Date(String(order.submitTime));

    if (Number.isNaN(submitTime.getTime()) || !isSameDate(submitTime, now)) {
      continue;
    }

    const itemAmount = Number(order.quantity) * asNumber(order.price, 0);
    dailyAmount += itemAmount;
    dailyCount += 1;
  }

  if (dailyCount + 1 > config.maxDailyOrderCount) {
    return {
      allowed: false,
      reason: `日内订单次数超限: ${dailyCount + 1} > ${config.maxDailyOrderCount}`,
      config,
      amount,
      dailyAmount,
      dailyCount,
    };
  }

  if (dailyAmount + amount > config.maxDailyOrderAmount) {
    return {
      allowed: false,
      reason: `日内累计金额超限: ${(dailyAmount + amount).toFixed(2)} > ${config.maxDailyOrderAmount.toFixed(2)}`,
      config,
      amount,
      dailyAmount,
      dailyCount,
    };
  }

  return {
    allowed: true,
    config,
    amount,
    dailyAmount,
    dailyCount,
  };
}

export function detectStopLossPositions(
  positions: PositionLike[],
  config: RiskControlConfig
): PositionLike[] {
  if (!config.autoStopLossEnabled || config.stopLossRatio <= 0) {
    return [];
  }

  return positions.filter((item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return false;
    }

    if (!Number.isFinite(item.costPrice) || item.costPrice <= 0) {
      return false;
    }

    if (!Number.isFinite(item.currentPrice) || item.currentPrice <= 0) {
      return false;
    }

    const triggerPrice = item.costPrice * (1 - config.stopLossRatio);
    return item.currentPrice <= triggerPrice;
  });
}




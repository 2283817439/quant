/**
 * 实盘交易数据库操作函数
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  tradingAccounts,
  marketData,
  orders,
  livePositions,
  tradeLogs,
  type InsertTradingAccount,
  type InsertMarketData,
  type InsertOrder,
  type InsertLivePosition,
  type InsertTradeLog,
} from "../drizzle/schema";

/**
 * 创建交易账户
 */
export async function createTradingAccount(data: InsertTradingAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tradingAccounts).values(data);
  return result;
}

/**
 * 获取用户的交易账户列表
 */
export async function getTradingAccountsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 本地开发模式：userId 为 0 时，返回所有账户
  if (userId === 0) {
    const accounts = await db
      .select()
      .from(tradingAccounts);
    return accounts;
  }

  const accounts = await db
    .select()
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId));
  return accounts;
}

/**
 * 获取交易账户详情
 */
export async function getTradingAccountById(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const account = await db
    .select()
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, accountId))
    .limit(1);
  return account[0];
}

/**
 * 更新交易账户连接状态
 */
export async function updateTradingAccountStatus(
  accountId: number,
  status: "connected" | "disconnected" | "error",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    connectionStatus: status,
    isConnected: status === "connected",
    lastConnectedAt: new Date(),
  };

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  await db.update(tradingAccounts).set(updateData).where(eq(tradingAccounts.id, accountId));
}

export async function updateTradingAccountAssets(
  accountId: number,
  assets: {
    totalAssets: number;
    availableCash: number;
    marketValue: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(tradingAccounts)
    .set({
      totalAssets: assets.totalAssets.toString(),
      availableCash: assets.availableCash.toString(),
      marketValue: assets.marketValue.toString(),
      updatedAt: new Date(),
    })
    .where(eq(tradingAccounts.id, accountId));
}

/**
 * 保存行情数据
 */
export async function saveMarketData(data: InsertMarketData) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(marketData).values(data);
}

/**
 * 获取最新行情数据
 */
export async function getLatestMarketData(accountId: number, symbol: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const data = await db
    .select()
    .from(marketData)
    .where(and(eq(marketData.accountId, accountId), eq(marketData.symbol, symbol)))
    .orderBy(desc(marketData.timestamp))
    .limit(1);

  return data[0];
}

/**
 * 保存订单
 */
export async function saveOrder(data: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(orders).values(data);
  return result;
}

/**
 * 获取订单列表
 */
export async function getOrders(accountId: number, status?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (status) {
    return await db
      .select()
      .from(orders)
      .where(and(eq(orders.accountId, accountId), eq(orders.status, status as any)))
      .orderBy(desc(orders.submitTime));
  }

  return await db
    .select()
    .from(orders)
    .where(eq(orders.accountId, accountId))
    .orderBy(desc(orders.submitTime));
}

/**
 * 更新订单状态
 */
export async function updateOrderStatus(
  orderId: string,
  status: "pending" | "partial" | "filled" | "cancelled" | "rejected",
  filledQuantity?: number,
  filledPrice?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (filledQuantity !== undefined) {
    updateData.filledQuantity = filledQuantity;
  }

  if (filledPrice !== undefined) {
    updateData.filledPrice = filledPrice;
  }

  await db.update(orders).set(updateData).where(eq(orders.orderId, orderId));
}

/**
 * 保存持仓
 */
export async function saveLivePosition(data: InsertLivePosition) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查是否已存在该持仓
  const existing = await db
    .select()
    .from(livePositions)
    .where(and(eq(livePositions.accountId, data.accountId), eq(livePositions.symbol, data.symbol)))
    .limit(1);

  if (existing.length > 0) {
    // 更新现有持仓
    await db
      .update(livePositions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(livePositions.accountId, data.accountId),
          eq(livePositions.symbol, data.symbol)
        )
      );
  } else {
    // 创建新持仓
    await db.insert(livePositions).values(data);
  }
}

/**
 * 获取账户持仓
 */
export async function getLivePositions(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const positions = await db
    .select()
    .from(livePositions)
    .where(eq(livePositions.accountId, accountId));

  return positions;
}

/**
 * 删除持仓（平仓）
 */
export async function closeLivePosition(accountId: number, symbol: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(livePositions)
    .where(and(eq(livePositions.accountId, accountId), eq(livePositions.symbol, symbol)));
}

/**
 * 保存交易日志
 */
export async function saveTradeLog(data: InsertTradeLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(tradeLogs).values(data);
}

/**
 * 获取交易日志
 */
export async function getTradeLogs(accountId: number, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const logs = await db
    .select()
    .from(tradeLogs)
    .where(eq(tradeLogs.accountId, accountId))
    .orderBy(desc(tradeLogs.timestamp))
    .limit(limit)
    .offset(offset);

  return logs;
}

/**
 * 获取账户统计信息
 */
export async function getAccountStatistics(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const account = await getTradingAccountById(accountId);
  if (!account) throw new Error("Account not found");

  const positions = await getLivePositions(accountId);
  const orders_list = await getOrders(accountId);
  const logs = await getTradeLogs(accountId, 10);

  // 计算统计数据
  const totalPositionValue = positions.reduce((sum, p) => {
    return sum + parseFloat(p.marketValue.toString());
  }, 0);

  const totalFloatingProfit = positions.reduce((sum, p) => {
    return sum + parseFloat(p.floatingProfit.toString());
  }, 0);

  const filledOrders = orders_list.filter((o) => o.status === "filled").length;
  const totalCommission = orders_list.reduce((sum, o) => {
    return sum + parseFloat(o.commission.toString());
  }, 0);

  return {
    account,
    positions: positions.length,
    totalPositionValue,
    totalFloatingProfit,
    filledOrders,
    totalCommission,
    recentLogs: logs,
  };
}

/**
 * 删除交易账户
 */
export async function deleteTradingAccount(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 先删除相关的订单和持仓
  await db.delete(orders).where(eq(orders.accountId, accountId));
  await db.delete(livePositions).where(eq(livePositions.accountId, accountId));
  await db.delete(tradeLogs).where(eq(tradeLogs.accountId, accountId));

  // 删除账户
  await db.delete(tradingAccounts).where(eq(tradingAccounts.id, accountId));
}

/**
 * 实盘交易 tRPC 路由
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as tradingDb from "./trading-db";
import { createTradingAdapter, type ITradingAdapter } from "./trading-adapter";
import { validateOrderRisk } from "./risk-control-service";
import * as marketData from "./market-data-service";
import * as simTrading from "./sim-trading";
import {
  createMonitorEntry as createQmtMonitorEntry,
  deleteMonitorEntry as deleteQmtMonitorEntry,
  fetchMonitorConfig,
  fetchMonitorEntries,
  fetchMonitorFills,
  updateMonitorEntry as updateQmtMonitorEntry,
} from "./qmt-monitor-service";

type LegacyConnection = {
  id: number;
  userId: number;
  name: string;
  interfaceType: "qmt" | "xtp" | "ctp" | "other";
  host: string;
  port: number;
  username: string;
  password: string;
  isConnected: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type LegacyOrder = {
  orderId: string;
  connectionId: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  orderType: string;
  status: "pending" | "partial" | "filled" | "cancelled" | "rejected";
  createdAt: Date;
  updatedAt: Date;
};

const legacyConnections = new Map<number, LegacyConnection>();
const legacyOrders = new Map<string, LegacyOrder>();
const legacySubscriptions = new Map<number, Set<string>>();
let legacyConnectionIdSeq = 1;
let legacyOrderIdSeq = 1;

type TradingAccountRecord = NonNullable<Awaited<ReturnType<typeof tradingDb.getTradingAccountById>>>;

type AccountAdapterSession = {
  userId: number;
  accountType: TradingAccountRecord["accountType"];
  accountCode: string;
  adapter: ITradingAdapter;
};

const accountSessions = new Map<number, AccountAdapterSession>();

function getLegacyConnectionOrThrow(connectionId: number, userId: number) {
  const connection = legacyConnections.get(connectionId);
  if (!connection || (userId !== 0 && connection.userId !== userId)) {
    throw new Error("Connection not found");
  }
  return connection;
}

function normalizeAccountConfig(config: unknown): Record<string, unknown> | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  return config as Record<string, unknown>;
}

async function getOwnedAccountOrThrow(accountId: number, userId: number): Promise<TradingAccountRecord> {
  const account = await tradingDb.getTradingAccountById(accountId);
  if (!account) {
    throw new Error("Account not found");
  }
  // 如果 userId 为 0（本地开发模式），跳过所有权检查
  if (userId !== 0 && account.userId !== userId) {
    throw new Error("Account not found");
  }
  return account;
}

function getSession(accountId: number, userId: number): AccountAdapterSession | null {
  const session = accountSessions.get(accountId);
  if (!session) {
    return null;
  }
  if (session.userId !== userId) {
    return null;
  }
  return session;
}

async function getOrCreateSessionAdapter(
  account: TradingAccountRecord,
  userId: number
): Promise<ITradingAdapter> {
  const existing = getSession(account.id, userId);
  if (
    existing &&
    existing.accountType === account.accountType &&
    existing.accountCode === account.accountCode
  ) {
    return existing.adapter;
  }

  if (existing) {
    try {
      await existing.adapter.disconnect();
    } catch (error) {
      console.warn("[trading] failed to disconnect stale adapter session:", error);
    }
    accountSessions.delete(account.id);
  }

  const adapter = createTradingAdapter(account.accountType as "qmt" | "xtp" | "ctp" | "other", {
    accountCode: account.accountCode,
    config: normalizeAccountConfig(account.config),
  });

  accountSessions.set(account.id, {
    userId,
    accountType: account.accountType,
    accountCode: account.accountCode,
    adapter,
  });

  return adapter;
}

async function ensureConnectedAdapter(
  account: TradingAccountRecord,
  userId: number
): Promise<ITradingAdapter> {
  const cached = getSession(account.id, userId);
  if (cached) {
    return cached.adapter;
  }

  const adapter = await getOrCreateSessionAdapter(account, userId);
  const connected = await adapter.connect();
  if (!connected) {
    accountSessions.delete(account.id);
    throw new Error("Connection failed");
  }
  return adapter;
}

const monitorEntryInputSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  exchange: z.string().optional(),
  quantity: z.number().int().positive(),
  buy_price: z.number().positive().optional(),
  buy_price_type: z.string().optional(),
  sell_price: z.number().positive().optional(),
  sell_price_type: z.string().optional(),
  dynamic_take_profit: z.number().optional(),
  dynamic_stop_loss: z.number().optional(),
  time_limit_minutes: z.number().int().positive().optional(),
  target_account: z.string().optional(),
  order_strategy: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

const monitorEntryUpdateSchema = monitorEntryInputSchema.partial().extend({
  quantity: z.number().int().positive().optional(),
});

async function startAccountSession(
  account: TradingAccountRecord,
  userId: number
): Promise<{ connected: boolean; alreadyConnected: boolean; adapter: ITradingAdapter }> {
  const existing = getSession(account.id, userId);
  if (existing && account.isConnected) {
    return {
      connected: true,
      alreadyConnected: true,
      adapter: existing.adapter,
    };
  }

  const adapter = await getOrCreateSessionAdapter(account, userId);
  const connected = await adapter.connect();
  return {
    connected,
    alreadyConnected: false,
    adapter,
  };
}

async function syncAccountSnapshot(
  account: TradingAccountRecord,
  adapter: ITradingAdapter
): Promise<{ positionCount: number }> {
  const [asset, positions] = await Promise.all([
    adapter.getAccountInfo(),
    adapter.getPositions(),
  ]);

  await tradingDb.updateTradingAccountAssets(account.id, {
    totalAssets: asset.totalAssets,
    availableCash: asset.availableCash,
    marketValue: asset.marketValue,
  });

  const existingPositions = await tradingDb.getLivePositions(account.id);
  const incomingSymbols = new Set<string>();

  for (const position of positions) {
    incomingSymbols.add(position.symbol);
    await tradingDb.saveLivePosition({
      accountId: account.id,
      symbol: position.symbol,
      quantity: position.quantity,
      costPrice: position.costPrice.toString(),
      currentPrice: position.currentPrice.toString(),
      marketValue: position.marketValue.toString(),
      floatingProfit: position.floatingProfit.toString(),
      floatingProfitPercent: position.floatingProfitPercent.toString(),
      openDate: position.openDate,
      lastUpdateTime: new Date(),
    });
  }

  for (const existing of existingPositions) {
    if (!incomingSymbols.has(existing.symbol)) {
      await tradingDb.closeLivePosition(account.id, existing.symbol);
    }
  }

  return { positionCount: positions.length };
}

async function destroyAccountSession(accountId: number): Promise<void> {
  const session = accountSessions.get(accountId);
  if (!session) {
    return;
  }

  try {
    await session.adapter.disconnect();
  } catch (error) {
    console.warn("[trading] failed to disconnect adapter session:", error);
  } finally {
    accountSessions.delete(accountId);
  }
}

export async function getExecutionAdapterForAccount(
  userId: number,
  accountId: number
): Promise<{ account: TradingAccountRecord; adapter: ITradingAdapter }> {
  const account = await getOwnedAccountOrThrow(accountId, userId);
  const adapter = await ensureConnectedAdapter(account, userId);
  return { account, adapter };
}

export const tradingRouter = router({
  // ===== 兼容层：用于旧版前端与现有测试 =====
  createConnection: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        interfaceType: z.enum(["qmt", "xtp", "ctp", "other"]),
        host: z.string().min(1),
        port: z.number().int().positive(),
        username: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const id = legacyConnectionIdSeq++;
      const connection: LegacyConnection = {
        id,
        userId: ctx.user?.id ?? 0,
        name: input.name,
        interfaceType: input.interfaceType,
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
        isConnected: false,
        createdAt: now,
        updatedAt: now,
      };
      legacyConnections.set(id, connection);
      return connection;
    }),

  getConnections: publicProcedure.query(async ({ ctx }) => {
    return Array.from(legacyConnections.values())
      .filter((connection) => connection.userId === (ctx.user?.id ?? 0))
      .sort((a, b) => b.id - a.id);
  }),

  getConnectionDetail: publicProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
    }),

  toggleConnection: publicProcedure
    .input(
      z.object({
        connectionId: z.number().int().positive(),
        isConnected: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const connection = getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      connection.isConnected = input.isConnected;
      connection.updatedAt = new Date();
      legacyConnections.set(connection.id, connection);
      return connection;
    }),

  // 创建交易账户
  createAccount: publicProcedure
    .input(
      z.object({
        accountName: z.string(),
        accountType: z.enum(["qmt", "xtp", "ctp", "other"]),
        accountCode: z.string(),
        strategyId: z.number().int().optional(),
        config: z.record(z.string(), z.any()).optional(),
        isSimulated: z.boolean().optional(),
        initialCash: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await tradingDb.createTradingAccount({
        userId: ctx.user?.id ?? 0,
        accountName: input.accountName,
        accountType: input.accountType,
        accountCode: input.accountCode,
        strategyId: input.strategyId,
        isConnected: false,
        connectionStatus: "disconnected",
        isSimulated: input.isSimulated ?? false,
        totalAssets: input.isSimulated ? (input.initialCash ?? 1000000).toString() : "0",
        availableCash: input.isSimulated ? (input.initialCash ?? 1000000).toString() : "0",
        marketValue: "0",
        config: input.config,
        isActive: true,
      });
      return { success: true, accountId: (result as any).insertId || 0 };
    }),

  startLiveTrading: publicProcedure
    .input(
      z
        .object({
          accountId: z.number().int().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id ?? 0;
      const accounts = await tradingDb.getTradingAccountsByUserId(userId);

      if (accounts.length === 0) {
        throw new Error("No trading account configured");
      }

      let account: TradingAccountRecord | undefined;
      if (input?.accountId !== undefined) {
        account = accounts.find((item) => item.id === input.accountId);
        if (!account) {
          throw new Error("Account not found");
        }
      } else {
        account =
          accounts.find((item) => item.accountType === "qmt" && item.isActive) ??
          accounts.find((item) => item.isActive) ??
          accounts[0];
      }

      try {
        const { connected, alreadyConnected, adapter } = await startAccountSession(account, userId);
        if (!connected) {
          accountSessions.delete(account.id);
          await tradingDb.updateTradingAccountStatus(account.id, "error", "Connection failed");
          return {
            success: false,
            accountId: account.id,
            accountName: account.accountName,
            message: "Connection failed",
            alreadyConnected,
          };
        }

        await tradingDb.updateTradingAccountStatus(account.id, "connected");
        const snapshot = await syncAccountSnapshot(account, adapter);
        await tradingDb.saveTradeLog({
          accountId: account.id,
          eventType: "account_connected",
          description: `Live trading started via strategy entry (${account.accountName}) | positions=${snapshot.positionCount}`,
        });

        return {
          success: true,
          accountId: account.id,
          accountName: account.accountName,
          message: alreadyConnected ? "Account already connected" : "Live trading started",
          alreadyConnected,
          snapshot,
        };
      } catch (error) {
        await tradingDb.updateTradingAccountStatus(
          account.id,
          "error",
          (error as Error).message
        );
        throw error;
      }
    }),

  // 获取用户的交易账户列表
  getAccounts: publicProcedure.query(async ({ ctx }) => {
    const accounts = await tradingDb.getTradingAccountsByUserId(ctx.user?.id ?? 0);
    return accounts;
  }),

  // 获取账户详情
  getAccountDetail: publicProcedure
    .input(z.object({ accountId: z.number().int() }))
    .query(async ({ input }) => {
      const stats = await tradingDb.getAccountStatistics(input.accountId);
      return stats;
    }),

  // 连接交易账户
  connectAccount: publicProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
        const { connected, adapter } = await startAccountSession(account, ctx.user?.id ?? 0);

        if (connected) {
          await tradingDb.updateTradingAccountStatus(input.accountId, "connected");
          const snapshot = await syncAccountSnapshot(account, adapter);
          return { success: true, message: "Account connected successfully", snapshot };
        } else {
          accountSessions.delete(input.accountId);
          await tradingDb.updateTradingAccountStatus(
            input.accountId,
            "error",
            "Connection failed"
          );
          return { success: false, message: "Connection failed" };
        }
      } catch (error) {
        await tradingDb.updateTradingAccountStatus(
          input.accountId,
          "error",
          (error as Error).message
        );
        
        // 使用 TRPCError 包装错误，确保错误消息可以正确传输
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: errorMessage,
        });
      }
    }),

  // 断开连接
  disconnectAccount: publicProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
        await destroyAccountSession(input.accountId);
        await tradingDb.updateTradingAccountStatus(input.accountId, "disconnected");

        return { success: true };
      } catch (error) {
        throw error;
      }
    }),

  // 删除交易账户
  deleteAccount: publicProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
        
        // 先断开连接
        await destroyAccountSession(input.accountId);
        
        // 删除账户记录
        await tradingDb.deleteTradingAccount(input.accountId);
        
        return { success: true, message: "账户已删除" };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: errorMessage,
        });
      }
    }),

  // 获取账户持仓
  getPositions: publicProcedure
    .input(
      z.union([
        z.object({ accountId: z.number().int() }),
        z.object({ connectionId: z.number().int().positive() }),
      ])
    )
    .query(async ({ ctx, input }) => {
      if ("connectionId" in input) {
        getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
        return [];
      }
      if (ctx.user) {
        const account = await getOwnedAccountOrThrow(input.accountId, ctx.user.id);

        // 模拟账户返回模拟持仓
        if (account.isSimulated) {
          return simTrading.getSimPositions(input.accountId);
        }

        if (account.isConnected) {
          try {
            const adapter = await ensureConnectedAdapter(account, ctx.user.id);
            return await adapter.getPositions();
          } catch (error) {
            console.warn("[trading] getPositions via adapter failed, fallback to DB:", error);
          }
        }
      }
      const positions = await tradingDb.getLivePositions(input.accountId);
      return positions;
    }),

  // 获取订单列表
  getOrders: publicProcedure
    .input(
      z.union([
        z.object({
          accountId: z.number().int(),
          status: z.string().optional(),
          limit: z.number().int().default(50),
        }),
        z.object({
          connectionId: z.number().int().positive(),
          limit: z.number().int().default(50),
        }),
      ])
    )
    .query(async ({ ctx, input }) => {
      if ("connectionId" in input) {
        getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
        const orders = Array.from(legacyOrders.values())
          .filter((order) => order.connectionId === input.connectionId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return orders.slice(0, input.limit);
      }
      if (ctx.user) {
        const account = await getOwnedAccountOrThrow(input.accountId, ctx.user.id);

        // 模拟账户返回模拟订单
        if (account.isSimulated) {
          return simTrading.getSimOrders(input.accountId, input.limit);
        }

        if (account.isConnected) {
          try {
            const adapter = await ensureConnectedAdapter(account, ctx.user.id);
            const liveOrders = await adapter.getOrders(input.status);
            return liveOrders.slice(0, input.limit);
          } catch (error) {
            console.warn("[trading] getOrders via adapter failed, fallback to DB:", error);
          }
        }
      }
      const orders_list = await tradingDb.getOrders(input.accountId, input.status);
      return orders_list.slice(0, input.limit);
    }),

  // 提交订单
  submitOrder: publicProcedure
    .input(
      z.union([
        z.object({
          accountId: z.number().int(),
          symbol: z.string(),
          side: z.enum(["buy", "sell"]),
          quantity: z.number().int(),
          price: z.number(),
        }),
        z.object({
          connectionId: z.number().int().positive(),
          symbol: z.string().min(1),
          side: z.enum(["buy", "sell"]),
          quantity: z.number().int().positive(),
          price: z.number().positive(),
          orderType: z.string().default("limit"),
        }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      if ("connectionId" in input) {
        const connection = getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
        const orderId = `LEGACY_${legacyOrderIdSeq++}`;
        const now = new Date();
        const order: LegacyOrder = {
          orderId,
          connectionId: connection.id,
          symbol: input.symbol,
          side: input.side,
          quantity: input.quantity,
          price: input.price,
          orderType: input.orderType,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        legacyOrders.set(orderId, order);
        return {
          orderId,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          price: order.price,
          status: order.status,
        };
      }
      try {
        const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);

        // 模拟账户直接使用模拟交易引擎
        if (account.isSimulated) {
          const result = simTrading.submitSimOrder(input.accountId, input.symbol, input.side, input.quantity, input.price);
          return { success: true, orderId: result.orderId };
        }

        const risk = await validateOrderRisk({
          accountId: input.accountId,
          accountConfig: account.config,
          quantity: input.quantity,
          price: input.price,
        });

        if (!risk.allowed) {
          throw new Error(`[RISK_BLOCKED] ${risk.reason}`);
        }

        const adapter = await ensureConnectedAdapter(account, ctx.user?.id ?? 0);
        const orderId = await adapter.submitOrder(input.symbol, input.side, input.quantity, input.price);

        // 保存订单到数据库
        await tradingDb.saveOrder({
          accountId: input.accountId,
          orderId,
          symbol: input.symbol,
          side: input.side,
          quantity: input.quantity,
          price: input.price.toString(),
          status: "pending",
          filledQuantity: 0,
          submitTime: new Date(),
        });

        // 记录交易日志
        await tradingDb.saveTradeLog({
          accountId: input.accountId,
          orderId,
          eventType: "order_submitted",
          symbol: input.symbol,
          quantity: input.quantity,
          price: input.price.toString(),
          description: `${input.side.toUpperCase()} ${input.quantity} ${input.symbol} @ ${input.price}`,
        });

        return { success: true, orderId };
      } catch (error) {
        throw error;
      }
    }),

  // 撤销订单
  cancelOrder: publicProcedure
    .input(
      z.union([
        z.object({ accountId: z.number().int(), orderId: z.string() }),
        z.object({ connectionId: z.number().int().positive(), orderId: z.string() }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      if ("connectionId" in input) {
        getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
        const order = legacyOrders.get(input.orderId);
        if (!order || order.connectionId !== input.connectionId) {
          throw new Error("Order not found");
        }
        order.status = "cancelled";
        order.updatedAt = new Date();
        legacyOrders.set(order.orderId, order);
        return { success: true, message: `Order ${input.orderId} cancelled` };
      }
      try {
        const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
        const adapter = await ensureConnectedAdapter(account, ctx.user?.id ?? 0);
        const cancelled = await adapter.cancelOrder(input.orderId);

        if (cancelled) {
          await tradingDb.updateOrderStatus(input.orderId, "cancelled");
          await tradingDb.saveTradeLog({
            accountId: input.accountId,
            orderId: input.orderId,
            eventType: "order_cancelled",
            description: `Order ${input.orderId} cancelled`,
          });
          return { success: true };
        } else {
          throw new Error("Failed to cancel order");
        }
      } catch (error) {
        throw error;
      }
    }),

  // 获取交易日志
  getTradeLogs: publicProcedure
    .input(
      z.object({
        accountId: z.number().int(),
        limit: z.number().int().default(100),
        offset: z.number().int().default(0),
      })
    )
    .query(async ({ input }) => {
      const logs = await tradingDb.getTradeLogs(input.accountId, input.limit, input.offset);
      return logs;
    }),

  // 获取最新行情
  getLatestMarketData: publicProcedure
    .input(z.object({ accountId: z.number().int(), symbol: z.string() }))
    .query(async ({ input }) => {
      const data = await tradingDb.getLatestMarketData(input.accountId, input.symbol);
      return data;
    }),

  // 更新账户资产信息
  updateAccountAssets: publicProcedure
    .input(
      z.object({
        accountId: z.number().int(),
        totalAssets: z.number(),
        availableCash: z.number(),
        marketValue: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await import("./db").then((m) => m.getDb());
      if (!db) throw new Error("Database not available");

      const { tradingAccounts } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      await db
        .update(tradingAccounts)
        .set({
          totalAssets: input.totalAssets.toString(),
          availableCash: input.availableCash.toString(),
          marketValue: input.marketValue.toString(),
          updatedAt: new Date(),
        })
        .where(eq(tradingAccounts.id, input.accountId));

      return { success: true };
    }),

  getRealtimeQuotes: publicProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      const subscriptions = legacySubscriptions.get(input.connectionId);
      if (!subscriptions || subscriptions.size === 0) {
        return [];
      }
      return Array.from(subscriptions).map((symbol, idx) => ({
        symbol,
        price: 10 + idx,
        change: 0.1 * (idx + 1),
        changePercent: 1.0 + idx,
      }));
    }),

  subscribeQuotes: publicProcedure
    .input(
      z.object({
        connectionId: z.number().int().positive(),
        symbols: z.array(z.string().min(1)).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      const subscribed = legacySubscriptions.get(input.connectionId) ?? new Set<string>();
      input.symbols.forEach((symbol) => subscribed.add(symbol));
      legacySubscriptions.set(input.connectionId, subscribed);
      return {
        success: true,
        subscribedSymbols: Array.from(subscribed),
      };
    }),

  getAccountInfo: publicProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      const orders = Array.from(legacyOrders.values()).filter((order) => order.connectionId === input.connectionId);
      const positionValue = orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + order.quantity * order.price, 0);
      const totalAssets = 1_000_000 + positionValue;
      const availableCash = Math.max(0, totalAssets - positionValue);
      return {
        totalAssets,
        availableCash,
        positionValue,
      };
    }),

  // 获取大盘指数
  getMarketIndices: publicProcedure.query(async () => {
    return await marketData.getMarketIndices();
  }),

  // 获取市场热度
  getMarketHeat: publicProcedure.query(async () => {
    return await marketData.getMarketHeat();
  }),

  // 获取资金流向
  getCapitalFlow: publicProcedure.query(async () => {
    return await marketData.getCapitalFlow();
  }),

  // 获取热点板块
  getHotSectors: publicProcedure.query(async ({ input }) => {
    const topN = (input as any)?.topN ?? 10;
    return await marketData.getHotSectors(topN);
  }),

  // ===== 股票排行榜 =====
  // 获取涨幅榜/跌幅榜
  getChangeRanking: publicProcedure
    .input(z.object({ topN: z.number().int().positive().default(50) }).optional())
    .query(async ({ input }) => {
      const topN = input?.topN ?? 50;
      return await marketData.getChangeRanking(topN);
    }),

  // 获取成交额榜
  getTurnoverRanking: publicProcedure
    .input(z.object({ topN: z.number().int().positive().default(50) }).optional())
    .query(async ({ input }) => {
      const topN = input?.topN ?? 50;
      return await marketData.getTurnoverRanking(topN);
    }),

  // 获取换手率榜
  getTurnoverRateRanking: publicProcedure
    .input(z.object({ topN: z.number().int().positive().default(50) }).optional())
    .query(async ({ input }) => {
      const topN = input?.topN ?? 50;
      return await marketData.getTurnoverRateRanking(topN);
    }),

  // 获取主力净流入榜
  getMainFlowRanking: publicProcedure
    .input(z.object({ topN: z.number().int().positive().default(50) }).optional())
    .query(async ({ input }) => {
      const topN = input?.topN ?? 50;
      return await marketData.getMainFlowRanking(topN);
    }),

  // 获取量比榜
  getVolumeRatioRanking: publicProcedure
    .input(z.object({ topN: z.number().int().positive().default(50) }).optional())
    .query(async ({ input }) => {
      const topN = input?.topN ?? 50;
      return await marketData.getVolumeRatioRanking(topN);
    }),

  // 获取振幅榜
  getAmplitudeRanking: publicProcedure
    .input(z.object({ topN: z.number().int().positive().default(50) }).optional())
    .query(async ({ input }) => {
      const topN = input?.topN ?? 50;
      return await marketData.getAmplitudeRanking(topN);
    }),

  // AI 选股（量化条件筛选）
  runStockPicker: publicProcedure
    .input(z.object({
      min_turnover_rate: z.number().optional(),
      min_volume_ratio:  z.number().optional(),
      main_board_only:   z.boolean().optional(),
      exclude_st:        z.boolean().optional(),
      require_yang:      z.boolean().optional(),
      require_inflow:    z.boolean().optional(),
      max_price:         z.number().optional(),
      min_float_mv:      z.number().optional(),
      max_float_mv:      z.number().optional(),
      kdj_j_gt_d:        z.boolean().optional(),
      min_kdj_d:         z.number().optional(),
      max_limit_up_days: z.number().int().optional(),
      top_n:             z.number().int().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      return await marketData.runStockPicker((input ?? {}) as Record<string, unknown>);
    }),

  // ===== xtdata 扩展接口 =====
  getTradingDates: publicProcedure
    .input(z.object({
      market: z.string().default("SH"),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
      count: z.number().int().default(-1),
    }).optional())
    .query(async ({ input }) => {
      return await marketData.getTradingDates(input?.market, input?.startTime, input?.endTime, input?.count);
    }),

  getIndexWeight: publicProcedure
    .input(z.object({ indexCode: z.string().default("000300.SH") }).optional())
    .query(async ({ input }) => {
      return await marketData.getIndexWeight(input?.indexCode);
    }),

  getDividFactors: publicProcedure
    .input(z.object({
      stockCode: z.string(),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
    }))
    .query(async ({ input }) => {
      return await marketData.getDividFactors(input.stockCode, input.startTime, input.endTime);
    }),

  getHisSt: publicProcedure
    .input(z.object({ stockCode: z.string() }))
    .query(async ({ input }) => {
      return await marketData.getHisSt(input.stockCode);
    }),

  getIpoInfo: publicProcedure
    .input(z.object({
      startTime: z.string().default(""),
      endTime: z.string().default(""),
    }).optional())
    .query(async ({ input }) => {
      return await marketData.getIpoInfo(input?.startTime, input?.endTime);
    }),

  getEtfInfo: publicProcedure.query(async () => {
    return await marketData.getEtfInfo();
  }),

  getInstrumentDetailBatch: publicProcedure
    .input(z.object({ codes: z.array(z.string()).min(1) }))
    .query(async ({ input }) => {
      return await marketData.getInstrumentDetailBatch(input.codes);
    }),

  getTransactionCount: publicProcedure
    .input(z.object({ codes: z.array(z.string()).min(1) }))
    .query(async ({ input }) => {
      return await marketData.getTransactionCount(input.codes);
    }),

  getL2Quote: publicProcedure
    .input(z.object({
      stockCode: z.string(),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
      count: z.number().int().default(1),
    }))
    .query(async ({ input }) => {
      return await marketData.getL2Quote(input.stockCode, input.startTime, input.endTime, input.count);
    }),

  getL2Order: publicProcedure
    .input(z.object({
      stockCode: z.string(),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
      count: z.number().int().default(100),
    }))
    .query(async ({ input }) => {
      return await marketData.getL2Order(input.stockCode, input.startTime, input.endTime, input.count);
    }),

  getL2Transaction: publicProcedure
    .input(z.object({
      stockCode: z.string(),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
      count: z.number().int().default(100),
    }))
    .query(async ({ input }) => {
      return await marketData.getL2Transaction(input.stockCode, input.startTime, input.endTime, input.count);
    }),

  getFinancialData: publicProcedure
    .input(z.object({
      codes: z.array(z.string()).min(1),
      tables: z.string().default("Balance,Income,CashFlow,PershareIndex"),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
    }))
    .query(async ({ input }) => {
      return await marketData.getFinancialData(input.codes, input.tables, input.startTime, input.endTime);
    }),

  getMarkets: publicProcedure.query(async () => {
    return await marketData.getMarkets();
  }),

  getHolidays: publicProcedure.query(async () => {
    return await marketData.getHolidays();
  }),

  getFullKline: publicProcedure
    .input(z.object({
      codes: z.array(z.string()).min(1),
      period: z.string().default("1d"),
    }))
    .query(async ({ input }) => {
      return await marketData.getFullKline(input.codes, input.period);
    }),

  searchSymbols: publicProcedure
    .input(z.object({
      keyword: z.string(),
      limit: z.number().int().min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      return await marketData.searchSymbols(input.keyword, input.limit ?? 10);
    }),

  getQuoteSnapshots: publicProcedure
    .input(z.object({ codes: z.array(z.string()).min(1) }))
    .query(async ({ input }) => {
      return await marketData.getQuoteSnapshots(input.codes);
    }),

  // ===== AI 监控股票池 =====
  getMonitorConfig: publicProcedure.query(async () => {
    return await fetchMonitorConfig();
  }),

  getMonitorPool: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return await fetchMonitorEntries({ status: input?.status });
    }),

  getMonitorFills: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => {
      return await fetchMonitorFills(input?.limit);
    }),

  createMonitorEntry: publicProcedure
    .input(monitorEntryInputSchema)
    .mutation(async ({ input }) => {
      return await createQmtMonitorEntry(input);
    }),

  updateMonitorEntry: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        patch: monitorEntryUpdateSchema,
      })
    )
    .mutation(async ({ input }) => {
      return await updateQmtMonitorEntry(input.id, input.patch);
    }),

  deleteMonitorEntry: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const success = await deleteQmtMonitorEntry(input.id);
      if (!success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "删除失败，请稍后重试" });
      }
      return { success: true };
    }),
});

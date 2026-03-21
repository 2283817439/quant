import { eq, desc, and, gte, lte, between, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  strategies,
  backtestRecords,
  equityCurves,
  trades,
  positionSnapshots,
  riskAlerts,
  monthlyReturns,
  backups,
  type Strategy,
  type BacktestRecord,
  type EquityCurve,
  type Trade,
  type PositionSnapshot,
  type RiskAlert,
  type MonthlyReturn,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { ensurePaperclipSchema } from "./paperclip-bootstrap";

let _db: ReturnType<typeof drizzle> | null = null;
let schemaInitPromise: Promise<void> | null = null;

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !name || !user) {
    return "";
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const auth = password ? `${encodedUser}:${encodedPassword}` : encodedUser;
  return `mysql://${auth}@${host}:${port}/${name}`;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const databaseUrl = resolveDatabaseUrl();

  if (!_db && databaseUrl) {
    try {
      _db = drizzle(databaseUrl);
      schemaInitPromise = ensurePaperclipSchema(_db).catch((error) => {
        console.error("[Paperclip] Failed to bootstrap schema:", error);
        throw error;
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      schemaInitPromise = null;
    }
  }

  if (schemaInitPromise) {
    try {
      await schemaInitPromise;
    } catch {
      // already logged above; keep returning db for other callers
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ 策略相关查询 ============

export async function createStrategy(data: typeof strategies.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(strategies).values(data);
  return result;
}

export async function getStrategiesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // 本地开发模式：userId 为 0 时，返回所有策略
  if (userId === 0) {
    return await db.select().from(strategies).orderBy(desc(strategies.updatedAt));
  }
  
  return await db.select().from(strategies).where(eq(strategies.userId, userId)).orderBy(desc(strategies.updatedAt));
}

export async function getStrategyById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(strategies).where(eq(strategies.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateStrategy(id: number, data: Partial<typeof strategies.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(strategies).set({ ...data, updatedAt: new Date() }).where(eq(strategies.id, id));
}

// ============ 回测记录相关查询 ============

export async function createBacktestRecord(data: typeof backtestRecords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(backtestRecords).values(data);
  return result;
}

export async function getBacktestRecordsByUserId(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  // 本地开发模式：userId 为 0 时，返回所有回测记录
  if (userId === 0) {
    return await db
      .select()
      .from(backtestRecords)
      .orderBy(desc(backtestRecords.createdAt))
      .limit(limit)
      .offset(offset);
  }
  
  return await db
    .select()
    .from(backtestRecords)
    .where(eq(backtestRecords.userId, userId))
    .orderBy(desc(backtestRecords.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getBacktestRecordById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(backtestRecords).where(eq(backtestRecords.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getBacktestRecordsByStrategyId(strategyId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(backtestRecords)
    .where(eq(backtestRecords.strategyId, strategyId))
    .orderBy(desc(backtestRecords.createdAt))
    .limit(limit);
}

export async function updateBacktestRecord(id: number, data: Partial<typeof backtestRecords.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(backtestRecords).set({ ...data, updatedAt: new Date() }).where(eq(backtestRecords.id, id));
}

// ============ 净值曲线相关查询 ============

export async function createEquityCurves(data: (typeof equityCurves.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(equityCurves).values(data);
}

export async function getEquityCurvesByBacktestId(backtestRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(equityCurves)
    .where(eq(equityCurves.backtestRecordId, backtestRecordId))
    .orderBy(equityCurves.date);
}

// ============ 交易明细相关查询 ============

export async function createTrades(data: (typeof trades.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(trades).values(data);
}

export async function getTradesByBacktestId(backtestRecordId: number, limit: number = 100, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(trades)
    .where(eq(trades.backtestRecordId, backtestRecordId))
    .orderBy(desc(trades.tradeDate), desc(trades.tradeTime))
    .limit(limit)
    .offset(offset);
}

export async function getTradesBySymbol(backtestRecordId: number, symbol: string) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(trades)
    .where(and(eq(trades.backtestRecordId, backtestRecordId), eq(trades.symbol, symbol)))
    .orderBy(trades.tradeDate);
}

// ============ 持仓快照相关查询 ============

export async function createPositionSnapshots(data: (typeof positionSnapshots.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(positionSnapshots).values(data);
}

export async function getPositionSnapshotsByBacktestId(backtestRecordId: number, snapshotDate?: string) {
  const db = await getDb();
  if (!db) return [];
  
  if (snapshotDate) {
    return await db
      .select()
      .from(positionSnapshots)
      .where(and(eq(positionSnapshots.backtestRecordId, backtestRecordId), eq(positionSnapshots.snapshotDate, snapshotDate)))
      .orderBy(desc(positionSnapshots.snapshotDate), positionSnapshots.symbol);
  }
  
  return await db
    .select()
    .from(positionSnapshots)
    .where(eq(positionSnapshots.backtestRecordId, backtestRecordId))
    .orderBy(desc(positionSnapshots.snapshotDate), positionSnapshots.symbol);
}

export async function getLatestPositionSnapshot(backtestRecordId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(positionSnapshots)
    .where(eq(positionSnapshots.backtestRecordId, backtestRecordId))
    .orderBy(desc(positionSnapshots.snapshotDate))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

// ============ 风控告警相关查询 ============

export async function createRiskAlerts(data: (typeof riskAlerts.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(riskAlerts).values(data);
}

export async function getRiskAlertsByBacktestId(backtestRecordId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(riskAlerts)
    .where(eq(riskAlerts.backtestRecordId, backtestRecordId))
    .orderBy(desc(riskAlerts.createdAt))
    .limit(limit);
}

export async function getRiskAlertsByLevel(backtestRecordId: number, level: "INFO" | "WARNING" | "CRITICAL") {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(riskAlerts)
    .where(and(eq(riskAlerts.backtestRecordId, backtestRecordId), eq(riskAlerts.level, level)))
    .orderBy(desc(riskAlerts.createdAt));
}

// ============ 月度收益相关查询 ============

export async function createMonthlyReturns(data: (typeof monthlyReturns.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(monthlyReturns).values(data);
}

export async function getMonthlyReturnsByBacktestId(backtestRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(monthlyReturns)
    .where(eq(monthlyReturns.backtestRecordId, backtestRecordId))
    .orderBy(monthlyReturns.year, monthlyReturns.month);
}

// ============ 备份相关查询 ============

export async function createBackup(data: typeof backups.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(backups).values(data);
}

export async function getBackupsByUserId(userId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  
  // 本地开发模式：userId 为 0 时，返回所有备份记录
  if (userId === 0) {
    return await db
      .select()
      .from(backups)
      .orderBy(desc(backups.createdAt))
      .limit(limit);
  }
  
  return await db
    .select()
    .from(backups)
    .where(eq(backups.userId, userId))
    .orderBy(desc(backups.createdAt))
    .limit(limit);
}

export async function updateBackup(id: number, data: Partial<typeof backups.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(backups).set(data).where(eq(backups.id, id));
}

// ============ 数据对比相关查询 ============

export async function compareBacktestRecords(recordIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (recordIds.length === 0) return [];
  return await db.select().from(backtestRecords).where(inArray(backtestRecords.id, recordIds));
}

export async function getMultipleBacktestRecords(recordIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (recordIds.length === 0) return [];
  return await db.select().from(backtestRecords).where(inArray(backtestRecords.id, recordIds)).orderBy(desc(backtestRecords.createdAt));
}

export async function getBacktestStatistics(userId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const records = await db.select().from(backtestRecords).where(eq(backtestRecords.userId, userId));
  
  if (records.length === 0) return null;
  
  const avgReturn = records.reduce((sum, r) => sum + parseFloat(r.totalReturn.toString()), 0) / records.length;
  const maxReturn = Math.max(...records.map(r => parseFloat(r.totalReturn.toString())));
  const minReturn = Math.min(...records.map(r => parseFloat(r.totalReturn.toString())));
  const avgDrawdown = records.reduce((sum, r) => sum + parseFloat(r.maxDrawdown.toString()), 0) / records.length;
  const avgSharpe = records.reduce((sum, r) => sum + parseFloat(r.sharpeRatio.toString()), 0) / records.length;
  
  return {
    totalBacktests: records.length,
    avgReturn,
    maxReturn,
    minReturn,
    avgDrawdown,
    avgSharpe,
  };
}

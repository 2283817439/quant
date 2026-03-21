import { eq, and, desc, asc } from "drizzle-orm";
import {
  parameterScanConfigs,
  parameterScanResults,
  parameterScanOptimalResults,
  InsertParameterScanConfig,
  InsertParameterScanResult,
  InsertParameterScanOptimalResult,
} from "../drizzle/schema";
import { getDb } from "./db";

export async function createParameterScanConfig(data: InsertParameterScanConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(parameterScanConfigs).values(data);
}

export async function getParameterScanConfig(configId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(parameterScanConfigs)
    .where(eq(parameterScanConfigs.id, configId))
    .limit(1);

  return result[0] || null;
}

export async function getUserParameterScanConfigs(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 本地开发模式：userId 为 0 时，返回所有扫描配置
  if (userId === 0) {
    return db
      .select()
      .from(parameterScanConfigs)
      .orderBy(desc(parameterScanConfigs.createdAt));
  }

  return db
    .select()
    .from(parameterScanConfigs)
    .where(eq(parameterScanConfigs.userId, userId))
    .orderBy(desc(parameterScanConfigs.createdAt));
}

export async function updateParameterScanConfigStatus(
  configId: number,
  status: string,
  progress = 0,
  startedAt?: Date,
  completedAt?: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {
    status,
    progress: progress.toString(),
  };

  if (startedAt) updateData.startedAt = startedAt;
  if (completedAt) updateData.completedAt = completedAt;

  await db
    .update(parameterScanConfigs)
    .set(updateData)
    .where(eq(parameterScanConfigs.id, configId));
}

export async function createParameterScanResult(data: InsertParameterScanResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(parameterScanResults).values(data);
}

export async function getParameterScanResults(configId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(parameterScanResults)
    .where(eq(parameterScanResults.scanConfigId, configId))
    .orderBy(asc(parameterScanResults.iteration));
}

export async function getParameterScanOptimalResult(configId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(parameterScanOptimalResults)
    .where(eq(parameterScanOptimalResults.scanConfigId, configId))
    .limit(1);

  return result[0] || null;
}

export async function upsertParameterScanOptimalResult(data: InsertParameterScanOptimalResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(parameterScanOptimalResults)
    .where(eq(parameterScanOptimalResults.scanConfigId, data.scanConfigId));

  return db.insert(parameterScanOptimalResults).values(data);
}

export async function getParameterScanResultsRanking(configId: number, limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(parameterScanResults)
    .where(
      and(
        eq(parameterScanResults.scanConfigId, configId),
        eq(parameterScanResults.status, "completed")
      )
    )
    .orderBy(desc(parameterScanResults.objectiveValue))
    .limit(limit);
}

export async function updateParameterScanResultStatus(
  resultId: number,
  status: string,
  errorMessage?: string,
  completedAt?: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = { status };
  if (errorMessage) updateData.errorMessage = errorMessage;
  if (completedAt) updateData.completedAt = completedAt;

  await db
    .update(parameterScanResults)
    .set(updateData)
    .where(eq(parameterScanResults.id, resultId));
}

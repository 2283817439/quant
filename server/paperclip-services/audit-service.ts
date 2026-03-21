/**
 * Paperclip 审计日志服务
 * 
 * 负责记录所有变更操作，提供完整的审计追踪
 * 基于 Paperclip V1 Implementation Spec
 */

import { getDb } from "../db";
import { activityLog } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { ActivityLogEntry, InsertActivityLogEntry } from "../../drizzle/schema";
import type { ActorType } from "../../client/src/lib/paperclip-types";
import { AUDIT_ACTIONS } from "../../shared";

// ============================================================================
// 类型定义
// ============================================================================

export interface LogActivityOptions {
  companyId: number;
  actorType: ActorType;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export interface QueryActivityOptions {
  companyId: number;
  actorType?: ActorType;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// 活动日志记录
// ============================================================================

/**
 * 记录活动日志
 */
export async function logActivity(options: LogActivityOptions): Promise<ActivityLogEntry> {
  const db = await getDb();
  if (!db) {
    console.warn("[paperclip-audit] Database not available, skipping audit log");
    // 返回一个伪对象，避免调用方失败
    return {
      id: 0,
      companyId: options.companyId,
      actorType: options.actorType,
      actorId: options.actorId,
      action: options.action,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      details: options.details ?? null,
      createdAt: new Date(),
    };
  }

  try {
    const insertData: InsertActivityLogEntry = {
      companyId: options.companyId,
      actorType: options.actorType,
      actorId: options.actorId,
      action: options.action,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      details: options.details,
    };

    const result = await db.insert(activityLog).values(insertData);
    const logId = (result as any).insertId || (result as any).id;

    return {
      id: logId,
      companyId: insertData.companyId,
      actorType: insertData.actorType,
      actorId: insertData.actorId,
      action: insertData.action,
      entityType: insertData.entityType ?? null,
      entityId: insertData.entityId ?? null,
      details: insertData.details ?? null,
      createdAt: new Date(),
    };
  } catch (error) {
    console.error("[paperclip-audit] Failed to log activity:", error);
    throw error;
  }
}

/**
 * 批量记录活动日志
 */
export async function logActivities(
  activities: LogActivityOptions[]
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[paperclip-audit] Database not available, skipping batch audit logs");
    return;
  }

  try {
    const insertData = activities.map((activity) => ({
      companyId: activity.companyId,
      actorType: activity.actorType,
      actorId: activity.actorId,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      details: activity.details ?? null,
    }));

    await db.insert(activityLog).values(insertData);
  } catch (error) {
    console.error("[paperclip-audit] Failed to log batch activities:", error);
    throw error;
  }
}

// ============================================================================
// 活动日志查询
// ============================================================================

/**
 * 查询活动日志（支持过滤和分页）
 */
export async function queryActivityLogs(
  options: QueryActivityOptions
): Promise<ActivityLogEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const {
    companyId,
    actorType,
    actorId,
    entityType,
    entityId,
    action,
    limit = 50,
    offset = 0,
  } = options;

  const filters: SQL[] = [eq(activityLog.companyId, companyId)];

  if (actorType !== undefined) filters.push(eq(activityLog.actorType, actorType));
  if (actorId !== undefined) filters.push(eq(activityLog.actorId, actorId));
  if (entityType !== undefined) filters.push(eq(activityLog.entityType, entityType));
  if (entityId !== undefined) filters.push(eq(activityLog.entityId, entityId));
  if (action !== undefined) filters.push(eq(activityLog.action, action));

  const whereClause =
    filters.reduce<SQL | undefined>((acc, clause) => (acc ? and(acc, clause) : clause), undefined) ??
    eq(activityLog.companyId, companyId);

  return await db
    .select()
    .from(activityLog)
    .where(whereClause)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * 获取实体的活动历史
 */
export async function getEntityActivity(
  companyId: number,
  entityType: string,
  entityId: string,
  limit = 20
): Promise<ActivityLogEntry[]> {
  return await queryActivityLogs({
    companyId,
    entityType,
    entityId,
    limit,
  });
}

/**
 * 获取用户的活动历史
 */
export async function getUserActivity(
  companyId: number,
  userId: number,
  limit = 50
): Promise<ActivityLogEntry[]> {
  return await queryActivityLogs({
    companyId,
    actorType: "user",
    actorId: userId.toString(),
    limit,
  });
}

/**
 * 获取 Agent 的活动历史
 */
export async function getAgentActivity(
  companyId: number,
  agentId: number,
  limit = 50
): Promise<ActivityLogEntry[]> {
  return await queryActivityLogs({
    companyId,
    actorType: "agent",
    actorId: agentId.toString(),
    limit,
  });
}

// ============================================================================
// 审计统计
// ============================================================================

/**
 * 获取活动统计
 */
export async function getActivityStats(
  companyId: number,
  since?: Date
): Promise<{
  totalCount: number;
  byAction: Record<string, number>;
  byActorType: Record<string, number>;
  byEntityType: Record<string, number>;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalCount: 0,
      byAction: {},
      byActorType: {},
      byEntityType: {},
    };
  }

  let baseCondition: SQL = eq(activityLog.companyId, companyId);
  
  if (since) {
    baseCondition = and(baseCondition, sql`${activityLog.createdAt} >= ${since}`) as SQL;
  }

  // 总数
  const [totalResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(activityLog)
    .where(baseCondition);

  // 按动作统计
  const byActionResult = await db
    .select({
      action: activityLog.action,
      count: sql<number>`COUNT(*)`,
    })
    .from(activityLog)
    .where(baseCondition)
    .groupBy(activityLog.action);

  // 按执行者类型统计
  const byActorTypeResult = await db
    .select({
      actorType: activityLog.actorType,
      count: sql<number>`COUNT(*)`,
    })
    .from(activityLog)
    .where(baseCondition)
    .groupBy(activityLog.actorType);

  // 按实体类型统计
  const byEntityTypeResult = await db
    .select({
      entityType: activityLog.entityType,
      count: sql<number>`COUNT(*)`,
    })
    .from(activityLog)
    .where(baseCondition)
    .groupBy(activityLog.entityType);

  return {
    totalCount: totalResult?.count || 0,
    byAction: Object.fromEntries(byActionResult.map((r) => [r.action, r.count])),
    byActorType: Object.fromEntries(byActorTypeResult.map((r) => [r.actorType, r.count])),
    byEntityType: Object.fromEntries(byEntityTypeResult.map((r) => [r.entityType, r.count])),
  };
}

// ============================================================================
// 审计导出
// ============================================================================

/**
 * 导出审计报告（CSV 格式）
 */
export async function exportAuditReport(
  companyId: number,
  startDate: Date,
  endDate: Date
): Promise<string> {
  const logs = await queryActivityLogs({
    companyId,
    limit: 10000,
    offset: 0,
  });

  // 过滤日期范围
  const filtered = logs.filter(
    (log) => log.createdAt >= startDate && log.createdAt <= endDate
  );

  // 生成 CSV
  const headers = ["Timestamp", "Actor Type", "Actor ID", "Action", "Entity Type", "Entity ID", "Details"];
  const rows = filtered.map((log) => [
    log.createdAt.toISOString(),
    log.actorType,
    log.actorId,
    log.action,
    log.entityType,
    log.entityId,
    JSON.stringify(log.details || {}),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

// ============================================================================
// 导出聚合
// ============================================================================

export const auditService = {
  // 记录
  logActivity,
  logActivities,
  
  // 查询
  queryActivityLogs,
  getEntityActivity,
  getUserActivity,
  getAgentActivity,
  
  // 统计
  getActivityStats,
  
  // 导出
  exportAuditReport,
};

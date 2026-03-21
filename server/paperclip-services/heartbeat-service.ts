/**
 * Paperclip Heartbeat/Run 执行引擎服务
 * 负责 Agent 心跳调度、运行记录管理
 */

import { getDb } from "../db";
import { heartbeatRuns, heartbeatRunEvents, agentWakeupRequests, agents, activityLog } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { AUDIT_ACTIONS, ACTOR_TYPES } from "../../shared";

export interface StartHeartbeatOptions {
  companyId: number;
  agentId: number;
  invocationSource: "scheduler" | "manual" | "callback";
  contextSnapshot?: Record<string, unknown>;
}

export interface FinishHeartbeatOptions {
  runId: number;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  error?: string;
  contextSnapshot?: Record<string, unknown>;
}

async function logActivity(options: {
  companyId: number;
  actorType: "agent" | "user" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try { await db.insert(activityLog).values(options); } catch {}
}

/**
 * 启动一次心跳运行
 */
export async function startHeartbeatRun(options: StartHeartbeatOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查是否已有运行中的 run（V1 限制：每个 Agent 同时只能有 1 个）
  const [running] = await db
    .select({ id: heartbeatRuns.id })
    .from(heartbeatRuns)
    .where(and(
      eq(heartbeatRuns.agentId, options.agentId),
      eq(heartbeatRuns.status, "running")
    ))
    .limit(1);

  if (running) {
    throw new Error(`Agent ${options.agentId} already has a running heartbeat (id=${running.id})`);
  }

  const result = await db.insert(heartbeatRuns).values({
    companyId: options.companyId,
    agentId: options.agentId,
    invocationSource: options.invocationSource,
    status: "running",
    startedAt: new Date(),
    contextSnapshot: options.contextSnapshot ?? null,
  });
  const runId = (result as any).insertId;

  // 更新 Agent 状态为 running
  await db.update(agents).set({ status: "running", lastHeartbeatAt: new Date() })
    .where(eq(agents.id, options.agentId));

  await logActivity({
    companyId: options.companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "system",
    action: AUDIT_ACTIONS.AGENT_HEARTBEAT_STARTED,
    entityType: "heartbeat_run",
    entityId: runId.toString(),
    details: { agentId: options.agentId, invocationSource: options.invocationSource },
  });

  const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId)).limit(1);
  return rows[0];
}

/**
 * 完成一次心跳运行
 */
export async function finishHeartbeatRun(options: FinishHeartbeatOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, options.runId)).limit(1);
  if (!run) throw new Error("Heartbeat run not found");

  await db.update(heartbeatRuns).set({
    status: options.status,
    finishedAt: new Date(),
    error: options.error ?? null,
    contextSnapshot: options.contextSnapshot ?? run.contextSnapshot,
  }).where(eq(heartbeatRuns.id, options.runId));

  // 恢复 Agent 状态
  const newAgentStatus = options.status === "succeeded" ? "idle" : "error";
  await db.update(agents).set({ status: newAgentStatus })
    .where(eq(agents.id, run.agentId));

  await logActivity({
    companyId: run.companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "system",
    action: AUDIT_ACTIONS.AGENT_HEARTBEAT_COMPLETED,
    entityType: "heartbeat_run",
    entityId: options.runId.toString(),
    details: { agentId: run.agentId, status: options.status, error: options.error },
  });

  const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, options.runId)).limit(1);
  return rows[0];
}

/**
 * 追加运行事件
 */
export async function appendRunEvent(runId: number, eventType: string, eventData?: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(heartbeatRunEvents).values({
    runId,
    eventType,
    eventData: eventData ?? null,
  });
}

/**
 * 获取运行事件列表
 */
export async function getRunEvents(runId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(heartbeatRunEvents)
    .where(eq(heartbeatRunEvents.runId, runId))
    .orderBy(heartbeatRunEvents.occurredAt);
}

/**
 * 列出 Agent 的历史运行记录
 */
export async function listHeartbeatRuns(options: {
  companyId: number;
  agentId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { companyId, agentId, status, limit = 50, offset = 0 } = options;
  const conditions = [eq(heartbeatRuns.companyId, companyId)];
  if (agentId) conditions.push(eq(heartbeatRuns.agentId, agentId));
  if (status) conditions.push(eq(heartbeatRuns.status, status as any));

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  return db.select().from(heartbeatRuns).where(where)
    .orderBy(desc(heartbeatRuns.createdAt)).limit(limit).offset(offset);
}

/**
 * 创建 Agent 唤醒请求
 */
export async function createWakeupRequest(options: {
  agentId: number;
  companyId: number;
  reason: string;
  triggeredByUserId?: number;
  triggeredByAgentId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(agentWakeupRequests).values({
    agentId: options.agentId,
    companyId: options.companyId,
    reason: options.reason,
    triggeredByUserId: options.triggeredByUserId ?? null,
    triggeredByAgentId: options.triggeredByAgentId ?? null,
    processed: false,
  });
  const id = (result as any).insertId;
  const rows = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.id, id)).limit(1);
  return rows[0];
}

/**
 * 获取未处理的唤醒请求
 */
export async function getPendingWakeupRequests(agentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(agentWakeupRequests)
    .where(and(eq(agentWakeupRequests.agentId, agentId), eq(agentWakeupRequests.processed, false)))
    .orderBy(agentWakeupRequests.createdAt);
}

/**
 * 标记唤醒请求为已处理
 */
export async function markWakeupProcessed(requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(agentWakeupRequests).set({
    processed: true,
    processedAt: new Date(),
  }).where(eq(agentWakeupRequests.id, requestId));
}

export const heartbeatService = {
  startHeartbeatRun,
  finishHeartbeatRun,
  appendRunEvent,
  getRunEvents,
  listHeartbeatRuns,
  createWakeupRequest,
  getPendingWakeupRequests,
  markWakeupProcessed,
};

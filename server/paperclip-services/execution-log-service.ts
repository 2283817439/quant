import { getDb } from '../db';
import { scheduleExecutionLogs } from '../../drizzle/paperclip-schema';
import { eq, and, desc } from 'drizzle-orm';

export interface CreateExecutionLogOptions {
  scheduleId: number;
  agentId: number;
  runnerId?: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
}

export interface UpdateExecutionLogOptions {
  logId: number;
  status?: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  finishedAt?: Date;
  duration?: number;
  output?: string;
  errorMessage?: string;
  retryCount?: number;
}

export interface ListExecutionLogsOptions {
  scheduleId?: number;
  agentId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function createExecutionLog(options: CreateExecutionLogOptions) {
  const { scheduleId, agentId, runnerId, status } = options;
  const db = await getDb();

  const [result] = await db!.insert(scheduleExecutionLogs).values({
    scheduleId,
    agentId,
    runnerId,
    status,
    startedAt: new Date(),
    retryCount: 0,
    createdAt: new Date()
  }).$returningId();

  const [log] = await db!.select().from(scheduleExecutionLogs).where(eq(scheduleExecutionLogs.id, result.id)).limit(1);
  return log;
}

export async function updateExecutionLog(options: UpdateExecutionLogOptions) {
  const { logId, ...updates } = options;
  const db = await getDb();

  await db!
    .update(scheduleExecutionLogs)
    .set(updates)
    .where(eq(scheduleExecutionLogs.id, logId));

  const [log] = await db!.select().from(scheduleExecutionLogs).where(eq(scheduleExecutionLogs.id, logId)).limit(1);
  return log;
}

export async function listExecutionLogs(options: ListExecutionLogsOptions) {
  const { scheduleId, agentId, status, limit = 50, offset = 0 } = options;
  const db = await getDb();

  const conditions = [];

  if (scheduleId) {
    conditions.push(eq(scheduleExecutionLogs.scheduleId, scheduleId));
  }

  if (agentId) {
    conditions.push(eq(scheduleExecutionLogs.agentId, agentId));
  }

  if (status) {
    conditions.push(eq(scheduleExecutionLogs.status, status as any));
  }

  const query = db!
    .select()
    .from(scheduleExecutionLogs)
    .orderBy(desc(scheduleExecutionLogs.startedAt))
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }

  return await query;
}

export async function getExecutionLog(logId: number) {
  const db = await getDb();
  const [log] = await db!
    .select()
    .from(scheduleExecutionLogs)
    .where(eq(scheduleExecutionLogs.id, logId))
    .limit(1);

  return log;
}

export async function getExecutionStats(scheduleId: number) {
  const db = await getDb();
  const logs = await db!
    .select()
    .from(scheduleExecutionLogs)
    .where(eq(scheduleExecutionLogs.scheduleId, scheduleId));

  const total = logs.length;
  const success = logs.filter(l => l.status === 'success').length;
  const failed = logs.filter(l => l.status === 'failed').length;
  const timeout = logs.filter(l => l.status === 'timeout').length;
  const avgDuration = logs
    .filter(l => l.duration)
    .reduce((sum, l) => sum + (l.duration || 0), 0) / (logs.filter(l => l.duration).length || 1);

  return {
    total,
    success,
    failed,
    timeout,
    successRate: total > 0 ? (success / total) * 100 : 0,
    avgDuration: Math.round(avgDuration)
  };
}
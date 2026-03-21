import { getDb } from '../db';
import { agentSchedules } from '../../drizzle/paperclip-schema';
import { eq, and, asc } from 'drizzle-orm';
import CronExpressionParser from 'cron-parser';

const parseExpression = (expression: string) => CronExpressionParser.parse(expression);

export interface CreateScheduleOptions {
  companyId: number;
  agentId: number;
  cronExpression: string;
  enabled?: boolean;
  maxRetries?: number;
  retryDelaySeconds?: number;
  timeoutSeconds?: number;
}

export interface UpdateScheduleOptions {
  scheduleId: number;
  cronExpression?: string;
  enabled?: boolean;
}

export interface ListSchedulesOptions {
  companyId: number;
  agentId?: number;
}

export async function createSchedule(options: CreateScheduleOptions) {
  const {
    companyId,
    agentId,
    cronExpression,
    enabled = true,
    maxRetries = 0,
    retryDelaySeconds = 60,
    timeoutSeconds = 300
  } = options;

  // Validate cron expression
  let nextRun: Date;
  try {
    const expression = parseExpression(cronExpression);
    nextRun = expression.next().toDate();
  } catch (error) {
    throw new Error('Invalid cron expression');
  }
  const db = await getDb();

  const [result] = await db!.insert(agentSchedules).values({
    companyId,
    agentId,
    cronExpression,
    enabled: enabled ? 1 : 0,
    nextRun,
    maxRetries,
    retryDelaySeconds,
    timeoutSeconds,
    createdAt: new Date(),
    updatedAt: new Date()
  }).$returningId();

  const [schedule] = await db!.select().from(agentSchedules).where(eq(agentSchedules.id, result.id)).limit(1);
  return schedule;
}

export async function listSchedules(options: ListSchedulesOptions) {
  const { companyId, agentId } = options;
  const db = await getDb();

  const conditions = [eq(agentSchedules.companyId, companyId)];

  if (agentId) {
    conditions.push(eq(agentSchedules.agentId, agentId));
  }

  const schedules = await db!
    .select()
    .from(agentSchedules)
    .where(and(...conditions));

  return schedules;
}

export async function updateSchedule(options: UpdateScheduleOptions) {
  const { scheduleId, cronExpression, enabled } = options;
  const db = await getDb();

  const updates: any = { updatedAt: new Date() };

  if (cronExpression !== undefined) {
    try {
      const expression = parseExpression(cronExpression);
      updates.cronExpression = cronExpression;
      updates.nextRun = expression.next().toDate();
    } catch (error) {
      throw new Error('Invalid cron expression');
    }
  }

  if (enabled !== undefined) {
    updates.enabled = enabled ? 1 : 0;
  }

  await db!
    .update(agentSchedules)
    .set(updates)
    .where(eq(agentSchedules.id, scheduleId));

  const [schedule] = await db!.select().from(agentSchedules).where(eq(agentSchedules.id, scheduleId)).limit(1);
  return schedule;
}

export async function deleteSchedule(scheduleId: number) {
  const db = await getDb();
  await db!
    .delete(agentSchedules)
    .where(eq(agentSchedules.id, scheduleId));
}

export async function getNextScheduledRuns(companyId: number, limit: number = 10) {
  const db = await getDb();
  const schedules = await db!
    .select()
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.companyId, companyId),
        eq(agentSchedules.enabled, 1)
      )
    )
    .orderBy(asc(agentSchedules.nextRun))
    .limit(limit);

  return schedules;
}

export async function updateLastRun(scheduleId: number) {
  const db = await getDb();
  const schedule = await db!
    .select()
    .from(agentSchedules)
    .where(eq(agentSchedules.id, scheduleId))
    .limit(1);

  if (schedule.length === 0) return;

  const expression = parseExpression(schedule[0].cronExpression);
  const nextRun = expression.next().toDate();

  await db!
    .update(agentSchedules)
    .set({
      lastRun: new Date(),
      nextRun,
      updatedAt: new Date()
    })
    .where(eq(agentSchedules.id, scheduleId));
}

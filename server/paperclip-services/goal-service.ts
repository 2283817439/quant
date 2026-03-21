/**
 * Paperclip 目标管理服务
 */

import { getDb } from "../db";
import { goals, activityLog } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { AUDIT_ACTIONS, ACTOR_TYPES } from "../../shared";

export interface CreateGoalOptions {
  companyId: number;
  title: string;
  description?: string;
  level: "company" | "team" | "agent" | "task";
  parentId?: number;
  ownerAgentId?: number;
  createdByUserId?: number;
}

export interface UpdateGoalOptions {
  goalId: number;
  title?: string;
  description?: string;
  status?: "planned" | "active" | "achieved" | "cancelled";
  ownerAgentId?: number;
}

export interface ListGoalsOptions {
  companyId: number;
  level?: "company" | "team" | "agent" | "task";
  status?: "planned" | "active" | "achieved" | "cancelled";
  parentId?: number | null;
  limit?: number;
  offset?: number;
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

export async function createGoal(options: CreateGoalOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(goals).values({
    companyId: options.companyId,
    title: options.title,
    description: options.description,
    level: options.level,
    parentId: options.parentId ?? null,
    ownerAgentId: options.ownerAgentId ?? null,
    status: "planned",
  });
  const goalId = (result as any).insertId;

  await logActivity({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() ?? "system",
    action: "goal.created",
    entityType: "goal",
    entityId: goalId.toString(),
    details: { title: options.title, level: options.level },
  });

  const rows = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  return rows[0];
}

export async function getGoalById(goalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  return rows[0] ?? null;
}

export async function listGoals(options: ListGoalsOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { companyId, level, status, parentId, limit = 50, offset = 0 } = options;

  const conditions = [eq(goals.companyId, companyId)];
  if (level) conditions.push(eq(goals.level, level));
  if (status) conditions.push(eq(goals.status, status));
  if (parentId === null) conditions.push(sql`${goals.parentId} IS NULL`);
  else if (parentId !== undefined) conditions.push(eq(goals.parentId, parentId));

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  return db.select().from(goals).where(where)
    .orderBy(desc(goals.createdAt)).limit(limit).offset(offset);
}

export async function updateGoal(options: UpdateGoalOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const update: Record<string, unknown> = {};
  if (options.title !== undefined) update.title = options.title;
  if (options.description !== undefined) update.description = options.description;
  if (options.status !== undefined) update.status = options.status;
  if (options.ownerAgentId !== undefined) update.ownerAgentId = options.ownerAgentId;

  await db.update(goals).set(update).where(eq(goals.id, options.goalId));
  return getGoalById(options.goalId);
}

export async function getGoalTree(companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allGoals = await db.select().from(goals)
    .where(eq(goals.companyId, companyId))
    .orderBy(goals.level, goals.createdAt);

  // 构建树形结构
  const map = new Map<number, any>();
  const roots: any[] = [];

  for (const g of allGoals) {
    map.set(g.id, { ...g, children: [] });
  }
  for (const g of allGoals) {
    if (g.parentId && map.has(g.parentId)) {
      map.get(g.parentId).children.push(map.get(g.id));
    } else {
      roots.push(map.get(g.id));
    }
  }
  return roots;
}

export const goalService = {
  createGoal,
  getGoalById,
  listGoals,
  updateGoal,
  getGoalTree,
};

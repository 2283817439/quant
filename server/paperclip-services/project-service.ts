/**
 * Paperclip 项目管理服务
 */

import { getDb } from "../db";
import { projects, issues, activityLog } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { AUDIT_ACTIONS, ACTOR_TYPES } from "../../shared";

export interface CreateProjectOptions {
  companyId: number;
  name: string;
  description?: string;
  createdByUserId?: number;
}

export interface UpdateProjectOptions {
  projectId: number;
  name?: string;
  description?: string;
  status?: "active" | "paused" | "archived";
  updatedByUserId?: number;
}

export interface ListProjectsOptions {
  companyId: number;
  status?: "active" | "paused" | "archived";
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
  try {
    await db.insert(activityLog).values(options);
  } catch {}
}

export async function createProject(options: CreateProjectOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(projects).values({
    companyId: options.companyId,
    name: options.name,
    description: options.description,
    status: "active",
  });
  const projectId = (result as any).insertId;

  await logActivity({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() ?? "system",
    action: AUDIT_ACTIONS.AGENT_CREATED, // reuse generic created action
    entityType: "project",
    entityId: projectId.toString(),
    details: { name: options.name },
  });

  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return rows[0];
}

export async function getProjectById(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return rows[0] ?? null;
}

export async function listProjects(options: ListProjectsOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { companyId, status, limit = 50, offset = 0 } = options;
  const where = status
    ? and(eq(projects.companyId, companyId), eq(projects.status, status))
    : eq(projects.companyId, companyId);

  const rows = await db.select().from(projects).where(where)
    .orderBy(desc(projects.createdAt)).limit(limit).offset(offset);

  // 附加每个项目的任务数
  const result = await Promise.all(rows.map(async (p) => {
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(issues)
      .where(eq(issues.projectId, p.id));
    return { ...p, taskCount: Number(countRow?.count) || 0 };
  }));

  return result;
}

export async function updateProject(options: UpdateProjectOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const update: Record<string, unknown> = {};
  if (options.name !== undefined) update.name = options.name;
  if (options.description !== undefined) update.description = options.description;
  if (options.status !== undefined) update.status = options.status;

  await db.update(projects).set(update).where(eq(projects.id, options.projectId));
  return getProjectById(options.projectId);
}

export async function deleteProject(projectId: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
}

export const projectService = {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
  deleteProject,
};

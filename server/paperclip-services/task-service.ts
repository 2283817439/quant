/**
 * Paperclip Task Management Service
 *
 * Provides CRUD operations for Issues, checkout/release logic, comments, and
 * audit logging so that Paperclip agents can coordinate work safely.
 */

import { getDb } from "../db";
import {
  issues,
  issueComments,
  agents,
  activityLog,
} from "../../drizzle/schema";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Issue, InsertIssue } from "../../drizzle/schema";
import type {
  CheckoutTaskRequest,
  CheckoutTaskResponse,
  IssuePriority,
  IssueStatus,
} from "../../client/src/lib/paperclip-types";
import {
  ACTOR_TYPES,
  AUDIT_ACTIONS,
  ERROR_CODES,
  validIssueTransitions,
} from "../../shared";

export type IssueWithDetails = Issue & {
  assigneeName?: string;
  parentTitle?: string;
};

export interface CreateIssueOptions {
  companyId: number;
  projectId?: number;
  goalId?: number;
  parentId?: number;
  title: string;
  description?: string;
  priority?: IssuePriority;
  assigneeAgentId?: number;
  createdByAgentId?: number;
  createdByUserId?: number;
  billingCode?: string;
  requestDepth?: number;
}

export interface UpdateIssueOptions {
  issueId: number;
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeAgentId?: number;
  billingCode?: string;
  updatedByAgentId?: number;
  updatedByUserId?: number;
}

export interface ListIssuesOptions {
  companyId: number;
  status?: IssueStatus;
  assigneeAgentId?: number;
  priority?: IssuePriority;
  projectId?: number;
  goalId?: number;
  limit?: number;
  offset?: number;
}

export interface AddCommentOptions {
  issueId: number;
  companyId: number;
  body: string;
  authorAgentId?: number;
  authorUserId?: number;
}

// -----------------------------------------------------------------------------
// Query helpers
// -----------------------------------------------------------------------------

export async function getIssueById(issueId: number): Promise<Issue | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(issues)
    .where(eq(issues.id, issueId))
    .limit(1);

  return result[0] ?? null;
}

export async function getIssueWithDetails(issueId: number): Promise<IssueWithDetails | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ issue: issues })
    .from(issues)
    .where(eq(issues.id, issueId))
    .limit(1);

  if (!row) return null;

  let assigneeName: string | undefined;
  if (row.issue.assigneeAgentId) {
    const [assigneeRow] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, row.issue.assigneeAgentId))
      .limit(1);
    assigneeName = assigneeRow?.name ?? undefined;
  }

  let parentTitle: string | undefined;
  if (row.issue.parentId) {
    const [parentRow] = await db
      .select({ title: issues.title })
      .from(issues)
      .where(eq(issues.id, row.issue.parentId))
      .limit(1);
    parentTitle = parentRow?.title ?? undefined;
  }

  return {
    ...row.issue,
    assigneeName,
    parentTitle,
  };
}

export async function listIssues(options: ListIssuesOptions): Promise<Issue[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filters: SQL[] = [eq(issues.companyId, options.companyId)];
  if (options.status !== undefined) filters.push(eq(issues.status, options.status));
  if (options.assigneeAgentId !== undefined) filters.push(eq(issues.assigneeAgentId, options.assigneeAgentId));
  if (options.priority !== undefined) filters.push(eq(issues.priority, options.priority));
  if (options.projectId !== undefined) filters.push(eq(issues.projectId, options.projectId));
  if (options.goalId !== undefined) filters.push(eq(issues.goalId, options.goalId));

  const whereClause = filters.length === 1 ? filters[0] : and(...filters);

  return await db
    .select()
    .from(issues)
    .where(whereClause)
    .orderBy(desc(issues.updatedAt), desc(issues.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

export async function getAgentIssues(
  agentId: number,
  companyId: number,
  statuses?: IssueStatus[]
): Promise<Issue[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filters: SQL[] = [
    eq(issues.assigneeAgentId, agentId),
    eq(issues.companyId, companyId),
  ];

  if (statuses && statuses.length > 0) {
    filters.push(inArray(issues.status, statuses));
  }

  const whereClause = filters.length === 1 ? filters[0] : and(...filters);

  return await db
    .select()
    .from(issues)
    .where(whereClause)
    .orderBy(desc(issues.updatedAt));
}

export async function getActiveIssues(companyId: number): Promise<Issue[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        inArray(issues.status, ["in_progress", "in_review"])
      )
    )
    .orderBy(desc(issues.updatedAt));
}

// -----------------------------------------------------------------------------
// Creation & updates
// -----------------------------------------------------------------------------

export async function createIssue(options: CreateIssueOptions): Promise<Issue> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let requestDepth = options.requestDepth ?? 0;

  if (options.parentId) {
    const parent = await db
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.id, options.parentId), eq(issues.companyId, options.companyId)))
      .limit(1);

    if (parent.length === 0) {
      throw new Error("Parent task not found");
    }

    const depth = await calculateRequestDepth(options.parentId);
    requestDepth = depth + 1;
  }

  const insertData: InsertIssue = {
    companyId: options.companyId,
    projectId: options.projectId,
    goalId: options.goalId,
    parentId: options.parentId,
    title: options.title,
    description: options.description,
    status: "backlog",
    priority: options.priority ?? "medium",
    assigneeAgentId: options.assigneeAgentId,
    createdByAgentId: options.createdByAgentId,
    createdByUserId: options.createdByUserId,
    requestDepth,
    billingCode: options.billingCode,
  };

  const result = await db.insert(issues).values(insertData);
  const issueId = (result as any).insertId ?? (result as any).id;

  const actorType = options.createdByUserId
    ? ACTOR_TYPES.USER
    : options.createdByAgentId
    ? ACTOR_TYPES.AGENT
    : ACTOR_TYPES.SYSTEM;

  const actorId = (
    options.createdByUserId ??
    options.createdByAgentId ??
    "system"
  ).toString();

  await logActivity({
    companyId: options.companyId,
    actorType,
    actorId,
    action: AUDIT_ACTIONS.TASK_CREATED,
    entityType: "issue",
    entityId: issueId.toString(),
    details: {
      title: options.title,
      priority: options.priority,
      parentId: options.parentId,
    },
  });

  const createdIssue = await getIssueById(issueId);
  if (!createdIssue) {
    throw new Error("Failed to load created issue");
  }
  return createdIssue;
}

export async function updateIssue(options: UpdateIssueOptions): Promise<Issue> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getIssueById(options.issueId);
  if (!existing) {
    throw new Error("Task not found");
  }

  const updateData: Partial<InsertIssue> = {};

  if (options.title !== undefined) updateData.title = options.title;
  if (options.description !== undefined) updateData.description = options.description;
  if (options.status !== undefined) updateData.status = options.status;
  if (options.priority !== undefined) updateData.priority = options.priority;
  if (options.assigneeAgentId !== undefined) updateData.assigneeAgentId = options.assigneeAgentId;
  if (options.billingCode !== undefined) updateData.billingCode = options.billingCode;

  if (options.status !== undefined) {
    handleStatusTransitionSideEffects(updateData, existing.status, options.status);
  }

  await db
    .update(issues)
    .set(updateData)
    .where(eq(issues.id, options.issueId));

  if (options.updatedByUserId || options.updatedByAgentId) {
    const actorType = options.updatedByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.AGENT;
    const actorId = (options.updatedByUserId ?? options.updatedByAgentId)!.toString();

    await logActivity({
      companyId: existing.companyId,
      actorType,
      actorId,
      action: AUDIT_ACTIONS.TASK_UPDATED,
      entityType: "issue",
      entityId: options.issueId.toString(),
      details: { changes: updateData },
    });
  }

  const updatedIssue = await getIssueById(options.issueId);
  if (!updatedIssue) {
    throw new Error("Failed to load updated issue");
  }
  return updatedIssue;
}

function handleStatusTransitionSideEffects(
  updateData: Partial<InsertIssue>,
  fromStatus: IssueStatus,
  toStatus: IssueStatus
): void {
  const now = new Date();

  if (toStatus === "in_progress" && !updateData.startedAt) {
    updateData.startedAt = now;
  }

  if (toStatus === "done") {
    updateData.completedAt = now;
  }

  if (toStatus === "cancelled") {
    updateData.cancelledAt = now;
  }

  if (validIssueTransitions[fromStatus] && !validIssueTransitions[fromStatus].includes(toStatus)) {
    throw new Error(`Invalid state transition from ${fromStatus} to ${toStatus}`);
  }
}

async function calculateRequestDepth(parentId: number, depth = 0): Promise<number> {
  const db = await getDb();
  if (!db) return depth;

  const [parent] = await db
    .select({ parentId: issues.parentId })
    .from(issues)
    .where(eq(issues.id, parentId))
    .limit(1);

  if (!parent || !parent.parentId) {
    return depth + 1;
  }

  return calculateRequestDepth(parent.parentId, depth + 1);
}

// -----------------------------------------------------------------------------
// Checkout / release
// -----------------------------------------------------------------------------

export async function checkoutTask(
  request: CheckoutTaskRequest
): Promise<CheckoutTaskResponse> {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Database not available" },
    };
  }

  try {
    const agentExists = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, request.agentId))
      .limit(1);

    if (agentExists.length === 0) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Agent not found" },
      };
    }

    const currentIssue = await getIssueById(request.issueId);
    if (!currentIssue) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Task not found" },
      };
    }

    const expectedStatuses = request.expectedStatuses ?? ["backlog", "todo", "blocked"];
    if (!expectedStatuses.includes(currentIssue.status)) {
      return {
        success: false,
        error: {
          code: "INVALID_STATE",
          message: `Task is in ${currentIssue.status} state, not eligible for checkout`,
          currentStatus: currentIssue.status,
        },
      };
    }

    const updateCondition = and(
      eq(issues.id, request.issueId),
      inArray(issues.status, expectedStatuses),
      or(eq(issues.assigneeAgentId, request.agentId), isNull(issues.assigneeAgentId))
    );

    const updateData = {
      assigneeAgentId: request.agentId,
      status: "in_progress" as IssueStatus,
      startedAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db
      .update(issues)
      .set(updateData)
      .where(updateCondition);

    const affected = (result as any).affectedRows ?? 0;

    if (affected === 0) {
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: "Task is already being worked on by another agent",
          currentOwner: currentIssue.assigneeAgentId ?? undefined,
          currentStatus: currentIssue.status,
        },
      };
    }

    await logActivity({
      companyId: currentIssue.companyId,
      actorType: ACTOR_TYPES.AGENT,
      actorId: request.agentId.toString(),
      action: AUDIT_ACTIONS.TASK_CHECKOUT,
      entityType: "issue",
      entityId: request.issueId.toString(),
      details: {
        previousStatus: currentIssue.status,
        agentId: request.agentId,
      },
    });

    const updatedIssue = await getIssueById(request.issueId);

    return {
      success: true,
      issue: updatedIssue ?? undefined,
    };
  } catch (error) {
    console.error("[paperclip] checkoutTask failed:", error);
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

export async function releaseTask(
  issueId: number,
  agentId: number,
  companyId: number
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const issue = await getIssueById(issueId);
  if (!issue) {
    return { success: false, error: "Task not found" };
  }

  if (issue.assigneeAgentId !== agentId) {
    return { success: false, error: "Task is not assigned to this agent" };
  }

  await db
    .update(issues)
    .set({
      assigneeAgentId: null,
      status: "todo",
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId));

  await logActivity({
    companyId,
    actorType: ACTOR_TYPES.AGENT,
    actorId: agentId.toString(),
    action: AUDIT_ACTIONS.TASK_RELEASED,
    entityType: "issue",
    entityId: issueId.toString(),
    details: { previousStatus: issue.status },
  });

  return { success: true };
}

// -----------------------------------------------------------------------------
// Comments
// -----------------------------------------------------------------------------

export async function addComment(
  options: AddCommentOptions
): Promise<typeof issueComments.$inferSelect> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const issue = await getIssueById(options.issueId);
  if (!issue) {
    throw new Error("Task not found");
  }

  const insertData = {
    issueId: options.issueId,
    companyId: options.companyId,
    body: options.body,
    authorAgentId: options.authorAgentId ?? null,
    authorUserId: options.authorUserId ?? null,
  };

  const result = await db.insert(issueComments).values(insertData);
  const commentId = (result as any).insertId ?? (result as any).id;

  return {
    id: commentId,
    ...insertData,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getIssueComments(
  issueId: number
): Promise<typeof issueComments.$inferSelect[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(issueComments)
    .where(eq(issueComments.issueId, issueId))
    .orderBy(issueComments.createdAt);
}

// -----------------------------------------------------------------------------
// Cancellation
// -----------------------------------------------------------------------------

export async function cancelIssue(
  issueId: number,
  companyId: number,
  cancelledByUserId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const issue = await getIssueById(issueId);
  if (!issue) {
    throw new Error("Task not found");
  }

  if (issue.companyId !== companyId) {
    throw new Error("Task does not belong to specified company");
  }

  if (["done", "cancelled"].includes(issue.status)) {
    throw new Error(`Cannot cancel task in ${issue.status} state`);
  }

  await db
    .update(issues)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
    })
    .where(eq(issues.id, issueId));

  if (cancelledByUserId) {
    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.USER,
      actorId: cancelledByUserId.toString(),
      action: AUDIT_ACTIONS.TASK_CANCELLED,
      entityType: "issue",
      entityId: issueId.toString(),
      details: { title: issue.title },
    });
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
  if (!db) {
    console.warn("[paperclip] Database not available, skipping audit log");
    return;
  }

  try {
    await db.insert(activityLog).values({
      ...options,
      details: options.details ?? null,
    });
  } catch (error) {
    console.error("[paperclip] Failed to log activity:", error);
  }
}

export const taskService = {
  getIssueById,
  getIssueWithDetails,
  listIssues,
  getAgentIssues,
  getActiveIssues,
  createIssue,
  updateIssue,
  cancelIssue,
  checkoutTask,
  releaseTask,
  addComment,
  getIssueComments,
};

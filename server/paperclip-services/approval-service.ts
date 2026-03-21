/**
 * Paperclip Approval 审批管理服务
 *
 * 负责审批请求的创建、查询、决策以及评论记录，所有操作均写入审计日志。
 */

import { getDb } from "../db";
import {
  approvals,
  approvalComments,
  companies,
  activityLog,
} from "../../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import type { Approval as DbApproval } from "../../drizzle/schema";
import type { ApprovalStatus } from "../../client/src/lib/paperclip-types";
import { AUDIT_ACTIONS, ACTOR_TYPES } from "../../shared";

type ApprovalRecord = DbApproval & { payload: Record<string, unknown> | null };

export interface CreateApprovalOptions {
  companyId: number;
  type: "hire_agent" | "approve_ceo_strategy";
  requestedByAgentId?: number;
  requestedByUserId?: number;
  payload: Record<string, unknown>;
}

export interface ListApprovalsOptions {
  companyId: number;
  status?: ApprovalStatus;
}

export interface DecideApprovalOptions {
  approvalId: number;
  decision: "approved" | "rejected";
  decidedByUserId?: number;
  decisionNote?: string;
}

export interface AddApprovalCommentOptions {
  approvalId: number;
  body: string;
  authorUserId?: number;
}

/**
 * 创建审批请求
 */
export async function createApproval(
  options: CreateApprovalOptions
): Promise<ApprovalRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const company = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, options.companyId))
    .limit(1);

  if (company.length === 0) {
    throw new Error("Company not found");
  }

  const insertResult = await db.insert(approvals).values({
    companyId: options.companyId,
    type: options.type,
    requestedByAgentId: options.requestedByAgentId,
    requestedByUserId: options.requestedByUserId,
    status: "pending",
    payload: options.payload,
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
  });

  const approvalId = (insertResult as any).insertId || (insertResult as any).id;
  const approval = await getApprovalById(approvalId);
  if (!approval) {
    throw new Error("Failed to create approval");
  }

  await logActivity({
    companyId: options.companyId,
    actorType: options.requestedByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.requestedByUserId ? options.requestedByUserId.toString() : "system",
    action: AUDIT_ACTIONS.APPROVAL_REQUESTED,
    entityType: "approval",
    entityId: approvalId.toString(),
    details: {
      type: options.type,
      requestedByAgentId: options.requestedByAgentId,
    },
  });

  return approval;
}

/**
 * 查询审批列表
 */
export async function listApprovals(
  options: ListApprovalsOptions
): Promise<ApprovalRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = options.status
    ? and(eq(approvals.companyId, options.companyId), eq(approvals.status, options.status))
    : eq(approvals.companyId, options.companyId);

  const rows = await db
    .select()
    .from(approvals)
    .where(whereClause)
    .orderBy(desc(approvals.createdAt));
  return rows.map(normalizeApproval);
}

/**
 * 根据 ID 获取审批
 */
export async function getApprovalById(
  approvalId: number
): Promise<ApprovalRecord | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }
  return normalizeApproval(rows[0]!);
}

/**
 * 审批决策
 */
export async function decideApproval(
  options: DecideApprovalOptions
): Promise<ApprovalRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getApprovalById(options.approvalId);
  if (!existing) {
    throw new Error("Approval not found");
  }
  if (existing.status !== "pending") {
    throw new Error("Only pending approvals can be decided");
  }

  await db
    .update(approvals)
    .set({
      status: options.decision,
      decidedByUserId: options.decidedByUserId ?? null,
      decisionNote: options.decisionNote ?? null,
      decidedAt: new Date(),
    })
    .where(eq(approvals.id, options.approvalId));

  const updated = await getApprovalById(options.approvalId);
  if (!updated) {
    throw new Error("Failed to update approval");
  }

  await logActivity({
    companyId: updated.companyId,
    actorType: options.decidedByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.decidedByUserId ? options.decidedByUserId.toString() : "system",
    action:
      options.decision === "approved"
        ? AUDIT_ACTIONS.APPROVAL_APPROVED
        : AUDIT_ACTIONS.APPROVAL_REJECTED,
    entityType: "approval",
    entityId: options.approvalId.toString(),
    details: {
      decisionNote: options.decisionNote,
    },
  });

  return updated;
}

/**
 * 审批评论列表
 */
export async function listApprovalComments(
  approvalId: number
): Promise<typeof approvalComments.$inferSelect[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const approval = await getApprovalById(approvalId);
  if (!approval) {
    throw new Error("Approval not found");
  }

  return await db
    .select()
    .from(approvalComments)
    .where(
      and(
        eq(approvalComments.approvalId, approvalId),
        eq(approvalComments.companyId, approval.companyId)
      )
    )
    .orderBy(approvalComments.createdAt);
}

/**
 * 添加审批评论
 */
export async function addApprovalComment(
  options: AddApprovalCommentOptions
): Promise<typeof approvalComments.$inferSelect> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const approval = await getApprovalById(options.approvalId);
  if (!approval) {
    throw new Error("Approval not found");
  }

  const insertResult = await db.insert(approvalComments).values({
    approvalId: options.approvalId,
    companyId: approval.companyId,
    authorUserId: options.authorUserId ?? 0,
    body: options.body,
  });

  const commentId = (insertResult as any).insertId || (insertResult as any).id;

  const rows = await db
    .select()
    .from(approvalComments)
    .where(eq(approvalComments.id, commentId))
    .limit(1);

  const comment = rows[0];

  await logActivity({
    companyId: approval.companyId,
    actorType: options.authorUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.authorUserId ? options.authorUserId.toString() : "system",

    action: AUDIT_ACTIONS.APPROVAL_COMMENTED,
    entityType: "approval",
    entityId: options.approvalId.toString(),
    details: {
      commentId,
    },
  });

  return comment;
}

/**
 * 统一导出
 */
export const approvalService = {
  createApproval,
  listApprovals,
  getApprovalById,
  decideApproval,
  listApprovalComments,
  addApprovalComment,
};

function normalizeApproval(row: DbApproval): ApprovalRecord {
  return {
    ...row,
    payload: (row.payload ?? null) as Record<string, unknown> | null,
  };
}

interface LogOptions {
  companyId: number;
  actorType: "agent" | "user" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

async function logActivity(options: LogOptions): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[paperclip] Database not available, skipping audit log");
    return;
  }

  try {
    await db.insert(activityLog).values(options);
  } catch (error) {
    console.error("[paperclip] Failed to log activity:", error);
  }
}

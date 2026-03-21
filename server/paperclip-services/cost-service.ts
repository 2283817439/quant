/**
 * Paperclip 成本与预算管理服务
 * 
 * 负责成本事件记录、预算检查、预算超限自动暂停等核心业务逻辑
 * 基于 Paperclip V1 Implementation Spec
 */

import { getDb } from "../db";
import {
  costEvents,
  agents,
  activityLog,
} from "../../drizzle/schema";
import { eq, and, desc, sql, sum } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { CostEvent, InsertCostEvent } from "../../drizzle/schema";
import type { BudgetStatus } from "../../client/src/lib/paperclip-types";
import {
  AUDIT_ACTIONS,
  ACTOR_TYPES,
  BUDGET_THRESHOLDS,
} from "../../shared";

// ============================================================================
// 类型定义
// ============================================================================

export interface ReportCostOptions {
  companyId: number;
  agentId: number;
  issueId?: number;
  projectId?: number;
  goalId?: number;
  billingCode?: string | null;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents: number;
  occurredAt?: Date;
  reportedByAgentId?: number;
  reportedByUserId?: number;
}

export interface GetBudgetStatusOptions {
  companyId: number;
  agentId?: number;
  projectId?: number;
}

// ============================================================================
// 成本事件报告
// ============================================================================

/**
 * 报告成本事件
 */
export async function reportCostEvent(
  options: ReportCostOptions
): Promise<CostEvent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 验证 Agent 是否存在
  const agent = await db
    .select({
      id: agents.id,
      budgetMonthlyCents: agents.budgetMonthlyCents,
      spentMonthlyCents: agents.spentMonthlyCents,
    })
    .from(agents)
    .where(eq(agents.id, options.agentId))
    .limit(1);

  if (agent.length === 0) {
    throw new Error("Agent not found");
  }

  // 插入成本事件
  const insertData: InsertCostEvent = {
    companyId: options.companyId,
    agentId: options.agentId,
    issueId: options.issueId ?? null,
    projectId: options.projectId ?? null,
    goalId: options.goalId ?? null,
    billingCode: options.billingCode ?? null,
    provider: options.provider,
    model: options.model,
    inputTokens: options.inputTokens ?? 0,
    outputTokens: options.outputTokens ?? 0,
    costCents: options.costCents,
    occurredAt: options.occurredAt ?? new Date(),
  };

  const result = await db.insert(costEvents).values(insertData);
  const eventId = (result as any).insertId || (result as any).id;

  // 更新 Agent 的月度花费
  await updateAgentSpentCents(options.agentId, options.costCents);

  // 检查预算
  const agentData = agent[0];
  if (agentData.budgetMonthlyCents > 0) {
    await checkAndEnforceBudget(
      options.companyId,
      options.agentId,
      agentData.budgetMonthlyCents,
      agentData.spentMonthlyCents + options.costCents
    );
  }

  const costCents = insertData.costCents ?? 0;
  const occurredAt = insertData.occurredAt ?? new Date();

  return {
    id: eventId,
    companyId: insertData.companyId,
    agentId: insertData.agentId,
    issueId: insertData.issueId ?? null,
    projectId: insertData.projectId ?? null,
    goalId: insertData.goalId ?? null,
    billingCode: insertData.billingCode ?? null,
    provider: insertData.provider,
    model: insertData.model,
    inputTokens: insertData.inputTokens ?? 0,
    outputTokens: insertData.outputTokens ?? 0,
    costCents,
    occurredAt,
    createdAt: new Date(),
  };
}

/**
 * 批量报告成本事件
 */
export async function reportBatchCostEvents(
  events: Array<{
    companyId: number;
    agentId: number;
    costCents: number;
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    issueId?: number;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const insertData = events.map((event) => ({
    companyId: event.companyId,
    agentId: event.agentId,
    issueId: event.issueId ?? null,
    projectId: null,
    goalId: null,
    billingCode: null,
    provider: event.provider,
    model: event.model,
    inputTokens: event.inputTokens ?? 0,
    outputTokens: event.outputTokens ?? 0,
    costCents: event.costCents,
    occurredAt: now,
  }));

  await db.insert(costEvents).values(insertData);

  // 按 Agent 聚合更新花费
  const agentSpending = new Map<number, number>();
  for (const event of events) {
    const current = agentSpending.get(event.agentId) || 0;
    agentSpending.set(event.agentId, current + event.costCents);
  }

  for (const [agentId, totalCents] of Array.from(agentSpending.entries())) {
    await updateAgentSpentCents(agentId, totalCents);
  }
}

// ============================================================================
// 预算状态查询
// ============================================================================

/**
 * 获取预算状态
 */
export async function getBudgetStatus(
  options: GetBudgetStatusOptions
): Promise<BudgetStatus> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { companyId, agentId, projectId } = options;

  // 获取当前月份的起始和结束时间
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // 计算月度花费
  const spendFilters: SQL[] = [
    eq(costEvents.companyId, companyId),
    sql`${costEvents.occurredAt} >= ${monthStart}`,
    sql`${costEvents.occurredAt} <= ${monthEnd}`,
  ];

  if (agentId) {
    spendFilters.push(eq(costEvents.agentId, agentId));
  }

  if (projectId) {
    spendFilters.push(eq(costEvents.projectId, projectId));
  }

  const spendWhere =
    spendFilters.length === 1 ? spendFilters[0] : and(...spendFilters);

  const [spendResult] = await db
    .select({ total: sql<number>`SUM(costCents)` })
    .from(costEvents)
    .where(spendWhere);
  const spentCents = spendResult?.total || 0;

  // 获取预算
  let monthlyBudgetCents = 0;

  if (agentId) {
    const [agent] = await db
      .select({ budgetMonthlyCents: agents.budgetMonthlyCents })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    monthlyBudgetCents = agent?.budgetMonthlyCents || 0;
  }

  // 计算统计
  const remainingCents = monthlyBudgetCents - spentCents;
  const utilizationPercent = monthlyBudgetCents > 0
    ? (spentCents / monthlyBudgetCents) * 100
    : 0;
  const isOverBudget = spentCents > monthlyBudgetCents;

  // 计算本月剩余天数
  const daysRemainingInMonth = Math.ceil(
    (monthEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    monthlyBudgetCents,
    spentCents,
    remainingCents,
    utilizationPercent: Math.round(utilizationPercent * 100) / 100,
    isOverBudget,
    daysRemainingInMonth,
  };
}

/**
 * 获取公司级别的预算汇总
 */
export async function getCompanyBudgetSummary(
  companyId: number
): Promise<{
  totalBudgetCents: number;
  totalSpentCents: number;
  agentCount: number;
  overBudgetAgents: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 获取所有 Agent 的预算
  const agentsList = await db
    .select({
      id: agents.id,
      budgetMonthlyCents: agents.budgetMonthlyCents,
    })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.status, "active")));

  const totalBudgetCents = agentsList.reduce(
    (sum, agent) => sum + (agent.budgetMonthlyCents || 0),
    0
  );

  // 获取每个 Agent 的花费
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  let overBudgetAgents = 0;
  let totalSpentCents = 0;

  for (const agent of agentsList) {
    const [spendResult] = await db
      .select({ total: sql<number>`SUM(costCents)` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.companyId, companyId),
          eq(costEvents.agentId, agent.id),
          sql`${costEvents.occurredAt} >= ${monthStart}`,
          sql`${costEvents.occurredAt} <= ${monthEnd}`
        )
      )
      .limit(1);

    const spent = spendResult?.total || 0;
    totalSpentCents += spent;

    if (agent.budgetMonthlyCents > 0 && spent > agent.budgetMonthlyCents) {
      overBudgetAgents++;
    }
  }

  return {
    totalBudgetCents,
    totalSpentCents,
    agentCount: agentsList.length,
    overBudgetAgents,
  };
}

// ============================================================================
// 预算执行与检查
// ============================================================================

/**
 * 检查并执行预算限制
 */
async function checkAndEnforceBudget(
  companyId: number,
  agentId: number,
  budgetMonthlyCents: number,
  spentCents: number
): Promise<void> {
  if (budgetMonthlyCents <= 0) return;

  const db = await getDb();
  if (!db) return;

  const utilizationPercent = (spentCents / budgetMonthlyCents) * 100;

  // 软警告（80%）
  if (
    utilizationPercent >= BUDGET_THRESHOLDS.SOFT_ALERT_PERCENT &&
    utilizationPercent < BUDGET_THRESHOLDS.HARD_LIMIT_PERCENT
  ) {
    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.SYSTEM,
      actorId: "system",
      action: AUDIT_ACTIONS.BUDGET_EXCEEDED,
      entityType: "agent",
      entityId: agentId.toString(),
      details: {
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        budgetMonthlyCents,
        spentCents,
        level: "soft_alert",
      },
    });

    console.warn(
      `[paperclip-budget] Agent ${agentId} budget utilization at ${utilizationPercent.toFixed(1)}%`
    );
  }

  // 硬限制（100%）- 自动暂停 Agent
  if (utilizationPercent >= BUDGET_THRESHOLDS.HARD_LIMIT_PERCENT) {
    await db
      .update(agents)
      .set({ status: "paused" })
      .where(eq(agents.id, agentId));

    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.SYSTEM,
      actorId: "system",
      action: AUDIT_ACTIONS.AGENT_PAUSED,
      entityType: "agent",
      entityId: agentId.toString(),
      details: {
        reason: "budget_hard_limit_reached",
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        budgetMonthlyCents,
        spentCents,
      },
    });

    console.warn(
      `[paperclip-budget] Agent ${agentId} paused due to budget hard limit (${utilizationPercent.toFixed(1)}%)`
    );
  }
}

/**
 * 更新 Agent 的月度花费
 */
async function updateAgentSpentCents(
  agentId: number,
  amountCents: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 获取当前月份
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // 重新计算本月总花费（确保准确性）
  const [spendResult] = await db
    .select({ total: sql<number>`SUM(costCents)` })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.agentId, agentId),
        sql`${costEvents.occurredAt} >= ${monthStart}`,
        sql`${costEvents.occurredAt} <= ${monthEnd}`
      )
    )
    .limit(1);

  const totalSpentCents = spendResult?.total || 0;

  // 更新 Agent 的 spentMonthlyCents
  await db
    .update(agents)
    .set({ spentMonthlyCents: totalSpentCents })
    .where(eq(agents.id, agentId));
}

// ============================================================================
// 成本查询与分析
// ============================================================================

/**
 * 获取成本事件列表
 */
export async function getCostEvents(
  companyId: number,
  agentId?: number,
  limit = 100,
  offset = 0
): Promise<CostEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filters: SQL[] = [eq(costEvents.companyId, companyId)];
  if (agentId) {
    filters.push(eq(costEvents.agentId, agentId));
  }

  const whereClause = filters.length === 1 ? filters[0] : and(...filters);

  return await db
    .select()
    .from(costEvents)
    .where(whereClause)
    .orderBy(desc(costEvents.occurredAt))
    .limit(limit)
    .offset(offset);
}

/**
 * 按 Agent 分组统计成本
 */
export async function getCostsByAgent(
  companyId: number,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    agentId: number;
    agentName?: string;
    totalCostCents: number;
    inputTokens: number;
    outputTokens: number;
    eventCount: number;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      agentId: costEvents.agentId,
      totalCostCents: sql<number>`SUM(costCents)`,
      inputTokens: sql<number>`SUM(inputTokens)`,
      outputTokens: sql<number>`SUM(outputTokens)`,
      eventCount: sql<number>`COUNT(*)`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        sql`${costEvents.occurredAt} >= ${startDate}`,
        sql`${costEvents.occurredAt} <= ${endDate}`
      )
    )
    .groupBy(costEvents.agentId)
    .orderBy(sql`totalCostCents DESC`);

  // 获取 Agent 名称
  const agentIds = results.map((r) => r.agentId);
  const agentsList = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(sql`id IN ${agentIds}`);

  const agentMap = new Map(agentsList.map((a) => [a.id, a.name]));

  return results.map((r) => ({
    agentId: r.agentId,
    agentName: agentMap.get(r.agentId),
    totalCostCents: r.totalCostCents,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    eventCount: r.eventCount,
  }));
}

/**
 * 按项目分组统计成本
 */
export async function getCostsByProject(
  companyId: number,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    projectId: number | null;
    totalCostCents: number;
    eventCount: number;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select({
      projectId: costEvents.projectId,
      totalCostCents: sql<number>`SUM(costCents)`,
      eventCount: sql<number>`COUNT(*)`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        sql`${costEvents.occurredAt} >= ${startDate}`,
        sql`${costEvents.occurredAt} <= ${endDate}`
      )
    )
    .groupBy(costEvents.projectId)
    .orderBy(sql`totalCostCents DESC`);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 记录活动日志
 */
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
    console.warn("[paperclip-budget] Database not available, skipping audit log");
    return;
  }

  try {
    await db.insert(activityLog).values(options);
  } catch (error) {
    console.error("[paperclip-budget] Failed to log activity:", error);
  }
}

// ============================================================================
// 导出聚合
// ============================================================================

export const costService = {
  // 成本报告
  reportCostEvent,
  reportBatchCostEvents,
  
  // 预算查询
  getBudgetStatus,
  getCompanyBudgetSummary,
  
  // 成本分析
  getCostEvents,
  getCostsByAgent,
  getCostsByProject,
};

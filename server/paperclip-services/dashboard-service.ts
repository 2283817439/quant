/**
 * Paperclip Dashboard 聚合服务
 * 提供仪表板所需的聚合统计数据
 */

import { getDb } from "../db";
import { agents, issues, approvals, costEvents, activityLog } from "../../drizzle/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import type { DashboardSummary } from "../../client/src/lib/paperclip-types";

export interface DashboardData extends DashboardSummary {
  recentActivity: Array<{
    id: number;
    actorType: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: Record<string, unknown> | null;
    createdAt: Date;
  }>;
  topAgentsByCost: Array<{
    agentId: number;
    agentName: string;
    totalCostCents: number;
  }>;
}

export async function getDashboardSummary(companyId: number): Promise<DashboardData> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 并行查询所有统计数据
  const [
    agentStats,
    issueStats,
    pendingApprovalsCount,
    budgetStats,
    recentActivityRows,
    topCostRows,
  ] = await Promise.all([
    // Agent 状态统计
    db.select({
      status: agents.status,
      count: sql<number>`COUNT(*)`,
    })
      .from(agents)
      .where(eq(agents.companyId, companyId))
      .groupBy(agents.status),

    // 任务状态统计
    db.select({
      status: issues.status,
      count: sql<number>`COUNT(*)`,
    })
      .from(issues)
      .where(eq(issues.companyId, companyId))
      .groupBy(issues.status),

    // 待审批数量
    db.select({ count: sql<number>`COUNT(*)` })
      .from(approvals)
      .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending"))),

    // 本月预算统计
    db.select({
      totalSpent: sql<number>`SUM(costCents)`,
    })
      .from(costEvents)
      .where(and(
        eq(costEvents.companyId, companyId),
        sql`${costEvents.occurredAt} >= ${monthStart}`
      )),

    // 最近活动
    db.select()
      .from(activityLog)
      .where(eq(activityLog.companyId, companyId))
      .orderBy(desc(activityLog.createdAt))
      .limit(10),

    // 按 Agent 统计本月成本 Top 5
    db.select({
      agentId: costEvents.agentId,
      totalCostCents: sql<number>`SUM(costCents)`,
    })
      .from(costEvents)
      .where(and(
        eq(costEvents.companyId, companyId),
        sql`${costEvents.occurredAt} >= ${monthStart}`
      ))
      .groupBy(costEvents.agentId)
      .orderBy(sql`SUM(costCents) DESC`)
      .limit(5),
  ]);

  // 汇总 Agent 状态
  const agentCounts = { active: 0, running: 0, paused: 0, error: 0, idle: 0 };
  for (const row of agentStats) {
    const s = row.status as keyof typeof agentCounts;
    if (s in agentCounts) agentCounts[s] = Number(row.count);
  }

  // 汇总任务状态
  const issueCounts = { open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const row of issueStats) {
    if (row.status === "backlog" || row.status === "todo") issueCounts.open += Number(row.count);
    else if (row.status === "in_progress" || row.status === "in_review") issueCounts.inProgress += Number(row.count);
    else if (row.status === "blocked") issueCounts.blocked += Number(row.count);
    else if (row.status === "done") issueCounts.done += Number(row.count);
  }

  // 预算汇总
  const monthToDateSpendCents = Number(budgetStats[0]?.totalSpent) || 0;
  const [totalBudgetRow] = await db
    .select({ total: sql<number>`SUM(budgetMonthlyCents)` })
    .from(agents)
    .where(eq(agents.companyId, companyId));
  const totalBudgetCents = Number(totalBudgetRow?.total) || 0;

  // 获取 Agent 名称
  const agentIds = topCostRows.map(r => r.agentId);
  const agentNames = agentIds.length > 0
    ? await db.select({ id: agents.id, name: agents.name }).from(agents).where(sql`${agents.id} IN ${agentIds}`)
    : [];
  const agentNameMap = new Map(agentNames.map(a => [a.id, a.name]));

  return {
    agentCounts,
    issueCounts,
    budget: {
      monthToDateSpendCents,
      totalBudgetCents,
      utilizationPercent: totalBudgetCents > 0
        ? Math.round((monthToDateSpendCents / totalBudgetCents) * 10000) / 100
        : 0,
    },
    pendingApprovals: Number(pendingApprovalsCount[0]?.count) || 0,
    recentActivity: recentActivityRows.map(r => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details as Record<string, unknown> | null,
      createdAt: r.createdAt,
    })),
    topAgentsByCost: topCostRows.map(r => ({
      agentId: r.agentId,
      agentName: agentNameMap.get(r.agentId) ?? `Agent #${r.agentId}`,
      totalCostCents: Number(r.totalCostCents),
    })),
  };
}

export const dashboardService = {
  getDashboardSummary,
};

/**
 * Paperclip Budget Policy Engine
 * 高级预算策略引擎 - 支持多级预算、时间窗口、自动暂停等
 */

import { getDb } from "../db";
import { agents, costEvents, activityLog } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { AUDIT_ACTIONS, ACTOR_TYPES } from "../../shared";

export interface BudgetPolicy {
  id?: number;
  companyId: number;
  scope: "agent" | "project" | "company";
  scopeId?: number; // agentId or projectId
  limitCents: number;
  windowType: "daily" | "weekly" | "monthly";
  softLimitPercent: number; // 软警告阈值 (e.g., 80)
  hardLimitPercent: number; // 硬限制阈值 (e.g., 100)
  autoAction: "none" | "pause_agent" | "notify_only";
  enabled: boolean;
}

export interface BudgetIncident {
  policyId: number;
  companyId: number;
  scopeType: string;
  scopeId: number;
  incidentType: "soft_limit" | "hard_limit";
  spentCents: number;
  limitCents: number;
  utilizationPercent: number;
  actionTaken?: string;
  resolvedAt?: Date;
  createdAt: Date;
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

/**
 * 检查预算策略并执行相应动作
 */
export async function checkBudgetPolicy(
  companyId: number,
  agentId: number,
  newSpentCents: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 获取 Agent 的预算配置
  const [agent] = await db
    .select({
      id: agents.id,
      budgetMonthlyCents: agents.budgetMonthlyCents,
      spentMonthlyCents: agents.spentMonthlyCents,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent || agent.budgetMonthlyCents <= 0) return;

  const totalSpent = agent.spentMonthlyCents + newSpentCents;
  const utilizationPercent = (totalSpent / agent.budgetMonthlyCents) * 100;

  // 软警告 (80%)
  if (utilizationPercent >= 80 && utilizationPercent < 100) {
    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.SYSTEM,
      actorId: "budget_policy_engine",
      action: "budget.soft_limit_reached",
      entityType: "agent",
      entityId: agentId.toString(),
      details: {
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        budgetMonthlyCents: agent.budgetMonthlyCents,
        spentCents: totalSpent,
        level: "soft_alert",
      },
    });

    console.warn(
      `[budget-policy] Agent ${agentId} reached soft limit: ${utilizationPercent.toFixed(1)}%`
    );
  }

  // 硬限制 (100%) - 自动暂停
  if (utilizationPercent >= 100) {
    await db
      .update(agents)
      .set({ status: "paused" })
      .where(eq(agents.id, agentId));

    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.SYSTEM,
      actorId: "budget_policy_engine",
      action: AUDIT_ACTIONS.AGENT_PAUSED,
      entityType: "agent",
      entityId: agentId.toString(),
      details: {
        reason: "budget_hard_limit_reached",
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        budgetMonthlyCents: agent.budgetMonthlyCents,
        spentCents: totalSpent,
        autoAction: "pause_agent",
      },
    });

    console.error(
      `[budget-policy] Agent ${agentId} paused due to hard limit: ${utilizationPercent.toFixed(1)}%`
    );
  }
}

/**
 * 获取公司级别的预算利用率
 */
export async function getCompanyBudgetUtilization(companyId: number): Promise<{
  totalBudgetCents: number;
  totalSpentCents: number;
  utilizationPercent: number;
  agentsOverBudget: number;
  agentsNearLimit: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 获取所有活跃 Agent
  const agentsList = await db
    .select({
      id: agents.id,
      budgetMonthlyCents: agents.budgetMonthlyCents,
      spentMonthlyCents: agents.spentMonthlyCents,
    })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.status, "active")));

  const totalBudgetCents = agentsList.reduce(
    (sum, a) => sum + (a.budgetMonthlyCents || 0),
    0
  );

  let totalSpentCents = 0;
  let agentsOverBudget = 0;
  let agentsNearLimit = 0;

  for (const agent of agentsList) {
    const [spendResult] = await db
      .select({ total: sql<number>`SUM(costCents)` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.companyId, companyId),
          eq(costEvents.agentId, agent.id),
          sql`${costEvents.occurredAt} >= ${monthStart}`
        )
      );

    const spent = Number(spendResult?.total) || 0;
    totalSpentCents += spent;

    if (agent.budgetMonthlyCents > 0) {
      const util = (spent / agent.budgetMonthlyCents) * 100;
      if (util >= 100) agentsOverBudget++;
      else if (util >= 80) agentsNearLimit++;
    }
  }

  return {
    totalBudgetCents,
    totalSpentCents,
    utilizationPercent:
      totalBudgetCents > 0
        ? Math.round((totalSpentCents / totalBudgetCents) * 10000) / 100
        : 0,
    agentsOverBudget,
    agentsNearLimit,
  };
}

/**
 * 重置月度预算（每月1号调用）
 */
export async function resetMonthlyBudgets(companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(agents)
    .set({ spentMonthlyCents: 0 })
    .where(eq(agents.companyId, companyId));

  await logActivity({
    companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "budget_policy_engine",
    action: "budget.monthly_reset",
    entityType: "company",
    entityId: companyId.toString(),
    details: { resetDate: new Date().toISOString() },
  });

  console.log(`[budget-policy] Monthly budgets reset for company ${companyId}`);
}

export const budgetPolicyEngine = {
  checkBudgetPolicy,
  getCompanyBudgetUtilization,
  resetMonthlyBudgets,
};

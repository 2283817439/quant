/**
 * Paperclip AI Agent 编排系统 - Zod 验证器
 * 
 * 用于 API 输入验证、表单验证、数据类型守卫
 * 基于 Paperclip V1 Implementation Spec
 */

import { z } from "zod";

// ============================================================================
// 基础枚举验证器
// ============================================================================

export const agentStatusSchema = z.enum([
  "active",
  "paused",
  "idle",
  "running",
  "error",
  "terminated",
]);

export const agentAdapterTypeSchema = z.enum(["process", "http"]);

export const agentContextModeSchema = z.enum(["thin", "fat"]);

export const issueStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
]);

export const issuePrioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

export const goalLevelSchema = z.enum(["company", "team", "agent", "task"]);

export const goalStatusSchema = z.enum([
  "planned",
  "active",
  "achieved",
  "cancelled",
]);

export const heartbeatInvocationSourceSchema = z.enum([
  "scheduler",
  "manual",
  "callback",
]);

export const heartbeatStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

export const approvalTypeSchema = z.enum([
  "hire_agent",
  "approve_ceo_strategy",
]);

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const actorTypeSchema = z.enum(["agent", "user", "system"]);

export const companyStatusSchema = z.enum([
  "active",
  "paused",
  "archived",
]);

export const companyRoleSchema = z.enum(["owner", "admin", "member"]);

// ============================================================================
// Agent 相关验证器
// ============================================================================

/**
 * Process Adapter 配置验证器
 */
export const processAdapterConfigSchema = z.object({
  command: z.string().min(1, "Command is required"),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutSec: z.number().int().positive().default(900).optional(),
  graceSec: z.number().int().positive().default(15).optional(),
});

/**
 * HTTP Adapter 配置验证器
 */
export const httpAdapterConfigSchema = z.object({
  url: z.string().url("Invalid URL"),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("POST").optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().default(15000).optional(),
  payloadTemplate: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Agent 适配器配置联合验证器
 */
export const adapterConfigSchema = z.union([
  z.object({
    adapterType: z.literal("process"),
    config: processAdapterConfigSchema,
  }),
  z.object({
    adapterType: z.literal("http"),
    config: httpAdapterConfigSchema,
  }),
]);

/**
 * 创建 Agent 验证器
 */
export const createAgentSchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: z.record(z.string(), z.unknown()),
  contextMode: agentContextModeSchema.default("thin"),
  budgetMonthlyCents: z.number().int().nonnegative().default(0),
  reportsTo: z.number().int().positive().optional(),
  capabilities: z.string().optional(),
});

/**
 * 更新 Agent 验证器
 */
export const updateAgentSchema = z.object({
  agentId: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  role: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  status: agentStatusSchema.optional(),
  adapterConfig: z.record(z.string(), z.unknown()).optional(),
  budgetMonthlyCents: z.number().int().nonnegative().optional(),
  contextMode: agentContextModeSchema.optional(),
  capabilities: z.string().optional(),
  reportsTo: z.number().int().positive().optional(),
});

/**
 * Agent 状态转换验证器
 */
export const agentTransitionSchema = z.object({
  agentId: z.number().int().positive(),
  newStatus: agentStatusSchema,
  reason: z.string().optional(),
});

// ============================================================================
// 任务 (Issue) 相关验证器
// ============================================================================

/**
 * 创建任务验证器
 */
export const createIssueSchema = z.object({
  companyId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  goalId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: issuePrioritySchema.default("medium"),
  assigneeAgentId: z.number().int().positive().optional(),
  billingCode: z.string().max(255).optional(),
});

/**
 * 更新任务验证器
 */
export const updateIssueSchema = z.object({
  issueId: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  assigneeAgentId: z.number().int().positive().optional(),
  billingCode: z.string().max(255).optional(),
});

/**
 * 任务检出请求验证器 (原子操作)
 */
export const checkoutTaskSchema = z.object({
  issueId: z.number().int().positive(),
  agentId: z.number().int().positive(),
  expectedStatuses: z.array(issueStatusSchema).default([
    "backlog",
    "todo",
    "blocked",
  ]),
});

/**
 * 任务评论验证器
 */
export const createCommentSchema = z.object({
  issueId: z.number().int().positive(),
  body: z.string().min(1),
  authorAgentId: z.number().int().positive().optional(),
  authorUserId: z.number().int().positive().optional(),
});

// ============================================================================
// 目标 (Goal) 相关验证器
// ============================================================================

/**
 * 创建目标验证器
 */
export const createGoalSchema = z.object({
  companyId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  level: goalLevelSchema,
  parentId: z.number().int().positive().optional(),
  ownerAgentId: z.number().int().positive().optional(),
  status: goalStatusSchema.default("planned"),
});

/**
 * 更新目标验证器
 */
export const updateGoalSchema = z.object({
  goalId: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  level: goalLevelSchema.optional(),
  parentId: z.number().int().positive().optional(),
  ownerAgentId: z.number().int().positive().optional(),
  status: goalStatusSchema.optional(),
});

// ============================================================================
// 心跳调度相关验证器
// ============================================================================

/**
 * 心跳调度配置验证器
 */
export const heartbeatScheduleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  intervalSec: z.number().int().min(30).default(60),
  maxConcurrentRuns: z.literal(1).default(1), // V1 固定为 1
});

/**
 * 手动触发心跳验证器
 */
export const manualHeartbeatSchema = z.object({
  agentId: z.number().int().positive(),
  reason: z.string().optional(),
});

/**
 * 心跳运行报告验证器
 */
export const reportHeartbeatResultSchema = z.object({
  runId: z.number().int().positive(),
  status: heartbeatStatusSchema,
  error: z.string().optional(),
  externalRunId: z.string().optional(),
  contextSnapshot: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// 成本与预算相关验证器
// ============================================================================

/**
 * 成本事件报告验证器
 */
export const reportCostEventSchema = z.object({
  agentId: z.number().int().positive(),
  issueId: z.number().int().positive().optional(),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  costCents: z.number().int().nonnegative(),
  occurredAt: z.string().datetime().optional(),
});

/**
 * 预算设置验证器
 */
export const setBudgetSchema = z.object({
  entityId: z.number().int().positive(),
  entityType: z.enum(["agent", "project", "company"]),
  monthlyBudgetCents: z.number().int().nonnegative(),
});

// ============================================================================
// 审批相关验证器
// ============================================================================

/**
 * 雇佣 Agent 审批负载验证器
 */
export const hireAgentPayloadSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: z.record(z.string(), z.unknown()),
  budgetMonthlyCents: z.number().int().nonnegative().optional(),
});

/**
 * CEO 策略审批负载验证器
 */
export const ceoStrategyPayloadSchema = z.object({
  planTitle: z.string().min(1).max(255),
  planDescription: z.string(),
  initialOrgStructure: z
    .object({
      agents: z.array(
        z.object({
          name: z.string().min(1),
          role: z.string().min(1),
        })
      ),
    })
    .optional(),
  highLevelGoals: z.array(z.string()).optional(),
});

/**
 * 创建审批请求验证器
 */
export const createApprovalSchema = z.object({
  companyId: z.number().int().positive(),
  type: approvalTypeSchema,
  requestedByAgentId: z.number().int().positive().optional(),
  requestedByUserId: z.number().int().positive().optional(),
  payload: z.union([
    hireAgentPayloadSchema,
    ceoStrategyPayloadSchema,
    z.record(z.string(), z.unknown()),
  ]),
});

/**
 * 审批决策验证器
 */
export const decideApprovalSchema = z.object({
  approvalId: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  decisionNote: z.string().optional(),
});

// ============================================================================
// 公司与成员相关验证器
// ============================================================================

/**
 * 创建公司验证器
 */
export const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: companyStatusSchema.default("active"),
});

/**
 * 公司成员验证器
 */
export const companyMembershipSchema = z.object({
  companyId: z.number().int().positive(),
  userId: z.number().int().positive(),
  role: companyRoleSchema.default("member"),
});

// ============================================================================
// API Key 相关验证器
// ============================================================================

/**
 * 创建 API Key 验证器
 */
export const createApiKeySchema = z.object({
  agentId: z.number().int().positive(),
  name: z.string().min(1).max(255),
});

/**
 * API Key 响应验证器 (包含明文)
 */
export const apiKeyResponseSchema = z.object({
  id: z.number().int().positive(),
  agentId: z.number().int().positive(),
  name: z.string(),
  plaintextKey: z.string(),
  createdAt: z.string().datetime(),
});

// ============================================================================
// 审计日志相关验证器
// ============================================================================

/**
 * 活动日志条目验证器
 */
export const activityLogEntrySchema = z.object({
  companyId: z.number().int().positive(),
  actorType: actorTypeSchema,
  actorId: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// 分页与查询参数验证器
// ============================================================================

/**
 * 分页参数验证器
 */
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * 通用查询参数验证器
 */
export const queryFiltersSchema = z.object({
  companyId: z.number().int().positive(),
  status: z.string().optional(),
  assigneeAgentId: z.number().int().positive().optional(),
  priority: z.string().optional(),
  search: z.string().optional(),
}).partial();

// ============================================================================
// 导出类型推断
// ============================================================================

// 从验证器推断 TypeScript 类型
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type IssueStatus = z.infer<typeof issueStatusSchema>;
export type GoalLevel = z.infer<typeof goalLevelSchema>;
export type ApprovalType = z.infer<typeof approvalTypeSchema>;

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type CheckoutTaskInput = z.infer<typeof checkoutTaskSchema>;
export type ReportCostEventInput = z.infer<typeof reportCostEventSchema>;
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证并解析数据
 * @param schema Zod schema
 * @param data 待验证数据
 * @returns 验证成功返回数据，失败抛出错误
 */
export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

/**
 * 安全验证 (不抛异常)
 * @param schema Zod schema
 * @param data 待验证数据
 * @returns { success: boolean, data?, error? }
 */
export function safeValidate<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * 状态转换守卫
 * 验证状态转换是否合法
 */
export const validIssueTransitions: Record<IssueStatus, IssueStatus[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["in_review", "blocked", "done", "cancelled"],
  in_review: ["in_progress", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  done: [], // terminal state
  cancelled: [], // terminal state
};

export const validAgentTransitions: Record<AgentStatus, AgentStatus[]> = {
  idle: ["running", "paused", "terminated"],
  running: ["idle", "error", "paused", "terminated"],
  paused: ["idle", "terminated"],
  error: ["idle", "terminated"],
  active: ["paused", "terminated"],
  terminated: [], // terminal state
};

/**
 * 验证状态转换是否合法
 */
export function isValidTransition<T extends string>(
  transitions: Record<T, T[]>,
  from: T,
  to: T
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

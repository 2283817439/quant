/**
 * Paperclip AI Agent 编排系统 - 数据库 Schema (MySQL)
 */

import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ============================================================================
// 1. 公司与组织管理
// ============================================================================

export const companies = mysqlTable("pc_companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ============================================================================
// 2. Agent 管理系统
// ============================================================================

export const agents = mysqlTable("pc_agents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }),
  status: mysqlEnum("status", ["active", "paused", "idle", "running", "error", "terminated"])
    .default("idle")
    .notNull(),
  adapterType: mysqlEnum("adapterType", ["process", "http"]).notNull(),
  adapterConfig: json("adapterConfig"),
  contextMode: mysqlEnum("contextMode", ["thin", "fat"]).default("thin").notNull(),
  budgetMonthlyCents: int("budgetMonthlyCents").default(0).notNull(),
  spentMonthlyCents: int("spentMonthlyCents").default(0).notNull(),
  reportsTo: int("reportsTo"),
  capabilities: text("capabilities"),
  lastHeartbeatAt: timestamp("lastHeartbeatAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

export const agentApiKeys = mysqlTable("pc_agent_api_keys", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  keyHash: varchar("keyHash", { length: 512 }).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const agentConfigRevisions = mysqlTable("pc_agent_config_revisions", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  revisionNumber: int("revisionNumber").notNull(),
  adapterConfig: json("adapterConfig").notNull(),
  changeNote: text("changeNote"),
  changedByUserId: int("changedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const agentRuntimeState = mysqlTable("pc_agent_runtime_state", {
  agentId: int("agentId").primaryKey(),
  taskId: int("taskId"),
  contextSnapshot: json("contextSnapshot"),
  lastCheckpointAt: timestamp("lastCheckpointAt").defaultNow().notNull(),
});

// ============================================================================
// 3. 目标与项目管理
// ============================================================================

export const goals = mysqlTable("pc_goals", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  parentId: int("parentId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  level: mysqlEnum("level", ["company", "team", "agent", "task"]).default("company").notNull(),
  ownerAgentId: int("ownerAgentId"),
  status: mysqlEnum("status", ["planned", "active", "achieved", "cancelled"])
    .default("planned")
    .notNull(),
  priority: varchar("priority", { length: 16 }).default("medium").notNull(),
  targetDate: timestamp("targetDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = typeof goals.$inferInsert;

export const projects = mysqlTable("pc_projects", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  goalId: int("goalId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ============================================================================
// 4. 任务/工单系统
// ============================================================================

export const issues = mysqlTable("pc_issues", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  projectId: int("projectId"),
  goalId: int("goalId"),
  parentId: int("parentId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"])
    .default("backlog")
    .notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  assigneeAgentId: int("assigneeAgentId"),
  lockedByAgentId: int("lockedByAgentId"),
  lockedAt: timestamp("lockedAt"),
  billingCode: varchar("billingCode", { length: 128 }),
  createdByUserId: int("createdByUserId"),
  createdByAgentId: int("createdByAgentId"),
  requestDepth: int("requestDepth").default(0).notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = typeof issues.$inferInsert;

export const issueComments = mysqlTable("pc_issue_comments", {
  id: int("id").autoincrement().primaryKey(),
  issueId: int("issueId").notNull(),
  companyId: int("companyId").notNull(),
  body: text("body").notNull(),
  authorUserId: int("authorUserId"),
  authorAgentId: int("authorAgentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 5. 心跳与调度系统
// ============================================================================

export const heartbeatRuns = mysqlTable("pc_heartbeat_runs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  agentId: int("agentId").notNull(),
  invocationSource: mysqlEnum("invocationSource", ["scheduler", "manual", "callback"])
    .default("scheduler")
    .notNull(),
  status: mysqlEnum("status", ["queued", "running", "succeeded", "failed", "cancelled", "timed_out"])
    .default("queued")
    .notNull(),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  errorMessage: text("errorMessage"),
  externalRunId: varchar("externalRunId", { length: 128 }),
  contextSnapshot: json("contextSnapshot"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HeartbeatRun = typeof heartbeatRuns.$inferSelect;
export type InsertHeartbeatRun = typeof heartbeatRuns.$inferInsert;

export const heartbeatRunEvents = mysqlTable("pc_heartbeat_run_events", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  eventData: json("eventData"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export const agentWakeupRequests = mysqlTable("pc_agent_wakeup_requests", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  companyId: int("companyId").notNull(),
  reason: text("reason").notNull(),
  triggeredByUserId: int("triggeredByUserId"),
  triggeredByAgentId: int("triggeredByAgentId"),
  processed: int("processed").default(0).notNull(), // MySQL boolean as int
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================================================
// 6. 成本与预算管理
// ============================================================================

export const costEvents = mysqlTable("pc_cost_events", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  agentId: int("agentId").notNull(),
  issueId: int("issueId"),
  projectId: int("projectId"),
  goalId: int("goalId"),
  billingCode: varchar("billingCode", { length: 128 }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: int("inputTokens").default(0).notNull(),
  outputTokens: int("outputTokens").default(0).notNull(),
  costCents: int("costCents").default(0).notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CostEvent = typeof costEvents.$inferSelect;
export type InsertCostEvent = typeof costEvents.$inferInsert;

// ============================================================================
// 7. 审批流程
// ============================================================================

export const approvals = mysqlTable("pc_approvals", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  type: mysqlEnum("type", ["hire_agent", "approve_ceo_strategy"]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"])
    .default("pending")
    .notNull(),
  requestedByAgentId: int("requestedByAgentId"),
  requestedByUserId: int("requestedByUserId"),
  decidedByUserId: int("decidedByUserId"),
  payload: json("payload"),
  decision: text("decision"),
  decisionNote: text("decisionNote"),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = typeof approvals.$inferInsert;

export const approvalComments = mysqlTable("pc_approval_comments", {
  id: int("id").autoincrement().primaryKey(),
  approvalId: int("approvalId").notNull(),
  companyId: int("companyId").notNull(),
  body: text("body").notNull(),
  authorUserId: int("authorUserId"),
  authorAgentId: int("authorAgentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================================================
// 8. 审计日志
// ============================================================================

export const activityLog = mysqlTable("pc_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  actorType: varchar("actorType", { length: 32 }).notNull(),
  actorId: varchar("actorId", { length: 128 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityId: varchar("entityId", { length: 128 }),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = typeof activityLog.$inferInsert;
export type ActivityLogEntry = ActivityLog;
export type InsertActivityLogEntry = InsertActivityLog;

// ============================================================================
// 9. 公司密钥管理
// ============================================================================

export const agentSchedules = mysqlTable("pc_agent_schedules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  agentId: int("agentId").notNull(),
  cronExpression: varchar("cronExpression", { length: 128 }).notNull(),
  enabled: int("enabled").default(1).notNull(), // MySQL boolean as int
  lastRun: timestamp("lastRun"),
  nextRun: timestamp("nextRun"),
  maxRetries: int("maxRetries").default(0).notNull(),
  retryDelaySeconds: int("retryDelaySeconds").default(60).notNull(),
  timeoutSeconds: int("timeoutSeconds").default(300).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type InsertAgentSchedule = typeof agentSchedules.$inferInsert;

export const companySecrets = mysqlTable("pc_company_secrets", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  encryptedValue: text("encryptedValue").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanySecret = typeof companySecrets.$inferSelect;
export type InsertCompanySecret = typeof companySecrets.$inferInsert;

// ============================================================================
// 10. Skill Library (技能库)
// ============================================================================

export const skills = mysqlTable("pc_skills", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  code: text("code").notNull(),
  parameters: json("parameters"),
  version: varchar("version", { length: 32 }).default("1.0.0").notNull(),
  isPublic: int("isPublic").default(0).notNull(),
  usageCount: int("usageCount").default(0).notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;

export const agentSkills = mysqlTable("pc_agent_skills", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  skillId: int("skillId").notNull(),
  enabled: int("enabled").default(1).notNull(),
  config: json("config"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentSkill = typeof agentSkills.$inferSelect;
export type InsertAgentSkill = typeof agentSkills.$inferInsert;

// ============================================================================
// 11. Runner Management (运行器管理)
// ============================================================================

export const runners = mysqlTable("pc_runners", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["local", "docker", "kubernetes", "lambda"]).notNull(),
  status: mysqlEnum("status", ["online", "offline", "busy", "error"]).default("offline").notNull(),
  config: json("config"),
  capacity: int("capacity").default(1).notNull(),
  currentLoad: int("currentLoad").default(0).notNull(),
  lastHeartbeat: timestamp("lastHeartbeat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Runner = typeof runners.$inferSelect;
export type InsertRunner = typeof runners.$inferInsert;

// ============================================================================
// 12. Schedule Execution Logs (调度执行日志)
// ============================================================================

export const scheduleExecutionLogs = mysqlTable("pc_schedule_execution_logs", {
  id: int("id").autoincrement().primaryKey(),
  scheduleId: int("scheduleId").notNull(),
  agentId: int("agentId").notNull(),
  runnerId: int("runnerId"),
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "timeout"]).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
  duration: int("duration"),
  output: text("output"),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduleExecutionLog = typeof scheduleExecutionLogs.$inferSelect;
export type InsertScheduleExecutionLog = typeof scheduleExecutionLogs.$inferInsert;



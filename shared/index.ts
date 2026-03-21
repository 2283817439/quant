/**
 * Paperclip AI Agent 编排系统 - Shared Module Exports
 * 
 * 统一导出所有共享类型、验证器、常量
 */

// ============================================================================
// 类型导出
// ============================================================================

export type {
  // Agent 类型
  Agent,
  InsertAgent,
  AgentStatus,
  AgentAdapterType,
  AgentContextMode,
  
  // 任务类型
  Issue,
  InsertIssue,
  IssueStatus,
  IssuePriority,
  IssueComment,
  
  // 目标类型
  Goal,
  InsertGoal,
  GoalLevel,
  GoalStatus,
  
  // 心跳类型
  HeartbeatRun,
  HeartbeatStatus,
  HeartbeatInvocationSource,
  HeartbeatScheduleConfig,
  
  // 成本类型
  CostEvent,
  BudgetStatus,
  
  // 审批类型
  Approval,
  ApprovalType,
  ApprovalStatus,
  HireAgentPayload,
  CeoStrategyPayload,
  
  // 审计类型
  ActivityLogEntry,
  ActorType,
  
  // 公司类型
  Company,
  CompanyStatus,
  CompanyRole,
  
  // API 类型
  ApiResponse,
  PaginationParams,
  
  // Dashboard 类型
  DashboardSummary,
} from "../client/src/lib/paperclip-types";

// ============================================================================
// 验证器导出
// ============================================================================

export {
  // 枚举验证器
  agentStatusSchema,
  agentAdapterTypeSchema,
  agentContextModeSchema,
  issueStatusSchema,
  issuePrioritySchema,
  goalLevelSchema,
  goalStatusSchema,
  heartbeatInvocationSourceSchema,
  heartbeatStatusSchema,
  approvalTypeSchema,
  approvalStatusSchema,
  actorTypeSchema,
  companyStatusSchema,
  companyRoleSchema,
  
  // Agent 验证器
  processAdapterConfigSchema,
  httpAdapterConfigSchema,
  adapterConfigSchema,
  createAgentSchema,
  updateAgentSchema,
  agentTransitionSchema,
  
  // 任务验证器
  createIssueSchema,
  updateIssueSchema,
  checkoutTaskSchema,
  createCommentSchema,
  
  // 目标验证器
  createGoalSchema,
  updateGoalSchema,
  
  // 心跳验证器
  heartbeatScheduleConfigSchema,
  manualHeartbeatSchema,
  reportHeartbeatResultSchema,
  
  // 成本验证器
  reportCostEventSchema,
  setBudgetSchema,
  
  // 审批验证器
  hireAgentPayloadSchema,
  ceoStrategyPayloadSchema,
  createApprovalSchema,
  decideApprovalSchema,
  
  // 其他验证器
  createCompanySchema,
  companyMembershipSchema,
  createApiKeySchema,
  apiKeyResponseSchema,
  activityLogEntrySchema,
  paginationSchema,
  queryFiltersSchema,
  
  // 辅助函数
  validate,
  safeValidate,
  isValidTransition,
  validIssueTransitions,
  validAgentTransitions,
} from "./validators/paperclip-validators";

// ============================================================================
// 常量导出
// ============================================================================

export {
  // 配置常量
  HEARTBEAT_CONFIG,
  BUDGET_THRESHOLDS,
  COST_CONFIG,
  
  // 状态机常量
  ISSUE_TERMINAL_STATES,
  ISSUE_INITIAL_STATE,
  ISSUE_ACTIVE_STATES,
  ISSUE_BLOCKED_STATE,
  AGENT_TERMINAL_STATES,
  AGENT_ACTIVE_STATES,
  AGENT_IDLE_STATES,
  AGENT_ERROR_STATE,
  APPROVAL_TERMINAL_STATES,
  
  // 动作常量
  AUDIT_ACTIONS,
  ACTOR_TYPES,
  ADAPTER_TYPES,
  CONTEXT_MODES,
  
  // 业务常量
  PRIORITIES,
  PRIORITY_VALUES,
  COMPANY_ROLES,
  STORAGE_PROVIDERS,
  API_PATHS,
  ERROR_CODES,
  MESSAGES,
  TIME_CONSTANTS,
  TABLE_NAMES,
  
  // 聚合导出
  paperclipConstants,
} from "./paperclip-constants";

// ============================================================================
// 类型重新导出 (从验证器推断)
// ============================================================================

export type {
  CreateAgentInput,
  CreateIssueInput,
  CheckoutTaskInput,
  ReportCostEventInput,
  CreateApprovalInput,
  DecideApprovalInput,
} from "./validators/paperclip-validators";

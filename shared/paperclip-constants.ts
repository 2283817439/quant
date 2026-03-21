/**
 * Paperclip AI Agent 编排系统 - 共享常量
 * 
 * 定义全局常量、配置默认值、魔法数字等
 */

// ============================================================================
// 调度与心跳常量
// ============================================================================

/**
 * 心跳调度配置
 */
export const HEARTBEAT_CONFIG = {
  /** 最小间隔时间 (秒) */
  MIN_INTERVAL_SEC: 30,
  
  /** 默认间隔时间 (秒) */
  DEFAULT_INTERVAL_SEC: 60,
  
  /** 最大并发运行数 (V1 固定为 1) */
  MAX_CONCURRENT_RUNS: 1 as const,
  
  /** 超时时间 (秒) */
  TIMEOUT_SEC: 900, // 15 分钟
  
  /** 优雅终止宽限期 (秒) */
  GRACE_PERIOD_SEC: 15,
} as const;

/**
 * 唤醒请求处理超时 (毫秒)
 */
export const WAKEUP_TIMEOUT_MS = 30000; // 30 秒

// ============================================================================
// 预算与成本常量
// ============================================================================

/**
 * 预算阈值百分比
 */
export const BUDGET_THRESHOLDS = {
  /** 软警告阈值 (80%) */
  SOFT_ALERT_PERCENT: 80,
  
  /** 硬限制阈值 (100%) */
  HARD_LIMIT_PERCENT: 100,
} as const;

/**
 * 成本计算常量
 */
export const COST_CONFIG = {
  /** 货币单位转换 (分 -> 元) */
  CENTS_TO_YUAN: 0.01,
  
  /** 预算周期类型 */
  BUDGET_PERIOD: "monthly" as const,
} as const;

// ============================================================================
// 任务状态机常量
// ============================================================================

/**
 * 任务终端状态 (不可再转换)
 */
export const ISSUE_TERMINAL_STATES = ["done", "cancelled"] as const;

/**
 * 任务初始状态
 */
export const ISSUE_INITIAL_STATE = "backlog" as const;

/**
 * 任务进行中状态
 */
export const ISSUE_ACTIVE_STATES = ["in_progress", "in_review"] as const;

/**
 * 任务阻塞状态
 */
export const ISSUE_BLOCKED_STATE = "blocked" as const;

// ============================================================================
// Agent 状态机常量
// ============================================================================

/**
 * Agent 终端状态
 */
export const AGENT_TERMINAL_STATES = ["terminated"] as const;

/**
 * Agent 活跃状态
 */
export const AGENT_ACTIVE_STATES = ["running", "active"] as const;

/**
 * Agent 空闲状态
 */
export const AGENT_IDLE_STATES = ["idle", "paused"] as const;

/**
 * Agent 错误状态
 */
export const AGENT_ERROR_STATE = "error" as const;

// ============================================================================
// 审批类型常量
// ============================================================================

/**
 * 审批类型
 */
export const APPROVAL_TYPES = {
  /** 雇佣 Agent */
  HIRE_AGENT: "hire_agent" as const,
  
  /** 批准 CEO 策略 */
  APPROVE_CEO_STRATEGY: "approve_ceo_strategy" as const,
} as const;

/**
 * 审批终端状态
 */
export const APPROVAL_TERMINAL_STATES = ["approved", "rejected", "cancelled"] as const;

// ============================================================================
// 审计动作常量
// ============================================================================

export const AUDIT_ACTIONS = {
  // Agent 相关
  AGENT_CREATED: "agent.created",
  AGENT_UPDATED: "agent.updated",
  AGENT_PAUSED: "agent.paused",
  AGENT_RESUMED: "agent.resumed",
  AGENT_TERMINATED: "agent.terminated",
  AGENT_HEARTBEAT_STARTED: "agent.heartbeat_started",
  AGENT_HEARTBEAT_COMPLETED: "agent.heartbeat_completed",
  AGENT_API_KEY_CREATED: "agent.api_key_created",
  AGENT_API_KEY_REVOKED: "agent.api_key_revoked",
  
  // 任务相关
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_CHECKOUT: "task.checkout",
  TASK_RELEASED: "task.released",
  TASK_COMPLETED: "task.completed",
  TASK_CANCELLED: "task.cancelled",
  TASK_COMMENT_ADDED: "task.comment_added",
  TASK_ATTACHMENT_ADDED: "task.attachment_added",
  
  // 目标相关
  GOAL_CREATED: "goal.created",
  GOAL_UPDATED: "goal.updated",
  GOAL_ACHIEVED: "goal.achieved",
  GOAL_CANCELLED: "goal.cancelled",
  
  // 成本相关
  COST_REPORTED: "cost.reported",
  BUDGET_EXCEEDED: "budget.exceeded",
  BUDGET_UPDATED: "budget.updated",
  
  // 审批相关
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_APPROVED: "approval.approved",
  APPROVAL_REJECTED: "approval.rejected",
  APPROVAL_COMMENTED: "approval.commented",
  APPROVAL_CANCELLED: "approval.cancelled",
  
  // 治理相关
  AGENT_HIRED: "agent.hired",
  STRATEGY_APPROVED: "strategy.approved",
  COMPANY_CREATED: "company.created",
  MEMBER_ADDED: "member.added",
  MEMBER_REMOVED: "member.removed",
} as const;

// ============================================================================
// 执行者类型常量
// ============================================================================

export const ACTOR_TYPES = {
  /** Agent 执行者 */
  AGENT: "agent" as const,
  
  /** 用户执行者 */
  USER: "user" as const,
  
  /** 系统执行者 */
  SYSTEM: "system" as const,
} as const;

// ============================================================================
// 适配器类型常量
// ============================================================================

export const ADAPTER_TYPES = {
  /** 进程适配器 (本地执行) */
  PROCESS: "process" as const,
  
  /** HTTP 适配器 (远程调用) */
  HTTP: "http" as const,
} as const;

// ============================================================================
// 上下文模式常量
// ============================================================================

export const CONTEXT_MODES = {
  /** 精简模式 (仅发送 ID 和指针) */
  THIN: "thin" as const,
  
  /** 完整模式 (包含完整上下文) */
  FAT: "fat" as const,
} as const;

// ============================================================================
// 优先级常量
// ============================================================================

export const PRIORITIES = {
  CRITICAL: "critical" as const,
  HIGH: "high" as const,
  MEDIUM: "medium" as const,
  LOW: "low" as const,
} as const;

/**
 * 优先级数值映射 (用于排序)
 */
export const PRIORITY_VALUES: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ============================================================================
// 公司角色常量
// ============================================================================

export const COMPANY_ROLES = {
  /** 所有者 (完全控制) */
  OWNER: "owner" as const,
  
  /** 管理员 (管理权限) */
  ADMIN: "admin" as const,
  
  /** 普通成员 (基本权限) */
  MEMBER: "member" as const,
} as const;

// ============================================================================
// 存储提供商常量
// ============================================================================

export const STORAGE_PROVIDERS = {
  /** 本地磁盘存储 */
  LOCAL_DISK: "local_disk" as const,
  
  /** S3 兼容对象存储 */
  S3: "s3" as const,
} as const;

// ============================================================================
// API 路径常量
// ============================================================================

export const API_PATHS = {
  /** tRPC 基础路径 */
  TRPC_BASE: "/api/trpc",
  
  /** Paperclip 路由前缀 */
  PAPERCLIP_PREFIX: "/paperclip",
  
  /** 健康检查 */
  HEALTH: "/api/health",
} as const;

// ============================================================================
// 错误代码常量
// ============================================================================

export const ERROR_CODES = {
  // 通用错误
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  
  // 状态冲突
  CONFLICT: "CONFLICT",
  INVALID_STATE: "INVALID_STATE",
  
  // Agent 相关
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  AGENT_PAUSED: "AGENT_PAUSED",
  AGENT_TERMINATED: "AGENT_TERMINATED",
  AGENT_BUDGET_EXCEEDED: "AGENT_BUDGET_EXCEEDED",
  
  // 任务相关
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_ALREADY_CHECKED_OUT: "TASK_ALREADY_CHECKED_OUT",
  TASK_INVALID_TRANSITION: "TASK_INVALID_TRANSITION",
  
  // 审批相关
  APPROVAL_NOT_FOUND: "APPROVAL_NOT_FOUND",
  APPROVAL_ALREADY_DECIDED: "APPROVAL_ALREADY_DECIDED",
  
  // 预算相关
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  BUDGET_NOT_SET: "BUDGET_NOT_SET",
} as const;

// ============================================================================
// 消息常量
// ============================================================================

export const MESSAGES = {
  // 成功消息
  TASK_CHECKOUT_SUCCESS: "Task checked out successfully",
  TASK_COMPLETED: "Task completed",
  AGENT_CONNECTED: "Agent connected",
  
  // 错误消息
  TASK_CONFLICT: "Task is already being worked on by another agent",
  BUDGET_HARD_LIMIT: "Budget hard limit reached, agent paused",
  AGENT_TERMINATED: "This agent has been terminated",
  
  // 警告消息
  BUDGET_SOFT_ALERT: "Budget usage exceeded 80%",
  HEARTBEAT_TIMEOUT: "Heartbeat execution timed out",
} as const;

// ============================================================================
// 时间常量
// ============================================================================

export const TIME_CONSTANTS = {
  /** 1 分钟 (毫秒) */
  ONE_MINUTE_MS: 60000,
  
  /** 1 小时 (毫秒) */
  ONE_HOUR_MS: 3600000,
  
  /** 1 天 (毫秒) */
  ONE_DAY_MS: 86400000,
  
  /** 预算结算日 (每月 1 号 UTC) */
  BUDGET_RESET_DAY_UTC: 1,
} as const;

// ============================================================================
// 数据库表名常量
// ============================================================================

export const TABLE_NAMES = {
  COMPANIES: "pc_companies",
  COMPANY_MEMBERSHIPS: "pc_company_memberships",
  AGENTS: "pc_agents",
  AGENT_API_KEYS: "pc_agent_api_keys",
  AGENT_CONFIG_REVISIONS: "pc_agent_config_revisions",
  AGENT_RUNTIME_STATE: "pc_agent_runtime_state",
  GOALS: "pc_goals",
  ISSUES: "pc_issues",
  ISSUE_COMMENTS: "pc_issue_comments",
  ISSUE_ATTACHMENTS: "pc_issue_attachments",
  HEARTBEAT_RUNS: "pc_heartbeat_runs",
  HEARTBEAT_RUN_EVENTS: "pc_heartbeat_run_events",
  AGENT_WAKEUP_REQUESTS: "pc_agent_wakeup_requests",
  COST_EVENTS: "pc_cost_events",
  APPROVALS: "pc_approvals",
  APPROVAL_COMMENTS: "pc_approval_comments",
  ACTIVITY_LOG: "pc_activity_log",
  ASSETS: "pc_assets",
} as const;

// ============================================================================
// 导出聚合
// ============================================================================

/**
 * 所有常量的统一导出对象
 * 方便批量导入使用
 */
export const paperclipConstants = {
  HEARTBEAT_CONFIG,
  BUDGET_THRESHOLDS,
  COST_CONFIG,
  ISSUE_TERMINAL_STATES,
  ISSUE_INITIAL_STATE,
  ISSUE_ACTIVE_STATES,
  ISSUE_BLOCKED_STATE,
  AGENT_TERMINAL_STATES,
  AGENT_ACTIVE_STATES,
  AGENT_IDLE_STATES,
  AGENT_ERROR_STATE,
  APPROVAL_TYPES,
  APPROVAL_TERMINAL_STATES,
  AUDIT_ACTIONS,
  ACTOR_TYPES,
  ADAPTER_TYPES,
  CONTEXT_MODES,
  PRIORITIES,
  PRIORITY_VALUES,
  COMPANY_ROLES,
  STORAGE_PROVIDERS,
  API_PATHS,
  ERROR_CODES,
  MESSAGES,
  TIME_CONSTANTS,
  TABLE_NAMES,
} as const;

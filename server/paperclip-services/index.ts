/**
 * Paperclip AI Agent 编排系统 - 服务层统一导出
 * 
 * 导出所有核心业务服务模块
 */

// ============================================================================
// Agent 服务
// ============================================================================

export * from "./agent-service";

// ============================================================================
// 任务服务
// ============================================================================

export * from "./task-service";

// ============================================================================
// 审计服务
// ============================================================================

export * from "./audit-service";

// ============================================================================
// 成本服务
// ============================================================================

export * from "./cost-service";

// ============================================================================
// 瀹℃壒鏈嶅姟
// ============================================================================

export * from "./approval-service";

// ============================================================================
// Dashboard 服务
// ============================================================================

export * from "./dashboard-service";

// ============================================================================
// 项目服务
// ============================================================================

export * from "./project-service";

// ============================================================================
// 目标服务
// ============================================================================

export * from "./goal-service";

// ============================================================================
// Heartbeat 服务
// ============================================================================

export * from "./heartbeat-service";

// ============================================================================
// Secrets 服务
// ============================================================================

export * from "./secrets-service";

// ============================================================================
// Live Events 服务
// ============================================================================

export * from "./live-events-service";

// ============================================================================
// Budget Policy Engine
// ============================================================================

export * from "./budget-policy-engine";

// ============================================================================
// Scheduler 服务
// ============================================================================

export * from "./scheduler-service";

// ============================================================================
// 聚合导出（方便批量导入）
// ============================================================================

import * as agentService from "./agent-service";
import * as taskService from "./task-service";
import * as auditService from "./audit-service";
import * as costService from "./cost-service";
import * as approvalService from "./approval-service";
import * as dashboardService from "./dashboard-service";
import * as projectService from "./project-service";
import * as goalService from "./goal-service";
import * as heartbeatService from "./heartbeat-service";
import * as secretsService from "./secrets-service";
import { liveEventsService } from "./live-events-service";
import { budgetPolicyEngine } from "./budget-policy-engine";
import * as schedulerService from "./scheduler-service";

export const paperclipServices = {
  agent: agentService,
  task: taskService,
  audit: auditService,
  cost: costService,
  approval: approvalService,
  dashboard: dashboardService,
  project: projectService,
  goal: goalService,
  heartbeat: heartbeatService,
  secrets: secretsService,
  liveEvents: liveEventsService,
  budgetPolicy: budgetPolicyEngine,
  scheduler: schedulerService,
};

// 默认导出
export default paperclipServices;

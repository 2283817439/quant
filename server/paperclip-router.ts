/**
 * Paperclip AI Agent 编排系统 - tRPC 路由
 * 
 * 暴露 Paperclip 核心功能给前端调用
 * 基于 Paperclip V1 Implementation Spec
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import * as paperclip from "./paperclip-services";
import { testAdapterEnvironment } from "./paperclip-services/adapter-test-service";
import {
  createAgentSchema,
  updateAgentSchema,
  checkoutTaskSchema,
  createIssueSchema,
  reportCostEventSchema,
  createApprovalSchema,
  decideApprovalSchema,
  approvalStatusSchema,
} from "../shared";

// ============================================================================
// Agent 相关路由
// ============================================================================

export const agentRouter = router({
  // 创建 Agent
  createAgent: publicProcedure
    .input(createAgentSchema)
    .mutation(async ({ ctx, input }) => {
      // 如果 companyId 为 1 且不存在，自动创建默认公司
      if (input.companyId === 1) {
        try {
          await paperclip.agentService.getAgentById(1);
        } catch {
          // 公司不存在，这里可以添加创建逻辑
        }
      }
      return await paperclip.agentService.createAgent({
        companyId: input.companyId,
        name: input.name,
        role: input.role,
        title: input.title,
        adapterType: input.adapterType,
        adapterConfig: input.adapterConfig,
        contextMode: input.contextMode,
        budgetMonthlyCents: input.budgetMonthlyCents,
        reportsTo: input.reportsTo,
        capabilities: input.capabilities,
        createdByUserId: ctx.user?.id,
      });
    }),

  // 获取 Agent
  getAgent: publicProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const agent = await paperclip.agentService.getAgentById(input.agentId);
      if (!agent) {
        throw new Error("Agent not found");
      }
      return agent;
    }),

  // 列出 Agent
  listAgents: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        status: z.enum(["active", "paused", "idle", "running", "error", "terminated"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.agentService.listAgents({
        companyId: input.companyId,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // 更新 Agent
  updateAgent: publicProcedure
    .input(updateAgentSchema)
    .mutation(async ({ ctx, input }) => {
      return await paperclip.agentService.updateAgent({
        agentId: input.agentId,
        name: input.name,
        role: input.role,
        title: input.title,
        status: input.status,
        adapterConfig: input.adapterConfig,
        budgetMonthlyCents: input.budgetMonthlyCents,
        contextMode: input.contextMode,
        capabilities: input.capabilities,
        reportsTo: input.reportsTo,
        updatedByUserId: ctx.user?.id,
      });
    }),

  // Agent 状态转换
  transitionStatus: publicProcedure
    .input(
      z.object({
        agentId: z.number().int().positive(),
        newStatus: z.enum(["active", "paused", "idle", "running", "error", "terminated"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await paperclip.agentService.transitionAgentStatus({
        agentId: input.agentId,
        newStatus: input.newStatus,
        reason: input.reason,
        actorType: ctx.user ? "user" : "system",
        actorId: ctx.user?.id?.toString() || "system",
        companyId: ctx.user?.id || 0, // TODO: 从公司上下文获取
      });
    }),

  // 创建 API Key
  createApiKey: publicProcedure
    .input(
      z.object({
        agentId: z.number().int().positive(),
        name: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ input }) => {
      return await paperclip.agentService.createApiKey(input.agentId, input.name);
    }),

  // 获取 API Keys
  getApiKeys: publicProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.agentService.getAgentApiKeys(input.agentId);
    }),

  // 撤销 API Key
  revokeApiKey: publicProcedure
    .input(z.object({ apiKeyId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await paperclip.agentService.revokeApiKey(input.apiKeyId);
      return { success: true };
    }),

  // 测试适配器环境
  testAdapterEnvironment: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      adapterType: z.string(),
      adapterConfig: z.record(z.string(), z.unknown()),
    }))
    .mutation(({ input }) => {
      const result = testAdapterEnvironment(input.adapterType, input.adapterConfig);
      return {
        success: result.status !== 'fail',
        status: result.status,
        message: result.status === 'fail' ? '环境测试失败' : result.status === 'warn' ? '环境测试通过但有警告' : '环境测试通过',
        checks: result.checks,
        testedAt: result.testedAt,
      };
    }),

  // 删除 Agent
  deleteAgent: publicProcedure
    .input(z.object({
      agentId: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      await paperclip.agentService.terminateAndDeleteAgent(
        input.agentId,
        input.companyId,
        ctx.user?.id
      );
      return { success: true };
    }),
});

// ============================================================================
// 任务相关路由
// ============================================================================

const createTaskInputSchema = createIssueSchema.extend({
  createdByAgentId: z.number().int().positive().optional(),
});

export const taskRouter = router({
  // 创建任务
  createTask: publicProcedure
    .input(createTaskInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await paperclip.taskService.createIssue({
        companyId: input.companyId,
        projectId: input.projectId,
        goalId: input.goalId,
        parentId: input.parentId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeAgentId: input.assigneeAgentId,
        createdByAgentId: input.createdByAgentId,
        createdByUserId: ctx.user?.id,
        billingCode: input.billingCode,
      });
    }),

  // 获取任务
  getTask: publicProcedure
    .input(z.object({ issueId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const issue = await paperclip.taskService.getIssueById(input.issueId);
      if (!issue) {
        throw new Error("Task not found");
      }
      return issue;
    }),

  // 列出任务
  listTasks: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]).optional(),
        assigneeAgentId: z.number().int().positive().optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.taskService.listIssues({
        companyId: input.companyId,
        status: input.status,
        assigneeAgentId: input.assigneeAgentId,
        priority: input.priority,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // 原子任务检出（核心功能）
  checkoutTask: publicProcedure
    .input(checkoutTaskSchema)
    .mutation(async ({ input }) => {
      return await paperclip.taskService.checkoutTask({
        issueId: input.issueId,
        agentId: input.agentId,
        expectedStatuses: input.expectedStatuses,
      });
    }),

  // 释放任务
  releaseTask: publicProcedure
    .input(
      z.object({
        issueId: z.number().int().positive(),
        agentId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      return await paperclip.taskService.releaseTask(
        input.issueId,
        input.agentId,
        0 // TODO: companyId
      );
    }),

  // 添加评论
  addComment: publicProcedure
    .input(
      z.object({
        issueId: z.number().int().positive(),
        body: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await paperclip.taskService.addComment({
        issueId: input.issueId,
        companyId: 0, // TODO: companyId
        body: input.body,
        authorUserId: ctx.user?.id,
      });
    }),

  // 获取评论
  getComments: publicProcedure
    .input(z.object({ issueId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.taskService.getIssueComments(input.issueId);
    }),
});

// ============================================================================
// 审计日志路由
// ============================================================================

export const auditRouter = router({
  // 查询活动日志
  queryLogs: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        actorType: z.enum(["agent", "user", "system"]).optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.auditService.queryActivityLogs({
        companyId: input.companyId,
        actorType: input.actorType,
        entityType: input.entityType,
        entityId: input.entityId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // 获取实体活动历史
  getEntityActivity: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        entityType: z.string(),
        entityId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.auditService.getEntityActivity(
        input.companyId,
        input.entityType,
        input.entityId,
        input.limit
      );
    }),

  // 获取统计信息
  getStats: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        since: z.string().datetime().optional(),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.auditService.getActivityStats(
        input.companyId,
        input.since ? new Date(input.since) : undefined
      );
    }),
});

// ============================================================================
// 成本与预算路由
// ============================================================================

export const costRouter = router({
  // 报告成本事件
  reportCost: publicProcedure
    .input(reportCostEventSchema)
    .mutation(async ({ ctx, input }) => {
      return await paperclip.costService.reportCostEvent({
        companyId: 0, // TODO: companyId
        agentId: input.agentId,
        issueId: input.issueId,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costCents: input.costCents,
        reportedByUserId: ctx.user?.id,
      });
    }),

  // 获取预算状态
  getBudgetStatus: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        agentId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.costService.getBudgetStatus({
        companyId: input.companyId,
        agentId: input.agentId,
      });
    }),

  // 获取成本列表
  getCostEvents: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        agentId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.costService.getCostEvents(
        input.companyId,
        input.agentId,
        input.limit,
        input.offset
      );
    }),

  // 按 Agent 统计成本
  getCostsByAgent: publicProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ input }) => {
      return await paperclip.costService.getCostsByAgent(
        input.companyId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    }),
});

// ============================================================================
// 瀹℃壒璺敱
// ============================================================================

const listApprovalsSchema = z.object({
  companyId: z.number().int().positive(),
  status: approvalStatusSchema.optional(),
});

const getApprovalSchema = z.object({
  approvalId: z.number().int().positive(),
});

const approvalCommentSchema = z.object({
  approvalId: z.number().int().positive(),
  body: z.string().min(1),
});

export const approvalRouter = router({
  create: publicProcedure
    .input(createApprovalSchema)
    .mutation(async ({ input }) => {
      return await paperclip.approvalService.createApproval({
        companyId: input.companyId,
        type: input.type,
        requestedByAgentId: input.requestedByAgentId,
        requestedByUserId: input.requestedByUserId,
        payload: input.payload as Record<string, unknown>,
      });
    }),

  list: publicProcedure
    .input(listApprovalsSchema)
    .query(async ({ input }) => {
      return await paperclip.approvalService.listApprovals({
        companyId: input.companyId,
        status: input.status,
      });
    }),

  get: publicProcedure
    .input(getApprovalSchema)
    .query(async ({ input }) => {
      const approval = await paperclip.approvalService.getApprovalById(input.approvalId);
      if (!approval) {
        throw new Error("Approval not found");
      }
      return approval;
    }),

  decide: publicProcedure
    .input(decideApprovalSchema)
    .mutation(async ({ ctx, input }) => {
      return await paperclip.approvalService.decideApproval({
        approvalId: input.approvalId,
        decision: input.decision,
        decisionNote: input.decisionNote,
        decidedByUserId: ctx.user?.id ?? undefined,
      });
    }),

  comments: router({
    list: publicProcedure
      .input(getApprovalSchema)
      .query(async ({ input }) => {
        return await paperclip.approvalService.listApprovalComments(input.approvalId);
      }),

    add: publicProcedure
      .input(approvalCommentSchema)
      .mutation(async ({ ctx, input }) => {
        return await paperclip.approvalService.addApprovalComment({
          approvalId: input.approvalId,
          body: input.body,
          authorUserId: ctx.user?.id ?? undefined,
        });
      }),
  }),
});

// ============================================================================
// Dashboard 路由
// ============================================================================

export const dashboardRouter = router({
  getSummary: publicProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.dashboardService.getDashboardSummary(input.companyId);
    }),
});

// ============================================================================
// 项目路由
// ============================================================================

export const projectRouter = router({
  create: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await paperclip.projectService.createProject({
        ...input,
        createdByUserId: ctx.user?.id,
      });
    }),

  get: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.projectService.getProjectById(input.projectId);
    }),

  list: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      status: z.enum(["active", "paused", "archived"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return await paperclip.projectService.listProjects(input);
    }),

  update: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await paperclip.projectService.updateProject({
        ...input,
        updatedByUserId: ctx.user?.id,
      });
    }),

  delete: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      await paperclip.projectService.deleteProject(input.projectId, input.companyId);
      return { success: true };
    }),
});

// ============================================================================
// 目标路由
// ============================================================================

export const goalRouter = router({
  create: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      title: z.string().min(1),
      description: z.string().optional(),
      level: z.enum(["company", "team", "agent", "task"]),
      parentId: z.number().int().positive().optional(),
      ownerAgentId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await paperclip.goalService.createGoal({
        ...input,
        createdByUserId: ctx.user?.id,
      });
    }),

  get: publicProcedure
    .input(z.object({ goalId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.goalService.getGoalById(input.goalId);
    }),

  list: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      level: z.enum(["company", "team", "agent", "task"]).optional(),
      status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
      parentId: z.number().int().positive().optional().nullable(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return await paperclip.goalService.listGoals(input);
    }),

  update: publicProcedure
    .input(z.object({
      goalId: z.number().int().positive(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
      ownerAgentId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      return await paperclip.goalService.updateGoal(input);
    }),

  getTree: publicProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.goalService.getGoalTree(input.companyId);
    }),
});

// ============================================================================
// Heartbeat 路由
// ============================================================================

export const heartbeatRouter = router({
  start: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      agentId: z.number().int().positive(),
      invocationSource: z.enum(["scheduler", "manual", "callback"]),
      contextSnapshot: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await paperclip.heartbeatService.startHeartbeatRun(input);
    }),

  finish: publicProcedure
    .input(z.object({
      runId: z.number().int().positive(),
      status: z.enum(["succeeded", "failed", "cancelled", "timed_out"]),
      error: z.string().optional(),
      contextSnapshot: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await paperclip.heartbeatService.finishHeartbeatRun(input);
    }),

  listRuns: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      agentId: z.number().int().positive().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return await paperclip.heartbeatService.listHeartbeatRuns(input);
    }),

  createWakeup: publicProcedure
    .input(z.object({
      agentId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return await paperclip.heartbeatService.createWakeupRequest({
        ...input,
        triggeredByUserId: ctx.user?.id,
      });
    }),

  getRunEvents: publicProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.heartbeatService.getRunEvents(input.runId);
    }),
});

// ============================================================================
// Secrets 路由
// ============================================================================

export const secretsRouter = router({
  upsert: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      key: z.string().min(1),
      value: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await paperclip.secretsService.upsertSecret({
        ...input,
        createdByUserId: ctx.user?.id,
      });
      return { success: true };
    }),

  get: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      key: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const value = await paperclip.secretsService.getSecret(input.companyId, input.key);
      return { value };
    }),

  list: publicProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await paperclip.secretsService.listSecrets(input.companyId);
    }),

  delete: publicProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      key: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      await paperclip.secretsService.deleteSecret(input.companyId, input.key);
      return { success: true };
    }),
});

// ============================================================================
// Scheduler 路由
// ============================================================================

import { schedulerRouter } from './scheduler-router';

// ============================================================================
// Skill Library 路由
// ============================================================================

import { skillRouter } from './skill-router';

// ============================================================================
// Runner Management 路由
// ============================================================================

import { runnerRouter } from './runner-router';

// ============================================================================
// Execution Logs 路由
// ============================================================================

import { executionLogRouter } from './execution-log-router';

// ============================================================================
// 主 Router 聚合
// ============================================================================

export const paperclipRouter = router({
  // Agent
  agents: agentRouter,

  // Tasks
  tasks: taskRouter,

  // Audit
  audit: auditRouter,

  // Costs
  costs: costRouter,

  // Approvals
  approvals: approvalRouter,

  // Dashboard
  dashboard: dashboardRouter,

  // Projects
  projects: projectRouter,

  // Goals
  goals: goalRouter,

  // Heartbeat
  heartbeat: heartbeatRouter,

  // Secrets
  secrets: secretsRouter,

  // Scheduler
  scheduler: schedulerRouter,

  // Skills
  skills: skillRouter,

  // Runners
  runners: runnerRouter,

  // Execution Logs
  executionLogs: executionLogRouter,
});

// 类型导出
export type PaperclipRouter = typeof paperclipRouter;

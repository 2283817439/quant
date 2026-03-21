/**
 * Paperclip Agent 生命周期管理服务
 * 
 * 负责 Agent 的创建、更新、删除、状态转换等核心业务逻辑
 * 基于 Paperclip V1 Implementation Spec
 */

import { getDb } from "../db";
import {
  agents,
  agentApiKeys,
  agentConfigRevisions,
  agentRuntimeState,
  companies,
  activityLog,
} from "../../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import type { Agent, InsertAgent } from "../../drizzle/schema";
import type { AgentStatus, CreateApiKeyResponse } from "../../client/src/lib/paperclip-types";
import {
  AUDIT_ACTIONS,
  ACTOR_TYPES,
  ERROR_CODES,
  validAgentTransitions,
} from "../../shared";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

// ============================================================================
// 类型定义
// ============================================================================

export type AgentWithDetails = Agent & {
  companyName?: string;
  managerName?: string;
};

export interface CreateAgentOptions {
  companyId: number;
  name: string;
  role: string;
  title?: string;
  adapterType: "process" | "http";
  adapterConfig: Record<string, unknown>;
  contextMode?: "thin" | "fat";
  budgetMonthlyCents?: number;
  reportsTo?: number;
  capabilities?: string;
  createdByUserId?: number;
}

export interface UpdateAgentOptions {
  agentId: number;
  name?: string;
  role?: string;
  title?: string;
  status?: AgentStatus;
  adapterConfig?: Record<string, unknown>;
  budgetMonthlyCents?: number;
  contextMode?: "thin" | "fat";
  capabilities?: string;
  reportsTo?: number;
  updatedByUserId?: number;
}

export interface TransitionAgentStatusOptions {
  agentId: number;
  newStatus: AgentStatus;
  reason?: string;
  actorType: "agent" | "user" | "system";
  actorId: string;
  companyId: number;
}

export interface ListAgentsOptions {
  companyId: number;
  status?: AgentStatus;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Agent 查询服务
// ============================================================================

/**
 * 根据 ID 获取 Agent
 */
export async function getAgentById(agentId: number): Promise<Agent | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * 获取 Agent（带详细信息）
 */
export async function getAgentWithDetails(
  agentId: number
): Promise<AgentWithDetails | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [agentRow] = await db
    .select({
      agent: agents,
      companyName: companies.name,
    })
    .from(agents)
    .leftJoin(companies, eq(agents.companyId, companies.id))
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agentRow) return null;

  let managerName: string | undefined;
  if (agentRow.agent.reportsTo) {
    const [managerRow] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, agentRow.agent.reportsTo))
      .limit(1);
    managerName = managerRow?.name ?? undefined;
  }

  return {
    ...agentRow.agent,
    companyName: agentRow.companyName ?? undefined,
    managerName,
  };
}

/**
 * 列出 Agent（支持分页和过滤）
 */
export async function listAgents(
  options: ListAgentsOptions
): Promise<Agent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { companyId, status, limit = 50, offset = 0 } = options;

  const whereClause = status
    ? and(eq(agents.companyId, companyId), eq(agents.status, status))
    : eq(agents.companyId, companyId);

  return await db
    .select()
    .from(agents)
    .where(whereClause)
    .orderBy(desc(agents.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * 根据公司 ID 获取所有活跃 Agent
 */
export async function getActiveAgents(companyId: number): Promise<Agent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.companyId, companyId),
        eq(agents.status, "active")
      )
    )
    .orderBy(desc(agents.createdAt));
}

// ============================================================================
// Agent 创建服务
// ============================================================================

/**
 * 创建新 Agent
 */
export async function createAgent(
  options: CreateAgentOptions
): Promise<Agent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 验证公司是否存在，如果不存在则自动创建
  const companyExists = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, options.companyId))
    .limit(1);

  if (companyExists.length === 0) {
    // 自动创建公司，使用系统名称
    const systemName = process.env.SYSTEM_NAME || "量化交易平台";
    await db.insert(companies).values({
      id: options.companyId,
      name: systemName,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // 如果指定了上级，验证上级 Agent 是否存在
  if (options.reportsTo) {
    const managerExists = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, options.reportsTo!), eq(agents.companyId, options.companyId)))
      .limit(1);

    if (managerExists.length === 0) {
      throw new Error("Manager agent not found");
    }
  }

  // 插入 Agent
  const insertData: InsertAgent = {
    companyId: options.companyId,
    name: options.name,
    role: options.role,
    title: options.title,
    status: "idle", // 初始状态为 idle
    adapterType: options.adapterType,
    adapterConfig: options.adapterConfig,
    contextMode: options.contextMode || "thin",
    budgetMonthlyCents: options.budgetMonthlyCents || 0,
    spentMonthlyCents: 0,
    reportsTo: options.reportsTo,
    capabilities: options.capabilities,
  };

  const result = await db.insert(agents).values(insertData);

  // 获取插入的 ID (MySQL) - Drizzle mysql2 returns [ResultSetHeader, ...]
  const raw = result as any;
  const agentId = raw?.insertId ?? raw?.[0]?.insertId ?? raw?.id ?? raw?.[0]?.id;

  // 记录审计日志
  await logActivity({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() || "system",
    action: AUDIT_ACTIONS.AGENT_CREATED,
    entityType: "agent",
    entityId: agentId?.toString() ?? "unknown",
    details: {
      name: options.name,
      role: options.role,
      adapterType: options.adapterType,
    },
  });

  const createdAgent = await getAgentById(agentId);
  if (!createdAgent) {
    throw new Error("Failed to load created agent");
  }
  return createdAgent;
}

// ============================================================================
// Agent 更新服务
// ============================================================================

/**
 * 更新 Agent 信息
 */
export async function updateAgent(
  options: UpdateAgentOptions
): Promise<Agent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getAgentById(options.agentId);
  if (!existing) {
    throw new Error("Agent not found");
  }

  // 构建更新数据
  const updateData: Partial<InsertAgent> = {};
  
  if (options.name !== undefined) updateData.name = options.name;
  if (options.role !== undefined) updateData.role = options.role;
  if (options.title !== undefined) updateData.title = options.title;
  if (options.status !== undefined) updateData.status = options.status;
  if (options.contextMode !== undefined) updateData.contextMode = options.contextMode;
  if (options.capabilities !== undefined) updateData.capabilities = options.capabilities;
  if (options.reportsTo !== undefined) updateData.reportsTo = options.reportsTo;
  if (options.adapterConfig !== undefined) {
    updateData.adapterConfig = options.adapterConfig;
  }
  if (options.budgetMonthlyCents !== undefined) {
    updateData.budgetMonthlyCents = options.budgetMonthlyCents;
  }

  // 执行更新
  await db
    .update(agents)
    .set(updateData)
    .where(eq(agents.id, options.agentId));

  // 如果更新了配置，创建配置版本记录
  if (options.adapterConfig !== undefined) {
    await createConfigRevision({
      agentId: options.agentId,
      adapterConfig: options.adapterConfig,
      changeNote: "Configuration updated",
      changedByUserId: options.updatedByUserId,
    });
  }

  // 记录审计日志
  if (options.updatedByUserId) {
    await logActivity({
      companyId: existing.companyId,
      actorType: ACTOR_TYPES.USER,
      actorId: options.updatedByUserId.toString(),
      action: AUDIT_ACTIONS.AGENT_UPDATED,
      entityType: "agent",
      entityId: options.agentId.toString(),
      details: { changes: updateData },
    });
  }

  const updatedAgent = await getAgentById(options.agentId);
  if (!updatedAgent) {
    throw new Error("Failed to load updated agent");
  }
  return updatedAgent;
}

/**
 * Agent 状态转换（带验证）
 */
export async function transitionAgentStatus(
  options: TransitionAgentStatusOptions
): Promise<Agent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agent = await getAgentById(options.agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // 验证状态转换是否合法
  const validTransitions = validAgentTransitions[agent.status];
  if (!validTransitions || !validTransitions.includes(options.newStatus)) {
    throw new Error(
      `Invalid status transition from ${agent.status} to ${options.newStatus}`
    );
  }

  // 特殊检查：terminated 是终态
  if (agent.status === "terminated") {
    throw new Error("Terminated agents cannot be resumed");
  }

  // 执行状态转换
  await db
    .update(agents)
    .set({
      status: options.newStatus,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, options.agentId));

  // 记录审计日志
  await logActivity({
    companyId: options.companyId,
    actorType: options.actorType,
    actorId: options.actorId,
    action: AUDIT_ACTIONS.AGENT_PAUSED,
    entityType: "agent",
    entityId: options.agentId.toString(),
    details: {
      fromStatus: agent.status,
      toStatus: options.newStatus,
      reason: options.reason,
    },
  });

  const transitionedAgent = await getAgentById(options.agentId);
  if (!transitionedAgent) {
    throw new Error("Failed to load transitioned agent");
  }
  return transitionedAgent;
}

// ============================================================================
// Agent API Key 管理
// ============================================================================

/**
 * 为 Agent 创建 API Key
 */
export async function createApiKey(
  agentId: number,
  name: string
): Promise<CreateApiKeyResponse> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // 生成 API Key
  const plaintextKey = `pc_${uuidv4().replace(/-/g, "")}`;
  const keyHash = hashApiKey(plaintextKey);

  // 插入 API Key 记录
  const insertData = {
    agentId,
    companyId: agent.companyId,
    name,
    keyHash,
  };

  const result = await db.insert(agentApiKeys).values(insertData);
  const apiKeyId = (result as any).insertId || (result as any).id;

  // 记录审计日志
  await logActivity({
    companyId: agent.companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "system",
    action: AUDIT_ACTIONS.AGENT_API_KEY_CREATED,
    entityType: "agent_api_key",
    entityId: apiKeyId.toString(),
    details: { agentId, name },
  });

  // 返回 API Key（明文仅显示一次）
  const apiKey = await getApiKeyById(apiKeyId);
  
  if (!apiKey) {
    throw new Error("Failed to load API key after creation");
  }

  return {
    apiKey,
    plaintextKey,
  };
}

/**
 * 撤销 API Key
 */
export async function revokeApiKey(apiKeyId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(agentApiKeys.id, apiKeyId));

  const key = await getApiKeyById(apiKeyId);
  if (key) {
    await logActivity({
      companyId: key.companyId,
      actorType: ACTOR_TYPES.SYSTEM,
      actorId: "system",
      action: AUDIT_ACTIONS.AGENT_API_KEY_REVOKED,
      entityType: "agent_api_key",
      entityId: apiKeyId.toString(),
      details: { agentId: key.agentId },
    });
  }
}

/**
 * 获取 Agent 的所有 API Keys
 */
export async function getAgentApiKeys(agentId: number): Promise<typeof agentApiKeys.$inferSelect[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(agentApiKeys)
    .where(eq(agentApiKeys.agentId, agentId))
    .orderBy(desc(agentApiKeys.createdAt));
}

/**
 * 验证 API Key
 */
export async function validateApiKey(
  agentId: number,
  plaintextKey: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const keyHash = hashApiKey(plaintextKey);

  const keys = await db
    .select()
    .from(agentApiKeys)
    .where(
      and(
        eq(agentApiKeys.agentId, agentId),
        eq(agentApiKeys.keyHash, keyHash),
        isNull(agentApiKeys.revokedAt)
      )
    )
    .limit(1);

  if (keys.length === 0) return false;

  // 更新最后使用时间
  await db
    .update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, keys[0].id));

  return true;
}

// ============================================================================
// Agent 配置版本管理
// ============================================================================

interface CreateConfigRevisionOptions {
  agentId: number;
  adapterConfig: Record<string, unknown>;
  changeNote?: string;
  changedByUserId?: number;
}

async function createConfigRevision(
  options: CreateConfigRevisionOptions
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 获取当前最大版本号
  const [maxRevision] = await db
    .select({ max: sql<number>`MAX(revisionNumber)` })
    .from(agentConfigRevisions)
    .where(eq(agentConfigRevisions.agentId, options.agentId));

  const nextRevision = (maxRevision?.max || 0) + 1;

  await db.insert(agentConfigRevisions).values({
    agentId: options.agentId,
    revisionNumber: nextRevision,
    adapterConfig: options.adapterConfig,
    changeNote: options.changeNote,
    changedByUserId: options.changedByUserId,
  });
}

// ============================================================================
// Agent 运行时状态管理
// ============================================================================

/**
 * 保存 Agent 运行时上下文快照
 */
export async function saveRuntimeState(
  agentId: number,
  contextSnapshot: Record<string, unknown>,
  taskId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(agentRuntimeState)
    .values({
      agentId,
      taskId,
      contextSnapshot,
    })
    .onDuplicateKeyUpdate({
      set: {
        contextSnapshot,
        taskId,
        lastCheckpointAt: new Date(),
      },
    });
}

/**
 * 获取 Agent 运行时状态
 */
export async function getRuntimeState(
  agentId: number
): Promise<typeof agentRuntimeState.$inferSelect | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const states = await db
    .select()
    .from(agentRuntimeState)
    .where(eq(agentRuntimeState.agentId, agentId))
    .limit(1);

  return states.length > 0 ? states[0] : null;
}

/**
 * 清除 Agent 运行时状态
 */
export async function clearRuntimeState(agentId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(agentRuntimeState)
    .where(eq(agentRuntimeState.agentId, agentId));
}

// ============================================================================
// Agent 删除服务
// ============================================================================

/**
 * 终止并删除 Agent
 */
export async function terminateAndDeleteAgent(
  agentId: number,
  companyId: number,
  deletedByUserId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  if (agent.companyId !== companyId) {
    throw new Error("Agent does not belong to specified company");
  }

  // 先终止 Agent
  await db
    .update(agents)
    .set({ status: "terminated" })
    .where(eq(agents.id, agentId));

  // 撤销所有 API Keys
  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(agentApiKeys.agentId, agentId));

  // 清除运行时状态
  await clearRuntimeState(agentId);

  // 删除 Agent（级联删除相关记录）
  await db.delete(agents).where(eq(agents.id, agentId));

  // 记录审计日志
  if (deletedByUserId) {
    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.USER,
      actorId: deletedByUserId.toString(),
      action: AUDIT_ACTIONS.AGENT_TERMINATED,
      entityType: "agent",
      entityId: agentId.toString(),
      details: { name: agent.name, role: agent.role },
    });
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 哈希 API Key
 */
function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

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
    console.warn("[paperclip] Database not available, skipping audit log");
    return;
  }

  try {
    await db.insert(activityLog).values(options);
  } catch (error) {
    console.error("[paperclip] Failed to log activity:", error);
  }
}

/**
 * 获取 API Key by ID
 */
async function getApiKeyById(
  apiKeyId: number
): Promise<typeof agentApiKeys.$inferSelect | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const keys = await db
    .select()
    .from(agentApiKeys)
    .where(eq(agentApiKeys.id, apiKeyId))
    .limit(1);

  return keys.length > 0 ? keys[0] : null;
}

// ============================================================================
// 导出聚合
// ============================================================================

export const agentService = {
  // 查询
  getAgentById,
  getAgentWithDetails,
  listAgents,
  getActiveAgents,
  
  // 创建/更新/删除
  createAgent,
  updateAgent,
  transitionAgentStatus,
  terminateAndDeleteAgent,
  
  // API Key 管理
  createApiKey,
  revokeApiKey,
  getAgentApiKeys,
  validateApiKey,
  
  // 运行时状态
  saveRuntimeState,
  getRuntimeState,
  clearRuntimeState,
};

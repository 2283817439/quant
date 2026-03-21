var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/env.ts
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";
  if (!host || !name || !user) {
    return "";
  }
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const auth = password ? `${encodedUser}:${encodedPassword}` : encodedUser;
  return `mysql://${auth}@${host}:${port}/${name}`;
}
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: resolveDatabaseUrl(),
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
      OPENCLAW_MODEL: process.env.OPENCLAW_MODEL,
      OPENCLAW_ENDPOINT: process.env.OPENCLAW_ENDPOINT,
      QMT_API_BASE_URL: process.env.QMT_API_BASE_URL,
      AI_BROWSER_WHITELIST: process.env.AI_BROWSER_WHITELIST,
      AI_DEFAULT_TIMEOUT_MS: process.env.AI_DEFAULT_TIMEOUT_MS
    };
  }
});

// drizzle/paperclip-schema.ts
import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var companies, agents, agentApiKeys, agentConfigRevisions, agentRuntimeState, goals, projects, issues, issueComments, heartbeatRuns, heartbeatRunEvents, agentWakeupRequests, costEvents, approvals, approvalComments, activityLog, agentSchedules, companySecrets, skills, agentSkills, runners, scheduleExecutionLogs;
var init_paperclip_schema = __esm({
  "drizzle/paperclip-schema.ts"() {
    "use strict";
    companies = mysqlTable("pc_companies", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      status: varchar("status", { length: 32 }).default("active").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    agents = mysqlTable("pc_agents", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      role: varchar("role", { length: 255 }).notNull(),
      title: varchar("title", { length: 255 }),
      status: mysqlEnum("status", ["active", "paused", "idle", "running", "error", "terminated"]).default("idle").notNull(),
      adapterType: mysqlEnum("adapterType", ["process", "http"]).notNull(),
      adapterConfig: json("adapterConfig"),
      contextMode: mysqlEnum("contextMode", ["thin", "fat"]).default("thin").notNull(),
      budgetMonthlyCents: int("budgetMonthlyCents").default(0).notNull(),
      spentMonthlyCents: int("spentMonthlyCents").default(0).notNull(),
      reportsTo: int("reportsTo"),
      capabilities: text("capabilities"),
      lastHeartbeatAt: timestamp("lastHeartbeatAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    agentApiKeys = mysqlTable("pc_agent_api_keys", {
      id: int("id").autoincrement().primaryKey(),
      agentId: int("agentId").notNull(),
      companyId: int("companyId").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      keyHash: varchar("keyHash", { length: 512 }).notNull(),
      lastUsedAt: timestamp("lastUsedAt"),
      revokedAt: timestamp("revokedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    agentConfigRevisions = mysqlTable("pc_agent_config_revisions", {
      id: int("id").autoincrement().primaryKey(),
      agentId: int("agentId").notNull(),
      revisionNumber: int("revisionNumber").notNull(),
      adapterConfig: json("adapterConfig").notNull(),
      changeNote: text("changeNote"),
      changedByUserId: int("changedByUserId"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    agentRuntimeState = mysqlTable("pc_agent_runtime_state", {
      agentId: int("agentId").primaryKey(),
      taskId: int("taskId"),
      contextSnapshot: json("contextSnapshot"),
      lastCheckpointAt: timestamp("lastCheckpointAt").defaultNow().notNull()
    });
    goals = mysqlTable("pc_goals", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      parentId: int("parentId"),
      title: varchar("title", { length: 255 }).notNull(),
      description: text("description"),
      level: mysqlEnum("level", ["company", "team", "agent", "task"]).default("company").notNull(),
      ownerAgentId: int("ownerAgentId"),
      status: mysqlEnum("status", ["planned", "active", "achieved", "cancelled"]).default("planned").notNull(),
      priority: varchar("priority", { length: 16 }).default("medium").notNull(),
      targetDate: timestamp("targetDate"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    projects = mysqlTable("pc_projects", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      goalId: int("goalId"),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      status: varchar("status", { length: 32 }).default("active").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    issues = mysqlTable("pc_issues", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      projectId: int("projectId"),
      goalId: int("goalId"),
      parentId: int("parentId"),
      title: varchar("title", { length: 255 }).notNull(),
      description: text("description"),
      status: mysqlEnum("status", ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]).default("backlog").notNull(),
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    issueComments = mysqlTable("pc_issue_comments", {
      id: int("id").autoincrement().primaryKey(),
      issueId: int("issueId").notNull(),
      companyId: int("companyId").notNull(),
      body: text("body").notNull(),
      authorUserId: int("authorUserId"),
      authorAgentId: int("authorAgentId"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    heartbeatRuns = mysqlTable("pc_heartbeat_runs", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      agentId: int("agentId").notNull(),
      invocationSource: mysqlEnum("invocationSource", ["scheduler", "manual", "callback"]).default("scheduler").notNull(),
      status: mysqlEnum("status", ["queued", "running", "succeeded", "failed", "cancelled", "timed_out"]).default("queued").notNull(),
      startedAt: timestamp("startedAt"),
      finishedAt: timestamp("finishedAt"),
      errorMessage: text("errorMessage"),
      externalRunId: varchar("externalRunId", { length: 128 }),
      contextSnapshot: json("contextSnapshot"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    heartbeatRunEvents = mysqlTable("pc_heartbeat_run_events", {
      id: int("id").autoincrement().primaryKey(),
      runId: int("runId").notNull(),
      eventType: varchar("eventType", { length: 128 }).notNull(),
      eventData: json("eventData"),
      occurredAt: timestamp("occurredAt").defaultNow().notNull()
    });
    agentWakeupRequests = mysqlTable("pc_agent_wakeup_requests", {
      id: int("id").autoincrement().primaryKey(),
      agentId: int("agentId").notNull(),
      companyId: int("companyId").notNull(),
      reason: text("reason").notNull(),
      triggeredByUserId: int("triggeredByUserId"),
      triggeredByAgentId: int("triggeredByAgentId"),
      processed: int("processed").default(0).notNull(),
      // MySQL boolean as int
      processedAt: timestamp("processedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    costEvents = mysqlTable("pc_cost_events", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    approvals = mysqlTable("pc_approvals", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      type: mysqlEnum("type", ["hire_agent", "approve_ceo_strategy"]).notNull(),
      status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
      requestedByAgentId: int("requestedByAgentId"),
      requestedByUserId: int("requestedByUserId"),
      decidedByUserId: int("decidedByUserId"),
      payload: json("payload"),
      decision: text("decision"),
      decisionNote: text("decisionNote"),
      decidedAt: timestamp("decidedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    approvalComments = mysqlTable("pc_approval_comments", {
      id: int("id").autoincrement().primaryKey(),
      approvalId: int("approvalId").notNull(),
      companyId: int("companyId").notNull(),
      body: text("body").notNull(),
      authorUserId: int("authorUserId"),
      authorAgentId: int("authorAgentId"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    activityLog = mysqlTable("pc_activity_log", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      actorType: varchar("actorType", { length: 32 }).notNull(),
      actorId: varchar("actorId", { length: 128 }).notNull(),
      action: varchar("action", { length: 128 }).notNull(),
      entityType: varchar("entityType", { length: 64 }),
      entityId: varchar("entityId", { length: 128 }),
      details: json("details"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    agentSchedules = mysqlTable("pc_agent_schedules", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      agentId: int("agentId").notNull(),
      cronExpression: varchar("cronExpression", { length: 128 }).notNull(),
      enabled: int("enabled").default(1).notNull(),
      // MySQL boolean as int
      lastRun: timestamp("lastRun"),
      nextRun: timestamp("nextRun"),
      maxRetries: int("maxRetries").default(0).notNull(),
      retryDelaySeconds: int("retryDelaySeconds").default(60).notNull(),
      timeoutSeconds: int("timeoutSeconds").default(300).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    companySecrets = mysqlTable("pc_company_secrets", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      key: varchar("key", { length: 255 }).notNull(),
      encryptedValue: text("encryptedValue").notNull(),
      description: text("description"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    skills = mysqlTable("pc_skills", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    agentSkills = mysqlTable("pc_agent_skills", {
      id: int("id").autoincrement().primaryKey(),
      agentId: int("agentId").notNull(),
      skillId: int("skillId").notNull(),
      enabled: int("enabled").default(1).notNull(),
      config: json("config"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    runners = mysqlTable("pc_runners", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    scheduleExecutionLogs = mysqlTable("pc_schedule_execution_logs", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
  }
});

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  activityLog: () => activityLog,
  agentApiKeys: () => agentApiKeys,
  agentConfigRevisions: () => agentConfigRevisions,
  agentRuntimeState: () => agentRuntimeState,
  agentSchedules: () => agentSchedules,
  agentSkills: () => agentSkills,
  agentWakeupRequests: () => agentWakeupRequests,
  agents: () => agents,
  approvalComments: () => approvalComments,
  approvals: () => approvals,
  backtestRecords: () => backtestRecords,
  backups: () => backups,
  benchmarkAnalysis: () => benchmarkAnalysis,
  benchmarkData: () => benchmarkData,
  benchmarkIndices: () => benchmarkIndices,
  companies: () => companies,
  companySecrets: () => companySecrets,
  costEvents: () => costEvents,
  equityCurves: () => equityCurves,
  goals: () => goals,
  heartbeatRunEvents: () => heartbeatRunEvents,
  heartbeatRuns: () => heartbeatRuns,
  issueComments: () => issueComments,
  issues: () => issues,
  livePositions: () => livePositions,
  marketData: () => marketData,
  monthlyReturns: () => monthlyReturns,
  orders: () => orders,
  parameterScanConfigs: () => parameterScanConfigs,
  parameterScanOptimalResults: () => parameterScanOptimalResults,
  parameterScanResults: () => parameterScanResults,
  positionSnapshots: () => positionSnapshots,
  projects: () => projects,
  riskAlerts: () => riskAlerts,
  runners: () => runners,
  scheduleExecutionLogs: () => scheduleExecutionLogs,
  securities: () => securities,
  skills: () => skills,
  stockDailyBars: () => stockDailyBars,
  strategies: () => strategies,
  strategyBenchmarks: () => strategyBenchmarks,
  tradeLogs: () => tradeLogs,
  trades: () => trades,
  tradingAccounts: () => tradingAccounts,
  users: () => users
});
import {
  int as int2,
  mysqlEnum as mysqlEnum2,
  mysqlTable as mysqlTable2,
  text as text2,
  timestamp as timestamp2,
  varchar as varchar2,
  decimal,
  boolean,
  json as json2,
  index,
  foreignKey,
  uniqueIndex
} from "drizzle-orm/mysql-core";
var users, strategies, backtestRecords, equityCurves, trades, positionSnapshots, riskAlerts, monthlyReturns, backups, benchmarkIndices, benchmarkData, strategyBenchmarks, benchmarkAnalysis, tradingAccounts, marketData, orders, livePositions, tradeLogs, parameterScanConfigs, parameterScanResults, parameterScanOptimalResults, securities, stockDailyBars;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    init_paperclip_schema();
    users = mysqlTable2("users", {
      id: int2("id").autoincrement().primaryKey(),
      openId: varchar2("openId", { length: 64 }).notNull().unique(),
      name: text2("name"),
      email: varchar2("email", { length: 320 }),
      loginMethod: varchar2("loginMethod", { length: 64 }),
      role: mysqlEnum2("role", ["user", "admin"]).default("user").notNull(),
      createdAt: timestamp2("createdAt").defaultNow().notNull(),
      updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull(),
      lastSignedIn: timestamp2("lastSignedIn").defaultNow().notNull()
    });
    strategies = mysqlTable2(
      "strategies",
      {
        id: int2("id").autoincrement().primaryKey(),
        userId: int2("userId").notNull(),
        name: varchar2("name", { length: 255 }).notNull(),
        description: text2("description"),
        version: varchar2("version", { length: 32 }).default("1.0.0").notNull(),
        // 策略参数
        indexCode: varchar2("indexCode", { length: 32 }).notNull(),
        // 跟踪指数
        frequency: mysqlEnum2("frequency", ["daily", "weekly", "monthly"]).default("daily").notNull(),
        targetCount: int2("targetCount").default(10).notNull(),
        // 目标持仓数
        // 信号参数
        shortWindow: int2("shortWindow").default(20).notNull(),
        longWindow: int2("longWindow").default(60).notNull(),
        volatilityWindow: int2("volatilityWindow").default(30).notNull(),
        trendRatio: decimal("trendRatio", { precision: 5, scale: 4 }).default("0.5").notNull(),
        // 风控参数
        stopLossRatio: decimal("stopLossRatio", { precision: 5, scale: 4 }).default("0.08").notNull(),
        maxProfitDrawdown: decimal("maxProfitDrawdown", { precision: 5, scale: 4 }).default("0.15").notNull(),
        newHighTimeout: int2("newHighTimeout").default(45).notNull(),
        maxSinglePositionRatio: decimal("maxSinglePositionRatio", { precision: 5, scale: 4 }).default("0.12").notNull(),
        maxTotalPositionRatio: decimal("maxTotalPositionRatio", { precision: 5, scale: 4 }).default("0.9").notNull(),
        maxDrawdown: decimal("maxDrawdown", { precision: 5, scale: 4 }).default("0.2").notNull(),
        dailyMaxLoss: decimal("dailyMaxLoss", { precision: 15, scale: 2 }).default("10000.00").notNull(),
        // 账户参数
        initialCapital: decimal("initialCapital", { precision: 15, scale: 2 }).default("1000000.00").notNull(),
        commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }).default("0.0003").notNull(),
        stampDutyRate: decimal("stampDutyRate", { precision: 5, scale: 4 }).default("0.001").notNull(),
        slippageRate: decimal("slippageRate", { precision: 5, scale: 4 }).default("0.0005").notNull(),
        // 回测期间
        backtestStart: varchar2("backtestStart", { length: 10 }).notNull(),
        // YYYY-MM-DD
        backtestEnd: varchar2("backtestEnd", { length: 10 }).notNull(),
        // 状态
        isActive: boolean("isActive").default(true).notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        userIdIdx: index("strategies_userId_idx").on(table.userId),
        fk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade")
      })
    );
    backtestRecords = mysqlTable2(
      "backtest_records",
      {
        id: int2("id").autoincrement().primaryKey(),
        userId: int2("userId").notNull(),
        strategyId: int2("strategyId").notNull(),
        // 回测基本信息
        name: varchar2("name", { length: 255 }).notNull(),
        // 回测名称
        description: text2("description"),
        backtestStart: varchar2("backtestStart", { length: 10 }).notNull(),
        backtestEnd: varchar2("backtestEnd", { length: 10 }).notNull(),
        tradingDays: int2("tradingDays").default(0).notNull(),
        // 收益指标
        initialCapital: decimal("initialCapital", { precision: 15, scale: 2 }).notNull(),
        finalAsset: decimal("finalAsset", { precision: 15, scale: 2 }).notNull(),
        totalReturn: decimal("totalReturn", { precision: 8, scale: 6 }).notNull(),
        // 总收益率
        annualReturn: decimal("annualReturn", { precision: 8, scale: 6 }).notNull(),
        // 年化收益率
        totalPnl: decimal("totalPnl", { precision: 15, scale: 2 }).notNull(),
        // 总盈亏
        // 风险指标
        maxDrawdown: decimal("maxDrawdown", { precision: 8, scale: 6 }).notNull(),
        // 最大回撤
        maxDrawdownDays: int2("maxDrawdownDays").default(0).notNull(),
        // 最大回撤持续天数
        volatility: decimal("volatility", { precision: 8, scale: 6 }).notNull(),
        // 年化波动率
        sharpeRatio: decimal("sharpeRatio", { precision: 8, scale: 4 }).notNull(),
        // 夏普比率
        sortinoRatio: decimal("sortinoRatio", { precision: 8, scale: 4 }).notNull(),
        // 索提诺比率
        calmarRatio: decimal("calmarRatio", { precision: 8, scale: 4 }).notNull(),
        // 卡玛比率
        infoRatio: decimal("infoRatio", { precision: 8, scale: 4 }).notNull(),
        // 信息比率
        // 基准对比
        benchmarkReturn: decimal("benchmarkReturn", { precision: 8, scale: 6 }).notNull(),
        // 基准收益率
        alpha: decimal("alpha", { precision: 8, scale: 6 }).notNull(),
        // Alpha
        beta: decimal("beta", { precision: 8, scale: 6 }).notNull(),
        // Beta
        // 交易统计
        totalTrades: int2("totalTrades").default(0).notNull(),
        winTrades: int2("winTrades").default(0).notNull(),
        lossTrades: int2("lossTrades").default(0).notNull(),
        winRate: decimal("winRate", { precision: 5, scale: 4 }).default("0").notNull(),
        profitLossRatio: decimal("profitLossRatio", { precision: 8, scale: 4 }).default("0").notNull(),
        // 风险指标
        var95: decimal("var95", { precision: 8, scale: 6 }).notNull(),
        // VaR (95%)
        cvar95: decimal("cvar95", { precision: 8, scale: 6 }).notNull(),
        // CVaR (95%)
        // 状态
        status: mysqlEnum2("status", ["pending", "running", "completed", "failed"]).default("completed").notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        userIdIdx: index("backtest_records_userId_idx").on(table.userId),
        strategyIdIdx: index("backtest_records_strategyId_idx").on(table.strategyId),
        fk1: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
        fk2: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("cascade")
      })
    );
    equityCurves = mysqlTable2(
      "equity_curves",
      {
        id: int2("id").autoincrement().primaryKey(),
        backtestRecordId: int2("backtestRecordId").notNull(),
        date: varchar2("date", { length: 10 }).notNull(),
        // YYYY-MM-DD
        nav: decimal("nav", { precision: 10, scale: 6 }).notNull(),
        // 净值
        benchmark: decimal("benchmark", { precision: 10, scale: 6 }).notNull(),
        // 基准净值
        asset: decimal("asset", { precision: 15, scale: 2 }).notNull(),
        // 总资产
        cash: decimal("cash", { precision: 15, scale: 2 }).notNull(),
        // 现金
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        backtestRecordIdIdx: index("equity_curves_backtestRecordId_idx").on(table.backtestRecordId),
        dateIdx: index("equity_curves_date_idx").on(table.date),
        fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade")
      })
    );
    trades = mysqlTable2(
      "trades",
      {
        id: int2("id").autoincrement().primaryKey(),
        backtestRecordId: int2("backtestRecordId").notNull(),
        tradeDate: varchar2("tradeDate", { length: 10 }).notNull(),
        // YYYY-MM-DD
        tradeTime: varchar2("tradeTime", { length: 8 }).notNull(),
        // HH:MM:SS
        symbol: varchar2("symbol", { length: 32 }).notNull(),
        // 证券代码
        direction: mysqlEnum2("direction", ["BUY", "SELL"]).notNull(),
        volume: int2("volume").notNull(),
        // 交易数量
        price: decimal("price", { precision: 10, scale: 4 }).notNull(),
        // 成交价
        amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
        // 成交金额
        commission: decimal("commission", { precision: 15, scale: 2 }).notNull(),
        // 佣金
        stampDuty: decimal("stampDuty", { precision: 15, scale: 2 }).notNull(),
        // 印花税
        slippage: decimal("slippage", { precision: 15, scale: 2 }).notNull(),
        // 滑点
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        backtestRecordIdIdx: index("trades_backtestRecordId_idx").on(table.backtestRecordId),
        symbolIdx: index("trades_symbol_idx").on(table.symbol),
        tradeDateIdx: index("trades_tradeDate_idx").on(table.tradeDate),
        fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade")
      })
    );
    positionSnapshots = mysqlTable2(
      "position_snapshots",
      {
        id: int2("id").autoincrement().primaryKey(),
        backtestRecordId: int2("backtestRecordId").notNull(),
        snapshotDate: varchar2("snapshotDate", { length: 10 }).notNull(),
        // YYYY-MM-DD
        symbol: varchar2("symbol", { length: 32 }).notNull(),
        totalVolume: int2("totalVolume").notNull(),
        availableVolume: int2("availableVolume").notNull(),
        avgPrice: decimal("avgPrice", { precision: 10, scale: 4 }).notNull(),
        currentPrice: decimal("currentPrice", { precision: 10, scale: 4 }).notNull(),
        marketValue: decimal("marketValue", { precision: 15, scale: 2 }).notNull(),
        floatPnl: decimal("floatPnl", { precision: 15, scale: 2 }).notNull(),
        returnRate: decimal("returnRate", { precision: 8, scale: 6 }).notNull(),
        entryDate: varchar2("entryDate", { length: 10 }).notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        backtestRecordIdIdx: index("position_snapshots_backtestRecordId_idx").on(table.backtestRecordId),
        snapshotDateIdx: index("position_snapshots_snapshotDate_idx").on(table.snapshotDate),
        symbolIdx: index("position_snapshots_symbol_idx").on(table.symbol),
        fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade")
      })
    );
    riskAlerts = mysqlTable2(
      "risk_alerts",
      {
        id: int2("id").autoincrement().primaryKey(),
        backtestRecordId: int2("backtestRecordId").notNull(),
        level: mysqlEnum2("level", ["INFO", "WARNING", "CRITICAL"]).notNull(),
        rule: varchar2("rule", { length: 255 }).notNull(),
        // 触发规则
        detail: text2("detail").notNull(),
        // 详细说明
        metric: varchar2("metric", { length: 128 }),
        // 相关指标
        value: decimal("value", { precision: 15, scale: 6 }),
        // 指标值
        threshold: decimal("threshold", { precision: 15, scale: 6 }),
        // 阈值
        alertDate: varchar2("alertDate", { length: 10 }).notNull(),
        alertTime: varchar2("alertTime", { length: 8 }).notNull(),
        resolved: boolean("resolved").default(false).notNull(),
        resolvedAt: timestamp2("resolvedAt"),
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        backtestRecordIdIdx: index("risk_alerts_backtestRecordId_idx").on(table.backtestRecordId),
        levelIdx: index("risk_alerts_level_idx").on(table.level),
        alertDateIdx: index("risk_alerts_alertDate_idx").on(table.alertDate),
        fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade")
      })
    );
    monthlyReturns = mysqlTable2(
      "monthly_returns",
      {
        id: int2("id").autoincrement().primaryKey(),
        backtestRecordId: int2("backtestRecordId").notNull(),
        year: int2("year").notNull(),
        month: int2("month").notNull(),
        // 1-12
        returnRate: decimal("returnRate", { precision: 8, scale: 6 }).notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        backtestRecordIdIdx: index("monthly_returns_backtestRecordId_idx").on(table.backtestRecordId),
        yearMonthIdx: uniqueIndex("monthly_returns_backtestRecordId_year_month_idx").on(
          table.backtestRecordId,
          table.year,
          table.month
        ),
        fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade")
      })
    );
    backups = mysqlTable2(
      "backups",
      {
        id: int2("id").autoincrement().primaryKey(),
        userId: int2("userId"),
        backupType: mysqlEnum2("backupType", ["full", "incremental", "manual"]).default("manual").notNull(),
        status: mysqlEnum2("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
        recordCount: int2("recordCount").default(0).notNull(),
        fileSize: int2("fileSize").default(0).notNull(),
        // 字节
        backupPath: varchar2("backupPath", { length: 512 }),
        startTime: timestamp2("startTime"),
        endTime: timestamp2("endTime"),
        errorMessage: text2("errorMessage"),
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        userIdIdx: index("backups_userId_idx").on(table.userId),
        statusIdx: index("backups_status_idx").on(table.status),
        fk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null")
      })
    );
    benchmarkIndices = mysqlTable2(
      "benchmark_indices",
      {
        id: int2("id").autoincrement().primaryKey(),
        code: varchar2("code", { length: 32 }).notNull().unique(),
        // 指数代码 (000300, 000905 等)
        name: varchar2("name", { length: 255 }).notNull(),
        // 指数名称
        description: text2("description"),
        category: mysqlEnum2("category", ["stock", "bond", "commodity", "crypto"]).default("stock").notNull(),
        isActive: boolean("isActive").default(true).notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      }
    );
    benchmarkData = mysqlTable2(
      "benchmark_data",
      {
        id: int2("id").autoincrement().primaryKey(),
        benchmarkIndexId: int2("benchmarkIndexId").notNull(),
        date: varchar2("date", { length: 10 }).notNull(),
        // YYYY-MM-DD
        open: decimal("open", { precision: 15, scale: 4 }).notNull(),
        high: decimal("high", { precision: 15, scale: 4 }).notNull(),
        low: decimal("low", { precision: 15, scale: 4 }).notNull(),
        close: decimal("close", { precision: 15, scale: 4 }).notNull(),
        volume: int2("volume").default(0).notNull(),
        amount: decimal("amount", { precision: 20, scale: 2 }).default("0").notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        benchmarkIdIdx: index("benchmark_data_benchmarkIndexId_idx").on(table.benchmarkIndexId),
        dateIdx: index("benchmark_data_date_idx").on(table.date),
        uniqueIdx: uniqueIndex("benchmark_data_unique_idx").on(table.benchmarkIndexId, table.date),
        fk: foreignKey({ columns: [table.benchmarkIndexId], foreignColumns: [benchmarkIndices.id] }).onDelete("cascade")
      })
    );
    strategyBenchmarks = mysqlTable2(
      "strategy_benchmarks",
      {
        id: int2("id").autoincrement().primaryKey(),
        strategyId: int2("strategyId").notNull(),
        benchmarkIndexId: int2("benchmarkIndexId").notNull(),
        weight: decimal("weight", { precision: 5, scale: 4 }).default("1.0").notNull(),
        // 权重
        isActive: boolean("isActive").default(true).notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        strategyIdIdx: index("strategy_benchmarks_strategyId_idx").on(table.strategyId),
        benchmarkIdIdx: index("strategy_benchmarks_benchmarkIndexId_idx").on(table.benchmarkIndexId),
        uniqueIdx: uniqueIndex("strategy_benchmarks_unique_idx").on(table.strategyId, table.benchmarkIndexId),
        strategyFk: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("cascade"),
        benchmarkFk: foreignKey({ columns: [table.benchmarkIndexId], foreignColumns: [benchmarkIndices.id] }).onDelete("cascade")
      })
    );
    benchmarkAnalysis = mysqlTable2(
      "benchmark_analysis",
      {
        id: int2("id").autoincrement().primaryKey(),
        backtestRecordId: int2("backtestRecordId").notNull(),
        benchmarkIndexId: int2("benchmarkIndexId").notNull(),
        // 基准指数收益
        benchmarkReturn: decimal("benchmarkReturn", { precision: 10, scale: 6 }).notNull(),
        // 基准收益率
        benchmarkAnnualReturn: decimal("benchmarkAnnualReturn", { precision: 10, scale: 6 }).notNull(),
        benchmarkMaxDrawdown: decimal("benchmarkMaxDrawdown", { precision: 10, scale: 6 }).notNull(),
        benchmarkSharpe: decimal("benchmarkSharpe", { precision: 10, scale: 6 }).notNull(),
        benchmarkVolatility: decimal("benchmarkVolatility", { precision: 10, scale: 6 }).notNull(),
        // 超额收益指标
        excessReturn: decimal("excessReturn", { precision: 10, scale: 6 }).notNull(),
        // 超额收益
        excessAnnualReturn: decimal("excessAnnualReturn", { precision: 10, scale: 6 }).notNull(),
        informationRatio: decimal("informationRatio", { precision: 10, scale: 6 }).notNull(),
        // 信息比率
        trackingError: decimal("trackingError", { precision: 10, scale: 6 }).notNull(),
        // 跟踪误差
        // 风险调整后指标
        alpha: decimal("alpha", { precision: 10, scale: 6 }).notNull(),
        // 詹森指标
        beta: decimal("beta", { precision: 10, scale: 6 }).notNull(),
        // 贝塔系数
        correlation: decimal("correlation", { precision: 10, scale: 6 }).notNull(),
        // 相关系数
        // 胜率指标
        outperformDays: int2("outperformDays").default(0).notNull(),
        // 跑赢天数
        totalTradingDays: int2("totalTradingDays").default(0).notNull(),
        winRate: decimal("winRate", { precision: 5, scale: 4 }).default("0").notNull(),
        // 胜率
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        backtestIdIdx: index("benchmark_analysis_backtestRecordId_idx").on(table.backtestRecordId),
        benchmarkIdIdx: index("benchmark_analysis_benchmarkIndexId_idx").on(table.benchmarkIndexId),
        uniqueIdx: uniqueIndex("benchmark_analysis_unique_idx").on(table.backtestRecordId, table.benchmarkIndexId),
        backtestFk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
        benchmarkFk: foreignKey({ columns: [table.benchmarkIndexId], foreignColumns: [benchmarkIndices.id] }).onDelete("cascade")
      })
    );
    tradingAccounts = mysqlTable2(
      "trading_accounts",
      {
        id: int2("id").autoincrement().primaryKey(),
        userId: int2("userId").notNull(),
        strategyId: int2("strategyId"),
        // 账户基本信息
        accountName: varchar2("accountName", { length: 255 }).notNull(),
        // 账户名称
        accountType: mysqlEnum2("accountType", ["qmt", "xtp", "ctp", "other"]).notNull(),
        // 接口类型
        accountCode: varchar2("accountCode", { length: 64 }).notNull().unique(),
        // 账户代码
        isSimulated: boolean("isSimulated").default(false).notNull(),
        // 是否为模拟账户
        // 连接状态
        isConnected: boolean("isConnected").default(false).notNull(),
        lastConnectedAt: timestamp2("lastConnectedAt"),
        connectionStatus: mysqlEnum2("connectionStatus", ["connected", "disconnected", "error"]).default("disconnected").notNull(),
        errorMessage: text2("errorMessage"),
        // 账户资产信息
        totalAssets: decimal("totalAssets", { precision: 20, scale: 2 }).default("0").notNull(),
        // 总资产
        availableCash: decimal("availableCash", { precision: 20, scale: 2 }).default("0").notNull(),
        // 可用资金
        marketValue: decimal("marketValue", { precision: 20, scale: 2 }).default("0").notNull(),
        // 市值
        // 配置信息
        config: json2("config"),
        // 连接配置（加密存储）
        isActive: boolean("isActive").default(true).notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        userIdIdx: index("trading_accounts_userId_idx").on(table.userId),
        strategyIdIdx: index("trading_accounts_strategyId_idx").on(table.strategyId),
        accountCodeIdx: index("trading_accounts_accountCode_idx").on(table.accountCode),
        userStrategyIdx: uniqueIndex("trading_accounts_user_strategy_idx").on(table.userId, table.strategyId),
        userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
        strategyFk: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("set null")
      })
    );
    marketData = mysqlTable2(
      "market_data",
      {
        id: int2("id").autoincrement().primaryKey(),
        accountId: int2("accountId").notNull(),
        // 行情信息
        symbol: varchar2("symbol", { length: 32 }).notNull(),
        // 证券代码
        name: varchar2("name", { length: 255 }),
        // 证券名称
        price: decimal("price", { precision: 15, scale: 4 }).notNull(),
        // 最新价
        bid: decimal("bid", { precision: 15, scale: 4 }),
        // 买一价
        ask: decimal("ask", { precision: 15, scale: 4 }),
        // 卖一价
        volume: int2("volume").default(0).notNull(),
        // 成交量
        amount: decimal("amount", { precision: 20, scale: 2 }).default("0").notNull(),
        // 成交额
        // 涨跌信息
        change: decimal("change", { precision: 10, scale: 4 }),
        // 涨跌
        changePercent: decimal("changePercent", { precision: 10, scale: 4 }),
        // 涨跌幅
        timestamp: timestamp2("timestamp").notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull()
      },
      (table) => ({
        accountIdIdx: index("market_data_accountId_idx").on(table.accountId),
        symbolIdx: index("market_data_symbol_idx").on(table.symbol),
        timestampIdx: index("market_data_timestamp_idx").on(table.timestamp),
        accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade")
      })
    );
    orders = mysqlTable2(
      "orders",
      {
        id: int2("id").autoincrement().primaryKey(),
        accountId: int2("accountId").notNull(),
        // 订单基本信息
        orderId: varchar2("orderId", { length: 64 }).notNull().unique(),
        // 交易所订单号
        symbol: varchar2("symbol", { length: 32 }).notNull(),
        // 证券代码
        side: mysqlEnum2("side", ["buy", "sell"]).notNull(),
        // 买卖方向
        quantity: int2("quantity").notNull(),
        // 订单数量
        price: decimal("price", { precision: 15, scale: 4 }).notNull(),
        // 订单价格
        // 订单状态
        status: mysqlEnum2("status", ["pending", "partial", "filled", "cancelled", "rejected"]).notNull(),
        filledQuantity: int2("filledQuantity").default(0).notNull(),
        // 成交数量
        filledPrice: decimal("filledPrice", { precision: 15, scale: 4 }),
        // 成交价格
        // 时间信息
        submitTime: timestamp2("submitTime").notNull(),
        fillTime: timestamp2("fillTime"),
        cancelTime: timestamp2("cancelTime"),
        // 费用
        commission: decimal("commission", { precision: 15, scale: 4 }).default("0").notNull(),
        // 手续费
        errorMessage: text2("errorMessage"),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        accountIdIdx: index("orders_accountId_idx").on(table.accountId),
        symbolIdx: index("orders_symbol_idx").on(table.symbol),
        statusIdx: index("orders_status_idx").on(table.status),
        orderIdIdx: index("orders_orderId_idx").on(table.orderId),
        accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade")
      })
    );
    livePositions = mysqlTable2(
      "live_positions",
      {
        id: int2("id").autoincrement().primaryKey(),
        accountId: int2("accountId").notNull(),
        // 持仓信息
        symbol: varchar2("symbol", { length: 32 }).notNull(),
        // 证券代码
        name: varchar2("name", { length: 255 }),
        // 证券名称
        quantity: int2("quantity").notNull(),
        // 持仓数量
        costPrice: decimal("costPrice", { precision: 15, scale: 4 }).notNull(),
        // 成本价
        currentPrice: decimal("currentPrice", { precision: 15, scale: 4 }).notNull(),
        // 当前价
        // 盈亏信息
        marketValue: decimal("marketValue", { precision: 20, scale: 2 }).notNull(),
        // 市值
        floatingProfit: decimal("floatingProfit", { precision: 20, scale: 2 }).notNull(),
        // 浮动盈亏
        floatingProfitPercent: decimal("floatingProfitPercent", { precision: 10, scale: 4 }).notNull(),
        // 浮动盈亏率
        // 时间信息
        openDate: timestamp2("openDate").notNull(),
        // 开仓日期
        lastUpdateTime: timestamp2("lastUpdateTime").defaultNow().notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        accountIdIdx: index("live_positions_accountId_idx").on(table.accountId),
        symbolIdx: index("live_positions_symbol_idx").on(table.symbol),
        accountSymbolIdx: uniqueIndex("live_positions_account_symbol_idx").on(table.accountId, table.symbol),
        accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade")
      })
    );
    tradeLogs = mysqlTable2(
      "trade_logs",
      {
        id: int2("id").autoincrement().primaryKey(),
        accountId: int2("accountId").notNull(),
        orderId: varchar2("orderId", { length: 64 }),
        // 事件信息
        eventType: mysqlEnum2("eventType", [
          "order_submitted",
          "order_filled",
          "order_cancelled",
          "order_rejected",
          "position_opened",
          "position_closed",
          "account_connected",
          "account_disconnected",
          "error"
        ]).notNull(),
        // 详细信息
        symbol: varchar2("symbol", { length: 32 }),
        quantity: int2("quantity"),
        price: decimal("price", { precision: 15, scale: 4 }),
        description: text2("description"),
        timestamp: timestamp2("timestamp").defaultNow().notNull()
      },
      (table) => ({
        accountIdIdx: index("trade_logs_accountId_idx").on(table.accountId),
        eventTypeIdx: index("trade_logs_eventType_idx").on(table.eventType),
        timestampIdx: index("trade_logs_timestamp_idx").on(table.timestamp),
        accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade")
      })
    );
    parameterScanConfigs = mysqlTable2(
      "parameter_scan_configs",
      {
        id: int2("id").autoincrement().primaryKey(),
        userId: int2("userId").notNull(),
        strategyId: int2("strategyId").notNull(),
        // 扫描基本信息
        name: varchar2("name", { length: 255 }).notNull(),
        // 扫描任务名称
        description: text2("description"),
        // 扫描算法
        algorithm: mysqlEnum2("algorithm", ["grid_search", "bayesian_optimization"]).default("grid_search").notNull(),
        // 参数范围配置 (JSON 格式)
        parameterRanges: json2("parameterRanges").notNull(),
        // { "param1": { "min": 0.1, "max": 0.9, "step": 0.1 }, ... }
        // 优化目标
        objectiveMetric: mysqlEnum2("objectiveMetric", [
          "total_return",
          "sharpe_ratio",
          "max_drawdown",
          "win_rate",
          "profit_factor"
        ]).default("sharpe_ratio").notNull(),
        // 扫描配置
        maxIterations: int2("maxIterations").default(100).notNull(),
        // 最大迭代次数
        populationSize: int2("populationSize").default(20).notNull(),
        // 种群大小（贝叶斯优化）
        // 状态
        status: mysqlEnum2("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
        progress: decimal("progress", { precision: 5, scale: 2 }).default("0").notNull(),
        // 进度百分比
        // 时间信息
        startedAt: timestamp2("startedAt"),
        completedAt: timestamp2("completedAt"),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        userIdIdx: index("param_scan_configs_userId_idx").on(table.userId),
        strategyIdIdx: index("param_scan_configs_strategyId_idx").on(table.strategyId),
        statusIdx: index("param_scan_configs_status_idx").on(table.status),
        userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
        strategyFk: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("cascade")
      })
    );
    parameterScanResults = mysqlTable2(
      "parameter_scan_results",
      {
        id: int2("id").autoincrement().primaryKey(),
        scanConfigId: int2("scanConfigId").notNull(),
        // 迭代信息
        iteration: int2("iteration").notNull(),
        // 迭代次数
        // 参数值 (JSON 格式)
        parameters: json2("parameters").notNull(),
        // { "param1": 0.5, "param2": 0.3, ... }
        // 评估结果
        objectiveValue: decimal("objectiveValue", { precision: 15, scale: 6 }).notNull(),
        // 目标函数值
        // 详细指标
        metrics: json2("metrics").notNull(),
        // { "total_return": 0.15, "sharpe_ratio": 1.5, "max_drawdown": -0.1, ... }
        // 回测信息
        backtestRecordId: int2("backtestRecordId"),
        // 状态
        status: mysqlEnum2("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
        errorMessage: text2("errorMessage"),
        // 时间信息
        startedAt: timestamp2("startedAt"),
        completedAt: timestamp2("completedAt"),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        scanConfigIdIdx: index("param_scan_results_scanConfigId_idx").on(table.scanConfigId),
        iterationIdx: index("param_scan_results_iteration_idx").on(table.iteration),
        statusIdx: index("param_scan_results_status_idx").on(table.status),
        scanConfigFk: foreignKey({ columns: [table.scanConfigId], foreignColumns: [parameterScanConfigs.id] }).onDelete("cascade"),
        backtestRecordFk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("set null")
      })
    );
    parameterScanOptimalResults = mysqlTable2(
      "parameter_scan_optimal_results",
      {
        id: int2("id").autoincrement().primaryKey(),
        scanConfigId: int2("scanConfigId").notNull().unique(),
        // 最优参数
        parameters: json2("parameters").notNull(),
        // { "param1": 0.5, "param2": 0.3, ... }
        // 最优指标
        objectiveValue: decimal("objectiveValue", { precision: 15, scale: 6 }).notNull(),
        metrics: json2("metrics").notNull(),
        // 排名信息
        rank: int2("rank").notNull(),
        // 在所有结果中的排名
        improvement: decimal("improvement", { precision: 10, scale: 4 }).notNull(),
        // 相对基础参数的改进百分比
        // 时间信息
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        scanConfigIdIdx: index("param_scan_optimal_scanConfigId_idx").on(table.scanConfigId),
        scanConfigFk: foreignKey({ columns: [table.scanConfigId], foreignColumns: [parameterScanConfigs.id], name: "param_scan_optimal_fk" }).onDelete("cascade")
      })
    );
    securities = mysqlTable2(
      "securities",
      {
        id: int2("id").autoincrement().primaryKey(),
        symbol: varchar2("symbol", { length: 32 }).notNull().unique(),
        exchange: mysqlEnum2("exchange", ["SSE", "SZSE", "BSE", "HKEX", "US", "OTHER"]).notNull(),
        market: varchar2("market", { length: 32 }).default("CN_A").notNull(),
        assetType: mysqlEnum2("assetType", ["stock", "index", "etf", "fund", "bond", "convertible", "other"]).default("stock").notNull(),
        name: varchar2("name", { length: 255 }),
        currency: varchar2("currency", { length: 8 }).default("CNY").notNull(),
        listStatus: mysqlEnum2("listStatus", ["listed", "delisted", "suspended", "other"]).default("listed").notNull(),
        metadata: json2("metadata"),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        symbolIdx: uniqueIndex("securities_symbol_idx").on(table.symbol),
        exchangeIdx: index("securities_exchange_idx").on(table.exchange),
        assetTypeIdx: index("securities_assetType_idx").on(table.assetType)
      })
    );
    stockDailyBars = mysqlTable2(
      "stock_daily_bars",
      {
        id: int2("id").autoincrement().primaryKey(),
        securityId: int2("securityId").notNull(),
        tradeDate: varchar2("tradeDate", { length: 10 }).notNull(),
        // YYYY-MM-DD
        adjustmentType: mysqlEnum2("adjustmentType", ["none", "front_ratio", "back_ratio"]).default("front_ratio").notNull(),
        open: decimal("open", { precision: 18, scale: 6 }).notNull(),
        high: decimal("high", { precision: 18, scale: 6 }).notNull(),
        low: decimal("low", { precision: 18, scale: 6 }).notNull(),
        close: decimal("close", { precision: 18, scale: 6 }).notNull(),
        volume: decimal("volume", { precision: 24, scale: 0 }).default("0").notNull(),
        amount: decimal("amount", { precision: 24, scale: 4 }).default("0").notNull(),
        turnoverRate: decimal("turnoverRate", { precision: 12, scale: 6 }),
        amplitude: decimal("amplitude", { precision: 12, scale: 6 }),
        changePercent: decimal("changePercent", { precision: 12, scale: 6 }),
        dataSource: varchar2("dataSource", { length: 32 }).default("xtdata").notNull(),
        createdAt: timestamp2("createdAt").defaultNow().notNull(),
        updatedAt: timestamp2("updatedAt").defaultNow().onUpdateNow().notNull()
      },
      (table) => ({
        securityDateAdjIdx: uniqueIndex("stock_daily_bars_security_date_adj_idx").on(
          table.securityId,
          table.tradeDate,
          table.adjustmentType
        ),
        securityDateIdx: index("stock_daily_bars_security_date_idx").on(table.securityId, table.tradeDate),
        tradeDateIdx: index("stock_daily_bars_tradeDate_idx").on(table.tradeDate),
        securityFk: foreignKey({ columns: [table.securityId], foreignColumns: [securities.id] }).onDelete("cascade")
      })
    );
  }
});

// server/paperclip-bootstrap.ts
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
async function tableExists(db, tableName) {
  const raw = await db.execute(
    sql.raw(`SHOW TABLES LIKE '${tableName.replace(/'/g, "''")}'`)
  );
  return Array.isArray(raw[0]) && raw[0].length > 0;
}
function splitStatements(sqlText) {
  const sanitized = sqlText.split(/\r?\n/).map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("--")) {
      return "";
    }
    return line;
  }).join("\n");
  return sanitized.split(/;\s*(?:\r?\n|$)/).map((stmt) => stmt.trim()).filter(Boolean);
}
async function ensurePaperclipSchema(db) {
  if (schemaReady) {
    return;
  }
  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }
  bootstrapPromise = (async () => {
    const hasCompanies = await tableExists(db, "pc_companies");
    if (!hasCompanies) {
      const script = await readFile(MIGRATION_FILES[0], "utf-8");
      const statements = splitStatements(script);
      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
    }
    const hasExtensions = await tableExists(db, "pc_heartbeat_run_events");
    if (!hasExtensions) {
      const script = await readFile(MIGRATION_FILES[1], "utf-8");
      const statements = splitStatements(script);
      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
    }
    schemaReady = true;
  })().finally(() => {
    bootstrapPromise = null;
  });
  await bootstrapPromise;
}
var __dirname, MIGRATION_FILES, schemaReady, bootstrapPromise;
var init_paperclip_bootstrap = __esm({
  "server/paperclip-bootstrap.ts"() {
    "use strict";
    __dirname = path2.dirname(fileURLToPath2(import.meta.url));
    MIGRATION_FILES = [
      path2.resolve(__dirname, "../drizzle/migrations/0009_paperclip_agent_orchestration.sql"),
      path2.resolve(__dirname, "../drizzle/migrations/0010_paperclip_extensions.sql")
    ];
    schemaReady = false;
    bootstrapPromise = null;
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  compareBacktestRecords: () => compareBacktestRecords,
  createBacktestRecord: () => createBacktestRecord,
  createBackup: () => createBackup,
  createEquityCurves: () => createEquityCurves,
  createMonthlyReturns: () => createMonthlyReturns,
  createPositionSnapshots: () => createPositionSnapshots,
  createRiskAlerts: () => createRiskAlerts,
  createStrategy: () => createStrategy,
  createTrades: () => createTrades,
  getBacktestRecordById: () => getBacktestRecordById,
  getBacktestRecordsByStrategyId: () => getBacktestRecordsByStrategyId,
  getBacktestRecordsByUserId: () => getBacktestRecordsByUserId,
  getBacktestStatistics: () => getBacktestStatistics,
  getBackupsByUserId: () => getBackupsByUserId,
  getDb: () => getDb,
  getEquityCurvesByBacktestId: () => getEquityCurvesByBacktestId,
  getLatestPositionSnapshot: () => getLatestPositionSnapshot,
  getMonthlyReturnsByBacktestId: () => getMonthlyReturnsByBacktestId,
  getMultipleBacktestRecords: () => getMultipleBacktestRecords,
  getPositionSnapshotsByBacktestId: () => getPositionSnapshotsByBacktestId,
  getRiskAlertsByBacktestId: () => getRiskAlertsByBacktestId,
  getRiskAlertsByLevel: () => getRiskAlertsByLevel,
  getStrategiesByUserId: () => getStrategiesByUserId,
  getStrategyById: () => getStrategyById,
  getTradesByBacktestId: () => getTradesByBacktestId,
  getTradesBySymbol: () => getTradesBySymbol,
  getUserByOpenId: () => getUserByOpenId,
  updateBacktestRecord: () => updateBacktestRecord,
  updateBackup: () => updateBackup,
  updateStrategy: () => updateStrategy,
  upsertUser: () => upsertUser
});
import { eq, desc, and, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
function resolveDatabaseUrl2() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";
  if (!host || !name || !user) {
    return "";
  }
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const auth = password ? `${encodedUser}:${encodedPassword}` : encodedUser;
  return `mysql://${auth}@${host}:${port}/${name}`;
}
async function getDb() {
  const databaseUrl = resolveDatabaseUrl2();
  if (!_db && databaseUrl) {
    try {
      _db = drizzle(databaseUrl);
      schemaInitPromise = ensurePaperclipSchema(_db).catch((error) => {
        console.error("[Paperclip] Failed to bootstrap schema:", error);
        throw error;
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      schemaInitPromise = null;
    }
  }
  if (schemaInitPromise) {
    try {
      await schemaInitPromise;
    } catch {
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createStrategy(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(strategies).values(data);
  return result;
}
async function getStrategiesByUserId(userId) {
  const db = await getDb();
  if (!db) return [];
  if (userId === 0) {
    return await db.select().from(strategies).orderBy(desc(strategies.updatedAt));
  }
  return await db.select().from(strategies).where(eq(strategies.userId, userId)).orderBy(desc(strategies.updatedAt));
}
async function getStrategyById(id) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(strategies).where(eq(strategies.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function updateStrategy(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(strategies).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(strategies.id, id));
}
async function createBacktestRecord(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(backtestRecords).values(data);
  return result;
}
async function getBacktestRecordsByUserId(userId, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  if (userId === 0) {
    return await db.select().from(backtestRecords).orderBy(desc(backtestRecords.createdAt)).limit(limit).offset(offset);
  }
  return await db.select().from(backtestRecords).where(eq(backtestRecords.userId, userId)).orderBy(desc(backtestRecords.createdAt)).limit(limit).offset(offset);
}
async function getBacktestRecordById(id) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(backtestRecords).where(eq(backtestRecords.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function getBacktestRecordsByStrategyId(strategyId, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(backtestRecords).where(eq(backtestRecords.strategyId, strategyId)).orderBy(desc(backtestRecords.createdAt)).limit(limit);
}
async function updateBacktestRecord(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(backtestRecords).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(backtestRecords.id, id));
}
async function createEquityCurves(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(equityCurves).values(data);
}
async function getEquityCurvesByBacktestId(backtestRecordId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(equityCurves).where(eq(equityCurves.backtestRecordId, backtestRecordId)).orderBy(equityCurves.date);
}
async function createTrades(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(trades).values(data);
}
async function getTradesByBacktestId(backtestRecordId, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(trades).where(eq(trades.backtestRecordId, backtestRecordId)).orderBy(desc(trades.tradeDate), desc(trades.tradeTime)).limit(limit).offset(offset);
}
async function getTradesBySymbol(backtestRecordId, symbol) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(trades).where(and(eq(trades.backtestRecordId, backtestRecordId), eq(trades.symbol, symbol))).orderBy(trades.tradeDate);
}
async function createPositionSnapshots(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(positionSnapshots).values(data);
}
async function getPositionSnapshotsByBacktestId(backtestRecordId, snapshotDate) {
  const db = await getDb();
  if (!db) return [];
  if (snapshotDate) {
    return await db.select().from(positionSnapshots).where(and(eq(positionSnapshots.backtestRecordId, backtestRecordId), eq(positionSnapshots.snapshotDate, snapshotDate))).orderBy(desc(positionSnapshots.snapshotDate), positionSnapshots.symbol);
  }
  return await db.select().from(positionSnapshots).where(eq(positionSnapshots.backtestRecordId, backtestRecordId)).orderBy(desc(positionSnapshots.snapshotDate), positionSnapshots.symbol);
}
async function getLatestPositionSnapshot(backtestRecordId) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(positionSnapshots).where(eq(positionSnapshots.backtestRecordId, backtestRecordId)).orderBy(desc(positionSnapshots.snapshotDate)).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function createRiskAlerts(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(riskAlerts).values(data);
}
async function getRiskAlertsByBacktestId(backtestRecordId, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(riskAlerts).where(eq(riskAlerts.backtestRecordId, backtestRecordId)).orderBy(desc(riskAlerts.createdAt)).limit(limit);
}
async function getRiskAlertsByLevel(backtestRecordId, level) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(riskAlerts).where(and(eq(riskAlerts.backtestRecordId, backtestRecordId), eq(riskAlerts.level, level))).orderBy(desc(riskAlerts.createdAt));
}
async function createMonthlyReturns(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(monthlyReturns).values(data);
}
async function getMonthlyReturnsByBacktestId(backtestRecordId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(monthlyReturns).where(eq(monthlyReturns.backtestRecordId, backtestRecordId)).orderBy(monthlyReturns.year, monthlyReturns.month);
}
async function createBackup(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(backups).values(data);
}
async function getBackupsByUserId(userId, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  if (userId === 0) {
    return await db.select().from(backups).orderBy(desc(backups.createdAt)).limit(limit);
  }
  return await db.select().from(backups).where(eq(backups.userId, userId)).orderBy(desc(backups.createdAt)).limit(limit);
}
async function updateBackup(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(backups).set(data).where(eq(backups.id, id));
}
async function compareBacktestRecords(recordIds) {
  const db = await getDb();
  if (!db) return [];
  if (recordIds.length === 0) return [];
  return await db.select().from(backtestRecords).where(inArray(backtestRecords.id, recordIds));
}
async function getMultipleBacktestRecords(recordIds) {
  const db = await getDb();
  if (!db) return [];
  if (recordIds.length === 0) return [];
  return await db.select().from(backtestRecords).where(inArray(backtestRecords.id, recordIds)).orderBy(desc(backtestRecords.createdAt));
}
async function getBacktestStatistics(userId) {
  const db = await getDb();
  if (!db) return null;
  const records = await db.select().from(backtestRecords).where(eq(backtestRecords.userId, userId));
  if (records.length === 0) return null;
  const avgReturn = records.reduce((sum2, r) => sum2 + parseFloat(r.totalReturn.toString()), 0) / records.length;
  const maxReturn = Math.max(...records.map((r) => parseFloat(r.totalReturn.toString())));
  const minReturn = Math.min(...records.map((r) => parseFloat(r.totalReturn.toString())));
  const avgDrawdown = records.reduce((sum2, r) => sum2 + parseFloat(r.maxDrawdown.toString()), 0) / records.length;
  const avgSharpe = records.reduce((sum2, r) => sum2 + parseFloat(r.sharpeRatio.toString()), 0) / records.length;
  return {
    totalBacktests: records.length,
    avgReturn,
    maxReturn,
    minReturn,
    avgDrawdown,
    avgSharpe
  };
}
var _db, schemaInitPromise;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    init_paperclip_bootstrap();
    _db = null;
    schemaInitPromise = null;
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
function formatErrorMessage(message) {
  return message.replace(/[\u0080-\uFFFF]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
var t = initTRPC.context().create({
  transformer: superjson,
  errorFormatter(opts) {
    const { shape, error } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        // 确保错误消息是 ASCII 安全的
        message: formatErrorMessage(error.message)
      }
    };
  }
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/settings-fallback.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
var EMPTY_SETTINGS = {
  sourcePath: null,
  accountId: "",
  xtPluginPath: "",
  indexSymbol: "",
  strategyStopLossRatio: null
};
var cachedSettings = null;
var MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
function parseScalar(rawValue) {
  const value = stripInlineComment(rawValue).trim();
  if (!value) {
    return null;
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1).replace(/\\\\/g, "\\");
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[+-]?\d[\d_]*(\.\d+)?$/.test(value)) {
    const parsed = Number.parseFloat(value.replace(/_/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return value;
}
function stripInlineComment(rawValue) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let result = "";
  for (let i = 0; i < rawValue.length; i += 1) {
    const ch = rawValue[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && inDouble) {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      result += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      result += ch;
      continue;
    }
    if (ch === "#" && !inSingle && !inDouble) {
      break;
    }
    result += ch;
  }
  return result;
}
function asString(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
function parseSettingsYaml(content) {
  const parsed = {
    accountId: "",
    xtPluginPath: "",
    indexSymbol: "",
    strategyStopLossRatio: null
  };
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  let currentSection = "";
  for (const line of lines) {
    const trimmedStart = line.trimStart();
    if (!trimmedStart || trimmedStart.startsWith("#")) {
      continue;
    }
    const indent = line.length - trimmedStart.length;
    const match = trimmedStart.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    const scalar = parseScalar(match[2] ?? "");
    if (indent === 0) {
      currentSection = scalar === null ? key : "";
      if (key === "index") {
        parsed.indexSymbol = asString(scalar);
      }
      continue;
    }
    if (currentSection === "account" && key === "account_id") {
      parsed.accountId = asString(scalar);
      continue;
    }
    if (currentSection === "xt" && key === "plugin_path") {
      parsed.xtPluginPath = asString(scalar);
      continue;
    }
    if (currentSection === "strategy" && key === "stop_loss_ratio") {
      parsed.strategyStopLossRatio = asNumber(scalar);
    }
  }
  return parsed;
}
function getCandidatePaths() {
  const paths = /* @__PURE__ */ new Set();
  const envPath = process.env.QUANT_SETTINGS_PATH?.trim();
  if (envPath) {
    paths.add(path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath));
  }
  paths.add(path.resolve(process.cwd(), "..", "config", "settings.yaml"));
  paths.add(path.resolve(process.cwd(), "config", "settings.yaml"));
  paths.add(path.resolve(MODULE_DIR, "..", "..", "..", "config", "settings.yaml"));
  return Array.from(paths);
}
function loadFromDisk() {
  for (const filePath of getCandidatePaths()) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseSettingsYaml(raw);
      return {
        sourcePath: filePath,
        ...parsed
      };
    } catch (error) {
      console.warn(`[settings-fallback] Failed to parse ${filePath}:`, error);
    }
  }
  return EMPTY_SETTINGS;
}
function getSettingsFallback() {
  if (!cachedSettings) {
    cachedSettings = loadFromDisk();
    if (cachedSettings.sourcePath) {
      console.log(`[settings-fallback] Loaded from ${cachedSettings.sourcePath}`);
    }
  }
  return cachedSettings;
}
var CONFIG_FILE_PATH = path.resolve(MODULE_DIR, "..", "..", "..", "config", "app-settings.json");
async function updateSettingsFile(section, config) {
  const configDir = path.dirname(CONFIG_FILE_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  let existingConfig = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
      existingConfig = JSON.parse(content);
    } catch (error) {
      console.warn("[settings-fallback] Failed to parse existing config, creating new one");
    }
  }
  existingConfig[section] = {
    ...existingConfig[section] || {},
    ...config,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(existingConfig, null, 2), "utf8");
  console.log(`[settings-fallback] Configuration saved: ${section}`);
  if (section === "qmt") {
    await updateSettingsYaml(section, config);
  }
}
function getStoredConfig(section) {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    return section ? {} : {};
  }
  try {
    const content = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    const config = JSON.parse(content);
    return section ? config[section] || {} : config;
  } catch (error) {
    console.warn("[settings-fallback] Failed to read stored config:", error);
    return section ? {} : {};
  }
}
var SETTINGS_YAML_PATH = path.resolve(MODULE_DIR, "..", "..", "..", "config", "settings.yaml");
async function updateSettingsYaml(section, config) {
  if (section !== "qmt") {
    return;
  }
  if (!fs.existsSync(SETTINGS_YAML_PATH)) {
    console.warn("[settings-fallback] settings.yaml not found, skipping YAML update");
    return;
  }
  try {
    const fileContent = fs.readFileSync(SETTINGS_YAML_PATH, "utf8");
    const yamlContent = yaml.load(fileContent) || {};
    if (config.MINIQMT_ACCOUNT_ID) {
      if (!yamlContent.account) {
        yamlContent.account = {};
      }
      yamlContent.account.account_id = config.MINIQMT_ACCOUNT_ID;
    }
    if (config.MINIQMT_PATH) {
      if (!yamlContent.xt) {
        yamlContent.xt = {};
      }
      const normalizedPath = config.MINIQMT_PATH.replace(/\\\\/g, "\\");
      yamlContent.xt.plugin_path = normalizedPath;
    }
    if (config.MINIQMT_SESSION_ID) {
      if (!yamlContent.xt) {
        yamlContent.xt = {};
      }
      yamlContent.xt.session_id = parseInt(config.MINIQMT_SESSION_ID, 10);
    }
    const yamlDump = yaml.dump(yamlContent, {
      indent: 2,
      lineWidth: -1,
      // 不限制行宽
      noRefs: true,
      // 不使用引用
      quotingType: '"',
      forceQuotes: false
    });
    fs.writeFileSync(SETTINGS_YAML_PATH, yamlDump, "utf8");
    console.log(`[settings-fallback] settings.yaml updated with QMT config`);
  } catch (error) {
    console.error("[settings-fallback] Failed to update settings.yaml:", error);
    throw error;
  }
}

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  }),
  // 获取系统配置
  getConfig: publicProcedure.input(
    z.object({
      section: z.enum(["database", "web_api", "qmt", "oauth", "risk"]).optional()
    })
  ).query(({ input }) => {
    const config = getStoredConfig(input.section);
    return {
      success: true,
      config
    };
  }),
  // 保存系统配置
  saveConfig: publicProcedure.input(
    z.object({
      section: z.enum(["database", "web_api", "qmt", "oauth", "risk"]),
      config: z.object({}).passthrough()
    })
  ).mutation(async ({ input }) => {
    try {
      await updateSettingsFile(input.section, input.config);
      return {
        success: true,
        message: `\u914D\u7F6E\u4FDD\u5B58\u6210\u529F\uFF1A${input.section}`
      };
    } catch (error) {
      throw new Error(`\u4FDD\u5B58\u914D\u7F6E\u5931\u8D25\uFF1A${error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF"}`);
    }
  }),
  serverTime: publicProcedure.query(() => {
    const now = /* @__PURE__ */ new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    return {
      serverTime: now.toISOString(),
      unixMillis: now.getTime(),
      timezone
    };
  })
});

// server/routers.ts
init_db();
import { z as z15 } from "zod";

// server/benchmark-db.ts
init_db();
init_schema();
import { eq as eq2, and as and2, desc as desc2, asc, gte as gte2, lte as lte2 } from "drizzle-orm";
async function createBenchmarkIndex(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(benchmarkIndices).values(data);
  return result;
}
async function getBenchmarkIndices(isActive = true) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(benchmarkIndices).where(isActive ? eq2(benchmarkIndices.isActive, true) : void 0).orderBy(asc(benchmarkIndices.code));
}
async function getBenchmarkIndexByCode(code) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(benchmarkIndices).where(eq2(benchmarkIndices.code, code)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getBenchmarkIndexById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(benchmarkIndices).where(eq2(benchmarkIndices.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getBenchmarkDataByDateRange(benchmarkIndexId, startDate, endDate) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(benchmarkData).where(
    and2(
      eq2(benchmarkData.benchmarkIndexId, benchmarkIndexId),
      gte2(benchmarkData.date, startDate),
      lte2(benchmarkData.date, endDate)
    )
  ).orderBy(asc(benchmarkData.date));
}
async function createStrategyBenchmark(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(strategyBenchmarks).values(data);
}
async function getStrategyBenchmarks(strategyId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    id: strategyBenchmarks.id,
    benchmarkIndexId: strategyBenchmarks.benchmarkIndexId,
    benchmarkCode: benchmarkIndices.code,
    benchmarkName: benchmarkIndices.name,
    weight: strategyBenchmarks.weight,
    isActive: strategyBenchmarks.isActive
  }).from(strategyBenchmarks).innerJoin(
    benchmarkIndices,
    eq2(strategyBenchmarks.benchmarkIndexId, benchmarkIndices.id)
  ).where(eq2(strategyBenchmarks.strategyId, strategyId));
}
async function deleteStrategyBenchmark(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.delete(strategyBenchmarks).where(eq2(strategyBenchmarks.id, id));
}
async function createBenchmarkAnalysis(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(benchmarkAnalysis).values(data);
}
async function getBenchmarkAnalysisByBacktest(backtestRecordId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    id: benchmarkAnalysis.id,
    benchmarkIndexId: benchmarkAnalysis.benchmarkIndexId,
    benchmarkCode: benchmarkIndices.code,
    benchmarkName: benchmarkIndices.name,
    benchmarkReturn: benchmarkAnalysis.benchmarkReturn,
    benchmarkAnnualReturn: benchmarkAnalysis.benchmarkAnnualReturn,
    benchmarkMaxDrawdown: benchmarkAnalysis.benchmarkMaxDrawdown,
    benchmarkSharpe: benchmarkAnalysis.benchmarkSharpe,
    benchmarkVolatility: benchmarkAnalysis.benchmarkVolatility,
    excessReturn: benchmarkAnalysis.excessReturn,
    excessAnnualReturn: benchmarkAnalysis.excessAnnualReturn,
    informationRatio: benchmarkAnalysis.informationRatio,
    trackingError: benchmarkAnalysis.trackingError,
    alpha: benchmarkAnalysis.alpha,
    beta: benchmarkAnalysis.beta,
    correlation: benchmarkAnalysis.correlation,
    outperformDays: benchmarkAnalysis.outperformDays,
    totalTradingDays: benchmarkAnalysis.totalTradingDays,
    winRate: benchmarkAnalysis.winRate
  }).from(benchmarkAnalysis).innerJoin(
    benchmarkIndices,
    eq2(benchmarkAnalysis.benchmarkIndexId, benchmarkIndices.id)
  ).where(eq2(benchmarkAnalysis.backtestRecordId, backtestRecordId));
}
async function getBenchmarkAnalysisByBacktestAndBenchmark(backtestRecordId, benchmarkIndexId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(benchmarkAnalysis).where(
    and2(
      eq2(benchmarkAnalysis.backtestRecordId, backtestRecordId),
      eq2(benchmarkAnalysis.benchmarkIndexId, benchmarkIndexId)
    )
  ).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function initializeDefaultBenchmarks() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const defaultBenchmarks = [
    {
      code: "000300",
      name: "\u6CAA\u6DF1 300",
      description: "\u6CAA\u6DF1 300 \u6307\u6570",
      category: "stock"
    },
    {
      code: "000905",
      name: "\u4E2D\u8BC1 500",
      description: "\u4E2D\u8BC1 500 \u6307\u6570",
      category: "stock"
    },
    {
      code: "000852",
      name: "\u4E2D\u8BC1 1000",
      description: "\u4E2D\u8BC1 1000 \u6307\u6570",
      category: "stock"
    },
    {
      code: "399001",
      name: "\u6DF1\u8BC1\u6210\u6307",
      description: "\u6DF1\u8BC1\u6210\u5206\u6307\u6570",
      category: "stock"
    },
    {
      code: "000001",
      name: "\u4E0A\u8BC1\u6307\u6570",
      description: "\u4E0A\u6D77\u8BC1\u5238\u4EA4\u6613\u6240\u7EFC\u5408\u80A1\u4EF7\u6307\u6570",
      category: "stock"
    }
  ];
  const results = [];
  for (const benchmark of defaultBenchmarks) {
    try {
      const existing = await getBenchmarkIndexByCode(benchmark.code);
      if (!existing) {
        const result = await createBenchmarkIndex({
          ...benchmark,
          isActive: true
        });
        results.push({ success: true, code: benchmark.code });
      }
    } catch (error) {
      results.push({ success: false, code: benchmark.code, error });
    }
  }
  return results;
}

// server/benchmark-calculator.ts
init_db();
function calculateAnnualReturn(totalReturn, tradingDays) {
  if (tradingDays === 0) return 0;
  const years = tradingDays / 252;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}
function calculateMaxDrawdown(returns) {
  if (returns.length === 0) return 0;
  let maxDrawdown = 0;
  let peak = 1;
  for (const ret of returns) {
    peak = Math.max(peak, peak * (1 + ret));
    const drawdown = (peak - peak * (1 + ret)) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  return maxDrawdown;
}
function calculateVolatility(returns) {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum2, ret) => sum2 + Math.pow(ret - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  return stdDev * Math.sqrt(252);
}
function calculateSharpe(returns, riskFreeRate = 0.02) {
  if (returns.length === 0) return 0;
  const totalReturn = returns.reduce((a, b) => a * (1 + b), 1) - 1;
  const annualReturn = calculateAnnualReturn(totalReturn, returns.length);
  const volatility = calculateVolatility(returns);
  if (volatility === 0) return 0;
  return (annualReturn - riskFreeRate) / volatility;
}
function calculateCorrelation(series1, series2) {
  if (series1.length !== series2.length || series1.length < 2) return 0;
  const n = series1.length;
  const mean1 = series1.reduce((a, b) => a + b, 0) / n;
  const mean2 = series2.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator1 = 0;
  let denominator2 = 0;
  for (let i = 0; i < n; i++) {
    const dev1 = series1[i] - mean1;
    const dev2 = series2[i] - mean2;
    numerator += dev1 * dev2;
    denominator1 += dev1 * dev1;
    denominator2 += dev2 * dev2;
  }
  const denominator = Math.sqrt(denominator1 * denominator2);
  if (denominator === 0) return 0;
  return numerator / denominator;
}
function calculateBeta(strategyReturns, benchmarkReturns) {
  if (strategyReturns.length !== benchmarkReturns.length || strategyReturns.length < 2) {
    return 0;
  }
  const n = strategyReturns.length;
  const benchmarkMean = benchmarkReturns.reduce((a, b) => a + b, 0) / n;
  let covariance = 0;
  let benchmarkVariance = 0;
  for (let i = 0; i < n; i++) {
    const benchmarkDev = benchmarkReturns[i] - benchmarkMean;
    covariance += (strategyReturns[i] - benchmarkMean) * benchmarkDev;
    benchmarkVariance += benchmarkDev * benchmarkDev;
  }
  if (benchmarkVariance === 0) return 0;
  return covariance / benchmarkVariance;
}
function calculateAlpha(strategyReturn, benchmarkReturn, beta, riskFreeRate = 0.02) {
  return strategyReturn - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate));
}
function calculateTrackingError(strategyReturns, benchmarkReturns) {
  if (strategyReturns.length !== benchmarkReturns.length) return 0;
  const differences = strategyReturns.map((sr, i) => sr - benchmarkReturns[i]);
  const variance = differences.reduce((sum2, diff) => sum2 + diff * diff, 0) / differences.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}
function calculateInformationRatio(excessReturn, trackingError) {
  if (trackingError === 0) return 0;
  return excessReturn / trackingError;
}
function calculateWinRate(strategyReturns, benchmarkReturns) {
  if (strategyReturns.length !== benchmarkReturns.length) {
    return { outperformDays: 0, winRate: 0 };
  }
  let outperformDays = 0;
  for (let i = 0; i < strategyReturns.length; i++) {
    if (strategyReturns[i] > benchmarkReturns[i]) {
      outperformDays++;
    }
  }
  return {
    outperformDays,
    winRate: strategyReturns.length > 0 ? outperformDays / strategyReturns.length : 0
  };
}
async function calculateBenchmarkAnalysis(backtestRecordId, benchmarkIndexId) {
  try {
    const backtestRecord = await getBacktestRecordById(backtestRecordId);
    if (!backtestRecord) {
      console.error(`Backtest record ${backtestRecordId} not found`);
      return null;
    }
    const equityCurves2 = await getEquityCurvesByBacktestId(backtestRecordId);
    if (equityCurves2.length === 0) {
      console.error(`No equity curves found for backtest ${backtestRecordId}`);
      return null;
    }
    const benchmarkIndex = await getBenchmarkIndexById(benchmarkIndexId);
    if (!benchmarkIndex) {
      console.error(`Benchmark index ${benchmarkIndexId} not found`);
      return null;
    }
    const firstDate = equityCurves2[0].date;
    const lastDate = equityCurves2[equityCurves2.length - 1].date;
    const benchmarkDataPoints = await getBenchmarkDataByDateRange(
      benchmarkIndexId,
      firstDate,
      lastDate
    );
    if (benchmarkDataPoints.length === 0) {
      console.error(`No benchmark data found for period ${firstDate} to ${lastDate}`);
      return null;
    }
    const strategyReturns = [];
    const benchmarkReturns = [];
    let prevStrategyNav = 1;
    let prevBenchmarkClose = parseFloat(benchmarkDataPoints[0].close.toString());
    for (const curve of equityCurves2) {
      const benchmarkData2 = benchmarkDataPoints.find((bd) => bd.date === curve.date);
      if (benchmarkData2) {
        const strategyReturn = (curve.nav - prevStrategyNav) / prevStrategyNav;
        const benchmarkCloseNum = parseFloat(benchmarkData2.close.toString());
        const benchmarkReturn = (benchmarkCloseNum - prevBenchmarkClose) / prevBenchmarkClose;
        strategyReturns.push(strategyReturn);
        benchmarkReturns.push(benchmarkReturn);
        prevStrategyNav = curve.nav;
        prevBenchmarkClose = benchmarkCloseNum;
      }
    }
    if (strategyReturns.length === 0) {
      console.error("No aligned data for comparison");
      return null;
    }
    const strategyTotalReturn = equityCurves2[equityCurves2.length - 1].nav - 1;
    const lastBenchmarkClose = parseFloat(benchmarkDataPoints[benchmarkDataPoints.length - 1].close.toString());
    const firstBenchmarkClose = parseFloat(benchmarkDataPoints[0].close.toString());
    const benchmarkTotalReturn = (lastBenchmarkClose - firstBenchmarkClose) / firstBenchmarkClose;
    const tradingDays = equityCurves2.length;
    const benchmarkAnnualReturn = calculateAnnualReturn(benchmarkTotalReturn, tradingDays);
    const benchmarkVolatility = calculateVolatility(benchmarkReturns);
    const benchmarkSharpe = calculateSharpe(benchmarkReturns);
    const benchmarkMaxDrawdown = calculateMaxDrawdown(benchmarkReturns);
    const strategyAnnualReturn = calculateAnnualReturn(strategyTotalReturn, tradingDays);
    const excessReturn = strategyTotalReturn - benchmarkTotalReturn;
    const excessAnnualReturn = strategyAnnualReturn - benchmarkAnnualReturn;
    const beta = calculateBeta(strategyReturns, benchmarkReturns);
    const alpha = calculateAlpha(strategyAnnualReturn, benchmarkAnnualReturn, beta);
    const correlation = calculateCorrelation(strategyReturns, benchmarkReturns);
    const trackingError = calculateTrackingError(strategyReturns, benchmarkReturns);
    const informationRatio = calculateInformationRatio(excessAnnualReturn, trackingError);
    const { outperformDays, winRate } = calculateWinRate(strategyReturns, benchmarkReturns);
    return {
      benchmarkReturn: benchmarkTotalReturn,
      benchmarkAnnualReturn,
      benchmarkMaxDrawdown,
      benchmarkSharpe,
      benchmarkVolatility,
      excessReturn,
      excessAnnualReturn,
      informationRatio,
      trackingError,
      alpha,
      beta,
      correlation,
      outperformDays,
      totalTradingDays: tradingDays,
      winRate
    };
  } catch (error) {
    console.error("Error calculating benchmark analysis:", error);
    return null;
  }
}
async function calculateMultipleBenchmarkAnalysis(backtestRecordId, benchmarkIndexIds) {
  const results = [];
  for (const benchmarkIndexId of benchmarkIndexIds) {
    const analysis = await calculateBenchmarkAnalysis(backtestRecordId, benchmarkIndexId);
    if (analysis) {
      results.push({
        backtestRecordId,
        benchmarkIndexId,
        benchmarkReturn: analysis.benchmarkReturn.toString(),
        benchmarkAnnualReturn: analysis.benchmarkAnnualReturn.toString(),
        benchmarkMaxDrawdown: analysis.benchmarkMaxDrawdown.toString(),
        benchmarkSharpe: analysis.benchmarkSharpe.toString(),
        benchmarkVolatility: analysis.benchmarkVolatility.toString(),
        excessReturn: analysis.excessReturn.toString(),
        excessAnnualReturn: analysis.excessAnnualReturn.toString(),
        informationRatio: analysis.informationRatio.toString(),
        trackingError: analysis.trackingError.toString(),
        alpha: analysis.alpha.toString(),
        beta: analysis.beta.toString(),
        correlation: analysis.correlation.toString(),
        outperformDays: analysis.outperformDays,
        totalTradingDays: analysis.totalTradingDays,
        winRate: analysis.winRate.toString()
      });
    }
  }
  return results;
}

// server/trading-router.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/trading-db.ts
init_db();
init_schema();
import { eq as eq3, and as and3, desc as desc3 } from "drizzle-orm";
async function createTradingAccount(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tradingAccounts).values(data);
  return result;
}
async function getTradingAccountsByUserId(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (userId === 0) {
    const accounts2 = await db.select().from(tradingAccounts);
    return accounts2;
  }
  const accounts = await db.select().from(tradingAccounts).where(eq3(tradingAccounts.userId, userId));
  return accounts;
}
async function getTradingAccountById(accountId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const account = await db.select().from(tradingAccounts).where(eq3(tradingAccounts.id, accountId)).limit(1);
  return account[0];
}
async function updateTradingAccountStatus(accountId, status, errorMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = {
    connectionStatus: status,
    isConnected: status === "connected",
    lastConnectedAt: /* @__PURE__ */ new Date()
  };
  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }
  await db.update(tradingAccounts).set(updateData).where(eq3(tradingAccounts.id, accountId));
}
async function updateTradingAccountAssets(accountId, assets) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tradingAccounts).set({
    totalAssets: assets.totalAssets.toString(),
    availableCash: assets.availableCash.toString(),
    marketValue: assets.marketValue.toString(),
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq3(tradingAccounts.id, accountId));
}
async function getLatestMarketData(accountId, symbol) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const data = await db.select().from(marketData).where(and3(eq3(marketData.accountId, accountId), eq3(marketData.symbol, symbol))).orderBy(desc3(marketData.timestamp)).limit(1);
  return data[0];
}
async function saveOrder(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orders).values(data);
  return result;
}
async function getOrders(accountId, status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (status) {
    return await db.select().from(orders).where(and3(eq3(orders.accountId, accountId), eq3(orders.status, status))).orderBy(desc3(orders.submitTime));
  }
  return await db.select().from(orders).where(eq3(orders.accountId, accountId)).orderBy(desc3(orders.submitTime));
}
async function updateOrderStatus(orderId, status, filledQuantity, filledPrice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = {
    status,
    updatedAt: /* @__PURE__ */ new Date()
  };
  if (filledQuantity !== void 0) {
    updateData.filledQuantity = filledQuantity;
  }
  if (filledPrice !== void 0) {
    updateData.filledPrice = filledPrice;
  }
  await db.update(orders).set(updateData).where(eq3(orders.orderId, orderId));
}
async function saveLivePosition(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(livePositions).where(and3(eq3(livePositions.accountId, data.accountId), eq3(livePositions.symbol, data.symbol))).limit(1);
  if (existing.length > 0) {
    await db.update(livePositions).set({
      ...data,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(
      and3(
        eq3(livePositions.accountId, data.accountId),
        eq3(livePositions.symbol, data.symbol)
      )
    );
  } else {
    await db.insert(livePositions).values(data);
  }
}
async function getLivePositions(accountId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const positions = await db.select().from(livePositions).where(eq3(livePositions.accountId, accountId));
  return positions;
}
async function closeLivePosition(accountId, symbol) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(livePositions).where(and3(eq3(livePositions.accountId, accountId), eq3(livePositions.symbol, symbol)));
}
async function saveTradeLog(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(tradeLogs).values(data);
}
async function getTradeLogs(accountId, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const logs = await db.select().from(tradeLogs).where(eq3(tradeLogs.accountId, accountId)).orderBy(desc3(tradeLogs.timestamp)).limit(limit).offset(offset);
  return logs;
}
async function getAccountStatistics(accountId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const account = await getTradingAccountById(accountId);
  if (!account) throw new Error("Account not found");
  const positions = await getLivePositions(accountId);
  const orders_list = await getOrders(accountId);
  const logs = await getTradeLogs(accountId, 10);
  const totalPositionValue = positions.reduce((sum2, p) => {
    return sum2 + parseFloat(p.marketValue.toString());
  }, 0);
  const totalFloatingProfit = positions.reduce((sum2, p) => {
    return sum2 + parseFloat(p.floatingProfit.toString());
  }, 0);
  const filledOrders = orders_list.filter((o) => o.status === "filled").length;
  const totalCommission = orders_list.reduce((sum2, o) => {
    return sum2 + parseFloat(o.commission.toString());
  }, 0);
  return {
    account,
    positions: positions.length,
    totalPositionValue,
    totalFloatingProfit,
    filledOrders,
    totalCommission,
    recentLogs: logs
  };
}
async function deleteTradingAccount(accountId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(orders).where(eq3(orders.accountId, accountId));
  await db.delete(livePositions).where(eq3(livePositions.accountId, accountId));
  await db.delete(tradeLogs).where(eq3(tradeLogs.accountId, accountId));
  await db.delete(tradingAccounts).where(eq3(tradingAccounts.id, accountId));
}

// server/trading-adapter.ts
function asRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}
function asNumber2(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
function asString2(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === void 0) return fallback;
  return String(value);
}
function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}
function normalizeBridgeConfig(options) {
  const config = asRecord(options?.config);
  const settingsFallback = getSettingsFallback();
  const envEnabled = process.env.TRADING_WEB_API_BRIDGE_ENABLED;
  const enabled = config.useWebApiBridge !== void 0 ? asBoolean(config.useWebApiBridge, true) : envEnabled !== void 0 ? asBoolean(envEnabled, true) : true;
  const baseUrl = asString2(config.webApiBaseUrl) || process.env.TRADING_WEB_API_URL || "http://127.0.0.1:8080";
  const username = asString2(config.apiUsername) || process.env.TRADING_WEB_API_USERNAME || "admin";
  const password = asString2(config.apiPassword) || process.env.TRADING_WEB_API_PASSWORD || "admin123";
  const timeoutMs = config.requestTimeoutMs !== void 0 ? Math.max(1e3, asNumber2(config.requestTimeoutMs, 8e3)) : Math.max(1e3, asNumber2(process.env.TRADING_WEB_API_TIMEOUT_MS, 8e3));
  const miniQmtPath = asString2(config.miniQmtPath) || asString2(config.qmtPath) || process.env.MINIQMT_PATH || process.env.QMT_MINI_PATH || asString2(settingsFallback.xtPluginPath) || "";
  const miniQmtSessionId = asString2(config.miniQmtSessionId) || asString2(config.qmtSessionId) || process.env.MINIQMT_SESSION_ID || process.env.QMT_SESSION_ID || "";
  const miniQmtAccountId = asString2(config.miniQmtAccountId) || asString2(config.qmtAccountId) || process.env.MINIQMT_ACCOUNT_ID || process.env.QMT_ACCOUNT_ID || asString2(settingsFallback.accountId) || "";
  return {
    enabled,
    baseUrl: baseUrl.replace(/\/$/, ""),
    username,
    password,
    timeoutMs,
    miniQmtPath,
    miniQmtSessionId,
    miniQmtAccountId
  };
}
function unsupportedAdapterError(name) {
  return new Error(`${name} adapter is not implemented. Please use QMT web_api bridge.`);
}
var WebApiBridgeClient = class {
  constructor(config) {
    this.config = config;
  }
  token = null;
  async connect() {
    await this.login();
  }
  async disconnect() {
    this.token = null;
  }
  async login() {
    const data = await this.request(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
          miniqmt_path: this.config.miniQmtPath,
          miniqmt_session_id: this.config.miniQmtSessionId,
          miniqmt_account_id: this.config.miniQmtAccountId
        })
      },
      false,
      false
    );
    if (!data?.access_token) {
      throw new Error("\u767B\u5F55\u5931\u8D25: \u672A\u83B7\u53D6\u5230\u8BBF\u95EE\u4EE4\u724C");
    }
    this.token = data.access_token;
  }
  async request(path7, init = {}, requireAuth = true, allowRetry = true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers = new Headers(init.headers ?? {});
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      if (requireAuth) {
        if (!this.token) {
          await this.login();
        }
        headers.set("token", this.token);
      }
      const response = await fetch(`${this.config.baseUrl}${path7}`, {
        ...init,
        headers,
        signal: controller.signal
      });
      if (response.status === 401 && requireAuth && allowRetry) {
        await this.login();
        return this.request(path7, init, requireAuth, false);
      }
      if (!response.ok) {
        const text3 = await response.text();
        const safeText = text3.replace(/[\u0080-\uFFFF]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
        throw new Error(`\u8BF7\u6C42\u5931\u8D25 (${response.status}): ${safeText || response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`\u8FDE\u63A5\u8D85\u65F6: \u65E0\u6CD5\u8FDE\u63A5\u5230\u4EA4\u6613\u670D\u52A1 ${this.config.baseUrl}`);
        }
        if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
          throw new Error(`\u8FDE\u63A5\u5931\u8D25: \u4EA4\u6613\u670D\u52A1\u672A\u542F\u52A8 ${this.config.baseUrl}`);
        }
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async getAsset() {
    return this.request("/api/asset");
  }
  async getPositions() {
    return this.request("/api/positions");
  }
  async getOrders() {
    return this.request("/api/orders");
  }
  async placeOrder(payload) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const localOrderId = `${Date.now()}_${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`;
    await this.request("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        order_id: localOrderId,
        strategy_id: payload.strategyId ?? null,
        symbol: payload.symbol,
        direction: payload.side,
        order_type: "limit",
        price: payload.price,
        volume: payload.quantity,
        filled_volume: 0,
        filled_price: 0,
        status: "pending",
        create_time: now,
        update_time: now
      })
    });
    return String(localOrderId);
  }
  async cancelOrder(orderId) {
    const maybeNumber = Number.parseInt(orderId, 10);
    const safeOrderId = Number.isFinite(maybeNumber) ? maybeNumber : 0;
    await this.request(`/api/orders/${safeOrderId}`, {
      method: "DELETE"
    });
    return true;
  }
  async getQuotes() {
    try {
      return await this.request("/api/quotes");
    } catch {
      return [];
    }
  }
};
var QMTAdapter = class {
  constructor(options) {
    this.options = options;
    this.bridgeConfig = normalizeBridgeConfig(options);
    if (this.bridgeConfig.enabled) {
      this.bridgeClient = new WebApiBridgeClient(this.bridgeConfig);
    }
  }
  isConnected = false;
  bridgeConfig;
  bridgeClient;
  accountInfo = {
    totalAssets: 1e6,
    availableCash: 5e5,
    marketValue: 5e5,
    isConnected: false
  };
  localOrders = /* @__PURE__ */ new Map();
  subscriptions = /* @__PURE__ */ new Map();
  async connect() {
    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is disabled");
    }
    await this.bridgeClient.connect();
    console.log("[QMT] Connected successfully", {
      mode: "web_api_bridge",
      accountCode: this.options?.accountCode
    });
    this.isConnected = true;
    this.accountInfo.isConnected = true;
    return true;
  }
  async disconnect() {
    this.subscriptions.forEach((timer) => clearInterval(timer));
    this.subscriptions.clear();
    if (this.bridgeClient) {
      await this.bridgeClient.disconnect();
    }
    this.isConnected = false;
    this.accountInfo.isConnected = false;
    console.log("[QMT] Disconnected");
  }
  async getAccountInfo() {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }
    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is not available");
    }
    const asset = await this.bridgeClient.getAsset();
    this.accountInfo = {
      totalAssets: asNumber2(asset.total_asset),
      availableCash: asNumber2(asset.available_cash),
      marketValue: asNumber2(asset.market_value),
      isConnected: true
    };
    return this.accountInfo;
  }
  async getPositions() {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }
    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is not available");
    }
    const rows = await this.bridgeClient.getPositions();
    return rows.map((row) => {
      const quantity = asNumber2(row.total_volume);
      const costPrice = asNumber2(row.avg_price);
      const marketValue = asNumber2(row.market_value);
      const floatingProfit = asNumber2(row.unrealized_pnl);
      const currentPrice = quantity > 0 ? marketValue / quantity : costPrice;
      return {
        symbol: row.symbol,
        quantity,
        costPrice,
        currentPrice,
        marketValue,
        floatingProfit,
        floatingProfitPercent: marketValue > 0 ? floatingProfit / Math.max(marketValue - floatingProfit, 1e-9) : 0,
        openDate: /* @__PURE__ */ new Date()
      };
    });
  }
  async getOrders(status) {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }
    if (this.bridgeClient) {
      const rows = await this.bridgeClient.getOrders();
      if (rows.length > 0) {
        const mapped = rows.map((row) => ({
          orderId: String(row.order_id),
          symbol: row.symbol,
          side: row.direction === "sell" ? "sell" : "buy",
          quantity: asNumber2(row.volume),
          price: asNumber2(row.price),
          status: [
            "pending",
            "partial",
            "filled",
            "cancelled",
            "rejected"
          ].includes(row.status) ? row.status : "pending",
          filledQuantity: asNumber2(row.filled_volume),
          filledPrice: asNumber2(row.filled_price),
          submitTime: new Date(row.create_time || Date.now()),
          fillTime: row.filled_volume ? new Date(row.update_time || Date.now()) : void 0,
          commission: 0
        }));
        mapped.forEach((order) => this.localOrders.set(order.orderId, order));
        return status ? mapped.filter((order) => order.status === status) : mapped;
      }
    }
    const fallback = Array.from(this.localOrders.values());
    return status ? fallback.filter((order) => order.status === status) : fallback;
  }
  async submitOrder(symbol, side, quantity, price) {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }
    const now = /* @__PURE__ */ new Date();
    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is not available");
    }
    const orderId = await this.bridgeClient.placeOrder({
      symbol,
      side,
      quantity,
      price,
      strategyId: this.options?.accountCode
    });
    this.localOrders.set(orderId, {
      orderId,
      symbol,
      side,
      quantity,
      price,
      status: "pending",
      filledQuantity: 0,
      submitTime: now,
      commission: 0
    });
    console.log(`[QMT] Order submitted: ${orderId}`);
    return orderId;
  }
  async cancelOrder(orderId) {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }
    if (this.bridgeClient) {
      await this.bridgeClient.cancelOrder(orderId);
    }
    const local = this.localOrders.get(orderId);
    if (local) {
      local.status = "cancelled";
      this.localOrders.set(orderId, local);
    }
    console.log(`[QMT] Order cancelled: ${orderId}`);
    return true;
  }
  subscribeMarketData(symbols, callback) {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }
    const key = Array.from(new Set(symbols)).sort().join(",");
    if (!key || this.subscriptions.has(key)) return;
    const timer = setInterval(async () => {
      try {
        if (!this.bridgeClient) {
          throw new Error("QMT web_api bridge is not available");
        }
        const quotes = await this.bridgeClient.getQuotes();
        symbols.forEach((symbol) => {
          const q = quotes.find((item) => item.symbol === symbol);
          if (!q) return;
          callback({
            symbol,
            price: asNumber2(q.price),
            bid: asNumber2(q.price),
            ask: asNumber2(q.price),
            volume: asNumber2(q.volume),
            amount: asNumber2(q.amount),
            change: asNumber2(q.change),
            changePercent: asNumber2(q.change_percent),
            timestamp: new Date(q.timestamp || Date.now())
          });
        });
      } catch (error) {
        console.error("[QMT] subscribeMarketData failed:", error);
      }
    }, 1e3);
    this.subscriptions.set(key, timer);
  }
  unsubscribeMarketData(symbols) {
    this.subscriptions.forEach((timer, key) => {
      const subscribed = key.split(",");
      if (symbols.some((symbol) => subscribed.includes(symbol))) {
        clearInterval(timer);
        this.subscriptions.delete(key);
      }
    });
    console.log(`[QMT] Unsubscribed from: ${symbols.join(",")}`);
  }
};
var XTPAdapter = class {
  async connect() {
    throw unsupportedAdapterError("XTP");
  }
  async disconnect() {
  }
  async getAccountInfo() {
    throw unsupportedAdapterError("XTP");
  }
  async getPositions() {
    throw unsupportedAdapterError("XTP");
  }
  async getOrders(status) {
    void status;
    throw unsupportedAdapterError("XTP");
  }
  async submitOrder(symbol, side, quantity, price) {
    void symbol;
    void side;
    void quantity;
    void price;
    throw unsupportedAdapterError("XTP");
  }
  async cancelOrder(orderId) {
    void orderId;
    throw unsupportedAdapterError("XTP");
  }
  subscribeMarketData(symbols, callback) {
    void symbols;
    void callback;
    throw unsupportedAdapterError("XTP");
  }
  unsubscribeMarketData(symbols) {
    void symbols;
  }
};
function createTradingAdapter(type, options) {
  switch (type) {
    case "qmt":
      return new QMTAdapter(options);
    case "xtp":
      return new XTPAdapter();
    default:
      throw new Error(`Unsupported trading adapter: ${type}`);
  }
}

// server/risk-control-service.ts
function asRecord2(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}
function asNumber3(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}
function asInt(value, fallback) {
  const n = asNumber3(value, fallback);
  const parsed = Math.floor(n);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function asBoolean2(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}
function getRiskControlConfig(accountConfig) {
  const cfg = asRecord2(accountConfig);
  const settingsFallback = getSettingsFallback();
  const maxSingleOrderAmount = Math.max(
    1,
    asNumber3(cfg.maxSingleOrderAmount, asNumber3(process.env.RISK_MAX_SINGLE_ORDER_AMOUNT, 2e5))
  );
  const maxDailyOrderAmount = Math.max(
    maxSingleOrderAmount,
    asNumber3(cfg.maxDailyOrderAmount, asNumber3(process.env.RISK_MAX_DAILY_ORDER_AMOUNT, 2e6))
  );
  const maxDailyOrderCount = Math.max(
    1,
    asInt(cfg.maxDailyOrderCount, asInt(process.env.RISK_MAX_DAILY_ORDER_COUNT, 200))
  );
  const stopLossRatio = Math.min(
    0.9,
    Math.max(
      0,
      asNumber3(
        cfg.stopLossRatio,
        asNumber3(
          process.env.RISK_STOP_LOSS_RATIO,
          settingsFallback.strategyStopLossRatio ?? 0.08
        )
      )
    )
  );
  const autoStopLossEnabled = asBoolean2(
    cfg.autoStopLossEnabled,
    asBoolean2(process.env.RISK_AUTO_STOP_LOSS_ENABLED, true)
  );
  return {
    maxSingleOrderAmount,
    maxDailyOrderAmount,
    maxDailyOrderCount,
    stopLossRatio,
    autoStopLossEnabled
  };
}
function isSameDate(date, target) {
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}
async function validateOrderRisk(input) {
  const config = getRiskControlConfig(input.accountConfig);
  const amount = input.quantity * input.price;
  if (amount > config.maxSingleOrderAmount) {
    return {
      allowed: false,
      reason: `\u5355\u7B14\u91D1\u989D\u8D85\u9650: ${amount.toFixed(2)} > ${config.maxSingleOrderAmount.toFixed(2)}`,
      config,
      amount,
      dailyAmount: 0,
      dailyCount: 0
    };
  }
  const orders2 = await getOrders(input.accountId);
  const now = /* @__PURE__ */ new Date();
  let dailyAmount = 0;
  let dailyCount = 0;
  for (const order of orders2) {
    const submitTime = order.submitTime instanceof Date ? order.submitTime : new Date(String(order.submitTime));
    if (Number.isNaN(submitTime.getTime()) || !isSameDate(submitTime, now)) {
      continue;
    }
    const itemAmount = Number(order.quantity) * asNumber3(order.price, 0);
    dailyAmount += itemAmount;
    dailyCount += 1;
  }
  if (dailyCount + 1 > config.maxDailyOrderCount) {
    return {
      allowed: false,
      reason: `\u65E5\u5185\u8BA2\u5355\u6B21\u6570\u8D85\u9650: ${dailyCount + 1} > ${config.maxDailyOrderCount}`,
      config,
      amount,
      dailyAmount,
      dailyCount
    };
  }
  if (dailyAmount + amount > config.maxDailyOrderAmount) {
    return {
      allowed: false,
      reason: `\u65E5\u5185\u7D2F\u8BA1\u91D1\u989D\u8D85\u9650: ${(dailyAmount + amount).toFixed(2)} > ${config.maxDailyOrderAmount.toFixed(2)}`,
      config,
      amount,
      dailyAmount,
      dailyCount
    };
  }
  return {
    allowed: true,
    config,
    amount,
    dailyAmount,
    dailyCount
  };
}
function detectStopLossPositions(positions, config) {
  if (!config.autoStopLossEnabled || config.stopLossRatio <= 0) {
    return [];
  }
  return positions.filter((item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return false;
    }
    if (!Number.isFinite(item.costPrice) || item.costPrice <= 0) {
      return false;
    }
    if (!Number.isFinite(item.currentPrice) || item.currentPrice <= 0) {
      return false;
    }
    const triggerPrice = item.costPrice * (1 - config.stopLossRatio);
    return item.currentPrice <= triggerPrice;
  });
}

// server/market-data-service.ts
var PYTHON_API_BASE = "http://127.0.0.1:8081";
var CACHE_TTL = {
  indices: 5e3,
  // 大盘指数 5秒
  heat: 1e4,
  // 市场热度 10秒
  capitalFlow: 1e4,
  // 资金流向 10秒
  hotSectors: 15e3,
  // 热点板块 15秒
  changeRanking: 1e4,
  turnoverRanking: 1e4,
  turnoverRateRanking: 1e4,
  mainFlowRanking: 1e4,
  volumeRatioRanking: 1e4,
  amplitudeRanking: 1e4
};
var cache = /* @__PURE__ */ new Map();
function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}
function setCached(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
var MARKET_ENDPOINTS = {
  indices: {
    path: "/api/market/indices",
    required: true,
    requireNonEmptyArray: true,
    errorMessage: "\u65E0\u6CD5\u83B7\u53D6\u5B9E\u65F6\u5927\u76D8\u6307\u6570\u6570\u636E\uFF0C\u8BF7\u786E\u8BA4 Python \u884C\u60C5\u670D\u52A1\u5DF2\u542F\u52A8"
  },
  heat: {
    path: "/api/market/heat",
    required: true,
    errorMessage: "\u65E0\u6CD5\u83B7\u53D6\u5E02\u573A\u70ED\u5EA6\u6570\u636E\uFF0C\u8BF7\u786E\u8BA4 Python \u884C\u60C5\u670D\u52A1\u5DF2\u542F\u52A8"
  },
  capitalFlow: {
    path: "/api/market/capital-flow",
    required: true,
    errorMessage: "\u65E0\u6CD5\u83B7\u53D6\u8D44\u91D1\u6D41\u5411\u6570\u636E\uFF0C\u8BF7\u786E\u8BA4 Python \u884C\u60C5\u670D\u52A1\u5DF2\u542F\u52A8"
  },
  hotSectors: {
    path: "/api/market/hot-sectors",
    required: true,
    requireNonEmptyArray: true,
    errorMessage: "\u65E0\u6CD5\u83B7\u53D6\u70ED\u70B9\u677F\u5757\u6570\u636E\uFF0C\u8BF7\u786E\u8BA4 Python \u884C\u60C5\u670D\u52A1\u5DF2\u542F\u52A8"
  },
  changeRanking: {
    path: "/api/rank/change",
    defaultValue: () => ({ gainers: [], losers: [] })
  },
  turnoverRanking: {
    path: "/api/rank/turnover",
    defaultValue: () => []
  },
  turnoverRateRanking: {
    path: "/api/rank/turnover-rate",
    defaultValue: () => []
  },
  mainFlowRanking: {
    path: "/api/rank/main-flow",
    defaultValue: () => []
  },
  volumeRatioRanking: {
    path: "/api/rank/volume-ratio",
    defaultValue: () => []
  },
  amplitudeRanking: {
    path: "/api/rank/amplitude",
    defaultValue: () => []
  }
};
async function fetchFromPythonService(endpoint) {
  const url = `${PYTHON_API_BASE}${endpoint}`;
  if (process.env.DISABLE_PY_MARKET_DATA === "1") {
    console.warn(`[market-data] Python API disabled, skip request: ${url}`);
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e3);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.warn(`[market-data] Python API returned ${response.status} for ${url}`);
      return null;
    }
    const result = await response.json();
    return result.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[market-data] Failed to fetch from Python API (${url}): ${errorMessage}`);
    return null;
  }
}
function buildQuery(params) {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === void 0 || value === null) return;
    searchParams.append(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}
async function fetchMarketData(key, options) {
  const config = MARKET_ENDPOINTS[key];
  const query = buildQuery(options?.query);
  const cacheKey = `${key}${query}`;
  const ttl = CACHE_TTL[key];
  if (ttl) {
    const cached = getCached(cacheKey);
    if (cached !== null) return cached;
  }
  const data = await fetchFromPythonService(`${config.path}${query}`);
  const hasData = data !== null && data !== void 0 && (!config.requireNonEmptyArray || Array.isArray(data) && data.length > 0);
  if (hasData) {
    if (ttl) setCached(cacheKey, data, ttl);
    return data;
  }
  if (config.required) {
    throw new Error(config.errorMessage ?? `Failed to fetch market data for "${String(key)}"`);
  }
  if (config.defaultValue) {
    return config.defaultValue();
  }
  return data;
}
var marketDataApi = {
  indices: () => fetchMarketData("indices"),
  heat: () => fetchMarketData("heat"),
  capitalFlow: () => fetchMarketData("capitalFlow"),
  hotSectors: (topN = 10) => fetchMarketData("hotSectors", { query: { top_n: topN } }),
  changeRanking: (topN = 50) => fetchMarketData("changeRanking", { query: { top_n: topN } }),
  turnoverRanking: (topN = 50) => fetchMarketData("turnoverRanking", { query: { top_n: topN } }),
  turnoverRateRanking: (topN = 50) => fetchMarketData("turnoverRateRanking", { query: { top_n: topN } }),
  mainFlowRanking: (topN = 50) => fetchMarketData("mainFlowRanking", { query: { top_n: topN } }),
  volumeRatioRanking: (topN = 50) => fetchMarketData("volumeRatioRanking", { query: { top_n: topN } }),
  amplitudeRanking: (topN = 50) => fetchMarketData("amplitudeRanking", { query: { top_n: topN } })
};
var getMarketIndices = () => marketDataApi.indices();
var getMarketHeat = () => marketDataApi.heat();
var getCapitalFlow = () => marketDataApi.capitalFlow();
var getHotSectors = (topN) => marketDataApi.hotSectors(topN);
var getChangeRanking = (topN) => marketDataApi.changeRanking(topN);
var getTurnoverRanking = (topN) => marketDataApi.turnoverRanking(topN);
var getTurnoverRateRanking = (topN) => marketDataApi.turnoverRateRanking(topN);
var getMainFlowRanking = (topN) => marketDataApi.mainFlowRanking(topN);
var getVolumeRatioRanking = (topN) => marketDataApi.volumeRatioRanking(topN);
var getAmplitudeRanking = (topN) => marketDataApi.amplitudeRanking(topN);
async function getQuoteSnapshots(codes) {
  if (!codes || codes.length === 0) return [];
  const params = new URLSearchParams({ codes: codes.join(",") });
  try {
    const response = await fetch(`${PYTHON_API_BASE}/api/market/quotes?${params.toString()}`, {
      signal: AbortSignal.timeout(5e3)
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload.data ?? [];
  } catch {
    return [];
  }
}
async function searchSymbols(keyword, limit = 10) {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  const query = buildQuery({ keyword: trimmed, limit });
  try {
    const response = await fetch(`${PYTHON_API_BASE}/api/market/search${query}`, {
      signal: AbortSignal.timeout(4e3)
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload.data ?? [];
  } catch {
    return [];
  }
}
async function getTradingDates(market = "SH", startTime = "", endTime = "", count = -1) {
  const q = buildQuery({ market, start_time: startTime, end_time: endTime, count });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/trading-dates${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { dates: [] };
    return await r.json();
  } catch {
    return { dates: [] };
  }
}
async function getIndexWeight(indexCode = "000300.SH") {
  const q = buildQuery({ index_code: indexCode });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/index-weight${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { weights: {} };
    return await r.json();
  } catch {
    return { weights: {} };
  }
}
async function getDividFactors(stockCode, startTime = "", endTime = "") {
  const q = buildQuery({ stock_code: stockCode, start_time: startTime, end_time: endTime });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/divid-factors${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getHisSt(stockCode) {
  const q = buildQuery({ stock_code: stockCode });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/his-st${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: {} };
    return await r.json();
  } catch {
    return { data: {} };
  }
}
async function getIpoInfo(startTime = "", endTime = "") {
  const q = buildQuery({ start_time: startTime, end_time: endTime });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/ipo-info${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getEtfInfo() {
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/etf-info`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getInstrumentDetailBatch(codes) {
  const q = buildQuery({ codes: codes.join(",") });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/instrument-detail-batch${q}`, { signal: AbortSignal.timeout(8e3) });
    if (!r.ok) return { data: {} };
    return await r.json();
  } catch {
    return { data: {} };
  }
}
async function getTransactionCount(codes) {
  const q = buildQuery({ codes: codes.join(",") });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/transactioncount${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: {} };
    return await r.json();
  } catch {
    return { data: {} };
  }
}
async function getL2Quote(stockCode, startTime = "", endTime = "", count = 1) {
  const q = buildQuery({ stock_code: stockCode, start_time: startTime, end_time: endTime, count });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/l2-quote${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getL2Order(stockCode, startTime = "", endTime = "", count = 100) {
  const q = buildQuery({ stock_code: stockCode, start_time: startTime, end_time: endTime, count });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/l2-order${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getL2Transaction(stockCode, startTime = "", endTime = "", count = 100) {
  const q = buildQuery({ stock_code: stockCode, start_time: startTime, end_time: endTime, count });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/l2-transaction${q}`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getFinancialData(codes, tables = "Balance,Income,CashFlow,PershareIndex", startTime = "", endTime = "") {
  const q = buildQuery({ codes: codes.join(","), tables, start_time: startTime, end_time: endTime });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/financial-data${q}`, { signal: AbortSignal.timeout(1e4) });
    if (!r.ok) return { data: {} };
    return await r.json();
  } catch {
    return { data: {} };
  }
}
async function getMarkets() {
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/markets`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: { SH: "\u4E0A\u4EA4\u6240", SZ: "\u6DF1\u4EA4\u6240", BJ: "\u5317\u4EA4\u6240" } };
    return await r.json();
  } catch {
    return { data: { SH: "\u4E0A\u4EA4\u6240", SZ: "\u6DF1\u4EA4\u6240", BJ: "\u5317\u4EA4\u6240" } };
  }
}
async function getHolidays() {
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/holidays`, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) return { data: [] };
    return await r.json();
  } catch {
    return { data: [] };
  }
}
async function getFullKline(codes, period = "1d") {
  const q = buildQuery({ codes: codes.join(","), period });
  try {
    const r = await fetch(`${PYTHON_API_BASE}/api/market/full-kline${q}`, { signal: AbortSignal.timeout(15e3) });
    if (!r.ok) return { data: {} };
    return await r.json();
  } catch {
    return { data: {} };
  }
}
async function runStockPicker(filters) {
  const url = `${PYTHON_API_BASE}/api/ai/stock-picker`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e4);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const result = await response.json();
    return result.data ?? [];
  } catch (e) {
    console.warn(`[market-data] stock-picker failed: ${e}`);
    return [];
  }
}
async function chatPick(question, filters, model, personality, provider) {
  const url = `${PYTHON_API_BASE.replace("8081", "8082")}/qmt/ai/chat-pick`;
  const empty = { answer: "", stocks: [], filters_used: {}, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e4);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, filters: filters ?? {}, model, personality, provider }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return empty;
    return await response.json();
  } catch (e) {
    console.warn(`[market-data] chat-pick failed: ${e}`);
    return empty;
  }
}

// server/sim-trading.ts
var simOrders = /* @__PURE__ */ new Map();
var simPositions = /* @__PURE__ */ new Map();
function submitSimOrder(accountId, symbol, side, quantity, price) {
  const orderId = `SIM${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const order = {
    orderId,
    accountId,
    symbol,
    side,
    quantity,
    price,
    status: "filled",
    submitTime: /* @__PURE__ */ new Date(),
    filledTime: /* @__PURE__ */ new Date()
  };
  simOrders.set(orderId, order);
  updateSimPosition(accountId, symbol, side, quantity, price);
  return { orderId, status: "filled" };
}
function updateSimPosition(accountId, symbol, side, quantity, price) {
  if (!simPositions.has(accountId)) {
    simPositions.set(accountId, /* @__PURE__ */ new Map());
  }
  const positions = simPositions.get(accountId);
  const pos = positions.get(symbol) || { symbol, quantity: 0, avgPrice: 0, marketValue: 0 };
  if (side === "buy") {
    const totalCost = pos.quantity * pos.avgPrice + quantity * price;
    pos.quantity += quantity;
    pos.avgPrice = pos.quantity > 0 ? totalCost / pos.quantity : 0;
  } else {
    pos.quantity -= quantity;
    if (pos.quantity < 0) pos.quantity = 0;
  }
  pos.marketValue = pos.quantity * price;
  positions.set(symbol, pos);
}
function getSimOrders(accountId, limit = 50) {
  return Array.from(simOrders.values()).filter((o) => o.accountId === accountId).sort((a, b) => b.submitTime.getTime() - a.submitTime.getTime()).slice(0, limit);
}
function getSimPositions(accountId) {
  const positions = simPositions.get(accountId);
  return positions ? Array.from(positions.values()).filter((p) => p.quantity > 0) : [];
}

// server/qmt-monitor-service.ts
init_env();
var QMT_API_BASE_URL = process.env.QMT_API_BASE_URL ?? ENV.QMT_API_BASE_URL ?? "http://127.0.0.1:8082";
async function requestQmt(path7, init) {
  const response = await fetch(`${QMT_API_BASE_URL}${path7}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers ?? {}
    },
    ...init
  });
  const text3 = await response.text();
  if (!response.ok) {
    throw new Error(`[QMT monitor] ${response.status} ${response.statusText}: ${text3}`);
  }
  return text3 ? JSON.parse(text3) : {};
}
async function fetchMonitorConfig() {
  const result = await requestQmt("/ai/monitor/config", {
    method: "GET"
  });
  return result.data ?? {};
}
async function fetchMonitorEntries(params) {
  const query = new URLSearchParams();
  if (params?.status) {
    query.set("status", params.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await requestQmt(
    `/ai/monitor/pool${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}
async function fetchMonitorFills(limit) {
  const query = new URLSearchParams();
  if (limit) {
    query.set("limit", String(limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await requestQmt(
    `/ai/monitor/fills${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}
async function createMonitorEntry(payload) {
  const result = await requestQmt(`/ai/monitor/pool`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}
async function updateMonitorEntry(id, patch) {
  const result = await requestQmt(`/ai/monitor/pool/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return result.data;
}
async function deleteMonitorEntry(id) {
  const result = await requestQmt(`/ai/monitor/pool/${id}`, {
    method: "DELETE"
  });
  return Boolean(result.success);
}

// server/trading-router.ts
var legacyConnections = /* @__PURE__ */ new Map();
var legacyOrders = /* @__PURE__ */ new Map();
var legacySubscriptions = /* @__PURE__ */ new Map();
var legacyConnectionIdSeq = 1;
var legacyOrderIdSeq = 1;
var accountSessions = /* @__PURE__ */ new Map();
function getLegacyConnectionOrThrow(connectionId, userId) {
  const connection = legacyConnections.get(connectionId);
  if (!connection || userId !== 0 && connection.userId !== userId) {
    throw new Error("Connection not found");
  }
  return connection;
}
function normalizeAccountConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  return config;
}
async function getOwnedAccountOrThrow(accountId, userId) {
  const account = await getTradingAccountById(accountId);
  if (!account) {
    throw new Error("Account not found");
  }
  if (userId !== 0 && account.userId !== userId) {
    throw new Error("Account not found");
  }
  return account;
}
function getSession(accountId, userId) {
  const session = accountSessions.get(accountId);
  if (!session) {
    return null;
  }
  if (session.userId !== userId) {
    return null;
  }
  return session;
}
async function getOrCreateSessionAdapter(account, userId) {
  const existing = getSession(account.id, userId);
  if (existing && existing.accountType === account.accountType && existing.accountCode === account.accountCode) {
    return existing.adapter;
  }
  if (existing) {
    try {
      await existing.adapter.disconnect();
    } catch (error) {
      console.warn("[trading] failed to disconnect stale adapter session:", error);
    }
    accountSessions.delete(account.id);
  }
  const adapter = createTradingAdapter(account.accountType, {
    accountCode: account.accountCode,
    config: normalizeAccountConfig(account.config)
  });
  accountSessions.set(account.id, {
    userId,
    accountType: account.accountType,
    accountCode: account.accountCode,
    adapter
  });
  return adapter;
}
async function ensureConnectedAdapter(account, userId) {
  const cached = getSession(account.id, userId);
  if (cached) {
    return cached.adapter;
  }
  const adapter = await getOrCreateSessionAdapter(account, userId);
  const connected = await adapter.connect();
  if (!connected) {
    accountSessions.delete(account.id);
    throw new Error("Connection failed");
  }
  return adapter;
}
var monitorEntryInputSchema = z2.object({
  symbol: z2.string().min(1),
  name: z2.string().optional(),
  exchange: z2.string().optional(),
  quantity: z2.number().int().positive(),
  buy_price: z2.number().positive().optional(),
  buy_price_type: z2.string().optional(),
  sell_price: z2.number().positive().optional(),
  sell_price_type: z2.string().optional(),
  dynamic_take_profit: z2.number().optional(),
  dynamic_stop_loss: z2.number().optional(),
  time_limit_minutes: z2.number().int().positive().optional(),
  target_account: z2.string().optional(),
  order_strategy: z2.string().optional(),
  notes: z2.string().optional(),
  status: z2.string().optional()
});
var monitorEntryUpdateSchema = monitorEntryInputSchema.partial().extend({
  quantity: z2.number().int().positive().optional()
});
async function startAccountSession(account, userId) {
  const existing = getSession(account.id, userId);
  if (existing && account.isConnected) {
    return {
      connected: true,
      alreadyConnected: true,
      adapter: existing.adapter
    };
  }
  const adapter = await getOrCreateSessionAdapter(account, userId);
  const connected = await adapter.connect();
  return {
    connected,
    alreadyConnected: false,
    adapter
  };
}
async function syncAccountSnapshot(account, adapter) {
  const [asset, positions] = await Promise.all([
    adapter.getAccountInfo(),
    adapter.getPositions()
  ]);
  await updateTradingAccountAssets(account.id, {
    totalAssets: asset.totalAssets,
    availableCash: asset.availableCash,
    marketValue: asset.marketValue
  });
  const existingPositions = await getLivePositions(account.id);
  const incomingSymbols = /* @__PURE__ */ new Set();
  for (const position of positions) {
    incomingSymbols.add(position.symbol);
    await saveLivePosition({
      accountId: account.id,
      symbol: position.symbol,
      quantity: position.quantity,
      costPrice: position.costPrice.toString(),
      currentPrice: position.currentPrice.toString(),
      marketValue: position.marketValue.toString(),
      floatingProfit: position.floatingProfit.toString(),
      floatingProfitPercent: position.floatingProfitPercent.toString(),
      openDate: position.openDate,
      lastUpdateTime: /* @__PURE__ */ new Date()
    });
  }
  for (const existing of existingPositions) {
    if (!incomingSymbols.has(existing.symbol)) {
      await closeLivePosition(account.id, existing.symbol);
    }
  }
  return { positionCount: positions.length };
}
async function destroyAccountSession(accountId) {
  const session = accountSessions.get(accountId);
  if (!session) {
    return;
  }
  try {
    await session.adapter.disconnect();
  } catch (error) {
    console.warn("[trading] failed to disconnect adapter session:", error);
  } finally {
    accountSessions.delete(accountId);
  }
}
async function getExecutionAdapterForAccount(userId, accountId) {
  const account = await getOwnedAccountOrThrow(accountId, userId);
  const adapter = await ensureConnectedAdapter(account, userId);
  return { account, adapter };
}
var tradingRouter = router({
  // ===== 兼容层：用于旧版前端与现有测试 =====
  createConnection: publicProcedure.input(
    z2.object({
      name: z2.string().min(1),
      interfaceType: z2.enum(["qmt", "xtp", "ctp", "other"]),
      host: z2.string().min(1),
      port: z2.number().int().positive(),
      username: z2.string().min(1),
      password: z2.string().min(1)
    })
  ).mutation(async ({ ctx, input }) => {
    const now = /* @__PURE__ */ new Date();
    const id = legacyConnectionIdSeq++;
    const connection = {
      id,
      userId: ctx.user?.id ?? 0,
      name: input.name,
      interfaceType: input.interfaceType,
      host: input.host,
      port: input.port,
      username: input.username,
      password: input.password,
      isConnected: false,
      createdAt: now,
      updatedAt: now
    };
    legacyConnections.set(id, connection);
    return connection;
  }),
  getConnections: publicProcedure.query(async ({ ctx }) => {
    return Array.from(legacyConnections.values()).filter((connection) => connection.userId === (ctx.user?.id ?? 0)).sort((a, b) => b.id - a.id);
  }),
  getConnectionDetail: publicProcedure.input(z2.object({ connectionId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
    return getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
  }),
  toggleConnection: publicProcedure.input(
    z2.object({
      connectionId: z2.number().int().positive(),
      isConnected: z2.boolean()
    })
  ).mutation(async ({ ctx, input }) => {
    const connection = getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
    connection.isConnected = input.isConnected;
    connection.updatedAt = /* @__PURE__ */ new Date();
    legacyConnections.set(connection.id, connection);
    return connection;
  }),
  // 创建交易账户
  createAccount: publicProcedure.input(
    z2.object({
      accountName: z2.string(),
      accountType: z2.enum(["qmt", "xtp", "ctp", "other"]),
      accountCode: z2.string(),
      strategyId: z2.number().int().optional(),
      config: z2.record(z2.string(), z2.any()).optional(),
      isSimulated: z2.boolean().optional(),
      initialCash: z2.number().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const result = await createTradingAccount({
      userId: ctx.user?.id ?? 0,
      accountName: input.accountName,
      accountType: input.accountType,
      accountCode: input.accountCode,
      strategyId: input.strategyId,
      isConnected: false,
      connectionStatus: "disconnected",
      isSimulated: input.isSimulated ?? false,
      totalAssets: input.isSimulated ? (input.initialCash ?? 1e6).toString() : "0",
      availableCash: input.isSimulated ? (input.initialCash ?? 1e6).toString() : "0",
      marketValue: "0",
      config: input.config,
      isActive: true
    });
    return { success: true, accountId: result.insertId || 0 };
  }),
  startLiveTrading: publicProcedure.input(
    z2.object({
      accountId: z2.number().int().optional()
    }).optional()
  ).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.id ?? 0;
    const accounts = await getTradingAccountsByUserId(userId);
    if (accounts.length === 0) {
      throw new Error("No trading account configured");
    }
    let account;
    if (input?.accountId !== void 0) {
      account = accounts.find((item) => item.id === input.accountId);
      if (!account) {
        throw new Error("Account not found");
      }
    } else {
      account = accounts.find((item) => item.accountType === "qmt" && item.isActive) ?? accounts.find((item) => item.isActive) ?? accounts[0];
    }
    try {
      const { connected, alreadyConnected, adapter } = await startAccountSession(account, userId);
      if (!connected) {
        accountSessions.delete(account.id);
        await updateTradingAccountStatus(account.id, "error", "Connection failed");
        return {
          success: false,
          accountId: account.id,
          accountName: account.accountName,
          message: "Connection failed",
          alreadyConnected
        };
      }
      await updateTradingAccountStatus(account.id, "connected");
      const snapshot = await syncAccountSnapshot(account, adapter);
      await saveTradeLog({
        accountId: account.id,
        eventType: "account_connected",
        description: `Live trading started via strategy entry (${account.accountName}) | positions=${snapshot.positionCount}`
      });
      return {
        success: true,
        accountId: account.id,
        accountName: account.accountName,
        message: alreadyConnected ? "Account already connected" : "Live trading started",
        alreadyConnected,
        snapshot
      };
    } catch (error) {
      await updateTradingAccountStatus(
        account.id,
        "error",
        error.message
      );
      throw error;
    }
  }),
  // 获取用户的交易账户列表
  getAccounts: publicProcedure.query(async ({ ctx }) => {
    const accounts = await getTradingAccountsByUserId(ctx.user?.id ?? 0);
    return accounts;
  }),
  // 获取账户详情
  getAccountDetail: publicProcedure.input(z2.object({ accountId: z2.number().int() })).query(async ({ input }) => {
    const stats = await getAccountStatistics(input.accountId);
    return stats;
  }),
  // 连接交易账户
  connectAccount: publicProcedure.input(z2.object({ accountId: z2.number().int() })).mutation(async ({ ctx, input }) => {
    try {
      const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
      const { connected, adapter } = await startAccountSession(account, ctx.user?.id ?? 0);
      if (connected) {
        await updateTradingAccountStatus(input.accountId, "connected");
        const snapshot = await syncAccountSnapshot(account, adapter);
        return { success: true, message: "Account connected successfully", snapshot };
      } else {
        accountSessions.delete(input.accountId);
        await updateTradingAccountStatus(
          input.accountId,
          "error",
          "Connection failed"
        );
        return { success: false, message: "Connection failed" };
      }
    } catch (error) {
      await updateTradingAccountStatus(
        input.accountId,
        "error",
        error.message
      );
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new TRPCError3({
        code: "INTERNAL_SERVER_ERROR",
        message: errorMessage
      });
    }
  }),
  // 断开连接
  disconnectAccount: publicProcedure.input(z2.object({ accountId: z2.number().int() })).mutation(async ({ ctx, input }) => {
    try {
      await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
      await destroyAccountSession(input.accountId);
      await updateTradingAccountStatus(input.accountId, "disconnected");
      return { success: true };
    } catch (error) {
      throw error;
    }
  }),
  // 删除交易账户
  deleteAccount: publicProcedure.input(z2.object({ accountId: z2.number().int() })).mutation(async ({ ctx, input }) => {
    try {
      const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
      await destroyAccountSession(input.accountId);
      await deleteTradingAccount(input.accountId);
      return { success: true, message: "\u8D26\u6237\u5DF2\u5220\u9664" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new TRPCError3({
        code: "INTERNAL_SERVER_ERROR",
        message: errorMessage
      });
    }
  }),
  // 获取账户持仓
  getPositions: publicProcedure.input(
    z2.union([
      z2.object({ accountId: z2.number().int() }),
      z2.object({ connectionId: z2.number().int().positive() })
    ])
  ).query(async ({ ctx, input }) => {
    if ("connectionId" in input) {
      getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      return [];
    }
    if (ctx.user) {
      const account = await getOwnedAccountOrThrow(input.accountId, ctx.user.id);
      if (account.isSimulated) {
        return getSimPositions(input.accountId);
      }
      if (account.isConnected) {
        try {
          const adapter = await ensureConnectedAdapter(account, ctx.user.id);
          return await adapter.getPositions();
        } catch (error) {
          console.warn("[trading] getPositions via adapter failed, fallback to DB:", error);
        }
      }
    }
    const positions = await getLivePositions(input.accountId);
    return positions;
  }),
  // 获取订单列表
  getOrders: publicProcedure.input(
    z2.union([
      z2.object({
        accountId: z2.number().int(),
        status: z2.string().optional(),
        limit: z2.number().int().default(50)
      }),
      z2.object({
        connectionId: z2.number().int().positive(),
        limit: z2.number().int().default(50)
      })
    ])
  ).query(async ({ ctx, input }) => {
    if ("connectionId" in input) {
      getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      const orders2 = Array.from(legacyOrders.values()).filter((order) => order.connectionId === input.connectionId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return orders2.slice(0, input.limit);
    }
    if (ctx.user) {
      const account = await getOwnedAccountOrThrow(input.accountId, ctx.user.id);
      if (account.isSimulated) {
        return getSimOrders(input.accountId, input.limit);
      }
      if (account.isConnected) {
        try {
          const adapter = await ensureConnectedAdapter(account, ctx.user.id);
          const liveOrders = await adapter.getOrders(input.status);
          return liveOrders.slice(0, input.limit);
        } catch (error) {
          console.warn("[trading] getOrders via adapter failed, fallback to DB:", error);
        }
      }
    }
    const orders_list = await getOrders(input.accountId, input.status);
    return orders_list.slice(0, input.limit);
  }),
  // 提交订单
  submitOrder: publicProcedure.input(
    z2.union([
      z2.object({
        accountId: z2.number().int(),
        symbol: z2.string(),
        side: z2.enum(["buy", "sell"]),
        quantity: z2.number().int(),
        price: z2.number()
      }),
      z2.object({
        connectionId: z2.number().int().positive(),
        symbol: z2.string().min(1),
        side: z2.enum(["buy", "sell"]),
        quantity: z2.number().int().positive(),
        price: z2.number().positive(),
        orderType: z2.string().default("limit")
      })
    ])
  ).mutation(async ({ ctx, input }) => {
    if ("connectionId" in input) {
      const connection = getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      const orderId = `LEGACY_${legacyOrderIdSeq++}`;
      const now = /* @__PURE__ */ new Date();
      const order = {
        orderId,
        connectionId: connection.id,
        symbol: input.symbol,
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        orderType: input.orderType,
        status: "pending",
        createdAt: now,
        updatedAt: now
      };
      legacyOrders.set(orderId, order);
      return {
        orderId,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: order.price,
        status: order.status
      };
    }
    try {
      const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
      if (account.isSimulated) {
        const result = submitSimOrder(input.accountId, input.symbol, input.side, input.quantity, input.price);
        return { success: true, orderId: result.orderId };
      }
      const risk = await validateOrderRisk({
        accountId: input.accountId,
        accountConfig: account.config,
        quantity: input.quantity,
        price: input.price
      });
      if (!risk.allowed) {
        throw new Error(`[RISK_BLOCKED] ${risk.reason}`);
      }
      const adapter = await ensureConnectedAdapter(account, ctx.user?.id ?? 0);
      const orderId = await adapter.submitOrder(input.symbol, input.side, input.quantity, input.price);
      await saveOrder({
        accountId: input.accountId,
        orderId,
        symbol: input.symbol,
        side: input.side,
        quantity: input.quantity,
        price: input.price.toString(),
        status: "pending",
        filledQuantity: 0,
        submitTime: /* @__PURE__ */ new Date()
      });
      await saveTradeLog({
        accountId: input.accountId,
        orderId,
        eventType: "order_submitted",
        symbol: input.symbol,
        quantity: input.quantity,
        price: input.price.toString(),
        description: `${input.side.toUpperCase()} ${input.quantity} ${input.symbol} @ ${input.price}`
      });
      return { success: true, orderId };
    } catch (error) {
      throw error;
    }
  }),
  // 撤销订单
  cancelOrder: publicProcedure.input(
    z2.union([
      z2.object({ accountId: z2.number().int(), orderId: z2.string() }),
      z2.object({ connectionId: z2.number().int().positive(), orderId: z2.string() })
    ])
  ).mutation(async ({ ctx, input }) => {
    if ("connectionId" in input) {
      getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
      const order = legacyOrders.get(input.orderId);
      if (!order || order.connectionId !== input.connectionId) {
        throw new Error("Order not found");
      }
      order.status = "cancelled";
      order.updatedAt = /* @__PURE__ */ new Date();
      legacyOrders.set(order.orderId, order);
      return { success: true, message: `Order ${input.orderId} cancelled` };
    }
    try {
      const account = await getOwnedAccountOrThrow(input.accountId, ctx.user?.id ?? 0);
      const adapter = await ensureConnectedAdapter(account, ctx.user?.id ?? 0);
      const cancelled = await adapter.cancelOrder(input.orderId);
      if (cancelled) {
        await updateOrderStatus(input.orderId, "cancelled");
        await saveTradeLog({
          accountId: input.accountId,
          orderId: input.orderId,
          eventType: "order_cancelled",
          description: `Order ${input.orderId} cancelled`
        });
        return { success: true };
      } else {
        throw new Error("Failed to cancel order");
      }
    } catch (error) {
      throw error;
    }
  }),
  // 获取交易日志
  getTradeLogs: publicProcedure.input(
    z2.object({
      accountId: z2.number().int(),
      limit: z2.number().int().default(100),
      offset: z2.number().int().default(0)
    })
  ).query(async ({ input }) => {
    const logs = await getTradeLogs(input.accountId, input.limit, input.offset);
    return logs;
  }),
  // 获取最新行情
  getLatestMarketData: publicProcedure.input(z2.object({ accountId: z2.number().int(), symbol: z2.string() })).query(async ({ input }) => {
    const data = await getLatestMarketData(input.accountId, input.symbol);
    return data;
  }),
  // 更新账户资产信息
  updateAccountAssets: publicProcedure.input(
    z2.object({
      accountId: z2.number().int(),
      totalAssets: z2.number(),
      availableCash: z2.number(),
      marketValue: z2.number()
    })
  ).mutation(async ({ input }) => {
    const db = await Promise.resolve().then(() => (init_db(), db_exports)).then((m) => m.getDb());
    if (!db) throw new Error("Database not available");
    const { tradingAccounts: tradingAccounts2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { eq: eq20 } = await import("drizzle-orm");
    await db.update(tradingAccounts2).set({
      totalAssets: input.totalAssets.toString(),
      availableCash: input.availableCash.toString(),
      marketValue: input.marketValue.toString(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq20(tradingAccounts2.id, input.accountId));
    return { success: true };
  }),
  getRealtimeQuotes: publicProcedure.input(z2.object({ connectionId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
    getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
    const subscriptions = legacySubscriptions.get(input.connectionId);
    if (!subscriptions || subscriptions.size === 0) {
      return [];
    }
    return Array.from(subscriptions).map((symbol, idx) => ({
      symbol,
      price: 10 + idx,
      change: 0.1 * (idx + 1),
      changePercent: 1 + idx
    }));
  }),
  subscribeQuotes: publicProcedure.input(
    z2.object({
      connectionId: z2.number().int().positive(),
      symbols: z2.array(z2.string().min(1)).min(1)
    })
  ).mutation(async ({ ctx, input }) => {
    getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
    const subscribed = legacySubscriptions.get(input.connectionId) ?? /* @__PURE__ */ new Set();
    input.symbols.forEach((symbol) => subscribed.add(symbol));
    legacySubscriptions.set(input.connectionId, subscribed);
    return {
      success: true,
      subscribedSymbols: Array.from(subscribed)
    };
  }),
  getAccountInfo: publicProcedure.input(z2.object({ connectionId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
    getLegacyConnectionOrThrow(input.connectionId, ctx.user?.id ?? 0);
    const orders2 = Array.from(legacyOrders.values()).filter((order) => order.connectionId === input.connectionId);
    const positionValue = orders2.filter((order) => order.status !== "cancelled").reduce((sum2, order) => sum2 + order.quantity * order.price, 0);
    const totalAssets = 1e6 + positionValue;
    const availableCash = Math.max(0, totalAssets - positionValue);
    return {
      totalAssets,
      availableCash,
      positionValue
    };
  }),
  // 获取大盘指数
  getMarketIndices: publicProcedure.query(async () => {
    return await getMarketIndices();
  }),
  // 获取市场热度
  getMarketHeat: publicProcedure.query(async () => {
    return await getMarketHeat();
  }),
  // 获取资金流向
  getCapitalFlow: publicProcedure.query(async () => {
    return await getCapitalFlow();
  }),
  // 获取热点板块
  getHotSectors: publicProcedure.query(async ({ input }) => {
    const topN = input?.topN ?? 10;
    return await getHotSectors(topN);
  }),
  // ===== 股票排行榜 =====
  // 获取涨幅榜/跌幅榜
  getChangeRanking: publicProcedure.input(z2.object({ topN: z2.number().int().positive().default(50) }).optional()).query(async ({ input }) => {
    const topN = input?.topN ?? 50;
    return await getChangeRanking(topN);
  }),
  // 获取成交额榜
  getTurnoverRanking: publicProcedure.input(z2.object({ topN: z2.number().int().positive().default(50) }).optional()).query(async ({ input }) => {
    const topN = input?.topN ?? 50;
    return await getTurnoverRanking(topN);
  }),
  // 获取换手率榜
  getTurnoverRateRanking: publicProcedure.input(z2.object({ topN: z2.number().int().positive().default(50) }).optional()).query(async ({ input }) => {
    const topN = input?.topN ?? 50;
    return await getTurnoverRateRanking(topN);
  }),
  // 获取主力净流入榜
  getMainFlowRanking: publicProcedure.input(z2.object({ topN: z2.number().int().positive().default(50) }).optional()).query(async ({ input }) => {
    const topN = input?.topN ?? 50;
    return await getMainFlowRanking(topN);
  }),
  // 获取量比榜
  getVolumeRatioRanking: publicProcedure.input(z2.object({ topN: z2.number().int().positive().default(50) }).optional()).query(async ({ input }) => {
    const topN = input?.topN ?? 50;
    return await getVolumeRatioRanking(topN);
  }),
  // 获取振幅榜
  getAmplitudeRanking: publicProcedure.input(z2.object({ topN: z2.number().int().positive().default(50) }).optional()).query(async ({ input }) => {
    const topN = input?.topN ?? 50;
    return await getAmplitudeRanking(topN);
  }),
  // AI 选股（量化条件筛选）
  runStockPicker: publicProcedure.input(z2.object({
    min_turnover_rate: z2.number().optional(),
    min_volume_ratio: z2.number().optional(),
    main_board_only: z2.boolean().optional(),
    exclude_st: z2.boolean().optional(),
    require_yang: z2.boolean().optional(),
    require_inflow: z2.boolean().optional(),
    max_price: z2.number().optional(),
    min_float_mv: z2.number().optional(),
    max_float_mv: z2.number().optional(),
    kdj_j_gt_d: z2.boolean().optional(),
    min_kdj_d: z2.number().optional(),
    max_limit_up_days: z2.number().int().optional(),
    top_n: z2.number().int().optional()
  }).optional()).mutation(async ({ input }) => {
    return await runStockPicker(input ?? {});
  }),
  // ===== xtdata 扩展接口 =====
  getTradingDates: publicProcedure.input(z2.object({
    market: z2.string().default("SH"),
    startTime: z2.string().default(""),
    endTime: z2.string().default(""),
    count: z2.number().int().default(-1)
  }).optional()).query(async ({ input }) => {
    return await getTradingDates(input?.market, input?.startTime, input?.endTime, input?.count);
  }),
  getIndexWeight: publicProcedure.input(z2.object({ indexCode: z2.string().default("000300.SH") }).optional()).query(async ({ input }) => {
    return await getIndexWeight(input?.indexCode);
  }),
  getDividFactors: publicProcedure.input(z2.object({
    stockCode: z2.string(),
    startTime: z2.string().default(""),
    endTime: z2.string().default("")
  })).query(async ({ input }) => {
    return await getDividFactors(input.stockCode, input.startTime, input.endTime);
  }),
  getHisSt: publicProcedure.input(z2.object({ stockCode: z2.string() })).query(async ({ input }) => {
    return await getHisSt(input.stockCode);
  }),
  getIpoInfo: publicProcedure.input(z2.object({
    startTime: z2.string().default(""),
    endTime: z2.string().default("")
  }).optional()).query(async ({ input }) => {
    return await getIpoInfo(input?.startTime, input?.endTime);
  }),
  getEtfInfo: publicProcedure.query(async () => {
    return await getEtfInfo();
  }),
  getInstrumentDetailBatch: publicProcedure.input(z2.object({ codes: z2.array(z2.string()).min(1) })).query(async ({ input }) => {
    return await getInstrumentDetailBatch(input.codes);
  }),
  getTransactionCount: publicProcedure.input(z2.object({ codes: z2.array(z2.string()).min(1) })).query(async ({ input }) => {
    return await getTransactionCount(input.codes);
  }),
  getL2Quote: publicProcedure.input(z2.object({
    stockCode: z2.string(),
    startTime: z2.string().default(""),
    endTime: z2.string().default(""),
    count: z2.number().int().default(1)
  })).query(async ({ input }) => {
    return await getL2Quote(input.stockCode, input.startTime, input.endTime, input.count);
  }),
  getL2Order: publicProcedure.input(z2.object({
    stockCode: z2.string(),
    startTime: z2.string().default(""),
    endTime: z2.string().default(""),
    count: z2.number().int().default(100)
  })).query(async ({ input }) => {
    return await getL2Order(input.stockCode, input.startTime, input.endTime, input.count);
  }),
  getL2Transaction: publicProcedure.input(z2.object({
    stockCode: z2.string(),
    startTime: z2.string().default(""),
    endTime: z2.string().default(""),
    count: z2.number().int().default(100)
  })).query(async ({ input }) => {
    return await getL2Transaction(input.stockCode, input.startTime, input.endTime, input.count);
  }),
  getFinancialData: publicProcedure.input(z2.object({
    codes: z2.array(z2.string()).min(1),
    tables: z2.string().default("Balance,Income,CashFlow,PershareIndex"),
    startTime: z2.string().default(""),
    endTime: z2.string().default("")
  })).query(async ({ input }) => {
    return await getFinancialData(input.codes, input.tables, input.startTime, input.endTime);
  }),
  getMarkets: publicProcedure.query(async () => {
    return await getMarkets();
  }),
  getHolidays: publicProcedure.query(async () => {
    return await getHolidays();
  }),
  getFullKline: publicProcedure.input(z2.object({
    codes: z2.array(z2.string()).min(1),
    period: z2.string().default("1d")
  })).query(async ({ input }) => {
    return await getFullKline(input.codes, input.period);
  }),
  searchSymbols: publicProcedure.input(z2.object({
    keyword: z2.string(),
    limit: z2.number().int().min(1).max(20).optional()
  })).query(async ({ input }) => {
    return await searchSymbols(input.keyword, input.limit ?? 10);
  }),
  getQuoteSnapshots: publicProcedure.input(z2.object({ codes: z2.array(z2.string()).min(1) })).query(async ({ input }) => {
    return await getQuoteSnapshots(input.codes);
  }),
  // ===== AI 监控股票池 =====
  getMonitorConfig: publicProcedure.query(async () => {
    return await fetchMonitorConfig();
  }),
  getMonitorPool: publicProcedure.input(z2.object({ status: z2.string().optional() }).optional()).query(async ({ input }) => {
    return await fetchMonitorEntries({ status: input?.status });
  }),
  getMonitorFills: publicProcedure.input(z2.object({ limit: z2.number().int().min(1).max(200).optional() }).optional()).query(async ({ input }) => {
    return await fetchMonitorFills(input?.limit);
  }),
  createMonitorEntry: publicProcedure.input(monitorEntryInputSchema).mutation(async ({ input }) => {
    return await createMonitorEntry(input);
  }),
  updateMonitorEntry: publicProcedure.input(
    z2.object({
      id: z2.number().int().positive(),
      patch: monitorEntryUpdateSchema
    })
  ).mutation(async ({ input }) => {
    return await updateMonitorEntry(input.id, input.patch);
  }),
  deleteMonitorEntry: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input }) => {
    const success = await deleteMonitorEntry(input.id);
    if (!success) {
      throw new TRPCError3({ code: "BAD_REQUEST", message: "\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" });
    }
    return { success: true };
  })
});

// server/execution-monitor-router.ts
import { z as z3 } from "zod";

// server/execution-monitor-service.ts
init_db();

// server/parameter-scan-db.ts
init_schema();
init_db();
import { eq as eq4, and as and4, desc as desc4, asc as asc2 } from "drizzle-orm";
async function createParameterScanConfig(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(parameterScanConfigs).values(data);
}
async function getParameterScanConfig(configId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(parameterScanConfigs).where(eq4(parameterScanConfigs.id, configId)).limit(1);
  return result[0] || null;
}
async function getUserParameterScanConfigs(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (userId === 0) {
    return db.select().from(parameterScanConfigs).orderBy(desc4(parameterScanConfigs.createdAt));
  }
  return db.select().from(parameterScanConfigs).where(eq4(parameterScanConfigs.userId, userId)).orderBy(desc4(parameterScanConfigs.createdAt));
}
async function updateParameterScanConfigStatus(configId, status, progress = 0, startedAt, completedAt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = {
    status,
    progress: progress.toString()
  };
  if (startedAt) updateData.startedAt = startedAt;
  if (completedAt) updateData.completedAt = completedAt;
  await db.update(parameterScanConfigs).set(updateData).where(eq4(parameterScanConfigs.id, configId));
}
async function createParameterScanResult(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(parameterScanResults).values(data);
}
async function getParameterScanResults(configId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(parameterScanResults).where(eq4(parameterScanResults.scanConfigId, configId)).orderBy(asc2(parameterScanResults.iteration));
}
async function getParameterScanOptimalResult(configId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(parameterScanOptimalResults).where(eq4(parameterScanOptimalResults.scanConfigId, configId)).limit(1);
  return result[0] || null;
}
async function upsertParameterScanOptimalResult(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(parameterScanOptimalResults).where(eq4(parameterScanOptimalResults.scanConfigId, data.scanConfigId));
  return db.insert(parameterScanOptimalResults).values(data);
}
async function getParameterScanResultsRanking(configId, limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(parameterScanResults).where(
    and4(
      eq4(parameterScanResults.scanConfigId, configId),
      eq4(parameterScanResults.status, "completed")
    )
  ).orderBy(desc4(parameterScanResults.objectiveValue)).limit(limit);
}

// server/notification-provider.ts
function env(name, fallback = "") {
  return process.env[name]?.trim() ?? fallback;
}
function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parseEmailProvider(value) {
  if (value === "resend" || value === "webhook") {
    return value;
  }
  return "disabled";
}
function parseSmsProvider(value) {
  if (value === "twilio" || value === "webhook") {
    return value;
  }
  return "disabled";
}
function loadConfig() {
  return {
    timeoutMs: asPositiveInt(env("ALERT_PROVIDER_TIMEOUT_MS"), 8e3),
    emailProvider: parseEmailProvider(env("ALERT_EMAIL_PROVIDER", "disabled")),
    smsProvider: parseSmsProvider(env("ALERT_SMS_PROVIDER", "disabled")),
    resendApiKey: env("ALERT_RESEND_API_KEY"),
    resendFrom: env("ALERT_RESEND_FROM"),
    resendDefaultTo: env("ALERT_RESEND_DEFAULT_TO"),
    twilioAccountSid: env("ALERT_TWILIO_ACCOUNT_SID"),
    twilioAuthToken: env("ALERT_TWILIO_AUTH_TOKEN"),
    twilioFrom: env("ALERT_TWILIO_FROM"),
    twilioDefaultTo: env("ALERT_TWILIO_DEFAULT_TO"),
    emailWebhookUrl: env("ALERT_EMAIL_WEBHOOK_URL"),
    smsWebhookUrl: env("ALERT_SMS_WEBHOOK_URL")
  };
}
function splitTargets(raw) {
  return raw.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
}
function resolveTargets(target, fallbackTarget) {
  const merged = [target ?? "", fallbackTarget].filter(Boolean).join(",");
  return Array.from(new Set(splitTargets(merged)));
}
function normalizeSmsTarget(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return trimmed;
  }
  return `+${digits}`;
}
async function doFetchJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const text3 = await response.text();
    let body = text3;
    try {
      body = text3 ? JSON.parse(text3) : null;
    } catch {
      body = text3;
    }
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } finally {
    clearTimeout(timer);
  }
}
async function sendViaResend(config, req) {
  if (!config.resendApiKey || !config.resendFrom) {
    return {
      ok: false,
      provider: "resend",
      providerMessage: "ALERT_RESEND_API_KEY \u6216 ALERT_RESEND_FROM \u672A\u914D\u7F6E"
    };
  }
  const toList = resolveTargets(req.target, config.resendDefaultTo);
  if (toList.length === 0) {
    return {
      ok: false,
      provider: "resend",
      providerMessage: "\u90AE\u4EF6\u63A5\u6536\u76EE\u6807\u4E3A\u7A7A"
    };
  }
  const payload = {
    from: config.resendFrom,
    to: toList,
    subject: `[${req.level.toUpperCase()}] ${req.title}`,
    text: `${req.title}

${req.message}`
  };
  const response = await doFetchJson(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    config.timeoutMs
  );
  return {
    ok: response.ok,
    provider: "resend",
    providerMessage: response.ok ? "\u90AE\u4EF6\u53D1\u9001\u6210\u529F" : `Resend API \u9519\u8BEF(${response.status}): ${typeof response.body === "string" ? response.body : JSON.stringify(response.body)}`
  };
}
async function sendViaTwilio(config, req) {
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioFrom) {
    return {
      ok: false,
      provider: "twilio",
      providerMessage: "Twilio \u51ED\u636E\u672A\u5B8C\u6574\u914D\u7F6E"
    };
  }
  const toList = resolveTargets(req.target, config.twilioDefaultTo).map((item) => normalizeSmsTarget(item)).filter(Boolean);
  if (toList.length === 0) {
    return {
      ok: false,
      provider: "twilio",
      providerMessage: "\u77ED\u4FE1\u63A5\u6536\u76EE\u6807\u4E3A\u7A7A"
    };
  }
  const to = toList[0];
  const body = `[${req.level.toUpperCase()}] ${req.title} - ${req.message}`;
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64");
  const form = new URLSearchParams({
    To: to,
    From: config.twilioFrom,
    Body: body
  });
  const response = await doFetchJson(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    },
    config.timeoutMs
  );
  return {
    ok: response.ok,
    provider: "twilio",
    providerMessage: response.ok ? "\u77ED\u4FE1\u53D1\u9001\u6210\u529F" : `Twilio API \u9519\u8BEF(${response.status}): ${typeof response.body === "string" ? response.body : JSON.stringify(response.body)}`
  };
}
async function sendViaWebhook(url, providerName, config, req) {
  if (!url) {
    return {
      ok: false,
      provider: providerName,
      providerMessage: `${providerName} webhook URL \u672A\u914D\u7F6E`
    };
  }
  const response = await doFetchJson(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event: "risk_alert",
        channel: req.channel,
        level: req.level,
        title: req.title,
        message: req.message,
        target: req.target ?? "",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    },
    config.timeoutMs
  );
  return {
    ok: response.ok,
    provider: providerName,
    providerMessage: response.ok ? "Webhook \u53D1\u9001\u6210\u529F" : `${providerName} webhook \u9519\u8BEF(${response.status})`
  };
}
async function sendNotification(req) {
  if (req.channel === "in_app") {
    return {
      ok: true,
      provider: "in_app",
      providerMessage: "\u5E94\u7528\u5185\u901A\u77E5\u5DF2\u5165\u961F"
    };
  }
  const config = loadConfig();
  if (req.channel === "email") {
    switch (config.emailProvider) {
      case "resend":
        return sendViaResend(config, req);
      case "webhook":
        return sendViaWebhook(config.emailWebhookUrl, "email_webhook", config, req);
      default:
        return {
          ok: false,
          provider: "email",
          providerMessage: "\u90AE\u4EF6\u4F9B\u5E94\u5546\u672A\u542F\u7528\uFF08ALERT_EMAIL_PROVIDER\uFF09"
        };
    }
  }
  if (req.channel === "sms") {
    switch (config.smsProvider) {
      case "twilio":
        return sendViaTwilio(config, req);
      case "webhook":
        return sendViaWebhook(config.smsWebhookUrl, "sms_webhook", config, req);
      default:
        return {
          ok: false,
          provider: "sms",
          providerMessage: "\u77ED\u4FE1\u4F9B\u5E94\u5546\u672A\u542F\u7528\uFF08ALERT_SMS_PROVIDER\uFF09"
        };
    }
  }
  return {
    ok: false,
    provider: "unknown",
    providerMessage: "\u672A\u77E5\u901A\u77E5\u6E20\u9053"
  };
}

// server/execution-monitor-service.ts
function asNumber4(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}
function roundTo(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function normalizeParameterKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s\-]+/g, "_").toLowerCase();
}
function defaultAlertConfig() {
  return {
    thresholds: {
      maxDrawdown: 0.12,
      maxDailyLoss: 0.06,
      maxVar95: 0.04,
      maxConcentration: 0.35
    },
    channels: {
      in_app: { enabled: true, target: "" },
      email: { enabled: false, target: "" },
      sms: { enabled: false, target: "" }
    }
  };
}
var ExecutionMonitorService = class {
  userStates = /* @__PURE__ */ new Map();
  getState(userId) {
    const existing = this.userStates.get(userId);
    if (existing) {
      return existing;
    }
    const created = {
      engines: /* @__PURE__ */ new Map(),
      events: [],
      notifications: [],
      alertConfig: defaultAlertConfig(),
      metricStatus: /* @__PURE__ */ new Map(),
      autoJobs: /* @__PURE__ */ new Map(),
      seq: 1,
      notificationSeq: 1
    };
    this.userStates.set(userId, created);
    return created;
  }
  nextEventId(state) {
    const id = `evt_${Date.now()}_${state.seq}`;
    state.seq += 1;
    return id;
  }
  nextNotificationId(state) {
    const id = `ntf_${Date.now()}_${state.notificationSeq}`;
    state.notificationSeq += 1;
    return id;
  }
  pushEvent(state, event) {
    const record = {
      id: this.nextEventId(state),
      createdAt: /* @__PURE__ */ new Date(),
      ...event
    };
    state.events.unshift(record);
    if (state.events.length > 300) {
      state.events.length = 300;
    }
    return record;
  }
  pushNotification(state, message) {
    const record = {
      id: this.nextNotificationId(state),
      createdAt: /* @__PURE__ */ new Date(),
      ...message
    };
    state.notifications.unshift(record);
    if (state.notifications.length > 300) {
      state.notifications.length = 300;
    }
    return record;
  }
  async syncStrategies(userId) {
    const state = this.getState(userId);
    let strategies2 = [];
    try {
      strategies2 = await getStrategiesByUserId(userId);
    } catch {
      strategies2 = [];
    }
    if (strategies2.length === 0) {
      for (const strategyId of Array.from(state.autoJobs.keys())) {
        this.stopAutoOptimizeJob(userId, strategyId);
      }
      state.engines.clear();
      return;
    }
    const keepIds = /* @__PURE__ */ new Set();
    for (const strategy of strategies2) {
      keepIds.add(strategy.id);
      const existing = state.engines.get(strategy.id);
      const baseCapital = asNumber4(strategy.initialCapital, 1e6);
      if (existing) {
        existing.strategyName = strategy.name;
        existing.baseCapital = baseCapital;
        existing.positionMarketValue = existing.positionMarketValue ?? 0;
        existing.boundAccountId = existing.boundAccountId ?? null;
        existing.lastExecutionAt = existing.lastExecutionAt ?? null;
        existing.stopLossTriggeredSymbols = existing.stopLossTriggeredSymbols ?? /* @__PURE__ */ new Set();
        continue;
      }
      state.engines.set(strategy.id, {
        strategyId: strategy.id,
        strategyName: strategy.name,
        isRunning: false,
        startedAt: null,
        lastHeartbeat: null,
        cycleCount: 0,
        ordersToday: 0,
        pnl: 0,
        baseCapital,
        positionMarketValue: 0,
        boundAccountId: null,
        lastExecutionAt: null,
        stopLossTriggeredSymbols: /* @__PURE__ */ new Set(),
        autoOptimizeEnabled: false,
        optimizeIntervalMinutes: 60,
        autoOptimizeScanConfigId: null,
        nextOptimizeAt: null,
        lastOptimizationAt: null,
        appliedScanConfigId: null,
        appliedObjectiveValue: null,
        latestParameters: {
          short_window: asNumber4(strategy.shortWindow, 20),
          long_window: asNumber4(strategy.longWindow, 60),
          volatility_window: asNumber4(strategy.volatilityWindow, 30),
          target_count: asNumber4(strategy.targetCount, 10),
          trend_ratio: asNumber4(strategy.trendRatio, 0.5),
          stop_loss_ratio: asNumber4(strategy.stopLossRatio, 0.08)
        }
      });
    }
    for (const [strategyId, engine2] of Array.from(state.engines.entries())) {
      if (!keepIds.has(strategyId)) {
        if (engine2.isRunning) {
          this.stopAutoOptimizeJob(userId, strategyId);
        }
        state.engines.delete(strategyId);
      }
    }
  }
  pumpEngineRuntime(state) {
    const now = /* @__PURE__ */ new Date();
    for (const engine2 of Array.from(state.engines.values())) {
      if (!engine2.isRunning) {
        continue;
      }
      engine2.lastHeartbeat = now;
      engine2.cycleCount += 1;
    }
  }
  async runStrategyExecution(userId, state) {
    let connectedAccounts = [];
    try {
      connectedAccounts = (await getTradingAccountsByUserId(userId)).filter(
        (item) => item.isConnected
      );
    } catch (error) {
      this.pushEvent(state, {
        type: "engine",
        level: "warning",
        title: "\u81EA\u52A8\u6267\u884C\u6682\u4E0D\u53EF\u7528",
        message: `\u8BFB\u53D6\u4EA4\u6613\u8D26\u6237\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`
      });
      return;
    }
    for (const engine2 of Array.from(state.engines.values())) {
      if (!engine2.isRunning || engine2.strategyId <= 0) {
        continue;
      }
      if (engine2.lastExecutionAt && Date.now() - engine2.lastExecutionAt.getTime() < 15e3) {
        continue;
      }
      const account = connectedAccounts.find((item) => item.strategyId === engine2.strategyId) ?? connectedAccounts[0];
      if (!account) {
        engine2.boundAccountId = null;
        if (engine2.cycleCount % 20 === 0) {
          this.pushEvent(state, {
            type: "engine",
            level: "warning",
            strategyId: engine2.strategyId,
            title: "\u672A\u53D1\u73B0\u53EF\u7528\u5B9E\u76D8\u8D26\u6237",
            message: `${engine2.strategyName} \u672A\u7ED1\u5B9A\u5DF2\u8FDE\u63A5\u4EA4\u6613\u8D26\u6237\uFF0C\u81EA\u52A8\u6267\u884C\u5DF2\u8DF3\u8FC7\u3002`
          });
        }
        continue;
      }
      engine2.boundAccountId = account.id;
      try {
        const { adapter } = await getExecutionAdapterForAccount(userId, account.id);
        const positions = (await adapter.getPositions()).map((item) => ({
          symbol: item.symbol,
          quantity: item.quantity,
          costPrice: item.costPrice,
          currentPrice: item.currentPrice,
          marketValue: asNumber4(item.marketValue, item.quantity * item.currentPrice),
          floatingProfit: asNumber4(item.floatingProfit)
        }));
        engine2.positionMarketValue = roundTo(
          positions.reduce((sum2, item) => sum2 + Math.max(0, item.marketValue), 0),
          2
        );
        engine2.pnl = roundTo(
          positions.reduce((sum2, item) => sum2 + item.floatingProfit, 0),
          2
        );
        const riskConfig = getRiskControlConfig(account.config);
        const stopLossTargets = detectStopLossPositions(positions, riskConfig);
        for (const position of stopLossTargets) {
          if (engine2.stopLossTriggeredSymbols.has(position.symbol)) {
            continue;
          }
          const quantity2 = Math.max(1, Math.floor(position.quantity));
          const risk2 = await validateOrderRisk({
            accountId: account.id,
            accountConfig: account.config,
            quantity: quantity2,
            price: position.currentPrice
          });
          if (!risk2.allowed) {
            this.pushEvent(state, {
              type: "risk",
              level: "warning",
              strategyId: engine2.strategyId,
              title: "\u6B62\u635F\u5355\u88AB\u98CE\u63A7\u62E6\u622A",
              message: `${position.symbol} \u6B62\u635F\u89E6\u53D1\uFF0C\u4F46\u8BA2\u5355\u672A\u901A\u8FC7\u98CE\u63A7: ${risk2.reason}`
            });
            continue;
          }
          const orderId2 = await adapter.submitOrder(
            position.symbol,
            "sell",
            quantity2,
            position.currentPrice
          );
          await saveOrder({
            accountId: account.id,
            orderId: orderId2,
            symbol: position.symbol,
            side: "sell",
            quantity: quantity2,
            price: position.currentPrice.toString(),
            status: "pending",
            filledQuantity: 0,
            submitTime: /* @__PURE__ */ new Date()
          });
          await saveTradeLog({
            accountId: account.id,
            orderId: orderId2,
            eventType: "order_submitted",
            symbol: position.symbol,
            quantity: quantity2,
            price: position.currentPrice.toString(),
            description: `STOP_LOSS SELL ${quantity2} ${position.symbol} @ ${position.currentPrice}`
          });
          engine2.stopLossTriggeredSymbols.add(position.symbol);
          engine2.ordersToday += 1;
          this.pushEvent(state, {
            type: "risk",
            level: "critical",
            strategyId: engine2.strategyId,
            title: "\u89E6\u53D1\u81EA\u52A8\u6B62\u635F",
            message: `${position.symbol} \u8DCC\u7834\u6B62\u635F\u9608\u503C\uFF0C\u5DF2\u81EA\u52A8\u63D0\u4EA4\u5356\u51FA ${quantity2} \u80A1\u3002`
          });
        }
        const targetCount = Math.max(
          1,
          Math.round(asNumber4(engine2.latestParameters.target_count, 10))
        );
        const settingsFallback = getSettingsFallback();
        const symbol = (process.env.STRATEGY_EXEC_DEFAULT_SYMBOL || settingsFallback.indexSymbol || "").trim();
        if (!symbol) {
          if (engine2.cycleCount % 40 === 0) {
            this.pushEvent(state, {
              type: "engine",
              level: "warning",
              strategyId: engine2.strategyId,
              title: "\u81EA\u52A8\u4E0B\u5355\u5DF2\u8DF3\u8FC7",
              message: "\u672A\u914D\u7F6E STRATEGY_EXEC_DEFAULT_SYMBOL\uFF0C\u65E0\u6CD5\u6267\u884C\u81EA\u52A8\u4E70\u5165\u3002"
            });
          }
          engine2.lastExecutionAt = /* @__PURE__ */ new Date();
          continue;
        }
        const heldSymbols = new Set(
          positions.filter((item) => item.quantity > 0).map((item) => item.symbol)
        );
        if (heldSymbols.has(symbol) || heldSymbols.size >= targetCount) {
          engine2.lastExecutionAt = /* @__PURE__ */ new Date();
          continue;
        }
        const pendingOrders = await adapter.getOrders("pending");
        const hasPendingBuy = pendingOrders.some(
          (item) => item.side === "buy" && item.symbol === symbol
        );
        if (hasPendingBuy) {
          engine2.lastExecutionAt = /* @__PURE__ */ new Date();
          continue;
        }
        const configuredPrice = Number.parseFloat(process.env.STRATEGY_EXEC_DEFAULT_PRICE || "");
        const fallbackPrice = positions.find((item) => item.symbol === symbol)?.currentPrice ?? 0;
        const price = roundTo(
          Number.isFinite(configuredPrice) && configuredPrice > 0 ? configuredPrice : fallbackPrice,
          2
        );
        if (!(price > 0)) {
          if (engine2.cycleCount % 40 === 0) {
            this.pushEvent(state, {
              type: "engine",
              level: "warning",
              strategyId: engine2.strategyId,
              title: "\u81EA\u52A8\u4E0B\u5355\u5DF2\u8DF3\u8FC7",
              message: `\u6807\u7684 ${symbol} \u672A\u83B7\u53D6\u5230\u6709\u6548\u4EF7\u683C\uFF0C\u8BF7\u914D\u7F6E STRATEGY_EXEC_DEFAULT_PRICE\u3002`
            });
          }
          engine2.lastExecutionAt = /* @__PURE__ */ new Date();
          continue;
        }
        const configuredQuantity = Number.parseInt(process.env.STRATEGY_EXEC_DEFAULT_QUANTITY || "", 10);
        const quantity = Number.isFinite(configuredQuantity) && configuredQuantity > 0 ? configuredQuantity : Math.max(100, Math.round(targetCount * 10));
        const risk = await validateOrderRisk({
          accountId: account.id,
          accountConfig: account.config,
          quantity,
          price
        });
        if (!risk.allowed) {
          this.pushEvent(state, {
            type: "risk",
            level: "warning",
            strategyId: engine2.strategyId,
            title: "\u7B56\u7565\u4E0B\u5355\u88AB\u98CE\u63A7\u62E6\u622A",
            message: risk.reason || "\u98CE\u9669\u63A7\u5236\u7B56\u7565\u62D2\u7EDD\u4E0B\u5355"
          });
          engine2.lastExecutionAt = /* @__PURE__ */ new Date();
          continue;
        }
        const orderId = await adapter.submitOrder(symbol, "buy", quantity, price);
        await saveOrder({
          accountId: account.id,
          orderId,
          symbol,
          side: "buy",
          quantity,
          price: price.toString(),
          status: "pending",
          filledQuantity: 0,
          submitTime: /* @__PURE__ */ new Date()
        });
        await saveTradeLog({
          accountId: account.id,
          orderId,
          eventType: "order_submitted",
          symbol,
          quantity,
          price: price.toString(),
          description: `AUTO BUY ${quantity} ${symbol} @ ${price}`
        });
        engine2.ordersToday += 1;
        engine2.lastExecutionAt = /* @__PURE__ */ new Date();
        this.pushEvent(state, {
          type: "order",
          level: "info",
          strategyId: engine2.strategyId,
          title: "\u81EA\u52A8\u7B56\u7565\u4E0B\u5355",
          message: `${engine2.strategyName} \u5DF2\u81EA\u52A8\u63D0\u4EA4\u4E70\u5355 ${symbol} ${quantity} @ ${price} (\u8D26\u6237#${account.id})`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.pushEvent(state, {
          type: "engine",
          level: "critical",
          strategyId: engine2.strategyId,
          title: "\u7B56\u7565\u81EA\u52A8\u6267\u884C\u5931\u8D25",
          message
        });
      }
    }
  }
  buildRiskMetrics(state) {
    const thresholds = state.alertConfig.thresholds;
    const engines = Array.from(state.engines.values());
    const running = engines.filter((engine2) => engine2.isRunning);
    const totalBase = engines.reduce((sum2, item) => sum2 + item.baseCapital, 0) || 1e6;
    const totalPnl = engines.reduce((sum2, item) => sum2 + item.pnl, 0);
    const drawdown = roundTo(Math.max(0, -totalPnl / totalBase), 4);
    const dailyLoss = roundTo(Math.max(0, -totalPnl / totalBase), 4);
    const totalPositionValue = Math.max(
      0,
      engines.reduce((sum2, item) => sum2 + Math.max(0, item.positionMarketValue), 0)
    );
    const largestPositionValue = engines.reduce(
      (max, item) => Math.max(max, Math.max(0, item.positionMarketValue)),
      0
    );
    const runningConcentration = totalPositionValue > 0 ? roundTo(largestPositionValue / totalPositionValue, 4) : 0;
    const var95 = roundTo(
      Math.min(0.2, Math.max(0, drawdown * 0.6 + dailyLoss * 0.25 + runningConcentration * 0.15)),
      4
    );
    const composeStatus = (value, threshold) => {
      if (value >= threshold * 1.3) {
        return "critical";
      }
      if (value >= threshold) {
        return "warning";
      }
      return "normal";
    };
    return [
      {
        key: "drawdown",
        label: "\u7EC4\u5408\u56DE\u64A4",
        value: drawdown,
        threshold: thresholds.maxDrawdown,
        unit: "%",
        direction: "max",
        status: composeStatus(drawdown, thresholds.maxDrawdown)
      },
      {
        key: "daily_loss",
        label: "\u65E5\u5185\u4E8F\u635F",
        value: dailyLoss,
        threshold: thresholds.maxDailyLoss,
        unit: "%",
        direction: "max",
        status: composeStatus(dailyLoss, thresholds.maxDailyLoss)
      },
      {
        key: "var95",
        label: "VaR(95)",
        value: var95,
        threshold: thresholds.maxVar95,
        unit: "%",
        direction: "max",
        status: composeStatus(var95, thresholds.maxVar95)
      },
      {
        key: "concentration",
        label: "\u6301\u4ED3\u96C6\u4E2D\u5EA6",
        value: runningConcentration,
        threshold: thresholds.maxConcentration,
        unit: "%",
        direction: "max",
        status: composeStatus(runningConcentration, thresholds.maxConcentration)
      }
    ];
  }
  dispatchAlertNotifications(state, metric) {
    return this.dispatchAlertNotificationsInternal(state, metric);
  }
  async dispatchAlertNotificationsInternal(state, metric) {
    const level = metric.status === "critical" ? "critical" : "warning";
    const alertTitle = `${metric.label} \u8D85\u9608\u503C`;
    const alertMessage = `${metric.label} \u5F53\u524D ${(metric.value * 100).toFixed(2)}%\uFF0C\u9608\u503C ${(metric.threshold * 100).toFixed(2)}%\u3002`;
    this.pushEvent(state, {
      type: "risk",
      level,
      title: alertTitle,
      message: alertMessage
    });
    const channels = state.alertConfig.channels;
    const channelEntries = [
      ["in_app", channels.in_app],
      ["email", channels.email],
      ["sms", channels.sms]
    ];
    for (const [channel, config] of channelEntries) {
      if (!config.enabled) {
        continue;
      }
      const target = config.target || (channel === "in_app" ? "in_app" : "");
      const result = await sendNotification({
        channel,
        level,
        title: alertTitle,
        message: alertMessage,
        target
      });
      const notification = this.pushNotification(state, {
        channel,
        level,
        title: alertTitle,
        message: alertMessage,
        target,
        status: result.ok ? "sent" : "failed"
      });
      this.pushEvent(state, {
        type: "notification",
        level: result.ok ? "info" : "warning",
        title: `${channel.toUpperCase()} \u901A\u77E5${result.ok ? "\u5DF2\u53D1\u9001" : "\u5931\u8D25"}`,
        message: `${notification.title} -> ${target || "\u9ED8\u8BA4\u901A\u9053"} (${result.provider}: ${result.providerMessage})`
      });
    }
  }
  async evaluateAlertTransitions(state, metrics) {
    for (const metric of metrics) {
      const previous = state.metricStatus.get(metric.key) ?? "normal";
      const current = metric.status;
      if (current !== previous) {
        state.metricStatus.set(metric.key, current);
        if (current === "normal") {
          this.pushEvent(state, {
            type: "risk",
            level: "info",
            title: `${metric.label} \u5DF2\u6062\u590D`,
            message: `${metric.label} \u56DE\u843D\u81F3\u5B89\u5168\u533A\u95F4\u3002`
          });
          continue;
        }
        await this.dispatchAlertNotifications(state, metric);
      }
    }
  }
  toSnapshot(engine2) {
    return {
      strategyId: engine2.strategyId,
      strategyName: engine2.strategyName,
      isRunning: engine2.isRunning,
      startedAt: engine2.startedAt,
      lastHeartbeat: engine2.lastHeartbeat,
      cycleCount: engine2.cycleCount,
      ordersToday: engine2.ordersToday,
      pnl: roundTo(engine2.pnl, 2),
      baseCapital: engine2.baseCapital,
      boundAccountId: engine2.boundAccountId,
      lastExecutionAt: engine2.lastExecutionAt,
      autoOptimizeEnabled: engine2.autoOptimizeEnabled,
      optimizeIntervalMinutes: engine2.optimizeIntervalMinutes,
      autoOptimizeScanConfigId: engine2.autoOptimizeScanConfigId,
      nextOptimizeAt: engine2.nextOptimizeAt,
      lastOptimizationAt: engine2.lastOptimizationAt,
      appliedScanConfigId: engine2.appliedScanConfigId,
      appliedObjectiveValue: engine2.appliedObjectiveValue,
      latestParameters: engine2.latestParameters
    };
  }
  async getSnapshot(userId, eventLimit = 80) {
    await this.syncStrategies(userId);
    const state = this.getState(userId);
    this.pumpEngineRuntime(state);
    await this.runStrategyExecution(userId, state);
    const riskMetrics = this.buildRiskMetrics(state);
    await this.evaluateAlertTransitions(state, riskMetrics);
    const alerts = riskMetrics.filter((metric) => metric.status !== "normal");
    return {
      generatedAt: /* @__PURE__ */ new Date(),
      execution: Array.from(state.engines.values()).map((engine2) => this.toSnapshot(engine2)).sort((a, b) => a.strategyId - b.strategyId),
      riskMetrics,
      alerts,
      events: state.events.slice(0, Math.max(10, Math.min(eventLimit, 200))),
      notifications: state.notifications.slice(0, 80)
    };
  }
  async startEngine(userId, strategyId) {
    await this.syncStrategies(userId);
    const state = this.getState(userId);
    const engine2 = state.engines.get(strategyId);
    if (!engine2) {
      throw new Error("Strategy not found");
    }
    if (!engine2.isRunning) {
      engine2.isRunning = true;
      engine2.startedAt = /* @__PURE__ */ new Date();
      engine2.lastHeartbeat = /* @__PURE__ */ new Date();
      engine2.lastExecutionAt = null;
      engine2.stopLossTriggeredSymbols.clear();
      this.pushEvent(state, {
        type: "engine",
        level: "info",
        title: "\u7B56\u7565\u5F15\u64CE\u5DF2\u542F\u52A8",
        strategyId,
        message: `${engine2.strategyName} \u5DF2\u8FDB\u5165\u6267\u884C\u72B6\u6001\u3002`
      });
    }
    return { success: true };
  }
  async stopEngine(userId, strategyId) {
    await this.syncStrategies(userId);
    const state = this.getState(userId);
    const engine2 = state.engines.get(strategyId);
    if (!engine2) {
      throw new Error("Strategy not found");
    }
    if (engine2.isRunning) {
      engine2.isRunning = false;
      this.pushEvent(state, {
        type: "engine",
        level: "warning",
        title: "\u7B56\u7565\u5F15\u64CE\u5DF2\u505C\u6B62",
        strategyId,
        message: `${engine2.strategyName} \u5DF2\u505C\u6B62\u6267\u884C\u3002`
      });
    }
    return { success: true };
  }
  async getAlertConfig(userId) {
    const state = this.getState(userId);
    return state.alertConfig;
  }
  async updateAlertConfig(userId, config) {
    const state = this.getState(userId);
    state.alertConfig = config;
    this.pushEvent(state, {
      type: "risk",
      level: "info",
      title: "\u98CE\u63A7\u9608\u503C\u5DF2\u66F4\u65B0",
      message: "\u544A\u8B66\u9608\u503C\u4E0E\u901A\u77E5\u901A\u9053\u914D\u7F6E\u5DF2\u4FDD\u5B58\u3002"
    });
    return state.alertConfig;
  }
  async getNotifications(userId, limit = 50) {
    const state = this.getState(userId);
    return state.notifications.slice(0, Math.max(1, Math.min(limit, 200)));
  }
  async markNotificationRead(userId, notificationId) {
    const state = this.getState(userId);
    const target = state.notifications.find((item) => item.id === notificationId);
    if (!target) {
      throw new Error("Notification not found");
    }
    target.status = "read";
    return { success: true };
  }
  async sendTestNotification(userId, input) {
    const state = this.getState(userId);
    const level = "warning";
    const title = input.title?.trim() || "\u6D4B\u8BD5\u544A\u8B66\u901A\u77E5";
    const message = input.message?.trim() || "\u8FD9\u662F\u4E00\u6761\u6765\u81EA\u6267\u884C\u76D1\u63A7\u7CFB\u7EDF\u7684\u6D4B\u8BD5\u901A\u77E5\u3002";
    const target = input.target?.trim() || (input.channel === "in_app" ? "in_app" : "");
    const result = await sendNotification({
      channel: input.channel,
      level,
      title,
      message,
      target
    });
    const notification = this.pushNotification(state, {
      channel: input.channel,
      level,
      title,
      message,
      target,
      status: result.ok ? "sent" : "failed"
    });
    this.pushEvent(state, {
      type: "notification",
      level: result.ok ? "info" : "warning",
      title: `${input.channel.toUpperCase()} \u6D4B\u8BD5\u901A\u77E5${result.ok ? "\u5DF2\u53D1\u9001" : "\u5931\u8D25"}`,
      message: `${notification.title} -> ${target || "\u9ED8\u8BA4\u901A\u9053"} (${result.provider}: ${result.providerMessage})`
    });
    return {
      success: result.ok,
      provider: result.provider,
      providerMessage: result.providerMessage
    };
  }
  mapOptimalParameters(parameters) {
    const normalized = /* @__PURE__ */ new Map();
    for (const [key, value] of Object.entries(parameters)) {
      normalized.set(normalizeParameterKey(key), value);
    }
    const pick = (aliases) => {
      for (const alias of aliases) {
        const value = normalized.get(normalizeParameterKey(alias));
        if (value !== void 0) {
          return value;
        }
      }
      return void 0;
    };
    const updateData = {};
    const appliedParameters = {};
    const shortWindow = pick(["short_window", "shortWindow", "fast_ma", "ma_fast"]);
    if (shortWindow !== void 0) {
      const value = Math.max(1, Math.round(shortWindow));
      updateData.shortWindow = value;
      appliedParameters.short_window = value;
    }
    const longWindow = pick(["long_window", "longWindow", "slow_ma", "ma_slow"]);
    if (longWindow !== void 0) {
      const value = Math.max(2, Math.round(longWindow));
      updateData.longWindow = value;
      appliedParameters.long_window = value;
    }
    const volatilityWindow = pick(["volatility_window", "volatilityWindow"]);
    if (volatilityWindow !== void 0) {
      const value = Math.max(2, Math.round(volatilityWindow));
      updateData.volatilityWindow = value;
      appliedParameters.volatility_window = value;
    }
    const targetCount = pick(["target_count", "targetCount"]);
    if (targetCount !== void 0) {
      const value = Math.max(1, Math.round(targetCount));
      updateData.targetCount = value;
      appliedParameters.target_count = value;
    }
    const trendRatio = pick(["trend_ratio", "trendRatio"]);
    if (trendRatio !== void 0) {
      const value = roundTo(trendRatio, 4);
      updateData.trendRatio = value.toString();
      appliedParameters.trend_ratio = value;
    }
    const stopLossRatio = pick(["stop_loss_ratio", "stopLossRatio"]);
    if (stopLossRatio !== void 0) {
      const value = roundTo(stopLossRatio, 4);
      updateData.stopLossRatio = value.toString();
      appliedParameters.stop_loss_ratio = value;
    }
    const maxProfitDrawdown = pick(["max_profit_drawdown", "maxProfitDrawdown"]);
    if (maxProfitDrawdown !== void 0) {
      const value = roundTo(maxProfitDrawdown, 4);
      updateData.maxProfitDrawdown = value.toString();
      appliedParameters.max_profit_drawdown = value;
    }
    const newHighTimeout = pick(["new_high_timeout", "newHighTimeout", "new_high_timeout_days"]);
    if (newHighTimeout !== void 0) {
      const value = Math.max(1, Math.round(newHighTimeout));
      updateData.newHighTimeout = value;
      appliedParameters.new_high_timeout = value;
    }
    return { updateData, appliedParameters };
  }
  normalizeParameterValues(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const raw = value;
    const result = {};
    for (const [key, val] of Object.entries(raw)) {
      const numeric = asNumber4(val, Number.NaN);
      if (Number.isFinite(numeric)) {
        result[key] = numeric;
      }
    }
    return result;
  }
  async resolveOptimalResult(userId, strategyId, scanConfigId) {
    if (scanConfigId !== void 0) {
      const config = await getParameterScanConfig(scanConfigId);
      if (!config || config.userId !== userId) {
        throw new Error("Scan config not found");
      }
      if (config.strategyId !== strategyId) {
        throw new Error("Scan config does not belong to this strategy");
      }
      const optimal = await getParameterScanOptimalResult(scanConfigId);
      if (!optimal) {
        throw new Error("No optimal result found for this scan config");
      }
      return {
        scanConfigId,
        objectiveValue: asNumber4(optimal.objectiveValue),
        parameters: this.normalizeParameterValues(optimal.parameters)
      };
    }
    const configs = await getUserParameterScanConfigs(userId);
    const candidates = configs.filter((config) => config.strategyId === strategyId).sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
    for (const config of candidates) {
      const optimal = await getParameterScanOptimalResult(config.id);
      if (!optimal) {
        continue;
      }
      const normalized = this.normalizeParameterValues(optimal.parameters);
      if (Object.keys(normalized).length === 0) {
        continue;
      }
      return {
        scanConfigId: config.id,
        objectiveValue: asNumber4(optimal.objectiveValue),
        parameters: normalized
      };
    }
    throw new Error("No available optimal parameters for this strategy");
  }
  async applyOptimalParametersInternal(userId, input, source) {
    await this.syncStrategies(userId);
    const state = this.getState(userId);
    const engine2 = state.engines.get(input.strategyId);
    if (!engine2) {
      throw new Error("Strategy not found");
    }
    const optimal = await this.resolveOptimalResult(userId, input.strategyId, input.scanConfigId);
    const { updateData, appliedParameters } = this.mapOptimalParameters(optimal.parameters);
    if (Object.keys(appliedParameters).length === 0) {
      throw new Error("No recognized strategy parameters in optimal result");
    }
    const strategy = await getStrategyById(input.strategyId);
    if (strategy && strategy.userId !== userId) {
      throw new Error("Strategy not found");
    }
    if (strategy) {
      await updateStrategy(input.strategyId, updateData);
    }
    engine2.latestParameters = {
      ...engine2.latestParameters,
      ...appliedParameters
    };
    engine2.lastOptimizationAt = /* @__PURE__ */ new Date();
    engine2.appliedScanConfigId = optimal.scanConfigId;
    engine2.appliedObjectiveValue = optimal.objectiveValue;
    const modeLabel = source === "scheduler" ? "\u5B9A\u65F6\u8C03\u4F18" : "\u624B\u52A8\u8C03\u4F18";
    this.pushEvent(state, {
      type: "optimization",
      level: "info",
      strategyId: input.strategyId,
      title: `${modeLabel}\u53C2\u6570\u5DF2\u5E94\u7528`,
      message: `${engine2.strategyName} \u5DF2\u5E94\u7528\u626B\u63CF #${optimal.scanConfigId} \u7684\u6700\u4F18\u53C2\u6570\u3002`
    });
    return {
      success: true,
      strategyId: engine2.strategyId,
      strategyName: engine2.strategyName,
      scanConfigId: optimal.scanConfigId,
      objectiveValue: optimal.objectiveValue,
      appliedParameters
    };
  }
  async applyOptimalParameters(userId, input) {
    return this.applyOptimalParametersInternal(userId, input, "manual");
  }
  stopAutoOptimizeJob(userId, strategyId) {
    const state = this.getState(userId);
    const job = state.autoJobs.get(strategyId);
    if (!job) {
      return;
    }
    clearInterval(job.timer);
    state.autoJobs.delete(strategyId);
  }
  async runAutoOptimization(userId, strategyId) {
    const state = this.getState(userId);
    const job = state.autoJobs.get(strategyId);
    if (!job || job.running) {
      return;
    }
    const engine2 = state.engines.get(strategyId);
    if (!engine2 || !engine2.autoOptimizeEnabled) {
      return;
    }
    job.running = true;
    try {
      await this.applyOptimalParametersInternal(
        userId,
        {
          strategyId,
          scanConfigId: job.scanConfigId ?? void 0
        },
        "scheduler"
      );
      engine2.nextOptimizeAt = new Date(Date.now() + job.intervalMinutes * 6e4);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushEvent(state, {
        type: "optimization",
        level: "critical",
        strategyId,
        title: "\u5B9A\u65F6\u8C03\u4F18\u5931\u8D25",
        message
      });
    } finally {
      job.running = false;
    }
  }
  async setAutoOptimization(userId, input) {
    await this.syncStrategies(userId);
    const state = this.getState(userId);
    const engine2 = state.engines.get(input.strategyId);
    if (!engine2) {
      throw new Error("Strategy not found");
    }
    this.stopAutoOptimizeJob(userId, input.strategyId);
    engine2.autoOptimizeEnabled = input.enabled;
    engine2.optimizeIntervalMinutes = input.intervalMinutes;
    engine2.autoOptimizeScanConfigId = input.scanConfigId ?? null;
    if (!input.enabled) {
      engine2.nextOptimizeAt = null;
      this.pushEvent(state, {
        type: "optimization",
        level: "warning",
        strategyId: input.strategyId,
        title: "\u81EA\u52A8\u8C03\u4F18\u5DF2\u5173\u95ED",
        message: `${engine2.strategyName} \u4E0D\u518D\u81EA\u52A8\u5E94\u7528\u6700\u4F18\u53C2\u6570\u3002`
      });
      return { success: true, nextOptimizeAt: null };
    }
    const intervalMinutes = Math.max(1, Math.floor(input.intervalMinutes));
    const timer = setInterval(() => {
      void this.runAutoOptimization(userId, input.strategyId);
    }, intervalMinutes * 6e4);
    timer.unref?.();
    state.autoJobs.set(input.strategyId, {
      enabled: true,
      intervalMinutes,
      scanConfigId: input.scanConfigId ?? null,
      timer,
      running: false
    });
    engine2.nextOptimizeAt = new Date(Date.now() + intervalMinutes * 6e4);
    this.pushEvent(state, {
      type: "optimization",
      level: "info",
      strategyId: input.strategyId,
      title: "\u81EA\u52A8\u8C03\u4F18\u5DF2\u542F\u7528",
      message: `${engine2.strategyName} \u5C06\u6BCF ${intervalMinutes} \u5206\u949F\u91CD\u4F18\u5316\u4E00\u6B21\u3002`
    });
    return { success: true, nextOptimizeAt: engine2.nextOptimizeAt };
  }
};
var executionMonitorService = new ExecutionMonitorService();

// server/execution-monitor-router.ts
var channelSchema = z3.object({
  enabled: z3.boolean(),
  target: z3.string().default("")
});
var alertConfigSchema = z3.object({
  thresholds: z3.object({
    maxDrawdown: z3.number().min(0).max(1),
    maxDailyLoss: z3.number().min(0).max(1),
    maxVar95: z3.number().min(0).max(1),
    maxConcentration: z3.number().min(0).max(1)
  }),
  channels: z3.object({
    in_app: channelSchema,
    email: channelSchema,
    sms: channelSchema
  })
});
var executionMonitorRouter = router({
  getSnapshot: publicProcedure.input(
    z3.object({
      eventLimit: z3.number().int().min(10).max(200).default(80)
    }).optional()
  ).query(async ({ ctx, input }) => {
    return executionMonitorService.getSnapshot(ctx.user?.id ?? 0, input?.eventLimit ?? 80);
  }),
  startEngine: publicProcedure.input(z3.object({ strategyId: z3.number().int().nonnegative() })).mutation(async ({ ctx, input }) => {
    return executionMonitorService.startEngine(ctx.user?.id ?? 0, input.strategyId);
  }),
  stopEngine: publicProcedure.input(z3.object({ strategyId: z3.number().int().nonnegative() })).mutation(async ({ ctx, input }) => {
    return executionMonitorService.stopEngine(ctx.user?.id ?? 0, input.strategyId);
  }),
  applyOptimalParameters: publicProcedure.input(
    z3.object({
      strategyId: z3.number().int().nonnegative(),
      scanConfigId: z3.number().int().positive().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    return executionMonitorService.applyOptimalParameters(ctx.user?.id ?? 0, {
      strategyId: input.strategyId,
      scanConfigId: input.scanConfigId
    });
  }),
  setAutoOptimization: publicProcedure.input(
    z3.object({
      strategyId: z3.number().int().nonnegative(),
      enabled: z3.boolean(),
      intervalMinutes: z3.number().int().min(1).max(24 * 60),
      scanConfigId: z3.number().int().positive().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    return executionMonitorService.setAutoOptimization(ctx.user?.id ?? 0, {
      strategyId: input.strategyId,
      enabled: input.enabled,
      intervalMinutes: input.intervalMinutes,
      scanConfigId: input.scanConfigId
    });
  }),
  getAlertConfig: publicProcedure.query(async ({ ctx }) => {
    return executionMonitorService.getAlertConfig(ctx.user?.id ?? 0);
  }),
  updateAlertConfig: publicProcedure.input(alertConfigSchema).mutation(async ({ ctx, input }) => {
    return executionMonitorService.updateAlertConfig(ctx.user?.id ?? 0, input);
  }),
  getNotifications: publicProcedure.input(
    z3.object({
      limit: z3.number().int().min(1).max(200).default(50),
      channel: z3.enum(["in_app", "email", "sms"]).optional()
    }).optional()
  ).query(async ({ ctx, input }) => {
    const list = await executionMonitorService.getNotifications(ctx.user?.id ?? 0, input?.limit ?? 50);
    if (!input?.channel) {
      return list;
    }
    return list.filter((item) => item.channel === input.channel);
  }),
  markNotificationRead: publicProcedure.input(
    z3.object({
      notificationId: z3.string().min(1)
    })
  ).mutation(async ({ ctx, input }) => {
    return executionMonitorService.markNotificationRead(ctx.user?.id ?? 0, input.notificationId);
  }),
  sendTestNotification: publicProcedure.input(
    z3.object({
      channel: z3.enum(["in_app", "email", "sms"]),
      target: z3.string().optional(),
      title: z3.string().optional(),
      message: z3.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    return executionMonitorService.sendTestNotification(ctx.user?.id ?? 0, input);
  })
});

// server/optimization-router.ts
import { z as z4 } from "zod";
import { TRPCError as TRPCError4 } from "@trpc/server";

// server/ai/config.ts
init_env();
var rawEnv = process.env;
var OPENCLAW_MODEL = rawEnv.OPENCLAW_MODEL ?? ENV.OPENCLAW_MODEL ?? "deepseek-coder";
var OPENCLAW_ENDPOINT = rawEnv.OPENCLAW_ENDPOINT ?? ENV.OPENCLAW_ENDPOINT ?? "http://127.0.0.1:11434";
var QMT_API_BASE_URL2 = rawEnv.QMT_API_BASE_URL ?? ENV.QMT_API_BASE_URL ?? "http://127.0.0.1:8082";
var AI_BROWSER_WHITELIST = (rawEnv.AI_BROWSER_WHITELIST ?? ENV.AI_BROWSER_WHITELIST ?? "news,finance,cnstock").split(",").map((value) => value.trim()).filter((value) => value.length > 0);
var AI_DEFAULT_TIMEOUT_MS = Number(
  rawEnv.AI_DEFAULT_TIMEOUT_MS ?? ENV.AI_DEFAULT_TIMEOUT_MS ?? 45e3
);

// server/ai/toolkit.ts
async function httpRequest(path7, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${QMT_API_BASE_URL2}${path7}`, {
      method: options.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : void 0,
      signal: options.signal ?? controller.signal
    });
    if (!response.ok) {
      const text3 = await response.text();
      throw new Error(`QMT API ${response.status} ${response.statusText}: ${text3}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
var QmtToolEngine = class {
  getHistoryKline(params) {
    return httpRequest("/qmt/get_history_kline", { body: params });
  }
  submitBacktest(params) {
    return httpRequest("/qmt/submit_backtest", { body: params });
  }
  getBacktestStatus(params) {
    return httpRequest("/qmt/backtest_status", {
      body: params
    });
  }
  getBacktestReport(params) {
    return httpRequest("/qmt/backtest_report", {
      body: params
    });
  }
  deployStrategy(params) {
    return httpRequest("/qmt/strategy/deploy", { body: params });
  }
  getDeploymentStatus(params) {
    return httpRequest(
      "/qmt/strategy/status",
      { body: params }
    );
  }
  fetchAccountSnapshot(params) {
    return httpRequest("/qmt/account/positions", {
      body: params
    });
  }
  fetchRiskMetrics() {
    return httpRequest("/qmt/risk_metrics", {
      body: {}
    });
  }
  fetchNewsDigest(params) {
    return httpRequest("/qmt/news_feed", {
      body: params
    });
  }
};

// server/optimization/qmt-backtest-runner.ts
var qmtEngine = new QmtToolEngine();
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function buildStrategyCode(context) {
  const paramEntries = Object.entries(context.parameters).map(([key, value]) => `    "${key}": ${value}`).join(",\n");
  return `# Auto-generated tuning strategy
# Strategy ID: ${context.strategyId}
# Backtest: ${context.backtestStart} -> ${context.backtestEnd}
# Benchmark: ${context.benchmark ?? "000300.SH"}

PARAMS = {
${paramEntries}
}

def init(context):
    context.params = PARAMS
    context.index = 0

def handlebar(context, data_dict):
    for symbol, data in data_dict.items():
        if len(data['close']) < 30:
            continue
        short = int(context.params.get('short_window', 10))
        long = int(context.params.get('long_window', 30))
        if short <= 0 or long <= 0 or short >= long:
            continue
        ma_short = data['close'][-short:].mean()
        ma_long = data['close'][-long:].mean()
        position = context.get_position(symbol)
        if ma_short > ma_long and not position:
            context.order_target_percent(symbol, min(context.params.get('max_position', 0.05), 0.2))
        elif ma_short < ma_long and position:
            context.order_target_percent(symbol, 0)

def on_order(context, order):
    pass
`;
}
function normalizeMetrics(report) {
  const metrics = report?.metrics ?? {};
  const totalReturn = Number(metrics.total_return ?? metrics.totalReturn ?? 0);
  const annualReturn = Number(metrics.annual_return ?? metrics.annualReturn ?? totalReturn);
  const sharpeRatio = Number(metrics.sharpe_ratio ?? metrics.sharpeRatio ?? 0);
  const maxDrawdown = Number(metrics.max_drawdown ?? metrics.maxDrawdown ?? 0);
  const calmarRatio = Number(metrics.calmar_ratio ?? metrics.calmarRatio ?? 0);
  const winRate = Number(metrics.win_rate ?? metrics.winRate ?? 0);
  const volatility = Number(metrics.volatility ?? 0);
  const tradeCount = Number(metrics.trade_count ?? metrics.tradeCount ?? 0);
  return {
    totalReturn,
    annualReturn,
    sharpeRatio,
    maxDrawdown,
    calmarRatio,
    winRate,
    volatility,
    tradeCount
  };
}
async function runRemoteBacktest(context) {
  const strategyCode = buildStrategyCode(context);
  const submission = await qmtEngine.submitBacktest({
    strategy_code: strategyCode,
    backtest_config: {
      start: context.backtestStart,
      end: context.backtestEnd,
      benchmark: context.benchmark ?? "000300.SH",
      initialCapital: context.initialCapital ?? 1e6
    }
  });
  let status = "pending";
  let attempts = 0;
  while (status === "pending" || status === "running") {
    const poll = await qmtEngine.getBacktestStatus({ task_id: submission.task_id });
    status = poll.status;
    if (status === "completed") break;
    if (status === "failed") {
      throw new Error(`Remote backtest failed: ${poll.status}`);
    }
    attempts += 1;
    if (attempts > 120) {
      throw new Error("Remote backtest timeout");
    }
    await sleep(2e3);
  }
  const report = await qmtEngine.getBacktestReport({ task_id: submission.task_id });
  return normalizeMetrics(report.report);
}

// server/optimization/grid-search.ts
function generateParameterCombinations(ranges) {
  if (ranges.length === 0) return [{}];
  const combinations = [];
  const current = {};
  function generate(index2) {
    if (index2 === ranges.length) {
      combinations.push({ ...current });
      return;
    }
    const range = ranges[index2];
    for (const value of range.values) {
      current[range.name] = value;
      generate(index2 + 1);
    }
  }
  generate(0);
  return combinations;
}
function calculateScore(result, objective, customFn) {
  switch (objective) {
    case "max_sharpe":
      return result.sharpeRatio;
    case "max_return":
      return result.totalReturn;
    case "min_drawdown":
      return -result.maxDrawdown;
    case "max_calmar":
      return result.calmarRatio;
    case "custom":
      return customFn ? customFn(result) : result.sharpeRatio;
    default:
      return result.sharpeRatio;
  }
}
async function executeBacktest(strategyId, parameters, config) {
  const metrics = await runRemoteBacktest({
    strategyId,
    parameters,
    backtestStart: config.backtestStart,
    backtestEnd: config.backtestEnd,
    benchmark: "000300.SH",
    initialCapital: config.initialCapital
  });
  return {
    parameters,
    totalReturn: metrics.totalReturn,
    annualReturn: metrics.annualReturn,
    sharpeRatio: metrics.sharpeRatio,
    maxDrawdown: metrics.maxDrawdown,
    calmarRatio: metrics.calmarRatio,
    winRate: metrics.winRate,
    volatility: metrics.volatility,
    tradeCount: metrics.tradeCount,
    score: 0
  };
}
var GRID_SEARCH_CONCURRENCY = 5;
async function executeGridSearch(config) {
  const combinations = generateParameterCombinations(config.parameterRanges);
  const progress = {
    total: combinations.length,
    completed: 0,
    failed: 0,
    current: 0,
    results: []
  };
  console.log(`[GridSearch] \u5F00\u59CB\u6267\u884C\uFF0C\u5171 ${combinations.length} \u4E2A\u53C2\u6570\u7EC4\u5408\uFF0C\u5E76\u53D1\u6570 ${GRID_SEARCH_CONCURRENCY}`);
  let index2 = 0;
  async function runNext() {
    if (index2 >= combinations.length) return;
    const i = index2++;
    const params = combinations[i];
    progress.current = Math.max(progress.current, i + 1);
    try {
      const result = await executeBacktest(config.strategyId, params, config);
      result.score = calculateScore(result, config.objective, config.customObjective);
      progress.results.push(result);
      progress.completed++;
      if (!progress.bestResult || result.score > progress.bestResult.score) {
        progress.bestResult = result;
      }
      console.log(`[GridSearch] \u8FDB\u5EA6\uFF1A${progress.completed}/${combinations.length}, \u6700\u4F18\u5F97\u5206\uFF1A${progress.bestResult?.score?.toFixed(4)}`);
    } catch (error) {
      console.error(`[GridSearch] \u7EC4\u5408 ${i + 1} \u5931\u8D25:`, error);
      progress.failed++;
    }
    await runNext();
  }
  const workers = Array.from(
    { length: Math.min(GRID_SEARCH_CONCURRENCY, combinations.length) },
    () => runNext()
  );
  await Promise.all(workers);
  console.log(`[GridSearch] \u5B8C\u6210\uFF0C\u6700\u4F18\u7ED3\u679C\uFF1A`, progress.bestResult);
  return progress;
}
function getTotalCombinations(ranges) {
  return ranges.reduce((product, range) => product * range.values.length, 1);
}
function validateParameterRanges(ranges) {
  const errors = [];
  if (ranges.length === 0) {
    errors.push("\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u53C2\u6570\u8303\u56F4");
  }
  ranges.forEach((range, index2) => {
    if (!range.name || range.name.trim() === "") {
      errors.push(`\u53C2\u6570 ${index2 + 1} \u7F3A\u5C11\u540D\u79F0`);
    }
    if (!range.values || range.values.length === 0) {
      errors.push(`\u53C2\u6570 "${range.name}" \u7F3A\u5C11\u53D6\u503C`);
    }
    if (range.values.length > 20) {
      errors.push(`\u53C2\u6570 "${range.name}" \u7684\u53D6\u503C\u8FC7\u591A\uFF08${range.values.length}\u4E2A\uFF09\uFF0C\u5EFA\u8BAE\u4E0D\u8D85\u8FC7 20 \u4E2A`);
    }
  });
  const totalCombinations = getTotalCombinations(ranges);
  if (totalCombinations > 1e3) {
    errors.push(`\u53C2\u6570\u7EC4\u5408\u603B\u6570\u8FC7\u591A\uFF08${totalCombinations}\u4E2A\uFF09\uFF0C\u5EFA\u8BAE\u4E0D\u8D85\u8FC7 1000 \u4E2A`);
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

// server/optimization/bayesian-optimization.ts
var RandomGenerator = class {
  seed;
  constructor(seed = Math.random() * 1e4) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  uniform(min, max) {
    return min + this.next() * (max - min);
  }
  gaussian(mean = 0, std = 1) {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * std;
  }
};
var SurrogateModel = class {
  points = [];
  rng;
  constructor(rng) {
    this.rng = rng;
  }
  addPoint(params, score) {
    this.points.push({ params, score });
  }
  /**
   * 预测给定点的得分和不确定性
   */
  predict(params) {
    if (this.points.length === 0) {
      return { mean: 0, std: 1 };
    }
    const distances = this.points.map((point) => ({
      dist: Math.sqrt(params.reduce((sum2, p, i) => sum2 + Math.pow(p - point.params[i], 2), 0)),
      score: point.score
    }));
    distances.sort((a, b) => a.dist - b.dist);
    const k = Math.min(5, distances.length);
    const nearest = distances.slice(0, k);
    const weights = nearest.map((d) => 1 / (d.dist + 1e-6));
    const totalWeight = weights.reduce((sum2, w) => sum2 + w, 0);
    const mean = nearest.reduce((sum2, d, i) => sum2 + weights[i] * d.score, 0) / totalWeight;
    const variance = nearest.reduce((sum2, d, i) => {
      return sum2 + weights[i] * Math.pow(d.score - mean, 2);
    }, 0) / totalWeight;
    return { mean, std: Math.sqrt(variance) + 0.1 };
  }
};
var AcquisitionFunction = class {
  constructor(type, kappa = 2, xi = 0.01) {
    this.type = type;
    this.kappa = kappa;
    this.xi = xi;
  }
  calculate(mean, std, bestScore) {
    switch (this.type) {
      case "ei":
        if (std < 1e-6) return 0;
        const z16 = (mean - bestScore - this.xi) / std;
        return (mean - bestScore - this.xi) * this.cdf(z16) + std * this.pdf(z16);
      case "ucb":
        return mean + this.kappa * std;
      case "pi":
        if (std < 1e-6) return mean > bestScore ? 1 : 0;
        const z22 = (mean - bestScore - this.xi) / std;
        return this.cdf(z22);
      default:
        return mean;
    }
  }
  pdf(x) {
    return 1 / Math.sqrt(2 * Math.PI) * Math.exp(-0.5 * x * x);
  }
  cdf(x) {
    return 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))));
  }
};
async function executeBayesianBacktest(strategyId, parameters, config) {
  const metrics = await runRemoteBacktest({
    strategyId,
    parameters,
    backtestStart: config.backtestStart,
    backtestEnd: config.backtestEnd,
    benchmark: "000300.SH",
    initialCapital: config.initialCapital
  });
  let score;
  switch (config.objective) {
    case "max_sharpe":
      score = metrics.sharpeRatio;
      break;
    case "max_return":
      score = metrics.totalReturn;
      break;
    case "min_drawdown":
      score = -metrics.maxDrawdown;
      break;
    case "max_calmar":
      score = metrics.calmarRatio;
      break;
  }
  return { score, metrics };
}
function normalizeParams(params, bounds) {
  const result = {};
  bounds.forEach((bound, i) => {
    result[bound.name] = params[i];
  });
  return result;
}
function generateInitialPoints(bounds, nPoints, rng) {
  const points = [];
  for (let i = 0; i < nPoints; i++) {
    const point = bounds.map((bound) => rng.uniform(bound.min, bound.max));
    points.push(point);
  }
  return points;
}
async function executeBayesianOptimization(config) {
  const rng = new RandomGenerator();
  const model = new SurrogateModel(rng);
  const acquisition = new AcquisitionFunction(
    config.acquisitionFunction,
    config.kappa,
    config.xi
  );
  let bestScore = -Infinity;
  let bestResult = null;
  const history = [];
  console.log(`[BayesianOpt] \u5F00\u59CB\u4F18\u5316\uFF0C\u5171 ${config.nIterations} \u6B21\u8FED\u4EE3`);
  const initialPoints = generateInitialPoints(config.parameterBounds, config.nInitialPoints, rng);
  for (let i = 0; i < initialPoints.length; i++) {
    const params = normalizeParams(initialPoints[i], config.parameterBounds);
    const { score, metrics } = await executeBayesianBacktest(config.strategyId, params, config);
    model.addPoint(initialPoints[i], score);
    history.push({ parameters: params, score, metrics, iteration: i + 1 });
    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        parameters: params,
        score,
        metrics,
        iteration: i + 1
      };
    }
    console.log(`[BayesianOpt] \u521D\u59CB\u70B9 ${i + 1}/${initialPoints.length}, \u5F97\u5206\uFF1A${score.toFixed(4)}`);
  }
  for (let iter = initialPoints.length + 1; iter <= config.nIterations; iter++) {
    const candidates = [];
    for (let c = 0; c < 100; c++) {
      const candidate = config.parameterBounds.map((bound) => rng.uniform(bound.min, bound.max));
      const { mean, std } = model.predict(candidate);
      const acqValue = acquisition.calculate(mean, std, bestScore);
      candidates.push({ params: candidate, acqValue });
    }
    candidates.sort((a, b) => b.acqValue - a.acqValue);
    const bestCandidate = candidates[0].params;
    const params = normalizeParams(bestCandidate, config.parameterBounds);
    const { score, metrics } = await executeBayesianBacktest(config.strategyId, params, config);
    model.addPoint(bestCandidate, score);
    history.push({ parameters: params, score, metrics, iteration: iter });
    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        parameters: params,
        score,
        metrics,
        iteration: iter
      };
      console.log(`[BayesianOpt] \u8FED\u4EE3 ${iter}/${config.nIterations}, \u65B0\u6700\u4F18\u5F97\u5206\uFF1A${score.toFixed(4)}`);
    } else {
      console.log(`[BayesianOpt] \u8FED\u4EE3 ${iter}/${config.nIterations}, \u5F97\u5206\uFF1A${score.toFixed(4)}`);
    }
  }
  console.log(`[BayesianOpt] \u4F18\u5316\u5B8C\u6210\uFF0C\u6700\u4F18\u5F97\u5206\uFF1A${bestScore.toFixed(4)}`);
  return {
    iteration: config.nIterations,
    totalIterations: config.nIterations,
    currentBest: bestResult,
    history
  };
}
function validateBayesianConfig(config) {
  const errors = [];
  if (config.parameterBounds.length === 0) {
    errors.push("\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u53C2\u6570\u8FB9\u754C");
  }
  config.parameterBounds.forEach((bound, index2) => {
    if (!bound.name || bound.name.trim() === "") {
      errors.push(`\u53C2\u6570 ${index2 + 1} \u7F3A\u5C11\u540D\u79F0`);
    }
    if (bound.min >= bound.max) {
      errors.push(`\u53C2\u6570 "${bound.name}" \u7684\u6700\u5C0F\u503C\u5FC5\u987B\u5C0F\u4E8E\u6700\u5927\u503C`);
    }
  });
  if (config.nIterations < 10) {
    errors.push("\u8FED\u4EE3\u6B21\u6570\u8FC7\u5C11\uFF0C\u5EFA\u8BAE\u81F3\u5C11 10 \u6B21");
  }
  if (config.nIterations > 200) {
    errors.push("\u8FED\u4EE3\u6B21\u6570\u8FC7\u591A\uFF0C\u5EFA\u8BAE\u4E0D\u8D85\u8FC7 200 \u6B21");
  }
  if (config.nInitialPoints < 2) {
    errors.push("\u521D\u59CB\u70B9\u6570\u8FC7\u5C11\uFF0C\u5EFA\u8BAE\u81F3\u5C11 2 \u4E2A");
  }
  if (config.nInitialPoints > config.nIterations / 2) {
    errors.push("\u521D\u59CB\u70B9\u6570\u4E0D\u5E94\u8D85\u8FC7\u603B\u8FED\u4EE3\u6B21\u6570\u7684\u4E00\u534A");
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

// server/optimization-router.ts
var optimizationTasks = /* @__PURE__ */ new Map();
var taskIdCounter = 0;
var optimizationRouter = router({
  // ============ 网格搜索 ============
  /**
   * 启动网格搜索任务
   */
  startGridSearch: publicProcedure.input(
    z4.object({
      strategyId: z4.number(),
      parameterRanges: z4.array(
        z4.object({
          name: z4.string(),
          values: z4.array(z4.number())
        })
      ),
      backtestStart: z4.string(),
      backtestEnd: z4.string(),
      initialCapital: z4.number(),
      targetCount: z4.number(),
      frequency: z4.enum(["daily", "weekly", "monthly"]),
      objective: z4.enum(["max_sharpe", "max_return", "min_drawdown", "max_calmar"])
    })
  ).mutation(async ({ input }) => {
    const validation = validateParameterRanges(input.parameterRanges);
    if (!validation.valid) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: validation.errors.join(", ")
      });
    }
    const taskId = ++taskIdCounter;
    (async () => {
      try {
        const progress = await executeGridSearch({
          strategyId: input.strategyId,
          parameterRanges: input.parameterRanges,
          backtestStart: input.backtestStart,
          backtestEnd: input.backtestEnd,
          initialCapital: input.initialCapital,
          targetCount: input.targetCount,
          frequency: input.frequency,
          objective: input.objective
        });
        optimizationTasks.set(taskId, { type: "grid", progress, config: input });
      } catch (error) {
        console.error("[Optimization] Grid search failed:", error);
        optimizationTasks.delete(taskId);
      }
    })();
    return { taskId, totalCombinations: getTotalCombinations(input.parameterRanges) };
  }),
  /**
   * 获取网格搜索任务进度
   */
  getGridSearchProgress: publicProcedure.input(z4.object({ taskId: z4.number() })).query(async ({ input }) => {
    const task = optimizationTasks.get(input.taskId);
    if (!task || task.type !== "grid") {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u7F51\u683C\u641C\u7D22\u4EFB\u52A1"
      });
    }
    return task.progress;
  }),
  // ============ 贝叶斯优化 ============
  /**
   * 启动贝叶斯优化任务
   */
  startBayesianOptimization: publicProcedure.input(
    z4.object({
      strategyId: z4.number(),
      parameterBounds: z4.array(
        z4.object({
          name: z4.string(),
          min: z4.number(),
          max: z4.number()
        })
      ),
      backtestStart: z4.string(),
      backtestEnd: z4.string(),
      initialCapital: z4.number(),
      targetCount: z4.number(),
      frequency: z4.enum(["daily", "weekly", "monthly"]),
      objective: z4.enum(["max_sharpe", "max_return", "min_drawdown", "max_calmar"]),
      nIterations: z4.number().min(10).max(200),
      nInitialPoints: z4.number().min(2).max(50),
      acquisitionFunction: z4.enum(["ei", "ucb", "pi"]).default("ei"),
      kappa: z4.number().default(2),
      xi: z4.number().default(0.01)
    })
  ).mutation(async ({ input }) => {
    const validation = validateBayesianConfig(input);
    if (!validation.valid) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: validation.errors.join(", ")
      });
    }
    const taskId = ++taskIdCounter;
    (async () => {
      try {
        const progress = await executeBayesianOptimization({
          strategyId: input.strategyId,
          parameterBounds: input.parameterBounds,
          backtestStart: input.backtestStart,
          backtestEnd: input.backtestEnd,
          initialCapital: input.initialCapital,
          targetCount: input.targetCount,
          frequency: input.frequency,
          objective: input.objective,
          nIterations: input.nIterations,
          nInitialPoints: input.nInitialPoints,
          acquisitionFunction: input.acquisitionFunction,
          kappa: input.kappa,
          xi: input.xi
        });
        optimizationTasks.set(taskId, { type: "bayesian", progress, config: input });
      } catch (error) {
        console.error("[Optimization] Bayesian optimization failed:", error);
        optimizationTasks.delete(taskId);
      }
    })();
    return { taskId };
  }),
  /**
   * 获取贝叶斯优化任务进度
   */
  getBayesianOptimizationProgress: publicProcedure.input(z4.object({ taskId: z4.number() })).query(async ({ input }) => {
    const task = optimizationTasks.get(input.taskId);
    if (!task || task.type !== "bayesian") {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u8D1D\u53F6\u65AF\u4F18\u5316\u4EFB\u52A1"
      });
    }
    return task.progress;
  }),
  // ============ 通用任务管理 ============
  /**
   * 获取所有优化任务列表
   */
  getAllTasks: publicProcedure.query(async () => {
    const tasks2 = Array.from(optimizationTasks.entries()).map(([id, task]) => ({
      id,
      type: task.type,
      status: task.type === "grid" ? task.progress.completed === task.progress.total ? "completed" : "running" : task.progress.iteration >= task.progress.totalIterations ? "completed" : "running",
      progress: task.type === "grid" ? {
        completed: task.progress.completed,
        total: task.progress.total,
        percentage: Math.round(task.progress.completed / task.progress.total * 100)
      } : {
        iteration: task.progress.iteration,
        total: task.progress.totalIterations,
        percentage: Math.round(task.progress.iteration / task.progress.totalIterations * 100)
      },
      bestScore: task.type === "grid" ? task.progress.bestResult?.score : task.progress.currentBest?.score
    }));
    return tasks2.sort((a, b) => b.id - a.id);
  }),
  /**
   * 获取任务详情（包含最优结果）
   */
  getTaskDetail: publicProcedure.input(z4.object({ taskId: z4.number() })).query(async ({ input }) => {
    const task = optimizationTasks.get(input.taskId);
    if (!task) {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "\u4EFB\u52A1\u4E0D\u5B58\u5728"
      });
    }
    if (task.type === "grid") {
      return {
        type: "grid",
        progress: task.progress,
        bestResult: task.progress.bestResult,
        config: task.config
      };
    } else {
      return {
        type: "bayesian",
        progress: task.progress,
        bestResult: task.progress.currentBest,
        config: task.config
      };
    }
  })
});

// server/portfolio-router.ts
import { z as z5 } from "zod";

// server/portfolio-optimization-db.ts
async function createPortfolio(data) {
  console.log("[PortfolioOptimization] Creating portfolio:", data);
  return { id: Date.now(), ...data, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() };
}
async function getUserPortfolios(userId) {
  return [
    {
      id: 1,
      userId,
      portfolioName: "\u5747\u8861\u7EC4\u5408",
      description: "\u591A\u56E0\u5B50\u7B56\u7565\u5747\u8861\u7EC4\u5408",
      isActive: true,
      createdAt: /* @__PURE__ */ new Date("2024-01-01"),
      updatedAt: /* @__PURE__ */ new Date("2024-03-06")
    },
    {
      id: 2,
      userId,
      portfolioName: "\u6FC0\u8FDB\u7EC4\u5408",
      description: "\u9AD8\u6536\u76CA\u9AD8\u98CE\u9669\u7EC4\u5408",
      isActive: false,
      createdAt: /* @__PURE__ */ new Date("2023-12-01"),
      updatedAt: /* @__PURE__ */ new Date("2024-02-01")
    }
  ];
}
async function getPortfolioDetail(portfolioId) {
  return {
    id: portfolioId,
    userId: 1,
    portfolioName: "\u5747\u8861\u7EC4\u5408",
    description: "\u591A\u56E0\u5B50\u7B56\u7565\u5747\u8861\u7EC4\u5408",
    isActive: true,
    strategies: [
      {
        id: 1,
        portfolioId,
        strategyId: 1,
        strategyName: "\u5C0F\u5E02\u503C\u56E0\u5B50\u7B56\u7565",
        weight: 0.4,
        minWeight: 0.2,
        maxWeight: 0.6,
        rebalanceFrequency: "monthly",
        currentReturn: 0.253,
        currentSharpe: 1.8234
      },
      {
        id: 2,
        portfolioId,
        strategyId: 2,
        strategyName: "\u4EF7\u503C\u56E0\u5B50\u7B56\u7565",
        weight: 0.3,
        minWeight: 0.15,
        maxWeight: 0.5,
        rebalanceFrequency: "monthly",
        currentReturn: 0.185,
        currentSharpe: 1.2345
      },
      {
        id: 3,
        portfolioId,
        strategyId: 3,
        strategyName: "\u52A8\u91CF\u56E0\u5B50\u7B56\u7565",
        weight: 0.3,
        minWeight: 0.15,
        maxWeight: 0.5,
        rebalanceFrequency: "monthly",
        currentReturn: 0.142,
        currentSharpe: 0.9876
      }
    ],
    createdAt: /* @__PURE__ */ new Date("2024-01-01"),
    updatedAt: /* @__PURE__ */ new Date("2024-03-06")
  };
}
async function addStrategyToPortfolio(portfolioId, strategyId, weight, minWeight, maxWeight) {
  console.log(`[PortfolioOptimization] Adding strategy ${strategyId} to portfolio ${portfolioId} with weight ${weight}`);
  return { success: true };
}
async function updateStrategyWeight(portfolioId, strategyId, newWeight) {
  console.log(
    `[PortfolioOptimization] Updating weight for strategy ${strategyId} in portfolio ${portfolioId} to ${newWeight}`
  );
  return { success: true };
}
async function removeStrategyFromPortfolio(portfolioId, strategyId) {
  console.log(`[PortfolioOptimization] Removing strategy ${strategyId} from portfolio ${portfolioId}`);
  return { success: true };
}
async function calculateOptimalWeights(portfolioId, strategies2, constraints) {
  const n = strategies2.length;
  const weights = {};
  let totalSharpe = 0;
  const sharpeRatios = {};
  strategies2.forEach((s) => {
    const avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    const variance = s.returns.reduce((sum2, r) => sum2 + Math.pow(r - avgReturn, 2), 0) / s.returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;
    sharpeRatios[s.strategyId] = sharpe;
    totalSharpe += sharpe;
  });
  strategies2.forEach((s) => {
    weights[s.strategyId] = totalSharpe > 0 ? sharpeRatios[s.strategyId] / totalSharpe : 1 / n;
  });
  return {
    weights,
    expectedReturn: calculatePortfolioReturn(strategies2, weights),
    expectedRisk: calculatePortfolioRisk(strategies2, weights),
    sharpeRatio: calculatePortfolioSharpe(strategies2, weights)
  };
}
async function getPortfolioSnapshots(portfolioId, limit = 30) {
  const snapshots = [];
  for (let i = 0; i < limit; i++) {
    const date = /* @__PURE__ */ new Date();
    date.setDate(date.getDate() - (limit - i));
    snapshots.push({
      id: i,
      portfolioId,
      date,
      totalReturn: 0.15 + Math.random() * 0.1,
      annualReturn: 0.18 + Math.random() * 0.08,
      sharpeRatio: 1.5 + Math.random() * 0.5,
      maxDrawdown: -0.12 - Math.random() * 0.08,
      winRate: 0.55 + Math.random() * 0.1,
      volatility: 0.15 + Math.random() * 0.05,
      correlation: 0.6 + Math.random() * 0.2,
      diversificationRatio: 1.8 + Math.random() * 0.3,
      createdAt: date
    });
  }
  return snapshots;
}
async function comparePortfolios(portfolioIds) {
  const portfolios = await Promise.all(
    portfolioIds.map((id) => getPortfolioDetail(id))
  );
  const stats = portfolios.map((p) => {
    const strategies2 = p.strategies;
    const weightedReturn = strategies2.reduce((sum2, s) => sum2 + s.weight * s.currentReturn, 0);
    const weightedSharpe = strategies2.reduce((sum2, s) => sum2 + s.weight * s.currentSharpe, 0);
    return {
      portfolioId: p.id,
      portfolioName: p.portfolioName,
      expectedReturn: weightedReturn,
      expectedSharpe: weightedSharpe,
      diversificationScore: calculateDiversificationScore(strategies2)
    };
  });
  return {
    portfolios,
    stats
  };
}
async function getRebalancingSuggestions(portfolioId) {
  const portfolio = await getPortfolioDetail(portfolioId);
  const suggestions = [];
  portfolio.strategies.forEach((s) => {
    if (s.minWeight && s.weight < s.minWeight) {
      suggestions.push({
        type: "underweight",
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        currentWeight: s.weight,
        recommendedWeight: s.minWeight,
        reason: `\u6743\u91CD\u4F4E\u4E8E\u6700\u5C0F\u503C ${s.minWeight}\uFF0C\u5EFA\u8BAE\u589E\u52A0\u914D\u7F6E`
      });
    }
    if (s.maxWeight && s.weight > s.maxWeight) {
      suggestions.push({
        type: "overweight",
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        currentWeight: s.weight,
        recommendedWeight: s.maxWeight,
        reason: `\u6743\u91CD\u8D85\u8FC7\u6700\u5927\u503C ${s.maxWeight}\uFF0C\u5EFA\u8BAE\u51CF\u5C11\u914D\u7F6E`
      });
    }
    if (s.currentSharpe < 1) {
      suggestions.push({
        type: "performance_concern",
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        currentSharpe: s.currentSharpe,
        reason: "\u590F\u666E\u6BD4\u7387\u8F83\u4F4E\uFF0C\u8003\u8651\u964D\u4F4E\u6743\u91CD\u6216\u66FF\u6362\u7B56\u7565"
      });
    }
  });
  return suggestions;
}
function calculatePortfolioReturn(strategies2, weights) {
  let totalReturn = 0;
  strategies2.forEach((s) => {
    const avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    totalReturn += weights[s.strategyId] * avgReturn;
  });
  return totalReturn;
}
function calculatePortfolioRisk(strategies2, weights) {
  let totalRisk = 0;
  strategies2.forEach((s) => {
    const avgRisk = s.risks.reduce((a, b) => a + b, 0) / s.risks.length;
    totalRisk += weights[s.strategyId] * avgRisk;
  });
  return totalRisk;
}
function calculatePortfolioSharpe(strategies2, weights) {
  const ret = calculatePortfolioReturn(strategies2, weights);
  const risk = calculatePortfolioRisk(strategies2, weights);
  return risk > 0 ? ret / risk : 0;
}
function calculateDiversificationScore(strategies2) {
  const n = strategies2.length;
  const weights = strategies2.map((s) => s.weight);
  const avgWeight = 1 / n;
  const variance = weights.reduce((sum2, w) => sum2 + Math.pow(w - avgWeight, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, 1 - stdDev);
}

// server/portfolio-router.ts
var portfolioRouter = router({
  // 创建组合
  createPortfolio: publicProcedure.input(
    z5.object({
      portfolioName: z5.string(),
      description: z5.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const portfolio = await createPortfolio({
      userId: ctx.user?.id ?? 0,
      portfolioName: input.portfolioName,
      description: input.description,
      isActive: true
    });
    return { success: true, portfolioId: portfolio.id };
  }),
  // 获取用户的组合列表
  getPortfolios: publicProcedure.query(async ({ ctx }) => {
    const portfolios = await getUserPortfolios(ctx.user?.id ?? 0);
    return portfolios;
  }),
  // 获取组合详情
  getPortfolioDetail: publicProcedure.input(z5.object({ portfolioId: z5.number().int() })).query(async ({ input }) => {
    const portfolio = await getPortfolioDetail(input.portfolioId);
    return portfolio;
  }),
  // 添加策略到组合
  addStrategy: publicProcedure.input(
    z5.object({
      portfolioId: z5.number().int(),
      strategyId: z5.number().int(),
      weight: z5.number().min(0).max(1),
      minWeight: z5.number().min(0).max(1).optional(),
      maxWeight: z5.number().min(0).max(1).optional()
    })
  ).mutation(async ({ input }) => {
    await addStrategyToPortfolio(
      input.portfolioId,
      input.strategyId,
      input.weight,
      input.minWeight,
      input.maxWeight
    );
    return { success: true };
  }),
  // 更新策略权重
  updateStrategyWeight: publicProcedure.input(
    z5.object({
      portfolioId: z5.number().int(),
      strategyId: z5.number().int(),
      newWeight: z5.number().min(0).max(1)
    })
  ).mutation(async ({ input }) => {
    await updateStrategyWeight(
      input.portfolioId,
      input.strategyId,
      input.newWeight
    );
    return { success: true };
  }),
  // 删除策略
  removeStrategy: publicProcedure.input(
    z5.object({
      portfolioId: z5.number().int(),
      strategyId: z5.number().int()
    })
  ).mutation(async ({ input }) => {
    await removeStrategyFromPortfolio(input.portfolioId, input.strategyId);
    return { success: true };
  }),
  // 计算最优权重
  calculateOptimalWeights: publicProcedure.input(
    z5.object({
      portfolioId: z5.number().int(),
      strategies: z5.array(
        z5.object({
          strategyId: z5.number().int(),
          returns: z5.array(z5.number()),
          risks: z5.array(z5.number())
        })
      ),
      constraints: z5.object({
        minWeight: z5.number().optional(),
        maxWeight: z5.number().optional(),
        targetReturn: z5.number().optional(),
        targetRisk: z5.number().optional()
      }).optional()
    })
  ).query(async ({ input }) => {
    const result = await calculateOptimalWeights(
      input.portfolioId,
      input.strategies,
      input.constraints
    );
    return result;
  }),
  // 获取组合性能快照
  getSnapshots: publicProcedure.input(
    z5.object({
      portfolioId: z5.number().int(),
      limit: z5.number().int().default(30)
    })
  ).query(async ({ input }) => {
    const snapshots = await getPortfolioSnapshots(input.portfolioId, input.limit);
    return snapshots;
  }),
  // 对比多个组合
  comparePortfolios: publicProcedure.input(z5.object({ portfolioIds: z5.array(z5.number().int()) })).query(async ({ input }) => {
    const comparison = await comparePortfolios(input.portfolioIds);
    return comparison;
  }),
  // 获取再平衡建议
  getRebalancingSuggestions: publicProcedure.input(z5.object({ portfolioId: z5.number().int() })).query(async ({ input }) => {
    const suggestions = await getRebalancingSuggestions(input.portfolioId);
    return suggestions;
  }),
  // 获取组合对标分析
  getBenchmarkAnalysis: publicProcedure.input(
    z5.object({
      portfolioId: z5.number().int(),
      benchmarkIndexId: z5.number().int()
    })
  ).query(async ({ input }) => {
    const snapshots = await getPortfolioSnapshots(input.portfolioId, 1);
    const portfolio = await getPortfolioDetail(input.portfolioId);
    if (snapshots.length === 0) {
      return null;
    }
    const snapshot = snapshots[0];
    return {
      portfolioId: input.portfolioId,
      portfolioName: portfolio.portfolioName,
      benchmarkIndexId: input.benchmarkIndexId,
      portfolioReturn: snapshot.totalReturn,
      portfolioSharpe: snapshot.sharpeRatio,
      portfolioDrawdown: snapshot.maxDrawdown,
      portfolioVolatility: snapshot.volatility,
      diversificationRatio: snapshot.diversificationRatio,
      correlation: snapshot.correlation,
      strategies: portfolio.strategies.map((s) => ({
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        weight: s.weight,
        contribution: s.weight * snapshot.totalReturn
      }))
    };
  })
});

// server/parameter-scan-router.ts
import { z as z6 } from "zod";

// server/grid-search-optimizer.ts
function generateGridParameters(parameterRanges) {
  const paramNames = Object.keys(parameterRanges);
  const paramValues = [];
  for (const paramName of paramNames) {
    const range = parameterRanges[paramName];
    const values = [];
    for (let value = range.min; value <= range.max + 1e-10; value += range.step) {
      values.push(parseFloat(value.toFixed(6)));
    }
    paramValues.push(values);
  }
  const combinations = [];
  const indices = new Array(paramNames.length).fill(0);
  while (true) {
    const combination = {};
    for (let i = 0; i < paramNames.length; i++) {
      combination[paramNames[i]] = paramValues[i][indices[i]];
    }
    combinations.push(combination);
    let carry = 1;
    for (let i = paramNames.length - 1; i >= 0 && carry; i--) {
      indices[i] += carry;
      if (indices[i] >= paramValues[i].length) {
        indices[i] = 0;
      } else {
        carry = 0;
      }
    }
    if (carry) break;
  }
  return combinations;
}
function calculateGridSearchIterations(parameterRanges) {
  let total = 1;
  for (const paramName in parameterRanges) {
    const range = parameterRanges[paramName];
    const count = Math.round((range.max - range.min) / range.step) + 1;
    total *= count;
  }
  return total;
}
function findOptimalParameters(results, maximize = true) {
  if (results.length === 0) return null;
  let optimal = results[0];
  for (const result of results) {
    if (maximize) {
      if (result.objectiveValue > optimal.objectiveValue) {
        optimal = result;
      }
    } else if (result.objectiveValue < optimal.objectiveValue) {
      optimal = result;
    }
  }
  return optimal;
}

// server/bayesian-optimizer.ts
var SimpleGaussianProcess = class {
  observations = [];
  paramNames = [];
  constructor(paramNames) {
    this.paramNames = paramNames;
  }
  addObservation(x, y) {
    this.observations.push({ x, y });
  }
  predict(x) {
    if (this.observations.length === 0) {
      return { mean: 0, std: 1 };
    }
    let totalWeight = 0;
    let weightedMean = 0;
    for (const obs of this.observations) {
      const distance = this.euclideanDistance(x, obs.x);
      const weight = Math.exp(-distance * distance);
      totalWeight += weight;
      weightedMean += weight * obs.y;
    }
    const mean = totalWeight > 0 ? weightedMean / totalWeight : 0;
    let minDistance = Infinity;
    for (const obs of this.observations) {
      const distance = this.euclideanDistance(x, obs.x);
      minDistance = Math.min(minDistance, distance);
    }
    const std = Math.exp(-minDistance * minDistance) + 0.1;
    return { mean, std };
  }
  euclideanDistance(x1, x2) {
    let sum2 = 0;
    for (const param of this.paramNames) {
      const diff = (x1[param] || 0) - (x2[param] || 0);
      sum2 += diff * diff;
    }
    return Math.sqrt(sum2);
  }
};
function acquisitionFunctionUCB(mean, std, kappa = 2.576) {
  return mean + kappa * std;
}
function generateRandomParameters(parameterRanges) {
  const parameters = {};
  for (const paramName in parameterRanges) {
    const range = parameterRanges[paramName];
    parameters[paramName] = range.min + Math.random() * (range.max - range.min);
  }
  return parameters;
}
function findBestCandidate(gp, parameterRanges, numCandidates = 1e3) {
  let bestParameters = generateRandomParameters(parameterRanges);
  let bestAcquisitionValue = -Infinity;
  for (let i = 0; i < numCandidates; i++) {
    const candidate = generateRandomParameters(parameterRanges);
    const { mean, std } = gp.predict(candidate);
    const acquisitionValue = acquisitionFunctionUCB(mean, std);
    if (acquisitionValue > bestAcquisitionValue) {
      bestAcquisitionValue = acquisitionValue;
      bestParameters = candidate;
    }
  }
  return bestParameters;
}
async function executeBayesianOptimization2(parameterRanges, evaluationFunction, callback, maxIterations = 50, initialSamples = 5) {
  const paramNames = Object.keys(parameterRanges);
  const gp = new SimpleGaussianProcess(paramNames);
  const results = [];
  for (let i = 0; i < initialSamples && i < maxIterations; i++) {
    const parameters = generateRandomParameters(parameterRanges);
    try {
      const objectiveValue = await evaluationFunction(parameters);
      gp.addObservation(parameters, objectiveValue);
      const result = {
        parameters,
        objectiveValue,
        uncertainty: 1,
        iteration: i + 1
      };
      results.push(result);
      await callback.onIteration(result);
      await callback.onProgress((i + 1) / maxIterations * 100, i + 1, maxIterations);
    } catch (error) {
      console.error(`Error evaluating parameters at iteration ${i + 1}:`, error);
    }
  }
  for (let i = initialSamples; i < maxIterations; i++) {
    const candidate = findBestCandidate(gp, parameterRanges);
    try {
      const objectiveValue = await evaluationFunction(candidate);
      const { std } = gp.predict(candidate);
      gp.addObservation(candidate, objectiveValue);
      const result = {
        parameters: candidate,
        objectiveValue,
        uncertainty: std,
        iteration: i + 1
      };
      results.push(result);
      await callback.onIteration(result);
      await callback.onProgress((i + 1) / maxIterations * 100, i + 1, maxIterations);
    } catch (error) {
      console.error(`Error evaluating parameters at iteration ${i + 1}:`, error);
    }
  }
  return results;
}
function findOptimalParameters2(results, maximize = true) {
  if (results.length === 0) return null;
  let optimal = results[0];
  for (const result of results) {
    if (maximize) {
      if (result.objectiveValue > optimal.objectiveValue) {
        optimal = result;
      }
    } else if (result.objectiveValue < optimal.objectiveValue) {
      optimal = result;
    }
  }
  return optimal;
}

// server/parameter-scan-router.ts
function roundTo2(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function evaluateParameterObjective(objectiveMetric, parameters) {
  const entries = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return 0;
  }
  let signal = 0;
  entries.forEach(([name, value], idx) => {
    const weight = idx + 1;
    signal += weight * Math.sin(value * 0.071 + name.length * 0.013);
    signal += weight * Math.cos(value * 0.037);
  });
  const normalized = (Math.tanh(signal / (entries.length * 2.5)) + 1) / 2;
  switch (objectiveMetric) {
    case "total_return":
      return roundTo2(-0.1 + normalized * 0.6);
    case "sharpe_ratio":
      return roundTo2(normalized * 3.2);
    case "max_drawdown":
      return roundTo2(1 - (0.05 + (1 - normalized) * 0.4));
    case "win_rate":
      return roundTo2(0.35 + normalized * 0.5);
    case "profit_factor":
      return roundTo2(0.8 + normalized * 2.4);
    default:
      return roundTo2(normalized);
  }
}
var parameterScanRouter = router({
  createScanConfig: publicProcedure.input(
    z6.object({
      strategyId: z6.number(),
      name: z6.string(),
      description: z6.string().optional(),
      algorithm: z6.enum(["grid_search", "bayesian_optimization"]),
      parameterRanges: z6.record(
        z6.string(),
        z6.object({
          min: z6.number(),
          max: z6.number(),
          step: z6.number().optional()
        })
      ),
      objectiveMetric: z6.enum([
        "total_return",
        "sharpe_ratio",
        "max_drawdown",
        "win_rate",
        "profit_factor"
      ]),
      maxIterations: z6.number().optional(),
      populationSize: z6.number().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const config = await createParameterScanConfig({
      userId: ctx.user?.id ?? 0,
      strategyId: input.strategyId,
      name: input.name,
      description: input.description,
      algorithm: input.algorithm,
      parameterRanges: input.parameterRanges,
      objectiveMetric: input.objectiveMetric,
      maxIterations: input.maxIterations || 100,
      populationSize: input.populationSize || 20,
      status: "pending",
      progress: "0"
    });
    return { id: config.insertId };
  }),
  getScanConfig: publicProcedure.input(z6.object({ configId: z6.number() })).query(async ({ input }) => getParameterScanConfig(input.configId)),
  getUserScanConfigs: publicProcedure.query(
    async ({ ctx }) => getUserParameterScanConfigs(ctx.user?.id ?? 0)
  ),
  getScanResults: publicProcedure.input(z6.object({ configId: z6.number() })).query(async ({ input }) => getParameterScanResults(input.configId)),
  getOptimalResult: publicProcedure.input(z6.object({ configId: z6.number() })).query(async ({ input }) => getParameterScanOptimalResult(input.configId)),
  getResultsRanking: publicProcedure.input(z6.object({ configId: z6.number(), limit: z6.number().optional() })).query(async ({ input }) => getParameterScanResultsRanking(input.configId, input.limit || 10)),
  startGridSearch: publicProcedure.input(z6.object({ configId: z6.number() })).mutation(async ({ input }) => {
    const config = await getParameterScanConfig(input.configId);
    if (!config) throw new Error("Config not found");
    await updateParameterScanConfigStatus(input.configId, "running", 0, /* @__PURE__ */ new Date());
    const parameterRanges = config.parameterRanges;
    const gridParameters = generateGridParameters(parameterRanges);
    const totalIterations = Math.min(gridParameters.length, config.maxIterations);
    const results = [];
    const evaluationFunction = async (parameters) => evaluateParameterObjective(config.objectiveMetric, parameters);
    for (let i = 0; i < totalIterations; i++) {
      const parameters = gridParameters[i];
      try {
        const objectiveValue = await evaluationFunction(parameters);
        await createParameterScanResult({
          scanConfigId: input.configId,
          iteration: i + 1,
          parameters,
          objectiveValue: objectiveValue.toString(),
          metrics: {},
          status: "completed"
        });
        results.push({ parameters, objectiveValue, iteration: i + 1 });
        const progress = (i + 1) / totalIterations * 100;
        await updateParameterScanConfigStatus(input.configId, "running", progress);
      } catch (error) {
        console.error(`Error at iteration ${i + 1}:`, error);
      }
    }
    const optimal = findOptimalParameters(results);
    if (optimal) {
      await upsertParameterScanOptimalResult({
        scanConfigId: input.configId,
        parameters: optimal.parameters,
        objectiveValue: optimal.objectiveValue.toString(),
        metrics: {},
        rank: 1,
        improvement: "0"
      });
    }
    await updateParameterScanConfigStatus(input.configId, "completed", 100, void 0, /* @__PURE__ */ new Date());
    return { success: true, results };
  }),
  startBayesianOptimization: publicProcedure.input(z6.object({ configId: z6.number() })).mutation(async ({ input }) => {
    const config = await getParameterScanConfig(input.configId);
    if (!config) throw new Error("Config not found");
    await updateParameterScanConfigStatus(input.configId, "running", 0, /* @__PURE__ */ new Date());
    const evaluationFunction = async (parameters) => evaluateParameterObjective(config.objectiveMetric, parameters);
    const results = [];
    const bayesianResults = await executeBayesianOptimization2(
      config.parameterRanges,
      evaluationFunction,
      {
        onIteration: async (result) => {
          await createParameterScanResult({
            scanConfigId: input.configId,
            iteration: result.iteration,
            parameters: result.parameters,
            objectiveValue: result.objectiveValue.toString(),
            metrics: { uncertainty: result.uncertainty },
            status: "completed"
          });
          results.push(result);
        },
        onProgress: async (progress) => {
          await updateParameterScanConfigStatus(input.configId, "running", progress);
        }
      },
      config.maxIterations,
      Math.min(5, config.populationSize)
    );
    const optimal = findOptimalParameters2(bayesianResults);
    if (optimal) {
      await upsertParameterScanOptimalResult({
        scanConfigId: input.configId,
        parameters: optimal.parameters,
        objectiveValue: optimal.objectiveValue.toString(),
        metrics: { uncertainty: optimal.uncertainty },
        rank: 1,
        improvement: "0"
      });
    }
    await updateParameterScanConfigStatus(input.configId, "completed", 100, void 0, /* @__PURE__ */ new Date());
    return { success: true, results };
  }),
  calculateGridIterations: publicProcedure.input(
    z6.object({
      parameterRanges: z6.record(
        z6.string(),
        z6.object({
          min: z6.number(),
          max: z6.number(),
          step: z6.number()
        })
      )
    })
  ).query(async ({ input }) => {
    const iterations = calculateGridSearchIterations(input.parameterRanges);
    return { iterations };
  })
});

// server/strategy-router.ts
import { z as z7 } from "zod";
import { TRPCError as TRPCError5 } from "@trpc/server";
import * as fs2 from "fs";
import * as path3 from "path";
import yaml2 from "js-yaml";
var STRATEGY_CODE_DIR = path3.join(process.cwd(), "strategies", "user_code");
var SETTINGS_FILE_PATH = path3.join(process.cwd(), "config", "settings.yaml");
var DEFAULT_STRATEGY_DIR = path3.join(process.cwd(), "strategy");
function resolveDefaultStrategyClass() {
  try {
    if (!fs2.existsSync(SETTINGS_FILE_PATH)) {
      return "FactorCapitalStrategy";
    }
    const raw = fs2.readFileSync(SETTINGS_FILE_PATH, "utf-8");
    const config = yaml2.load(raw);
    return config?.strategy?.class || "FactorCapitalStrategy";
  } catch (error) {
    console.warn("[StrategyRouter] Failed to parse settings.yaml:", error);
    return "FactorCapitalStrategy";
  }
}
var DEFAULT_STRATEGY_CLASS = resolveDefaultStrategyClass();
var DEFAULT_STRATEGY_FILE = path3.join(DEFAULT_STRATEGY_DIR, `${DEFAULT_STRATEGY_CLASS}.py`);
if (!fs2.existsSync(STRATEGY_CODE_DIR)) {
  fs2.mkdirSync(STRATEGY_CODE_DIR, { recursive: true });
}
function loadDefaultStrategyCode() {
  if (!fs2.existsSync(DEFAULT_STRATEGY_FILE)) {
    return null;
  }
  const content = fs2.readFileSync(DEFAULT_STRATEGY_FILE, "utf-8");
  return {
    code: content,
    filePath: DEFAULT_STRATEGY_FILE,
    lastModified: fs2.statSync(DEFAULT_STRATEGY_FILE).mtime.toISOString()
  };
}
var strategyRouter = router({
  /**
   * 保存策略代码
   */
  saveCode: publicProcedure.input(
    z7.object({
      code: z7.string().min(1),
      strategyName: z7.string().min(1)
    })
  ).mutation(async ({ input }) => {
    try {
      const safeFileName = input.strategyName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").replace(/\s+/g, "_");
      const filePath = path3.join(STRATEGY_CODE_DIR, `${safeFileName}.py`);
      const timestamp3 = (/* @__PURE__ */ new Date()).toISOString();
      const codeWithMetadata = `# Saved at: ${timestamp3}
# Strategy: ${input.strategyName}

${input.code}`;
      fs2.writeFileSync(filePath, codeWithMetadata, "utf-8");
      return {
        success: true,
        message: "\u7B56\u7565\u4EE3\u7801\u5DF2\u4FDD\u5B58",
        filePath
      };
    } catch (error) {
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25"
      });
    }
  }),
  /**
   * 提交策略代码审核
   */
  submitCode: publicProcedure.input(
    z7.object({
      code: z7.string().min(1),
      strategyName: z7.string().min(1)
    })
  ).mutation(async ({ input }) => {
    try {
      const safeFileName = input.strategyName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").replace(/\s+/g, "_");
      const submitDir = path3.join(process.cwd(), "strategies", "submitted");
      if (!fs2.existsSync(submitDir)) {
        fs2.mkdirSync(submitDir, { recursive: true });
      }
      const timestamp3 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const filePath = path3.join(submitDir, `${safeFileName}_${timestamp3}.py`);
      const metadata = `"""
Strategy Submission
===================
Name: ${input.strategyName}
Submitted At: ${(/* @__PURE__ */ new Date()).toISOString()}
Status: Pending Review
"""

`;
      const codeWithMetadata = metadata + input.code;
      fs2.writeFileSync(filePath, codeWithMetadata, "utf-8");
      return {
        success: true,
        message: "\u7B56\u7565\u4EE3\u7801\u5DF2\u63D0\u4EA4\u5BA1\u6838",
        filePath
      };
    } catch (error) {
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "\u63D0\u4EA4\u5931\u8D25"
      });
    }
  }),
  /**
   * 获取已保存的策略代码
   */
  getSavedCode: publicProcedure.input(
    z7.object({
      strategyName: z7.string()
    })
  ).query(async ({ input }) => {
    try {
      const safeFileName = input.strategyName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").replace(/\s+/g, "_");
      const filePath = path3.join(STRATEGY_CODE_DIR, `${safeFileName}.py`);
      if (!fs2.existsSync(filePath)) {
        return loadDefaultStrategyCode();
      }
      const content = fs2.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const codeLines = lines.filter((line) => !line.startsWith("# Saved at:") && !line.startsWith("# Strategy:"));
      return {
        code: codeLines.join("\n"),
        filePath,
        lastModified: fs2.statSync(filePath).mtime.toISOString()
      };
    } catch (error) {
      console.error("Failed to load saved code:", error);
      return loadDefaultStrategyCode();
    }
  }),
  listAvailable: publicProcedure.query(async () => {
    try {
      const entries = [];
      if (fs2.existsSync(DEFAULT_STRATEGY_FILE)) {
        entries.push({
          name: DEFAULT_STRATEGY_CLASS,
          source: "system",
          filePath: DEFAULT_STRATEGY_FILE
        });
      }
      if (fs2.existsSync(STRATEGY_CODE_DIR)) {
        const files = fs2.readdirSync(STRATEGY_CODE_DIR).filter((file) => file.endsWith(".py"));
        for (const file of files) {
          entries.push({
            name: file.replace(/\.py$/, ""),
            source: "user",
            filePath: path3.join(STRATEGY_CODE_DIR, file)
          });
        }
      }
      return entries;
    } catch (error) {
      console.error("[StrategyRouter] listAvailable failed", error);
      return [];
    }
  }),
  /**
   * 获取所有已提交的策略列表
   */
  getSubmittedStrategies: publicProcedure.query(async () => {
    try {
      const submitDir = path3.join(process.cwd(), "strategies", "submitted");
      if (!fs2.existsSync(submitDir)) {
        return [];
      }
      const files = fs2.readdirSync(submitDir).filter((file) => file.endsWith(".py")).map((file) => {
        const filePath = path3.join(submitDir, file);
        const stats = fs2.statSync(filePath);
        const nameMatch = file.match(/^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.py$/);
        const strategyName = nameMatch ? nameMatch[1] : file.replace(".py", "");
        return {
          fileName: file,
          strategyName: strategyName.replace(/_/g, " "),
          submittedAt: stats.mtime.toISOString(),
          size: stats.size
        };
      }).sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return files;
    } catch (error) {
      console.error("Failed to list submitted strategies:", error);
      return [];
    }
  })
});

// server/paperclip-router.ts
import { z as z13 } from "zod";

// server/paperclip-services/agent-service.ts
init_db();
init_schema();
import { eq as eq5, and as and5, desc as desc5, sql as sql2, isNull } from "drizzle-orm";

// shared/validators/paperclip-validators.ts
import { z as z8 } from "zod";
var agentStatusSchema = z8.enum([
  "active",
  "paused",
  "idle",
  "running",
  "error",
  "terminated"
]);
var agentAdapterTypeSchema = z8.enum(["process", "http"]);
var agentContextModeSchema = z8.enum(["thin", "fat"]);
var issueStatusSchema = z8.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled"
]);
var issuePrioritySchema = z8.enum([
  "critical",
  "high",
  "medium",
  "low"
]);
var goalLevelSchema = z8.enum(["company", "team", "agent", "task"]);
var goalStatusSchema = z8.enum([
  "planned",
  "active",
  "achieved",
  "cancelled"
]);
var heartbeatInvocationSourceSchema = z8.enum([
  "scheduler",
  "manual",
  "callback"
]);
var heartbeatStatusSchema = z8.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out"
]);
var approvalTypeSchema = z8.enum([
  "hire_agent",
  "approve_ceo_strategy"
]);
var approvalStatusSchema = z8.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled"
]);
var actorTypeSchema = z8.enum(["agent", "user", "system"]);
var companyStatusSchema = z8.enum([
  "active",
  "paused",
  "archived"
]);
var companyRoleSchema = z8.enum(["owner", "admin", "member"]);
var processAdapterConfigSchema = z8.object({
  command: z8.string().min(1, "Command is required"),
  args: z8.array(z8.string()).optional(),
  cwd: z8.string().optional(),
  env: z8.record(z8.string(), z8.string()).optional(),
  timeoutSec: z8.number().int().positive().default(900).optional(),
  graceSec: z8.number().int().positive().default(15).optional()
});
var httpAdapterConfigSchema = z8.object({
  url: z8.string().url("Invalid URL"),
  method: z8.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("POST").optional(),
  headers: z8.record(z8.string(), z8.string()).optional(),
  timeoutMs: z8.number().int().positive().default(15e3).optional(),
  payloadTemplate: z8.record(z8.string(), z8.unknown()).optional()
});
var adapterConfigSchema = z8.union([
  z8.object({
    adapterType: z8.literal("process"),
    config: processAdapterConfigSchema
  }),
  z8.object({
    adapterType: z8.literal("http"),
    config: httpAdapterConfigSchema
  })
]);
var createAgentSchema = z8.object({
  companyId: z8.number().int().positive(),
  name: z8.string().min(1).max(255),
  role: z8.string().min(1).max(255),
  title: z8.string().max(255).optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: z8.record(z8.string(), z8.unknown()),
  contextMode: agentContextModeSchema.default("thin"),
  budgetMonthlyCents: z8.number().int().nonnegative().default(0),
  reportsTo: z8.number().int().positive().optional(),
  capabilities: z8.string().optional()
});
var updateAgentSchema = z8.object({
  agentId: z8.number().int().positive(),
  name: z8.string().min(1).max(255).optional(),
  role: z8.string().max(255).optional(),
  title: z8.string().max(255).optional(),
  status: agentStatusSchema.optional(),
  adapterConfig: z8.record(z8.string(), z8.unknown()).optional(),
  budgetMonthlyCents: z8.number().int().nonnegative().optional(),
  contextMode: agentContextModeSchema.optional(),
  capabilities: z8.string().optional(),
  reportsTo: z8.number().int().positive().optional()
});
var agentTransitionSchema = z8.object({
  agentId: z8.number().int().positive(),
  newStatus: agentStatusSchema,
  reason: z8.string().optional()
});
var createIssueSchema = z8.object({
  companyId: z8.number().int().positive(),
  projectId: z8.number().int().positive().optional(),
  goalId: z8.number().int().positive().optional(),
  parentId: z8.number().int().positive().optional(),
  title: z8.string().min(1).max(255),
  description: z8.string().optional(),
  priority: issuePrioritySchema.default("medium"),
  assigneeAgentId: z8.number().int().positive().optional(),
  billingCode: z8.string().max(255).optional()
});
var updateIssueSchema = z8.object({
  issueId: z8.number().int().positive(),
  title: z8.string().min(1).max(255).optional(),
  description: z8.string().optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  assigneeAgentId: z8.number().int().positive().optional(),
  billingCode: z8.string().max(255).optional()
});
var checkoutTaskSchema = z8.object({
  issueId: z8.number().int().positive(),
  agentId: z8.number().int().positive(),
  expectedStatuses: z8.array(issueStatusSchema).default([
    "backlog",
    "todo",
    "blocked"
  ])
});
var createCommentSchema = z8.object({
  issueId: z8.number().int().positive(),
  body: z8.string().min(1),
  authorAgentId: z8.number().int().positive().optional(),
  authorUserId: z8.number().int().positive().optional()
});
var createGoalSchema = z8.object({
  companyId: z8.number().int().positive(),
  title: z8.string().min(1).max(255),
  description: z8.string().optional(),
  level: goalLevelSchema,
  parentId: z8.number().int().positive().optional(),
  ownerAgentId: z8.number().int().positive().optional(),
  status: goalStatusSchema.default("planned")
});
var updateGoalSchema = z8.object({
  goalId: z8.number().int().positive(),
  title: z8.string().min(1).max(255).optional(),
  description: z8.string().optional(),
  level: goalLevelSchema.optional(),
  parentId: z8.number().int().positive().optional(),
  ownerAgentId: z8.number().int().positive().optional(),
  status: goalStatusSchema.optional()
});
var heartbeatScheduleConfigSchema = z8.object({
  enabled: z8.boolean().default(true),
  intervalSec: z8.number().int().min(30).default(60),
  maxConcurrentRuns: z8.literal(1).default(1)
  // V1 固定为 1
});
var manualHeartbeatSchema = z8.object({
  agentId: z8.number().int().positive(),
  reason: z8.string().optional()
});
var reportHeartbeatResultSchema = z8.object({
  runId: z8.number().int().positive(),
  status: heartbeatStatusSchema,
  error: z8.string().optional(),
  externalRunId: z8.string().optional(),
  contextSnapshot: z8.record(z8.string(), z8.unknown()).optional()
});
var reportCostEventSchema = z8.object({
  agentId: z8.number().int().positive(),
  issueId: z8.number().int().positive().optional(),
  provider: z8.string().min(1),
  model: z8.string().min(1),
  inputTokens: z8.number().int().nonnegative().default(0),
  outputTokens: z8.number().int().nonnegative().default(0),
  costCents: z8.number().int().nonnegative(),
  occurredAt: z8.string().datetime().optional()
});
var setBudgetSchema = z8.object({
  entityId: z8.number().int().positive(),
  entityType: z8.enum(["agent", "project", "company"]),
  monthlyBudgetCents: z8.number().int().nonnegative()
});
var hireAgentPayloadSchema = z8.object({
  name: z8.string().min(1).max(255),
  role: z8.string().min(1).max(255),
  title: z8.string().max(255).optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: z8.record(z8.string(), z8.unknown()),
  budgetMonthlyCents: z8.number().int().nonnegative().optional()
});
var ceoStrategyPayloadSchema = z8.object({
  planTitle: z8.string().min(1).max(255),
  planDescription: z8.string(),
  initialOrgStructure: z8.object({
    agents: z8.array(
      z8.object({
        name: z8.string().min(1),
        role: z8.string().min(1)
      })
    )
  }).optional(),
  highLevelGoals: z8.array(z8.string()).optional()
});
var createApprovalSchema = z8.object({
  companyId: z8.number().int().positive(),
  type: approvalTypeSchema,
  requestedByAgentId: z8.number().int().positive().optional(),
  requestedByUserId: z8.number().int().positive().optional(),
  payload: z8.union([
    hireAgentPayloadSchema,
    ceoStrategyPayloadSchema,
    z8.record(z8.string(), z8.unknown())
  ])
});
var decideApprovalSchema = z8.object({
  approvalId: z8.number().int().positive(),
  decision: z8.enum(["approved", "rejected"]),
  decisionNote: z8.string().optional()
});
var createCompanySchema = z8.object({
  name: z8.string().min(1).max(255),
  description: z8.string().optional(),
  status: companyStatusSchema.default("active")
});
var companyMembershipSchema = z8.object({
  companyId: z8.number().int().positive(),
  userId: z8.number().int().positive(),
  role: companyRoleSchema.default("member")
});
var createApiKeySchema = z8.object({
  agentId: z8.number().int().positive(),
  name: z8.string().min(1).max(255)
});
var apiKeyResponseSchema = z8.object({
  id: z8.number().int().positive(),
  agentId: z8.number().int().positive(),
  name: z8.string(),
  plaintextKey: z8.string(),
  createdAt: z8.string().datetime()
});
var activityLogEntrySchema = z8.object({
  companyId: z8.number().int().positive(),
  actorType: actorTypeSchema,
  actorId: z8.string(),
  action: z8.string(),
  entityType: z8.string(),
  entityId: z8.string(),
  details: z8.record(z8.string(), z8.unknown()).optional()
});
var paginationSchema = z8.object({
  page: z8.number().int().positive().default(1),
  limit: z8.number().int().min(1).max(100).default(20)
});
var queryFiltersSchema = z8.object({
  companyId: z8.number().int().positive(),
  status: z8.string().optional(),
  assigneeAgentId: z8.number().int().positive().optional(),
  priority: z8.string().optional(),
  search: z8.string().optional()
}).partial();
var validIssueTransitions = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["in_review", "blocked", "done", "cancelled"],
  in_review: ["in_progress", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  done: [],
  // terminal state
  cancelled: []
  // terminal state
};
var validAgentTransitions = {
  idle: ["running", "paused", "terminated"],
  running: ["idle", "error", "paused", "terminated"],
  paused: ["idle", "terminated"],
  error: ["idle", "terminated"],
  active: ["paused", "terminated"],
  terminated: []
  // terminal state
};

// shared/paperclip-constants.ts
var BUDGET_THRESHOLDS = {
  /** 软警告阈值 (80%) */
  SOFT_ALERT_PERCENT: 80,
  /** 硬限制阈值 (100%) */
  HARD_LIMIT_PERCENT: 100
};
var AUDIT_ACTIONS = {
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
  MEMBER_REMOVED: "member.removed"
};
var ACTOR_TYPES = {
  /** Agent 执行者 */
  AGENT: "agent",
  /** 用户执行者 */
  USER: "user",
  /** 系统执行者 */
  SYSTEM: "system"
};

// server/paperclip-services/agent-service.ts
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
async function getAgentById(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(agents).where(eq5(agents.id, agentId)).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function getAgentWithDetails(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [agentRow] = await db.select({
    agent: agents,
    companyName: companies.name
  }).from(agents).leftJoin(companies, eq5(agents.companyId, companies.id)).where(eq5(agents.id, agentId)).limit(1);
  if (!agentRow) return null;
  let managerName;
  if (agentRow.agent.reportsTo) {
    const [managerRow] = await db.select({ name: agents.name }).from(agents).where(eq5(agents.id, agentRow.agent.reportsTo)).limit(1);
    managerName = managerRow?.name ?? void 0;
  }
  return {
    ...agentRow.agent,
    companyName: agentRow.companyName ?? void 0,
    managerName
  };
}
async function listAgents(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { companyId, status, limit = 50, offset = 0 } = options;
  const whereClause = status ? and5(eq5(agents.companyId, companyId), eq5(agents.status, status)) : eq5(agents.companyId, companyId);
  return await db.select().from(agents).where(whereClause).orderBy(desc5(agents.createdAt)).limit(limit).offset(offset);
}
async function getActiveAgents(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(agents).where(
    and5(
      eq5(agents.companyId, companyId),
      eq5(agents.status, "active")
    )
  ).orderBy(desc5(agents.createdAt));
}
async function createAgent(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const companyExists = await db.select({ id: companies.id }).from(companies).where(eq5(companies.id, options.companyId)).limit(1);
  if (companyExists.length === 0) {
    const systemName = process.env.SYSTEM_NAME || "\u91CF\u5316\u4EA4\u6613\u5E73\u53F0";
    await db.insert(companies).values({
      id: options.companyId,
      name: systemName,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
  }
  if (options.reportsTo) {
    const managerExists = await db.select({ id: agents.id }).from(agents).where(and5(eq5(agents.id, options.reportsTo), eq5(agents.companyId, options.companyId))).limit(1);
    if (managerExists.length === 0) {
      throw new Error("Manager agent not found");
    }
  }
  const insertData = {
    companyId: options.companyId,
    name: options.name,
    role: options.role,
    title: options.title,
    status: "idle",
    // 初始状态为 idle
    adapterType: options.adapterType,
    adapterConfig: options.adapterConfig,
    contextMode: options.contextMode || "thin",
    budgetMonthlyCents: options.budgetMonthlyCents || 0,
    spentMonthlyCents: 0,
    reportsTo: options.reportsTo,
    capabilities: options.capabilities
  };
  const result = await db.insert(agents).values(insertData);
  const agentId = result.insertId || result.id;
  await logActivity({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() || "system",
    action: AUDIT_ACTIONS.AGENT_CREATED,
    entityType: "agent",
    entityId: agentId.toString(),
    details: {
      name: options.name,
      role: options.role,
      adapterType: options.adapterType
    }
  });
  const createdAgent = await getAgentById(agentId);
  if (!createdAgent) {
    throw new Error("Failed to load created agent");
  }
  return createdAgent;
}
async function updateAgent(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getAgentById(options.agentId);
  if (!existing) {
    throw new Error("Agent not found");
  }
  const updateData = {};
  if (options.name !== void 0) updateData.name = options.name;
  if (options.role !== void 0) updateData.role = options.role;
  if (options.title !== void 0) updateData.title = options.title;
  if (options.status !== void 0) updateData.status = options.status;
  if (options.contextMode !== void 0) updateData.contextMode = options.contextMode;
  if (options.capabilities !== void 0) updateData.capabilities = options.capabilities;
  if (options.reportsTo !== void 0) updateData.reportsTo = options.reportsTo;
  if (options.adapterConfig !== void 0) {
    updateData.adapterConfig = options.adapterConfig;
  }
  if (options.budgetMonthlyCents !== void 0) {
    updateData.budgetMonthlyCents = options.budgetMonthlyCents;
  }
  await db.update(agents).set(updateData).where(eq5(agents.id, options.agentId));
  if (options.adapterConfig !== void 0) {
    await createConfigRevision({
      agentId: options.agentId,
      adapterConfig: options.adapterConfig,
      changeNote: "Configuration updated",
      changedByUserId: options.updatedByUserId
    });
  }
  if (options.updatedByUserId) {
    await logActivity({
      companyId: existing.companyId,
      actorType: ACTOR_TYPES.USER,
      actorId: options.updatedByUserId.toString(),
      action: AUDIT_ACTIONS.AGENT_UPDATED,
      entityType: "agent",
      entityId: options.agentId.toString(),
      details: { changes: updateData }
    });
  }
  const updatedAgent = await getAgentById(options.agentId);
  if (!updatedAgent) {
    throw new Error("Failed to load updated agent");
  }
  return updatedAgent;
}
async function transitionAgentStatus(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const agent = await getAgentById(options.agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }
  const validTransitions = validAgentTransitions[agent.status];
  if (!validTransitions || !validTransitions.includes(options.newStatus)) {
    throw new Error(
      `Invalid status transition from ${agent.status} to ${options.newStatus}`
    );
  }
  if (agent.status === "terminated") {
    throw new Error("Terminated agents cannot be resumed");
  }
  await db.update(agents).set({
    status: options.newStatus,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq5(agents.id, options.agentId));
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
      reason: options.reason
    }
  });
  const transitionedAgent = await getAgentById(options.agentId);
  if (!transitionedAgent) {
    throw new Error("Failed to load transitioned agent");
  }
  return transitionedAgent;
}
async function createApiKey(agentId, name) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }
  const plaintextKey = `pc_${uuidv4().replace(/-/g, "")}`;
  const keyHash = hashApiKey(plaintextKey);
  const insertData = {
    agentId,
    companyId: agent.companyId,
    name,
    keyHash
  };
  const result = await db.insert(agentApiKeys).values(insertData);
  const apiKeyId = result.insertId || result.id;
  await logActivity({
    companyId: agent.companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "system",
    action: AUDIT_ACTIONS.AGENT_API_KEY_CREATED,
    entityType: "agent_api_key",
    entityId: apiKeyId.toString(),
    details: { agentId, name }
  });
  const apiKey = await getApiKeyById(apiKeyId);
  if (!apiKey) {
    throw new Error("Failed to load API key after creation");
  }
  return {
    apiKey,
    plaintextKey
  };
}
async function revokeApiKey(apiKeyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(agentApiKeys).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq5(agentApiKeys.id, apiKeyId));
  const key = await getApiKeyById(apiKeyId);
  if (key) {
    await logActivity({
      companyId: key.companyId,
      actorType: ACTOR_TYPES.SYSTEM,
      actorId: "system",
      action: AUDIT_ACTIONS.AGENT_API_KEY_REVOKED,
      entityType: "agent_api_key",
      entityId: apiKeyId.toString(),
      details: { agentId: key.agentId }
    });
  }
}
async function getAgentApiKeys(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(agentApiKeys).where(eq5(agentApiKeys.agentId, agentId)).orderBy(desc5(agentApiKeys.createdAt));
}
async function validateApiKey(agentId, plaintextKey) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const keyHash = hashApiKey(plaintextKey);
  const keys = await db.select().from(agentApiKeys).where(
    and5(
      eq5(agentApiKeys.agentId, agentId),
      eq5(agentApiKeys.keyHash, keyHash),
      isNull(agentApiKeys.revokedAt)
    )
  ).limit(1);
  if (keys.length === 0) return false;
  await db.update(agentApiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq5(agentApiKeys.id, keys[0].id));
  return true;
}
async function createConfigRevision(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [maxRevision] = await db.select({ max: sql2`MAX(revisionNumber)` }).from(agentConfigRevisions).where(eq5(agentConfigRevisions.agentId, options.agentId));
  const nextRevision = (maxRevision?.max || 0) + 1;
  await db.insert(agentConfigRevisions).values({
    agentId: options.agentId,
    revisionNumber: nextRevision,
    adapterConfig: options.adapterConfig,
    changeNote: options.changeNote,
    changedByUserId: options.changedByUserId
  });
}
async function saveRuntimeState(agentId, contextSnapshot, taskId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(agentRuntimeState).values({
    agentId,
    taskId,
    contextSnapshot
  }).onDuplicateKeyUpdate({
    set: {
      contextSnapshot,
      taskId,
      lastCheckpointAt: /* @__PURE__ */ new Date()
    }
  });
}
async function getRuntimeState(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const states = await db.select().from(agentRuntimeState).where(eq5(agentRuntimeState.agentId, agentId)).limit(1);
  return states.length > 0 ? states[0] : null;
}
async function clearRuntimeState(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(agentRuntimeState).where(eq5(agentRuntimeState.agentId, agentId));
}
async function terminateAndDeleteAgent(agentId, companyId, deletedByUserId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }
  if (agent.companyId !== companyId) {
    throw new Error("Agent does not belong to specified company");
  }
  await db.update(agents).set({ status: "terminated" }).where(eq5(agents.id, agentId));
  await db.update(agentApiKeys).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq5(agentApiKeys.agentId, agentId));
  await clearRuntimeState(agentId);
  await db.delete(agents).where(eq5(agents.id, agentId));
  if (deletedByUserId) {
    await logActivity({
      companyId,
      actorType: ACTOR_TYPES.USER,
      actorId: deletedByUserId.toString(),
      action: AUDIT_ACTIONS.AGENT_TERMINATED,
      entityType: "agent",
      entityId: agentId.toString(),
      details: { name: agent.name, role: agent.role }
    });
  }
}
function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}
async function logActivity(options) {
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
async function getApiKeyById(apiKeyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const keys = await db.select().from(agentApiKeys).where(eq5(agentApiKeys.id, apiKeyId)).limit(1);
  return keys.length > 0 ? keys[0] : null;
}
var agentService = {
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
  clearRuntimeState
};

// server/paperclip-services/task-service.ts
init_db();
init_schema();
import {
  and as and6,
  desc as desc6,
  eq as eq6,
  inArray as inArray2,
  isNull as isNull2,
  or
} from "drizzle-orm";
async function getIssueById(issueId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(issues).where(eq6(issues.id, issueId)).limit(1);
  return result[0] ?? null;
}
async function getIssueWithDetails(issueId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.select({ issue: issues }).from(issues).where(eq6(issues.id, issueId)).limit(1);
  if (!row) return null;
  let assigneeName;
  if (row.issue.assigneeAgentId) {
    const [assigneeRow] = await db.select({ name: agents.name }).from(agents).where(eq6(agents.id, row.issue.assigneeAgentId)).limit(1);
    assigneeName = assigneeRow?.name ?? void 0;
  }
  let parentTitle;
  if (row.issue.parentId) {
    const [parentRow] = await db.select({ title: issues.title }).from(issues).where(eq6(issues.id, row.issue.parentId)).limit(1);
    parentTitle = parentRow?.title ?? void 0;
  }
  return {
    ...row.issue,
    assigneeName,
    parentTitle
  };
}
async function listIssues(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const filters = [eq6(issues.companyId, options.companyId)];
  if (options.status !== void 0) filters.push(eq6(issues.status, options.status));
  if (options.assigneeAgentId !== void 0) filters.push(eq6(issues.assigneeAgentId, options.assigneeAgentId));
  if (options.priority !== void 0) filters.push(eq6(issues.priority, options.priority));
  if (options.projectId !== void 0) filters.push(eq6(issues.projectId, options.projectId));
  if (options.goalId !== void 0) filters.push(eq6(issues.goalId, options.goalId));
  const whereClause = filters.length === 1 ? filters[0] : and6(...filters);
  return await db.select().from(issues).where(whereClause).orderBy(desc6(issues.updatedAt), desc6(issues.createdAt)).limit(options.limit ?? 50).offset(options.offset ?? 0);
}
async function getAgentIssues(agentId, companyId, statuses) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const filters = [
    eq6(issues.assigneeAgentId, agentId),
    eq6(issues.companyId, companyId)
  ];
  if (statuses && statuses.length > 0) {
    filters.push(inArray2(issues.status, statuses));
  }
  const whereClause = filters.length === 1 ? filters[0] : and6(...filters);
  return await db.select().from(issues).where(whereClause).orderBy(desc6(issues.updatedAt));
}
async function getActiveIssues(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(issues).where(
    and6(
      eq6(issues.companyId, companyId),
      inArray2(issues.status, ["in_progress", "in_review"])
    )
  ).orderBy(desc6(issues.updatedAt));
}
async function createIssue(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let requestDepth = options.requestDepth ?? 0;
  if (options.parentId) {
    const parent = await db.select({ id: issues.id }).from(issues).where(and6(eq6(issues.id, options.parentId), eq6(issues.companyId, options.companyId))).limit(1);
    if (parent.length === 0) {
      throw new Error("Parent task not found");
    }
    const depth = await calculateRequestDepth(options.parentId);
    requestDepth = depth + 1;
  }
  const insertData = {
    companyId: options.companyId,
    projectId: options.projectId,
    goalId: options.goalId,
    parentId: options.parentId,
    title: options.title,
    description: options.description,
    status: "backlog",
    priority: options.priority ?? "medium",
    assigneeAgentId: options.assigneeAgentId,
    createdByAgentId: options.createdByAgentId,
    createdByUserId: options.createdByUserId,
    requestDepth,
    billingCode: options.billingCode
  };
  const result = await db.insert(issues).values(insertData);
  const issueId = result.insertId ?? result.id;
  const actorType = options.createdByUserId ? ACTOR_TYPES.USER : options.createdByAgentId ? ACTOR_TYPES.AGENT : ACTOR_TYPES.SYSTEM;
  const actorId = (options.createdByUserId ?? options.createdByAgentId ?? "system").toString();
  await logActivity2({
    companyId: options.companyId,
    actorType,
    actorId,
    action: AUDIT_ACTIONS.TASK_CREATED,
    entityType: "issue",
    entityId: issueId.toString(),
    details: {
      title: options.title,
      priority: options.priority,
      parentId: options.parentId
    }
  });
  const createdIssue = await getIssueById(issueId);
  if (!createdIssue) {
    throw new Error("Failed to load created issue");
  }
  return createdIssue;
}
async function updateIssue(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getIssueById(options.issueId);
  if (!existing) {
    throw new Error("Task not found");
  }
  const updateData = {};
  if (options.title !== void 0) updateData.title = options.title;
  if (options.description !== void 0) updateData.description = options.description;
  if (options.status !== void 0) updateData.status = options.status;
  if (options.priority !== void 0) updateData.priority = options.priority;
  if (options.assigneeAgentId !== void 0) updateData.assigneeAgentId = options.assigneeAgentId;
  if (options.billingCode !== void 0) updateData.billingCode = options.billingCode;
  if (options.status !== void 0) {
    handleStatusTransitionSideEffects(updateData, existing.status, options.status);
  }
  await db.update(issues).set(updateData).where(eq6(issues.id, options.issueId));
  if (options.updatedByUserId || options.updatedByAgentId) {
    const actorType = options.updatedByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.AGENT;
    const actorId = (options.updatedByUserId ?? options.updatedByAgentId).toString();
    await logActivity2({
      companyId: existing.companyId,
      actorType,
      actorId,
      action: AUDIT_ACTIONS.TASK_UPDATED,
      entityType: "issue",
      entityId: options.issueId.toString(),
      details: { changes: updateData }
    });
  }
  const updatedIssue = await getIssueById(options.issueId);
  if (!updatedIssue) {
    throw new Error("Failed to load updated issue");
  }
  return updatedIssue;
}
function handleStatusTransitionSideEffects(updateData, fromStatus, toStatus) {
  const now = /* @__PURE__ */ new Date();
  if (toStatus === "in_progress" && !updateData.startedAt) {
    updateData.startedAt = now;
  }
  if (toStatus === "done") {
    updateData.completedAt = now;
  }
  if (toStatus === "cancelled") {
    updateData.cancelledAt = now;
  }
  if (validIssueTransitions[fromStatus] && !validIssueTransitions[fromStatus].includes(toStatus)) {
    throw new Error(`Invalid state transition from ${fromStatus} to ${toStatus}`);
  }
}
async function calculateRequestDepth(parentId, depth = 0) {
  const db = await getDb();
  if (!db) return depth;
  const [parent] = await db.select({ parentId: issues.parentId }).from(issues).where(eq6(issues.id, parentId)).limit(1);
  if (!parent || !parent.parentId) {
    return depth + 1;
  }
  return calculateRequestDepth(parent.parentId, depth + 1);
}
async function checkoutTask(request) {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Database not available" }
    };
  }
  try {
    const agentExists = await db.select({ id: agents.id }).from(agents).where(eq6(agents.id, request.agentId)).limit(1);
    if (agentExists.length === 0) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Agent not found" }
      };
    }
    const currentIssue = await getIssueById(request.issueId);
    if (!currentIssue) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Task not found" }
      };
    }
    const expectedStatuses = request.expectedStatuses ?? ["backlog", "todo", "blocked"];
    if (!expectedStatuses.includes(currentIssue.status)) {
      return {
        success: false,
        error: {
          code: "INVALID_STATE",
          message: `Task is in ${currentIssue.status} state, not eligible for checkout`,
          currentStatus: currentIssue.status
        }
      };
    }
    const updateCondition = and6(
      eq6(issues.id, request.issueId),
      inArray2(issues.status, expectedStatuses),
      or(eq6(issues.assigneeAgentId, request.agentId), isNull2(issues.assigneeAgentId))
    );
    const updateData = {
      assigneeAgentId: request.agentId,
      status: "in_progress",
      startedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    const result = await db.update(issues).set(updateData).where(updateCondition);
    const affected = result.affectedRows ?? 0;
    if (affected === 0) {
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: "Task is already being worked on by another agent",
          currentOwner: currentIssue.assigneeAgentId ?? void 0,
          currentStatus: currentIssue.status
        }
      };
    }
    await logActivity2({
      companyId: currentIssue.companyId,
      actorType: ACTOR_TYPES.AGENT,
      actorId: request.agentId.toString(),
      action: AUDIT_ACTIONS.TASK_CHECKOUT,
      entityType: "issue",
      entityId: request.issueId.toString(),
      details: {
        previousStatus: currentIssue.status,
        agentId: request.agentId
      }
    });
    const updatedIssue = await getIssueById(request.issueId);
    return {
      success: true,
      issue: updatedIssue ?? void 0
    };
  } catch (error) {
    console.error("[paperclip] checkoutTask failed:", error);
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      }
    };
  }
}
async function releaseTask(issueId, agentId, companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const issue = await getIssueById(issueId);
  if (!issue) {
    return { success: false, error: "Task not found" };
  }
  if (issue.assigneeAgentId !== agentId) {
    return { success: false, error: "Task is not assigned to this agent" };
  }
  await db.update(issues).set({
    assigneeAgentId: null,
    status: "todo",
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq6(issues.id, issueId));
  await logActivity2({
    companyId,
    actorType: ACTOR_TYPES.AGENT,
    actorId: agentId.toString(),
    action: AUDIT_ACTIONS.TASK_RELEASED,
    entityType: "issue",
    entityId: issueId.toString(),
    details: { previousStatus: issue.status }
  });
  return { success: true };
}
async function addComment(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const issue = await getIssueById(options.issueId);
  if (!issue) {
    throw new Error("Task not found");
  }
  const insertData = {
    issueId: options.issueId,
    companyId: options.companyId,
    body: options.body,
    authorAgentId: options.authorAgentId ?? null,
    authorUserId: options.authorUserId ?? null
  };
  const result = await db.insert(issueComments).values(insertData);
  const commentId = result.insertId ?? result.id;
  return {
    id: commentId,
    ...insertData,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function getIssueComments(issueId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(issueComments).where(eq6(issueComments.issueId, issueId)).orderBy(issueComments.createdAt);
}
async function cancelIssue(issueId, companyId, cancelledByUserId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const issue = await getIssueById(issueId);
  if (!issue) {
    throw new Error("Task not found");
  }
  if (issue.companyId !== companyId) {
    throw new Error("Task does not belong to specified company");
  }
  if (["done", "cancelled"].includes(issue.status)) {
    throw new Error(`Cannot cancel task in ${issue.status} state`);
  }
  await db.update(issues).set({
    status: "cancelled",
    cancelledAt: /* @__PURE__ */ new Date()
  }).where(eq6(issues.id, issueId));
  if (cancelledByUserId) {
    await logActivity2({
      companyId,
      actorType: ACTOR_TYPES.USER,
      actorId: cancelledByUserId.toString(),
      action: AUDIT_ACTIONS.TASK_CANCELLED,
      entityType: "issue",
      entityId: issueId.toString(),
      details: { title: issue.title }
    });
  }
}
async function logActivity2(options) {
  const db = await getDb();
  if (!db) {
    console.warn("[paperclip] Database not available, skipping audit log");
    return;
  }
  try {
    await db.insert(activityLog).values({
      ...options,
      details: options.details ?? null
    });
  } catch (error) {
    console.error("[paperclip] Failed to log activity:", error);
  }
}
var taskService = {
  getIssueById,
  getIssueWithDetails,
  listIssues,
  getAgentIssues,
  getActiveIssues,
  createIssue,
  updateIssue,
  cancelIssue,
  checkoutTask,
  releaseTask,
  addComment,
  getIssueComments
};

// server/paperclip-services/audit-service.ts
init_db();
init_schema();
import { eq as eq7, and as and7, desc as desc7, sql as sql4 } from "drizzle-orm";
async function logActivity3(options) {
  const db = await getDb();
  if (!db) {
    console.warn("[paperclip-audit] Database not available, skipping audit log");
    return {
      id: 0,
      companyId: options.companyId,
      actorType: options.actorType,
      actorId: options.actorId,
      action: options.action,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      details: options.details ?? null,
      createdAt: /* @__PURE__ */ new Date()
    };
  }
  try {
    const insertData = {
      companyId: options.companyId,
      actorType: options.actorType,
      actorId: options.actorId,
      action: options.action,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      details: options.details
    };
    const result = await db.insert(activityLog).values(insertData);
    const logId = result.insertId || result.id;
    return {
      id: logId,
      companyId: insertData.companyId,
      actorType: insertData.actorType,
      actorId: insertData.actorId,
      action: insertData.action,
      entityType: insertData.entityType ?? null,
      entityId: insertData.entityId ?? null,
      details: insertData.details ?? null,
      createdAt: /* @__PURE__ */ new Date()
    };
  } catch (error) {
    console.error("[paperclip-audit] Failed to log activity:", error);
    throw error;
  }
}
async function logActivities(activities) {
  const db = await getDb();
  if (!db) {
    console.warn("[paperclip-audit] Database not available, skipping batch audit logs");
    return;
  }
  try {
    const insertData = activities.map((activity) => ({
      companyId: activity.companyId,
      actorType: activity.actorType,
      actorId: activity.actorId,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      details: activity.details ?? null
    }));
    await db.insert(activityLog).values(insertData);
  } catch (error) {
    console.error("[paperclip-audit] Failed to log batch activities:", error);
    throw error;
  }
}
async function queryActivityLogs(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const {
    companyId,
    actorType,
    actorId,
    entityType,
    entityId,
    action,
    limit = 50,
    offset = 0
  } = options;
  const filters = [eq7(activityLog.companyId, companyId)];
  if (actorType !== void 0) filters.push(eq7(activityLog.actorType, actorType));
  if (actorId !== void 0) filters.push(eq7(activityLog.actorId, actorId));
  if (entityType !== void 0) filters.push(eq7(activityLog.entityType, entityType));
  if (entityId !== void 0) filters.push(eq7(activityLog.entityId, entityId));
  if (action !== void 0) filters.push(eq7(activityLog.action, action));
  const whereClause = filters.reduce((acc, clause) => acc ? and7(acc, clause) : clause, void 0) ?? eq7(activityLog.companyId, companyId);
  return await db.select().from(activityLog).where(whereClause).orderBy(desc7(activityLog.createdAt)).limit(limit).offset(offset);
}
async function getEntityActivity(companyId, entityType, entityId, limit = 20) {
  return await queryActivityLogs({
    companyId,
    entityType,
    entityId,
    limit
  });
}
async function getUserActivity(companyId, userId, limit = 50) {
  return await queryActivityLogs({
    companyId,
    actorType: "user",
    actorId: userId.toString(),
    limit
  });
}
async function getAgentActivity(companyId, agentId, limit = 50) {
  return await queryActivityLogs({
    companyId,
    actorType: "agent",
    actorId: agentId.toString(),
    limit
  });
}
async function getActivityStats(companyId, since) {
  const db = await getDb();
  if (!db) {
    return {
      totalCount: 0,
      byAction: {},
      byActorType: {},
      byEntityType: {}
    };
  }
  let baseCondition = eq7(activityLog.companyId, companyId);
  if (since) {
    baseCondition = and7(baseCondition, sql4`${activityLog.createdAt} >= ${since}`);
  }
  const [totalResult] = await db.select({ count: sql4`COUNT(*)` }).from(activityLog).where(baseCondition);
  const byActionResult = await db.select({
    action: activityLog.action,
    count: sql4`COUNT(*)`
  }).from(activityLog).where(baseCondition).groupBy(activityLog.action);
  const byActorTypeResult = await db.select({
    actorType: activityLog.actorType,
    count: sql4`COUNT(*)`
  }).from(activityLog).where(baseCondition).groupBy(activityLog.actorType);
  const byEntityTypeResult = await db.select({
    entityType: activityLog.entityType,
    count: sql4`COUNT(*)`
  }).from(activityLog).where(baseCondition).groupBy(activityLog.entityType);
  return {
    totalCount: totalResult?.count || 0,
    byAction: Object.fromEntries(byActionResult.map((r) => [r.action, r.count])),
    byActorType: Object.fromEntries(byActorTypeResult.map((r) => [r.actorType, r.count])),
    byEntityType: Object.fromEntries(byEntityTypeResult.map((r) => [r.entityType, r.count]))
  };
}
async function exportAuditReport(companyId, startDate, endDate) {
  const logs = await queryActivityLogs({
    companyId,
    limit: 1e4,
    offset: 0
  });
  const filtered = logs.filter(
    (log) => log.createdAt >= startDate && log.createdAt <= endDate
  );
  const headers = ["Timestamp", "Actor Type", "Actor ID", "Action", "Entity Type", "Entity ID", "Details"];
  const rows = filtered.map((log) => [
    log.createdAt.toISOString(),
    log.actorType,
    log.actorId,
    log.action,
    log.entityType,
    log.entityId,
    JSON.stringify(log.details || {})
  ]);
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
var auditService = {
  // 记录
  logActivity: logActivity3,
  logActivities,
  // 查询
  queryActivityLogs,
  getEntityActivity,
  getUserActivity,
  getAgentActivity,
  // 统计
  getActivityStats,
  // 导出
  exportAuditReport
};

// server/paperclip-services/cost-service.ts
init_db();
init_schema();
import { eq as eq8, and as and8, desc as desc8, sql as sql5 } from "drizzle-orm";
async function reportCostEvent(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const agent = await db.select({
    id: agents.id,
    budgetMonthlyCents: agents.budgetMonthlyCents,
    spentMonthlyCents: agents.spentMonthlyCents
  }).from(agents).where(eq8(agents.id, options.agentId)).limit(1);
  if (agent.length === 0) {
    throw new Error("Agent not found");
  }
  const insertData = {
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
    occurredAt: options.occurredAt ?? /* @__PURE__ */ new Date()
  };
  const result = await db.insert(costEvents).values(insertData);
  const eventId = result.insertId || result.id;
  await updateAgentSpentCents(options.agentId, options.costCents);
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
  const occurredAt = insertData.occurredAt ?? /* @__PURE__ */ new Date();
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
    createdAt: /* @__PURE__ */ new Date()
  };
}
async function reportBatchCostEvents(events) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = /* @__PURE__ */ new Date();
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
    occurredAt: now
  }));
  await db.insert(costEvents).values(insertData);
  const agentSpending = /* @__PURE__ */ new Map();
  for (const event of events) {
    const current = agentSpending.get(event.agentId) || 0;
    agentSpending.set(event.agentId, current + event.costCents);
  }
  for (const [agentId, totalCents] of Array.from(agentSpending.entries())) {
    await updateAgentSpentCents(agentId, totalCents);
  }
}
async function getBudgetStatus(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { companyId, agentId, projectId } = options;
  const now = /* @__PURE__ */ new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const spendFilters = [
    eq8(costEvents.companyId, companyId),
    sql5`${costEvents.occurredAt} >= ${monthStart}`,
    sql5`${costEvents.occurredAt} <= ${monthEnd}`
  ];
  if (agentId) {
    spendFilters.push(eq8(costEvents.agentId, agentId));
  }
  if (projectId) {
    spendFilters.push(eq8(costEvents.projectId, projectId));
  }
  const spendWhere = spendFilters.length === 1 ? spendFilters[0] : and8(...spendFilters);
  const [spendResult] = await db.select({ total: sql5`SUM(costCents)` }).from(costEvents).where(spendWhere);
  const spentCents = spendResult?.total || 0;
  let monthlyBudgetCents = 0;
  if (agentId) {
    const [agent] = await db.select({ budgetMonthlyCents: agents.budgetMonthlyCents }).from(agents).where(eq8(agents.id, agentId)).limit(1);
    monthlyBudgetCents = agent?.budgetMonthlyCents || 0;
  }
  const remainingCents = monthlyBudgetCents - spentCents;
  const utilizationPercent = monthlyBudgetCents > 0 ? spentCents / monthlyBudgetCents * 100 : 0;
  const isOverBudget = spentCents > monthlyBudgetCents;
  const daysRemainingInMonth = Math.ceil(
    (monthEnd.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24)
  );
  return {
    monthlyBudgetCents,
    spentCents,
    remainingCents,
    utilizationPercent: Math.round(utilizationPercent * 100) / 100,
    isOverBudget,
    daysRemainingInMonth
  };
}
async function getCompanyBudgetSummary(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const agentsList = await db.select({
    id: agents.id,
    budgetMonthlyCents: agents.budgetMonthlyCents
  }).from(agents).where(and8(eq8(agents.companyId, companyId), eq8(agents.status, "active")));
  const totalBudgetCents = agentsList.reduce(
    (sum2, agent) => sum2 + (agent.budgetMonthlyCents || 0),
    0
  );
  const now = /* @__PURE__ */ new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  let overBudgetAgents = 0;
  let totalSpentCents = 0;
  for (const agent of agentsList) {
    const [spendResult] = await db.select({ total: sql5`SUM(costCents)` }).from(costEvents).where(
      and8(
        eq8(costEvents.companyId, companyId),
        eq8(costEvents.agentId, agent.id),
        sql5`${costEvents.occurredAt} >= ${monthStart}`,
        sql5`${costEvents.occurredAt} <= ${monthEnd}`
      )
    ).limit(1);
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
    overBudgetAgents
  };
}
async function checkAndEnforceBudget(companyId, agentId, budgetMonthlyCents, spentCents) {
  if (budgetMonthlyCents <= 0) return;
  const db = await getDb();
  if (!db) return;
  const utilizationPercent = spentCents / budgetMonthlyCents * 100;
  if (utilizationPercent >= BUDGET_THRESHOLDS.SOFT_ALERT_PERCENT && utilizationPercent < BUDGET_THRESHOLDS.HARD_LIMIT_PERCENT) {
    await logActivity4({
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
        level: "soft_alert"
      }
    });
    console.warn(
      `[paperclip-budget] Agent ${agentId} budget utilization at ${utilizationPercent.toFixed(1)}%`
    );
  }
  if (utilizationPercent >= BUDGET_THRESHOLDS.HARD_LIMIT_PERCENT) {
    await db.update(agents).set({ status: "paused" }).where(eq8(agents.id, agentId));
    await logActivity4({
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
        spentCents
      }
    });
    console.warn(
      `[paperclip-budget] Agent ${agentId} paused due to budget hard limit (${utilizationPercent.toFixed(1)}%)`
    );
  }
}
async function updateAgentSpentCents(agentId, amountCents) {
  const db = await getDb();
  if (!db) return;
  const now = /* @__PURE__ */ new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const [spendResult] = await db.select({ total: sql5`SUM(costCents)` }).from(costEvents).where(
    and8(
      eq8(costEvents.agentId, agentId),
      sql5`${costEvents.occurredAt} >= ${monthStart}`,
      sql5`${costEvents.occurredAt} <= ${monthEnd}`
    )
  ).limit(1);
  const totalSpentCents = spendResult?.total || 0;
  await db.update(agents).set({ spentMonthlyCents: totalSpentCents }).where(eq8(agents.id, agentId));
}
async function getCostEvents(companyId, agentId, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const filters = [eq8(costEvents.companyId, companyId)];
  if (agentId) {
    filters.push(eq8(costEvents.agentId, agentId));
  }
  const whereClause = filters.length === 1 ? filters[0] : and8(...filters);
  return await db.select().from(costEvents).where(whereClause).orderBy(desc8(costEvents.occurredAt)).limit(limit).offset(offset);
}
async function getCostsByAgent(companyId, startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select({
    agentId: costEvents.agentId,
    totalCostCents: sql5`SUM(costCents)`,
    inputTokens: sql5`SUM(inputTokens)`,
    outputTokens: sql5`SUM(outputTokens)`,
    eventCount: sql5`COUNT(*)`
  }).from(costEvents).where(
    and8(
      eq8(costEvents.companyId, companyId),
      sql5`${costEvents.occurredAt} >= ${startDate}`,
      sql5`${costEvents.occurredAt} <= ${endDate}`
    )
  ).groupBy(costEvents.agentId).orderBy(sql5`totalCostCents DESC`);
  const agentIds = results.map((r) => r.agentId);
  const agentsList = await db.select({ id: agents.id, name: agents.name }).from(agents).where(sql5`id IN ${agentIds}`);
  const agentMap = new Map(agentsList.map((a) => [a.id, a.name]));
  return results.map((r) => ({
    agentId: r.agentId,
    agentName: agentMap.get(r.agentId),
    totalCostCents: r.totalCostCents,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    eventCount: r.eventCount
  }));
}
async function getCostsByProject(companyId, startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select({
    projectId: costEvents.projectId,
    totalCostCents: sql5`SUM(costCents)`,
    eventCount: sql5`COUNT(*)`
  }).from(costEvents).where(
    and8(
      eq8(costEvents.companyId, companyId),
      sql5`${costEvents.occurredAt} >= ${startDate}`,
      sql5`${costEvents.occurredAt} <= ${endDate}`
    )
  ).groupBy(costEvents.projectId).orderBy(sql5`totalCostCents DESC`);
}
async function logActivity4(options) {
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
var costService = {
  // 成本报告
  reportCostEvent,
  reportBatchCostEvents,
  // 预算查询
  getBudgetStatus,
  getCompanyBudgetSummary,
  // 成本分析
  getCostEvents,
  getCostsByAgent,
  getCostsByProject
};

// server/paperclip-services/approval-service.ts
init_db();
init_schema();
import { and as and9, desc as desc9, eq as eq9 } from "drizzle-orm";
async function createApproval(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const company = await db.select({ id: companies.id }).from(companies).where(eq9(companies.id, options.companyId)).limit(1);
  if (company.length === 0) {
    throw new Error("Company not found");
  }
  const insertResult = await db.insert(approvals).values({
    companyId: options.companyId,
    type: options.type,
    requestedByAgentId: options.requestedByAgentId,
    requestedByUserId: options.requestedByUserId,
    status: "pending",
    payload: options.payload,
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null
  });
  const approvalId = insertResult.insertId || insertResult.id;
  const approval = await getApprovalById(approvalId);
  if (!approval) {
    throw new Error("Failed to create approval");
  }
  await logActivity5({
    companyId: options.companyId,
    actorType: options.requestedByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.requestedByUserId ? options.requestedByUserId.toString() : "system",
    action: AUDIT_ACTIONS.APPROVAL_REQUESTED,
    entityType: "approval",
    entityId: approvalId.toString(),
    details: {
      type: options.type,
      requestedByAgentId: options.requestedByAgentId
    }
  });
  return approval;
}
async function listApprovals(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const whereClause = options.status ? and9(eq9(approvals.companyId, options.companyId), eq9(approvals.status, options.status)) : eq9(approvals.companyId, options.companyId);
  const rows = await db.select().from(approvals).where(whereClause).orderBy(desc9(approvals.createdAt));
  return rows.map(normalizeApproval);
}
async function getApprovalById(approvalId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(approvals).where(eq9(approvals.id, approvalId)).limit(1);
  if (rows.length === 0) {
    return null;
  }
  return normalizeApproval(rows[0]);
}
async function decideApproval(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getApprovalById(options.approvalId);
  if (!existing) {
    throw new Error("Approval not found");
  }
  if (existing.status !== "pending") {
    throw new Error("Only pending approvals can be decided");
  }
  await db.update(approvals).set({
    status: options.decision,
    decidedByUserId: options.decidedByUserId ?? null,
    decisionNote: options.decisionNote ?? null,
    decidedAt: /* @__PURE__ */ new Date()
  }).where(eq9(approvals.id, options.approvalId));
  const updated = await getApprovalById(options.approvalId);
  if (!updated) {
    throw new Error("Failed to update approval");
  }
  await logActivity5({
    companyId: updated.companyId,
    actorType: options.decidedByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.decidedByUserId ? options.decidedByUserId.toString() : "system",
    action: options.decision === "approved" ? AUDIT_ACTIONS.APPROVAL_APPROVED : AUDIT_ACTIONS.APPROVAL_REJECTED,
    entityType: "approval",
    entityId: options.approvalId.toString(),
    details: {
      decisionNote: options.decisionNote
    }
  });
  return updated;
}
async function listApprovalComments(approvalId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const approval = await getApprovalById(approvalId);
  if (!approval) {
    throw new Error("Approval not found");
  }
  return await db.select().from(approvalComments).where(
    and9(
      eq9(approvalComments.approvalId, approvalId),
      eq9(approvalComments.companyId, approval.companyId)
    )
  ).orderBy(approvalComments.createdAt);
}
async function addApprovalComment(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const approval = await getApprovalById(options.approvalId);
  if (!approval) {
    throw new Error("Approval not found");
  }
  const insertResult = await db.insert(approvalComments).values({
    approvalId: options.approvalId,
    companyId: approval.companyId,
    authorUserId: options.authorUserId ?? 0,
    body: options.body
  });
  const commentId = insertResult.insertId || insertResult.id;
  const rows = await db.select().from(approvalComments).where(eq9(approvalComments.id, commentId)).limit(1);
  const comment = rows[0];
  await logActivity5({
    companyId: approval.companyId,
    actorType: options.authorUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.authorUserId ? options.authorUserId.toString() : "system",
    action: AUDIT_ACTIONS.APPROVAL_COMMENTED,
    entityType: "approval",
    entityId: options.approvalId.toString(),
    details: {
      commentId
    }
  });
  return comment;
}
var approvalService = {
  createApproval,
  listApprovals,
  getApprovalById,
  decideApproval,
  listApprovalComments,
  addApprovalComment
};
function normalizeApproval(row) {
  return {
    ...row,
    payload: row.payload ?? null
  };
}
async function logActivity5(options) {
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

// server/paperclip-services/dashboard-service.ts
init_db();
init_schema();
import { eq as eq10, and as and10, desc as desc10, sql as sql6 } from "drizzle-orm";
async function getDashboardSummary(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = /* @__PURE__ */ new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [
    agentStats,
    issueStats,
    pendingApprovalsCount,
    budgetStats,
    recentActivityRows,
    topCostRows
  ] = await Promise.all([
    // Agent 状态统计
    db.select({
      status: agents.status,
      count: sql6`COUNT(*)`
    }).from(agents).where(eq10(agents.companyId, companyId)).groupBy(agents.status),
    // 任务状态统计
    db.select({
      status: issues.status,
      count: sql6`COUNT(*)`
    }).from(issues).where(eq10(issues.companyId, companyId)).groupBy(issues.status),
    // 待审批数量
    db.select({ count: sql6`COUNT(*)` }).from(approvals).where(and10(eq10(approvals.companyId, companyId), eq10(approvals.status, "pending"))),
    // 本月预算统计
    db.select({
      totalSpent: sql6`SUM(costCents)`
    }).from(costEvents).where(and10(
      eq10(costEvents.companyId, companyId),
      sql6`${costEvents.occurredAt} >= ${monthStart}`
    )),
    // 最近活动
    db.select().from(activityLog).where(eq10(activityLog.companyId, companyId)).orderBy(desc10(activityLog.createdAt)).limit(10),
    // 按 Agent 统计本月成本 Top 5
    db.select({
      agentId: costEvents.agentId,
      totalCostCents: sql6`SUM(costCents)`
    }).from(costEvents).where(and10(
      eq10(costEvents.companyId, companyId),
      sql6`${costEvents.occurredAt} >= ${monthStart}`
    )).groupBy(costEvents.agentId).orderBy(sql6`SUM(costCents) DESC`).limit(5)
  ]);
  const agentCounts = { active: 0, running: 0, paused: 0, error: 0, idle: 0 };
  for (const row of agentStats) {
    const s = row.status;
    if (s in agentCounts) agentCounts[s] = Number(row.count);
  }
  const issueCounts = { open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const row of issueStats) {
    if (row.status === "backlog" || row.status === "todo") issueCounts.open += Number(row.count);
    else if (row.status === "in_progress" || row.status === "in_review") issueCounts.inProgress += Number(row.count);
    else if (row.status === "blocked") issueCounts.blocked += Number(row.count);
    else if (row.status === "done") issueCounts.done += Number(row.count);
  }
  const monthToDateSpendCents = Number(budgetStats[0]?.totalSpent) || 0;
  const [totalBudgetRow] = await db.select({ total: sql6`SUM(budgetMonthlyCents)` }).from(agents).where(eq10(agents.companyId, companyId));
  const totalBudgetCents = Number(totalBudgetRow?.total) || 0;
  const agentIds = topCostRows.map((r) => r.agentId);
  const agentNames = agentIds.length > 0 ? await db.select({ id: agents.id, name: agents.name }).from(agents).where(sql6`${agents.id} IN ${agentIds}`) : [];
  const agentNameMap = new Map(agentNames.map((a) => [a.id, a.name]));
  return {
    agentCounts,
    issueCounts,
    budget: {
      monthToDateSpendCents,
      totalBudgetCents,
      utilizationPercent: totalBudgetCents > 0 ? Math.round(monthToDateSpendCents / totalBudgetCents * 1e4) / 100 : 0
    },
    pendingApprovals: Number(pendingApprovalsCount[0]?.count) || 0,
    recentActivity: recentActivityRows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details,
      createdAt: r.createdAt
    })),
    topAgentsByCost: topCostRows.map((r) => ({
      agentId: r.agentId,
      agentName: agentNameMap.get(r.agentId) ?? `Agent #${r.agentId}`,
      totalCostCents: Number(r.totalCostCents)
    }))
  };
}
var dashboardService = {
  getDashboardSummary
};

// server/paperclip-services/project-service.ts
init_db();
init_schema();
import { eq as eq11, and as and11, desc as desc11, sql as sql7 } from "drizzle-orm";
async function logActivity6(options) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(activityLog).values(options);
  } catch {
  }
}
async function createProject(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values({
    companyId: options.companyId,
    name: options.name,
    description: options.description,
    status: "active"
  });
  const projectId = result.insertId;
  await logActivity6({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() ?? "system",
    action: AUDIT_ACTIONS.AGENT_CREATED,
    // reuse generic created action
    entityType: "project",
    entityId: projectId.toString(),
    details: { name: options.name }
  });
  const rows = await db.select().from(projects).where(eq11(projects.id, projectId)).limit(1);
  return rows[0];
}
async function getProjectById(projectId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(projects).where(eq11(projects.id, projectId)).limit(1);
  return rows[0] ?? null;
}
async function listProjects(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { companyId, status, limit = 50, offset = 0 } = options;
  const where = status ? and11(eq11(projects.companyId, companyId), eq11(projects.status, status)) : eq11(projects.companyId, companyId);
  const rows = await db.select().from(projects).where(where).orderBy(desc11(projects.createdAt)).limit(limit).offset(offset);
  const result = await Promise.all(rows.map(async (p) => {
    const [countRow] = await db.select({ count: sql7`COUNT(*)` }).from(issues).where(eq11(issues.projectId, p.id));
    return { ...p, taskCount: Number(countRow?.count) || 0 };
  }));
  return result;
}
async function updateProject(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const update = {};
  if (options.name !== void 0) update.name = options.name;
  if (options.description !== void 0) update.description = options.description;
  if (options.status !== void 0) update.status = options.status;
  await db.update(projects).set(update).where(eq11(projects.id, options.projectId));
  return getProjectById(options.projectId);
}
async function deleteProject(projectId, companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(and11(eq11(projects.id, projectId), eq11(projects.companyId, companyId)));
}
var projectService = {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
  deleteProject
};

// server/paperclip-services/goal-service.ts
init_db();
init_schema();
import { eq as eq12, and as and12, desc as desc12, sql as sql8 } from "drizzle-orm";
async function logActivity7(options) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(activityLog).values(options);
  } catch {
  }
}
async function createGoal(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(goals).values({
    companyId: options.companyId,
    title: options.title,
    description: options.description,
    level: options.level,
    parentId: options.parentId ?? null,
    ownerAgentId: options.ownerAgentId ?? null,
    status: "planned"
  });
  const goalId = result.insertId;
  await logActivity7({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() ?? "system",
    action: "goal.created",
    entityType: "goal",
    entityId: goalId.toString(),
    details: { title: options.title, level: options.level }
  });
  const rows = await db.select().from(goals).where(eq12(goals.id, goalId)).limit(1);
  return rows[0];
}
async function getGoalById(goalId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(goals).where(eq12(goals.id, goalId)).limit(1);
  return rows[0] ?? null;
}
async function listGoals(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { companyId, level, status, parentId, limit = 50, offset = 0 } = options;
  const conditions = [eq12(goals.companyId, companyId)];
  if (level) conditions.push(eq12(goals.level, level));
  if (status) conditions.push(eq12(goals.status, status));
  if (parentId === null) conditions.push(sql8`${goals.parentId} IS NULL`);
  else if (parentId !== void 0) conditions.push(eq12(goals.parentId, parentId));
  const where = conditions.length === 1 ? conditions[0] : and12(...conditions);
  return db.select().from(goals).where(where).orderBy(desc12(goals.createdAt)).limit(limit).offset(offset);
}
async function updateGoal(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const update = {};
  if (options.title !== void 0) update.title = options.title;
  if (options.description !== void 0) update.description = options.description;
  if (options.status !== void 0) update.status = options.status;
  if (options.ownerAgentId !== void 0) update.ownerAgentId = options.ownerAgentId;
  await db.update(goals).set(update).where(eq12(goals.id, options.goalId));
  return getGoalById(options.goalId);
}
async function getGoalTree(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const allGoals = await db.select().from(goals).where(eq12(goals.companyId, companyId)).orderBy(goals.level, goals.createdAt);
  const map = /* @__PURE__ */ new Map();
  const roots = [];
  for (const g of allGoals) {
    map.set(g.id, { ...g, children: [] });
  }
  for (const g of allGoals) {
    if (g.parentId && map.has(g.parentId)) {
      map.get(g.parentId).children.push(map.get(g.id));
    } else {
      roots.push(map.get(g.id));
    }
  }
  return roots;
}
var goalService = {
  createGoal,
  getGoalById,
  listGoals,
  updateGoal,
  getGoalTree
};

// server/paperclip-services/heartbeat-service.ts
init_db();
init_schema();
import { eq as eq13, and as and13, desc as desc13 } from "drizzle-orm";
async function logActivity8(options) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(activityLog).values(options);
  } catch {
  }
}
async function startHeartbeatRun(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [running] = await db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and13(
    eq13(heartbeatRuns.agentId, options.agentId),
    eq13(heartbeatRuns.status, "running")
  )).limit(1);
  if (running) {
    throw new Error(`Agent ${options.agentId} already has a running heartbeat (id=${running.id})`);
  }
  const result = await db.insert(heartbeatRuns).values({
    companyId: options.companyId,
    agentId: options.agentId,
    invocationSource: options.invocationSource,
    status: "running",
    startedAt: /* @__PURE__ */ new Date(),
    contextSnapshot: options.contextSnapshot ?? null
  });
  const runId = result.insertId;
  await db.update(agents).set({ status: "running", lastHeartbeatAt: /* @__PURE__ */ new Date() }).where(eq13(agents.id, options.agentId));
  await logActivity8({
    companyId: options.companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "system",
    action: AUDIT_ACTIONS.AGENT_HEARTBEAT_STARTED,
    entityType: "heartbeat_run",
    entityId: runId.toString(),
    details: { agentId: options.agentId, invocationSource: options.invocationSource }
  });
  const rows = await db.select().from(heartbeatRuns).where(eq13(heartbeatRuns.id, runId)).limit(1);
  return rows[0];
}
async function finishHeartbeatRun(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [run] = await db.select().from(heartbeatRuns).where(eq13(heartbeatRuns.id, options.runId)).limit(1);
  if (!run) throw new Error("Heartbeat run not found");
  await db.update(heartbeatRuns).set({
    status: options.status,
    finishedAt: /* @__PURE__ */ new Date(),
    error: options.error ?? null,
    contextSnapshot: options.contextSnapshot ?? run.contextSnapshot
  }).where(eq13(heartbeatRuns.id, options.runId));
  const newAgentStatus = options.status === "succeeded" ? "idle" : "error";
  await db.update(agents).set({ status: newAgentStatus }).where(eq13(agents.id, run.agentId));
  await logActivity8({
    companyId: run.companyId,
    actorType: ACTOR_TYPES.SYSTEM,
    actorId: "system",
    action: AUDIT_ACTIONS.AGENT_HEARTBEAT_COMPLETED,
    entityType: "heartbeat_run",
    entityId: options.runId.toString(),
    details: { agentId: run.agentId, status: options.status, error: options.error }
  });
  const rows = await db.select().from(heartbeatRuns).where(eq13(heartbeatRuns.id, options.runId)).limit(1);
  return rows[0];
}
async function appendRunEvent(runId, eventType, eventData) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(heartbeatRunEvents).values({
    runId,
    eventType,
    eventData: eventData ?? null
  });
}
async function getRunEvents(runId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(heartbeatRunEvents).where(eq13(heartbeatRunEvents.runId, runId)).orderBy(heartbeatRunEvents.occurredAt);
}
async function listHeartbeatRuns(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { companyId, agentId, status, limit = 50, offset = 0 } = options;
  const conditions = [eq13(heartbeatRuns.companyId, companyId)];
  if (agentId) conditions.push(eq13(heartbeatRuns.agentId, agentId));
  if (status) conditions.push(eq13(heartbeatRuns.status, status));
  const where = conditions.length === 1 ? conditions[0] : and13(...conditions);
  return db.select().from(heartbeatRuns).where(where).orderBy(desc13(heartbeatRuns.createdAt)).limit(limit).offset(offset);
}
async function createWakeupRequest(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(agentWakeupRequests).values({
    agentId: options.agentId,
    companyId: options.companyId,
    reason: options.reason,
    triggeredByUserId: options.triggeredByUserId ?? null,
    triggeredByAgentId: options.triggeredByAgentId ?? null,
    processed: false
  });
  const id = result.insertId;
  const rows = await db.select().from(agentWakeupRequests).where(eq13(agentWakeupRequests.id, id)).limit(1);
  return rows[0];
}
async function getPendingWakeupRequests(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(agentWakeupRequests).where(and13(eq13(agentWakeupRequests.agentId, agentId), eq13(agentWakeupRequests.processed, false))).orderBy(agentWakeupRequests.createdAt);
}
async function markWakeupProcessed(requestId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(agentWakeupRequests).set({
    processed: true,
    processedAt: /* @__PURE__ */ new Date()
  }).where(eq13(agentWakeupRequests.id, requestId));
}
var heartbeatService = {
  startHeartbeatRun,
  finishHeartbeatRun,
  appendRunEvent,
  getRunEvents,
  listHeartbeatRuns,
  createWakeupRequest,
  getPendingWakeupRequests,
  markWakeupProcessed
};

// server/paperclip-services/secrets-service.ts
init_db();
init_schema();
import { eq as eq14, and as and14, desc as desc14 } from "drizzle-orm";
import * as crypto2 from "crypto";
var ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 16;
var TAG_LENGTH = 16;
function getEncryptionKey() {
  const key = process.env.SECRETS_ENCRYPTION_KEY || process.env.SESSION_SECRET || "default-dev-key-change-in-prod!!";
  return crypto2.createHash("sha256").update(key).digest();
}
function encrypt(plaintext) {
  const iv = crypto2.randomBytes(IV_LENGTH);
  const cipher = crypto2.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}
function decrypt(ciphertext) {
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto2.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
async function logActivity9(options) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(activityLog).values(options);
  } catch {
  }
}
async function upsertSecret(options) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encryptedValue = encrypt(options.value);
  await db.insert(companySecrets).values({
    companyId: options.companyId,
    key: options.key,
    encryptedValue,
    description: options.description ?? null
  }).onDuplicateKeyUpdate({
    set: { encryptedValue, description: options.description ?? null, updatedAt: /* @__PURE__ */ new Date() }
  });
  await logActivity9({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() ?? "system",
    action: "secret.upserted",
    entityType: "secret",
    entityId: options.key,
    details: { key: options.key }
  });
}
async function getSecret(companyId, key) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(companySecrets).where(and14(eq14(companySecrets.companyId, companyId), eq14(companySecrets.key, key))).limit(1);
  if (!rows[0]) return null;
  return decrypt(rows[0].encryptedValue);
}
async function listSecrets(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({
    id: companySecrets.id,
    companyId: companySecrets.companyId,
    key: companySecrets.key,
    description: companySecrets.description,
    createdAt: companySecrets.createdAt,
    updatedAt: companySecrets.updatedAt
  }).from(companySecrets).where(eq14(companySecrets.companyId, companyId)).orderBy(desc14(companySecrets.createdAt));
  return rows;
}
async function deleteSecret(companyId, key) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(companySecrets).where(and14(eq14(companySecrets.companyId, companyId), eq14(companySecrets.key, key)));
}
var secretsService = {
  upsertSecret,
  getSecret,
  listSecrets,
  deleteSecret
};

// server/paperclip-services/live-events-service.ts
import { EventEmitter } from "events";
var LiveEventsService = class extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
  /**
   * 发布事件到指定公司
   */
  publish(event) {
    const channelKey = `company:${event.companyId}`;
    this.emit(channelKey, event);
    this.emit("global", event);
  }
  /**
   * 订阅公司事件
   */
  subscribe(companyId, handler) {
    const channelKey = `company:${companyId}`;
    this.on(channelKey, handler);
    return () => {
      this.off(channelKey, handler);
    };
  }
  /**
   * 订阅全局事件
   */
  subscribeGlobal(handler) {
    this.on("global", handler);
    return () => {
      this.off("global", handler);
    };
  }
  /**
   * 发布 Agent 状态变更事件
   */
  publishAgentStatusChange(companyId, agentId, oldStatus, newStatus) {
    this.publish({
      type: "agent.status_changed",
      companyId,
      entityType: "agent",
      entityId: agentId.toString(),
      data: { oldStatus, newStatus },
      timestamp: /* @__PURE__ */ new Date()
    });
  }
  /**
   * 发布任务状态变更事件
   */
  publishTaskStatusChange(companyId, taskId, oldStatus, newStatus) {
    this.publish({
      type: "task.status_changed",
      companyId,
      entityType: "task",
      entityId: taskId.toString(),
      data: { oldStatus, newStatus },
      timestamp: /* @__PURE__ */ new Date()
    });
  }
  /**
   * 发布成本事件
   */
  publishCostEvent(companyId, agentId, costCents) {
    this.publish({
      type: "cost.reported",
      companyId,
      entityType: "agent",
      entityId: agentId.toString(),
      data: { costCents },
      timestamp: /* @__PURE__ */ new Date()
    });
  }
  /**
   * 发布审批请求事件
   */
  publishApprovalRequest(companyId, approvalId, approvalType) {
    this.publish({
      type: "approval.requested",
      companyId,
      entityType: "approval",
      entityId: approvalId.toString(),
      data: { approvalType },
      timestamp: /* @__PURE__ */ new Date()
    });
  }
};
var liveEventsService = new LiveEventsService();

// server/paperclip-services/budget-policy-engine.ts
init_db();
init_schema();
import { eq as eq15, and as and15, sql as sql10 } from "drizzle-orm";

// server/paperclip-services/scheduler-service.ts
init_db();
init_paperclip_schema();
import { eq as eq16, and as and16, asc as asc3 } from "drizzle-orm";
import * as cronParser from "cron-parser";
async function createSchedule(options) {
  const {
    companyId,
    agentId,
    cronExpression,
    enabled = true,
    maxRetries = 0,
    retryDelaySeconds = 60,
    timeoutSeconds = 300
  } = options;
  try {
    cronParser.parseExpression(cronExpression);
  } catch (error) {
    throw new Error("Invalid cron expression");
  }
  const interval = cronParser.parseExpression(cronExpression);
  const nextRun = interval.next().toDate();
  const db = await getDb();
  const [schedule] = await db.insert(agentSchedules).values({
    companyId,
    agentId,
    cronExpression,
    enabled: enabled ? 1 : 0,
    nextRun,
    maxRetries,
    retryDelaySeconds,
    timeoutSeconds,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  }).returning();
  return schedule;
}
async function listSchedules(options) {
  const { companyId, agentId } = options;
  const db = await getDb();
  const conditions = [eq16(agentSchedules.companyId, companyId)];
  if (agentId) {
    conditions.push(eq16(agentSchedules.agentId, agentId));
  }
  const schedules = await db.select().from(agentSchedules).where(and16(...conditions));
  return schedules;
}
async function updateSchedule(options) {
  const { scheduleId, cronExpression, enabled } = options;
  const db = await getDb();
  const updates = { updatedAt: /* @__PURE__ */ new Date() };
  if (cronExpression !== void 0) {
    try {
      cronParser.parseExpression(cronExpression);
    } catch (error) {
      throw new Error("Invalid cron expression");
    }
    const interval = cronParser.parseExpression(cronExpression);
    updates.cronExpression = cronExpression;
    updates.nextRun = interval.next().toDate();
  }
  if (enabled !== void 0) {
    updates.enabled = enabled ? 1 : 0;
  }
  const [schedule] = await db.update(agentSchedules).set(updates).where(eq16(agentSchedules.id, scheduleId)).returning();
  return schedule;
}
async function deleteSchedule(scheduleId) {
  const db = await getDb();
  await db.delete(agentSchedules).where(eq16(agentSchedules.id, scheduleId));
}
async function getNextScheduledRuns(companyId, limit = 10) {
  const db = await getDb();
  const schedules = await db.select().from(agentSchedules).where(
    and16(
      eq16(agentSchedules.companyId, companyId),
      eq16(agentSchedules.enabled, 1)
    )
  ).orderBy(asc3(agentSchedules.nextRun)).limit(limit);
  return schedules;
}

// server/scheduler-router.ts
import { z as z9 } from "zod";
var schedulerRouter = router({
  list: publicProcedure.input(z9.object({
    companyId: z9.number().optional().default(1),
    agentId: z9.number().optional()
  })).query(async ({ input }) => {
    return await listSchedules(input);
  }),
  create: publicProcedure.input(z9.object({
    companyId: z9.number().optional().default(1),
    agentId: z9.number(),
    cronExpression: z9.string(),
    enabled: z9.boolean().optional().default(true)
  })).mutation(async ({ input }) => {
    return await createSchedule(input);
  }),
  toggle: publicProcedure.input(z9.object({
    scheduleId: z9.number(),
    enabled: z9.boolean()
  })).mutation(async ({ input }) => {
    return await updateSchedule(input);
  }),
  update: publicProcedure.input(z9.object({
    scheduleId: z9.number(),
    cronExpression: z9.string().optional(),
    enabled: z9.boolean().optional()
  })).mutation(async ({ input }) => {
    return await updateSchedule(input);
  }),
  delete: publicProcedure.input(z9.object({
    scheduleId: z9.number()
  })).mutation(async ({ input }) => {
    await deleteSchedule(input.scheduleId);
    return { success: true };
  }),
  getNextRuns: publicProcedure.input(z9.object({
    companyId: z9.number().optional().default(1),
    limit: z9.number().optional().default(10)
  })).query(async ({ input }) => {
    return await getNextScheduledRuns(input.companyId, input.limit);
  })
});

// server/skill-router.ts
import { z as z10 } from "zod";

// server/paperclip-services/skill-service.ts
init_db();
init_paperclip_schema();
import { eq as eq17, and as and17, like, sql as sql11 } from "drizzle-orm";
async function createSkill(options) {
  const {
    companyId,
    name,
    description,
    category,
    code,
    parameters,
    version = "1.0.0",
    isPublic = false,
    createdByUserId
  } = options;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(skills).values({
    companyId,
    name,
    description,
    category,
    code,
    parameters,
    version,
    isPublic: isPublic ? 1 : 0,
    usageCount: 0,
    createdByUserId,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  });
  const skillId = result.insertId || result.id;
  const [skill] = await db.select().from(skills).where(eq17(skills.id, skillId)).limit(1);
  return skill;
}
async function listSkills(options) {
  const { companyId, category, search, limit = 50, offset = 0 } = options;
  const conditions = [eq17(skills.companyId, companyId)];
  if (category) {
    conditions.push(eq17(skills.category, category));
  }
  if (search) {
    conditions.push(like(skills.name, `%${search}%`));
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(skills).where(and17(...conditions)).limit(limit).offset(offset);
  return results;
}
async function getSkill(skillId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [skill] = await db.select().from(skills).where(eq17(skills.id, skillId)).limit(1);
  return skill;
}
async function updateSkill(options) {
  const { skillId, ...updates } = options;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(skills).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq17(skills.id, skillId));
  const [skill] = await db.select().from(skills).where(eq17(skills.id, skillId)).limit(1);
  return skill;
}
async function deleteSkill(skillId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(agentSkills).where(eq17(agentSkills.skillId, skillId));
  await db.delete(skills).where(eq17(skills.id, skillId));
}
async function enableSkillForAgent(options) {
  const { agentId, skillId, config } = options;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(agentSkills).values({
    agentId,
    skillId,
    enabled: 1,
    config,
    createdAt: /* @__PURE__ */ new Date()
  });
  const agentSkillId = result.insertId || result.id;
  await db.execute(sql11`UPDATE pc_skills SET usageCount = usageCount + 1 WHERE id = ${skillId}`);
  const [agentSkill] = await db.select().from(agentSkills).where(eq17(agentSkills.id, agentSkillId)).limit(1);
  return agentSkill;
}
async function disableSkillForAgent(agentId, skillId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(agentSkills).set({ enabled: 0 }).where(and17(
    eq17(agentSkills.agentId, agentId),
    eq17(agentSkills.skillId, skillId)
  ));
}
async function listAgentSkills(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select({
    id: agentSkills.id,
    skillId: agentSkills.skillId,
    enabled: agentSkills.enabled,
    config: agentSkills.config,
    skillName: skills.name,
    skillDescription: skills.description,
    skillCategory: skills.category,
    skillVersion: skills.version
  }).from(agentSkills).leftJoin(skills, eq17(agentSkills.skillId, skills.id)).where(eq17(agentSkills.agentId, agentId));
  return results;
}
async function getSkillCategories(companyId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.selectDistinct({ category: skills.category }).from(skills).where(eq17(skills.companyId, companyId));
  return results.map((r) => r.category).filter(Boolean);
}

// server/skill-router.ts
var skillRouter = router({
  list: publicProcedure.input(z10.object({
    companyId: z10.number().optional().default(1),
    category: z10.string().optional(),
    search: z10.string().optional(),
    limit: z10.number().optional().default(50),
    offset: z10.number().optional().default(0)
  })).query(async ({ input }) => {
    return await listSkills(input);
  }),
  get: publicProcedure.input(z10.object({
    skillId: z10.number()
  })).query(async ({ input }) => {
    return await getSkill(input.skillId);
  }),
  create: publicProcedure.input(z10.object({
    companyId: z10.number().optional().default(1),
    name: z10.string(),
    description: z10.string().optional(),
    category: z10.string().optional(),
    code: z10.string(),
    parameters: z10.any().optional(),
    version: z10.string().optional(),
    isPublic: z10.boolean().optional()
  })).mutation(async ({ input }) => {
    return await createSkill(input);
  }),
  update: publicProcedure.input(z10.object({
    skillId: z10.number(),
    name: z10.string().optional(),
    description: z10.string().optional(),
    category: z10.string().optional(),
    code: z10.string().optional(),
    parameters: z10.any().optional(),
    version: z10.string().optional()
  })).mutation(async ({ input }) => {
    return await updateSkill(input);
  }),
  delete: publicProcedure.input(z10.object({
    skillId: z10.number()
  })).mutation(async ({ input }) => {
    await deleteSkill(input.skillId);
    return { success: true };
  }),
  categories: publicProcedure.input(z10.object({
    companyId: z10.number().optional().default(1)
  })).query(async ({ input }) => {
    return await getSkillCategories(input.companyId);
  }),
  enableForAgent: publicProcedure.input(z10.object({
    agentId: z10.number(),
    skillId: z10.number(),
    config: z10.any().optional()
  })).mutation(async ({ input }) => {
    return await enableSkillForAgent(input);
  }),
  disableForAgent: publicProcedure.input(z10.object({
    agentId: z10.number(),
    skillId: z10.number()
  })).mutation(async ({ input }) => {
    await disableSkillForAgent(input.agentId, input.skillId);
    return { success: true };
  }),
  listAgentSkills: publicProcedure.input(z10.object({
    agentId: z10.number()
  })).query(async ({ input }) => {
    return await listAgentSkills(input.agentId);
  })
});

// server/runner-router.ts
import { z as z11 } from "zod";

// server/paperclip-services/runner-service.ts
init_db();
init_paperclip_schema();
import { eq as eq18, and as and18, asc as asc4 } from "drizzle-orm";
async function createRunner(options) {
  const { companyId, name, type, config, capacity = 1 } = options;
  const db = await getDb();
  const [runner] = await db.insert(runners).values({
    companyId,
    name,
    type,
    status: "offline",
    config,
    capacity,
    currentLoad: 0,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  }).returning();
  return runner;
}
async function listRunners(companyId) {
  const db = await getDb();
  const results = await db.select().from(runners).where(eq18(runners.companyId, companyId));
  return results;
}
async function getRunner(runnerId) {
  const db = await getDb();
  const [runner] = await db.select().from(runners).where(eq18(runners.id, runnerId)).limit(1);
  return runner;
}
async function updateRunner(options) {
  const { runnerId, ...updates } = options;
  const db = await getDb();
  const [runner] = await db.update(runners).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq18(runners.id, runnerId)).returning();
  return runner;
}
async function deleteRunner(runnerId) {
  const db = await getDb();
  await db.delete(runners).where(eq18(runners.id, runnerId));
}
async function updateRunnerHeartbeat(runnerId) {
  const db = await getDb();
  await db.update(runners).set({
    lastHeartbeat: /* @__PURE__ */ new Date(),
    status: "online",
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq18(runners.id, runnerId));
}

// server/runner-router.ts
var runnerRouter = router({
  list: publicProcedure.input(z11.object({
    companyId: z11.number().optional().default(1)
  })).query(async ({ input }) => {
    return await listRunners(input.companyId);
  }),
  get: publicProcedure.input(z11.object({
    runnerId: z11.number()
  })).query(async ({ input }) => {
    return await getRunner(input.runnerId);
  }),
  create: publicProcedure.input(z11.object({
    companyId: z11.number().optional().default(1),
    name: z11.string(),
    type: z11.enum(["local", "docker", "kubernetes", "lambda"]),
    config: z11.any().optional(),
    capacity: z11.number().optional().default(1)
  })).mutation(async ({ input }) => {
    return await createRunner(input);
  }),
  update: publicProcedure.input(z11.object({
    runnerId: z11.number(),
    name: z11.string().optional(),
    status: z11.enum(["online", "offline", "busy", "error"]).optional(),
    config: z11.any().optional(),
    capacity: z11.number().optional(),
    currentLoad: z11.number().optional()
  })).mutation(async ({ input }) => {
    return await updateRunner(input);
  }),
  delete: publicProcedure.input(z11.object({
    runnerId: z11.number()
  })).mutation(async ({ input }) => {
    await deleteRunner(input.runnerId);
    return { success: true };
  }),
  heartbeat: publicProcedure.input(z11.object({
    runnerId: z11.number()
  })).mutation(async ({ input }) => {
    await updateRunnerHeartbeat(input.runnerId);
    return { success: true };
  })
});

// server/execution-log-router.ts
import { z as z12 } from "zod";

// server/paperclip-services/execution-log-service.ts
init_db();
init_paperclip_schema();
import { eq as eq19, and as and19, desc as desc15 } from "drizzle-orm";
async function createExecutionLog(options) {
  const { scheduleId, agentId, runnerId, status } = options;
  const db = await getDb();
  const [log] = await db.insert(scheduleExecutionLogs).values({
    scheduleId,
    agentId,
    runnerId,
    status,
    startedAt: /* @__PURE__ */ new Date(),
    retryCount: 0,
    createdAt: /* @__PURE__ */ new Date()
  }).returning();
  return log;
}
async function updateExecutionLog(options) {
  const { logId, ...updates } = options;
  const db = await getDb();
  const [log] = await db.update(scheduleExecutionLogs).set(updates).where(eq19(scheduleExecutionLogs.id, logId)).returning();
  return log;
}
async function listExecutionLogs(options) {
  const { scheduleId, agentId, status, limit = 50, offset = 0 } = options;
  const db = await getDb();
  const conditions = [];
  if (scheduleId) {
    conditions.push(eq19(scheduleExecutionLogs.scheduleId, scheduleId));
  }
  if (agentId) {
    conditions.push(eq19(scheduleExecutionLogs.agentId, agentId));
  }
  if (status) {
    conditions.push(eq19(scheduleExecutionLogs.status, status));
  }
  const query = db.select().from(scheduleExecutionLogs).orderBy(desc15(scheduleExecutionLogs.startedAt)).limit(limit).offset(offset);
  if (conditions.length > 0) {
    return await query.where(and19(...conditions));
  }
  return await query;
}
async function getExecutionLog(logId) {
  const db = await getDb();
  const [log] = await db.select().from(scheduleExecutionLogs).where(eq19(scheduleExecutionLogs.id, logId)).limit(1);
  return log;
}
async function getExecutionStats(scheduleId) {
  const db = await getDb();
  const logs = await db.select().from(scheduleExecutionLogs).where(eq19(scheduleExecutionLogs.scheduleId, scheduleId));
  const total = logs.length;
  const success = logs.filter((l) => l.status === "success").length;
  const failed = logs.filter((l) => l.status === "failed").length;
  const timeout = logs.filter((l) => l.status === "timeout").length;
  const avgDuration = logs.filter((l) => l.duration).reduce((sum2, l) => sum2 + (l.duration || 0), 0) / (logs.filter((l) => l.duration).length || 1);
  return {
    total,
    success,
    failed,
    timeout,
    successRate: total > 0 ? success / total * 100 : 0,
    avgDuration: Math.round(avgDuration)
  };
}

// server/execution-log-router.ts
var executionLogRouter = router({
  list: publicProcedure.input(z12.object({
    scheduleId: z12.number().optional(),
    agentId: z12.number().optional(),
    status: z12.string().optional(),
    limit: z12.number().optional().default(50),
    offset: z12.number().optional().default(0)
  })).query(async ({ input }) => {
    return await listExecutionLogs(input);
  }),
  get: publicProcedure.input(z12.object({
    logId: z12.number()
  })).query(async ({ input }) => {
    return await getExecutionLog(input.logId);
  }),
  stats: publicProcedure.input(z12.object({
    scheduleId: z12.number()
  })).query(async ({ input }) => {
    return await getExecutionStats(input.scheduleId);
  }),
  create: publicProcedure.input(z12.object({
    scheduleId: z12.number(),
    agentId: z12.number(),
    runnerId: z12.number().optional(),
    status: z12.enum(["pending", "running", "success", "failed", "timeout"])
  })).mutation(async ({ input }) => {
    return await createExecutionLog(input);
  }),
  update: publicProcedure.input(z12.object({
    logId: z12.number(),
    status: z12.enum(["pending", "running", "success", "failed", "timeout"]).optional(),
    finishedAt: z12.date().optional(),
    duration: z12.number().optional(),
    output: z12.string().optional(),
    errorMessage: z12.string().optional(),
    retryCount: z12.number().optional()
  })).mutation(async ({ input }) => {
    return await updateExecutionLog(input);
  })
});

// server/paperclip-router.ts
var agentRouter = router({
  // 创建 Agent
  createAgent: publicProcedure.input(createAgentSchema).mutation(async ({ ctx, input }) => {
    if (input.companyId === 1) {
      try {
        await agentService.getAgentById(1);
      } catch {
      }
    }
    return await agentService.createAgent({
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
      createdByUserId: ctx.user?.id
    });
  }),
  // 获取 Agent
  getAgent: publicProcedure.input(z13.object({ agentId: z13.number().int().positive() })).query(async ({ input }) => {
    const agent = await agentService.getAgentById(input.agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }
    return agent;
  }),
  // 列出 Agent
  listAgents: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      status: z13.enum(["active", "paused", "idle", "running", "error", "terminated"]).optional(),
      limit: z13.number().int().min(1).max(100).default(50),
      offset: z13.number().int().min(0).default(0)
    })
  ).query(async ({ input }) => {
    return await agentService.listAgents({
      companyId: input.companyId,
      status: input.status,
      limit: input.limit,
      offset: input.offset
    });
  }),
  // 更新 Agent
  updateAgent: publicProcedure.input(updateAgentSchema).mutation(async ({ ctx, input }) => {
    return await agentService.updateAgent({
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
      updatedByUserId: ctx.user?.id
    });
  }),
  // Agent 状态转换
  transitionStatus: publicProcedure.input(
    z13.object({
      agentId: z13.number().int().positive(),
      newStatus: z13.enum(["active", "paused", "idle", "running", "error", "terminated"]),
      reason: z13.string().optional()
    })
  ).mutation(async ({ input, ctx }) => {
    return await agentService.transitionAgentStatus({
      agentId: input.agentId,
      newStatus: input.newStatus,
      reason: input.reason,
      actorType: ctx.user ? "user" : "system",
      actorId: ctx.user?.id?.toString() || "system",
      companyId: ctx.user?.id || 0
      // TODO: 从公司上下文获取
    });
  }),
  // 创建 API Key
  createApiKey: publicProcedure.input(
    z13.object({
      agentId: z13.number().int().positive(),
      name: z13.string().min(1).max(255)
    })
  ).mutation(async ({ input }) => {
    return await agentService.createApiKey(input.agentId, input.name);
  }),
  // 获取 API Keys
  getApiKeys: publicProcedure.input(z13.object({ agentId: z13.number().int().positive() })).query(async ({ input }) => {
    return await agentService.getAgentApiKeys(input.agentId);
  }),
  // 撤销 API Key
  revokeApiKey: publicProcedure.input(z13.object({ apiKeyId: z13.number().int().positive() })).mutation(async ({ input }) => {
    await agentService.revokeApiKey(input.apiKeyId);
    return { success: true };
  })
});
var createTaskInputSchema = createIssueSchema.extend({
  createdByAgentId: z13.number().int().positive().optional()
});
var taskRouter = router({
  // 创建任务
  createTask: publicProcedure.input(createTaskInputSchema).mutation(async ({ ctx, input }) => {
    return await taskService.createIssue({
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
      billingCode: input.billingCode
    });
  }),
  // 获取任务
  getTask: publicProcedure.input(z13.object({ issueId: z13.number().int().positive() })).query(async ({ input }) => {
    const issue = await taskService.getIssueById(input.issueId);
    if (!issue) {
      throw new Error("Task not found");
    }
    return issue;
  }),
  // 列出任务
  listTasks: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      status: z13.enum(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]).optional(),
      assigneeAgentId: z13.number().int().positive().optional(),
      priority: z13.enum(["critical", "high", "medium", "low"]).optional(),
      limit: z13.number().int().min(1).max(100).default(50),
      offset: z13.number().int().min(0).default(0)
    })
  ).query(async ({ input }) => {
    return await taskService.listIssues({
      companyId: input.companyId,
      status: input.status,
      assigneeAgentId: input.assigneeAgentId,
      priority: input.priority,
      limit: input.limit,
      offset: input.offset
    });
  }),
  // 原子任务检出（核心功能）
  checkoutTask: publicProcedure.input(checkoutTaskSchema).mutation(async ({ input }) => {
    return await taskService.checkoutTask({
      issueId: input.issueId,
      agentId: input.agentId,
      expectedStatuses: input.expectedStatuses
    });
  }),
  // 释放任务
  releaseTask: publicProcedure.input(
    z13.object({
      issueId: z13.number().int().positive(),
      agentId: z13.number().int().positive()
    })
  ).mutation(async ({ input }) => {
    return await taskService.releaseTask(
      input.issueId,
      input.agentId,
      0
      // TODO: companyId
    );
  }),
  // 添加评论
  addComment: publicProcedure.input(
    z13.object({
      issueId: z13.number().int().positive(),
      body: z13.string().min(1)
    })
  ).mutation(async ({ input, ctx }) => {
    return await taskService.addComment({
      issueId: input.issueId,
      companyId: 0,
      // TODO: companyId
      body: input.body,
      authorUserId: ctx.user?.id
    });
  }),
  // 获取评论
  getComments: publicProcedure.input(z13.object({ issueId: z13.number().int().positive() })).query(async ({ input }) => {
    return await taskService.getIssueComments(input.issueId);
  })
});
var auditRouter = router({
  // 查询活动日志
  queryLogs: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      actorType: z13.enum(["agent", "user", "system"]).optional(),
      entityType: z13.string().optional(),
      entityId: z13.string().optional(),
      limit: z13.number().int().min(1).max(200).default(50),
      offset: z13.number().int().min(0).default(0)
    })
  ).query(async ({ input }) => {
    return await auditService.queryActivityLogs({
      companyId: input.companyId,
      actorType: input.actorType,
      entityType: input.entityType,
      entityId: input.entityId,
      limit: input.limit,
      offset: input.offset
    });
  }),
  // 获取实体活动历史
  getEntityActivity: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      entityType: z13.string(),
      entityId: z13.string(),
      limit: z13.number().int().min(1).max(100).default(20)
    })
  ).query(async ({ input }) => {
    return await auditService.getEntityActivity(
      input.companyId,
      input.entityType,
      input.entityId,
      input.limit
    );
  }),
  // 获取统计信息
  getStats: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      since: z13.string().datetime().optional()
    })
  ).query(async ({ input }) => {
    return await auditService.getActivityStats(
      input.companyId,
      input.since ? new Date(input.since) : void 0
    );
  })
});
var costRouter = router({
  // 报告成本事件
  reportCost: publicProcedure.input(reportCostEventSchema).mutation(async ({ ctx, input }) => {
    return await costService.reportCostEvent({
      companyId: 0,
      // TODO: companyId
      agentId: input.agentId,
      issueId: input.issueId,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costCents: input.costCents,
      reportedByUserId: ctx.user?.id
    });
  }),
  // 获取预算状态
  getBudgetStatus: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      agentId: z13.number().int().positive().optional()
    })
  ).query(async ({ input }) => {
    return await costService.getBudgetStatus({
      companyId: input.companyId,
      agentId: input.agentId
    });
  }),
  // 获取成本列表
  getCostEvents: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      agentId: z13.number().int().positive().optional(),
      limit: z13.number().int().min(1).max(200).default(100),
      offset: z13.number().int().min(0).default(0)
    })
  ).query(async ({ input }) => {
    return await costService.getCostEvents(
      input.companyId,
      input.agentId,
      input.limit,
      input.offset
    );
  }),
  // 按 Agent 统计成本
  getCostsByAgent: publicProcedure.input(
    z13.object({
      companyId: z13.number().int().positive(),
      startDate: z13.string().datetime(),
      endDate: z13.string().datetime()
    })
  ).query(async ({ input }) => {
    return await costService.getCostsByAgent(
      input.companyId,
      new Date(input.startDate),
      new Date(input.endDate)
    );
  })
});
var listApprovalsSchema = z13.object({
  companyId: z13.number().int().positive(),
  status: approvalStatusSchema.optional()
});
var getApprovalSchema = z13.object({
  approvalId: z13.number().int().positive()
});
var approvalCommentSchema = z13.object({
  approvalId: z13.number().int().positive(),
  body: z13.string().min(1)
});
var approvalRouter = router({
  create: publicProcedure.input(createApprovalSchema).mutation(async ({ input }) => {
    return await approvalService.createApproval({
      companyId: input.companyId,
      type: input.type,
      requestedByAgentId: input.requestedByAgentId,
      requestedByUserId: input.requestedByUserId,
      payload: input.payload
    });
  }),
  list: publicProcedure.input(listApprovalsSchema).query(async ({ input }) => {
    return await approvalService.listApprovals({
      companyId: input.companyId,
      status: input.status
    });
  }),
  get: publicProcedure.input(getApprovalSchema).query(async ({ input }) => {
    const approval = await approvalService.getApprovalById(input.approvalId);
    if (!approval) {
      throw new Error("Approval not found");
    }
    return approval;
  }),
  decide: publicProcedure.input(decideApprovalSchema).mutation(async ({ ctx, input }) => {
    return await approvalService.decideApproval({
      approvalId: input.approvalId,
      decision: input.decision,
      decisionNote: input.decisionNote,
      decidedByUserId: ctx.user?.id ?? void 0
    });
  }),
  comments: router({
    list: publicProcedure.input(getApprovalSchema).query(async ({ input }) => {
      return await approvalService.listApprovalComments(input.approvalId);
    }),
    add: publicProcedure.input(approvalCommentSchema).mutation(async ({ ctx, input }) => {
      return await approvalService.addApprovalComment({
        approvalId: input.approvalId,
        body: input.body,
        authorUserId: ctx.user?.id ?? void 0
      });
    })
  })
});
var dashboardRouter = router({
  getSummary: publicProcedure.input(z13.object({ companyId: z13.number().int().positive() })).query(async ({ input }) => {
    return await dashboardService.getDashboardSummary(input.companyId);
  })
});
var projectRouter = router({
  create: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    name: z13.string().min(1),
    description: z13.string().optional()
  })).mutation(async ({ ctx, input }) => {
    return await projectService.createProject({
      ...input,
      createdByUserId: ctx.user?.id
    });
  }),
  get: publicProcedure.input(z13.object({ projectId: z13.number().int().positive() })).query(async ({ input }) => {
    return await projectService.getProjectById(input.projectId);
  }),
  list: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    status: z13.enum(["active", "paused", "archived"]).optional(),
    limit: z13.number().int().min(1).max(100).default(50),
    offset: z13.number().int().min(0).default(0)
  })).query(async ({ input }) => {
    return await projectService.listProjects(input);
  }),
  update: publicProcedure.input(z13.object({
    projectId: z13.number().int().positive(),
    name: z13.string().min(1).optional(),
    description: z13.string().optional(),
    status: z13.enum(["active", "paused", "archived"]).optional()
  })).mutation(async ({ ctx, input }) => {
    return await projectService.updateProject({
      ...input,
      updatedByUserId: ctx.user?.id
    });
  }),
  delete: publicProcedure.input(z13.object({
    projectId: z13.number().int().positive(),
    companyId: z13.number().int().positive()
  })).mutation(async ({ input }) => {
    await projectService.deleteProject(input.projectId, input.companyId);
    return { success: true };
  })
});
var goalRouter = router({
  create: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    title: z13.string().min(1),
    description: z13.string().optional(),
    level: z13.enum(["company", "team", "agent", "task"]),
    parentId: z13.number().int().positive().optional(),
    ownerAgentId: z13.number().int().positive().optional()
  })).mutation(async ({ ctx, input }) => {
    return await goalService.createGoal({
      ...input,
      createdByUserId: ctx.user?.id
    });
  }),
  get: publicProcedure.input(z13.object({ goalId: z13.number().int().positive() })).query(async ({ input }) => {
    return await goalService.getGoalById(input.goalId);
  }),
  list: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    level: z13.enum(["company", "team", "agent", "task"]).optional(),
    status: z13.enum(["planned", "active", "achieved", "cancelled"]).optional(),
    parentId: z13.number().int().positive().optional().nullable(),
    limit: z13.number().int().min(1).max(100).default(50),
    offset: z13.number().int().min(0).default(0)
  })).query(async ({ input }) => {
    return await goalService.listGoals(input);
  }),
  update: publicProcedure.input(z13.object({
    goalId: z13.number().int().positive(),
    title: z13.string().min(1).optional(),
    description: z13.string().optional(),
    status: z13.enum(["planned", "active", "achieved", "cancelled"]).optional(),
    ownerAgentId: z13.number().int().positive().optional()
  })).mutation(async ({ input }) => {
    return await goalService.updateGoal(input);
  }),
  getTree: publicProcedure.input(z13.object({ companyId: z13.number().int().positive() })).query(async ({ input }) => {
    return await goalService.getGoalTree(input.companyId);
  })
});
var heartbeatRouter = router({
  start: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    agentId: z13.number().int().positive(),
    invocationSource: z13.enum(["scheduler", "manual", "callback"]),
    contextSnapshot: z13.record(z13.unknown()).optional()
  })).mutation(async ({ input }) => {
    return await heartbeatService.startHeartbeatRun(input);
  }),
  finish: publicProcedure.input(z13.object({
    runId: z13.number().int().positive(),
    status: z13.enum(["succeeded", "failed", "cancelled", "timed_out"]),
    error: z13.string().optional(),
    contextSnapshot: z13.record(z13.unknown()).optional()
  })).mutation(async ({ input }) => {
    return await heartbeatService.finishHeartbeatRun(input);
  }),
  listRuns: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    agentId: z13.number().int().positive().optional(),
    status: z13.string().optional(),
    limit: z13.number().int().min(1).max(100).default(50),
    offset: z13.number().int().min(0).default(0)
  })).query(async ({ input }) => {
    return await heartbeatService.listHeartbeatRuns(input);
  }),
  createWakeup: publicProcedure.input(z13.object({
    agentId: z13.number().int().positive(),
    companyId: z13.number().int().positive(),
    reason: z13.string().min(1)
  })).mutation(async ({ ctx, input }) => {
    return await heartbeatService.createWakeupRequest({
      ...input,
      triggeredByUserId: ctx.user?.id
    });
  })
});
var secretsRouter = router({
  upsert: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    key: z13.string().min(1),
    value: z13.string().min(1),
    description: z13.string().optional()
  })).mutation(async ({ ctx, input }) => {
    await secretsService.upsertSecret({
      ...input,
      createdByUserId: ctx.user?.id
    });
    return { success: true };
  }),
  get: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    key: z13.string().min(1)
  })).query(async ({ input }) => {
    const value = await secretsService.getSecret(input.companyId, input.key);
    return { value };
  }),
  list: publicProcedure.input(z13.object({ companyId: z13.number().int().positive() })).query(async ({ input }) => {
    return await secretsService.listSecrets(input.companyId);
  }),
  delete: publicProcedure.input(z13.object({
    companyId: z13.number().int().positive(),
    key: z13.string().min(1)
  })).mutation(async ({ input }) => {
    await secretsService.deleteSecret(input.companyId, input.key);
    return { success: true };
  })
});
var paperclipRouter = router({
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
  executionLogs: executionLogRouter
});

// server/ai-router.ts
import { z as z14 } from "zod";

// server/ai/task-store.ts
import crypto3 from "node:crypto";
var tasks = /* @__PURE__ */ new Map();
function createTask(input) {
  const id = crypto3.randomUUID();
  const now = /* @__PURE__ */ new Date();
  const record = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    input,
    logs: []
  };
  tasks.set(id, record);
  return record;
}
function getTask(id) {
  return tasks.get(id);
}
function listTasks() {
  return Array.from(tasks.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}
function appendLog(id, message) {
  const task = tasks.get(id);
  if (!task) return;
  task.logs.push({ ts: Date.now(), message });
  task.updatedAt = /* @__PURE__ */ new Date();
}
function updateTask(id, patch) {
  const task = tasks.get(id);
  if (!task) return;
  Object.assign(task, patch);
  task.updatedAt = /* @__PURE__ */ new Date();
  if (patch.status) {
    appendLog(id, `Task status \u2192 ${patch.status}`);
  }
}
function markCancelled(id) {
  const task = tasks.get(id);
  if (!task) return;
  task.cancelled = true;
  task.status = "cancelled";
  task.updatedAt = /* @__PURE__ */ new Date();
  appendLog(id, "Task cancelled by user");
}

// server/ai/openclaw-agent.ts
async function loadOpenClawAgent() {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier);"
  );
  try {
    const mod = await dynamicImport("@openclaw/core");
    const providers = await dynamicImport("@openclaw/provider").catch(() => null);
    const browser = await dynamicImport("@openclaw/browser").catch(() => null);
    const providerInstance = providers ? new providers.OllamaProvider({
      model: OPENCLAW_MODEL,
      baseUrl: OPENCLAW_ENDPOINT
    }) : null;
    const agent = new mod.Agent({
      name: "Quant Orchestrator",
      provider: providerInstance ?? void 0,
      browser: browser?.BrowserProvider ? new browser.BrowserProvider() : void 0
    });
    return agent;
  } catch {
    return null;
  }
}
var OpenClawHarness = class {
  agent = null;
  initialized = false;
  async ensureAgent() {
    if (this.initialized) return;
    this.agent = await loadOpenClawAgent();
    this.initialized = true;
  }
  async runPlanningStep(taskId, prompt) {
    await this.ensureAgent();
    if (!this.agent) {
      appendLog(taskId, "[OpenClaw] package not available, using fallback reasoning");
      return `Fallback reasoning plan for task ${taskId}:
${prompt}`;
    }
    const response = await this.agent.run({
      input: prompt,
      sessionId: `task_${taskId}`
    });
    return response.output;
  }
};

// server/ai/workflows/strategy-lifecycle.ts
var toolEngine = new QmtToolEngine();
var harness = new OpenClawHarness();
function generateStrategyCode(task, contextPlan) {
  const symbols = task.input.symbols?.length ? task.input.symbols.join(", ") : "\u6CAA\u6DF1300 \u6210\u5206\u80A1";
  const objective = task.input.objective ?? {};
  return `# Auto-generated strategy for ${task.input.title}
# Context plan:
# ${contextPlan.replace(/\n/g, "\n# ")}

from typing import Any

symbols = [${symbols.split(",").map((code) => `"${code.trim()}"`).join(", ")}]

def init(context):
    context.symbols = symbols
    context.max_drawdown = ${objective.maxDrawdown ?? 0.12}

def handlebar(context, data_dict):
    for symbol in context.symbols:
        data = data_dict.get(symbol)
        if not data:
            continue
        ma_short = data['close'][-10:].mean()
        ma_long = data['close'][-30:].mean()
        position = context.get_position(symbol)
        if ma_short > ma_long and not position:
            context.order_target_percent(symbol, 0.05)
        elif ma_short < ma_long and position:
            context.order_target_percent(symbol, 0)

def on_order(context, order):
    pass
`;
}
async function runStrategyLifecycle(task) {
  appendLog(task.id, "\u89E3\u6790\u9700\u6C42\u5E76\u8C03\u7528 OpenClaw \u751F\u6210\u8BA1\u5212");
  updateTask(task.id, { status: "analyzing" });
  const plan = await harness.runPlanningStep(
    task.id,
    `\u9700\u6C42: ${task.input.description}
\u76EE\u6807: ${JSON.stringify(task.input.objective ?? {})}`
  );
  appendLog(task.id, "\u751F\u6210\u7B56\u7565\u4EE3\u7801");
  updateTask(task.id, { status: "generating" });
  const code = generateStrategyCode(task, plan);
  appendLog(task.id, "\u63D0\u4EA4 QMT \u56DE\u6D4B\u4EFB\u52A1");
  updateTask(task.id, { status: "backtesting" });
  const backtest = await toolEngine.submitBacktest({
    strategy_code: code,
    backtest_config: {
      start: task.input.backtestRange?.start ?? "20220101",
      end: task.input.backtestRange?.end ?? "20231231",
      benchmark: task.input.benchmark ?? "000300.SH"
    }
  });
  let status = "pending";
  while (status === "pending" || status === "running") {
    const poll = await toolEngine.getBacktestStatus({ task_id: backtest.task_id });
    status = poll.status;
    appendLog(task.id, `\u56DE\u6D4B\u72B6\u6001\uFF1A${status}${poll.progress ? ` (${poll.progress}%)` : ""}`);
    if (status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 2e3));
  }
  const report = await toolEngine.getBacktestReport({ task_id: backtest.task_id });
  appendLog(task.id, "\u56DE\u6D4B\u5B8C\u6210\uFF0C\u89E3\u6790\u6307\u6807");
  if (task.input.deployToSimulation) {
    appendLog(task.id, "\u90E8\u7F72\u81F3\u6A21\u62DF\u8D26\u6237");
    updateTask(task.id, { status: "deploying" });
    const deployment = await toolEngine.deployStrategy({
      strategy_code: code,
      metadata: {
        taskId: task.id,
        benchmark: task.input.benchmark
      }
    });
    appendLog(task.id, `\u90E8\u7F72\u5B8C\u6210\uFF0CID=${deployment.deployment_id}`);
  }
  updateTask(task.id, {
    status: "completed",
    result: {
      plan,
      backtest: report.report,
      generatedCode: code
    }
  });
}

// server/ai/task-runner.ts
var StrategyTaskRunner = class {
  queue = [];
  running = false;
  enqueue(taskId) {
    this.queue.push(taskId);
    void this.pump();
  }
  cancel(taskId) {
    markCancelled(taskId);
  }
  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const taskId = this.queue.shift();
        const record = getTask(taskId);
        if (!record || record.cancelled) continue;
        await this.execute(record);
      }
    } finally {
      this.running = false;
    }
  }
  async execute(task) {
    try {
      await runStrategyLifecycle(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(task.id, `\u4EFB\u52A1\u5931\u8D25\uFF1A${message}`);
      updateTask(task.id, { status: "failed", error: message });
    }
  }
};
var strategyTaskRunner = new StrategyTaskRunner();

// server/ai-workflow-service.ts
init_env();
var QMT_API_BASE_URL3 = process.env.QMT_API_BASE_URL ?? ENV.QMT_API_BASE_URL ?? "http://127.0.0.1:8082";
async function requestQmt2(path7, init) {
  const response = await fetch(`${QMT_API_BASE_URL3}${path7}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers ?? {}
    },
    ...init
  });
  const text3 = await response.text();
  if (!response.ok) {
    throw new Error(`[QMT workflow] ${response.status} ${response.statusText}: ${text3}`);
  }
  return text3 ? JSON.parse(text3) : {};
}
async function fetchWorkflows() {
  const result = await requestQmt2("/ai/workflows", {
    method: "GET"
  });
  return result.data ?? [];
}
async function triggerWorkflow(code, payload) {
  const result = await requestQmt2(
    `/ai/workflows/${encodeURIComponent(code)}/runs`,
    {
      method: "POST",
      body: JSON.stringify({ payload })
    }
  );
  return result.data;
}
async function fetchWorkflowRuns(params) {
  const query = new URLSearchParams();
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const result = await requestQmt2(
    `/ai/workflows/${encodeURIComponent(params.code)}/runs${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}
async function fetchWorkflowTasks(params) {
  const query = new URLSearchParams();
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const result = await requestQmt2(
    `/ai/workflow-runs/${params.runId}/tasks${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}
async function fetchWorkflowEvents(params) {
  const query = new URLSearchParams();
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const result = await requestQmt2(
    `/ai/workflow-runs/${params.runId}/events${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}

// server/ai-config-store.ts
import fs3 from "fs";
import path4 from "path";
var PROJECT_ROOT = process.cwd();
var AI_CONFIG_PATH = path4.resolve(PROJECT_ROOT, "config", "ai_config.json");
function readAiConfig() {
  if (!fs3.existsSync(AI_CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = fs3.readFileSync(AI_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("[ai-config] Failed to parse ai_config.json", error);
    return {};
  }
}
function writeAiConfig(config) {
  const dir = path4.dirname(AI_CONFIG_PATH);
  if (!fs3.existsSync(dir)) {
    fs3.mkdirSync(dir, { recursive: true });
  }
  fs3.writeFileSync(AI_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}
function ensureDefaults(settings) {
  return {
    scheduler: {
      interval_seconds: settings?.scheduler?.interval_seconds ?? 15,
      max_parallel_runs: settings?.scheduler?.max_parallel_runs ?? 4,
      max_tasks_per_run: settings?.scheduler?.max_tasks_per_run ?? 50,
      default_timeout_seconds: settings?.scheduler?.default_timeout_seconds ?? 180,
      default_budget_units: settings?.scheduler?.default_budget_units ?? 10,
      max_retry: settings?.scheduler?.max_retry ?? 3
    },
    skills: {
      roots: settings?.skills?.roots ?? ["ai-skills/builtin", "ai-skills/custom"],
      python_entrypoint: settings?.skills?.python_entrypoint ?? "python",
      node_entrypoint: settings?.skills?.node_entrypoint ?? "node",
      default_runtime: settings?.skills?.default_runtime ?? "python",
      hot_reload: settings?.skills?.hot_reload ?? true
    },
    adapters: {
      quant_local: {
        enabled: settings?.adapters?.quant_local?.enabled ?? true,
        python_entrypoint: settings?.adapters?.quant_local?.python_entrypoint ?? "python",
        max_concurrency: settings?.adapters?.quant_local?.max_concurrency ?? 4,
        services: {
          market_data: settings?.adapters?.quant_local?.services?.market_data ?? "services/market_data_api.py",
          trading: settings?.adapters?.quant_local?.services?.trading ?? "services/qmt_api_service.py",
          portfolio: settings?.adapters?.quant_local?.services?.portfolio ?? "core/portfolio.py"
        },
        endpoints: {
          market_api: settings?.adapters?.quant_local?.endpoints?.market_api ?? "http://127.0.0.1:8081",
          trading_api: settings?.adapters?.quant_local?.endpoints?.trading_api ?? "http://127.0.0.1:8082",
          monitor_api: settings?.adapters?.quant_local?.endpoints?.monitor_api ?? "http://127.0.0.1:8082"
        }
      }
    },
    events: {
      log_path: settings?.events?.log_path ?? "logs/live.log",
      watchdog_on_failure: settings?.events?.watchdog_on_failure ?? true
    }
  };
}
function loadAiWorkflowSettings() {
  const config = readAiConfig();
  const settings = config.ai_workflow;
  return ensureDefaults(settings);
}
function saveAiWorkflowSettings(settings) {
  const config = readAiConfig();
  config.ai_workflow = settings;
  writeAiConfig(config);
}

// server/ai-router.ts
var engine = new QmtToolEngine();
var taskInputSchema = z14.object({
  title: z14.string().min(1),
  description: z14.string().min(1),
  symbols: z14.array(z14.string()).optional(),
  benchmark: z14.string().optional(),
  objective: z14.object({
    annualReturn: z14.number().optional(),
    maxDrawdown: z14.number().optional(),
    sharpe: z14.number().optional()
  }).optional(),
  backtestRange: z14.object({
    start: z14.string().length(8),
    end: z14.string().length(8)
  }).optional(),
  deployToSimulation: z14.boolean().optional()
});
var schedulerSettingsSchema = z14.object({
  interval_seconds: z14.number().int().min(1).max(3600),
  max_parallel_runs: z14.number().int().min(1).max(64),
  max_tasks_per_run: z14.number().int().min(1).max(500),
  default_timeout_seconds: z14.number().int().min(30).max(3600),
  default_budget_units: z14.number().int().min(1).max(1e3),
  max_retry: z14.number().int().min(0).max(10)
});
var skillSettingsSchema = z14.object({
  roots: z14.array(z14.string().min(1)).min(1),
  python_entrypoint: z14.string().min(1),
  node_entrypoint: z14.string().min(1),
  default_runtime: z14.string().min(1),
  hot_reload: z14.boolean()
});
var quantLocalSettingsSchema = z14.object({
  enabled: z14.boolean(),
  python_entrypoint: z14.string().min(1),
  max_concurrency: z14.number().int().min(1).max(32),
  services: z14.object({
    market_data: z14.string().min(1),
    trading: z14.string().min(1),
    portfolio: z14.string().min(1)
  }),
  endpoints: z14.object({
    market_api: z14.string().min(1),
    trading_api: z14.string().min(1),
    monitor_api: z14.string().min(1)
  })
});
var eventsSettingsSchema = z14.object({
  log_path: z14.string().min(1),
  watchdog_on_failure: z14.boolean()
});
var workflowSettingsSchema = z14.object({
  scheduler: schedulerSettingsSchema,
  skills: skillSettingsSchema,
  adapters: z14.object({
    quant_local: quantLocalSettingsSchema
  }),
  events: eventsSettingsSchema
});
var aiRouter = router({
  createTask: publicProcedure.input(taskInputSchema).mutation(({ input }) => {
    const task = createTask(input);
    strategyTaskRunner.enqueue(task.id);
    return { taskId: task.id };
  }),
  getTask: publicProcedure.input(z14.object({ taskId: z14.string().uuid() })).query(({ input }) => {
    const task = getTask(input.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    return task;
  }),
  listTasks: publicProcedure.query(() => {
    return listTasks();
  }),
  cancelTask: publicProcedure.input(z14.object({ taskId: z14.string().uuid() })).mutation(({ input }) => {
    markCancelled(input.taskId);
    return { success: true };
  }),
  newsDigest: publicProcedure.input(
    z14.object({
      keywords: z14.array(z14.string()).optional()
    })
  ).query(async ({ input }) => {
    return await engine.fetchNewsDigest({ keywords: input.keywords });
  }),
  chatPick: publicProcedure.input(
    z14.object({
      question: z14.string().min(1),
      filters: z14.record(z14.string(), z14.unknown()).optional(),
      model: z14.string().optional(),
      personality: z14.string().optional(),
      provider: z14.enum(["deeprouter", "ollama"]).optional()
    })
  ).mutation(async ({ input }) => {
    return await chatPick(
      input.question,
      input.filters,
      input.model,
      input.personality,
      input.provider
    );
  }),
  workflowList: publicProcedure.query(async () => {
    return await fetchWorkflows();
  }),
  workflowRuns: publicProcedure.input(
    z14.object({
      code: z14.string().min(1),
      limit: z14.number().int().min(1).max(100).default(20)
    })
  ).query(async ({ input }) => {
    return await fetchWorkflowRuns({ code: input.code, limit: input.limit });
  }),
  triggerWorkflow: publicProcedure.input(
    z14.object({
      code: z14.string().min(1),
      payload: z14.record(z14.string(), z14.unknown()).optional()
    })
  ).mutation(async ({ input }) => {
    return await triggerWorkflow(input.code, input.payload);
  }),
  workflowTasks: publicProcedure.input(
    z14.object({
      runId: z14.number().int().positive(),
      status: z14.string().optional(),
      limit: z14.number().int().min(1).max(200).default(100)
    })
  ).query(async ({ input }) => {
    return await fetchWorkflowTasks({
      runId: input.runId,
      status: input.status,
      limit: input.limit
    });
  }),
  workflowEvents: publicProcedure.input(
    z14.object({
      runId: z14.number().int().positive(),
      limit: z14.number().int().min(1).max(500).default(200)
    })
  ).query(async ({ input }) => {
    return await fetchWorkflowEvents({ runId: input.runId, limit: input.limit });
  }),
  workflowSettings: publicProcedure.query(() => {
    return loadAiWorkflowSettings();
  }),
  saveWorkflowSettings: publicProcedure.input(workflowSettingsSchema).mutation(({ input }) => {
    saveAiWorkflowSettings(input);
    return { success: true };
  })
});

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  trading: tradingRouter,
  monitor: executionMonitorRouter,
  optimization: optimizationRouter,
  portfolio: portfolioRouter,
  parameterScan: parameterScanRouter,
  strategy: strategyRouter,
  // 策略代码管理路由（包含保存、提交等功能）
  paperclip: paperclipRouter,
  // Paperclip AI Agent 编排系统
  ai: aiRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  // ============ 回测管理 ============
  backtest: router({
    // 创建回测记录
    create: publicProcedure.input(
      z15.object({
        strategyId: z15.number(),
        name: z15.string(),
        description: z15.string().optional(),
        backtestStart: z15.string(),
        backtestEnd: z15.string(),
        tradingDays: z15.number(),
        initialCapital: z15.number(),
        finalAsset: z15.number(),
        totalReturn: z15.number(),
        annualReturn: z15.number(),
        totalPnl: z15.number(),
        maxDrawdown: z15.number(),
        maxDrawdownDays: z15.number(),
        volatility: z15.number(),
        sharpeRatio: z15.number(),
        sortinoRatio: z15.number(),
        calmarRatio: z15.number(),
        infoRatio: z15.number(),
        benchmarkReturn: z15.number(),
        alpha: z15.number(),
        beta: z15.number(),
        totalTrades: z15.number(),
        winTrades: z15.number(),
        lossTrades: z15.number(),
        winRate: z15.number(),
        profitLossRatio: z15.number(),
        var95: z15.number(),
        cvar95: z15.number()
      })
    ).mutation(async ({ ctx, input }) => {
      const result = await createBacktestRecord({
        userId: ctx.user?.id ?? 0,
        strategyId: input.strategyId,
        name: input.name,
        description: input.description,
        backtestStart: input.backtestStart,
        backtestEnd: input.backtestEnd,
        tradingDays: input.tradingDays,
        initialCapital: input.initialCapital.toString(),
        finalAsset: input.finalAsset.toString(),
        totalReturn: input.totalReturn.toString(),
        annualReturn: input.annualReturn.toString(),
        totalPnl: input.totalPnl.toString(),
        maxDrawdown: input.maxDrawdown.toString(),
        maxDrawdownDays: input.maxDrawdownDays,
        volatility: input.volatility.toString(),
        sharpeRatio: input.sharpeRatio.toString(),
        sortinoRatio: input.sortinoRatio.toString(),
        calmarRatio: input.calmarRatio.toString(),
        infoRatio: input.infoRatio.toString(),
        benchmarkReturn: input.benchmarkReturn.toString(),
        alpha: input.alpha.toString(),
        beta: input.beta.toString(),
        totalTrades: input.totalTrades,
        winTrades: input.winTrades,
        lossTrades: input.lossTrades,
        winRate: input.winRate.toString(),
        profitLossRatio: input.profitLossRatio.toString(),
        var95: input.var95.toString(),
        cvar95: input.cvar95.toString(),
        status: "completed"
      });
      return { success: true };
    }),
    // 获取回测历史列表
    list: publicProcedure.input(
      z15.object({
        limit: z15.number().default(50),
        offset: z15.number().default(0)
      })
    ).query(async ({ ctx, input }) => {
      return await getBacktestRecordsByUserId(ctx.user?.id ?? 0, input.limit, input.offset);
    }),
    // 获取回测详情
    get: publicProcedure.input(z15.object({ id: z15.number() })).query(async ({ input }) => {
      return await getBacktestRecordById(input.id);
    }),
    // 获取策略的回测历史
    listByStrategy: publicProcedure.input(z15.object({ strategyId: z15.number() })).query(async ({ input }) => {
      return await getBacktestRecordsByStrategyId(input.strategyId);
    }),
    // 对比多次回测
    compare: publicProcedure.input(z15.object({ recordIds: z15.array(z15.number()) })).query(async ({ input }) => {
      return await compareBacktestRecords(input.recordIds);
    }),
    // 获取多条回测记录详情（用于对比分析）
    getMultiple: publicProcedure.input(z15.object({ recordIds: z15.array(z15.number()) })).query(async ({ input }) => {
      return await getMultipleBacktestRecords(input.recordIds);
    }),
    // 获取用户回测统计
    statistics: publicProcedure.query(async ({ ctx }) => {
      return await getBacktestStatistics(ctx.user?.id ?? 0);
    })
  }),
  // ============ 净值曲线 ============
  equity: router({
    // 保存净值曲线
    save: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number(),
        curves: z15.array(
          z15.object({
            date: z15.string(),
            nav: z15.number(),
            benchmark: z15.number(),
            asset: z15.number(),
            cash: z15.number()
          })
        )
      })
    ).mutation(async ({ ctx, input }) => {
      const data = input.curves.map((c) => ({
        backtestRecordId: input.backtestRecordId,
        date: c.date,
        nav: c.nav.toString(),
        benchmark: c.benchmark.toString(),
        asset: c.asset.toString(),
        cash: c.cash.toString()
      }));
      await createEquityCurves(data);
      return { success: true };
    }),
    // 获取净值曲线
    get: publicProcedure.input(z15.object({ backtestRecordId: z15.number() })).query(async ({ input }) => {
      return await getEquityCurvesByBacktestId(input.backtestRecordId);
    })
  }),
  // ============ 交易明细 ============
  trades: router({
    // 保存交易明细
    save: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number(),
        trades: z15.array(
          z15.object({
            tradeDate: z15.string(),
            tradeTime: z15.string(),
            symbol: z15.string(),
            direction: z15.enum(["BUY", "SELL"]),
            volume: z15.number(),
            price: z15.number(),
            amount: z15.number(),
            commission: z15.number(),
            stampDuty: z15.number(),
            slippage: z15.number()
          })
        )
      })
    ).mutation(async ({ ctx, input }) => {
      const data = input.trades.map((t2) => ({
        backtestRecordId: input.backtestRecordId,
        tradeDate: t2.tradeDate,
        tradeTime: t2.tradeTime,
        symbol: t2.symbol,
        direction: t2.direction,
        volume: t2.volume,
        price: t2.price.toString(),
        amount: t2.amount.toString(),
        commission: t2.commission.toString(),
        stampDuty: t2.stampDuty.toString(),
        slippage: t2.slippage.toString()
      }));
      await createTrades(data);
      return { success: true };
    }),
    // 获取交易明细
    get: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number(),
        limit: z15.number().default(100),
        offset: z15.number().default(0)
      })
    ).query(async ({ input }) => {
      return await getTradesByBacktestId(input.backtestRecordId, input.limit, input.offset);
    }),
    // 按标的查询交易
    getBySymbol: publicProcedure.input(z15.object({ backtestRecordId: z15.number(), symbol: z15.string() })).query(async ({ input }) => {
      return await getTradesBySymbol(input.backtestRecordId, input.symbol);
    })
  }),
  // ============ 持仓快照 ============
  positions: router({
    // 保存持仓快照
    save: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number(),
        positions: z15.array(
          z15.object({
            snapshotDate: z15.string(),
            symbol: z15.string(),
            totalVolume: z15.number(),
            availableVolume: z15.number(),
            avgPrice: z15.number(),
            currentPrice: z15.number(),
            marketValue: z15.number(),
            floatPnl: z15.number(),
            returnRate: z15.number(),
            entryDate: z15.string()
          })
        )
      })
    ).mutation(async ({ ctx, input }) => {
      const data = input.positions.map((p) => ({
        backtestRecordId: input.backtestRecordId,
        snapshotDate: p.snapshotDate,
        symbol: p.symbol,
        totalVolume: p.totalVolume,
        availableVolume: p.availableVolume,
        avgPrice: p.avgPrice.toString(),
        currentPrice: p.currentPrice.toString(),
        marketValue: p.marketValue.toString(),
        floatPnl: p.floatPnl.toString(),
        returnRate: p.returnRate.toString(),
        entryDate: p.entryDate
      }));
      await createPositionSnapshots(data);
      return { success: true };
    }),
    // 获取持仓快照
    get: publicProcedure.input(z15.object({ backtestRecordId: z15.number(), snapshotDate: z15.string().optional() })).query(async ({ input }) => {
      return await getPositionSnapshotsByBacktestId(input.backtestRecordId, input.snapshotDate);
    }),
    // 获取最新持仓快照
    getLatest: publicProcedure.input(z15.object({ backtestRecordId: z15.number() })).query(async ({ input }) => {
      return await getLatestPositionSnapshot(input.backtestRecordId);
    })
  }),
  // ============ 风控告警 ============
  riskAlerts: router({
    // 保存风控告警
    save: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number(),
        alerts: z15.array(
          z15.object({
            level: z15.enum(["INFO", "WARNING", "CRITICAL"]),
            rule: z15.string(),
            detail: z15.string(),
            metric: z15.string().optional(),
            value: z15.number().optional(),
            threshold: z15.number().optional(),
            alertDate: z15.string(),
            alertTime: z15.string()
          })
        )
      })
    ).mutation(async ({ ctx, input }) => {
      const data = input.alerts.map((a) => ({
        backtestRecordId: input.backtestRecordId,
        level: a.level,
        rule: a.rule,
        detail: a.detail,
        metric: a.metric,
        value: a.value?.toString(),
        threshold: a.threshold?.toString(),
        alertDate: a.alertDate,
        alertTime: a.alertTime
      }));
      await createRiskAlerts(data);
      return { success: true };
    }),
    // 获取风控告警
    get: publicProcedure.input(z15.object({ backtestRecordId: z15.number() })).query(async ({ input }) => {
      return await getRiskAlertsByBacktestId(input.backtestRecordId);
    }),
    // 按级别获取告警
    getByLevel: publicProcedure.input(z15.object({ backtestRecordId: z15.number(), level: z15.enum(["INFO", "WARNING", "CRITICAL"]) })).query(async ({ input }) => {
      return await getRiskAlertsByLevel(input.backtestRecordId, input.level);
    })
  }),
  // ============ 月度收益 ============
  monthlyReturns: router({
    // 保存月度收益
    save: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number(),
        returns: z15.array(
          z15.object({
            year: z15.number(),
            month: z15.number(),
            returnRate: z15.number()
          })
        )
      })
    ).mutation(async ({ ctx, input }) => {
      const data = input.returns.map((r) => ({
        backtestRecordId: input.backtestRecordId,
        year: r.year,
        month: r.month,
        returnRate: r.returnRate.toString()
      }));
      await createMonthlyReturns(data);
      return { success: true };
    }),
    // 获取月度收益
    get: publicProcedure.input(z15.object({ backtestRecordId: z15.number() })).query(async ({ input }) => {
      return await getMonthlyReturnsByBacktestId(input.backtestRecordId);
    })
  }),
  // ============ 数据备份 ============
  backup: router({
    // 创建备份
    create: publicProcedure.input(
      z15.object({
        backupType: z15.enum(["full", "incremental", "manual"])
      })
    ).mutation(async ({ ctx, input }) => {
      return await createBackup({
        userId: ctx.user?.id ?? 0,
        backupType: input.backupType,
        status: "pending"
      });
    }),
    // 获取备份列表
    list: publicProcedure.query(async ({ ctx }) => {
      return await getBackupsByUserId(ctx.user?.id ?? 0);
    }),
    // 更新备份状态
    update: publicProcedure.input(
      z15.object({
        id: z15.number(),
        status: z15.enum(["pending", "running", "completed", "failed"]),
        recordCount: z15.number().optional(),
        fileSize: z15.number().optional(),
        errorMessage: z15.string().optional()
      })
    ).mutation(async ({ input }) => {
      return await updateBackup(input.id, {
        status: input.status,
        recordCount: input.recordCount,
        fileSize: input.fileSize,
        errorMessage: input.errorMessage,
        endTime: /* @__PURE__ */ new Date()
      });
    })
  }),
  // ============ 对标管理 ============
  benchmark: router({
    // 获取所有基准指数
    getIndices: publicProcedure.query(async () => {
      const indices = await getBenchmarkIndices(true);
      return indices;
    }),
    // 获取策略的对标配置
    getStrategyBenchmarks: publicProcedure.input(z15.object({ strategyId: z15.number().int() })).query(async ({ input }) => {
      const benchmarks = await getStrategyBenchmarks(input.strategyId);
      return benchmarks;
    }),
    // 添加策略对标
    addStrategyBenchmark: publicProcedure.input(
      z15.object({
        strategyId: z15.number().int(),
        benchmarkIndexId: z15.number().int(),
        weight: z15.number().default(1)
      })
    ).mutation(async ({ input }) => {
      await createStrategyBenchmark({
        strategyId: input.strategyId,
        benchmarkIndexId: input.benchmarkIndexId,
        weight: input.weight.toString(),
        isActive: true
      });
      return { success: true };
    }),
    // 删除策略对标
    removeStrategyBenchmark: publicProcedure.input(z15.object({ id: z15.number().int() })).mutation(async ({ input }) => {
      await deleteStrategyBenchmark(input.id);
      return { success: true };
    }),
    // 获取回测的对标分析结果
    getAnalysis: publicProcedure.input(z15.object({ backtestRecordId: z15.number().int() })).query(async ({ input }) => {
      const analysis = await getBenchmarkAnalysisByBacktest(input.backtestRecordId);
      return analysis;
    }),
    // 计算对标分析
    calculateAnalysis: publicProcedure.input(
      z15.object({
        backtestRecordId: z15.number().int(),
        benchmarkIndexIds: z15.array(z15.number().int())
      })
    ).mutation(async ({ input }) => {
      const results = await calculateMultipleBenchmarkAnalysis(
        input.backtestRecordId,
        input.benchmarkIndexIds
      );
      for (const result of results) {
        await createBenchmarkAnalysis(result);
      }
      return { success: true, count: results.length };
    }),
    // 对比多个回测
    compareBacktests: publicProcedure.input(
      z15.object({
        backtestRecordIds: z15.array(z15.number().int()),
        benchmarkIndexId: z15.number().int()
      })
    ).query(async ({ input }) => {
      const comparisons = [];
      for (const backtestId of input.backtestRecordIds) {
        const analysis = await getBenchmarkAnalysisByBacktestAndBenchmark(
          backtestId,
          input.benchmarkIndexId
        );
        if (analysis) {
          comparisons.push({
            ...analysis
          });
        }
      }
      return comparisons;
    }),
    // 初始化默认基准指数
    initializeDefaults: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Only admins can initialize defaults");
      }
      const results = await initializeDefaultBenchmarks();
      return { success: true, results };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  const user = null;
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs5 from "fs";
import { nanoid } from "nanoid";
import path6 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs4 from "node:fs";
import path5 from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT2 = import.meta.dirname;
var LOG_DIR = path5.join(PROJECT_ROOT2, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs4.existsSync(LOG_DIR)) {
    fs4.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs4.existsSync(logPath) || fs4.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs4.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs4.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path5.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs4.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path5.resolve(import.meta.dirname, "client", "src"),
      "@shared": path5.resolve(import.meta.dirname, "shared"),
      "@assets": path5.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path5.resolve(import.meta.dirname),
  root: path5.resolve(import.meta.dirname, "client"),
  publicDir: path5.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path5.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path6.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs5.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path6.resolve(import.meta.dirname, "../..", "dist", "public") : path6.resolve(import.meta.dirname, "public");
  if (!fs5.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path6.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    next();
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);

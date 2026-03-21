import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  index,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * 核心用户表 - 支持 OAuth 认证
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 策略配置表 - 存储策略参数和账户设置
 */
export const strategies = mysqlTable(
  "strategies",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: varchar("version", { length: 32 }).default("1.0.0").notNull(),
    
    // 策略参数
    indexCode: varchar("indexCode", { length: 32 }).notNull(), // 跟踪指数
    frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly"]).default("daily").notNull(),
    targetCount: int("targetCount").default(10).notNull(), // 目标持仓数
    
    // 信号参数
    shortWindow: int("shortWindow").default(20).notNull(),
    longWindow: int("longWindow").default(60).notNull(),
    volatilityWindow: int("volatilityWindow").default(30).notNull(),
    trendRatio: decimal("trendRatio", { precision: 5, scale: 4 }).default("0.5").notNull(),
    
    // 风控参数
    stopLossRatio: decimal("stopLossRatio", { precision: 5, scale: 4 }).default("0.08").notNull(),
    maxProfitDrawdown: decimal("maxProfitDrawdown", { precision: 5, scale: 4 }).default("0.15").notNull(),
    newHighTimeout: int("newHighTimeout").default(45).notNull(),
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
    backtestStart: varchar("backtestStart", { length: 10 }).notNull(), // YYYY-MM-DD
    backtestEnd: varchar("backtestEnd", { length: 10 }).notNull(),
    
    // 状态
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("strategies_userId_idx").on(table.userId),
    fk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  })
);

export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = typeof strategies.$inferInsert;

/**
 * 回测历史表 - 存储每次回测的汇总数据
 */
export const backtestRecords = mysqlTable(
  "backtest_records",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    strategyId: int("strategyId").notNull(),
    
    // 回测基本信息
    name: varchar("name", { length: 255 }).notNull(), // 回测名称
    description: text("description"),
    backtestStart: varchar("backtestStart", { length: 10 }).notNull(),
    backtestEnd: varchar("backtestEnd", { length: 10 }).notNull(),
    tradingDays: int("tradingDays").default(0).notNull(),
    
    // 收益指标
    initialCapital: decimal("initialCapital", { precision: 15, scale: 2 }).notNull(),
    finalAsset: decimal("finalAsset", { precision: 15, scale: 2 }).notNull(),
    totalReturn: decimal("totalReturn", { precision: 8, scale: 6 }).notNull(), // 总收益率
    annualReturn: decimal("annualReturn", { precision: 8, scale: 6 }).notNull(), // 年化收益率
    totalPnl: decimal("totalPnl", { precision: 15, scale: 2 }).notNull(), // 总盈亏
    
    // 风险指标
    maxDrawdown: decimal("maxDrawdown", { precision: 8, scale: 6 }).notNull(), // 最大回撤
    maxDrawdownDays: int("maxDrawdownDays").default(0).notNull(), // 最大回撤持续天数
    volatility: decimal("volatility", { precision: 8, scale: 6 }).notNull(), // 年化波动率
    sharpeRatio: decimal("sharpeRatio", { precision: 8, scale: 4 }).notNull(), // 夏普比率
    sortinoRatio: decimal("sortinoRatio", { precision: 8, scale: 4 }).notNull(), // 索提诺比率
    calmarRatio: decimal("calmarRatio", { precision: 8, scale: 4 }).notNull(), // 卡玛比率
    infoRatio: decimal("infoRatio", { precision: 8, scale: 4 }).notNull(), // 信息比率
    
    // 基准对比
    benchmarkReturn: decimal("benchmarkReturn", { precision: 8, scale: 6 }).notNull(), // 基准收益率
    alpha: decimal("alpha", { precision: 8, scale: 6 }).notNull(), // Alpha
    beta: decimal("beta", { precision: 8, scale: 6 }).notNull(), // Beta
    
    // 交易统计
    totalTrades: int("totalTrades").default(0).notNull(),
    winTrades: int("winTrades").default(0).notNull(),
    lossTrades: int("lossTrades").default(0).notNull(),
    winRate: decimal("winRate", { precision: 5, scale: 4 }).default("0").notNull(),
    profitLossRatio: decimal("profitLossRatio", { precision: 8, scale: 4 }).default("0").notNull(),
    
    // 风险指标
    var95: decimal("var95", { precision: 8, scale: 6 }).notNull(), // VaR (95%)
    cvar95: decimal("cvar95", { precision: 8, scale: 6 }).notNull(), // CVaR (95%)
    
    // 状态
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("completed").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("backtest_records_userId_idx").on(table.userId),
    strategyIdIdx: index("backtest_records_strategyId_idx").on(table.strategyId),
    fk1: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    fk2: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("cascade"),
  })
);

export type BacktestRecord = typeof backtestRecords.$inferSelect;
export type InsertBacktestRecord = typeof backtestRecords.$inferInsert;

/**
 * 净值曲线表 - 存储每日净值数据
 */
export const equityCurves = mysqlTable(
  "equity_curves",
  {
    id: int("id").autoincrement().primaryKey(),
    backtestRecordId: int("backtestRecordId").notNull(),
    
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    nav: decimal("nav", { precision: 10, scale: 6 }).notNull(), // 净值
    benchmark: decimal("benchmark", { precision: 10, scale: 6 }).notNull(), // 基准净值
    asset: decimal("asset", { precision: 15, scale: 2 }).notNull(), // 总资产
    cash: decimal("cash", { precision: 15, scale: 2 }).notNull(), // 现金
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    backtestRecordIdIdx: index("equity_curves_backtestRecordId_idx").on(table.backtestRecordId),
    dateIdx: index("equity_curves_date_idx").on(table.date),
    fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
  })
);

export type EquityCurve = typeof equityCurves.$inferSelect;
export type InsertEquityCurve = typeof equityCurves.$inferInsert;

/**
 * 交易明细表 - 存储所有交易记录
 */
export const trades = mysqlTable(
  "trades",
  {
    id: int("id").autoincrement().primaryKey(),
    backtestRecordId: int("backtestRecordId").notNull(),
    
    tradeDate: varchar("tradeDate", { length: 10 }).notNull(), // YYYY-MM-DD
    tradeTime: varchar("tradeTime", { length: 8 }).notNull(), // HH:MM:SS
    symbol: varchar("symbol", { length: 32 }).notNull(), // 证券代码
    direction: mysqlEnum("direction", ["BUY", "SELL"]).notNull(),
    volume: int("volume").notNull(), // 交易数量
    price: decimal("price", { precision: 10, scale: 4 }).notNull(), // 成交价
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // 成交金额
    commission: decimal("commission", { precision: 15, scale: 2 }).notNull(), // 佣金
    stampDuty: decimal("stampDuty", { precision: 15, scale: 2 }).notNull(), // 印花税
    slippage: decimal("slippage", { precision: 15, scale: 2 }).notNull(), // 滑点
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    backtestRecordIdIdx: index("trades_backtestRecordId_idx").on(table.backtestRecordId),
    symbolIdx: index("trades_symbol_idx").on(table.symbol),
    tradeDateIdx: index("trades_tradeDate_idx").on(table.tradeDate),
    fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
  })
);

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

/**
 * 持仓快照表 - 存储历史持仓数据
 */
export const positionSnapshots = mysqlTable(
  "position_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    backtestRecordId: int("backtestRecordId").notNull(),
    
    snapshotDate: varchar("snapshotDate", { length: 10 }).notNull(), // YYYY-MM-DD
    symbol: varchar("symbol", { length: 32 }).notNull(),
    totalVolume: int("totalVolume").notNull(),
    availableVolume: int("availableVolume").notNull(),
    avgPrice: decimal("avgPrice", { precision: 10, scale: 4 }).notNull(),
    currentPrice: decimal("currentPrice", { precision: 10, scale: 4 }).notNull(),
    marketValue: decimal("marketValue", { precision: 15, scale: 2 }).notNull(),
    floatPnl: decimal("floatPnl", { precision: 15, scale: 2 }).notNull(),
    returnRate: decimal("returnRate", { precision: 8, scale: 6 }).notNull(),
    entryDate: varchar("entryDate", { length: 10 }).notNull(),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    backtestRecordIdIdx: index("position_snapshots_backtestRecordId_idx").on(table.backtestRecordId),
    snapshotDateIdx: index("position_snapshots_snapshotDate_idx").on(table.snapshotDate),
    symbolIdx: index("position_snapshots_symbol_idx").on(table.symbol),
    fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
  })
);

export type PositionSnapshot = typeof positionSnapshots.$inferSelect;
export type InsertPositionSnapshot = typeof positionSnapshots.$inferInsert;

/**
 * 风控告警表 - 存储风控告警日志
 */
export const riskAlerts = mysqlTable(
  "risk_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    backtestRecordId: int("backtestRecordId").notNull(),
    
    level: mysqlEnum("level", ["INFO", "WARNING", "CRITICAL"]).notNull(),
    rule: varchar("rule", { length: 255 }).notNull(), // 触发规则
    detail: text("detail").notNull(), // 详细说明
    metric: varchar("metric", { length: 128 }), // 相关指标
    value: decimal("value", { precision: 15, scale: 6 }), // 指标值
    threshold: decimal("threshold", { precision: 15, scale: 6 }), // 阈值
    
    alertDate: varchar("alertDate", { length: 10 }).notNull(),
    alertTime: varchar("alertTime", { length: 8 }).notNull(),
    
    resolved: boolean("resolved").default(false).notNull(),
    resolvedAt: timestamp("resolvedAt"),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    backtestRecordIdIdx: index("risk_alerts_backtestRecordId_idx").on(table.backtestRecordId),
    levelIdx: index("risk_alerts_level_idx").on(table.level),
    alertDateIdx: index("risk_alerts_alertDate_idx").on(table.alertDate),
    fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
  })
);

export type RiskAlert = typeof riskAlerts.$inferSelect;
export type InsertRiskAlert = typeof riskAlerts.$inferInsert;

/**
 * 月度收益表 - 存储按月汇总的收益数据
 */
export const monthlyReturns = mysqlTable(
  "monthly_returns",
  {
    id: int("id").autoincrement().primaryKey(),
    backtestRecordId: int("backtestRecordId").notNull(),
    
    year: int("year").notNull(),
    month: int("month").notNull(), // 1-12
    returnRate: decimal("returnRate", { precision: 8, scale: 6 }).notNull(),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    backtestRecordIdIdx: index("monthly_returns_backtestRecordId_idx").on(table.backtestRecordId),
    yearMonthIdx: uniqueIndex("monthly_returns_backtestRecordId_year_month_idx").on(
      table.backtestRecordId,
      table.year,
      table.month
    ),
    fk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
  })
);

export type MonthlyReturn = typeof monthlyReturns.$inferSelect;
export type InsertMonthlyReturn = typeof monthlyReturns.$inferInsert;

/**
 * 数据备份表 - 记录备份任务
 */
export const backups = mysqlTable(
  "backups",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    
    backupType: mysqlEnum("backupType", ["full", "incremental", "manual"]).default("manual").notNull(),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
    
    recordCount: int("recordCount").default(0).notNull(),
    fileSize: int("fileSize").default(0).notNull(), // 字节
    backupPath: varchar("backupPath", { length: 512 }),
    
    startTime: timestamp("startTime"),
    endTime: timestamp("endTime"),
    errorMessage: text("errorMessage"),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("backups_userId_idx").on(table.userId),
    statusIdx: index("backups_status_idx").on(table.status),
    fk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  })
);

export type Backup = typeof backups.$inferSelect;
export type InsertBackup = typeof backups.$inferInsert;

/**
 * 基准指数表 - 存储基准指数配置
 */
export const benchmarkIndices = mysqlTable(
  "benchmark_indices",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(), // 指数代码 (000300, 000905 等)
    name: varchar("name", { length: 255 }).notNull(), // 指数名称
    description: text("description"),
    category: mysqlEnum("category", ["stock", "bond", "commodity", "crypto"]).default("stock").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type BenchmarkIndex = typeof benchmarkIndices.$inferSelect;
export type InsertBenchmarkIndex = typeof benchmarkIndices.$inferInsert;

/**
 * 基准指数日线数据表 - 存储指数历史行情
 */
export const benchmarkData = mysqlTable(
  "benchmark_data",
  {
    id: int("id").autoincrement().primaryKey(),
    benchmarkIndexId: int("benchmarkIndexId").notNull(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    open: decimal("open", { precision: 15, scale: 4 }).notNull(),
    high: decimal("high", { precision: 15, scale: 4 }).notNull(),
    low: decimal("low", { precision: 15, scale: 4 }).notNull(),
    close: decimal("close", { precision: 15, scale: 4 }).notNull(),
    volume: int("volume").default(0).notNull(),
    amount: decimal("amount", { precision: 20, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    benchmarkIdIdx: index("benchmark_data_benchmarkIndexId_idx").on(table.benchmarkIndexId),
    dateIdx: index("benchmark_data_date_idx").on(table.date),
    uniqueIdx: uniqueIndex("benchmark_data_unique_idx").on(table.benchmarkIndexId, table.date as any),
    fk: foreignKey({ columns: [table.benchmarkIndexId], foreignColumns: [benchmarkIndices.id] }).onDelete("cascade"),
  })
);

export type BenchmarkData = typeof benchmarkData.$inferSelect;
export type InsertBenchmarkData = typeof benchmarkData.$inferInsert;

/**
 * 策略对标关系表 - 关联策略与基准指数
 */
export const strategyBenchmarks = mysqlTable(
  "strategy_benchmarks",
  {
    id: int("id").autoincrement().primaryKey(),
    strategyId: int("strategyId").notNull(),
    benchmarkIndexId: int("benchmarkIndexId").notNull(),
    weight: decimal("weight", { precision: 5, scale: 4 }).default("1.0").notNull(), // 权重
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    strategyIdIdx: index("strategy_benchmarks_strategyId_idx").on(table.strategyId),
    benchmarkIdIdx: index("strategy_benchmarks_benchmarkIndexId_idx").on(table.benchmarkIndexId),
    uniqueIdx: uniqueIndex("strategy_benchmarks_unique_idx").on(table.strategyId as any, table.benchmarkIndexId as any),
    strategyFk: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("cascade"),
    benchmarkFk: foreignKey({ columns: [table.benchmarkIndexId], foreignColumns: [benchmarkIndices.id] }).onDelete("cascade"),
  })
);

export type StrategyBenchmark = typeof strategyBenchmarks.$inferSelect;
export type InsertStrategyBenchmark = typeof strategyBenchmarks.$inferInsert;

/**
 * 对标分析结果表 - 存储策略与基准指数的对比分析
 */
export const benchmarkAnalysis = mysqlTable(
  "benchmark_analysis",
  {
    id: int("id").autoincrement().primaryKey(),
    backtestRecordId: int("backtestRecordId").notNull(),
    benchmarkIndexId: int("benchmarkIndexId").notNull(),
    
    // 基准指数收益
    benchmarkReturn: decimal("benchmarkReturn", { precision: 10, scale: 6 }).notNull(), // 基准收益率
    benchmarkAnnualReturn: decimal("benchmarkAnnualReturn", { precision: 10, scale: 6 }).notNull(),
    benchmarkMaxDrawdown: decimal("benchmarkMaxDrawdown", { precision: 10, scale: 6 }).notNull(),
    benchmarkSharpe: decimal("benchmarkSharpe", { precision: 10, scale: 6 }).notNull(),
    benchmarkVolatility: decimal("benchmarkVolatility", { precision: 10, scale: 6 }).notNull(),
    
    // 超额收益指标
    excessReturn: decimal("excessReturn", { precision: 10, scale: 6 }).notNull(), // 超额收益
    excessAnnualReturn: decimal("excessAnnualReturn", { precision: 10, scale: 6 }).notNull(),
    informationRatio: decimal("informationRatio", { precision: 10, scale: 6 }).notNull(), // 信息比率
    trackingError: decimal("trackingError", { precision: 10, scale: 6 }).notNull(), // 跟踪误差
    
    // 风险调整后指标
    alpha: decimal("alpha", { precision: 10, scale: 6 }).notNull(), // 詹森指标
    beta: decimal("beta", { precision: 10, scale: 6 }).notNull(), // 贝塔系数
    correlation: decimal("correlation", { precision: 10, scale: 6 }).notNull(), // 相关系数
    
    // 胜率指标
    outperformDays: int("outperformDays").default(0).notNull(), // 跑赢天数
    totalTradingDays: int("totalTradingDays").default(0).notNull(),
    winRate: decimal("winRate", { precision: 5, scale: 4 }).default("0").notNull(), // 胜率
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    backtestIdIdx: index("benchmark_analysis_backtestRecordId_idx").on(table.backtestRecordId),
    benchmarkIdIdx: index("benchmark_analysis_benchmarkIndexId_idx").on(table.benchmarkIndexId),
    uniqueIdx: uniqueIndex("benchmark_analysis_unique_idx").on(table.backtestRecordId as any, table.benchmarkIndexId as any),
    backtestFk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("cascade"),
    benchmarkFk: foreignKey({ columns: [table.benchmarkIndexId], foreignColumns: [benchmarkIndices.id] }).onDelete("cascade"),
  })
);

export type BenchmarkAnalysis = typeof benchmarkAnalysis.$inferSelect;
export type InsertBenchmarkAnalysis = typeof benchmarkAnalysis.$inferInsert;


/**
 * 实盘账户表 - 存储 QMT/XTP 等实盘交易账户信息
 */
export const tradingAccounts = mysqlTable(
  "trading_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    strategyId: int("strategyId"),
    
    // 账户基本信息
    accountName: varchar("accountName", { length: 255 }).notNull(), // 账户名称
    accountType: mysqlEnum("accountType", ["qmt", "xtp", "ctp", "other"]).notNull(), // 接口类型
    accountCode: varchar("accountCode", { length: 64 }).notNull().unique(), // 账户代码
    isSimulated: boolean("isSimulated").default(false).notNull(), // 是否为模拟账户
    
    // 连接状态
    isConnected: boolean("isConnected").default(false).notNull(),
    lastConnectedAt: timestamp("lastConnectedAt"),
    connectionStatus: mysqlEnum("connectionStatus", ["connected", "disconnected", "error"]).default("disconnected").notNull(),
    errorMessage: text("errorMessage"),
    
    // 账户资产信息
    totalAssets: decimal("totalAssets", { precision: 20, scale: 2 }).default("0").notNull(), // 总资产
    availableCash: decimal("availableCash", { precision: 20, scale: 2 }).default("0").notNull(), // 可用资金
    marketValue: decimal("marketValue", { precision: 20, scale: 2 }).default("0").notNull(), // 市值
    
    // 配置信息
    config: json("config"), // 连接配置（加密存储）
    isActive: boolean("isActive").default(true).notNull(),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("trading_accounts_userId_idx").on(table.userId),
    strategyIdIdx: index("trading_accounts_strategyId_idx").on(table.strategyId),
    accountCodeIdx: index("trading_accounts_accountCode_idx").on(table.accountCode),
    userStrategyIdx: uniqueIndex("trading_accounts_user_strategy_idx").on(table.userId as any, table.strategyId as any),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    strategyFk: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("set null"),
  })
);

export type TradingAccount = typeof tradingAccounts.$inferSelect;
export type InsertTradingAccount = typeof tradingAccounts.$inferInsert;

/**
 * 实时行情表 - 存储实时推送的行情数据
 */
export const marketData = mysqlTable(
  "market_data",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    
    // 行情信息
    symbol: varchar("symbol", { length: 32 }).notNull(), // 证券代码
    name: varchar("name", { length: 255 }), // 证券名称
    price: decimal("price", { precision: 15, scale: 4 }).notNull(), // 最新价
    bid: decimal("bid", { precision: 15, scale: 4 }), // 买一价
    ask: decimal("ask", { precision: 15, scale: 4 }), // 卖一价
    volume: int("volume").default(0).notNull(), // 成交量
    amount: decimal("amount", { precision: 20, scale: 2 }).default("0").notNull(), // 成交额
    
    // 涨跌信息
    change: decimal("change", { precision: 10, scale: 4 }), // 涨跌
    changePercent: decimal("changePercent", { precision: 10, scale: 4 }), // 涨跌幅
    
    timestamp: timestamp("timestamp").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    accountIdIdx: index("market_data_accountId_idx").on(table.accountId),
    symbolIdx: index("market_data_symbol_idx").on(table.symbol),
    timestampIdx: index("market_data_timestamp_idx").on(table.timestamp),
    accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade"),
  })
);

export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = typeof marketData.$inferInsert;

/**
 * 订单执行记录表 - 存储实盘订单执行情况
 */
export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    
    // 订单基本信息
    orderId: varchar("orderId", { length: 64 }).notNull().unique(), // 交易所订单号
    symbol: varchar("symbol", { length: 32 }).notNull(), // 证券代码
    side: mysqlEnum("side", ["buy", "sell"]).notNull(), // 买卖方向
    quantity: int("quantity").notNull(), // 订单数量
    price: decimal("price", { precision: 15, scale: 4 }).notNull(), // 订单价格
    
    // 订单状态
    status: mysqlEnum("status", ["pending", "partial", "filled", "cancelled", "rejected"]).notNull(),
    filledQuantity: int("filledQuantity").default(0).notNull(), // 成交数量
    filledPrice: decimal("filledPrice", { precision: 15, scale: 4 }), // 成交价格
    
    // 时间信息
    submitTime: timestamp("submitTime").notNull(),
    fillTime: timestamp("fillTime"),
    cancelTime: timestamp("cancelTime"),
    
    // 费用
    commission: decimal("commission", { precision: 15, scale: 4 }).default("0").notNull(), // 手续费
    errorMessage: text("errorMessage"),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    accountIdIdx: index("orders_accountId_idx").on(table.accountId),
    symbolIdx: index("orders_symbol_idx").on(table.symbol),
    statusIdx: index("orders_status_idx").on(table.status),
    orderIdIdx: index("orders_orderId_idx").on(table.orderId),
    accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade"),
  })
);

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * 实时持仓表 - 存储实盘账户的实时持仓
 */
export const livePositions = mysqlTable(
  "live_positions",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    
    // 持仓信息
    symbol: varchar("symbol", { length: 32 }).notNull(), // 证券代码
    name: varchar("name", { length: 255 }), // 证券名称
    quantity: int("quantity").notNull(), // 持仓数量
    costPrice: decimal("costPrice", { precision: 15, scale: 4 }).notNull(), // 成本价
    currentPrice: decimal("currentPrice", { precision: 15, scale: 4 }).notNull(), // 当前价
    
    // 盈亏信息
    marketValue: decimal("marketValue", { precision: 20, scale: 2 }).notNull(), // 市值
    floatingProfit: decimal("floatingProfit", { precision: 20, scale: 2 }).notNull(), // 浮动盈亏
    floatingProfitPercent: decimal("floatingProfitPercent", { precision: 10, scale: 4 }).notNull(), // 浮动盈亏率
    
    // 时间信息
    openDate: timestamp("openDate").notNull(), // 开仓日期
    lastUpdateTime: timestamp("lastUpdateTime").defaultNow().notNull(),
    
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    accountIdIdx: index("live_positions_accountId_idx").on(table.accountId),
    symbolIdx: index("live_positions_symbol_idx").on(table.symbol),
    accountSymbolIdx: uniqueIndex("live_positions_account_symbol_idx").on(table.accountId as any, table.symbol as any),
    accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade"),
  })
);

export type LivePosition = typeof livePositions.$inferSelect;
export type InsertLivePosition = typeof livePositions.$inferInsert;

/**
 * 交易日志表 - 记录所有交易活动
 */
export const tradeLogs = mysqlTable(
  "trade_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    orderId: varchar("orderId", { length: 64 }),
    
    // 事件信息
    eventType: mysqlEnum("eventType", [
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
    symbol: varchar("symbol", { length: 32 }),
    quantity: int("quantity"),
    price: decimal("price", { precision: 15, scale: 4 }),
    description: text("description"),
    
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => ({
    accountIdIdx: index("trade_logs_accountId_idx").on(table.accountId),
    eventTypeIdx: index("trade_logs_eventType_idx").on(table.eventType),
    timestampIdx: index("trade_logs_timestamp_idx").on(table.timestamp),
    accountFk: foreignKey({ columns: [table.accountId], foreignColumns: [tradingAccounts.id] }).onDelete("cascade"),
  })
);

export type TradeLog = typeof tradeLogs.$inferSelect;
export type InsertTradeLog = typeof tradeLogs.$inferInsert;


/**
 * 参数扫描配置表 - 存储参数扫描任务配置
 */
export const parameterScanConfigs = mysqlTable(
  "parameter_scan_configs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    strategyId: int("strategyId").notNull(),
    
    // 扫描基本信息
    name: varchar("name", { length: 255 }).notNull(), // 扫描任务名称
    description: text("description"),
    
    // 扫描算法
    algorithm: mysqlEnum("algorithm", ["grid_search", "bayesian_optimization"]).default("grid_search").notNull(),
    
    // 参数范围配置 (JSON 格式)
    parameterRanges: json("parameterRanges").notNull(), // { "param1": { "min": 0.1, "max": 0.9, "step": 0.1 }, ... }
    
    // 优化目标
    objectiveMetric: mysqlEnum("objectiveMetric", [
      "total_return",
      "sharpe_ratio",
      "max_drawdown",
      "win_rate",
      "profit_factor"
    ]).default("sharpe_ratio").notNull(),
    
    // 扫描配置
    maxIterations: int("maxIterations").default(100).notNull(), // 最大迭代次数
    populationSize: int("populationSize").default(20).notNull(), // 种群大小（贝叶斯优化）
    
    // 状态
    status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
    progress: decimal("progress", { precision: 5, scale: 2 }).default("0").notNull(), // 进度百分比
    
    // 时间信息
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("param_scan_configs_userId_idx").on(table.userId),
    strategyIdIdx: index("param_scan_configs_strategyId_idx").on(table.strategyId),
    statusIdx: index("param_scan_configs_status_idx").on(table.status),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    strategyFk: foreignKey({ columns: [table.strategyId], foreignColumns: [strategies.id] }).onDelete("cascade"),
  })
);
export type ParameterScanConfig = typeof parameterScanConfigs.$inferSelect;
export type InsertParameterScanConfig = typeof parameterScanConfigs.$inferInsert;

/**
 * 参数扫描结果表 - 存储每次迭代的结果
 */
export const parameterScanResults = mysqlTable(
  "parameter_scan_results",
  {
    id: int("id").autoincrement().primaryKey(),
    scanConfigId: int("scanConfigId").notNull(),
    
    // 迭代信息
    iteration: int("iteration").notNull(), // 迭代次数
    
    // 参数值 (JSON 格式)
    parameters: json("parameters").notNull(), // { "param1": 0.5, "param2": 0.3, ... }
    
    // 评估结果
    objectiveValue: decimal("objectiveValue", { precision: 15, scale: 6 }).notNull(), // 目标函数值
    
    // 详细指标
    metrics: json("metrics").notNull(), // { "total_return": 0.15, "sharpe_ratio": 1.5, "max_drawdown": -0.1, ... }
    
    // 回测信息
    backtestRecordId: int("backtestRecordId"),
    
    // 状态
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
    errorMessage: text("errorMessage"),
    
    // 时间信息
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scanConfigIdIdx: index("param_scan_results_scanConfigId_idx").on(table.scanConfigId),
    iterationIdx: index("param_scan_results_iteration_idx").on(table.iteration),
    statusIdx: index("param_scan_results_status_idx").on(table.status),
    scanConfigFk: foreignKey({ columns: [table.scanConfigId], foreignColumns: [parameterScanConfigs.id] }).onDelete("cascade"),
    backtestRecordFk: foreignKey({ columns: [table.backtestRecordId], foreignColumns: [backtestRecords.id] }).onDelete("set null"),
  })
);
export type ParameterScanResult = typeof parameterScanResults.$inferSelect;
export type InsertParameterScanResult = typeof parameterScanResults.$inferInsert;

/**
 * 参数扫描最优结果表 - 存储最优参数组合
 */
export const parameterScanOptimalResults = mysqlTable(
  "parameter_scan_optimal_results",
  {
    id: int("id").autoincrement().primaryKey(),
    scanConfigId: int("scanConfigId").notNull().unique(),
    
    // 最优参数
    parameters: json("parameters").notNull(), // { "param1": 0.5, "param2": 0.3, ... }
    
    // 最优指标
    objectiveValue: decimal("objectiveValue", { precision: 15, scale: 6 }).notNull(),
    metrics: json("metrics").notNull(),
    
    // 排名信息
    rank: int("rank").notNull(), // 在所有结果中的排名
    improvement: decimal("improvement", { precision: 10, scale: 4 }).notNull(), // 相对基础参数的改进百分比
    
    // 时间信息
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scanConfigIdIdx: index("param_scan_optimal_scanConfigId_idx").on(table.scanConfigId),
    scanConfigFk: foreignKey({ columns: [table.scanConfigId], foreignColumns: [parameterScanConfigs.id], name: "param_scan_optimal_fk" }).onDelete("cascade"),
  })
);
export type ParameterScanOptimalResult = typeof parameterScanOptimalResults.$inferSelect;
export type InsertParameterScanOptimalResult = typeof parameterScanOptimalResults.$inferInsert;

/**
 * 证券主数据表 - 统一管理股票/指数/ETF 等标的信息
 */
export const securities = mysqlTable(
  "securities",
  {
    id: int("id").autoincrement().primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull().unique(),
    exchange: mysqlEnum("exchange", ["SSE", "SZSE", "BSE", "HKEX", "US", "OTHER"]).notNull(),
    market: varchar("market", { length: 32 }).default("CN_A").notNull(),
    assetType: mysqlEnum("assetType", ["stock", "index", "etf", "fund", "bond", "convertible", "other"])
      .default("stock")
      .notNull(),
    name: varchar("name", { length: 255 }),
    currency: varchar("currency", { length: 8 }).default("CNY").notNull(),
    listStatus: mysqlEnum("listStatus", ["listed", "delisted", "suspended", "other"])
      .default("listed")
      .notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    symbolIdx: uniqueIndex("securities_symbol_idx").on(table.symbol),
    exchangeIdx: index("securities_exchange_idx").on(table.exchange),
    assetTypeIdx: index("securities_assetType_idx").on(table.assetType),
  })
);

export type Security = typeof securities.$inferSelect;
export type InsertSecurity = typeof securities.$inferInsert;

/**
 * 股票历史日线行情表 - 按证券/交易日/复权方式归档 OHLCV 数据
 */
export const stockDailyBars = mysqlTable(
  "stock_daily_bars",
  {
    id: int("id").autoincrement().primaryKey(),
    securityId: int("securityId").notNull(),
    tradeDate: varchar("tradeDate", { length: 10 }).notNull(), // YYYY-MM-DD
    adjustmentType: mysqlEnum("adjustmentType", ["none", "front_ratio", "back_ratio"])
      .default("front_ratio")
      .notNull(),
    open: decimal("open", { precision: 18, scale: 6 }).notNull(),
    high: decimal("high", { precision: 18, scale: 6 }).notNull(),
    low: decimal("low", { precision: 18, scale: 6 }).notNull(),
    close: decimal("close", { precision: 18, scale: 6 }).notNull(),
    volume: decimal("volume", { precision: 24, scale: 0 }).default("0").notNull(),
    amount: decimal("amount", { precision: 24, scale: 4 }).default("0").notNull(),
    turnoverRate: decimal("turnoverRate", { precision: 12, scale: 6 }),
    amplitude: decimal("amplitude", { precision: 12, scale: 6 }),
    changePercent: decimal("changePercent", { precision: 12, scale: 6 }),
    dataSource: varchar("dataSource", { length: 32 }).default("xtdata").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    securityDateAdjIdx: uniqueIndex("stock_daily_bars_security_date_adj_idx").on(
      table.securityId as any,
      table.tradeDate,
      table.adjustmentType
    ),
    securityDateIdx: index("stock_daily_bars_security_date_idx").on(table.securityId, table.tradeDate),
    tradeDateIdx: index("stock_daily_bars_tradeDate_idx").on(table.tradeDate),
    securityFk: foreignKey({ columns: [table.securityId], foreignColumns: [securities.id] }).onDelete("cascade"),
  })
);

export type StockDailyBar = typeof stockDailyBars.$inferSelect;
export type InsertStockDailyBar = typeof stockDailyBars.$inferInsert;

// ============================================================================
// Paperclip AI Agent 编排系统 - Schema 导出
// ============================================================================
// 注意：Paperclip schema 定义在独立的 paperclip-schema.ts 文件中
// 此处重新导出以便统一使用
export * from "./paperclip-schema";

-- Paperclip 数据库表
CREATE TABLE IF NOT EXISTS `pc_companies` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `status` TEXT DEFAULT 'active',
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `pc_agents` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `companyId` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `role` TEXT NOT NULL,
  `title` TEXT,
  `adapterType` TEXT NOT NULL,
  `adapterConfig` TEXT,
  `status` TEXT DEFAULT 'idle',
  `capabilities` TEXT,
  `reportsTo` INTEGER,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`)
);

CREATE TABLE IF NOT EXISTS `pc_issues` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `companyId` INTEGER NOT NULL,
  `title` TEXT NOT NULL,
  `description` TEXT,
  `status` TEXT DEFAULT 'open',
  `priority` TEXT DEFAULT 'medium',
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`)
);

CREATE TABLE IF NOT EXISTS `pc_approvals` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `companyId` INTEGER NOT NULL,
  `title` TEXT NOT NULL,
  `requestType` TEXT NOT NULL,
  `status` TEXT DEFAULT 'pending',
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`)
);

CREATE TABLE IF NOT EXISTS `pc_cost_events` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `companyId` INTEGER NOT NULL,
  `agentId` INTEGER NOT NULL,
  `model` TEXT,
  `inputTokens` INTEGER DEFAULT 0,
  `outputTokens` INTEGER DEFAULT 0,
  `totalCost` REAL DEFAULT 0,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`),
  FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`)
);

CREATE TABLE IF NOT EXISTS `pc_activity_log` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `companyId` INTEGER NOT NULL,
  `activityType` TEXT NOT NULL,
  `entityType` TEXT,
  `entityId` INTEGER,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`)
);

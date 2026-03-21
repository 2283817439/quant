-- Paperclip AI Agent 编排系统 - 初始迁移
-- 创建多 Agent 协作所需的核心数据表
-- Migration: 009_paperclip_agent_orchestration.sql

-- ============================================================================
-- 1. 公司与组织管理
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `status` ENUM('active', 'paused', 'archived') DEFAULT 'active' NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_companies_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_company_memberships` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `userId` INT NOT NULL,
  `role` ENUM('owner', 'admin', 'member') DEFAULT 'member' NOT NULL,
  `joinedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_memberships_companyId_idx` (`companyId`),
  INDEX `pc_memberships_userId_idx` (`userId`),
  UNIQUE INDEX `pc_memberships_unique_idx` (`companyId`, `userId`),
  CONSTRAINT `pc_memberships_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_memberships_fk_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. Agent 管理系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_agents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `role` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255),
  `status` ENUM('active', 'paused', 'idle', 'running', 'error', 'terminated') DEFAULT 'idle' NOT NULL,
  `reportsTo` INT,
  `capabilities` TEXT,
  `adapterType` ENUM('process', 'http') NOT NULL,
  `adapterConfig` JSON NOT NULL,
  `contextMode` ENUM('thin', 'fat') DEFAULT 'thin' NOT NULL,
  `budgetMonthlyCents` INT DEFAULT 0 NOT NULL,
  `spentMonthlyCents` INT DEFAULT 0 NOT NULL,
  `lastHeartbeatAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_agents_companyId_idx` (`companyId`),
  INDEX `pc_agents_status_idx` (`status`),
  INDEX `pc_agents_reportsTo_idx` (`reportsTo`),
  CONSTRAINT `pc_agents_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_agents_fk_reportsTo` FOREIGN KEY (`reportsTo`) REFERENCES `pc_agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_agent_api_keys` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `keyHash` TEXT NOT NULL,
  `lastUsedAt` TIMESTAMP NULL,
  `revokedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_api_keys_agentId_idx` (`agentId`),
  INDEX `pc_api_keys_companyId_idx` (`companyId`),
  CONSTRAINT `pc_api_keys_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_api_keys_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_agent_config_revisions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentId` INT NOT NULL,
  `revisionNumber` INT NOT NULL,
  `adapterConfig` JSON NOT NULL,
  `changeNote` TEXT,
  `changedByUserId` INT,
  `changedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_config_revisions_agentId_idx` (`agentId`),
  UNIQUE INDEX `pc_config_revisions_unique_idx` (`agentId`, `revisionNumber`),
  CONSTRAINT `pc_config_revisions_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_agent_runtime_state` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentId` INT NOT NULL,
  `taskId` INT,
  `contextSnapshot` JSON,
  `lastCheckpointAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_runtime_state_agentId_idx` (`agentId`),
  UNIQUE INDEX `pc_runtime_state_unique_idx` (`agentId`),
  CONSTRAINT `pc_runtime_state_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. 目标管理系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_goals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `level` ENUM('company', 'team', 'agent', 'task') NOT NULL,
  `parentId` INT,
  `ownerAgentId` INT,
  `status` ENUM('planned', 'active', 'achieved', 'cancelled') DEFAULT 'planned' NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_goals_companyId_idx` (`companyId`),
  INDEX `pc_goals_level_idx` (`level`),
  INDEX `pc_goals_parentId_idx` (`parentId`),
  CONSTRAINT `pc_goals_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_goals_fk_parent` FOREIGN KEY (`parentId`) REFERENCES `pc_goals`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pc_goals_fk_owner` FOREIGN KEY (`ownerAgentId`) REFERENCES `pc_agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. 任务/工单系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_issues` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `projectId` INT,
  `goalId` INT,
  `parentId` INT,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `status` ENUM('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled') DEFAULT 'backlog' NOT NULL,
  `priority` ENUM('critical', 'high', 'medium', 'low') DEFAULT 'medium' NOT NULL,
  `assigneeAgentId` INT,
  `createdByAgentId` INT,
  `createdByUserId` INT,
  `requestDepth` INT DEFAULT 0 NOT NULL,
  `billingCode` VARCHAR(255),
  `startedAt` TIMESTAMP NULL,
  `completedAt` TIMESTAMP NULL,
  `cancelledAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_issues_companyId_idx` (`companyId`),
  INDEX `pc_issues_status_idx` (`status`),
  INDEX `pc_issues_assignee_idx` (`assigneeAgentId`),
  INDEX `pc_issues_parentId_idx` (`parentId`),
  INDEX `pc_issues_goalId_idx` (`goalId`),
  CONSTRAINT `pc_issues_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_issues_fk_parent` FOREIGN KEY (`parentId`) REFERENCES `pc_issues`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pc_issues_fk_assignee` FOREIGN KEY (`assigneeAgentId`) REFERENCES `pc_agents`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pc_issues_fk_creator` FOREIGN KEY (`createdByAgentId`) REFERENCES `pc_agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_issue_comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `issueId` INT NOT NULL,
  `authorAgentId` INT,
  `authorUserId` INT,
  `body` TEXT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_comments_issueId_idx` (`issueId`),
  INDEX `pc_comments_companyId_idx` (`companyId`),
  CONSTRAINT `pc_comments_fk_issue` FOREIGN KEY (`issueId`) REFERENCES `pc_issues`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_comments_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_issue_attachments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `issueId` INT NOT NULL,
  `assetId` INT NOT NULL,
  `issueCommentId` INT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_attachments_issueId_idx` (`issueId`),
  INDEX `pc_attachments_assetId_idx` (`assetId`),
  CONSTRAINT `pc_attachments_fk_issue` FOREIGN KEY (`issueId`) REFERENCES `pc_issues`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_attachments_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. 心跳调度系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_heartbeat_runs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `agentId` INT NOT NULL,
  `invocationSource` ENUM('scheduler', 'manual', 'callback') NOT NULL,
  `status` ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out') DEFAULT 'queued' NOT NULL,
  `startedAt` TIMESTAMP NULL,
  `finishedAt` TIMESTAMP NULL,
  `error` TEXT,
  `externalRunId` VARCHAR(255),
  `contextSnapshot` JSON,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_heartbeat_runs_companyId_idx` (`companyId`),
  INDEX `pc_heartbeat_runs_agentId_idx` (`agentId`),
  INDEX `pc_heartbeat_runs_status_idx` (`status`),
  INDEX `pc_heartbeat_runs_startedAt_idx` (`startedAt`),
  CONSTRAINT `pc_heartbeat_runs_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_heartbeat_runs_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_heartbeat_run_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `runId` INT NOT NULL,
  `eventType` VARCHAR(255) NOT NULL,
  `eventData` JSON,
  `occurredAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_heartbeat_events_runId_idx` (`runId`),
  CONSTRAINT `pc_heartbeat_events_fk_run` FOREIGN KEY (`runId`) REFERENCES `pc_heartbeat_runs`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_agent_wakeup_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `reason` TEXT NOT NULL,
  `triggeredByUserId` INT,
  `triggeredByAgentId` INT,
  `processed` BOOLEAN DEFAULT FALSE NOT NULL,
  `processedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_wakeup_requests_agentId_idx` (`agentId`),
  INDEX `pc_wakeup_requests_processed_idx` (`processed`),
  CONSTRAINT `pc_wakeup_requests_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_wakeup_requests_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. 成本与预算系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_cost_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `agentId` INT NOT NULL,
  `issueId` INT,
  `projectId` INT,
  `goalId` INT,
  `billingCode` VARCHAR(255),
  `provider` VARCHAR(255) NOT NULL,
  `model` VARCHAR(255) NOT NULL,
  `inputTokens` INT DEFAULT 0 NOT NULL,
  `outputTokens` INT DEFAULT 0 NOT NULL,
  `costCents` INT NOT NULL,
  `occurredAt` TIMESTAMP NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_cost_events_companyId_idx` (`companyId`),
  INDEX `pc_cost_events_agentId_idx` (`agentId`),
  INDEX `pc_cost_events_occurredAt_idx` (`occurredAt`),
  CONSTRAINT `pc_cost_events_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_cost_events_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_cost_events_fk_issue` FOREIGN KEY (`issueId`) REFERENCES `pc_issues`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. 审批与治理系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_approvals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `type` ENUM('hire_agent', 'approve_ceo_strategy') NOT NULL,
  `requestedByAgentId` INT,
  `requestedByUserId` INT,
  `status` ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending' NOT NULL,
  `payload` JSON NOT NULL,
  `decisionNote` TEXT,
  `decidedByUserId` INT,
  `decidedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_approvals_companyId_idx` (`companyId`),
  INDEX `pc_approvals_status_idx` (`status`),
  INDEX `pc_approvals_type_idx` (`type`),
  CONSTRAINT `pc_approvals_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_approval_comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `approvalId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `authorUserId` INT NOT NULL,
  `body` TEXT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_approval_comments_approvalId_idx` (`approvalId`),
  CONSTRAINT `pc_approval_comments_fk_approval` FOREIGN KEY (`approvalId`) REFERENCES `pc_approvals`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_approval_comments_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. 审计日志系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_activity_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `actorType` ENUM('agent', 'user', 'system') NOT NULL,
  `actorId` VARCHAR(255) NOT NULL,
  `action` VARCHAR(255) NOT NULL,
  `entityType` VARCHAR(255) NOT NULL,
  `entityId` VARCHAR(255) NOT NULL,
  `details` JSON,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_activity_log_companyId_idx` (`companyId`),
  INDEX `pc_activity_log_createdAt_idx` (`createdAt`),
  INDEX `pc_activity_log_entityType_idx` (`entityType`),
  CONSTRAINT `pc_activity_log_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. 资产管理系统
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_assets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `provider` ENUM('local_disk', 's3') NOT NULL,
  `objectKey` VARCHAR(512) NOT NULL,
  `contentType` VARCHAR(255) NOT NULL,
  `byteSize` INT NOT NULL,
  `sha256` VARCHAR(64) NOT NULL,
  `originalFilename` VARCHAR(255),
  `createdByAgentId` INT,
  `createdByUserId` INT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_assets_companyId_idx` (`companyId`),
  UNIQUE INDEX `pc_assets_objectKey_unique_idx` (`companyId`, `objectKey`),
  CONSTRAINT `pc_assets_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 初始化数据
-- ============================================================================

-- 创建默认公司 (用于单公司模式)
INSERT INTO `pc_companies` (`name`, `description`, `status`) 
VALUES ('默认公司', '量化交易平台默认组织', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

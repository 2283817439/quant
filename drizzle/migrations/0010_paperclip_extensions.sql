-- Paperclip AI Agent 编排系统 - 扩展功能迁移
-- 补充 Heartbeat Events、Wakeup Requests、Company Secrets 表
-- Migration: 0010_paperclip_extensions.sql

-- ============================================================================
-- 1. Heartbeat Run Events (心跳运行事件)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_heartbeat_run_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `runId` INT NOT NULL,
  `eventType` VARCHAR(128) NOT NULL,
  `eventData` JSON,
  `occurredAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_heartbeat_events_runId_idx` (`runId`),
  CONSTRAINT `pc_heartbeat_events_fk_run` FOREIGN KEY (`runId`) REFERENCES `pc_heartbeat_runs`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. Agent Wakeup Requests (Agent 唤醒请求)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_agent_wakeup_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `reason` TEXT NOT NULL,
  `triggeredByUserId` INT,
  `triggeredByAgentId` INT,
  `processed` TINYINT(1) DEFAULT 0 NOT NULL,
  `processedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_wakeup_requests_agentId_idx` (`agentId`),
  INDEX `pc_wakeup_requests_processed_idx` (`processed`),
  CONSTRAINT `pc_wakeup_requests_fk_agent` FOREIGN KEY (`agentId`) REFERENCES `pc_agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pc_wakeup_requests_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. Company Secrets (公司密钥管理)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_company_secrets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `encryptedValue` TEXT NOT NULL,
  `description` TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE INDEX `pc_company_secrets_unique_idx` (`companyId`, `key`),
  CONSTRAINT `pc_company_secrets_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. Projects Table (项目管理) - 如果不存在则创建
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pc_projects` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `goalId` INT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `status` VARCHAR(32) DEFAULT 'active' NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `pc_projects_companyId_idx` (`companyId`),
  INDEX `pc_projects_status_idx` (`status`),
  CONSTRAINT `pc_projects_fk_company` FOREIGN KEY (`companyId`) REFERENCES `pc_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

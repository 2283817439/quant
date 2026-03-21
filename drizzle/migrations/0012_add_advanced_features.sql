-- Add Skill Library tables
CREATE TABLE IF NOT EXISTS `pc_skills` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `category` varchar(128),
  `code` text NOT NULL,
  `parameters` json,
  `version` varchar(32) NOT NULL DEFAULT '1.0.0',
  `isPublic` int NOT NULL DEFAULT 0,
  `usageCount` int NOT NULL DEFAULT 0,
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_company` (`companyId`),
  INDEX `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pc_agent_skills` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `agentId` int NOT NULL,
  `skillId` int NOT NULL,
  `enabled` int NOT NULL DEFAULT 1,
  `config` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_agent` (`agentId`),
  INDEX `idx_skill` (`skillId`),
  UNIQUE KEY `uk_agent_skill` (`agentId`, `skillId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add Runner Management table
CREATE TABLE IF NOT EXISTS `pc_runners` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('local', 'docker', 'kubernetes', 'lambda') NOT NULL,
  `status` enum('online', 'offline', 'busy', 'error') NOT NULL DEFAULT 'offline',
  `config` json,
  `capacity` int NOT NULL DEFAULT 1,
  `currentLoad` int NOT NULL DEFAULT 0,
  `lastHeartbeat` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_company_status` (`companyId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add Schedule Execution Logs table
CREATE TABLE IF NOT EXISTS `pc_schedule_execution_logs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `scheduleId` int NOT NULL,
  `agentId` int NOT NULL,
  `runnerId` int,
  `status` enum('pending', 'running', 'success', 'failed', 'timeout') NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finishedAt` timestamp NULL,
  `duration` int,
  `output` text,
  `errorMessage` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_schedule` (`scheduleId`),
  INDEX `idx_agent` (`agentId`),
  INDEX `idx_status` (`status`),
  INDEX `idx_started_at` (`startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add retry strategy fields to schedules table
ALTER TABLE `pc_agent_schedules`
  ADD COLUMN IF NOT EXISTS `maxRetries` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `retryDelaySeconds` int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS `timeoutSeconds` int NOT NULL DEFAULT 300;
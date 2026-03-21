-- Add agent schedules table for workflow automation
CREATE TABLE IF NOT EXISTS `pc_agent_schedules` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `agentId` int NOT NULL,
  `cronExpression` varchar(128) NOT NULL,
  `enabled` int NOT NULL DEFAULT 1,
  `lastRun` timestamp NULL,
  `nextRun` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_company_agent` (`companyId`, `agentId`),
  INDEX `idx_next_run` (`nextRun`, `enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
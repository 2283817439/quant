CREATE TABLE `pc_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`actorType` varchar(32) NOT NULL,
	`actorId` varchar(128) NOT NULL,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64),
	`entityId` varchar(128),
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_agent_api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`keyHash` varchar(512) NOT NULL,
	`lastUsedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_agent_api_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_agent_config_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`revisionNumber` int NOT NULL,
	`adapterConfig` json NOT NULL,
	`changeNote` text,
	`changedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_agent_config_revisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_agent_runtime_state` (
	`agentId` int NOT NULL,
	`taskId` int,
	`contextSnapshot` json,
	`lastCheckpointAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_agent_runtime_state_agentId` PRIMARY KEY(`agentId`)
);
--> statement-breakpoint
CREATE TABLE `pc_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` varchar(255) NOT NULL,
	`title` varchar(255),
	`status` enum('active','paused','idle','running','error','terminated') NOT NULL DEFAULT 'idle',
	`adapterType` enum('process','http') NOT NULL,
	`adapterConfig` json,
	`contextMode` enum('thin','fat') NOT NULL DEFAULT 'thin',
	`budgetMonthlyCents` int NOT NULL DEFAULT 0,
	`spentMonthlyCents` int NOT NULL DEFAULT 0,
	`reportsTo` int,
	`capabilities` text,
	`lastHeartbeatAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_approval_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`approvalId` int NOT NULL,
	`companyId` int NOT NULL,
	`body` text NOT NULL,
	`authorUserId` int,
	`authorAgentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_approval_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`type` enum('hire_agent','approve_ceo_strategy') NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`requestedByAgentId` int,
	`requestedByUserId` int,
	`decidedByUserId` int,
	`payload` json,
	`decision` text,
	`decisionNote` text,
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_cost_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`agentId` int NOT NULL,
	`issueId` int,
	`projectId` int,
	`goalId` int,
	`billingCode` varchar(128),
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`inputTokens` int NOT NULL DEFAULT 0,
	`outputTokens` int NOT NULL DEFAULT 0,
	`costCents` int NOT NULL DEFAULT 0,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_cost_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`parentId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`level` enum('company','team','agent','task') NOT NULL DEFAULT 'company',
	`ownerAgentId` int,
	`status` enum('planned','active','achieved','cancelled') NOT NULL DEFAULT 'planned',
	`priority` varchar(16) NOT NULL DEFAULT 'medium',
	`targetDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_heartbeat_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`agentId` int NOT NULL,
	`invocationSource` enum('scheduler','manual','callback') NOT NULL DEFAULT 'scheduler',
	`status` enum('queued','running','succeeded','failed','cancelled','timed_out') NOT NULL DEFAULT 'queued',
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`errorMessage` text,
	`externalRunId` varchar(128),
	`contextSnapshot` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pc_heartbeat_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_issue_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`issueId` int NOT NULL,
	`companyId` int NOT NULL,
	`body` text NOT NULL,
	`authorUserId` int,
	`authorAgentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_issue_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`projectId` int,
	`goalId` int,
	`parentId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('backlog','todo','in_progress','in_review','done','blocked','cancelled') NOT NULL DEFAULT 'backlog',
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`assigneeAgentId` int,
	`lockedByAgentId` int,
	`lockedAt` timestamp,
	`billingCode` varchar(128),
	`createdByUserId` int,
	`createdByAgentId` int,
	`requestDepth` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pc_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`goalId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pc_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trading_accounts` ADD `isSimulated` boolean DEFAULT false NOT NULL;
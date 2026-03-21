CREATE TABLE `parameter_scan_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`strategyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`algorithm` enum('grid_search','bayesian_optimization') NOT NULL DEFAULT 'grid_search',
	`parameterRanges` json NOT NULL,
	`objectiveMetric` enum('total_return','sharpe_ratio','max_drawdown','win_rate','profit_factor') NOT NULL DEFAULT 'sharpe_ratio',
	`maxIterations` int NOT NULL DEFAULT 100,
	`populationSize` int NOT NULL DEFAULT 20,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`progress` decimal(5,2) NOT NULL DEFAULT '0',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parameter_scan_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parameter_scan_optimal_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanConfigId` int NOT NULL,
	`parameters` json NOT NULL,
	`objectiveValue` decimal(15,6) NOT NULL,
	`metrics` json NOT NULL,
	`rank` int NOT NULL,
	`improvement` decimal(10,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parameter_scan_optimal_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `parameter_scan_optimal_results_scanConfigId_unique` UNIQUE(`scanConfigId`)
);
--> statement-breakpoint
CREATE TABLE `parameter_scan_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanConfigId` int NOT NULL,
	`iteration` int NOT NULL,
	`parameters` json NOT NULL,
	`objectiveValue` decimal(15,6) NOT NULL,
	`metrics` json NOT NULL,
	`backtestRecordId` int,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parameter_scan_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `parameter_scan_configs` ADD CONSTRAINT `parameter_scan_configs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parameter_scan_configs` ADD CONSTRAINT `parameter_scan_configs_strategyId_strategies_id_fk` FOREIGN KEY (`strategyId`) REFERENCES `strategies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parameter_scan_optimal_results` ADD CONSTRAINT `param_scan_optimal_fk` FOREIGN KEY (`scanConfigId`) REFERENCES `parameter_scan_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parameter_scan_results` ADD CONSTRAINT `parameter_scan_results_scanConfigId_parameter_scan_configs_id_fk` FOREIGN KEY (`scanConfigId`) REFERENCES `parameter_scan_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parameter_scan_results` ADD CONSTRAINT `parameter_scan_results_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `param_scan_configs_userId_idx` ON `parameter_scan_configs` (`userId`);--> statement-breakpoint
CREATE INDEX `param_scan_configs_strategyId_idx` ON `parameter_scan_configs` (`strategyId`);--> statement-breakpoint
CREATE INDEX `param_scan_configs_status_idx` ON `parameter_scan_configs` (`status`);--> statement-breakpoint
CREATE INDEX `param_scan_optimal_scanConfigId_idx` ON `parameter_scan_optimal_results` (`scanConfigId`);--> statement-breakpoint
CREATE INDEX `param_scan_results_scanConfigId_idx` ON `parameter_scan_results` (`scanConfigId`);--> statement-breakpoint
CREATE INDEX `param_scan_results_iteration_idx` ON `parameter_scan_results` (`iteration`);--> statement-breakpoint
CREATE INDEX `param_scan_results_status_idx` ON `parameter_scan_results` (`status`);

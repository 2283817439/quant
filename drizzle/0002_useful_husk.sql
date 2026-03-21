CREATE TABLE `benchmark_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backtestRecordId` int NOT NULL,
	`benchmarkIndexId` int NOT NULL,
	`benchmarkReturn` decimal(10,6) NOT NULL,
	`benchmarkAnnualReturn` decimal(10,6) NOT NULL,
	`benchmarkMaxDrawdown` decimal(10,6) NOT NULL,
	`benchmarkSharpe` decimal(10,6) NOT NULL,
	`benchmarkVolatility` decimal(10,6) NOT NULL,
	`excessReturn` decimal(10,6) NOT NULL,
	`excessAnnualReturn` decimal(10,6) NOT NULL,
	`informationRatio` decimal(10,6) NOT NULL,
	`trackingError` decimal(10,6) NOT NULL,
	`alpha` decimal(10,6) NOT NULL,
	`beta` decimal(10,6) NOT NULL,
	`correlation` decimal(10,6) NOT NULL,
	`outperformDays` int NOT NULL DEFAULT 0,
	`totalTradingDays` int NOT NULL DEFAULT 0,
	`winRate` decimal(5,4) NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `benchmark_analysis_id` PRIMARY KEY(`id`),
	CONSTRAINT `benchmark_analysis_unique_idx` UNIQUE(`backtestRecordId`,`benchmarkIndexId`)
);
--> statement-breakpoint
CREATE TABLE `benchmark_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`benchmarkIndexId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`open` decimal(15,4) NOT NULL,
	`high` decimal(15,4) NOT NULL,
	`low` decimal(15,4) NOT NULL,
	`close` decimal(15,4) NOT NULL,
	`volume` int NOT NULL DEFAULT 0,
	`amount` decimal(20,2) NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `benchmark_data_id` PRIMARY KEY(`id`),
	CONSTRAINT `benchmark_data_unique_idx` UNIQUE(`benchmarkIndexId`,`date`)
);
--> statement-breakpoint
CREATE TABLE `benchmark_indices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('stock','bond','commodity','crypto') NOT NULL DEFAULT 'stock',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `benchmark_indices_id` PRIMARY KEY(`id`),
	CONSTRAINT `benchmark_indices_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `strategy_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`strategyId` int NOT NULL,
	`benchmarkIndexId` int NOT NULL,
	`weight` decimal(5,4) NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `strategy_benchmarks_id` PRIMARY KEY(`id`),
	CONSTRAINT `strategy_benchmarks_unique_idx` UNIQUE(`strategyId`,`benchmarkIndexId`)
);
--> statement-breakpoint
ALTER TABLE `benchmark_analysis` ADD CONSTRAINT `benchmark_analysis_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `benchmark_analysis` ADD CONSTRAINT `benchmark_analysis_benchmarkIndexId_benchmark_indices_id_fk` FOREIGN KEY (`benchmarkIndexId`) REFERENCES `benchmark_indices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `benchmark_data` ADD CONSTRAINT `benchmark_data_benchmarkIndexId_benchmark_indices_id_fk` FOREIGN KEY (`benchmarkIndexId`) REFERENCES `benchmark_indices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategy_benchmarks` ADD CONSTRAINT `strategy_benchmarks_strategyId_strategies_id_fk` FOREIGN KEY (`strategyId`) REFERENCES `strategies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategy_benchmarks` ADD CONSTRAINT `strategy_benchmarks_benchmarkIndexId_benchmark_indices_id_fk` FOREIGN KEY (`benchmarkIndexId`) REFERENCES `benchmark_indices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `benchmark_analysis_backtestRecordId_idx` ON `benchmark_analysis` (`backtestRecordId`);--> statement-breakpoint
CREATE INDEX `benchmark_analysis_benchmarkIndexId_idx` ON `benchmark_analysis` (`benchmarkIndexId`);--> statement-breakpoint
CREATE INDEX `benchmark_data_benchmarkIndexId_idx` ON `benchmark_data` (`benchmarkIndexId`);--> statement-breakpoint
CREATE INDEX `benchmark_data_date_idx` ON `benchmark_data` (`date`);--> statement-breakpoint
CREATE INDEX `strategy_benchmarks_strategyId_idx` ON `strategy_benchmarks` (`strategyId`);--> statement-breakpoint
CREATE INDEX `strategy_benchmarks_benchmarkIndexId_idx` ON `strategy_benchmarks` (`benchmarkIndexId`);
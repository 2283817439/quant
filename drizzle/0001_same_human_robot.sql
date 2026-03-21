CREATE TABLE `backtest_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`strategyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`backtestStart` varchar(10) NOT NULL,
	`backtestEnd` varchar(10) NOT NULL,
	`tradingDays` int NOT NULL DEFAULT 0,
	`initialCapital` decimal(15,2) NOT NULL,
	`finalAsset` decimal(15,2) NOT NULL,
	`totalReturn` decimal(8,6) NOT NULL,
	`annualReturn` decimal(8,6) NOT NULL,
	`totalPnl` decimal(15,2) NOT NULL,
	`maxDrawdown` decimal(8,6) NOT NULL,
	`maxDrawdownDays` int NOT NULL DEFAULT 0,
	`volatility` decimal(8,6) NOT NULL,
	`sharpeRatio` decimal(8,4) NOT NULL,
	`sortinoRatio` decimal(8,4) NOT NULL,
	`calmarRatio` decimal(8,4) NOT NULL,
	`infoRatio` decimal(8,4) NOT NULL,
	`benchmarkReturn` decimal(8,6) NOT NULL,
	`alpha` decimal(8,6) NOT NULL,
	`beta` decimal(8,6) NOT NULL,
	`totalTrades` int NOT NULL DEFAULT 0,
	`winTrades` int NOT NULL DEFAULT 0,
	`lossTrades` int NOT NULL DEFAULT 0,
	`winRate` decimal(5,4) NOT NULL DEFAULT '0',
	`profitLossRatio` decimal(8,4) NOT NULL DEFAULT '0',
	`var95` decimal(8,6) NOT NULL,
	`cvar95` decimal(8,6) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backtest_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`backupType` enum('full','incremental','manual') NOT NULL DEFAULT 'manual',
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`recordCount` int NOT NULL DEFAULT 0,
	`fileSize` int NOT NULL DEFAULT 0,
	`backupPath` varchar(512),
	`startTime` timestamp,
	`endTime` timestamp,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equity_curves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backtestRecordId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`nav` decimal(10,6) NOT NULL,
	`benchmark` decimal(10,6) NOT NULL,
	`asset` decimal(15,2) NOT NULL,
	`cash` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `equity_curves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backtestRecordId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`returnRate` decimal(8,6) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthly_returns_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_returns_backtestRecordId_year_month_idx` UNIQUE(`backtestRecordId`,`year`,`month`)
);
--> statement-breakpoint
CREATE TABLE `position_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backtestRecordId` int NOT NULL,
	`snapshotDate` varchar(10) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`totalVolume` int NOT NULL,
	`availableVolume` int NOT NULL,
	`avgPrice` decimal(10,4) NOT NULL,
	`currentPrice` decimal(10,4) NOT NULL,
	`marketValue` decimal(15,2) NOT NULL,
	`floatPnl` decimal(15,2) NOT NULL,
	`returnRate` decimal(8,6) NOT NULL,
	`entryDate` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `position_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backtestRecordId` int NOT NULL,
	`level` enum('INFO','WARNING','CRITICAL') NOT NULL,
	`rule` varchar(255) NOT NULL,
	`detail` text NOT NULL,
	`metric` varchar(128),
	`value` decimal(15,6),
	`threshold` decimal(15,6),
	`alertDate` varchar(10) NOT NULL,
	`alertTime` varchar(8) NOT NULL,
	`resolved` boolean NOT NULL DEFAULT false,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `risk_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`version` varchar(32) NOT NULL DEFAULT '1.0.0',
	`indexCode` varchar(32) NOT NULL,
	`frequency` enum('daily','weekly','monthly') NOT NULL DEFAULT 'daily',
	`targetCount` int NOT NULL DEFAULT 10,
	`shortWindow` int NOT NULL DEFAULT 20,
	`longWindow` int NOT NULL DEFAULT 60,
	`volatilityWindow` int NOT NULL DEFAULT 30,
	`trendRatio` decimal(5,4) NOT NULL DEFAULT '0.5',
	`stopLossRatio` decimal(5,4) NOT NULL DEFAULT '0.08',
	`maxProfitDrawdown` decimal(5,4) NOT NULL DEFAULT '0.15',
	`newHighTimeout` int NOT NULL DEFAULT 45,
	`maxSinglePositionRatio` decimal(5,4) NOT NULL DEFAULT '0.12',
	`maxTotalPositionRatio` decimal(5,4) NOT NULL DEFAULT '0.9',
	`maxDrawdown` decimal(5,4) NOT NULL DEFAULT '0.2',
	`dailyMaxLoss` decimal(15,2) NOT NULL DEFAULT '10000.00',
	`initialCapital` decimal(15,2) NOT NULL DEFAULT '1000000.00',
	`commissionRate` decimal(5,4) NOT NULL DEFAULT '0.0003',
	`stampDutyRate` decimal(5,4) NOT NULL DEFAULT '0.001',
	`slippageRate` decimal(5,4) NOT NULL DEFAULT '0.0005',
	`backtestStart` varchar(10) NOT NULL,
	`backtestEnd` varchar(10) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `strategies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backtestRecordId` int NOT NULL,
	`tradeDate` varchar(10) NOT NULL,
	`tradeTime` varchar(8) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`direction` enum('BUY','SELL') NOT NULL,
	`volume` int NOT NULL,
	`price` decimal(10,4) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`commission` decimal(15,2) NOT NULL,
	`stampDuty` decimal(15,2) NOT NULL,
	`slippage` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `backtest_records` ADD CONSTRAINT `backtest_records_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `backtest_records` ADD CONSTRAINT `backtest_records_strategyId_strategies_id_fk` FOREIGN KEY (`strategyId`) REFERENCES `strategies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `backups` ADD CONSTRAINT `backups_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equity_curves` ADD CONSTRAINT `equity_curves_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_returns` ADD CONSTRAINT `monthly_returns_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `position_snapshots` ADD CONSTRAINT `position_snapshots_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `risk_alerts` ADD CONSTRAINT `risk_alerts_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trades` ADD CONSTRAINT `trades_backtestRecordId_backtest_records_id_fk` FOREIGN KEY (`backtestRecordId`) REFERENCES `backtest_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `backtest_records_userId_idx` ON `backtest_records` (`userId`);--> statement-breakpoint
CREATE INDEX `backtest_records_strategyId_idx` ON `backtest_records` (`strategyId`);--> statement-breakpoint
CREATE INDEX `backups_userId_idx` ON `backups` (`userId`);--> statement-breakpoint
CREATE INDEX `backups_status_idx` ON `backups` (`status`);--> statement-breakpoint
CREATE INDEX `equity_curves_backtestRecordId_idx` ON `equity_curves` (`backtestRecordId`);--> statement-breakpoint
CREATE INDEX `equity_curves_date_idx` ON `equity_curves` (`date`);--> statement-breakpoint
CREATE INDEX `monthly_returns_backtestRecordId_idx` ON `monthly_returns` (`backtestRecordId`);--> statement-breakpoint
CREATE INDEX `position_snapshots_backtestRecordId_idx` ON `position_snapshots` (`backtestRecordId`);--> statement-breakpoint
CREATE INDEX `position_snapshots_snapshotDate_idx` ON `position_snapshots` (`snapshotDate`);--> statement-breakpoint
CREATE INDEX `position_snapshots_symbol_idx` ON `position_snapshots` (`symbol`);--> statement-breakpoint
CREATE INDEX `risk_alerts_backtestRecordId_idx` ON `risk_alerts` (`backtestRecordId`);--> statement-breakpoint
CREATE INDEX `risk_alerts_level_idx` ON `risk_alerts` (`level`);--> statement-breakpoint
CREATE INDEX `risk_alerts_alertDate_idx` ON `risk_alerts` (`alertDate`);--> statement-breakpoint
CREATE INDEX `strategies_userId_idx` ON `strategies` (`userId`);--> statement-breakpoint
CREATE INDEX `trades_backtestRecordId_idx` ON `trades` (`backtestRecordId`);--> statement-breakpoint
CREATE INDEX `trades_symbol_idx` ON `trades` (`symbol`);--> statement-breakpoint
CREATE INDEX `trades_tradeDate_idx` ON `trades` (`tradeDate`);
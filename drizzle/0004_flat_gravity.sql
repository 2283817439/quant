CREATE TABLE `live_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`name` varchar(255),
	`quantity` int NOT NULL,
	`costPrice` decimal(15,4) NOT NULL,
	`currentPrice` decimal(15,4) NOT NULL,
	`marketValue` decimal(20,2) NOT NULL,
	`floatingProfit` decimal(20,2) NOT NULL,
	`floatingProfitPercent` decimal(10,4) NOT NULL,
	`openDate` timestamp NOT NULL,
	`lastUpdateTime` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `live_positions_account_symbol_idx` UNIQUE(`accountId`,`symbol`)
);
--> statement-breakpoint
CREATE TABLE `market_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`name` varchar(255),
	`price` decimal(15,4) NOT NULL,
	`bid` decimal(15,4),
	`ask` decimal(15,4),
	`volume` int NOT NULL DEFAULT 0,
	`amount` decimal(20,2) NOT NULL DEFAULT '0',
	`change` decimal(10,4),
	`changePercent` decimal(10,4),
	`timestamp` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`orderId` varchar(64) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`quantity` int NOT NULL,
	`price` decimal(15,4) NOT NULL,
	`status` enum('pending','partial','filled','cancelled','rejected') NOT NULL,
	`filledQuantity` int NOT NULL DEFAULT 0,
	`filledPrice` decimal(15,4),
	`submitTime` timestamp NOT NULL,
	`fillTime` timestamp,
	`cancelTime` timestamp,
	`commission` decimal(15,4) NOT NULL DEFAULT '0',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderId_unique` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `trade_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`orderId` varchar(64),
	`eventType` enum('order_submitted','order_filled','order_cancelled','order_rejected','position_opened','position_closed','account_connected','account_disconnected','error') NOT NULL,
	`symbol` varchar(32),
	`quantity` int,
	`price` decimal(15,4),
	`description` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trade_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`strategyId` int,
	`accountName` varchar(255) NOT NULL,
	`accountType` enum('qmt','xtp','ctp','other') NOT NULL,
	`accountCode` varchar(64) NOT NULL,
	`isConnected` boolean NOT NULL DEFAULT false,
	`lastConnectedAt` timestamp,
	`connectionStatus` enum('connected','disconnected','error') NOT NULL DEFAULT 'disconnected',
	`errorMessage` text,
	`totalAssets` decimal(20,2) NOT NULL DEFAULT '0',
	`availableCash` decimal(20,2) NOT NULL DEFAULT '0',
	`marketValue` decimal(20,2) NOT NULL DEFAULT '0',
	`config` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `trading_accounts_accountCode_unique` UNIQUE(`accountCode`),
	CONSTRAINT `trading_accounts_user_strategy_idx` UNIQUE(`userId`,`strategyId`)
);
--> statement-breakpoint
ALTER TABLE `live_positions` ADD CONSTRAINT `live_positions_accountId_trading_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `trading_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `market_data` ADD CONSTRAINT `market_data_accountId_trading_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `trading_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_accountId_trading_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `trading_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trade_logs` ADD CONSTRAINT `trade_logs_accountId_trading_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `trading_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trading_accounts` ADD CONSTRAINT `trading_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trading_accounts` ADD CONSTRAINT `trading_accounts_strategyId_strategies_id_fk` FOREIGN KEY (`strategyId`) REFERENCES `strategies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `live_positions_accountId_idx` ON `live_positions` (`accountId`);--> statement-breakpoint
CREATE INDEX `live_positions_symbol_idx` ON `live_positions` (`symbol`);--> statement-breakpoint
CREATE INDEX `market_data_accountId_idx` ON `market_data` (`accountId`);--> statement-breakpoint
CREATE INDEX `market_data_symbol_idx` ON `market_data` (`symbol`);--> statement-breakpoint
CREATE INDEX `market_data_timestamp_idx` ON `market_data` (`timestamp`);--> statement-breakpoint
CREATE INDEX `orders_accountId_idx` ON `orders` (`accountId`);--> statement-breakpoint
CREATE INDEX `orders_symbol_idx` ON `orders` (`symbol`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_orderId_idx` ON `orders` (`orderId`);--> statement-breakpoint
CREATE INDEX `trade_logs_accountId_idx` ON `trade_logs` (`accountId`);--> statement-breakpoint
CREATE INDEX `trade_logs_eventType_idx` ON `trade_logs` (`eventType`);--> statement-breakpoint
CREATE INDEX `trade_logs_timestamp_idx` ON `trade_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `trading_accounts_userId_idx` ON `trading_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `trading_accounts_strategyId_idx` ON `trading_accounts` (`strategyId`);--> statement-breakpoint
CREATE INDEX `trading_accounts_accountCode_idx` ON `trading_accounts` (`accountCode`);
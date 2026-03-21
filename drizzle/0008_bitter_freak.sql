CREATE TABLE `securities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`exchange` enum('SSE','SZSE','BSE','HKEX','US','OTHER') NOT NULL,
	`market` varchar(32) NOT NULL DEFAULT 'CN_A',
	`assetType` enum('stock','index','etf','fund','bond','convertible','other') NOT NULL DEFAULT 'stock',
	`name` varchar(255),
	`currency` varchar(8) NOT NULL DEFAULT 'CNY',
	`listStatus` enum('listed','delisted','suspended','other') NOT NULL DEFAULT 'listed',
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `securities_id` PRIMARY KEY(`id`),
	CONSTRAINT `securities_symbol_unique` UNIQUE(`symbol`),
	CONSTRAINT `securities_symbol_idx` UNIQUE(`symbol`)
);
--> statement-breakpoint
CREATE TABLE `stock_daily_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`securityId` int NOT NULL,
	`tradeDate` varchar(10) NOT NULL,
	`adjustmentType` enum('none','front_ratio','back_ratio') NOT NULL DEFAULT 'front_ratio',
	`open` decimal(18,6) NOT NULL,
	`high` decimal(18,6) NOT NULL,
	`low` decimal(18,6) NOT NULL,
	`close` decimal(18,6) NOT NULL,
	`volume` decimal(24,0) NOT NULL DEFAULT '0',
	`amount` decimal(24,4) NOT NULL DEFAULT '0',
	`turnoverRate` decimal(12,6),
	`amplitude` decimal(12,6),
	`changePercent` decimal(12,6),
	`dataSource` varchar(32) NOT NULL DEFAULT 'xtdata',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_daily_bars_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_daily_bars_security_date_adj_idx` UNIQUE(`securityId`,`tradeDate`,`adjustmentType`)
);
--> statement-breakpoint
ALTER TABLE `stock_daily_bars` ADD CONSTRAINT `stock_daily_bars_securityId_securities_id_fk` FOREIGN KEY (`securityId`) REFERENCES `securities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `securities_exchange_idx` ON `securities` (`exchange`);--> statement-breakpoint
CREATE INDEX `securities_assetType_idx` ON `securities` (`assetType`);--> statement-breakpoint
CREATE INDEX `stock_daily_bars_security_date_idx` ON `stock_daily_bars` (`securityId`,`tradeDate`);--> statement-breakpoint
CREATE INDEX `stock_daily_bars_tradeDate_idx` ON `stock_daily_bars` (`tradeDate`);
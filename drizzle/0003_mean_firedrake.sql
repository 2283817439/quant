ALTER TABLE `benchmark_analysis` MODIFY COLUMN `winRate` decimal(5,4) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `benchmark_data` MODIFY COLUMN `amount` decimal(20,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `strategy_benchmarks` MODIFY COLUMN `weight` decimal(5,4) NOT NULL DEFAULT '1.0';
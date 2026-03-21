ALTER TABLE `parameter_scan_optimal_results` DROP FOREIGN KEY `param_scan_optimal_fk`;
--> statement-breakpoint
ALTER TABLE `parameter_scan_optimal_results` ADD CONSTRAINT `param_scan_optimal_fk` FOREIGN KEY (`scanConfigId`) REFERENCES `parameter_scan_configs`(`id`) ON DELETE cascade ON UPDATE no action;

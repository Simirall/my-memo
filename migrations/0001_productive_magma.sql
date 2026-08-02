CREATE TABLE `authorization_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`target_user_id` text,
	`action` text NOT NULL,
	`previous_value` text,
	`current_value` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `authorization_audit_logs_target_idx` ON `authorization_audit_logs` (`target_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `authorization_audit_logs_actor_idx` ON `authorization_audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_limits` (
	`plan_id` text NOT NULL,
	`metric` text NOT NULL,
	`limit_value` integer,
	PRIMARY KEY(`plan_id`, `metric`),
	CONSTRAINT `plan_limits_limit_value_non_negative` CHECK (`limit_value` IS NULL OR `limit_value` >= 0),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_code_unique` ON `plans` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `plans_default_unique` ON `plans` (`is_default`) WHERE "plans"."is_default" = 1;--> statement-breakpoint
CREATE INDEX `plans_active_idx` ON `plans` (`is_active`);--> statement-breakpoint
INSERT INTO `plans` (`id`, `code`, `name`, `is_default`, `is_active`)
VALUES ('free', 'free', 'Free', 1, 1);--> statement-breakpoint
INSERT INTO `plan_limits` (`plan_id`, `metric`, `limit_value`)
VALUES
	('free', 'memo.total', 100),
	('free', 'ai_summary.monthly', 10);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`user_id` text NOT NULL,
	`metric` text NOT NULL,
	`period_start` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`user_id`, `metric`, `period_start`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `plan_id` text REFERENCES plans(id);--> statement-breakpoint
UPDATE `user` SET `plan_id` = 'free' WHERE `plan_id` IS NULL;--> statement-breakpoint
CREATE TRIGGER `require_valid_user_plan_on_insert`
BEFORE INSERT ON `user`
FOR EACH ROW
WHEN NEW.`plan_id` IS NULL
	OR NOT EXISTS (SELECT 1 FROM `plans` WHERE `id` = NEW.`plan_id`)
BEGIN
	SELECT RAISE(ABORT, 'user must have a valid plan');
END;--> statement-breakpoint
CREATE TRIGGER `require_valid_user_plan_on_update`
BEFORE UPDATE OF `plan_id` ON `user`
FOR EACH ROW
WHEN NEW.`plan_id` IS NULL
	OR NOT EXISTS (SELECT 1 FROM `plans` WHERE `id` = NEW.`plan_id`)
BEGIN
	SELECT RAISE(ABORT, 'user must have a valid plan');
END;--> statement-breakpoint
CREATE TRIGGER `prevent_referenced_plan_delete`
BEFORE DELETE ON `plans`
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM `user` WHERE `plan_id` = OLD.`id`)
BEGIN
	SELECT RAISE(ABORT, 'cannot delete a plan assigned to a user');
END;--> statement-breakpoint
CREATE TRIGGER `prevent_last_admin_demotion`
BEFORE UPDATE OF `role` ON `user`
FOR EACH ROW
WHEN OLD.`role` = 'admin'
	AND NEW.`role` <> 'admin'
	AND (SELECT COUNT(*) FROM `user` WHERE `role` = 'admin') <= 1
BEGIN
	SELECT RAISE(ABORT, 'cannot demote the last administrator');
END;

CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attachment_upload_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`memo_id` text,
	`share_intake_id` text,
	`r2_key` text NOT NULL,
	`thumbnail_r2_key` text,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachment_upload_reservations_size_positive" CHECK("attachment_upload_reservations"."size_bytes" > 0),
	CONSTRAINT "attachment_upload_reservations_status" CHECK("attachment_upload_reservations"."status" IN ('pending', 'cleaning'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachment_upload_reservations_r2_key_unique` ON `attachment_upload_reservations` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `attachment_upload_reservations_thumbnail_r2_key_unique` ON `attachment_upload_reservations` (`thumbnail_r2_key`);--> statement-breakpoint
CREATE INDEX `attachment_upload_reservations_user_expires_idx` ON `attachment_upload_reservations` (`user_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `attachment_upload_reservations_memo_idx` ON `attachment_upload_reservations` (`memo_id`);--> statement-breakpoint
CREATE INDEX `attachment_upload_reservations_share_idx` ON `attachment_upload_reservations` (`share_intake_id`);--> statement-breakpoint
CREATE TABLE `r2_deletion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`lease_until` text,
	`last_failure` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "r2_deletion_jobs_status" CHECK("r2_deletion_jobs"."status" IN ('pending', 'processing', 'failed')),
	CONSTRAINT "r2_deletion_jobs_attempt_count" CHECK("r2_deletion_jobs"."attempt_count" BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `r2_deletion_jobs_object_key_unique` ON `r2_deletion_jobs` (`object_key`);--> statement-breakpoint
CREATE INDEX `r2_deletion_jobs_due_idx` ON `r2_deletion_jobs` (`status`,`next_attempt_at`,`lease_until`);--> statement-breakpoint
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
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `categories_user_id_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_id_name_unique` ON `categories` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `link_preview_cache` (
	`normalized_url` text PRIMARY KEY NOT NULL,
	`title` text,
	`description` text,
	`image_url` text,
	`card_type` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`fetched_at` text,
	`expires_at` text,
	`retry_after` text,
	`last_referenced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`lease_until` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "link_preview_cache_card_type" CHECK("link_preview_cache"."card_type" IS NULL OR "link_preview_cache"."card_type" IN ('summary', 'summary_large_image')),
	CONSTRAINT "link_preview_cache_status" CHECK("link_preview_cache"."status" IN ('pending', 'fetching', 'ready', 'failed')),
	CONSTRAINT "link_preview_cache_failure_count_non_negative" CHECK("link_preview_cache"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `link_preview_cache_maintenance_idx` ON `link_preview_cache` (`last_referenced_at`,`lease_until`);--> statement-breakpoint
CREATE TABLE `memo_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`memo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`thumbnail_r2_key` text,
	`thumbnail_content_type` text,
	`thumbnail_size_bytes` integer,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`media_width` integer,
	`media_height` integer,
	`etag` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memo_attachments_size_bytes_non_negative" CHECK("memo_attachments"."size_bytes" >= 0),
	CONSTRAINT "memo_attachments_thumbnail_fields" CHECK(("memo_attachments"."thumbnail_r2_key" IS NULL AND "memo_attachments"."thumbnail_content_type" IS NULL AND "memo_attachments"."thumbnail_size_bytes" IS NULL)
        OR ("memo_attachments"."thumbnail_r2_key" IS NOT NULL AND "memo_attachments"."thumbnail_content_type" IN ('image/avif', 'image/webp') AND "memo_attachments"."thumbnail_size_bytes" > 0)),
	CONSTRAINT "memo_attachments_media_dimensions_pair" CHECK(("memo_attachments"."media_width" IS NULL AND "memo_attachments"."media_height" IS NULL)
        OR ("memo_attachments"."media_width" > 0 AND "memo_attachments"."media_height" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memo_attachments_r2_key_unique` ON `memo_attachments` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `memo_attachments_thumbnail_r2_key_unique` ON `memo_attachments` (`thumbnail_r2_key`);--> statement-breakpoint
CREATE INDEX `memo_attachments_memo_id_idx` ON `memo_attachments` (`memo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `memo_attachments_user_id_idx` ON `memo_attachments` (`user_id`);--> statement-breakpoint
CREATE TABLE `memo_tags` (
	`memo_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`memo_id`, `tag_id`),
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memo_tags_tag_id_idx` ON `memo_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`url` text,
	`category_id` text,
	`is_ai_summary` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `memos_user_id_created_at_idx` ON `memos` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_limits` (
	`plan_id` text NOT NULL,
	`metric` text NOT NULL,
	`limit_value` integer,
	PRIMARY KEY(`plan_id`, `metric`),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plan_limits_limit_value_non_negative" CHECK("plan_limits"."limit_value" IS NULL OR "plan_limits"."limit_value" >= 0)
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
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`impersonated_by` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `share_intake_files` (
	`id` text PRIMARY KEY NOT NULL,
	`share_intake_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`etag` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`share_intake_id`) REFERENCES `share_intakes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "share_intake_files_size_bytes_non_negative" CHECK("share_intake_files"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_intake_files_reservation_id_unique` ON `share_intake_files` (`reservation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `share_intake_files_r2_key_unique` ON `share_intake_files` (`r2_key`);--> statement-breakpoint
CREATE INDEX `share_intake_files_share_intake_id_idx` ON `share_intake_files` (`share_intake_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `share_intake_files_user_id_idx` ON `share_intake_files` (`user_id`);--> statement-breakpoint
CREATE TABLE `share_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_intakes_user_id_idx` ON `share_intakes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `share_intakes_status_expires_at_idx` ON `share_intakes` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_user_id_idx` ON `tags` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_id_name_unique` ON `tags` (`user_id`,`name`);--> statement-breakpoint
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
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`ban_reason` text,
	`ban_expires` integer,
	`plan_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `plans` (`id`, `code`, `name`, `is_default`, `is_active`)
VALUES ('free', 'free', 'Free', 1, 1);
--> statement-breakpoint
INSERT INTO `plan_limits` (`plan_id`, `metric`, `limit_value`)
VALUES
	('free', 'memo.total', 100),
	('free', 'ai_summary.monthly', 10),
	('free', 'attachment.storage_bytes', 524288000);
--> statement-breakpoint
CREATE TRIGGER `prevent_referenced_plan_delete`
BEFORE DELETE ON `plans`
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM `user` WHERE `plan_id` = OLD.`id`)
BEGIN
	SELECT RAISE(ABORT, 'cannot delete a plan assigned to a user');
END;
--> statement-breakpoint
CREATE TRIGGER `prevent_last_admin_demotion`
BEFORE UPDATE OF `role` ON `user`
FOR EACH ROW
WHEN OLD.`role` = 'admin'
	AND NEW.`role` <> 'admin'
	AND (SELECT COUNT(*) FROM `user` WHERE `role` = 'admin') <= 1
BEGIN
	SELECT RAISE(ABORT, 'cannot demote the last administrator');
END;

CREATE TABLE `memo_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`memo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`etag` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memo_attachments_size_bytes_non_negative" CHECK("memo_attachments"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memo_attachments_r2_key_unique` ON `memo_attachments` (`r2_key`);--> statement-breakpoint
CREATE INDEX `memo_attachments_memo_id_idx` ON `memo_attachments` (`memo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `memo_attachments_user_id_idx` ON `memo_attachments` (`user_id`);--> statement-breakpoint
INSERT INTO `plan_limits` (`plan_id`, `metric`, `limit_value`)
VALUES ('free', 'attachment.storage_bytes', 524288000)
ON CONFLICT (`plan_id`, `metric`) DO UPDATE SET `limit_value` = excluded.`limit_value`;

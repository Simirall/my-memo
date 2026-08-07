CREATE TABLE `share_intake_files` (
	`id` text PRIMARY KEY NOT NULL,
	`share_intake_id` text NOT NULL,
	`user_id` text NOT NULL,
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
CREATE INDEX `share_intakes_status_expires_at_idx` ON `share_intakes` (`status`,`expires_at`);
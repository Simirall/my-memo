CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`category_id` text,
	`ai_generated` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_email_created_at_idx` ON `memos` (`user_email`,`created_at`);
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memos` (
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
INSERT INTO `__new_memos`("id", "user_id", "title", "content", "url", "category_id", "is_ai_summary", "created_at", "updated_at") SELECT "id", "user_id", "title", CASE
	WHEN trim("content", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = '' THEN NULL
	ELSE "content"
END, "url", "category_id", "is_ai_summary", "created_at", "updated_at" FROM `memos`;--> statement-breakpoint
DROP TABLE `memos`;--> statement-breakpoint
ALTER TABLE `__new_memos` RENAME TO `memos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `memos_user_id_created_at_idx` ON `memos` (`user_id`,`created_at`);

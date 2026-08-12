PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "categories_sort_order_non_negative" CHECK("__new_categories"."sort_order" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "user_id", "name", "sort_order", "created_at", "updated_at")
SELECT
	"id",
	"user_id",
	"name",
	ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "name", "id") - 1,
	"created_at",
	"updated_at"
FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `categories_user_id_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE INDEX `categories_user_id_sort_order_idx` ON `categories` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_id_name_unique` ON `categories` (`user_id`,`name`);

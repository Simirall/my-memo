PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memo_attachments` (
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
	CONSTRAINT "memo_attachments_size_bytes_non_negative" CHECK("__new_memo_attachments"."size_bytes" >= 0),
	CONSTRAINT "memo_attachments_thumbnail_fields" CHECK(("__new_memo_attachments"."thumbnail_r2_key" IS NULL AND "__new_memo_attachments"."thumbnail_content_type" IS NULL AND "__new_memo_attachments"."thumbnail_size_bytes" IS NULL)
        OR ("__new_memo_attachments"."thumbnail_r2_key" IS NOT NULL AND "__new_memo_attachments"."thumbnail_content_type" IN ('image/avif', 'image/webp') AND "__new_memo_attachments"."thumbnail_size_bytes" > 0)),
	CONSTRAINT "memo_attachments_media_dimensions_pair" CHECK(("__new_memo_attachments"."media_width" IS NULL AND "__new_memo_attachments"."media_height" IS NULL)
        OR ("__new_memo_attachments"."media_width" > 0 AND "__new_memo_attachments"."media_height" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_memo_attachments`("id", "memo_id", "user_id", "r2_key", "thumbnail_r2_key", "thumbnail_content_type", "thumbnail_size_bytes", "file_name", "content_type", "size_bytes", "media_width", "media_height", "etag", "created_at") SELECT "id", "memo_id", "user_id", "r2_key", NULL, NULL, NULL, "file_name", "content_type", "size_bytes", "media_width", "media_height", "etag", "created_at" FROM `memo_attachments`;--> statement-breakpoint
DROP TABLE `memo_attachments`;--> statement-breakpoint
ALTER TABLE `__new_memo_attachments` RENAME TO `memo_attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `memo_attachments_r2_key_unique` ON `memo_attachments` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `memo_attachments_thumbnail_r2_key_unique` ON `memo_attachments` (`thumbnail_r2_key`);--> statement-breakpoint
CREATE INDEX `memo_attachments_memo_id_idx` ON `memo_attachments` (`memo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `memo_attachments_user_id_idx` ON `memo_attachments` (`user_id`);

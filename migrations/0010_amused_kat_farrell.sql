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
CREATE INDEX `link_preview_cache_maintenance_idx` ON `link_preview_cache` (`last_referenced_at`,`lease_until`);
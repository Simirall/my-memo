CREATE TABLE `account_deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`receipt_hash` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`last_failure` text,
	`requested_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "account_deletion_requests_status" CHECK("account_deletion_requests"."status" IN ('processing', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_requests_user_unique` ON `account_deletion_requests` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_requests_receipt_unique` ON `account_deletion_requests` (`receipt_hash`);
--> statement-breakpoint
CREATE TRIGGER `prevent_deleting_user_attachment_insert`
BEFORE INSERT ON `memo_attachments`
WHEN EXISTS (
	SELECT 1 FROM `account_deletion_requests`
	WHERE `user_id` = NEW.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'account deletion is in progress');
END;
--> statement-breakpoint
CREATE TRIGGER `prevent_deleting_user_reservation_insert`
BEFORE INSERT ON `attachment_upload_reservations`
WHEN EXISTS (
	SELECT 1 FROM `account_deletion_requests`
	WHERE `user_id` = NEW.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'account deletion is in progress');
END;
--> statement-breakpoint
CREATE TRIGGER `prevent_deleting_user_share_file_insert`
BEFORE INSERT ON `share_intake_files`
WHEN EXISTS (
	SELECT 1 FROM `account_deletion_requests`
	WHERE `user_id` = NEW.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'account deletion is in progress');
END;

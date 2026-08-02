PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER `prevent_referenced_plan_delete`;--> statement-breakpoint
CREATE TABLE `__new_user` (
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
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "role", "banned", "ban_reason", "ban_expires", "plan_id", "created_at", "updated_at") SELECT "id", "name", "email", "email_verified", "image", "role", "banned", "ban_reason", "ban_expires", "plan_id", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
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

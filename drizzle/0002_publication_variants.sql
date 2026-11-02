ALTER TABLE `receipts` ADD COLUMN `variant` text NOT NULL DEFAULT 'video';--> statement-breakpoint
DROP INDEX IF EXISTS `receipts_story_platform`;--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_story_platform_variant` ON `receipts` (`story_id`,`platform`,`variant`);

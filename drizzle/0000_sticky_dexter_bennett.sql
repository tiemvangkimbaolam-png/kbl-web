CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`purpose` text NOT NULL,
	`public` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_purpose` ON `assets` (`purpose`,`created_at`);--> statement-breakpoint
CREATE TABLE `editions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`captured_at` integer,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` text,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_at` ON `events` (`at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`owner` text,
	`exclude_account` text,
	`lease_hash` text,
	`lease_until` integer,
	`attempt` integer DEFAULT 0 NOT NULL,
	`result` text,
	`result_hash` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_story_stage` ON `jobs` (`story_id`,`stage`);--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_story_platform` ON `receipts` (`story_id`,`platform`);--> statement-breakpoint
CREATE TABLE `records` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_kind_id` ON `records` (`kind`,`id`);--> statement-breakpoint
CREATE INDEX `records_kind_updated` ON `records` (`kind`,`updated_at`);
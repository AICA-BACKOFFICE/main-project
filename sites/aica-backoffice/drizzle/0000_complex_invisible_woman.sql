CREATE TABLE `cms_page_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page` text NOT NULL,
	`name` text NOT NULL,
	`html` text NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_backups_page` ON `cms_page_backups` (`page`,`id`);--> statement-breakpoint
CREATE TABLE `cms_page_drafts` (
	`page` text PRIMARY KEY NOT NULL,
	`html` text NOT NULL,
	`base_hash` text NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_page_files` (
	`path` text PRIMARY KEY NOT NULL,
	`html` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_records` (
	`collection` text NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`collection`, `key`)
);
--> statement-breakpoint
CREATE INDEX `cms_records_collection` ON `cms_records` (`collection`);--> statement-breakpoint
CREATE TABLE `cms_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

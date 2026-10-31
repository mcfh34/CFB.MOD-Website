CREATE TABLE `api_payload_index` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`checksum` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `background_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`input_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `weekly_api_cache` (
	`cache_key` text NOT NULL,
	`part` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`cache_key`, `part`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `weekly_stats_runs` (
	`slot` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);

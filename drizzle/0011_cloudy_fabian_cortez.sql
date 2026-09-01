CREATE TABLE `depth_chart_coverage` (
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`search_query` text DEFAULT '' NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`verified_snapshot_count` integer DEFAULT 0 NOT NULL,
	`verified_entry_count` integer DEFAULT 0 NOT NULL,
	`unresolved_entry_count` integer DEFAULT 0 NOT NULL,
	`latest_snapshot_at` text,
	`best_source_kind` text,
	`next_action` text DEFAULT 'Locate official team game notes or media guide' NOT NULL,
	`last_attempt_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `team`)
);
--> statement-breakpoint
CREATE INDEX `depth_chart_coverage_status_idx` ON `depth_chart_coverage` (`status`,`season`);--> statement-breakpoint
CREATE INDEX `depth_chart_coverage_season_idx` ON `depth_chart_coverage` (`season`,`team`);--> statement-breakpoint
CREATE TABLE `depth_chart_entries` (
	`source_id` text NOT NULL,
	`entry_index` integer NOT NULL,
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`side` text NOT NULL,
	`role` text NOT NULL,
	`position` text NOT NULL,
	`depth` integer NOT NULL,
	`player_name` text NOT NULL,
	`jersey` integer,
	`roster_player_id` text,
	`match_method` text DEFAULT 'unmatched' NOT NULL,
	`match_confidence` real DEFAULT 0 NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`source_id`, `entry_index`)
);
--> statement-breakpoint
CREATE INDEX `depth_chart_entries_team_season_idx` ON `depth_chart_entries` (`team`,`season`);--> statement-breakpoint
CREATE INDEX `depth_chart_entries_source_idx` ON `depth_chart_entries` (`source_id`);--> statement-breakpoint
CREATE INDEX `depth_chart_entries_player_idx` ON `depth_chart_entries` (`player_name`,`season`);--> statement-breakpoint
CREATE TABLE `depth_chart_import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`requested_count` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);

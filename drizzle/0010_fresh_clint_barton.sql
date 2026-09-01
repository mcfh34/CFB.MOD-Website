CREATE TABLE `depth_chart_snapshots` (
	`source_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`published_at` text NOT NULL,
	`snapshot_week` integer,
	`source_kind` text NOT NULL,
	`source_label` text NOT NULL,
	`source_url` text NOT NULL,
	`chart_json` text DEFAULT '{}' NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`matched_players` integer DEFAULT 0 NOT NULL,
	`listed_players` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `depth_chart_snapshots_team_season_idx` ON `depth_chart_snapshots` (`team`,`season`);--> statement-breakpoint
CREATE INDEX `depth_chart_snapshots_season_date_idx` ON `depth_chart_snapshots` (`season`,`published_at`);
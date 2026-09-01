CREATE TABLE `player_sync_state` (
	`season` integer PRIMARY KEY NOT NULL,
	`stage` text DEFAULT 'roster' NOT NULL,
	`roster_count` integer DEFAULT 0 NOT NULL,
	`stat_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`ppa_count` integer DEFAULT 0 NOT NULL,
	`team_count` integer DEFAULT 0 NOT NULL,
	`model_version` integer DEFAULT 1 NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_team_profiles` (
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`roster_json` text DEFAULT '[]' NOT NULL,
	`stats_json` text DEFAULT '[]' NOT NULL,
	`success_json` text DEFAULT '[]' NOT NULL,
	`usage_json` text DEFAULT '[]' NOT NULL,
	`ppa_json` text DEFAULT '[]' NOT NULL,
	`profile_json` text DEFAULT '{}' NOT NULL,
	`source_quality` text DEFAULT 'building' NOT NULL,
	`model_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `team`)
);
--> statement-breakpoint
CREATE INDEX `player_team_profiles_season_idx` ON `player_team_profiles` (`season`);
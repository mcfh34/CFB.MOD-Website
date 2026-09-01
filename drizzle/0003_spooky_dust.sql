CREATE TABLE `advanced_sync_state` (
	`season` integer PRIMARY KEY NOT NULL,
	`completed_game_count` integer DEFAULT 0 NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_game_advanced_stats` (
	`game_id` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`team` text NOT NULL,
	`opponent` text NOT NULL,
	`off_line_yards` real,
	`off_second_level_yards` real,
	`off_open_field_yards` real,
	`off_passing_success_rate` real,
	`off_passing_explosiveness` real,
	`def_line_yards` real,
	`def_second_level_yards` real,
	`def_open_field_yards` real,
	`def_passing_success_rate` real,
	`def_passing_explosiveness` real,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`game_id`, `team`)
);
--> statement-breakpoint
CREATE INDEX `team_game_advanced_stats_season_week_idx` ON `team_game_advanced_stats` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `team_game_advanced_stats_team_idx` ON `team_game_advanced_stats` (`team`,`season`);--> statement-breakpoint
CREATE TABLE `weekly_advanced_profiles` (
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`team` text NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`profile_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `week`, `team`)
);
--> statement-breakpoint
CREATE INDEX `weekly_advanced_profiles_team_idx` ON `weekly_advanced_profiles` (`team`,`season`,`week`);--> statement-breakpoint
ALTER TABLE `team_game_stats` ADD `pass_completions` real;
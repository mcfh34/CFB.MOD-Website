CREATE TABLE `betting_lines` (
	`game_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`provider` text,
	`spread` real,
	`spread_open` real,
	`formatted_spread` text,
	`over_under` real,
	`over_under_open` real,
	`home_moneyline` real,
	`away_moneyline` real,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `betting_lines_season_week_idx` ON `betting_lines` (`season`,`week`);--> statement-breakpoint
CREATE TABLE `cfb_games` (
	`game_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`season_type` text DEFAULT 'regular' NOT NULL,
	`start_date` text,
	`completed` integer DEFAULT false NOT NULL,
	`neutral_site` integer DEFAULT false NOT NULL,
	`conference_game` integer DEFAULT false NOT NULL,
	`venue` text,
	`home_team` text NOT NULL,
	`home_conference` text,
	`home_points` integer,
	`away_team` text NOT NULL,
	`away_conference` text,
	`away_points` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cfb_games_season_week_idx` ON `cfb_games` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `cfb_games_home_idx` ON `cfb_games` (`home_team`);--> statement-breakpoint
CREATE INDEX `cfb_games_away_idx` ON `cfb_games` (`away_team`);--> statement-breakpoint
CREATE TABLE `cfb_teams` (
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`team_id` text,
	`abbreviation` text,
	`mascot` text,
	`conference` text,
	`color` text,
	`alt_color` text,
	`logo` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `team`)
);
--> statement-breakpoint
CREATE INDEX `cfb_teams_season_idx` ON `cfb_teams` (`season`);--> statement-breakpoint
CREATE TABLE `model_predictions` (
	`game_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`generated_from_week` integer NOT NULL,
	`home_team` text NOT NULL,
	`away_team` text NOT NULL,
	`home_score` real NOT NULL,
	`away_score` real NOT NULL,
	`home_win_probability` real NOT NULL,
	`model_home_spread` real NOT NULL,
	`model_total` real NOT NULL,
	`vegas_spread` real,
	`vegas_total` real,
	`spread_edge` real,
	`total_edge` real,
	`spread_error` real,
	`total_error` real,
	`spread_result` text,
	`total_result` text,
	`model_version` text DEFAULT 'harper-plus-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_predictions_season_week_idx` ON `model_predictions` (`season`,`week`);--> statement-breakpoint
CREATE TABLE `model_snapshots` (
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`team_count` integer NOT NULL,
	`game_count` integer NOT NULL,
	`completed_game_count` integer NOT NULL,
	`source` text DEFAULT 'CollegeFootballData' NOT NULL,
	`model_version` text DEFAULT 'harper-plus-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `week`)
);
--> statement-breakpoint
CREATE TABLE `team_game_stats` (
	`game_id` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`team` text NOT NULL,
	`opponent` text NOT NULL,
	`home_away` text NOT NULL,
	`points` integer,
	`total_yards` real DEFAULT 0 NOT NULL,
	`yards_per_play` real DEFAULT 0 NOT NULL,
	`pass_yards` real DEFAULT 0 NOT NULL,
	`pass_attempts` real DEFAULT 0 NOT NULL,
	`yards_per_pass` real DEFAULT 0 NOT NULL,
	`rush_yards` real DEFAULT 0 NOT NULL,
	`rush_attempts` real DEFAULT 0 NOT NULL,
	`yards_per_rush` real DEFAULT 0 NOT NULL,
	`turnovers` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`game_id`, `team`)
);
--> statement-breakpoint
CREATE INDEX `team_game_stats_season_week_idx` ON `team_game_stats` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `team_game_stats_team_idx` ON `team_game_stats` (`team`);--> statement-breakpoint
CREATE TABLE `weekly_profiles` (
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`team` text NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`off_ypp` real NOT NULL,
	`off_ypa` real NOT NULL,
	`off_ypc` real NOT NULL,
	`off_patt` real NOT NULL,
	`off_ratt` real NOT NULL,
	`def_ypp` real NOT NULL,
	`def_ypa` real NOT NULL,
	`def_ypc` real NOT NULL,
	`def_patt` real NOT NULL,
	`def_ratt` real NOT NULL,
	`off_ypp_index` real NOT NULL,
	`off_ypa_index` real NOT NULL,
	`off_ypc_index` real NOT NULL,
	`off_patt_index` real NOT NULL,
	`off_ratt_index` real NOT NULL,
	`def_ypp_index` real NOT NULL,
	`def_ypa_index` real NOT NULL,
	`def_ypc_index` real NOT NULL,
	`def_patt_index` real NOT NULL,
	`def_ratt_index` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `week`, `team`)
);
--> statement-breakpoint
CREATE INDEX `weekly_profiles_team_idx` ON `weekly_profiles` (`team`,`season`,`week`);
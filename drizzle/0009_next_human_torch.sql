CREATE TABLE `player_production_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`baseline_json` text DEFAULT '{}' NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'building' NOT NULL,
	`next_season` integer DEFAULT 2014 NOT NULL,
	`detail` text DEFAULT 'Waiting to normalize historical player production' NOT NULL,
	`model_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_production_scores` (
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`player_key` text NOT NULL,
	`position` text NOT NULL,
	`score` real NOT NULL,
	`stars` integer,
	`rating_band` integer,
	PRIMARY KEY(`season`, `team`, `player_key`)
);
--> statement-breakpoint
CREATE INDEX `player_production_scores_position_score_idx` ON `player_production_scores` (`position`,`score`);--> statement-breakpoint
CREATE INDEX `player_production_scores_season_idx` ON `player_production_scores` (`season`);
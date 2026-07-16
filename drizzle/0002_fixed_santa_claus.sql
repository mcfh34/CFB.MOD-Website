CREATE TABLE `preseason_inputs` (
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`conference` text,
	`returning_ppa` real,
	`returning_passing_ppa` real,
	`returning_receiving_ppa` real,
	`returning_rushing_ppa` real,
	`returning_usage` real,
	`returning_passing_usage` real,
	`returning_receiving_usage` real,
	`returning_rushing_usage` real,
	`recruiting_rank` integer,
	`recruiting_points` real,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`season`, `team`)
);
--> statement-breakpoint
CREATE INDEX `preseason_inputs_season_idx` ON `preseason_inputs` (`season`);
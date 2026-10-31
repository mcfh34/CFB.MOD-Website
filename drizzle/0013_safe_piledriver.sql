CREATE TABLE `games` (
	`room_code` text PRIMARY KEY NOT NULL,
	`home_token` text NOT NULL,
	`away_token` text NOT NULL,
	`state_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

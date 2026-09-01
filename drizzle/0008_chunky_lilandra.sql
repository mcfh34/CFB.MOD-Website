ALTER TABLE `player_sync_state` ADD `transfer_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_sync_state` ADD `transfer_year` integer DEFAULT 2021 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_team_profiles` ADD `transfer_json` text DEFAULT '[]' NOT NULL;
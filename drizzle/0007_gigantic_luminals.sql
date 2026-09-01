ALTER TABLE `player_sync_state` ADD `recruiting_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_sync_state` ADD `recruiting_year` integer DEFAULT 2018 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_team_profiles` ADD `recruiting_json` text DEFAULT '[]' NOT NULL;
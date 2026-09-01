ALTER TABLE `advanced_sync_state` ADD `component_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `team_game_advanced_stats` ADD `component_json` text;
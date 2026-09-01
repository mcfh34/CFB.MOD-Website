CREATE TABLE `sync_leases` (
	`scope` text PRIMARY KEY NOT NULL,
	`next_allowed_at` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

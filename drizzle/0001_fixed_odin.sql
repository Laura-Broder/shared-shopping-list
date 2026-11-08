CREATE TABLE `ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`text_hash` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`lease` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`period` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);

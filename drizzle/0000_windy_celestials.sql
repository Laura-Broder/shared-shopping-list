CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`item_key` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`department` text NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "items_quantity" CHECK("items"."quantity">0 AND "items"."quantity"<=10000),
	CONSTRAINT "items_checked" CHECK("items"."checked" IN (0,1)),
	CONSTRAINT "items_archived" CHECK("items"."archived" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_item_key_unique` ON `items` (`item_key`);--> statement-breakpoint
CREATE INDEX `items_active` ON `items` (`archived`,`checked`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`marker` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);

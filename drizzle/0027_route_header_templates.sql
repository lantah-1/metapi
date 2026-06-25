CREATE TABLE `route_header_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`headers` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `route_header_templates_name_unique` ON `route_header_templates` (`name`);
--> statement-breakpoint
ALTER TABLE `token_routes` ADD `custom_header_template_id` integer REFERENCES `route_header_templates`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `token_routes` ADD `custom_headers` text;
--> statement-breakpoint
CREATE INDEX `token_routes_custom_header_template_id_idx` ON `token_routes` (`custom_header_template_id`);

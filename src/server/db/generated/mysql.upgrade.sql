CREATE TABLE IF NOT EXISTS `route_header_templates` (`id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY, `name` TEXT NOT NULL, `description` TEXT, `headers` JSON NOT NULL, `created_at` VARCHAR(191) DEFAULT (DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')), `updated_at` VARCHAR(191) DEFAULT (DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')));
ALTER TABLE `token_routes` ADD COLUMN `custom_header_template_id` INT;
ALTER TABLE `token_routes` ADD COLUMN `custom_headers` JSON;
CREATE UNIQUE INDEX `route_header_templates_name_unique` ON `route_header_templates` (`name`(191));
CREATE INDEX `token_routes_custom_header_template_id_idx` ON `token_routes` (`custom_header_template_id`);

ALTER TABLE `companies` ADD `nature_of_business` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `executive_name` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `executive_title` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `executive_linkedin_url` text;--> statement-breakpoint
UPDATE `companies`
SET `nature_of_business` = `industry`
WHERE `nature_of_business` IS NULL AND `industry` IS NOT NULL;

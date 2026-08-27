ALTER TABLE `companies` ADD `contact_email` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `contact_name` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `contact_title` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `contact_status` text DEFAULT 'pending' NOT NULL;
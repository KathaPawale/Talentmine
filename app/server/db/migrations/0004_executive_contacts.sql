ALTER TABLE `companies` ADD `linkedin_url` text;--> statement-breakpoint
CREATE TABLE `executive_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rank` integer NOT NULL,
	`dedupe_key` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`linkedin_url` text,
	`primary_email` text,
	`primary_email_status` text DEFAULT 'unavailable' NOT NULL,
	`alternate_email` text,
	`alternate_email_status` text DEFAULT 'unavailable' NOT NULL,
	`primary_phone` text,
	`alternate_phone` text,
	`source_url` text,
	`verification_status` text DEFAULT 'unavailable' NOT NULL,
	`confidence_score` integer DEFAULT 0 NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `executive_contacts_company_dedupe` ON `executive_contacts` (`company_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `executive_contacts_company_rank` ON `executive_contacts` (`company_id`,`rank`);--> statement-breakpoint
CREATE INDEX `executive_contacts_job` ON `executive_contacts` (`job_id`);

CREATE TABLE `api_quota_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`period_key` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_quota_provider_period` ON `api_quota_usage` (`provider`,`period_key`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`website` text,
	`domain` text,
	`industry` text,
	`size_estimate` text,
	`address` text,
	`city` text,
	`region` text,
	`country` text,
	`postal_code` text,
	`lat` real,
	`lng` real,
	`phone` text,
	`place_id` text,
	`rating` real,
	`review_count` integer,
	`ats_type` text,
	`ats_token` text,
	`careers_url` text,
	`classification` text DEFAULT 'unknown' NOT NULL,
	`classification_confidence` integer DEFAULT 0 NOT NULL,
	`classification_method` text,
	`classification_reason` text,
	`postings_count` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_job_dedupe` ON `companies` (`job_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `companies_job_classification` ON `companies` (`job_id`,`classification`);--> statement-breakpoint
CREATE INDEX `companies_domain` ON `companies` (`domain`);--> statement-breakpoint
CREATE TABLE `google_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`purpose` text NOT NULL,
	`google_email` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`scopes` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_tokens_user_purpose` ON `google_tokens` (`user_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `job_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`ts` integer NOT NULL,
	`stage` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`data` text DEFAULT 'null',
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_events_job_seq` ON `job_events` (`job_id`,`seq`);--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`company_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`role_category` text DEFAULT 'other' NOT NULL,
	`role_norm_status` text DEFAULT 'pending' NOT NULL,
	`description_snippet` text DEFAULT '' NOT NULL,
	`city` text,
	`region` text,
	`country` text,
	`is_remote` integer DEFAULT false NOT NULL,
	`salary_min` real,
	`salary_max` real,
	`salary_currency` text,
	`salary_period` text,
	`employment_type` text,
	`posted_at` integer,
	`apply_url` text,
	`source_url` text,
	`source` text NOT NULL,
	`external_id` text,
	`dedupe_key` text NOT NULL,
	`duplicate_of_id` text,
	`also_seen_on` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `postings_job_dedupe` ON `job_postings` (`job_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `postings_job_role` ON `job_postings` (`job_id`,`role_category`);--> statement-breakpoint
CREATE INDEX `postings_company` ON `job_postings` (`company_id`);--> statement-breakpoint
CREATE INDEX `postings_job_source` ON `job_postings` (`job_id`,`source`);--> statement-breakpoint
CREATE INDEX `postings_job_posted` ON `job_postings` (`job_id`,`posted_at`);--> statement-breakpoint
CREATE TABLE `job_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cron` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`last_job_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`current_stage` text,
	`completed_stages` text DEFAULT '[]' NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`heartbeat_at` integer,
	`progress` real DEFAULT 0 NOT NULL,
	`eta_seconds` integer,
	`stage_timings` text DEFAULT '{}' NOT NULL,
	`totals` text DEFAULT 'null',
	`error` text,
	`resumable` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_user_created` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `source_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`source` text NOT NULL,
	`query` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`items_found` integer DEFAULT 0 NOT NULL,
	`api_calls` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_runs_job` ON `source_runs` (`job_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`picture_url` text,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
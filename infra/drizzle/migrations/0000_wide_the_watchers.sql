CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`description` text,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`media_type` text NOT NULL,
	`provider_self_id` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`cover_url` text,
	`description` text,
	`metadata` text,
	`linked_ids` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_unique` ON `media_items` (`platform`,`media_type`,`provider_self_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`session_token` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_unique` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sync_type` text NOT NULL,
	`item_count` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_item_id` text NOT NULL,
	`status` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`comment` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_mark_unique` ON `user_marks` (`user_id`,`media_item_id`);--> statement-breakpoint
CREATE INDEX `idx_user_marks_user` ON `user_marks` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`email_verified` text,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);

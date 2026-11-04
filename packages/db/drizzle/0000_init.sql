CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`lobby_id` text PRIMARY KEY NOT NULL,
	`round_no` integer NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`deadline_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lobbies` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`host_id` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`round_no` integer DEFAULT 0 NOT NULL,
	`notice` text,
	`turn_limit` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "lobbies_status_check" CHECK("lobbies"."status" in ('waiting', 'exchange', 'playing', 'finished')),
	CONSTRAINT "lobbies_turn_limit_check" CHECK("lobbies"."turn_limit" is null or "lobbies"."turn_limit" between 10 and 600)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lobbies_code_unique` ON `lobbies` (`code`);--> statement-breakpoint
CREATE INDEX `lobbies_updated_at_idx` ON `lobbies` (`updated_at`);--> statement-breakpoint
CREATE TABLE `message_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_reports_reason_check" CHECK("message_reports"."reason" is null or length("message_reports"."reason") <= 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_reports_once_key` ON `message_reports` (`message_id`,`reporter_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lobby_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`ip` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "messages_body_check" CHECK(length("messages"."body") between 1 and 300)
);
--> statement-breakpoint
CREATE INDEX `messages_lobby_id_idx` ON `messages` (`lobby_id`,`id`);--> statement-breakpoint
CREATE INDEX `messages_user_id_idx` ON `messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `players` (
	`lobby_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seat` integer NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`lobby_id`, `user_id`),
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "players_seat_check" CHECK("players"."seat" >= 0),
	CONSTRAINT "players_name_check" CHECK(length("players"."name") between 1 and 20),
	CONSTRAINT "players_role_check" CHECK("players"."role" is null or "players"."role" in ('president', 'vice_president', 'neutral', 'vice_trou', 'trou'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_lobby_name_key` ON `players` (`lobby_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `players_user_id_idx` ON `players` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_lobby_seat_key` ON `players` (`lobby_id`,`seat`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "push_subscriptions_endpoint_check" CHECK("push_subscriptions"."endpoint" like 'https://%' and length("push_subscriptions"."endpoint") <= 1000)
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
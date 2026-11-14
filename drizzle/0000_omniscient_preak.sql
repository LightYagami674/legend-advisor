CREATE TABLE `battle_spells` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`cooldown_sec` integer NOT NULL,
	`effect` text NOT NULL,
	`semantic_tags_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `battle_spells_slug_unique` ON `battle_spells` (`slug`);--> statement-breakpoint
CREATE TABLE `draft_recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`target_slot_index` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `draft_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `draft_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patch_version` text NOT NULL,
	`phase` text DEFAULT 'ban' NOT NULL,
	`my_slot_index` integer DEFAULT 1 NOT NULL,
	`active_target_slot_index` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `draft_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`team` text NOT NULL,
	`slot_index` integer NOT NULL,
	`role` text,
	`banned_hero_id` integer,
	`picked_hero_id` integer,
	`is_locked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `draft_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`banned_hero_id`) REFERENCES `heroes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`picked_hero_id`) REFERENCES `heroes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_slots_session_team_slot_idx` ON `draft_slots` (`session_id`,`team`,`slot_index`);--> statement-breakpoint
CREATE TABLE `emblems` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`role_fit` text NOT NULL,
	`attributes_json` text NOT NULL,
	`talents_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emblems_slug_unique` ON `emblems` (`slug`);--> statement-breakpoint
CREATE TABLE `failure_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dimension` text NOT NULL,
	`pattern_key` text NOT NULL,
	`rule` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_value` text,
	`occurrences` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_review_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`last_seen_review_id`) REFERENCES `post_match_reviews`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `failure_patterns_pattern_key_idx` ON `failure_patterns` (`pattern_key`);--> statement-breakpoint
CREATE TABLE `hero_comfort_pool` (
	`hero_id` integer PRIMARY KEY NOT NULL,
	`comfort_tier` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`matches_played` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`hero_id`) REFERENCES `heroes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hero_relationships` (
	`source_hero_id` integer NOT NULL,
	`target_hero_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	`win_rate_delta` real NOT NULL,
	`rank_tier` text NOT NULL,
	`explanation` text NOT NULL,
	PRIMARY KEY(`source_hero_id`, `target_hero_id`, `relation_type`, `rank_tier`),
	FOREIGN KEY (`source_hero_id`) REFERENCES `heroes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_hero_id`) REFERENCES `heroes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `heroes` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`roles` text NOT NULL,
	`lanes` text NOT NULL,
	`damage_type` text NOT NULL,
	`specialty` text NOT NULL,
	`win_rate` real NOT NULL,
	`ban_rate` real NOT NULL,
	`pick_rate` real NOT NULL,
	`recent_patch_summary` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `heroes_slug_unique` ON `heroes` (`slug`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`gold_cost` integer NOT NULL,
	`stats_json` text NOT NULL,
	`unique_passive` text NOT NULL,
	`semantic_tags_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_slug_unique` ON `items` (`slug`);--> statement-breakpoint
CREATE TABLE `patch_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`patch_version` text NOT NULL,
	`synced_at` text NOT NULL,
	`rolled_up_meta_summary` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`preferred_roles_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `post_match_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_session_id` integer NOT NULL,
	`screenshot_path` text NOT NULL,
	`secondary_screenshot_path` text,
	`user_reflection` text,
	`analysis_markdown` text,
	`teammate_driven_loss` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`draft_session_id`) REFERENCES `draft_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);

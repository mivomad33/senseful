CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`sense_ko` text NOT NULL,
	`example_en` text NOT NULL,
	`example_ko` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`excluded_at` integer,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`learning_steps` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`state` integer NOT NULL,
	`last_review` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cards_state_check" CHECK("cards"."state" between 0 and 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_item_id_unique` ON `cards` (`item_id`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`due`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`headword` text NOT NULL,
	`dict_sense_id` text NOT NULL,
	`pos` text,
	`cefr` text NOT NULL,
	`shortcut` text,
	`grammar` text,
	`labels` text,
	`definition` text NOT NULL,
	`source_slug` text NOT NULL,
	`collected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_key_unique` ON `items` (`key`);--> statement-breakpoint
CREATE INDEX `items_cefr_idx` ON `items` (`cefr`);--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`user_answer` text NOT NULL,
	`is_correct` integer NOT NULL,
	`grader_is_correct` integer NOT NULL,
	`grader_reason` text,
	`reviewed_at` integer NOT NULL,
	`rating` integer NOT NULL,
	`state` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` integer NOT NULL,
	`last_elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`learning_steps` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_logs_card_idx` ON `review_logs` (`card_id`);
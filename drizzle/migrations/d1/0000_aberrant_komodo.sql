CREATE TABLE `eval_results` (
	`run_id` text PRIMARY KEY NOT NULL,
	`schema_pass` integer NOT NULL,
	`schema_failures` text DEFAULT '[]' NOT NULL,
	`content_pass` integer NOT NULL,
	`content_failures` text DEFAULT '[]' NOT NULL,
	`tool_trace_pass` integer NOT NULL,
	`tool_trace_failures` text DEFAULT '[]' NOT NULL,
	`tools_used` text DEFAULT '[]' NOT NULL,
	`judge_pass` integer NOT NULL,
	`judge_score` integer NOT NULL,
	`judge_reasoning` text DEFAULT '' NOT NULL,
	`judge_failures` text DEFAULT '[]' NOT NULL,
	`query_addressed` integer NOT NULL,
	`freshness_ok` integer NOT NULL,
	`overall_pass` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`mcp_enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`output_key` text,
	`error_message` text
);

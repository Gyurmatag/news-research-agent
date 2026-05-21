import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  mcpEnabled: integer("mcp_enabled", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: ["pending", "running", "completed", "failed", "aborted"] })
    .notNull()
    .default("pending"),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  completedAt: integer("completed_at", { mode: "number" }),
  outputKey: text("output_key"),
  errorMessage: text("error_message"),
});

export const evalResults = sqliteTable("eval_results", {
  runId: text("run_id").primaryKey().references(() => runs.id),
  schemaPass: integer("schema_pass", { mode: "boolean" }).notNull(),
  schemaFailures: text("schema_failures").notNull().default("[]"),
  contentPass: integer("content_pass", { mode: "boolean" }).notNull(),
  contentFailures: text("content_failures").notNull().default("[]"),
  toolTracePass: integer("tool_trace_pass", { mode: "boolean" }).notNull(),
  toolTraceFailures: text("tool_trace_failures").notNull().default("[]"),
  toolsUsed: text("tools_used").notNull().default("[]"),
  judgePass: integer("judge_pass", { mode: "boolean" }).notNull(),
  judgeScore: integer("judge_score").notNull(),
  judgeReasoning: text("judge_reasoning").notNull().default(""),
  judgeFailures: text("judge_failures").notNull().default("[]"),
  queryAddressed: integer("query_addressed", { mode: "boolean" }).notNull(),
  freshnessOk: integer("freshness_ok", { mode: "boolean" }).notNull(),
  overallPass: integer("overall_pass", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type EvalResult = typeof evalResults.$inferSelect;
export type NewEvalResult = typeof evalResults.$inferInsert;

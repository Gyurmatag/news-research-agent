import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { evalResults } from "../db/schema";

export async function handleRunsEval(env: Env, runId: string): Promise<Response> {
  const db = drizzle(env.DB);
  const rows = await db.select().from(evalResults).where(eq(evalResults.runId, runId));
  if (rows.length === 0) {
    return Response.json({ status: "pending", runId }, { status: 202 });
  }
  const row = rows[0];
  return Response.json({
    status: "ready",
    runId,
    schemaPass: row.schemaPass,
    schemaFailures: safeJson(row.schemaFailures, []),
    contentPass: row.contentPass,
    contentFailures: safeJson(row.contentFailures, []),
    toolTracePass: row.toolTracePass,
    toolTraceFailures: safeJson(row.toolTraceFailures, []),
    toolsUsed: safeJson(row.toolsUsed, []),
    judgePass: row.judgePass,
    judgeScore: row.judgeScore,
    judgeReasoning: row.judgeReasoning,
    judgeFailures: safeJson(row.judgeFailures, []),
    queryAddressed: row.queryAddressed,
    freshnessOk: row.freshnessOk,
    overallPass: row.overallPass,
    createdAt: row.createdAt,
  });
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

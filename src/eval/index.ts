import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { runs, evalResults } from "../db/schema";
import { stripExcelPrefix } from "../../lib/csv";
import { runSchemaCheck } from "./schema-check";
import { runContentCheck } from "./content-check";
import { runToolTraceCheck } from "./tool-trace-check";
import { runJudge, JUDGE_PASS_THRESHOLD } from "./judge";
import type { EvalSummary } from "../../lib/agent-events";

export type ToolTrace = {
  toolsUsed: string[];
  searchBeforeWrite: boolean;
  writeSeen: boolean;
  orderedToolStarts: string[];
};

/**
 * Run the 4-layer evaluator for a run, persist results to D1, and update the runs row.
 * The caller is responsible for fetching the ordered tool starts (from the DO event log)
 * and for surfacing the resulting summary back to clients (e.g. via persistEvent).
 */
export async function runEval(
  env: Env,
  runId: string,
  trace: ToolTrace,
): Promise<EvalSummary | null> {
  const db = drizzle(env.DB);
  const existing = await db
    .select()
    .from(evalResults)
    .where(eq(evalResults.runId, runId));
  if (existing.length > 0) {
    return summaryFromRow(existing[0]);
  }

  const runRow = (await db.select().from(runs).where(eq(runs.id, runId)))[0];
  if (!runRow) return null;

  const obj = await env.RESULTS.get(`${runId}/results.csv`);
  let csvText = "";
  if (obj) {
    csvText = stripExcelPrefix(await obj.text());
  }

  const schema = runSchemaCheck(csvText);
  const content = runContentCheck(csvText);
  const tools = runToolTraceCheck(trace.orderedToolStarts);

  let judgePass = false;
  let judgeScore = 0;
  let judgeReasoning = "";
  let judgeFailures: string[] = [];
  let queryAddressed = false;
  let freshnessOk = false;
  if (csvText.trim().length > 0) {
    try {
      const judge = await runJudge({ env, query: runRow.query, csvText });
      judgePass = judge.pass && judge.score >= JUDGE_PASS_THRESHOLD;
      judgeScore = judge.score;
      judgeReasoning = judge.reasoning;
      judgeFailures = judge.failures;
      queryAddressed = judge.queryAddressed;
      freshnessOk = judge.freshnessOk;
    } catch (err) {
      judgeFailures = [`Judge invocation failed: ${String((err as Error)?.message ?? err)}`];
    }
  } else {
    judgeFailures = ["No CSV available to judge"];
  }

  const overallPass = schema.pass && content.pass && tools.pass && judgePass;

  const summary: EvalSummary = {
    schemaPass: schema.pass,
    contentPass: content.pass,
    toolTracePass: tools.pass,
    judgePass,
    judgeScore,
    overallPass,
    schemaFailures: schema.failures,
    contentFailures: content.failures,
    toolTraceFailures: tools.failures,
    judgeFailures,
    judgeReasoning,
    toolsUsed: tools.toolsUsed,
    queryAddressed,
    freshnessOk,
  };

  await db
    .insert(evalResults)
    .values({
      runId,
      schemaPass: schema.pass,
      schemaFailures: JSON.stringify(schema.failures),
      contentPass: content.pass,
      contentFailures: JSON.stringify(content.failures),
      toolTracePass: tools.pass,
      toolTraceFailures: JSON.stringify(tools.failures),
      toolsUsed: JSON.stringify(tools.toolsUsed),
      judgePass,
      judgeScore,
      judgeReasoning,
      judgeFailures: JSON.stringify(judgeFailures),
      queryAddressed,
      freshnessOk,
      overallPass,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();

  await db
    .update(runs)
    .set({
      status: runRow.status === "aborted" ? "aborted" : "completed",
      completedAt: Date.now(),
      outputKey: obj ? `${runId}/results.csv` : null,
      costUsd: runRow.costUsd,
    })
    .where(eq(runs.id, runId));

  return summary;
}

function summaryFromRow(row: typeof evalResults.$inferSelect): EvalSummary {
  return {
    schemaPass: row.schemaPass,
    schemaFailures: safe(row.schemaFailures, []),
    contentPass: row.contentPass,
    contentFailures: safe(row.contentFailures, []),
    toolTracePass: row.toolTracePass,
    toolTraceFailures: safe(row.toolTraceFailures, []),
    toolsUsed: safe(row.toolsUsed, []),
    judgePass: row.judgePass,
    judgeScore: row.judgeScore,
    judgeReasoning: row.judgeReasoning,
    judgeFailures: safe(row.judgeFailures, []),
    queryAddressed: row.queryAddressed,
    freshnessOk: row.freshnessOk,
    overallPass: row.overallPass,
  };
}

function safe<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

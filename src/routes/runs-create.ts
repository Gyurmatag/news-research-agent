import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { Env } from "../env";
import { runs } from "../db/schema";

const RequestSchema = z.object({
  query: z.string().min(3).max(2000),
  mcpEnabled: z.boolean().default(true),
});

export async function handleRunsCreate(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const runId = nanoid(12);
  const db = drizzle(env.DB);
  await db.insert(runs).values({
    id: runId,
    query: parsed.data.query,
    mcpEnabled: parsed.data.mcpEnabled,
    status: "pending",
    costUsd: 0,
    createdAt: Date.now(),
  });

  const stub = env.AGENT_SANDBOX.get(env.AGENT_SANDBOX.idFromName(runId));
  const startResp = await stub.fetch("https://do/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId,
      query: parsed.data.query,
      mcpEnabled: parsed.data.mcpEnabled,
      anthropicKey: env.ANTHROPIC_API_KEY,
      tavilyKey: env.TAVILY_API_KEY,
      model: env.AGENT_MODEL,
    }),
  });
  if (!startResp.ok) {
    await db
      .update(runs)
      .set({ status: "failed", errorMessage: `DO start ${startResp.status}` })
      .where(eqId(runId));
    return Response.json(
      { error: "Failed to start run", status: startResp.status },
      { status: 500 },
    );
  }
  await db.update(runs).set({ status: "running" }).where(eqId(runId));

  return Response.json({ runId, mcpEnabled: parsed.data.mcpEnabled });
}

import { eq } from "drizzle-orm";
function eqId(id: string) {
  return eq(runs.id, id);
}

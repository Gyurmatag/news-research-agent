import type { Env } from "../env";

export async function handleRunsOutput(
  env: Env,
  runId: string,
  mode: "output" | "download",
): Promise<Response> {
  const key = `${runId}/results.csv`;
  const obj = await env.RESULTS.get(key);
  if (!obj) {
    return Response.json({ error: "Output not ready", runId }, { status: 404 });
  }
  const headers = new Headers();
  headers.set("content-type", "text/csv; charset=utf-8");
  if (mode === "download") {
    headers.set(
      "content-disposition",
      `attachment; filename="news-research-${runId}.csv"`,
    );
  } else {
    headers.set("content-disposition", `inline; filename="news-research-${runId}.csv"`);
  }
  headers.set("cache-control", "public, max-age=300");
  return new Response(obj.body, { headers });
}

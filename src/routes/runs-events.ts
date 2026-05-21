import type { Env } from "../env";
import {
  UI_MESSAGE_STREAM_HEADER,
  UI_MESSAGE_STREAM_VERSION,
} from "../../lib/stream-protocol";
import { runEval } from "../eval";

export async function handleRunsEvents(
  request: Request,
  env: Env,
  runId: string,
): Promise<Response> {
  const stub = env.AGENT_SANDBOX.get(env.AGENT_SANDBOX.idFromName(runId));
  // Forward to the DO's /events fetch handler. Pass Last-Event-ID for replay.
  const headers = new Headers();
  const lastEventId = request.headers.get("Last-Event-ID");
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);
  headers.set("accept", "text/event-stream");
  const upstream = await stub.fetch("https://do/events", { headers });

  // Kick off eval out-of-band once the run finishes. We hook into the upstream so the
  // browser keeps receiving the live stream; eval results are pushed back to the same
  // DO via persistEvent and so reach the client through the SSE stream automatically.
  ensureEvalForRun(env, runId);

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
  responseHeaders.set("cache-control", "no-cache, no-transform");
  responseHeaders.set("connection", "keep-alive");
  responseHeaders.set(UI_MESSAGE_STREAM_HEADER, UI_MESSAGE_STREAM_VERSION);
  responseHeaders.set("x-accel-buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

const evalsInFlight = new Set<string>();

function ensureEvalForRun(env: Env, runId: string) {
  if (evalsInFlight.has(runId)) return;
  evalsInFlight.add(runId);
  void (async () => {
    try {
      const stub = env.AGENT_SANDBOX.get(env.AGENT_SANDBOX.idFromName(runId));
      // Poll for terminal status; small budget so we don't hold the connection forever.
      const start = Date.now();
      const maxMs = 5 * 60_000;
      while (Date.now() - start < maxMs) {
        const state = await stub
          .fetch("https://do/state")
          .then((r) => r.json<{ status: string; outputBytes: number; totalUsd: number }>())
          .catch(() => null);
        if (
          state &&
          (state.status === "completed" || state.status === "aborted" || state.status === "failed")
        ) {
          await runEval(env, runId, stub);
          return;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
    } catch (err) {
      console.error(`[eval-trigger] ${runId} failed`, err);
    } finally {
      evalsInFlight.delete(runId);
    }
  })();
}

import type { Env } from "../env";
import {
  UI_MESSAGE_STREAM_HEADER,
  UI_MESSAGE_STREAM_VERSION,
} from "../../lib/stream-protocol";

export async function handleRunsEvents(
  request: Request,
  env: Env,
  runId: string,
): Promise<Response> {
  const stub = env.AGENT_SANDBOX.get(env.AGENT_SANDBOX.idFromName(runId));
  const headers = new Headers();
  const lastEventId = request.headers.get("Last-Event-ID");
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);
  headers.set("accept", "text/event-stream");
  const upstream = await stub.fetch("https://do/events", { headers });

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

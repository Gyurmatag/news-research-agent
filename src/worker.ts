import { proxyToSandbox } from "@cloudflare/sandbox";
import { handleRunsCreate } from "./routes/runs-create";
import { handleRunsEvents } from "./routes/runs-events";
import { handleRunsOutput } from "./routes/runs-output";
import { handleRunsEval } from "./routes/runs-eval";
import type { Env } from "./env";

export { AgentSandbox } from "./sandbox";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Container preview URLs route through the sandbox first.
    const sandboxResponse = await proxyToSandbox(request, env as never);
    if (sandboxResponse) return sandboxResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/runs" && request.method === "POST") {
      return handleRunsCreate(request, env);
    }

    const eventsMatch = path.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (eventsMatch && request.method === "GET") {
      return handleRunsEvents(request, env, eventsMatch[1]);
    }

    const outputMatch = path.match(/^\/api\/runs\/([^/]+)\/(output|download)$/);
    if (outputMatch && request.method === "GET") {
      return handleRunsOutput(env, outputMatch[1], outputMatch[2] as "output" | "download");
    }

    const evalMatch = path.match(/^\/api\/runs\/([^/]+)\/eval$/);
    if (evalMatch && request.method === "GET") {
      return handleRunsEval(env, evalMatch[1]);
    }

    // Everything else: fall through to the Next.js app via OpenNext's generated
    // worker entry. The file lives at `.open-next/worker.js` after running
    // `opennextjs-cloudflare build`. We resolve it dynamically so dev-only consumers
    // (vitest) that have not run the build still typecheck and run.
    const openNext = (await import(
      /* webpackIgnore: true */ /* @vite-ignore */ "../.open-next/worker.js" as string
    ).catch(() => null)) as { default?: ExportedHandler<Env> } | null;
    if (openNext && typeof openNext.default?.fetch === "function") {
      return openNext.default.fetch(
        request as Parameters<NonNullable<ExportedHandler<Env>["fetch"]>>[0],
        env,
        ctx,
      );
    }
    return env.ASSETS.fetch(request);
  },
};

import { Sandbox, parseSSEStream } from "@cloudflare/sandbox";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { gt, eq } from "drizzle-orm";
import { events } from "./db/do-schema";
import { runs } from "./db/schema";
import type { Env } from "./env";
import type { AgentEvent, EvalSummary } from "../lib/agent-events";
import { MAX_USD_PER_RUN } from "../lib/cost";
import { withExcelPrefix } from "../lib/csv";
import { JsonlBuffer } from "../lib/jsonl-buffer";
import { runEval, type ToolTrace } from "./eval";
import {
  encodeUIPart,
  finishParts,
  newStreamState,
  translate,
  UI_MESSAGE_STREAM_HEADER,
  UI_MESSAGE_STREAM_VERSION,
  UI_MESSAGE_STREAM_TERMINATOR,
  type StreamProtocolState,
  type UIPart,
} from "../lib/stream-protocol";

const OUTPUT_PATH_IN_CONTAINER = "/workspace/output/results.csv";

type StoredEvent = {
  seq: number;
  payload: string;
  createdAt: number;
};

type StartRunPayload = {
  runId: string;
  query: string;
  mcpEnabled: boolean;
  anthropicKey: string;
  tavilyKey: string;
  model: string;
};

type Subscriber = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  state: StreamProtocolState;
  alive: boolean;
};

export class AgentSandbox extends Sandbox<Env> {
  defaultPort = 3000;
  sleepAfter = "10m";

  private db: DrizzleSqliteDODatabase<typeof import("./db/do-schema")> | null = null;
  private migrated = false;
  private subscribers = new Set<Subscriber>();
  private encoder = new TextEncoder();
  private latestStatus:
    | "pending"
    | "running"
    | "completed"
    | "aborted"
    | "failed" = "pending";
  private currentRunId: string | null = null;
  private runStartedAt = 0;
  private currentTotalUsd = 0;
  private currentOutputBytes = 0;
  private logsAbort: AbortController | null = null;

  private async ensureDb() {
    if (!this.db) {
      this.db = drizzle(this.ctx.storage, {
        schema: { events },
        logger: false,
      });
    }
    if (!this.migrated) {
      // Schema is small and additive — initialise via CREATE TABLE IF NOT EXISTS.
      // This keeps the DO independent of drizzle-kit's bundled-migrations format.
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
      this.migrated = true;
    }
    return this.db;
  }

  async persistEvent(payload: string): Promise<StoredEvent> {
    const db = await this.ensureDb();
    const createdAt = Date.now();
    const inserted = await db
      .insert(events)
      .values({ payload, createdAt })
      .returning();
    const row = inserted[0];
    const stored: StoredEvent = {
      seq: row.seq,
      payload,
      createdAt: row.createdAt,
    };
    let parsed: AgentEvent | null = null;
    try {
      parsed = JSON.parse(payload) as AgentEvent;
    } catch {
      parsed = null;
    }
    if (parsed) this.broadcastSse(stored, parsed);
    return stored;
  }

  private broadcastSse(stored: StoredEvent, event: AgentEvent) {
    const dead: Subscriber[] = [];
    for (const sub of this.subscribers) {
      if (!sub.alive) {
        dead.push(sub);
        continue;
      }
      try {
        const parts = translate(sub.state, event, this.currentRunId ?? "msg");
        for (const p of parts) {
          sub.controller.enqueue(this.encoder.encode(encodeUIPart(p)));
        }
        sub.controller.enqueue(this.encoder.encode(`id: ${stored.seq}\n`));
      } catch {
        sub.alive = false;
        dead.push(sub);
      }
    }
    for (const d of dead) this.subscribers.delete(d);
  }

  private flushFinishToAll() {
    const dead: Subscriber[] = [];
    for (const sub of this.subscribers) {
      try {
        for (const p of finishParts(sub.state)) {
          sub.controller.enqueue(this.encoder.encode(encodeUIPart(p)));
        }
        sub.controller.enqueue(this.encoder.encode(UI_MESSAGE_STREAM_TERMINATOR));
        sub.controller.close();
      } catch {
        // ignore
      }
      sub.alive = false;
      dead.push(sub);
    }
    for (const d of dead) this.subscribers.delete(d);
  }

  private async getEventsAfter(seq: number): Promise<StoredEvent[]> {
    const db = await this.ensureDb();
    const rows = await db
      .select()
      .from(events)
      .where(gt(events.seq, seq))
      .orderBy(events.seq);
    return rows.map((r) => ({ seq: r.seq, payload: r.payload, createdAt: r.createdAt }));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/events") return this.handleEventsStream(request);
    if (url.pathname === "/start") return this.handleStart(request);
    if (url.pathname === "/state") return this.handleState();
    if (url.pathname === "/persist-event") {
      const body = await request.json<{ payload: string }>();
      const stored = await this.persistEvent(body.payload);
      return Response.json(stored);
    }
    return super.fetch(request);
  }

  private async handleState(): Promise<Response> {
    return Response.json({
      runId: this.currentRunId,
      status: this.latestStatus,
      totalUsd: this.currentTotalUsd,
      outputBytes: this.currentOutputBytes,
    });
  }

  private async handleEventsStream(request: Request): Promise<Response> {
    await this.ensureDb();
    const lastEventIdHeader = request.headers.get("Last-Event-ID");
    const lastEventId = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) || 0 : 0;
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const sub: Subscriber = {
          controller,
          state: newStreamState(),
          alive: true,
        };
        this.subscribers.add(sub);
        controller.enqueue(this.encoder.encode(`: connected\n\n`));
        // Replay any events the client missed.
        try {
          const replay = await this.getEventsAfter(lastEventId);
          for (const stored of replay) {
            try {
              const parsed = JSON.parse(stored.payload) as AgentEvent;
              const parts = translate(sub.state, parsed, this.currentRunId ?? "msg");
              for (const p of parts) {
                controller.enqueue(this.encoder.encode(encodeUIPart(p)));
              }
              controller.enqueue(this.encoder.encode(`id: ${stored.seq}\n`));
            } catch {
              // skip malformed
            }
          }
        } catch {
          // ignore replay errors
        }
        // If the run is terminal, finish the stream immediately.
        if (
          this.latestStatus === "completed" ||
          this.latestStatus === "aborted" ||
          this.latestStatus === "failed"
        ) {
          try {
            for (const p of finishParts(sub.state)) {
              controller.enqueue(this.encoder.encode(encodeUIPart(p)));
            }
            controller.enqueue(this.encoder.encode(UI_MESSAGE_STREAM_TERMINATOR));
            controller.close();
          } catch {}
          sub.alive = false;
          this.subscribers.delete(sub);
        }
      },
      cancel: () => {
        for (const sub of this.subscribers) {
          if (sub.controller.desiredSize == null) sub.alive = false;
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        [UI_MESSAGE_STREAM_HEADER]: UI_MESSAGE_STREAM_VERSION,
        "x-accel-buffering": "no",
      },
    });
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json<StartRunPayload>();
    if (this.currentRunId && this.latestStatus === "running") {
      return Response.json(
        { error: "Run already in progress", runId: this.currentRunId },
        { status: 409 },
      );
    }
    this.currentRunId = body.runId;
    this.latestStatus = "running";
    this.currentTotalUsd = 0;
    this.currentOutputBytes = 0;
    this.runStartedAt = Date.now();
    // Fire-and-forget: keep the DO alive while the run executes.
    this.ctx.waitUntil(this.executeRun(body));
    return Response.json({ ok: true, runId: body.runId });
  }

  private async executeRun(payload: StartRunPayload) {
    try {
      console.log(`[run ${payload.runId}] executeRun starting (mcp=${payload.mcpEnabled})`);
      await this.setEnvVars({
        ANTHROPIC_API_KEY: payload.anthropicKey,
        TAVILY_API_KEY: payload.tavilyKey,
        AGENT_MODEL: payload.model,
        MAX_USD_PER_RUN: String(MAX_USD_PER_RUN),
        RUN_ID: payload.runId,
        USER_QUERY: payload.query,
        MCP_ENABLED: payload.mcpEnabled ? "true" : "false",
      });
      console.log(`[run ${payload.runId}] envVars set, starting process`);

      // Persist a run_init so it can be replayed to late subscribers.
      await this.persistEvent(
        JSON.stringify({
          type: "run_init",
          runId: payload.runId,
          query: payload.query,
          mcpEnabled: payload.mcpEnabled,
          model: payload.model,
          timestamp: Date.now(),
        } satisfies AgentEvent),
      );

      // Start the agent process. It writes one JSON event per line to stdout.
      const proc = await this.startProcess("node /workspace/agent-script.mjs", {
        env: {
          RUN_ID: payload.runId,
          USER_QUERY: payload.query,
          MCP_ENABLED: payload.mcpEnabled ? "true" : "false",
          AGENT_MODEL: payload.model,
          MAX_USD_PER_RUN: String(MAX_USD_PER_RUN),
          ANTHROPIC_API_KEY: payload.anthropicKey,
          TAVILY_API_KEY: payload.tavilyKey,
        },
      });
      console.log(`[run ${payload.runId}] process started id=${proc.id}, opening log stream`);

      this.logsAbort = new AbortController();
      const logStream = await this.streamProcessLogs(proc.id, {
        signal: this.logsAbort.signal,
      });
      console.log(`[run ${payload.runId}] log stream open, consuming`);
      await this.consumeAgentStream(logStream, payload);
      console.log(`[run ${payload.runId}] stream consumed, uploading R2`);
      await this.uploadResultsToR2(payload.runId);
      this.latestStatus = this.latestStatus === "aborted" ? "aborted" : "completed";

      await this.updateRunRowToCompleted(payload.runId);

      const completeEvent: AgentEvent = {
        type: "run_complete",
        totalUsd: this.currentTotalUsd,
        outputBytes: this.currentOutputBytes,
        durationMs: Date.now() - this.runStartedAt,
      };
      await this.persistEvent(JSON.stringify(completeEvent));
      console.log(`[run ${payload.runId}] complete, totalUsd=${this.currentTotalUsd} bytes=${this.currentOutputBytes}`);

      // Auto-run the 4-layer eval. Failures are surfaced as agent_error events but
      // do NOT mark the overall run as failed (the agent already finished).
      try {
        const trace = await this.listToolStartsBeforeFirstWrite();
        const summary = await runEval(this.env, payload.runId, trace);
        if (summary) {
          await this.recordEvalSummary(summary);
        }
        console.log(`[run ${payload.runId}] eval done pass=${summary?.overallPass}`);
      } catch (err) {
        const message = String((err as Error)?.message ?? err);
        console.error(`[run ${payload.runId}] eval failed: ${message}`);
        await this.persistEvent(
          JSON.stringify({
            type: "agent_error",
            message: `Eval failed: ${message}`,
          } satisfies AgentEvent),
        );
      }
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      const stack = (err as Error)?.stack ?? "";
      console.error(`[run ${payload.runId}] FAILED: ${message}\n${stack}`);
      this.latestStatus = "failed";
      await this.persistEvent(JSON.stringify({ type: "agent_error", message } satisfies AgentEvent));
      try {
        const d1 = drizzleD1(this.env.DB);
        await d1.update(runs).set({ status: "failed", errorMessage: message, completedAt: Date.now() }).where(eq(runs.id, payload.runId));
      } catch {}
    } finally {
      this.flushFinishToAll();
    }
  }

  private async updateRunRowToCompleted(runId: string) {
    try {
      const d1 = drizzleD1(this.env.DB);
      await d1
        .update(runs)
        .set({
          status: this.latestStatus === "aborted" ? "aborted" : "completed",
          costUsd: this.currentTotalUsd,
          outputKey: this.currentOutputBytes > 0 ? `${runId}/results.csv` : null,
          completedAt: Date.now(),
        })
        .where(eq(runs.id, runId));
    } catch (err) {
      console.error(`[run ${runId}] failed to update D1 row:`, err);
    }
  }

  private async consumeAgentStream(
    logStream: ReadableStream<Uint8Array>,
    payload: StartRunPayload,
  ) {
    // streamProcessLogs() returns an SSE stream where each event has the shape
    // { type: "stdout" | "stderr" | "process_info" | "process_exit", data?: string, ... }.
    // Stdout from the agent script is JSONL; we feed it through JsonlBuffer to
    // reconstruct AgentEvents across chunk boundaries.
    const jsonl = new JsonlBuffer<AgentEvent>();
    const errBuf: string[] = [];
    let events = 0;
    type ProcEvent = {
      type?: string;
      data?: string;
      exitCode?: number;
      processId?: string;
    };
    for await (const event of parseSSEStream<ProcEvent>(logStream)) {
      events++;
      if (events <= 3) {
        console.log(
          `[run ${payload.runId}] sse #${events} type=${event?.type} dataLen=${event?.data?.length ?? 0}`,
        );
      }
      if (!event) continue;
      if (event.type === "stdout" && typeof event.data === "string") {
        const parsed = jsonl.push(event.data);
        for (const ev of parsed) {
          await this.handleAgentEvent(ev, payload);
        }
      } else if (event.type === "stderr" && typeof event.data === "string") {
        errBuf.push(event.data);
        if (errBuf.length <= 5) {
          console.log(`[run ${payload.runId}] stderr: ${event.data.slice(0, 200)}`);
        }
      } else if (event.type === "process_exit") {
        console.log(
          `[run ${payload.runId}] process_exit exitCode=${event.exitCode ?? "n/a"}`,
        );
      }
    }
    for (const ev of jsonl.flush()) {
      await this.handleAgentEvent(ev, payload);
    }
    if (errBuf.length > 0) {
      const sample = errBuf.join("").slice(-1000);
      console.log(`[run ${payload.runId}] stderr tail: ${sample}`);
    }
    console.log(`[run ${payload.runId}] sse stream done, total events=${events}`);
  }

  private async handleAgentEvent(event: AgentEvent, payload: StartRunPayload) {
    // Defense-in-depth cost cap.
    if (event.type === "cost_update") {
      this.currentTotalUsd = event.totalUsd;
      if (event.totalUsd >= MAX_USD_PER_RUN && this.latestStatus !== "aborted") {
        this.latestStatus = "aborted";
        await this.persistEvent(JSON.stringify(event));
        await this.persistEvent(
          JSON.stringify({
            type: "run_aborted",
            reason: `DO enforced cost cap at $${MAX_USD_PER_RUN.toFixed(2)} (observed $${event.totalUsd.toFixed(4)})`,
            totalUsd: event.totalUsd,
          } satisfies AgentEvent),
        );
        try {
          await this.killAllProcesses();
        } catch {}
        return;
      }
    }
    if (event.type === "run_aborted") {
      this.latestStatus = "aborted";
    }
    if (event.type === "run_complete") {
      this.currentTotalUsd = event.totalUsd;
      this.currentOutputBytes = event.outputBytes;
    }
    await this.persistEvent(JSON.stringify(event));
  }

  private async uploadResultsToR2(runId: string) {
    try {
      const exists = await this.exists(OUTPUT_PATH_IN_CONTAINER);
      if (!exists || !exists.exists) return;
      const file = await this.readFile(OUTPUT_PATH_IN_CONTAINER, { encoding: "utf-8" });
      const raw = (file as { content: string }).content ?? "";
      const wrapped = withExcelPrefix(raw);
      const key = `${runId}/results.csv`;
      await this.env.RESULTS.put(key, wrapped, {
        httpMetadata: {
          contentType: "text/csv; charset=utf-8",
          contentDisposition: `attachment; filename="news-research-${runId}.csv"`,
        },
        customMetadata: { runId },
      });
      this.currentOutputBytes = new TextEncoder().encode(wrapped).byteLength;
    } catch (err) {
      await this.persistEvent(
        JSON.stringify({
          type: "agent_error",
          message: `R2 upload failed: ${String((err as Error)?.message ?? err)}`,
        } satisfies AgentEvent),
      );
    }
  }

  async recordEvalSummary(summary: EvalSummary): Promise<void> {
    await this.persistEvent(
      JSON.stringify({ type: "eval_complete", summary } satisfies AgentEvent),
    );
    // Eval is the final signal — close any live subscribers.
    this.flushFinishToAll();
  }

  async listToolStartsBeforeFirstWrite(): Promise<ToolTrace> {
    const db = await this.ensureDb();
    const rows = await db.select().from(events).orderBy(events.seq);
    const orderedToolStarts: string[] = [];
    let writeSeen = false;
    let searchBeforeWrite = false;
    const SEARCH_TOOLS = new Set([
      "WebSearch",
      "WebFetch",
      "mcp__tavily__tavily_search",
      "mcp__tavily__tavily_extract",
    ]);
    for (const row of rows) {
      try {
        const ev = JSON.parse(row.payload) as AgentEvent;
        if (ev.type === "tool_start") {
          orderedToolStarts.push(ev.toolName);
          if (!writeSeen && SEARCH_TOOLS.has(ev.toolName)) {
            searchBeforeWrite = true;
          }
          if (ev.toolName === "Write") writeSeen = true;
        }
      } catch {
        // skip
      }
    }
    return {
      toolsUsed: Array.from(new Set(orderedToolStarts)),
      searchBeforeWrite,
      writeSeen,
      orderedToolStarts,
    };
  }
}

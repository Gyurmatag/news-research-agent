/**
 * news-research-agent — agent runner (executed inside the Cloudflare Sandbox container).
 *
 * Self-contained: do NOT import from `../lib/...` — the container image only has files
 * copied via the Dockerfile (this file + node_modules from container/package.json).
 *
 * Input: environment variables
 *   RUN_ID            run identifier (echoed back in run_init)
 *   USER_QUERY        the user's research query
 *   MCP_ENABLED       'true' / 'false'
 *   ANTHROPIC_API_KEY required
 *   TAVILY_API_KEY    required when MCP_ENABLED=true
 *   AGENT_MODEL       claude model id (default claude-sonnet-4-6)
 *   MAX_USD_PER_RUN   USD cost cap (default 0.5)
 *
 * Output: one JSON-per-line on stdout (the DO parses these as AgentEvents).
 * Deliverable: writes /workspace/output/results.csv (UTF-8, comma-separated, with
 * columns title,source,url,date,summary) BEFORE finishing.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import Papa from "papaparse";

const RUN_ID = process.env.RUN_ID ?? "unknown";
const USER_QUERY = process.env.USER_QUERY ?? "";
const MCP_ENABLED = (process.env.MCP_ENABLED ?? "true").toLowerCase() === "true";
const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-4-6";
const MAX_USD_PER_RUN = Number.parseFloat(process.env.MAX_USD_PER_RUN ?? "1.0");
const OUTPUT_PATH = "/workspace/output/results.csv";
const REQUIRED_COLUMNS = ["title", "source", "url", "date", "summary"];

mkdirSync("/workspace/output", { recursive: true });

// Sonnet 4.6 pricing
function usdFromUsage(usage = {}) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (input * 3 +
      output * 15 +
      cacheCreate * 3 * 1.25 +
      cacheRead * 3 * 0.1) /
    1_000_000
  );
}

function emit(event) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

function safeJson(value) {
  try {
    if (typeof value === "string") return value.length > 800 ? value.slice(0, 800) + "…" : value;
    const s = JSON.stringify(value);
    return s.length > 1200 ? JSON.parse(s.slice(0, 1200) + '..."') ?? value : value;
  } catch {
    return String(value).slice(0, 800);
  }
}

const SEARCH_TOOL_NAMES = new Set([
  "WebSearch",
  "WebFetch",
  "mcp__tavily__tavily_search",
  "mcp__tavily__tavily_extract",
]);

const systemPrompt = `You are a news research agent.

For each user query you MUST:
1. Use a search tool BEFORE writing any output. ${MCP_ENABLED ? "Prefer the Tavily MCP tools (tavily_search, tavily_extract) — they return structured, fresh results with cite-able URLs and publication dates." : "Use the built-in WebSearch / WebFetch tools."}
2. Find at least 5 distinct, recent articles. Prefer the last 7 days; never older than 30 days.
3. The set must span at least 3 distinct source domains. No duplicate URLs.
4. Verify each article's URL and publication date against the retrieved source — never invent.
5. Write the results to ${OUTPUT_PATH} as a CSV with columns: ${REQUIRED_COLUMNS.join(",")}.
   - Use ISO date format YYYY-MM-DD.
   - Quote fields that contain commas, quotes, or newlines.
   - Use the publisher name (e.g. "The Verge", "Reuters") for the source column.
6. After the Write succeeds, briefly summarize what you found in chat. The CSV file on disk is the required deliverable; if it is missing, the run fails evaluation.

If a search returns no useful results, broaden your terms and try again before giving up.`;

const baseAllowedTools = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"];
const mcpAllowedTools = MCP_ENABLED
  ? ["mcp__tavily__tavily_search", "mcp__tavily__tavily_extract"]
  : [];
const allowedTools = [...baseAllowedTools, ...mcpAllowedTools];

const baseOptions = {
  model: AGENT_MODEL,
  cwd: "/workspace",
  systemPrompt,
  maxTurns: 25,
  permissionMode: "acceptEdits",
  allowedTools,
  includePartialMessages: true,
  canUseTool: async () => ({ behavior: "allow", updatedInput: {} }),
  hooks: {
    PreToolUse: [
      {
        hooks: [
          async (input) => {
            emit({
              type: "tool_start",
              toolUseId: input.tool_use_id,
              toolName: input.tool_name,
              toolInput: safeJson(input.tool_input),
            });
            return { permissionDecision: "allow" };
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          async (input) => {
            emit({
              type: "tool_end",
              toolUseId: input.tool_use_id,
              toolName: input.tool_name,
              toolOutput: safeJson(input.tool_response),
              durationMs: input.duration_ms,
            });
            return {};
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          async () => {
            if (existsSync(OUTPUT_PATH)) return { decision: "approve" };
            return {
              decision: "block",
              stopReason: "Missing required deliverable",
              systemMessage: `You have not written ${OUTPUT_PATH} yet. The CSV file on disk is the required deliverable. Use the Write tool to create it now with columns ${REQUIRED_COLUMNS.join(",")} and at least 5 rows.`,
            };
          },
        ],
      },
    ],
  },
};

const options = MCP_ENABLED
  ? {
      ...baseOptions,
      mcpServers: {
        tavily: {
          type: "stdio",
          command: "node",
          args: ["/workspace/node_modules/tavily-mcp/build/index.js"],
          env: {
            TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
          },
        },
      },
    }
  : baseOptions;

emit({
  type: "run_init",
  runId: RUN_ID,
  query: USER_QUERY,
  mcpEnabled: MCP_ENABLED,
  model: AGENT_MODEL,
  timestamp: Date.now(),
});

const startedAt = Date.now();
let totalUsd = 0;
let aborted = false;
const textBlockIds = new Map(); // message uuid -> text block index

async function run() {
  let stream;
  try {
    stream = query({ prompt: USER_QUERY, options });
  } catch (err) {
    emit({ type: "agent_error", message: `Failed to start agent: ${String(err?.message ?? err)}` });
    process.exit(0);
  }

  // Streaming partial messages emit content_block_delta events with text or thinking
  // deltas. We translate those into assistant_text_delta / reasoning_delta. The full
  // `assistant` message at the end of each turn carries usage; we use that to update cost
  // and trip the cap. The final `result` message carries total_cost_usd.
  function checkCostCap() {
    if (totalUsd >= MAX_USD_PER_RUN && !aborted) {
      aborted = true;
      emit({
        type: "run_aborted",
        reason: `Cost cap of $${MAX_USD_PER_RUN.toFixed(2)} reached (used $${totalUsd.toFixed(4)})`,
        totalUsd,
      });
      try {
        stream.interrupt?.();
      } catch {}
      return true;
    }
    return false;
  }

  try {
    for await (const message of stream) {
      if (aborted) break;

      if (message.type === "stream_event") {
        const ev = message.event;
        if (!ev || typeof ev !== "object") continue;
        const textId = `${message.uuid}-${ev.index ?? 0}`;
        // Reasoning is grouped per assistant message (turn) so that multiple
        // thinking blocks interleaved with tool calls in the same turn show as
        // a single collapsible "Thinking" panel in the UI instead of several
        // disconnected ones.
        const reasoningId = `${message.uuid}-thinking`;
        if (ev.type === "content_block_delta" && ev.delta) {
          if (ev.delta.type === "text_delta" && typeof ev.delta.text === "string") {
            textBlockIds.set(textId, true);
            emit({ type: "assistant_text_delta", id: textId, delta: ev.delta.text });
          } else if (ev.delta.type === "thinking_delta" && typeof ev.delta.thinking === "string") {
            emit({ type: "reasoning_delta", id: reasoningId, delta: ev.delta.thinking });
          }
        }
        // ignore message_start/content_block_start/content_block_stop/message_delta — usage
        // arrives on the full assistant message
      } else if (message.type === "assistant") {
        const usage = message.message?.usage;
        if (usage) {
          totalUsd += usdFromUsage(usage);
          emit({
            type: "cost_update",
            totalUsd,
            capUsd: MAX_USD_PER_RUN,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
          });
          if (checkCostCap()) break;
        }
      } else if (message.type === "result") {
        if (typeof message.total_cost_usd === "number") {
          totalUsd = message.total_cost_usd;
          emit({ type: "cost_update", totalUsd, capUsd: MAX_USD_PER_RUN });
        }
        if (message.subtype === "error_max_budget_usd") {
          aborted = true;
          emit({
            type: "run_aborted",
            reason: "SDK budget exceeded",
            totalUsd,
          });
        }
      }
    }
  } catch (err) {
    emit({ type: "agent_error", message: `Agent stream error: ${String(err?.message ?? err)}` });
  }

  if (aborted) {
    // Even on abort, attempt CSV normalization in case partial results exist.
  }

  // Post-process: normalize CSV through papaparse (RFC 4180 quoting/ordering) if present.
  let outputBytes = 0;
  if (existsSync(OUTPUT_PATH)) {
    try {
      const raw = readFileSync(OUTPUT_PATH, "utf-8");
      const parsed = Papa.parse(raw, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim().toLowerCase(),
      });
      const rows = (parsed.data ?? []).map((r) => ({
        title: String(r.title ?? "").trim(),
        source: String(r.source ?? "").trim(),
        url: String(r.url ?? "").trim(),
        date: String(r.date ?? "").trim(),
        summary: String(r.summary ?? "").trim(),
      }));
      const normalized = Papa.unparse(rows, {
        columns: REQUIRED_COLUMNS,
        header: true,
        newline: "\n",
      });
      writeFileSync(OUTPUT_PATH, normalized + "\n", "utf-8");
      outputBytes = Buffer.byteLength(normalized, "utf-8") + 1;
    } catch (err) {
      emit({
        type: "agent_error",
        message: `Failed to normalize CSV: ${String(err?.message ?? err)}`,
      });
    }
  } else {
    emit({
      type: "agent_error",
      message: `Required deliverable ${OUTPUT_PATH} not found at end of run.`,
    });
  }

  emit({
    type: "run_complete",
    totalUsd,
    outputBytes,
    durationMs: Date.now() - startedAt,
  });
  process.exit(0);
}

run().catch((err) => {
  emit({ type: "agent_error", message: String(err?.message ?? err) });
  process.exit(0);
});

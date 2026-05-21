import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../lib/agent-events";
import {
  encodeUIPart,
  finishParts,
  newStreamState,
  translate,
  UI_MESSAGE_STREAM_HEADER,
  UI_MESSAGE_STREAM_VERSION,
} from "../../lib/stream-protocol";

const MID = "msg-1";

describe("translate", () => {
  it("emits start + start-step before any other content (idempotent)", () => {
    const state = newStreamState();
    const init: AgentEvent = {
      type: "run_init",
      runId: "r-1",
      query: "q",
      mcpEnabled: true,
      model: "claude-sonnet-4-6",
      timestamp: 1,
    };
    const parts1 = translate(state, init, MID);
    expect(parts1.find((p) => p.type === "start")).toBeTruthy();
    expect(parts1.find((p) => p.type === "start-step")).toBeTruthy();

    const parts2 = translate(state, init, MID);
    expect(parts2.find((p) => p.type === "start")).toBeFalsy();
  });

  it("opens a text block on first text-delta and reuses it for subsequent deltas", () => {
    const state = newStreamState();
    const out1 = translate(
      state,
      { type: "assistant_text_delta", id: "t1", delta: "Hello " },
      MID,
    );
    expect(out1.filter((p) => p.type === "text-start")).toHaveLength(1);
    expect(out1.filter((p) => p.type === "text-delta")).toHaveLength(1);

    const out2 = translate(
      state,
      { type: "assistant_text_delta", id: "t1", delta: "world" },
      MID,
    );
    expect(out2.filter((p) => p.type === "text-start")).toHaveLength(0);
    expect(out2.filter((p) => p.type === "text-delta")).toHaveLength(1);
  });

  it("emits tool-input-available and tool-output-available with the same toolCallId", () => {
    const state = newStreamState();
    const start = translate(
      state,
      {
        type: "tool_start",
        toolUseId: "tu-1",
        toolName: "tavily_search",
        toolInput: { q: "ai" },
      },
      MID,
    );
    const startPart = start.find((p) => p.type === "tool-input-available");
    expect(startPart).toMatchObject({
      type: "tool-input-available",
      toolCallId: "tu-1",
      toolName: "tavily_search",
    });

    const end = translate(
      state,
      {
        type: "tool_end",
        toolUseId: "tu-1",
        toolName: "tavily_search",
        toolOutput: { hits: 3 },
      },
      MID,
    );
    expect(end.find((p) => p.type === "tool-output-available")).toMatchObject({
      type: "tool-output-available",
      toolCallId: "tu-1",
    });
  });

  it("data-cost carries usd + cap", () => {
    const state = newStreamState();
    const out = translate(
      state,
      { type: "cost_update", totalUsd: 0.12, capUsd: 0.5 },
      MID,
    );
    expect(out[0]).toEqual({ type: "data-cost", data: { totalUsd: 0.12, capUsd: 0.5 } });
  });

  it("data-eval forwards the full summary", () => {
    const state = newStreamState();
    const summary = {
      schemaPass: true,
      contentPass: true,
      toolTracePass: true,
      judgePass: true,
      judgeScore: 90,
      overallPass: true,
      schemaFailures: [],
      contentFailures: [],
      toolTraceFailures: [],
      judgeFailures: [],
      judgeReasoning: "looks good",
      toolsUsed: ["tavily_search"],
      queryAddressed: true,
      freshnessOk: true,
    };
    const out = translate(state, { type: "eval_complete", summary }, MID);
    expect(out[0]).toEqual({ type: "data-eval", data: summary });
  });

  it("finishParts closes any open text/reasoning blocks then finishes", () => {
    const state = newStreamState();
    translate(state, { type: "assistant_text_delta", id: "t1", delta: "x" }, MID);
    translate(state, { type: "reasoning_delta", id: "r1", delta: "y" }, MID);
    const out = finishParts(state);
    expect(out.find((p) => p.type === "text-end" && p.id === "t1")).toBeTruthy();
    expect(out.find((p) => p.type === "reasoning-end" && p.id === "r1")).toBeTruthy();
    expect(out.at(-1)).toEqual({ type: "finish" });
    expect(state.messageStarted).toBe(false);
  });
});

describe("encodeUIPart", () => {
  it("encodes as SSE data line followed by blank line", () => {
    expect(encodeUIPart({ type: "finish" })).toBe(`data: {"type":"finish"}\n\n`);
  });
});

describe("constants", () => {
  it("v1 stream header constants exposed", () => {
    expect(UI_MESSAGE_STREAM_HEADER).toBe("x-vercel-ai-ui-message-stream");
    expect(UI_MESSAGE_STREAM_VERSION).toBe("v1");
  });
});

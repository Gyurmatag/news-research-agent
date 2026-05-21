import { describe, expect, it } from "vitest";
import {
  extractToolStartsFromEvents,
  runToolTraceCheck,
  SEARCH_TOOLS,
} from "../../src/eval/tool-trace-check";

describe("tool-trace-check", () => {
  it("passes when a search tool fires before Write", () => {
    const r = runToolTraceCheck(["mcp__tavily__tavily_search", "WebFetch", "Write"]);
    expect(r.pass).toBe(true);
    expect(r.searchBeforeWrite).toBe(true);
    expect(r.writeSeen).toBe(true);
  });

  it("fails when Write happens before any search tool", () => {
    const r = runToolTraceCheck(["Write", "WebSearch"]);
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("did not call any search tool before"))).toBe(true);
  });

  it("fails when Write is never called", () => {
    const r = runToolTraceCheck(["WebSearch"]);
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("never called the Write tool"))).toBe(true);
  });

  it("WebSearch, WebFetch, tavily search/extract are all recognised as search tools", () => {
    expect(SEARCH_TOOLS.has("WebSearch")).toBe(true);
    expect(SEARCH_TOOLS.has("WebFetch")).toBe(true);
    expect(SEARCH_TOOLS.has("mcp__tavily__tavily_search")).toBe(true);
    expect(SEARCH_TOOLS.has("mcp__tavily__tavily_extract")).toBe(true);
  });

  it("extractToolStartsFromEvents parses ordered tool_start payloads", () => {
    const payloads = [
      JSON.stringify({ type: "tool_start", toolName: "WebSearch", toolUseId: "1" }),
      JSON.stringify({ type: "assistant_text_delta", id: "x", delta: "hi" }),
      JSON.stringify({ type: "tool_start", toolName: "Write", toolUseId: "2" }),
      "not-json",
    ];
    expect(extractToolStartsFromEvents(payloads)).toEqual(["WebSearch", "Write"]);
  });
});

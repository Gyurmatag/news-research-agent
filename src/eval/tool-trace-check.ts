import type { AgentEvent } from "../../lib/agent-events";

export type ToolTraceCheckResult = {
  pass: boolean;
  failures: string[];
  toolsUsed: string[];
  searchBeforeWrite: boolean;
  writeSeen: boolean;
};

export const SEARCH_TOOLS = new Set([
  "WebSearch",
  "WebFetch",
  "mcp__tavily__tavily_search",
  "mcp__tavily__tavily_extract",
]);

export function runToolTraceCheck(toolStartsInOrder: string[]): ToolTraceCheckResult {
  const failures: string[] = [];
  const used = Array.from(new Set(toolStartsInOrder));
  let searchBeforeWrite = false;
  let writeSeen = false;
  for (const name of toolStartsInOrder) {
    if (!writeSeen && SEARCH_TOOLS.has(name)) searchBeforeWrite = true;
    if (name === "Write") writeSeen = true;
  }
  if (!writeSeen) failures.push("Agent never called the Write tool");
  if (!searchBeforeWrite)
    failures.push(
      "Agent did not call any search tool before the first Write — output is not grounded in retrieved sources",
    );
  return {
    pass: failures.length === 0,
    failures,
    toolsUsed: used,
    searchBeforeWrite,
    writeSeen,
  };
}

export function extractToolStartsFromEvents(payloads: string[]): string[] {
  const out: string[] = [];
  for (const p of payloads) {
    try {
      const ev = JSON.parse(p) as AgentEvent;
      if (ev.type === "tool_start") out.push(ev.toolName);
    } catch {
      // skip
    }
  }
  return out;
}

import type { AgentEvent, EvalSummary } from "./agent-events";

export const UI_MESSAGE_STREAM_HEADER = "x-vercel-ai-ui-message-stream";
export const UI_MESSAGE_STREAM_VERSION = "v1";
export const UI_MESSAGE_STREAM_TERMINATOR = "data: [DONE]\n\n";

export type UIPart =
  | { type: "start"; messageId: string }
  | { type: "start-step" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown }
  | {
      type: "tool-output-available";
      toolCallId: string;
      output: unknown;
      isError?: boolean;
    }
  | {
      type: "data-cost";
      data: { totalUsd: number; capUsd: number };
    }
  | {
      type: "data-eval";
      data: EvalSummary;
    }
  | {
      type: "data-status";
      data: { status: "running" | "aborted" | "completed" | "failed"; message?: string; outputBytes?: number; totalUsd?: number };
    }
  | { type: "finish-step" }
  | { type: "finish" }
  | { type: "error"; errorText: string };

export type StreamProtocolState = {
  messageStarted: boolean;
  stepStarted: boolean;
  openTextIds: Set<string>;
  openReasoningIds: Set<string>;
};

export function newStreamState(): StreamProtocolState {
  return {
    messageStarted: false,
    stepStarted: false,
    openTextIds: new Set(),
    openReasoningIds: new Set(),
  };
}

function ensureStartParts(state: StreamProtocolState, messageId: string): UIPart[] {
  const parts: UIPart[] = [];
  if (!state.messageStarted) {
    parts.push({ type: "start", messageId });
    state.messageStarted = true;
  }
  if (!state.stepStarted) {
    parts.push({ type: "start-step" });
    state.stepStarted = true;
  }
  return parts;
}

function closeOpenStreams(state: StreamProtocolState): UIPart[] {
  const parts: UIPart[] = [];
  for (const id of state.openTextIds) parts.push({ type: "text-end", id });
  state.openTextIds.clear();
  for (const id of state.openReasoningIds) parts.push({ type: "reasoning-end", id });
  state.openReasoningIds.clear();
  return parts;
}

/**
 * Translate an internal agent event into zero or more UI Message Stream parts.
 * Pure function: mutates `state` in place and returns the parts to emit next.
 */
export function translate(
  state: StreamProtocolState,
  event: AgentEvent,
  messageId: string,
): UIPart[] {
  const parts: UIPart[] = [];
  switch (event.type) {
    case "run_init":
      parts.push(...ensureStartParts(state, messageId));
      parts.push({
        type: "data-status",
        data: { status: "running", message: `Run ${event.runId} started (MCP=${event.mcpEnabled ? "on" : "off"})` },
      });
      break;
    case "assistant_text_delta":
      parts.push(...ensureStartParts(state, messageId));
      if (!state.openTextIds.has(event.id)) {
        parts.push({ type: "text-start", id: event.id });
        state.openTextIds.add(event.id);
      }
      parts.push({ type: "text-delta", id: event.id, delta: event.delta });
      break;
    case "reasoning_delta":
      parts.push(...ensureStartParts(state, messageId));
      if (!state.openReasoningIds.has(event.id)) {
        parts.push({ type: "reasoning-start", id: event.id });
        state.openReasoningIds.add(event.id);
      }
      parts.push({ type: "reasoning-delta", id: event.id, delta: event.delta });
      break;
    case "tool_start":
      parts.push(...ensureStartParts(state, messageId));
      parts.push({
        type: "tool-input-available",
        toolCallId: event.toolUseId,
        toolName: event.toolName,
        input: event.toolInput,
      });
      break;
    case "tool_end":
      parts.push({
        type: "tool-output-available",
        toolCallId: event.toolUseId,
        output: event.toolOutput,
        isError: event.isError,
      });
      break;
    case "cost_update":
      parts.push({
        type: "data-cost",
        data: { totalUsd: event.totalUsd, capUsd: event.capUsd },
      });
      break;
    case "run_aborted":
      parts.push(...closeOpenStreams(state));
      parts.push({
        type: "data-status",
        data: { status: "aborted", message: event.reason, totalUsd: event.totalUsd },
      });
      break;
    case "run_complete":
      parts.push(...closeOpenStreams(state));
      parts.push({
        type: "data-status",
        data: {
          status: "completed",
          totalUsd: event.totalUsd,
          outputBytes: event.outputBytes,
        },
      });
      break;
    case "agent_error":
      parts.push(...closeOpenStreams(state));
      parts.push({ type: "data-status", data: { status: "failed", message: event.message } });
      parts.push({ type: "error", errorText: event.message });
      break;
    case "eval_complete":
      parts.push({ type: "data-eval", data: event.summary });
      break;
  }
  return parts;
}

export function encodeUIPart(part: UIPart): string {
  return `data: ${JSON.stringify(part)}\n\n`;
}

export function finishParts(state: StreamProtocolState): UIPart[] {
  const parts: UIPart[] = closeOpenStreams(state);
  if (state.stepStarted) {
    parts.push({ type: "finish-step" });
    state.stepStarted = false;
  }
  if (state.messageStarted) {
    parts.push({ type: "finish" });
    state.messageStarted = false;
  }
  return parts;
}

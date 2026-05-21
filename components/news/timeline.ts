import type { UIPart } from "@/lib/stream-protocol";
import type { EvalSummary } from "@/lib/agent-events";

export type TimelineText = {
  kind: "text";
  id: string;
  content: string;
};

export type TimelineReasoning = {
  kind: "reasoning";
  id: string;
  content: string;
};

export type TimelineTool = {
  kind: "tool";
  toolCallId: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  errorText?: string;
};

export type TimelineItem = TimelineText | TimelineReasoning | TimelineTool;

export type RunSnapshot = {
  status: "idle" | "running" | "completed" | "aborted" | "failed";
  message?: string;
  totalUsd: number;
  outputBytes?: number;
  evalSummary?: EvalSummary;
  timeline: TimelineItem[];
};

export function emptySnapshot(): RunSnapshot {
  return { status: "idle", totalUsd: 0, timeline: [] };
}

export function reduceParts(snapshot: RunSnapshot, parts: UIPart[]): RunSnapshot {
  const timeline = [...snapshot.timeline];
  let status = snapshot.status;
  let message = snapshot.message;
  let totalUsd = snapshot.totalUsd;
  let outputBytes = snapshot.outputBytes;
  let evalSummary = snapshot.evalSummary;

  function ensureText(id: string): TimelineText {
    const existing = timeline.find((t) => t.kind === "text" && t.id === id) as TimelineText | undefined;
    if (existing) return existing;
    const fresh: TimelineText = { kind: "text", id, content: "" };
    timeline.push(fresh);
    return fresh;
  }
  function ensureReasoning(id: string): TimelineReasoning {
    const existing = timeline.find((t) => t.kind === "reasoning" && t.id === id) as
      | TimelineReasoning
      | undefined;
    if (existing) return existing;
    const fresh: TimelineReasoning = { kind: "reasoning", id, content: "" };
    timeline.push(fresh);
    return fresh;
  }

  for (const part of parts) {
    switch (part.type) {
      case "text-delta": {
        const t = ensureText(part.id);
        t.content += part.delta;
        break;
      }
      case "text-start":
        ensureText(part.id);
        break;
      case "reasoning-delta": {
        const r = ensureReasoning(part.id);
        r.content += part.delta;
        break;
      }
      case "reasoning-start":
        ensureReasoning(part.id);
        break;
      case "tool-input-available": {
        const existing = timeline.find(
          (t) => t.kind === "tool" && t.toolCallId === part.toolCallId,
        ) as TimelineTool | undefined;
        if (existing) {
          existing.input = part.input;
          existing.state = "input-available";
        } else {
          timeline.push({
            kind: "tool",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            state: "input-available",
          });
        }
        break;
      }
      case "tool-output-available": {
        const existing = timeline.find(
          (t) => t.kind === "tool" && t.toolCallId === part.toolCallId,
        ) as TimelineTool | undefined;
        if (existing) {
          existing.output = part.output;
          existing.state = part.isError ? "output-error" : "output-available";
          if (part.isError) existing.errorText = String(part.output ?? "Tool error");
        }
        break;
      }
      case "data-cost":
        totalUsd = part.data.totalUsd;
        break;
      case "data-eval":
        evalSummary = part.data;
        break;
      case "data-status":
        if (
          part.data.status === "running" ||
          part.data.status === "completed" ||
          part.data.status === "aborted" ||
          part.data.status === "failed"
        ) {
          status = part.data.status;
        }
        message = part.data.message ?? message;
        if (typeof part.data.totalUsd === "number") totalUsd = part.data.totalUsd;
        if (typeof part.data.outputBytes === "number") outputBytes = part.data.outputBytes;
        break;
      case "error":
        status = "failed";
        message = part.errorText;
        break;
      default:
        break;
    }
  }

  return { status, message, totalUsd, outputBytes, evalSummary, timeline };
}

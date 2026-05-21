export type AgentEvent =
  | RunInitEvent
  | AssistantTextDeltaEvent
  | ReasoningDeltaEvent
  | ToolStartEvent
  | ToolEndEvent
  | CostUpdateEvent
  | RunAbortedEvent
  | RunCompleteEvent
  | AgentErrorEvent
  | EvalCompleteEvent;

export type RunInitEvent = {
  type: "run_init";
  runId: string;
  query: string;
  mcpEnabled: boolean;
  model: string;
  timestamp: number;
};

export type AssistantTextDeltaEvent = {
  type: "assistant_text_delta";
  id: string;
  delta: string;
};

export type ReasoningDeltaEvent = {
  type: "reasoning_delta";
  id: string;
  delta: string;
};

export type ToolStartEvent = {
  type: "tool_start";
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
};

export type ToolEndEvent = {
  type: "tool_end";
  toolUseId: string;
  toolName: string;
  toolOutput?: unknown;
  isError?: boolean;
  durationMs?: number;
};

export type CostUpdateEvent = {
  type: "cost_update";
  totalUsd: number;
  capUsd: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type RunAbortedEvent = {
  type: "run_aborted";
  reason: string;
  totalUsd?: number;
};

export type RunCompleteEvent = {
  type: "run_complete";
  totalUsd: number;
  outputBytes: number;
  durationMs: number;
};

export type AgentErrorEvent = {
  type: "agent_error";
  message: string;
};

export type EvalSummary = {
  schemaPass: boolean;
  contentPass: boolean;
  toolTracePass: boolean;
  judgePass: boolean;
  judgeScore: number;
  overallPass: boolean;
  schemaFailures: string[];
  contentFailures: string[];
  toolTraceFailures: string[];
  judgeFailures: string[];
  judgeReasoning: string;
  toolsUsed: string[];
  queryAddressed: boolean;
  freshnessOk: boolean;
};

export type EvalCompleteEvent = {
  type: "eval_complete";
  summary: EvalSummary;
};

export function isAgentEvent(value: unknown): value is AgentEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

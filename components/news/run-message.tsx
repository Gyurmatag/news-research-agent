"use client";

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { EvalVerdictCard } from "./eval-verdict-card";
import { CostPill } from "./cost-pill";
import { CsvPreview } from "./csv-preview";
import type { RunSnapshot } from "./timeline";

const TOOL_STATE_MAP = {
  "input-streaming": "input-streaming",
  "input-available": "input-available",
  "output-available": "output-available",
  "output-error": "output-error",
} as const;

export function RunMessage({
  runId,
  snapshot,
}: {
  runId: string;
  snapshot: RunSnapshot;
}) {
  const hasOutput =
    snapshot.status === "completed" || snapshot.status === "aborted" || (snapshot.outputBytes ?? 0) > 0;
  const showCsv = hasOutput;
  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full max-w-full">
        {snapshot.timeline.map((item) => {
          if (item.kind === "text") {
            if (item.content.trim() === "") return null;
            return (
              <div key={`text-${item.id}`} className="prose prose-sm max-w-none dark:prose-invert">
                <MessageResponse>{item.content}</MessageResponse>
              </div>
            );
          }
          if (item.kind === "reasoning") {
            if (item.content.trim() === "") return null;
            return (
              <Reasoning key={`reasoning-${item.id}`} isStreaming={snapshot.status === "running"}>
                <ReasoningTrigger />
                <ReasoningContent>{item.content}</ReasoningContent>
              </Reasoning>
            );
          }
          // tool
          return (
            <Tool key={`tool-${item.toolCallId}`} defaultOpen={item.state === "output-error"}>
              <ToolHeader
                type="dynamic-tool"
                toolName={item.toolName}
                state={TOOL_STATE_MAP[item.state]}
              />
              <ToolContent>
                {item.input !== undefined && <ToolInput input={item.input} />}
                {(item.output !== undefined || item.errorText) && (
                  <ToolOutput output={item.output} errorText={item.errorText} />
                )}
              </ToolContent>
            </Tool>
          );
        })}

        {showCsv && <CsvPreview runId={runId} ready={hasOutput} />}

        {snapshot.evalSummary && <EvalVerdictCard summary={snapshot.evalSummary} />}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Status:{" "}
            <span
              className={
                snapshot.status === "completed"
                  ? "text-emerald-600 font-medium"
                  : snapshot.status === "aborted"
                    ? "text-amber-600 font-medium"
                    : snapshot.status === "failed"
                      ? "text-red-600 font-medium"
                      : "font-medium"
              }
            >
              {snapshot.status}
            </span>
            {snapshot.message ? ` — ${snapshot.message}` : ""}
          </span>
          <CostPill totalUsd={snapshot.totalUsd} capUsd={0.5} />
        </div>
      </MessageContent>
    </Message>
  );
}

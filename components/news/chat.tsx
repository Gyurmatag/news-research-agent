"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { UIPart } from "@/lib/stream-protocol";
import { emptySnapshot, reduceParts, type RunSnapshot } from "./timeline";
import { RunMessage } from "./run-message";
import { SuggestedPrompts } from "./suggested-prompts";
import { Sparkles } from "lucide-react";

type Exchange = {
  runId: string;
  query: string;
  mcpEnabled: boolean;
  snapshot: RunSnapshot;
};

export function Chat() {
  return (
    <PromptInputProvider>
      <ChatInner />
    </PromptInputProvider>
  );
}

function ChatInner() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const controller = usePromptInputController();

  // Always have the latest setter, but never re-create handlers
  const setExchangesRef = useRef(setExchanges);
  useEffect(() => {
    setExchangesRef.current = setExchanges;
  }, []);

  const handlePartsForRun = useCallback((runId: string, parts: UIPart[]) => {
    setExchangesRef.current((prev) =>
      prev.map((e) =>
        e.runId === runId ? { ...e, snapshot: reduceParts(e.snapshot, parts) } : e,
      ),
    );
  }, []);

  const submitQuery = useCallback(
    async (query: string, mcp: boolean) => {
      if (!query.trim() || busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: query.trim(), mcpEnabled: mcp }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        const data = (await res.json()) as { runId: string; mcpEnabled: boolean };
        const newExchange: Exchange = {
          runId: data.runId,
          query: query.trim(),
          mcpEnabled: data.mcpEnabled,
          snapshot: { ...emptySnapshot(), status: "running" },
        };
        setExchangesRef.current((prev) => [...prev, newExchange]);
        startSse(data.runId, handlePartsForRun, () => setBusy(false));
        controller.textInput.clear();
      } catch (err) {
        setExchangesRef.current((prev) => [
          ...prev,
          {
            runId: `local-${Date.now()}`,
            query: query.trim(),
            mcpEnabled: mcp,
            snapshot: {
              ...emptySnapshot(),
              status: "failed",
              message: String((err as Error)?.message ?? err),
            },
          },
        ]);
        setBusy(false);
      }
    },
    [busy, controller, handlePartsForRun],
  );

  const onPromptSubmit = useCallback(
    async (msg: PromptInputMessage) => {
      await submitQuery(msg.text, mcpEnabled);
    },
    [mcpEnabled, submitQuery],
  );

  const onPickSuggested = useCallback(
    (q: string) => {
      controller.textInput.setInput(q);
    },
    [controller],
  );

  const isEmpty = exchanges.length === 0;

  return (
    <>
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-2xl">
          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-muted p-3 text-muted-foreground">
                  <Sparkles className="size-5" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-xl font-semibold tracking-tight">
                    What news brief should I build for you?
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Get 5+ cited articles plus an evaluator-checked CSV in under two minutes.
                  </p>
                </div>
              </div>
              <SuggestedPrompts onPick={onPickSuggested} disabled={busy} />
            </div>
          ) : (
            exchanges.map((ex) => (
              <div key={ex.runId} className="space-y-4">
                <Message from="user">
                  <MessageContent>{ex.query}</MessageContent>
                </Message>
                <div className="text-xs text-muted-foreground">
                  Run <span className="font-mono">{ex.runId}</span> · MCP{" "}
                  <span className="font-medium">{ex.mcpEnabled ? "on" : "off"}</span>
                </div>
                <RunMessage runId={ex.runId} snapshot={ex.snapshot} />
              </div>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl p-3">
          <PromptInput onSubmit={onPromptSubmit}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="e.g. Find 5 recent articles about AI safety from the last 7 days" />
              <PromptInputFooter>
                <PromptInputTools>
                  <div className="flex items-center gap-2 rounded-md px-2 py-1">
                    <Switch
                      id="mcp-toggle"
                      checked={mcpEnabled}
                      onCheckedChange={setMcpEnabled}
                      disabled={busy}
                    />
                    <Label htmlFor="mcp-toggle" className="cursor-pointer text-xs font-medium">
                      Tavily MCP
                    </Label>
                  </div>
                </PromptInputTools>
                <PromptInputSubmit status={busy ? "streaming" : "ready"} />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
          <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
            Cost cap $0.50 · CSV at /workspace/output/results.csv · 4-layer eval
          </p>
        </div>
      </div>
    </>
  );
}

function startSse(
  runId: string,
  onParts: (runId: string, parts: UIPart[]) => void,
  onDone: () => void,
) {
  const es = new EventSource(`/api/runs/${runId}/events`);
  let receivedFinish = false;
  es.onmessage = (e) => {
    if (e.data === "[DONE]") {
      receivedFinish = true;
      es.close();
      onDone();
      return;
    }
    try {
      const part = JSON.parse(e.data) as UIPart;
      onParts(runId, [part]);
      if (part.type === "finish") {
        receivedFinish = true;
        es.close();
        onDone();
      }
    } catch {
      // ignore malformed messages
    }
  };
  es.onerror = () => {
    if (!receivedFinish) {
      es.close();
      onDone();
    }
  };
}

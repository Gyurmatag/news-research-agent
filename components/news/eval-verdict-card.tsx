"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import type { EvalSummary } from "@/lib/agent-events";

export function EvalVerdictCard({ summary }: { summary: EvalSummary }) {
  const layers: Array<{
    key: string;
    label: string;
    pass: boolean;
    failures: string[];
    extra?: React.ReactNode;
  }> = [
    {
      key: "schema",
      label: "Schema",
      pass: summary.schemaPass,
      failures: summary.schemaFailures,
    },
    {
      key: "content",
      label: "Content (≥5 rows, ≥3 domains, ≤30 days, no dup URLs)",
      pass: summary.contentPass,
      failures: summary.contentFailures,
    },
    {
      key: "tool-trace",
      label: "Tool trace (search before Write)",
      pass: summary.toolTracePass,
      failures: summary.toolTraceFailures,
      extra:
        summary.toolsUsed.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {summary.toolsUsed.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        ) : null,
    },
    {
      key: "judge",
      label: `LLM Judge (${summary.judgeScore}/100)`,
      pass: summary.judgePass,
      failures: summary.judgeFailures,
      extra: summary.judgeReasoning ? (
        <p className="mt-1 text-xs text-muted-foreground italic">{summary.judgeReasoning}</p>
      ) : null,
    },
  ];

  return (
    <Card
      className={
        summary.overallPass
          ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
          : "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20"
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {summary.overallPass ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <XCircle className="size-5 text-amber-600" />
            )}
            Evaluation {summary.overallPass ? "passed" : "failed"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={summary.queryAddressed ? "default" : "outline"}>
              {summary.queryAddressed ? "On-topic" : "Off-topic?"}
            </Badge>
            <Badge variant={summary.freshnessOk ? "default" : "outline"}>
              {summary.freshnessOk ? "Fresh" : "Stale?"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {layers.map((layer) => (
          <Collapsible key={layer.key} defaultOpen={!layer.pass}>
            <div className="flex items-start justify-between gap-2 rounded-md border bg-background/60 p-2 text-sm">
              <div className="flex flex-1 items-center gap-2">
                {layer.pass ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 text-amber-600" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{layer.label}</div>
                  {layer.extra}
                </div>
              </div>
              {layer.failures.length > 0 && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    Details <ChevronDown className="ml-1 size-3" />
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
            {layer.failures.length > 0 && (
              <CollapsibleContent className="mt-1 rounded-md border bg-muted/40 p-2 text-xs">
                <ul className="list-disc space-y-1 pl-4">
                  {layer.failures.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </CollapsibleContent>
            )}
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}

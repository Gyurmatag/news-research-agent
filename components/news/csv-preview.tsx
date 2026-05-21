"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, FileText, RotateCw } from "lucide-react";
import { hostOf, parseCsv, type ArticleRow } from "@/lib/csv";

type State =
  | { kind: "loading" }
  | { kind: "missing"; status: number }
  | { kind: "ready"; rows: ArticleRow[]; bytes: number; domains: string[] }
  | { kind: "error"; message: string };

export function CsvPreview({
  runId,
  ready,
}: {
  runId: string;
  ready: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) {
      setState({ kind: "loading" });
      return;
    }
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        const res = await fetch(`/api/runs/${runId}/output`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "missing", status: res.status });
          return;
        }
        const text = await res.text();
        const { rows } = parseCsv(text);
        const domains = Array.from(
          new Set(rows.map((r) => hostOf(r.url) ?? "").filter(Boolean)),
        );
        setState({
          kind: "ready",
          rows,
          bytes: new TextEncoder().encode(text).byteLength,
          domains,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: String((err as Error)?.message ?? err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, ready, attempt]);

  if (!ready || state.kind === "loading") {
    return (
      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-4" /> Building results.csv…
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "missing") {
    return (
      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">CSV not ready yet</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RotateCw className="mr-1 size-3" /> Retry
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            R2 reported HTTP {state.status}. The agent may still be uploading.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-destructive">CSV preview failed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{state.message}</p>
        </CardContent>
      </Card>
    );
  }

  const { rows, bytes, domains } = state;
  const sizeKb = (bytes / 1024).toFixed(1);

  return (
    <Card className="border-input">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" />
              results.csv
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="font-mono">
                {rows.length} rows
              </Badge>
              <Badge variant="secondary" className="font-mono">
                {domains.length} domains
              </Badge>
              <Badge variant="outline" className="font-mono">
                {sizeKb} KB
              </Badge>
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="default">
            <a href={`/api/runs/${runId}/download`} download>
              <Download className="mr-1.5 size-3.5" />
              Download CSV
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.date}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium">
                    {row.source}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.title}
                    </a>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {hostOf(row.url) ?? row.url}
                    </div>
                  </td>
                  <td className="max-w-[40ch] px-3 py-2 text-xs text-muted-foreground">
                    {row.summary}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

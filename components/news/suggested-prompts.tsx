"use client";

import { Button } from "@/components/ui/button";
import { Newspaper, Cpu, Leaf, Atom } from "lucide-react";

export const SUGGESTED_PROMPTS: { icon: React.ReactNode; title: string; query: string }[] = [
  {
    icon: <Newspaper className="size-4" />,
    title: "AI safety this week",
    query:
      "Find the most important news about AI safety and regulation from the last 7 days, with at least 5 sources.",
  },
  {
    icon: <Leaf className="size-4" />,
    title: "EU climate policy",
    query: "Summarize this week's top stories about climate policy in the EU.",
  },
  {
    icon: <Cpu className="size-4" />,
    title: "OpenAI vs Anthropic",
    query: "What are the latest developments in OpenAI vs Anthropic this week?",
  },
  {
    icon: <Atom className="size-4" />,
    title: "Quantum breakthroughs",
    query: "Find recent news about quantum computing breakthroughs.",
  },
];

export function SuggestedPrompts({
  onPick,
  disabled,
}: {
  onPick: (query: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
      {SUGGESTED_PROMPTS.map((p) => (
        <Button
          key={p.title}
          variant="outline"
          className="h-auto items-start justify-start whitespace-normal py-3 text-left"
          disabled={disabled}
          onClick={() => onPick(p.query)}
        >
          <span className="mr-2 mt-0.5 inline-flex shrink-0 items-center text-muted-foreground">
            {p.icon}
          </span>
          <span className="flex flex-col gap-1">
            <span className="font-medium text-sm">{p.title}</span>
            <span className="text-xs text-muted-foreground">{p.query}</span>
          </span>
        </Button>
      ))}
    </div>
  );
}

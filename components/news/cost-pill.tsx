"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CostPill({ totalUsd, capUsd }: { totalUsd: number; capUsd: number }) {
  const ratio = capUsd > 0 ? totalUsd / capUsd : 0;
  const variant = ratio >= 1 ? "destructive" : ratio >= 0.8 ? "secondary" : "outline";
  return (
    <Badge variant={variant} className={cn("font-mono")}>${totalUsd.toFixed(4)} / ${capUsd.toFixed(2)}</Badge>
  );
}

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  tone = "neutral",
  invertDelta = false,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger";
  invertDelta?: boolean;
}) {
  const good = delta === undefined ? true : invertDelta ? delta <= 0 : delta >= 0;
  const toneRing = {
    neutral: "bg-brand-soft text-brand",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];

  return (
    <Card className="gap-0 border-border p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon && (
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", toneRing)}>
            <Icon className="size-6" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <p className="mt-3 min-w-0 text-2xl font-bold tracking-tight break-words sm:text-[26px]" data-financial-value>{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

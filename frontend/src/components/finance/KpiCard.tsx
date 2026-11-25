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
    neutral: "bg-brand-soft text-brand ring-1 ring-brand/10",
    success: "bg-success-soft text-success ring-1 ring-success/10",
    warning: "bg-warning-soft text-warning ring-1 ring-warning/15",
    danger: "bg-danger-soft text-danger ring-1 ring-danger/10",
  }[tone];

  return (
    <Card className="group gap-0 p-5 hover:-translate-y-0.5 hover:border-border hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 pt-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
              toneRing,
            )}
          >
            <Icon className="size-5" strokeWidth={1.85} />
          </span>
        )}
      </div>
      <p
        className="mt-3 min-w-0 text-[26px] font-bold leading-tight tracking-tight break-words sm:text-[28px]"
        data-financial-value
      >
        {value}
      </p>
      <div className="mt-2.5 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold",
              good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

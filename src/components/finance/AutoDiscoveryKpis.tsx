import { Info } from "lucide-react";

import { KpiCard } from "@/components/finance/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DiscoveryKpi } from "@/lib/schema-discovery";

const layout: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
};

export function AutoDiscoveryKpis({ kpis }: { kpis: DiscoveryKpi[] }) {
  if (kpis.length === 0) return null;

  return (
    <div className="space-y-3">
      <Card className="border-border bg-muted/40 shadow-card">
        <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 py-3 text-sm">
          <Info className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 font-medium">
            Auto-Adapted Layout: Showing {kpis.length} active metric{kpis.length === 1 ? "" : "s"} based on uploaded schema.
          </span>
        </CardContent>
      </Card>
      <div className={cn("grid gap-4", layout[kpis.length] ?? layout[5])}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} {...(kpi.hint ? { hint: kpi.hint } : {})} />
        ))}
      </div>
    </div>
  );
}
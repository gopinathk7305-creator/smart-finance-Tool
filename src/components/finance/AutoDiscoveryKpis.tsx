import { CircleDollarSign, Info, Landmark, Percent, Rows3, ShieldAlert } from "lucide-react";

import { KpiCard } from "@/components/finance/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import type { DiscoveryKpi } from "@/lib/schema-discovery";

const presentation = {
  "Total Revenue": { icon: CircleDollarSign, tone: "success" as const },
  "Total Expenses": { icon: Landmark, tone: "danger" as const, invertDelta: true },
  "Net Profit Margin": { icon: Percent, tone: "neutral" as const },
  "Active Records": { icon: Rows3, tone: "neutral" as const },
  "Risk / Audit Flags": { icon: ShieldAlert, tone: "warning" as const, invertDelta: true },
};

export function AutoDiscoveryKpis({ kpis }: { kpis: DiscoveryKpi[] }) {
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
      {kpis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const style = presentation[kpi.label as keyof typeof presentation];
            return (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                {...(kpi.hint ? { hint: kpi.hint } : {})}
                {...(kpi.delta !== undefined ? { delta: kpi.delta } : {})}
                {...(style?.icon ? { icon: style.icon } : {})}
                {...(style?.tone ? { tone: style.tone } : {})}
                {...(style?.invertDelta ? { invertDelta: true } : {})}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
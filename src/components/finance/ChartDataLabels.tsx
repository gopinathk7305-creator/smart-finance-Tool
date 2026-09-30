import { formatCompactCurrency } from "@/lib/finance-data";

export const moneyDataLabel = (value: unknown) => formatCompactCurrency(Number(value) || 0);

export const percentDataLabel = (value: unknown) => `${(Number(value) || 0).toFixed(1)}%`;

export const monthsDataLabel = (value: unknown) => `${(Number(value) || 0).toFixed(1)}m`;

export const chartLabelProps = {
  className: "chart-data-label",
} as const;

export function DonutBreakdownLegend({ items, colors }: { items: { name: string; value: number }[]; colors: string[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <ul className="grid min-w-0 content-center gap-2 text-[11px] leading-4" aria-label="Category distribution">
      {items.map((item, index) => (
        <li key={`${item.name}-${index}`} className="flex min-w-0 items-start gap-2 text-foreground" title={`${item.name}: ${((item.value / Math.max(total, 1)) * 100).toFixed(0)}% (${formatCompactCurrency(item.value)})`}>
          <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
          <span className="min-w-0 break-words font-semibold">{item.name}: {((item.value / Math.max(total, 1)) * 100).toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  );
}
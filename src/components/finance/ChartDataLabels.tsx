import { formatCompactCurrency } from "@/lib/finance-data";
import type { PieLabelRenderProps } from "recharts";

export const moneyDataLabel = (value: unknown) => formatCompactCurrency(Number(value) || 0);

export const percentDataLabel = (value: unknown) => `${(Number(value) || 0).toFixed(1)}%`;

export const monthsDataLabel = (value: unknown) => `${(Number(value) || 0).toFixed(1)}m`;

export const chartLabelProps = {
  className: "chart-data-label",
} as const;

/** Distribute outside callouts into two lanes so small adjacent slices stay readable. */
export function donutSliceLabels(items: { name: string; value: number }[]) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let angle = 90;
  const entries = items.map((item, index) => {
    const sweep = total > 0 ? (Math.max(0, item.value) / total) * 360 : 0;
    const middle = (angle - sweep / 2) * Math.PI / 180;
    angle -= sweep;
    return { index, middle, side: Math.cos(middle) >= 0 ? "right" : "left", level: -Math.sin(middle) };
  });

  const positions = new Map<number, { side: string; level: number; middle: number }>();
  for (const side of ["left", "right"]) {
    const lane = entries.filter((entry) => entry.side === side).sort((a, b) => a.level - b.level);
    lane.forEach((entry, slot) => {
      // The vertical lane spans 230px; labels are two lines high and at least 34px apart.
      const minimum = -105 + slot * 34;
      const maximum = 105 - (lane.length - 1 - slot) * 34;
      positions.set(entry.index, { side, level: Math.max(minimum, Math.min(maximum, entry.level * 86)), middle: entry.middle });
    });
    // A second pass prevents a later callout from crossing an earlier one.
    for (let i = 1; i < lane.length; i++) {
      const previousEntry = lane[i - 1];
      const currentEntry = lane[i];
      if (!previousEntry || !currentEntry) continue;
      const previous = positions.get(previousEntry.index);
      const current = positions.get(currentEntry.index);
      if (previous && current && current.level < previous.level + 34) current.level = previous.level + 34;
    }
  }

  return (props: PieLabelRenderProps) => {
    const index = Number(props.index);
    const item = items[index];
    const position = positions.get(index);
    if (!item || !position || !total) return null;
    const cx = Number(props.cx);
    const cy = Number(props.cy);
    const radius = Number(props.outerRadius);
    if (![cx, cy, radius].every(Number.isFinite)) return null;
    const direction = position.side === "right" ? 1 : -1;
    const startX = cx + Math.cos(position.middle) * (radius + 2);
    const startY = cy - Math.sin(position.middle) * (radius + 2);
    const elbowX = cx + direction * (radius + 15);
    const textX = cx + direction * (radius + 23);
    const textY = cy + position.level;
    const percentage = `${((item.value / total) * 100).toFixed(0)}%`;
    return (
      <g className="donut-slice-callout">
        <path d={`M ${startX} ${startY} L ${elbowX} ${textY} L ${textX - direction * 3} ${textY}`} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} />
        <text x={textX} y={textY} textAnchor={direction === 1 ? "start" : "end"} className="chart-data-label" dominantBaseline="central">
          <title>{`${item.name}: ${percentage} (${formatCompactCurrency(item.value)})`}</title>
          {percentage}
        </text>
      </g>
    );
  };
}

export function DonutBreakdownLegend({ items, colors }: { items: { name: string; value: number }[]; colors: string[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <ul className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-[11px] leading-4" aria-label="Category distribution">
      {items.map((item, index) => {
        const pct = ((item.value / Math.max(total, 1)) * 100).toFixed(0);
        const label = `${item.name}: ${pct}% • ${formatCompactCurrency(item.value)}`;
        return (
          <li key={`${item.name}-${index}`} className="flex min-w-0 items-start gap-2 text-foreground" title={label}>
            <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
            <span className="min-w-0 break-words">
              <span className="font-semibold">{item.name}: {pct}%</span>
              <span className="text-muted-foreground"> • {formatCompactCurrency(item.value)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
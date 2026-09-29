import type { PieLabelRenderProps } from "recharts";

import { formatCompactCurrency } from "@/lib/finance-data";

export const moneyDataLabel = (value: unknown) => formatCompactCurrency(Number(value) || 0);

export const percentDataLabel = (value: unknown) => `${(Number(value) || 0).toFixed(1)}%`;

export const monthsDataLabel = (value: unknown) => `${(Number(value) || 0).toFixed(1)}m`;

export const chartLabelProps = {
  className: "chart-data-label",
} as const;

export function DonutValueLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  outerRadius = 0,
  name = "",
  value = 0,
  percent = 0,
}: PieLabelRenderProps) {
  const angle = (Math.PI / 180) * -Number(midAngle);
  const radius = Number(outerRadius) + 24;
  const x = Number(cx) + radius * Math.cos(angle);
  const y = Number(cy) + radius * Math.sin(angle);
  const anchor = x > Number(cx) ? "start" : "end";
  const label = String(name).length > 16 ? `${String(name).slice(0, 15)}…` : String(name);

  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" className="chart-data-label">
      <tspan x={x} dy="-0.35em">{`${label}: ${(Number(percent) * 100).toFixed(0)}%`}</tspan>
      <tspan x={x} dy="1.25em">{`(${formatCompactCurrency(Number(value) || 0)})`}</tspan>
    </text>
  );
}
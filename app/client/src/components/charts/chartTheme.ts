import type { CSSProperties } from "react";

/** Chart colors come from CSS vars so the SVG follows the app theme. */
export const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function chartColor(i: number): string {
  return COLORS[i % COLORS.length] ?? COLORS[0];
}

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
} as const;

export const gridProps = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const tooltipProps = {
  contentStyle: {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--popover-foreground)",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.4)",
  } as CSSProperties,
  labelStyle: { color: "var(--muted-foreground)" } as CSSProperties,
  itemStyle: { color: "var(--popover-foreground)" } as CSSProperties,
  cursor: { fill: "var(--muted)", fillOpacity: 0.4 },
} as const;

export const legendProps = {
  iconType: "circle",
  iconSize: 8,
  wrapperStyle: { fontSize: 12, color: "var(--muted-foreground)" } as CSSProperties,
} as const;

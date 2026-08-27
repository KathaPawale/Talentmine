import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { tooltipProps } from "./chartTheme";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 220,
}: {
  data: DonutDatum[];
  centerLabel?: string;
  centerValue?: string | number;
  height?: number;
}) {
  // zero-value slices render as stray padding gaps — drop them
  const visible = data.filter((d) => d.value > 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip {...tooltipProps} />
          <Pie
            data={visible}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="90%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {visible.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel !== undefined || centerValue !== undefined) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <div className="text-2xl font-bold tabular-nums">{centerValue}</div>
          )}
          {centerLabel !== undefined && (
            <div className="text-xs text-muted-foreground">{centerLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}

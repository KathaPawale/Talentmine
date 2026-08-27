import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisProps, gridProps, legendProps, tooltipProps } from "./chartTheme";

export function TimeSeriesChart({
  data,
  labels,
  height = 240,
}: {
  data: { date: string; series1: number; series2?: number }[];
  labels: { series1: string; series2?: string };
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="date"
          {...axisProps}
          tickFormatter={(v: string) => v.slice(5)}
          minTickGap={24}
        />
        <YAxis {...axisProps} width={36} allowDecimals={false} />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Line
          type="monotone"
          dataKey="series1"
          name={labels.series1}
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
        {labels.series2 !== undefined && (
          <Line
            type="monotone"
            dataKey="series2"
            name={labels.series2}
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

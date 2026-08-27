import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisProps, gridProps, legendProps, tooltipProps } from "./chartTheme";

export function StageBarChart({
  data,
  height = 260,
}: {
  data: { stage: string; pass: number; fail: number; risky: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="stage" {...axisProps} interval={0} />
        <YAxis {...axisProps} width={36} allowDecimals={false} />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Bar
          dataKey="pass"
          name="Pass"
          fill="var(--status-success)"
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
          isAnimationActive={false}
        />
        <Bar
          dataKey="risky"
          name="Risky"
          fill="var(--status-warning)"
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
          isAnimationActive={false}
        />
        <Bar
          dataKey="fail"
          name="Fail"
          fill="var(--status-danger)"
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

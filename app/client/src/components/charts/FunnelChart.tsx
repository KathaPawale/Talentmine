import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/utils";
import { axisProps, tooltipProps } from "./chartTheme";

export function FunnelChart({ stages }: { stages: { label: string; value: number }[] }) {
  const height = Math.max(120, stages.length * 44 + 12);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={132} {...axisProps} />
        <Tooltip {...tooltipProps} />
        <Bar
          dataKey="value"
          name="Count"
          fill="var(--status-success)"
          radius={4}
          barSize={20}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="value"
            position="right"
            fill="var(--foreground)"
            fontSize={11}
            formatter={(v: unknown) => formatNumber(Number(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

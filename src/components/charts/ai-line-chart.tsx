"use client";

import { ResponsiveLine } from "@nivo/line";
import { CHART_COLORS, nrlChartTheme } from "@/components/charts/chart-theme";

interface AiLineChartProps {
  title: string;
  subtitle?: string;
  yLabel: string;
  points: Array<{
    x: string;
    y: number;
  }>;
}

export function AiLineChart({ title, subtitle, yLabel, points }: AiLineChartProps) {
  const data = [
    {
      id: title,
      color: CHART_COLORS.primary,
      data: points.map((point) => ({
        x: point.x,
        y: point.y,
      })),
    },
  ];

  return (
    <div className="rounded-xl border border-nrl-border bg-[#13182f] p-4">
      <div className="text-sm font-semibold text-nrl-text">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-nrl-muted">{subtitle}</div> : null}
      <div className="mt-4 h-64">
        <ResponsiveLine
          data={data}
          theme={nrlChartTheme}
          margin={{ top: 10, right: 20, bottom: 50, left: 60 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
          axisBottom={{
            tickRotation: 0,
            legend: "Season",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{
            legend: yLabel,
            legendPosition: "middle",
            legendOffset: -48,
          }}
          colors={[CHART_COLORS.primary]}
          lineWidth={2.4}
          pointSize={7}
          pointColor={{ from: "series.color" }}
          pointBorderWidth={1}
          pointBorderColor={{ from: "color" }}
          enableArea={false}
          useMesh
          enableSlices="x"
          curve="monotoneX"
        />
      </div>
    </div>
  );
}

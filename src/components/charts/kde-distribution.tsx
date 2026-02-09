"use client";

import { ResponsiveLine } from "@nivo/line";
import { nrlChartTheme, CHART_COLORS } from "./chart-theme";
import { gaussianKDE } from "@/lib/data/kde";
import { mean } from "@/lib/data/stats";

interface KDEDistributionProps {
  title: string;
  stat: string;
  series: {
    label: string;
    values: number[];
    color?: string;
  }[];
}

export function KDEDistribution({ title: _title, stat, series }: KDEDistributionProps) {
  void _title;
  const colors = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary];

  const densitySeries = series
    .filter((s) => s.values.length >= 2)
    .map((s, i) => {
      const kde = gaussianKDE(s.values);
      if (kde.length === 0) {
        return null;
      }

      const start = kde[0];
      const end = kde[kde.length - 1];

      return {
        id: `${s.label} (n=${s.values.length})`,
        color: s.color ?? colors[i % colors.length],
        data: kde.map((p) => ({ x: p.x, y: p.y })),
        leftEdge: start.x,
        rightEdge: end.x,
        leftEdgeY: start.y,
        rightEdgeY: end.y,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const nivoData = densitySeries.map((d) => ({
    id: d.id,
    color: d.color,
    data: d.data,
  }));

  if (nivoData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-nrl-muted text-sm">
        Not enough data for distribution plot.
      </div>
    );
  }

  // Mean markers as custom layers
  const MeanMarkers = ({
    xScale,
    innerHeight,
    innerWidth,
  }: {
    xScale: (v: number) => number;
    innerHeight: number;
    innerWidth: number;
  }) => {
    const visibleSeriesCount = series.filter((s) => s.values.length >= 2).length;
    const legendWidth = 150;
    const legendHeight = Math.max(20, visibleSeriesCount * 20 + 4);
    const legendLeft = innerWidth - legendWidth;

    const markers = series
      .filter((s) => s.values.length >= 2)
      .map((s, i) => {
        const avg = mean(s.values);
        return {
          avg,
          x: xScale(avg),
          color: s.color ?? colors[i % colors.length],
        };
      })
      .sort((a, b) => a.x - b.x)
      .map((m) => ({ ...m, level: 0 }));

    // Stagger close labels vertically to avoid overlap.
    const minLabelGapPx = 44;
    for (let i = 0; i < markers.length; i++) {
      for (let j = 0; j < i; j++) {
        if (
          Math.abs(markers[i].x - markers[j].x) < minLabelGapPx &&
          markers[i].level === markers[j].level
        ) {
          markers[i].level = markers[j].level + 1;
        }
      }
    }

    const baseY = 12;
    const levelStep = 11;

    return (
      <>
        {markers.map((m, i) => {
          const estLabelWidth = 64;
          const nearRightEdge = m.x > innerWidth - 24;
          const textAnchor: "start" | "end" = nearRightEdge ? "end" : "start";
          const textX = nearRightEdge ? m.x - 4 : m.x + 4;
          let textY = baseY + m.level * levelStep;

          const textLeft = textAnchor === "start" ? textX : textX - estLabelWidth;
          const textRight = textAnchor === "start" ? textX + estLabelWidth : textX;
          const overlapsLegendHoriz = textRight >= legendLeft - 4 && textLeft <= innerWidth;
          const overlapsLegendVert = textY <= legendHeight + 6;
          if (overlapsLegendHoriz && overlapsLegendVert) {
            textY = legendHeight + 10 + m.level * levelStep;
          }

          return (
            <g key={i}>
            <line
              x1={m.x}
              y1={0}
              x2={m.x}
              y2={innerHeight}
              stroke={m.color}
              strokeWidth={1.6}
              strokeDasharray="6 3"
              opacity={0.85}
            />
            <text
              x={textX}
              y={textY}
              textAnchor={textAnchor}
              fill={m.color}
              fontSize={10}
              fontWeight="bold"
            >
              avg: {m.avg.toFixed(1)}
            </text>
          </g>
          );
        })}
      </>
    );
  };

  const EdgeMarkers = ({
    xScale,
    yScale,
  }: {
    xScale: (v: number) => number;
    yScale: (v: number) => number;
  }) => (
    <>
      {densitySeries.flatMap((s, i) => [
        <line
          key={`${s.id}-left-${i}`}
          x1={xScale(s.leftEdge)}
          y1={yScale(0)}
          x2={xScale(s.leftEdge)}
          y2={yScale(s.leftEdgeY)}
          stroke={s.color}
          strokeWidth={2.4}
          strokeDasharray="10 6"
          opacity={0.55}
        />,
        <line
          key={`${s.id}-right-${i}`}
          x1={xScale(s.rightEdge)}
          y1={yScale(0)}
          x2={xScale(s.rightEdge)}
          y2={yScale(s.rightEdgeY)}
          stroke={s.color}
          strokeWidth={2.4}
          strokeDasharray="10 6"
          opacity={0.55}
        />,
      ])}
    </>
  );

  return (
    <div>
      <div className="h-64">
        <ResponsiveLine
          data={nivoData}
          theme={nrlChartTheme}
          margin={{ top: 10, right: 20, bottom: 50, left: 60 }}
          xScale={{ type: "linear", min: "auto", max: "auto" }}
          yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
          axisBottom={{
            legend: stat,
            legendPosition: "middle",
            legendOffset: 40,
            tickValues: 5,
          }}
          axisLeft={{
            legend: "Density",
            legendPosition: "middle",
            legendOffset: -50,
            tickValues: 5,
          }}
          colors={nivoData.map((d) => d.color)}
          curve="monotoneX"
          lineWidth={2.4}
          enableArea={false}
          enablePoints={false}
          enableGridX={false}
          enableGridY={true}
          useMesh={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layers={["grid", "axes", "areas", "lines", EdgeMarkers as any, MeanMarkers as any, "legends"]}
          legends={[
            {
              anchor: "top-right",
              direction: "column",
              translateX: 0,
              translateY: 0,
              itemWidth: 150,
              itemHeight: 20,
              symbolSize: 10,
            },
          ]}
        />
      </div>
    </div>
  );
}

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

const BOXPLOT_MAX_SAMPLE = 20;
const AXIS_COLOR = "var(--color-nrl-border)";
const TICK_TEXT_COLOR = "var(--color-nrl-muted)";
const LABEL_COLOR = "var(--color-nrl-text)";
const POINT_STROKE = "var(--color-nrl-bg)";

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function toRgba(hex: string, alpha: number): string {
  if (hex.startsWith("var(")) {
    return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
  }
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function valueDomain(valuesBySeries: number[][]): [number, number] {
  const allValues = valuesBySeries.flat();
  if (allValues.length === 0) return [0, 1];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function formatTick(value: number, domain: [number, number]): string {
  const range = domain[1] - domain[0];
  if (range <= 8) return value.toFixed(1);
  if (range <= 20) return value.toFixed(0);
  return Math.round(value).toString();
}

function StripDistribution({
  stat,
  series,
  colors,
}: {
  stat: string;
  series: { label: string; values: number[]; color?: string }[];
  colors: readonly string[];
}) {
  const visibleSeries = series
    .filter((s) => s.values.length > 0)
    .map((s, i) => ({
      ...s,
      color: s.color ?? colors[i % colors.length],
    }));

  if (visibleSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-nrl-muted text-sm">
        Not enough data for distribution plot.
      </div>
    );
  }

  const domain = valueDomain(visibleSeries.map((s) => s.values));
  const [xMin, xMax] = domain;

  const width = 500;
  const height = 224;
  const margin = { top: 12, right: 20, bottom: 44, left: 126 };
  const innerWidth = width - margin.left - margin.right;

  const laneTop = margin.top + 24;
  const laneBottom = height - margin.bottom - 22;
  const laneSpan = Math.max(1, visibleSeries.length - 1);

  const xScale = (value: number): number =>
    margin.left + ((value - xMin) / (xMax - xMin)) * innerWidth;

  const yForIndex = (index: number): number =>
    visibleSeries.length === 1
      ? (laneTop + laneBottom) / 2
      : laneTop + ((laneBottom - laneTop) * index) / laneSpan;

  const ticks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);

  const renderMeanLabel = (avg: number, y: number, color: string) => {
    const x = xScale(avg);
    const minX = margin.left + 18;
    const maxX = width - margin.right - 18;
    const textX = Math.max(minX, Math.min(maxX, x));
    return (
      <text
        x={textX}
        y={y - 20}
        fill={color}
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
        stroke={POINT_STROKE}
        strokeWidth={2}
        paintOrder="stroke"
      >
        {avg.toFixed(1)}
      </text>
    );
  };

  const renderDistribution = (
    values: number[],
    centerY: number,
    color: string
  ) => {
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const avg = mean(values);

    return (
      <>
        {q1 !== null && q3 !== null && (
          <rect
            x={xScale(q1)}
            y={centerY - 10}
            width={Math.max(2, xScale(q3) - xScale(q1))}
            height={20}
            fill={toRgba(color, 0.22)}
            stroke={color}
            strokeWidth={1}
            rx={3}
          />
        )}
        <line
          x1={xScale(avg)}
          y1={centerY - 18}
          x2={xScale(avg)}
          y2={centerY + 18}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="5 3"
        />
        {values.map((value, index) => {
          const jitter = ((index * 19) % 9) - 4;
          return (
            <circle
              key={`${color}-${index}`}
              cx={xScale(value)}
              cy={centerY + jitter}
              r={4}
              fill={color}
              stroke={POINT_STROKE}
              strokeWidth={1}
            />
          );
        })}
        {renderMeanLabel(avg, centerY, color)}
      </>
    );
  };

  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-nrl-muted">
        n ≤ 20 — showing boxplot + raw values (mean/IQR)
      </div>
      <div className="h-64">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
          {visibleSeries.map((s, index) => {
            const y = yForIndex(index);
            return (
              <g key={`${s.label}-${index}`}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke={AXIS_COLOR}
                  strokeDasharray="4 4"
                />
                {renderDistribution(s.values, y, s.color)}
                <text x={12} y={y - 12} fill={s.color} fontSize={11} fontWeight={700}>
                  {`${s.label} (n=${s.values.length})`}
                </text>
              </g>
            );
          })}

          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={width - margin.right}
            y2={height - margin.bottom}
            stroke={AXIS_COLOR}
          />
          {ticks.map((tick, index) => {
            const x = xScale(tick);
            return (
              <g key={`tick-${index}`}>
                <line x1={x} y1={height - margin.bottom} x2={x} y2={height - margin.bottom + 5} stroke={AXIS_COLOR} />
                <text x={x} y={height - margin.bottom + 18} fill={TICK_TEXT_COLOR} fontSize={9} textAnchor="middle">
                  {formatTick(tick, domain)}
                </text>
              </g>
            );
          })}

          <text
            x={(margin.left + width - margin.right) / 2}
            y={height - 6}
            fill={LABEL_COLOR}
            fontSize={11}
            textAnchor="middle"
            fontWeight={600}
          >
            {stat}
          </text>
        </svg>
      </div>
    </div>
  );
}

export function KDEDistribution({ title: _title, stat, series }: KDEDistributionProps) {
  void _title;
  const colors = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary];
  const nonEmptySeries = series.filter((s) => s.values.length > 0);

  if (nonEmptySeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-nrl-muted text-sm">
        Not enough data for distribution plot.
      </div>
    );
  }

  const smallestSample = Math.min(...nonEmptySeries.map((s) => s.values.length));
  if (smallestSample <= BOXPLOT_MAX_SAMPLE) {
    return <StripDistribution stat={stat} series={series} colors={colors} />;
  }

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
  }: {
    xScale: (v: number) => number;
    innerHeight: number;
  }) => {
    const markers = series
      .filter((s) => s.values.length >= 2)
      .map((s, i) => {
        const avg = mean(s.values);
        return {
          avg,
          x: xScale(avg),
          color: s.color ?? colors[i % colors.length],
        };
      });

    return (
      <>
        {markers.map((m, i) => {
          const nearRightEdge = m.x > 455;
          const textAnchor: "start" | "end" = nearRightEdge ? "end" : "start";
          const textX = nearRightEdge ? m.x - 4 : m.x + 4;

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
                y={12}
                textAnchor={textAnchor}
                fill={m.color}
                fontSize={10}
                fontWeight="bold"
              >
                {m.avg.toFixed(1)}
              </text>
            </g>
          );
        })}
      </>
    );
  };

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
          layers={["grid", "axes", "areas", "lines", MeanMarkers as any, "legends"]}
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

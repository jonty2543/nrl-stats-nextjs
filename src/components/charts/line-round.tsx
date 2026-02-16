"use client";

import { ResponsiveLine } from "@nivo/line";
import { nrlChartTheme, CHART_COLORS } from "./chart-theme";
import type { RoundDataPoint } from "@/lib/data/transform";
import { useEffect, useMemo, useState } from "react";

interface LineRoundProps {
  title: string;
  stat: string;
  series: {
    label: string;
    data: RoundDataPoint[];
    color?: string;
  }[];
  mode?: "single" | "compare" | "dual";
  stat2Data?: RoundDataPoint[];
  stat2Label?: string;
}

const FINALS_ROUND_LABELS: Record<number, string> = {
  28: "FW1",
  29: "FW2",
  30: "FW3",
  31: "GF",
};

function formatRoundTick(round: number): string {
  return FINALS_ROUND_LABELS[round] ?? String(round);
}

export function LineRound({
  title: _title,
  stat,
  series,
  mode = "single",
  stat2Data,
  stat2Label,
}: LineRoundProps) {
  void _title;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const formatOpponent = (opponent: unknown): string =>
    typeof opponent === "string" && opponent.trim().length > 0
      ? opponent
      : "Unknown";

  const nivoData = series.map((s, i) => ({
    id: s.label,
    color: s.color ?? (i === 0 ? CHART_COLORS.primary : CHART_COLORS.secondary),
    data: s.data
      .filter((d) => d.round >= 1)
      .sort((a, b) => a.round - b.round)
      .map((d) => ({
        x: d.round,
        y: d.value,
        roundLabel: d.roundLabel,
        opponent: d.opponent,
      })),
  }));

  if (mode === "dual" && stat2Data) {
    nivoData.push({
      id: stat2Label ?? "Stat 2",
      color: CHART_COLORS.secondary,
      data: stat2Data
        .filter((d) => d.round >= 1)
        .sort((a, b) => a.round - b.round)
        .map((d) => ({
          x: d.round,
          y: d.value,
          roundLabel: d.roundLabel,
          opponent: d.opponent,
        })),
    });
  }

  const availableRounds = useMemo(
    () =>
      Array.from(
        new Set(
          nivoData.flatMap((s) =>
            s.data
              .map((d) =>
                typeof d.x === "number" ? d.x : Number(d.x)
              )
              .filter((r) => Number.isFinite(r))
          )
        )
      ).sort((a, b) => a - b),
    [nivoData]
  );
  const xMin = 1;
  const xMax = availableRounds.length > 0 ? Math.max(...availableRounds) : 27;
  const hasFinalsRounds = xMax >= 28;

  const roundTicks = useMemo(() => {
    const allTicks = Array.from(
      { length: Math.max(1, xMax - xMin + 1) },
      (_, i) => xMin + i
    );
    if (!isMobile) return allTicks;

    if (!hasFinalsRounds) {
      const maxTicks = 8;
      const step = Math.max(1, Math.ceil(allTicks.length / (maxTicks - 1)));
      const compactTicks = allTicks.filter((_, idx) => idx % step === 0);
      if (compactTicks[compactTicks.length - 1] !== xMax) {
        compactTicks.push(xMax);
      }
      return compactTicks;
    }

    const regularMax = Math.min(27, xMax);
    const regularTicks = Array.from(
      { length: Math.max(1, regularMax - xMin + 1) },
      (_, i) => xMin + i
    );
    const regularStep = Math.max(1, Math.ceil(regularTicks.length / 6));
    const regularCompact = regularTicks.filter((_, idx) => idx % regularStep === 0);
    if (regularCompact[regularCompact.length - 1] !== regularMax) {
      regularCompact.push(regularMax);
    }
    const finalsTicks = Array.from(
      { length: Math.max(0, xMax - 27) },
      (_, i) => 28 + i
    );
    return Array.from(new Set([...regularCompact, ...finalsTicks])).sort((a, b) => a - b);
  }, [hasFinalsRounds, isMobile, xMax]);

  const enableArea = false;
  const yValues = nivoData.flatMap((serie) => serie.data.map((d) => d.y));
  const areaBaselineValue = yValues.length > 0 ? Math.min(...yValues) : 0;

  const averageLines = nivoData
    .map((serie) => {
      const values = serie.data
        .map((d) => d.y)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      if (values.length === 0) return null;

      return {
        color: serie.color,
        avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  const AvgLines = ({
    innerWidth,
    innerHeight,
    yScale,
  }: {
    innerWidth: number;
    innerHeight: number;
    yScale: (v: number) => number;
  }) => (
    <>
      {averageLines.map((line, index) => (
        <g key={`avg-line-${index}`}>
          <line
            x1={0}
            y1={yScale(line.avg)}
            x2={innerWidth}
            y2={yScale(line.avg)}
            stroke={line.color}
            strokeWidth={1.4}
            strokeDasharray="6 3"
            opacity={0.45}
          />
          <text
            x={innerWidth - 4}
            y={Math.max(10, Math.min(innerHeight - 2, yScale(line.avg) - 4))}
            fill={line.color}
            fontSize={9}
            fontWeight={700}
            textAnchor="end"
            stroke="var(--color-nrl-bg)"
            strokeWidth={1.5}
            paintOrder="stroke"
          >
            {line.avg.toFixed(1)}
          </text>
        </g>
      ))}
    </>
  );

  const WatermarkLayer = ({
    innerWidth,
    innerHeight,
  }: {
    innerWidth: number;
    innerHeight: number;
  }) => {
    const size = Math.min(innerWidth, innerHeight) * 0.55;
    return (
      <g opacity={0.08} pointerEvents="none">
        <image
          href="/logo-mark.svg"
          x={(innerWidth - size) / 2}
          y={(innerHeight - size) / 2}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    );
  };

  return (
    <div>
      <div className="h-64">
        <ResponsiveLine
          data={nivoData}
          theme={nrlChartTheme}
          margin={{ top: 10, right: mode === "dual" ? 60 : 20, bottom: 50, left: 60 }}
          xScale={{ type: "linear", min: xMin, max: xMax }}
          yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
          axisBottom={{
            legend: "Round",
            legendPosition: "middle",
            legendOffset: 40,
            tickRotation: 0,
            format: (v) =>
              Number.isInteger(v as number)
                ? formatRoundTick(Number(v))
                : "",
            tickValues: roundTicks,
          }}
          axisLeft={{
            legend: stat,
            legendPosition: "middle",
            legendOffset: -50,
          }}
          colors={nivoData.map((d) => d.color)}
          lineWidth={2.4}
          pointSize={6}
          pointColor={{ from: "series.color" }}
          pointBorderWidth={1}
          pointBorderColor={{ from: "color" }}
          tooltip={({ point }) => {
            const round =
              typeof point.data.x === "number"
                ? point.data.x
                : Number(point.data.x);
            const opponent = formatOpponent((point.data as { opponent?: unknown }).opponent);
            const value =
              typeof point.data.y === "number"
                ? point.data.y.toFixed(1)
                : String(point.data.y);
            const roundText = Number.isFinite(round)
              ? (round >= 28 ? formatRoundTick(round) : `Rd ${round}`)
              : `Rd ${String(point.data.x)}`;
            return (
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-xs text-nrl-text">
                <div>{`${roundText} vs ${opponent}: ${value}`}</div>
              </div>
            );
          }}
          enableArea={enableArea}
          areaBaselineValue={areaBaselineValue}
          areaOpacity={0.15}
          enableGridX={false}
          enableGridY={true}
          useMesh={true}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layers={["grid", "markers", "axes", WatermarkLayer as any, "areas", AvgLines as any, "crosshair", "lines", "points", "slices", "mesh", "legends"]}
          legends={
            series.length > 1 || mode === "dual"
              ? [
                  {
                    anchor: "top",
                    direction: "row",
                    translateY: -5,
                    itemWidth: 120,
                    itemHeight: 20,
                    symbolSize: 10,
                  },
                ]
              : []
          }
        />
      </div>
    </div>
  );
}

"use client";

import { ResponsiveLine } from "@nivo/line";
import { nrlChartTheme, CHART_COLORS } from "./chart-theme";
import { mean } from "@/lib/data/stats";
import type { RoundDataPoint } from "@/lib/data/transform";
import { useEffect, useMemo, useState } from "react";

interface WithWithoutLineProps {
  title: string;
  stat: string;
  withData: RoundDataPoint[];
  withoutData: RoundDataPoint[];
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

export function WithWithoutLine({
  title: _title,
  stat,
  withData,
  withoutData,
}: WithWithoutLineProps) {
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

  const filterRounds = (data: RoundDataPoint[]) =>
    data
      .filter((d) => d.round >= 1)
      .sort((a, b) => a.round - b.round);

  const wFiltered = filterRounds(withData);
  const woFiltered = filterRounds(withoutData);
  const hasWithData = wFiltered.length > 0;
  const hasWithoutData = woFiltered.length > 0;

  const wAvg = hasWithData ? mean(wFiltered.map((d) => d.value)) : null;
  const woAvg = hasWithoutData ? mean(woFiltered.map((d) => d.value)) : null;
  const roundTicks = useMemo(
    () => [...new Set([...wFiltered, ...woFiltered].map((d) => d.round))].sort((a, b) => a - b),
    [wFiltered, woFiltered]
  );
  const xMin = roundTicks.length > 0 ? roundTicks[0] : 1;
  const xMax = roundTicks.length > 0 ? roundTicks[roundTicks.length - 1] : 27;
  const displayRoundTicks = useMemo(() => {
    if (!isMobile || roundTicks.length <= 8) return roundTicks;
    const hasFinals = roundTicks.some((tick) => tick >= 28);
    if (!hasFinals) {
      const step = Math.max(1, Math.ceil(roundTicks.length / 7));
      const compactTicks = roundTicks.filter((_, idx) => idx % step === 0);
      const lastTick = roundTicks[roundTicks.length - 1];
      if (compactTicks[compactTicks.length - 1] !== lastTick) {
        compactTicks.push(lastTick);
      }
      return compactTicks;
    }

    const regularTicks = roundTicks.filter((tick) => tick <= 27);
    const finalsTicks = roundTicks.filter((tick) => tick >= 28);
    const step = Math.max(1, Math.ceil(regularTicks.length / 6));
    const compactRegular = regularTicks.filter((_, idx) => idx % step === 0);
    const regularLast = regularTicks[regularTicks.length - 1];
    if (regularLast !== undefined && compactRegular[compactRegular.length - 1] !== regularLast) {
      compactRegular.push(regularLast);
    }
    return Array.from(new Set([...compactRegular, ...finalsTicks])).sort((a, b) => a - b);
  }, [isMobile, roundTicks]);

  const nivoData = [
    {
      id: `With (n=${wFiltered.length})`,
      color: CHART_COLORS.primary,
      data: wFiltered.map((d) => ({
        x: d.round,
        y: d.value,
        roundLabel: d.roundLabel,
        opponent: d.opponent,
      })),
    },
    {
      id: `Without (n=${woFiltered.length})`,
      color: CHART_COLORS.trendline,
      data: woFiltered.map((d) => ({
        x: d.round,
        y: d.value,
        roundLabel: d.roundLabel,
        opponent: d.opponent,
      })),
    },
  ];

  // Average horizontal lines layer
  const AvgLines = ({
    innerWidth,
    innerHeight,
    yScale,
  }: {
    innerWidth: number;
    innerHeight: number;
    yScale: (v: number) => number;
  }) => {
    const clampY = (y: number) => Math.max(10, Math.min(innerHeight - 2, y));
    const minGap = 12;

    const withBaseY = wAvg !== null ? yScale(wAvg) - 4 : null;
    const withoutBaseY = woAvg !== null ? yScale(woAvg) - 4 : null;

    let withLabelY = withBaseY;
    let withoutLabelY = withoutBaseY;

    if (withLabelY !== null && withoutLabelY !== null) {
      const gap = Math.abs(withLabelY - withoutLabelY);
      if (gap < minGap) {
        const shift = (minGap - gap) / 2;
        if (withLabelY <= withoutLabelY) {
          withLabelY -= shift;
          withoutLabelY += shift;
        } else {
          withLabelY += shift;
          withoutLabelY -= shift;
        }
      }
      withLabelY = clampY(withLabelY);
      withoutLabelY = clampY(withoutLabelY);
    } else {
      if (withLabelY !== null) withLabelY = clampY(withLabelY);
      if (withoutLabelY !== null) withoutLabelY = clampY(withoutLabelY);
    }

    return (
      <>
        {wAvg !== null ? (
          <>
            <line
              x1={0}
              y1={yScale(wAvg)}
              x2={innerWidth}
              y2={yScale(wAvg)}
              stroke={CHART_COLORS.primary}
              strokeWidth={1.4}
              strokeDasharray="6 3"
              opacity={0.7}
            />
            <text
              x={innerWidth - 4}
              y={withLabelY ?? yScale(wAvg) - 4}
              fill={CHART_COLORS.primary}
              fontSize={9}
              fontWeight="bold"
              textAnchor="end"
            >
              Avg with: {wAvg.toFixed(1)}
            </text>
          </>
        ) : null}
        {woAvg !== null ? (
          <>
            <line
              x1={0}
              y1={yScale(woAvg)}
              x2={innerWidth}
              y2={yScale(woAvg)}
              stroke={CHART_COLORS.trendline}
              strokeWidth={1.4}
              strokeDasharray="6 3"
              opacity={0.7}
            />
            <text
              x={innerWidth - 4}
              y={withoutLabelY ?? yScale(woAvg) - 4}
              fill={CHART_COLORS.trendline}
              fontSize={9}
              fontWeight="bold"
              textAnchor="end"
            >
              Avg without: {woAvg.toFixed(1)}
            </text>
          </>
        ) : null}
      </>
    );
  };

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
          margin={{ top: 24, right: 20, bottom: 50, left: 60 }}
          xScale={{ type: "linear", min: xMin, max: xMax }}
          yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
          axisBottom={{
            legend: "Round",
            legendPosition: "middle",
            legendOffset: 40,
            tickValues: displayRoundTicks,
            format: (v) =>
              Number.isInteger(v as number)
                ? formatRoundTick(Number(v))
                : "",
          }}
          axisLeft={{
            legend: stat,
            legendPosition: "middle",
            legendOffset: -50,
          }}
          colors={[CHART_COLORS.primary, CHART_COLORS.trendline]}
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
          enableGridX={false}
          enableGridY={true}
          useMesh={true}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layers={["grid", "axes", WatermarkLayer as any, AvgLines as any, "lines", "points", "mesh", "legends"]}
          legends={[
            {
              anchor: "top-left",
              direction: "row",
              translateY: -18,
              itemWidth: 120,
              itemHeight: 20,
              symbolSize: 10,
            },
          ]}
        />
      </div>
    </div>
  );
}

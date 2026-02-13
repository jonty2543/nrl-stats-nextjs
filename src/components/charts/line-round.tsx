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

export function LineRound({
  title: _title,
  stat,
  series,
  mode = "single",
  stat2Data,
  stat2Label,
}: LineRoundProps) {
  void _title;
  const ROUND_MIN = 1;
  const ROUND_MAX = 27;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const roundTicks = useMemo(() => {
    const allTicks = Array.from({ length: ROUND_MAX - ROUND_MIN + 1 }, (_, i) => ROUND_MIN + i);
    if (!isMobile) return allTicks;

    const maxTicks = 8;
    const step = Math.max(1, Math.ceil(allTicks.length / (maxTicks - 1)));
    const compactTicks = allTicks.filter((_, idx) => idx % step === 0);
    if (compactTicks[compactTicks.length - 1] !== ROUND_MAX) {
      compactTicks.push(ROUND_MAX);
    }
    return compactTicks;
  }, [isMobile]);

  const formatOpponent = (opponent: unknown): string =>
    typeof opponent === "string" && opponent.trim().length > 0
      ? opponent
      : "Unknown";

  const nivoData = series.map((s, i) => ({
    id: s.label,
    color: s.color ?? (i === 0 ? CHART_COLORS.primary : CHART_COLORS.secondary),
    data: s.data
      .filter((d) => d.round >= ROUND_MIN && d.round <= ROUND_MAX)
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
        .filter((d) => d.round >= ROUND_MIN && d.round <= ROUND_MAX)
        .sort((a, b) => a.round - b.round)
        .map((d) => ({
          x: d.round,
          y: d.value,
          roundLabel: d.roundLabel,
          opponent: d.opponent,
        })),
    });
  }

  const enableArea = mode === "single" || mode === "dual";
  const yValues = nivoData.flatMap((serie) => serie.data.map((d) => d.y));
  const areaBaselineValue = yValues.length > 0 ? Math.min(...yValues) : 0;

  return (
    <div>
      <div className="h-64">
        <ResponsiveLine
          data={nivoData}
          theme={nrlChartTheme}
          margin={{ top: 10, right: mode === "dual" ? 60 : 20, bottom: 50, left: 60 }}
          xScale={{ type: "linear", min: ROUND_MIN, max: ROUND_MAX }}
          yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
          axisBottom={{
            legend: "Round",
            legendPosition: "middle",
            legendOffset: 40,
            tickRotation: 0,
            format: (v) => Number.isInteger(v as number) ? String(v) : "",
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
          pointColor={{ from: "color" }}
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
            const roundText = Number.isFinite(round) ? `Rd ${round}` : `Rd ${String(point.data.x)}`;
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

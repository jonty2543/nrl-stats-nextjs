"use client";

import { useMemo, useState } from "react";

type StatRow = {
  Year: string;
  Round: number;
  Round_Label?: string | null;
  Opponent?: string | null;
  [key: string]: string | number | null | undefined;
};

interface RollingAverageStatChartProps<T extends StatRow> {
  rows: T[];
  stat: string;
  label: string;
}

const ROLLING_WINDOWS = [3, 5, 10, 20] as const;
const CHART_HEIGHT = 240;
const PADDING = { top: 18, right: 18, bottom: 28, left: 34 };

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "").replace(/%$/, "");
    if (!trimmed || trimmed === "-") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sortChronologically<T extends StatRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const yearA = Number(a.Year);
    const yearB = Number(b.Year);
    if (Number.isFinite(yearA) && Number.isFinite(yearB) && yearA !== yearB) return yearA - yearB;
    return (a.Round ?? 0) - (b.Round ?? 0);
  });
}

function computeRollingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= windowSize) sum -= values[index - windowSize];
    result.push(sum / Math.min(windowSize, index + 1));
  }

  return result;
}

function formatRoundTitle(row: StatRow): string {
  const round = Number.isFinite(row.Round) ? `R${row.Round}` : "R?";
  const year = String(row.Year ?? "").trim() || "Unknown";
  const opponent = String(row.Opponent ?? "").trim();
  return opponent ? `${round} - ${year} vs ${opponent}` : `${round} - ${year}`;
}

export function RollingAverageStatChart<T extends StatRow>({
  rows,
  stat,
  label,
}: RollingAverageStatChartProps<T>) {
  const [windowSize, setWindowSize] = useState<number>(5);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const orderedRows = useMemo(() => sortChronologically(rows), [rows]);
  const points = useMemo(
    () =>
      orderedRows
        .map((row) => ({
          row,
          value: toFiniteNumber(row[stat]),
        }))
        .filter((point): point is { row: T; value: number } => point.value !== null),
    [orderedRows, stat]
  );

  const values = useMemo(() => points.map((point) => point.value), [points]);
  const rolling = useMemo(() => computeRollingAverage(values, windowSize), [values, windowSize]);
  const yMax = useMemo(() => {
    const maxValue = Math.max(0, ...values, ...rolling);
    if (maxValue <= 0) return 10;
    return Math.ceil(maxValue / 10) * 10;
  }, [rolling, values]);

  const width = Math.max(640, points.length * 14);
  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const barWidth = Math.max(6, Math.min(12, step * 0.72));
  const yearLabels = useMemo(() => {
    const labels: { index: number; year: string }[] = [];
    let currentYear = "";
    points.forEach((point, index) => {
      const year = String(point.row.Year ?? "").trim();
      if (!year || year === currentYear) return;
      currentYear = year;
      labels.push({ index, year });
    });
    return labels;
  }, [points]);

  const linePath = useMemo(() => {
    if (rolling.length === 0) return "";
    return rolling
      .map((value, index) => {
        const x = PADDING.left + index * step;
        const y = PADDING.top + innerHeight - (value / yMax) * innerHeight;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [innerHeight, rolling, step, yMax]);

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hoveredRolling = hoveredIndex !== null ? rolling[hoveredIndex] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-nrl-muted">{label}</div>
        <div className="inline-flex rounded-xl border border-nrl-edge bg-nrl-bg/60 p-1">
          {ROLLING_WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWindowSize(option)}
              className={`min-w-[2.5rem] rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                option === windowSize
                  ? "bg-nrl-accent/15 text-nrl-accent"
                  : "text-nrl-muted hover:text-nrl-text"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          className="h-[240px] min-w-[640px]"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = yMax * ratio;
            const y = PADDING.top + innerHeight - ratio * innerHeight;
            return (
              <g key={ratio}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(138,148,192,0.18)"
                  strokeWidth="1"
                />
                <text
                  x={PADDING.left - 10}
                  y={y + 4}
                  fill="rgba(200,210,240,0.72)"
                  fontSize="11"
                  textAnchor="end"
                >
                  {Math.round(value)}
                </text>
              </g>
            );
          })}

          {yearLabels.map(({ index, year }) => {
            const x = PADDING.left + index * step;
            return (
              <text
                key={`${year}-${index}`}
                x={x}
                y={CHART_HEIGHT - 6}
                fill="rgba(200,210,240,0.72)"
                fontSize="11"
                textAnchor={index === 0 ? "start" : "middle"}
              >
                {year}
              </text>
            );
          })}

          {points.map((point, index) => {
            const x = PADDING.left + index * step;
            const barHeight = (point.value / yMax) * innerHeight;
            const y = PADDING.top + innerHeight - barHeight;
            return (
              <rect
                key={`${point.row.Year}-${point.row.Round}-${index}`}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx={barWidth / 2}
                fill="rgba(38, 201, 133, 0.58)"
                onMouseMove={() => setHoveredIndex(index)}
              />
            );
          })}

          <path d={linePath} fill="none" stroke="rgba(238,241,250,0.94)" strokeWidth="3" />

          {hoveredIndex !== null ? (
            (() => {
              const x = PADDING.left + hoveredIndex * step;
              const tooltipWidth = 174;
              const tooltipHeight = 76;
              const placeLeft = x > width - tooltipWidth - 24;
              const tooltipX = placeLeft ? x - tooltipWidth - 10 : x + 10;
              const tooltipY = PADDING.top + 8;
              return (
                <g pointerEvents="none">
                  <line
                    x1={x}
                    x2={x}
                    y1={PADDING.top}
                    y2={PADDING.top + innerHeight}
                    stroke="rgba(220,226,245,0.45)"
                    strokeWidth="1"
                    strokeDasharray="6 6"
                  />
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx="12"
                    fill="rgba(16,20,36,0.96)"
                    stroke="rgba(89,99,142,0.6)"
                  />
                  <text x={tooltipX + 12} y={tooltipY + 20} fill="white" fontSize="13" fontWeight="700">
                    {hoveredPoint ? formatRoundTitle(hoveredPoint.row) : ""}
                  </text>
                  <text x={tooltipX + 12} y={tooltipY + 42} fill="rgba(232,238,248,0.94)" fontSize="13">
                    {stat}: {hoveredPoint?.value.toFixed(1)}
                  </text>
                  <text x={tooltipX + 12} y={tooltipY + 61} fill="rgba(167,176,205,0.9)" fontSize="13">
                    {windowSize} game MA: {hoveredRolling?.toFixed(1)}
                  </text>
                </g>
              );
            })()
          ) : null}
        </svg>
      </div>
    </div>
  );
}

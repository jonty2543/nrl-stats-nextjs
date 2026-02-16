"use client";

import { useMemo, useState } from "react";
import { nrlChartTheme, CHART_COLORS } from "./chart-theme";
import { pearsonR, linearRegression } from "@/lib/data/stats";
import type { PlayerStat } from "@/lib/data/types";

interface ScatterCorrelationProps {
  rows: PlayerStat[];
  statX: string;
  statY: string;
  title: string;
  label?: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value
      .trim()
      .replace(/,/g, "")
      .replace(/%$/, "")
      .replace(/s$/, "");
    if (!cleaned || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Interpolate through a multi-stop gradient. t in [0,1]. */
function recencyColor(t: number): string {
  const stops = [
    { t: 0, r: 128, g: 0, b: 255 },   // purple (first / oldest)
    { t: 0.33, r: 0, g: 100, b: 220 }, // blue
    { t: 0.55, r: 0, g: 200, b: 180 }, // teal
    { t: 0.78, r: 0, g: 245, b: 138 }, // accent green
    { t: 1, r: 230, g: 240, b: 0 },    // yellow (last / most recent)
  ];
  const clamped = Math.max(0, Math.min(1, t));
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].t && clamped <= stops[i + 1].t) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const frac = hi.t === lo.t ? 0 : (clamped - lo.t) / (hi.t - lo.t);
  const r = Math.round(lo.r + (hi.r - lo.r) * frac);
  const g = Math.round(lo.g + (hi.g - lo.g) * frac);
  const b = Math.round(lo.b + (hi.b - lo.b) * frac);
  return `rgb(${r},${g},${b})`;
}

interface AnnotatedPoint {
  x: number;
  y: number;
  color: string;
  tooltipLabel: string;
  index: number;
}

export function ScatterCorrelation({
  rows,
  statX,
  statY,
  title,
}: ScatterCorrelationProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradientId = useMemo(() => {
    const safeSeed = `${title}-${statX}-${statY}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `recency-grad-${safeSeed || "chart"}`;
  }, [statX, statY, title]);

  const { points, r, reg } = useMemo(() => {
    // Sort rows by year+round (chronological) to assign recency
    const valid: { x: number; y: number; year: string; roundLabel: string; opponent: string | null }[] = [];
    for (const row of rows) {
      const xv = toFiniteNumber(row[statX]);
      const yv = toFiniteNumber(row[statY]);
      if (xv !== null && yv !== null) {
        valid.push({ x: xv, y: yv, year: row.Year, roundLabel: row.Round_Label, opponent: row.Opponent });
      }
    }

    const sorted = [...valid].sort((a, b) => {
      if (a.year !== b.year) return a.year.localeCompare(b.year);
      const aR = parseInt(a.roundLabel, 10);
      const bR = parseInt(b.roundLabel, 10);
      if (!isNaN(aR) && !isNaN(bR)) return aR - bR;
      return a.roundLabel.localeCompare(b.roundLabel);
    });

    const n = sorted.length;
    const pts: AnnotatedPoint[] = sorted.map((p, i) => ({
      x: p.x,
      y: p.y,
      color: recencyColor(n <= 1 ? 1 : i / (n - 1)),
      tooltipLabel: `Rd ${p.roundLabel} ${p.year}${p.opponent ? ` vs ${p.opponent}` : ""}`,
      index: i,
    }));

    const xVals = pts.map((p) => p.x);
    const yVals = pts.map((p) => p.y);
    return {
      points: pts,
      r: pts.length >= 2 ? pearsonR(xVals, yVals) : null,
      reg: pts.length >= 2 ? linearRegression(xVals, yVals) : null,
    };
  }, [rows, statX, statY]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 text-nrl-muted text-sm">
        Need at least two data points for correlation.
      </div>
    );
  }

  // Compute scales manually
  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  // Add padding
  const xPad = (xMax - xMin) * 0.08 || 1;
  const yPad = (yMax - yMin) * 0.08 || 1;
  const xDomain = [xMin - xPad, xMax + xPad];
  const yDomain = [yMin - yPad, yMax + yPad];

  const margin = { top: 10, right: 50, bottom: 50, left: 60 };

  const hovered = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div>
      {r !== null && (
        <div className="text-xs font-bold mb-2 px-2 py-1 inline-block rounded border"
          style={{
            color: CHART_COLORS.primary,
            borderColor: CHART_COLORS.primary,
            background: "var(--color-nrl-panel)",
          }}
        >
          r = {r >= 0 ? "+" : ""}{r.toFixed(2)} | games = {points.length}
        </div>
      )}
      <div className="relative h-56">
        <svg width="100%" height="100%" viewBox="0 0 500 224" preserveAspectRatio="xMidYMid meet">
          <ChartArea
            points={points}
            reg={reg}
            xDomain={xDomain}
            yDomain={yDomain}
            margin={margin}
            width={500}
            height={224}
            statX={statX}
            statY={statY}
            theme={nrlChartTheme}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
          />
          {/* Gradient legend */}
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={recencyColor(0)} />
              <stop offset="33%" stopColor={recencyColor(0.33)} />
              <stop offset="55%" stopColor={recencyColor(0.55)} />
              <stop offset="78%" stopColor={recencyColor(0.78)} />
              <stop offset="100%" stopColor={recencyColor(1)} />
            </linearGradient>
          </defs>
          <rect
            x={500 - margin.right + 12}
            y={margin.top + 10}
            width={14}
            height={224 - margin.top - margin.bottom - 20}
            rx={3}
            fill={`url(#${gradientId})`}
          />
          <text x={500 - margin.right + 19} y={margin.top + 6} textAnchor="middle" fill="var(--color-nrl-muted)" fontSize={8} fontWeight="bold">Last</text>
          <text x={500 - margin.right + 19} y={224 - margin.bottom + 2} textAnchor="middle" fill="var(--color-nrl-muted)" fontSize={8} fontWeight="bold">First</text>
        </svg>
        {/* Tooltip overlay */}
        {hovered && (
          <div
            className="absolute pointer-events-none z-10 rounded px-2 py-1 text-xs font-medium"
            style={{
              background: "var(--color-nrl-panel)",
              border: "1px solid var(--color-nrl-border)",
              color: "var(--color-nrl-text)",
              left: `${scaleX(hovered.x, xDomain, margin, 500) / 500 * 100}%`,
              top: `${scaleY(hovered.y, yDomain, margin, 224) / 224 * 100}%`,
              transform: "translate(-50%, -130%)",
            }}
          >
            {hovered.tooltipLabel}
            <br />
            {statX}: {hovered.x} | {statY}: {hovered.y}
          </div>
        )}
      </div>
    </div>
  );
}

function scaleX(val: number, domain: number[], margin: { left: number; right: number }, width: number): number {
  const plotW = width - margin.left - margin.right;
  return margin.left + ((val - domain[0]) / (domain[1] - domain[0])) * plotW;
}

function scaleY(val: number, domain: number[], margin: { top: number; bottom: number }, height: number): number {
  const plotH = height - margin.top - margin.bottom;
  return margin.top + plotH - ((val - domain[0]) / (domain[1] - domain[0])) * plotH;
}

function ChartArea({
  points,
  reg,
  xDomain,
  yDomain,
  margin,
  width,
  height,
  statX,
  statY,
  theme,
  hoveredIdx,
  onHover,
}: {
  points: AnnotatedPoint[];
  reg: { m: number; b: number } | null;
  xDomain: number[];
  yDomain: number[];
  margin: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
  statX: string;
  statY: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (v: number) => margin.left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
  const sy = (v: number) => margin.top + plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;

  // Generate ~5 tick values
  const xTicks = niceTickValues(xDomain[0], xDomain[1], 6);
  const yTicks = niceTickValues(yDomain[0], yDomain[1], 5);

  const gridColor = theme?.grid?.line?.stroke ?? "var(--color-nrl-border)";
  const textColor = theme?.axis?.ticks?.text?.fill ?? "var(--color-nrl-muted)";

  return (
    <g>
      {/* Grid lines */}
      {yTicks.map((t) => (
        <line key={`yg-${t}`} x1={margin.left} x2={width - margin.right} y1={sy(t)} y2={sy(t)} stroke={gridColor} strokeWidth={0.5} strokeDasharray="4 3" />
      ))}
      {xTicks.map((t) => (
        <line key={`xg-${t}`} x1={sx(t)} x2={sx(t)} y1={margin.top} y2={height - margin.bottom} stroke={gridColor} strokeWidth={0.5} strokeDasharray="4 3" />
      ))}

      {/* Axes */}
      <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} stroke={gridColor} />
      <line x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} stroke={gridColor} />

      {/* X ticks */}
      {xTicks.map((t) => (
        <text key={`xt-${t}`} x={sx(t)} y={height - margin.bottom + 14} textAnchor="middle" fill={textColor} fontSize={9}>{formatTick(t)}</text>
      ))}
      {/* Y ticks */}
      {yTicks.map((t) => (
        <text key={`yt-${t}`} x={margin.left - 6} y={sy(t) + 3} textAnchor="end" fill={textColor} fontSize={9}>{formatTick(t)}</text>
      ))}

      {/* Axis labels */}
      <text x={margin.left + plotW / 2} y={height - 6} textAnchor="middle" fill={textColor} fontSize={10} fontWeight="bold">{statX}</text>
      <text x={14} y={margin.top + plotH / 2} textAnchor="middle" fill={textColor} fontSize={10} fontWeight="bold" transform={`rotate(-90, 14, ${margin.top + plotH / 2})`}>{statY}</text>

      {/* Trendline */}
      {reg && (
        <line
          x1={sx(xDomain[0])}
          y1={sy(reg.m * xDomain[0] + reg.b)}
          x2={sx(xDomain[1])}
          y2={sy(reg.m * xDomain[1] + reg.b)}
          stroke={CHART_COLORS.trendline}
          strokeWidth={2.5}
          strokeDasharray="6 4"
        />
      )}

      {/* Points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={hoveredIdx === i ? 7 : 5}
          fill={p.color}
          opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 0.9}
          stroke={hoveredIdx === i ? "var(--color-nrl-text)" : "none"}
          strokeWidth={hoveredIdx === i ? 1.5 : 0}
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => onHover(null)}
          style={{ cursor: "pointer", transition: "opacity 0.15s, r 0.15s" }}
        />
      ))}

      {/* Invisible larger hit areas for easier hovering */}
      {points.map((p, i) => (
        <circle
          key={`hit-${i}`}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={12}
          fill="transparent"
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => onHover(null)}
          style={{ cursor: "pointer" }}
        />
      ))}
    </g>
  );
}

function niceTickValues(min: number, max: number, count: number): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm <= 1.5) step = 1 * mag;
  else if (norm <= 3.5) step = 2 * mag;
  else if (norm <= 7.5) step = 5 * mag;
  else step = 10 * mag;

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function formatTick(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

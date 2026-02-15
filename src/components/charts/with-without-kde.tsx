"use client";

import { KDEDistribution } from "./kde-distribution";
import { CHART_COLORS } from "./chart-theme";

interface WithWithoutKDEProps {
  title: string;
  stat: string;
  withValues: number[];
  withoutValues: number[];
}

const WITH_COLOR = CHART_COLORS.primary;
const WITHOUT_COLOR = CHART_COLORS.trendline;
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

function valueDomain(withValues: number[], withoutValues: number[]): [number, number] {
  const allValues = [...withValues, ...withoutValues];
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

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function StripComparison({
  stat,
  withValues,
  withoutValues,
}: {
  stat: string;
  withValues: number[];
  withoutValues: number[];
}) {
  const domain = valueDomain(withValues, withoutValues);
  const [xMin, xMax] = domain;

  const width = 500;
  const height = 224;
  const margin = { top: 16, right: 20, bottom: 44, left: 76 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const withY = margin.top + innerHeight * 0.33;
  const withoutY = margin.top + innerHeight * 0.75;

  const xScale = (value: number): number =>
    margin.left + ((value - xMin) / (xMax - xMin)) * innerWidth;

  const ticks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);
  const withMean = withValues.length > 0 ? mean(withValues) : null;
  const withoutMean = withoutValues.length > 0 ? mean(withoutValues) : null;

  const formatStat = (value: number | null): string =>
    value === null ? "n/a" : value.toFixed(1);

  const renderMeanLabel = (
    avg: number | null,
    y: number,
    color: string
  ) => {
    if (avg === null) return null;
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
        {formatStat(avg)}
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
      </>
    );
  };

  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-nrl-muted">
        n ≤ 20 — showing boxplot + raw values (mean/IQR)
      </div>
      <div className="h-56">
        <svg className="distribution-svg" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
          <line x1={margin.left} y1={withY} x2={width - margin.right} y2={withY} stroke={AXIS_COLOR} strokeDasharray="4 4" />
          <line x1={margin.left} y1={withoutY} x2={width - margin.right} y2={withoutY} stroke={AXIS_COLOR} strokeDasharray="4 4" />

          {renderDistribution(withValues, withY, WITH_COLOR)}
          {renderDistribution(withoutValues, withoutY, WITHOUT_COLOR)}

          <text x={12} y={withY - 12} fill={WITH_COLOR} fontSize={11} fontWeight={700}>
            {`With (n=${withValues.length})`}
          </text>
          <text x={12} y={withoutY - 12} fill={WITHOUT_COLOR} fontSize={11} fontWeight={700}>
            {`Without (n=${withoutValues.length})`}
          </text>
          {renderMeanLabel(withMean, withY, WITH_COLOR)}
          {renderMeanLabel(withoutMean, withoutY, WITHOUT_COLOR)}

          <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke={AXIS_COLOR} />
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

          <text x={(margin.left + width - margin.right) / 2} y={height - 6} fill={LABEL_COLOR} fontSize={11} textAnchor="middle" fontWeight={600}>
            {stat}
          </text>
        </svg>
      </div>
    </div>
  );
}

export function WithWithoutKDE({
  title,
  stat,
  withValues,
  withoutValues,
}: WithWithoutKDEProps) {
  const smallestSample = Math.min(withValues.length, withoutValues.length);

  if (smallestSample <= BOXPLOT_MAX_SAMPLE) {
    return (
      <StripComparison
        stat={stat}
        withValues={withValues}
        withoutValues={withoutValues}
      />
    );
  }

  return (
    <KDEDistribution
      title={title}
      stat={stat}
      series={[
        {
          label: "With",
          values: withValues,
          color: WITH_COLOR,
        },
        {
          label: "Without",
          values: withoutValues,
          color: WITHOUT_COLOR,
        },
      ]}
    />
  );
}

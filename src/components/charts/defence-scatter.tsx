"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface TeamQuadrantPoint {
  id: string;
  team: string;
  year: string;
  roundLabel: string;
  opponent: string | null;
  games: number;
  xValue: number;
  yValue: number;
  detail: string;
}

export interface QuadrantLabels {
  topLeft: [string, string];
  topRight: [string, string];
  bottomLeft: [string, string];
  bottomRight: [string, string];
}

interface TeamQuadrantScatterProps {
  points: TeamQuadrantPoint[];
  teamLogos: Record<string, string>;
  ariaLabel: string;
  xAxisLabel: string;
  yAxisLabel: string;
  xMetricLabel: string;
  yMetricLabel: string;
  xValueSuffix?: string;
  yValueSuffix?: string;
  xValueDecimals?: number;
  yValueDecimals?: number;
  xHigherIsBetter: boolean;
  yHigherIsBetter?: boolean;
  quadrants: QuadrantLabels;
  minXPadding?: number;
  minYPadding?: number;
  useLogos?: boolean;
  emptyMessage?: string;
  pointImages?: Record<string, string>;
  colorByQuadrant?: boolean;
  comparisonLine?: boolean;
  rSquared?: number | null;
}

const WIDTH = 900;
const HEIGHT = 610;
const MARGIN = { top: 54, right: 34, bottom: 128, left: 82 };
const POINT_OVERFLOW = 23;
const ZOOM_LEVELS = [1, 1.35, 1.75, 2.25, 3] as const;

interface PlotDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startXDomain: [number, number];
  startYDomain: [number, number];
  viewBoxScaleX: number;
  viewBoxScaleY: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function logoFor(team: string, logos: Record<string, string>): string | null {
  return logos[team] ?? logos[normalise(team)] ?? logos[team.toLowerCase()] ?? null;
}

function ticks(min: number, max: number, count = 5): number[] {
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function zoomDomain(domain: [number, number], center: number, zoom: number): [number, number] {
  if (zoom <= 1) return domain;
  const width = (domain[1] - domain[0]) / zoom;
  const minimum = Math.min(Math.max(center - width / 2, domain[0]), domain[1] - width);
  return [minimum, minimum + width];
}

export function TeamQuadrantScatter({
  points,
  teamLogos,
  ariaLabel,
  xAxisLabel,
  yAxisLabel,
  xMetricLabel,
  yMetricLabel,
  xValueSuffix = "",
  yValueSuffix = "",
  xValueDecimals = 1,
  yValueDecimals = 1,
  xHigherIsBetter,
  yHigherIsBetter = true,
  quadrants,
  minXPadding = 1,
  minYPadding = 1,
  useLogos = true,
  emptyMessage = "No team games are available for this season.",
  pointImages,
  colorByQuadrant = true,
  comparisonLine = false,
  rSquared = null,
}: TeamQuadrantScatterProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomState, setZoomState] = useState({ pointsKey: "", index: 0, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<PlotDragState | null>(null);
  const pointsKey = useMemo(() => points.map((point) => point.id).join("|"), [points]);
  const zoomIndex = zoomState.pointsKey === pointsKey ? zoomState.index : 0;
  const panX = zoomState.pointsKey === pointsKey ? zoomState.panX : 0;
  const panY = zoomState.pointsKey === pointsKey ? zoomState.panY : 0;
  const zoom = ZOOM_LEVELS[zoomIndex];
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const xValues = points.map((point) => point.xValue);
    const yValues = points.map((point) => point.yValue);
    const xMean = mean(xValues);
    const yMean = mean(yValues);
    const xPadding = Math.max((Math.max(...xValues) - Math.min(...xValues)) * 0.1, minXPadding);
    const yPadding = Math.max((Math.max(...yValues) - Math.min(...yValues)) * 0.1, minYPadding);
    if (comparisonLine) {
      const combined = [...xValues, ...yValues];
      const padding = Math.max((Math.max(...combined) - Math.min(...combined)) * 0.1, minXPadding, minYPadding);
      const domain = [Math.max(0, Math.min(...combined) - padding), Math.max(...combined) + padding] as [number, number];
      return { xMean, yMean, xDomain: domain, yDomain: domain };
    }
    return {
      xMean,
      yMean,
      xDomain: [Math.max(0, Math.min(...xValues) - xPadding), Math.max(...xValues) + xPadding] as [number, number],
      yDomain: [Math.max(0, Math.min(...yValues) - yPadding), Math.max(...yValues) + yPadding] as [number, number],
    };
  }, [comparisonLine, minXPadding, minYPadding, points]);

  if (!chart) {
    return <div className="grid min-h-96 place-items-center text-sm text-nrl-muted">{emptyMessage}</div>;
  }

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xDomain = zoomDomain(chart.xDomain, chart.xMean + panX, zoom);
  const yDomain = zoomDomain(chart.yDomain, chart.yMean + panY, zoom);
  const xScale = (value: number) => {
    const ratio = (value - xDomain[0]) / (xDomain[1] - xDomain[0]);
    return MARGIN.left + (xHigherIsBetter ? ratio : 1 - ratio) * plotWidth;
  };
  const yScale = (value: number) => MARGIN.top + ((yDomain[1] - value) / (yDomain[1] - yDomain[0])) * plotHeight;
  const hovered = points.find((point) => point.id === hoveredId) ?? null;
  const hoveredX = hovered ? xScale(hovered.xValue) : 0;
  const hoveredY = hovered ? yScale(hovered.yValue) : 0;
  const showTeamLogos = useLogos && points.length <= 20;
  const changeZoom = (nextIndex: number) => {
    setHoveredId(null);
    const index = Math.max(0, Math.min(nextIndex, ZOOM_LEVELS.length - 1));
    if (index === 0) {
      setZoomState({ pointsKey, index, panX: 0, panY: 0 });
      return;
    }
    const nextZoom = ZOOM_LEVELS[index];
    const nextXDomain = zoomDomain(chart.xDomain, chart.xMean + panX, nextZoom);
    const nextYDomain = zoomDomain(chart.yDomain, chart.yMean + panY, nextZoom);
    setZoomState({
      pointsKey,
      index,
      panX: (nextXDomain[0] + nextXDomain[1]) / 2 - chart.xMean,
      panY: (nextYDomain[0] + nextYDomain[1]) / 2 - chart.yMean,
    });
  };

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (zoomIndex === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewBoxScaleX = WIDTH / bounds.width;
    const viewBoxScaleY = HEIGHT / bounds.height;
    const pointerX = (event.clientX - bounds.left) * viewBoxScaleX;
    const pointerY = (event.clientY - bounds.top) * viewBoxScaleY;
    if (pointerX < MARGIN.left || pointerX > MARGIN.left + plotWidth || pointerY < MARGIN.top || pointerY > MARGIN.top + plotHeight) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXDomain: xDomain,
      startYDomain: yDomain,
      viewBoxScaleX,
      viewBoxScaleY,
    };
    setHoveredId(null);
    setIsDragging(true);
  };

  const movePan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - drag.startClientX) * drag.viewBoxScaleX;
    const deltaY = (event.clientY - drag.startClientY) * drag.viewBoxScaleY;
    const xDirection = xHigherIsBetter ? 1 : -1;
    const desiredXCenter = (drag.startXDomain[0] + drag.startXDomain[1]) / 2
      - deltaX * ((drag.startXDomain[1] - drag.startXDomain[0]) / plotWidth) * xDirection;
    const desiredYCenter = (drag.startYDomain[0] + drag.startYDomain[1]) / 2
      + deltaY * ((drag.startYDomain[1] - drag.startYDomain[0]) / plotHeight);
    const nextXDomain = zoomDomain(chart.xDomain, desiredXCenter, zoom);
    const nextYDomain = zoomDomain(chart.yDomain, desiredYCenter, zoom);
    setZoomState({
      pointsKey,
      index: zoomIndex,
      panX: (nextXDomain[0] + nextXDomain[1]) / 2 - chart.xMean,
      panY: (nextYDomain[0] + nextYDomain[1]) / 2 - chart.yMean,
    });
  };

  const endPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
    setIsDragging(false);
  };

  const quadrantText = (
    labels: [string, string],
    x: number,
    y: number,
    anchor: "start" | "end" = "start"
  ) => (
    <>
      <text x={x} y={y} textAnchor={anchor}>{labels[0]}</text>
      <text x={x} y={y + 14} textAnchor={anchor}>{labels[1]}</text>
    </>
  );

  return (
    <div className="relative">
      <div className="absolute left-1/2 top-1 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-nrl-border bg-nrl-panel/95 p-1 shadow-lg" aria-label="Plot zoom controls">
        <button type="button" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => changeZoom(zoomIndex - 1)} className="grid h-6 w-6 place-items-center rounded-full text-sm font-black text-nrl-text transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">−</button>
        <span className="min-w-9 text-center text-[9px] font-black text-nrl-muted" aria-live="polite">{zoom.toFixed(2).replace(/0$/, "")}×</span>
        <button type="button" aria-label="Zoom in" disabled={zoomIndex === ZOOM_LEVELS.length - 1} onClick={() => changeZoom(zoomIndex + 1)} className="grid h-6 w-6 place-items-center rounded-full text-sm font-black text-nrl-text transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">+</button>
        <button type="button" aria-label="Reset zoom" disabled={zoomIndex === 0} onClick={() => changeZoom(0)} className="grid h-6 w-6 place-items-center rounded-full text-xs font-black text-nrl-muted transition-colors hover:bg-white/10 hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-30">↺</button>
        {rSquared !== null ? <span className="border-l border-nrl-border px-2 text-[9px] font-black text-nrl-text" aria-label={`R squared ${rSquared.toFixed(3)}`}>R² = {rSquared.toFixed(3)}</span> : null}
      </div>
      <svg
        className={`h-auto w-full ${zoomIndex > 0 ? isDragging ? "cursor-grabbing" : "cursor-grab" : ""}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{ touchAction: zoomIndex > 0 ? "none" : "auto" }}
      >
        <defs>
          <clipPath id="quadrant-data-area"><rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} rx="8" /></clipPath>
          <clipPath id="quadrant-point-area"><rect x={MARGIN.left - POINT_OVERFLOW} y={MARGIN.top - POINT_OVERFLOW} width={plotWidth + POINT_OVERFLOW * 2} height={plotHeight + POINT_OVERFLOW * 2} /></clipPath>
        </defs>
        <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} rx="8" fill="var(--color-nrl-bg)" />

        {ticks(xDomain[0], xDomain[1]).map((tick) => {
          const x = xScale(tick);
          return <g key={`x-${tick}`}><line x1={x} y1={MARGIN.top} x2={x} y2={MARGIN.top + plotHeight} stroke="var(--color-nrl-border)" opacity="0.45" /><text x={x} y={MARGIN.top + plotHeight + 24} textAnchor="middle" fill="var(--color-nrl-muted)" className="text-[12px] lg:text-[8px]">{tick.toFixed(xValueDecimals)}{xValueSuffix}</text></g>;
        })}
        {ticks(yDomain[0], yDomain[1]).map((tick) => {
          const y = yScale(tick);
          return <g key={`y-${tick}`}><line x1={MARGIN.left} y1={y} x2={MARGIN.left + plotWidth} y2={y} stroke="var(--color-nrl-border)" opacity="0.45" /><text x={MARGIN.left - 14} y={y + 4} textAnchor="end" fill="var(--color-nrl-muted)" className="text-[12px] lg:text-[8px]">{tick.toFixed(yValueDecimals)}{yValueSuffix}</text></g>;
        })}

        <g clipPath="url(#quadrant-data-area)">
          {comparisonLine ? (
            <line x1={xScale(Math.max(xDomain[0], yDomain[0]))} y1={yScale(Math.max(xDomain[0], yDomain[0]))} x2={xScale(Math.min(xDomain[1], yDomain[1]))} y2={yScale(Math.min(xDomain[1], yDomain[1]))} stroke="#a7b0cd" strokeWidth="2" opacity="0.85" />
          ) : (
            <>
              <line x1={xScale(chart.xMean)} y1={MARGIN.top} x2={xScale(chart.xMean)} y2={MARGIN.top + plotHeight} stroke="#7890c8" strokeWidth="1.5" opacity="0.8" />
              <line x1={MARGIN.left} y1={yScale(chart.yMean)} x2={MARGIN.left + plotWidth} y2={yScale(chart.yMean)} stroke="#7890c8" strokeWidth="1.5" opacity="0.8" />
            </>
          )}
        </g>

        {!comparisonLine ? (
          <g fill="var(--color-nrl-text)" fontWeight="800" opacity="0.78" className="text-[13px] lg:text-[9px]">
            {quadrantText(quadrants.topLeft, MARGIN.left + 16, MARGIN.top - 24)}
            {quadrantText(quadrants.topRight, MARGIN.left + plotWidth - 16, MARGIN.top - 24, "end")}
            {quadrantText(quadrants.bottomLeft, MARGIN.left + 16, MARGIN.top + plotHeight + 50)}
            {quadrantText(quadrants.bottomRight, MARGIN.left + plotWidth - 16, MARGIN.top + plotHeight + 50, "end")}
          </g>
        ) : null}

        <g clipPath="url(#quadrant-point-area)">{points.map((point, pointIndex) => {
          const x = xScale(point.xValue);
          const y = yScale(point.yValue);
          const isRight = xHigherIsBetter ? point.xValue >= chart.xMean : point.xValue <= chart.xMean;
          const isTop = yHigherIsBetter ? point.yValue >= chart.yMean : point.yValue <= chart.yMean;
          const pointColor = comparisonLine
            ? point.yValue >= point.xValue ? "#10f08b" : "#ff5364"
            : colorByQuadrant
              ? isTop && isRight ? "#10f08b" : !isTop && !isRight ? "#ff5364" : "#4f9cff"
              : "#79dbe3";
          const imageUrl = pointImages?.[point.id] ?? (showTeamLogos ? logoFor(point.team, teamLogos) : null);
          const active = point.id === hoveredId;
          const radius = imageUrl ? active ? 20 : 17 : active ? 8 : 5.5;
          const clipId = `plot-point-image-${pointIndex}`;
          return (
            <g key={point.id} tabIndex={0} role="button" aria-label={`${point.team}: ${xMetricLabel.toLowerCase()} ${point.xValue.toFixed(xValueDecimals)}${xValueSuffix}, ${yMetricLabel.toLowerCase()} ${point.yValue.toFixed(yValueDecimals)}${yValueSuffix}`} onMouseEnter={() => setHoveredId(point.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(point.id)} onBlur={() => setHoveredId(null)} className="cursor-pointer outline-none">
              {imageUrl ? <defs><clipPath id={clipId}><circle cx={x} cy={y} r={radius - 1.5} /></clipPath></defs> : null}
              <circle cx={x} cy={y} r={radius} fill={imageUrl ? "var(--color-nrl-panel)" : pointColor} stroke={pointColor} strokeWidth={active ? 3 : 1.5} opacity={active ? 1 : 0.78} />
              {imageUrl ? <image href={imageUrl} x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} pointerEvents="none" /> : null}
            </g>
          );
        })}</g>

        <text x={MARGIN.left + plotWidth / 2} y={HEIGHT - 20} textAnchor="middle" fill="var(--color-nrl-text)" fontWeight="900" className="text-[15px] lg:text-[10px]">{xAxisLabel}</text>
        <text transform={`translate(22 ${MARGIN.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill="var(--color-nrl-text)" fontWeight="900" className="text-[15px] lg:text-[10px]">{yAxisLabel}</text>
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 w-52 max-w-[calc(100%_-_1rem)] rounded-lg border border-nrl-accent/50 bg-nrl-panel px-3 py-2 text-xs shadow-xl lg:text-[10px]"
          style={{
            left: `clamp(0.5rem, calc(${(hoveredX / WIDTH) * 100}% ${hoveredX > WIDTH / 2 ? "- 14rem" : "+ 1rem"}), calc(100% - 13.5rem))`,
            top: `clamp(0.5rem, calc(${(hoveredY / HEIGHT) * 100}% ${hoveredY > HEIGHT / 2 ? "- 6rem" : "+ 1rem"}), calc(100% - 5.5rem))`,
          }}
        >
          <div className="font-black text-nrl-text">{hovered.team}{hovered.opponent ? ` · ${hovered.roundLabel} vs ${hovered.opponent}` : ` · ${hovered.year}`}</div>
          <div className="mt-1 text-nrl-muted">{xMetricLabel} {hovered.xValue.toFixed(xValueDecimals)}{xValueSuffix} · {yMetricLabel} {hovered.yValue.toFixed(yValueDecimals)}{yValueSuffix}</div>
          <div className="text-nrl-muted">
            {pointImages ? `${hovered.games} games` : <>{hovered.detail}{hovered.games > 1 ? ` · ${hovered.games} games` : ""}</>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

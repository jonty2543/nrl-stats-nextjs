"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PLAYER_SILHOUETTE_SRC } from "@/components/ui/player-image-with-fallback";

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
  searchEntityLabel?: "players" | "teams";
  colorByQuadrant?: boolean;
  comparisonLine?: boolean;
  comparisonHigherIsBetter?: boolean;
  rSquared?: number | null;
  singleAxis?: boolean;
  showQuadrantLabels?: boolean;
}

const DESKTOP_LAYOUT = {
  width: 900,
  height: 580,
  margin: { top: 54, right: 34, bottom: 128, left: 82 },
} as const;
const MOBILE_LAYOUT = {
  width: 700,
  height: 820,
  margin: { top: 72, right: 28, bottom: 148, left: 112 },
} as const;
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

interface PointGroup {
  key: string;
  points: TeamQuadrantPoint[];
  xValue: number;
  yValue: number;
  stackIndex?: number;
  stackSize?: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const TEAM_LOGO_ALIASES: Record<string, string[]> = {
  "sea eagles": ["manly sea eagles", "manly warringah sea eagles"],
  "wm seagulls": ["wynnum manly seagulls", "wynnum manly"],
  bulldogs: ["canterbury bulldogs", "canterbury bankstown bulldogs"],
  eels: ["parramatta eels"],
  panthers: ["penrith panthers"],
  rabbitohs: ["south sydney rabbitohs"],
  dragons: ["st george illawarra dragons", "st george dragons"],
  roosters: ["sydney roosters", "eastern suburbs roosters"],
  warriors: ["new zealand warriors"],
  tigers: ["wests tigers"],
  dolphins: ["the dolphins"],
};

function formatRoundLabel(value: string): string {
  const label = value.trim();
  return /^\d+$/.test(label) ? `Rd${label}` : label;
}

function logoFor(team: string, logos: Record<string, string>): string | null {
  const key = normalise(team);
  const direct = logos[team] ?? logos[key] ?? logos[team.toLowerCase()];
  if (direct) return direct;

  for (const alias of TEAM_LOGO_ALIASES[key] ?? []) {
    const logo = logos[alias] ?? logos[normalise(alias)];
    if (logo) return logo;
  }

  return Object.entries(logos).find(([logoKey]) => normalise(logoKey).includes(key))?.[1] ?? null;
}

function ticks(min: number, max: number, count = 5): number[] {
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function integerTicks(min: number, max: number, count: number): number[] {
  const start = Math.ceil(min);
  const end = Math.floor(max);
  if (end <= start) return [Math.round((min + max) / 2)];
  const tickCount = Math.min(count, end - start + 1);
  return [...new Set(ticks(start, end, tickCount).map(Math.round))];
}

function preferredTicks(min: number, max: number, count = 5): number[] {
  const integerCount = Math.floor(max) - Math.ceil(min) + 1;
  return integerCount >= 3 ? integerTicks(min, max, count) : ticks(min, max, count);
}

function formatTick(value: number, decimals: number): string {
  return value.toFixed(Number.isInteger(value) ? 0 : decimals);
}

function dataPadding(values: number[], flatFallback: number): number {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  return range > 0 ? range * 0.1 : Math.max(Math.abs(minimum) * 0.1, flatFallback);
}

function paddedMinimum(values: number[], padding: number): number {
  const minimum = Math.min(...values);
  return minimum < 0 ? minimum - padding : Math.max(0, minimum - padding);
}

function interpolateRgb(start: [number, number, number], end: [number, number, number], ratio: number): string {
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * boundedRatio));
  return `rgb(${channels.join(", ")})`;
}

function singleAxisHeatColor(ratio: number): string {
  const red: [number, number, number] = [255, 83, 100];
  const amber: [number, number, number] = [246, 196, 69];
  const green: [number, number, number] = [16, 240, 139];
  if (ratio < 0.32) return interpolateRgb(red, amber, ratio / 0.32);
  if (ratio < 0.62) return interpolateRgb(amber, green, (ratio - 0.32) / 0.3);
  return "rgb(16, 240, 139)";
}

function groupNearbyPoints(
  points: TeamQuadrantPoint[],
  xScale: (value: number) => number,
  yScale: (value: number) => number,
  overlapDistance: number
): PointGroup[] {
  const visited = new Set<number>();
  const groups: PointGroup[] = [];

  points.forEach((point, pointIndex) => {
    if (visited.has(pointIndex)) return;
    const indexes = [pointIndex];
    visited.add(pointIndex);

    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      const current = points[indexes[cursor]];
      const currentX = xScale(current.xValue);
      const currentY = yScale(current.yValue);
      points.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return;
        const distance = Math.hypot(xScale(candidate.xValue) - currentX, yScale(candidate.yValue) - currentY);
        if (distance <= overlapDistance) {
          visited.add(candidateIndex);
          indexes.push(candidateIndex);
        }
      });
    }

    const groupedPoints = indexes.map((index) => points[index]);
    groups.push({
      key: groupedPoints.map((groupedPoint) => groupedPoint.id).sort().join("|"),
      points: groupedPoints,
      xValue: mean(groupedPoints.map((groupedPoint) => groupedPoint.xValue)),
      yValue: mean(groupedPoints.map((groupedPoint) => groupedPoint.yValue)),
    });
  });

  return groups;
}

function stackNearbyPoints(
  points: TeamQuadrantPoint[],
  xScale: (value: number) => number,
  overlapDistance: number
): PointGroup[] {
  const stacks: Array<{ anchorX: number; anchorValue: number; points: TeamQuadrantPoint[] }> = [];
  const sortedPoints = [...points].sort((left, right) => xScale(left.xValue) - xScale(right.xValue));

  for (const point of sortedPoints) {
    const pointX = xScale(point.xValue);
    const closestStack = stacks
      .map((stack) => ({ stack, distance: Math.abs(pointX - stack.anchorX) }))
      .filter(({ distance }) => distance <= overlapDistance)
      .sort((left, right) => left.distance - right.distance)[0]?.stack;

    if (closestStack) {
      closestStack.points.push(point);
    } else {
      stacks.push({ anchorX: pointX, anchorValue: point.xValue, points: [point] });
    }
  }

  return stacks.flatMap(({ anchorValue: stackXValue, points: stack }) => {
    const orderedStack = [...stack].sort((left, right) => right.xValue - left.xValue || left.team.localeCompare(right.team));
    const stackSize = orderedStack.length;
    return orderedStack.map((point, stackIndex): PointGroup => ({
      key: point.id,
      points: [point],
      xValue: stackXValue,
      yValue: 0,
      stackIndex,
      stackSize,
    }));
  });
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
  searchEntityLabel: searchEntityLabelOverride,
  colorByQuadrant = true,
  comparisonLine = false,
  comparisonHigherIsBetter = true,
  rSquared = null,
  singleAxis = false,
  showQuadrantLabels = false,
}: TeamQuadrantScatterProps) {
  const svgId = useId().replace(/:/g, "");
  const dataClipId = `${svgId}-data-area`;
  const pointAreaClipId = `${svgId}-point-area`;
  const heatGradientId = `${svgId}-heat-gradient`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoomState, setZoomState] = useState({ pointsKey: "", index: 0, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const dragState = useRef<PlotDragState | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const pointsKey = useMemo(() => points.map((point) => point.id).join("|"), [points]);
  const searchResults = useMemo(() => {
    const query = normalise(searchQuery);
    if (!query) return [];
    return points
      .filter((point) => normalise(`${point.team} ${point.opponent ?? ""} ${point.detail}`).includes(query))
      .sort((left, right) => {
        const leftStartsWith = normalise(left.team).startsWith(query);
        const rightStartsWith = normalise(right.team).startsWith(query);
        return Number(rightStartsWith) - Number(leftStartsWith) || left.team.localeCompare(right.team);
      })
      .slice(0, 8);
  }, [points, searchQuery]);
  const zoomIndex = !singleAxis && zoomState.pointsKey === pointsKey ? zoomState.index : 0;
  const panX = !singleAxis && zoomState.pointsKey === pointsKey ? zoomState.panX : 0;
  const panY = !singleAxis && zoomState.pointsKey === pointsKey ? zoomState.panY : 0;
  const zoom = ZOOM_LEVELS[zoomIndex];
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const xValues = points.map((point) => point.xValue);
    const yValues = singleAxis ? points.map(() => 0) : points.map((point) => point.yValue);
    const xMean = mean(xValues);
    const yMean = mean(yValues);
    const xPadding = dataPadding(xValues, minXPadding);
    const yPadding = dataPadding(yValues, minYPadding);
    if (comparisonLine) {
      const combined = [...xValues, ...yValues];
      const padding = dataPadding(combined, Math.max(minXPadding, minYPadding));
      const domain = [paddedMinimum(combined, padding), Math.max(...combined) + padding] as [number, number];
      return { xMean, yMean, xDomain: domain, yDomain: domain };
    }
    return {
      xMean,
      yMean,
      xDomain: [paddedMinimum(xValues, xPadding), Math.max(...xValues) + xPadding] as [number, number],
      yDomain: singleAxis
        ? [-1, 1] as [number, number]
        : [paddedMinimum(yValues, yPadding), Math.max(...yValues) + yPadding] as [number, number],
    };
  }, [comparisonLine, minXPadding, minYPadding, points, singleAxis]);

  if (!chart) {
    return <div className="grid min-h-96 place-items-center text-sm text-nrl-muted">{emptyMessage}</div>;
  }

  const layout = isMobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT;
  const { width, margin } = layout;
  const pointOverflow = isMobile ? 31 : 23;
  const plotWidth = width - margin.left - margin.right;
  const xPlotLeft = singleAxis ? margin.right : margin.left;
  const xPlotWidth = singleAxis ? width - margin.right * 2 : plotWidth;
  const xScaleLeft = singleAxis ? xPlotLeft + pointOverflow : xPlotLeft;
  const xScaleWidth = singleAxis ? xPlotWidth - pointOverflow * 2 : xPlotWidth;
  const xDomain = zoomDomain(chart.xDomain, chart.xMean + panX, zoom);
  const yDomain = singleAxis ? chart.yDomain : zoomDomain(chart.yDomain, chart.yMean + panY, zoom);
  const xTicks = singleAxis ? integerTicks(xDomain[0], xDomain[1], isMobile ? 2 : 3) : preferredTicks(xDomain[0], xDomain[1]);
  const yTicks = singleAxis ? [] : preferredTicks(yDomain[0], yDomain[1]);
  const xScale = (value: number) => {
    const rawRatio = (value - xDomain[0]) / (xDomain[1] - xDomain[0]);
    const ratio = singleAxis ? Math.max(0, Math.min(1, rawRatio)) : rawRatio;
    return xScaleLeft + (xHigherIsBetter ? ratio : 1 - ratio) * xScaleWidth;
  };
  const showTeamLogos = useLogos && points.length <= 28;
  const usesLargeMarkers = Boolean(pointImages) || showTeamLogos;
  const singleAxisGroups = singleAxis
    ? stackNearbyPoints(points, xScale, usesLargeMarkers ? isMobile ? 56 : 38 : isMobile ? 18 : 10)
    : [];
  const singleAxisGroupXs = singleAxisGroups.map((group) => xScale(group.xValue));
  const leftEdgeStackX = Math.min(...singleAxisGroupXs);
  const rightEdgeStackX = Math.max(...singleAxisGroupXs);
  const maxStackSize = Math.max(1, ...singleAxisGroups.map((group) => group.stackSize ?? 1));
  const singleAxisMaximumPlotHeight = layout.height - margin.top - margin.bottom;
  const stackPadding = usesLargeMarkers ? isMobile ? 34 : 24 : isMobile ? 16 : 12;
  const maximumStackGap = usesLargeMarkers ? isMobile ? 50 : 36 : isMobile ? 11 : 8;
  const densestStackGap = maxStackSize > 1
    ? Math.min(maximumStackGap, (singleAxisMaximumPlotHeight - stackPadding * 2) / (maxStackSize - 1))
    : 0;
  const compactPointRadius = Math.max(isMobile ? 2.75 : 2.25, Math.min(isMobile ? 5 : 3.75, densestStackGap * 0.38));
  const singleAxisPlotHeight = stackPadding * 2 + (maxStackSize - 1) * densestStackGap;
  const plotHeight = singleAxis
    ? singleAxisPlotHeight
    : layout.height - margin.top - margin.bottom;
  const height = margin.top + plotHeight + margin.bottom;
  const singleAxisHeatBarY = margin.top + plotHeight + (isMobile ? 20 : 16);
  const singleAxisHeatBarHeight = isMobile ? 14 : 10;
  const singleAxisHeatBarX = xPlotLeft;
  const singleAxisHeatBarWidth = xPlotWidth;
  const plotCenterLeft = `${((xPlotLeft + xPlotWidth / 2) / width) * 100}%`;
  const yScale = (value: number) => margin.top + ((yDomain[1] - value) / (yDomain[1] - yDomain[0])) * plotHeight;
  const selectedPoint = points.find((point) => point.id === selectedPointId) ?? null;
  const pointGroups: PointGroup[] = singleAxis
    ? singleAxisGroups
    : selectedPoint
      ? [
          ...groupNearbyPoints(points.filter((point) => point.id !== selectedPoint.id), xScale, yScale, usesLargeMarkers ? isMobile ? 24 : 17 : isMobile ? 8 : 5.5),
          { key: selectedPoint.id, points: [selectedPoint], xValue: selectedPoint.xValue, yValue: selectedPoint.yValue },
        ]
      : groupNearbyPoints(points, xScale, yScale, usesLargeMarkers ? isMobile ? 24 : 17 : isMobile ? 8 : 5.5);
  const stackGapFor = (group: PointGroup) => {
    const stackSize = group.stackSize ?? 1;
    return stackSize > 1
      ? Math.min(maximumStackGap, (singleAxisPlotHeight - stackPadding * 2) / (stackSize - 1))
      : 0;
  };
  const groupY = (group: PointGroup) => {
    if (!singleAxis) return yScale(group.yValue);
    const stackSize = group.stackSize ?? 1;
    const stackIndex = group.stackIndex ?? 0;
    return margin.top + singleAxisPlotHeight - stackPadding - ((stackSize - 1 - stackIndex) * stackGapFor(group));
  };
  const hoveredGroup = pointGroups.find((group) => group.points.some((point) => point.id === hoveredId)) ?? null;
  const hovered = hoveredGroup?.points.length === 1 ? hoveredGroup.points[0] : null;
  const selectedGroup = pointGroups.find((group) => group.key === selectedGroupKey && group.points.length > 1) ?? null;
  const activePoint = selectedPoint ?? hovered;
  const activeGroup = activePoint
    ? pointGroups.find((group) => group.points.some((point) => point.id === activePoint.id)) ?? null
    : null;
  const activePointX = activeGroup ? xScale(activeGroup.xValue) : 0;
  const activePointY = activeGroup ? groupY(activeGroup) : 0;
  const selectedGroupX = selectedGroup ? xScale(selectedGroup.xValue) : 0;
  const searchEntityLabel = searchEntityLabelOverride ?? (pointImages ? "players" : "teams");
  const selectSearchResult = (point: TeamQuadrantPoint) => {
    setSelectedPointId(point.id);
    setSelectedGroupKey(null);
    setHoveredId(null);
    setSearchQuery(point.team);
    setSearchOpen(false);
  };
  const changeZoom = (nextIndex: number) => {
    setHoveredId(null);
    setSelectedGroupKey(null);
    setSelectedPointId(null);
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
    const viewBoxScaleX = width / bounds.width;
    const viewBoxScaleY = height / bounds.height;
    const pointerX = (event.clientX - bounds.left) * viewBoxScaleX;
    const pointerY = (event.clientY - bounds.top) * viewBoxScaleY;
    if (pointerX < xPlotLeft || pointerX > xPlotLeft + xPlotWidth || pointerY < margin.top || pointerY > margin.top + plotHeight) return;
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
      - deltaX * ((drag.startXDomain[1] - drag.startXDomain[0]) / xScaleWidth) * xDirection;
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
      <text x={x} y={y + (isMobile ? 22 : 14)} textAnchor={anchor}>{labels[1]}</text>
    </>
  );

  return (
    <div className="relative">
      {singleAxis ? (
        <button type="button" aria-label={`Search ${searchEntityLabel}`} aria-expanded={searchOpen} onClick={() => setSearchOpen((current) => !current)} className="absolute right-1 top-1 z-20 grid h-9 w-9 place-items-center rounded-full border border-nrl-border bg-nrl-panel/95 text-nrl-muted shadow-lg transition-colors hover:text-nrl-text">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m12.5 12.5 4 4" /></svg>
        </button>
      ) : (
        <div className="absolute top-1 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-nrl-border bg-nrl-panel/95 p-1 shadow-lg" style={{ left: plotCenterLeft }} aria-label="Plot controls">
        <button type="button" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => changeZoom(zoomIndex - 1)} className="grid h-6 w-6 place-items-center rounded-full text-sm font-black text-nrl-text transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">−</button>
        <span className="min-w-9 text-center text-[9px] font-black text-nrl-muted" aria-live="polite">{zoom.toFixed(2).replace(/0$/, "")}×</span>
        <button type="button" aria-label="Zoom in" disabled={zoomIndex === ZOOM_LEVELS.length - 1} onClick={() => changeZoom(zoomIndex + 1)} className="grid h-6 w-6 place-items-center rounded-full text-sm font-black text-nrl-text transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">+</button>
        <button type="button" aria-label="Reset zoom" disabled={zoomIndex === 0} onClick={() => changeZoom(0)} className="grid h-6 w-6 place-items-center rounded-full text-xs font-black text-nrl-muted transition-colors hover:bg-white/10 hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-30">↺</button>
        <button type="button" aria-label={`Search ${searchEntityLabel}`} aria-expanded={searchOpen} onClick={() => setSearchOpen((current) => !current)} className="grid h-6 w-6 place-items-center rounded-full text-nrl-muted transition-colors hover:bg-white/10 hover:text-nrl-text">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m12.5 12.5 4 4" /></svg>
        </button>
        {rSquared !== null ? <span className="border-l border-nrl-border px-2 text-[9px] font-black text-nrl-text" aria-label={`R squared ${rSquared.toFixed(3)}`}>R² = {rSquared.toFixed(3)}</span> : null}
        </div>
      )}
      {searchOpen ? (
        <div className="absolute top-11 z-30 w-72 max-w-[calc(100%_-_1rem)] -translate-x-1/2 rounded-lg border border-nrl-border bg-nrl-panel p-2 shadow-xl" style={{ left: plotCenterLeft }}>
          <input
            autoFocus
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
              if (event.key === "Enter" && searchResults[0]) selectSearchResult(searchResults[0]);
            }}
            placeholder={`Search ${searchEntityLabel}`}
            className="w-full rounded-md border border-nrl-border bg-nrl-bg px-3 py-2 text-xs text-nrl-text outline-none placeholder:text-nrl-muted focus:border-nrl-accent"
          />
          {searchQuery.trim() ? (
            <div className="mt-1 max-h-56 overflow-y-auto">
              {searchResults.length > 0 ? searchResults.map((point) => (
                <button key={point.id} type="button" onClick={() => selectSearchResult(point)} className="block w-full rounded px-2 py-2 text-left text-xs transition-colors hover:bg-white/5">
                  <span className="block font-bold text-nrl-text">{point.team}</span>
                  <span className="block truncate text-[10px] text-nrl-muted">{point.opponent ? `${formatRoundLabel(point.roundLabel)} vs ${point.opponent}` : point.detail}</span>
                </button>
              )) : <div className="px-2 py-3 text-center text-xs text-nrl-muted">No matching {searchEntityLabel}.</div>}
            </div>
          ) : null}
        </div>
      ) : null}
      <svg
        className={`h-auto w-full ${zoomIndex > 0 ? isDragging ? "cursor-grabbing" : "cursor-grab" : ""}`}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={(event) => {
          setSelectedGroupKey(null);
          setSelectedPointId(null);
          startPan(event);
        }}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{ touchAction: zoomIndex > 0 ? "none" : "auto" }}
      >
        <defs>
          <clipPath id={dataClipId}><rect x={xPlotLeft} y={margin.top} width={xPlotWidth} height={plotHeight} rx="8" /></clipPath>
          <clipPath id={pointAreaClipId}><rect x={xPlotLeft - pointOverflow} y={margin.top - pointOverflow} width={xPlotWidth + pointOverflow * 2} height={plotHeight + pointOverflow * 2} /></clipPath>
          <linearGradient id={heatGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff5364" />
            <stop offset="32%" stopColor="#f6c445" />
            <stop offset="62%" stopColor="#10f08b" />
            <stop offset="100%" stopColor="#10f08b" />
          </linearGradient>
        </defs>
        <rect x={xPlotLeft} y={margin.top} width={xPlotWidth} height={plotHeight} rx="8" fill="var(--color-nrl-bg)" />

        {xTicks.map((tick) => {
          const x = xScale(tick);
          return <g key={`x-${tick}`}><line x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} stroke="var(--color-nrl-border)" opacity="0.45" /><text x={x} y={singleAxis ? singleAxisHeatBarY - (isMobile ? 7 : 5) : margin.top + plotHeight + (isMobile ? 34 : 24)} textAnchor="middle" fill="var(--color-nrl-muted)" className="text-[20px] sm:text-[12px] lg:text-[8px]">{singleAxis ? tick.toFixed(0) : `${formatTick(tick, xValueDecimals)}${xValueSuffix}`}</text></g>;
        })}
        {!singleAxis ? yTicks.map((tick) => {
          const y = yScale(tick);
          return <g key={`y-${tick}`}><line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="var(--color-nrl-border)" opacity="0.45" /><text x={margin.left - (isMobile ? 18 : 14)} y={y + (isMobile ? 7 : 4)} textAnchor="end" fill="var(--color-nrl-muted)" className="text-[20px] sm:text-[12px] lg:text-[8px]">{formatTick(tick, yValueDecimals)}{yValueSuffix}</text></g>;
        }) : null}

        <g clipPath={`url(#${dataClipId})`}>
          {comparisonLine ? (
            <line x1={xScale(Math.max(xDomain[0], yDomain[0]))} y1={yScale(Math.max(xDomain[0], yDomain[0]))} x2={xScale(Math.min(xDomain[1], yDomain[1]))} y2={yScale(Math.min(xDomain[1], yDomain[1]))} stroke="#a7b0cd" strokeWidth="2" opacity="0.85" />
          ) : (
            <>
              {!singleAxis ? <line x1={xScale(chart.xMean)} y1={margin.top} x2={xScale(chart.xMean)} y2={margin.top + plotHeight} stroke="#7890c8" strokeWidth="1.5" opacity="0.8" /> : null}
              {!singleAxis ? <line x1={margin.left} y1={yScale(chart.yMean)} x2={margin.left + plotWidth} y2={yScale(chart.yMean)} stroke="#7890c8" strokeWidth="1.5" opacity="0.8" /> : null}
            </>
          )}
        </g>

        {showQuadrantLabels && !comparisonLine && !singleAxis ? (
          <g fill="var(--color-nrl-text)" fontWeight="800" opacity="0.78" className="text-[14px] sm:text-[13px] lg:text-[9px]">
            {quadrantText(quadrants.topLeft, margin.left + 16, margin.top - (isMobile ? 34 : 24))}
            {quadrantText(quadrants.topRight, margin.left + plotWidth - 16, margin.top - (isMobile ? 34 : 24), "end")}
            {quadrantText(quadrants.bottomLeft, margin.left + 16, margin.top + plotHeight + (isMobile ? 58 : 50))}
            {quadrantText(quadrants.bottomRight, margin.left + plotWidth - 16, margin.top + plotHeight + (isMobile ? 58 : 50), "end")}
          </g>
        ) : null}

        <g clipPath={`url(#${pointAreaClipId})`}>{pointGroups.map((group, pointIndex) => {
          const point = group.points[0];
          const x = xScale(group.xValue);
          const y = groupY(group);
          const isRight = xHigherIsBetter ? group.xValue >= chart.xMean : group.xValue <= chart.xMean;
          const isTop = yHigherIsBetter ? group.yValue >= chart.yMean : group.yValue <= chart.yMean;
          const pointColor = singleAxis
            ? singleAxisHeatColor((x - singleAxisHeatBarX) / singleAxisHeatBarWidth)
            : comparisonLine
            ? (group.yValue >= group.xValue) === comparisonHigherIsBetter ? "#10f08b" : "#ff5364"
            : colorByQuadrant
              ? isTop && isRight ? "#10f08b" : !isTop && !isRight ? "#ff5364" : "#4f9cff"
              : "#79dbe3";
          const isGroup = group.points.length > 1;
          const candidateImageUrl = isGroup ? null : pointImages?.[point.id] ?? (showTeamLogos ? logoFor(point.team, teamLogos) : null);
          const imageUrl = candidateImageUrl && !failedImageUrls.has(candidateImageUrl) ? candidateImageUrl : null;
          const isPlayerPoint = Boolean(pointImages) && !isGroup;
          const active = group.points.some((groupedPoint) => groupedPoint.id === hoveredId || groupedPoint.id === selectedPointId) || group.key === selectedGroupKey;
          const isHorizontalEdge = singleAxis && (Math.abs(x - leftEdgeStackX) < 0.5 || Math.abs(x - rightEdgeStackX) < 0.5);
          const pointStackGap = singleAxis ? stackGapFor(group) : 0;
          const radius = imageUrl || isPlayerPoint
            ? isMobile ? active ? 29 : 24 : active ? 20 : 17
            : isGroup
              ? isMobile ? active ? 15 : 11 : active ? 11 : 8
              : singleAxis
                ? compactPointRadius
                : isMobile ? active ? 7 : 4.5 : active ? 6 : 4;
          const hitRadius = isHorizontalEdge
            ? Math.max(radius, isMobile ? 13 : 9)
            : singleAxis
              ? Math.max(radius, Math.min(pointStackGap * 0.48, isMobile ? 7 : 5))
              : Math.max(radius, isMobile ? 11 : 7);
          const clipId = `${svgId}-point-image-${pointIndex}`;
          const groupLabel = pointImages ? "players" : "points";
          return (
            <g
              key={group.key}
              tabIndex={0}
              role="button"
              aria-expanded={isGroup ? group.key === selectedGroupKey : undefined}
              aria-label={isGroup
                ? `${group.points.length} overlapping ${groupLabel}. Select to view.`
                : singleAxis
                  ? `${point.team}: ${xMetricLabel.toLowerCase()} ${point.xValue.toFixed(xValueDecimals)}${xValueSuffix}`
                  : `${point.team}: ${xMetricLabel.toLowerCase()} ${point.xValue.toFixed(xValueDecimals)}${xValueSuffix}, ${yMetricLabel.toLowerCase()} ${point.yValue.toFixed(yValueDecimals)}${yValueSuffix}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (isGroup) {
                  setSelectedGroupKey((current) => current === group.key ? null : group.key);
                  setSelectedPointId(null);
                } else {
                  setSelectedPointId((current) => current === point.id ? null : point.id);
                  setSelectedGroupKey(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                if (isGroup) {
                  setSelectedGroupKey((current) => current === group.key ? null : group.key);
                  setSelectedPointId(null);
                } else {
                  setSelectedPointId((current) => current === point.id ? null : point.id);
                  setSelectedGroupKey(null);
                }
              }}
              onMouseEnter={() => setHoveredId(point.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(point.id)}
              onBlur={() => setHoveredId(null)}
              className="cursor-pointer outline-none"
            >
              {!imageUrl && !isPlayerPoint ? <circle cx={x} cy={y} r={hitRadius} fill="transparent" /> : null}
              {imageUrl || isPlayerPoint ? <defs><clipPath id={clipId}><circle cx={x} cy={y} r={radius - 1.5} /></clipPath></defs> : null}
              <circle cx={x} cy={y} r={radius} fill={imageUrl ? "var(--color-nrl-panel)" : isPlayerPoint ? "var(--color-nrl-panel-2)" : pointColor} stroke={pointColor} strokeWidth={active ? 3 : 1.5} opacity={active ? 1 : 0.78} />
              {isPlayerPoint && !imageUrl ? (
                <image href={PLAYER_SILHOUETTE_SRC} x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} pointerEvents="none" />
              ) : null}
              {imageUrl ? <image href={imageUrl} x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} pointerEvents="none" onError={() => setFailedImageUrls((current) => new Set(current).add(imageUrl))} /> : null}
              {isGroup ? <text x={x} y={y + (isMobile ? 3.5 : 2.75)} textAnchor="middle" fill="var(--color-nrl-bg)" fontSize={isMobile ? 9 : 7} fontWeight="950" pointerEvents="none">+{group.points.length}</text> : null}
            </g>
          );
        })}</g>

        {singleAxis ? (
          <g aria-label={`Average ${xMetricLabel.toLowerCase()} ${chart.xMean.toFixed(xValueDecimals)}${xValueSuffix}`}>
            <rect x={singleAxisHeatBarX} y={singleAxisHeatBarY} width={singleAxisHeatBarWidth} height={singleAxisHeatBarHeight} rx={singleAxisHeatBarHeight / 2} fill={`url(#${heatGradientId})`} />
            <line x1={xScale(chart.xMean)} y1={singleAxisHeatBarY - 4} x2={xScale(chart.xMean)} y2={singleAxisHeatBarY + singleAxisHeatBarHeight + 4} stroke="var(--color-nrl-text)" strokeWidth={isMobile ? 3 : 2} />
            <path d={`M ${xScale(chart.xMean) - 5} ${singleAxisHeatBarY + singleAxisHeatBarHeight + 6} L ${xScale(chart.xMean) + 5} ${singleAxisHeatBarY + singleAxisHeatBarHeight + 6} L ${xScale(chart.xMean)} ${singleAxisHeatBarY + singleAxisHeatBarHeight + 12} Z`} fill="var(--color-nrl-text)" />
            <text x={xScale(chart.xMean)} y={singleAxisHeatBarY + singleAxisHeatBarHeight + (isMobile ? 34 : 26)} textAnchor="middle" fill="var(--color-nrl-muted)" fontWeight="900" className="text-[14px] sm:text-[12px] lg:text-[8px]">AVG</text>
          </g>
        ) : null}

        <text x={xPlotLeft + xPlotWidth / 2} y={height - (isMobile ? 32 : 28)} textAnchor="middle" fill="var(--color-nrl-text)" fontWeight="900" className="text-[15px] sm:text-[15px] lg:text-[10px]">{xAxisLabel}</text>
        {!singleAxis ? <text transform={`translate(${isMobile ? 24 : 22} ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill="var(--color-nrl-text)" fontWeight="900" className="text-[15px] sm:text-[15px] lg:text-[10px]">{yAxisLabel}</text> : null}
      </svg>

      {activePoint && !selectedGroup ? (
        <div
          className={`${selectedPoint ? "z-20" : "pointer-events-none z-10"} absolute w-52 max-w-[calc(100%_-_1rem)] rounded-lg border border-nrl-accent/50 bg-nrl-panel/80 px-3 py-2 text-xs shadow-xl lg:text-[10px]`}
          style={{
            left: `clamp(0.5rem, calc(${(activePointX / width) * 100}% ${activePointX > width / 2 ? "- 14rem" : "+ 1rem"}), calc(100% - 13.5rem))`,
            top: `clamp(0.5rem, calc(${(activePointY / height) * 100}% ${activePointY > height / 2 ? "- 6rem" : "+ 1rem"}), calc(100% - 5.5rem))`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-black text-nrl-text">{activePoint.team}{activePoint.opponent ? ` · ${formatRoundLabel(activePoint.roundLabel)} vs ${activePoint.opponent}` : ` · ${activePoint.year}`}</div>
            {selectedPoint ? <button type="button" onClick={() => setSelectedPointId(null)} aria-label="Close selected point" className="text-sm font-black text-nrl-muted hover:text-nrl-text">×</button> : null}
          </div>
          <div className="mt-1 text-nrl-muted">{xMetricLabel} {activePoint.xValue.toFixed(xValueDecimals)}{xValueSuffix}{singleAxis ? "" : ` · ${yMetricLabel} ${activePoint.yValue.toFixed(yValueDecimals)}${yValueSuffix}`}</div>
          <div className="text-nrl-muted">
            {activePoint.detail}{activePoint.games > 1 ? ` · ${activePoint.games} games` : pointImages ? " · 1 game" : ""}
          </div>
        </div>
      ) : null}
      {selectedGroup ? (
        <div
          className="absolute z-20 flex h-fit max-h-[calc(100%_-_1rem)] w-64 max-w-[calc(100%_-_1rem)] flex-col overflow-hidden rounded-lg border border-nrl-accent/50 bg-nrl-panel/80 px-3 py-2 text-xs shadow-xl lg:text-[10px]"
          style={{
            left: `clamp(0.5rem, calc(${(selectedGroupX / width) * 100}% ${selectedGroupX > width / 2 ? "- 17rem" : "+ 1rem"}), calc(100% - 16.5rem))`,
            top: "0.5rem",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-black text-nrl-text">{selectedGroup.points.length} {pointImages ? "players" : "points"}</div>
            <button type="button" onClick={() => setSelectedGroupKey(null)} aria-label="Close overlapping points" className="text-sm font-black text-nrl-muted hover:text-nrl-text">×</button>
          </div>
          <div className="mt-2 min-h-0 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
            <div className="divide-y divide-nrl-border">
            {selectedGroup.points.map((point) => (
              <div key={point.id} className="py-1.5">
                <div className="font-bold text-nrl-text">{point.team}</div>
                <div className="text-nrl-muted">{xMetricLabel} {point.xValue.toFixed(xValueDecimals)}{xValueSuffix}{singleAxis ? "" : ` · ${yMetricLabel} ${point.yValue.toFixed(yValueDecimals)}${yValueSuffix}`}</div>
                <div className="text-nrl-muted">{point.detail}{point.games > 1 ? ` · ${point.games} games` : ""}</div>
              </div>
            ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

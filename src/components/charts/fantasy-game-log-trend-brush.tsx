"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { PlayerStat } from "@/lib/data/types"

type TrendBrushRow = {
  Year: string
  Round: number
  Opponent?: string | null
  Fantasy?: number
  [key: string]: unknown
}

interface FantasyGameLogTrendBrushProps<T extends TrendBrushRow = PlayerStat> {
  rows: T[]
  defaultStartYear?: string
  headerTitle?: string
  valueLabel?: string
  primarySeriesLabel?: string
  primaryBarColor?: string
  valueAccessor?: (row: T) => number
  tooltipTitleAccessor?: (row: T) => string
  primaryLineColor?: string
  compareSeries?: {
    label: string
    rows: T[]
    valueAccessor?: (row: T) => number
    color?: string
  }[]
}

type DragMode = "start" | "end" | "move"

interface DragState {
  mode: DragMode
  pointerId: number
  startClientX: number
  originStartIndex: number
  originEndIndex: number
}

interface HoveredChartPoint {
  index: number
  localX: number
  localY: number
}

interface YearBoundary {
  year: string
  startIndex: number
  endIndex: number
}

const ROLLING_WINDOW_OPTIONS = [3, 5, 10, 20] as const
const MAIN_CHART_WIDTH = 960
const MAIN_CHART_HEIGHT = 220
const OVERVIEW_CHART_WIDTH = 960
const OVERVIEW_CHART_HEIGHT = 88
const MAIN_PADDING = { top: 14, right: 18, bottom: 28, left: 30 }
const OVERVIEW_PADDING = { top: 8, right: 18, bottom: 24, left: 18 }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function softenSeriesColor(color: string): string {
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^)]+),\s*[\d.]+\)$/, "rgba($1, 0.42)")
  }
  return color
}

function withOpacity(color: string, opacity: number): string {
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^)]+),\s*[\d.]+\)$/, `rgba($1, ${opacity})`)
  }
  return color
}

function getYearLabel(row: TrendBrushRow): string {
  return String(row.Year ?? "").trim() || "Unknown"
}

function getFantasyScore(row: TrendBrushRow): number {
  const value = row.Fantasy
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function formatTooltipTitle(row: TrendBrushRow): string {
  const round = Number.isFinite(row.Round) ? `R${row.Round}` : "R?"
  const year = getYearLabel(row)
  const opponent = String(row.Opponent ?? "").trim()
  if (!opponent) {
    return `${round} - ${year}`
  }
  return `${round} - ${year} vs ${opponent.replace(/-/g, " ")}`
}

function computeRollingAverage(values: number[], windowSize: number): number[] {
  const rolling: number[] = []
  let runningSum = 0

  for (let index = 0; index < values.length; index += 1) {
    runningSum += values[index]
    if (index >= windowSize) {
      runningSum -= values[index - windowSize]
    }
    const divisor = Math.min(index + 1, windowSize)
    rolling.push(runningSum / divisor)
  }

  return rolling
}

function buildLinePath(
  values: number[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  maxValue: number
): string {
  if (values.length === 0) return ""

  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const denominator = Math.max(values.length - 1, 1)

  return values
    .map((value, index) => {
      const x = padding.left + (index / denominator) * innerWidth
      const y = padding.top + innerHeight - (value / maxValue) * innerHeight
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

function findYearBoundaries(rows: TrendBrushRow[]): YearBoundary[] {
  const boundaries: YearBoundary[] = []

  rows.forEach((row, index) => {
    const year = getYearLabel(row)
    const current = boundaries[boundaries.length - 1]
    if (!current || current.year !== year) {
      boundaries.push({ year, startIndex: index, endIndex: index })
      return
    }
    current.endIndex = index
  })

  return boundaries
}

function sortTrendRows<T extends TrendBrushRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const yearDiff = Number.parseInt(getYearLabel(a), 10) - Number.parseInt(getYearLabel(b), 10)
    if (yearDiff !== 0) return yearDiff
    return (Number(a.Round) || 0) - (Number(b.Round) || 0)
  })
}

export function FantasyGameLogTrendBrush<T extends TrendBrushRow = PlayerStat>({
  rows,
  defaultStartYear,
  headerTitle = "Fantasy Trend",
  valueLabel = "Fantasy",
  primarySeriesLabel,
  primaryBarColor = "rgba(0, 245, 138, 0.42)",
  valueAccessor,
  tooltipTitleAccessor,
  primaryLineColor = "rgba(245, 247, 255, 0.95)",
  compareSeries = [],
}: FantasyGameLogTrendBrushProps<T>) {
  const [rollingWindow, setRollingWindow] = useState<number>(5)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<DragMode | null>(null)
  const [hoveredChartPoint, setHoveredChartPoint] = useState<HoveredChartPoint | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ startIndex: number; endIndex: number }>({
    startIndex: 0,
    endIndex: Math.max(rows.length - 1, 0),
  })
  const overviewRef = useRef<SVGSVGElement | null>(null)
  const mainChartRef = useRef<SVGSVGElement | null>(null)

  const orderedRows = useMemo(() => sortTrendRows(rows), [rows])
  const orderedCompareSeries = useMemo(
    () =>
      compareSeries.map((series) => ({
        ...series,
        rows: sortTrendRows(series.rows),
      })),
    [compareSeries]
  )

  const defaultSelectedRange = useMemo(() => {
    const fallback = {
      startIndex: 0,
      endIndex: Math.max(orderedRows.length - 1, 0),
    }
    if (!defaultStartYear) return fallback
    const startIndex = orderedRows.findIndex((row) => getYearLabel(row) >= defaultStartYear)
    if (startIndex === -1) return fallback
    return {
      startIndex,
      endIndex: Math.max(orderedRows.length - 1, 0),
    }
  }, [defaultStartYear, orderedRows])

  useEffect(() => {
    setSelectedRange(defaultSelectedRange)
  }, [defaultSelectedRange])

  const safeStartIndex = clamp(selectedRange.startIndex, 0, Math.max(orderedRows.length - 1, 0))
  const safeEndIndex = clamp(selectedRange.endIndex, safeStartIndex, Math.max(orderedRows.length - 1, 0))
  const selectedRows = orderedRows.slice(safeStartIndex, safeEndIndex + 1)

  const getValue = useCallback(
    (row: T): number => {
      const customValue = valueAccessor?.(row)
      return typeof customValue === "number" && Number.isFinite(customValue)
        ? customValue
        : getFantasyScore(row)
    },
    [valueAccessor]
  )

  const fantasyScores = useMemo(() => orderedRows.map(getValue), [getValue, orderedRows])
  const selectedFantasyScores = useMemo(() => selectedRows.map(getValue), [getValue, selectedRows])
  const compareSeriesData = useMemo(
    () =>
      orderedCompareSeries.map((series, index) => {
        const seriesGetValue = (row: T): number => {
          const customValue = series.valueAccessor?.(row)
          return typeof customValue === "number" && Number.isFinite(customValue)
            ? customValue
            : getFantasyScore(row)
        }

        const allValues = series.rows.map(seriesGetValue)
        const selectedValues = series.rows
          .slice(
            clamp(selectedRange.startIndex, 0, Math.max(series.rows.length - 1, 0)),
            clamp(selectedRange.endIndex, 0, Math.max(series.rows.length - 1, 0)) + 1
          )
          .map(seriesGetValue)

        return {
          label: series.label,
          color: series.color ?? (index === 0 ? "rgba(180, 112, 255, 0.95)" : "rgba(117, 151, 255, 0.95)"),
          allValues,
          selectedValues,
          rollingAll: computeRollingAverage(allValues, rollingWindow),
          rollingSelected: computeRollingAverage(selectedValues, rollingWindow),
        }
      }),
    [orderedCompareSeries, rollingWindow, selectedRange.endIndex, selectedRange.startIndex]
  )
  const rollingSeries = useMemo(
    () => computeRollingAverage(selectedFantasyScores, rollingWindow),
    [rollingWindow, selectedFantasyScores]
  )
  const overviewRollingSeries = useMemo(
    () => computeRollingAverage(fantasyScores, rollingWindow),
    [fantasyScores, rollingWindow]
  )
  const yearBoundaries = useMemo(() => findYearBoundaries(orderedRows), [orderedRows])
  const selectedYearBoundaries = useMemo(
    () =>
      yearBoundaries.filter(
        (boundary) => boundary.endIndex >= safeStartIndex && boundary.startIndex <= safeEndIndex
      ),
    [safeEndIndex, safeStartIndex, yearBoundaries]
  )

  const selectedMaxScore = useMemo(() => {
    const maxScore = Math.max(
      0,
      ...selectedFantasyScores,
      ...rollingSeries,
      ...compareSeriesData.flatMap((series) => [...series.selectedValues, ...series.rollingSelected])
    )
    return maxScore > 0 ? roundUpToStep(maxScore, maxScore > 100 ? 20 : 10) : 10
  }, [compareSeriesData, rollingSeries, selectedFantasyScores])
  const overviewMaxScore = useMemo(() => {
    const maxScore = Math.max(
      0,
      ...fantasyScores,
      ...overviewRollingSeries,
      ...compareSeriesData.flatMap((series) => [...series.allValues, ...series.rollingAll])
    )
    return maxScore > 0 ? roundUpToStep(maxScore, maxScore > 100 ? 20 : 10) : 10
  }, [compareSeriesData, fantasyScores, overviewRollingSeries])

  const selectedLinePath = useMemo(
    () => buildLinePath(rollingSeries, MAIN_CHART_WIDTH, MAIN_CHART_HEIGHT, MAIN_PADDING, selectedMaxScore),
    [rollingSeries, selectedMaxScore]
  )
  const overviewLinePath = useMemo(
    () =>
      buildLinePath(
        overviewRollingSeries,
        OVERVIEW_CHART_WIDTH,
        OVERVIEW_CHART_HEIGHT,
        OVERVIEW_PADDING,
        overviewMaxScore
      ),
    [overviewMaxScore, overviewRollingSeries]
  )
  const compareOverviewLinePaths = useMemo(
    () =>
      compareSeriesData.map((series) => ({
        label: series.label,
        color: series.color,
        path: buildLinePath(
          series.rollingAll,
          OVERVIEW_CHART_WIDTH,
          OVERVIEW_CHART_HEIGHT,
          OVERVIEW_PADDING,
          overviewMaxScore
        ),
      })),
    [compareSeriesData, overviewMaxScore]
  )
  const compareLinePaths = useMemo(
    () =>
      compareSeriesData.map((series) => ({
        label: series.label,
        color: series.color,
        path: buildLinePath(
          series.rollingSelected,
          MAIN_CHART_WIDTH,
          MAIN_CHART_HEIGHT,
          MAIN_PADDING,
          selectedMaxScore
        ),
      })),
    [compareSeriesData, selectedMaxScore]
  )

  const snapThreshold = useMemo(
    () => Math.max(1, Math.min(3, Math.round(orderedRows.length * 0.04))),
    [orderedRows.length]
  )

  const snapRange = useCallback(
    (nextRange: { startIndex: number; endIndex: number }, mode: DragMode) => {
      let nextStart = clamp(nextRange.startIndex, 0, Math.max(orderedRows.length - 1, 0))
      let nextEnd = clamp(nextRange.endIndex, nextStart, Math.max(orderedRows.length - 1, 0))
      const width = nextEnd - nextStart

      const nearestStartBoundary = yearBoundaries.reduce<number | null>((closest, boundary) => {
        const candidate = boundary.startIndex
        if (Math.abs(candidate - nextStart) > snapThreshold) return closest
        if (closest === null) return candidate
        return Math.abs(candidate - nextStart) < Math.abs(closest - nextStart) ? candidate : closest
      }, null)

      const nearestEndBoundary = yearBoundaries.reduce<number | null>((closest, boundary) => {
        const candidate = boundary.endIndex
        if (Math.abs(candidate - nextEnd) > snapThreshold) return closest
        if (closest === null) return candidate
        return Math.abs(candidate - nextEnd) < Math.abs(closest - nextEnd) ? candidate : closest
      }, null)

      if (mode === "start" && nearestStartBoundary !== null) {
        nextStart = Math.min(nearestStartBoundary, nextEnd)
      }

      if (mode === "end" && nearestEndBoundary !== null) {
        nextEnd = Math.max(nearestEndBoundary, nextStart)
      }

      if (mode === "move") {
        if (nearestStartBoundary !== null) {
          nextStart = clamp(nearestStartBoundary, 0, Math.max(orderedRows.length - 1 - width, 0))
          nextEnd = nextStart + width
        } else if (nearestEndBoundary !== null) {
          nextEnd = clamp(nearestEndBoundary, width, Math.max(orderedRows.length - 1, 0))
          nextStart = nextEnd - width
        }
      }

      return {
        startIndex: clamp(nextStart, 0, Math.max(orderedRows.length - 1, 0)),
        endIndex: clamp(nextEnd, nextStart, Math.max(orderedRows.length - 1, 0)),
      }
    },
    [orderedRows.length, snapThreshold, yearBoundaries]
  )

  const getIndexFromClientX = useCallback(
    (clientX: number) => {
      const container = overviewRef.current
      if (!container || orderedRows.length <= 1) return 0
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return 0
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      return Math.round(ratio * (orderedRows.length - 1))
    },
    [orderedRows.length]
  )

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return

      const nextRange = (() => {
        if (dragState.mode === "start") {
          return {
            startIndex: Math.min(getIndexFromClientX(event.clientX), dragState.originEndIndex),
            endIndex: dragState.originEndIndex,
          }
        }

        if (dragState.mode === "end") {
          return {
            startIndex: dragState.originStartIndex,
            endIndex: Math.max(getIndexFromClientX(event.clientX), dragState.originStartIndex),
          }
        }

        const container = overviewRef.current
        if (!container || orderedRows.length <= 1) {
          return {
            startIndex: dragState.originStartIndex,
            endIndex: dragState.originEndIndex,
          }
        }

        const rect = container.getBoundingClientRect()
        const deltaIndex = Math.round(
          ((event.clientX - dragState.startClientX) / Math.max(rect.width, 1)) * (orderedRows.length - 1)
        )
        const width = dragState.originEndIndex - dragState.originStartIndex
        const nextStart = clamp(dragState.originStartIndex + deltaIndex, 0, Math.max(orderedRows.length - 1 - width, 0))
        return {
          startIndex: nextStart,
          endIndex: nextStart + width,
        }
      })()

      setSelectedRange(nextRange)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      setSelectedRange((current) => snapRange(current, dragState.mode))
      setDragState(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [dragState, getIndexFromClientX, orderedRows.length, snapRange])

  if (orderedRows.length === 0) {
    return null
  }

  const mainInnerWidth = MAIN_CHART_WIDTH - MAIN_PADDING.left - MAIN_PADDING.right
  const mainInnerHeight = MAIN_CHART_HEIGHT - MAIN_PADDING.top - MAIN_PADDING.bottom
  const mainBarWidth = clamp((mainInnerWidth / Math.max(selectedRows.length, 1)) * 0.68, 4, 22)
  const totalBarSeries = 1 + compareSeriesData.length
  const groupedBarWidth = totalBarSeries > 1 ? Math.max(3, Math.min(10, mainBarWidth / totalBarSeries)) : mainBarWidth
  const selectedCountDenominator = Math.max(selectedRows.length - 1, 1)
  const overviewCountDenominator = Math.max(orderedRows.length - 1, 1)

  const selectionLeft =
    OVERVIEW_PADDING.left +
    (safeStartIndex / overviewCountDenominator) *
      (OVERVIEW_CHART_WIDTH - OVERVIEW_PADDING.left - OVERVIEW_PADDING.right)
  const selectionRight =
    OVERVIEW_PADDING.left +
    (safeEndIndex / overviewCountDenominator) *
      (OVERVIEW_CHART_WIDTH - OVERVIEW_PADDING.left - OVERVIEW_PADDING.right)
  const selectionWidth = Math.max(selectionRight - selectionLeft, 14)

  const handlePointerDown = (mode: DragMode) => (event: ReactPointerEvent<SVGRectElement>) => {
    event.preventDefault()
    setDragState({
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      originStartIndex: safeStartIndex,
      originEndIndex: safeEndIndex,
    })
  }

  const handleMainChartMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const svg = mainChartRef.current
    if (!svg || selectedRows.length === 0) return

    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = clamp((event.clientX - rect.left - (MAIN_PADDING.left / MAIN_CHART_WIDTH) * rect.width) / (((MAIN_CHART_WIDTH - MAIN_PADDING.left - MAIN_PADDING.right) / MAIN_CHART_WIDTH) * rect.width), 0, 1)
    const index = Math.round(ratio * Math.max(selectedRows.length - 1, 0))

    setHoveredChartPoint({
      index,
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top,
    })
  }

  const hoveredRow = hoveredChartPoint ? selectedRows[hoveredChartPoint.index] ?? null : null
  const hoveredRollingValue =
    hoveredChartPoint && rollingSeries[hoveredChartPoint.index] != null
      ? rollingSeries[hoveredChartPoint.index]
      : null
  const shouldFlipTooltip =
    hoveredChartPoint !== null && hoveredChartPoint.localX > MAIN_CHART_WIDTH - 220
  const hoveredTooltipTitle = hoveredRow
    ? tooltipTitleAccessor?.(hoveredRow) ?? formatTooltipTitle(hoveredRow)
    : ""
  const hoveredValue = hoveredRow ? getValue(hoveredRow) : null
  const hoveredCompareValues = hoveredChartPoint
    ? compareSeriesData.map((series) => ({
        label: series.label,
        color: series.color,
        value: series.selectedValues[hoveredChartPoint.index] ?? null,
        rolling: series.rollingSelected[hoveredChartPoint.index] ?? null,
      }))
    : []
  const resolvedPrimarySeriesLabel = primarySeriesLabel ?? valueLabel

  return (
    <div className="border-b border-nrl-border bg-nrl-panel-2/30 px-2 py-3 sm:px-4 sm:py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3 sm:gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-nrl-accent sm:text-xs">
            {headerTitle}
          </div>
          {compareSeriesData.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-nrl-muted">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-nrl-accent" />
                <span>{resolvedPrimarySeriesLabel}</span>
              </div>
              {compareSeriesData.map((series) => (
                <div key={series.label} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: softenSeriesColor(series.color) }}
                  />
                  <span>{series.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
            Rolling Avg
          </span>
          <div className="flex items-center overflow-hidden rounded-md border border-nrl-border bg-nrl-panel">
            {ROLLING_WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRollingWindow(option)}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  rollingWindow === option
                    ? "bg-nrl-accent/15 text-nrl-accent"
                    : "text-nrl-muted hover:text-nrl-text"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="w-full space-y-2 sm:space-y-3">
          <div className="relative">
          <svg
            ref={mainChartRef}
            viewBox={`0 0 ${MAIN_CHART_WIDTH} ${MAIN_CHART_HEIGHT}`}
            className="rolling-trend-main-chart h-[145px] w-full sm:h-[220px]"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const value = selectedMaxScore * tick
              const y = MAIN_PADDING.top + mainInnerHeight - tick * mainInnerHeight
              return (
                <g key={tick}>
                  <line
                    x1={MAIN_PADDING.left}
                    x2={MAIN_CHART_WIDTH - MAIN_PADDING.right}
                    y1={y}
                    y2={y}
                    stroke="rgba(154,164,191,0.18)"
                    strokeWidth="1"
                  />
                  <text
                    x={MAIN_PADDING.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-nrl-muted text-[9px] font-semibold"
                  >
                    {Math.round(value)}
                  </text>
                </g>
              )
            })}

            {selectedYearBoundaries
              .filter((boundary, index, boundaries) => {
                if (index === 0) return true
                const prev = boundaries[index - 1]
                const currentLocalStart = Math.max(boundary.startIndex, safeStartIndex) - safeStartIndex
                const prevLocalStart = Math.max(prev.startIndex, safeStartIndex) - safeStartIndex
                const currentX =
                  MAIN_PADDING.left +
                  (currentLocalStart / selectedCountDenominator) * mainInnerWidth
                const prevX =
                  MAIN_PADDING.left +
                  (prevLocalStart / selectedCountDenominator) * mainInnerWidth
                return currentX - prevX >= 42
              })
              .map((boundary) => {
              const localStartIndex = Math.max(boundary.startIndex, safeStartIndex) - safeStartIndex
              const x =
                MAIN_PADDING.left +
                (localStartIndex / selectedCountDenominator) * mainInnerWidth

              return (
                <g key={boundary.year}>
                  <line
                    x1={x}
                    x2={x}
                    y1={MAIN_PADDING.top}
                    y2={MAIN_CHART_HEIGHT - MAIN_PADDING.bottom}
                    stroke="rgba(154,164,191,0.12)"
                    strokeWidth="1"
                  />
                  <text
                    x={x + 4}
                    y={MAIN_CHART_HEIGHT - 8}
                    className="fill-nrl-muted text-[9px] font-semibold"
                  >
                    {boundary.year}
                  </text>
                </g>
              )
            })}

            {selectedRows.map((row, index) => {
              const score = getValue(row)
              const x =
                MAIN_PADDING.left +
                (index / selectedCountDenominator) * mainInnerWidth
              const barHeight = (score / selectedMaxScore) * mainInnerHeight
              const y = MAIN_PADDING.top + mainInnerHeight - barHeight
              const seriesOffsetBase = -((totalBarSeries - 1) * groupedBarWidth) / 2

              return (
                <g key={`${getYearLabel(row)}-${row.Round}-${index}`}>
                  <rect
                    x={x + seriesOffsetBase - groupedBarWidth / 2}
                    y={y}
                    width={groupedBarWidth}
                    height={Math.max(barHeight, 1)}
                    rx="2"
                    fill={primaryBarColor}
                  />
                  {compareSeriesData.map((series, seriesIndex) => {
                    const compareScore = series.selectedValues[index]
                    if (compareScore == null) return null
                    const compareBarHeight = (compareScore / selectedMaxScore) * mainInnerHeight
                    const compareY = MAIN_PADDING.top + mainInnerHeight - compareBarHeight
                    const compareX =
                      x + seriesOffsetBase + (seriesIndex + 1) * groupedBarWidth - groupedBarWidth / 2

                    return (
                      <rect
                        key={`${series.label}-${index}`}
                        x={compareX}
                        y={compareY}
                        width={groupedBarWidth}
                        height={Math.max(compareBarHeight, 1)}
                        rx="2"
                        fill={softenSeriesColor(series.color)}
                      />
                    )
                  })}
                </g>
              )
            })}

            <path
              d={selectedLinePath}
              fill="none"
              stroke={primaryLineColor}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {compareLinePaths.map((series) =>
              series.path ? (
                <path
                  key={series.label}
                  d={series.path}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="2.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null
            )}
            {hoveredChartPoint ? (
              <line
                x1={
                  MAIN_PADDING.left +
                  (hoveredChartPoint.index / selectedCountDenominator) * mainInnerWidth
                }
                x2={
                  MAIN_PADDING.left +
                  (hoveredChartPoint.index / selectedCountDenominator) * mainInnerWidth
                }
                y1={MAIN_PADDING.top}
                y2={MAIN_CHART_HEIGHT - MAIN_PADDING.bottom}
                stroke="rgba(245,247,255,0.28)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ) : null}
            <rect
              x={MAIN_PADDING.left}
              y={MAIN_PADDING.top}
              width={mainInnerWidth}
              height={mainInnerHeight}
              fill="transparent"
              onPointerMove={handleMainChartMove}
              onPointerLeave={() => setHoveredChartPoint(null)}
            />
          </svg>
          {hoveredRow && hoveredChartPoint ? (
            <div
              className="pointer-events-none absolute z-10 max-w-[260px] rounded-md border border-nrl-border bg-[#171717]/95 px-3 py-2 text-[10px] shadow-xl"
              style={{
                left: `${hoveredChartPoint.localX}px`,
                top: `${hoveredChartPoint.localY}px`,
                transform: shouldFlipTooltip
                  ? "translate(calc(-100% - 16px), -100%)"
                  : "translate(16px, -100%)",
              }}
            >
              <div className="font-semibold text-nrl-text">{hoveredTooltipTitle}</div>
              <div className="mt-1 text-nrl-text">
                <span style={{ color: compareSeriesData.length > 0 ? "rgba(0, 245, 138, 0.95)" : undefined }}>
                  {resolvedPrimarySeriesLabel}
                </span>
                : {hoveredValue?.toFixed(1) ?? "-"} · {rollingWindow} MA {hoveredRollingValue?.toFixed(1) ?? "-"}
              </div>
              {hoveredCompareValues.map((series) => (
                <div key={series.label} className="mt-1 text-nrl-text">
                  <span style={{ color: series.color }}>{series.label}</span>:{" "}
                  {series.value?.toFixed(1) ?? "-"} · {rollingWindow} MA {series.rolling?.toFixed(1) ?? "-"}
                </div>
              ))}
            </div>
          ) : null}
          </div>

          <svg
            ref={overviewRef}
            viewBox={`0 0 ${OVERVIEW_CHART_WIDTH} ${OVERVIEW_CHART_HEIGHT}`}
            className="h-[56px] w-full touch-none select-none sm:h-[88px]"
          >
            <rect
              x={0}
              y={0}
              width={OVERVIEW_CHART_WIDTH}
              height={OVERVIEW_CHART_HEIGHT}
              rx="6"
              fill="rgba(255,255,255,0.02)"
            />

            {yearBoundaries.map((boundary) => {
              const midpoint = (boundary.startIndex + boundary.endIndex) / 2
              const x =
                OVERVIEW_PADDING.left +
                (midpoint / overviewCountDenominator) *
                  (OVERVIEW_CHART_WIDTH - OVERVIEW_PADDING.left - OVERVIEW_PADDING.right)
              return (
                <text
                  key={boundary.year}
                  x={x}
                  y={OVERVIEW_CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-nrl-muted text-[8px] font-semibold"
                >
                  {boundary.year}
                </text>
              )
            })}

            <path
              d={overviewLinePath}
              fill="none"
              stroke={withOpacity(primaryLineColor, 0.72)}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {compareOverviewLinePaths.map((series) =>
              series.path ? (
                <path
                  key={`overview-${series.label}`}
                  d={series.path}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.82}
                />
              ) : null
            )}

            <rect
              x={selectionLeft}
              y={6}
              width={selectionWidth}
              height={OVERVIEW_CHART_HEIGHT - OVERVIEW_PADDING.bottom - 6}
              fill="rgba(0, 245, 138, 0.08)"
              stroke="rgba(0, 245, 138, 0.68)"
              strokeWidth="1.5"
              rx="3"
              onPointerDown={handlePointerDown("move")}
              style={{ cursor: dragState?.mode === "move" ? "grabbing" : "grab" }}
            />
            <rect
              x={selectionLeft - 5}
              y={10}
              width={10}
              height={OVERVIEW_CHART_HEIGHT - OVERVIEW_PADDING.bottom - 14}
              rx="2"
              fill="rgba(0, 245, 138, 0.95)"
              onPointerDown={handlePointerDown("start")}
              onPointerEnter={() => setHoveredHandle("start")}
              onPointerLeave={() => setHoveredHandle((current) => (current === "start" ? null : current))}
              style={{ cursor: dragState?.mode === "start" ? "grabbing" : "ew-resize" }}
            />
            <rect
              x={selectionLeft + selectionWidth - 5}
              y={10}
              width={10}
              height={OVERVIEW_CHART_HEIGHT - OVERVIEW_PADDING.bottom - 14}
              rx="2"
              fill="rgba(0, 245, 138, 0.95)"
              onPointerDown={handlePointerDown("end")}
              onPointerEnter={() => setHoveredHandle("end")}
              onPointerLeave={() => setHoveredHandle((current) => (current === "end" ? null : current))}
              style={{ cursor: dragState?.mode === "end" ? "grabbing" : "ew-resize" }}
            />
            {hoveredHandle === "start" ? (
              <g pointerEvents="none">
                <rect
                  x={selectionLeft - 18}
                  y={12}
                  width={24}
                  height={18}
                  rx="4"
                  fill="rgba(11,16,32,0.92)"
                  stroke="rgba(0,245,138,0.3)"
                />
                <text
                  x={selectionLeft - 6}
                  y={25}
                  textAnchor="middle"
                  className="fill-nrl-accent text-[11px] font-bold"
                >
                  ↔
                </text>
              </g>
            ) : null}
            {hoveredHandle === "end" ? (
              <g pointerEvents="none">
                <rect
                  x={selectionLeft + selectionWidth - 6}
                  y={12}
                  width={24}
                  height={18}
                  rx="4"
                  fill="rgba(11,16,32,0.92)"
                  stroke="rgba(0,245,138,0.3)"
                />
                <text
                  x={selectionLeft + selectionWidth + 6}
                  y={25}
                  textAnchor="middle"
                  className="fill-nrl-accent text-[11px] font-bold"
                >
                  ↔
                </text>
              </g>
            ) : null}
          </svg>
        </div>
      </div>
    </div>
  )
}

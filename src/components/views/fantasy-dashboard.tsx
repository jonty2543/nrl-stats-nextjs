"use client"

import Link from "next/link"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SignInButton, useAuth, useUser } from "@clerk/nextjs"
import type { PlayerStat, TeammateLookupRow } from "@/lib/data/types"
import type { Draw2026Data } from "@/lib/draw/types"
import type {
  FantasyCoachPlayerSnapshot,
  FantasyOwnershipBaselineSnapshot,
  FantasyPlayerSnapshot,
  LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import { PLAYER_STATS } from "@/lib/data/constants"
import type { PlayerImageRecord } from "@/lib/supabase/queries"
import {
  applyFantasyBreakEvenOffset,
  applyFantasyProjectionOffset,
  FANTASY_POSITION_MAP,
  getFantasyCoachRoundMetrics,
  getTopFantasyOwnershipRise,
} from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import { hasProPlotAccess } from "@/lib/access/pro-access"
import {
  buildFantasyRank,
  filterByFinals,
  filterByMinutes,
  filterByTeammate,
  getTeammateOptions,
} from "@/lib/data/transform"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select } from "@/components/ui/select"
import { PillRadio } from "@/components/ui/pill-radio"
import { YearRangeSlider } from "@/components/ui/year-range-slider"
import { BillingPageLink } from "@/components/billing/billing-page-link"
import { FantasyGameLogTrendBrush } from "@/components/charts/fantasy-game-log-trend-brush"
import {
  PlayerImageCard,
  primaryTeamForRows,
  resolvePlayerImage,
  resolveTeamLogoUrl,
} from "@/components/views/player-comparison"
import { WithWithoutKDE } from "@/components/charts/with-without-kde"
import { ScatterCorrelation } from "@/components/charts/scatter-correlation"

interface FantasyDashboardProps {
  fantasyPlayers: FantasyPlayerSnapshot[]
  fantasyCoachPlayers?: FantasyCoachPlayerSnapshot[]
  lineupsProjections?: LineupsProjectionSnapshot
  ownershipBaselineSnapshot?: FantasyOwnershipBaselineSnapshot | null
  availableYears: string[]
  defaultYears: string[]
  initialPlayerStats: PlayerStat[]
  playerImages?: PlayerImageRecord[]
  teamLogos?: Record<string, string>
  preloadedPlayerAllYears?: boolean
  draw2026Data?: Draw2026Data | null
  initialSelectedFantasyName?: string
  showOwnedCards?: boolean
  showPlayerDetails?: boolean
  playerRouteBasePath?: string
  canAccessLoginSeason?: boolean
  canBypassPlotGate?: boolean
}

type TeammateMode = "With" | "Without"
type GameLogSortDirection = "asc" | "desc"
type AllPlayersSortDirection = "asc" | "desc"
type AllPlayersSortKey =
  | "name"
  | "position"
  | "weeklyChange"
  | "ownPercent"
  | "price"
  | "avg2026"
  | "last3"
  | "ppm"
  | "projection"
  | "breakeven"
  | "gamesPlayed"

interface PlayerDrawStripRound {
  round: number
  opponent: string | null
  opponentLogoUrl: string | null
  isHome: boolean | null
  isBye: boolean
}

interface OpponentHeatmapCell {
  average: number | null
  games: number
}

interface OpponentHeatmapColumn {
  opponent: string | null
  round: number | null
  isBye: boolean
}

interface OpponentHeatmapRow {
  label: string
  cells: OpponentHeatmapCell[]
}

interface FantasyBoxPlotRow {
  label: string
  values: number[]
  min: number
  q1: number
  median: number
  q3: number
  max: number
}

interface AllPlayersTableRow {
  player: FantasyPlayerSnapshot
  localName: string | null
  imageRow: PlayerImageRecord | null
  avg2026: number | null
  last3: number | null
  ppm: number | null
  projection: number | null
  breakeven: number | null
  weeklyChange: number | null
  gamesPlayed: number
}

const STAT_VS_FANTASY_OPTIONS = [
  { label: "Run Metres", key: "All Run Metres" },
  { label: "Tackles", key: "Tackles Made" },
  { label: "Kick Metres", key: "Kicking Metres" },
  { label: "Minutes", key: "Mins Played" },
  { label: "Try Assists", key: "Try Assists" },
  { label: "Line Breaks", key: "Line Breaks" },
  { label: "Line Break Assists", key: "Line Break Assists" },
  { label: "Tackle Breaks", key: "Tackle Breaks" },
  { label: "Offloads", key: "Offloads" },
  { label: "Tries", key: "Tries" },
] as const

type StatVsFantasyOptionLabel = (typeof STAT_VS_FANTASY_OPTIONS)[number]["label"]
const ROLLING_AVERAGE_STAT_OPTIONS = PLAYER_STATS as readonly string[]

const HEATMAP_LOW_SCORE = 20
const HEATMAP_MID_SCORE = 45
const HEATMAP_HIGH_SCORE = 75
const FANTASY_BOX_PLOT_PAD_PCT = 6

const MINUTES_FILTER_OPTIONS = [
  "Any",
  "10 Mins",
  "20 Mins",
  "30 Mins",
  "40 Mins",
  "50 Mins",
  "60 Mins",
  "70 Mins",
  "80 Mins",
] as const

type GameLogColumn =
  | "Year"
  | "Round"
  | "Date"
  | "Opponent"
  | "Fantasy"
  | "Position"
  | "Mins Played"
  | "Tries"
  | "G"
  | "FG"
  | "Try Assists"
  | "Line Breaks"
  | "Line Break Assists"
  | "Tackle Breaks"
  | "TO"
  | "FT"
  | "KD"
  | "FDO"
  | "PC"
  | "SB"
  | "SO"
  | "Tackles Made"
  | "Missed Tackles"
  | "Offloads"
  | "Errors"
  | "All Run Metres"
  | "Kicking Metres"

const POSITION_TABLES = Object.entries(FANTASY_POSITION_MAP)
  .map(([code, label]) => ({ code: Number(code), label }))
  .sort((a, b) => a.code - b.code)

const GAME_LOG_COLUMNS: { key: GameLogColumn; label: string; align?: "left" | "right" }[] = [
  { key: "Year", label: "Season" },
  { key: "Round", label: "Rnd", align: "right" },
  { key: "Date", label: "Date" },
  { key: "Opponent", label: "Opponent" },
  { key: "Position", label: "Position" },
  { key: "Fantasy", label: "Fantasy", align: "right" },
  { key: "Mins Played", label: "Mins", align: "right" },
  { key: "Tries", label: "T", align: "right" },
  { key: "G", label: "G", align: "right" },
  { key: "FG", label: "FG", align: "right" },
  { key: "Try Assists", label: "TA", align: "right" },
  { key: "Line Breaks", label: "LB", align: "right" },
  { key: "Line Break Assists", label: "LBA", align: "right" },
  { key: "Tackle Breaks", label: "TB", align: "right" },
  { key: "TO", label: "TO", align: "right" },
  { key: "FT", label: "FT", align: "right" },
  { key: "KD", label: "KD", align: "right" },
  { key: "FDO", label: "FDO", align: "right" },
  { key: "PC", label: "PC", align: "right" },
  { key: "SB", label: "SB", align: "right" },
  { key: "SO", label: "SO", align: "right" },
  { key: "Tackles Made", label: "TCK", align: "right" },
  { key: "Missed Tackles", label: "MT", align: "right" },
  { key: "Offloads", label: "OF", align: "right" },
  { key: "Errors", label: "ER", align: "right" },
  { key: "All Run Metres", label: "MG", align: "right" },
  { key: "Kicking Metres", label: "KM", align: "right" },
]

const GAME_LOG_BASE_UPSIDE_COLUMN_WIDTH_PX = 190
const ALL_PLAYERS_STATS_YEAR = "2026"

const ALL_PLAYERS_MOBILE_HIDDEN_COLUMNS = new Set<AllPlayersSortKey>()

const ALL_PLAYERS_BASE_COLUMNS: Array<{ key: AllPlayersSortKey; label: string; align?: "left" | "center" | "right"; proOnly?: boolean }> = [
  { key: "name", label: "Player", align: "left" },
  { key: "position", label: "Pos", align: "center" },
  { key: "weeklyChange", label: "Weekly", align: "center" },
  { key: "ownPercent", label: "Own %", align: "center" },
  { key: "price", label: "Price", align: "center" },
  { key: "avg2026", label: "2026 Avg", align: "center" },
  { key: "last3", label: "Last 3", align: "center" },
  { key: "ppm", label: "PPM", align: "center" },
  { key: "projection", label: "Proj", align: "center", proOnly: true },
  { key: "breakeven", label: "BE", align: "center", proOnly: true },
  { key: "gamesPlayed", label: "Games", align: "center" },
]

function getAllPlayersColumnWidthClass(key: AllPlayersSortKey): string {
  switch (key) {
    case "name":
      return "w-36 min-w-36 max-w-36 sm:w-64 sm:min-w-64 sm:max-w-64"
    case "position":
      return "w-14 min-w-14 max-w-14 sm:w-auto"
    case "weeklyChange":
    case "ownPercent":
      return "w-20 min-w-20 max-w-20 sm:w-auto"
    case "price":
      return "w-16 min-w-16 max-w-16 sm:w-auto"
    case "avg2026":
    case "last3":
      return "w-16 min-w-16 max-w-16 sm:w-auto"
    case "ppm":
    case "projection":
    case "breakeven":
    case "gamesPlayed":
      return "w-14 min-w-14 max-w-14 sm:w-auto"
    default:
      return ""
  }
}

function getCenteredValueClass(key: AllPlayersSortKey): string {
  switch (key) {
    case "weeklyChange":
      return "min-w-[3.6rem]"
    case "ownPercent":
      return "min-w-[3.5rem]"
    case "avg2026":
    case "last3":
      return "min-w-[2.5rem]"
    default:
      return ""
  }
}

function isCompactGameLogColumn(column: GameLogColumn): boolean {
  return !["Date", "Opponent", "Position"].includes(column)
}

function getGameLogCellPaddingClass(column: GameLogColumn): string {
  if (column === "Round" || column === "Fantasy") return "pl-0.5 pr-2"
  if (column === "Date" || column === "Position") return "pl-2 pr-0.5"
  return isCompactGameLogColumn(column) ? "px-0.5" : "px-0.5"
}

function getGameLogColumnWidthPx(column: GameLogColumn): number {
  switch (column) {
    case "Year":
      return 54
    case "Round":
      return 38
    case "Date":
      return 72
    case "Opponent":
      return 110
    case "Fantasy":
      return 56
    case "Position":
      return 82
    case "Mins Played":
      return 48
    case "FDO":
      return 42
    case "Tackles Made":
    case "All Run Metres":
    case "Kicking Metres":
      return 46
    default:
      return 38
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%ks]/gi, "").replace(/,/g, "").trim()
    if (!cleaned || cleaned === "-") return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function parseName(value: string): { first: string; last: string } {
  const parts = normaliseName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return {
    first: parts[0],
    last: parts[parts.length - 1],
  }
}

function findLocalPlayerMatch(fantasyName: string, localNames: string[]): string | null {
  if (!fantasyName || localNames.length === 0) return null

  const exactMap = new Map(localNames.map((name) => [normaliseName(name), name]))
  const exact = exactMap.get(normaliseName(fantasyName))
  if (exact) return exact

  const target = parseName(fantasyName)
  const candidates = localNames.filter((name) => {
    const parsed = parseName(name)
    return parsed.last && parsed.last === target.last
  })

  const initialMatches = candidates.filter((name) => {
    const parsed = parseName(name)
    return parsed.first[0] && parsed.first[0] === target.first[0]
  })
  if (initialMatches.length === 1) return initialMatches[0]

  const prefixMatches = candidates.filter((name) => {
    const parsed = parseName(name)
    return parsed.first.startsWith(target.first) || target.first.startsWith(parsed.first)
  })
  if (prefixMatches.length === 1) return prefixMatches[0]

  return null
}

function formatPrice(value: number | null): string {
  if (value === null) return "-"
  return `$${Math.round(value / 1000)}k`
}

function getPlayerThumbnailUrl(imageRow: PlayerImageRecord | null): string | null {
  const source = imageRow?.head_image ?? imageRow?.body_image
  if (!source) return null

  const trimmed = source.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`

  const marker = "/remote.axd?"
  const idx = trimmed.indexOf(marker)
  if (idx >= 0) {
    const nested = trimmed.slice(idx + marker.length)
    if (nested.startsWith("http://")) return `https://${nested.slice("http://".length)}`
    if (nested) return nested
  }

  return trimmed
}

function getPlayerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase()
}

function averageNumbers(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function formatTableNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "-"
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

function formatPercent(value: number | null): string {
  if (value === null) return "-"
  return `${value.toFixed(2)}%`
}

function formatOwnershipDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function getOwnershipDeltaClass(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "text-nrl-muted"
  if (value > 0) return "text-emerald-300"
  if (value < 0) return "text-rose-300"
  return "text-nrl-muted"
}

function getHeatColorForAverage(value: number): string {
  if (!Number.isFinite(value)) return "transparent"

  const clamped = Math.max(HEATMAP_LOW_SCORE, Math.min(HEATMAP_HIGH_SCORE, value))

  if (clamped <= HEATMAP_MID_SCORE) {
    const ratio = (clamped - HEATMAP_LOW_SCORE) / (HEATMAP_MID_SCORE - HEATMAP_LOW_SCORE || 1)
    const red = Math.round(235 + (120 - 235) * ratio)
    const green = Math.round(88 + (190 - 88) * ratio)
    const blue = Math.round(88 + (130 - 88) * ratio)
    const alpha = 0.2 + ratio * 0.2
    return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`
  }

  const ratio = (clamped - HEATMAP_MID_SCORE) / (HEATMAP_HIGH_SCORE - HEATMAP_MID_SCORE || 1)
  const red = Math.round(120 + (0 - 120) * ratio)
  const green = Math.round(190 + (245 - 190) * ratio)
  const blue = Math.round(130 + (138 - 130) * ratio)
  const alpha = 0.4 + ratio * 0.12
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]
  const sorted = [...values].sort((a, b) => a - b)
  const clampedQ = Math.max(0, Math.min(1, q))
  const position = (sorted.length - 1) * clampedQ
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = sorted[lowerIndex]
  const upper = sorted[upperIndex]
  if (lowerIndex === upperIndex) return lower
  const weight = position - lowerIndex
  return lower + (upper - lower) * weight
}

function formatNumber(value: number | null, digits = 1): string {
  if (value === null) return "-"
  return value.toFixed(digits)
}

function formatOpponent(value: string | null): string {
  if (!value) return "-"
  return value.replace(/-/g, " ")
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parseMinutesFilterOption(value: string): number {
  if (!value || value === "Any") return 0
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
}

function getRowAliasNumber(row: PlayerStat, aliases: string[]): number | null {
  for (const alias of aliases) {
    const n = toFiniteNumber(row[alias])
    if (n !== null) return n
  }
  return null
}

interface BaseUpsideSplit {
  basePoints: number
  upsidePoints: number
  fantasyPoints: number
}

const BASE_FANTASY_COMPONENTS: Array<{
  aliases: string[]
  pointsPerUnit: number
  divideThenFloor?: number
}> = [
    { aliases: ["All Run Metres", "Run Metres"], pointsPerUnit: 1, divideThenFloor: 10 },
    { aliases: ["Tackles Made", "Tackles"], pointsPerUnit: 1 },
    { aliases: ["Kicking Metres", "Kick Metres"], pointsPerUnit: 1, divideThenFloor: 30 },
    { aliases: ["Conversions"], pointsPerUnit: 2 },
  ]

function getBaseUpsideSplit(row: PlayerStat): BaseUpsideSplit {
  const basePoints = BASE_FANTASY_COMPONENTS.reduce((sum, component) => {
    const rawValue = getRowAliasNumber(row, component.aliases) ?? 0
    const value = component.divideThenFloor
      ? Math.floor(rawValue / component.divideThenFloor)
      : rawValue
    return sum + value * component.pointsPerUnit
  }, 0)
  const fantasyPoints = toFiniteNumber(row.Fantasy) ?? 0
  const upsidePoints = fantasyPoints - basePoints

  return { basePoints, upsidePoints, fantasyPoints }
}

function getAverageBaseUpsideSplit(rows: PlayerStat[]): BaseUpsideSplit | null {
  if (rows.length === 0) return null

  const totals = rows.reduce(
    (acc, row) => {
      const split = getBaseUpsideSplit(row)
      return {
        basePoints: acc.basePoints + split.basePoints,
        upsidePoints: acc.upsidePoints + split.upsidePoints,
        fantasyPoints: acc.fantasyPoints + split.fantasyPoints,
      }
    },
    { basePoints: 0, upsidePoints: 0, fantasyPoints: 0 }
  )

  return {
    basePoints: totals.basePoints / rows.length,
    upsidePoints: totals.upsidePoints / rows.length,
    fantasyPoints: totals.fantasyPoints / rows.length,
  }
}

function getScaledBaseUpsideBarWidths(
  split: BaseUpsideSplit,
  maxFantasyPoints: number
): { basePct: number; upsidePct: number } {
  const safeMaxFantasy = maxFantasyPoints > 0 ? maxFantasyPoints : 1
  const totalWidthPct = Math.max(0, Math.min(100, (Math.max(0, split.fantasyPoints) / safeMaxFantasy) * 100))
  if (totalWidthPct <= 0) return { basePct: 0, upsidePct: 0 }

  const base = Math.max(0, split.basePoints)
  const upside = Math.abs(split.upsidePoints)
  const total = base + upside
  if (total <= 0) return { basePct: 0, upsidePct: 0 }

  return {
    basePct: (base / total) * totalWidthPct,
    upsidePct: (upside / total) * totalWidthPct,
  }
}

function getSyntheticGameLogValue(row: PlayerStat, column: GameLogColumn): number | null {
  switch (column) {
    case "G":
      return getRowAliasNumber(row, ["Conversions"])
    case "FG": {
      const one = getRowAliasNumber(row, ["1 Point Field Goals"]) ?? 0
      const two = getRowAliasNumber(row, ["2 Point Field Goals"]) ?? 0
      return one + two
    }
    case "TO":
      return getRowAliasNumber(row, ["One on One Steal", "One on One Steals"])
    case "FT": {
      const fortyTwenty = getRowAliasNumber(row, ["40/20"]) ?? 0
      const twentyForty = getRowAliasNumber(row, ["20/40"]) ?? 0
      return fortyTwenty + twentyForty
    }
    case "KD":
      return getRowAliasNumber(row, ["Kicks Defused"])
    case "FDO":
      return getRowAliasNumber(row, ["Forced Drop Outs"])
    case "PC":
      return getRowAliasNumber(row, ["Penalties"])
    case "SB":
      return getRowAliasNumber(row, ["Sin Bins"])
    case "SO":
      return getRowAliasNumber(row, ["Send Offs"])
    default:
      return null
  }
}

function getGameLogCellDisplay(row: PlayerStat, column: GameLogColumn): string | number {
  if (column === "Round") return row.Round_Label || row.Round || "-"
  if (column === "Opponent") return formatOpponent(row.Opponent)
  if (column === "Date") return formatDate(row.match_date)
  if (column === "Fantasy") return toFiniteNumber(row.Fantasy) ?? "-"
  if (column === "Year") return row.Year
  if (column === "Position") return row.Position

  const synthetic = getSyntheticGameLogValue(row, column)
  if (synthetic !== null) return Number.isInteger(synthetic) ? Math.round(synthetic) : synthetic.toFixed(1)

  const rawValue = row[column]

  const n = toFiniteNumber(rawValue)
  if (n !== null) {
    return Number.isInteger(n) ? Math.round(n) : n.toFixed(1)
  }
  if (typeof rawValue === "string") return rawValue
  return "-"
}

function getGameLogNumericValue(row: PlayerStat, column: GameLogColumn): number | null {
  if (column === "Fantasy") return toFiniteNumber(row.Fantasy)
  if (
    column === "Year" ||
    column === "Round" ||
    column === "Date" ||
    column === "Opponent" ||
    column === "Position"
  ) {
    return null
  }

  const synthetic = getSyntheticGameLogValue(row, column)
  if (synthetic !== null) return synthetic

  return toFiniteNumber(row[column])
}

function sortRoundsDesc(a: PlayerStat, b: PlayerStat): number {
  if (a.Year !== b.Year) return b.Year.localeCompare(a.Year)
  return (b.Round ?? 0) - (a.Round ?? 0)
}

function sortRoundsAsc(a: PlayerStat, b: PlayerStat): number {
  if (a.Year !== b.Year) return a.Year.localeCompare(b.Year)
  return (a.Round ?? 0) - (b.Round ?? 0)
}

function getDefaultGameLogSortDirection(column: GameLogColumn): GameLogSortDirection {
  switch (column) {
    case "Opponent":
    case "Position":
      return "asc"
    default:
      return "desc"
  }
}

function getGameLogSortValue(row: PlayerStat, column: GameLogColumn): number | string | null {
  switch (column) {
    case "Year": {
      const n = Number.parseInt(String(row.Year ?? ""), 10)
      return Number.isFinite(n) ? n : String(row.Year ?? "")
    }
    case "Round":
      return typeof row.Round === "number" ? row.Round : null
    case "Date": {
      const raw = row.match_date
      if (typeof raw === "string" && raw) {
        const t = Date.parse(raw)
        if (Number.isFinite(t)) return t
        return raw
      }
      return null
    }
    case "Opponent":
      return formatOpponent(row.Opponent).toLowerCase()
    case "Position":
      return String(row.Position ?? "").toLowerCase()
    default: {
      const n = getGameLogNumericValue(row, column)
      if (n !== null) return n
      const display = getGameLogCellDisplay(row, column)
      return typeof display === "number" ? display : String(display).toLowerCase()
    }
  }
}

function compareGameLogRows(
  a: PlayerStat,
  b: PlayerStat,
  column: GameLogColumn,
  direction: GameLogSortDirection
): number {
  const aValue = getGameLogSortValue(a, column)
  const bValue = getGameLogSortValue(b, column)

  let cmp = 0
  if (aValue === null && bValue === null) {
    cmp = 0
  } else if (aValue === null) {
    cmp = 1
  } else if (bValue === null) {
    cmp = -1
  } else if (typeof aValue === "number" && typeof bValue === "number") {
    cmp = aValue - bValue
  } else {
    cmp = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" })
  }

  if (cmp === 0) return sortRoundsDesc(a, b)
  return direction === "asc" ? cmp : -cmp
}

function FantasyPlotToggleButton({
  active,
  locked,
  onClick,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean
  locked: boolean
  onClick: () => void
  activeLabel: string
  inactiveLabel: string
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${locked
        ? "cursor-not-allowed border-white/8 bg-white/[0.035] text-slate-500 shadow-none"
        : active
          ? "cursor-pointer border-nrl-accent bg-nrl-accent/10 text-nrl-accent"
          : "cursor-pointer border-nrl-border text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
        }`}
    >
      {locked ? inactiveLabel : active ? activeLabel : inactiveLabel}
    </button>
  )
}

function MetricCard({
  label,
  value,
  sublabel,
  compact = false,
  blurValue = false,
  mobileTight = false,
}: {
  label: string
  value: string
  sublabel?: string
  compact?: boolean
  blurValue?: boolean
  mobileTight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border border-nrl-border bg-nrl-panel-2 ${compact
        ? mobileTight
          ? "min-h-[4.4rem] px-2 py-2.5 sm:min-h-[5.25rem] sm:px-1.5 sm:py-4 xl:min-h-[4.5rem] xl:px-1.5 xl:py-2.5"
          : "px-2 py-3 sm:px-1.5 sm:py-4 xl:px-1.5 xl:py-2.5"
        : "px-3 py-2"
        }`}
    >
      <div className={`${compact ? mobileTight ? "text-[6.5px] sm:text-[7px]" : "text-[7px]" : "text-[9px]"} font-semibold uppercase tracking-wide text-nrl-muted`}>
        {label}
      </div>
      <div
        className={`${compact ? mobileTight ? "mt-1 text-[1.12rem] leading-tight tracking-tight sm:mt-1 sm:text-[1.5rem] sm:leading-none" : "mt-1 text-[1.15rem] leading-tight tracking-tight sm:text-[1.5rem] sm:leading-none" : "mt-1 text-xl"} min-w-0 font-bold text-nrl-text ${blurValue ? "select-none blur-[5px]" : ""
          }`}
        aria-hidden={blurValue || undefined}
      >
        {value}
      </div>
      {sublabel ? (
        <div className={`${compact ? mobileTight ? "mt-1 text-[7px] leading-tight sm:mt-1 sm:text-[8px]" : "mt-1 text-[8px] leading-tight" : "mt-0.5 text-[10px]"} text-nrl-muted`}>
          {sublabel}
        </div>
      ) : null}
    </div>
  )
}

export function FantasyDashboard({
  fantasyPlayers,
  fantasyCoachPlayers = [],
  lineupsProjections,
  ownershipBaselineSnapshot = null,
  availableYears,
  defaultYears,
  initialPlayerStats,
  playerImages = [],
  teamLogos = {},
  preloadedPlayerAllYears = false,
  draw2026Data,
  initialSelectedFantasyName,
  showOwnedCards = true,
  showPlayerDetails = true,
  playerRouteBasePath,
  canAccessLoginSeason = false,
  canBypassPlotGate = false,
}: FantasyDashboardProps) {
  const router = useRouter()
  const { userId } = useAuth()
  const initialSelectedYears = useMemo(
    () => {
      if (availableYears.includes(ALL_PLAYERS_STATS_YEAR)) return [ALL_PLAYERS_STATS_YEAR]
      const validDefaultYears = defaultYears.filter((year) => availableYears.includes(year))
      return validDefaultYears.length > 0 ? validDefaultYears : availableYears.slice(0, 1)
    },
    [availableYears, defaultYears]
  )
  const [selectedYears, setSelectedYears] = useState<string[]>(initialSelectedYears)
  const [allData, setAllData] = useState<PlayerStat[]>(initialPlayerStats)
  const [teammateLookupRows, setTeammateLookupRows] = useState<TeammateLookupRow[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [selectedFantasyName, setSelectedFantasyName] = useState(
    initialSelectedFantasyName ?? fantasyPlayers[0]?.name ?? ""
  )
  const [finalsMode, setFinalsMode] = useState<"Yes" | "No">("Yes")
  const [opponentFilter, setOpponentFilter] = useState("All Opponents")
  const [positionFilter, setPositionFilter] = useState("All Positions")
  const [teammate, setTeammate] = useState("None")
  const [teammatePosition, setTeammatePosition] = useState("All")
  const [teammateMode, setTeammateMode] = useState<TeammateMode>("With")
  const [minutesOverFilter, setMinutesOverFilter] = useState<string>("Any")
  const [minutesUnderFilter, setMinutesUnderFilter] = useState<string>("Any")
  const [showRollingAveragePlot, setShowRollingAveragePlot] = useState(false)
  const [selectedRollingAverageWindow, setSelectedRollingAverageWindow] = useState<number>(5)
  const [showBaseUpsideBars, setShowBaseUpsideBars] = useState(false)
  const [showOpponentHeatmap, setShowOpponentHeatmap] = useState(false)
  const [showFantasyBoxPlot, setShowFantasyBoxPlot] = useState(false)
  const [showStatVsFantasyPlot, setShowStatVsFantasyPlot] = useState(false)
  const [selectedRollingAverageStat, setSelectedRollingAverageStat] = useState<string>("Fantasy")
  const [selectedStatVsFantasyLabel, setSelectedStatVsFantasyLabel] = useState<StatVsFantasyOptionLabel>("Run Metres")
  const [showWithWithoutPlot, setShowWithWithoutPlot] = useState(false)
  const [gameLogSort, setGameLogSort] = useState<{ column: GameLogColumn; direction: GameLogSortDirection } | null>(
    null
  )
  const [allPlayersSort, setAllPlayersSort] = useState<{ column: AllPlayersSortKey; direction: AllPlayersSortDirection }>({
    column: "weeklyChange",
    direction: "desc",
  })
  const [allPlayersPositionFilter, setAllPlayersPositionFilter] = useState("All Positions")
  const [hasRequestedAllPlayersStats, setHasRequestedAllPlayersStats] = useState(false)
  const { user } = useUser()
  const hasLoginAccess = canAccessLoginSeason || Boolean(userId)
  const hasFantasyPlotAccess = canBypassPlotGate || hasProPlotAccess(userId, user?.publicMetadata)
  const analysisLocked = !hasFantasyPlotAccess
  const playerDetailsRef = useRef<HTMLElement | null>(null)

  const scrollToPlayerDetails = useCallback(() => {
    if (typeof window === "undefined") return
    window.requestAnimationFrame(() => {
      playerDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  const navigateToPlayer = useCallback(
    (name: string) => {
      if (playerRouteBasePath) {
        router.push(`${playerRouteBasePath}/${encodeURIComponent(fantasyPlayerSlug(name))}`)
        return
      }
      setSelectedFantasyName(name)
      scrollToPlayerDetails()
    },
    [playerRouteBasePath, router, scrollToPlayerDetails]
  )

  const loadTeammateLookupRows = useCallback(async (years: string[]) => {
    if (!hasLoginAccess) {
      setTeammateLookupRows([])
      return
    }
    if (years.length === 0) {
      setTeammateLookupRows([])
      return
    }

    try {
      const res = await fetch(`/api/player-stats-teammates?years=${encodeURIComponent(years.join(","))}`)
      if (!res.ok) return
      const data = (await res.json()) as TeammateLookupRow[]
      setTeammateLookupRows(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to load teammate lookup rows", error)
    }
  }, [hasLoginAccess])

  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = availableYears.filter((year) => years.includes(year))
    const nextYears = validYears.length > 0 ? validYears : availableYears.slice(0, 1)
    setSelectedYears(nextYears)
    if (nextYears.length === 0) return
    if (preloadedPlayerAllYears) {
      void loadTeammateLookupRows(nextYears)
      return
    }
    setIsLoadingStats(true)
    try {
      const res = await fetch(`/api/player-stats?years=${encodeURIComponent(nextYears.join(","))}`)
      if (!res.ok) return
      const data = (await res.json()) as PlayerStat[]
      setAllData(Array.isArray(data) ? data : [])
    } finally {
      setIsLoadingStats(false)
    }
  }, [availableYears, loadTeammateLookupRows, preloadedPlayerAllYears])

  const selectedFantasyPlayer = useMemo(
    () => fantasyPlayers.find((player) => player.name === selectedFantasyName) ?? null,
    [fantasyPlayers, selectedFantasyName]
  )
  const selectedFantasyCoachPlayer = useMemo(
    () => selectedFantasyPlayer
      ? fantasyCoachPlayers.find((player) => player.id === selectedFantasyPlayer.id) ?? null
      : null,
    [fantasyCoachPlayers, selectedFantasyPlayer]
  )
  const selectedFantasyCoachMetrics = useMemo(
    () => getFantasyCoachRoundMetrics(selectedFantasyCoachPlayer),
    [selectedFantasyCoachPlayer]
  )
  const selectedFantasyCoachRound = useMemo(() => {
    return lineupsProjections?.round ?? selectedFantasyCoachMetrics.round
  }, [lineupsProjections, selectedFantasyCoachMetrics])

  const selectedYearData = useMemo(() => {
    if (selectedYears.length === 0) return allData
    return allData.filter((row) => selectedYears.includes(row.Year))
  }, [allData, selectedYears])

  const teammateLookupSourceRows = useMemo(
    () => (preloadedPlayerAllYears ? teammateLookupRows : selectedYearData),
    [preloadedPlayerAllYears, teammateLookupRows, selectedYearData]
  )

  const allLocalNames = useMemo(
    () => Array.from(new Set(allData.map((row) => row.Name))).sort(),
    [allData]
  )

  const matchedLocalName = useMemo(
    () =>
      selectedFantasyPlayer
        ? findLocalPlayerMatch(selectedFantasyPlayer.name, allLocalNames)
        : null,
    [selectedFantasyPlayer, allLocalNames]
  )

  const playerRowsForYear = useMemo(() => {
    if (!matchedLocalName) return []
    return selectedYearData.filter((row) => row.Name === matchedLocalName)
  }, [matchedLocalName, selectedYearData])
  const playerRowsAllYears = useMemo(() => {
    if (!matchedLocalName) return []
    return allData.filter((row) => row.Name === matchedLocalName)
  }, [allData, matchedLocalName])

  const fantasyRank = useMemo(() => buildFantasyRank(teammateLookupSourceRows), [teammateLookupSourceRows])
  const teammateOptions = useMemo(
    () =>
      matchedLocalName
        ? getTeammateOptions(matchedLocalName, teammateLookupSourceRows, fantasyRank)
        : [],
    [matchedLocalName, teammateLookupSourceRows, fantasyRank]
  )

  const positionOptions = useMemo(
    () =>
      Array.from(new Set(playerRowsForYear.map((row) => row.Position)))
        .filter(Boolean)
        .sort(),
    [playerRowsForYear]
  )

  const teammatePositionOptions = useMemo(() => {
    const sourceRows =
      teammate !== "None"
        ? teammateLookupSourceRows.filter((row) => row.Name === teammate)
        : teammateLookupSourceRows

    return Array.from(new Set(sourceRows.map((row) => row.Position)))
      .filter(Boolean)
      .sort()
  }, [teammateLookupSourceRows, teammate])

  const opponentOptions = useMemo(
    () =>
      Array.from(new Set(playerRowsForYear.map((row) => formatOpponent(row.Opponent))))
        .filter((value) => value && value !== "-")
        .sort(),
    [playerRowsForYear]
  )

  useEffect(() => {
    if (!showPlayerDetails || !preloadedPlayerAllYears || !hasLoginAccess) return
    void loadTeammateLookupRows(selectedYears)
  }, [hasLoginAccess, loadTeammateLookupRows, preloadedPlayerAllYears, selectedYears, showPlayerDetails])

  useEffect(() => {
    if (
      !showOwnedCards ||
      hasRequestedAllPlayersStats ||
      allData.some((row) => row.Year === ALL_PLAYERS_STATS_YEAR)
    ) return

    let cancelled = false
    setHasRequestedAllPlayersStats(true)
    const loadAllPlayersYear = async () => {
      try {
        const res = await fetch(`/api/player-stats?years=${ALL_PLAYERS_STATS_YEAR}`)
        if (!res.ok) return
        const data = (await res.json()) as PlayerStat[]
        if (!cancelled && Array.isArray(data)) {
          setAllData(data)
        }
      } catch (error) {
        console.error("Failed to load all fantasy player stats", error)
      }
    }

    void loadAllPlayersYear()
    return () => {
      cancelled = true
    }
  }, [allData, hasRequestedAllPlayersStats, showOwnedCards])

  useEffect(() => {
    if (hasLoginAccess) return
    setTeammate("None")
    setTeammatePosition("All")
    setTeammateMode("With")
  }, [hasLoginAccess])

  useEffect(() => {
    if (!hasLoginAccess || teammate === "None") {
      setShowWithWithoutPlot(false)
    }
  }, [hasLoginAccess, teammate])

  useEffect(() => {
    if (hasFantasyPlotAccess) return
    setShowBaseUpsideBars(false)
    setShowOpponentHeatmap(false)
    setShowFantasyBoxPlot(false)
    setShowStatVsFantasyPlot(false)
    setShowWithWithoutPlot(false)
  }, [hasFantasyPlotAccess])

  useEffect(() => {
    setOpponentFilter("All Opponents")
    setPositionFilter("All Positions")
    setTeammate("None")
    setTeammatePosition("All")
  }, [selectedFantasyName])

  const rowsBeforeTeammateFilter = useMemo(() => {
    let rows = [...playerRowsForYear]
    rows = filterByFinals(rows, finalsMode)

    if (positionFilter !== "All Positions") {
      rows = rows.filter((row) => row.Position === positionFilter)
    }

    if (opponentFilter !== "All Opponents") {
      rows = rows.filter((row) => formatOpponent(row.Opponent) === opponentFilter)
    }

    rows = filterByMinutes(rows, 0, "All")

    rows = rows.filter((row) => {
      const mins = toFiniteNumber(row["Mins Played"]) ?? 0
      const overThreshold = parseMinutesFilterOption(minutesOverFilter)
      const underThreshold = parseMinutesFilterOption(minutesUnderFilter)
      if (overThreshold > 0 && mins < overThreshold) return false
      if (underThreshold > 0 && mins > underThreshold) return false
      return true
    })

    return rows.sort(sortRoundsDesc)
  }, [
    finalsMode,
    minutesOverFilter,
    minutesUnderFilter,
    opponentFilter,
    playerRowsForYear,
    positionFilter,
  ])

  const trendRowsBeforeTeammateFilter = useMemo(() => {
    let rows = [...playerRowsAllYears]
    rows = filterByFinals(rows, finalsMode)

    if (positionFilter !== "All Positions") {
      rows = rows.filter((row) => row.Position === positionFilter)
    }

    if (opponentFilter !== "All Opponents") {
      rows = rows.filter((row) => formatOpponent(row.Opponent) === opponentFilter)
    }

    rows = filterByMinutes(rows, 0, "All")

    rows = rows.filter((row) => {
      const mins = toFiniteNumber(row["Mins Played"]) ?? 0
      const overThreshold = parseMinutesFilterOption(minutesOverFilter)
      const underThreshold = parseMinutesFilterOption(minutesUnderFilter)
      if (overThreshold > 0 && mins < overThreshold) return false
      if (underThreshold > 0 && mins > underThreshold) return false
      return true
    })

    return rows.sort(sortRoundsDesc)
  }, [
    finalsMode,
    minutesOverFilter,
    minutesUnderFilter,
    opponentFilter,
    playerRowsAllYears,
    positionFilter,
  ])

  const filteredRows = useMemo(() => {
    if (hasLoginAccess && teammate !== "None") {
      return filterByTeammate(
        rowsBeforeTeammateFilter,
        teammate,
        teammateMode === "With",
        teammateLookupSourceRows,
        teammatePosition
      )
    }

    return rowsBeforeTeammateFilter
  }, [
    hasLoginAccess,
    rowsBeforeTeammateFilter,
    teammateLookupSourceRows,
    teammate,
    teammateMode,
    teammatePosition,
  ])

  const trendFilteredRows = useMemo(() => {
    if (hasLoginAccess && teammate !== "None") {
      return filterByTeammate(
        trendRowsBeforeTeammateFilter,
        teammate,
        teammateMode === "With",
        teammateLookupSourceRows,
        teammatePosition
      )
    }

    return trendRowsBeforeTeammateFilter
  }, [
    hasLoginAccess,
    teammate,
    teammateLookupSourceRows,
    teammateMode,
    teammatePosition,
    trendRowsBeforeTeammateFilter,
  ])

  const withWithoutFantasyPlotData = useMemo(() => {
    if (!hasLoginAccess || teammate === "None") {
      return { withValues: [] as number[], withoutValues: [] as number[] }
    }

    const withRows = filterByTeammate(
      rowsBeforeTeammateFilter,
      teammate,
      true,
      teammateLookupSourceRows,
      teammatePosition
    )
    const withoutRows = filterByTeammate(
      rowsBeforeTeammateFilter,
      teammate,
      false,
      teammateLookupSourceRows,
      teammatePosition
    )

    return {
      withValues: withRows
        .map((row) => toFiniteNumber(row.Fantasy))
        .filter((value): value is number => value !== null),
      withoutValues: withoutRows
        .map((row) => toFiniteNumber(row.Fantasy))
        .filter((value): value is number => value !== null),
    }
  }, [
    hasLoginAccess,
    rowsBeforeTeammateFilter,
    teammate,
    teammateLookupSourceRows,
    teammatePosition,
  ])

  const latestLocalRow = useMemo(
    () => [...playerRowsAllYears].sort(sortRoundsDesc)[0] ?? null,
    [playerRowsAllYears]
  )
  const latestLocalTeam = useMemo(() => {
    const team = typeof latestLocalRow?.Team === "string" ? latestLocalRow.Team : null
    return team ? formatOpponent(team) : null
  }, [latestLocalRow])
  const teamForDrawStrip = latestLocalTeam

  const draw2026StripRows = useMemo<PlayerDrawStripRound[]>(() => {
    if (!draw2026Data?.rows?.length || !teamForDrawStrip) return []

    const teamKey = normaliseTeamKey(teamForDrawStrip)
    if (!teamKey) return []

    const fixturesByRound = new Map<number, PlayerDrawStripRound>()
    let maxRound = 0

    for (const row of draw2026Data.rows) {
      maxRound = Math.max(maxRound, row.round)

      const homeKey = normaliseTeamKey(row.home)
      const awayKey = normaliseTeamKey(row.away)
      if (homeKey !== teamKey && awayKey !== teamKey) continue

      const isHome = homeKey === teamKey
      const opponent = isHome ? row.away : row.home
      const opponentLogoUrl = draw2026Data.teamLogos[normaliseTeamKey(opponent)] ?? null

      fixturesByRound.set(row.round, {
        round: row.round,
        opponent,
        opponentLogoUrl,
        isHome,
        isBye: false,
      })
    }

    if (maxRound === 0) return []

    const out: PlayerDrawStripRound[] = []
    for (let round = 1; round <= maxRound; round += 1) {
      out.push(
        fixturesByRound.get(round) ?? {
          round,
          opponent: null,
          opponentLogoUrl: null,
          isHome: null,
          isBye: true,
        }
      )
    }

    return out
  }, [draw2026Data, teamForDrawStrip])

  const fantasyCardPosition = useMemo(
    () =>
      selectedFantasyPlayer?.positionLabels?.[0] ??
      (selectedFantasyPlayer?.positions?.[0] != null
        ? (FANTASY_POSITION_MAP[selectedFantasyPlayer.positions[0]] ?? null)
        : null),
    [selectedFantasyPlayer]
  )
  const fantasyCardPlayerName = matchedLocalName ?? selectedFantasyPlayer?.name ?? ""
  const fantasyCardImage = useMemo(
    () => resolvePlayerImage(fantasyCardPlayerName, latestLocalTeam, playerImages),
    [fantasyCardPlayerName, latestLocalTeam, playerImages]
  )
  const fantasyCardLogoUrl = useMemo(
    () => resolveTeamLogoUrl(fantasyCardImage?.team ?? latestLocalTeam, teamLogos),
    [fantasyCardImage?.team, latestLocalTeam, teamLogos]
  )

  const ownershipBaselineByPlayerId = useMemo(() => {
    const map = new Map<number, number | null>()
    for (const point of ownershipBaselineSnapshot?.points ?? []) {
      map.set(point.playerId, point.ownedBy)
    }
    return map
  }, [ownershipBaselineSnapshot])

  const ownershipDeltaByPlayerId = useMemo(() => {
    const map = new Map<number, number | null>()
    for (const player of fantasyPlayers) {
      const baseline = ownershipBaselineByPlayerId.get(player.id)
      const current = player.ownedBy
      if (baseline == null || current == null) {
        map.set(player.id, null)
      } else {
        map.set(player.id, current - baseline)
      }
    }
    return map
  }, [fantasyPlayers, ownershipBaselineByPlayerId])

  const topOwnershipRise = useMemo(
    () => getTopFantasyOwnershipRise(ownershipDeltaByPlayerId),
    [ownershipDeltaByPlayerId]
  )

  const allPlayersTableRows = useMemo<AllPlayersTableRow[]>(() => {
    const rows2026 = allData.filter((row) => row.Year === ALL_PLAYERS_STATS_YEAR)
    const localNames = Array.from(new Set(rows2026.map((row) => row.Name))).sort()
    const rowsByName = new Map<string, PlayerStat[]>()

    for (const row of rows2026) {
      const rows = rowsByName.get(row.Name) ?? []
      rows.push(row)
      rowsByName.set(row.Name, rows)
    }

    return fantasyPlayers.map((player) => {
      const localName = findLocalPlayerMatch(player.name, localNames)
      const playerRows = localName ? rowsByName.get(localName) ?? [] : []
      const fantasyScores = playerRows.map((row) => toFiniteNumber(row.Fantasy))
      const minutes = playerRows.map((row) => toFiniteNumber(row["Mins Played"]))
      const totalFantasy = fantasyScores.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      const totalMinutes = minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      const recentScores = [...playerRows]
        .sort(sortRoundsDesc)
        .slice(0, 3)
        .map((row) => toFiniteNumber(row.Fantasy))
      const coachPlayer = fantasyCoachPlayers.find((entry) => entry.id === player.id)
      const coachMetrics = getFantasyCoachRoundMetrics(coachPlayer)
      const ownershipDelta = ownershipDeltaByPlayerId.get(player.id) ?? null
      const teamHint = playerRows.length > 0 ? primaryTeamForRows(playerRows) : null
      const imageRow =
        resolvePlayerImage(localName ?? player.name, teamHint, playerImages) ??
        resolvePlayerImage(player.name, teamHint, playerImages)
      const lineupsRound = lineupsProjections?.round ?? coachMetrics.round
      const rawProjection = lineupsProjections?.projectionByPlayerId.get(player.id) ?? 0

      return {
        player,
        localName,
        imageRow,
        avg2026: averageNumbers(fantasyScores) ?? player.avgPoints,
        last3: averageNumbers(recentScores),
        ppm: totalMinutes > 0 ? totalFantasy / totalMinutes : null,
        weeklyChange: ownershipDelta,
        projection: applyFantasyProjectionOffset(
          rawProjection,
          ownershipDelta,
          topOwnershipRise
        ),
        breakeven: applyFantasyBreakEvenOffset(
          coachMetrics.breakEven ?? player.be ?? null,
          player.id,
          lineupsRound
        ),
        gamesPlayed: playerRows.length || player.gamesPlayed || 0,
      }
    })
  }, [allData, fantasyCoachPlayers, fantasyPlayers, lineupsProjections, ownershipDeltaByPlayerId, playerImages, topOwnershipRise])

  const sortedAllPlayersTableRows = useMemo(() => {
    const filteredRows =
      allPlayersPositionFilter === "All Positions"
        ? allPlayersTableRows
        : allPlayersTableRows.filter((row) => row.player.positionLabels.includes(allPlayersPositionFilter))

    const getSortValue = (row: AllPlayersTableRow): number | string | null => {
      if (allPlayersSort.column === "name") return row.player.name.toLowerCase()
      if (allPlayersSort.column === "position") return row.player.positionLabel.toLowerCase()
      if (allPlayersSort.column === "weeklyChange") return row.weeklyChange
      if (allPlayersSort.column === "ownPercent") return row.player.ownedBy
      if (allPlayersSort.column === "price") return row.player.cost
      if (allPlayersSort.column === "avg2026") return row.avg2026
      if (allPlayersSort.column === "last3") return row.last3
      if (allPlayersSort.column === "ppm") return row.ppm
      if (allPlayersSort.column === "projection") return row.projection
      if (allPlayersSort.column === "breakeven") return row.breakeven
      if (allPlayersSort.column === "gamesPlayed") return row.gamesPlayed

      return null
    }

    return [...filteredRows].sort((a, b) => {
      const aValue = getSortValue(a)
      const bValue = getSortValue(b)
      if (aValue === null && bValue === null) return a.player.name.localeCompare(b.player.name)
      if (aValue === null) return 1
      if (bValue === null) return -1

      const direction = allPlayersSort.direction === "asc" ? 1 : -1
      if (typeof aValue === "number" && typeof bValue === "number") {
        if (aValue !== bValue) return (aValue - bValue) * direction
        return a.player.name.localeCompare(b.player.name)
      }

      return String(aValue).localeCompare(String(bValue)) * direction
    })
  }, [allPlayersPositionFilter, allPlayersSort, allPlayersTableRows])

  const toggleAllPlayersSort = useCallback((column: AllPlayersSortKey, disabled = false) => {
    if (disabled) return
    setAllPlayersSort((current) => ({
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
    }))
  }, [])

  const selectedOwnershipDelta = useMemo(
    () =>
      selectedFantasyPlayer
        ? (ownershipDeltaByPlayerId.get(selectedFantasyPlayer.id) ?? null)
        : null,
    [ownershipDeltaByPlayerId, selectedFantasyPlayer]
  )
  const selectedAdjustedProjection = useMemo(
    () => applyFantasyProjectionOffset(
      selectedFantasyPlayer
        ? (lineupsProjections?.projectionByPlayerId.get(selectedFantasyPlayer.id) ?? 0)
        : null,
      selectedOwnershipDelta,
      topOwnershipRise,
    ),
    [lineupsProjections, selectedFantasyPlayer, selectedOwnershipDelta, topOwnershipRise]
  )
  const selectedAdjustedBreakEven = useMemo(
    () => applyFantasyBreakEvenOffset(
      selectedFantasyCoachMetrics.breakEven ?? selectedFantasyPlayer?.be ?? null,
      selectedFantasyPlayer?.id ?? null,
      selectedFantasyCoachRound,
    ),
    [selectedFantasyCoachMetrics.breakEven, selectedFantasyPlayer, selectedFantasyCoachRound]
  )

  const localPpm = useMemo(() => {
    const scores = playerRowsForYear
      .map((row) => toFiniteNumber(row.Fantasy))
      .filter((value): value is number => value !== null)
    const mins = playerRowsForYear
      .map((row) => toFiniteNumber(row["Mins Played"]))
      .filter((value): value is number => value !== null)

    if (scores.length === 0 || mins.length === 0) return null
    const totalScore = scores.reduce((sum, value) => sum + value, 0)
    const totalMins = mins.reduce((sum, value) => sum + value, 0)
    if (totalMins <= 0) return null
    return totalScore / totalMins
  }, [playerRowsForYear])

  const playerSearchOptions = useMemo(
    () => fantasyPlayers.map((player) => player.name),
    [fantasyPlayers]
  )

  const selectedStatVsFantasyOption = useMemo(
    () =>
      STAT_VS_FANTASY_OPTIONS.find((option) => option.label === selectedStatVsFantasyLabel) ??
      STAT_VS_FANTASY_OPTIONS[0],
    [selectedStatVsFantasyLabel]
  )
  const chronologicalTrendRows = useMemo(
    () => [...trendFilteredRows].sort(sortRoundsAsc),
    [trendFilteredRows]
  )
  const rollingAverageValueAccessor = useCallback(
    (row: PlayerStat) => toFiniteNumber(row[selectedRollingAverageStat]) ?? 0,
    [selectedRollingAverageStat]
  )
  const gameLogChartKey = useMemo(
    () =>
      chronologicalTrendRows
        .map((row) => `${selectedRollingAverageStat}-${row.Year}-${row.Round}-${String(row.match_date ?? "")}`)
        .join("|"),
    [chronologicalTrendRows, selectedRollingAverageStat]
  )

  const gameLogAverages = useMemo(() => {
    const out: Partial<Record<GameLogColumn, number | null>> = {}

    for (const column of GAME_LOG_COLUMNS) {
      const values = filteredRows
        .map((row) => getGameLogNumericValue(row, column.key))
        .filter((value): value is number => value !== null)

      out[column.key] =
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null
    }

    return out
  }, [filteredRows])

  const averageBaseUpsideSplit = useMemo(
    () => getAverageBaseUpsideSplit(filteredRows),
    [filteredRows]
  )
  const maxFantasyPointsForBaseUpsideBars = useMemo(() => {
    const maxRowFantasy = filteredRows.reduce((max, row) => {
      const fantasy = Math.max(0, toFiniteNumber(row.Fantasy) ?? 0)
      return Math.max(max, fantasy)
    }, 0)
    const averageFantasy = Math.max(0, averageBaseUpsideSplit?.fantasyPoints ?? 0)
    return Math.max(1, maxRowFantasy, averageFantasy)
  }, [averageBaseUpsideSplit, filteredRows])

  const opponentHeatmap = useMemo(() => {
    // Build columns from the draw strip (one per round), including byes.
    // Then append any historical opponents not covered by the draw.
    const drawColumns: OpponentHeatmapColumn[] = draw2026StripRows.map((stripRow) => ({
      round: stripRow.round,
      opponent: stripRow.isBye ? null : formatOpponent(stripRow.opponent),
      isBye: stripRow.isBye,
    }))

    // Track which opponent names are already covered by the draw (case-insensitive).
    const drawOpponentKeys = new Set<string>(
      drawColumns
        .filter((col) => !col.isBye && col.opponent)
        .map((col) => normaliseTeamKey(col.opponent!))
    )

    // Collect (season, opponent, fantasy) tuples from filtered rows.
    interface HeatEntry { season: string; opponent: string; fantasy: number }
    const entries: HeatEntry[] = []
    const historicalOpponents = new Set<string>()
    const seasons = new Set<string>()

    for (const row of trendFilteredRows) {
      const opponent = formatOpponent(row.Opponent)
      const fantasy = toFiniteNumber(row.Fantasy)
      if (!opponent || opponent === "-" || fantasy === null) continue

      const season = String(row.Year ?? "").trim() || "Unknown"
      seasons.add(season)
      entries.push({ season, opponent, fantasy })

      // If this opponent isn't in the draw, we'll show it as an extra columns.
      if (!drawOpponentKeys.has(normaliseTeamKey(opponent))) {
        historicalOpponents.add(opponent)
      }
    }

    // Extra columns for opponents only seen historically (not in current draw).
    const extraColumns: OpponentHeatmapColumn[] = [...historicalOpponents]
      .sort((a, b) => a.localeCompare(b))
      .map((opponent) => ({ round: null, opponent, isBye: false }))

    const columns: OpponentHeatmapColumn[] = [...drawColumns, ...extraColumns]

    if (columns.length === 0) return { columns: [], rows: [] }

    // Build lookups: seasonOpponentKey -> { sum, count } and opponent -> { sum, count }.
    const bySeasonOpponent = new Map<string, { sum: number; count: number }>()
    const byOpponent = new Map<string, { sum: number; count: number }>()

    for (const { season, opponent, fantasy } of entries) {
      // season+opponent key (used for per-season rows)
      const soKey = `${season}|||${normaliseTeamKey(opponent)}`
      const curSo = bySeasonOpponent.get(soKey) ?? { sum: 0, count: 0 }
      curSo.sum += fantasy
      curSo.count += 1
      bySeasonOpponent.set(soKey, curSo)

      // opponent-only key (for "All" row aggregation)
      const oppKey = normaliseTeamKey(opponent)
      const curOpp = byOpponent.get(oppKey) ?? { sum: 0, count: 0 }
      curOpp.sum += fantasy
      curOpp.count += 1
      byOpponent.set(oppKey, curOpp)
    }

    function cellForColumn(col: OpponentHeatmapColumn, season: string | null): OpponentHeatmapCell {
      if (col.isBye || !col.opponent) return { average: null, games: 0 }

      // Season rows: average of ALL games vs this opponent in that season.
      if (season !== null) {
        const soKey = `${season}|||${normaliseTeamKey(col.opponent)}`
        const hit = bySeasonOpponent.get(soKey)
        if (hit && hit.count > 0) return { average: hit.sum / hit.count, games: hit.count }
        return { average: null, games: 0 }
      }

      // "All" row: aggregate all games vs this opponent across all seasons.
      const hit = byOpponent.get(normaliseTeamKey(col.opponent))
      if (hit && hit.count > 0) return { average: hit.sum / hit.count, games: hit.count }
      return { average: null, games: 0 }
    }

    const seasonList = [...seasons].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

    const allRow: OpponentHeatmapRow = {
      label: "All",
      cells: columns.map((col) => cellForColumn(col, null)),
    }

    const seasonRows: OpponentHeatmapRow[] = seasonList.map((season) => ({
      label: season,
      cells: columns.map((col) => cellForColumn(col, season)),
    }))

    return {
      columns,
      rows: [allRow, ...seasonRows],
    }
  }, [draw2026StripRows, trendFilteredRows])

  const fantasyBoxPlotRows = useMemo<FantasyBoxPlotRow[]>(() => {
    const grouped = new Map<string, number[]>()
    const allValues: number[] = []
    for (const row of filteredRows) {
      const fantasy = toFiniteNumber(row.Fantasy)
      if (fantasy === null) continue
      const year = String(row.Year ?? "").trim() || "Unknown"
      const values = grouped.get(year) ?? []
      values.push(fantasy)
      grouped.set(year, values)
      allValues.push(fantasy)
    }

    const seasonRows = [...grouped.entries()]
      .sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))
      .map(([label, values]) => {
        const sorted = [...values].sort((a, b) => a - b)
        return {
          label,
          values: sorted,
          min: sorted[0],
          q1: quantile(sorted, 0.25),
          median: quantile(sorted, 0.5),
          q3: quantile(sorted, 0.75),
          max: sorted[sorted.length - 1],
        }
      })

    if (allValues.length === 0) return seasonRows

    const allSorted = [...allValues].sort((a, b) => a - b)
    return [
      {
        label: "All",
        values: allSorted,
        min: allSorted[0],
        q1: quantile(allSorted, 0.25),
        median: quantile(allSorted, 0.5),
        q3: quantile(allSorted, 0.75),
        max: allSorted[allSorted.length - 1],
      },
      ...seasonRows,
    ]
  }, [filteredRows])

  const fantasyBoxPlotRange = useMemo(() => {
    const allValues = fantasyBoxPlotRows.flatMap((row) => row.values)
    if (allValues.length === 0) return { min: 0, max: 100 }
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    if (max <= min) return { min: Math.max(0, min - 5), max: max + 5 }
    return { min, max }
  }, [fantasyBoxPlotRows])

  const sortedFilteredRows = useMemo(() => {
    const defaultRows = [...filteredRows].sort(sortRoundsDesc)
    if (!gameLogSort) return defaultRows
    return defaultRows.sort((a, b) =>
      compareGameLogRows(a, b, gameLogSort.column, gameLogSort.direction)
    )
  }, [filteredRows, gameLogSort])

  const toggleGameLogSort = useCallback((column: GameLogColumn) => {
    setGameLogSort((prev) => {
      if (!prev || prev.column !== column) {
        return { column, direction: getDefaultGameLogSortDirection(column) }
      }
      return { column, direction: prev.direction === "asc" ? "desc" : "asc" }
    })
  }, [])

  const draw2026Panel = (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
      <div className="border-b border-nrl-border bg-nrl-panel-2 px-3 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">2026 Draw</div>
        <div className="mt-1 text-[10px] text-nrl-muted">
          {draw2026StripRows.length > 0
            ? `${draw2026StripRows.length} rounds${teamForDrawStrip ? ` · ${teamForDrawStrip}` : ""}`
            : "No draw available"}
        </div>
      </div>
      <div className="p-2">
        {draw2026StripRows.length === 0 ? (
          <div className="px-1 py-2 text-xs text-nrl-muted">
            {matchedLocalName
              ? "No 2026 draw found for this player yet."
              : "No local player-team match found for 2026 draw."}
          </div>
        ) : (
          <div className="space-y-2 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
            {draw2026StripRows.map((row) => (
              <div
                key={`draw-2026-sidebar-${row.round}`}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-2"
              >
                <div className="text-[9px] font-semibold text-nrl-muted">{`Rd ${row.round}`}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {row.isBye ? (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">
                        Bye
                      </span>
                    ) : row.opponentLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.opponentLogoUrl}
                        alt={`${row.opponent ?? "Opponent"} logo`}
                        className="h-7 w-7 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[10px] font-semibold text-nrl-text">
                        {row.opponent?.slice(0, 3) ?? "-"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] text-nrl-text">
                      {row.isBye ? "No game" : `${row.isHome ? "vs" : "@"} ${row.opponent ?? "-"}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
        <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3">
              <SearchableSelect
                label=""
                value={selectedFantasyName}
                options={playerSearchOptions}
                onChange={navigateToPlayer}
                placeholder="Search player..."
              />
            </div>
          </div>
        </section>

        {showOwnedCards ? (
          <div className="rounded-xl border border-[rgba(123,92,255,0.35)] bg-[linear-gradient(135deg,rgba(84,50,143,0.32),rgba(16,119,88,0.24))] p-2 shadow-[0_0_0_1px_rgba(0,245,138,0.05),0_16px_36px_rgba(8,10,18,0.28)] xl:min-w-[260px]">
            {hasFantasyPlotAccess ? (
              <Link
                href="/dashboard/fantasy/draft"
                className="inline-flex h-full min-h-[72px] w-full items-center justify-center rounded-md border border-[rgba(0,245,138,0.22)] bg-[#20284a] px-3 text-center text-[11px] font-semibold text-white transition-colors hover:border-nrl-accent hover:text-white xl:min-h-[100%]"
              >
                Draft / H2H Projection and Odds
              </Link>
            ) : (
              <Link
                href="/dashboard/fantasy/draft"
                className="flex h-full min-h-[72px] w-full items-center justify-center rounded-md border border-[rgba(0,245,138,0.22)] bg-[#20284a] px-4 py-3 text-center transition-colors hover:border-nrl-accent xl:min-h-[100%]"
              >
                <div className="text-[11px] font-semibold text-white">
                  Draft / H2H Projection and Odds
                </div>
              </Link>
            )}
          </div>
        ) : null}
      </div>

      {showOwnedCards ? (
        <section id="fantasy-all-players" className="scroll-mt-24 rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nrl-border bg-nrl-accent/10 px-3 py-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">All Players</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="min-w-[150px]">
                <Select
                  label=""
                  value={allPlayersPositionFilter}
                  options={["All Positions", ...POSITION_TABLES.map((position) => position.label)]}
                  onChange={setAllPlayersPositionFilter}
                />
              </div>
            </div>
          </div>
          <div className="h-[756px] overflow-y-auto overflow-x-auto sm:overflow-x-hidden">
            <table className="min-w-[800px] border-collapse text-left text-xs sm:min-w-0 sm:w-full sm:table-fixed">
              <thead>
                <tr>
                  <th
                    aria-label="Player photo"
                    className="sticky left-0 top-0 z-[4] w-11 min-w-11 max-w-11 border-b border-r border-nrl-border bg-nrl-panel px-1 py-2 sm:w-12 sm:min-w-12 sm:max-w-12"
                  />
                  {ALL_PLAYERS_BASE_COLUMNS.map((column) => {
                    const disabled = Boolean(column.proOnly && !hasFantasyPlotAccess)
                    const active = allPlayersSort.column === column.key
                    return (
                      <th
                        key={column.key}
                        className={`sticky top-0 z-[2] border-b border-r border-nrl-border bg-nrl-panel px-1.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted last:border-r-0 sm:px-3 ${getAllPlayersColumnWidthClass(column.key)} ${ALL_PLAYERS_MOBILE_HIDDEN_COLUMNS.has(column.key) ? "hidden sm:table-cell" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleAllPlayersSort(column.key, disabled)}
                          className={`inline-flex w-full items-center gap-1 whitespace-nowrap ${column.align === "right" ? "justify-center sm:justify-end" : column.align === "center" ? "justify-center" : "justify-start"} ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:text-nrl-accent"}`}
                          title={disabled ? "Pro unlocks projection and breakeven" : `Sort by ${column.label}`}
                        >
                          <span>{column.label}</span>
                          {active ? <span>{allPlayersSort.direction === "asc" ? "↑" : "↓"}</span> : null}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedAllPlayersTableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={ALL_PLAYERS_BASE_COLUMNS.length + 1}
                      className="px-3 py-6 text-center text-xs text-nrl-muted"
                    >
                      No {ALL_PLAYERS_STATS_YEAR} player stats available.
                    </td>
                  </tr>
                ) : (
                  sortedAllPlayersTableRows.map((row) => {
                    const thumbnailUrl = getPlayerThumbnailUrl(row.imageRow)
                    return (
                      <tr
                        key={row.player.id}
                        onClick={() => navigateToPlayer(row.player.name)}
                        className="h-9 cursor-pointer border-b border-nrl-border/60 transition-colors hover:bg-nrl-panel-2/70"
                      >
                        <td className="sticky left-0 z-[1] w-11 min-w-11 max-w-11 border-r border-nrl-border bg-nrl-panel px-1 py-1 sm:w-12 sm:min-w-12 sm:max-w-12">
                          <div className="mx-auto grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel-2 text-[9px] text-nrl-muted">
                            {thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumbnailUrl}
                                alt=""
                                className="h-full w-full object-cover object-top"
                                loading="lazy"
                              />
                            ) : (
                              <span>{getPlayerInitials(row.player.name)}</span>
                            )}
                          </div>
                        </td>
                        <td className="w-36 min-w-36 max-w-36 border-r border-nrl-border bg-nrl-panel px-1.5 py-1 text-xs font-semibold text-nrl-text sm:w-64 sm:min-w-64 sm:max-w-64 sm:px-2">
                          <span className="block min-w-0 truncate" title={row.player.name}>
                            {row.player.name}
                          </span>
                        </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-[10px] whitespace-nowrap text-nrl-muted sm:w-auto sm:px-3">
                        {row.player.positionLabel}
                      </td>
                      <td className={`w-20 min-w-20 max-w-20 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap sm:w-auto sm:px-3 ${getOwnershipDeltaClass(row.weeklyChange)}`}>
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("weeklyChange")}`}>
                          {formatOwnershipDelta(row.weeklyChange)}
                        </span>
                      </td>
                      <td className="w-20 min-w-20 max-w-20 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap text-nrl-accent sm:w-auto sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("ownPercent")}`}>
                          {formatPercent(row.player.ownedBy)}
                        </span>
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:w-auto sm:px-3">
                        {formatPrice(row.player.cost)}
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap text-nrl-accent sm:w-auto sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("avg2026")}`}>
                          {formatTableNumber(row.avg2026)}
                        </span>
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:w-auto sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("last3")}`}>
                          {formatTableNumber(row.last3)}
                        </span>
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:w-auto sm:px-3">
                        {formatTableNumber(row.ppm, 2)}
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:w-auto sm:px-3">
                        <span className={!hasFantasyPlotAccess ? "inline-block blur-[3px] select-none" : ""}>
                          {formatTableNumber(row.projection)}
                        </span>
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:w-auto sm:px-3">
                        <span className={!hasFantasyPlotAccess ? "inline-block blur-[3px] select-none" : ""}>
                          {formatTableNumber(row.breakeven)}
                        </span>
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-muted last:border-r-0 sm:w-auto sm:px-3">
                        {row.gamesPlayed || "-"}
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showPlayerDetails && selectedFantasyPlayer ? (
        <section ref={playerDetailsRef} id="fantasy-player-details" className="scroll-mt-24">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_252px] xl:items-start">
            <div className="min-w-0 space-y-4">
              <div className="relative overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel p-3">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(71,255,182,0.16),transparent_30%),radial-gradient(circle_at_82%_76%,rgba(129,92,255,0.18),transparent_34%),linear-gradient(135deg,rgba(13,21,44,0.18),rgba(13,21,44,0))]" />
                <div className="pointer-events-none absolute left-[10%] top-[18%] h-28 w-28 rounded-full bg-emerald-300/8 blur-3xl" />
                <div className="pointer-events-none absolute bottom-[8%] right-[14%] h-32 w-32 rounded-full bg-violet-400/10 blur-3xl" />
                <div className="relative z-[1] grid grid-cols-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
                  <div className="min-w-0 space-y-3 xl:order-2">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[0.7rem] font-bold leading-tight text-nrl-text sm:text-2xl">
                          {selectedFantasyPlayer.name}
                        </h2>
                        <span className="rounded-md bg-nrl-accent/15 px-1 py-0.5 text-[8px] font-semibold text-nrl-accent sm:px-2 sm:text-xs">
                          {formatPrice(selectedFantasyPlayer.cost)}
                        </span>
                        <span className="rounded-md border border-nrl-border bg-nrl-panel-2 px-1 py-0.5 text-[8px] text-nrl-muted sm:px-2 sm:text-xs">
                          {selectedFantasyPlayer.positionLabel}
                        </span>
                        {selectedFantasyPlayer.isBye ? (
                          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1 py-0.5 text-[8px] font-semibold text-amber-300 sm:px-2 sm:text-xs">
                            Bye
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[8px] sm:gap-3 sm:text-xs">
                        {latestLocalRow ? (
                          <span className="rounded-md border border-nrl-border bg-nrl-panel-2 px-1 py-0.5 text-nrl-muted sm:px-2 sm:py-1">
                            Team: {latestLocalRow.Team}
                          </span>
                        ) : null}
                        <span className="rounded-md border border-nrl-border bg-nrl-panel-2 px-1 py-0.5 text-nrl-muted sm:px-2 sm:py-1">
                          Status: {selectedFantasyPlayer.status ?? "N/A"}
                        </span>
                        {isLoadingStats ? (
                          <span className="rounded-md border border-nrl-accent/30 bg-nrl-accent/10 px-1 py-0.5 text-nrl-accent sm:px-2 sm:py-1">
                            Loading season data…
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className={`grid items-start gap-3 pt-4 sm:gap-4 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_15.25rem] xl:grid-cols-1 xl:gap-5 ${fantasyCardPlayerName ? "grid-cols-[minmax(0,1fr)_10.75rem] min-[420px]:grid-cols-[minmax(0,1fr)_11.5rem] sm:grid-cols-[minmax(0,1fr)_14.25rem]" : "grid-cols-1"}`}>
                      <div className="grid w-full auto-rows-fr grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                        <MetricCard compact mobileTight label="Price" value={formatPrice(selectedFantasyPlayer.cost)} />
                        <MetricCard compact mobileTight label="PPM" value={formatNumber(localPpm, 2)} />
                        <MetricCard
                          compact
                          mobileTight
                          label="Own %"
                          value={formatPercent(selectedFantasyPlayer.ownedBy)}
                          sublabel={
                            ownershipBaselineSnapshot
                              ? `Weekly ${formatOwnershipDelta(selectedOwnershipDelta)}`
                              : undefined
                          }
                        />
                        <MetricCard
                          compact
                          mobileTight
                          label="Priced At"
                          value={formatNumber(selectedFantasyPlayer.pricedAt, 0)}
                        />
                      </div>

                      {fantasyCardPlayerName ? (
                        <div className="flex self-start items-start justify-center sm:justify-end xl:hidden">
                          <div className="w-full max-w-[10.75rem] rounded-[1.05rem] bg-[linear-gradient(180deg,rgba(17,23,46,0.46),rgba(17,23,46,0.18))] shadow-[0_18px_40px_rgba(8,10,18,0.22)] min-[420px]:max-w-[11.5rem] sm:max-w-[14.25rem] sm:rounded-[1.2rem] lg:max-w-[15.25rem]">
                            <div className="relative">
                              <PlayerImageCard
                                playerName={fantasyCardPlayerName}
                                imageRow={fantasyCardImage}
                                teamLogoUrl={fantasyCardLogoUrl}
                                fantasyPosition={fantasyCardPosition}
                                compact
                                frameless
                                priority
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {fantasyCardPlayerName ? (
                    <div className="hidden items-center justify-center pt-2 xl:order-1 xl:flex xl:justify-center">
                      <div className="w-full max-w-[14.5rem] rounded-[1.2rem] bg-[linear-gradient(180deg,rgba(17,23,46,0.46),rgba(17,23,46,0.18))] shadow-[0_18px_40px_rgba(8,10,18,0.22)]">
                        <div className="relative">
                          <PlayerImageCard
                            playerName={fantasyCardPlayerName}
                            imageRow={fantasyCardImage}
                            teamLogoUrl={fantasyCardLogoUrl}
                            fantasyPosition={fantasyCardPosition}
                            frameless
                            priority
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">Filters</div>
                  <div className="text-[10px] text-nrl-muted">Applies to player game log and filtered analysis</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  <YearRangeSlider
                    label="Season"
                    value={selectedYears}
                    options={availableYears}
                    onChange={(years) => {
                      void handleYearsChange(years)
                    }}
                  />
                  <Select
                    label="Opponent"
                    value={opponentFilter}
                    options={["All Opponents", ...opponentOptions]}
                    onChange={setOpponentFilter}
                  />
                  <Select
                    label="Position"
                    value={positionFilter}
                    options={["All Positions", ...positionOptions]}
                    onChange={setPositionFilter}
                  />
                  <Select
                    label="Finals"
                    value={finalsMode}
                    options={["Yes", "No"]}
                    onChange={(value) => setFinalsMode(value as "Yes" | "No")}
                  />
                  <Select
                    label="Minutes Over"
                    value={minutesOverFilter}
                    options={[...MINUTES_FILTER_OPTIONS]}
                    onChange={setMinutesOverFilter}
                  />
                  <Select
                    label="Minutes Under"
                    value={minutesUnderFilter}
                    options={[...MINUTES_FILTER_OPTIONS]}
                    onChange={setMinutesUnderFilter}
                  />
                </div>

                {!hasLoginAccess ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="text-[10px] text-nrl-muted">Sign in to access pre-2025 seasons</div>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="cursor-pointer rounded border border-nrl-accent/45 px-2 py-0.5 text-[10px] font-semibold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/10"
                      >
                        Sign in
                      </button>
                    </SignInButton>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_auto]">
                  <SearchableSelect
                    label="Teammate"
                    value={teammate}
                    options={["None", ...teammateOptions]}
                    onChange={setTeammate}
                    placeholder="Filter by teammate..."
                    disabled={!matchedLocalName || !hasLoginAccess}
                  />
                  <Select
                    label="Teammate Position"
                    value={teammatePosition}
                    options={["All", ...teammatePositionOptions]}
                    onChange={setTeammatePosition}
                    disabled={!hasLoginAccess}
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
                      With / Without
                    </label>
                    <div className="flex min-h-[30px] items-center">
                      <PillRadio
                        options={["With", "Without"]}
                        value={teammateMode}
                        onChange={(value) => setTeammateMode(value as TeammateMode)}
                        disabled={teammate === "None" || !hasLoginAccess}
                      />
                    </div>
                  </div>
                </div>

                {!hasLoginAccess ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="text-[10px] text-nrl-muted">Sign in to unlock teammate filtering</div>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="cursor-pointer rounded border border-nrl-accent/45 px-2 py-0.5 text-[10px] font-semibold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/10"
                      >
                        Sign in
                      </button>
                    </SignInButton>
                  </div>
                ) : null}
              </div>

              <div
                className={`relative rounded-xl border p-4 ${analysisLocked ? "border-white/8 bg-white/[0.03]" : "border-nrl-border bg-nrl-panel"
                  }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={`text-xs font-bold uppercase tracking-wide ${analysisLocked ? "text-slate-400" : "text-nrl-accent"
                      }`}
                  >
                    Analysis
                  </div>
                  <div className={`text-xs ${analysisLocked ? "text-slate-500" : "text-nrl-muted"}`}>
                    Showing <span className="font-semibold text-nrl-text">{filteredRows.length}</span> games
                  </div>
                </div>
                <div className={analysisLocked ? "pointer-events-none select-none opacity-40" : undefined}>
                  <div className="mb-5 grid grid-cols-2 gap-4 sm:max-w-[520px] sm:gap-5">
                    <MetricCard
                      compact
                      label={selectedFantasyCoachRound != null ? `Round ${selectedFantasyCoachRound} Projection` : "Projection"}
                      value={formatNumber(selectedAdjustedProjection, 0)}
                      blurValue={analysisLocked}
                    />
                    <MetricCard
                      compact
                      label={selectedFantasyCoachRound != null ? `Round ${selectedFantasyCoachRound} Breakeven` : "Breakeven"}
                      value={formatNumber(selectedAdjustedBreakEven, 0)}
                      blurValue={analysisLocked}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2">
                    <FantasyPlotToggleButton
                      active={showRollingAveragePlot}
                      locked={analysisLocked}
                      onClick={() => setShowRollingAveragePlot((prev) => !prev)}
                      activeLabel="Hide Rolling Average Plot"
                      inactiveLabel="Show Rolling Average Plot"
                    />
                    <FantasyPlotToggleButton
                      active={showBaseUpsideBars}
                      locked={analysisLocked}
                      onClick={() => setShowBaseUpsideBars((prev) => !prev)}
                      activeLabel="Hide Base vs Upside"
                      inactiveLabel="Show Base vs Upside"
                    />
                    <FantasyPlotToggleButton
                      active={showOpponentHeatmap}
                      locked={analysisLocked}
                      onClick={() => setShowOpponentHeatmap((prev) => !prev)}
                      activeLabel="Hide Avg vs Opp Heatmap"
                      inactiveLabel="Show Avg vs Opp Heatmap"
                    />
                    <FantasyPlotToggleButton
                      active={showFantasyBoxPlot}
                      locked={analysisLocked}
                      onClick={() => setShowFantasyBoxPlot((prev) => !prev)}
                      activeLabel="Hide Fantasy Box Plot"
                      inactiveLabel="Show Fantasy Box Plot"
                    />
                    <FantasyPlotToggleButton
                      active={showStatVsFantasyPlot}
                      locked={analysisLocked}
                      onClick={() => setShowStatVsFantasyPlot((prev) => !prev)}
                      activeLabel="Hide Stat vs Fantasy Plot"
                      inactiveLabel="Show Stat vs Fantasy Plot"
                    />
                    {hasLoginAccess && teammate !== "None" ? (
                      <FantasyPlotToggleButton
                        active={showWithWithoutPlot}
                        locked={analysisLocked}
                        onClick={() => setShowWithWithoutPlot((prev) => !prev)}
                        activeLabel="Hide With vs Without Plot"
                        inactiveLabel="Show With vs Without Plot"
                      />
                    ) : null}
                    {showBaseUpsideBars ? (
                      <div className="flex items-center gap-2 text-[10px] text-nrl-muted">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-nrl-accent" />
                        <span>Base</span>
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-400" />
                        <span>Upside</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {!analysisLocked && showRollingAveragePlot && trendFilteredRows.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                        Rolling Average Plot
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-full max-w-[240px]">
                          <Select
                            label="Stat"
                            value={selectedRollingAverageStat}
                            options={ROLLING_AVERAGE_STAT_OPTIONS as string[]}
                            onChange={setSelectedRollingAverageStat}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                            Rolling Avg
                          </span>
                          <div className="flex items-center overflow-hidden rounded-md border border-nrl-border bg-nrl-panel">
                            {[3, 5, 10, 20].map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setSelectedRollingAverageWindow(option)}
                                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${selectedRollingAverageWindow === option
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
                    </div>
                    <FantasyGameLogTrendBrush
                      key={gameLogChartKey}
                      rows={chronologicalTrendRows}
                      defaultStartYear="2023"
                      headerTitle=""
                      mainChartClassName="w-full h-auto sm:h-[320px]"
                      rollingWindow={selectedRollingAverageWindow}
                      onRollingWindowChange={setSelectedRollingAverageWindow}
                      showInternalControls={false}
                      valueLabel={selectedRollingAverageStat}
                      primarySeriesLabel={selectedRollingAverageStat}
                      valueAccessor={rollingAverageValueAccessor}
                    />
                  </div>
                ) : null}

                {!analysisLocked && showOpponentHeatmap ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                        Average Fantasy vs Opponent
                      </div>
                    </div>
                    {opponentHeatmap.columns.length === 0 ? (
                      <div className="text-xs text-nrl-muted">No opponent data for current filters.</div>
                    ) : (
                      <div className="max-h-[24rem] overflow-auto">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr>
                              <th className="sticky left-0 z-20 border-b border-r border-nrl-border bg-nrl-panel-2 px-2 py-1 text-left text-[10px] uppercase tracking-wide text-nrl-muted">
                                Season
                              </th>
                              {opponentHeatmap.columns.map((column, colIndex) => (
                                <th
                                  key={`heat-head-${column.round ?? "x"}-${column.opponent ?? "bye"}-${colIndex}`}
                                  className={`border-b border-nrl-border px-2 py-1 text-center text-[10px] uppercase tracking-wide whitespace-nowrap ${column.isBye ? "text-amber-400/60" : "text-nrl-muted"}`}
                                >
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-[8px] font-semibold tracking-normal ${column.isBye ? "text-amber-400/70" : "text-nrl-accent"}`}>
                                      {column.round != null ? `R${column.round}` : "-"}
                                    </span>
                                    {column.isBye ? (
                                      <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-400/70">
                                        BYE
                                      </span>
                                    ) : (
                                      <span>{column.opponent ?? "-"}</span>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {opponentHeatmap.rows.map((row) => (
                              <tr key={`heat-row-${row.label}`} className="border-t border-nrl-border/60">
                                <th className="sticky left-0 z-10 border-r border-nrl-border bg-nrl-panel-2 px-2 py-1 text-left text-[10px] font-semibold text-nrl-text whitespace-nowrap">
                                  {row.label}
                                </th>
                                {row.cells.map((cell, index) => {
                                  const col = opponentHeatmap.columns[index]
                                  const isByeCol = col?.isBye ?? false
                                  return (
                                    <td
                                      key={`heat-cell-${row.label}-${col?.round ?? "x"}-${col?.opponent ?? "bye"}-${index}`}
                                      className={`min-w-[74px] border-l border-nrl-border/60 px-2 py-1.5 text-center ${isByeCol ? "bg-amber-400/5" : ""}`}
                                      style={
                                        isByeCol || cell.average === null
                                          ? undefined
                                          : { backgroundColor: getHeatColorForAverage(cell.average) }
                                      }
                                    >
                                      {isByeCol ? (
                                        <span className="text-[9px] font-semibold tracking-wider text-amber-400/50">BYE</span>
                                      ) : cell.average === null ? (
                                        <span className="text-[10px] text-nrl-muted">-</span>
                                      ) : (
                                        <div>
                                          <div className="text-xs font-semibold text-nrl-text">{cell.average.toFixed(1)}</div>
                                          <div className="text-[9px] text-nrl-muted">n={cell.games}</div>
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}

                {!analysisLocked && showFantasyBoxPlot ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                        Fantasy Score Box Plot
                      </div>
                      <div className="text-[10px] text-nrl-muted">Selected years</div>
                    </div>
                    {fantasyBoxPlotRows.length === 0 ? (
                      <div className="text-xs text-nrl-muted">No fantasy scores for current filters.</div>
                    ) : (
                      <div className="space-y-3">
                        {fantasyBoxPlotRows.map((row) => {
                          const range = Math.max(1, fantasyBoxPlotRange.max - fantasyBoxPlotRange.min)
                          const scale = (value: number) =>
                            FANTASY_BOX_PLOT_PAD_PCT +
                            ((value - fantasyBoxPlotRange.min) / range) * (100 - FANTASY_BOX_PLOT_PAD_PCT * 2)
                          return (
                            <div key={`box-${row.label}`} className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                              <div className="text-xs">
                                <div className="font-semibold text-nrl-text">{row.label}</div>
                                <div className="text-[10px] text-nrl-muted">n={row.values.length}</div>
                                <div className="mt-2 space-y-1 text-[10px] leading-none">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="uppercase tracking-wide text-nrl-muted/80">Low</span>
                                    <span className="font-medium text-nrl-muted">{row.min.toFixed(1)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="uppercase tracking-wide text-nrl-muted/80">Median</span>
                                    <span className="font-medium text-nrl-text">{row.median.toFixed(1)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="uppercase tracking-wide text-nrl-muted/80">High</span>
                                    <span className="font-medium text-nrl-muted">{row.max.toFixed(1)}</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <svg
                                  viewBox="0 0 100 28"
                                  preserveAspectRatio="none"
                                  className="h-9 w-full overflow-visible"
                                >
                                  <line
                                    x1={scale(row.min)}
                                    x2={scale(row.max)}
                                    y1="14"
                                    y2="14"
                                    stroke="rgba(154,164,191,0.9)"
                                    strokeWidth="1.3"
                                  />
                                  <line
                                    x1={scale(row.min)}
                                    x2={scale(row.min)}
                                    y1="8"
                                    y2="20"
                                    stroke="rgba(154,164,191,0.9)"
                                    strokeWidth="1.3"
                                  />
                                  <line
                                    x1={scale(row.max)}
                                    x2={scale(row.max)}
                                    y1="8"
                                    y2="20"
                                    stroke="rgba(154,164,191,0.9)"
                                    strokeWidth="1.3"
                                  />
                                  <rect
                                    x={scale(row.q1)}
                                    y="6"
                                    width={Math.max(1.5, scale(row.q3) - scale(row.q1))}
                                    height="16"
                                    rx="1.5"
                                    fill="rgba(0,245,138,0.18)"
                                    stroke="rgba(0,245,138,0.9)"
                                    strokeWidth="1.3"
                                  />
                                  <line
                                    x1={scale(row.median)}
                                    x2={scale(row.median)}
                                    y1="5"
                                    y2="23"
                                    stroke="rgba(255,255,255,0.95)"
                                    strokeWidth="1.5"
                                  />
                                </svg>
                              </div>
                            </div>
                          )
                        })}
                        <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3 pt-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                            Score
                          </div>
                          <div className="relative h-8">
                            <div
                              className="absolute top-2 border-t border-nrl-border"
                              style={{
                                left: `${FANTASY_BOX_PLOT_PAD_PCT}%`,
                                right: `${FANTASY_BOX_PLOT_PAD_PCT}%`,
                              }}
                            />
                            <div
                              className="absolute top-0 h-4 border-l border-nrl-border"
                              style={{ left: `${FANTASY_BOX_PLOT_PAD_PCT}%` }}
                            />
                            <div className="absolute left-1/2 top-0 h-4 -translate-x-1/2 border-l border-nrl-border" />
                            <div
                              className="absolute top-0 h-4 border-l border-nrl-border"
                              style={{ left: `${100 - FANTASY_BOX_PLOT_PAD_PCT}%` }}
                            />
                            <div
                              className="absolute top-4 -translate-x-1/2 text-[10px] text-nrl-muted"
                              style={{ left: `${FANTASY_BOX_PLOT_PAD_PCT}%` }}
                            >
                              {fantasyBoxPlotRange.min.toFixed(0)}
                            </div>
                            <div className="absolute left-1/2 top-4 -translate-x-1/2 text-[10px] text-nrl-muted">
                              {((fantasyBoxPlotRange.min + fantasyBoxPlotRange.max) / 2).toFixed(0)}
                            </div>
                            <div
                              className="absolute top-4 -translate-x-1/2 text-[10px] text-nrl-muted"
                              style={{ left: `${100 - FANTASY_BOX_PLOT_PAD_PCT}%` }}
                            >
                              {fantasyBoxPlotRange.max.toFixed(0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {!analysisLocked && showStatVsFantasyPlot ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                        Stat vs Fantasy
                      </div>
                      <div className="text-[10px] text-nrl-muted">All years</div>
                    </div>
                    <div className="mb-3 max-w-[220px]">
                      <Select
                        label="Stat"
                        value={selectedStatVsFantasyLabel}
                        options={STAT_VS_FANTASY_OPTIONS.map((option) => option.label)}
                        onChange={(value) => setSelectedStatVsFantasyLabel(value as StatVsFantasyOptionLabel)}
                      />
                    </div>
                    <ScatterCorrelation
                      rows={trendFilteredRows}
                      statX={selectedStatVsFantasyOption.key}
                      statY="Fantasy"
                      title={`Fantasy ${selectedStatVsFantasyOption.label} vs Score`}
                    />
                  </div>
                ) : null}

                {!analysisLocked && showWithWithoutPlot && hasLoginAccess && teammate !== "None" ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                        With vs Without {teammate}
                      </div>
                      <div className="text-[10px] text-nrl-muted">
                        Fantasy score distribution across current filters
                      </div>
                    </div>
                    {withWithoutFantasyPlotData.withValues.length === 0 ||
                      withWithoutFantasyPlotData.withoutValues.length === 0 ? (
                      <div className="text-xs text-nrl-muted">
                        Need games in both teammate states to draw this plot.
                      </div>
                    ) : (
                      <WithWithoutKDE
                        title={`Fantasy: With vs Without ${teammate}`}
                        stat="Fantasy Score"
                        withValues={withWithoutFantasyPlotData.withValues}
                        withoutValues={withWithoutFantasyPlotData.withoutValues}
                      />
                    )}
                  </div>
                ) : null}

                {analysisLocked ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                    <BillingPageLink
                      className="rounded-[1rem] bg-[linear-gradient(135deg,rgba(141,99,255,0.95),rgba(0,245,138,0.95))] p-[1px] shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]"
                    >
                      <div className="rounded-[calc(1rem-1px)] bg-slate-950/80 px-4 py-3 text-center backdrop-blur-[2px]">
                        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-100">
                          Sign Up To Pro
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Unlock projections, breakevens and plots.
                        </div>
                      </div>
                    </BillingPageLink>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
                <div className="border-b border-nrl-border bg-nrl-panel-2 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">
                    Player Game Log
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table
                    className="table-fixed border-collapse"
                    style={{
                      minWidth: `${GAME_LOG_COLUMNS.reduce(
                        (sum, column) => sum + getGameLogColumnWidthPx(column.key),
                        0
                      ) + (showBaseUpsideBars ? GAME_LOG_BASE_UPSIDE_COLUMN_WIDTH_PX : 0)}px`,
                    }}
                  >
                    <colgroup>
                      {GAME_LOG_COLUMNS.map((column) => (
                        <Fragment key={column.key}>
                          {showBaseUpsideBars && column.key === "Fantasy" ? (
                            <col style={{ width: `${GAME_LOG_BASE_UPSIDE_COLUMN_WIDTH_PX}px` }} />
                          ) : null}
                          <col
                            style={{ width: `${getGameLogColumnWidthPx(column.key)}px` }}
                          />
                        </Fragment>
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-nrl-panel">
                        {GAME_LOG_COLUMNS.map((column) => (
                          <Fragment key={column.key}>
                            {showBaseUpsideBars && column.key === "Fantasy" ? (
                              <th className="sticky top-0 z-10 border-b border-nrl-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-normal text-nrl-muted whitespace-nowrap">
                                Base vs Upside
                              </th>
                            ) : null}
                            <th
                              className={`sticky top-0 z-10 border-b border-nrl-border py-2 text-[10px] font-semibold uppercase tracking-normal text-nrl-muted whitespace-nowrap ${getGameLogCellPaddingClass(column.key)
                                } ${column.align === "right" ? "text-right" : "text-left"
                                }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleGameLogSort(column.key)}
                                className={`flex w-full items-center gap-1 ${column.align === "right" ? "justify-end" : "justify-start"
                                  } hover:text-nrl-text ${gameLogSort?.column === column.key ? "text-nrl-accent" : ""
                                  }`}
                                title={`Sort by ${column.label}`}
                              >
                                <span>{column.label}</span>
                              </button>
                            </th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFilteredRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={GAME_LOG_COLUMNS.length + (showBaseUpsideBars ? 1 : 0)}
                            className="px-4 py-6 text-sm text-nrl-muted"
                          >
                            No games matched the current filters.
                          </td>
                        </tr>
                      ) : (
                        <>
                          <tr className="border-b border-nrl-accent/25 bg-nrl-panel-2/60">
                            {GAME_LOG_COLUMNS.map((column, index) => {
                              const avg = gameLogAverages[column.key] ?? null
                              const display =
                                index === 0
                                  ? "Averages"
                                  : avg === null
                                    ? "-"
                                    : avg.toFixed(1)
                              const isFantasy = column.key === "Fantasy"

                              return (
                                <Fragment key={column.key}>
                                  {showBaseUpsideBars && column.key === "Fantasy" ? (
                                    <td className="px-3 py-2 text-xs">
                                      {averageBaseUpsideSplit ? (
                                        (() => {
                                          const barPercentages = getScaledBaseUpsideBarWidths(
                                            averageBaseUpsideSplit,
                                            maxFantasyPointsForBaseUpsideBars
                                          )
                                          return (
                                            <div>
                                              <div className="flex h-2 w-full overflow-hidden rounded-sm border border-nrl-border bg-nrl-panel">
                                                <div
                                                  className="bg-nrl-accent"
                                                  style={{ width: `${barPercentages.basePct}%` }}
                                                />
                                                <div
                                                  className={
                                                    averageBaseUpsideSplit.upsidePoints < 0
                                                      ? "bg-rose-500"
                                                      : "bg-violet-400"
                                                  }
                                                  style={{ width: `${barPercentages.upsidePct}%` }}
                                                />
                                              </div>
                                              <div className="mt-1 flex items-center justify-between gap-2 whitespace-nowrap text-[10px] text-nrl-muted">
                                                <span>{averageBaseUpsideSplit.basePoints.toFixed(1)}</span>
                                                <span
                                                  className={
                                                    averageBaseUpsideSplit.upsidePoints < 0
                                                      ? "text-rose-400"
                                                      : undefined
                                                  }
                                                >
                                                  {averageBaseUpsideSplit.upsidePoints.toFixed(1)}
                                                </span>
                                              </div>
                                            </div>
                                          )
                                        })()
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                  ) : null}
                                  <td
                                    className={`py-2 text-xs font-semibold whitespace-nowrap ${getGameLogCellPaddingClass(column.key)
                                      } ${column.align === "right" ? "text-right" : "text-left"
                                      } ${isFantasy ? "text-nrl-accent" : "text-nrl-muted"}`}
                                  >
                                    {display}
                                  </td>
                                </Fragment>
                              )
                            })}
                          </tr>
                          {sortedFilteredRows.map((row, index) => (
                            <tr key={`${row.Year}-${row.Round}-${index}`} className="border-t border-nrl-border/60">
                              {GAME_LOG_COLUMNS.map((column) => {
                                const display = getGameLogCellDisplay(row, column.key)
                                const isFantasy = column.key === "Fantasy"

                                return (
                                  <Fragment key={column.key}>
                                    {showBaseUpsideBars && column.key === "Fantasy" ? (
                                      <td className="px-3 py-2 text-xs">
                                        {(() => {
                                          const split = getBaseUpsideSplit(row)
                                          const barPercentages = getScaledBaseUpsideBarWidths(
                                            split,
                                            maxFantasyPointsForBaseUpsideBars
                                          )
                                          return (
                                            <div>
                                              <div className="flex h-2 w-full overflow-hidden rounded-sm border border-nrl-border bg-nrl-panel">
                                                <div
                                                  className="bg-nrl-accent"
                                                  style={{ width: `${barPercentages.basePct}%` }}
                                                />
                                                <div
                                                  className={split.upsidePoints < 0 ? "bg-rose-500" : "bg-violet-400"}
                                                  style={{ width: `${barPercentages.upsidePct}%` }}
                                                />
                                              </div>
                                              <div className="mt-1 flex items-center justify-between gap-2 whitespace-nowrap text-[10px] text-nrl-muted">
                                                <span>{split.basePoints.toFixed(0)}</span>
                                                <span className={split.upsidePoints < 0 ? "text-rose-400" : undefined}>
                                                  {split.upsidePoints.toFixed(0)}
                                                </span>
                                              </div>
                                            </div>
                                          )
                                        })()}
                                      </td>
                                    ) : null}
                                    <td
                                      className={`py-2 text-xs whitespace-nowrap ${getGameLogCellPaddingClass(column.key)
                                        } ${column.align === "right" ? "text-right" : "text-left"
                                        } ${isFantasy ? "font-semibold text-nrl-accent" : "text-nrl-text"}`}
                                    >
                                      {display}
                                    </td>
                                  </Fragment>
                                )
                              })}
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="xl:sticky xl:top-24">{draw2026Panel}</div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

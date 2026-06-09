"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent, type PointerEvent } from "react"
import { useRouter } from "next/navigation"
import { SignInButton, useAuth, useUser } from "@clerk/nextjs"
import type { PlayerStat, TeammateLookupRow } from "@/lib/data/types"
import type { FantasyGameLogTrendBrushProps } from "@/components/charts/fantasy-game-log-trend-brush"
import type { Draw2026Data } from "@/lib/draw/types"
import type {
  FantasyCoachPlayerSnapshot,
  FantasyOwnershipBaselineSnapshot,
  FantasyPlayerSnapshot,
  FantasyProjectionSigma,
  LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import { PLAYER_STATS } from "@/lib/data/constants"
import type { CasualtyWardRecord, FantasyPlayerCardSummary, OriginChanceRecord, PlayerImageRecord } from "@/lib/supabase/queries"
import {
  applyFantasyBreakEvenOffset,
  FANTASY_POSITION_MAP,
  getFantasyCoachRoundMetrics,
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
import { MultiSelect } from "@/components/ui/multi-select"
import { PillRadio } from "@/components/ui/pill-radio"
import { YearRangeSlider } from "@/components/ui/year-range-slider"
import { BillingPageLink } from "@/components/billing/billing-page-link"
import { FantasyBackLink } from "@/components/fantasy/fantasy-back-link"
import {
  PlayerImageCard,
  primaryTeamForRows,
  resolvePlayerImage,
  resolveTeamLogoUrl,
} from "@/components/views/player-comparison"
import { linearRegression, pearsonR } from "@/lib/data/stats"

const LazyChartFallback = () => (
  <div className="grid min-h-[220px] place-items-center rounded-lg border border-nrl-border bg-nrl-panel-2 text-xs text-nrl-muted">
    Loading chart…
  </div>
)

const FantasyGameLogTrendBrush = dynamic(
  () => import("@/components/charts/fantasy-game-log-trend-brush").then((mod) => mod.FantasyGameLogTrendBrush),
  { loading: LazyChartFallback }
) as ComponentType<FantasyGameLogTrendBrushProps<PlayerStat>>
const WithWithoutKDE = dynamic(
  () => import("@/components/charts/with-without-kde").then((mod) => mod.WithWithoutKDE),
  { loading: LazyChartFallback }
)
const ScatterCorrelation = dynamic(
  () => import("@/components/charts/scatter-correlation").then((mod) => mod.ScatterCorrelation),
  { loading: LazyChartFallback }
)
const PlayerComments = dynamic(
  () => import("@/components/fantasy/player-comments").then((mod) => mod.PlayerComments),
  {
    loading: () => (
      <div className="rounded-xl border border-nrl-border bg-[#111832] p-4 text-xs text-nrl-muted">
        Loading comments…
      </div>
    ),
  }
)

interface FantasyArticleLink {
  title: string
  slug: string
  imageUrls: string[]
}

type TradeScreenshotSlot = "starters" | "bench" | "trade"

interface FantasyTradeScreenshot {
  id: string
  slot: TradeScreenshotSlot
  name: string
  mediaType: "image/jpeg" | "image/png" | "image/webp"
  dataUrl: string
}

interface FantasyTradeSuggestorResponse {
  status: string
  assistantMessage?: string
  error?: string
}

interface FantasyDashboardProps {
  fantasyPlayers: FantasyPlayerSnapshot[]
  fantasyCoachPlayers?: FantasyCoachPlayerSnapshot[]
  lineupsProjections?: LineupsProjectionSnapshot
  fantasyProjectionSigmas?: FantasyProjectionSigma[]
  ownershipBaselineSnapshot?: FantasyOwnershipBaselineSnapshot | null
  casualtyWardRows?: CasualtyWardRecord[]
  relevantOuts?: CasualtyWardRecord[]
  relevantOutCandidates?: CasualtyWardRecord[]
  originChances?: OriginChanceRecord[]
  availableYears: string[]
  defaultYears: string[]
  initialPlayerStats: PlayerStat[]
  initialAllPlayerStats?: PlayerStat[]
  precomputedAllPlayersRows?: FantasyPlayerCardSummary[]
  precomputedAllPlayersRowsArePreview?: boolean
  playerImages?: PlayerImageRecord[]
  teamLogos?: Record<string, string>
  preloadedPlayerAllYears?: boolean
  preloadSelectedPlayerAllYears?: boolean
  draw2026Data?: Draw2026Data | null
  initialSelectedFantasyName?: string
  showOwnedCards?: boolean
  showFantasyActions?: boolean
  showAllPlayersOnly?: boolean
  showFantasyAnalyticsOnly?: boolean
  showPlayerDetails?: boolean
  showPlayerComments?: boolean
  initialShowFantasyAnalytics?: boolean
  playerRouteBasePath?: string
  canAccessLoginSeason?: boolean
  canBypassPlotGate?: boolean
  fantasyProjectionArticle?: FantasyArticleLink | null
}

type TeammateMode = "With" | "Without"
type GameLogSortDirection = "asc" | "desc"
type AllPlayersSortDirection = "asc" | "desc"
type FantasyAnalyticsMetric = "projection" | "last3" | "avg2026"
type LockedPreviewPlot = "rolling" | "projectionRange" | "box" | "stat" | "heatmap" | "baseUpside"
type FantasyTemplateMode = "ownership" | "change"
type AllPlayersSortKey =
  | "name"
  | "position"
  | "weeklyChange"
  | "ownPercent"
  | "price"
  | "pricedAt"
  | "avg2026"
  | "last3"
  | "ppm"
  | "projection"
  | "value"
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

interface ProjectionDistributionData {
  mean: number
  sigma: number
  lower: number
  upper: number
}

const PROJECTION_RANGE_TAIL_PERCENT = 5
const PROJECTION_RANGE_Z_SCORE = 1.6448536269514722

interface AllPlayersTableRow {
  player: FantasyPlayerSnapshot
  localName: string | null
  imageRow: PlayerImageRecord | null
  avg2026: number | null
  last3: number | null
  ppm: number | null
  pricedAt: number | null
  projection: number | null
  value: number | null
  breakeven: number | null
  weeklyChange: number | null
  relevantOuts: CasualtyWardRecord[]
  majorByeRoundTags: MajorByeRoundTag[]
  nextMajorByeRound: number | null
  playsNextMajorBye: boolean | null
  originChance: boolean
  gamesPlayed: number
}

interface FantasyAnalyticsPoint {
  name: string
  position: string
  positionLabels: string[]
  tagFilters: string[]
  imageUrl: string | null
  team: string | null
  price: number | null
  pricedAt: number | null
  avg2026: number | null
  last3: number | null
  breakeven: number | null
  projection: number | null
}

interface FantasyAnalyticsDragState {
  pointerId: number
  startX: number
  startY: number
  panX: number
  panY: number
}

interface FantasyTemplateSlot {
  slot: string
  row: AllPlayersTableRow | null
}

interface GlobalStatVsFantasyPoint {
  name: string
  position: string
  positionLabels: string[]
  tagFilters: string[]
  imageUrl: string | null
  team: string | null
  price: number | null
  statValue: number
  fantasyAvg: number
}

const STAT_VS_FANTASY_OPTIONS = [
  { label: "Run Metres", key: "All Run Metres", rawKey: "all_run_metres" },
  { label: "Tackles", key: "Tackles Made", rawKey: "tackles_made" },
  { label: "Kick Metres", key: "Kicking Metres", rawKey: "kicking_metres" },
  { label: "Minutes", key: "Mins Played", rawKey: "mins_played" },
  { label: "Try Assists", key: "Try Assists", rawKey: "try_assists" },
  { label: "Line Breaks", key: "Line Breaks", rawKey: "line_breaks" },
  { label: "Line Break Assists", key: "Line Break Assists", rawKey: "line_break_assists" },
  { label: "Tackle Breaks", key: "Tackle Breaks", rawKey: "tackle_breaks" },
  { label: "Offloads", key: "Offloads", rawKey: "offloads" },
  { label: "Tries", key: "Tries", rawKey: "tries" },
] as const

type StatVsFantasyOptionLabel = (typeof STAT_VS_FANTASY_OPTIONS)[number]["label"]
type StatVsFantasyOption = (typeof STAT_VS_FANTASY_OPTIONS)[number]
const ROLLING_AVERAGE_STAT_OPTIONS = PLAYER_STATS as readonly string[]

const HEATMAP_LOW_SCORE = 20
const HEATMAP_MID_SCORE = 45
const HEATMAP_HIGH_SCORE = 75
const FANTASY_BOX_PLOT_PAD_PCT = 6
const FANTASY_ANALYTICS_MIN_ZOOM = 1
const FANTASY_ANALYTICS_MAX_ZOOM = 8
const FANTASY_ANALYTICS_ZOOM_STEP = 0.25
const FANTASY_ANALYTICS_POSITION_OPTIONS = ["All Positions", "HOK", "MID", "EDG", "HLF", "CTR", "WFB"]
const FANTASY_POSITION_COLORS: Record<string, string> = {
  HOK: "rgba(0,245,138,0.82)",
  MID: "rgba(96,165,250,0.82)",
  EDG: "rgba(251,191,36,0.82)",
  HLF: "rgba(248,113,113,0.82)",
  CTR: "rgba(192,132,252,0.82)",
  WFB: "rgba(45,212,191,0.82)",
}
const FANTASY_ANALYTICS_METRICS: Array<{ key: FantasyAnalyticsMetric; label: string; shortLabel: string }> = [
  { key: "projection", label: "Projection", shortLabel: "Proj" },
  { key: "last3", label: "Last 3 Avg", shortLabel: "L3" },
  { key: "avg2026", label: "Season Avg", shortLabel: "Season" },
]
const FANTASY_TEMPLATE_ROWS: Array<{ label: string; slots: string[] }> = [
  { label: "HOK", slots: ["HOK"] },
  { label: "MID", slots: ["MID", "MID", "MID"] },
  { label: "EDG", slots: ["EDG", "EDG"] },
  { label: "HLF", slots: ["HLF", "HLF"] },
  { label: "CTR", slots: ["CTR", "CTR"] },
  { label: "WFB", slots: ["WFB", "WFB", "WFB"] },
]
const FANTASY_TEMPLATE_MODES: Array<{ key: FantasyTemplateMode; label: string }> = [
  { key: "change", label: "Weekly Deltas" },
  { key: "ownership", label: "Total Ownership" },
]
const FANTASY_FILTER_TAG_ORIGIN_CHANCE = "Origin"
const FANTASY_DASHBOARD_STATE_STORAGE_KEY = "fantasy-dashboard-ui-state-v1"
const FANTASY_DASHBOARD_STATE_TTL_MS = 30 * 60 * 1000
const FANTASY_CARD_TAGS_STORAGE_KEY_PREFIX = "fantasy-card-tags-visible"
const PRO_PRICE_LABEL = "$5/month"
const PRO_UNLOCK_COPY = `Pro ${PRO_PRICE_LABEL}`
const FANTASY_LOCKED_VALUE_BOX_CLASS =
  "inline-flex h-5 w-12 items-center justify-center rounded border border-nrl-border/60 bg-[#1c2544]/65 text-slate-100"
const FANTASY_LOCKED_VALUE_TEXT_CLASS = "blur-[7px] opacity-55 select-none"
const FANTASY_LOCKED_METRIC_TEXT_CLASS = "select-none blur-[9px] opacity-50"

interface MajorByeRoundTag {
  round: number
  plays: boolean | null
}

interface FantasyDashboardPersistedState {
  allPlayersView?: "cards" | "table"
  allPlayersPositionFilter?: string
  allPlayersTagFilters?: string[]
  allPlayersSort?: {
    column?: AllPlayersSortKey
    direction?: AllPlayersSortDirection
  }
  fantasyAnalyticsMetric?: FantasyAnalyticsMetric
  fantasyAnalyticsPositionFilter?: string
  selectedGlobalStatVsFantasyLabel?: StatVsFantasyOptionLabel
  globalStatVsFantasyPositionFilter?: string
  fantasyTemplateMode?: FantasyTemplateMode
}

const STATIC_LOCKED_PREVIEW_TREND_ROWS = [
  { Year: "2025", Round: 1, Round_Label: "1", Opponent: "BRI", Fantasy: 43, "All Run Metres": 112 },
  { Year: "2025", Round: 2, Round_Label: "2", Opponent: "MEL", Fantasy: 57, "All Run Metres": 138 },
  { Year: "2025", Round: 3, Round_Label: "3", Opponent: "PEN", Fantasy: 49, "All Run Metres": 126 },
  { Year: "2025", Round: 4, Round_Label: "4", Opponent: "SYD", Fantasy: 64, "All Run Metres": 152 },
  { Year: "2025", Round: 5, Round_Label: "5", Opponent: "NQL", Fantasy: 58, "All Run Metres": 147 },
  { Year: "2025", Round: 6, Round_Label: "6", Opponent: "CAN", Fantasy: 72, "All Run Metres": 168 },
  { Year: "2025", Round: 7, Round_Label: "7", Opponent: "MAN", Fantasy: 61, "All Run Metres": 156 },
  { Year: "2025", Round: 8, Round_Label: "8", Opponent: "CRO", Fantasy: 78, "All Run Metres": 181 },
  { Year: "2025", Round: 9, Round_Label: "9", Opponent: "NEW", Fantasy: 69, "All Run Metres": 172 },
  { Year: "2025", Round: 10, Round_Label: "10", Opponent: "WST", Fantasy: 81, "All Run Metres": 196 },
] as unknown as PlayerStat[]
const STATIC_LOCKED_PREVIEW_BOX_ROWS: FantasyBoxPlotRow[] = [
  { label: "All", values: [34, 46, 55, 62, 73, 88], min: 34, q1: 48, median: 60, q3: 72, max: 88 },
  { label: "2026", values: [41, 52, 59, 69, 83], min: 41, q1: 53, median: 62, q3: 74, max: 83 },
  { label: "2025", values: [32, 44, 51, 61, 76], min: 32, q1: 45, median: 55, q3: 66, max: 76 },
]
const STATIC_LOCKED_PREVIEW_PROJECTION_RANGE: ProjectionDistributionData = {
  mean: 48,
  sigma: 14,
  lower: 48 - 14 * PROJECTION_RANGE_Z_SCORE,
  upper: 48 + 14 * PROJECTION_RANGE_Z_SCORE,
}
const STATIC_LOCKED_PREVIEW_BASE_UPSIDE_ROWS = {
  maxFantasy: 90,
  rows: [
    { label: "Sample 1", split: { basePoints: 42, upsidePoints: 18, fantasyPoints: 60 } },
    { label: "Sample 2", split: { basePoints: 51, upsidePoints: 24, fantasyPoints: 75 } },
    { label: "Sample 3", split: { basePoints: 38, upsidePoints: 9, fantasyPoints: 47 } },
    { label: "Sample 4", split: { basePoints: 57, upsidePoints: 14, fantasyPoints: 71 } },
  ],
}
const STATIC_LOCKED_PREVIEW_OPPONENT_HEATMAP = [
  { opponent: "BRI", average: 72, games: 4 },
  { opponent: "MEL", average: 64, games: 5 },
  { opponent: "PEN", average: 58, games: 4 },
  { opponent: "SYD", average: 81, games: 3 },
  { opponent: "NQL", average: 46, games: 5 },
  { opponent: "CAN", average: 67, games: 4 },
  { opponent: "MAN", average: 53, games: 3 },
  { opponent: "CRO", average: 76, games: 4 },
]
const STATIC_LOCKED_PREVIEW_PLOTS: LockedPreviewPlot[] = ["rolling", "projectionRange", "box", "stat", "heatmap", "baseUpside"]
const TRADE_SCREENSHOT_SLOTS: Array<{ key: TradeScreenshotSlot; label: string; hint: string }> = [
  { key: "starters", label: "Starters", hint: "Selected 13 / field view" },
  { key: "bench", label: "Bench", hint: "Interchange + emergencies" },
  { key: "trade", label: "Trade screen", hint: "Bank, trades, prices" },
]
const TRADE_SUGGESTOR_MAX_IMAGE_DATA_URL_LENGTH = 650_000

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
const GAME_LOG_COLLAPSED_VISIBLE_ROWS = 5
const GAME_LOG_COLLAPSED_MAX_HEIGHT_PX = 260
const GAME_LOG_COLLAPSED_BASE_UPSIDE_MAX_HEIGHT_PX = 356
const ALL_PLAYERS_STATS_YEAR = "2026"
const ALL_PLAYERS_PREVIEW_LIMIT = 20

const ALL_PLAYERS_MOBILE_HIDDEN_COLUMNS = new Set<AllPlayersSortKey>()

const ALL_PLAYERS_BASE_COLUMNS: Array<{ key: AllPlayersSortKey; label: string; align?: "left" | "center" | "right"; proOnly?: boolean }> = [
  { key: "name", label: "Player", align: "left" },
  { key: "position", label: "Pos", align: "center" },
  { key: "weeklyChange", label: "Weekly", align: "center" },
  { key: "ownPercent", label: "Own %", align: "center" },
  { key: "price", label: "Price", align: "center" },
  { key: "pricedAt", label: "Priced At", align: "center" },
  { key: "avg2026", label: "2026 Avg", align: "center" },
  { key: "last3", label: "Last 3", align: "center" },
  { key: "ppm", label: "PPM", align: "center" },
  { key: "projection", label: "Proj", align: "center", proOnly: true },
  { key: "value", label: "Value", align: "center", proOnly: true },
  { key: "breakeven", label: "BE", align: "center", proOnly: true },
  { key: "gamesPlayed", label: "Games", align: "center" },
]

const ALL_PLAYERS_MOBILE_SORT_OPTIONS: Array<{ key: AllPlayersSortKey; label: string; proOnly?: boolean }> = [
  { key: "weeklyChange", label: "Weekly" },
  { key: "ownPercent", label: "Own %" },
  { key: "price", label: "Price" },
  { key: "pricedAt", label: "Priced At" },
  { key: "avg2026", label: "2026 Avg" },
  { key: "last3", label: "Last 3" },
  { key: "ppm", label: "PPM" },
  { key: "projection", label: "Proj", proOnly: true },
  { key: "value", label: "Value", proOnly: true },
  { key: "breakeven", label: "BE", proOnly: true },
  { key: "gamesPlayed", label: "Games" },
]

function isAllPlayersSortKey(value: unknown): value is AllPlayersSortKey {
  return typeof value === "string" && ALL_PLAYERS_BASE_COLUMNS.some((column) => column.key === value)
}

function isAllPlayersSortDirection(value: unknown): value is AllPlayersSortDirection {
  return value === "asc" || value === "desc"
}

function isAllPlayersView(value: unknown): value is "cards" | "table" {
  return value === "cards" || value === "table"
}

function isFantasyAnalyticsMetric(value: unknown): value is FantasyAnalyticsMetric {
  return typeof value === "string" && FANTASY_ANALYTICS_METRICS.some((metric) => metric.key === value)
}

function isFantasyAnalyticsPosition(value: unknown): value is string {
  return typeof value === "string" && FANTASY_ANALYTICS_POSITION_OPTIONS.includes(value)
}

function isStatVsFantasyOptionLabel(value: unknown): value is StatVsFantasyOptionLabel {
  return typeof value === "string" && STAT_VS_FANTASY_OPTIONS.some((option) => option.label === value)
}

function isFantasyTemplateMode(value: unknown): value is FantasyTemplateMode {
  return typeof value === "string" && FANTASY_TEMPLATE_MODES.some((mode) => mode.key === value)
}

function parseFantasyDashboardPersistedState(raw: string | null): FantasyDashboardPersistedState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== "object") return null

    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : null
    if (!updatedAt || Date.now() - updatedAt > FANTASY_DASHBOARD_STATE_TTL_MS) return null

    const state = parsed.state
    return state && typeof state === "object" ? state as FantasyDashboardPersistedState : null
  } catch {
    return null
  }
}

function getAllPlayersColumnWidthClass(key: AllPlayersSortKey): string {
  switch (key) {
    case "name":
      return "w-[136px] min-w-[136px] max-w-[136px] sm:w-32 sm:min-w-32 sm:max-w-32"
    case "position":
      return "w-[72px] min-w-[72px] max-w-[72px] sm:w-[88px] sm:min-w-[88px] sm:max-w-[88px]"
    case "weeklyChange":
    case "ownPercent":
      return "w-20 min-w-20 max-w-20"
    case "price":
      return "w-16 min-w-16 max-w-16"
    case "pricedAt":
      return "w-16 min-w-16 max-w-16"
    case "avg2026":
    case "last3":
      return "w-16 min-w-16 max-w-16"
    case "ppm":
    case "projection":
    case "value":
    case "breakeven":
    case "gamesPlayed":
      return "w-14 min-w-14 max-w-14"
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
    case "pricedAt":
      return "min-w-[2.2rem]"
    case "value":
      return "min-w-[2.6rem]"
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

function playerStatYear(row: PlayerStat): string {
  const year = String(row.Year ?? "")
  if (year) return year
  const matchDate = String(row.match_date ?? "")
  if (!matchDate) return ""
  const parsedYear = new Date(matchDate).getFullYear()
  return Number.isFinite(parsedYear) ? String(parsedYear) : ""
}

function playerStatName(row: PlayerStat): string {
  return String(row.Name ?? row.player ?? "").trim()
}

function playerStatMetricValue(row: PlayerStat, key: string, rawKey?: string): number | null {
  return toFiniteNumber(row[key]) ?? (rawKey ? toFiniteNumber(row[rawKey]) : null)
}

function stableFallbackFantasyPlayerId(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = Math.imul(31, hash) + name.charCodeAt(index)
  }
  return -Math.abs(hash || name.length)
}

function fantasyPositionCodesFromLocalPosition(position: string | null | undefined): number[] {
  const group = relevantOutsPositionGroup(position)
  if (group === "hooker") return [1]
  if (group === "middle") return [2]
  if (group === "second-row") return [3]
  if (group === "halves") return [4]
  if (group === "centre") return [5]
  if (group === "fullback" || group === "wing") return [6]
  return []
}

function buildFallbackFantasyPlayersFromStats(rowsByName: Map<string, PlayerStat[]>): FantasyPlayerSnapshot[] {
  return Array.from(rowsByName.entries()).map(([name, rows]) => {
    const latestRow = [...rows].sort(sortRoundsDesc)[0] ?? null
    const positions = fantasyPositionCodesFromLocalPosition(latestRow?.Position)
    const positionLabels = positions.map((code) => FANTASY_POSITION_MAP[code] ?? `POS ${code}`)
    const fantasyScores = rows.map((row) => playerStatMetricValue(row, "Fantasy", "total_points"))
    return {
      id: stableFallbackFantasyPlayerId(name),
      firstName: name.split(/\s+/)[0] ?? name,
      lastName: name.split(/\s+/).slice(1).join(" "),
      name,
      squadId: null,
      cost: null,
      status: null,
      positions,
      positionLabels,
      positionLabel: positionLabels.join("/") || "POS",
      ownedBy: null,
      selections: null,
      avgPoints: averageNumbers(fantasyScores),
      projectedAvg: null,
      gamesPlayed: rows.length,
      totalPoints: fantasyScores.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      tog: null,
      be: null,
      pricedAt: null,
      isBye: false,
      locked: false,
      priceHistory: {},
      scoreHistory: {},
    }
  })
}

function hasAllPlayerStatsForYear(rows: PlayerStat[], year: string): boolean {
  const names = new Set(
    rows
      .filter((row) => playerStatYear(row) === year)
      .map(playerStatName)
      .filter(Boolean)
  )
  return names.size >= 50
}

function playerStatsApiUrl(years: string[], playerName?: string): string {
  const params = new URLSearchParams()
  if (years.length > 0) params.set("years", years.join(","))
  if (playerName) params.set("player", playerName)
  const query = params.toString()
  return query ? `/api/player-stats?${query}` : "/api/player-stats"
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

function buildInitialSurnamePlayerNameMap(playerNames: string[]): Map<string, string> {
  const namesByKey = new Map<string, Set<string>>()
  for (const name of playerNames) {
    const parsed = parseName(name)
    if (!parsed.first || !parsed.last) continue
    const key = `${parsed.first[0]} ${parsed.last}`
    const names = namesByKey.get(key) ?? new Set<string>()
    names.add(name)
    namesByKey.set(key, names)
  }

  const uniqueNames = new Map<string, string>()
  namesByKey.forEach((names, key) => {
    if (names.size !== 1) return
    const [name] = Array.from(names)
    uniqueNames.set(key, name)
  })
  return uniqueNames
}

function expandInitialSurnamePlayerNames(text: string, playerNames: string[]): string {
  const playerNameByInitialSurname = buildInitialSurnamePlayerNameMap(playerNames)
  if (playerNameByInitialSurname.size === 0) return text

  return text.replace(
    /\b([A-Z])\.?\s+([A-Z][A-Za-z'’.-]*(?:-[A-Z][A-Za-z'’.-]*)*)\b/gi,
    (match, initial, surname) => {
      const fullName = playerNameByInitialSurname.get(`${initial.toLowerCase()} ${normaliseName(surname)}`)
      return fullName ?? match
    }
  )
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

function normalisePositionForComparison(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/five[-\s]?eighth/g, "five eighth")
    .replace(/2nd/g, "second")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function projectionSigmaPositionKey(value: string | null | undefined): string | null {
  const normalised = normalisePositionForComparison(value)
  if (!normalised) return null
  if (["global", "__global__"].includes(normalised)) return "__global__"
  if (["bench", "interchange", "reserve", "replacement"].includes(normalised)) return "bench"
  if (["fullback", "fb"].includes(normalised)) return "fullback"
  if (["wing", "winger", "w"].includes(normalised)) return "winger"
  if (["centre", "center", "ctr"].includes(normalised)) return "centre"
  if (["halfback", "five eighth", "five eighths", "5 8", "58", "half", "hlf"].includes(normalised)) return "half"
  if (["hooker", "dummy half", "hok"].includes(normalised)) return "hooker"
  if (["lock", "prop", "front row", "front rower", "middle", "mid"].includes(normalised)) return "middle"
  if (["second row", "second rower", "back row", "back rower", "2rf", "edg", "edge"].includes(normalised)) return "edge"
  return normalised
}

function resolveProjectionSigma(
  position: string | null | undefined,
  sigmas: FantasyProjectionSigma[]
): FantasyProjectionSigma | null {
  if (sigmas.length === 0) return null
  const positionKey = projectionSigmaPositionKey(position)
  const globalSigma = sigmas.find((row) => projectionSigmaPositionKey(row.position) === "__global__") ?? null
  if (!positionKey) return globalSigma
  return sigmas.find((row) => projectionSigmaPositionKey(row.position) === positionKey) ?? globalSigma
}

function resolveProjectionBand(
  projection: number | null,
  position: string | null | undefined,
  sigmas: FantasyProjectionSigma[]
): { lower: number; upper: number } | null {
  const distribution = resolveProjectionDistribution(projection, position, sigmas)
  return distribution ? { lower: distribution.lower, upper: distribution.upper } : null
}

function resolveProjectionDistribution(
  projection: number | null,
  position: string | null | undefined,
  sigmas: FantasyProjectionSigma[]
): ProjectionDistributionData | null {
  if (projection == null) return null
  const sigma = resolveProjectionSigma(position, sigmas)
  if (!sigma) return null
  const residualSigma =
    sigma.residualSigma ??
    (sigma.normalHigh95Delta != null && sigma.normalLow95Delta != null
      ? (sigma.normalHigh95Delta - sigma.normalLow95Delta) / 3.92
      : null)
  if (residualSigma == null || residualSigma <= 0) return null
  return {
    mean: projection,
    sigma: residualSigma,
    lower: projection - residualSigma * PROJECTION_RANGE_Z_SCORE,
    upper: projection + residualSigma * PROJECTION_RANGE_Z_SCORE,
  }
}

function relevantOutsPositionGroup(value: string | null | undefined): string | null {
  const normalised = normalisePositionForComparison(value)
  if (!normalised) return null
  if (["fullback", "fb"].includes(normalised)) return "fullback"
  if (["wing", "winger", "w"].includes(normalised)) return "wing"
  if (["centre", "center", "ctr"].includes(normalised)) return "centre"
  if (["halfback", "five eighth", "five eighths", "5 8", "58", "half", "hlf"].includes(normalised)) return "halves"
  if (["lock", "prop", "front row", "front rower", "mid"].includes(normalised)) return "middle"
  if (["second row", "second rower", "back row", "back rower", "2rf", "edg", "edge"].includes(normalised)) return "second-row"
  if (["hooker", "dummy half", "hok"].includes(normalised)) return "hooker"
  return normalised
}

function isRelevantOutsPositionMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftGroup = relevantOutsPositionGroup(left)
  const rightGroup = relevantOutsPositionGroup(right)
  return Boolean(leftGroup && rightGroup && leftGroup === rightGroup)
}

function relevantOutsTeamGroup(value: string | null | undefined): string | null {
  const key = normaliseTeamKey(value)
  if (!key) return null
  const aliases: Array<[string, string[]]> = [
    ["broncos", ["broncos", "brisbane broncos"]],
    ["bulldogs", ["bulldogs", "canterbury bankstown bulldogs", "canterbury bulldogs"]],
    ["cowboys", ["cowboys", "north queensland cowboys"]],
    ["dragons", ["dragons", "st george illawarra dragons"]],
    ["dolphins", ["dolphins", "the dolphins"]],
    ["eels", ["eels", "parramatta eels"]],
    ["knights", ["knights", "newcastle knights"]],
    ["panthers", ["panthers", "penrith panthers"]],
    ["rabbitohs", ["rabbitohs", "south sydney rabbitohs", "souths"]],
    ["raiders", ["raiders", "canberra raiders"]],
    ["roosters", ["roosters", "sydney roosters"]],
    ["sea eagles", ["sea eagles", "manly sea eagles", "manly warringah sea eagles", "manly"]],
    ["sharks", ["sharks", "cronulla sharks", "cronulla sutherland sharks"]],
    ["storm", ["storm", "melbourne storm"]],
    ["tigers", ["tigers", "wests tigers"]],
    ["titans", ["titans", "gold coast titans"]],
    ["warriors", ["warriors", "new zealand warriors", "nz warriors"]],
  ]
  for (const [group, names] of aliases) {
    if (names.includes(key)) return group
  }
  return key
}

function isRelevantOutsTeamMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftGroup = relevantOutsTeamGroup(left)
  const rightGroup = relevantOutsTeamGroup(right)
  return Boolean(leftGroup && rightGroup && leftGroup === rightGroup)
}

function findFantasyPlayerForCasualtyRow(
  row: CasualtyWardRecord,
  fantasyPlayerByName: Map<string, FantasyPlayerSnapshot>
): FantasyPlayerSnapshot | null {
  return fantasyPlayerByName.get(normaliseProjectionPlayerName(row.player)) ?? null
}

function casualtyRowPosition(row: CasualtyWardRecord, fantasyPlayer: FantasyPlayerSnapshot | null): string | null {
  return row.position ?? fantasyPlayer?.positionLabel ?? fantasyPlayer?.positionLabels[0] ?? null
}

function casualtyRowGames(row: CasualtyWardRecord, fantasyPlayer: FantasyPlayerSnapshot | null): number | null {
  return row.games ?? fantasyPlayer?.gamesPlayed ?? null
}

function casualtyRowAverageFantasy(row: CasualtyWardRecord, fantasyPlayer: FantasyPlayerSnapshot | null): number | null {
  return row.averageFantasy ?? fantasyPlayer?.avgPoints ?? null
}

function isRelevantOutCandidate({
  row,
  lineupTeam,
  lineupPosition,
  namedLineupPlayers,
  fantasyPlayerByName,
}: {
  row: CasualtyWardRecord
  lineupTeam: string | null | undefined
  lineupPosition: string | null | undefined
  namedLineupPlayers: Set<string>
  fantasyPlayerByName: Map<string, FantasyPlayerSnapshot>
}): boolean {
  const playerKey = normaliseProjectionPlayerName(row.player)
  if (!playerKey || namedLineupPlayers.has(playerKey)) return false

  const fantasyPlayer = findFantasyPlayerForCasualtyRow(row, fantasyPlayerByName)
  const games = casualtyRowGames(row, fantasyPlayer)
  const averageFantasy = casualtyRowAverageFantasy(row, fantasyPlayer)

  return (
    (games ?? 0) >= 2 &&
    (averageFantasy ?? 0) >= 30 &&
    isRelevantOutsTeamMatch(row.team, lineupTeam) &&
    isRelevantOutsPositionMatch(casualtyRowPosition(row, fantasyPlayer), lineupPosition)
  )
}

function normaliseProjectionPlayerName(value: string | null | undefined): string {
  const key = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (key === "api koroisau") return "apisai koroisau"
  return key
}

function isFantasyPlayerUnavailableForFallback(
  player: FantasyPlayerSnapshot,
  casualtyWardPlayerNames?: Set<string>
): boolean {
  if (casualtyWardPlayerNames?.has(normaliseProjectionPlayerName(player.name))) return true
  const status = player.status?.trim().toLowerCase()
  return Boolean(
    status &&
    ["injured", "suspended", "out", "unavailable", "not playing"].some((token) => status.includes(token))
  )
}

function resolveFantasyProjectionForLineups(
  player: FantasyPlayerSnapshot,
  lineupsProjections: LineupsProjectionSnapshot | undefined,
  coachProjection: number | null,
  casualtyWardPlayerNames?: Set<string>,
  isOfficialDrawBye = false
): number | null {
  const playerNameKey = normaliseProjectionPlayerName(player.name)
  const projectionFromSnapshot =
    lineupsProjections?.projectionByPlayerId.get(player.id) ??
    lineupsProjections?.projectionByPlayerName.get(playerNameKey) ??
    null
  const fallbackProjection =
    projectionFromSnapshot ??
    coachProjection ??
    player.projectedAvg ??
    player.avgPoints ??
    null

  if (lineupsProjections?.source === "lineups") {
    const isNamed =
      lineupsProjections.roleByPlayerId.has(player.id) ||
      lineupsProjections.roleByPlayerName.has(playerNameKey)

    if (!isNamed) return null

    return (
      lineupsProjections.projectionByPlayerId.get(player.id) ??
      lineupsProjections.projectionByPlayerName.get(playerNameKey) ??
      0
    )
  }

  if (lineupsProjections?.source === "lineup_unaware") {
    if (isOfficialDrawBye) return null
    if (isFantasyPlayerUnavailableForFallback(player, casualtyWardPlayerNames)) return null
    return fallbackProjection
  }

  if (isOfficialDrawBye) return null
  if (isFantasyPlayerUnavailableForFallback(player, casualtyWardPlayerNames)) return null
  return fallbackProjection
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

function formatSignedTableNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "-"
  const formatted = formatTableNumber(value, digits)
  return value > 0 ? `+${formatted}` : formatted
}

function roundedFantasyValue(projection: number | null, pricedAt: number | null): number | null {
  if (projection == null || pricedAt == null) return null
  return Math.round(projection) - Math.round(pricedAt)
}

function formatPercent(value: number | null): string {
  if (value === null) return "-"
  return `${value.toFixed(2)}%`
}

function readTradeFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("Unable to read image."))
      }
    }
    reader.onerror = () => reject(new Error("Unable to read image."))
    reader.readAsDataURL(file)
  })
}

function loadTradeHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Unable to load image."))
    image.src = src
  })
}

async function buildFantasyTradeScreenshot(
  file: File,
  slot: TradeScreenshotSlot
): Promise<FantasyTradeScreenshot> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Upload PNG, JPEG, or WebP screenshots.")
  }

  const sourceDataUrl = await readTradeFileAsDataUrl(file)
  const image = await loadTradeHtmlImage(sourceDataUrl)
  const maxWidth = 900
  const canvas = document.createElement("canvas")
  const canvasContext = canvas.getContext("2d")
  if (!canvasContext) {
    throw new Error("Unable to process image.")
  }

  let scale = Math.min(1, maxWidth / image.naturalWidth)
  let dataUrl = ""
  for (const widthScale of [1, 0.82, 0.68, 0.54, 0.42]) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale * widthScale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale * widthScale))
    canvas.width = width
    canvas.height = height
    canvasContext.drawImage(image, 0, 0, width, height)

    for (const quality of [0.78, 0.68, 0.58, 0.48]) {
      dataUrl = canvas.toDataURL("image/jpeg", quality)
      if (dataUrl.length <= TRADE_SUGGESTOR_MAX_IMAGE_DATA_URL_LENGTH) break
    }

    if (dataUrl.length <= TRADE_SUGGESTOR_MAX_IMAGE_DATA_URL_LENGTH) break
    scale *= 0.9
  }

  if (dataUrl.length > TRADE_SUGGESTOR_MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error("That screenshot is too large. Try cropping it or uploading a clearer, smaller screenshot.")
  }

  return {
    id: `${slot}-${file.name}-${file.size}-${file.lastModified}`,
    slot,
    name: file.name,
    mediaType: "image/jpeg",
    dataUrl,
  }
}

function SparkAiIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        d="M23.5 4.5c1.2 8.1 5.9 12.8 14 14-8.1 1.2-12.8 5.9-14 14-1.2-8.1-5.9-12.8-14-14 8.1-1.2 12.8-5.9 14-14Z"
        fill="currentColor"
      />
      <path
        d="M37.5 29c.7 4.3 3.2 6.8 7.5 7.5-4.3.7-6.8 3.2-7.5 7.5-.7-4.3-3.2-6.8-7.5-7.5 4.3-.7 6.8-3.2 7.5-7.5Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="M38.5 2.5c.6 3.4 2.6 5.4 6 6-3.4.6-5.4 2.6-6 6-.6-3.4-2.6-5.4-6-6 3.4-.6 5.4-2.6 6-6Z"
        fill="currentColor"
        opacity="0.86"
      />
    </svg>
  )
}

function TrendGraphIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4 18h16M5 15l4-4 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <path
        d="M15 7h3v3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  )
}

function DollarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 3v18M16.5 7.5c-.9-1-2.4-1.6-4.2-1.6-2.3 0-4 1.1-4 2.8 0 1.9 1.9 2.5 4.2 3 2.4.5 4.3 1.1 4.3 3.2 0 1.8-1.8 3.2-4.5 3.2-2 0-3.8-.7-4.9-2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  )
}

function PersonIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2ZM4.5 20c.7-3.8 3.4-6.1 7.5-6.1s6.8 2.3 7.5 6.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  )
}

function getTradeSuggestorRatingClass(rating: number): string {
  if (rating >= 8) return "border-emerald-300/45 bg-emerald-400/15 text-emerald-200"
  if (rating >= 6) return "border-amber-300/45 bg-amber-400/15 text-amber-100"
  return "border-rose-300/45 bg-rose-400/15 text-rose-100"
}

function cleanTradeSuggestorLine(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\bOwn\s*%\s*delta\s*:/gi, "Ownership change:")
    .replace(/\bown\s*%\s*delta\b/gi, "ownership change")
    .replace(/\bvalue\s+v(?:s)?\.?\s*pricedAt\b/gi, "value compared with price")
    .replace(/\bmomentum\s*\+\s*ownership\b/gi, "ownership movement")
    .replace(/\bReason:\s*Rising ownership\s+and\s+/gi, "Reason: ")
    .replace(/\bReason:\s*Big ownership lift\s+and\s+/gi, "Reason: ")
    .replace(/\bReason:\s*(?:ownership is rising|positive ownership momentum)\s+and\s+/gi, "Reason: ")
    .replace(/\bReason:\s*([a-z])/g, (_match, letter: string) => `Reason: ${letter.toUpperCase()}`)
    .replace(/\bGood scored floor\b/gi, "Good scoring floor")
    .replace(/\bmisses the next major bye\s*\(helps field 13\)/gi, "misses the next major bye, so check your bye-round coverage")
    .replace(/\bhelps field 13\b/gi, "helps your major-bye coverage")
    .replace(/\bpriced[- ]at\s+\$/gi, "priced at ")
    .replace(/\bPriced[- ]at\s+\$/g, "Priced at ")
}

function shouldDropTradeSuggestorLine(text: string): boolean {
  const normalized = cleanTradeSuggestorLine(text).toLowerCase()
  return (
    /\bif you want\b/.test(normalized) ||
    /\bi can\b/.test(normalized) ||
    /\bi['’]?ll\b/.test(normalized) ||
    /\bwould you like\b/.test(normalized) ||
    /\bfollow[- ]?up\b/.test(normalized) ||
    /\bsnapshot threshold\b/.test(normalized) ||
    /\bthreshold for\b/.test(normalized) ||
    /\bmeets? the .*threshold\b/.test(normalized) ||
    /\bguardrail\b/.test(normalized) ||
    /\brule followed\b/.test(normalized) ||
    /\bbackend\b/.test(normalized) ||
    /\blive momentum snapshot\b/.test(normalized) ||
    /\blive .*snapshot\b/.test(normalized) ||
    /\bhighly[- ]sold snapshot\b/.test(normalized) ||
    /\bsell\/watch data\b/.test(normalized) ||
    /\buploaded squad\b/.test(normalized) ||
    /\ball buys come from\b/.test(normalized)
  )
}

function extractTradeSuggestorRating(text: string): number | null {
  const match = text.match(/(?:rating\s*)?(\d+(?:\.\d+)?)\/10/i)
  if (!match) return null
  const rating = Number(match[1])
  return Number.isFinite(rating) ? rating : null
}

function stripTradeSuggestorRating(text: string): string {
  return text
    .replace(/\s*[\[(]?(?:rating\s*)?\d+(?:\.\d+)?\/10[\])]?/gi, "")
    .replace(/\s+([,;:)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function renderTradeSuggestorInline(text: string) {
  const cleaned = cleanTradeSuggestorLine(text)
  const ratingMatch = cleaned.match(/(?:rating\s*)?(\d+(?:\.\d+)?)\/10/i)
  if (!ratingMatch || ratingMatch.index == null) return cleaned

  const rating = Number(ratingMatch[1])
  const matchText = ratingMatch[0]
  const before = cleaned.slice(0, ratingMatch.index)
  const after = cleaned.slice(ratingMatch.index + matchText.length)

  return (
    <>
      {before}
      <span className={`mx-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${getTradeSuggestorRatingClass(rating)}`}>
        {rating}/10
      </span>
      {after}
    </>
  )
}

function formatTradeSuggestorSectionTitle(title: string): string {
  if (/^sell watch/i.test(title)) return "Sell Watch"
  if (/^top 5 trade-ins/i.test(title)) return "Top 5 Trade-ins"
  if (/^recommended moves?/i.test(title)) return "Recommended Moves"
  return title
}

function buildTradeSuggestorSections(content: string) {
  const sections: Array<{ title: string; lines: string[] }> = []
  let current: { title: string; lines: string[] } | null = null

  for (const rawLine of content.split(/\r?\n/)) {
    const cleaned = cleanTradeSuggestorLine(rawLine.trim().replace(/^#+\s*/, ""))
    if (!cleaned || shouldDropTradeSuggestorLine(cleaned)) {
      if (current) current.lines.push("")
      continue
    }

    if (/^(recommended moves?|sell watch|top 5 trade-ins|notes)\b/i.test(cleaned)) {
      if (current) sections.push(current)
      current = { title: cleaned, lines: [] }
      continue
    }

    if (!current) current = { title: "Recommended Moves", lines: [] }
    current.lines.push(cleaned)
  }
  if (current) sections.push(current)

  const orderedTitles = ["Sell Watch", "Top 5 Trade-ins", "Recommended Moves"]
  return orderedTitles
    .map((title) => {
      const section = sections.find((entry) => formatTradeSuggestorSectionTitle(entry.title) === title)
      if (!section) return null

      const blocks: string[][] = []
      let active: string[] = []
      for (const line of section.lines) {
        if (/^\d+[\).]\s+/.test(line) && active.length > 0) {
          blocks.push(active)
          active = [line]
        } else {
          active.push(line)
        }
      }
      if (active.length > 0) blocks.push(active)

      const orderedBlocks = title === "Sell Watch"
        ? blocks
        : blocks.sort((left, right) => {
          const leftRating = extractTradeSuggestorRating(left.join(" ")) ?? -1
          const rightRating = extractTradeSuggestorRating(right.join(" ")) ?? -1
          return rightRating - leftRating
        })
      const lines = orderedBlocks.flat().map((line) => title === "Sell Watch" ? stripTradeSuggestorRating(line) : line)
      if (title === "Sell Watch" && !lines.some((line) => line.trim().length > 0)) {
        return {
          title,
          lines: ["No clear sells right now. Hold your current squad unless a player has confirmed unavailability or a clear poor-value signal."],
        }
      }

      return { title, lines }
    })
    .filter((section): section is { title: string; lines: string[] } => section !== null)
}

function FantasyTradeSuggestorResult({ content }: { content: string }) {
  const sections = buildTradeSuggestorSections(content)

  return (
    <div className="space-y-1.5 text-sm leading-6 text-nrl-text">
      {sections.map((section) => (
        <div key={section.title} className="space-y-1.5">
          <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-violet-200 first:mt-0">
            {section.title}
          </div>
          {section.lines.map((line, index) => {
            const cleaned = cleanTradeSuggestorLine(line)
            if (!cleaned) return <div key={index} className="h-1" />

            if (/^\d+[\).]\s+/.test(cleaned)) {
              return (
                <div key={index} className="mt-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 font-semibold text-white">
                  {renderTradeSuggestorInline(cleaned)}
                </div>
              )
            }

            const isDetail = /^[-•]\s+/.test(cleaned)
            return (
              <div key={index} className={isDetail ? "pl-3 text-nrl-text" : "text-nrl-text"}>
                {renderTradeSuggestorInline(cleaned)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
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

function getFantasyValueClass(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "text-nrl-muted"
  if (value > 0) return "text-emerald-300"
  if (value < 0) return "text-rose-300"
  return "text-nrl-muted"
}

function CasualtyWardPills({ rows }: { rows: CasualtyWardRecord[] }) {
  if (rows.length === 0) return null

  return (
    <>
      {rows.map((row, index) => (
        <Fragment key={`${row.player}-${row.injury ?? "injury"}-${row.returnDate ?? "return"}-${index}`}>
          <a
            href={row.sourceUrl ?? undefined}
            target={row.sourceUrl ? "_blank" : undefined}
            rel={row.sourceUrl ? "noreferrer" : undefined}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1 py-0.5 font-semibold text-amber-300 sm:px-2 sm:py-1"
            title="Casualty ward injury"
          >
            Out: {row.injury ?? "TBC"}, return {row.returnDate ?? "TBC"}
          </a>
        </Fragment>
      ))}
    </>
  )
}

const MAJOR_BYE_ROUNDS = [12, 15, 18] as const

function getNextMajorByeRound(currentRound: number | null | undefined): number | null {
  const round = typeof currentRound === "number" && Number.isFinite(currentRound) ? currentRound : 1
  return MAJOR_BYE_ROUNDS.find((byeRound) => byeRound >= round) ?? null
}

function formatNextMajorByeTag(round: number | null, plays: boolean | null): string | null {
  if (!round || plays === null) return null
  return `${plays ? "✓" : "✕"} Rd${round}`
}

function filterFutureMajorByeRoundTags(
  tags: MajorByeRoundTag[] | undefined,
  nextMajorByeRound: number | null,
): MajorByeRoundTag[] {
  if (!tags?.length) return []
  if (nextMajorByeRound == null) return []
  return tags.filter((tag) => tag.round >= nextMajorByeRound)
}

function getFantasyFilterTags({
  majorByeRoundTags,
  nextMajorByeRound,
  playsNextMajorBye,
  originChance,
}: {
  majorByeRoundTags?: MajorByeRoundTag[]
  nextMajorByeRound: number | null
  playsNextMajorBye: boolean | null
  originChance: boolean
}): string[] {
  const tags: string[] = []
  const futureMajorByeRoundTags = filterFutureMajorByeRoundTags(majorByeRoundTags, nextMajorByeRound)
  const byeTags =
    futureMajorByeRoundTags.length > 0
      ? futureMajorByeRoundTags
        .map((tag) => formatNextMajorByeTag(tag.round, tag.plays))
        .filter((tag): tag is string => Boolean(tag))
      : [formatNextMajorByeTag(nextMajorByeRound, playsNextMajorBye)].filter((tag): tag is string => Boolean(tag))
  tags.push(...byeTags)
  if (originChance) tags.push(FANTASY_FILTER_TAG_ORIGIN_CHANCE)
  return tags
}

function matchesFantasyTagFilters(rowTags: string[], selectedTags: string[]): boolean {
  return selectedTags.length === 0 || selectedTags.every((tag) => rowTags.includes(tag))
}

function fantasyByeTagSortValue(tag: string): { round: number; state: number } | null {
  const roundMatch = tag.match(/\bRd(\d+)\b/i)
  if (!roundMatch?.[1]) return null
  return {
    round: Number.parseInt(roundMatch[1], 10),
    state: tag.includes("✓") ? 0 : 1,
  }
}

function sortFantasyTagFilterOptions(a: string, b: string): number {
  const aBye = fantasyByeTagSortValue(a)
  const bBye = fantasyByeTagSortValue(b)
  if (aBye && bBye) {
    if (aBye.round !== bBye.round) return aBye.round - bBye.round
    return aBye.state - bBye.state
  }
  if (aBye) return -1
  if (bBye) return 1
  return a.localeCompare(b)
}

function teamPlaysInRound(draw2026Data: Draw2026Data | null | undefined, round: number | null, team: string | null | undefined): boolean | null {
  if (!draw2026Data?.rows?.length || !round || !team) return null
  const teamKey = relevantOutsTeamGroup(team) ?? normaliseTeamKey(team)
  if (!teamKey) return null
  return draw2026Data.rows.some(
    (row) =>
      row.round === round &&
      ((relevantOutsTeamGroup(row.home) ?? normaliseTeamKey(row.home)) === teamKey ||
        (relevantOutsTeamGroup(row.away) ?? normaliseTeamKey(row.away)) === teamKey)
  )
}

function PlayerContextTags({
  majorByeRoundTags,
  nextMajorByeRound,
  playsNextMajorBye,
  originChance,
  className = "",
}: {
  majorByeRoundTags?: MajorByeRoundTag[]
  nextMajorByeRound: number | null
  playsNextMajorBye: boolean | null
  originChance: boolean
  className?: string
}) {
  const futureMajorByeRoundTags = filterFutureMajorByeRoundTags(majorByeRoundTags, nextMajorByeRound)
  const byeTags =
    futureMajorByeRoundTags.length > 0
      ? futureMajorByeRoundTags.filter((tag) => tag.plays !== null)
      : nextMajorByeRound !== null && playsNextMajorBye !== null
        ? [{ round: nextMajorByeRound, plays: playsNextMajorBye }]
        : []
  if (byeTags.length === 0 && !originChance) return null

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      {byeTags.map((tag) => (
        <span
          key={tag.round}
          className={`shrink-0 rounded-md border px-1 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide ${
            tag.plays
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-400/10 text-rose-300"
          }`}
          title={tag.plays ? `Plays in Round ${tag.round}` : `Bye in Round ${tag.round}`}
        >
          Rd{tag.round}
        </span>
      ))}
      {originChance ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-300/35 bg-[linear-gradient(135deg,rgba(220,38,38,0.34),rgba(37,99,235,0.34))] px-1.5 py-0.5 text-[8px] font-bold normal-case tracking-wide text-slate-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          title="Origin"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/SOO.webp" alt="" className="h-3 w-3 rounded-sm object-contain" loading="lazy" />
          Origin
        </span>
      ) : null}
    </div>
  )
}

function RelevantOutsList({ rows }: { rows: CasualtyWardRecord[] }) {
  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-nrl-border bg-[#111832] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-300">
        <span aria-hidden="true">⚠</span>
        <span>Relevant Outs</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={`${row.player}-${row.position ?? "position"}-${index}`}
            className="rounded-lg border border-nrl-border bg-[#0f162d] px-3 py-2 text-sm text-nrl-text"
          >
            {row.player}: {row.injury ?? "TBC"}, return {row.returnDate ?? "TBC"}
          </div>
        ))}
      </div>
    </div>
  )
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

function scaleChartValue(value: number, min: number, max: number, start: number, end: number): number {
  if (!Number.isFinite(value)) return start
  if (max <= min) return (start + end) / 2
  return start + ((value - min) / (max - min)) * (end - start)
}

function getPaddedDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { min: min - 1, max: max + 1 }
  const pad = (max - min) * 0.08
  return { min: min - pad, max: max + pad }
}

function getZoomedDomain(domain: { min: number; max: number }, zoom: number, pan = 0): { min: number; max: number } {
  if (zoom <= 1) return domain
  const fullSpan = domain.max - domain.min
  const span = fullSpan / zoom
  const maxStart = domain.max - span
  const start = domain.min + (maxStart - domain.min) * Math.max(0, Math.min(1, pan))
  return { min: start, max: start + span }
}

function getProjectionDeltaColor(delta: number, maxAbsDelta: number): string {
  const intensity = maxAbsDelta > 0 ? Math.min(1, Math.abs(delta) / maxAbsDelta) : 0
  const alpha = 0.42 + intensity * 0.5
  if (delta >= 0) return `rgba(52, 211, 153, ${alpha.toFixed(3)})`
  return `rgba(248, 113, 113, ${alpha.toFixed(3)})`
}

function getFantasyAnalyticsMetricValue(point: FantasyAnalyticsPoint, metric: FantasyAnalyticsMetric): number | null {
  return point[metric]
}

function getFantasyPositionColor(position: string): string {
  const primaryPosition = position.split("/")[0] ?? position
  return FANTASY_POSITION_COLORS[primaryPosition] ?? "rgba(148,163,184,0.82)"
}

interface FantasyAnalyticsScatterPlotProps {
  points: FantasyAnalyticsPoint[]
  metric: FantasyAnalyticsMetric
  metricOption: { key: FantasyAnalyticsMetric; label: string; shortLabel: string }
}

function FantasyAnalyticsScatterPlot({
  points,
  metric,
  metricOption,
}: FantasyAnalyticsScatterPlotProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 })
  const [selectedPoint, setSelectedPoint] = useState<FantasyAnalyticsPoint | null>(null)
  const dragRef = useRef<FantasyAnalyticsDragState | null>(null)
  const suppressClickRef = useRef(false)
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null)
  const panFrameRef = useRef<number | null>(null)

  const width = 640
  const height = 380
  const left = 44
  const right = 18
  const top = 1
  const bottom = 22
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const baseXDomain = useMemo(() => getPaddedDomain(points.map((point) => point.pricedAt ?? 0)), [points])
  const baseYDomain = useMemo(
    () => getPaddedDomain(points.map((point) => getFantasyAnalyticsMetricValue(point, metric) ?? 0)),
    [metric, points]
  )
  const xDomain = getZoomedDomain(baseXDomain, zoom, pan.x)
  const yDomain = getZoomedDomain(baseYDomain, zoom, pan.y)
  const xTicks = [xDomain.min, (xDomain.min + xDomain.max) / 2, xDomain.max]
  const yTicks = [yDomain.min, (yDomain.min + yDomain.max) / 2, yDomain.max]
  const maxAbsDelta = Math.max(
    ...points.map((point) => Math.abs((getFantasyAnalyticsMetricValue(point, metric) ?? 0) - (point.pricedAt ?? 0))),
    1
  )
  const diagonalStart = Math.max(xDomain.min, yDomain.min)
  const diagonalEnd = Math.min(xDomain.max, yDomain.max)
  const chartPoints = points.map((point) => {
    const metricValue = getFantasyAnalyticsMetricValue(point, metric) ?? 0
    return {
      point,
      metricValue,
      delta: metricValue - (point.pricedAt ?? 0),
      x: scaleChartValue(point.pricedAt ?? 0, xDomain.min, xDomain.max, left, width - right),
      y: scaleChartValue(metricValue, yDomain.min, yDomain.max, height - bottom, top),
    }
  })
  const visibleChartPoints = chartPoints.filter(
    ({ x, y }) => x >= left - 8 && x <= width - right + 8 && y >= top - 8 && y <= height - bottom + 8
  )

  const queuePan = useCallback((nextPan: { x: number; y: number }) => {
    pendingPanRef.current = nextPan
    if (panFrameRef.current !== null) return
    panFrameRef.current = window.requestAnimationFrame(() => {
      panFrameRef.current = null
      const pendingPan = pendingPanRef.current
      if (!pendingPan) return
      pendingPanRef.current = null
      setPan(pendingPan)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current)
    }
  }, [])

  const selectNearestPoint = (event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = ((event.clientX - rect.left) / rect.width) * width
    const y = ((event.clientY - rect.top) / rect.height) * height
    if (x < left || x > width - right || y < top || y > height - bottom) return

    let closest: FantasyAnalyticsPoint | null = null
    let closestDistance = Infinity
    for (const chartPoint of visibleChartPoints) {
      const dx = chartPoint.x - x
      const dy = chartPoint.y - y
      const distance = dx * dx + dy * dy
      if (distance < closestDistance) {
        closestDistance = distance
        closest = chartPoint.point
      }
    }
    if (closest && closestDistance <= 20 * 20 && closest.name !== selectedPoint?.name) {
      setSelectedPoint(closest)
    }
  }

  const handleZoomChange = (value: number) => {
    const nextZoom = Math.max(FANTASY_ANALYTICS_MIN_ZOOM, Math.min(FANTASY_ANALYTICS_MAX_ZOOM, value))
    setZoom(nextZoom)
    setPan({ x: 0.5, y: 0.5 })
  }

  return (
    <div className="space-y-2">
      <label className="flex min-w-0 items-center rounded border border-nrl-border bg-nrl-panel px-2 py-1">
        <input
          type="range"
          min={FANTASY_ANALYTICS_MIN_ZOOM}
          max={FANTASY_ANALYTICS_MAX_ZOOM}
          step={FANTASY_ANALYTICS_ZOOM_STEP}
          value={zoom}
          onChange={(event) => handleZoomChange(Number(event.currentTarget.value))}
          className="w-full accent-nrl-accent"
          aria-label="Priced at plot zoom"
        />
      </label>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Priced at vs ${metricOption.label.toLowerCase()} scatter plot`}
        className={`block h-auto w-full ${zoom > 1 ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y"}`}
        onPointerDown={(event) => {
          if (zoom <= 1) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panX: pan.x,
            panY: pan.y,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId || zoom <= 1) {
            if (event.pointerType === "mouse") selectNearestPoint(event)
            return
          }
          event.preventDefault()
          const deltaX = event.clientX - drag.startX
          const deltaY = event.clientY - drag.startY
          const dragScale = zoom / (zoom - 1)
          queuePan({
            x: Math.max(0, Math.min(1, drag.panX - (deltaX / plotWidth) * dragScale)),
            y: Math.max(0, Math.min(1, drag.panY + (deltaY / plotHeight) * dragScale)),
          })
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (drag?.pointerId === event.pointerId) {
            const moved = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY)
            if (moved < 8) {
              selectNearestPoint(event)
            } else {
              suppressClickRef.current = true
            }
            dragRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
        }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          selectNearestPoint(event)
        }}
      >
        <defs>
          <clipPath id="fantasy-analytics-scatter-clip">
            <rect x={left} y={top} width={width - left - right} height={height - top - bottom} rx="6" />
          </clipPath>
        </defs>
        <rect x={left} y={top} width={width - left - right} height={height - top - bottom} fill="#111832" rx="6" />
        {xTicks.map((tick) => {
          const x = scaleChartValue(tick, xDomain.min, xDomain.max, left, width - right)
          return (
            <g key={`x-${tick}`}>
              <line x1={x} x2={x} y1={top} y2={height - bottom} stroke="rgba(148,163,184,0.12)" />
              <text x={x} y={height - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {formatTableNumber(tick, 0)}
              </text>
            </g>
          )
        })}
        {diagonalEnd > diagonalStart ? (
          <line
            x1={scaleChartValue(diagonalStart, xDomain.min, xDomain.max, left, width - right)}
            x2={scaleChartValue(diagonalEnd, xDomain.min, xDomain.max, left, width - right)}
            y1={scaleChartValue(diagonalStart, yDomain.min, yDomain.max, height - bottom, top)}
            y2={scaleChartValue(diagonalEnd, yDomain.min, yDomain.max, height - bottom, top)}
            stroke="rgba(226,232,240,0.5)"
            strokeDasharray="6 5"
            clipPath="url(#fantasy-analytics-scatter-clip)"
          />
        ) : null}
        {yTicks.map((tick) => {
          const y = scaleChartValue(tick, yDomain.min, yDomain.max, height - bottom, top)
          return (
            <g key={`y-${tick}`}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" />
              <text x={left - 8} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
                {formatTableNumber(tick, 0)}
              </text>
            </g>
          )
        })}
        <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="rgba(148,163,184,0.35)" />
        <line x1={left} x2={left} y1={top} y2={height - bottom} stroke="rgba(148,163,184,0.35)" />
        <text x={(width + left - right) / 2} y={height} textAnchor="middle" className="fill-slate-400 text-[10px]">
          Priced At
        </text>
        <text x="12" y={(height - bottom + top) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(height - bottom + top) / 2})`} className="fill-slate-400 text-[10px]">
          {metricOption.label}
        </text>
        <g clipPath="url(#fantasy-analytics-scatter-clip)">
          {visibleChartPoints.map(({ point, metricValue, delta, x, y }) => {
            const pointColor = getProjectionDeltaColor(delta, maxAbsDelta)
            const selected = selectedPoint?.name === point.name
            return (
              <circle
                key={`${point.name}-${point.position}`}
                cx={x}
                cy={y}
                r={selected ? "6" : "4"}
                fill={pointColor}
                stroke={selected ? "#f8fafc" : "#07131f"}
                strokeWidth={selected ? "2" : "1"}
                pointerEvents="none"
                opacity="0.9"
              >
                <title>{`${point.name}\nPriced At: ${formatTableNumber(point.pricedAt, 0)}\n${metricOption.label}: ${formatTableNumber(metricValue, 1)}\nDelta: ${delta >= 0 ? "+" : ""}${formatTableNumber(delta, 1)}`}</title>
              </circle>
            )
          })}
        </g>
      </svg>
      {selectedPoint ? (
        <Link
          href={`/dashboard/fantasy/${fantasyPlayerSlug(selectedPoint.name)}?from=fantasy`}
          className="group flex items-center gap-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-2.5 text-xs text-nrl-text transition-colors hover:border-nrl-accent/60 hover:bg-nrl-panel"
        >
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel text-xs font-semibold text-nrl-muted">
            {selectedPoint.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedPoint.imageUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
            ) : (
              <span>{getPlayerInitials(selectedPoint.name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-nrl-text group-hover:text-white">{selectedPoint.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">
                  <span>{selectedPoint.position}</span>
                  {selectedPoint.team ? <span className="text-nrl-border">/</span> : null}
                  {selectedPoint.team ? <span>{selectedPoint.team}</span> : null}
                </div>
              </div>
              <div className="shrink-0 rounded-md border border-nrl-border bg-nrl-panel px-2 py-1 text-right">
                <div className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Price</div>
                <div className="text-xs font-bold text-nrl-text">{formatPrice(selectedPoint.price)}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(() => {
                const metricValue = getFantasyAnalyticsMetricValue(selectedPoint, metric)
                const delta = (metricValue ?? 0) - (selectedPoint.pricedAt ?? 0)
                return [
                  { label: "Priced At", value: formatTableNumber(selectedPoint.pricedAt, 0), className: "text-nrl-text" },
                  { label: metricOption.shortLabel, value: formatTableNumber(metricValue, 1), className: "text-nrl-text" },
                  { label: "Delta", value: `${delta >= 0 ? "+" : ""}${formatTableNumber(delta, 1)}`, className: getFantasyValueClass(delta) },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-nrl-border/80 bg-nrl-panel px-2 py-1">
                    <div className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">{item.label}</div>
                    <div className={`mt-0.5 text-xs font-bold ${item.className}`}>{item.value}</div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </Link>
      ) : (
        <div className="text-[10px] text-nrl-muted">
          {zoom > 1 ? "Drag the plot to pan. Hover or tap a point to inspect the player." : "Hover or tap a point to inspect the player."}
        </div>
      )}
    </div>
  )
}

interface GlobalStatVsFantasyScatterPlotProps {
  points: GlobalStatVsFantasyPoint[]
  selectedOption: StatVsFantasyOption
  positionFilter: string
  trendline: { m: number; b: number } | null
}

function GlobalStatVsFantasyScatterPlot({
  points,
  selectedOption,
  positionFilter,
  trendline,
}: GlobalStatVsFantasyScatterPlotProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 })
  const [selectedPoint, setSelectedPoint] = useState<GlobalStatVsFantasyPoint | null>(null)
  const dragRef = useRef<FantasyAnalyticsDragState | null>(null)
  const suppressClickRef = useRef(false)
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null)
  const panFrameRef = useRef<number | null>(null)

  const width = 640
  const height = 350
  const left = 44
  const right = 18
  const top = 1
  const bottom = 22
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const baseXDomain = useMemo(() => getPaddedDomain(points.map((point) => point.statValue)), [points])
  const baseYDomain = useMemo(() => getPaddedDomain(points.map((point) => point.fantasyAvg)), [points])
  const xDomain = getZoomedDomain(baseXDomain, zoom, pan.x)
  const yDomain = getZoomedDomain(baseYDomain, zoom, pan.y)
  const xTicks = [xDomain.min, (xDomain.min + xDomain.max) / 2, xDomain.max]
  const yTicks = [yDomain.min, (yDomain.min + yDomain.max) / 2, yDomain.max]
  const trendStartY = trendline ? trendline.m * xDomain.min + trendline.b : null
  const trendEndY = trendline ? trendline.m * xDomain.max + trendline.b : null
  const chartPoints = points.map((point) => ({
    point,
    x: scaleChartValue(point.statValue, xDomain.min, xDomain.max, left, width - right),
    y: scaleChartValue(point.fantasyAvg, yDomain.min, yDomain.max, height - bottom, top),
  }))
  const visibleChartPoints = chartPoints.filter(
    ({ x, y }) => x >= left - 8 && x <= width - right + 8 && y >= top - 8 && y <= height - bottom + 8
  )

  const queuePan = useCallback((nextPan: { x: number; y: number }) => {
    pendingPanRef.current = nextPan
    if (panFrameRef.current !== null) return
    panFrameRef.current = window.requestAnimationFrame(() => {
      panFrameRef.current = null
      const pendingPan = pendingPanRef.current
      if (!pendingPan) return
      pendingPanRef.current = null
      setPan(pendingPan)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current)
    }
  }, [])

  const selectNearestPoint = (event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = ((event.clientX - rect.left) / rect.width) * width
    const y = ((event.clientY - rect.top) / rect.height) * height
    if (x < left || x > width - right || y < top || y > height - bottom) return

    let closest: GlobalStatVsFantasyPoint | null = null
    let closestDistance = Infinity
    for (const chartPoint of visibleChartPoints) {
      const dx = chartPoint.x - x
      const dy = chartPoint.y - y
      const distance = dx * dx + dy * dy
      if (distance < closestDistance) {
        closestDistance = distance
        closest = chartPoint.point
      }
    }
    if (closest && closestDistance <= 20 * 20 && closest.name !== selectedPoint?.name) {
      setSelectedPoint(closest)
    }
  }

  const handleZoomChange = (value: number) => {
    const nextZoom = Math.max(FANTASY_ANALYTICS_MIN_ZOOM, Math.min(FANTASY_ANALYTICS_MAX_ZOOM, value))
    setZoom(nextZoom)
    setPan({ x: 0.5, y: 0.5 })
  }

  return (
    <div className="space-y-2">
      <label className="flex min-w-0 items-center rounded border border-nrl-border bg-nrl-panel px-2 py-1">
        <input
          type="range"
          min={FANTASY_ANALYTICS_MIN_ZOOM}
          max={FANTASY_ANALYTICS_MAX_ZOOM}
          step={FANTASY_ANALYTICS_ZOOM_STEP}
          value={zoom}
          onChange={(event) => handleZoomChange(Number(event.currentTarget.value))}
          className="w-full accent-nrl-accent"
          aria-label="Fantasy vs stat plot zoom"
        />
      </label>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`2026 fantasy average vs ${selectedOption.label.toLowerCase()} average scatter plot`}
        className={`block h-auto w-full ${zoom > 1 ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y"}`}
        onPointerDown={(event) => {
          if (zoom <= 1) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panX: pan.x,
            panY: pan.y,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId || zoom <= 1) {
            if (event.pointerType === "mouse") selectNearestPoint(event)
            return
          }
          event.preventDefault()
          const deltaX = event.clientX - drag.startX
          const deltaY = event.clientY - drag.startY
          const dragScale = zoom / (zoom - 1)
          queuePan({
            x: Math.max(0, Math.min(1, drag.panX - (deltaX / plotWidth) * dragScale)),
            y: Math.max(0, Math.min(1, drag.panY + (deltaY / plotHeight) * dragScale)),
          })
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (drag?.pointerId === event.pointerId) {
            const moved = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY)
            if (moved < 8) {
              selectNearestPoint(event)
            } else {
              suppressClickRef.current = true
            }
            dragRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
        }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          selectNearestPoint(event)
        }}
      >
        <defs>
          <clipPath id="fantasy-global-stat-scatter-clip">
            <rect x={left} y={top} width={width - left - right} height={height - top - bottom} rx="6" />
          </clipPath>
        </defs>
        <rect x={left} y={top} width={width - left - right} height={height - top - bottom} fill="#111832" rx="6" />
        {xTicks.map((tick) => {
          const x = scaleChartValue(tick, xDomain.min, xDomain.max, left, width - right)
          return (
            <g key={`global-x-${tick}`}>
              <line x1={x} x2={x} y1={top} y2={height - bottom} stroke="rgba(148,163,184,0.12)" />
              <text x={x} y={height - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {formatTableNumber(tick, 0)}
              </text>
            </g>
          )
        })}
        {yTicks.map((tick) => {
          const y = scaleChartValue(tick, yDomain.min, yDomain.max, height - bottom, top)
          return (
            <g key={`global-y-${tick}`}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" />
              <text x={left - 8} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
                {formatTableNumber(tick, 0)}
              </text>
            </g>
          )
        })}
        <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="rgba(148,163,184,0.35)" />
        <line x1={left} x2={left} y1={top} y2={height - bottom} stroke="rgba(148,163,184,0.35)" />
        <text x={(width + left - right) / 2} y={height} textAnchor="middle" className="fill-slate-400 text-[10px]">
          {selectedOption.label}
        </text>
        <text x="12" y={(height - bottom + top) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(height - bottom + top) / 2})`} className="fill-slate-400 text-[10px]">
          Fantasy Avg
        </text>
        <g clipPath="url(#fantasy-global-stat-scatter-clip)">
          {trendStartY !== null && trendEndY !== null ? (
            <line
              x1={left}
              y1={scaleChartValue(trendStartY, yDomain.min, yDomain.max, height - bottom, top)}
              x2={width - right}
              y2={scaleChartValue(trendEndY, yDomain.min, yDomain.max, height - bottom, top)}
              stroke="rgba(226,232,240,0.7)"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
          ) : null}
          {visibleChartPoints.map(({ point, x, y }) => {
            const selected = selectedPoint?.name === point.name
            return (
              <circle
                key={`${point.name}-${point.position}-global-stat`}
                cx={x}
                cy={y}
                r={selected ? "6" : "4"}
                fill={getFantasyPositionColor(positionFilter === "All Positions" ? point.position : positionFilter)}
                stroke={selected ? "#f8fafc" : "#07131f"}
                strokeWidth={selected ? "2" : "1"}
                pointerEvents="none"
              >
                <title>{`${point.name}\n${selectedOption.label}: ${formatTableNumber(point.statValue, 1)}\nFantasy Avg: ${formatTableNumber(point.fantasyAvg, 1)}`}</title>
              </circle>
            )
          })}
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold text-nrl-muted">
        {POSITION_TABLES.map((position) => (
          <span key={position.label} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getFantasyPositionColor(position.label) }} />
            {position.label}
          </span>
        ))}
      </div>
      {selectedPoint ? (
        <Link
          href={`/dashboard/fantasy/${fantasyPlayerSlug(selectedPoint.name)}?from=fantasy`}
          className="group flex items-center gap-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-2.5 text-xs text-nrl-text transition-colors hover:border-nrl-accent/60 hover:bg-nrl-panel"
        >
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel text-xs font-semibold text-nrl-muted">
            {selectedPoint.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedPoint.imageUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
            ) : (
              <span>{getPlayerInitials(selectedPoint.name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-nrl-text group-hover:text-white">{selectedPoint.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">
                  <span>{selectedPoint.position}</span>
                  {selectedPoint.team ? <span className="text-nrl-border">/</span> : null}
                  {selectedPoint.team ? <span>{selectedPoint.team}</span> : null}
                </div>
              </div>
              <div className="shrink-0 rounded-md border border-nrl-border bg-nrl-panel px-2 py-1 text-right">
                <div className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Price</div>
                <div className="text-xs font-bold text-nrl-text">{formatPrice(selectedPoint.price)}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[
                { label: selectedOption.label, value: formatTableNumber(selectedPoint.statValue, 1) },
                { label: "Fantasy Avg", value: formatTableNumber(selectedPoint.fantasyAvg, 1) },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-nrl-border/80 bg-nrl-panel px-2 py-1">
                  <div className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">{item.label}</div>
                  <div className="mt-0.5 text-xs font-bold text-nrl-text">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Link>
      ) : (
        <div className="text-[10px] text-nrl-muted">
          {zoom > 1 ? "Drag the plot to pan. Hover or tap a player to inspect their 2026 averages." : "Hover or tap a player to inspect their 2026 averages."}
        </div>
      )}
    </div>
  )
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
      className={`w-full rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors sm:text-[10px] ${locked
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
  center = false,
  prominentValue = false,
  softSurface = false,
}: {
  label: string
  value: string
  sublabel?: string
  compact?: boolean
  blurValue?: boolean
  mobileTight?: boolean
  center?: boolean
  prominentValue?: boolean
  softSurface?: boolean
}) {
  const valueSizeClass = prominentValue
    ? "text-[1.35rem] leading-none tracking-tight sm:text-[1.7rem]"
    : compact
      ? mobileTight
        ? "mt-1 text-[1.12rem] leading-tight tracking-tight sm:mt-1 sm:text-[1.5rem] sm:leading-none"
        : "mt-1 text-[1.15rem] leading-tight tracking-tight sm:text-[1.5rem] sm:leading-none"
      : "mt-1 text-xl"

  return (
    <div
      className={`h-full rounded-lg border ${softSurface ? "border-blue-300/20 bg-white/[0.055]" : "border-nrl-border bg-[#111832]"} ${compact
        ? mobileTight
          ? "min-h-[4.4rem] px-2 py-2.5 sm:min-h-[5.25rem] sm:px-1.5 sm:py-4 xl:min-h-[4.5rem] xl:px-1.5 xl:py-2.5"
          : "px-2 py-2 sm:px-2.5 sm:py-2.5 xl:px-2.5 xl:py-2.5"
        : "px-3 py-2"
        }`}
    >
      <div className={`${compact ? mobileTight ? "min-h-[1.8em] text-[6.5px] leading-[1.15] sm:text-[7px]" : "min-h-[1.8em] text-[7px] leading-[1.15]" : "text-[9px]"} font-semibold uppercase tracking-wide text-nrl-muted ${center ? "text-center" : ""}`}>
        {label}
      </div>
      <div
        className={`${prominentValue ? "flex min-h-[2.75rem] items-center justify-center sm:min-h-[3rem]" : ""} ${valueSizeClass} min-w-0 font-bold text-nrl-text ${center ? "text-center" : ""} ${blurValue ? FANTASY_LOCKED_METRIC_TEXT_CLASS : ""
          }`}
        aria-hidden={blurValue || undefined}
      >
        {value}
      </div>
      {sublabel ? (
        <div className={`${compact ? mobileTight ? "mt-1 text-[7px] leading-tight sm:mt-1 sm:text-[8px]" : "mt-1 text-[8px] leading-tight" : "mt-0.5 text-[10px]"} text-nrl-muted ${center ? "text-center" : ""}`}>
          {sublabel}
        </div>
      ) : null}
    </div>
  )
}

function ProjectionBandMetricCard({
  label,
  projection,
  lower,
  upper,
  blurValue = false,
}: {
  label: string
  projection: string
  lower: string
  upper: string
  blurValue?: boolean
}) {
  return (
    <div className="h-full rounded-lg border border-nrl-border bg-nrl-panel-2 px-2 py-2 sm:px-2.5 sm:py-2.5 xl:px-2.5 xl:py-2.5">
      <div className="min-h-[1.8em] text-center text-[7px] font-semibold uppercase leading-[1.15] tracking-wide text-nrl-muted">
        {label}
      </div>
      <div className={`grid min-h-[2.75rem] grid-cols-[minmax(0,0.75fr)_minmax(3rem,1fr)_minmax(0,0.75fr)] items-center gap-1 sm:min-h-[3rem] ${blurValue ? FANTASY_LOCKED_METRIC_TEXT_CLASS : ""}`}>
        <div className="min-w-0 text-left" aria-hidden={blurValue || undefined}>
          <div className="text-[8px] font-semibold uppercase tracking-wide text-red-300/80">LOW 5%</div>
          <div className="mt-0.5 text-sm font-bold leading-none text-red-300 sm:text-base">{lower}</div>
        </div>
        <div className="min-w-0 text-center" aria-hidden={blurValue || undefined}>
          <div className="text-[1.35rem] font-bold leading-none tracking-tight text-nrl-text sm:text-[1.7rem]">
            {projection}
          </div>
        </div>
        <div className="min-w-0 text-right" aria-hidden={blurValue || undefined}>
          <div className="text-[8px] font-semibold uppercase tracking-wide text-emerald-300/80">HIGH 5%</div>
          <div className="mt-0.5 text-sm font-bold leading-none text-emerald-300 sm:text-base">{upper}</div>
        </div>
      </div>
    </div>
  )
}

function ProjectionRangePlot({
  data,
}: {
  data: ProjectionDistributionData
}) {
  const xMin = Math.floor(Math.min(data.mean - data.sigma * 3.5, data.lower - data.sigma * 0.35))
  const xMax = Math.ceil(Math.max(data.mean + data.sigma * 3.5, data.upper + data.sigma * 0.35))
  const width = 720
  const height = 232
  const padX = 44
  const padTop = 36
  const padBottom = 30
  const plotWidth = width - padX * 2
  const plotHeight = height - padTop - padBottom
  const xScale = (value: number) => padX + ((value - xMin) / Math.max(1, xMax - xMin)) * plotWidth
  const yScale = (value: number, maxValue: number) => padTop + plotHeight - (value / Math.max(maxValue, 0.0001)) * plotHeight
  const relativeDensityAt = (value: number) => {
    const z = (value - data.mean) / data.sigma
    return Math.exp(-0.5 * z * z)
  }
  const normalCdf = (value: number) => {
    const z = (value - data.mean) / (data.sigma * Math.SQRT2)
    const sign = z < 0 ? -1 : 1
    const absZ = Math.abs(z)
    const t = 1 / (1 + 0.3275911 * absZ)
    const erf =
      sign *
      (1 -
        (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
          t *
          Math.exp(-absZ * absZ))
    return 0.5 * (1 + erf)
  }
  const barColor = (index: number, total: number) => {
    const ratio = total <= 1 ? 0.5 : index / (total - 1)
    const hue = 0 + ratio * 145
    return `hsla(${hue.toFixed(0)}, 78%, 62%, 0.78)`
  }
  const binCount = 31
  const binWidth = (xMax - xMin) / binCount
  const bars = Array.from({ length: binCount }, (_, index) => {
    const start = xMin + index * binWidth
    const end = index === binCount - 1 ? xMax : start + binWidth
    const mid = (start + end) / 2
    const probability = Math.max(0, normalCdf(end) - normalCdf(start))
    return { start, end, mid, probability }
  })
  const maxProbability = Math.max(...bars.map((bar) => bar.probability), 0.0001)
  const ticks = [data.lower, data.mean, data.upper]
  return (
    <div className="mt-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
            Projection Range
          </div>
          <div className="text-[10px] text-nrl-muted">
            Normal central 90% prediction range from residual sigma
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projection normal prediction range" className="h-[210px] w-full overflow-visible sm:h-[224px]">
        <line x1={padX} x2={width - padX} y1={padTop + plotHeight} y2={padTop + plotHeight} stroke="rgba(154,164,191,0.45)" strokeWidth="1" />
        {bars.map((bar, index) => {
          const barX = xScale(bar.start) + 1
          const barRight = xScale(bar.end) - 1
          const barY = yScale(bar.probability, maxProbability)
          const barHeight = padTop + plotHeight - barY
          return (
            <rect
              key={`projection-range-bar-${index}`}
              x={barX}
              y={barY}
              width={Math.max(1, barRight - barX)}
              height={Math.max(1, barHeight)}
              rx="2"
              fill={barColor(index, bars.length)}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="0.8"
            >
              <title>
                {`${bar.start.toFixed(0)}-${bar.end.toFixed(0)} pts: ${(bar.probability * 100).toFixed(1)}%`}
              </title>
            </rect>
          )
        })}
        {ticks.map((tick) => (
          <g key={`projection-range-tick-${tick}`}>
            <line x1={xScale(tick)} x2={xScale(tick)} y1={padTop} y2={padTop + plotHeight} stroke="rgba(154,164,191,0.22)" strokeWidth="1" />
            <text x={xScale(tick)} y={height - 12} textAnchor="middle" fill="rgba(154,164,191,0.92)" fontSize="11" fontWeight="600">
              {formatNumber(tick, 0)}
            </text>
          </g>
        ))}
        <line x1={xScale(data.lower)} x2={xScale(data.lower)} y1={padTop + plotHeight} y2={yScale(relativeDensityAt(data.lower), 1)} stroke="rgba(252,165,165,0.95)" strokeWidth="2" />
        <line x1={xScale(data.mean)} x2={xScale(data.mean)} y1={padTop + plotHeight} y2={padTop} stroke="rgba(255,255,255,0.95)" strokeWidth="2" />
        <line x1={xScale(data.upper)} x2={xScale(data.upper)} y1={padTop + plotHeight} y2={yScale(relativeDensityAt(data.upper), 1)} stroke="rgba(110,231,183,0.95)" strokeWidth="2" />
        <text x={xScale(data.lower)} y={padTop - 14} textAnchor="middle" fill="rgba(252,165,165,0.98)" fontSize="11" fontWeight="700">
          Lower {PROJECTION_RANGE_TAIL_PERCENT}% {formatNumber(data.lower, 0)}
        </text>
        <text x={xScale(data.mean)} y={padTop - 20} textAnchor="middle" fill="rgba(255,255,255,0.98)" fontSize="11" fontWeight="700">
          Projection {formatNumber(data.mean, 0)}
        </text>
        <text x={xScale(data.upper)} y={padTop - 14} textAnchor="middle" fill="rgba(110,231,183,0.98)" fontSize="11" fontWeight="700">
          Upper {PROJECTION_RANGE_TAIL_PERCENT}% {formatNumber(data.upper, 0)}
        </text>
      </svg>
    </div>
  )
}

function ProjectionRangePreviewBars({ data }: { data: ProjectionDistributionData }) {
  const xMin = Math.floor(data.mean - data.sigma * 3.4)
  const xMax = Math.ceil(data.mean + data.sigma * 3.4)
  const width = 360
  const height = 150
  const padX = 24
  const padTop = 30
  const padBottom = 22
  const plotWidth = width - padX * 2
  const plotHeight = height - padTop - padBottom
  const xScale = (value: number) => padX + ((value - xMin) / Math.max(1, xMax - xMin)) * plotWidth
  const yScale = (value: number, maxValue: number) => padTop + plotHeight - (value / Math.max(maxValue, 0.0001)) * plotHeight
  const normalCdf = (value: number) => {
    const z = (value - data.mean) / (data.sigma * Math.SQRT2)
    const sign = z < 0 ? -1 : 1
    const absZ = Math.abs(z)
    const t = 1 / (1 + 0.3275911 * absZ)
    const erf =
      sign *
      (1 -
        (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
          t *
          Math.exp(-absZ * absZ))
    return 0.5 * (1 + erf)
  }
  const binCount = 25
  const binWidth = (xMax - xMin) / binCount
  const bars = Array.from({ length: binCount }, (_, index) => {
    const start = xMin + index * binWidth
    const end = index === binCount - 1 ? xMax : start + binWidth
    return { start, end, probability: Math.max(0, normalCdf(end) - normalCdf(start)) }
  })
  const maxProbability = Math.max(...bars.map((bar) => bar.probability), 0.0001)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
      <line x1={padX} x2={width - padX} y1={padTop + plotHeight} y2={padTop + plotHeight} stroke="rgba(154,164,191,0.45)" strokeWidth="1" />
      {bars.map((bar, index) => {
        const hue = index / Math.max(1, bars.length - 1) * 145
        const barX = xScale(bar.start) + 0.8
        const barRight = xScale(bar.end) - 0.8
        const barY = yScale(bar.probability, maxProbability)
        return (
          <rect
            key={`projection-preview-bar-${index}`}
            x={barX}
            y={barY}
            width={Math.max(1, barRight - barX)}
            height={Math.max(1, padTop + plotHeight - barY)}
            rx="1.5"
            fill={`hsla(${hue.toFixed(0)}, 78%, 62%, 0.78)`}
          />
        )
      })}
      {[
        { value: data.lower, label: `Lower ${formatNumber(data.lower, 0)}`, color: "rgba(252,165,165,0.98)" },
        { value: data.mean, label: `Proj ${formatNumber(data.mean, 0)}`, color: "rgba(255,255,255,0.98)" },
        { value: data.upper, label: `Upper ${formatNumber(data.upper, 0)}`, color: "rgba(110,231,183,0.98)" },
      ].map((tick) => (
        <g key={`projection-preview-tick-${tick.label}`}>
          <line x1={xScale(tick.value)} x2={xScale(tick.value)} y1={padTop} y2={padTop + plotHeight} stroke={tick.color} strokeWidth="1.4" />
          <text x={xScale(tick.value)} y={padTop - 9} textAnchor="middle" fill={tick.color} fontSize="8" fontWeight="700">
            {tick.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function FantasyDashboard({
  fantasyPlayers,
  fantasyCoachPlayers = [],
  ownershipBaselineSnapshot = null,
  casualtyWardRows = [],
  relevantOuts = [],
  relevantOutCandidates = [],
  originChances = [],
  lineupsProjections,
  fantasyProjectionSigmas = [],
  availableYears,
  defaultYears,
  initialPlayerStats,
  initialAllPlayerStats = [],
  precomputedAllPlayersRows = [],
  precomputedAllPlayersRowsArePreview = false,
  playerImages = [],
  teamLogos = {},
  preloadedPlayerAllYears = false,
  preloadSelectedPlayerAllYears = false,
  draw2026Data,
  initialSelectedFantasyName,
  showOwnedCards = true,
  showFantasyActions = true,
  showAllPlayersOnly = false,
  showFantasyAnalyticsOnly = false,
  showPlayerDetails = true,
  showPlayerComments = false,
  initialShowFantasyAnalytics = false,
  playerRouteBasePath,
  canAccessLoginSeason = false,
  canBypassPlotGate = false,
  fantasyProjectionArticle = null,
}: FantasyDashboardProps) {
  const router = useRouter()
  const { isLoaded: isAuthLoaded, userId } = useAuth()
  const initialSelectedYears = useMemo(
    () => {
      const validDefaultYears = defaultYears.filter((year) => availableYears.includes(year))
      if (showPlayerDetails && validDefaultYears.length > 0) return validDefaultYears
      if (availableYears.includes(ALL_PLAYERS_STATS_YEAR)) return [ALL_PLAYERS_STATS_YEAR]
      return validDefaultYears.length > 0 ? validDefaultYears : availableYears.slice(0, 1)
    },
    [availableYears, defaultYears, showPlayerDetails]
  )
  const [selectedYears, setSelectedYears] = useState<string[]>(initialSelectedYears)
  const [allData, setAllData] = useState<PlayerStat[]>(initialPlayerStats)
  const [allPlayersStatsData, setAllPlayersStatsData] = useState<PlayerStat[]>(initialAllPlayerStats)
  const [teammateLookupRows, setTeammateLookupRows] = useState<TeammateLookupRow[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [preloadedSelectedPlayerAllYearsKey, setPreloadedSelectedPlayerAllYearsKey] = useState<string | null>(null)
  const [selectedFantasyName, setSelectedFantasyName] = useState(initialSelectedFantasyName ?? "")
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
  const [showProjectionRangePlot, setShowProjectionRangePlot] = useState(false)
  const [showBaseUpsideBars, setShowBaseUpsideBars] = useState(false)
  const [showOpponentHeatmap, setShowOpponentHeatmap] = useState(false)
  const [showFantasyBoxPlot, setShowFantasyBoxPlot] = useState(false)
  const [showStatVsFantasyPlot, setShowStatVsFantasyPlot] = useState(false)
  const [lockedPreviewPlotIndex, setLockedPreviewPlotIndex] = useState(0)
  const [selectedRollingAverageStat, setSelectedRollingAverageStat] = useState<string>("Fantasy")
  const [selectedStatVsFantasyLabel, setSelectedStatVsFantasyLabel] = useState<StatVsFantasyOptionLabel>("Run Metres")
  const [showWithWithoutPlot, setShowWithWithoutPlot] = useState(false)
  const [isGameLogExpanded, setIsGameLogExpanded] = useState(false)
  const [gameLogSort, setGameLogSort] = useState<{ column: GameLogColumn; direction: GameLogSortDirection } | null>(
    null
  )
  const [allPlayersSort, setAllPlayersSort] = useState<{ column: AllPlayersSortKey; direction: AllPlayersSortDirection }>({
    column: "weeklyChange",
    direction: "desc",
  })
  const [allPlayerCardSummaryRows, setAllPlayerCardSummaryRows] = useState<FantasyPlayerCardSummary[]>(precomputedAllPlayersRows)
  const [allPlayersView, setAllPlayersView] = useState<"cards" | "table">("cards")
  const [allPlayersPositionFilter, setAllPlayersPositionFilter] = useState("All Positions")
  const [allPlayersTagFilters, setAllPlayersTagFilters] = useState<string[]>([])
  const [showAllPlayersCardTags, setShowAllPlayersCardTags] = useState(false)
  const [cardTagsPreferenceHydrated, setCardTagsPreferenceHydrated] = useState(false)
  const showFantasyAnalytics = initialShowFantasyAnalytics
  const [fantasyAnalyticsMetric, setFantasyAnalyticsMetric] = useState<FantasyAnalyticsMetric>("last3")
  const [fantasyAnalyticsPositionFilter, setFantasyAnalyticsPositionFilter] = useState("All Positions")
  const [selectedGlobalStatVsFantasyLabel, setSelectedGlobalStatVsFantasyLabel] = useState<StatVsFantasyOptionLabel>("Run Metres")
  const [globalStatVsFantasyPositionFilter, setGlobalStatVsFantasyPositionFilter] = useState("All Positions")
  const [fantasyTemplateMode, setFantasyTemplateMode] = useState<FantasyTemplateMode>("change")
  const [isFantasyAnalyticsPending, setIsFantasyAnalyticsPending] = useState(false)
  const [isFantasyDraftPending, setIsFantasyDraftPending] = useState(false)
  const [isMyTeamPending, setIsMyTeamPending] = useState(false)
  const [isAllPlayersPending, setIsAllPlayersPending] = useState(false)
  const [isTradeSuggestorOpen, setIsTradeSuggestorOpen] = useState(false)
  const [tradeScreenshots, setTradeScreenshots] = useState<Record<TradeScreenshotSlot, FantasyTradeScreenshot | null>>({
    starters: null,
    bench: null,
    trade: null,
  })
  const [tradeSuggestorNotes, setTradeSuggestorNotes] = useState("")
  const [tradeSuggestorResult, setTradeSuggestorResult] = useState<string | null>(null)
  const [tradeSuggestorError, setTradeSuggestorError] = useState<string | null>(null)
  const [isTradeSuggestorUploading, setIsTradeSuggestorUploading] = useState<TradeScreenshotSlot | null>(null)
  const [isTradeSuggestorSubmitting, setIsTradeSuggestorSubmitting] = useState(false)
  const [hasRequestedAllPlayersStats, setHasRequestedAllPlayersStats] = useState(false)
  const [allPlayersStatsLoadFailed, setAllPlayersStatsLoadFailed] = useState(false)
  const [dashboardStateHydrated, setDashboardStateHydrated] = useState(false)
  const allPlayersStatsSourceData = useMemo(
    () => hasAllPlayerStatsForYear(allData, ALL_PLAYERS_STATS_YEAR) ? allData : allPlayersStatsData,
    [allData, allPlayersStatsData]
  )
  const hasLoadedFullAllPlayersRows = !precomputedAllPlayersRowsArePreview
  const isAllPlayersPreview = precomputedAllPlayersRowsArePreview
  const hasPrecomputedAllPlayersRows = allPlayerCardSummaryRows.length > 0
  const effectiveAllPlayersView = hasLoadedFullAllPlayersRows ? allPlayersView : "cards"
  const precomputedAllPlayersRowsByKey = useMemo(() => {
    const map = new Map<string, FantasyPlayerCardSummary>()
    for (const row of allPlayerCardSummaryRows) {
      if (row.playerId !== null) map.set(`id:${row.playerId}`, row)
      const playerKey = normaliseName(row.player)
      if (playerKey) map.set(`name:${playerKey}`, row)
      const localNameKey = row.localName ? normaliseName(row.localName) : ""
      if (localNameKey) map.set(`name:${localNameKey}`, row)
    }
    return map
  }, [allPlayerCardSummaryRows])
  useEffect(() => {
    setAllPlayerCardSummaryRows(precomputedAllPlayersRows)
  }, [precomputedAllPlayersRows])
  const { user } = useUser()
  const hasLoginAccess = canAccessLoginSeason || Boolean(userId)
  const hasFantasyPlotAccess = canBypassPlotGate || hasProPlotAccess(userId, user?.publicMetadata)
  const analysisLocked = !hasFantasyPlotAccess
  const playerDetailsRef = useRef<HTMLElement | null>(null)
  const cardTagsPreferenceUserIdRef = useRef<string | null>(null)
  const selectedPlayerAllYearsRequestKeyRef = useRef<string | null>(null)
  const selectedPlayerAllYearsKey = useMemo(
    () =>
      selectedFantasyName && availableYears.length > 0
        ? `${selectedFantasyName}::${availableYears.join(",")}`
        : null,
    [availableYears, selectedFantasyName]
  )

  useEffect(() => {
    if (!showOwnedCards) return
    let saved: FantasyDashboardPersistedState | null = null
    try {
      window.localStorage.removeItem(FANTASY_DASHBOARD_STATE_STORAGE_KEY)
      saved = parseFantasyDashboardPersistedState(
        window.sessionStorage.getItem(FANTASY_DASHBOARD_STATE_STORAGE_KEY)
      )
      if (!saved) window.sessionStorage.removeItem(FANTASY_DASHBOARD_STATE_STORAGE_KEY)
    } catch {
      saved = null
    }
    if (saved) {
      if (isAllPlayersView(saved.allPlayersView)) setAllPlayersView(saved.allPlayersView)
      if (typeof saved.allPlayersPositionFilter === "string") {
        setAllPlayersPositionFilter(saved.allPlayersPositionFilter)
      }
      if (Array.isArray(saved.allPlayersTagFilters)) {
        setAllPlayersTagFilters(saved.allPlayersTagFilters.filter((tag): tag is string => typeof tag === "string"))
      }
      if (
        saved.allPlayersSort &&
        isAllPlayersSortKey(saved.allPlayersSort.column) &&
        isAllPlayersSortDirection(saved.allPlayersSort.direction)
      ) {
        setAllPlayersSort({
          column: saved.allPlayersSort.column,
          direction: saved.allPlayersSort.direction,
        })
      }
      if (isFantasyAnalyticsMetric(saved.fantasyAnalyticsMetric)) {
        setFantasyAnalyticsMetric(saved.fantasyAnalyticsMetric)
      }
      if (isFantasyAnalyticsPosition(saved.fantasyAnalyticsPositionFilter)) {
        setFantasyAnalyticsPositionFilter(saved.fantasyAnalyticsPositionFilter)
      }
      if (isStatVsFantasyOptionLabel(saved.selectedGlobalStatVsFantasyLabel)) {
        setSelectedGlobalStatVsFantasyLabel(saved.selectedGlobalStatVsFantasyLabel)
      }
      if (isFantasyAnalyticsPosition(saved.globalStatVsFantasyPositionFilter)) {
        setGlobalStatVsFantasyPositionFilter(saved.globalStatVsFantasyPositionFilter)
      }
      if (isFantasyTemplateMode(saved.fantasyTemplateMode)) {
        setFantasyTemplateMode(saved.fantasyTemplateMode)
      }
    }
    setDashboardStateHydrated(true)
  }, [showOwnedCards])

  useEffect(() => {
    if (!showOwnedCards || !dashboardStateHydrated) return
    const state: FantasyDashboardPersistedState = {
      allPlayersView,
      allPlayersPositionFilter,
      allPlayersTagFilters,
      allPlayersSort,
      fantasyAnalyticsMetric,
      fantasyAnalyticsPositionFilter,
      selectedGlobalStatVsFantasyLabel,
      globalStatVsFantasyPositionFilter,
      fantasyTemplateMode,
    }
    try {
      window.sessionStorage.setItem(
        FANTASY_DASHBOARD_STATE_STORAGE_KEY,
        JSON.stringify({ state, updatedAt: Date.now() })
      )
    } catch {
      // Ignore dashboard state storage failures.
    }
  }, [
    allPlayersPositionFilter,
    allPlayersSort,
    allPlayersTagFilters,
    allPlayersView,
    dashboardStateHydrated,
    fantasyAnalyticsMetric,
    fantasyAnalyticsPositionFilter,
    fantasyTemplateMode,
    globalStatVsFantasyPositionFilter,
    selectedGlobalStatVsFantasyLabel,
    showOwnedCards,
  ])

  useEffect(() => {
    if (!isAuthLoaded) return
    if (!userId) {
      cardTagsPreferenceUserIdRef.current = null
      setShowAllPlayersCardTags(false)
      setCardTagsPreferenceHydrated(true)
      return
    }

    try {
      const saved = window.localStorage.getItem(`${FANTASY_CARD_TAGS_STORAGE_KEY_PREFIX}:${userId}`)
      setShowAllPlayersCardTags(saved === "true")
    } catch {
      setShowAllPlayersCardTags(false)
    } finally {
      cardTagsPreferenceUserIdRef.current = userId
      setCardTagsPreferenceHydrated(true)
    }
  }, [isAuthLoaded, userId])

  useEffect(() => {
    if (!isAuthLoaded || !userId || !cardTagsPreferenceHydrated) return
    if (cardTagsPreferenceUserIdRef.current !== userId) return
    try {
      window.localStorage.setItem(`${FANTASY_CARD_TAGS_STORAGE_KEY_PREFIX}:${userId}`, String(showAllPlayersCardTags))
    } catch {
      // Ignore preference storage failures.
    }
  }, [cardTagsPreferenceHydrated, isAuthLoaded, showAllPlayersCardTags, userId])

  const scrollToPlayerDetails = useCallback(() => {
    if (typeof window === "undefined") return
    window.requestAnimationFrame(() => {
      playerDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])
  const tradeSuggestorReady = TRADE_SCREENSHOT_SLOTS.every((slot) => tradeScreenshots[slot.key] !== null)

  const handleTradeScreenshotChange = async (slot: TradeScreenshotSlot, files: FileList | null) => {
    const file = files?.[0]
    if (!file) return

    setIsTradeSuggestorUploading(slot)
    setTradeSuggestorError(null)
    try {
      const screenshot = await buildFantasyTradeScreenshot(file, slot)
      setTradeScreenshots((current) => ({ ...current, [slot]: screenshot }))
    } catch (error) {
      setTradeSuggestorError(error instanceof Error ? error.message : "Unable to upload screenshot.")
    } finally {
      setIsTradeSuggestorUploading(null)
    }
  }

  const handleRunTradeSuggestor = async () => {
    if (!tradeSuggestorReady) {
      setTradeSuggestorError("Upload starters, bench, and trade screen screenshots first.")
      return
    }

    const attachments = TRADE_SCREENSHOT_SLOTS
      .map((slot) => tradeScreenshots[slot.key])
      .filter((screenshot): screenshot is FantasyTradeScreenshot => screenshot !== null)
    const extraContext = tradeSuggestorNotes.trim()
    const tradeSuggestorMetricInstructions = hasFantasyPlotAccess
      ? [
        "Use live fantasy data for both buys and sells: weekly ownership change, breakeven, projection, priced at, L3 average, and projection vs priced at. Projection vs priced at is important.",
        "Try to list 3 Sell watch candidates every time. Use visible squad players only, prioritising confirmed injury/unavailability, negative ownership change, high BE, projection below priced at, weak L3/projection, or poor bye coverage. If fewer than 3 visible players have meaningful sell signals, list fewer rather than inventing names.",
        "Unless a player is injured, out, suspended, not named, or has another clear availability problem, their BE must be above priced at before they can be listed in Sell watch.",
        "If projection is 50+ and projection vs priced at is -5.0 or better, do not list them in Sell watch unless there is a clear offsetting issue like injury, not named, missing an upcoming major bye, Origin risk, or another serious squad/cash constraint.",
        "List a visible player in Sell watch when live data shows their ownership delta is -1.0% or worse, BE is high, projection is below priced at, or they have confirmed injury/unavailability. Discuss whether they are a hard sell, possible sell, or hold using projection, priced at, BE, L3 average, ownership delta, injury/availability markers, and next major bye availability.",
        "If a player is -1.0% or worse in ownership delta but BE is lower than priced at, projection is similar to priced at, L3 is sound, and they play the next major bye, frame them as Hold / Possible sell rather than a hard sell.",
        "Do not say recent form has slipped when L3 average is above priced at.",
        "In each sell/watch player title, include the player name, position, price, and projection, but no rating. In each trade-in title, include the player name, position, price, projection, and rating.",
        "For each sell or buy, use the label Ownership change: and include BE, priced at, L3 average, projection vs priced at, next major bye availability, and one short reason.",
        "Use supplied player tags when they exist for a suggested player: next major bye tags, Origin as an availability risk, and Relevant out with return timing as a secondary role-security note.",
      ]
      : [
        "For free users, do not use projections, breakevens, projection vs priced at, casualty ward context, or Origin context as trade reasons.",
        "Do not write a Pro note inside the generated answer. The UI already tells users Pro unlocks more informed trade advice.",
        "Try to list 3 Sell watch candidates every time. Use visible squad players only, prioritising confirmed injury/unavailability, negative ownership change, weak L3 or season average for the price, poor bye coverage, or awkward cash/squad fit. If fewer than 3 visible players have meaningful sell signals, list fewer rather than inventing names.",
        "List a visible player in Sell watch when live data shows their ownership delta is -1.0% or worse, their recent form is weak for the price, or they have confirmed injury/unavailability. Discuss whether they are a hard sell, possible sell, or hold.",
        "If a player is -1.0% or worse in ownership delta but L3 is sound, bye coverage is useful, and there is no availability issue, frame them as Hold / Possible sell rather than a hard sell.",
        "In each sell/watch player title, include the player name, position, and price, but no rating. In each trade-in title, include the player name, position, price, and rating.",
        "For each sell or buy, use the label Ownership change: and include priced at, average/L3 form, next major bye availability, and one short reason. Do not include projections, breakevens, or projection vs priced at for free users.",
        "Use next major bye tags when they exist for a suggested player. Do not use Origin or Relevant out context for free users.",
      ]
    const prompt = [
      "Fantasy Trade Suggestor dashboard request.",
      "Read the uploaded NRL Fantasy screenshots: starters, bench, and trade screen.",
      "Give a concise, friendly trade summary for this week.",
      ...tradeSuggestorMetricInstructions,
      "Include whether each buy/sell plays or misses the next major bye round.",
      "Only suggest sells from players visible in the user's squad screenshots. Do not invent sell candidates.",
      "If a visible player is not playing and has a strong negative ownership delta, mention them in Sell watch even if the screenshot was taken before final team status was known.",
      "Write for non-technical users: be clear, friendly, and direct. Do not mention thresholds, snapshots, filters, or why a backend rule did or did not trigger.",
      "Write every reason as one normal sentence. Do not use compressed stat shorthand or fragments like value v pricedAt, momentum + ownership, scored floor, field 13, or helps field 13. Say things like projects well for his price, has a reliable scoring floor, or helps your major-bye coverage.",
      "Do not cite ownership movement as the written reason for a recommendation. Ownership change may appear in the details line only; the reason sentence should use form, price/value, role, bye coverage, availability, or squad-fit context.",
      "Tone for Sell watch: advice first, warm and practical. Do not sound like OCR/debug output. For an injured expensive player, explain that selling can free salary to bring in a stronger replacement or premium option. Do not write blunt phrases like projection is 0, avoid a zero score, your screenshot shows, or red injury marker.",
      "Do not use screenshot slot, bench, INT, EMG, or reserve position as a sell reason. Good players can be in emergencies; squad location is irrelevant for sell logic.",
      "Do not infer this-week availability from screenshot slot or absence from a snapshot. If real metrics are unavailable for a visible player and there is no clear injury/suspension marker, treat them as a hold/no clear sell instead of inventing projection 0 or unknown stats.",
      "A player visible anywhere in the user's screenshots is already owned. Do not recommend any visible squad player as a trade-in, even if they appear in the buy data.",
      "Use real player names from live data. Do not output OCR-invented names or expand abbreviated names unless they match a real player.",
      "Do not say a player has an injury marker unless a red cross/plus is visibly attached to that exact player in the screenshots.",
      ...(hasFantasyPlotAccess
        ? [
          "For any visible player with a red cross/plus injury marker or clear out/unavailable status, use casualty ward context to decide hold versus sell: 2 weeks or less can be a hold, especially with a low BE; 3 weeks or more is a stronger sell; TBC/unknown should be called uncertain with a note to check the latest injury news.",
          "Use supplied casualty ward role-pressure and Origin chance context only as secondary tie-breakers. Do not let them outweigh clear ownership, form, value, injury, bye or lineup signals.",
          "If casualty ward lists a player but current lineups say he is named to play this week, ignore casualty ward for that player and do not describe him as injured from casualty ward.",
        ]
        : []),
      "Do not use the phrase visible red injury marker unless a red cross/plus is plainly attached to the exact player row/card. If uncertain, omit injury completely.",
      "Do not mention an injury marker for J. Hughes/Hughes unless the marker is unambiguously attached to his exact player tile.",
      "Do not invent trade-in names outside live buy/value data. If fewer than five eligible non-owned trade-ins remain after excluding visible squad players, list fewer than five.",
      "Give each trade-in a rating out of 10. Do not rate sell/watch players.",
      "Always include Top 5 trade-ins when eligible live buy/value data is supplied. If fewer than five eligible players remain, list the eligible players that remain.",
      "Return exactly these sections in this order: Sell watch, Top 5 trade-ins, Recommended Moves.",
      "Order Sell watch by urgency and context. Rank Top 5 trade-ins by rating, highest first.",
      "If a sell is not clear, say hold rather than forcing one.",
      "When recommending moves, treat keeping the user's remaining bank below about 100k as a real constraint when the visible bank and prices make that possible.",
      "Do not recommend only an expensive sell to a much cheaper trade-in if that leaves hundreds of thousands unused. If a cheap replacement is the best value, pair it with a second move that upgrades a cheap owned player to a more expensive target using the freed salary. If you cannot identify a good second upgrade, prefer a one-trade move from the expensive sell to a more expensive trade-in that keeps bank under about 100k.",
      "When suggesting a two-trade path, use a cheap owned player visible in the squad as the second sell and a real trade-in target from the supplied buy/value data as the upgrade. Do not invent the second sell or buy.",
      "Do not ask follow-up questions. Make the best reasonable assumption and mention critical uncertainty briefly inside Recommended Moves.",
      "Do not offer follow-up actions or say phrases like if you want, I can, or I'll show. Find Trades is a one-shot answer.",
      "Do not expose backend rules, snapshot rules, guardrails, sell/watch data, live momentum snapshots, highly-sold snapshots, thresholds, eligibility filters, uploaded squad checks, or phrases like negative ownership delta sell rule. Do not add a Notes section unless there is critical screenshot uncertainty.",
      extraContext ? `Extra user context: ${extraContext}` : "",
    ].filter(Boolean).join("\n")

    setIsTradeSuggestorSubmitting(true)
    setTradeSuggestorError(null)
    setTradeSuggestorResult(null)
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          persist: false,
          imageAttachments: attachments.map((screenshot) => {
            const slotLabel = TRADE_SCREENSHOT_SLOTS.find((slot) => slot.key === screenshot.slot)?.label ?? screenshot.slot
            return {
              name: `${slotLabel}: ${screenshot.name}`,
              context: "fantasy",
              mediaType: screenshot.mediaType,
              dataUrl: screenshot.dataUrl,
            }
          }),
        }),
      })
      const contentType = response.headers.get("content-type") ?? ""
      const data = contentType.includes("application/json")
        ? ((await response.json()) as FantasyTradeSuggestorResponse)
        : null
      const assistantMessage = data?.assistantMessage ?? data?.error
      if (!response.ok || !assistantMessage) {
        throw new Error(assistantMessage ?? "Unable to generate trade suggestions.")
      }
      setTradeSuggestorResult(
        expandInitialSurnamePlayerNames(assistantMessage, fantasyPlayers.map((player) => player.name))
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate trade suggestions."
      setTradeSuggestorError(
        message.toLowerCase() === "fetch failed"
          ? "Could not reach the AI route. Make sure the local dev server is running and has external network access."
          : message
      )
    } finally {
      setIsTradeSuggestorSubmitting(false)
    }
  }

  const navigateToPlayer = useCallback(
    (name: string) => {
      if (playerRouteBasePath) {
        const sourceQuery = showAllPlayersOnly ? "?from=all-players" : ""
        router.push(`${playerRouteBasePath}/${encodeURIComponent(fantasyPlayerSlug(name))}${sourceQuery}`)
        return
      }
      setSelectedFantasyName(name)
      scrollToPlayerDetails()
    },
    [playerRouteBasePath, router, scrollToPlayerDetails, showAllPlayersOnly]
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
    const hasSelectedPlayerAllYears =
      preloadSelectedPlayerAllYears &&
      selectedPlayerAllYearsKey !== null &&
      preloadedSelectedPlayerAllYearsKey === selectedPlayerAllYearsKey
    if (preloadedPlayerAllYears || hasSelectedPlayerAllYears) {
      void loadTeammateLookupRows(nextYears)
      return
    }
    const selectedPlayerStatsName = showPlayerDetails && selectedFantasyName ? selectedFantasyName : undefined
    setIsLoadingStats(true)
    try {
      const res = await fetch(playerStatsApiUrl(nextYears, selectedPlayerStatsName))
      if (!res.ok) return
      const data = (await res.json()) as PlayerStat[]
      setAllData(Array.isArray(data) ? data : [])
      const loadedEveryAvailableYear =
        selectedPlayerStatsName &&
        selectedPlayerAllYearsKey &&
        nextYears.length === availableYears.length &&
        nextYears.every((year, index) => year === availableYears[index])
      if (loadedEveryAvailableYear) {
        setPreloadedSelectedPlayerAllYearsKey(selectedPlayerAllYearsKey)
      } else if (selectedPlayerStatsName) {
        setPreloadedSelectedPlayerAllYearsKey(null)
      }
    } finally {
      setIsLoadingStats(false)
    }
  }, [
    availableYears,
    loadTeammateLookupRows,
    preloadedPlayerAllYears,
    preloadedSelectedPlayerAllYearsKey,
    preloadSelectedPlayerAllYears,
    selectedFantasyName,
    selectedPlayerAllYearsKey,
    showPlayerDetails,
  ])

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
  const selectedLineupRole = useMemo(
    () =>
      selectedFantasyPlayer
        ? (
          lineupsProjections?.roleByPlayerId.get(selectedFantasyPlayer.id) ??
          lineupsProjections?.roleByPlayerName.get(normaliseProjectionPlayerName(selectedFantasyPlayer.name)) ??
          null
        )
        : null,
    [lineupsProjections, selectedFantasyPlayer]
  )
  const selectedRelevantOuts = useMemo(() => {
    if (
      lineupsProjections?.source !== "lineups" ||
      !selectedLineupRole?.isOnField ||
      !selectedLineupRole.team ||
      !selectedLineupRole.position
    ) {
      return relevantOuts
    }

    const namedLineupPlayers = new Set(lineupsProjections.roleByPlayerName.keys())
    const fantasyPlayerByName = new Map(
      fantasyPlayers.map((player) => [normaliseProjectionPlayerName(player.name), player])
    )
    return relevantOutCandidates
      .filter((row) => isRelevantOutCandidate({
        row,
        lineupTeam: selectedLineupRole.team,
        lineupPosition: selectedLineupRole.position,
        namedLineupPlayers,
        fantasyPlayerByName,
      }))
      .slice(0, 8)
  }, [fantasyPlayers, lineupsProjections, relevantOutCandidates, relevantOuts, selectedLineupRole])

  const selectedFantasyCoachRound = useMemo(() => {
    return lineupsProjections?.round ?? selectedFantasyCoachMetrics.round
  }, [lineupsProjections, selectedFantasyCoachMetrics])

  const selectedYearData = useMemo(() => {
    if (selectedYears.length === 0) return allData
    return allData.filter((row) => selectedYears.includes(playerStatYear(row)))
  }, [allData, selectedYears])

  const teammateLookupSourceRows = useMemo(
    () => (teammateLookupRows.length > 0 ? teammateLookupRows : selectedYearData),
    [teammateLookupRows, selectedYearData]
  )

  const allLocalNames = useMemo(
    () => Array.from(new Set([...allData, ...teammateLookupRows].map((row) => row.Name))).sort(),
    [allData, teammateLookupRows]
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
    const matchedKey = normaliseName(matchedLocalName)
    return selectedYearData.filter((row) => normaliseName(row.Name) === matchedKey)
  }, [matchedLocalName, selectedYearData])
  const playerRowsAllYears = useMemo(() => {
    if (!matchedLocalName) return []
    const matchedKey = normaliseName(matchedLocalName)
    return allData.filter((row) => normaliseName(row.Name) === matchedKey)
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
    if (!showPlayerDetails || !hasLoginAccess) return
    void loadTeammateLookupRows(selectedYears)
  }, [hasLoginAccess, loadTeammateLookupRows, selectedYears, showPlayerDetails])

  useEffect(() => {
    if (
      !preloadSelectedPlayerAllYears ||
      !showPlayerDetails ||
      !selectedFantasyName ||
      availableYears.length === 0 ||
      !selectedPlayerAllYearsKey ||
      preloadedSelectedPlayerAllYearsKey === selectedPlayerAllYearsKey ||
      selectedPlayerAllYearsRequestKeyRef.current === selectedPlayerAllYearsKey
    ) {
      return
    }

    let cancelled = false
    selectedPlayerAllYearsRequestKeyRef.current = selectedPlayerAllYearsKey

    const loadSelectedPlayerAllYears = async () => {
      try {
        const res = await fetch(playerStatsApiUrl(availableYears, selectedFantasyName))
        if (!res.ok) return
        const data = (await res.json()) as PlayerStat[]
        if (!cancelled && Array.isArray(data)) {
          setAllData(data)
          setPreloadedSelectedPlayerAllYearsKey(selectedPlayerAllYearsKey)
        }
      } catch (error) {
        console.error("Failed to preload selected fantasy player stats", error)
      } finally {
        if (selectedPlayerAllYearsRequestKeyRef.current === selectedPlayerAllYearsKey) {
          selectedPlayerAllYearsRequestKeyRef.current = null
        }
      }
    }

    void loadSelectedPlayerAllYears()
    return () => {
      cancelled = true
    }
  }, [
    availableYears,
    preloadedSelectedPlayerAllYearsKey,
    preloadSelectedPlayerAllYears,
    selectedFantasyName,
    selectedPlayerAllYearsKey,
    showPlayerDetails,
  ])

  useEffect(() => {
    setHasRequestedAllPlayersStats(false)
  }, [])

  useEffect(() => {
    if (hasAllPlayerStatsForYear(initialAllPlayerStats, ALL_PLAYERS_STATS_YEAR)) {
      setAllPlayersStatsData(initialAllPlayerStats)
      setHasRequestedAllPlayersStats(false)
      setAllPlayersStatsLoadFailed(false)
    }
  }, [initialAllPlayerStats])

  useEffect(() => {
    if (
      !showOwnedCards ||
      hasPrecomputedAllPlayersRows ||
      allPlayersStatsLoadFailed ||
      hasRequestedAllPlayersStats ||
      hasAllPlayerStatsForYear(allPlayersStatsSourceData, ALL_PLAYERS_STATS_YEAR)
    ) return

    let cancelled = false
    setHasRequestedAllPlayersStats(true)
    const loadAllPlayersYear = async () => {
      try {
        const res = await fetch(playerStatsApiUrl([ALL_PLAYERS_STATS_YEAR]))
        if (!res.ok) {
          if (!cancelled) setAllPlayersStatsLoadFailed(true)
          return
        }
        const data = (await res.json()) as PlayerStat[]
        if (!cancelled && Array.isArray(data)) {
          if (hasAllPlayerStatsForYear(data, ALL_PLAYERS_STATS_YEAR)) {
            setAllPlayersStatsData(data)
          } else {
            setAllPlayersStatsLoadFailed(true)
          }
        }
      } catch (error) {
        if (!cancelled) setAllPlayersStatsLoadFailed(true)
        console.error("Failed to load all fantasy player stats", error)
      } finally {
        if (!cancelled) setHasRequestedAllPlayersStats(false)
      }
    }

    void loadAllPlayersYear()
    return () => {
      cancelled = true
    }
  }, [allPlayersStatsLoadFailed, allPlayersStatsSourceData, hasPrecomputedAllPlayersRows, hasRequestedAllPlayersStats, showOwnedCards])

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
    setFantasyAnalyticsMetric((current) => (current === "projection" ? "last3" : current))
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

  const originChancePlayerNames = useMemo(
    () => new Set(originChances.map((row) => normaliseProjectionPlayerName(row.player)).filter(Boolean)),
    [originChances]
  )
  const casualtyWardPlayerNames = useMemo(
    () => new Set(
      [...casualtyWardRows, ...relevantOuts, ...relevantOutCandidates]
        .map((row) => normaliseProjectionPlayerName(row.player))
        .filter(Boolean)
    ),
    [casualtyWardRows, relevantOutCandidates, relevantOuts]
  )

 const allPlayersTableRows = useMemo<AllPlayersTableRow[]>(() => {
    const rows2026 = allPlayersStatsSourceData.filter((row) => playerStatYear(row) === ALL_PLAYERS_STATS_YEAR)
    const localNames = Array.from(new Set(rows2026.map(playerStatName).filter(Boolean))).sort()
    const rowsByName = new Map<string, PlayerStat[]>()
    for (const row of rows2026) {
      const name = playerStatName(row)
      if (!name) continue
      const rows = rowsByName.get(name) ?? []
      rows.push(row)
      rowsByName.set(name, rows)
    }

    const baseFantasyPlayers = fantasyPlayers.length > 0
      ? fantasyPlayers
      : buildFallbackFantasyPlayersFromStats(rowsByName)
    const fantasyPlayerById = new Map(baseFantasyPlayers.map((player) => [player.id, player]))
    const fantasyPlayerByNormalizedName = new Map(
      baseFantasyPlayers.map((player) => [normaliseName(player.name), player])
    )
    const previewFallbackCandidates = baseFantasyPlayers.map((player) => ({
      player,
      weeklyChange: ownershipDeltaByPlayerId.get(player.id),
    }))
    const hasPositiveWeeklyChange = previewFallbackCandidates.some((entry) => entry.weeklyChange != null && entry.weeklyChange > 0)
    const previewFallbackPlayers = previewFallbackCandidates
      .filter((entry) => !hasPositiveWeeklyChange || (entry.weeklyChange != null && entry.weeklyChange > 0))
      .sort((a, b) => {
        if (hasPositiveWeeklyChange) {
          const aChange = a.weeklyChange ?? -Infinity
          const bChange = b.weeklyChange ?? -Infinity
          if (aChange !== bChange) return bChange - aChange
        }
        return (b.player.cost ?? -1) - (a.player.cost ?? -1)
      })
      .slice(0, ALL_PLAYERS_PREVIEW_LIMIT)
      .map((entry) => entry.player)
    const sourceFantasyPlayers = isAllPlayersPreview
      ? allPlayerCardSummaryRows.length > 0
        ? allPlayerCardSummaryRows.map((row, index): FantasyPlayerSnapshot => {
          const existingPlayer =
            (row.playerId !== null ? fantasyPlayerById.get(row.playerId) : undefined) ??
            fantasyPlayerByNormalizedName.get(normaliseName(row.player))
          if (existingPlayer) return existingPlayer
          const positionLabel = row.position || "POS"
          return {
            id: row.playerId ?? -100000 - index,
            firstName: "",
            lastName: row.player,
            name: row.player,
            squadId: null,
            cost: row.price,
            status: null,
            positions: [],
            positionLabels: positionLabel ? [positionLabel] : [],
            positionLabel,
            ownedBy: row.ownedBy,
            selections: null,
            avgPoints: row.avg2026,
            projectedAvg: row.projection,
            gamesPlayed: row.gamesPlayed,
            totalPoints: null,
            tog: null,
            be: row.breakeven,
            pricedAt: row.pricedAt,
            isBye: false,
            locked: false,
            priceHistory: {},
            scoreHistory: {},
          }
        })
        : previewFallbackPlayers
      : baseFantasyPlayers
    const namedLineupPlayers = new Set(lineupsProjections?.roleByPlayerName.keys() ?? [])
    const fantasyPlayerByName = new Map(
      sourceFantasyPlayers.map((player) => [normaliseProjectionPlayerName(player.name), player])
    )

    return sourceFantasyPlayers.map((player) => {
      const precomputedRow =
        precomputedAllPlayersRowsByKey.get(`id:${player.id}`) ??
        precomputedAllPlayersRowsByKey.get(`name:${normaliseName(player.name)}`) ??
        null
      const displayPlayer = precomputedRow
        ? {
          ...player,
          cost: precomputedRow.price ?? player.cost,
          ownedBy: precomputedRow.ownedBy ?? player.ownedBy,
          positionLabel: player.positionLabel || precomputedRow.position || "POS",
          positionLabels: player.positionLabels.length > 0
            ? player.positionLabels
            : precomputedRow.position
              ? [precomputedRow.position]
              : player.positionLabels,
          pricedAt: precomputedRow.pricedAt ?? player.pricedAt,
          be: precomputedRow.breakeven ?? player.be,
          gamesPlayed: precomputedRow.gamesPlayed ?? player.gamesPlayed,
        }
        : player
      const precomputedLocalNameMatches = precomputedRow?.localName
        ? findLocalPlayerMatch(player.name, [precomputedRow.localName]) === precomputedRow.localName
        : false
      const precomputedStatsRow = precomputedLocalNameMatches ? precomputedRow : null
      const localName = precomputedStatsRow?.localName ?? findLocalPlayerMatch(player.name, localNames)
      const playerRows = localName ? rowsByName.get(localName) ?? [] : []
      const fantasyScores = playerRows.map((row) => playerStatMetricValue(row, "Fantasy", "total_points"))
      const minutes = playerRows.map((row) => playerStatMetricValue(row, "Mins Played", "mins_played"))
      const totalFantasy = fantasyScores.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      const totalMinutes = minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      const recentScores = precomputedStatsRow?.last3 != null
        ? []
        : [...playerRows]
          .sort(sortRoundsDesc)
          .slice(0, 3)
          .map((row) => playerStatMetricValue(row, "Fantasy", "total_points"))
      const coachPlayer = fantasyCoachPlayers.find((entry) => entry.id === player.id)
      const coachMetrics = getFantasyCoachRoundMetrics(coachPlayer)
      const ownershipDelta = ownershipDeltaByPlayerId.get(player.id) ?? null
      const teamHint = precomputedRow?.team ?? (playerRows.length > 0 ? primaryTeamForRows(playerRows) : null)
      const imageRow =
        resolvePlayerImage(localName ?? player.name, teamHint, playerImages) ??
        resolvePlayerImage(player.name, teamHint, playerImages)
      const projectionRound = lineupsProjections?.round ?? coachMetrics.round
      const lineupRole =
        lineupsProjections?.roleByPlayerId.get(player.id) ??
        lineupsProjections?.roleByPlayerName.get(normaliseProjectionPlayerName(player.name)) ??
        null
      const projectionTeam = lineupRole?.team ?? teamHint ?? imageRow?.team ?? null
      const officialProjectionRoundPlays = teamPlaysInRound(draw2026Data, projectionRound, projectionTeam)
      const rawProjection = resolveFantasyProjectionForLineups(
        player,
        lineupsProjections,
        coachMetrics.projection,
        casualtyWardPlayerNames,
        officialProjectionRoundPlays === false
      )
      const pricedAt = displayPlayer.pricedAt
      const originChance = originChancePlayerNames.has(normaliseProjectionPlayerName(player.name))
      const projection = precomputedRow?.projection ?? rawProjection
      const effectivePricedAt = precomputedRow?.pricedAt ?? pricedAt
      const value = precomputedRow?.value ?? roundedFantasyValue(projection, effectivePricedAt)
      const nextMajorByeRound = precomputedRow?.nextMajorByeRound ?? getNextMajorByeRound(projectionRound)
      const byeTeam = projectionTeam
      const playsNextMajorBye = precomputedRow?.playsNextMajorBye ?? teamPlaysInRound(draw2026Data, nextMajorByeRound, byeTeam)
      const majorByeRoundTags = MAJOR_BYE_ROUNDS
        .filter((round) => nextMajorByeRound != null && round >= nextMajorByeRound)
        .map((round) => ({
          round,
          plays: teamPlaysInRound(draw2026Data, round, byeTeam),
        }))
      const relevantOutRows =
        lineupsProjections?.source === "lineups" && lineupRole?.isOnField && lineupRole.team && lineupRole.position
          ? relevantOutCandidates
            .filter(
              (row) => isRelevantOutCandidate({
                row,
                lineupTeam: lineupRole.team,
                lineupPosition: lineupRole.position,
                namedLineupPlayers,
                fantasyPlayerByName,
              })
            )
            .slice(0, 8)
          : []

      return {
        player: displayPlayer,
        localName,
        imageRow,
        avg2026: precomputedStatsRow?.avg2026 ?? averageNumbers(fantasyScores) ?? player.avgPoints,
        last3: precomputedStatsRow?.last3 ?? averageNumbers(recentScores),
        ppm: precomputedStatsRow?.ppm ?? (totalMinutes > 0 ? totalFantasy / totalMinutes : null),
        weeklyChange: precomputedRow?.weeklyChange ?? ownershipDelta,
        pricedAt: effectivePricedAt,
        projection,
        value,
        breakeven: precomputedRow?.breakeven ?? applyFantasyBreakEvenOffset(
          coachMetrics.breakEven ?? player.be ?? null,
          player.id,
          projectionRound
        ),
        relevantOuts: relevantOutRows,
        majorByeRoundTags,
        nextMajorByeRound,
        playsNextMajorBye,
        originChance: precomputedRow?.originChance ?? originChance,
        gamesPlayed: Math.trunc(precomputedStatsRow?.gamesPlayed ?? (playerRows.length || player.gamesPlayed || 0)),
      }
    })
  }, [allPlayerCardSummaryRows, allPlayersStatsSourceData, casualtyWardPlayerNames, draw2026Data, fantasyCoachPlayers, fantasyPlayers, isAllPlayersPreview, lineupsProjections, originChancePlayerNames, ownershipDeltaByPlayerId, playerImages, precomputedAllPlayersRowsByKey, relevantOutCandidates])

  const selectedAllPlayersTableRow = useMemo(
    () => selectedFantasyPlayer
      ? allPlayersTableRows.find((row) => row.player.id === selectedFantasyPlayer.id) ?? null
      : null,
    [allPlayersTableRows, selectedFantasyPlayer]
  )
  const selectedDisplayFantasyPlayer = selectedAllPlayersTableRow?.player ?? selectedFantasyPlayer

  const fantasyAnalyticsPoints = useMemo<FantasyAnalyticsPoint[]>(
    () =>
      allPlayersTableRows.map((row) => ({
        name: row.player.name,
        position: row.player.positionLabel,
        positionLabels: row.player.positionLabels,
        tagFilters: getFantasyFilterTags(row),
        imageUrl: getPlayerThumbnailUrl(row.imageRow),
        team: row.imageRow?.team ?? null,
        price: row.player.cost,
        pricedAt: row.player.pricedAt,
        avg2026: row.avg2026,
        last3: row.last3,
        breakeven: row.breakeven,
        projection: row.projection,
      })),
    [allPlayersTableRows]
  )

  const pricedAtProjectionPoints = useMemo(
    () => {
      return fantasyAnalyticsPoints.filter((point) => {
        const metricValue = getFantasyAnalyticsMetricValue(point, fantasyAnalyticsMetric)
        return (
          (fantasyAnalyticsPositionFilter === "All Positions" ||
            point.positionLabels.includes(fantasyAnalyticsPositionFilter)) &&
          matchesFantasyTagFilters(point.tagFilters, allPlayersTagFilters) &&
          point.pricedAt !== null &&
          metricValue !== null &&
          metricValue > 0 &&
          Number.isFinite(point.pricedAt) &&
          Number.isFinite(metricValue)
        )
      })
    },
    [allPlayersTagFilters, fantasyAnalyticsMetric, fantasyAnalyticsPoints, fantasyAnalyticsPositionFilter]
  )
  const fantasyAnalyticsMetricOption =
    FANTASY_ANALYTICS_METRICS.find((metric) => metric.key === fantasyAnalyticsMetric) ?? FANTASY_ANALYTICS_METRICS[0]
  const selectedGlobalStatVsFantasyOption = useMemo(
    () =>
      STAT_VS_FANTASY_OPTIONS.find((option) => option.label === selectedGlobalStatVsFantasyLabel) ??
      STAT_VS_FANTASY_OPTIONS[0],
    [selectedGlobalStatVsFantasyLabel]
  )
  const globalStatVsFantasyPoints = useMemo<GlobalStatVsFantasyPoint[]>(() => {
    const rows2026 = allPlayersStatsSourceData.filter((row) => playerStatYear(row) === ALL_PLAYERS_STATS_YEAR)
    const rowsByName = new Map<string, PlayerStat[]>()

    for (const row of rows2026) {
      const name = playerStatName(row)
      if (!name) continue
      const rows = rowsByName.get(name) ?? []
      rows.push(row)
      rowsByName.set(name, rows)
    }

    return allPlayersTableRows.flatMap((row) => {
      if (!row.localName || row.avg2026 === null) return []
      const playerRows = rowsByName.get(row.localName) ?? []
      const statValue = averageNumbers(
        playerRows.map((playerRow) =>
          playerStatMetricValue(
            playerRow,
            selectedGlobalStatVsFantasyOption.key,
            selectedGlobalStatVsFantasyOption.rawKey,
          )
        )
      )
      if (statValue === null) return []
      return [{
        name: row.player.name,
        position: row.player.positionLabel,
        positionLabels: row.player.positionLabels,
        tagFilters: getFantasyFilterTags(row),
        imageUrl: getPlayerThumbnailUrl(row.imageRow),
        team: row.imageRow?.team ?? null,
        price: row.player.cost,
        statValue,
        fantasyAvg: row.avg2026,
      }]
    })
  }, [allPlayersStatsSourceData, allPlayersTableRows, selectedGlobalStatVsFantasyOption.key, selectedGlobalStatVsFantasyOption.rawKey])
  const filteredGlobalStatVsFantasyPoints = useMemo(
    () =>
      globalStatVsFantasyPoints.filter(
        (point) =>
          (globalStatVsFantasyPositionFilter === "All Positions" ||
            point.positionLabels.includes(globalStatVsFantasyPositionFilter)) &&
          matchesFantasyTagFilters(point.tagFilters, allPlayersTagFilters)
      ),
    [allPlayersTagFilters, globalStatVsFantasyPoints, globalStatVsFantasyPositionFilter]
  )
  const globalStatVsFantasyCorrelation = useMemo(() => {
    if (filteredGlobalStatVsFantasyPoints.length < 2) return null
    return pearsonR(
      filteredGlobalStatVsFantasyPoints.map((point) => point.statValue),
      filteredGlobalStatVsFantasyPoints.map((point) => point.fantasyAvg)
    )
  }, [filteredGlobalStatVsFantasyPoints])
  const globalStatVsFantasyTrendline = useMemo(() => {
    if (filteredGlobalStatVsFantasyPoints.length < 2) return null
    return linearRegression(
      filteredGlobalStatVsFantasyPoints.map((point) => point.statValue),
      filteredGlobalStatVsFantasyPoints.map((point) => point.fantasyAvg)
    )
  }, [filteredGlobalStatVsFantasyPoints])
  const hasRawStatsForGlobalStatVsFantasy = allPlayersStatsSourceData.some(
    (row) => playerStatYear(row) === ALL_PLAYERS_STATS_YEAR
  )

  const fantasyTemplateRows = useMemo<Array<{ label: string; slots: FantasyTemplateSlot[] }>>(() => {
    const usedPlayerIds = new Set<number>()
    const rankedRows = [...allPlayersTableRows].sort((a, b) => {
      const aValue = fantasyTemplateMode === "ownership" ? a.player.ownedBy : a.weeklyChange
      const bValue = fantasyTemplateMode === "ownership" ? b.player.ownedBy : b.weeklyChange
      return (bValue ?? -Infinity) - (aValue ?? -Infinity)
    })

    return FANTASY_TEMPLATE_ROWS.map((row) => ({
      label: row.label,
      slots: row.slots.map((slot) => {
        const selectedRow =
          rankedRows.find(
            (playerRow) =>
              !usedPlayerIds.has(playerRow.player.id) &&
              playerRow.player.positionLabels.includes(slot) &&
              (fantasyTemplateMode === "ownership" ? playerRow.player.ownedBy !== null : playerRow.weeklyChange !== null)
          ) ?? null

        if (selectedRow) usedPlayerIds.add(selectedRow.player.id)
        return { slot, row: selectedRow }
      }),
    }))
  }, [allPlayersTableRows, fantasyTemplateMode])

  const sortedAllPlayersTableRows = useMemo(() => {
    let filteredRows =
      !hasLoadedFullAllPlayersRows || allPlayersPositionFilter === "All Positions"
        ? allPlayersTableRows
        : allPlayersTableRows.filter((row) => row.player.positionLabels.includes(allPlayersPositionFilter))
    if (hasLoadedFullAllPlayersRows && allPlayersTagFilters.length > 0) {
      filteredRows = filteredRows.filter(
        (row) => matchesFantasyTagFilters(getFantasyFilterTags(row), allPlayersTagFilters)
      )
    }
    const activeAllPlayersSort = hasLoadedFullAllPlayersRows
      ? allPlayersSort
      : { column: "weeklyChange" as const, direction: "desc" as const }
    const weeklyChangeUnavailable = filteredRows.every((row) => row.weeklyChange === null || row.weeklyChange === 0)
    const projectionUnavailable = filteredRows.every((row) => row.projection === null)
    const effectiveSort =
      (activeAllPlayersSort.column === "weeklyChange" && weeklyChangeUnavailable) ||
      (activeAllPlayersSort.column === "projection" && projectionUnavailable)
        ? { column: "price" as const, direction: "desc" as const }
        : activeAllPlayersSort

    const getSortValue = (row: AllPlayersTableRow): number | string | null => {
      if (effectiveSort.column === "name") return row.player.name.toLowerCase()
      if (effectiveSort.column === "position") return row.player.positionLabel.toLowerCase()
      if (effectiveSort.column === "weeklyChange") return row.weeklyChange
      if (effectiveSort.column === "ownPercent") return row.player.ownedBy
      if (effectiveSort.column === "price") return row.player.cost
      if (effectiveSort.column === "pricedAt") return row.pricedAt
      if (effectiveSort.column === "avg2026") return row.avg2026
      if (effectiveSort.column === "last3") return row.last3
      if (effectiveSort.column === "ppm") return row.ppm
      if (effectiveSort.column === "projection") return row.projection
      if (effectiveSort.column === "value") return row.value
      if (effectiveSort.column === "breakeven") return row.breakeven
      if (effectiveSort.column === "gamesPlayed") return row.gamesPlayed

      return null
    }

    return [...filteredRows].sort((a, b) => {
      const aValue = getSortValue(a)
      const bValue = getSortValue(b)
      if (aValue === null && bValue === null) return a.player.name.localeCompare(b.player.name)
      if (aValue === null) return 1
      if (bValue === null) return -1

      const direction = effectiveSort.direction === "asc" ? 1 : -1
      if (typeof aValue === "number" && typeof bValue === "number") {
        if (aValue !== bValue) return (aValue - bValue) * direction
        return a.player.name.localeCompare(b.player.name)
      }

      return String(aValue).localeCompare(String(bValue)) * direction
    })
  }, [allPlayersPositionFilter, allPlayersSort, allPlayersTableRows, allPlayersTagFilters, hasLoadedFullAllPlayersRows])

  const allPlayersTagFilterOptions = useMemo(() => {
    const byeOptions = new Set<string>()
    let hasOriginChance = false
    for (const row of allPlayersTableRows) {
      for (const tag of filterFutureMajorByeRoundTags(row.majorByeRoundTags, row.nextMajorByeRound)) {
        const byeTag = formatNextMajorByeTag(tag.round, tag.plays)
        if (byeTag) byeOptions.add(byeTag)
      }
      if (row.originChance) hasOriginChance = true
    }
    return [
      ...Array.from(byeOptions).sort(sortFantasyTagFilterOptions),
      ...(hasOriginChance ? [FANTASY_FILTER_TAG_ORIGIN_CHANCE] : []),
    ]
  }, [allPlayersTableRows])

  useEffect(() => {
    if (!dashboardStateHydrated || allPlayersTagFilters.length === 0) return
    const availableTags = new Set(allPlayersTagFilterOptions)
    const validTags = allPlayersTagFilters.filter((tag) => availableTags.has(tag))
    if (validTags.length !== allPlayersTagFilters.length) {
      setAllPlayersTagFilters(validTags)
    }
  }, [allPlayersTagFilterOptions, allPlayersTagFilters, dashboardStateHydrated])

  const availableAllPlayersMobileSortOptions = useMemo(
    () => ALL_PLAYERS_MOBILE_SORT_OPTIONS.filter((option) => hasFantasyPlotAccess || !option.proOnly),
    [hasFantasyPlotAccess]
  )
  const selectedAllPlayersMobileSortLabel =
    availableAllPlayersMobileSortOptions.find((option) => option.key === allPlayersSort.column)?.label ??
    availableAllPlayersMobileSortOptions[0]?.label ??
    "Weekly"

  const toggleAllPlayersSort = useCallback((column: AllPlayersSortKey, disabled = false) => {
    if (disabled) return
    setAllPlayersSort((current) => ({
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
    }))
  }, [])

  const selectedOwnershipDelta = useMemo(
    () =>
      selectedAllPlayersTableRow?.weeklyChange ??
      (selectedFantasyPlayer
        ? (ownershipDeltaByPlayerId.get(selectedFantasyPlayer.id) ?? null)
        : null),
    [ownershipDeltaByPlayerId, selectedAllPlayersTableRow, selectedFantasyPlayer]
  )
  const selectedAdjustedProjection = useMemo(
    () => {
      if (selectedAllPlayersTableRow?.projection != null) return selectedAllPlayersTableRow.projection
      if (!selectedFantasyPlayer) return null
      const projectionTeam = selectedLineupRole?.team ?? fantasyCardImage?.team ?? latestLocalTeam ?? null
      const officialProjectionRoundPlays = teamPlaysInRound(draw2026Data, selectedFantasyCoachRound, projectionTeam)
      return resolveFantasyProjectionForLineups(
        selectedFantasyPlayer,
        lineupsProjections,
        selectedFantasyCoachMetrics.projection,
        casualtyWardPlayerNames,
        officialProjectionRoundPlays === false
      )
    },
    [casualtyWardPlayerNames, draw2026Data, fantasyCardImage, latestLocalTeam, lineupsProjections, selectedAllPlayersTableRow, selectedFantasyCoachMetrics, selectedFantasyCoachRound, selectedFantasyPlayer, selectedLineupRole]
  )
  const selectedProjectionBand = useMemo(
    () => {
      if (lineupsProjections?.source === "lineups" && !selectedLineupRole) return null
      return resolveProjectionBand(
        selectedAdjustedProjection,
        selectedLineupRole?.position,
        fantasyProjectionSigmas
      )
    },
    [fantasyProjectionSigmas, lineupsProjections?.source, selectedAdjustedProjection, selectedLineupRole]
  )
  const selectedProjectionDistribution = useMemo(
    () => {
      if (lineupsProjections?.source === "lineups" && !selectedLineupRole) return null
      return resolveProjectionDistribution(
        selectedAdjustedProjection,
        selectedLineupRole?.position,
        fantasyProjectionSigmas
      )
    },
    [fantasyProjectionSigmas, lineupsProjections?.source, selectedAdjustedProjection, selectedLineupRole]
  )
  const selectedAdjustedBreakEven = useMemo(
    () =>
      selectedAllPlayersTableRow?.breakeven ??
      applyFantasyBreakEvenOffset(
        selectedFantasyCoachMetrics.breakEven ?? selectedFantasyPlayer?.be ?? null,
        selectedFantasyPlayer?.id ?? null,
        selectedFantasyCoachRound,
      ),
    [selectedAllPlayersTableRow, selectedFantasyCoachMetrics.breakEven, selectedFantasyPlayer, selectedFantasyCoachRound]
  )
  const localPpm = useMemo(() => {
    if (selectedAllPlayersTableRow?.ppm != null) return selectedAllPlayersTableRow.ppm
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
  }, [playerRowsForYear, selectedAllPlayersTableRow])

  const playerSearchOptions = useMemo(
    () => (fantasyPlayers.length > 0 ? fantasyPlayers.map((player) => player.name) : allPlayersTableRows.map((row) => row.player.name)),
    [allPlayersTableRows, fantasyPlayers]
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
  const lockedPreviewTrendRows = STATIC_LOCKED_PREVIEW_TREND_ROWS
  const lockedPreviewBoxPlotRows = STATIC_LOCKED_PREVIEW_BOX_ROWS
  const lockedPreviewBoxPlotRange = useMemo(() => {
    const allValues = lockedPreviewBoxPlotRows.flatMap((row) => row.values)
    if (allValues.length === 0) return { min: 0, max: 100 }
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    if (max <= min) return { min: Math.max(0, min - 5), max: max + 5 }
    return { min, max }
  }, [lockedPreviewBoxPlotRows])
  const lockedPreviewBaseUpsideRows = STATIC_LOCKED_PREVIEW_BASE_UPSIDE_ROWS
  const lockedPreviewOpponentHeatmap = STATIC_LOCKED_PREVIEW_OPPONENT_HEATMAP
  const lockedPreviewPlots = STATIC_LOCKED_PREVIEW_PLOTS
  const lockedPreviewPlot = lockedPreviewPlots.length > 0
    ? lockedPreviewPlots[lockedPreviewPlotIndex % lockedPreviewPlots.length]
    : null

  useEffect(() => {
    if (!analysisLocked || lockedPreviewPlots.length <= 1) return
    const intervalId = window.setInterval(() => {
      setLockedPreviewPlotIndex((current) => current + 1)
    }, 4500)
    return () => window.clearInterval(intervalId)
  }, [analysisLocked, lockedPreviewPlots.length])

  const sortedFilteredRows = useMemo(() => {
    const defaultRows = [...filteredRows].sort(sortRoundsDesc)
    if (!gameLogSort) return defaultRows
    return defaultRows.sort((a, b) =>
      compareGameLogRows(a, b, gameLogSort.column, gameLogSort.direction)
    )
  }, [filteredRows, gameLogSort])
  const shouldCollapseGameLog = sortedFilteredRows.length > GAME_LOG_COLLAPSED_VISIBLE_ROWS
  const isGameLogCollapsed = shouldCollapseGameLog && !isGameLogExpanded
  const gameLogCollapsedMaxHeight = showBaseUpsideBars
    ? GAME_LOG_COLLAPSED_BASE_UPSIDE_MAX_HEIGHT_PX
    : GAME_LOG_COLLAPSED_MAX_HEIGHT_PX

  useEffect(() => {
    setIsGameLogExpanded(false)
  }, [selectedFantasyName])

  const toggleGameLogSort = useCallback((column: GameLogColumn) => {
    setGameLogSort((prev) => {
      if (!prev || prev.column !== column) {
        return { column, direction: getDefaultGameLogSortDirection(column) }
      }
      return { column, direction: prev.direction === "asc" ? "desc" : "asc" }
    })
  }, [])

  const draw2026Panel = (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
      <div className="border-b border-nrl-border bg-nrl-panel-2 px-3 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">2026 Draw</div>
        <div className="mt-1 text-[10px] text-nrl-muted">
          {draw2026StripRows.length > 0
            ? `${draw2026StripRows.length} rounds${teamForDrawStrip ? ` · ${teamForDrawStrip}` : ""}`
            : "No draw available"}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {draw2026StripRows.length === 0 ? (
          <div className="px-1 py-2 text-xs text-nrl-muted">
            {matchedLocalName
              ? "No 2026 draw found for this player yet."
              : "No local player-team match found for 2026 draw."}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-2 xl:overflow-y-auto xl:pr-1">
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
    <div className={showOwnedCards && showFantasyActions && !showAllPlayersOnly && !showFantasyAnalyticsOnly ? "space-y-3" : "space-y-6"}>
      <div className="space-y-5 xl:space-y-8">
        {showOwnedCards && showFantasyActions && !showAllPlayersOnly && !showFantasyAnalyticsOnly ? (
          <div className="grid gap-3 xl:grid-cols-3 xl:items-stretch">
            <Link
              href="/dashboard/fantasy/my-team"
              onClick={() => setIsMyTeamPending(true)}
              className="relative flex min-h-[84px] w-full cursor-pointer flex-col items-start justify-center gap-2 overflow-hidden rounded-xl border border-violet-300/25 bg-[linear-gradient(135deg,rgba(82,43,168,0.72),rgba(33,39,83,0.92))] px-5 py-4 text-left text-white shadow-[0_10px_20px_rgba(8,10,18,0.18)] transition-colors hover:border-violet-200/55 hover:bg-[#34296f] xl:min-h-[108px] xl:py-3"
            >
              <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                <span className="absolute -left-2 top-2 h-14 w-36 rounded-full opacity-25 [background-image:radial-gradient(circle,#00f58a_1.4px,transparent_1.7px)] [background-size:9px_9px]" />
                <span className="absolute -bottom-1 right-8 h-14 w-40 rounded-full opacity-20 [background-image:radial-gradient(circle,#00f58a_1.4px,transparent_1.7px)] [background-size:9px_9px]" />
              </span>
              <span className="absolute right-3 top-3 rounded-full border border-emerald-200 bg-nrl-accent px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[#07131f] shadow-[0_8px_18px_rgba(0,245,138,0.22)]">
                New
              </span>
              <span className="relative z-10 inline-flex items-center gap-2 pr-12 drop-shadow-[0_1px_2px_rgba(7,19,31,0.55)]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/15 bg-white/10">
                  <PersonIcon className="h-5 w-5" />
                </span>
                <span className="text-base font-black leading-none">My Team</span>
              </span>
              <span className="relative z-10 max-w-[280px] text-[11px] font-bold leading-snug text-white/95 drop-shadow-[0_1px_2px_rgba(7,19,31,0.55)]">
                Upload screenshots, save your team and get personalised advice
              </span>
              {isMyTeamPending ? (
                <span className="absolute inset-x-5 bottom-3 h-0.5 overflow-hidden rounded-full bg-nrl-accent/15">
                  <span className="block h-full w-full animate-pulse rounded-full bg-nrl-accent" />
                </span>
              ) : null}
            </Link>
            <div className={`grid items-stretch gap-2 sm:gap-3 xl:order-2 xl:col-span-2 ${fantasyProjectionArticle ? "grid-cols-3 xl:grid-cols-2" : "grid-cols-2 xl:grid-cols-1"}`}>
              <div className="contents xl:grid xl:grid-rows-2 xl:gap-3">
                <Link
                  href="/dashboard/fantasy/analytics"
                  onClick={() => setIsFantasyAnalyticsPending(true)}
                  className={`relative flex h-full min-h-[44px] w-full cursor-pointer items-center justify-start gap-3 rounded-xl border px-4 py-3 text-left text-white shadow-[0_10px_20px_rgba(8,10,18,0.18)] transition-colors hover:border-nrl-accent/70 hover:bg-[#17213d] sm:min-h-[52px] xl:min-h-0 xl:py-2 ${
                    showFantasyAnalytics
                      ? "border-nrl-accent bg-[#111832]"
                      : "border-[rgba(123,92,255,0.35)] bg-[#111832]"
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-nrl-accent/20 bg-nrl-accent/10">
                    <TrendGraphIcon className="h-4 w-4 text-nrl-accent" />
                  </span>
                  <span className="text-[12px] font-bold leading-tight sm:text-sm">
                    Find Value
                  </span>
                  {isFantasyAnalyticsPending ? (
                    <span className="absolute inset-x-5 bottom-2 h-0.5 overflow-hidden rounded-full bg-nrl-accent/15">
                      <span className="block h-full w-full animate-pulse rounded-full bg-nrl-accent" />
                    </span>
                  ) : null}
                </Link>
                <div className="group h-full self-stretch rounded-xl border border-[rgba(123,92,255,0.35)] bg-[#111832] p-0 shadow-[0_10px_20px_rgba(8,10,18,0.18)] transition-colors hover:border-nrl-accent/70 hover:bg-[#17213d]">
                  {hasFantasyPlotAccess ? (
                    <Link
                      href="/dashboard/fantasy/draft"
                      onClick={() => setIsFantasyDraftPending(true)}
                      className="relative inline-flex h-full min-h-[44px] w-full items-center justify-start gap-3 rounded-xl px-4 py-3 text-left leading-tight text-white transition-colors hover:text-white sm:min-h-[52px] xl:min-h-0 xl:py-2"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-nrl-accent/20 bg-nrl-accent/10">
                        <DollarIcon className="h-3.5 w-3.5 text-nrl-accent" />
                      </span>
                      <span className="text-[12px] font-bold sm:text-sm">
                        Draft / H2H Odds
                      </span>
                      {isFantasyDraftPending ? (
                        <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-nrl-accent/15">
                          <span className="block h-full w-full animate-pulse rounded-full bg-nrl-accent" />
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <Link
                      href="/dashboard/fantasy/draft"
                      onClick={() => setIsFantasyDraftPending(true)}
                      className="relative flex h-full min-h-[44px] w-full items-center justify-start gap-3 rounded-xl px-4 py-3 text-left transition-colors sm:min-h-[52px] xl:min-h-0 xl:py-2"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-nrl-accent/20 bg-nrl-accent/10">
                        <DollarIcon className="h-3.5 w-3.5 text-nrl-accent" />
                      </span>
                      <div className="text-[12px] font-bold leading-tight text-white sm:text-sm">
                        Draft / H2H Odds
                      </div>
                      {isFantasyDraftPending ? (
                        <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-nrl-accent/15">
                          <span className="block h-full w-full animate-pulse rounded-full bg-nrl-accent" />
                        </span>
                      ) : null}
                    </Link>
                  )}
                </div>
              </div>
              {fantasyProjectionArticle ? (
                <Link
                  href={`/dashboard/articles/${fantasyProjectionArticle.slug}`}
                  aria-label={`Read ${fantasyProjectionArticle.title}`}
                  className="group relative flex h-full min-h-[44px] w-full cursor-pointer overflow-hidden rounded-xl border border-[rgba(123,92,255,0.35)] bg-[#111832] text-white shadow-[0_10px_20px_rgba(8,10,18,0.18)] transition-colors hover:border-nrl-accent/70 sm:min-h-[52px] xl:min-h-[108px]"
                >
                  <div className={`absolute inset-0 grid ${fantasyProjectionArticle.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {fantasyProjectionArticle.imageUrls.slice(0, 2).map((url, index) => (
                      <div key={`${url}-${index}`} className="min-w-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover opacity-70 transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,19,48,0.95),rgba(14,19,48,0.74),rgba(14,19,48,0.45))]" />
                  <div className="relative flex h-full min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 sm:min-h-[52px] sm:px-4 xl:min-h-[108px] xl:gap-3 xl:px-5 xl:py-3">
                    <div className="min-w-0">
                      <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-nrl-accent">
                        Article
                      </div>
                      <div className="mt-0.5 overflow-hidden text-[8px] font-bold uppercase leading-tight tracking-[0.08em] text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] sm:text-[9px] xl:mt-1 xl:text-[10px] xl:[-webkit-line-clamp:2]">
                        {fantasyProjectionArticle.title}
                      </div>
                    </div>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 bg-nrl-panel-2/80 text-sm text-nrl-text sm:h-7 sm:w-7 sm:text-base">
                      →
                    </span>
                  </div>
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        {showOwnedCards && showFantasyActions && !showAllPlayersOnly && !showFantasyAnalyticsOnly ? (
          <div className="rounded-xl border border-nrl-border bg-nrl-panel px-3 py-3">
            <SearchableSelect
              label=""
              value={selectedFantasyName}
              options={playerSearchOptions}
              onChange={navigateToPlayer}
              placeholder="Search player..."
              showLoadingOnType
            />
          </div>
        ) : null}

      </div>

      {showOwnedCards && showFantasyAnalyticsOnly ? (
        <div>
          <FantasyBackLink href="/dashboard/fantasy" label="Back to Fantasy Dashboard" />
        </div>
      ) : null}

      {showOwnedCards && showFantasyAnalytics && !showAllPlayersOnly ? (
        <section id="fantasy-analytics" className="scroll-mt-24 rounded-xl border border-nrl-border bg-nrl-panel p-3 sm:p-4">
          <div className={`grid gap-3 ${showFantasyAnalyticsOnly ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]"}`}>
              <div className="min-w-0 space-y-3">
              <>
              <div className="relative overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel-2 p-2 [contain-intrinsic-size:430px] [content-visibility:auto]">
                <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                  <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                    Priced At vs {fantasyAnalyticsMetricOption.label}
                  </div>
                    <div className="text-[10px] text-nrl-muted">{pricedAtProjectionPoints.length} players with {fantasyAnalyticsMetricOption.label.toLowerCase()}</div>
                  </div>
                  {!hasFantasyPlotAccess ? (
                    <BillingPageLink className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-full border border-nrl-accent/45 bg-nrl-accent/10 px-3 text-[10px] font-bold uppercase tracking-wide text-nrl-accent shadow-[0_8px_18px_rgba(0,245,138,0.08)] transition-colors hover:border-nrl-accent hover:bg-nrl-accent/15">
                      Pro unlocks projection
                    </BillingPageLink>
                  ) : null}
                  <div className="w-full overflow-x-auto">
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(128px,1.1fr)] items-center gap-2">
                    <div className="min-w-0">
                      <Select
                        label=""
                        value={fantasyAnalyticsPositionFilter}
                        options={FANTASY_ANALYTICS_POSITION_OPTIONS}
                        onChange={(value) => {
                          setFantasyAnalyticsPositionFilter(value)
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 justify-center rounded-md border border-nrl-border bg-nrl-panel p-0.5">
                        {FANTASY_ANALYTICS_METRICS.map((metric) => {
                          const metricLocked = !hasFantasyPlotAccess && metric.key === "projection"
                          return (
                            <button
                              key={metric.key}
                              type="button"
                              disabled={metricLocked}
                              title={metricLocked ? `${PRO_UNLOCK_COPY} unlocks projections` : undefined}
                              onClick={() => {
                                if (metricLocked) return
                                setFantasyAnalyticsMetric(metric.key)
                              }}
                              className={`min-w-0 flex-1 whitespace-nowrap rounded px-1.5 py-1 text-[9px] font-semibold transition-colors sm:px-2 sm:text-[10px] ${
                                fantasyAnalyticsMetric === metric.key
                                  ? "bg-nrl-accent/15 text-nrl-accent"
                                  : metricLocked
                                    ? "cursor-not-allowed text-nrl-muted/45"
                                    : "text-nrl-muted hover:text-nrl-text"
                              }`}
                            >
                              {metric.shortLabel}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
                {pricedAtProjectionPoints.length > 0 ? (
                  <FantasyAnalyticsScatterPlot
                    key={`${fantasyAnalyticsPositionFilter}-${fantasyAnalyticsMetric}`}
                    points={pricedAtProjectionPoints}
                    metric={fantasyAnalyticsMetric}
                    metricOption={fantasyAnalyticsMetricOption}
                  />
                ) : (
                  <div className="grid h-[280px] place-items-center text-xs text-nrl-muted">No projection data available.</div>
                )}
              </div>
              {hasRawStatsForGlobalStatVsFantasy ? (
              <div className="relative overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel-2 p-2 [contain-intrinsic-size:410px] [content-visibility:auto]">
                <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                      Fantasy vs Stat
                    </div>
                    <div className="text-[10px] text-nrl-muted">
                      2026 averages for {filteredGlobalStatVsFantasyPoints.length} players
                      {globalStatVsFantasyCorrelation !== null
                        ? ` | r = ${globalStatVsFantasyCorrelation >= 0 ? "+" : ""}${globalStatVsFantasyCorrelation.toFixed(2)}`
                        : ""}
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-2 items-center gap-2 overflow-x-auto sm:w-auto sm:min-w-[360px]">
                  <div className="min-w-0">
                    <Select
                      label=""
                      value={globalStatVsFantasyPositionFilter}
                      options={FANTASY_ANALYTICS_POSITION_OPTIONS}
                      onChange={(value) => {
                        setGlobalStatVsFantasyPositionFilter(value)
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <Select
                      label=""
                      value={selectedGlobalStatVsFantasyLabel}
                      options={STAT_VS_FANTASY_OPTIONS.map((option) => option.label)}
                      onChange={(value) => {
                        setSelectedGlobalStatVsFantasyLabel(value as StatVsFantasyOptionLabel)
                      }}
                    />
                  </div>
                  </div>
                </div>
                {filteredGlobalStatVsFantasyPoints.length > 0 ? (
                  <GlobalStatVsFantasyScatterPlot
                    key={globalStatVsFantasyPositionFilter + "-" + selectedGlobalStatVsFantasyLabel}
                    points={filteredGlobalStatVsFantasyPoints}
                    selectedOption={selectedGlobalStatVsFantasyOption}
                    positionFilter={globalStatVsFantasyPositionFilter}
                    trendline={globalStatVsFantasyTrendline}
                  />
                ) : (
                  <div className="grid h-[220px] place-items-center text-xs text-nrl-muted">No 2026 stat averages available.</div>
                )}
              </div>
              ) : null}
              </>
              </div>
              <div className={`${showFantasyAnalyticsOnly ? "min-w-0 xl:sticky xl:top-3 xl:self-start" : "order-1 min-w-0 xl:order-2 xl:sticky xl:top-3 xl:self-start"}`}>
              <div className="rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                      Template Team
                    </div>
                    <div className="text-[10px] text-nrl-muted">
                      {fantasyTemplateMode === "ownership" ? "Top owned starting 13" : "Fastest rising starting 13"}
                    </div>
                  </div>
                  <div className="flex rounded-md border border-nrl-border bg-nrl-panel p-0.5">
                    {FANTASY_TEMPLATE_MODES.map((mode) => (
                      <button
                        key={mode.key}
                        type="button"
                        onClick={() => setFantasyTemplateMode(mode.key)}
                        className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                          fantasyTemplateMode === mode.key
                            ? "bg-nrl-accent/15 text-nrl-accent"
                            : "text-nrl-muted hover:text-nrl-text"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-nrl-border bg-[radial-gradient(circle_at_50%_12%,rgba(0,245,138,0.14),transparent_26%),linear-gradient(90deg,rgba(8,26,33,0.98),rgba(15,54,48,0.92)_50%,rgba(8,26,33,0.98))] px-3 py-4">
                  <div className="pointer-events-none absolute inset-x-[6%] top-[8%] h-px bg-white/14" />
                  <div className="pointer-events-none absolute inset-x-[6%] top-[24%] h-px bg-white/10" />
                  <div className="pointer-events-none absolute inset-x-[6%] top-[40%] h-px bg-white/10" />
                  <div className="pointer-events-none absolute inset-x-[6%] top-[56%] h-px bg-white/10" />
                  <div className="pointer-events-none absolute inset-x-[6%] top-[72%] h-px bg-white/10" />
                  <div className="pointer-events-none absolute inset-x-[6%] top-[88%] h-px bg-white/14" />
                  <div className="pointer-events-none absolute inset-y-0 left-[6%] w-px bg-white/8" />
                  <div className="pointer-events-none absolute inset-y-0 right-[6%] w-px bg-white/8" />
                  <div className="relative z-[1] space-y-4">
                    {fantasyTemplateRows.map((templateRow) => (
                      <div key={templateRow.label} className="relative">
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-300/80 [writing-mode:vertical-rl] rotate-180">
                          {templateRow.label}
                        </div>
                        <div
                          className={`mx-[6%] grid gap-3 ${
                            templateRow.slots.length === 1
                              ? "grid-cols-1"
                              : templateRow.slots.length === 2
                                ? "grid-cols-2"
                                : "grid-cols-3"
                          }`}
                        >
	                          {templateRow.slots.map((slot, index) => {
	                            const playerRow = slot.row
	                            const thumbnailUrl = playerRow ? getPlayerThumbnailUrl(playerRow.imageRow) : null
	                            const playerHref = playerRow
	                              ? `${playerRouteBasePath}/${fantasyPlayerSlug(playerRow.player.name)}`
	                              : null
	                            const metricValue =
	                              fantasyTemplateMode === "ownership"
	                                ? formatPercent(playerRow?.player.ownedBy ?? null)
                                : formatOwnershipDelta(playerRow?.weeklyChange ?? null)
                            const metricClass =
                              fantasyTemplateMode === "ownership"
                                ? "text-nrl-accent"
                                : getOwnershipDeltaClass(playerRow?.weeklyChange ?? null)
	                            const content = (
	                              <>
	                                <div className="mx-auto grid h-12 w-12 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-nrl-panel shadow-[0_10px_22px_rgba(0,0,0,0.34)] transition-colors group-hover:border-nrl-accent/80 sm:h-14 sm:w-14">
	                                  {thumbnailUrl ? (
	                                    // eslint-disable-next-line @next/next/no-img-element
	                                    <img
                                      src={thumbnailUrl}
                                      alt=""
                                      className="h-full w-full object-cover object-top"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-nrl-muted">
                                      {playerRow ? getPlayerInitials(playerRow.player.name) : slot.slot}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 truncate text-[10px] font-semibold leading-tight text-nrl-text" title={playerRow?.player.name ?? slot.slot}>
                                  {playerRow?.player.name ?? slot.slot}
                                </div>
	                                <div className={`text-[9px] font-semibold ${metricClass}`}>
	                                  {metricValue}
	                                </div>
	                              </>
	                            )

	                            return playerHref ? (
	                              <Link
	                                key={`${templateRow.label}-${index}`}
	                                href={playerHref}
	                                className="group min-w-0 text-center outline-none"
	                              >
	                                {content}
	                              </Link>
	                            ) : (
	                              <div key={`${templateRow.label}-${index}`} className="min-w-0 text-center">
	                                {content}
	                              </div>
	                            )
	                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
        </section>
      ) : null}

      {showOwnedCards && showAllPlayersOnly ? (
        <div>
          <FantasyBackLink href="/dashboard/fantasy" label="Back to Fantasy Dashboard" />
        </div>
      ) : null}

      {showOwnedCards && !showFantasyAnalyticsOnly ? (
        <section id="fantasy-all-players" className="scroll-mt-24 rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-nrl-border bg-nrl-panel-2 px-3 py-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">
                {hasLoadedFullAllPlayersRows ? "All Players" : "Top Weekly Buys"}
              </div>
            </div>
            {hasLoadedFullAllPlayersRows ? (
              <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-0.5 min-[360px]:gap-1 sm:w-auto sm:justify-end sm:gap-1.5">
                <div className="inline-flex shrink-0 rounded-full border border-nrl-border bg-nrl-panel-2 p-[2px]">
                  {(["cards", "table"] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => {
                        setAllPlayersView(view)
                      }}
                      className={`rounded-full px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide transition-colors sm:px-2 sm:text-[9px] ${
                        effectiveAllPlayersView === view
                          ? "bg-nrl-accent text-[#07131f]"
                          : "text-nrl-muted hover:text-nrl-text"
                      }`}
                    >
                      {view === "cards" ? "Cards" : "Table"}
                    </button>
                  ))}
                </div>
                <div className="w-[80px] shrink-0 min-[360px]:w-[94px] sm:w-[126px]">
                  <Select
                    label=""
                    value={allPlayersPositionFilter}
                    options={["All Positions", ...POSITION_TABLES.map((position) => position.label)]}
                    onChange={setAllPlayersPositionFilter}
                  />
                </div>
                <label className="inline-flex shrink-0 cursor-pointer rounded-full bg-[linear-gradient(90deg,#071632,#1d4ed8,#7dd3fc,#bfdbfe,#1d4ed8,#071632)] p-[1px] shadow-[0_0_0_1px_rgba(125,211,252,0.28),0_0_14px_rgba(37,99,235,0.22)]">
                  <span className="inline-flex min-h-[28px] items-center justify-center gap-1 rounded-full bg-nrl-panel-2 px-1.5 text-[8px] font-bold uppercase tracking-wide text-nrl-muted min-[360px]:px-2 sm:gap-1.5 sm:text-[9px]">
                    <span>Tags</span>
                    <input
                      type="checkbox"
                      checked={showAllPlayersCardTags}
                      onChange={(event) => setShowAllPlayersCardTags(event.target.checked)}
                      className="sr-only"
                    />
                    <span className={`relative h-3.5 w-5 rounded-full border transition-colors sm:w-6 ${showAllPlayersCardTags ? "border-nrl-accent/40 bg-nrl-accent/20" : "border-nrl-border bg-nrl-panel"}`}>
                      <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-transform ${showAllPlayersCardTags ? "translate-x-2.5 bg-nrl-accent sm:translate-x-3" : "translate-x-0.5 bg-nrl-muted"}`} />
                    </span>
                  </span>
                </label>
                <div className="w-[80px] shrink-0 min-[360px]:w-[94px] sm:w-[116px]">
                  <MultiSelect
                    label=""
                    value={allPlayersTagFilters}
                    options={allPlayersTagFilterOptions}
                    onChange={setAllPlayersTagFilters}
                    placeholder="All Tags"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard/fantasy/players"
                  onClick={() => setIsAllPlayersPending(true)}
                  className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-nrl-accent/50 bg-nrl-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-nrl-accent transition-colors hover:border-nrl-accent"
                >
                  See all players
                  {isAllPlayersPending ? (
                    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
                      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
                      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
                    </span>
                  ) : (
                    <span aria-hidden="true">→</span>
                  )}
                </Link>
              </div>
            )}
          </div>
          <div className={`${hasLoadedFullAllPlayersRows && effectiveAllPlayersView === "cards" ? "block" : "hidden"} border-b border-nrl-border bg-nrl-panel px-3 py-2`}>
            <div className="mb-2 max-w-2xl">
              <SearchableSelect
                label=""
                value={selectedFantasyName}
                options={playerSearchOptions}
                onChange={navigateToPlayer}
                placeholder="Search player..."
                showLoadingOnType
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="w-40">
                <Select
                  label="Sort by"
                  value={selectedAllPlayersMobileSortLabel}
                  options={availableAllPlayersMobileSortOptions.map((option) => option.label)}
                  onChange={(label) => {
                    const option = availableAllPlayersMobileSortOptions.find((item) => item.label === label)
                    if (!option) return
                    setAllPlayersSort((current) => ({
                      column: option.key,
                      direction: current.column === option.key ? current.direction : "desc",
                    }))
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setAllPlayersSort((current) => ({
                    ...current,
                    direction: current.direction === "asc" ? "desc" : "asc",
                  }))
                }}
                className="mb-px grid h-[30px] w-10 shrink-0 place-items-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-bold text-nrl-accent transition-colors hover:border-nrl-accent"
                aria-label={`Sort ${allPlayersSort.direction === "asc" ? "descending" : "ascending"}`}
              >
                {allPlayersSort.direction === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>
          <div className={`${effectiveAllPlayersView === "cards" ? "grid" : "hidden"} ${showAllPlayersOnly ? "" : "max-h-[760px]"} grid-cols-1 gap-2 overflow-y-auto p-2.5`}>
            {sortedAllPlayersTableRows.length === 0 ? (
              <div className="rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-5 text-center text-xs text-nrl-muted">
                {isAllPlayersPreview ? "No weekly ownership movers available." : `No ${ALL_PLAYERS_STATS_YEAR} player stats available.`}
              </div>
            ) : (
              sortedAllPlayersTableRows.map((row) => {
                const thumbnailUrl = getPlayerThumbnailUrl(row.imageRow)
                const baseCardStats = [
                  {
                    key: "weeklyChange",
                    label: "Weekly",
                    value: formatOwnershipDelta(row.weeklyChange),
                    valueClassName: getOwnershipDeltaClass(row.weeklyChange),
                    locked: false,
                  },
                  {
                    key: "pricedAt",
                    label: "Priced At",
                    value: formatTableNumber(row.pricedAt, 0),
                    valueClassName: "text-nrl-text",
                    locked: false,
                  },
                  {
                    key: "projection",
                    label: "Proj",
                    value: formatTableNumber(row.projection, 0),
                    valueClassName: "text-nrl-text",
                    locked: true,
                  },
                  {
                    key: "value",
                    label: "Value",
                    value: formatSignedTableNumber(row.value, 0),
                    valueClassName: getFantasyValueClass(row.value),
                    locked: true,
                  },
                  {
                    key: "ownPercent",
                    label: "Own",
                    value: formatPercent(row.player.ownedBy),
                    valueClassName: "text-nrl-accent",
                    locked: false,
                  },
                  {
                    key: "price",
                    label: "Price",
                    value: formatPrice(row.player.cost),
                    valueClassName: "text-nrl-text",
                    locked: false,
                  },
                  {
                    key: "breakeven",
                    label: "BE",
                    value: formatTableNumber(row.breakeven),
                    valueClassName: "text-nrl-text",
                    locked: true,
                  },
                  {
                    key: "avg2026",
                    label: "Avg",
                    value: formatTableNumber(row.avg2026),
                    valueClassName: "text-nrl-text",
                    locked: false,
                  },
                  {
                    key: "last3",
                    label: "L3",
                    value: formatTableNumber(row.last3),
                    valueClassName: "text-nrl-text",
                    locked: false,
                  },
                  {
                    key: "ppm",
                    label: "PPM",
                    value: formatTableNumber(row.ppm, 2),
                    valueClassName: "text-nrl-text",
                    locked: false,
                  },
                  {
                    key: "gamesPlayed",
                    label: "Games",
                    value: row.gamesPlayed || "-",
                    valueClassName: "text-nrl-text",
                    locked: false,
                  },
                ]
                const cardStats = hasFantasyPlotAccess
                  ? baseCardStats
                  : [...baseCardStats.filter((stat) => !stat.locked), ...baseCardStats.filter((stat) => stat.locked)]
                const selectedCardStat =
                  cardStats.find((stat) => stat.key === allPlayersSort.column) ??
                  (allPlayersSort.column === "position"
                    ? { key: "position", label: "Pos", value: row.player.positionLabel, valueClassName: "text-nrl-text" }
                    : { key: "name", label: "Sort", value: allPlayersSort.direction === "asc" ? "A-Z" : "Z-A", valueClassName: "text-nrl-text" })
                const selectedCardStatLocked =
                  !hasFantasyPlotAccess && "locked" in selectedCardStat && selectedCardStat.locked

                return (
                  <button
                    key={row.player.id}
                    type="button"
                    onClick={() => navigateToPlayer(row.player.name)}
	                    className="block w-full rounded-lg border border-nrl-border bg-[#111832] p-2.5 text-left transition-colors hover:border-white/25 hover:bg-[#17213d] md:flex md:items-center md:gap-4"
	                  >
	                    <div className="flex items-start justify-between gap-3 md:w-[250px] md:shrink-0 md:items-center">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel text-[11px] text-nrl-muted">
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
                        <div className="min-w-0">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-bold text-nrl-text">{row.player.name}</div>
                          </div>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted md:block">
                            <span>{row.player.positionLabel}</span>
                            {showAllPlayersCardTags ? (
                              <PlayerContextTags
                                majorByeRoundTags={row.majorByeRoundTags}
                                nextMajorByeRound={row.nextMajorByeRound}
                                playsNextMajorBye={row.playsNextMajorBye}
                                originChance={row.originChance}
                                className="md:mt-1"
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
	                      <div className="shrink-0 text-right md:hidden">
                        <div className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
                          {selectedCardStat.label}
                        </div>
                        {selectedCardStatLocked ? (
                          <div className={`ml-auto mt-0.5 ${FANTASY_LOCKED_VALUE_BOX_CLASS}`}>
                            <span className={FANTASY_LOCKED_VALUE_TEXT_CLASS}>{selectedCardStat.value}</span>
                          </div>
                        ) : (
                          <div className={`text-[13px] font-bold ${selectedCardStat.valueClassName}`}>
                            {selectedCardStat.value}
                          </div>
                        )}
                      </div>
                    </div>
	                    <div className="mt-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mt-0 md:min-w-0 md:flex-1">
	                      <div className="flex min-w-max gap-4 md:w-full md:min-w-0">
                        {cardStats.map((stat) => (
                          <div
                            key={stat.key}
	                            className="min-w-[4rem] md:min-w-[4.25rem]"
                          >
                            <div className={`text-[8px] font-semibold uppercase tracking-wide ${stat.key === allPlayersSort.column ? "text-nrl-accent" : "text-nrl-muted"}`}>
                              {stat.label}
                            </div>
                            {!hasFantasyPlotAccess && stat.locked ? (
                              <div className={`mt-0.5 ${FANTASY_LOCKED_VALUE_BOX_CLASS}`}>
                                <span className={FANTASY_LOCKED_VALUE_TEXT_CLASS}>{stat.value}</span>
                              </div>
                            ) : (
                              <div className={`mt-0.5 text-[12px] font-bold ${stat.valueClassName}`}>
                                {stat.value}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
          <div className={`${effectiveAllPlayersView === "table" ? "block" : "hidden"} ${showAllPlayersOnly ? "" : "h-[756px]"} overflow-y-auto overflow-x-auto`}>
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs table-fixed">
              <thead>
                <tr>
                  <th
                    aria-label="Player photo"
                    className="sticky left-0 top-0 z-[4] w-13 min-w-13 max-w-13 border-b border-r border-nrl-border bg-nrl-panel px-1 py-2 sm:w-15 sm:min-w-15 sm:max-w-15"
                  />
                  {ALL_PLAYERS_BASE_COLUMNS.map((column) => {
                    const disabled = Boolean(column.proOnly && !hasFantasyPlotAccess)
                    const active = allPlayersSort.column === column.key
                    return (
                      <th
                        key={column.key}
                        className={`sticky top-0 z-[2] border-b border-r border-nrl-border bg-nrl-panel px-1.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted last:border-r-0 sm:px-3 ${column.key === "name" ? "lg:left-[3.75rem] lg:z-[3]" : ""} ${getAllPlayersColumnWidthClass(column.key)} ${ALL_PLAYERS_MOBILE_HIDDEN_COLUMNS.has(column.key) ? "hidden sm:table-cell" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleAllPlayersSort(column.key, disabled)}
                          className={`inline-flex w-full items-center gap-1 whitespace-nowrap ${column.align === "right" ? "justify-center sm:justify-end" : column.align === "center" ? "justify-center" : "justify-start"} ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:text-nrl-accent"}`}
                          title={disabled ? `${PRO_UNLOCK_COPY} unlocks projection, breakeven and value sorting` : `Sort by ${column.label}`}
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
                        className="h-12 cursor-pointer border-b border-nrl-border/60"
                      >
                        <td className="sticky left-0 z-[1] w-13 min-w-13 max-w-13 border-r border-nrl-border bg-nrl-panel px-1 py-1 sm:w-15 sm:min-w-15 sm:max-w-15">
                          <div className="mx-auto grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel-2 text-[10px] text-nrl-muted">
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
                        <td className="w-[136px] min-w-[136px] max-w-[136px] border-r border-nrl-border bg-nrl-panel px-1.5 py-1 text-xs font-semibold text-nrl-text sm:w-32 sm:min-w-32 sm:max-w-32 sm:px-2 lg:sticky lg:left-[3.75rem] lg:z-[1]">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="block min-w-0 truncate" title={row.player.name}>
                              {row.player.name}
                            </span>
                          </div>
                        </td>
                      <td className="w-[72px] min-w-[72px] max-w-[72px] border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-muted sm:w-[88px] sm:min-w-[88px] sm:max-w-[88px] sm:px-3">
                        {row.player.positionLabel}
                      </td>
                      <td className={`w-20 min-w-20 max-w-20 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap sm:px-3 ${getOwnershipDeltaClass(row.weeklyChange)}`}>
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("weeklyChange")}`}>
                          {formatOwnershipDelta(row.weeklyChange)}
                        </span>
                      </td>
                      <td className="w-20 min-w-20 max-w-20 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap text-nrl-accent sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("ownPercent")}`}>
                          {formatPercent(row.player.ownedBy)}
                        </span>
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:px-3">
                        {formatPrice(row.player.cost)}
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("pricedAt")}`}>
                          {formatTableNumber(row.pricedAt, 0)}
                        </span>
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap text-nrl-accent sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("avg2026")}`}>
                          {formatTableNumber(row.avg2026)}
                        </span>
                      </td>
                      <td className="w-16 min-w-16 max-w-16 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:px-3">
                        <span className={`inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("last3")}`}>
                          {formatTableNumber(row.last3)}
                        </span>
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:px-3">
                        {formatTableNumber(row.ppm, 2)}
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:px-3">
                        <span className={!hasFantasyPlotAccess ? FANTASY_LOCKED_VALUE_BOX_CLASS : "inline-block"}>
                          <span className={!hasFantasyPlotAccess ? FANTASY_LOCKED_VALUE_TEXT_CLASS : ""}>
                          {formatTableNumber(row.projection, 0)}
                          </span>
                        </span>
                      </td>
                      <td className={`w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs font-semibold whitespace-nowrap sm:px-3 ${hasFantasyPlotAccess ? getFantasyValueClass(row.value) : "text-nrl-text"}`}>
                        <span className={!hasFantasyPlotAccess ? FANTASY_LOCKED_VALUE_BOX_CLASS : `inline-block text-left tabular-nums sm:min-w-0 ${getCenteredValueClass("value")}`}>
                          <span className={!hasFantasyPlotAccess ? FANTASY_LOCKED_VALUE_TEXT_CLASS : ""}>
                          {formatSignedTableNumber(row.value, 0)}
                          </span>
                        </span>
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-text sm:px-3">
                        <span className={!hasFantasyPlotAccess ? FANTASY_LOCKED_VALUE_BOX_CLASS : "inline-block"}>
                          <span className={!hasFantasyPlotAccess ? FANTASY_LOCKED_VALUE_TEXT_CLASS : ""}>
                          {formatTableNumber(row.breakeven)}
                          </span>
                        </span>
                      </td>
                      <td className="w-14 min-w-14 max-w-14 border-r border-nrl-border px-1.5 py-2 text-center text-xs whitespace-nowrap text-nrl-muted last:border-r-0 sm:px-3">
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_252px] xl:items-stretch">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="relative overflow-hidden rounded-xl border border-nrl-border bg-[#111832] p-3">
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
                          {formatPrice(selectedDisplayFantasyPlayer?.cost ?? null)}
                        </span>
                        <span className="rounded-md border border-nrl-border bg-[#0f162d] px-1 py-0.5 text-[8px] text-nrl-muted sm:px-2 sm:text-xs">
                          {selectedDisplayFantasyPlayer?.positionLabel ?? selectedFantasyPlayer.positionLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[8px] sm:gap-3 sm:text-xs">
                        {selectedLineupRole?.position && lineupsProjections?.source === "lineups" ? (
                          <span className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-1 py-0.5 font-semibold text-emerald-300 sm:px-2 sm:py-1">
                            Lineup: {selectedLineupRole.position}
                          </span>
                        ) : null}
                        {selectedAllPlayersTableRow ? (
                          <PlayerContextTags
                            majorByeRoundTags={selectedAllPlayersTableRow.majorByeRoundTags}
                            nextMajorByeRound={selectedAllPlayersTableRow.nextMajorByeRound}
                            playsNextMajorBye={selectedAllPlayersTableRow.playsNextMajorBye}
                            originChance={selectedAllPlayersTableRow.originChance}
                          />
                        ) : null}
                        <CasualtyWardPills
                          rows={lineupsProjections?.source === "lineups" && selectedLineupRole ? [] : casualtyWardRows}
                        />
                        {isLoadingStats ? (
                          <span className="rounded-md border border-nrl-accent/30 bg-nrl-accent/10 px-1 py-0.5 text-nrl-accent sm:px-2 sm:py-1">
                            Loading season data…
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className={`grid items-start gap-3 pt-4 sm:gap-4 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_15.25rem] xl:grid-cols-1 xl:gap-5 ${fantasyCardPlayerName ? "grid-cols-[minmax(0,1fr)_10.75rem] min-[420px]:grid-cols-[minmax(0,1fr)_11.5rem] sm:grid-cols-[minmax(0,1fr)_14.25rem]" : "grid-cols-1"}`}>
                      <div className="grid w-full auto-rows-fr grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                        <MetricCard compact mobileTight softSurface label="Price" value={formatPrice(selectedDisplayFantasyPlayer?.cost ?? null)} />
                        <MetricCard compact mobileTight softSurface label="PPM" value={formatNumber(localPpm, 2)} />
                        <MetricCard
                          compact
                          mobileTight
                          softSurface
                          label="Own %"
                          value={formatPercent(selectedDisplayFantasyPlayer?.ownedBy ?? null)}
                          sublabel={
                            ownershipBaselineSnapshot
                              ? `Weekly ${formatOwnershipDelta(selectedOwnershipDelta)}`
                              : undefined
                          }
                        />
                        <MetricCard
                          compact
                          mobileTight
                          softSurface
                          label="Priced At"
                          value={formatNumber(selectedDisplayFantasyPlayer?.pricedAt ?? null, 0)}
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

              {showPlayerComments ? (
                <PlayerComments
                  playerId={selectedFantasyPlayer.id}
                  playerSlug={fantasyPlayerSlug(selectedFantasyPlayer.name)}
                  playerName={selectedFantasyPlayer.name}
                />
              ) : null}

              <RelevantOutsList rows={selectedRelevantOuts} />

              <div className="rounded-xl border border-nrl-border bg-[#111832] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">Filters</div>
                  <div className="text-[10px] text-nrl-muted">Applies to player game log and filtered analysis</div>
                </div>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
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

                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_auto]">
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
                className={`order-6 relative rounded-xl border p-4 ${analysisLocked ? "border-white/8 bg-white/[0.03]" : "border-nrl-border bg-[#111832]"
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
                <div className={analysisLocked ? "select-none" : undefined}>
                  <div className="mx-auto mb-5 grid w-full grid-cols-2 gap-4 sm:max-w-[520px] sm:gap-5">
                    {selectedProjectionBand ? (
                      <ProjectionBandMetricCard
                        label={selectedFantasyCoachRound != null ? `Round ${selectedFantasyCoachRound} Projection` : "Projection"}
                        projection={formatNumber(selectedAdjustedProjection, 0)}
                        lower={formatNumber(selectedProjectionBand.lower, 0)}
                        upper={formatNumber(selectedProjectionBand.upper, 0)}
                        blurValue={analysisLocked}
                      />
                    ) : (
                      <MetricCard
                        compact
                        label={selectedFantasyCoachRound != null ? `Round ${selectedFantasyCoachRound} Projection` : "Projection"}
                        value={formatNumber(selectedAdjustedProjection, 0)}
                        blurValue={analysisLocked}
                        center
                        prominentValue
                      />
                    )}
                    <MetricCard
                      compact
                      label={selectedFantasyCoachRound != null ? `Round ${selectedFantasyCoachRound} Breakeven` : "Breakeven"}
                      value={formatNumber(selectedAdjustedBreakEven, 0)}
                      blurValue={analysisLocked}
                      center
                      prominentValue
                    />
                  </div>
                  <div className="relative mx-auto w-full max-w-[43rem]">
                    <div className={`grid grid-cols-2 gap-2 ${analysisLocked ? "pointer-events-none opacity-65" : ""}`}>
                      <FantasyPlotToggleButton
                        active={showRollingAveragePlot}
                        locked={analysisLocked}
                        onClick={() => setShowRollingAveragePlot((prev) => !prev)}
                        activeLabel="Hide Rolling Average Plot"
                        inactiveLabel="Show Rolling Average Plot"
                      />
                      <FantasyPlotToggleButton
                        active={showProjectionRangePlot}
                        locked={analysisLocked}
                        onClick={() => setShowProjectionRangePlot((prev) => !prev)}
                        activeLabel="Hide Projection Range"
                        inactiveLabel="Show Projection Range"
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
                    {analysisLocked ? (
                      <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-1">
                        <BillingPageLink className="block rounded-md border border-emerald-300/35 bg-slate-950/80 px-2.5 py-1.5 text-center shadow-[0_8px_18px_rgba(0,0,0,0.22)] transition-colors hover:border-emerald-300/60">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-100 sm:text-[10px]">
                            {PRO_UNLOCK_COPY}
                          </div>
                          <div className="mt-0.5 text-[9px] text-slate-400 sm:text-[10px]">
                            Projections and plots
                          </div>
                        </BillingPageLink>
                      </div>
                    ) : null}
                  </div>
                </div>

                {analysisLocked && lockedPreviewPlot ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                          Fantasy Plot Preview
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {lockedPreviewPlots.map((plot) => (
                          <span
                            key={plot}
                            className={`h-1.5 w-5 rounded-full ${lockedPreviewPlot === plot ? "bg-nrl-accent" : "bg-white/18"}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="pointer-events-none h-[210px] overflow-hidden select-none opacity-75 sm:h-[224px]">
                      <div
                        className="flex h-full transition-transform duration-700 ease-in-out"
                        style={{ transform: `translateX(-${lockedPreviewPlots.indexOf(lockedPreviewPlot) * 100}%)` }}
                      >
                        {lockedPreviewPlots.map((plot) => (
                          <div key={plot} className="h-full w-full shrink-0 overflow-hidden">
                            {plot === "rolling" ? (
                              <div>
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                                  Rolling Average Preview
                                </div>
                                <div className="opacity-80 blur-[1px]">
                                  <FantasyGameLogTrendBrush
                                    key={`locked-preview-${gameLogChartKey}`}
                                    rows={lockedPreviewTrendRows}
                                    headerTitle=""
                                    mainChartClassName="w-full h-[124px] sm:h-[136px]"
                                    rollingWindow={5}
                                    showInternalControls={false}
                                  />
                                </div>
                              </div>
                            ) : null}
                            {plot === "projectionRange" ? (
                              <div className="flex h-full flex-col py-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                                  Projection Range Preview
                                </div>
                                <div className="mt-2 h-[150px] opacity-80 blur-[1px] sm:h-[164px]">
                                  <ProjectionRangePreviewBars data={STATIC_LOCKED_PREVIEW_PROJECTION_RANGE} />
                                </div>
                              </div>
                            ) : null}
                            {plot === "box" ? (
                              <div className="flex h-full flex-col py-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                                  Fantasy Box Plot Preview
                                </div>
                                <div className="flex flex-1 flex-col justify-around">
                                {lockedPreviewBoxPlotRows.slice(0, 4).map((row) => {
                                  const range = Math.max(1, lockedPreviewBoxPlotRange.max - lockedPreviewBoxPlotRange.min)
                                  const scale = (value: number) =>
                                    FANTASY_BOX_PLOT_PAD_PCT +
                                    ((value - lockedPreviewBoxPlotRange.min) / range) * (100 - FANTASY_BOX_PLOT_PAD_PCT * 2)
                                  return (
                                    <div key={`preview-box-${row.label}`} className="grid grid-cols-[74px_minmax(0,1fr)] items-center gap-3">
                                      <div className="text-[10px] font-semibold text-nrl-muted">{row.label}</div>
                                      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-9 w-full overflow-visible opacity-80 blur-[1px]">
                                        <line x1={scale(row.min)} x2={scale(row.max)} y1="14" y2="14" stroke="rgba(154,164,191,0.9)" strokeWidth="1.3" />
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
                                        <line x1={scale(row.median)} x2={scale(row.median)} y1="5" y2="23" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" />
                                      </svg>
                                    </div>
                                  )
                                })}
                                </div>
                              </div>
                            ) : null}
                            {plot === "stat" ? (
                              <div className="h-full overflow-hidden">
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                                  Stat vs Fantasy Preview
                                </div>
                                <div className="opacity-80 blur-[1px]">
                                  <ScatterCorrelation
                                    rows={STATIC_LOCKED_PREVIEW_TREND_ROWS}
                                    statX={selectedStatVsFantasyOption.key}
                                    statY="Fantasy"
                                    title={`Fantasy ${selectedStatVsFantasyOption.label} vs Score`}
                                  />
                                </div>
                              </div>
                            ) : null}
                            {plot === "heatmap" ? (
                              <div className="flex h-full flex-col py-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                                  Avg vs Opponent Heatmap Preview
                                </div>
                                <div className="mt-3 grid flex-1 grid-cols-4 gap-2">
                                  {lockedPreviewOpponentHeatmap.map((row) => (
                                    <div
                                      key={`preview-heat-${row.opponent}`}
                                      className="flex min-h-12 flex-col items-center justify-center rounded border border-nrl-border/60 px-2 py-1 text-center"
                                      style={{ backgroundColor: getHeatColorForAverage(row.average) }}
                                    >
                                      <div className="text-[10px] font-bold text-nrl-text">{row.opponent}</div>
                                      <div className="opacity-80 blur-[1px]">
                                        <div className="text-xs font-semibold text-nrl-text">{row.average.toFixed(1)}</div>
                                        <div className="text-[8px] text-nrl-muted">n={row.games}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {plot === "baseUpside" ? (
                              <div className="flex h-full flex-col py-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                                  Base vs Upside Preview
                                </div>
                                <div className="mt-3 flex flex-1 flex-col justify-around">
                                  {lockedPreviewBaseUpsideRows.rows.map((row) => {
                                    const widths = getScaledBaseUpsideBarWidths(row.split, lockedPreviewBaseUpsideRows.maxFantasy)
                                    return (
                                      <div key={`preview-base-${row.label}`} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
                                        <div className="text-[10px] font-semibold text-nrl-muted">{row.label}</div>
                                        <div>
                                          <div className="opacity-80 blur-[1px]">
                                            <div className="flex h-3 w-full overflow-hidden rounded-sm border border-nrl-border bg-nrl-panel">
                                              <div className="bg-nrl-accent" style={{ width: `${widths.basePct}%` }} />
                                              <div
                                                className={row.split.upsidePoints < 0 ? "bg-rose-500" : "bg-violet-400"}
                                                style={{ width: `${widths.upsidePct}%` }}
                                              />
                                            </div>
                                          </div>
                                          <div className="mt-1 flex justify-between text-[9px] text-nrl-muted">
                                            <span>Base</span>
                                            <span>Upside</span>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!analysisLocked ? (
                <div>
                {showProjectionRangePlot ? (
                  selectedProjectionDistribution ? (
                    <ProjectionRangePlot data={selectedProjectionDistribution} />
                  ) : (
                    <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3 text-xs text-nrl-muted">
                      Projection range is unavailable for this player.
                    </div>
                  )
                ) : null}

                {showRollingAveragePlot && trendFilteredRows.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3">
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

                {showOpponentHeatmap ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3">
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

                {showFantasyBoxPlot ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3">
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

                {showStatVsFantasyPlot ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3">
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

                {showWithWithoutPlot && hasLoginAccess && teammate !== "None" ? (
                  <div className="mt-3 rounded-lg border border-nrl-border bg-[#0f162d] p-3">
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
                </div>
                ) : null}

              </div>

              <div className="order-5 overflow-hidden rounded-xl border border-nrl-border bg-[#111832]">
                <div className="border-b border-nrl-border bg-[#0f162d] px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">
                    Player Game Log
                  </div>
                </div>
                <div className="relative">
                  <div
                    className={`overflow-x-auto ${isGameLogCollapsed ? "overflow-y-hidden" : ""}`}
                    style={isGameLogCollapsed ? { maxHeight: `${gameLogCollapsedMaxHeight}px` } : undefined}
                  >
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
                          <tr className="border-b border-nrl-accent/25 bg-[#0f162d]/70">
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
                  {isGameLogCollapsed ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-gradient-to-b from-transparent via-nrl-panel/55 to-nrl-panel/90 pb-2">
                      <button
                        type="button"
                        onClick={() => setIsGameLogExpanded(true)}
                        className="pointer-events-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center text-nrl-muted transition-colors hover:text-nrl-accent"
                        aria-label="Expand player game log"
                        aria-expanded={false}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
                          <path
                            d="M5 7.5 10 12.5 15 7.5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </div>
                {shouldCollapseGameLog && isGameLogExpanded ? (
                  <div className="flex justify-center border-t border-nrl-border bg-[#0f162d]/70 py-2">
                    <button
                      type="button"
                      onClick={() => setIsGameLogExpanded(false)}
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-nrl-muted transition-colors hover:text-nrl-accent"
                      aria-label="Collapse player game log"
                      aria-expanded={true}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
                        <path
                          d="M5 12.5 10 7.5 15 12.5"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="xl:sticky xl:top-24 xl:self-start xl:h-[calc(100vh-7rem)]">{draw2026Panel}</div>
          </div>
        </section>
      ) : null}

      {isTradeSuggestorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-3 py-4 backdrop-blur-sm sm:px-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-nrl-border bg-[#11172e] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-nrl-border bg-[#11172e]/95 px-4 py-3 backdrop-blur">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-violet-300">
                  <SparkAiIcon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">Find Trades</div>
                  <div className="text-[10px] text-nrl-muted">Fantasy Trade Suggestor</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTradeSuggestorOpen(false)}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-nrl-border text-lg leading-none text-nrl-muted transition-colors hover:border-nrl-accent hover:text-white"
                aria-label="Close Find Trades"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {TRADE_SCREENSHOT_SLOTS.map((slot) => {
                  const screenshot = tradeScreenshots[slot.key]
                  const uploading = isTradeSuggestorUploading === slot.key
                  return (
                    <label
                      key={slot.key}
                      className="flex min-h-24 cursor-pointer flex-col justify-between rounded-lg border border-dashed border-nrl-border bg-nrl-panel p-3 transition-colors hover:border-nrl-accent/70"
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          void handleTradeScreenshotChange(slot.key, event.currentTarget.files)
                          event.currentTarget.value = ""
                        }}
                      />
                      <span className="flex min-w-0 items-center gap-3">
                        {screenshot ? (
                          <span className="flex h-20 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-nrl-border bg-nrl-panel-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={screenshot.dataUrl}
                              alt={`${slot.label} screenshot preview`}
                              className="h-full w-full object-contain"
                            />
                          </span>
                        ) : null}
                        <span className="min-w-0">
                          <span className="block text-xs font-bold uppercase tracking-wide text-nrl-accent">
                            {slot.label}
                          </span>
                          <span className="mt-1 block text-[10px] text-nrl-muted">{slot.hint}</span>
                        </span>
                      </span>
                      {uploading || !screenshot ? (
                        <span className="mt-2 truncate rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1.5 text-[11px] text-nrl-text">
                          {uploading ? "Processing..." : "Upload screenshot"}
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                  Extra context
                </label>
                <textarea
                  value={tradeSuggestorNotes}
                  onChange={(event) => setTradeSuggestorNotes(event.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Bank, trades remaining, players you want to hold..."
                  className="w-full resize-none rounded-lg border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text outline-none transition-colors placeholder:text-nrl-muted focus:border-nrl-accent"
                />
                {!hasFantasyPlotAccess ? (
                  <div className="mt-1.5 text-[10px] leading-4 text-nrl-muted">
                    Sign up to Pro for more informed trade advice with projections, breakevens, casualty ward and Origin info.
                  </div>
                ) : null}
              </div>

              {tradeSuggestorError ? (
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {tradeSuggestorError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] text-nrl-muted">
                  {tradeSuggestorReady ? "Ready" : "Waiting for screenshots"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleRunTradeSuggestor()
                  }}
                  disabled={!tradeSuggestorReady || isTradeSuggestorSubmitting || Boolean(isTradeSuggestorUploading)}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-violet-300/50 bg-[linear-gradient(135deg,#7c3aed,#00f58a)] px-4 py-2 text-sm font-bold text-[#07131f] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <SparkAiIcon className="h-5 w-5" />
                  {isTradeSuggestorSubmitting ? "Finding trades..." : "Find Trades"}
                </button>
              </div>

              {tradeSuggestorResult ? (
                <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
                  <FantasyTradeSuggestorResult content={tradeSuggestorResult} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

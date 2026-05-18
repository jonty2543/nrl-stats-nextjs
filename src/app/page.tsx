import Image from "next/image"
import Link from "next/link"
import type { CSSProperties } from "react"
import { AppHeader } from "@/components/layout/app-header"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { FantasyGameLogTrendBrush } from "@/components/charts/fantasy-game-log-trend-brush"
import { LandingCarousel } from "@/components/views/landing-carousel"
import { LandingHeroScrollShell } from "@/components/views/landing-hero-scroll-shell"
import { LandingSuiteTabs } from "@/components/views/landing-suite-tabs"
import {
  PlayerImageCard,
  SimplePlayerPhotoTile,
} from "@/components/views/player-comparison"
import type { BettingOddsRow, BettingOddsSnapshot } from "@/lib/betting/types"
import { BETTING_BOOKIE_COLUMNS } from "@/lib/betting/types"
import { fetchApprovedArticles } from "@/lib/articles"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import type { Draw2026Data } from "@/lib/draw/types"
import {
  applyFantasyBreakEvenOffset,
  applyFantasyProjectionOffset,
  buildFantasyOwnershipDeltaByPlayerId,
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLineupsProjectionsByPlayerId,
  getTopFantasyOwnershipRise,
  getFantasyCoachRoundMetrics,
  type FantasyCoachPlayerSnapshot,
  type FantasyPlayerSnapshot,
  type LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import {
  fetchUpcomingLineups,
  fetchUpcomingTryscorerOdds,
  type LineupPlayer,
  type LineupTeam,
  type LineupTryscorerOdds,
} from "@/lib/lineups/nrl-lineups"
import type { PlayerStat } from "@/lib/data/types"
import type { PlayerImageRecord } from "@/lib/supabase/queries"
import {
  fetchAvailableYears,
  fetchBettingOddsSnapshot,
  fetchPlayerImages,
  fetchTeamLogos,
} from "@/lib/supabase/queries"

export const revalidate = 120

const BOOKIE_LOGOS: Record<string, string> = {
  Sportsbet: "/logos/sportsbet.png",
  Pointsbet: "/logos/pointsbet.png",
  Unibet: "/logos/unibet.png",
  Palmerbet: "/logos/palmerbet.png",
  Betright: "/logos/betright.png",
}

interface BettingMatchPreview {
  dateLabel: string
  match: string
  rows: BettingOddsRow[]
}

interface DrawPreviewRow {
  round: number
  opponent: string | null
  opponentLogoUrl: string | null
  isHome: boolean
}

interface BoxSummaryRow {
  label: string
  count: number
  low: number
  q1: number
  median: number
  q3: number
  high: number
}

interface HeatmapRow {
  label: string
  cells: Array<{ opponent: string; average: number | null; count: number }>
}

interface LandingStatsSummaryRow {
  playerName: string
  team: string
  position: string
  stat: string
  average: number | null
  median: number | null
  min: number | null
  max: number | null
}

interface LandingStatsRecentFormRow {
  playerName: string
  stat: string
  recentAverage: number | null
  overallAverage: number | null
  deltaPct: number | null
}

interface LandingLeaderEntry {
  name: string
  team: string
  value: number
  imageSources: string[]
}

interface FantasyValuePreviewRow {
  name: string
  position: string
  projection: number | null
  pricedAt: number | null
  value: number | null
  ownedBy: number | null
  weeklyChange: number | null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "")
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatPercent(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `${value.toFixed(digits)}%`
}

function formatSignedPercent(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}%`
}

function formatNumber(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return value.toFixed(digits)
}

function formatPct(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `${value.toFixed(digits)}%`
}

function impliedProbability(price: number | null): number | null {
  if (price == null || price <= 1) return null
  return 1 / price
}

function modelPercentToProbability(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  if (value <= 1) return Math.max(0.01, Math.min(0.99, value))
  return Math.max(0.01, Math.min(0.99, value / 100))
}

function bestBookMarketPercentage(rows: BettingOddsRow[]): number | null {
  const prices = rows.map((row) => row.bestPrice).filter((price): price is number => price != null && price > 1)
  if (prices.length === 0) return null
  const inverseSum = prices.reduce((sum, price) => sum + 1 / price, 0)
  return inverseSum > 0 ? inverseSum * 100 : null
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentileRank(value: number | null, sample: number[]): number | null {
  if (value == null || sample.length === 0) return null
  const lessThan = sample.filter((entry) => entry < value).length
  const equalTo = sample.filter((entry) => entry === value).length
  return ((lessThan + equalTo * 0.5) / sample.length) * 100
}

function formatOrdinal(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const rounded = Math.round(value)
  const remainder = rounded % 100
  if (remainder >= 11 && remainder <= 13) return `${rounded}th`
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`
    case 2:
      return `${rounded}nd`
    case 3:
      return `${rounded}rd`
    default:
      return `${rounded}th`
  }
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `$${Math.round(value).toLocaleString()}`
}

function formatShortDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed)
}

function heroPlayerImageMaskStyle(mobile = false): CSSProperties {
  const mask = mobile
    ? "radial-gradient(102% 112% at 50% 88%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 42%, rgba(0,0,0,0.9) 58%, rgba(0,0,0,0.52) 72%, rgba(0,0,0,0.18) 84%, transparent 94%)"
    : "radial-gradient(108% 116% at 50% 88%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 44%, rgba(0,0,0,0.9) 60%, rgba(0,0,0,0.54) 74%, rgba(0,0,0,0.18) 86%, transparent 95%)"

  return {
    WebkitMaskImage: mask,
    maskImage: mask,
  }
}

function normalisePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parsePersonName(value: string): { first: string; last: string } {
  const parts = normalisePersonName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return { first: parts[0], last: parts[parts.length - 1] }
}

function normaliseRemoteImageCandidates(value: string | null | undefined): string[] {
  if (!value || typeof value !== "string") return []
  const trimmed = value.trim()
  if (!trimmed) return []

  const out: string[] = []
  const seen = new Set<string>()
  const push = (candidate: string | null | undefined) => {
    if (!candidate) return
    const normalised = candidate.trim()
    if (!normalised || seen.has(normalised)) return
    seen.add(normalised)
    out.push(normalised)
  }

  if (trimmed.startsWith("http://")) {
    push(`https://${trimmed.slice("http://".length)}`)
  }
  if (trimmed.includes("/remote.axd?http://")) {
    push(trimmed.replace("/remote.axd?http://", "/remote.axd?https://"))
  }
  const marker = "/remote.axd?"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length)
    if (nested) {
      push(nested.startsWith("http://") ? `https://${nested.slice("http://".length)}` : nested)
    }
  }
  push(trimmed)
  return out
}

function buildPlayerImageSources(playerName: string, teamHint: string | null, rows: PlayerImageRecord[]): string[] {
  const sorted = buildPlayerImageCandidates(playerName, teamHint, rows)
  const out: string[] = []
  for (const row of sorted) {
    for (const source of [row.body_image, row.head_image]) {
      for (const variant of normaliseRemoteImageCandidates(source)) {
        out.push(variant)
      }
    }
  }
  out.push("/body-shot.png")
  return out
}

function buildPlayerImageCandidates(playerName: string, teamHint: string | null, rows: PlayerImageRecord[]): PlayerImageRecord[] {
  const targetNorm = normalisePersonName(playerName)
  const targetParsed = parsePersonName(playerName)
  const teamNorm = teamHint ? normalisePersonName(teamHint) : ""

  const candidates = rows.filter((row) => {
    const rowName = row.player ?? ""
    if (!rowName) return false
    const rowNorm = normalisePersonName(rowName)
    if (rowNorm === targetNorm) return true
    const parsed = parsePersonName(rowName)
    return (
      parsed.last &&
      parsed.last === targetParsed.last &&
      parsed.first[0] &&
      parsed.first[0] === targetParsed.first[0]
    )
  })

  return [...candidates].sort((a, b) => {
    const aTeamMatch = teamNorm && a.team ? normalisePersonName(a.team) === teamNorm : false
    const bTeamMatch = teamNorm && b.team ? normalisePersonName(b.team) === teamNorm : false
    if (aTeamMatch !== bTeamMatch) return aTeamMatch ? -1 : 1

    const aHasBody = Boolean(a.body_image)
    const bHasBody = Boolean(b.body_image)
    if (aHasBody !== bHasBody) return aHasBody ? -1 : 1

    const aHasImage = Boolean(a.body_image || a.head_image)
    const bHasImage = Boolean(b.body_image || b.head_image)
    if (aHasImage !== bHasImage) return aHasImage ? -1 : 1

    const aDate = a.last_seen_match_date ?? ""
    const bDate = b.last_seen_match_date ?? ""
    return bDate.localeCompare(aDate)
  })
}

function primaryTeamForRows(rows: PlayerStat[]): string | null {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const team = typeof row.Team === "string" ? row.Team : ""
    if (!team) continue
    counts.set(team, (counts.get(team) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function sortRowsByDateDesc(rows: PlayerStat[]): PlayerStat[] {
  return [...rows].sort((a, b) => {
    const dateA = typeof a.match_date === "string" ? a.match_date : `${a.Year}-${String(a.Round).padStart(2, "0")}`
    const dateB = typeof b.match_date === "string" ? b.match_date : `${b.Year}-${String(b.Round).padStart(2, "0")}`
    return dateB.localeCompare(dateA)
  })
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  if (lowerIndex === upperIndex) return sorted[lowerIndex]
  const weight = position - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

function buildDrawPreviewRows(draw2026Data: Draw2026Data | null, team: string | null): DrawPreviewRow[] {
  if (!draw2026Data || !team) return []
  const teamKey = normaliseTeamKey(team)
  if (!teamKey) return []

  return draw2026Data.rows
    .filter((row) => normaliseTeamKey(row.home) === teamKey || normaliseTeamKey(row.away) === teamKey)
    .slice(0, 13)
    .map((row) => {
      const isHome = normaliseTeamKey(row.home) === teamKey
      const opponent = isHome ? row.away : row.home
      return {
        round: row.round,
        opponent,
        opponentLogoUrl: draw2026Data.teamLogos[normaliseTeamKey(opponent)] ?? null,
        isHome,
      }
    })
}

function buildH2HPreviews(snapshot: BettingOddsSnapshot, limit = 2, requirePrices = true): BettingMatchPreview[] {
  const grouped = new Map<string, BettingMatchPreview>()

  for (const row of snapshot.h2h) {
    const key = `${row.date}|${row.match}`
    const current = grouped.get(key) ?? {
      dateLabel: formatShortDate(row.date),
      match: row.match,
      rows: [],
    }
    current.rows.push(row)
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .filter((group) => {
      if (group.rows.length < 2) return false
      if (!requirePrices) return true
      return group.rows.some(
        (row) =>
          row.bestPrice != null ||
          BETTING_BOOKIE_COLUMNS.some((bookie) => row[bookie] != null),
      )
    })
    .sort((a, b) => b.rows[0].date.localeCompare(a.rows[0].date) || a.match.localeCompare(b.match))
    .slice(0, limit)
}

function buildBetTrackerPreviewRows(snapshot: BettingOddsSnapshot, limit = 3): BettingOddsRow[] {
  const grouped = new Map<string, BettingOddsRow>()

  for (const row of snapshot.h2h) {
    const key = `${row.date}|${row.match}`
    if (!grouped.has(key)) {
      grouped.set(key, row)
    }
  }

  return [...grouped.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.match.localeCompare(b.match))
    .slice(0, limit)
}

function formatKickoffLabel(value: string | null): string {
  if (!value) return "Kickoff TBC"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

function formatArticleDate(value: string | null): string {
  if (!value) return "Date TBC"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed)
}

function articlePreviewText(body: string, maxLength = 180): string {
  const cleaned = body
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength).trim()}...`
}

function resolveLineupTeamLogo(team: LineupTeam | null, teamLogos: Record<string, string>): string | null {
  for (const candidate of [team?.team, team?.teamName]) {
    const logo = teamLogos[normaliseTeamKey(candidate)]
    if (logo) return logo
  }
  return null
}

function getLineupStartingPlayers(team: LineupTeam | null, limit = 7): LineupPlayer[] {
  return [...(team?.players ?? [])]
    .filter((player) => player.isOnField && (player.number == null || player.number <= 13))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
    .slice(0, limit)
}

function getLineupPlayerImageSources(player: LineupPlayer): string[] {
  return [
    ...normaliseRemoteImageCandidates(player.headImage),
    ...normaliseRemoteImageCandidates(player.bodyImage),
    "/body-shot.png",
  ]
}

function getLineupPlayerMetric(
  player: LineupPlayer,
  tryscorerOdds: Record<string, LineupTryscorerOdds>,
): { label: string; value: string; valueClassName: string } {
  if (player.fantasyProjection != null) {
    return { label: "Proj", value: formatNumber(player.fantasyProjection, 0), valueClassName: "text-emerald-300" }
  }

  const odds = tryscorerOdds[normaliseTeamKey(player.player)]
  if (odds?.bestPrice != null) {
    return { label: odds.bestBookie ?? "Odds", value: odds.bestPrice.toFixed(2), valueClassName: "text-white" }
  }

  return { label: "Role", value: player.position || "-", valueClassName: "text-white/72" }
}

function buildFantasyValuePreviewRows(
  fantasyPlayers: FantasyPlayerSnapshot[],
  fantasyCoachPlayers: FantasyCoachPlayerSnapshot[],
  lineupsProjections: LineupsProjectionSnapshot,
  ownershipDeltaByPlayerId: Map<number, number | null>,
  topOwnershipRise: number | null,
  limit = 6,
): FantasyValuePreviewRow[] {
  return fantasyPlayers
    .map((player) => {
      const coachMetrics = getFantasyCoachRoundMetrics(fantasyCoachPlayers.find((coachPlayer) => coachPlayer.id === player.id) ?? null)
      const weeklyChange = ownershipDeltaByPlayerId.get(player.id) ?? null
      const modelProjection =
        lineupsProjections.projectionByPlayerId.get(player.id) ??
        lineupsProjections.projectionByPlayerName.get(normalisePersonName(player.name)) ??
        null
      const projectionBase =
        lineupsProjections.source === "lineup_unaware" && player.isBye
          ? 0
          : modelProjection ?? coachMetrics.projection ?? player.projectedAvg ?? null
      const projection = applyFantasyProjectionOffset(
        projectionBase,
        weeklyChange,
        topOwnershipRise,
      )
      const value = projection != null && player.pricedAt != null ? projection - player.pricedAt : null
      return {
        name: player.name,
        position: player.positionLabel,
        projection,
        pricedAt: player.pricedAt,
        value,
        ownedBy: player.ownedBy,
        weeklyChange,
      }
    })
    .filter((row) => row.value != null)
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function pickPreferredFantasyPlayerName(
  fantasyPlayers: FantasyPlayerSnapshot[],
  candidates: string[],
  fallbackIndex = 0,
): string | null {
  for (const candidate of candidates) {
    const exact = fantasyPlayers.find((player) => normalisePersonName(player.name) === normalisePersonName(candidate))
    if (exact) return exact.name
  }
  return fantasyPlayers[fallbackIndex]?.name ?? null
}

function pickHighestPricedFantasyPlayer(fantasyPlayers: FantasyPlayerSnapshot[]): FantasyPlayerSnapshot | null {
  if (fantasyPlayers.length === 0) return null

  return [...fantasyPlayers]
    .sort((a, b) => {
      const aPrice = a.cost ?? a.pricedAt ?? -1
      const bPrice = b.cost ?? b.pricedAt ?? -1
      if (aPrice !== bPrice) return bPrice - aPrice
      return (b.avgPoints ?? -1) - (a.avgPoints ?? -1)
    })[0] ?? null
}

function buildStatsSummaryRows(
  players: Array<{ name: string; rows: PlayerStat[] }>,
  statKeys: string[],
): LandingStatsSummaryRow[] {
  return players.flatMap((player) => {
    const team = primaryTeamForRows(player.rows) ?? "-"
    const position = typeof player.rows[0]?.Position === "string" ? player.rows[0].Position : "-"
    return statKeys.map((stat) => {
      const values = player.rows
        .map((row) => toFiniteNumber(row[stat]))
        .filter((value): value is number => value !== null)
      return {
        playerName: player.name,
        team,
        position,
        stat,
        average: average(values),
        median: values.length > 0 ? quantile(values, 0.5) : null,
        min: values.length > 0 ? Math.min(...values) : null,
        max: values.length > 0 ? Math.max(...values) : null,
      }
    })
  })
}

function buildRecentFormRows(
  players: Array<{ name: string; rows: PlayerStat[] }>,
  statKeys: string[],
): LandingStatsRecentFormRow[] {
  return players.flatMap((player) => {
    const sortedRows = sortRowsByDateDesc(player.rows)
    return statKeys.map((stat) => {
      const overallValues = sortedRows
        .map((row) => toFiniteNumber(row[stat]))
        .filter((value): value is number => value !== null)
      const recentValues = sortedRows
        .slice(0, 5)
        .map((row) => toFiniteNumber(row[stat]))
        .filter((value): value is number => value !== null)
      const overallAverage = average(overallValues)
      const recentAverage = average(recentValues)
      const deltaPct =
        overallAverage != null && overallAverage !== 0 && recentAverage != null
          ? ((recentAverage - overallAverage) / overallAverage) * 100
          : null

      return {
        playerName: player.name,
        stat,
        recentAverage,
        overallAverage,
        deltaPct,
      }
    })
  })
}

function buildFantasySnapshotLeaderEntries(
  fantasyPlayers: FantasyPlayerSnapshot[],
  metric: "totalPoints" | "avgPoints" | "ownedBy",
  playerImages: PlayerImageRecord[],
): LandingLeaderEntry[] {
  return fantasyPlayers
    .map((player) => ({
      name: player.name,
      team: player.positionLabel,
      value: player[metric],
    }))
    .filter((entry): entry is { name: string; team: string; value: number } => entry.value != null && entry.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((entry) => ({
      ...entry,
      imageSources: buildPlayerImageSources(entry.name, null, playerImages),
    }))
}

function buildOpponentHeatmapRows(rows: PlayerStat[], years: string[]): HeatmapRow[] {
  const latestYear = [...new Set(rows.map((row) => String(row.Year ?? "").trim()).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? null
  const opponentFirstRound = new Map<string, number>()

  if (latestYear) {
    for (const row of rows) {
      const opponent = String(row.Opponent ?? "").trim()
      const season = String(row.Year ?? "").trim()
      const round = toFiniteNumber(row.Round)
      if (!opponent || season !== latestYear || round == null) continue
      const current = opponentFirstRound.get(opponent)
      if (current == null || round < current) {
        opponentFirstRound.set(opponent, round)
      }
    }
  }

  const opponents = [...new Set(rows.map((row) => String(row.Opponent ?? "").trim()).filter(Boolean))]
    .sort((a, b) => {
      const aRound = opponentFirstRound.get(a)
      const bRound = opponentFirstRound.get(b)
      if (aRound != null && bRound != null && aRound !== bRound) return aRound - bRound
      if (aRound != null) return -1
      if (bRound != null) return 1
      return a.localeCompare(b)
    })
    .slice(0, 6)
  const scopes = ["All", ...years]

  return scopes.map((scope) => {
    const scopedRows = scope === "All" ? rows : rows.filter((row) => row.Year === scope)
    return {
      label: scope,
      cells: opponents.map((opponent) => {
        const values = scopedRows
          .filter((row) => row.Opponent === opponent)
          .map((row) => toFiniteNumber(row.Fantasy))
          .filter((value): value is number => value !== null)
        const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
        return { opponent, average, count: values.length }
      }),
    }
  })
}

function buildBoxSummaries(rows: PlayerStat[], years: string[]): BoxSummaryRow[] {
  const scopes = ["All", ...years]
  return scopes.flatMap((scope) => {
    const values = (scope === "All" ? rows : rows.filter((row) => row.Year === scope))
      .map((row) => toFiniteNumber(row.Fantasy))
      .filter((value): value is number => value !== null)
    if (values.length === 0) return []
    return [{
      label: scope,
      count: values.length,
      low: Math.min(...values),
      q1: quantile(values, 0.25),
      median: quantile(values, 0.5),
      q3: quantile(values, 0.75),
      high: Math.max(...values),
    }]
  })
}

function getScaledHeatColour(value: number | null): string {
  if (value == null) return "rgba(255,255,255,0.05)"
  const clamped = Math.max(20, Math.min(90, value))
  const ratio = (clamped - 20) / 70
  const r = Math.round(210 - ratio * 130)
  const g = Math.round(90 + ratio * 125)
  const b = Math.round(120 - ratio * 45)
  return `rgba(${r}, ${g}, ${b}, 0.55)`
}

function LiveBroadcastIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="1.7" fill="currentColor" stroke="none" />
      <path d="M6.7 6.8a4.7 4.7 0 0 0 0 6.4" />
      <path d="M13.3 6.8a4.7 4.7 0 0 1 0 6.4" />
      <path d="M4.1 4.4a8.1 8.1 0 0 0 0 11.2" />
      <path d="M15.9 4.4a8.1 8.1 0 0 1 0 11.2" />
    </svg>
  )
}

function PreviewFrame({
  title,
  children,
  contentClassName,
  live = false,
}: {
  title: string
  children: React.ReactNode
  contentClassName?: string
  live?: boolean
}) {
  return (
    <div className="h-full bg-[linear-gradient(180deg,rgba(27,33,61,0.96),rgba(15,18,36,0.96))] p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#8d63ff]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#00f58a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
        </div>
        <div className="flex items-center gap-2.5">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/18 bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <LiveBroadcastIcon />
              Live
            </span>
          ) : null}
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">{title}</div>
        </div>
      </div>
      <div className={`mt-3 min-h-[300px] sm:mt-4 sm:min-h-[420px] lg:min-h-[520px] ${contentClassName ?? ""}`}>{children}</div>
    </div>
  )
}

function StatsPreviewNav({ active }: { active: "players" | "leaders" }) {
  const tabs = [
    { key: "players", label: "Players" },
    { key: "teams", label: "Teams" },
    { key: "leaders", label: "Leaders" },
  ] as const

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-2 py-2 sm:px-3 sm:py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-xs font-semibold text-[#00f58a] sm:text-sm">Short Side</span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/72 sm:px-2 sm:py-1 sm:text-[11px]">
            Stats
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-[#171c36] p-0.5 text-[9px] font-semibold sm:p-1 sm:text-[11px]">
          {tabs.map((tab) => {
            const isActive = tab.key === active
            return (
              <span
                key={tab.key}
                className={`rounded-md px-2 py-1 transition-colors sm:px-3 sm:py-1.5 ${
                  isActive ? "bg-emerald-400/16 text-emerald-300" : "text-white/45"
                }`}
              >
                {tab.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SimpleHistogramPreview({
  title,
  statLabel,
  series,
}: {
  title: string
  statLabel: string
  series: Array<{ label: string; color: string; values: number[]; mean: number | null }>
}) {
  const nonEmptySeries = series.filter((entry) => entry.values.length > 0)
  if (nonEmptySeries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-2 sm:p-3">
        <div className="text-xs font-semibold text-white sm:text-sm">{title}</div>
        <div className="mt-8 text-center text-xs text-white/35">No distribution data</div>
      </div>
    )
  }

  const combined = nonEmptySeries.flatMap((entry) => entry.values)
  const min = Math.min(...combined)
  const max = Math.max(...combined)
  const binCount = 6
  const range = max - min || 1
  const peak = Math.max(
    1,
    ...nonEmptySeries.flatMap((entry) => {
      const counts = Array.from({ length: binCount }, () => 0)
      for (const value of entry.values) {
        const rawIndex = Math.floor(((value - min) / range) * binCount)
        const safeIndex = Math.min(binCount - 1, Math.max(0, rawIndex))
        counts[safeIndex] += 1
      }
      return counts
    }),
  )

  return (
    <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-2 sm:p-3">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div>
          <div className="text-xs font-semibold text-white sm:text-sm">{title}</div>
          <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/35 sm:text-[10px] sm:tracking-[0.14em]">n &gt; 20 — showing histogram + mean</div>
        </div>
        <div className="space-y-1 text-[8px] text-white/72 sm:text-[10px]">
          {nonEmptySeries.map((entry) => (
            <div key={entry.label} className="flex items-center gap-1.5 sm:gap-2">
              <span className="h-2 w-2 rounded-sm sm:h-2.5 sm:w-2.5" style={{ backgroundColor: entry.color }} />
              <span className="max-w-[6.5rem] truncate sm:max-w-none">{entry.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 sm:mt-4">
        <div className="grid h-24 grid-cols-6 items-end gap-1 sm:h-40 sm:gap-2">
          {Array.from({ length: binCount }, (_, binIndex) => (
            <div key={`${title}-bin-${binIndex}`} className="relative flex h-full items-end gap-0.5 sm:gap-1">
              {nonEmptySeries.map((entry) => {
                const counts = Array.from({ length: binCount }, () => 0)
                for (const value of entry.values) {
                  const rawIndex = Math.floor(((value - min) / range) * binCount)
                  const safeIndex = Math.min(binCount - 1, Math.max(0, rawIndex))
                  counts[safeIndex] += 1
                }
                const heightPct = (counts[binIndex] / peak) * 100
                return (
                  <div
                    key={`${title}-${entry.label}-${binIndex}`}
                    className="w-full rounded-t-sm border"
                    style={{
                      height: `${Math.max(heightPct, counts[binIndex] > 0 ? 10 : 0)}%`,
                      backgroundColor: `${entry.color}33`,
                      borderColor: `${entry.color}aa`,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[8px] uppercase tracking-[0.1em] text-white/35 sm:mt-3 sm:text-[10px] sm:tracking-[0.12em]">
          <span>{Math.round(min)}</span>
          <span>{statLabel}</span>
          <span>{Math.round(max)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[9px] text-white/72 sm:mt-2 sm:gap-4 sm:text-[11px]">
          {nonEmptySeries.map((entry) => (
            <span key={`${title}-${entry.label}-mean`} style={{ color: entry.color }}>
              {entry.label.split(" (")[0]} {entry.mean == null ? "-" : entry.mean.toFixed(1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">{children}</div>
}

function FeatureSection({
  eyebrow,
  title,
  description,
  bullets,
  ctaHref,
  ctaLabel,
  live = false,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  ctaHref: string
  ctaLabel: string
  live?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="space-y-6 border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,42,0.92),rgba(11,14,29,0.92))] p-5 sm:space-y-7 sm:p-7 lg:p-8">
      <div className="min-w-0 px-1 sm:px-2">
        <div className="flex flex-wrap items-center gap-3">
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          {live ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <LiveBroadcastIcon />
              Live
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">{title}</h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] lg:items-start">
          <p className="max-w-2xl text-sm leading-6 text-white/58 sm:leading-7">{description}</p>
          <div className="grid gap-x-5 gap-y-2 md:grid-cols-2">
            {bullets.map((bullet) => (
              <div key={bullet} className="flex items-center gap-2 text-sm text-white/78">
                <span className="h-1.5 w-1.5 rounded-full bg-nrl-accent" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>
        <Link
          href={ctaHref}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:border-white/22 hover:text-white sm:mt-6"
        >
          {ctaLabel}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="h-full min-w-0 px-1 sm:px-2">{children}</div>
    </section>
  )
}

export default async function Home() {
  const [
    fantasyPlayers,
    fantasyCoachPlayers,
    lineupsProjections,
    availableYears,
    bettingSnapshot,
    playerImages,
    approvedArticles,
    teamLogos,
    draw2026Data,
    lineups,
    tryscorerOdds,
  ] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchAvailableYears(),
    fetchBettingOddsSnapshot().catch((): BettingOddsSnapshot => ({
      h2h: [],
      line: [],
      total: [],
      tryscorer: [],
      generatedAt: "",
    })),
    fetchPlayerImages().catch(() => []),
    fetchApprovedArticles().catch(() => []),
    fetchTeamLogos().catch((): Record<string, string> => ({})),
    loadDraw2026Data().catch(() => null),
    fetchUpcomingLineups({ includeFantasyProjections: true }).catch(() => []),
    fetchUpcomingTryscorerOdds().catch((): Record<string, LineupTryscorerOdds> => ({})),
  ])

  const previewYears = [...availableYears].map(String).sort((a, b) => Number(b) - Number(a)).slice(0, 3)
  const plotYears = previewYears.filter((year) => year !== "2024")

  const ownershipDeltaByPlayerId = buildFantasyOwnershipDeltaByPlayerId(fantasyPlayers, null)
  const topOwnershipRise = getTopFantasyOwnershipRise(ownershipDeltaByPlayerId)
  const topOwnershipBuyTargets = fantasyPlayers
    .map((player) => ({
      name: player.name,
      delta: ownershipDeltaByPlayerId.get(player.id) ?? null,
    }))
    .filter((player): player is { name: string; delta: number } => player.delta != null && player.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
  const fantasyValuePreviewRows = buildFantasyValuePreviewRows(
    fantasyPlayers,
    fantasyCoachPlayers,
    lineupsProjections,
    ownershipDeltaByPlayerId,
    topOwnershipRise,
  )
  const spotlightFantasyPlayer = pickHighestPricedFantasyPlayer(fantasyPlayers)
  const spotlightCoachPlayer = spotlightFantasyPlayer
    ? fantasyCoachPlayers.find((player) => player.id === spotlightFantasyPlayer.id) ?? null
    : null
  const spotlightCoachMetrics = getFantasyCoachRoundMetrics(spotlightCoachPlayer)
  const fantasyRoundLabel = spotlightCoachMetrics.round != null ? `Round ${spotlightCoachMetrics.round}` : "Round X"
  const statsPlayer1Name = pickPreferredFantasyPlayerName(fantasyPlayers, ["Nathan Cleary"], 0)
  const statsPlayer2Name = pickPreferredFantasyPlayerName(fantasyPlayers, ["Nicholas Hynes", "Nicho Hynes"], 1)
  const spotlightRows: PlayerStat[] = []
  const statsPlayer1RowsRaw: PlayerStat[] = []
  const statsPlayer2RowsRaw: PlayerStat[] = []

  const spotlightSortedRows = sortRowsByDateDesc(spotlightRows)
  const spotlightTeam = primaryTeamForRows(spotlightSortedRows)
  const spotlightImageSources = spotlightFantasyPlayer
    ? buildPlayerImageSources(spotlightFantasyPlayer.name, spotlightTeam, playerImages)
    : ["/body-shot.png"]
  const spotlightWeeklyDelta = spotlightFantasyPlayer
    ? ownershipDeltaByPlayerId.get(spotlightFantasyPlayer.id) ?? null
    : null
  const spotlightProjection = applyFantasyProjectionOffset(
    spotlightFantasyPlayer
      ? lineupsProjections.source === "lineup_unaware" && spotlightFantasyPlayer.isBye
        ? 0
        : lineupsProjections.projectionByPlayerId.get(spotlightFantasyPlayer.id) ??
          lineupsProjections.projectionByPlayerName.get(normalisePersonName(spotlightFantasyPlayer.name)) ??
          spotlightCoachMetrics.projection ??
          spotlightFantasyPlayer.projectedAvg ??
          null
      : null,
    spotlightWeeklyDelta,
    topOwnershipRise,
  )
  const spotlightBreakEven = applyFantasyBreakEvenOffset(
    spotlightCoachMetrics.breakEven ?? spotlightFantasyPlayer?.be ?? null,
    spotlightFantasyPlayer?.id ?? null,
    spotlightCoachMetrics.round,
  )
  const spotlightLineupRole = spotlightFantasyPlayer
    ? lineups
        .flatMap((match) => [
          ...(match.homeTeam?.players ?? []),
          ...(match.awayTeam?.players ?? []),
        ])
        .find(
          (player) =>
            player.playerId === spotlightFantasyPlayer.id ||
            normalisePersonName(player.player) === normalisePersonName(spotlightFantasyPlayer.name),
        ) ?? null
    : null
  const spotlightDrawRows = buildDrawPreviewRows(draw2026Data, spotlightTeam)
  const spotlightCardImage = spotlightFantasyPlayer
    ? {
        player: spotlightFantasyPlayer.name,
        team: spotlightTeam,
        number: null,
        position: spotlightFantasyPlayer.positionLabel ?? null,
        head_image: null,
        body_image: spotlightImageSources.find((source) => source !== "/body-shot.png") ?? spotlightImageSources[0] ?? "/body-shot.png",
        last_seen_match_date: null,
      }
    : null
  const spotlightHeatmapRows = buildOpponentHeatmapRows(spotlightSortedRows, plotYears)
  const spotlightBoxSummaries = buildBoxSummaries(spotlightSortedRows, plotYears)
  const spotlightLineupFantasyAverage = spotlightLineupRole?.position
    ? average(
        spotlightSortedRows
          .filter((row) => String(row.Position ?? "").toLowerCase() === spotlightLineupRole.position.toLowerCase())
          .map((row) => toFiniteNumber(row.Fantasy))
          .filter((value): value is number => value != null),
      )
    : null
  const h2hPreviews = buildH2HPreviews(bettingSnapshot, 1)
  const bettingLandingPreviews = h2hPreviews.length > 0 ? h2hPreviews : buildH2HPreviews(bettingSnapshot, 1, false)
  const betTrackerPreviewRows = buildBetTrackerPreviewRows(bettingSnapshot)
  const lineupsLandingMatch = lineups[0] ?? null
  const homeLineupPlayers = getLineupStartingPlayers(lineupsLandingMatch?.homeTeam ?? null)
  const awayLineupPlayers = getLineupStartingPlayers(lineupsLandingMatch?.awayTeam ?? null)
  const articlePreviewRows = approvedArticles.slice(0, 3)
  const statsPlayer1Rows = sortRowsByDateDesc(statsPlayer1RowsRaw)
  const statsPlayer2Rows = sortRowsByDateDesc(statsPlayer2RowsRaw)
  const statsPlayers = [
    { name: statsPlayer1Name ?? "Player 1", rows: statsPlayer1Rows },
    { name: statsPlayer2Name ?? "Player 2", rows: statsPlayer2Rows },
  ].filter((entry) => entry.rows.length > 0)
  const statsSummaryRows = buildStatsSummaryRows(statsPlayers, ["All Run Metres", "Kicking Metres"])
  const statsRecentFormRows = buildRecentFormRows(statsPlayers, ["All Run Metres", "Kicking Metres"])
  const statsPlayer1Team = primaryTeamForRows(statsPlayer1Rows)
  const statsPlayer2Team = primaryTeamForRows(statsPlayer2Rows)
  const statsPlayer1CardImage = statsPlayer1Name
    ? {
        player: statsPlayer1Name,
        team: statsPlayer1Team,
        number: null,
        position: typeof statsPlayer1Rows[0]?.Position === "string" ? statsPlayer1Rows[0].Position : null,
        head_image: null,
        body_image: buildPlayerImageSources(statsPlayer1Name, statsPlayer1Team, playerImages).find((source) => source !== "/body-shot.png") ?? "/body-shot.png",
        last_seen_match_date: null,
      }
    : null
  const statsPlayer2CardImage = statsPlayer2Name
    ? {
        player: statsPlayer2Name,
        team: statsPlayer2Team,
        number: null,
        position: typeof statsPlayer2Rows[0]?.Position === "string" ? statsPlayer2Rows[0].Position : null,
        head_image: null,
        body_image: buildPlayerImageSources(statsPlayer2Name, statsPlayer2Team, playerImages).find((source) => source !== "/body-shot.png") ?? "/body-shot.png",
        last_seen_match_date: null,
      }
    : null
  const statsPercentileRows = statsSummaryRows.map((row) => {
    const scopedRows: PlayerStat[] = []
    const grouped = new Map<string, number[]>()
    for (const statRow of scopedRows) {
      const key = `${statRow.Name}|${statRow.Team}`
      const current = grouped.get(key) ?? []
      const value = toFiniteNumber(statRow[row.stat])
      if (value != null) current.push(value)
      grouped.set(key, current)
    }
    const peerAverages = [...grouped.values()]
      .map((values) => average(values))
      .filter((value): value is number => value != null)
    return {
      ...row,
      percentile: percentileRank(row.average, peerAverages),
    }
  })
  const statsLeaderCards = [
    { key: "totalPoints" as const, label: "Points" },
    { key: "avgPoints" as const, label: "Average" },
    { key: "ownedBy" as const, label: "Ownership %" },
  ].map((card) => ({
    ...card,
    leaders: buildFantasySnapshotLeaderEntries(fantasyPlayers, card.key, playerImages),
  }))

  return (
    <div className="relative overflow-hidden text-nrl-text">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 sm:px-6 lg:px-8">
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <AppHeader sticky showBillingNav showStatsTabs />
        </div>

        <LandingHeroScrollShell>
          <section className="-mx-4 grid gap-6 px-4 pb-0 pt-8 sm:-mx-6 sm:gap-8 sm:px-6 sm:pb-12 sm:pt-10 lg:-mx-8 lg:mt-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:pb-0 lg:pt-14">
            <div className="max-w-2xl lg:pb-10">
              <div className="inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                NRL Analysis Platform
              </div>
              <h1 className="mt-5 pb-2 text-[2.85rem] font-black leading-[0.98] tracking-tight text-white sm:text-6xl">
                Smarter Analysis for
                {" "}
                <span className="bg-[linear-gradient(135deg,#ffffff_0%,#ae94ff_44%,#53ffd0_100%)] bg-clip-text text-transparent">
                  Rugby League
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/62 sm:text-base sm:leading-7">
                Short Side brings Fantasy, Lineups, Betting, Articles, and Stats into one hub for NRL analytics.
              </p>

              <div className="relative mt-6 flex items-end justify-center lg:hidden">
                <div className="relative flex h-[15.5rem] w-full max-w-[26rem] items-end justify-center overflow-hidden px-1 pt-3">
                  <Image
                    src="/nrl_players-removebg-preview.png"
                    alt="NRL players"
                    width={720}
                    height={720}
                  priority
                  className="relative z-10 translate-x-2 h-[104%] w-auto max-w-[126%] object-contain object-bottom"
                  style={heroPlayerImageMaskStyle(true)}
                />
                </div>
              </div>
            </div>

            <div className="relative hidden lg:flex lg:items-end lg:justify-center lg:self-end">
              <div className="relative flex h-[17.25rem] w-full max-w-[31.75rem] items-end justify-center overflow-visible px-1 pt-3">
                <Image
                  src="/nrl_players-removebg-preview.png"
                  alt="NRL players"
                  width={720}
                  height={720}
                  priority
                  className="relative z-10 translate-x-4 h-[122%] w-auto max-w-[146%] object-contain object-bottom"
                  style={heroPlayerImageMaskStyle()}
                />
              </div>
            </div>
          </section>
        </LandingHeroScrollShell>


        <section className="space-y-6 border-t border-white/8 px-4 py-10 sm:px-6 lg:px-8">
          <div className="px-1 sm:px-2">
            <SectionEyebrow>Built For Weekly Decisions</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-bold text-white">Previews of the full suite</h2>
          </div>

          <LandingSuiteTabs labels={["Fantasy", "Lineups", "Betting", "Articles", "Stats", "NRL AI"]}>
          <FeatureSection
            eyebrow="Fantasy"
            title="Lineup-aware projections, value tools, and player detail"
            description="Use Fantasy to move from ownership shifts into projection value, breakevens, team-list context, template teams, comments, and the full player game log."
            bullets={[
              "Priced at vs projection",
              "Lineup roles and role averages",
              "Template teams and ownership movers",
              "Draft / H2H odds tools",
            ]}
            ctaHref="/dashboard/fantasy"
            ctaLabel="Fantasy"
            live
          >
            <LandingCarousel>
              <PreviewFrame title="Fantasy / Player Detail" live>
                <div className="mb-3 grid gap-2 rounded-2xl border border-white/8 bg-[#20284a] p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:p-3">
                  <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-center text-xs font-bold text-emerald-300">
                    Find Value
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-center text-xs font-semibold text-white/72">
                    Template Team
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-center text-xs font-semibold text-white/72">
                    Draft / H2H Odds
                  </div>
                </div>
                <div className="grid gap-3 sm:gap-4 xl:grid-cols-[290px_minmax(0,1fr)_220px]">
                  <div className="relative flex min-h-[12rem] items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-[#1b2140] p-2 sm:min-h-0 sm:p-3">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(71,255,182,0.22),transparent_34%),radial-gradient(circle_at_74%_78%,rgba(129,92,255,0.24),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
                    <div className="pointer-events-none absolute left-[8%] top-[12%] h-24 w-24 rounded-full bg-emerald-300/10 blur-2xl" />
                    <div className="pointer-events-none absolute bottom-[10%] right-[12%] h-28 w-28 rounded-full bg-violet-400/12 blur-3xl" />
                    <div className="w-full max-w-[14.75rem] rounded-[1.2rem] bg-[linear-gradient(180deg,rgba(17,23,46,0.46),rgba(17,23,46,0.18))] shadow-[0_18px_40px_rgba(8,10,18,0.22)] sm:max-w-[15.5rem]">
                      <div className="relative">
                        <PlayerImageCard
                          playerName={spotlightFantasyPlayer?.name ?? "Fantasy player"}
                          imageRow={spotlightCardImage}
                          teamLogoUrl={null}
                          fantasyPosition={spotlightFantasyPlayer?.positionLabel ?? null}
                          frameless
                          priority
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-2.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-bold text-white sm:text-3xl">{spotlightFantasyPlayer?.name ?? "Fantasy player"}</h4>
                      <span className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-xs text-white/55">Team: {spotlightTeam ?? "-"}</span>
                      <span className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-xs text-white/55">Status: {spotlightFantasyPlayer?.status ?? "available"}</span>
                      {spotlightLineupRole?.position ? (
                        <span className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                          Lineup: {spotlightLineupRole.position}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:min-h-[248px] sm:grid-cols-3 sm:grid-rows-2 sm:gap-3">
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Price</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatCurrency(spotlightFantasyPlayer?.cost ?? null)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                          {spotlightLineupRole?.position ? `Avg at ${spotlightLineupRole.position}` : "Avg"}
                        </div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">
                          {formatNumber(spotlightLineupFantasyAverage ?? spotlightFantasyPlayer?.avgPoints ?? null, 1)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Own %</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatPercent(spotlightFantasyPlayer?.ownedBy ?? null)}</div>
                        <div className="mt-1 text-[11px] text-white/42">Weekly {formatSignedPercent(spotlightWeeklyDelta)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Priced At</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatNumber(spotlightFantasyPlayer?.pricedAt ?? null, 0)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{fantasyRoundLabel} Projection</div>
                        <div className="mt-2 text-lg font-bold text-white blur-[4px] select-none sm:mt-3 sm:text-2xl">
                          {formatNumber(spotlightProjection, 0)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{fantasyRoundLabel} Breakeven</div>
                        <div className="mt-2 text-lg font-bold text-white blur-[4px] select-none sm:mt-3 sm:text-2xl">
                          {formatNumber(spotlightBreakEven, 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden h-full flex-col rounded-2xl border border-white/8 bg-[#1b2140] p-3 xl:row-span-2 xl:flex">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">2026 Draw</div>
                    <div className="mt-1 text-[11px] text-white/38">{spotlightTeam ?? "Team"}</div>
                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                      {spotlightDrawRows.map((row) => (
                        <div key={row.round} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Rd {row.round}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/78">
                            {row.opponentLogoUrl ? <ImageWithFallback sources={[row.opponentLogoUrl]} alt={row.opponent ?? "Opponent"} className="h-4 w-4 object-contain" /> : null}
                            <span>{row.isHome ? "vs" : "@"} {row.opponent ?? "-"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#20274a] p-3 xl:col-span-2">
                    <div className="space-y-3 sm:hidden">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Season</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {previewYears.map((year) => (
                            <span key={`mobile-${year}`} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{year}</span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Opponents</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Positions</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Finals: Yes</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Over: 40 Mins</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Under: Any</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Teammate: None</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Mate Pos: All</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-emerald-300">Mode: With</div>
                      </div>
                      <div className="space-y-2">
                        {spotlightSortedRows.slice(0, 3).map((row, index) => (
                          <div key={`mobile-row-${row.Year}-${row.Round}-${index}`} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-white">{row.Opponent ?? "-"}</div>
                                <div className="mt-0.5 text-[11px] text-white/45">
                                  {typeof row.match_date === "string" ? formatShortDate(row.match_date) : row.Round_Label}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-emerald-300">{formatNumber(toFiniteNumber(row.Fantasy), 0)}</div>
                                <div className="text-[11px] text-white/45">{formatNumber(toFiniteNumber(row["Mins Played"]), 0)} mins</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">2026 Draw</div>
                        <div className="mt-2 space-y-2">
                          {spotlightDrawRows.slice(0, 4).map((row) => (
                            <div key={`mobile-draw-${row.round}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-[#20274a] px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Rd {row.round}</div>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-white/78">
                                  {row.opponentLogoUrl ? <ImageWithFallback sources={[row.opponentLogoUrl]} alt={row.opponent ?? "Opponent"} className="h-3.5 w-3.5 object-contain" /> : null}
                                  <span className="truncate">{row.isHome ? "vs" : "@"} {row.opponent ?? "-"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                      <div className="hidden gap-3 md:grid md:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Season</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {previewYears.map((year) => (
                            <span key={year} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{year}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Opponent</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Opponents</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Position</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Positions</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Finals</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Yes</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Minutes Over</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">40 Mins</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Minutes Under</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Any</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Teammate</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">None</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Teammate Position</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">With / Without</div>
                        <div className="mt-2 inline-flex rounded-md border border-white/8 bg-white/[0.03] p-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                          <span className="rounded bg-emerald-400/16 px-2 py-1 text-emerald-300">With</span>
                          <span className="px-2 py-1 text-white/38">Without</span>
                        </div>
                      </div>
                    </div>
                      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-white/8 sm:block">
                        <table className="min-w-[42rem] divide-y divide-white/8 text-left text-[11px] text-white/72 sm:min-w-full">
                          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/35">
                            <tr>
                              <th className="px-3 py-2">Season</th>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Opponent</th>
                              <th className="px-3 py-2">Position</th>
                              <th className="px-3 py-2 text-right">Fantasy</th>
                              <th className="px-3 py-2 text-right">Mins</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/8">
                            {spotlightSortedRows.slice(0, 6).map((row, index) => (
                              <tr key={`${row.Year}-${row.Round}-${index}`}>
                                <td className="px-3 py-2">{row.Year}</td>
                                <td className="px-3 py-2">{typeof row.match_date === "string" ? formatShortDate(row.match_date) : row.Round_Label}</td>
                                <td className="px-3 py-2">{row.Opponent ?? "-"}</td>
                                <td className="px-3 py-2">{row.Position ?? spotlightFantasyPlayer?.positionLabel ?? "-"}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-300">{formatNumber(toFiniteNumber(row.Fantasy), 0)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(toFiniteNumber(row["Mins Played"]), 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame title="Fantasy / Visuals" live>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Average vs Opponent</div>
                    <div className="mt-3 grid gap-2 sm:hidden">
                      {spotlightHeatmapRows.map((row) => (
                        <div key={`${row.label}-mobile`} className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                          <div className="text-[13px] font-semibold text-white">{row.label}</div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            {row.cells.slice(0, 3).map((cell) => (
                              <div key={`${row.label}-${cell.opponent}-mobile`} className="rounded-lg border border-white/8 px-1.5 py-1.5 text-center" style={{ backgroundColor: getScaledHeatColour(cell.average) }}>
                                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/60">{cell.opponent.slice(0, 3).toUpperCase()}</div>
                                <div className="mt-0.5 text-[15px] font-semibold leading-none text-white">{cell.average == null ? "-" : cell.average.toFixed(1)}</div>
                                <div className="text-[9px] text-white/45">n={cell.count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 hidden overflow-x-auto rounded-xl border border-white/8 sm:block">
                      <table className="min-w-[34rem] text-center text-[11px] text-white/72 sm:min-w-full">
                        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/35">
                          <tr>
                            <th className="px-2 py-2 text-left">Season</th>
                            {spotlightHeatmapRows[0]?.cells.map((cell) => (
                              <th key={cell.opponent} className="px-2 py-2">{cell.opponent.slice(0, 3).toUpperCase()}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {spotlightHeatmapRows.map((row) => (
                            <tr key={row.label}>
                              <td className="px-2 py-2 text-left font-semibold text-white">{row.label}</td>
                              {row.cells.map((cell) => (
                                <td key={`${row.label}-${cell.opponent}`} className="px-2 py-2" style={{ backgroundColor: getScaledHeatColour(cell.average) }}>
                                  <div className="font-semibold text-white">{cell.average == null ? "-" : cell.average.toFixed(1)}</div>
                                  <div className="text-[9px] text-white/50">n={cell.count}</div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Fantasy Score Box Plot</div>
                      <div className="hidden text-[10px] text-white/38 sm:block">All games plus selected years</div>
                    </div>
                    <div className="mt-3 hidden space-y-3 sm:block">
                      {spotlightBoxSummaries.map((summary) => {
                        const min = Math.min(...spotlightBoxSummaries.map((item) => item.low))
                        const max = Math.max(...spotlightBoxSummaries.map((item) => item.high))
                        const scale = (value: number) => (max === min ? 50 : ((value - min) / (max - min)) * 100)
                        return (
                          <div key={summary.label} className="grid gap-2 sm:grid-cols-[84px_1fr] sm:items-center sm:gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">{summary.label}</div>
                              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">n={summary.count}</div>
                            </div>
                            <div>
                              <div className="relative h-9">
                                <div className="absolute left-0 right-0 top-4 h-px bg-white/18" />
                                <div className="absolute top-[15px] h-4 w-px bg-white/35" style={{ left: `${scale(summary.low)}%` }} />
                                <div className="absolute top-[15px] h-4 w-px bg-white/35" style={{ left: `${scale(summary.high)}%` }} />
                                <div className="absolute top-2 h-6 rounded-md border border-emerald-400 bg-emerald-400/16" style={{ left: `${scale(summary.q1)}%`, width: `${Math.max(4, scale(summary.q3) - scale(summary.q1))}%` }} />
                                <div className="absolute top-2 h-6 w-1 bg-white" style={{ left: `${scale(summary.median)}%` }} />
                              </div>
                              <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.14em] text-white/35">
                                <span>Low {summary.low.toFixed(1)}</span>
                                <span>Median {summary.median.toFixed(1)}</span>
                                <span>High {summary.high.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 space-y-2 sm:hidden">
                      {(() => {
                        const min = Math.min(...spotlightBoxSummaries.map((item) => item.low))
                        const max = Math.max(...spotlightBoxSummaries.map((item) => item.high))
                        const scale = (value: number) => (max === min ? 50 : ((value - min) / (max - min)) * 100)
                        return spotlightBoxSummaries.slice(0, 3).map((summary) => (
                          <div key={`${summary.label}-box-mobile`} className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[12px] font-semibold text-white">{summary.label}</div>
                                <div className="text-[9px] uppercase tracking-[0.14em] text-white/40">n={summary.count}</div>
                              </div>
                              <div className="text-sm font-bold text-white">{summary.median.toFixed(0)}</div>
                            </div>
                            <div className="mt-2">
                              <div className="relative h-7">
                                <div className="absolute left-0 right-0 top-3.5 h-px bg-white/18" />
                                <div className="absolute top-3 h-3 w-px bg-white/35" style={{ left: `${scale(summary.low)}%` }} />
                                <div className="absolute top-3 h-3 w-px bg-white/35" style={{ left: `${scale(summary.high)}%` }} />
                                <div className="absolute top-1.5 h-4 rounded-md border border-emerald-400 bg-emerald-400/16" style={{ left: `${scale(summary.q1)}%`, width: `${Math.max(4, scale(summary.q3) - scale(summary.q1))}%` }} />
                                <div className="absolute top-1.5 h-4 w-1 bg-white" style={{ left: `${scale(summary.median)}%` }} />
                              </div>
                              <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.12em] text-white/40">
                                <span>{summary.low.toFixed(0)}</span>
                                <span>{summary.median.toFixed(0)}</span>
                                <span>{summary.high.toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Rolling Average Plot</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Fantasy score bars with rolling average trend</div>
                      </div>
                      <div className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                        {spotlightSortedRows.length} games
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/8 bg-[#171c36] p-3">
                      <FantasyGameLogTrendBrush
                        rows={spotlightSortedRows}
                        defaultStartYear="2023"
                        headerTitle="Fantasy Trend"
                        primarySeriesLabel={spotlightFantasyPlayer?.name ?? "Fantasy player"}
                      />
                    </div>
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame title="Fantasy / Find Value" contentClassName="lg:min-h-[480px]" live>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Priced At vs Projection</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Sortable value list</div>
                        </div>
                        <div className="inline-flex rounded-md border border-white/8 bg-white/[0.03] p-1 text-[10px] font-semibold">
                          <span className="rounded bg-emerald-400/16 px-2 py-1 text-emerald-300">Projection</span>
                          <span className="px-2 py-1 text-white/38">L3 Avg</span>
                          <span className="px-2 py-1 text-white/38">Season Avg</span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        {fantasyValuePreviewRows.slice(0, 5).map((row, index) => {
                          const value = row.value ?? 0
                          const width = Math.max(12, Math.min(100, 48 + value * 3))
                          return (
                            <div key={`${row.name}-value`} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/8 bg-[#20274a] text-[10px] font-bold text-white/62">
                                      {index + 1}
                                    </span>
                                    <span className="truncate text-sm font-semibold text-white">{row.name}</span>
                                  </div>
                                  <div className="mt-1 text-[10px] text-white/42">
                                    {row.position} · Own {formatPercent(row.ownedBy)} · Weekly {formatSignedPercent(row.weeklyChange)}
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-right text-[11px]">
                                  <div>
                                    <div className="text-white/35">Proj</div>
                                    <div className="font-bold text-white blur-[4px] select-none">{formatNumber(row.projection, 0)}</div>
                                  </div>
                                  <div>
                                    <div className="text-white/35">Priced</div>
                                    <div className="font-bold text-white">{formatNumber(row.pricedAt, 0)}</div>
                                  </div>
                                  <div>
                                    <div className="text-white/35">Value</div>
                                    <div className={value >= 0 ? "font-bold text-emerald-300 blur-[4px] select-none" : "font-bold text-rose-300 blur-[4px] select-none"}>
                                      {value >= 0 ? "+" : ""}{formatNumber(value, 1)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-white/8">
                                <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Projection Article</div>
                        <div className="mt-2 text-sm font-semibold leading-5 text-white">
                          {articlePreviewRows[0]?.title ?? "Fantasy projections article"}
                        </div>
                        <div className="mt-2 line-clamp-3 text-xs leading-5 text-white/55">
                          {articlePreviewRows[0] ? articlePreviewText(articlePreviewRows[0].body, 130) : "Published analysis can sit beside the fantasy value tools."}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Draft / H2H Odds</div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">My Team</div>
                            <div className="mt-2 text-2xl font-black text-white blur-[4px] select-none">52%</div>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Opponent</div>
                            <div className="mt-2 text-2xl font-black text-white blur-[4px] select-none">48%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Template Team</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Fastest rising starting 13</div>
                      </div>
                      <div className="inline-flex rounded-md border border-white/8 bg-white/[0.03] p-1 text-[10px] font-semibold">
                        <span className="rounded bg-emerald-400/16 px-2 py-1 text-emerald-300">Change</span>
                        <span className="px-2 py-1 text-white/38">Owned</span>
                      </div>
                    </div>
                    <div className="relative overflow-hidden rounded-xl border border-emerald-300/35 bg-[radial-gradient(circle_at_50%_16%,rgba(0,245,138,0.14),transparent_28%),linear-gradient(90deg,rgba(8,26,33,0.98),rgba(15,80,58,0.92)_50%,rgba(8,26,33,0.98))] p-3">
                      <div className="pointer-events-none absolute inset-x-[8%] top-[18%] h-px bg-white/12" />
                      <div className="pointer-events-none absolute inset-x-[8%] top-[38%] h-px bg-white/10" />
                      <div className="pointer-events-none absolute inset-x-[8%] top-[58%] h-px bg-white/10" />
                      <div className="pointer-events-none absolute inset-x-[8%] top-[78%] h-px bg-white/12" />
                      <div className="relative z-[1] grid gap-3">
                        {fantasyValuePreviewRows.slice(0, 5).map((row) => (
                          <div key={`${row.name}-template`} className="flex items-center justify-between gap-3 rounded-full border border-white/10 bg-[#07151e]/72 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-white">{row.name}</div>
                              <div className="text-[10px] text-white/42">{row.position}</div>
                            </div>
                            <div className="text-xs font-bold text-emerald-300">
                              {formatSignedPercent(row.weeklyChange)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </PreviewFrame>
            </LandingCarousel>
          </FeatureSection>

          <FeatureSection
            eyebrow="Lineups"
            title="Team lists with projections, roles, and try scorer prices"
            description="Use Lineups after teams are named to check who is actually on field, compare fantasy projections, switch stat overlays, and scan the best available try scorer odds."
            bullets={[
              "Interactive field view",
              "Fantasy and odds display modes",
              "Bench and role context",
              "Notable Outs",
            ]}
            ctaHref="/dashboard/lineups"
            ctaLabel="Lineups"
            live
          >
            <PreviewFrame title="Lineups / Team Lists" contentClassName="lg:min-h-[540px]" live>
              {lineupsLandingMatch ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                      {([lineupsLandingMatch.homeTeam, lineupsLandingMatch.awayTeam] as const).map((team, index) => {
                        const logo = resolveLineupTeamLogo(team, teamLogos)
                        return (
                          <div key={`${team?.team ?? index}-lineup-team`} className="flex min-w-0 flex-col items-center text-center">
                            {logo ? (
                              <ImageWithFallback sources={[logo]} alt={team?.teamName ?? "Team logo"} className="h-10 w-10 object-contain" />
                            ) : null}
                            <div className="mt-2 max-w-full truncate text-xs font-bold text-white sm:text-sm">
                              {team?.teamName ?? team?.team ?? "TBC"}
                            </div>
                          </div>
                        )
                      }).flatMap((teamNode, index) => index === 0 ? [
                        teamNode,
                        <div key="lineups-preview-vs" className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                        vs
                        </div>,
                      ] : [teamNode])}
                    </div>
                    <div className="mt-3 text-center">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">{lineupsLandingMatch.round}</div>
                      <div className="mt-1 text-[11px] text-white/42">
                        {formatKickoffLabel(lineupsLandingMatch.kickoffUtc)}{lineupsLandingMatch.venue ? ` · ${lineupsLandingMatch.venue}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-300/35 bg-[radial-gradient(circle_at_50%_50%,rgba(0,245,138,0.16),transparent_32%),linear-gradient(90deg,rgba(8,26,33,0.98),rgba(15,112,73,0.9)_50%,rgba(8,26,33,0.98))] p-3">
                    <div className="mb-3 flex justify-center">
                      <div className="inline-flex rounded-md border border-white/12 bg-[#07151e]/80 p-1 text-[10px] font-semibold">
                        <span className="rounded bg-emerald-400/18 px-2 py-1 text-emerald-300">Fantasy</span>
                        <span className="px-2 py-1 text-white/45">Odds</span>
                        <span className="px-2 py-1 text-white/45">Runs</span>
                        <span className="px-2 py-1 text-white/45">Tackles</span>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:hidden">
                      {([
                        { label: lineupsLandingMatch.homeTeam?.teamName ?? lineupsLandingMatch.homeTeam?.team ?? "Home", players: homeLineupPlayers },
                        { label: lineupsLandingMatch.awayTeam?.teamName ?? lineupsLandingMatch.awayTeam?.team ?? "Away", players: awayLineupPlayers },
                      ] as const).map((team) => (
                        <div key={`mobile-lineup-${team.label}`} className="rounded-xl border border-white/10 bg-[#07151e]/58 p-3">
                          <div className="mb-2 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">{team.label}</div>
                          <div className="space-y-2">
                            {team.players.slice(0, 5).map((player) => {
                              const metric = getLineupPlayerMetric(player, tryscorerOdds)
                              return (
                                <div key={`mobile-lineup-${team.label}-${player.player}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2">
                                  <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-white/65 bg-[#10172f]">
                                    <ImageWithFallback sources={getLineupPlayerImageSources(player)} alt={player.player} className="h-full w-full object-cover object-top" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-[11px] font-semibold text-white">{player.player}</div>
                                    <div className="text-[9px] uppercase tracking-[0.12em] text-white/38">{player.position || "Role"}</div>
                                  </div>
                                  <div className={`text-xs font-bold ${metric.valueClassName}`}>{metric.value}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="relative hidden h-[22rem] overflow-hidden rounded-xl border border-white/10 bg-[#07151e]/40 sm:block md:h-[23rem]">
                      <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-emerald-200/45" />
                      {[12, 24, 36, 64, 76, 88].map((left) => (
                        <div key={`line-${left}`} className="absolute inset-y-0 w-px bg-emerald-200/18" style={{ left: `${left}%` }} />
                      ))}
                      {homeLineupPlayers.map((player, index) => {
                        const metric = getLineupPlayerMetric(player, tryscorerOdds)
                        return (
                          <div
                            key={`home-field-${player.player}-${player.number ?? index}`}
                            className="absolute z-[2] w-20 -translate-x-1/2 -translate-y-1/2 text-center sm:w-24"
                            style={{
                              left: `${20 + (index % 2) * 18}%`,
                              top: `${18 + Math.floor(index / 2) * 22}%`,
                            }}
                          >
                            <div className="mx-auto grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white/75 bg-[#10172f] shadow-[0_8px_18px_rgba(0,0,0,0.32)]">
                              <ImageWithFallback sources={getLineupPlayerImageSources(player)} alt={player.player} className="h-full w-full object-cover object-top" />
                            </div>
                            <div className="mt-1 truncate text-[10px] font-semibold text-white">{player.player}</div>
                            <div className={`text-[10px] font-bold ${metric.valueClassName}`}>{metric.value}</div>
                          </div>
                        )
                      })}
                      {awayLineupPlayers.map((player, index) => {
                        const metric = getLineupPlayerMetric(player, tryscorerOdds)
                        return (
                          <div
                            key={`away-field-${player.player}-${player.number ?? index}`}
                            className="absolute z-[2] w-20 -translate-x-1/2 -translate-y-1/2 text-center sm:w-24"
                            style={{
                              left: `${62 + (index % 2) * 18}%`,
                              top: `${18 + Math.floor(index / 2) * 22}%`,
                            }}
                          >
                            <div className="mx-auto grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white/75 bg-[#10172f] shadow-[0_8px_18px_rgba(0,0,0,0.32)]">
                              <ImageWithFallback sources={getLineupPlayerImageSources(player)} alt={player.player} className="h-full w-full object-cover object-top" />
                            </div>
                            <div className="mt-1 truncate text-[10px] font-semibold text-white">{player.player}</div>
                            <div className={`text-[10px] font-bold ${metric.valueClassName}`}>{metric.value}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/8 bg-[#1b2140] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Home Bench</div>
                      <div className="mt-2 space-y-1 text-xs text-white/66">
                        {(lineupsLandingMatch.homeTeam?.players ?? []).filter((player) => !player.isOnField || (player.number != null && player.number >= 14)).slice(0, 4).map((player) => (
                          <div key={`home-bench-${player.player}`} className="truncate">{player.number ?? "-"} · {player.player}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-[#1b2140] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Away Bench</div>
                      <div className="mt-2 space-y-1 text-xs text-white/66">
                        {(lineupsLandingMatch.awayTeam?.players ?? []).filter((player) => !player.isOnField || (player.number != null && player.number >= 14)).slice(0, 4).map((player) => (
                          <div key={`away-bench-${player.player}`} className="truncate">{player.number ?? "-"} · {player.player}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-[#1b2140] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Best Odds Overlay</div>
                      <div className="mt-2 space-y-1 text-xs text-white/66">
                        {[...homeLineupPlayers, ...awayLineupPlayers].map((player) => ({
                          player,
                          odds: tryscorerOdds[normaliseTeamKey(player.player)] ?? null,
                        })).filter((entry) => entry.odds?.bestPrice != null).slice(0, 4).map((entry) => (
                          <div key={`odds-${entry.player.player}`} className="flex justify-between gap-3">
                            <span className="truncate">{entry.player.player}</span>
                            <span className="font-semibold text-white">{entry.odds?.bestPrice?.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-white/10 bg-[#1b2140] p-8 text-center">
                  <div>
                    <div className="text-lg font-bold text-white">No upcoming team lists yet</div>
                    <div className="mt-2 text-sm text-white/55">The Lineups preview will populate when upcoming NRL teams are available.</div>
                  </div>
                </div>
              )}
            </PreviewFrame>
          </FeatureSection>

          <FeatureSection
            eyebrow="Betting"
            title="Odds comparison, calculators, and tracker tools"
            description="Use the betting view when you want a clean market snapshot, simple staking calculators, and a tracker that keeps positions and results in one place."
            bullets={[
              "Odds comparison for H2H, Line and Total",
              "Staking calculators",
              "Bet tracker summaries",
            ]}
            ctaHref="/dashboard/betting"
            ctaLabel="Betting"
            live
          >
            <LandingCarousel>
              <PreviewFrame title="Betting / Odds Comparison" live>
                <div className="space-y-2 sm:space-y-4">
                  <div className="inline-flex rounded-md border border-white/8 bg-white/[0.03] p-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/42 sm:p-1 sm:text-[10px] sm:tracking-[0.16em]">
                    <span className="rounded bg-emerald-400/16 px-2 py-0.5 text-emerald-300 sm:px-3 sm:py-1">H2H</span>
                    <span className="px-2 py-0.5 sm:px-3 sm:py-1">Line</span>
                    <span className="px-2 py-0.5 sm:px-3 sm:py-1">Total</span>
                  </div>
                  <div className="space-y-2 sm:space-y-3">
                    {bettingLandingPreviews.length > 0 ? bettingLandingPreviews.slice(0, 1).map((preview, previewIndex) => (
                      <div key={`${preview.match}-${preview.dateLabel}-${previewIndex}`} className="rounded-2xl border border-white/8 bg-[#1b2140] p-2.5 sm:p-4">
                        {(() => {
                          const marketPct = bestBookMarketPercentage(preview.rows)
                          return (
                        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/8 pb-2 sm:gap-3 sm:pb-3">
                          <div>
                            <div className="text-xs font-semibold text-white sm:text-sm">{preview.match ?? "Upcoming market"}</div>
                            <div className="mt-1 text-[9px] text-white/38 sm:text-[11px]">{preview.dateLabel ?? "Live odds"}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] text-white/38 sm:text-[11px]">Best-book prices across current books</div>
                            <div className="mt-1 text-[9px] text-white/48 sm:text-[11px]">
                              Best-book market %:{" "}
                              <span className="font-semibold text-white/88">{formatPct(marketPct)}</span>
                            </div>
                          </div>
                        </div>
                          )
                        })()}
                        <div className="mt-3 hidden overflow-x-auto pb-1 md:block">
                          <div className="min-w-[62rem]">
                            <div className="grid grid-cols-[1.25fr_repeat(5,minmax(0,1fr))_0.72fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr] items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                              <div>Outcome</div>
                              {BETTING_BOOKIE_COLUMNS.map((bookie) => (
                                <div key={bookie} className="flex justify-center">
                                  <Image src={BOOKIE_LOGOS[bookie]} alt={bookie} width={18} height={18} className="h-4 w-auto object-contain" />
                                </div>
                              ))}
                              <div className="text-center">Best</div>
                              <div className="text-center">Implied</div>
                              <div className="text-center">Model</div>
                              <div className="text-center">Edge</div>
                              <div className="text-center">Stake</div>
                              <div className="text-center">Bet</div>
                            </div>
                            <div className="mt-2 space-y-2">
                              {preview.rows.slice(0, 2).map((row) => {
                                const implied = impliedProbability(row.bestPrice)
                                const modelProbability = modelPercentToProbability(row.model)
                                const edgePp = implied != null && modelProbability != null
                                  ? (modelProbability - implied) * 100
                                  : null
                                const recommendedStake = edgePp != null && edgePp > 0 ? 40 : 0

                                return (
                                  <div key={`${row.match}-${row.result}`} className="grid grid-cols-[1.25fr_repeat(5,minmax(0,1fr))_0.72fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr] items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/76">
                                    <div className="font-semibold text-white">{row.result}</div>
                                    {BETTING_BOOKIE_COLUMNS.map((bookie) => (
                                      <div key={`${row.result}-${bookie}`} className="text-center font-semibold text-white/76">
                                        {row[bookie] != null ? formatNumber(row[bookie], 2) : "-"}
                                      </div>
                                    ))}
                                    <div className="text-center font-semibold text-emerald-300">{formatNumber(row.bestPrice, 2)}</div>
                                    <div className="text-center font-semibold text-white">{formatPct(implied == null ? null : implied * 100)}</div>
                                    <div className="text-center font-semibold text-white blur-[4px] select-none">{formatPct(modelProbability == null ? null : modelProbability * 100)}</div>
                                    <div className="text-center font-semibold text-white/72 blur-[4px] select-none">
                                      {edgePp == null ? "-" : `${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(2)}`}
                                    </div>
                                    <div className="flex justify-center">
                                      <div className="flex h-[2.625rem] w-[5.25rem] items-center rounded-lg border border-white/8 bg-[#242b52] px-3 py-2 text-white">
                                        <span className="block w-full blur-[4px] select-none">{recommendedStake}</span>
                                      </div>
                                    </div>
                                    <div className="flex justify-center">
                                      <div className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-center text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">
                                        Bet
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1.5 md:hidden sm:mt-3 sm:space-y-2">
                          {preview.rows.slice(0, 2).map((row) => {
                            const availableBooks = BETTING_BOOKIE_COLUMNS.filter((bookie) => row[bookie] != null)
                            const implied = impliedProbability(row.bestPrice)
                            const modelProbability = modelPercentToProbability(row.model)
                            const edgePp = implied != null && modelProbability != null
                              ? (modelProbability - implied) * 100
                              : null
                            const recommendedStake = edgePp != null && edgePp > 0 ? 40 : 0
                            return (
                              <div key={`${row.match}-${row.result}`} className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-[11px] font-semibold text-white">{row.result}</div>
                                    <div className="mt-0.5 text-[9px] text-white/42">
                                      {`Odds ${formatNumber(row.bestPrice, 2)}${row.bestBookie ? ` · ${row.bestBookie}` : ""}`}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[8px] uppercase tracking-[0.14em] text-white/35">Odds</div>
                                    <div className="mt-0.5 text-base font-bold text-emerald-300">
                                      {formatNumber(row.bestPrice, 2)}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-1 sm:mt-3 sm:grid-cols-3 sm:gap-2">
                                  <div className="rounded-lg border border-white/8 bg-[#171c36] px-1.5 py-1.5 sm:px-2 sm:py-2">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 sm:text-[9px] sm:tracking-[0.12em]">Odds</div>
                                    <div className="mt-0.5 text-[11px] font-semibold text-emerald-300 sm:mt-1 sm:text-sm">
                                      {formatNumber(row.bestPrice, 2)}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-white/8 bg-[#171c36] px-1.5 py-1.5 sm:px-2 sm:py-2">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 sm:text-[9px] sm:tracking-[0.12em]">Edge</div>
                                    <div className="mt-0.5 text-[11px] font-semibold text-white/72 blur-[4px] select-none sm:mt-1 sm:text-sm">
                                      {edgePp == null ? "-" : `${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(2)}`}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-white/8 bg-[#242b52] px-1.5 py-1.5 sm:px-2 sm:py-2">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 sm:text-[9px] sm:tracking-[0.12em]">Stake</div>
                                    <div className="mt-0.5 h-[1rem] text-[11px] font-semibold text-white sm:mt-1 sm:h-[1.25rem] sm:text-sm">
                                      <span className="block blur-[4px] select-none">{recommendedStake}</span>
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-white/8 bg-[#171c36] px-1.5 py-1.5 sm:px-2 sm:py-2">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 sm:text-[9px] sm:tracking-[0.12em]">Implied</div>
                                    <div className="mt-0.5 text-[11px] font-semibold text-white sm:mt-1 sm:text-sm">{formatPct(implied == null ? null : implied * 100)}</div>
                                  </div>
                                  <div className="rounded-lg border border-white/8 bg-[#171c36] px-1.5 py-1.5 sm:px-2 sm:py-2">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 sm:text-[9px] sm:tracking-[0.12em]">Model</div>
                                    <div className="mt-0.5 text-[11px] font-semibold text-white blur-[4px] select-none sm:mt-1 sm:text-sm">{formatPct(modelProbability == null ? null : modelProbability * 100)}</div>
                                  </div>
                                  <div className="col-span-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-1.5 sm:col-auto sm:px-2 sm:py-2">
                                    <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/35 sm:text-[9px] sm:tracking-[0.12em]">Bet</div>
                                    <div className="mt-0.5 text-[11px] font-semibold text-emerald-300 sm:mt-1 sm:text-sm">BET</div>
                                  </div>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-1 sm:mt-3 sm:grid-cols-3 sm:gap-2">
                                  {availableBooks.length > 0 ? (
                                    availableBooks.map((bookie) => (
                                      <div key={`${row.result}-${bookie}`} className="rounded-lg border border-white/8 bg-[#171c36] px-2 py-1.5 sm:px-2.5 sm:py-2">
                                        <div className="flex items-center gap-1.5 sm:gap-2">
                                          <Image src={BOOKIE_LOGOS[bookie]} alt={bookie} width={12} height={12} className="h-3 w-auto object-contain sm:h-4" />
                                          <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/42 sm:text-[10px] sm:tracking-[0.12em]">{bookie}</span>
                                        </div>
                                        <div className="mt-0.5 text-[11px] font-semibold text-white sm:mt-1 sm:text-base">
                                          {formatNumber(row[bookie], 2)}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-lg border border-white/8 bg-[#171c36] px-2 py-1.5 text-[11px] text-white/55 sm:px-2.5 sm:py-2 sm:text-sm">
                                      Market loading
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-[#1b2140] p-8 text-center text-sm text-white/55">
                        No current odds are available.
                      </div>
                    )}
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame title="Betting / Tools" live>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-white/78">Staking Calculator</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Percentage Staking</div>
                        <div className="mt-1 text-[11px] text-white/55">Bet a % of your bankroll.</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Target Profit</div>
                        <div className="mt-1 text-[11px] text-white/55">Hit a target profit %.</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Kelly Staking</div>
                        <div className="mt-1 text-[11px] text-white/55">Stake from model edge.</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2 text-xs text-white/72">Bankroll 2000</div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2 text-xs text-white/72">Stake % 2</div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2 text-xs text-white/72">Max Edge 0.06</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                    <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-white/78">Bet Tracker</div>
                      <div className="text-[11px] text-white/38">Hide Bets</div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Bets</div><div className="mt-1 text-lg font-bold text-white">{betTrackerPreviewRows.length}</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Win Rate</div><div className="mt-1 text-lg font-bold text-white">60.0%</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">P/L</div><div className="mt-1 text-lg font-bold text-emerald-300">+35.41</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Stake</div><div className="mt-1 text-lg font-bold text-white">218.00</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Margin</div><div className="mt-1 text-lg font-bold text-white">16.2%</div></div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
                      <table className="min-w-[38rem] divide-y divide-white/8 text-left text-[11px] text-white/72 sm:min-w-full">
                        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/35">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Match</th>
                            <th className="px-3 py-2">Selection</th>
                            <th className="px-3 py-2 text-right">Odds</th>
                            <th className="px-3 py-2 text-right">Stake</th>
                            <th className="px-3 py-2 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {betTrackerPreviewRows.map((row, index) => (
                            <tr key={`${row.match}-${row.result}-${index}`}>
                              <td className="px-3 py-2">{formatShortDate(row.date)}</td>
                              <td className="px-3 py-2">{row.match}</td>
                              <td className="px-3 py-2">{row.result}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(row.bestPrice, 2)}</td>
                              <td className="px-3 py-2 text-right">{10 + index * 14}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${index % 2 === 0 ? "text-emerald-300" : "text-rose-400"}`}>{index % 2 === 0 ? "+" : "-"}{(index + 1) * 12}.00</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </PreviewFrame>
            </LandingCarousel>
          </FeatureSection>

          <FeatureSection
            eyebrow="Articles"
            title="Community analysis, match notes, and feature pieces"
            description="Use Articles to publish NRL analysis with header images, read approved pieces, and keep submitted drafts in the review workflow."
            bullets={[
              "Public article feed",
              "Image-led article cards",
              "Signed-in submissions",
              "Admin approval workflow",
            ]}
            ctaHref="/dashboard/articles"
            ctaLabel="Articles"
          >
            <PreviewFrame title="Articles / Feed" contentClassName="lg:min-h-[520px]">
              <div className="space-y-4">
                {articlePreviewRows.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.72fr)]">
                    <article className="overflow-hidden rounded-2xl border border-white/8 bg-[#1b2140]">
                      {articlePreviewRows[0].imageUrls.length > 0 ? (
                        <div className={`grid h-56 ${articlePreviewRows[0].imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {articlePreviewRows[0].imageUrls.slice(0, 2).map((url, index) => (
                            <ImageWithFallback
                              key={`${url}-${index}`}
                              sources={[url]}
                              alt={`${articlePreviewRows[0].title} header ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="grid h-56 place-items-center bg-[linear-gradient(135deg,#20284a,#10243a)]">
                          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Short Side</div>
                        </div>
                      )}
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                          {articlePreviewRows[0].authorImageUrl ? (
                            <ImageWithFallback
                              sources={[articlePreviewRows[0].authorImageUrl]}
                              alt=""
                              className="h-7 w-7 rounded-full border border-white/10 object-cover"
                            />
                          ) : (
                            <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-[#20274a] text-[10px] font-bold uppercase text-white/55">
                              {articlePreviewRows[0].displayName.slice(0, 2)}
                            </span>
                          )}
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                            {articlePreviewRows[0].displayName} · {formatArticleDate(articlePreviewRows[0].approvedAt ?? articlePreviewRows[0].createdAt)}
                          </div>
                        </div>
                        <h4 className="mt-3 text-2xl font-bold leading-tight text-white">{articlePreviewRows[0].title}</h4>
                        <p className="mt-3 text-sm leading-6 text-white/68">{articlePreviewText(articlePreviewRows[0].body, 220)}</p>
                        <Link
                          href={`/dashboard/articles/${articlePreviewRows[0].slug}`}
                          className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/12 bg-white/[0.04] text-lg font-bold text-white transition-colors hover:border-white/25 hover:bg-white/[0.08]"
                          aria-label={`Read ${articlePreviewRows[0].title}`}
                        >
                          <span aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </article>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Submit Article</div>
                            <div className="mt-1 text-[11px] text-white/42">Title, body, author mode, and 1-2 header photos</div>
                          </div>
                          <div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-[#20274a] text-2xl leading-none text-white">+</div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <div className="rounded-md border border-white/8 bg-[#20274a] px-3 py-2 text-sm text-white/55">Title</div>
                          <div className="h-28 rounded-md border border-white/8 bg-[#20274a] px-3 py-2 text-sm text-white/55">Body</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">Profile</div>
                            <div className="rounded-md border border-white/8 bg-[#20274a] px-3 py-2 text-xs font-semibold text-white/55">Anonymous</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-xl border border-white/8 bg-[#1b2140] p-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Public Feed</div>
                          <div className="mt-2 text-2xl font-black text-white">{approvedArticles.length}</div>
                          <div className="text-[11px] text-white/42">approved articles</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-[#1b2140] p-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Review Flow</div>
                          <div className="mt-2 text-sm font-semibold text-white">Pending, approved, rejected</div>
                          <div className="mt-1 text-[11px] text-white/42">Admin actions stay inside Articles</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-white/10 bg-[#1b2140] p-8 text-center">
                    <div>
                      <div className="text-lg font-bold text-white">No approved articles yet</div>
                      <div className="mt-2 text-sm text-white/55">The Articles page is ready for submissions and approvals.</div>
                    </div>
                  </div>
                )}
              </div>
            </PreviewFrame>
          </FeatureSection>

          <FeatureSection
            eyebrow="Stats"
            title="Player and team statistical dashboard, stat leaders"
            description="Use the stats section to compare players and teams directly, inspect plot comparisons, and see stat leaders across seasons."
            bullets={[
              "Player comparison and filtered charts",
              "Percentile ranks and recent form",
              "Season leader cards",
            ]}
            ctaHref="/dashboard/players"
            ctaLabel="Stats"
            live
          >
            <LandingCarousel>
              <PreviewFrame title="Stats / Players" contentClassName="lg:min-h-[450px]" live>
                <div className="space-y-2.5 sm:space-y-4">
                  <StatsPreviewNav active="players" />
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/42">
                    Summary & Filtered Charts
                  </div>
                  <div className="grid gap-2.5 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)]">
                    <div className="space-y-2.5 sm:space-y-4">
                      <div className="space-y-2 sm:space-y-3">
                        {statsPlayers.map((player) => (
                          <div key={`stats-summary-${player.name}`}>
                            <div className="text-sm font-bold uppercase tracking-[0.03em] text-[#00f58a] sm:text-lg sm:tracking-[0.04em]">{player.name}</div>
                            <div className="mt-0.5 text-[10px] leading-4 text-white/45 sm:mt-1 sm:text-sm">
                              {primaryTeamForRows(player.rows) ?? "-"} · {player.rows[0]?.Position ?? "-"} · {player.rows.length} games · {formatNumber(average(player.rows.map((row) => toFiniteNumber(row["Mins Played"])).filter((value): value is number => value != null)), 0)} avg mins
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 sm:gap-4">
                        <div className="min-w-0 flex items-center justify-center">
                          <SimplePlayerPhotoTile
                            playerName={statsPlayer1Name ?? "Player 1"}
                            imageRow={statsPlayer1CardImage}
                            priority
                            className="mx-auto w-full max-w-[5.4rem] sm:max-w-none"
                            imageHeightClass="h-[5.75rem] sm:h-[15rem]"
                          />
                        </div>

                        <div className="min-w-0 flex items-center justify-center">
                          <SimplePlayerPhotoTile
                            playerName={statsPlayer2Name ?? "Player 2"}
                            imageRow={statsPlayer2CardImage}
                            priority
                            className="mx-auto w-full max-w-[5.4rem] sm:max-w-none"
                            imageHeightClass="h-[5.75rem] sm:h-[15rem]"
                          />
                        </div>
                      </div>

                      <SimpleHistogramPreview
                        title="All Run Metres Distribution"
                        statLabel="All Run Metres"
                        series={statsPlayers.map((player, index) => ({
                          label: `${player.name} (n=${player.rows.length})`,
                          color: index === 0 ? "#2cf596" : "#b395ff",
                          values: player.rows
                            .map((row) => toFiniteNumber(row["All Run Metres"]))
                            .filter((value): value is number => value != null),
                          mean: average(
                            player.rows
                              .map((row) => toFiniteNumber(row["All Run Metres"]))
                              .filter((value): value is number => value != null)
                          ),
                        }))}
                      />
                    </div>

                    <div className="space-y-2.5 sm:space-y-4">
                      <div className="overflow-x-auto rounded-xl">
                        <table className="min-w-full divide-y divide-white/8 text-left text-[10px] text-white/76 sm:text-[12px]">
                          <thead className="text-[8px] uppercase tracking-[0.1em] text-white/35 sm:text-[10px] sm:tracking-[0.14em]">
                            <tr>
                              <th className="px-1.5 py-1.5 sm:px-3 sm:py-2">Player</th>
                              <th className="px-1.5 py-1.5 sm:px-3 sm:py-2">Stat</th>
                              <th className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">Average</th>
                              <th className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">Median</th>
                              <th className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">Min</th>
                              <th className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">Max</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/8">
                            {statsSummaryRows.map((row) => (
                              <tr key={`${row.playerName}-${row.stat}`}>
                                <td className="px-1.5 py-1.5 sm:px-3 sm:py-2">{row.playerName}</td>
                                <td className="px-1.5 py-1.5 sm:px-3 sm:py-2">{row.stat}</td>
                                <td className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">{formatNumber(row.average, 2)}</td>
                                <td className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">{formatNumber(row.median, 2)}</td>
                                <td className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">{formatNumber(row.min, 2)}</td>
                                <td className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">{formatNumber(row.max, 2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/42 sm:text-[10px] sm:tracking-[0.16em]">Percentile Rank</div>
                          <div className="inline-flex rounded-md border border-white/8 bg-white/[0.03] p-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] sm:p-1 sm:text-[10px] sm:tracking-[0.16em]">
                            <span className="rounded bg-emerald-400/16 px-1.5 py-0.5 text-emerald-300 sm:px-2 sm:py-1">Position</span>
                            <span className="px-1.5 py-0.5 text-white/38 sm:px-2 sm:py-1">All</span>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2 sm:mt-3 sm:space-y-3">
                          {statsPercentileRows.map((row) => (
                            <div key={`stats-percentile-${row.playerName}-${row.stat}`}>
                              <div className="flex items-center justify-between gap-2 text-[10px] text-white/72 sm:gap-3 sm:text-[12px]">
                                <span>{row.playerName} — {row.stat}</span>
                                <span className={row.percentile != null && row.percentile >= 50 ? "font-semibold text-[#2cf596]" : "font-semibold text-[#ff9d2e]"}>
                                  {formatOrdinal(row.percentile)}
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 rounded-full bg-white/8 sm:h-2">
                                <div
                                  className={`h-full rounded-full ${row.percentile != null && row.percentile >= 50 ? "bg-[#2cf596]" : "bg-[#ff9d2e]"}`}
                                  style={{ width: `${Math.max(8, row.percentile ?? 0)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/42 sm:text-[10px] sm:tracking-[0.16em]">Recent Form (Last 5 Avg)</div>
                        <div className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
                          {statsRecentFormRows.map((row) => (
                            <div key={`stats-form-${row.playerName}-${row.stat}`} className="flex items-center justify-between gap-2 text-[10px] sm:gap-4 sm:text-[13px]">
                              <span className="text-white/68">{row.playerName} — {row.stat}</span>
                              <span className={row.deltaPct != null && row.deltaPct >= 0 ? "font-semibold text-[#2cf596]" : "font-semibold text-[#ff6b99]"}>
                                {row.deltaPct != null && row.deltaPct >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(row.deltaPct ?? 0), 1)}% ({formatNumber(row.recentAverage, 1)} vs {formatNumber(row.overallAverage, 1)})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <SimpleHistogramPreview
                        title="Kicking Metres Distribution"
                        statLabel="Kicking Metres"
                        series={statsPlayers.map((player, index) => ({
                          label: `${player.name} (n=${player.rows.length})`,
                          color: index === 0 ? "#2cf596" : "#b395ff",
                          values: player.rows
                            .map((row) => toFiniteNumber(row["Kicking Metres"]))
                            .filter((value): value is number => value != null),
                          mean: average(
                            player.rows
                              .map((row) => toFiniteNumber(row["Kicking Metres"]))
                              .filter((value): value is number => value != null)
                          ),
                        }))}
                      />
                    </div>
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame title="Stats / Leaders" contentClassName="lg:min-h-[640px]" live>
                <div className="space-y-4">
                  <StatsPreviewNav active="leaders" />
                  <div>
                    <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Player Leaders</div>
                    <div className="grid items-stretch gap-4 lg:grid-cols-3">
                      {statsLeaderCards.map((card) => {
                        const leader = card.leaders[0] ?? null
                        const runnerUps = card.leaders.slice(1)
                        return (
                          <article key={`leader-${card.key}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-white/8 bg-[#1b2140]">
                            <div className="relative min-h-[12.5rem] overflow-hidden border-b border-white/8 bg-[linear-gradient(135deg,#3a315f_0%,#31396d_100%)]">
                              <div className="relative flex min-h-[12.5rem] flex-col gap-3 p-4 sm:flex-row sm:justify-between sm:pb-0">
                                <div className="flex min-w-0 flex-col justify-between pb-0 sm:max-w-[58%] sm:pb-4">
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/72">{card.label}</div>
                                    <div className="mt-4 text-[1.8rem] font-bold leading-tight text-white sm:mt-6 sm:text-3xl">
                                      {leader?.name ?? "No leader"}
                                    </div>
                                    <div className="mt-1 text-sm text-white/72">{leader?.team ?? "-"}</div>
                                  </div>
                                  <div className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                                    {leader ? formatNumber(leader.value, 0) : "-"}
                                  </div>
                                </div>

                                <div className="relative flex min-h-[7.5rem] items-end justify-center overflow-hidden sm:min-w-[7rem] sm:flex-1 sm:justify-end">
                                  {leader ? (
                                    <ImageWithFallback
                                      sources={leader.imageSources}
                                      alt={leader.name}
                                      className="mx-auto max-h-[9rem] w-auto object-contain object-bottom drop-shadow-[0_16px_28px_rgba(0,0,0,0.32)] sm:max-h-[12.25rem]"
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex-1 divide-y divide-white/8 bg-[#1b2140]">
                              {runnerUps.map((entry) => (
                                <div key={`${card.key}-${entry.name}`} className="flex items-center justify-between gap-3 px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-white">{entry.name}</div>
                                    <div className="mt-0.5 truncate text-xs text-white/55">{entry.team}</div>
                                  </div>
                                  <div className="text-2xl font-bold leading-none text-white">
                                    {formatNumber(entry.value, 0)}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="border-t border-white/8 bg-[#20274a] px-4 py-3 text-center">
                              <Link
                                href="/dashboard/players"
                                className="inline-flex items-center gap-2 text-sm font-semibold text-white/55 transition-colors hover:text-white"
                              >
                                Players
                                <span aria-hidden="true">→</span>
                              </Link>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </PreviewFrame>
            </LandingCarousel>
          </FeatureSection>

          <FeatureSection
            eyebrow="NRL AI"
            title="A personal AI that knows every NRL stat at your fingertips"
            description="Ask NRL AI for rankings, player trends, betting context, and follow-up questions across every major NRL dataset."
            bullets={[
              "Player and team stat queries",
              "Fantasy screenshot analysis",
              "Follow-up questions in context",
              "Betting market summaries",
            ]}
            ctaHref="/dashboard/ai"
            ctaLabel="NRL AI"
            live
          >
            <PreviewFrame title="NRL AI / Chat" contentClassName="lg:min-h-[440px]" live>
              <div className="flex min-h-[300px] flex-col justify-between gap-8 rounded-2xl border border-white/8 bg-[#070b1f] px-5 py-4 sm:min-h-[420px] sm:px-7 sm:py-6 lg:px-8">
                <div className="space-y-4">
                  <div className="ml-auto max-w-[88%] rounded-2xl bg-[#252c55] px-4 py-3 text-sm leading-6 text-white/88">
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <ImageWithFallback
                          sources={["/fantasy_ss/IMG_8817.PNG"]}
                          alt="Fantasy team screenshot"
                          className="h-28 w-full object-cover object-top sm:h-36"
                        />
                      </div>
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <ImageWithFallback
                          sources={["/fantasy_ss/IMG_8818.PNG"]}
                          alt="Fantasy team screenshot"
                          className="h-28 w-full object-cover object-top sm:h-36"
                        />
                      </div>
                    </div>
                    What trades would you recommend this week for my team?
                  </div>
                  <div className="max-w-[88%] rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/78">
                    Trade out J. Hughes first: the screenshot marks him injured in your selected 17. The strongest buy targets by ownership rise are {topOwnershipBuyTargets.map((player) => `${player.name} (${formatSignedPercent(player.delta)})`).join(", ") || "the top positive ownership movers"}. Prioritise one of those buys, then use the second trade to fix your injured/DNP bench cover.
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-[#171c36] p-2 shadow-2xl shadow-black/30">
                  <div className="flex items-end gap-2">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl text-white/45">+</div>
                    <div className="flex-1 py-2 text-sm text-white/78">Ask anything about NRL</div>
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nrl-accent text-lg font-bold text-nrl-bg">↑</div>
                  </div>
                </div>
              </div>
            </PreviewFrame>
          </FeatureSection>
          </LandingSuiteTabs>
        </section>
      </div>
    </div>
  )
}

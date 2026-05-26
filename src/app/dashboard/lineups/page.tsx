import { auth } from "@clerk/nextjs/server"
import { headers } from "next/headers"
import { LineupsDashboard } from "@/components/views/lineups-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import {
  fetchCasualtyWardOuts,
  fetchLineupRoundOptions,
  fetchLineupsForRound,
  fetchUpcomingSportsbetH2HOdds,
  fetchUpcomingTryscorerOdds,
} from "@/lib/lineups/nrl-lineups"
import { fetchLineupPlayerTryHistorySummary, fetchLineupsPageSummary, fetchPlayerStats, fetchTeamLogos } from "@/lib/supabase/queries"
import type { PlayerStat } from "@/lib/data/types"
import type { LineupMatch, LineupRoundOption } from "@/lib/lineups/nrl-lineups"

export const dynamic = "force-dynamic"

const LINEUPS_PAGE_FETCH_TIMEOUT_MS = 2500

const AVERAGE_KEYS = [
  "Tries",
  "Try Assists",
  "All Run Metres",
  "Post Contact Metres",
  "Tackles Made",
  "Tackle Efficiency",
  "Line Breaks",
  "Line Break Assists",
  "Errors",
  "Missed Tackles",
  "Receipts",
  "Tackle Breaks",
  "Offloads",
] as const

type AverageKey = (typeof AVERAGE_KEYS)[number]
type PositionBaselineKey = "FB" | "W" | "C" | "FE" | "HLF" | "HK" | "PR" | "2RF" | "LK"

function withFallback<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => {
      console.warn(`${label} timed out; using fallback.`)
      resolve(fallback)
    }, LINEUPS_PAGE_FETCH_TIMEOUT_MS)
  })

  return Promise.race([
    promise.catch((error) => {
      console.warn(`${label} failed; using fallback.`, error)
      return fallback
    }),
    timeoutPromise,
  ]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function buildPlayerAverages(rows: PlayerStat[]): Record<string, Record<AverageKey, number>> {
  const totals = new Map<string, { games: number; values: Record<AverageKey, number> }>()

  for (const row of rows) {
    const key = normaliseName(row.Name)
    if (!key) continue

    const bucket = totals.get(key) ?? {
      games: 0,
      values: Object.fromEntries(AVERAGE_KEYS.map((stat) => [stat, 0])) as Record<AverageKey, number>,
    }
    bucket.games += 1
    for (const stat of AVERAGE_KEYS) {
      bucket.values[stat] += Number(row[stat] ?? 0)
    }
    totals.set(key, bucket)
  }

  return Object.fromEntries(
    [...totals.entries()].map(([key, bucket]) => [
      key,
      Object.fromEntries(
        AVERAGE_KEYS.map((stat) => [stat, bucket.games > 0 ? bucket.values[stat] / bucket.games : 0])
      ) as Record<AverageKey, number>,
    ])
  )
}

function positionBaselineKey(position: string | null | undefined, number: string | number | null | undefined): PositionBaselineKey | null {
  const rawNumber = Number(number)
  if (rawNumber === 1) return "FB"
  if (rawNumber === 2 || rawNumber === 5) return "W"
  if (rawNumber === 3 || rawNumber === 4) return "C"
  if (rawNumber === 6) return "FE"
  if (rawNumber === 7) return "HLF"
  if (rawNumber === 8 || rawNumber === 10) return "PR"
  if (rawNumber === 9) return "HK"
  if (rawNumber === 11 || rawNumber === 12) return "2RF"
  if (rawNumber === 13) return "LK"

  const key = String(position ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (key.includes("fullback")) return "FB"
  if (key.includes("wing")) return "W"
  if (key.includes("centre") || key.includes("center")) return "C"
  if (key.includes("five eighth")) return "FE"
  if (key.includes("halfback")) return "HLF"
  if (key.includes("hooker")) return "HK"
  if (key.includes("prop")) return "PR"
  if (key.includes("row")) return "2RF"
  if (key.includes("lock")) return "LK"
  return null
}

function buildPositionPpmBaselines(rows: PlayerStat[]): Record<string, number> {
  const totals = new Map<PositionBaselineKey, { fantasy: number; minutes: number }>()

  for (const row of rows) {
    const key = positionBaselineKey(row.Position, row.Number)
    const minutes = Number(row["Mins Played"] ?? 0)
    const fantasy = Number(row.Fantasy ?? 0)
    if (!key || !Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(fantasy)) continue

    const bucket = totals.get(key) ?? { fantasy: 0, minutes: 0 }
    bucket.fantasy += fantasy
    bucket.minutes += minutes
    totals.set(key, bucket)
  }

  return Object.fromEntries(
    [...totals.entries()].map(([key, bucket]) => [key, bucket.minutes > 0 ? bucket.fantasy / bucket.minutes : 0])
  )
}

function parseKickoff(value: string | null): Date | null {
  if (!value) return null
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
  const timestamp = Date.parse(hasTimezone ? value : `${value}Z`)
  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

function isPastMatch(match: LineupMatch, now = new Date()): boolean {
  const kickoff = parseKickoff(match.kickoffUtc)
  return kickoff != null && kickoff.getTime() <= now.getTime()
}

function isDrawFallbackMatch(match: LineupMatch): boolean {
  return match.matchId.startsWith("draw-2026-")
}

interface LineupsPageProps {
  searchParams: Promise<{
    round?: string
  }>
}

function currentYearInBrisbane(): number {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
  }).format(new Date())
  return Number(year)
}

function currentRoundOption(options: LineupRoundOption[]): LineupRoundOption | null {
  if (options.length === 0) return null
  const now = new Date()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const activeRound = options.find((option) => today >= option.startDate && today <= option.endDate)
  if (activeRound) return activeRound

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
  }).format(now)
  const hour = Number(new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    hour12: false,
  }).format(now))
  const shouldRollToUpcoming = weekday !== "Mon" || hour >= 12

  return (
    (shouldRollToUpcoming ? options.find((option) => option.startDate >= today) : null) ??
    options.findLast((option) => option.startDate <= today) ??
    options.at(0) ??
    null
  )
}

async function isLocalhostRequest(): Promise<boolean> {
  const headerStore = await headers()
  const host = headerStore.get("host")?.split(":")[0] ?? ""
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(":")[0] ?? ""
  return ["localhost", "127.0.0.1", "::1"].includes(host) || ["localhost", "127.0.0.1", "::1"].includes(forwardedHost)
}

function lineupsSummaryMissReason(
  summary: Awaited<ReturnType<typeof fetchLineupsPageSummary>>,
  hasProAccess: boolean
): string | null {
  if (!summary) return "No row returned from summary.lineups_page_summary for this year/round."
  if (summary.matches.length === 0) return "Summary row returned zero matches."
  const hasRecentResults = summary.matches.some((match) =>
    Array.isArray(match.homeRecentResults) ||
    Array.isArray(match.awayRecentResults) ||
    Array.isArray(match.recentHeadToHead)
  )
  if (!hasRecentResults) return "Summary is missing recent-results fields used by the page."
  if (!hasProAccess) return null

  const players = summary.matches.flatMap((match) => [
    ...(match.homeTeam?.players ?? []),
    ...(match.awayTeam?.players ?? []),
  ])
  if (players.length > 0 && !players.some((player) => typeof player.fantasyProjection === "number")) {
    return "Pro access is enabled, but the summary has no player fantasyProjection values."
  }
  return null
}

export default async function LineupsPage({ searchParams }: LineupsPageProps) {
  const params = await searchParams
  const { userId } = await auth()
  const hasProAccess = await getServerProPlotAccess(userId)
  const year = currentYearInBrisbane()
  const roundOptions = await fetchLineupRoundOptions(year)
  const selectedRound = roundOptions.find((option) => option.value === params.round)?.value ?? currentRoundOption(roundOptions)?.value ?? "Round 1"
  const rawSummary = await withFallback(fetchLineupsPageSummary(year, selectedRound), null, "Lineups page summary")
  const summaryMissReason = lineupsSummaryMissReason(rawSummary, hasProAccess)
  const summary = summaryMissReason ? null : rawSummary
  const fallbackData = summary ? null : await (async () => {
    const [teamLogos, tryscorerOdds, sportsbetOdds, casualtyWardOuts, playerStatsCurrentYear, playerTryHistory, lineupRound] = await Promise.all([
      withFallback(fetchTeamLogos(), {}, "Lineups team logos"),
      withFallback(fetchUpcomingTryscorerOdds(), {}, "Lineups tryscorer odds"),
      withFallback(fetchUpcomingSportsbetH2HOdds(), {}, "Lineups H2H odds"),
      withFallback(fetchCasualtyWardOuts(), {}, "Lineups casualty ward"),
      withFallback(fetchPlayerStats([String(year)]), [], "Lineups player stats"),
      withFallback(fetchLineupPlayerTryHistorySummary(), {}, "Lineups player try history summary"),
      fetchLineupsForRound({
        round: selectedRound,
        year,
        includeFantasyProjections: hasProAccess,
      }),
    ])
    return {
      teamLogos,
      tryscorerOdds,
      sportsbetOdds,
      casualtyWardOuts,
      playerAverages: buildPlayerAverages(playerStatsCurrentYear),
      playerTryHistory,
      positionPpmBaselines: buildPositionPpmBaselines(playerStatsCurrentYear),
      matches: lineupRound.matches,
      matchStats: lineupRound.matchStats,
    }
  })()
  const matches = summary?.matches ?? fallbackData?.matches ?? []
  const matchStats = summary?.matchStats ?? fallbackData?.matchStats ?? {}
  const visibleMatches = matches.filter((match) => match.homeTeam?.players.length || match.awayTeam?.players.length || matchStats[match.matchId] || isDrawFallbackMatch(match) || !isPastMatch(match))
  const summaryDiagnostic = summaryMissReason && await isLocalhostRequest()
    ? `lineups_page_summary miss: ${summaryMissReason} Heavy fallback data path is active for ${year} ${selectedRound}.`
    : null

  return (
    <LineupsDashboard
      matches={visibleMatches}
      liveMatches={{}}
      weatherForecasts={{}}
      matchStats={matchStats}
      roundOptions={summary?.roundOptions.length ? summary.roundOptions : roundOptions}
      selectedRound={selectedRound}
      teamLogos={summary?.teamLogos ?? fallbackData?.teamLogos ?? {}}
      tryscorerOdds={summary?.tryscorerOdds ?? fallbackData?.tryscorerOdds ?? {}}
      sportsbetOdds={summary?.sportsbetOdds ?? fallbackData?.sportsbetOdds ?? {}}
      canAccessFantasyProjections={hasProAccess}
      casualtyWardOuts={summary?.casualtyWardOuts ?? fallbackData?.casualtyWardOuts ?? {}}
      playerAverages={(summary?.playerAverages ?? fallbackData?.playerAverages ?? {}) as Record<string, Record<AverageKey, number>>}
      playerTryHistory={summary?.playerTryHistory ?? fallbackData?.playerTryHistory ?? {}}
      positionPpmBaselines={summary?.positionPpmBaselines ?? fallbackData?.positionPpmBaselines ?? {}}
      summaryDiagnostic={summaryDiagnostic}
    />
  )
}

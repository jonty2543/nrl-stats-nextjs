import { auth } from "@clerk/nextjs/server"
import { headers } from "next/headers"
import { LineupsDashboard } from "@/components/views/lineups-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import {
  fetchLineupRoundOptions,
  fetchLiveLineupData,
  fetchLineupsForRound,
} from "@/lib/lineups/nrl-lineups"
import { fetchLatestLineupsPageShellSummary, fetchLineupsPageShellSummary, fetchTeamLogos } from "@/lib/supabase/queries"
import type { LineupMatch, LineupRoundOption } from "@/lib/lineups/nrl-lineups"

export const dynamic = "force-dynamic"

const LINEUPS_PAGE_FETCH_TIMEOUT_MS = 2500

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

function mergeRoundOptions(...optionGroups: LineupRoundOption[][]): LineupRoundOption[] {
  const byRound = new Map<string, LineupRoundOption>()
  for (const options of optionGroups) {
    for (const option of options) {
      const existing = byRound.get(option.value)
      if (!existing) {
        byRound.set(option.value, option)
        continue
      }
      byRound.set(option.value, {
        ...existing,
        ...option,
        startDate: existing.startDate && option.startDate
          ? existing.startDate < option.startDate ? existing.startDate : option.startDate
          : existing.startDate || option.startDate,
        endDate: existing.endDate && option.endDate
          ? existing.endDate > option.endDate ? existing.endDate : option.endDate
          : existing.endDate || option.endDate,
      })
    }
  }
  return [...byRound.values()].sort((a, b) => a.roundNumber - b.roundNumber || a.label.localeCompare(b.label))
}

async function shouldShowLineupsSummaryDiagnostic(): Promise<boolean> {
  if (process.env.VERCEL_GIT_COMMIT_REF === "betting/testing") return true

  const headerStore = await headers()
  const host = headerStore.get("host")?.split(":")[0].toLowerCase() ?? ""
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(":")[0].toLowerCase() ?? ""
  const hosts = [host, forwardedHost]

  return hosts.some((value) =>
    ["localhost", "127.0.0.1", "::1"].includes(value) ||
    value.includes("betting-testing")
  )
}

function lineupsSummaryMissReason(summary: Awaited<ReturnType<typeof fetchLineupsPageShellSummary>>): string | null {
  if (!summary) return "No row returned from summary.lineups_page_summary for this year/round."
  if (summary.matches.length === 0) return "Summary row returned zero matches."
  return null
}

function matchShell(match: LineupMatch): LineupMatch {
  return {
    ...match,
    homeTeam: match.homeTeam ? { ...match.homeTeam, players: [] } : null,
    awayTeam: match.awayTeam ? { ...match.awayTeam, players: [] } : null,
  }
}

export default async function LineupsPage({ searchParams }: LineupsPageProps) {
  const params = await searchParams
  const { userId } = await auth()
  const hasProAccess = await getServerProPlotAccess(userId)
  const year = currentYearInBrisbane()
  const requestedRound = params.round?.trim()
  const initialSummary = requestedRound
    ? await withFallback(fetchLineupsPageShellSummary(year, requestedRound), null, "Lineups page shell summary")
    : await withFallback(fetchLatestLineupsPageShellSummary(year), null, "Latest lineups page shell summary")
  const latestSummaryForOptions = requestedRound
    ? await withFallback(fetchLatestLineupsPageShellSummary(year), null, "Latest lineups page shell summary")
    : initialSummary
  const fallbackRoundOptions = initialSummary?.roundOptions.length || latestSummaryForOptions?.roundOptions.length
    ? []
    : await withFallback(fetchLineupRoundOptions(year), [], "Lineups round options")
  const initialRoundOptions = mergeRoundOptions(
    initialSummary?.roundOptions ?? [],
    latestSummaryForOptions?.roundOptions ?? [],
    fallbackRoundOptions
  )
  const selectedRound =
    (requestedRound && initialRoundOptions.some((option) => option.value === requestedRound) ? requestedRound : null) ??
    currentRoundOption(initialRoundOptions)?.value ??
    requestedRound ??
    initialSummary?.round ??
    "Round 1"
  const rawSummary = initialSummary?.round === selectedRound
    ? initialSummary
    : await withFallback(fetchLineupsPageShellSummary(year, selectedRound), null, "Lineups page shell summary")
  const summaryMissReason = lineupsSummaryMissReason(rawSummary)
  const summary = summaryMissReason ? null : rawSummary
  const fallbackData = summary ? null : await (async () => {
    const [teamLogos, lineupRound] = await Promise.all([
      withFallback(fetchTeamLogos(), {}, "Lineups team logos"),
      fetchLineupsForRound({
        round: selectedRound,
        year,
        includeFantasyProjections: hasProAccess,
      }),
    ])
    return {
      teamLogos,
      matches: lineupRound.matches,
    }
  })()
  const matches = (summary?.matches ?? fallbackData?.matches ?? []).map(matchShell)
  const summaryTeamLogos = summary?.teamLogos ?? {}
  const teamLogos = Object.keys(summaryTeamLogos).length > 0
    ? summaryTeamLogos
    : fallbackData?.teamLogos ?? await withFallback(fetchTeamLogos(), {}, "Lineups team logos")
  const visibleMatches = matches.filter((match) => match.homeTeam || match.awayTeam || isDrawFallbackMatch(match) || !isPastMatch(match))
  const initialLiveMatches = visibleMatches.length > 0
    ? await withFallback(fetchLiveLineupData(visibleMatches.map((match) => match.matchId)), {}, "Live lineups data")
    : {}
  const summaryDiagnostic = summaryMissReason && await shouldShowLineupsSummaryDiagnostic()
    ? `lineups_page_summary miss: ${summaryMissReason} Heavy fallback data path is active for ${year} ${selectedRound}.`
    : null

  return (
    <LineupsDashboard
      matches={visibleMatches}
      year={year}
      liveMatches={initialLiveMatches}
      weatherForecasts={{}}
      roundOptions={mergeRoundOptions(initialRoundOptions, summary?.roundOptions ?? [])}
      selectedRound={selectedRound}
      teamLogos={teamLogos}
      canAccessFantasyProjections={hasProAccess}
      summaryDiagnostic={summaryDiagnostic}
    />
  )
}

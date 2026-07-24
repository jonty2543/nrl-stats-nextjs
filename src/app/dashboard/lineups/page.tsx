import { auth } from "@clerk/nextjs/server"
import { LineupsDashboard } from "@/components/views/lineups-dashboard"
import { getServerPremiumAccess, getServerProPlotAccess } from "@/lib/access/pro-access-server"
import {
  fetchLineupRoundOptions,
  fetchLineupYearOptions,
  fetchLiveLineupData,
  fetchLineupsForRound,
  type LineupPlayer,
} from "@/lib/lineups/nrl-lineups"
import { fetchLatestLineupsPageShellSummary, fetchLineupsMatchPredictions, fetchLineupsPageShellSummary, fetchPlayerImages, fetchStatsinsiderTryCharts, fetchTeamLogos, type PlayerImageRecord } from "@/lib/supabase/queries"
import type { LineupMatch, LineupRoundOption, LineupYearOption } from "@/lib/lineups/nrl-lineups"
import type { LineupCompetition } from "@/lib/lineups/nrl-lineups"

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
    competition?: string
    round?: string
    year?: string
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
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
  }).format(now)
  const nextFutureRound = options.find((option) => option.startDate >= today)

  if (weekday === "Mon" && nextFutureRound) return nextFutureRound

  const activeRound = options.find((option) => today >= option.startDate && today <= option.endDate)
  if (activeRound) return activeRound

  return (
    nextFutureRound ??
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

function mergeYearOptions(...optionGroups: LineupYearOption[][]): LineupYearOption[] {
  const byYear = new Map<number, LineupYearOption>()
  for (const options of optionGroups) {
    for (const option of options) {
      byYear.set(option.year, option)
    }
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

function shouldShowLineupsSummaryDiagnostic(): boolean {
  if (process.env.LINEUPS_SUMMARY_DIAGNOSTIC === "1") return true
  if (process.env.VERCEL_GIT_COMMIT_REF === "betting/testing") return true
  return false
}

function lineupsSummaryMissReason(summary: Awaited<ReturnType<typeof fetchLineupsPageShellSummary>>): string | null {
  if (!summary) return "No row returned from summary.lineups_page_summary for this year/round."
  if (summary.matches.length === 0) return "Summary row returned zero matches."
  return null
}

function lineupsSummarySparseReason(summary: Awaited<ReturnType<typeof fetchLineupsPageShellSummary>>): string | null {
  if (!summary || summary.matches.length === 0) return null

  const playerCount = summary.matches.reduce(
    (total, match) => total + (match.homeTeam?.players.length ?? 0) + (match.awayTeam?.players.length ?? 0),
    0
  )
  if (playerCount === 0) {
    return `summary.lineups_page_summary has ${summary.matches.length} matches for ${summary.year} ${summary.round}, but zero players. Localhost is showing fixture shell data until the summary/full lineup source is populated.`
  }
  return null
}

function roundNumberFromLabel(value: string): number | null {
  const match = value.match(/\d+/)
  if (!match) return null
  const round = Number(match[0])
  return Number.isFinite(round) ? Math.trunc(round) : null
}

function matchShell(match: LineupMatch): LineupMatch {
  return {
    ...match,
    homeTeam: match.homeTeam ? { ...match.homeTeam, players: [] } : null,
    awayTeam: match.awayTeam ? { ...match.awayTeam, players: [] } : null,
  }
}

function normalisePlayerImageLookupKey(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function buildPlayerImageLookup(rows: PlayerImageRecord[]): Map<string, PlayerImageRecord> {
  const lookup = new Map<string, PlayerImageRecord>()
  for (const row of rows) {
    const playerKey = normalisePlayerImageLookupKey(row.player)
    if (!playerKey) continue
    const teamKey = normalisePlayerImageLookupKey(row.team)
    if (teamKey && !lookup.has(`${playerKey}|${teamKey}`)) lookup.set(`${playerKey}|${teamKey}`, row)
    if (!lookup.has(playerKey)) lookup.set(playerKey, row)
  }
  return lookup
}

function enrichLineupPlayerImages(player: LineupPlayer, lookup: Map<string, PlayerImageRecord>): LineupPlayer {
  const playerKey = normalisePlayerImageLookupKey(player.player)
  const teamKey = normalisePlayerImageLookupKey(player.team)
  const imageRow = lookup.get(`${playerKey}|${teamKey}`) ?? lookup.get(playerKey) ?? null
  if (!imageRow) return player
  return {
    ...player,
    cachedHeadImage: imageRow.cached_head_image ?? player.cachedHeadImage ?? null,
    cachedBodyImage: imageRow.cached_body_image ?? player.cachedBodyImage ?? null,
    headImage: imageRow.head_image ?? player.headImage,
    bodyImage: imageRow.body_image ?? player.bodyImage,
  }
}

function enrichLineupMatchImages(match: LineupMatch, lookup: Map<string, PlayerImageRecord>): LineupMatch {
  return {
    ...match,
    homeTeam: match.homeTeam ? {
      ...match.homeTeam,
      players: match.homeTeam.players.map((player) => enrichLineupPlayerImages(player, lookup)),
    } : null,
    awayTeam: match.awayTeam ? {
      ...match.awayTeam,
      players: match.awayTeam.players.map((player) => enrichLineupPlayerImages(player, lookup)),
    } : null,
  }
}

function parseCompetition(value: string | undefined): LineupCompetition {
  return value === "origin" ? "origin" : "nrl"
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null
  const year = Number(value)
  return Number.isInteger(year) && year >= 1908 && year <= 2100 ? year : null
}

export default async function LineupsPage({ searchParams }: LineupsPageProps) {
  const params = await searchParams
  const { userId } = await auth()
  const [hasProAccess, hasPremiumAccess] = await Promise.all([
    getServerProPlotAccess(userId),
    getServerPremiumAccess(userId),
  ])
  const currentYear = currentYearInBrisbane()
  const selectedCompetition = parseCompetition(params.competition)
  const fetchedYearOptions = await withFallback(fetchLineupYearOptions(selectedCompetition), [], "Lineups year options")
  const selectedYear = parseYear(params.year) ?? (selectedCompetition === "origin" ? fetchedYearOptions[0]?.year : currentYear) ?? currentYear
  const yearOptions = mergeYearOptions(
    fetchedYearOptions,
    [{ value: String(selectedYear), label: String(selectedYear), year: selectedYear }],
    selectedCompetition === "nrl" ? [{ value: String(currentYear), label: String(currentYear), year: currentYear }] : []
  )
  const requestedRound = params.round?.trim()
  const shouldUseSummary = selectedCompetition === "nrl"
  const initialSummary = shouldUseSummary && requestedRound
    ? await withFallback(fetchLineupsPageShellSummary(selectedYear, requestedRound), null, "Lineups page shell summary")
    : shouldUseSummary
      ? await withFallback(fetchLatestLineupsPageShellSummary(selectedYear), null, "Latest lineups page shell summary")
      : null
  const latestSummaryForOptions = shouldUseSummary && requestedRound
    ? await withFallback(fetchLatestLineupsPageShellSummary(selectedYear), null, "Latest lineups page shell summary")
    : initialSummary
  const fallbackRoundOptions = await withFallback(fetchLineupRoundOptions(selectedYear, selectedCompetition), [], "Lineups round options")
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
    : shouldUseSummary
      ? await withFallback(fetchLineupsPageShellSummary(selectedYear, selectedRound), null, "Lineups page shell summary")
      : null
  const summaryMissReason = shouldUseSummary ? lineupsSummaryMissReason(rawSummary) : null
  const summary = summaryMissReason ? null : rawSummary
  const fallbackData = summary ? null : await (async () => {
    const roundsToFetch = selectedCompetition === "origin"
      ? initialRoundOptions
      : initialRoundOptions.filter((option) => option.value === selectedRound)
    const effectiveRoundsToFetch = roundsToFetch.length > 0
      ? roundsToFetch
      : selectedRound
        ? [{ value: selectedRound, label: selectedRound, roundNumber: roundNumberFromLabel(selectedRound) ?? 0, startDate: "", endDate: "" }]
        : []
    const [teamLogos, lineupRounds] = await Promise.all([
      withFallback(fetchTeamLogos(), {}, "Lineups team logos"),
      Promise.all(effectiveRoundsToFetch.map((option) =>
        fetchLineupsForRound({
          round: option.value,
          year: selectedYear,
          includeFantasyProjections: hasProAccess,
          competition: selectedCompetition,
        })
      )),
    ])
    const matchesById = new Map<string, LineupMatch>()
    for (const lineupRound of lineupRounds) {
      for (const match of lineupRound.matches) {
        matchesById.set(match.matchId, match)
      }
    }
    return {
      teamLogos,
      matches: [...matchesById.values()].sort((a, b) => a.matchDate.localeCompare(b.matchDate) || (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "")),
    }
  })()
  const shouldUseShellMatches = process.env.NODE_ENV === "production"
  const matches = (summary?.matches ?? fallbackData?.matches ?? []).map((match) =>
    shouldUseShellMatches ? matchShell(match) : match
  )
  const playerImages = matches.some((match) => (match.homeTeam?.players.length ?? 0) > 0 || (match.awayTeam?.players.length ?? 0) > 0)
    ? await withFallback(fetchPlayerImages(), [], "Lineups player images")
    : []
  const playerImageLookup = buildPlayerImageLookup(playerImages)
  const imageEnrichedMatches = playerImageLookup.size > 0
    ? matches.map((match) => enrichLineupMatchImages(match, playerImageLookup))
    : matches
  const summaryTeamLogos = summary?.teamLogos ?? {}
  const teamLogos = Object.keys(summaryTeamLogos).length > 0
    ? summaryTeamLogos
    : fallbackData?.teamLogos ?? await withFallback(fetchTeamLogos(), {}, "Lineups team logos")
  const visibleMatches = imageEnrichedMatches.filter((match) => match.homeTeam || match.awayTeam || isDrawFallbackMatch(match) || !isPastMatch(match))
  const matchPredictions = selectedCompetition === "nrl" && visibleMatches.length > 0
    ? await withFallback(fetchLineupsMatchPredictions(visibleMatches), {}, "Lineups match predictions")
    : {}
  const initialLiveMatches = selectedCompetition === "nrl" && visibleMatches.length > 0
    ? await withFallback(fetchLiveLineupData(visibleMatches.map((match) => match.matchId)), {}, "Live lineups data")
    : {}
  const tryChartsByTeam = selectedCompetition === "nrl"
    ? await withFallback(
        fetchStatsinsiderTryCharts(selectedYear, roundNumberFromLabel(selectedRound)),
        {},
        "Stats Insider try charts"
      )
    : {}
  const summarySparseReason = lineupsSummarySparseReason(summary)
  const summaryDiagnosticReason = summaryMissReason
    ? `lineups_page_summary miss: ${summaryMissReason} Heavy fallback data path is active for ${selectedYear} ${selectedRound}.`
    : summarySparseReason
  const summaryDiagnostic = summaryDiagnosticReason && shouldShowLineupsSummaryDiagnostic()
    ? summaryDiagnosticReason
    : null

  return (
    <LineupsDashboard
      matches={visibleMatches}
      year={selectedYear}
      liveMatches={initialLiveMatches}
      weatherForecasts={{}}
      yearOptions={yearOptions}
      selectedRound={selectedRound}
      selectedYear={selectedYear}
      selectedCompetition={selectedCompetition}
      teamLogos={teamLogos}
      sportsbetOdds={summary?.sportsbetOdds ?? {}}
      matchPredictions={matchPredictions}
      tryChartsByTeam={tryChartsByTeam}
      canAccessFantasyProjections={hasProAccess}
      canAccessPremiumBetting={hasPremiumAccess}
      summaryDiagnostic={summaryDiagnostic}
    />
  )
}

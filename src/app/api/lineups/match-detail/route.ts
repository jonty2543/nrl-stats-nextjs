import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { getServerPremiumAccess, getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { fetchLineupsForRound } from "@/lib/lineups/nrl-lineups"
import { fetchLineupPlayerAverageSources, fetchLineupsMatchDetailSummary } from "@/lib/supabase/queries"
import type { LineupMatch } from "@/lib/lineups/nrl-lineups"
import type { LineupCompetition } from "@/lib/lineups/nrl-lineups"

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

function parseCompetition(value: unknown): LineupCompetition {
  return value === "origin" ? "origin" : "nrl"
}

function fallbackMatch(value: unknown, matchId: string): LineupMatch | null {
  if (!value || typeof value !== "object") return null
  const match = value as LineupMatch
  return match.matchId === matchId ? match : null
}

function playerCount(match: LineupMatch | null | undefined): number {
  return (match?.homeTeam?.players.length ?? 0) + (match?.awayTeam?.players.length ?? 0)
}

function matchTeams(match: LineupMatch): string[] {
  return [
    match.homeTeam?.team,
    match.homeTeam?.teamName,
    match.awayTeam?.team,
    match.awayTeam?.teamName,
    ...match.match.split(/\s+vs\s+/i),
  ]
    .map((value) => value?.toLowerCase().trim())
    .filter((value): value is string => Boolean(value))
}

function sameFixture(left: LineupMatch, right: LineupMatch): boolean {
  if (left.matchId === right.matchId) return true
  if (left.matchDate && right.matchDate && left.matchDate.slice(0, 10) !== right.matchDate.slice(0, 10)) return false
  const leftTeams = matchTeams(left)
  const rightTeams = matchTeams(right)
  return leftTeams.some((team) => rightTeams.includes(team))
}

function stripFantasyProjections(match: LineupMatch): LineupMatch {
  const stripTeam = (team: LineupMatch["homeTeam"]): LineupMatch["homeTeam"] =>
    team
      ? {
          ...team,
          players: team.players.map((player) => ({ ...player, fantasyProjection: null })),
        }
      : null

  return {
    ...match,
    homeTeam: stripTeam(match.homeTeam),
    awayTeam: stripTeam(match.awayTeam),
  }
}

function stripPremiumTryscorerOdds(detail: Awaited<ReturnType<typeof fetchLineupsMatchDetailSummary>>): Awaited<ReturnType<typeof fetchLineupsMatchDetailSummary>> {
  if (!detail) return detail
  return {
    ...detail,
    tryscorerOdds: Object.fromEntries(
      Object.entries(detail.tryscorerOdds).map(([key, odds]) => [
        key,
        { ...odds, modelProbability: null },
      ])
    ),
  }
}

function mergeHydratedMatch(base: LineupMatch | null, hydrated: LineupMatch | null): LineupMatch | null {
  if (!base) return hydrated
  if (!hydrated) return base

  return {
    ...base,
    ...hydrated,
    homeTeam:
      playerCount({ ...hydrated, awayTeam: null }) > 0
        ? hydrated.homeTeam
        : base.homeTeam ?? hydrated.homeTeam,
    awayTeam:
      playerCount({ ...hydrated, homeTeam: null }) > 0
        ? hydrated.awayTeam
        : base.awayTeam ?? hydrated.awayTeam,
    recentHeadToHead:
      hydrated.recentHeadToHead && hydrated.recentHeadToHead.length > 0
        ? hydrated.recentHeadToHead
        : base.recentHeadToHead,
    homeRecentResults:
      hydrated.homeRecentResults && hydrated.homeRecentResults.length > 0
        ? hydrated.homeRecentResults
        : base.homeRecentResults,
    awayRecentResults:
      hydrated.awayRecentResults && hydrated.awayRecentResults.length > 0
        ? hydrated.awayRecentResults
        : base.awayRecentResults,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const matchId = text(body.matchId)
    const round = text(body.round)
    const year = numberValue(body.year)
    const competition = parseCompetition(body.competition)
    const shellMatch = fallbackMatch(body.match, matchId)

    if (!matchId || !round || year == null) {
      return NextResponse.json({ detail: null }, { status: 400 })
    }

    const { userId } = await auth()
    const [hasProAccess, hasPremiumAccess] = await Promise.all([
      getServerProPlotAccess(userId),
      getServerPremiumAccess(userId),
    ])
    const detail = competition === "nrl"
      ? await fetchLineupsMatchDetailSummary(year, round, matchId)
      : null
    let hydratedMatch: LineupMatch | null = null
    let hydratedMatchStats = detail?.matchStats ?? null
    const detailMatch = detail?.match ?? shellMatch

    const shouldHydrateRoundData =
      playerCount(detailMatch) === 0 ||
      hydratedMatchStats == null ||
      hydratedMatchStats.home?.possessionPct == null ||
      hydratedMatchStats.away?.possessionPct == null

    if (shouldHydrateRoundData) {
      const roundLineups = await fetchLineupsForRound({
        round,
        year,
        includeFantasyProjections: hasProAccess,
        competition,
      })
      hydratedMatch =
        roundLineups.matches.find((candidate) => candidate.matchId === matchId) ??
        (detailMatch ? roundLineups.matches.find((candidate) => sameFixture(candidate, detailMatch)) : null) ??
        null
      hydratedMatchStats =
        roundLineups.matchStats[hydratedMatch?.matchId ?? matchId] ??
        roundLineups.matchStats[matchId] ??
        hydratedMatchStats
    }

    const fallbackDetail = shellMatch
      ? {
          match: hydratedMatch ?? shellMatch,
          matchStats: hydratedMatchStats,
          tryscorerOdds: {},
          sportsbetOdds: {},
          casualtyWardOuts: {},
          playerAverages: {},
          playerAverageSources: await fetchLineupPlayerAverageSources(hydratedMatch ?? shellMatch),
          positionPpmBaselines: {},
          playerTryHistory: {},
      }
      : null

    const responseDetail = detail
      ? {
          ...detail,
          match: mergeHydratedMatch(detail.match, hydratedMatch) ?? detail.match,
          matchStats: hydratedMatchStats,
        }
      : fallbackDetail
    if (!responseDetail) return NextResponse.json({ detail: null }, { status: 404 })

    const accessFilteredDetail = {
      ...(hasPremiumAccess ? responseDetail : stripPremiumTryscorerOdds(responseDetail)),
      match: hasProAccess ? responseDetail.match : stripFantasyProjections(responseDetail.match),
    }

    return NextResponse.json({ detail: accessFilteredDetail })
  } catch (error) {
    console.error("Error fetching lineup match detail:", error)
    return NextResponse.json({ detail: null }, { status: 500 })
  }
}

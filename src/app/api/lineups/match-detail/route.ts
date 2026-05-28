import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { fetchLineupsMatchDetailSummary } from "@/lib/supabase/queries"
import type { LineupMatch } from "@/lib/lineups/nrl-lineups"

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const matchId = text(body.matchId)
    const round = text(body.round)
    const year = numberValue(body.year)

    if (!matchId || !round || year == null) {
      return NextResponse.json({ detail: null }, { status: 400 })
    }

    const { userId } = await auth()
    const hasProAccess = await getServerProPlotAccess(userId)
    const detail = await fetchLineupsMatchDetailSummary(year, round, matchId)

    if (!detail) return NextResponse.json({ detail: null }, { status: 404 })

    return NextResponse.json({
      detail: hasProAccess
        ? detail
        : {
            ...detail,
            match: stripFantasyProjections(detail.match),
          },
    })
  } catch (error) {
    console.error("Error fetching lineup match detail:", error)
    return NextResponse.json({ detail: null }, { status: 500 })
  }
}

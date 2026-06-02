import { NextRequest, NextResponse } from "next/server"
import { fetchLiveLineupData, type LineupMatch } from "@/lib/lineups/nrl-lineups"
import { fetchLineupWeatherForecasts } from "@/lib/lineups/weather"

type SupplementalMatch = Pick<LineupMatch, "matchId" | "venue" | "kickoffUtc">

function parseMatches(value: unknown): SupplementalMatch[] {
  if (!Array.isArray(value)) return []

  return value
    .map((match): SupplementalMatch | null => {
      if (!match || typeof match !== "object") return null
      const record = match as Record<string, unknown>
      const matchId = typeof record.matchId === "string" ? record.matchId.trim() : ""
      if (!matchId) return null

      return {
        matchId,
        venue: typeof record.venue === "string" ? record.venue : null,
        kickoffUtc: typeof record.kickoffUtc === "string" ? record.kickoffUtc : null,
      }
    })
    .filter((match): match is SupplementalMatch => match != null)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const matches = parseMatches(body.matches)
    if (matches.length === 0) {
      return NextResponse.json({ liveMatches: {}, weatherForecasts: {} })
    }

    const [liveMatches, weatherForecasts] = await Promise.all([
      fetchLiveLineupData(matches.map((match) => match.matchId)).catch(() => ({})),
      fetchLineupWeatherForecasts(matches as unknown as LineupMatch[]).catch(() => ({})),
    ])

    return NextResponse.json({ liveMatches, weatherForecasts })
  } catch (error) {
    console.error("Error fetching lineup supplemental data:", error)
    return NextResponse.json({ liveMatches: {}, weatherForecasts: {} }, { status: 500 })
  }
}

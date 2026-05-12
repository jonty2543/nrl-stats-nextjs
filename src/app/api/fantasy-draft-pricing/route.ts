import { NextRequest, NextResponse } from "next/server"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import { fetchFantasyPlayersSnapshot, fetchLineupsProjectionsByPlayerId } from "@/lib/fantasy/nrl"
import { buildDraftPricingResult } from "@/lib/fantasy/draft-pricing"
import { fetchPlayerImages } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

interface FantasyApiErrorPayload {
  success?: unknown
  errors?: Array<{ code?: unknown; text?: unknown }>
  result?: unknown
}

function toRound(value: string | null): number | null {
  if (!value?.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "shortside/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(`Fantasy draft fetch failed for ${url}: ${response.status} ${response.statusText}`)
  }

  const text = await response.text()
  const trimmed = text.trim()

  if (!trimmed) {
    throw new Error(`Fantasy draft fetch returned an empty body for ${url}`)
  }

  if (trimmed.startsWith("<")) {
    throw new Error(`Fantasy draft endpoint returned HTML instead of JSON for ${url}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`Fantasy draft endpoint returned invalid JSON for ${url}`)
  }

  const payload = parsed as FantasyApiErrorPayload
  if (payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.errors) && payload.errors.length > 0) {
    const authError = payload.errors.find((entry) => Number(entry.code) === 401)
    if (authError) {
      throw new Error(
        `NRL Fantasy draft API requires authorization for this league. ${typeof authError.text === "string" ? authError.text : "Authorization is required."}`
      )
    }
  }

  return parsed
}

function inferCurrentRound(showRaw: unknown): number | null {
  if (!showRaw || typeof showRaw !== "object" || Array.isArray(showRaw)) return null
  const wrapped = showRaw as Record<string, unknown>
  const root =
    wrapped.result && typeof wrapped.result === "object" && !Array.isArray(wrapped.result)
      ? (wrapped.result as Record<string, unknown>)
      : wrapped
  const league = (root.league as Record<string, unknown> | undefined) ?? root
  const direct = league.current_round ?? league.round ?? root.current_round ?? root.round
  const parsed = typeof direct === "number" ? direct : typeof direct === "string" ? Number(direct) : null
  if (parsed != null && Number.isFinite(parsed)) return Math.trunc(parsed)

  const fixture = league.fixture
  if (fixture && typeof fixture === "object" && !Array.isArray(fixture)) {
    const rounds = Object.keys(fixture)
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
    if (rounds.length > 0) return Math.trunc(rounds[0])
  }

  return null
}

function normalisePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function parsePersonName(value: string): { first: string; last: string } {
  const parts = normalisePersonName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return { first: parts[0], last: parts[parts.length - 1] }
}

function resolvePlayerTeam(playerName: string, playerImages: Awaited<ReturnType<typeof fetchPlayerImages>>): string | null {
  if (!playerName) return null
  const targetNorm = normalisePersonName(playerName)
  const targetParsed = parsePersonName(playerName)
  const match = playerImages.find((row) => {
    const rowName = row.player ?? ""
    if (!rowName) return false
    const rowNorm = normalisePersonName(rowName)
    if (rowNorm === targetNorm) return true
    const parsed = parsePersonName(rowName)
    return parsed.last && parsed.last === targetParsed.last && parsed.first[0] && parsed.first[0] === targetParsed.first[0]
  })
  return match?.team ?? null
}

export async function GET(request: NextRequest) {
  try {
    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim()
    const requestedRound = toRound(request.nextUrl.searchParams.get("round"))

    if (!leagueId) {
      return NextResponse.json({ error: "leagueId is required" }, { status: 400 })
    }

    const showUrl = `https://fantasy.nrl.com/nrl_draft/api/leagues_draft/show?id=${encodeURIComponent(leagueId)}&_=${Date.now()}`
    const projectionsUrl = "https://fantasy.nrl.com/data/nrl/coach/players.json"
    const showRaw = await fetchJson(showUrl)
    const round = requestedRound ?? inferCurrentRound(showRaw)

    if (round == null) {
      return NextResponse.json(
        { error: "Unable to infer round from league draw. Provide round manually." },
        { status: 422 }
      )
    }

    const rostersUrl = `https://fantasy.nrl.com/nrl_draft/api/leagues_draft/rosters?league_id=${encodeURIComponent(leagueId)}&round=${round}`
    const [rostersRaw, projectionsRaw, fantasyPlayers, lineupsProjections, playerImages, draw2026Data] = await Promise.all([
      fetchJson(rostersUrl),
      fetchJson(projectionsUrl),
      fetchFantasyPlayersSnapshot(),
      fetchLineupsProjectionsByPlayerId(),
      fetchPlayerImages(),
      loadDraw2026Data().catch(() => null),
    ])
    const fantasyPlayerTeams = Object.fromEntries(
      fantasyPlayers.map((player) => [player.id, resolvePlayerTeam(player.name, playerImages)])
    )

    return NextResponse.json(
      buildDraftPricingResult({
        leagueId,
        round,
        showRaw,
        rostersRaw,
        projectionsRaw,
        lineupsProjections,
        fantasyPlayers,
        fantasyPlayerTeams,
        draw2026Data,
      })
    )
  } catch (error) {
    console.error("Error pricing fantasy draft league:", error)
    return NextResponse.json(
      {
        error: "Failed to price fantasy draft league",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

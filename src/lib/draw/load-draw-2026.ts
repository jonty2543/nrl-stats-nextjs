import { unstable_cache } from "next/cache"
import { createServerSupabaseClient } from "@/lib/supabase/client"
import type { Draw2026Data, Draw2026Row } from "./types"

const PAGE_SIZE = 1000
const DRAW_LOGO_TIMEOUT_MS = 1500

function normaliseTeamKey(value: unknown): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function roundNumber(value: unknown): number | null {
  const label = String(value ?? "").trim()
  const numeric = Number.parseInt(label.match(/\d+/)?.[0] ?? "", 10)
  if (Number.isFinite(numeric)) return numeric
  if (/finals week 1/i.test(label)) return 28
  if (/finals week 2/i.test(label)) return 29
  if (/finals week 3/i.test(label)) return 30
  if (/grand final/i.test(label)) return 31
  return null
}

function fixtureKey(row: Draw2026Row): string {
  return [row.kickoff.slice(0, 10), normaliseTeamKey(row.home), normaliseTeamKey(row.away)].join("|")
}

async function fetchScrapedFixtureRows(): Promise<Draw2026Row[]> {
  const supabase = createServerSupabaseClient("nrl")
  const [{ data: matchData, error: matchError }, { data: lineupData, error: lineupError }] = await Promise.all([
    supabase
      .from("matches")
      .select("url,match_date,round,round_number,team,opponent_team,is_home")
      .gte("match_date", "2026-01-01")
      .lt("match_date", "2027-01-01")
      .eq("is_home", true)
      .order("match_date", { ascending: true })
      .limit(PAGE_SIZE),
    supabase
      .from("lineups")
      .select("match_id,match_date,kickoff_utc,round,match,match_url")
      .gte("match_date", "2026-01-01")
      .lt("match_date", "2027-01-01")
      .eq("team_type", "Home")
      .eq("number", 1)
      .order("match_date", { ascending: true })
      .limit(PAGE_SIZE),
  ])

  if (matchError) throw new Error(`Supabase fetch nrl.matches fixtures: ${matchError.message}`)
  if (lineupError) throw new Error(`Supabase fetch nrl.lineups fixtures: ${lineupError.message}`)

  const fixtures = new Map<string, Draw2026Row>()
  for (const raw of matchData ?? []) {
    const round = roundNumber(raw.round_number) || roundNumber(raw.round)
    const kickoff = String(raw.match_date ?? "")
    const home = String(raw.team ?? "").trim()
    const away = String(raw.opponent_team ?? "").trim()
    if (!round || !kickoff || !home || !away) continue
    const row = { round, kickoff, matchCentreUrl: String(raw.url ?? ""), home, away }
    fixtures.set(fixtureKey(row), row)
  }

  const seenMatchIds = new Set<string>()
  for (const raw of lineupData ?? []) {
    const matchId = String(raw.match_id ?? "").trim()
    if (matchId && seenMatchIds.has(matchId)) continue
    if (matchId) seenMatchIds.add(matchId)
    const [home = "", away = ""] = String(raw.match ?? "").split(/\s+vs\s+/i).map((team) => team.trim())
    const round = roundNumber(raw.round)
    const kickoff = String(raw.kickoff_utc ?? raw.match_date ?? "")
    if (!round || !kickoff || !home || !away) continue
    const row = { round, kickoff, matchCentreUrl: String(raw.match_url ?? ""), home, away }
    fixtures.set(fixtureKey(row), row)
  }

  return [...fixtures.values()].sort((left, right) => left.round - right.round || left.kickoff.localeCompare(right.kickoff))
}

async function fetchTeamLogosFromSupabase(): Promise<Record<string, string>> {
  const supabase = createServerSupabaseClient()
  const logos = new Map<string, string>()
  let start = 0

  while (true) {
    const end = start + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("team_logos")
      .select("team,logo_url")
      .range(start, end)

    if (error) {
      throw new Error(`Supabase fetch team_logos: ${error.message}`)
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break

    for (const row of rows) {
      const teamKey = normaliseTeamKey(row.team)
      const logoUrl = typeof row.logo_url === "string" ? row.logo_url.trim() : ""
      if (teamKey && logoUrl && !logos.has(teamKey)) {
        logos.set(teamKey, logoUrl)
      }
    }

    if (rows.length < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  return Object.fromEntries(logos)
}

async function loadDraw2026DataUncached(): Promise<Draw2026Data> {
  const [rows, teamLogos] = await Promise.all([
    fetchScrapedFixtureRows(),
    Promise.race([
      fetchTeamLogosFromSupabase().catch((error) => {
        console.warn("Unable to load team logos for draw data.", error)
        return {}
      }),
      new Promise<Record<string, string>>((resolve) => {
        setTimeout(() => {
          console.warn("Draw team logos timed out; using empty logo map.")
          resolve({})
        }, DRAW_LOGO_TIMEOUT_MS)
      }),
    ]),
  ])

  return {
    rows,
    teamLogos,
  }
}

const loadDraw2026DataCached = unstable_cache(
  loadDraw2026DataUncached,
  ["scraped-2026-fixtures-with-logos-v1"],
  { revalidate: 3600 }
)

export async function loadDraw2026Data(): Promise<Draw2026Data> {
  if (process.env.NODE_ENV !== "production") {
    return loadDraw2026DataUncached()
  }

  return loadDraw2026DataCached()
}

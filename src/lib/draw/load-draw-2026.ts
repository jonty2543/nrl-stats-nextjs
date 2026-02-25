import { readFile } from "node:fs/promises"
import path from "node:path"
import { unstable_cache } from "next/cache"
import { createServerSupabaseClient } from "@/lib/supabase/client"
import type { Draw2026Data, Draw2026Row } from "./types"

const PAGE_SIZE = 1000

function normaliseTeamKey(value: unknown): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parseDrawCsv(raw: string): Draw2026Row[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) return []

  const out: Draw2026Row[] = []
  for (const line of lines.slice(1)) {
    const [round, kickoff, matchCentreUrl, home, away] = line.split(",")
    const roundNum = Number.parseInt(round ?? "", 10)
    if (!Number.isFinite(roundNum)) continue

    out.push({
      round: roundNum,
      kickoff: kickoff ?? "",
      matchCentreUrl: matchCentreUrl ?? "",
      home: home ?? "",
      away: away ?? "",
    })
  }

  return out.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round
    return a.kickoff.localeCompare(b.kickoff)
  })
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
  const drawPath = path.join(process.cwd(), "data", "draw_2026.csv")
  const [csvRaw, teamLogos] = await Promise.all([
    readFile(drawPath, "utf8"),
    fetchTeamLogosFromSupabase(),
  ])

  return {
    rows: parseDrawCsv(csvRaw),
    teamLogos,
  }
}

const loadDraw2026DataCached = unstable_cache(
  loadDraw2026DataUncached,
  ["draw-2026-with-logos-v1"],
  { revalidate: 3600 }
)

export async function loadDraw2026Data(): Promise<Draw2026Data> {
  if (process.env.NODE_ENV !== "production") {
    return loadDraw2026DataUncached()
  }

  return loadDraw2026DataCached()
}

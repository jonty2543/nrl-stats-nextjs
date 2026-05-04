import { LineupsDashboard } from "@/components/views/lineups-dashboard"
import { fetchUpcomingLineups, fetchUpcomingTryscorerOdds } from "@/lib/lineups/nrl-lineups"
import { fetchPlayerStats, fetchTeamLogos } from "@/lib/supabase/queries"
import type { PlayerStat } from "@/lib/data/types"

export const dynamic = "force-dynamic"

const AVERAGE_KEYS = [
  "Tries",
  "Try Assists",
  "All Run Metres",
  "Tackles Made",
  "Line Breaks",
  "Line Break Assists",
  "Errors",
  "Missed Tackles",
  "Receipts",
  "Tackle Breaks",
  "Offloads",
] as const

type AverageKey = (typeof AVERAGE_KEYS)[number]

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

export default async function LineupsPage() {
  const [matches, teamLogos, tryscorerOdds, playerStats2026] = await Promise.all([
    fetchUpcomingLineups(),
    fetchTeamLogos(),
    fetchUpcomingTryscorerOdds(),
    fetchPlayerStats(["2026"]),
  ])

  return (
    <LineupsDashboard
      matches={matches}
      teamLogos={teamLogos}
      tryscorerOdds={tryscorerOdds}
      playerAverages={buildPlayerAverages(playerStats2026)}
    />
  )
}

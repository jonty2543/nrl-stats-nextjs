"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { TEAM_COLOURS } from "@/lib/data/constants"
import { playerSlug } from "@/lib/data/player-slug"
import type { PlayerStat, TeamStat } from "@/lib/data/types"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

interface LeadersDashboardProps {
  selectedYear: string
  selectedView: "players" | "teams"
  availableYears: string[]
  playerRows: PlayerStat[]
  teamRows: TeamStat[]
  playerImages: PlayerImageRecord[]
  teamLogos: Record<string, string>
}

interface PlayerLeaderEntry {
  name: string
  team: string
  value: number
  imageSources: string[]
  logoUrl: string | null
}

interface TeamLeaderEntry {
  team: string
  value: number
  logoUrl: string | null
}

type LeaderValueMode = "total" | "average"

type PlayerLeaderStatKey =
  | "Points"
  | "Tries"
  | "Conversions"
  | "Penalty Goals"
  | "Field Goals"
  | "Fantasy"
  | "All Runs"
  | "All Run Metres"
  | "Kick Return Metres"
  | "Post Contact Metres"
  | "Line Breaks"
  | "Line Break Assists"
  | "Try Assists"
  | "Tackle Breaks"
  | "Hit Ups"
  | "Average Play The Ball Speed"
  | "Dummy Half Runs"
  | "Dummy Half Run Metres"
  | "One on One Steal"
  | "Offloads"
  | "Dummy Passes"
  | "Passes"
  | "Receipts"
  | "Passes To Run Ratio"
  | "Tackle Efficiency"
  | "Tackles Made"
  | "Missed Tackles"
  | "Ineffective Tackles"
  | "Intercepts"
  | "Kicks Defused"
  | "Kicks"
  | "Kicking Metres"
  | "Forced Drop Outs"
  | "Bomb Kicks"
  | "Grubbers"
  | "40/20"
  | "20/40"
  | "Cross Field Kicks"
  | "Kicked Dead"
  | "Errors"
  | "Handling Errors"
  | "One on One Lost"
  | "Penalties"
  | "Ruck Infringements"
  | "On Report"
  | "Sin Bins"
  | "Send Offs"

type TeamLeaderStatKey =
  | "Points"
  | "Tries"
  | "Conversions"
  | "Penalty Goals"
  | "Field Goals"
  | "All Runs"
  | "All Run Metres"
  | "Kick Return Metres"
  | "Post Contact Metres"
  | "Line Breaks"
  | "Line Break Assists"
  | "Try Assists"
  | "Tackle Breaks"
  | "Offloads"
  | "Dummy Passes"
  | "Passes"
  | "Receipts"
  | "Tackles Made"
  | "Missed Tackles"
  | "Ineffective Tackles"
  | "Intercepts"
  | "Kicks"
  | "Kicking Metres"
  | "Forced Drop Outs"
  | "Bomb Kicks"
  | "Grubbers"
  | "Errors"
  | "Penalties"
  | "Ruck Infringements"
  | "On Report"
  | "Sin Bins"

interface PlayerLeaderStatConfig {
  key: PlayerLeaderStatKey
  label: string
}

interface TeamLeaderStatConfig {
  key: TeamLeaderStatKey
  label: string
}

interface PlayerLeaderCardData extends PlayerLeaderStatConfig {
  leaders: PlayerLeaderEntry[]
}

interface TeamLeaderCardData extends TeamLeaderStatConfig {
  leaders: TeamLeaderEntry[]
}

const PLAYER_RATE_STATS = new Set<PlayerLeaderStatKey>([
  "Average Play The Ball Speed",
  "Passes To Run Ratio",
  "Tackle Efficiency",
])
const ONE_DECIMAL_STATS = new Set<string>([
  "Average Play The Ball Speed",
  "Passes To Run Ratio",
  "Tackle Efficiency",
])
const TACKLE_EFFICIENCY_MIN_TACKLES = 20

const PLAYER_LEADER_STATS: PlayerLeaderStatConfig[] = [
  { key: "Points", label: "Points" },
  { key: "Tries", label: "Tries" },
  { key: "Conversions", label: "Conversions" },
  { key: "Penalty Goals", label: "Penalty Goals" },
  { key: "Field Goals", label: "Field Goals" },
  { key: "Fantasy", label: "Fantasy" },
  { key: "All Runs", label: "All Runs" },
  { key: "All Run Metres", label: "Run Metres" },
  { key: "Kick Return Metres", label: "Kick Return Metres" },
  { key: "Post Contact Metres", label: "Post Contact Metres" },
  { key: "Line Breaks", label: "Line Breaks" },
  { key: "Line Break Assists", label: "Line Break Assists" },
  { key: "Try Assists", label: "Try Assists" },
  { key: "Tackle Breaks", label: "Tackle Breaks" },
  { key: "Hit Ups", label: "Hit Ups" },
  { key: "Average Play The Ball Speed", label: "Average PTB Speed" },
  { key: "Dummy Half Runs", label: "Dummy Half Runs" },
  { key: "Dummy Half Run Metres", label: "Dummy Half Run Metres" },
  { key: "One on One Steal", label: "One on One Steals" },
  { key: "Offloads", label: "Offloads" },
  { key: "Dummy Passes", label: "Dummy Passes" },
  { key: "Passes", label: "Passes" },
  { key: "Receipts", label: "Receipts" },
  { key: "Passes To Run Ratio", label: "Passes To Run Ratio" },
  { key: "Tackle Efficiency", label: "Tackle Efficiency" },
  { key: "Tackles Made", label: "Tackles Made" },
  { key: "Missed Tackles", label: "Missed Tackles" },
  { key: "Ineffective Tackles", label: "Ineffective Tackles" },
  { key: "Intercepts", label: "Intercepts" },
  { key: "Kicks Defused", label: "Kicks Defused" },
  { key: "Kicks", label: "Kicks" },
  { key: "Kicking Metres", label: "Kicking Metres" },
  { key: "Forced Drop Outs", label: "Forced Drop Outs" },
  { key: "Bomb Kicks", label: "Bomb Kicks" },
  { key: "Grubbers", label: "Grubbers" },
  { key: "40/20", label: "40/20s" },
  { key: "20/40", label: "20/40s" },
  { key: "Cross Field Kicks", label: "Cross Field Kicks" },
  { key: "Kicked Dead", label: "Kicked Dead" },
  { key: "Errors", label: "Errors" },
  { key: "Handling Errors", label: "Handling Errors" },
  { key: "One on One Lost", label: "One on One Lost" },
  { key: "Penalties", label: "Penalties" },
  { key: "Ruck Infringements", label: "Ruck Infringements" },
  { key: "On Report", label: "On Report" },
  { key: "Sin Bins", label: "Sin Bins" },
  { key: "Send Offs", label: "Send Offs" },
]

const TEAM_LEADER_STATS: TeamLeaderStatConfig[] = [
  { key: "Points", label: "Points" },
  { key: "Tries", label: "Tries" },
  { key: "Conversions", label: "Conversions" },
  { key: "Penalty Goals", label: "Penalty Goals" },
  { key: "Field Goals", label: "Field Goals" },
  { key: "All Runs", label: "All Runs" },
  { key: "All Run Metres", label: "Run Metres" },
  { key: "Kick Return Metres", label: "Kick Return Metres" },
  { key: "Post Contact Metres", label: "Post Contact Metres" },
  { key: "Line Breaks", label: "Line Breaks" },
  { key: "Line Break Assists", label: "Line Break Assists" },
  { key: "Try Assists", label: "Try Assists" },
  { key: "Tackle Breaks", label: "Tackle Breaks" },
  { key: "Offloads", label: "Offloads" },
  { key: "Dummy Passes", label: "Dummy Passes" },
  { key: "Passes", label: "Passes" },
  { key: "Receipts", label: "Receipts" },
  { key: "Tackles Made", label: "Tackles Made" },
  { key: "Missed Tackles", label: "Missed Tackles" },
  { key: "Ineffective Tackles", label: "Ineffective Tackles" },
  { key: "Intercepts", label: "Intercepts" },
  { key: "Kicks", label: "Kicks" },
  { key: "Kicking Metres", label: "Kicking Metres" },
  { key: "Forced Drop Outs", label: "Forced Drop Outs" },
  { key: "Bomb Kicks", label: "Bomb Kicks" },
  { key: "Grubbers", label: "Grubbers" },
  { key: "Errors", label: "Errors" },
  { key: "Penalties", label: "Penalties" },
  { key: "Ruck Infringements", label: "Ruck Infringements" },
  { key: "On Report", label: "On Report" },
  { key: "Sin Bins", label: "Sin Bins" },
]

function normalisePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function parsePersonName(value: string): { first: string; last: string } {
  const parts = normalisePersonName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return { first: parts[0], last: parts[parts.length - 1] }
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "")
    if (!trimmed || trimmed === "-") return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "")
  if (cleaned.length !== 6) return `rgba(64, 82, 128, ${alpha})`
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normaliseRemoteImageCandidates(value: string | null | undefined): string[] {
  if (!value || typeof value !== "string") return []
  const trimmed = value.trim()
  if (!trimmed) return []

  const out: string[] = []
  const seen = new Set<string>()
  const push = (candidate: string | null | undefined) => {
    if (!candidate) return
    const normalised = candidate.trim()
    if (!normalised || seen.has(normalised)) return
    seen.add(normalised)
    out.push(normalised)
  }

  if (trimmed.startsWith("http://")) {
    push(`https://${trimmed.slice("http://".length)}`)
  }
  if (trimmed.includes("/remote.axd?http://")) {
    push(trimmed.replace("/remote.axd?http://", "/remote.axd?https://"))
  }
  const marker = "/remote.axd?"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length)
    if (nested) {
      push(nested.startsWith("http://") ? `https://${nested.slice("http://".length)}` : nested)
    }
  }
  push(trimmed)
  return out
}

function resolveTeamLogoUrl(teamName: string, teamLogos: Record<string, string>): string | null {
  const key = normaliseTeamKey(teamName)
  if (!key) return null
  if (teamLogos[key]) return teamLogos[key]

  const aliases: Record<string, string[]> = {
    broncos: ["brisbane broncos"],
    bulldogs: ["canterbury bulldogs", "canterbury bankstown bulldogs"],
    raiders: ["canberra raiders"],
    sharks: ["cronulla sharks", "cronulla sutherland sharks"],
    titans: ["gold coast titans"],
    "sea eagles": ["manly sea eagles", "manly warringah sea eagles"],
    storm: ["melbourne storm"],
    knights: ["newcastle knights"],
    cowboys: ["north queensland cowboys"],
    eels: ["parramatta eels"],
    panthers: ["penrith panthers"],
    rabbitohs: ["south sydney rabbitohs"],
    dragons: ["st george illawarra dragons", "st george dragons"],
    roosters: ["sydney roosters", "eastern suburbs roosters"],
    warriors: ["new zealand warriors"],
    tigers: ["wests tigers"],
    dolphins: ["the dolphins", "dolphins"],
  }

  for (const alias of aliases[key] ?? []) {
    if (teamLogos[alias]) return teamLogos[alias]
  }

  return Object.entries(teamLogos).find(([logoKey]) => logoKey.includes(key))?.[1] ?? null
}

function resolveTeamColour(team: string): string {
  if (team in TEAM_COLOURS) return TEAM_COLOURS[team as keyof typeof TEAM_COLOURS]

  const aliases: Record<string, keyof typeof TEAM_COLOURS> = {
    "Brisbane Broncos": "Broncos",
    "Sydney Roosters": "Roosters",
    "South Sydney Rabbitohs": "Rabbitohs",
    "Melbourne Storm": "Storm",
    "Parramatta Eels": "Eels",
    "Canberra Raiders": "Raiders",
    "Newcastle Knights": "Knights",
    "St George Illawarra Dragons": "Dragons",
    "Manly Warringah Sea Eagles": "Sea Eagles",
    "Penrith Panthers": "Panthers",
    "Cronulla Sutherland Sharks": "Sharks",
    "Canterbury Bankstown Bulldogs": "Bulldogs",
    "Gold Coast Titans": "Titans",
    "North Queensland Cowboys": "Cowboys",
    "New Zealand Warriors": "Warriors",
    "Wests Tigers": "Wests Tigers",
  }

  const alias = aliases[team]
  return alias ? TEAM_COLOURS[alias] : "#223052"
}

function buildPlayerImageSources(
  playerName: string,
  teamHint: string,
  rows: PlayerImageRecord[]
): string[] {
  const targetNorm = normalisePersonName(playerName)
  const targetParsed = parsePersonName(playerName)
  const teamNorm = normalisePersonName(teamHint)

  const candidates = rows.filter((row) => {
    const rowName = row.player ?? ""
    if (!rowName) return false
    const rowNorm = normalisePersonName(rowName)
    if (rowNorm === targetNorm) return true
    const parsed = parsePersonName(rowName)
    return (
      parsed.last &&
      parsed.last === targetParsed.last &&
      parsed.first[0] &&
      parsed.first[0] === targetParsed.first[0]
    )
  })

  const sorted = [...candidates].sort((a, b) => {
    const aTeamMatch = a.team ? normalisePersonName(a.team) === teamNorm : false
    const bTeamMatch = b.team ? normalisePersonName(b.team) === teamNorm : false
    if (aTeamMatch !== bTeamMatch) return aTeamMatch ? -1 : 1

    const aHasBody = Boolean(a.body_image)
    const bHasBody = Boolean(b.body_image)
    if (aHasBody !== bHasBody) return aHasBody ? -1 : 1

    const aHasImage = Boolean(a.body_image || a.head_image)
    const bHasImage = Boolean(b.body_image || b.head_image)
    if (aHasImage !== bHasImage) return aHasImage ? -1 : 1

    const aDate = a.last_seen_match_date ?? ""
    const bDate = b.last_seen_match_date ?? ""
    return bDate.localeCompare(aDate)
  })

  const out: string[] = []
  for (const row of sorted) {
    for (const source of [row.body_image, row.head_image]) {
      for (const variant of normaliseRemoteImageCandidates(source)) {
        out.push(variant)
      }
    }
  }
  return out
}

function getPlayerStatValue(row: PlayerStat, statKey: PlayerLeaderStatKey): number | null {
  if (statKey === "Field Goals") {
    const onePoint = toFiniteNumber(row["1 Point Field Goals"]) ?? 0
    const twoPoint = toFiniteNumber(row["2 Point Field Goals"]) ?? 0
    return onePoint + twoPoint
  }

  return toFiniteNumber(row[statKey])
}

function getTeamStatValue(row: TeamStat, statKey: TeamLeaderStatKey): number | null {
  if (statKey === "Field Goals") {
    const onePoint = toFiniteNumber(row["1 Point Field Goals"]) ?? 0
    const twoPoint = toFiniteNumber(row["2 Point Field Goals"]) ?? 0
    return onePoint + twoPoint
  }

  return toFiniteNumber(row[statKey])
}

function formatLeaderValue(stat: string, value: number, mode: LeaderValueMode): string {
  if (!Number.isFinite(value)) return "-"
  if (mode === "average" || ONE_DECIMAL_STATS.has(stat)) return value.toFixed(1)
  return Math.round(value).toLocaleString()
}

function buildPlayerLeaderCards(
  rows: PlayerStat[],
  playerImages: PlayerImageRecord[],
  teamLogos: Record<string, string>,
  valueMode: LeaderValueMode
): PlayerLeaderCardData[] {
  return PLAYER_LEADER_STATS.map((statConfig) => {
    const byPlayer = new Map<string, { team: string; total: number; tackles: number; count: number; latestDate: string }>()

    for (const row of rows) {
      const name = typeof row.Name === "string" ? row.Name.trim() : ""
      if (!name) continue
      const value = getPlayerStatValue(row, statConfig.key)
      if (value == null) continue

      const current = byPlayer.get(name) ?? {
        team: typeof row.Team === "string" ? row.Team : "",
        total: 0,
        tackles: 0,
        count: 0,
        latestDate: "",
      }

      current.total += value
      current.count += 1
      current.tackles += toFiniteNumber(row["Tackles Made"]) ?? 0

      const matchDate = typeof row.match_date === "string" ? row.match_date : ""
      if (matchDate >= current.latestDate) {
        current.latestDate = matchDate
        current.team = typeof row.Team === "string" ? row.Team : current.team
      }

      byPlayer.set(name, current)
    }

    const leaders = [...byPlayer.entries()]
      .map(([name, aggregate]) => {
        if (statConfig.key === "Tackle Efficiency" && aggregate.tackles < TACKLE_EFFICIENCY_MIN_TACKLES) {
          return null
        }

        const value = PLAYER_RATE_STATS.has(statConfig.key)
          ? aggregate.count > 0
            ? aggregate.total / aggregate.count
            : 0
          : valueMode === "average"
            ? aggregate.count > 0
              ? aggregate.total / aggregate.count
              : 0
            : aggregate.total

        return {
          name,
          team: aggregate.team,
          value,
          imageSources: buildPlayerImageSources(name, aggregate.team, playerImages),
          logoUrl: resolveTeamLogoUrl(aggregate.team, teamLogos),
        }
      })
      .filter((entry): entry is PlayerLeaderEntry => entry !== null)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

    return {
      ...statConfig,
      leaders,
    }
  })
}

function buildTeamLeaderCards(
  rows: TeamStat[],
  teamLogos: Record<string, string>,
  valueMode: LeaderValueMode
): TeamLeaderCardData[] {
  return TEAM_LEADER_STATS.map((statConfig) => {
    const byTeam = new Map<string, { total: number; count: number }>()

    for (const row of rows) {
      const team = typeof row.Team === "string" ? row.Team.trim() : ""
      if (!team) continue
      const value = getTeamStatValue(row, statConfig.key)
      if (value == null) continue
      const current = byTeam.get(team) ?? { total: 0, count: 0 }
      current.total += value
      current.count += 1
      byTeam.set(team, current)
    }

    const leaders = [...byTeam.entries()]
      .map(([team, aggregate]) => ({
        team,
        value: valueMode === "average" ? aggregate.total / Math.max(aggregate.count, 1) : aggregate.total,
        logoUrl: resolveTeamLogoUrl(team, teamLogos),
      }))
      .sort((a, b) => b.value - a.value || a.team.localeCompare(b.team))

    return {
      ...statConfig,
      leaders,
    }
  })
}

function viewHref(year: string, view: "players" | "teams") {
  return `/dashboard/leaders?year=${encodeURIComponent(year)}&view=${view}`
}

function LeaderModeToggle({ selectedYear, selectedView }: { selectedYear: string; selectedView: "players" | "teams" }) {
  return (
    <div className="inline-flex rounded-md border border-nrl-border bg-nrl-panel-2 p-1">
      {(["players", "teams"] as const).map((view) => {
        const active = view === selectedView
        return (
          <Link
            key={view}
            href={viewHref(selectedYear, view)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-nrl-accent/15 text-nrl-accent"
                : "text-nrl-muted hover:text-nrl-text"
            }`}
          >
            {view === "players" ? "Players" : "Teams"}
          </Link>
        )
      })}
    </div>
  )
}

function ValueModeToggle({
  valueMode,
  onChange,
}: {
  valueMode: LeaderValueMode
  onChange: (next: LeaderValueMode) => void
}) {
  return (
    <div className="inline-flex rounded-md border border-nrl-border bg-nrl-panel-2 p-1">
      {([
        { key: "total", label: "Total" },
        { key: "average", label: "Average" },
      ] as const).map((option) => {
        const active = option.key === valueMode
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`cursor-pointer rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-nrl-accent/15 text-nrl-accent"
                : "text-nrl-muted hover:text-nrl-text"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function PlayerLeaderCard({ card, valueMode }: { card: PlayerLeaderCardData; valueMode: LeaderValueMode }) {
  const [expanded, setExpanded] = useState(false)
  const visibleCount = expanded ? Math.min(card.leaders.length, 20) : Math.min(card.leaders.length, 5)
  const visibleLeaders = card.leaders.slice(0, visibleCount)
  const leader = visibleLeaders[0] ?? null
  const runnerUps = visibleLeaders.slice(1)
  const teamColour = resolveTeamColour(leader?.team ?? "")
  const canExpand = card.leaders.length > 5

  return (
    <article className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div
        className="relative min-h-[14.5rem] overflow-hidden border-b border-nrl-border bg-nrl-panel-2 sm:min-h-[15.5rem]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${hexToRgba(teamColour, 0.28)} 0%, rgba(114, 66, 214, 0.2) 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_42%)]" />
        {leader?.logoUrl ? (
          <div className="pointer-events-none absolute right-4 top-4 z-10 opacity-[0.95]">
            <ImageWithFallback
              sources={[leader.logoUrl]}
              alt=""
              className="h-12 w-12 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.22)] sm:h-14 sm:w-14"
            />
          </div>
        ) : null}

        <div className="relative flex min-h-[14.5rem] flex-col gap-3 p-4 pb-0 sm:min-h-[15.5rem] sm:flex-row sm:justify-between">
          <div className="flex min-w-0 flex-col justify-between pb-0 sm:max-w-[56%] sm:pb-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/72">{card.label}</div>
              <Link
                href={leader ? `/dashboard/players/${playerSlug(leader.name)}` : "/dashboard/players"}
                className="mt-4 block text-[1.8rem] font-bold leading-tight text-white transition-colors hover:text-nrl-accent sm:mt-6 sm:text-3xl"
              >
                {leader?.name ?? "No leader"}
              </Link>
              <div className="mt-1 text-sm text-white/72">{leader?.team ?? "-"}</div>
            </div>
            <div className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              {leader ? formatLeaderValue(card.key, leader.value, valueMode) : "-"}
            </div>
          </div>

          <div className="relative flex min-h-[9.5rem] items-end justify-end overflow-visible sm:min-w-[7rem] sm:flex-1">
            {leader ? (
              <Link href={`/dashboard/players/${playerSlug(leader.name)}`} className="contents">
                <ImageWithFallback
                  sources={leader.imageSources}
                  alt={leader.name}
                  className="mx-auto max-h-[12.75rem] w-auto self-end object-contain object-bottom drop-shadow-[0_16px_28px_rgba(0,0,0,0.32)] sm:max-h-[16.75rem]"
                />
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="divide-y divide-nrl-border bg-nrl-panel">
        {runnerUps.map((entry) => (
          <div key={`${card.key}-${entry.name}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/dashboard/players/${playerSlug(entry.name)}`}
                className="block truncate text-sm font-medium text-nrl-text transition-colors hover:text-nrl-accent"
              >
                {entry.name}
              </Link>
              <div className="mt-0.5 truncate text-xs text-white/72">{entry.team}</div>
            </div>
            <div className="text-2xl font-bold leading-none text-nrl-text">
              {formatLeaderValue(card.key, entry.value, valueMode)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-nrl-border bg-nrl-panel-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="cursor-pointer text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
            >
              {expanded ? "Show Top 5" : `Show Top ${Math.min(card.leaders.length, 20)}`}
            </button>
          ) : (
            <div />
          )}
          <Link
            href="/dashboard/players"
            className="inline-flex items-center gap-2 text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
          >
            Open Players
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

function TeamLeaderCard({ card, valueMode }: { card: TeamLeaderCardData; valueMode: LeaderValueMode }) {
  const [expanded, setExpanded] = useState(false)
  const visibleCount = expanded ? card.leaders.length : Math.min(card.leaders.length, 5)
  const visibleLeaders = card.leaders.slice(0, visibleCount)
  const leader = visibleLeaders[0] ?? null
  const runnerUps = visibleLeaders.slice(1)
  const teamColour = resolveTeamColour(leader?.team ?? "")
  const canExpand = card.leaders.length > 5

  return (
    <article className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div
        className="relative min-h-[11rem] overflow-hidden border-b border-nrl-border bg-nrl-panel-2"
        style={{
          backgroundImage: `linear-gradient(135deg, ${hexToRgba(teamColour, 0.28)} 0%, rgba(114, 66, 214, 0.18) 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_42%)]" />
        <div className="relative grid min-h-[11rem] grid-cols-[minmax(0,1fr)_minmax(8.5rem,44%)] gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_9.25rem]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/72">{card.label}</div>
            <div className="mt-6 text-3xl font-bold leading-tight text-white">{leader?.team ?? "No leader"}</div>
          </div>

          <div className="flex flex-col items-end justify-between">
            {leader?.logoUrl ? (
              <div className="pointer-events-none opacity-90">
                <ImageWithFallback
                  sources={[leader.logoUrl]}
                  alt={leader.team}
                  className="h-20 w-20 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.2)]"
                />
              </div>
            ) : (
              <div />
            )}

            <div className="w-full overflow-visible text-right text-[clamp(2.5rem,12vw,4rem)] font-black leading-[0.9] tracking-tight text-white">
              {leader ? formatLeaderValue(card.key, leader.value, valueMode) : "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-nrl-border bg-nrl-panel">
        {runnerUps.map((entry) => (
          <div key={`${card.key}-${entry.team}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-nrl-text">{entry.team}</div>
            </div>
            <div className="text-2xl font-bold leading-none text-nrl-text">
              {formatLeaderValue(card.key, entry.value, valueMode)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-nrl-border bg-nrl-panel-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="cursor-pointer text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
            >
              {expanded ? "Show Top 5" : "Show All Teams"}
            </button>
          ) : (
            <div />
          )}
          <Link
            href="/dashboard/teams"
            className="inline-flex items-center gap-2 text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
          >
            Open Teams
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

export function LeadersDashboard({
  selectedYear,
  selectedView,
  availableYears,
  playerRows,
  teamRows,
  playerImages,
  teamLogos,
}: LeadersDashboardProps) {
  const [valueMode, setValueMode] = useState<LeaderValueMode>("total")
  const playerCards = useMemo(
    () => buildPlayerLeaderCards(playerRows, playerImages, teamLogos, valueMode),
    [playerImages, playerRows, teamLogos, valueMode]
  )
  const teamCards = useMemo(
    () => buildTeamLeaderCards(teamRows, teamLogos, valueMode),
    [teamLogos, teamRows, valueMode]
  )
  const cards = selectedView === "players" ? playerCards : teamCards

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
            <LeaderModeToggle selectedYear={selectedYear} selectedView={selectedView} />
          </div>

          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex min-w-max gap-2">
              {availableYears.map((year) => {
                const active = year === selectedYear
                return (
                  <Link
                    key={year}
                    href={viewHref(year, selectedView)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                        : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
                    }`}
                  >
                    {year}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {selectedView === "players"
          ? cards.map((card) => (
              <PlayerLeaderCard key={`player-${card.key}`} card={card as PlayerLeaderCardData} valueMode={valueMode} />
            ))
          : cards.map((card) => (
              <TeamLeaderCard key={`team-${card.key}`} card={card as TeamLeaderCardData} valueMode={valueMode} />
            ))}
      </section>
    </div>
  )
}

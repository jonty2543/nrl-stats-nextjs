import Link from "next/link"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { TEAM_COLOURS } from "@/lib/data/constants"
import type { PlayerStat } from "@/lib/data/types"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

interface LeadersDashboardProps {
  selectedYear: string
  selectedView: "players" | "teams"
  availableYears: string[]
  rows: PlayerStat[]
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
  | "Hit Ups"
  | "Dummy Half Runs"
  | "Dummy Half Run Metres"
  | "One on One Steal"
  | "Offloads"
  | "Dummy Passes"
  | "Passes"
  | "Receipts"
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

const PLAYER_IMAGE_FALLBACK_URL = "/body-shot.png"
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
  { key: "Hit Ups", label: "Hit Ups" },
  { key: "Dummy Half Runs", label: "Dummy Half Runs" },
  { key: "Dummy Half Run Metres", label: "Dummy Half Run Metres" },
  { key: "One on One Steal", label: "One on One Steals" },
  { key: "Offloads", label: "Offloads" },
  { key: "Dummy Passes", label: "Dummy Passes" },
  { key: "Passes", label: "Passes" },
  { key: "Receipts", label: "Receipts" },
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
  out.push(PLAYER_IMAGE_FALLBACK_URL)
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

function getTeamStatValue(row: PlayerStat, statKey: TeamLeaderStatKey): number | null {
  if (statKey === "Field Goals") {
    const onePoint = toFiniteNumber(row["1 Point Field Goals"]) ?? 0
    const twoPoint = toFiniteNumber(row["2 Point Field Goals"]) ?? 0
    return onePoint + twoPoint
  }

  return toFiniteNumber(row[statKey])
}

function formatLeaderValue(stat: string, value: number): string {
  if (!Number.isFinite(value)) return "-"
  if (ONE_DECIMAL_STATS.has(stat)) return value.toFixed(1)
  return Math.round(value).toLocaleString()
}

function buildPlayerLeaderCards(
  rows: PlayerStat[],
  playerImages: PlayerImageRecord[],
  teamLogos: Record<string, string>
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
      .slice(0, 5)

    return {
      ...statConfig,
      leaders,
    }
  })
}

function buildTeamLeaderCards(rows: PlayerStat[], teamLogos: Record<string, string>): TeamLeaderCardData[] {
  return TEAM_LEADER_STATS.map((statConfig) => {
    const byTeam = new Map<string, number>()

    for (const row of rows) {
      const team = typeof row.Team === "string" ? row.Team.trim() : ""
      if (!team) continue
      const value = getTeamStatValue(row, statConfig.key)
      if (value == null) continue
      byTeam.set(team, (byTeam.get(team) ?? 0) + value)
    }

    const leaders = [...byTeam.entries()]
      .map(([team, value]) => ({
        team,
        value,
        logoUrl: resolveTeamLogoUrl(team, teamLogos),
      }))
      .sort((a, b) => b.value - a.value || a.team.localeCompare(b.team))
      .slice(0, 5)

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

function PlayerLeaderCard({ card }: { card: PlayerLeaderCardData }) {
  const leader = card.leaders[0] ?? null
  const runnerUps = card.leaders.slice(1)
  const teamColour = resolveTeamColour(leader?.team ?? "")

  return (
    <article className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div
        className="relative min-h-[12.25rem] overflow-hidden border-b border-nrl-border bg-nrl-panel-2"
        style={{
          backgroundImage: `linear-gradient(135deg, ${hexToRgba(teamColour, 0.28)} 0%, rgba(114, 66, 214, 0.2) 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_42%)]" />
        {leader?.logoUrl ? (
          <div className="pointer-events-none absolute left-3 top-9 opacity-[0.12]">
            <ImageWithFallback
              sources={[leader.logoUrl]}
              alt=""
              className="h-24 w-24 object-contain grayscale"
            />
          </div>
        ) : null}

        <div className="relative flex min-h-[12.25rem] flex-col gap-3 p-4 sm:flex-row sm:justify-between sm:pb-0">
          <div className="flex min-w-0 flex-col justify-between pb-0 sm:max-w-[58%] sm:pb-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/72">{card.label}</div>
              <div className="mt-4 text-[1.8rem] font-bold leading-tight text-white sm:mt-6 sm:text-3xl">
                {leader?.name ?? "No leader"}
              </div>
              <div className="mt-1 text-sm text-white/72">{leader?.team ?? "-"}</div>
            </div>
            <div className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              {leader ? formatLeaderValue(card.key, leader.value) : "-"}
            </div>
          </div>

          <div className="relative flex min-h-[7.5rem] items-end justify-center overflow-hidden sm:min-w-[7rem] sm:flex-1 sm:justify-end">
            {leader ? (
              <ImageWithFallback
                sources={leader.imageSources}
                alt={leader.name}
                className="max-h-[9.5rem] w-auto object-contain object-bottom drop-shadow-[0_16px_28px_rgba(0,0,0,0.32)] sm:max-h-[12.25rem]"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="divide-y divide-nrl-border bg-nrl-panel">
        {runnerUps.map((entry) => (
          <div key={`${card.key}-${entry.name}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-nrl-text">{entry.name}</div>
              <div className="mt-0.5 truncate text-xs text-white/72">{entry.team}</div>
            </div>
            <div className="text-2xl font-bold leading-none text-nrl-text">
              {formatLeaderValue(card.key, entry.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-nrl-border bg-nrl-panel-2 px-4 py-3 text-center">
        <Link
          href="/dashboard/players"
          className="inline-flex items-center gap-2 text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
        >
          Open Players
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

function TeamLeaderCard({ card }: { card: TeamLeaderCardData }) {
  const leader = card.leaders[0] ?? null
  const runnerUps = card.leaders.slice(1)
  const teamColour = resolveTeamColour(leader?.team ?? "")

  return (
    <article className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div
        className="relative min-h-[11rem] overflow-hidden border-b border-nrl-border bg-nrl-panel-2"
        style={{
          backgroundImage: `linear-gradient(135deg, ${hexToRgba(teamColour, 0.28)} 0%, rgba(114, 66, 214, 0.18) 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_42%)]" />
        <div className="relative grid min-h-[11rem] grid-cols-[minmax(0,1fr)_112px] gap-4 p-4">
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

            <div className="w-full text-right text-5xl font-black tracking-tight text-white">
              {leader ? formatLeaderValue(card.key, leader.value) : "-"}
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
              {formatLeaderValue(card.key, entry.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-nrl-border bg-nrl-panel-2 px-4 py-3 text-center">
        <Link
          href="/dashboard/teams"
          className="inline-flex items-center gap-2 text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
        >
          Open Teams
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

export function LeadersDashboard({
  selectedYear,
  selectedView,
  availableYears,
  rows,
  playerImages,
  teamLogos,
}: LeadersDashboardProps) {
  const playerCards = buildPlayerLeaderCards(rows, playerImages, teamLogos)
  const teamCards = buildTeamLeaderCards(rows, teamLogos)
  const cards = selectedView === "players" ? playerCards : teamCards

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">Leaders</div>
            <h1 className="mt-2 text-2xl font-bold text-nrl-text">Season leaders</h1>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <LeaderModeToggle selectedYear={selectedYear} selectedView={selectedView} />
            <div className="flex flex-wrap gap-2">
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
          ? cards.map((card) => <PlayerLeaderCard key={`player-${card.key}`} card={card as PlayerLeaderCardData} />)
          : cards.map((card) => <TeamLeaderCard key={`team-${card.key}`} card={card as TeamLeaderCardData} />)}
      </section>
    </div>
  )
}

"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { playerSlug } from "@/lib/data/player-slug"
import type { PlayerStat, TeamStat } from "@/lib/data/types"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

interface RankingsDashboardProps {
  selectedYear: string
  playerRows: PlayerStat[]
  teamRows: TeamStat[]
  playerImages: PlayerImageRecord[]
  teamLogos: Record<string, string>
}

type ValueMode = "average" | "total"
type RankingView = "players" | "teams"
type SortDirection = "asc" | "desc"

interface StatOption {
  key: string
  label: string
}

interface RankingEntry {
  name: string
  team: string
  games: number
  value: number
  statValue: number
  perStatValue: number | null
  imageSources: string[]
}

const POSITION_ORDER = ["Fullback", "Winger", "Centre", "Half", "Edge", "Middle", "Hooker"]
const POSITION_FILTERS = ["All Positions", ...POSITION_ORDER]

const STAT_OPTIONS: StatOption[] = [
  { key: "Mins Played", label: "Minutes" },
  { key: "Points", label: "Points" },
  { key: "Tries", label: "Tries" },
  { key: "Conversions", label: "Conversions" },
  { key: "Conversion Attempts", label: "Conversion Attempts" },
  { key: "Penalty Goals", label: "Penalty Goals" },
  { key: "1 Point Field Goals", label: "1 Point Field Goals" },
  { key: "2 Point Field Goals", label: "2 Point Field Goals" },
  { key: "Fantasy", label: "Fantasy" },
  { key: "All Run Metres", label: "Run Metres" },
  { key: "All Runs", label: "Runs" },
  { key: "Post Contact Metres", label: "Post Contact Metres" },
  { key: "Kick Return Metres", label: "Kick Return Metres" },
  { key: "Line Breaks", label: "Line Breaks" },
  { key: "Line Break Assists", label: "Line Break Assists" },
  { key: "Try Assists", label: "Try Assists" },
  { key: "Tackle Breaks", label: "Tackle Breaks" },
  { key: "Hit Ups", label: "Hit Ups" },
  { key: "Play The Ball", label: "Play The Ball" },
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
  { key: "Inside 10 Metres", label: "Inside 10 Metres" },
  { key: "On Report", label: "On Report" },
  { key: "Sin Bins", label: "Sin Bins" },
  { key: "Send Offs", label: "Send Offs" },
]

const TEAM_STAT_OPTIONS = STAT_OPTIONS.filter(
  (option) => !["Mins Played", "Fantasy", "Average Play The Ball Speed", "Passes To Run Ratio", "Tackle Efficiency"].includes(option.key)
)

function normalisePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parsePersonName(value: string): { first: string; last: string } {
  const parts = normalisePersonName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return { first: parts[0], last: parts[parts.length - 1] }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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
    push(nested.startsWith("http://") ? `https://${nested.slice("http://".length)}` : nested)
  }
  push(trimmed)
  return out
}

function buildPlayerImageSources(playerName: string, teamHint: string, rows: PlayerImageRecord[]): string[] {
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

    const aHasBody = Boolean(a.cached_body_image || a.body_image)
    const bHasBody = Boolean(b.cached_body_image || b.body_image)
    if (aHasBody !== bHasBody) return aHasBody ? -1 : 1

    return (b.last_seen_match_date ?? "").localeCompare(a.last_seen_match_date ?? "")
  })

  return sorted.flatMap((row) =>
    [row.cached_body_image, row.cached_head_image, row.body_image, row.head_image].flatMap((source) =>
      normaliseRemoteImageCandidates(source)
    )
  )
}

function buildTeamLogoSources(teamName: string, teamLogos: Record<string, string>): string[] {
  const key = normaliseTeamKey(teamName)
  if (!key) return []
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

  return [
    teamLogos[teamName],
    teamLogos[key],
    ...((aliases[key] ?? []).map((alias) => teamLogos[alias])),
    Object.entries(teamLogos).find(([logoKey]) => normaliseTeamKey(logoKey).includes(key))?.[1],
  ].filter((source): source is string => Boolean(source))
}

function statLabel(key: string, options = STAT_OPTIONS): string {
  return options.find((option) => option.key === key)?.label ?? key
}

function statInitials(key: string, options = STAT_OPTIONS): string {
  const label = statLabel(key, options)
  const special: Record<string, string> = {
    "1 Point Field Goals": "1FG",
    "2 Point Field Goals": "2FG",
    "40/20s": "40/20",
    "20/40s": "20/40",
  }
  if (special[label]) return special[label]
  return label
    .replace(/\bAll\b/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

function getStatValue(row: PlayerStat | TeamStat, key: string): number | null {
  return toFiniteNumber(row[key])
}

function formatRankingValue(value: number, isRatio: boolean): string {
  if (!Number.isFinite(value)) return "-"
  if (isRatio) return value.toFixed(2)
  if (Math.abs(value) < 10) return value.toFixed(1)
  return Math.round(value).toLocaleString()
}

function formatCountValue(value: number): string {
  if (!Number.isFinite(value)) return "-"
  return Math.round(value).toLocaleString()
}

function compareRankingEntries(direction: SortDirection) {
  return (a: RankingEntry, b: RankingEntry) => {
    const valueCompare = direction === "desc" ? b.value - a.value : a.value - b.value
    return valueCompare || a.name.localeCompare(b.name)
  }
}

function positionGroup(value: string): string {
  const key = value.trim().toUpperCase()
  if (["FB", "FULLBACK"].includes(key)) return "Fullback"
  if (["WG", "W", "WING", "WINGER"].includes(key)) return "Winger"
  if (["WFB"].includes(key)) return "Winger"
  if (["CE", "C", "CTR", "CENTRE", "CENTER"].includes(key)) return "Centre"
  if (["FE", "FIVE-EIGHTH", "FIVE EIGHTH", "HB", "HLF", "HALFBACK", "HALF"].includes(key)) return "Half"
  if (["SR", "2RF", "EDG", "SECOND ROW", "SECOND-ROW", "EDGE"].includes(key)) return "Edge"
  if (["PR", "PROP", "LK", "LOCK", "MID", "MIDDLE"].includes(key)) return "Middle"
  if (["HK", "HOK", "HOOKER"].includes(key)) return "Hooker"
  return ""
}

function buildPlayerRankings(
  rows: PlayerStat[],
  images: PlayerImageRecord[],
  mode: ValueMode,
  statKey: string,
  perStatKey: string,
  minGames: number,
  minMinutes: number,
  positionFilter: string,
  sortDirection: SortDirection
): RankingEntry[] {
  const byPlayer = new Map<string, { team: string; games: number; total: number; perTotal: number; latestRound: number }>()

  for (const row of rows) {
    const name = typeof row.Name === "string" ? row.Name.trim() : ""
    if (!name) continue
    const rawPosition = typeof row.Position === "string" ? row.Position.trim() : ""
    const position = rawPosition ? positionGroup(rawPosition) : ""
    if (positionFilter !== "All Positions" && position !== positionFilter) continue
    if ((toFiniteNumber(row["Mins Played"]) ?? 0) < minMinutes) continue

    const value = getStatValue(row, statKey)
    if (value == null) continue
    const perValue = perStatKey ? getStatValue(row, perStatKey) : null
    const current = byPlayer.get(name) ?? {
      team: typeof row.Team === "string" ? row.Team : "",
      games: 0,
      total: 0,
      perTotal: 0,
      latestRound: 0,
    }

    current.games += 1
    current.total += value
    current.perTotal += perValue ?? 0

    const round = toFiniteNumber(row.Round) ?? 0
    if (round >= current.latestRound) {
      current.latestRound = round
      current.team = typeof row.Team === "string" ? row.Team : current.team
    }

    byPlayer.set(name, current)
  }

  return [...byPlayer.entries()]
    .map(([name, aggregate]) => {
      if (aggregate.games < minGames) return null
      if (perStatKey && aggregate.perTotal <= 0) return null

      const value = perStatKey
        ? aggregate.total / aggregate.perTotal
        : mode === "average"
          ? aggregate.total / aggregate.games
          : aggregate.total

      return {
        name,
        team: aggregate.team,
        games: aggregate.games,
        value,
        statValue: aggregate.total,
        perStatValue: perStatKey ? aggregate.perTotal : null,
        imageSources: buildPlayerImageSources(name, aggregate.team, images),
      }
    })
    .filter((entry): entry is RankingEntry => entry !== null)
    .sort(compareRankingEntries(sortDirection))
}

function buildTeamRankings(
  rows: TeamStat[],
  teamLogos: Record<string, string>,
  mode: ValueMode,
  statKey: string,
  perStatKey: string,
  minGames: number,
  sortDirection: SortDirection
): RankingEntry[] {
  const byTeam = new Map<string, { games: number; total: number; perTotal: number }>()

  for (const row of rows) {
    const team = typeof row.Team === "string" ? row.Team.trim() : ""
    if (!team) continue

    const value = getStatValue(row, statKey)
    if (value == null) continue
    const perValue = perStatKey ? getStatValue(row, perStatKey) : null
    const current = byTeam.get(team) ?? { games: 0, total: 0, perTotal: 0 }

    current.games += 1
    current.total += value
    current.perTotal += perValue ?? 0
    byTeam.set(team, current)
  }

  return [...byTeam.entries()]
    .map(([name, aggregate]) => {
      if (aggregate.games < minGames) return null
      if (perStatKey && aggregate.perTotal <= 0) return null

      const value = perStatKey
        ? aggregate.total / aggregate.perTotal
        : mode === "average"
          ? aggregate.total / aggregate.games
          : aggregate.total

      return {
        name,
        team: "",
        games: aggregate.games,
        value,
        statValue: aggregate.total,
        perStatValue: perStatKey ? aggregate.perTotal : null,
        imageSources: buildTeamLogoSources(name, teamLogos),
      }
    })
    .filter((entry): entry is RankingEntry => entry !== null)
    .sort(compareRankingEntries(sortDirection))
}

export function RankingsDashboard({ selectedYear, playerRows, teamRows, playerImages, teamLogos }: RankingsDashboardProps) {
  const [view, setView] = useState<RankingView>("players")
  const [mode, setMode] = useState<ValueMode>("average")
  const [statKey, setStatKey] = useState("All Run Metres")
  const [perStatKey, setPerStatKey] = useState("All Runs")
  const [minGames, setMinGames] = useState(5)
  const [minMinutes, setMinMinutes] = useState(40)
  const [positionFilter, setPositionFilter] = useState("All Positions")
  const [valueSortDirection, setValueSortDirection] = useState<SortDirection>("desc")
  const activeStatOptions = view === "teams" ? TEAM_STAT_OPTIONS : STAT_OPTIONS
  const effectiveStatKey = activeStatOptions.some((option) => option.key === statKey) ? statKey : "All Run Metres"
  const effectivePerStatKey = perStatKey && activeStatOptions.some((option) => option.key === perStatKey) ? perStatKey : ""

  const playerRankings = useMemo(
    () => buildPlayerRankings(playerRows, playerImages, mode, effectiveStatKey, effectivePerStatKey, minGames, minMinutes, positionFilter, valueSortDirection),
    [playerRows, playerImages, mode, effectiveStatKey, effectivePerStatKey, minGames, minMinutes, positionFilter, valueSortDirection]
  )
  const teamRankings = useMemo(
    () => buildTeamRankings(teamRows, teamLogos, mode, effectiveStatKey, effectivePerStatKey, minGames, valueSortDirection),
    [teamRows, teamLogos, mode, effectiveStatKey, effectivePerStatKey, minGames, valueSortDirection]
  )
  const valueHeading = effectivePerStatKey
    ? `${statInitials(effectiveStatKey, activeStatOptions)} / ${statInitials(effectivePerStatKey, activeStatOptions)}`
    : statInitials(effectiveStatKey, activeStatOptions)
  const toggleValueSortDirection = () => {
    setValueSortDirection((current) => current === "desc" ? "asc" : "desc")
  }
  const hasEntries =
    view === "teams"
      ? teamRankings.length > 0
      : playerRankings.length > 0

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-nrl-border bg-nrl-panel p-3">
        <div>
          <h1 className="text-sm font-black text-nrl-text">Rankings</h1>
          <p className="mt-1 text-[10px] font-semibold text-nrl-muted">{selectedYear || "Latest"} season</p>
        </div>

        <div className="mt-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-max grid-cols-[180px_180px_100px_112px] items-end gap-2 sm:grid-cols-[220px_220px_112px_120px]">
            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">
                Stat
              </span>
              <select
                value={effectiveStatKey}
                onChange={(event) => setStatKey(event.target.value)}
                className="h-10 w-full rounded border border-[#323a5c] bg-[#111733] px-3 text-xs font-bold text-white outline-none transition-colors hover:border-[#465077]"
              >
                {activeStatOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">
                Per Stat
              </span>
              <select
                value={effectivePerStatKey}
                onChange={(event) => setPerStatKey(event.target.value)}
                className="h-10 w-full rounded border border-[#323a5c] bg-[#111733] px-3 text-xs font-bold text-white outline-none transition-colors hover:border-[#465077]"
              >
                {[{ key: "", label: "None" }, ...activeStatOptions].map((option) => (
                  <option key={option.key || "none"} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">
                Min Games
              </span>
              <input
                type="number"
                min={1}
                max={30}
                value={minGames}
                onChange={(event) => setMinGames(Math.max(1, Number(event.target.value) || 1))}
                className="h-10 w-full rounded border border-[#323a5c] bg-[#111733] px-3 text-xs font-bold text-white outline-none transition-colors hover:border-[#465077]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">
                Min Minutes
              </span>
              <input
                type="number"
                min={0}
                max={80}
                value={minMinutes}
                onChange={(event) => setMinMinutes(Math.max(0, Number(event.target.value) || 0))}
                className="h-10 w-full rounded border border-[#323a5c] bg-[#111733] px-3 text-xs font-bold text-white outline-none transition-colors hover:border-[#465077]"
              />
            </label>
          </div>
        </div>

        <div className="mt-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-2">
            <div className="flex rounded border border-[#323a5c] bg-[#111733] p-1">
              {(["average", "total"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded px-3 py-2 text-xs font-extrabold capitalize leading-none transition-colors ${
                    mode === option ? "bg-[#10f08b] text-[#06121f]" : "text-white/70 hover:text-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex rounded border border-[#323a5c] bg-[#111733] p-1">
              {(["players", "teams"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`rounded px-3 py-2 text-xs font-extrabold capitalize leading-none transition-colors ${
                    view === option ? "bg-[#10f08b] text-[#06121f]" : "text-white/70 hover:text-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="sr-only">Position</span>
              <select
                value={positionFilter}
                onChange={(event) => {
                  setView("players")
                  setPositionFilter(event.target.value)
                }}
                className="h-10 w-36 rounded border border-[#323a5c] bg-[#111733] px-3 text-xs font-bold text-white outline-none transition-colors hover:border-[#465077]"
              >
                {POSITION_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {!hasEntries ? (
        <div className="rounded-lg border border-nrl-border bg-nrl-panel p-6 text-center text-xs font-bold text-nrl-muted">
          No {view} match the current ranking filters.
        </div>
      ) : null}

      {!hasEntries ? null : view === "teams" ? (
        <section className="rounded-lg border border-nrl-border bg-nrl-panel">
          <div className="flex items-center justify-between gap-3 border-b border-nrl-border px-4 py-3">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-nrl-accent">Teams</h2>
            <div className="text-[10px] font-bold text-nrl-muted">{teamRankings.length} teams</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#111733]">
                <tr className="border-b border-nrl-border text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">
                  <th className="w-12 px-4 py-2">#</th>
                  <th className="px-2 py-2">Team</th>
                  <th className="w-16 px-2 py-2 text-right">Games</th>
                  <th className="w-20 px-2 py-2 text-right">{statInitials(effectiveStatKey, activeStatOptions)}</th>
                  {effectivePerStatKey ? (
                    <th className="w-20 px-2 py-2 text-right">{statInitials(effectivePerStatKey, activeStatOptions)}</th>
                  ) : null}
                  <th className="w-28 px-4 py-2 text-right" aria-sort={valueSortDirection === "desc" ? "descending" : "ascending"}>
                    <button
                      type="button"
                      onClick={toggleValueSortDirection}
                      className="ml-auto flex flex-col items-end gap-0.5 text-right font-black uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:text-white"
                    >
                      <span>{valueHeading}</span>
                      <span className="text-[8px]">{valueSortDirection}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamRankings.map((entry, index) => (
                  <tr key={entry.name} className="border-b border-nrl-border/70 last:border-b-0">
                    <td className="px-4 py-2 text-xs font-black text-nrl-muted">{index + 1}</td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded border border-nrl-border bg-nrl-panel-2 p-1">
                          <ImageWithFallback
                            sources={entry.imageSources}
                            alt={entry.name}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="truncate text-xs font-black text-nrl-text">{entry.name}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-nrl-muted">{entry.games}</td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-nrl-muted">
                      {formatCountValue(entry.statValue)}
                    </td>
                    {effectivePerStatKey ? (
                      <td className="px-2 py-2 text-right text-xs font-bold text-nrl-muted">
                        {formatCountValue(entry.perStatValue ?? 0)}
                      </td>
                    ) : null}
                    <td className="px-4 py-2 text-right text-sm font-black text-nrl-text">
                      {formatRankingValue(entry.value, Boolean(effectivePerStatKey))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-nrl-border bg-nrl-panel">
          <div className="flex items-center justify-between gap-3 border-b border-nrl-border px-4 py-3">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-nrl-accent">
              {positionFilter === "All Positions" ? "Players" : positionFilter}
            </h2>
            <div className="text-[10px] font-bold text-nrl-muted">{playerRankings.length} players</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#111733]">
                <tr className="border-b border-nrl-border text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">
                  <th className="w-12 px-4 py-2">#</th>
                  <th className="px-2 py-2">Player</th>
                  <th className="w-16 px-2 py-2 text-right">Games</th>
                  <th className="w-20 px-2 py-2 text-right">{statInitials(effectiveStatKey, activeStatOptions)}</th>
                  {effectivePerStatKey ? (
                    <th className="w-20 px-2 py-2 text-right">{statInitials(effectivePerStatKey, activeStatOptions)}</th>
                  ) : null}
                  <th className="w-28 px-4 py-2 text-right" aria-sort={valueSortDirection === "desc" ? "descending" : "ascending"}>
                    <button
                      type="button"
                      onClick={toggleValueSortDirection}
                      className="ml-auto flex flex-col items-end gap-0.5 text-right font-black uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:text-white"
                    >
                      <span>{valueHeading}</span>
                      <span className="text-[8px]">{valueSortDirection}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {playerRankings.map((entry, index) => (
                  <tr key={entry.name} className="border-b border-nrl-border/70 last:border-b-0">
                    <td className="px-4 py-2 text-xs font-black text-nrl-muted">{index + 1}</td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded border border-nrl-border bg-nrl-panel-2">
                          <ImageWithFallback
                            sources={entry.imageSources}
                            alt={entry.name}
                            className="h-full w-full object-cover object-top"
                          />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/players/${playerSlug(entry.name)}`}
                            className="block truncate text-xs font-black text-nrl-text transition-colors hover:text-nrl-accent"
                          >
                            {entry.name}
                          </Link>
                          <div className="mt-0.5 truncate text-[10px] font-semibold text-nrl-muted">
                            {entry.team || "-"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-nrl-muted">{entry.games}</td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-nrl-muted">
                      {formatCountValue(entry.statValue)}
                    </td>
                    {effectivePerStatKey ? (
                      <td className="px-2 py-2 text-right text-xs font-bold text-nrl-muted">
                        {formatCountValue(entry.perStatValue ?? 0)}
                      </td>
                    ) : null}
                    <td className="px-4 py-2 text-right text-sm font-black text-nrl-text">
                      {formatRankingValue(entry.value, Boolean(effectivePerStatKey))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

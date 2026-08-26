"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { CompetitionToggle } from "@/components/ui/competition-toggle"
import { PillRadio } from "@/components/ui/pill-radio"
import { PlayerImageWithFallback } from "@/components/ui/player-image-with-fallback"
import { Select } from "@/components/ui/select"
import { playerSlug } from "@/lib/data/player-slug"
import type { PlayerStat, TeamStat } from "@/lib/data/types"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

interface RankingsDashboardProps {
  selectedYear: string
  playerRows: PlayerStat[]
  teamRows: TeamStat[]
  playerImages: PlayerImageRecord[]
  teamLogos: Record<string, string>
  availableYears: string[]
  cupAvailableYears: string[]
  canAccessCup: boolean
}

interface CompetitionRows {
  playerRows?: PlayerStat[]
  teamRows?: TeamStat[]
}

type ValueMode = "average" | "total"
type RankingView = "players" | "teams"
type RankingSection = "rankings" | "form"
type FormWindow = 3 | 5
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
  seasonValue: number
  priorValue: number | null
  recentValue: number | null
  imageSources: string[]
}

interface RankingGame {
  round: number
  value: number
  perValue: number | null
}

interface RankingDiscoveryOption {
  id: string
  sentence: string
  category: string
  view: RankingView
  section: RankingSection
  statKey: string
  perStatKey: string
  position: string
  formWindow: FormWindow
  mode: ValueMode
}

const POSITION_ORDER = ["Fullback", "Winger", "Centre", "Half", "Edge", "Middle", "Hooker"]
const POSITION_FILTERS = ["All Positions", ...POSITION_ORDER]

const RANKING_EXCLUDED_STAT_KEYS = new Set([
  "Average Play The Ball Speed",
  "Passes To Run Ratio",
  "Tackle Efficiency",
])

const RAW_STAT_OPTIONS: StatOption[] = [
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

const STAT_OPTIONS = RAW_STAT_OPTIONS.filter((option) => !RANKING_EXCLUDED_STAT_KEYS.has(option.key))

const TEAM_STAT_OPTIONS = STAT_OPTIONS.filter(
  (option) => !["Mins Played", "Fantasy"].includes(option.key)
)

const RANKING_SEARCH_STOP_WORDS = new Set(["a", "an", "and", "are", "by", "for", "has", "have", "i", "in", "is", "me", "of", "rank", "ranking", "rankings", "show", "the", "to", "want", "which", "who"])

function normaliseRankingSearch(value: string): string {
  return value.toLowerCase().replace(/meters/g, "metres").replace(/[^a-z0-9]+/g, " ").trim()
}

function rankingSearchTokens(value: string): string[] {
  return normaliseRankingSearch(value).split(/\s+/).filter((token) => token && !RANKING_SEARCH_STOP_WORDS.has(token))
}

function statSearchAliases(option: StatOption): string[] {
  const aliases = [option.key, option.label]
  if (option.key === "All Run Metres") aliases.push("run metre", "run metres", "running metres")
  if (option.key === "All Runs") aliases.push("run", "runs", "carry", "carries")
  if (option.key === "Post Contact Metres") aliases.push("post contact metres", "post-contact metres", "pcm")
  if (option.key === "Mins Played") aliases.push("minute", "minutes", "mins")
  if (option.key === "Fantasy") aliases.push("fantasy points", "fantasy score")
  if (option.key === "Tackles Made") aliases.push("tackle", "tackles")
  return aliases.map(normaliseRankingSearch)
}

function findRankingStat(query: string, options: StatOption[]): string | null {
  const normalized = ` ${normaliseRankingSearch(query)} `
  let match: { key: string; length: number } | null = null
  for (const option of options) {
    for (const alias of statSearchAliases(option)) {
      if (normalized.includes(` ${alias} `) && (!match || alias.length > match.length)) {
        match = { key: option.key, length: alias.length }
      }
    }
  }
  return match?.key ?? null
}

function findRankingPosition(query: string): string {
  const normalized = ` ${normaliseRankingSearch(query)} `
  const aliases: Array<{ position: string; values: string[] }> = [
    { position: "Fullback", values: ["fullback", "fullbacks"] },
    { position: "Winger", values: ["wing", "winger", "wingers"] },
    { position: "Centre", values: ["centre", "centres", "center", "centers"] },
    { position: "Half", values: ["half", "halves", "halfback", "five eighth"] },
    { position: "Edge", values: ["edge", "edges", "second row"] },
    { position: "Middle", values: ["middle", "middles", "prop", "props", "lock"] },
    { position: "Hooker", values: ["hooker", "hookers", "dummy half"] },
  ]
  return aliases.find(({ values }) => values.some((value) => normalized.includes(` ${value} `)))?.position ?? "All Positions"
}

function perStatUnitLabel(key: string, options: StatOption[]): string {
  const special: Record<string, string> = {
    "All Runs": "run",
    Passes: "pass",
    Receipts: "receipt",
    "Mins Played": "minute",
    Kicks: "kick",
    "Play The Ball": "play the ball",
  }
  return special[key] ?? statLabel(key, options).toLowerCase()
}

function rankingSuggestionSentence(option: Omit<RankingDiscoveryOption, "id" | "sentence" | "category">): string {
  const options = option.view === "teams" ? TEAM_STAT_OPTIONS : STAT_OPTIONS
  const primary = statLabel(option.statKey, options)
  const per = option.perStatKey ? ` per ${perStatUnitLabel(option.perStatKey, options)}` : ""
  const subject = option.view === "teams" ? "teams" : option.position === "All Positions" ? "players" : `${option.position.toLowerCase()}s`
  if (option.section === "form") return `Which ${subject} improved their L${option.formWindow} ${primary.toLowerCase()}${per} most?`
  return `Rank ${subject} by ${option.mode === "total" && !option.perStatKey ? "total " : ""}${primary.toLowerCase()}${per}.`
}

function buildRankingSuggestions(query: string): RankingDiscoveryOption[] {
  const normalized = normaliseRankingSearch(query)
  if (!normalized) return []
  const view: RankingView = /\bteam|teams\b/.test(normalized) ? "teams" : "players"
  const section: RankingSection = /\bform|recent|improv|increase|l3|l5\b/.test(normalized) ? "form" : "rankings"
  const formWindow: FormWindow = /\bl5\b|last 5|last five/.test(normalized) ? 5 : 3
  const mode: ValueMode = /\btotal|totals\b/.test(normalized) ? "total" : "average"
  const position = view === "players" ? findRankingPosition(query) : "All Positions"
  const options = view === "teams" ? TEAM_STAT_OPTIONS : STAT_OPTIONS
  const perParts = normalized.split(/\bper\b/)
  const explicitPrimary = findRankingStat(perParts[0] ?? normalized, options)
  const explicitPer = perParts.length > 1 ? findRankingStat(perParts.slice(1).join(" "), options) : null
  const queryTokens = rankingSearchTokens(query)
  const candidates = explicitPrimary
    ? [explicitPrimary]
    : options
        .map((option) => ({
          key: option.key,
          score: rankingSearchTokens(`${option.key} ${option.label}`).filter((token) => queryTokens.some((queryToken) => token.startsWith(queryToken) || queryToken.startsWith(token))).length,
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ key }) => key)

  const primaryKeys = candidates.length > 0 ? candidates : ["All Run Metres", "Fantasy", "Try Assists"]
  return primaryKeys.map((primaryKey) => {
    const base = { view, section, statKey: primaryKey, perStatKey: explicitPer ?? "", position, formWindow, mode }
    return {
      ...base,
      id: `${view}-${section}-${primaryKey}-${explicitPer ?? "none"}-${position}-${formWindow}`,
      sentence: rankingSuggestionSentence(base),
      category: `${view === "teams" ? "Teams" : "Players"} · ${section === "form" ? "Form" : "Rankings"}`,
    }
  })
}

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

function initialisedPlayerName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return value.trim()
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(" ")}`
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
    [row.cached_head_image, row.head_image, row.cached_body_image, row.body_image].flatMap((source) =>
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

function formatFormChange(value: number, isRatio: boolean): string {
  const formatted = formatRankingValue(Math.abs(value), isRatio)
  if (formatted === "-") return formatted
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}`
}

const LOWER_IS_BETTER_RANKING_STATS = new Set([
  "Errors",
  "Handling Errors",
  "Missed Tackles",
  "Ineffective Tackles",
  "One on One Lost",
  "Penalties",
  "Ruck Infringements",
  "Inside 10 Metres",
  "Kicked Dead",
  "On Report",
  "Sin Bins",
  "Send Offs",
])

function formChangeClass(value: number, statKey: string): string {
  const improvement = LOWER_IS_BETTER_RANKING_STATS.has(statKey) ? -value : value
  if (improvement > 0) return "text-nrl-accent"
  if (improvement < 0) return "text-rose-300"
  return "text-nrl-muted"
}

function FiltersButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="ranking-filters"
      aria-label={open ? "Hide filters" : "Show filters"}
      title={open ? "Hide filters" : "Show filters"}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border transition-colors ${open ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent" : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:text-nrl-text"}`}
    >
      <span aria-hidden="true" className="flex w-3.5 flex-col gap-[3px]">
        <span className="h-px w-full rounded-full bg-current" />
        <span className="h-px w-full rounded-full bg-current" />
        <span className="h-px w-full rounded-full bg-current" />
      </span>
    </button>
  )
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
  if (["SR", "2RF", "EDG", "2ND ROW", "2ND-ROW", "SECOND ROW", "SECOND-ROW", "EDGE"].includes(key)) return "Edge"
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
  sortDirection: SortDirection,
  formWindow: FormWindow | null,
  minPriorGames: number
): RankingEntry[] {
  const byPlayer = new Map<string, { team: string; games: RankingGame[]; total: number; perTotal: number; latestRound: number }>()

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
      games: [],
      total: 0,
      perTotal: 0,
      latestRound: 0,
    }

    current.games.push({ round: toFiniteNumber(row.Round) ?? 0, value, perValue })
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
      if (aggregate.games.length < minGames || (formWindow && aggregate.games.length < formWindow + minPriorGames)) return null
      if (perStatKey && aggregate.perTotal <= 0) return null

      const seasonValue = perStatKey
        ? aggregate.total / aggregate.perTotal
        : mode === "average"
          ? aggregate.total / aggregate.games.length
          : aggregate.total
      const orderedGames = formWindow ? [...aggregate.games].sort((a, b) => b.round - a.round) : []
      const recentGames = formWindow ? orderedGames.slice(0, formWindow) : []
      const priorGames = formWindow ? orderedGames.slice(formWindow) : []
      const recentStatTotal = recentGames.reduce((sum, game) => sum + game.value, 0)
      const recentPerTotal = recentGames.reduce((sum, game) => sum + (game.perValue ?? 0), 0)
      const priorStatTotal = priorGames.reduce((sum, game) => sum + game.value, 0)
      const priorPerTotal = priorGames.reduce((sum, game) => sum + (game.perValue ?? 0), 0)
      if (formWindow && perStatKey && (recentPerTotal <= 0 || priorPerTotal <= 0)) return null
      const recentValue = formWindow
        ? perStatKey
          ? recentStatTotal / recentPerTotal
          : recentStatTotal / recentGames.length
        : null
      const priorValue = formWindow
        ? perStatKey
          ? priorStatTotal / priorPerTotal
          : priorStatTotal / priorGames.length
        : null
      const value = recentValue == null || priorValue == null ? seasonValue : recentValue - priorValue

      return {
        name,
        team: aggregate.team,
        games: aggregate.games.length,
        value,
        statValue: aggregate.total,
        perStatValue: perStatKey ? aggregate.perTotal : null,
        seasonValue,
        priorValue,
        recentValue,
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
  sortDirection: SortDirection,
  formWindow: FormWindow | null,
  minPriorGames: number
): RankingEntry[] {
  const byTeam = new Map<string, { games: RankingGame[]; total: number; perTotal: number }>()

  for (const row of rows) {
    const team = typeof row.Team === "string" ? row.Team.trim() : ""
    if (!team) continue

    const value = getStatValue(row, statKey)
    if (value == null) continue
    const perValue = perStatKey ? getStatValue(row, perStatKey) : null
    const current = byTeam.get(team) ?? { games: [], total: 0, perTotal: 0 }

    current.games.push({ round: toFiniteNumber(row.Round) ?? 0, value, perValue })
    current.total += value
    current.perTotal += perValue ?? 0
    byTeam.set(team, current)
  }

  return [...byTeam.entries()]
    .map(([name, aggregate]) => {
      if (aggregate.games.length < minGames || (formWindow && aggregate.games.length < formWindow + minPriorGames)) return null
      if (perStatKey && aggregate.perTotal <= 0) return null

      const seasonValue = perStatKey
        ? aggregate.total / aggregate.perTotal
        : mode === "average"
          ? aggregate.total / aggregate.games.length
          : aggregate.total
      const orderedGames = formWindow ? [...aggregate.games].sort((a, b) => b.round - a.round) : []
      const recentGames = formWindow ? orderedGames.slice(0, formWindow) : []
      const priorGames = formWindow ? orderedGames.slice(formWindow) : []
      const recentStatTotal = recentGames.reduce((sum, game) => sum + game.value, 0)
      const recentPerTotal = recentGames.reduce((sum, game) => sum + (game.perValue ?? 0), 0)
      const priorStatTotal = priorGames.reduce((sum, game) => sum + game.value, 0)
      const priorPerTotal = priorGames.reduce((sum, game) => sum + (game.perValue ?? 0), 0)
      if (formWindow && perStatKey && (recentPerTotal <= 0 || priorPerTotal <= 0)) return null
      const recentValue = formWindow
        ? perStatKey
          ? recentStatTotal / recentPerTotal
          : recentStatTotal / recentGames.length
        : null
      const priorValue = formWindow
        ? perStatKey
          ? priorStatTotal / priorPerTotal
          : priorStatTotal / priorGames.length
        : null
      const value = recentValue == null || priorValue == null ? seasonValue : recentValue - priorValue

      return {
        name,
        team: "",
        games: aggregate.games.length,
        value,
        statValue: aggregate.total,
        perStatValue: perStatKey ? aggregate.perTotal : null,
        seasonValue,
        priorValue,
        recentValue,
        imageSources: buildTeamLogoSources(name, teamLogos),
      }
    })
    .filter((entry): entry is RankingEntry => entry !== null)
    .sort(compareRankingEntries(sortDirection))
}

export function RankingsDashboard({ selectedYear, playerRows, teamRows, playerImages, teamLogos, availableYears, cupAvailableYears, canAccessCup }: RankingsDashboardProps) {
  const [competition, setCompetition] = useState<"nrl" | "cup">("nrl")
  const [activeYear, setActiveYear] = useState(selectedYear)
  const [activePlayerRows, setActivePlayerRows] = useState<PlayerStat[]>(playerRows)
  const [activeTeamRows, setActiveTeamRows] = useState<TeamStat[]>(teamRows)
  const [competitionLoading, setCompetitionLoading] = useState(false)
  const competitionRowsRef = useRef(new Map<string, CompetitionRows>([
    [`nrl:${selectedYear}`, { playerRows, teamRows }],
  ]))
  const competitionRequestsRef = useRef(new Map<string, Promise<CompetitionRows | null>>())
  const [view, setView] = useState<RankingView>("players")
  const [section, setSection] = useState<RankingSection>("rankings")
  const [mode, setMode] = useState<ValueMode>("average")
  const [formWindow, setFormWindow] = useState<FormWindow>(3)
  const [minPriorGames, setMinPriorGames] = useState(5)
  const [statKey, setStatKey] = useState("All Run Metres")
  const [perStatKey, setPerStatKey] = useState("")
  const [minGames, setMinGames] = useState(5)
  const [minMinutes, setMinMinutes] = useState(40)
  const [positionFilter, setPositionFilter] = useState("All Positions")
  const [cupLeague, setCupLeague] = useState("All Cup")
  const [valueSortDirection, setValueSortDirection] = useState<SortDirection>("desc")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [rankingFinderOpen, setRankingFinderOpen] = useState(false)
  const [rankingFinderQuery, setRankingFinderQuery] = useState("")
  const rankingFinderRef = useRef<HTMLDivElement>(null)
  const rankingFinderInputRef = useRef<HTMLInputElement>(null)
  const activeStatOptions = view === "teams" ? TEAM_STAT_OPTIONS : STAT_OPTIONS
  const effectiveStatKey = activeStatOptions.some((option) => option.key === statKey) ? statKey : "All Run Metres"
  const effectivePerStatKey = perStatKey && activeStatOptions.some((option) => option.key === perStatKey) ? perStatKey : ""
  const activeFormWindow = section === "form" ? formWindow : null
  const effectiveMode = section === "form" ? "average" : mode
  const rankingFinderSuggestions = useMemo(() => buildRankingSuggestions(rankingFinderQuery), [rankingFinderQuery])

  const loadCompetitionRows = useCallback((nextCompetition: "nrl" | "cup", nextYear: string, targetView: RankingView) => {
    const key = `${nextCompetition}:${nextYear}`
    const cachedRows = competitionRowsRef.current.get(key)
    const needsPlayerRows = targetView === "players" && !cachedRows?.playerRows
    const needsTeamRows = targetView === "teams" && !cachedRows?.teamRows
    if (!needsPlayerRows && !needsTeamRows) return Promise.resolve(cachedRows ?? {})

    const requestKey = `${key}:${targetView}`
    const existingRequest = competitionRequestsRef.current.get(requestKey)
    if (existingRequest) return existingRequest

    const query = new URLSearchParams({ years: nextYear, competition: nextCompetition })
    const request: Promise<CompetitionRows | null> = Promise.all([
      needsPlayerRows ? fetch(`/api/player-stats?${query.toString()}`) : Promise.resolve(null),
      needsTeamRows ? fetch(`/api/team-stats?${query.toString()}`) : Promise.resolve(null),
    ])
      .then(async ([playersResponse, teamsResponse]) => {
        if (playersResponse && !playersResponse.ok) return null
        if (teamsResponse && !teamsResponse.ok) return null
        const [nextPlayerRows, nextTeamRows] = await Promise.all([
          playersResponse ? playersResponse.json() as Promise<PlayerStat[]> : Promise.resolve(cachedRows?.playerRows),
          teamsResponse ? teamsResponse.json() as Promise<TeamStat[]> : Promise.resolve(cachedRows?.teamRows),
        ])
        const rows = {
          ...(cachedRows ?? {}),
          ...(nextPlayerRows ? { playerRows: nextPlayerRows } : {}),
          ...(nextTeamRows ? { teamRows: nextTeamRows } : {}),
        }
        competitionRowsRef.current.set(key, rows)
        return rows
      })
      .finally(() => competitionRequestsRef.current.delete(requestKey))

    competitionRequestsRef.current.set(requestKey, request)
    return request
  }, [])

  useEffect(() => {
    if (!canAccessCup) return
    const cupYear = cupAvailableYears.includes(selectedYear) ? selectedYear : cupAvailableYears[0]
    if (cupYear) void loadCompetitionRows("cup", cupYear, "players")
  }, [canAccessCup, cupAvailableYears, loadCompetitionRows, selectedYear])

  const changeCompetition = async (nextCompetition: "nrl" | "cup") => {
    if (competitionLoading) return
    if (nextCompetition === competition) return
    if (nextCompetition === "cup" && !canAccessCup) return
    const yearOptions = nextCompetition === "cup" ? cupAvailableYears : availableYears
    const nextYear = yearOptions.includes(selectedYear) ? selectedYear : yearOptions[0] ?? selectedYear
    setCompetition(nextCompetition)
    setActiveYear(nextYear)
    const cachedRows = competitionRowsRef.current.get(`${nextCompetition}:${nextYear}`)
    if ((view === "players" && cachedRows?.playerRows) || (view === "teams" && cachedRows?.teamRows)) {
      setActivePlayerRows(cachedRows.playerRows ?? [])
      setActiveTeamRows(cachedRows.teamRows ?? [])
      return
    }

    setActivePlayerRows([])
    setActiveTeamRows([])
    setCompetitionLoading(true)
    try {
      const rows = await loadCompetitionRows(nextCompetition, nextYear, view)
      if (!rows) return
      setActivePlayerRows(rows.playerRows ?? [])
      setActiveTeamRows(rows.teamRows ?? [])
    } finally {
      setCompetitionLoading(false)
    }
  }

  useEffect(() => {
    if (competitionLoading || !activeYear) return
    const cachedRows = competitionRowsRef.current.get(`${competition}:${activeYear}`)
    const hasCurrentRows = view === "players" ? activePlayerRows.length > 0 || cachedRows?.playerRows : activeTeamRows.length > 0 || cachedRows?.teamRows
    if (hasCurrentRows) return

    let cancelled = false
    setCompetitionLoading(true)
    loadCompetitionRows(competition, activeYear, view)
      .then((rows) => {
        if (cancelled || !rows) return
        if (view === "players") setActivePlayerRows(rows.playerRows ?? [])
        else setActiveTeamRows(rows.teamRows ?? [])
      })
      .finally(() => {
        if (!cancelled) setCompetitionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activePlayerRows.length, activeTeamRows.length, activeYear, competition, competitionLoading, loadCompetitionRows, view])

  useEffect(() => {
    if (!rankingFinderOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rankingFinderRef.current?.contains(event.target as Node)) setRankingFinderOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRankingFinderOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [rankingFinderOpen])

  const filteredPlayerRows = useMemo(() => {
    if (competition !== "cup") return activePlayerRows
    return activePlayerRows.filter((row) => {
      const league = String(row.cup_competition ?? "").toLowerCase()
      const matchesLeague = cupLeague === "All Cup" || league.includes(cupLeague === "NSW Cup" ? "nsw" : "qld")
      return matchesLeague
    })
  }, [activePlayerRows, competition, cupLeague])
  const playerRankings = useMemo(
    () => buildPlayerRankings(filteredPlayerRows, playerImages, effectiveMode, effectiveStatKey, effectivePerStatKey, minGames, minMinutes, positionFilter, valueSortDirection, activeFormWindow, minPriorGames),
    [filteredPlayerRows, playerImages, effectiveMode, effectiveStatKey, effectivePerStatKey, minGames, minMinutes, positionFilter, valueSortDirection, activeFormWindow, minPriorGames]
  )
  const teamRankings = useMemo(
    () => buildTeamRankings(activeTeamRows, teamLogos, effectiveMode, effectiveStatKey, effectivePerStatKey, minGames, valueSortDirection, activeFormWindow, minPriorGames),
    [activeTeamRows, teamLogos, effectiveMode, effectiveStatKey, effectivePerStatKey, minGames, valueSortDirection, activeFormWindow, minPriorGames]
  )
  const statHeading = effectivePerStatKey
    ? `${statInitials(effectiveStatKey, activeStatOptions)} / ${statInitials(effectivePerStatKey, activeStatOptions)}`
    : statInitials(effectiveStatKey, activeStatOptions)
  const valueHeading = section === "form" ? "Change" : statHeading
  const toggleValueSortDirection = () => {
    setValueSortDirection((current) => current === "desc" ? "asc" : "desc")
  }
  const hasEntries =
    view === "teams"
      ? teamRankings.length > 0
      : playerRankings.length > 0
  const ratioRanking = Boolean(effectivePerStatKey)
  const rankingTitle = `${statLabel(effectiveStatKey, activeStatOptions)}${effectivePerStatKey ? ` per ${perStatUnitLabel(effectivePerStatKey, activeStatOptions)}` : ""} — ${view === "teams" ? "Teams" : positionFilter === "All Positions" ? "All players" : positionFilter}${section === "form" ? ` · L${formWindow} form` : ""}`
  const loadingLabel = competition === "cup" ? "Loading Cup rankings" : "Loading NRL rankings"
  const changeView = (value: string) => {
    const [nextView, nextSection] = value.split("_") as [RankingView, RankingSection]
    setView(nextView)
    setSection(nextSection)
    if (nextView === "teams") setPositionFilter("All Positions")
    setValueSortDirection("desc")
  }
  const selectRankingSuggestion = (option: RankingDiscoveryOption) => {
    setView(option.view)
    setSection(option.section)
    setStatKey(option.statKey)
    setPerStatKey(option.perStatKey)
    setPositionFilter(option.view === "players" ? option.position : "All Positions")
    setFormWindow(option.formWindow)
    setMode(option.mode)
    setValueSortDirection("desc")
    setRankingFinderOpen(false)
    setRankingFinderQuery("")
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(190px,0.3fr)_minmax(180px,280px)] items-start gap-3 sm:grid-cols-[minmax(210px,0.28fr)_minmax(220px,320px)_minmax(0,1fr)]">
        <div className="col-start-1 row-start-1 flex min-w-0 items-end">
          <CompetitionToggle
            value={competition}
            onChange={(value) => void changeCompetition(value)}
            canAccessCup={canAccessCup}
            hideLabel
            size="large"
            className="w-full"
          />
        </div>
        <div className="col-start-2 row-start-1 min-w-0">
          <Select
            label="View"
            hideLabel
            value={`${view}_${section}`}
            options={[
              { label: "Players", options: [{ value: "players_rankings", label: "Player stats" }, { value: "players_form", label: "Player form" }] },
              { label: "Teams", options: [{ value: "teams_rankings", label: "Team stats" }, { value: "teams_form", label: "Team form" }] },
            ]}
            onChange={changeView}
          />
        </div>
        <div ref={rankingFinderRef} className="relative col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
          <label htmlFor="ranking-finder-input" className="sr-only">Find a ranking</label>
          <input
            ref={rankingFinderInputRef}
            id="ranking-finder-input"
            type="text"
            value={rankingFinderQuery}
            onFocus={() => setRankingFinderOpen(true)}
            onChange={(event) => {
              setRankingFinderQuery(event.target.value)
              setRankingFinderOpen(true)
            }}
            placeholder="Describe the ranking you want…"
            autoComplete="off"
            className="h-8 w-full rounded-xl border border-nrl-border bg-nrl-panel-2 px-3 text-[10px] text-nrl-text outline-none placeholder:text-nrl-muted/70 focus:border-nrl-accent"
          />
          {rankingFinderOpen && rankingFinderQuery.trim() ? (
            <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 rounded-2xl border border-nrl-border bg-nrl-panel p-3 shadow-[0_18px_48px_rgba(2,6,23,0.48)]">
              <div className="space-y-1">
                {rankingFinderSuggestions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectRankingSuggestion(option)}
                    className="block w-full rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-nrl-border hover:bg-nrl-panel-2 focus-visible:border-nrl-accent focus-visible:bg-nrl-panel-2 focus-visible:outline-none"
                  >
                    <span className="block text-[8px] font-bold uppercase tracking-[0.1em] text-nrl-muted">{option.category}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-nrl-text">{option.sentence}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]" aria-busy={competitionLoading}>
        <div className="flex flex-wrap items-end gap-3 overflow-hidden border-b border-nrl-border px-4 py-3 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:thin]">
          <div className="w-40 shrink-0">
            <Select label="Primary stat" compact value={effectiveStatKey} options={activeStatOptions.map((option) => ({ value: option.key, label: option.label }))} onChange={setStatKey} />
          </div>
          <div className="w-40 shrink-0">
            <Select label="Per stat" compact value={effectivePerStatKey} options={[{ value: "", label: "Add per stat" }, ...activeStatOptions.map((option) => ({ value: option.key, label: option.label }))]} onChange={setPerStatKey} />
          </div>
          {view === "players" ? <div className="w-32 shrink-0"><Select label="Position" compact value={positionFilter} options={POSITION_FILTERS} onChange={setPositionFilter} /></div> : null}
          <div className="flex shrink-0 flex-col gap-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">{section === "form" ? "Form sample" : "Values"}</span>
            <PillRadio
              options={section === "form" ? ["L3", "L5"] : ["Average", "Total"]}
              value={section === "form" ? `L${formWindow}` : mode === "average" ? "Average" : "Total"}
              onChange={(value) => section === "form" ? setFormWindow(value === "L5" ? 5 : 3) : setMode(value === "Total" ? "total" : "average")}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-nrl-border px-4 py-3 sm:px-5">
          <h1 className="min-w-0 truncate text-sm font-black text-nrl-text sm:text-base">{rankingTitle}</h1>
          <FiltersButton open={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} />
        </div>

        {competitionLoading ? (
          <div className="border-b border-nrl-border bg-nrl-panel-2 px-4 py-2 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-nrl-accent">{loadingLabel}</div>
              <div className="text-[10px] font-semibold text-nrl-muted">{activeYear || "Latest"}</div>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-nrl-border/70">
              <div className="h-full w-1/3 animate-[ranking-load_1.1s_ease-in-out_infinite] rounded-full bg-nrl-accent" />
            </div>
          </div>
        ) : null}

        {filtersOpen ? (
          <div id="ranking-filters" className="flex flex-wrap items-end gap-3 overflow-hidden border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:thin]">
            <label className="flex w-24 shrink-0 flex-col gap-0.5">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Min games</span>
              <input type="number" min={1} max={30} value={minGames} onChange={(event) => setMinGames(Math.max(1, Number(event.target.value) || 1))} className="h-8 rounded-md border border-nrl-border bg-nrl-panel px-2.5 text-[10px] text-nrl-text outline-none focus:border-nrl-accent" />
            </label>
            {section === "form" ? (
              <label className="flex w-24 shrink-0 flex-col gap-0.5">
                <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Min prior games</span>
                <input type="number" min={1} max={20} value={minPriorGames} onChange={(event) => setMinPriorGames(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} className="h-8 rounded-md border border-nrl-border bg-nrl-panel px-2.5 text-[10px] text-nrl-text outline-none focus:border-nrl-accent" />
              </label>
            ) : null}
            {view === "players" ? (
              <label className="flex w-24 shrink-0 flex-col gap-0.5">
                <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Min minutes</span>
                <input type="number" min={0} max={80} value={minMinutes} onChange={(event) => setMinMinutes(Math.max(0, Number(event.target.value) || 0))} className="h-8 rounded-md border border-nrl-border bg-nrl-panel px-2.5 text-[10px] text-nrl-text outline-none focus:border-nrl-accent" />
              </label>
            ) : null}
            {competition === "cup" && view === "players" ? (
              <>
                <div className="w-24 shrink-0"><Select label="Cup" compact value={cupLeague} options={["All Cup", "NSW Cup", "QLD Cup"]} onChange={setCupLeague} /></div>
              </>
            ) : null}
            <div className="flex shrink-0 flex-col gap-0.5">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Season</span>
              <div className="grid h-8 min-w-20 place-items-center rounded-md border border-nrl-border bg-nrl-panel px-2.5 text-[10px] text-nrl-text">{competitionLoading ? "Loading" : activeYear || "Latest"}</div>
            </div>
          </div>
        ) : null}

        <div className={competitionLoading ? "pointer-events-none opacity-45 transition-opacity" : "transition-opacity"}>
        {!hasEntries && !competitionLoading ? (
          <div className="p-8 text-center text-xs font-bold text-nrl-muted">No {view} match the current {section} filters.</div>
        ) : view === "teams" ? (

          <div className="overflow-x-auto">
            <table className="w-full min-w-[370px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#111733]">
                <tr className="border-b border-nrl-border text-[7px] font-black uppercase tracking-[0.1em] text-nrl-muted sm:text-[9px] sm:tracking-[0.14em]">
                  <th className="w-8 px-2 py-1.5 sm:w-12 sm:px-4 sm:py-2">#</th>
                  <th className="px-1.5 py-1.5 sm:px-2 sm:py-2">Team</th>
                  <th className="w-12 px-1.5 py-1.5 text-right sm:w-16 sm:px-2 sm:py-2">Games</th>
                  <th className="w-14 px-1.5 py-1.5 text-right sm:w-20 sm:px-2 sm:py-2">{section === "form" ? "Prior" : statInitials(effectiveStatKey, activeStatOptions)}</th>
                  {section === "form" || effectivePerStatKey ? (
                    <th className="w-12 px-1.5 py-1.5 text-right sm:w-20 sm:px-2 sm:py-2">{section === "form" ? `L${formWindow}` : statInitials(effectivePerStatKey, activeStatOptions)}</th>
                  ) : null}
                  <th className="w-16 px-2 py-1.5 text-right sm:w-28 sm:px-4 sm:py-2" aria-sort={valueSortDirection === "desc" ? "descending" : "ascending"}>
                    <button
                      type="button"
                      onClick={toggleValueSortDirection}
                      className="ml-auto flex flex-col items-end gap-0.5 text-right font-black uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:text-white"
                    >
                      <span>{valueHeading}</span>
                      <span className="text-[6px] sm:text-[8px]">{valueSortDirection}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamRankings.map((entry, index) => (
                  <tr key={entry.name} className="border-b border-nrl-border/70 odd:bg-transparent even:bg-white/[0.018] last:border-b-0">
                    <td className="px-2 py-1.5 text-[10px] font-black text-nrl-muted sm:px-4 sm:py-2 sm:text-xs">{index + 1}</td>
                    <td className="px-1.5 py-1.5 sm:px-2 sm:py-2">
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-nrl-border bg-nrl-panel-2 p-1 sm:h-11 sm:w-11">
                          <ImageWithFallback
                            sources={entry.imageSources}
                            alt={entry.name}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="truncate text-[10px] font-black text-nrl-text sm:text-xs">{entry.name}</div>
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5 text-right text-[10px] font-bold text-nrl-muted sm:px-2 sm:py-2 sm:text-xs">{entry.games}</td>
                    <td className="px-1.5 py-1.5 text-right text-[10px] font-bold text-nrl-muted sm:px-2 sm:py-2 sm:text-xs">
                      {section === "form" ? formatRankingValue(entry.priorValue ?? 0, ratioRanking) : formatCountValue(entry.statValue)}
                    </td>
                    {section === "form" || effectivePerStatKey ? (
                      <td className="px-1.5 py-1.5 text-right text-[10px] font-bold text-nrl-muted sm:px-2 sm:py-2 sm:text-xs">
                        {section === "form" ? formatRankingValue(entry.recentValue ?? 0, ratioRanking) : formatCountValue(entry.perStatValue ?? 0)}
                      </td>
                    ) : null}
                    <td className={`px-2 py-1.5 text-right text-[12px] font-black sm:px-4 sm:py-2 sm:text-sm ${section === "form" ? formChangeClass(entry.value, effectiveStatKey) : "text-nrl-text"}`}>
                      {section === "form" ? formatFormChange(entry.value, ratioRanking) : formatRankingValue(entry.value, ratioRanking)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      ) : (
          <div className="overflow-x-hidden">
            <table className="w-full min-w-0 table-fixed border-collapse text-left sm:min-w-[370px] sm:table-auto">
              <thead className="sticky top-0 z-10 bg-[#111733]">
                <tr className="border-b border-nrl-border text-[7px] font-black uppercase tracking-[0.1em] text-nrl-muted sm:text-[9px] sm:tracking-[0.14em]">
                  <th className="w-12 py-1.5 pl-4 pr-2 sm:w-12 sm:px-4 sm:py-2">#</th>
                  <th className="py-1.5 pl-3 pr-2 sm:px-2 sm:py-2">Player</th>
                  <th className="w-14 px-2 py-1.5 text-right sm:w-16 sm:px-2 sm:py-2">Games</th>
                  <th className="w-16 px-2 py-1.5 text-right sm:w-20 sm:px-2 sm:py-2">{section === "form" ? "Prior" : statInitials(effectiveStatKey, activeStatOptions)}</th>
                  {section === "form" || effectivePerStatKey ? (
                    <th className="w-14 px-2 py-1.5 text-right sm:w-20 sm:px-2 sm:py-2">{section === "form" ? `L${formWindow}` : statInitials(effectivePerStatKey, activeStatOptions)}</th>
                  ) : null}
                  <th className="w-20 px-2 py-1.5 text-right sm:w-28 sm:px-4 sm:py-2" aria-sort={valueSortDirection === "desc" ? "descending" : "ascending"}>
                    <button
                      type="button"
                      onClick={toggleValueSortDirection}
                      className="ml-auto flex flex-col items-end gap-0.5 text-right font-black uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:text-white"
                    >
                      <span>{valueHeading}</span>
                      <span className="text-[6px] sm:text-[8px]">{valueSortDirection}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {playerRankings.map((entry, index) => (
                  <tr key={entry.name} className="border-b border-nrl-border/70 odd:bg-transparent even:bg-white/[0.018] last:border-b-0">
                    <td className="py-1.5 pl-4 pr-2 text-[11px] font-black text-nrl-muted sm:px-4 sm:py-2 sm:text-xs">{index + 1}</td>
                    <td className="overflow-hidden py-1.5 pl-3 pr-2 sm:px-2 sm:py-2">
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel-2 sm:h-11 sm:w-11">
                          <PlayerImageWithFallback
                            sources={entry.imageSources}
                            alt={`${entry.name} player image`}
                            className="h-full w-full object-cover object-top"
                          />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/players/${playerSlug(entry.name)}${competition === "cup" ? "?competition=cup" : ""}`}
                            className="block truncate text-[12px] font-black text-nrl-text transition-colors hover:text-nrl-accent sm:text-xs"
                            title={entry.name}
                          >
                            <span className="sm:hidden">{initialisedPlayerName(entry.name)}</span>
                            <span className="hidden sm:inline">{entry.name}</span>
                          </Link>
                          <div className="mt-0.5 truncate text-[10px] font-semibold text-nrl-muted sm:text-[10px]">
                            {entry.team || "-"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] font-bold text-nrl-muted sm:px-2 sm:py-2 sm:text-xs">{entry.games}</td>
                    <td className="px-2 py-1.5 text-right text-[11px] font-bold text-nrl-muted sm:px-2 sm:py-2 sm:text-xs">
                      {section === "form" ? formatRankingValue(entry.priorValue ?? 0, ratioRanking) : formatCountValue(entry.statValue)}
                    </td>
                    {section === "form" || effectivePerStatKey ? (
                      <td className="px-2 py-1.5 text-right text-[11px] font-bold text-nrl-muted sm:px-2 sm:py-2 sm:text-xs">
                        {section === "form" ? formatRankingValue(entry.recentValue ?? 0, ratioRanking) : formatCountValue(entry.perStatValue ?? 0)}
                      </td>
                    ) : null}
                    <td className={`px-2 py-1.5 text-right text-[13px] font-black sm:px-4 sm:py-2 sm:text-sm ${section === "form" ? formChangeClass(entry.value, effectiveStatKey) : "text-nrl-text"}`}>
                      {section === "form" ? formatFormChange(entry.value, ratioRanking) : formatRankingValue(entry.value, ratioRanking)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}
        </div>
      </section>
      <style jsx>{`
        @keyframes ranking-load {
          0% { transform: translateX(-120%); }
          50% { transform: translateX(110%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  )
}

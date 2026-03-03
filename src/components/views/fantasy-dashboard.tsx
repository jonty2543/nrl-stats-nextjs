"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SignInButton } from "@clerk/nextjs"
import type { PlayerStat, TeammateLookupRow } from "@/lib/data/types"
import type { Draw2026Data } from "@/lib/draw/types"
import type { FantasyPlayerSnapshot } from "@/lib/fantasy/nrl"
import type { PlayerImageRecord } from "@/lib/supabase/queries"
import { FANTASY_POSITION_MAP } from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import {
  buildFantasyRank,
  filterByFinals,
  filterByMinutes,
  filterByTeammate,
  getTeammateOptions,
} from "@/lib/data/transform"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { PillRadio } from "@/components/ui/pill-radio"
import {
  PlayerImageCard,
  resolvePlayerImage,
  resolveTeamLogoUrl,
} from "@/components/views/player-comparison"

interface FantasyDashboardProps {
  fantasyPlayers: FantasyPlayerSnapshot[]
  availableYears: string[]
  defaultYears: string[]
  initialPlayerStats: PlayerStat[]
  playerImages?: PlayerImageRecord[]
  teamLogos?: Record<string, string>
  preloadedPlayerAllYears?: boolean
  draw2026Data?: Draw2026Data | null
  initialSelectedFantasyName?: string
  showOwnedCards?: boolean
  showPlayerDetails?: boolean
  playerRouteBasePath?: string
  canAccessLoginSeason?: boolean
}

type TeammateMode = "With" | "Without"
type GameLogSortDirection = "asc" | "desc"

interface PlayerDrawStripRound {
  round: number
  opponent: string | null
  opponentLogoUrl: string | null
  isHome: boolean | null
  isBye: boolean
}

const MINUTES_FILTER_OPTIONS = [
  "Any",
  "10 Mins",
  "20 Mins",
  "30 Mins",
  "40 Mins",
  "50 Mins",
  "60 Mins",
  "70 Mins",
  "80 Mins",
] as const

type GameLogColumn =
  | "Year"
  | "Round"
  | "Date"
  | "Opponent"
  | "Fantasy"
  | "Position"
  | "Mins Played"
  | "Tries"
  | "G"
  | "FG"
  | "Try Assists"
  | "Line Breaks"
  | "Line Break Assists"
  | "TO"
  | "FT"
  | "KD"
  | "FDO"
  | "PC"
  | "SB"
  | "SO"
  | "Tackles Made"
  | "Missed Tackles"
  | "Offloads"
  | "Errors"
  | "All Run Metres"
  | "Kicking Metres"

const POSITION_TABLES = Object.entries(FANTASY_POSITION_MAP)
  .map(([code, label]) => ({ code: Number(code), label }))
  .sort((a, b) => a.code - b.code)

const GAME_LOG_COLUMNS: { key: GameLogColumn; label: string; align?: "left" | "right" }[] = [
  { key: "Year", label: "Season" },
  { key: "Round", label: "Rnd", align: "right" },
  { key: "Date", label: "Date" },
  { key: "Opponent", label: "Opponent" },
  { key: "Fantasy", label: "Fantasy", align: "right" },
  { key: "Position", label: "Position" },
  { key: "Mins Played", label: "Mins", align: "right" },
  { key: "Tries", label: "T", align: "right" },
  { key: "G", label: "G", align: "right" },
  { key: "FG", label: "FG", align: "right" },
  { key: "Try Assists", label: "TA", align: "right" },
  { key: "Line Breaks", label: "LB", align: "right" },
  { key: "Line Break Assists", label: "LBA", align: "right" },
  { key: "TO", label: "TO", align: "right" },
  { key: "FT", label: "FT", align: "right" },
  { key: "KD", label: "KD", align: "right" },
  { key: "FDO", label: "FDO", align: "right" },
  { key: "PC", label: "PC", align: "right" },
  { key: "SB", label: "SB", align: "right" },
  { key: "SO", label: "SO", align: "right" },
  { key: "Tackles Made", label: "TCK", align: "right" },
  { key: "Missed Tackles", label: "MT", align: "right" },
  { key: "Offloads", label: "OF", align: "right" },
  { key: "Errors", label: "ER", align: "right" },
  { key: "All Run Metres", label: "MG", align: "right" },
  { key: "Kicking Metres", label: "KM", align: "right" },
]


function isCompactGameLogColumn(column: GameLogColumn): boolean {
  return !["Date", "Opponent", "Position"].includes(column)
}

function getGameLogCellPaddingClass(column: GameLogColumn): string {
  if (column === "Round" || column === "Fantasy") return "pl-0.5 pr-3"
  if (column === "Date" || column === "Position") return "pl-3 pr-0.5"
  return isCompactGameLogColumn(column) ? "px-0.5" : "px-1"
}

function getGameLogColumnWidthPx(column: GameLogColumn): number {
  switch (column) {
    case "Year":
      return 64
    case "Round":
      return 46
    case "Date":
      return 82
    case "Opponent":
      return 126
    case "Fantasy":
      return 64
    case "Position":
      return 100
    case "Mins Played":
      return 54
    case "FDO":
      return 48
    case "Tackles Made":
    case "All Run Metres":
    case "Kicking Metres":
      return 52
    default:
      return 42
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%ks]/gi, "").replace(/,/g, "").trim()
    if (!cleaned || cleaned === "-") return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function parseName(value: string): { first: string; last: string } {
  const parts = normaliseName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return {
    first: parts[0],
    last: parts[parts.length - 1],
  }
}

function findLocalPlayerMatch(fantasyName: string, localNames: string[]): string | null {
  if (!fantasyName || localNames.length === 0) return null

  const exactMap = new Map(localNames.map((name) => [normaliseName(name), name]))
  const exact = exactMap.get(normaliseName(fantasyName))
  if (exact) return exact

  const target = parseName(fantasyName)
  const candidates = localNames.filter((name) => {
    const parsed = parseName(name)
    return parsed.last && parsed.last === target.last
  })
  if (candidates.length === 1) return candidates[0]

  const initialMatches = candidates.filter((name) => {
    const parsed = parseName(name)
    return parsed.first[0] && parsed.first[0] === target.first[0]
  })
  if (initialMatches.length === 1) return initialMatches[0]

  const prefixMatches = candidates.filter((name) => {
    const parsed = parseName(name)
    return parsed.first.startsWith(target.first) || target.first.startsWith(parsed.first)
  })
  if (prefixMatches.length === 1) return prefixMatches[0]

  return null
}

function formatPrice(value: number | null): string {
  if (value === null) return "-"
  return `$${Math.round(value / 1000)}k`
}

function formatPercent(value: number | null): string {
  if (value === null) return "-"
  return `${value.toFixed(2)}%`
}

function formatNumber(value: number | null, digits = 1): string {
  if (value === null) return "-"
  return value.toFixed(digits)
}

function formatOpponent(value: string | null): string {
  if (!value) return "-"
  return value.replace(/-/g, " ")
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parseMinutesFilterOption(value: string): number {
  if (!value || value === "Any") return 0
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
}

function getRowAliasNumber(row: PlayerStat, aliases: string[]): number | null {
  for (const alias of aliases) {
    const n = toFiniteNumber(row[alias])
    if (n !== null) return n
  }
  return null
}

function getSyntheticGameLogValue(row: PlayerStat, column: GameLogColumn): number | null {
  switch (column) {
    case "G":
      return getRowAliasNumber(row, ["Conversions"])
    case "FG": {
      const one = getRowAliasNumber(row, ["1 Point Field Goals"]) ?? 0
      const two = getRowAliasNumber(row, ["2 Point Field Goals"]) ?? 0
      return one + two
    }
    case "TO":
      return getRowAliasNumber(row, ["One on One Steal"])
    case "FT": {
      const fortyTwenty = getRowAliasNumber(row, ["40/20"]) ?? 0
      const twentyForty = getRowAliasNumber(row, ["20/40"]) ?? 0
      return fortyTwenty + twentyForty
    }
    case "KD":
      return getRowAliasNumber(row, ["Kicks Defused"])
    case "FDO":
      return getRowAliasNumber(row, ["Forced Drop Outs"])
    case "PC":
      return getRowAliasNumber(row, ["Penalties"])
    case "SB":
      return getRowAliasNumber(row, ["Sin Bins"])
    case "SO":
      return getRowAliasNumber(row, ["Send Offs"])
    default:
      return null
  }
}

function getGameLogCellDisplay(row: PlayerStat, column: GameLogColumn): string | number {
  if (column === "Round") return row.Round_Label || row.Round || "-"
  if (column === "Opponent") return formatOpponent(row.Opponent)
  if (column === "Date") return formatDate(row.match_date)
  if (column === "Fantasy") return toFiniteNumber(row.Fantasy) ?? "-"
  if (column === "Year") return row.Year
  if (column === "Position") return row.Position

  const synthetic = getSyntheticGameLogValue(row, column)
  if (synthetic !== null) return Number.isInteger(synthetic) ? Math.round(synthetic) : synthetic.toFixed(1)

  const rawValue = row[column]

  const n = toFiniteNumber(rawValue)
  if (n !== null) {
    return Number.isInteger(n) ? Math.round(n) : n.toFixed(1)
  }
  if (typeof rawValue === "string") return rawValue
  return "-"
}

function getGameLogNumericValue(row: PlayerStat, column: GameLogColumn): number | null {
  if (column === "Fantasy") return toFiniteNumber(row.Fantasy)
  if (
    column === "Year" ||
    column === "Round" ||
    column === "Date" ||
    column === "Opponent" ||
    column === "Position"
  ) {
    return null
  }

  const synthetic = getSyntheticGameLogValue(row, column)
  if (synthetic !== null) return synthetic

  return toFiniteNumber(row[column])
}

function sortRoundsDesc(a: PlayerStat, b: PlayerStat): number {
  if (a.Year !== b.Year) return b.Year.localeCompare(a.Year)
  return (b.Round ?? 0) - (a.Round ?? 0)
}

function getDefaultGameLogSortDirection(column: GameLogColumn): GameLogSortDirection {
  switch (column) {
    case "Opponent":
    case "Position":
      return "asc"
    default:
      return "desc"
  }
}

function getGameLogSortValue(row: PlayerStat, column: GameLogColumn): number | string | null {
  switch (column) {
    case "Year": {
      const n = Number.parseInt(String(row.Year ?? ""), 10)
      return Number.isFinite(n) ? n : String(row.Year ?? "")
    }
    case "Round":
      return typeof row.Round === "number" ? row.Round : null
    case "Date": {
      const raw = row.match_date
      if (typeof raw === "string" && raw) {
        const t = Date.parse(raw)
        if (Number.isFinite(t)) return t
        return raw
      }
      return null
    }
    case "Opponent":
      return formatOpponent(row.Opponent).toLowerCase()
    case "Position":
      return String(row.Position ?? "").toLowerCase()
    default: {
      const n = getGameLogNumericValue(row, column)
      if (n !== null) return n
      const display = getGameLogCellDisplay(row, column)
      return typeof display === "number" ? display : String(display).toLowerCase()
    }
  }
}

function compareGameLogRows(
  a: PlayerStat,
  b: PlayerStat,
  column: GameLogColumn,
  direction: GameLogSortDirection
): number {
  const aValue = getGameLogSortValue(a, column)
  const bValue = getGameLogSortValue(b, column)

  let cmp = 0
  if (aValue === null && bValue === null) {
    cmp = 0
  } else if (aValue === null) {
    cmp = 1
  } else if (bValue === null) {
    cmp = -1
  } else if (typeof aValue === "number" && typeof bValue === "number") {
    cmp = aValue - bValue
  } else {
    cmp = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" })
  }

  if (cmp === 0) return sortRoundsDesc(a, b)
  return direction === "asc" ? cmp : -cmp
}

function OwnershipTableCard({
  title,
  rows,
  onSelectPlayer,
}: {
  title: string
  rows: FantasyPlayerSnapshot[]
  onSelectPlayer?: (name: string) => void
}) {
  return (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
      <div className="border-b border-nrl-border bg-nrl-accent/10 px-3 py-2">
        <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">{title}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-nrl-muted">Player</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-nrl-muted">Pos</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-nrl-muted">Own %</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-nrl-muted">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => (
              <tr key={player.id} className="border-t border-nrl-border/60">
                <td className="px-3 py-2 text-xs text-nrl-text">
                  {onSelectPlayer ? (
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(player.name)}
                      className="cursor-pointer text-left text-nrl-text hover:text-nrl-accent hover:underline"
                    >
                      {player.name}
                    </button>
                  ) : (
                    player.name
                  )}
                </td>
                <td className="px-3 py-2 text-[10px] text-nrl-muted">{player.positionLabel}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-nrl-accent">
                  {formatPercent(player.ownedBy)}
                </td>
                <td className="px-3 py-2 text-right text-xs text-nrl-text">
                  {formatPrice(player.cost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  sublabel,
  compact = false,
}: {
  label: string
  value: string
  sublabel?: string
  compact?: boolean
}) {
  return (
    <div
      className={`rounded-lg border border-nrl-border bg-nrl-panel-2 ${
        compact ? "px-3 py-1.5" : "px-3 py-2"
      }`}
    >
      <div className={`${compact ? "text-[8px]" : "text-[9px]"} font-semibold uppercase tracking-wide text-nrl-muted`}>
        {label}
      </div>
      <div className={`${compact ? "mt-0.5 text-lg" : "mt-1 text-xl"} font-bold text-nrl-text`}>
        {value}
      </div>
      {sublabel ? (
        <div className={`${compact ? "mt-0 text-[9px]" : "mt-0.5 text-[10px]"} text-nrl-muted`}>
          {sublabel}
        </div>
      ) : null}
    </div>
  )
}

export function FantasyDashboard({
  fantasyPlayers,
  availableYears,
  defaultYears,
  initialPlayerStats,
  playerImages = [],
  teamLogos = {},
  preloadedPlayerAllYears = false,
  draw2026Data,
  initialSelectedFantasyName,
  showOwnedCards = true,
  showPlayerDetails = true,
  playerRouteBasePath,
  canAccessLoginSeason = false,
}: FantasyDashboardProps) {
  const router = useRouter()
  const initialSelectedYears = useMemo(
    () => {
      const validDefaultYears = defaultYears.filter((year) => availableYears.includes(year))
      return validDefaultYears.length > 0 ? validDefaultYears : availableYears.slice(0, 1)
    },
    [availableYears, defaultYears]
  )
  const [selectedYears, setSelectedYears] = useState<string[]>(initialSelectedYears)
  const [allData, setAllData] = useState<PlayerStat[]>(initialPlayerStats)
  const [teammateLookupRows, setTeammateLookupRows] = useState<TeammateLookupRow[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [selectedFantasyName, setSelectedFantasyName] = useState(
    initialSelectedFantasyName ?? fantasyPlayers[0]?.name ?? ""
  )
  const [finalsMode, setFinalsMode] = useState<"Yes" | "No">("Yes")
  const [opponentFilter, setOpponentFilter] = useState("All Opponents")
  const [positionFilter, setPositionFilter] = useState("All Positions")
  const [teammate, setTeammate] = useState("None")
  const [teammatePosition, setTeammatePosition] = useState("All")
  const [teammateMode, setTeammateMode] = useState<TeammateMode>("With")
  const [minutesOverFilter, setMinutesOverFilter] = useState<string>("Any")
  const [minutesUnderFilter, setMinutesUnderFilter] = useState<string>("Any")
  const [gameLogSort, setGameLogSort] = useState<{ column: GameLogColumn; direction: GameLogSortDirection } | null>(
    null
  )
  const playerDetailsRef = useRef<HTMLElement | null>(null)

  const scrollToPlayerDetails = useCallback(() => {
    if (typeof window === "undefined") return
    window.requestAnimationFrame(() => {
      playerDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  const navigateToPlayer = useCallback(
    (name: string) => {
      if (playerRouteBasePath) {
        router.push(`${playerRouteBasePath}/${encodeURIComponent(fantasyPlayerSlug(name))}`)
        return
      }
      setSelectedFantasyName(name)
      scrollToPlayerDetails()
    },
    [playerRouteBasePath, router, scrollToPlayerDetails]
  )

  const loadTeammateLookupRows = useCallback(async (years: string[]) => {
    if (!canAccessLoginSeason) {
      setTeammateLookupRows([])
      return
    }
    if (years.length === 0) {
      setTeammateLookupRows([])
      return
    }

    try {
      const res = await fetch(`/api/player-stats-teammates?years=${encodeURIComponent(years.join(","))}`)
      if (!res.ok) return
      const data = (await res.json()) as TeammateLookupRow[]
      setTeammateLookupRows(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to load teammate lookup rows", error)
    }
  }, [canAccessLoginSeason])

  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = availableYears.filter((year) => years.includes(year))
    const nextYears = validYears.length > 0 ? validYears : availableYears.slice(0, 1)
    setSelectedYears(nextYears)
    if (nextYears.length === 0) return
    if (preloadedPlayerAllYears) {
      void loadTeammateLookupRows(nextYears)
      return
    }
    setIsLoadingStats(true)
    try {
      const res = await fetch(`/api/player-stats?years=${encodeURIComponent(nextYears.join(","))}`)
      if (!res.ok) return
      const data = (await res.json()) as PlayerStat[]
      setAllData(Array.isArray(data) ? data : [])
    } finally {
      setIsLoadingStats(false)
    }
  }, [availableYears, loadTeammateLookupRows, preloadedPlayerAllYears])

  const selectedFantasyPlayer = useMemo(
    () => fantasyPlayers.find((player) => player.name === selectedFantasyName) ?? null,
    [fantasyPlayers, selectedFantasyName]
  )

  const selectedYearData = useMemo(() => {
    if (selectedYears.length === 0) return allData
    return allData.filter((row) => selectedYears.includes(row.Year))
  }, [allData, selectedYears])

  const teammateLookupSourceRows = useMemo(
    () => (preloadedPlayerAllYears ? teammateLookupRows : selectedYearData),
    [preloadedPlayerAllYears, teammateLookupRows, selectedYearData]
  )

  const allLocalNames = useMemo(
    () => Array.from(new Set(allData.map((row) => row.Name))).sort(),
    [allData]
  )

  const matchedLocalName = useMemo(
    () =>
      selectedFantasyPlayer
        ? findLocalPlayerMatch(selectedFantasyPlayer.name, allLocalNames)
        : null,
    [selectedFantasyPlayer, allLocalNames]
  )

  const playerRowsForYear = useMemo(() => {
    if (!matchedLocalName) return []
    return selectedYearData.filter((row) => row.Name === matchedLocalName)
  }, [matchedLocalName, selectedYearData])
  const playerRowsAllYears = useMemo(() => {
    if (!matchedLocalName) return []
    return allData.filter((row) => row.Name === matchedLocalName)
  }, [allData, matchedLocalName])

  const fantasyRank = useMemo(() => buildFantasyRank(teammateLookupSourceRows), [teammateLookupSourceRows])
  const teammateOptions = useMemo(
    () =>
      matchedLocalName
        ? getTeammateOptions(matchedLocalName, teammateLookupSourceRows, fantasyRank)
        : [],
    [matchedLocalName, teammateLookupSourceRows, fantasyRank]
  )

  const positionOptions = useMemo(
    () =>
      Array.from(new Set(playerRowsForYear.map((row) => row.Position)))
        .filter(Boolean)
        .sort(),
    [playerRowsForYear]
  )

  const teammatePositionOptions = useMemo(() => {
    const sourceRows =
      teammate !== "None"
        ? teammateLookupSourceRows.filter((row) => row.Name === teammate)
        : teammateLookupSourceRows

    return Array.from(new Set(sourceRows.map((row) => row.Position)))
      .filter(Boolean)
      .sort()
  }, [teammateLookupSourceRows, teammate])

  const opponentOptions = useMemo(
    () =>
      Array.from(new Set(playerRowsForYear.map((row) => formatOpponent(row.Opponent))))
        .filter((value) => value && value !== "-")
        .sort(),
    [playerRowsForYear]
  )

  useEffect(() => {
    if (!showPlayerDetails || !preloadedPlayerAllYears || !canAccessLoginSeason) return
    void loadTeammateLookupRows(selectedYears)
  }, [canAccessLoginSeason, loadTeammateLookupRows, preloadedPlayerAllYears, selectedYears, showPlayerDetails])

  useEffect(() => {
    if (canAccessLoginSeason) return
    setTeammate("None")
    setTeammatePosition("All")
    setTeammateMode("With")
  }, [canAccessLoginSeason])

  useEffect(() => {
    setOpponentFilter("All Opponents")
    setPositionFilter("All Positions")
    setTeammate("None")
    setTeammatePosition("All")
  }, [selectedFantasyName])

  const filteredRows = useMemo(() => {
    let rows = [...playerRowsForYear]
    rows = filterByFinals(rows, finalsMode)

    if (positionFilter !== "All Positions") {
      rows = rows.filter((row) => row.Position === positionFilter)
    }

    if (opponentFilter !== "All Opponents") {
      rows = rows.filter((row) => formatOpponent(row.Opponent) === opponentFilter)
    }

    rows = filterByMinutes(rows, 0, "All")

    rows = rows.filter((row) => {
      const mins = toFiniteNumber(row["Mins Played"]) ?? 0
      const overThreshold = parseMinutesFilterOption(minutesOverFilter)
      const underThreshold = parseMinutesFilterOption(minutesUnderFilter)
      if (overThreshold > 0 && mins < overThreshold) return false
      if (underThreshold > 0 && mins > underThreshold) return false
      return true
    })

    if (canAccessLoginSeason && teammate !== "None") {
      rows = filterByTeammate(
        rows,
        teammate,
        teammateMode === "With",
        teammateLookupSourceRows,
        teammatePosition
      )
    }

    return rows.sort(sortRoundsDesc)
  }, [
    finalsMode,
    minutesOverFilter,
    minutesUnderFilter,
    opponentFilter,
    playerRowsForYear,
    positionFilter,
    canAccessLoginSeason,
    teammateLookupSourceRows,
    teammate,
    teammateMode,
    teammatePosition,
  ])

  const latestLocalRow = useMemo(
    () => [...playerRowsAllYears].sort(sortRoundsDesc)[0] ?? null,
    [playerRowsAllYears]
  )
  const latestLocalTeam = useMemo(() => {
    const team = typeof latestLocalRow?.Team === "string" ? latestLocalRow.Team : null
    return team ? formatOpponent(team) : null
  }, [latestLocalRow])
  const teamForDrawStrip = latestLocalTeam

  const draw2026StripRows = useMemo<PlayerDrawStripRound[]>(() => {
    if (!draw2026Data?.rows?.length || !teamForDrawStrip) return []

    const teamKey = normaliseTeamKey(teamForDrawStrip)
    if (!teamKey) return []

    const fixturesByRound = new Map<number, PlayerDrawStripRound>()
    let maxRound = 0

    for (const row of draw2026Data.rows) {
      maxRound = Math.max(maxRound, row.round)

      const homeKey = normaliseTeamKey(row.home)
      const awayKey = normaliseTeamKey(row.away)
      if (homeKey !== teamKey && awayKey !== teamKey) continue

      const isHome = homeKey === teamKey
      const opponent = isHome ? row.away : row.home
      const opponentLogoUrl = draw2026Data.teamLogos[normaliseTeamKey(opponent)] ?? null

      fixturesByRound.set(row.round, {
        round: row.round,
        opponent,
        opponentLogoUrl,
        isHome,
        isBye: false,
      })
    }

    if (maxRound === 0) return []

    const out: PlayerDrawStripRound[] = []
    for (let round = 1; round <= maxRound; round += 1) {
      out.push(
        fixturesByRound.get(round) ?? {
          round,
          opponent: null,
          opponentLogoUrl: null,
          isHome: null,
          isBye: true,
        }
      )
    }

    return out
  }, [draw2026Data, teamForDrawStrip])

  const fantasyCardPosition = useMemo(
    () =>
      selectedFantasyPlayer?.positionLabels?.[0] ??
      (selectedFantasyPlayer?.positions?.[0] != null
        ? (FANTASY_POSITION_MAP[selectedFantasyPlayer.positions[0]] ?? null)
        : null),
    [selectedFantasyPlayer]
  )
  const fantasyCardPlayerName = matchedLocalName ?? selectedFantasyPlayer?.name ?? ""
  const fantasyCardImage = useMemo(
    () => resolvePlayerImage(fantasyCardPlayerName, latestLocalTeam, playerImages),
    [fantasyCardPlayerName, latestLocalTeam, playerImages]
  )
  const fantasyCardLogoUrl = useMemo(
    () => resolveTeamLogoUrl(fantasyCardImage?.team ?? latestLocalTeam, teamLogos),
    [fantasyCardImage?.team, latestLocalTeam, teamLogos]
  )

  const overallTopOwned = useMemo(
    () => [...fantasyPlayers].sort((a, b) => (b.ownedBy ?? -1) - (a.ownedBy ?? -1)).slice(0, 20),
    [fantasyPlayers]
  )

  const overallTopPrice = useMemo(
    () => [...fantasyPlayers].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1)).slice(0, 20),
    [fantasyPlayers]
  )

  const topOwnedByPosition = useMemo(() => {
    return POSITION_TABLES.map((position) => ({
      ...position,
      rows: fantasyPlayers
        .filter((player) => player.positions.includes(position.code))
        .sort((a, b) => (b.ownedBy ?? -1) - (a.ownedBy ?? -1))
        .slice(0, 20),
    }))
  }, [fantasyPlayers])

  const localPpm = useMemo(() => {
    const scores = playerRowsForYear
      .map((row) => toFiniteNumber(row.Fantasy))
      .filter((value): value is number => value !== null)
    const mins = playerRowsForYear
      .map((row) => toFiniteNumber(row["Mins Played"]))
      .filter((value): value is number => value !== null)

    if (scores.length === 0 || mins.length === 0) return null
    const totalScore = scores.reduce((sum, value) => sum + value, 0)
    const totalMins = mins.reduce((sum, value) => sum + value, 0)
    if (totalMins <= 0) return null
    return totalScore / totalMins
  }, [playerRowsForYear])

  const playerSearchOptions = useMemo(
    () => fantasyPlayers.map((player) => player.name),
    [fantasyPlayers]
  )

  const gameLogAverages = useMemo(() => {
    const out: Partial<Record<GameLogColumn, number | null>> = {}

    for (const column of GAME_LOG_COLUMNS) {
      const values = filteredRows
        .map((row) => getGameLogNumericValue(row, column.key))
        .filter((value): value is number => value !== null)

      out[column.key] =
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null
    }

    return out
  }, [filteredRows])

  const sortedFilteredRows = useMemo(() => {
    if (!gameLogSort) return filteredRows
    return [...filteredRows].sort((a, b) =>
      compareGameLogRows(a, b, gameLogSort.column, gameLogSort.direction)
    )
  }, [filteredRows, gameLogSort])

  const toggleGameLogSort = useCallback((column: GameLogColumn) => {
    setGameLogSort((prev) => {
      if (!prev || prev.column !== column) {
        return { column, direction: getDefaultGameLogSortDirection(column) }
      }
      return { column, direction: prev.direction === "asc" ? "desc" : "asc" }
    })
  }, [])

  const ownedCards = useMemo(
    () => [
      { key: "price", title: "TOP 20 PRICE", rows: overallTopPrice },
      { key: "all", title: "TOP 20 ALL POS", rows: overallTopOwned },
      ...topOwnedByPosition.map((table) => ({
        key: String(table.code),
        title: `TOP 20 ${table.label}`,
        rows: table.rows,
      })),
    ],
    [overallTopOwned, overallTopPrice, topOwnedByPosition]
  )

  const draw2026Panel = (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
      <div className="border-b border-nrl-border bg-nrl-panel-2 px-3 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">2026 Draw</div>
        <div className="mt-1 text-[10px] text-nrl-muted">
          {draw2026StripRows.length > 0
            ? `${draw2026StripRows.length} rounds${teamForDrawStrip ? ` · ${teamForDrawStrip}` : ""}`
            : "No draw available"}
        </div>
      </div>
      <div className="p-2">
        {draw2026StripRows.length === 0 ? (
          <div className="px-1 py-2 text-xs text-nrl-muted">
            {matchedLocalName
              ? "No 2026 draw found for this player yet."
              : "No local player-team match found for 2026 draw."}
          </div>
        ) : (
          <div className="space-y-2 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
            {draw2026StripRows.map((row) => (
              <div
                key={`draw-2026-sidebar-${row.round}`}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-2"
              >
                <div className="text-[9px] font-semibold text-nrl-muted">{`Rd ${row.round}`}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {row.isBye ? (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">
                        Bye
                      </span>
                    ) : row.opponentLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.opponentLogoUrl}
                        alt={`${row.opponent ?? "Opponent"} logo`}
                        className="h-7 w-7 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[10px] font-semibold text-nrl-text">
                        {row.opponent?.slice(0, 3) ?? "-"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] text-nrl-text">
                      {row.isBye ? "No game" : `${row.isHome ? "vs" : "@"} ${row.opponent ?? "-"}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-nrl-text">Fantasy</h1>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:min-w-[260px]">
            <SearchableSelect
              label=""
              value={selectedFantasyName}
              options={playerSearchOptions}
              onChange={navigateToPlayer}
              placeholder="Search player..."
            />
          </div>
        </div>
      </section>

      {showOwnedCards ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {ownedCards.map((card) => (
              <OwnershipTableCard
                key={card.key}
                title={card.title}
                rows={card.rows}
                onSelectPlayer={navigateToPlayer}
              />
            ))}
          </div>
        </section>
      ) : null}

      {showPlayerDetails && selectedFantasyPlayer ? (
        <section ref={playerDetailsRef} id="fantasy-player-details" className="scroll-mt-24">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_200px] xl:items-start">
            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border border-nrl-border bg-nrl-panel p-3">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
                  <div className="min-w-0 space-y-3 xl:-ml-8 xl:order-2">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-bold text-nrl-text">{selectedFantasyPlayer.name}</h2>
                        <span className="rounded-md bg-nrl-accent/15 px-2 py-0.5 text-xs font-semibold text-nrl-accent">
                          {formatPrice(selectedFantasyPlayer.cost)}
                        </span>
                        <span className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-0.5 text-xs text-nrl-muted">
                          {selectedFantasyPlayer.positionLabel}
                        </span>
                        {selectedFantasyPlayer.isBye ? (
                          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                            Bye
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {latestLocalRow ? (
                          <span className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-nrl-muted">
                            Team: {latestLocalRow.Team}
                          </span>
                        ) : null}
                        <span className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-nrl-muted">
                          Status: {selectedFantasyPlayer.status ?? "N/A"}
                        </span>
                        {isLoadingStats ? (
                          <span className="rounded-md border border-nrl-accent/30 bg-nrl-accent/10 px-2 py-1 text-nrl-accent">
                            Loading season data…
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="pt-6 grid grid-cols-[8rem_minmax(0,1fr)] items-stretch gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] xl:grid-cols-1">
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                        <MetricCard compact label="Price" value={formatPrice(selectedFantasyPlayer.cost)} />
                        <MetricCard compact label="PPM" value={formatNumber(localPpm, 2)} />
                        <MetricCard compact label="Own %" value={formatPercent(selectedFantasyPlayer.ownedBy)} />
                        <MetricCard
                          compact
                          label="Priced At"
                          value={formatNumber(selectedFantasyPlayer.pricedAt, 0)}
                        />
                      </div>

                      {fantasyCardPlayerName ? (
                        <div className="flex h-full items-center justify-center xl:hidden">
                          <div className="w-full max-w-[18rem] sm:max-w-[20rem]">
                            <PlayerImageCard
                              playerName={fantasyCardPlayerName}
                              imageRow={fantasyCardImage}
                              teamLogoUrl={fantasyCardLogoUrl}
                              fantasyPosition={fantasyCardPosition}
                              compact
                              frameless
                              priority
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {fantasyCardPlayerName ? (
                    <div className="hidden items-center justify-center xl:order-1 xl:flex xl:justify-start">
                      <div className="w-full max-w-[14rem]">
                        <PlayerImageCard
                          playerName={fantasyCardPlayerName}
                          imageRow={fantasyCardImage}
                          teamLogoUrl={fantasyCardLogoUrl}
                          fantasyPosition={fantasyCardPosition}
                          frameless
                          priority
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
            <div className="grid grid-cols-3 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <MultiSelect
                label="Season"
                value={selectedYears}
                options={availableYears}
                onChange={(years) => {
                  void handleYearsChange(years)
                }}
              />
              <Select
                label="Opponent"
                value={opponentFilter}
                options={["All Opponents", ...opponentOptions]}
                onChange={setOpponentFilter}
              />
              <Select
                label="Position"
                value={positionFilter}
                options={["All Positions", ...positionOptions]}
                onChange={setPositionFilter}
              />
              <Select
                label="Finals"
                value={finalsMode}
                options={["Yes", "No"]}
                onChange={(value) => setFinalsMode(value as "Yes" | "No")}
              />
              <Select
                label="Minutes Over"
                value={minutesOverFilter}
                options={[...MINUTES_FILTER_OPTIONS]}
                onChange={setMinutesOverFilter}
              />
	              <Select
	                label="Minutes Under"
	                value={minutesUnderFilter}
	                options={[...MINUTES_FILTER_OPTIONS]}
	                onChange={setMinutesUnderFilter}
	              />
	            </div>

              {!canAccessLoginSeason ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="text-[10px] text-nrl-muted">Sign in to access pre-2025 seasons</div>
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="cursor-pointer rounded border border-nrl-accent/45 px-2 py-0.5 text-[10px] font-semibold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/10"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                </div>
              ) : null}

	            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
                  <SearchableSelect
                    label="Teammate"
                    value={teammate}
                    options={["None", ...teammateOptions]}
                    onChange={setTeammate}
                    placeholder="Filter by teammate..."
                    disabled={!matchedLocalName || !canAccessLoginSeason}
                  />
                <Select
                  label="Teammate Position"
                  value={teammatePosition}
                  options={["All", ...teammatePositionOptions]}
                  onChange={setTeammatePosition}
                  disabled={!canAccessLoginSeason}
                />
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
                    With / Without
                  </label>
                  <div className="h-[30px] flex items-center">
                    <PillRadio
                      options={["With", "Without"]}
                      value={teammateMode}
                      onChange={(value) => setTeammateMode(value as TeammateMode)}
                      disabled={teammate === "None" || !canAccessLoginSeason}
                    />
                  </div>
                </div>
              </div>

	              {!canAccessLoginSeason ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[10px] text-nrl-muted">Sign in to unlock teammate filtering</div>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="cursor-pointer rounded border border-nrl-accent/45 px-2 py-0.5 text-[10px] font-semibold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/10"
                      >
                        Sign in
                      </button>
                    </SignInButton>
                  </div>
	              ) : null}

              <div className="text-xs text-nrl-muted">
                Showing <span className="font-semibold text-nrl-text">{filteredRows.length}</span> games
              </div>
            </div>
              </div>

              <div className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
                <div className="border-b border-nrl-border bg-nrl-panel-2 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">
                    Player Game Log
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table
                    className="table-fixed border-collapse"
                    style={{
                      minWidth: `${GAME_LOG_COLUMNS.reduce(
                        (sum, column) => sum + getGameLogColumnWidthPx(column.key),
                        0
                      )}px`,
                    }}
                  >
                    <colgroup>
                      {GAME_LOG_COLUMNS.map((column) => (
                        <col
                          key={column.key}
                          style={{ width: `${getGameLogColumnWidthPx(column.key)}px` }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-nrl-panel">
                        {GAME_LOG_COLUMNS.map((column) => (
                          <th
                            key={column.key}
                            className={`sticky top-0 z-10 border-b border-nrl-border py-2 text-[10px] font-semibold uppercase tracking-normal text-nrl-muted whitespace-nowrap ${
                              getGameLogCellPaddingClass(column.key)
                            } ${
                              column.align === "right" ? "text-right" : "text-left"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleGameLogSort(column.key)}
                              className={`flex w-full items-center gap-1 ${
                                column.align === "right" ? "justify-end" : "justify-start"
                              } hover:text-nrl-text ${
                                gameLogSort?.column === column.key ? "text-nrl-accent" : ""
                              }`}
                              title={`Sort by ${column.label}`}
                            >
                              <span>{column.label}</span>
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFilteredRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={GAME_LOG_COLUMNS.length}
                            className="px-4 py-6 text-sm text-nrl-muted"
                          >
                            No games matched the current filters.
                          </td>
                        </tr>
                      ) : (
                        <>
                          <tr className="border-b border-nrl-accent/25 bg-nrl-panel-2/60">
                            {GAME_LOG_COLUMNS.map((column, index) => {
                              const avg = gameLogAverages[column.key] ?? null
                              const display =
                                index === 0
                                  ? "Averages"
                                  : avg === null
                                    ? "-"
                                    : avg.toFixed(1)
                              const isFantasy = column.key === "Fantasy"

                              return (
                                <td
                                  key={column.key}
                                  className={`py-2 text-xs font-semibold whitespace-nowrap ${
                                    getGameLogCellPaddingClass(column.key)
                                  } ${
                                    column.align === "right" ? "text-right" : "text-left"
                                  } ${isFantasy ? "text-nrl-accent" : "text-nrl-muted"}`}
                                >
                                  {display}
                                </td>
                              )
                            })}
                          </tr>
                          {sortedFilteredRows.map((row, index) => (
                            <tr key={`${row.Year}-${row.Round}-${index}`} className="border-t border-nrl-border/60">
                              {GAME_LOG_COLUMNS.map((column) => {
                                const display = getGameLogCellDisplay(row, column.key)
                                const isFantasy = column.key === "Fantasy"

                                return (
                                  <td
                                    key={column.key}
                                    className={`py-2 text-xs whitespace-nowrap ${
                                      getGameLogCellPaddingClass(column.key)
                                    } ${
                                      column.align === "right" ? "text-right" : "text-left"
                                    } ${isFantasy ? "font-semibold text-nrl-accent" : "text-nrl-text"}`}
                                  >
                                    {display}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="xl:sticky xl:top-24">{draw2026Panel}</div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

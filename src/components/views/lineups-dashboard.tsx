"use client"

import { useState } from "react"
import type { LineupCasualtyOut, LineupMatch, LineupPlayer, LineupTeam, LineupTryscorerOdds } from "@/lib/lineups/nrl-lineups"

interface LineupsDashboardProps {
  matches: LineupMatch[]
  teamLogos: Record<string, string>
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  canAccessNotableOuts: boolean
  canAccessFantasyProjections: boolean
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
  playerAverages: Record<string, Record<AverageStatKey, number>>
}

type Slot = "FB" | "LW" | "LC" | "RW" | "RC" | "FE" | "HLF" | "LK" | "L2R" | "R2R" | "HK" | "PR"
type Orientation = "landscape" | "portrait"
type DisplayMode = "fantasy" | "odds" | AverageStatKey
type AverageStatKey =
  | "Tries"
  | "Try Assists"
  | "All Run Metres"
  | "Tackles Made"
  | "Line Breaks"
  | "Line Break Assists"
  | "Errors"
  | "Missed Tackles"
  | "Receipts"
  | "Tackle Breaks"
  | "Offloads"

const BOOKIE_LOGOS: Record<string, string> = {
  Sportsbet: "/logos/sportsbet.png",
  Pointsbet: "/logos/pointsbet.png",
  Unibet: "/logos/unibet.png",
  Palmerbet: "/logos/palmerbet.png",
  Betright: "/logos/betright.png",
  Betr: "/logos/betr.png",
  Deluxebet: "/logos/deluxebet.png",
  Surgebet: "/logos/surgebet.png",
}

function normaliseBookieKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

const BOOKIE_LOGOS_BY_KEY = Object.fromEntries(
  Object.entries(BOOKIE_LOGOS).map(([bookie, logo]) => [normaliseBookieKey(bookie), logo])
)

function resolveBookieLogo(bookie: string | null | undefined): string | null {
  if (!bookie) return null
  const candidates = bookie.split(/[,/&+]+/).map((part) => normaliseBookieKey(part)).filter(Boolean)
  for (const candidate of candidates) {
    const logo = BOOKIE_LOGOS_BY_KEY[candidate]
    if (logo) return logo
  }
  return BOOKIE_LOGOS_BY_KEY[normaliseBookieKey(bookie)] ?? null
}

const DISPLAY_MODES: { key: DisplayMode; label: string; shortLabel: string }[] = [
  { key: "fantasy", label: "Fantasy Projection", shortLabel: "Proj" },
  { key: "odds", label: "Best Odds", shortLabel: "Odds" },
  { key: "Tries", label: "Try Scoring Avg", shortLabel: "Tries" },
  { key: "Try Assists", label: "Try Assists Avg", shortLabel: "TA" },
  { key: "All Run Metres", label: "Run Metres Avg", shortLabel: "RM" },
  { key: "Tackles Made", label: "Tackles Avg", shortLabel: "TK" },
  { key: "Line Breaks", label: "Linebreaks Avg", shortLabel: "LB" },
  { key: "Line Break Assists", label: "Linebreak Assists Avg", shortLabel: "LBA" },
  { key: "Errors", label: "Errors Avg", shortLabel: "ERR" },
  { key: "Missed Tackles", label: "Missed Tackles Avg", shortLabel: "MT" },
  { key: "Receipts", label: "Receipts Avg", shortLabel: "REC" },
  { key: "Tackle Breaks", label: "Tackle Breaks Avg", shortLabel: "TB" },
  { key: "Offloads", label: "Offloads Avg", shortLabel: "OFF" },
]

function displayModesForAccess(canAccessFantasyProjections: boolean) {
  return canAccessFantasyProjections ? DISPLAY_MODES : DISPLAY_MODES.filter((mode) => mode.key !== "fantasy")
}

const DEPTH_X: Record<Slot, number> = {
  FB: 7,
  LW: 14,
  LC: 14,
  RW: 14,
  RC: 14,
  FE: 24,
  HLF: 24,
  LK: 31,
  L2R: 36,
  R2R: 36,
  HK: 43,
  PR: 43,
}

const LANE_Y: Record<Slot, number> = {
  LW: 12,
  LC: 28,
  FB: 50,
  RC: 72,
  RW: 88,
  FE: 39,
  HLF: 61,
  LK: 50,
  L2R: 33,
  R2R: 67,
  HK: 50,
  PR: 21,
}

const PORTRAIT_DEPTH_X: Record<Slot, number> = {
  FB: 8.5,
  LW: 16,
  LC: 16,
  RW: 16,
  RC: 16,
  FE: 26,
  HLF: 26,
  LK: 33,
  L2R: 38,
  R2R: 38,
  HK: 44,
  PR: 44,
}

const PORTRAIT_LANE_Y: Record<Slot, number> = {
  LW: 9,
  LC: 30,
  FB: 50,
  RC: 70,
  RW: 91,
  FE: 38,
  HLF: 62,
  LK: 50,
  L2R: 32,
  R2R: 68,
  HK: 50,
  PR: 18,
}

function normaliseKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function resolveLogo(team: LineupTeam | null, teamLogos: Record<string, string>): string | null {
  if (!team) return null
  const candidates = [team.team, team.teamName, team.teamName.replace(/^North Queensland /, ""), team.teamName.replace(/^Gold Coast /, "")]
  for (const candidate of candidates) {
    const logo = teamLogos[normaliseKey(candidate)]
    if (logo) return logo
  }
  return null
}

function formatKickoff(value: string | null): string {
  if (!value) return "TBC"
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(new Date(value))
}

function matchDateKey(match: LineupMatch): string {
  if (match.matchDate) return match.matchDate
  if (!match.kickoffUtc) return "tbc"
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(match.kickoffUtc))
}

function formatMatchDateHeader(dateKey: string): string {
  if (dateKey === "tbc") return "Date TBC"
  const date = new Date(`${dateKey}T00:00:00+10:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Brisbane",
  }).format(date)
}

function normaliseImageUrl(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`

  const marker = "/remote.axd?"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length)
    if (nested.startsWith("http://")) return `https://${nested.slice("http://".length)}`
    if (nested) return nested
  }

  return trimmed
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function displayName(player: LineupPlayer): string {
  const parts = player.player.split(/\s+/).filter(Boolean)
  const last = parts.at(-1) ?? player.player
  return `${player.isCaptain ? "(C) " : ""}${last}`
}

function formatAverage(value: number | null | undefined, mode: AverageStatKey): string {
  if (value == null) return "-"
  if (mode === "All Run Metres" || mode === "Receipts") return value.toFixed(0)
  return value.toFixed(1)
}

function PlayerMetric({
  player,
  displayMode,
  tryscorerOdds,
  playerAverages,
  canAccessFantasyProjections,
  compact,
}: {
  player: LineupPlayer
  displayMode: DisplayMode
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  canAccessFantasyProjections: boolean
  compact: boolean
}) {
  const playerKey = normaliseKey(player.player)
  const textClass = compact ? "text-[10px]" : "text-[11px]"

  if (displayMode === "fantasy") {
    if (!canAccessFantasyProjections) {
      return <div className={`${textClass} font-semibold leading-tight text-emerald-100/60`}>-</div>
    }
    return player.fantasyProjection != null ? (
      <div className={`${textClass} font-semibold leading-tight text-emerald-100/90`}>{Math.round(player.fantasyProjection)} proj</div>
    ) : (
      <div className={`${textClass} font-semibold leading-tight text-emerald-100/60`}>-</div>
    )
  }

  if (displayMode === "odds") {
    const odds = tryscorerOdds[playerKey]
    const logo = resolveBookieLogo(odds?.bestBookie)
    return odds?.bestPrice != null ? (
      <div className={`mt-0.5 flex items-center justify-center gap-1 ${textClass} font-semibold leading-tight text-emerald-100/90`}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={odds.bestBookie ?? ""} className={`${compact ? "h-2.5" : "h-3"} w-auto object-contain`} loading="lazy" />
        ) : null}
        <span>{odds.bestPrice.toFixed(2)}</span>
      </div>
    ) : (
      <div className={`${textClass} font-semibold leading-tight text-emerald-100/60`}>-</div>
    )
  }

  return (
    <div className={`${textClass} font-semibold leading-tight text-emerald-100/90`}>
      {formatAverage(playerAverages[playerKey]?.[displayMode], displayMode)} avg
    </div>
  )
}

function playerSlot(player: LineupPlayer): Slot | null {
  const position = player.position.toLowerCase()
  if (position.includes("interchange") || position.includes("reserve")) return null
  if (player.number === 1 || position.includes("fullback")) return "FB"
  if (player.number === 6) return player.side === "right" ? "HLF" : "FE"
  if (player.number === 7) return player.side === "left" ? "FE" : "HLF"
  if (position.includes("five-eighth") || position.includes("five eighth")) return "FE"
  if (position.includes("halfback")) return "HLF"
  if (player.number === 9 || position.includes("hooker")) return "HK"
  if (player.number === 13 || position.includes("lock")) return "LK"
  if (position.includes("prop") || player.number === 8 || player.number === 10) return "PR"
  if (position.includes("wing") || player.number === 2 || player.number === 5) return player.side === "right" ? "RW" : "LW"
  if (position.includes("centre") || player.number === 3 || player.number === 4) return player.side === "right" ? "RC" : "LC"
  if (position.includes("row") || player.number === 11 || player.number === 12) return player.side === "right" ? "R2R" : "L2R"
  return null
}

function slotPosition(
  slot: Slot,
  player: LineupPlayer,
  side: "home" | "away",
  orientation: Orientation
): { left: string; top: string } {
  const depthMap = orientation === "portrait" ? PORTRAIT_DEPTH_X : DEPTH_X
  const laneMap = orientation === "portrait" ? PORTRAIT_LANE_Y : LANE_Y
  const propLane = orientation === "portrait" ? 82 : 79
  const depth = depthMap[slot]
  const lane = slot === "PR" && player.number === 10 ? propLane : laneMap[slot]

  if (orientation === "portrait") {
    const top = side === "home" ? depth : 100 - depth
    const left = side === "home" ? 100 - lane : lane
    return { left: `${left}%`, top: `${top}%` }
  }

  const left = side === "home" ? depth : 100 - depth
  const top = side === "home" ? lane : 100 - lane
  return { left: `${left}%`, top: `${top}%` }
}

function TeamBadge({ team, teamLogos }: { team: LineupTeam | null; teamLogos: Record<string, string> }) {
  const logo = resolveLogo(team, teamLogos)
  const shortName = team?.team ?? team?.teamName ?? "TBC"
  const fullName = team?.teamName ?? team?.team ?? "TBC"

  return (
    <div className="flex min-w-0 max-w-full flex-col items-center justify-center gap-2 overflow-hidden text-center">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" loading="lazy" />
      ) : null}
      <div className="w-full min-w-0">
        <div className="truncate text-sm font-bold text-nrl-text sm:hidden">{shortName}</div>
        <div className="hidden truncate text-base font-bold text-nrl-text sm:block">{fullName}</div>
      </div>
    </div>
  )
}

function PitchPlayer({
  player,
  side,
  orientation,
  displayMode,
  tryscorerOdds,
  playerAverages,
  canAccessFantasyProjections,
}: {
  player: LineupPlayer
  side: "home" | "away"
  orientation: Orientation
  displayMode: DisplayMode
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  canAccessFantasyProjections: boolean
}) {
  const slot = playerSlot(player)
  if (!slot) return null
  const imageUrl = normaliseImageUrl(player.headImage ?? player.bodyImage)
  const position = slotPosition(slot, player, side, orientation)
  const compact = orientation === "portrait"

  return (
    <div
      className={`${compact ? "w-14 sm:w-16" : "w-20"} absolute z-[2] -translate-x-1/2 -translate-y-1/2 text-center`}
      style={position}
      title={`${player.player}${player.sideSource === "override" ? " - side override" : ""}`}
    >
      <div className={`${compact ? "h-9 w-9 sm:h-10 sm:w-10" : "h-12 w-12"} relative mx-auto`}>
        <div className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-white/75 bg-nrl-panel shadow-[0_8px_18px_rgba(0,0,0,0.32)]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
          ) : (
            <span className="text-[10px] font-bold text-nrl-muted">{initials(player.player)}</span>
          )}
        </div>
        <div className={`${compact ? "-right-3 px-1.5 text-[9px]" : "-right-3.5 px-2 text-[10px]"} absolute -top-1 rounded-full bg-blue-950 py-0.5 font-bold text-white`}>
          {slot}
        </div>
      </div>
      <div className={`${compact ? "max-w-[3.45rem] text-[9px]" : "text-[11px]"} mx-auto mt-1 truncate font-bold leading-tight text-white drop-shadow`} title={player.player}>
        {displayName(player)}
      </div>
      <PlayerMetric
        player={player}
        displayMode={displayMode}
        tryscorerOdds={tryscorerOdds}
        playerAverages={playerAverages}
        canAccessFantasyProjections={canAccessFantasyProjections}
        compact={compact}
      />
    </div>
  )
}

function FieldLines({ orientation }: { orientation: Orientation }) {
  const marks = [8, 16.5, 25, 33.5, 41.5, 58.5, 66.5, 75, 83.5, 92]
  return (
    <div className="pointer-events-none absolute inset-0">
      {orientation === "portrait" ? (
        <>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-emerald-200/45" />
          {marks.map((top) => (
            <div key={top} className="absolute inset-x-0 h-px bg-emerald-200/20" style={{ top: `${top}%` }} />
          ))}
          <div className="absolute left-1/2 top-[7%] h-8 w-0.5 -translate-x-1/2 bg-emerald-200/35" />
          <div className="absolute bottom-[7%] left-1/2 h-8 w-0.5 -translate-x-1/2 bg-emerald-200/35" />
        </>
      ) : (
        <>
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-emerald-200/45" />
          {marks.map((left) => (
            <div key={left} className="absolute inset-y-0 w-px bg-emerald-200/20" style={{ left: `${left}%` }} />
          ))}
          <div className="absolute left-[7%] top-1/2 h-0.5 w-8 -translate-y-1/2 bg-emerald-200/35" />
          <div className="absolute right-[7%] top-1/2 h-0.5 w-8 -translate-y-1/2 bg-emerald-200/35" />
        </>
      )}
    </div>
  )
}

function Pitch({
  homePlayers,
  awayPlayers,
  orientation,
  displayMode,
  onDisplayModeChange,
  canAccessFantasyProjections,
  tryscorerOdds,
  playerAverages,
}: {
  homePlayers: LineupPlayer[]
  awayPlayers: LineupPlayer[]
  orientation: Orientation
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  canAccessFantasyProjections: boolean
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
}) {
  const sizeClass =
    orientation === "portrait"
      ? "mx-auto h-[840px] w-full max-w-[460px] md:hidden"
      : "hidden h-[520px] w-full md:block"

  return (
    <div className={`${sizeClass} relative overflow-hidden rounded-lg border-2 border-emerald-300/45 bg-[radial-gradient(circle_at_50%_50%,rgba(0,245,138,0.16),transparent_30%),linear-gradient(90deg,rgba(8,26,33,0.98),rgba(15,112,73,0.92)_50%,rgba(8,26,33,0.98))]`}>
      <FieldLines orientation={orientation} />
      <div className={orientation === "portrait" ? "absolute left-2 top-2 z-[4]" : "absolute left-1/2 top-3 z-[4] -translate-x-1/2"}>
        <DisplayModeControl
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          canAccessFantasyProjections={canAccessFantasyProjections}
          compact={orientation === "portrait"}
        />
      </div>
      {homePlayers.map((player) => (
        <PitchPlayer
          key={`${orientation}-${player.team}-${player.playerId ?? player.number ?? player.player}`}
          player={player}
          side="home"
          orientation={orientation}
          displayMode={displayMode}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
          canAccessFantasyProjections={canAccessFantasyProjections}
        />
      ))}
      {awayPlayers.map((player) => (
        <PitchPlayer
          key={`${orientation}-${player.team}-${player.playerId ?? player.number ?? player.player}`}
          player={player}
          side="away"
          orientation={orientation}
          displayMode={displayMode}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
          canAccessFantasyProjections={canAccessFantasyProjections}
        />
      ))}
    </div>
  )
}

function TeamBench({ team }: { team: LineupTeam | null }) {
  const bench = team?.players.filter((player) => !playerSlot(player)) ?? []
  return (
    <div className="min-w-0 rounded-md border border-nrl-border bg-nrl-panel/70 p-2">
      <div className="mb-1 truncate text-[10px] font-bold uppercase tracking-wide text-nrl-muted">{team?.team ?? "Team"} bench</div>
      {bench.length > 0 ? (
        <div className="grid gap-1 text-[11px] text-nrl-text">
          {bench.map((player) => (
            <div key={`${player.team}-${player.playerId ?? player.number ?? player.player}`} className="truncate">
              <span className="font-semibold text-nrl-muted">{player.number ?? "-"}</span> {player.player}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-nrl-muted">No bench listed</div>
      )}
    </div>
  )
}

function getTeamOuts(team: LineupTeam | null, casualtyWardOuts: Record<string, LineupCasualtyOut[]>): LineupCasualtyOut[] {
  if (!team) return []
  const namedPlayers = new Set(team.players.map((player) => normaliseKey(player.player)).filter(Boolean))
  const candidates = [team.teamName, team.team]
  for (const candidate of candidates) {
    const outs = casualtyWardOuts?.[normaliseKey(candidate)]
    if (outs?.length) return outs.filter((out) => !namedPlayers.has(normaliseKey(out.player)))
  }
  return []
}

function TeamNotableOuts({ team, outs }: { team: LineupTeam | null; outs: LineupCasualtyOut[] }) {
  return (
    <div className="min-w-0 rounded-md bg-nrl-panel/55 p-2">
      <div className="truncate text-[10px] font-bold uppercase tracking-wide text-nrl-muted">{team?.team ?? "Team"}</div>
      {outs.length > 0 ? (
        <div className="mt-1.5 grid gap-1.5">
          {outs.map((out) => (
            <div key={`${out.team}-${out.player}-${out.injury ?? ""}-${out.returnDate ?? ""}`} className="min-w-0">
              <div className="truncate text-[11px] font-semibold leading-tight text-nrl-text">{out.player}</div>
              <div className="truncate text-[10px] leading-tight text-nrl-muted">
                {out.injury ?? "Unavailable"} · Return: {out.returnDate ?? "TBC"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-nrl-muted">No notable outs listed</div>
      )}
    </div>
  )
}

function InjuryIcon() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-red-300/35 bg-red-500/15 text-red-100" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function NotableOuts({
  homeTeam,
  awayTeam,
  casualtyWardOuts,
}: {
  homeTeam: LineupTeam | null
  awayTeam: LineupTeam | null
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
}) {
  const homeOuts = getTeamOuts(homeTeam, casualtyWardOuts)
  const awayOuts = getTeamOuts(awayTeam, casualtyWardOuts)
  const totalOuts = homeOuts.length + awayOuts.length

  return (
    <details className="group/notable mt-3 overflow-hidden rounded-md border border-nrl-border bg-nrl-panel/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <InjuryIcon />
          <span className="truncate text-[10px] font-bold uppercase tracking-wide text-nrl-muted">Notable Outs</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold tabular-nums text-nrl-muted">{totalOuts}</span>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 text-nrl-muted transition-transform group-open/notable:rotate-180"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="grid gap-2 border-t border-nrl-border p-2 sm:grid-cols-2">
        <TeamNotableOuts team={homeTeam} outs={homeOuts} />
        <TeamNotableOuts team={awayTeam} outs={awayOuts} />
      </div>
    </details>
  )
}

function DisplayModeControl({
  displayMode,
  onDisplayModeChange,
  canAccessFantasyProjections,
  compact = false,
}: {
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  canAccessFantasyProjections: boolean
  compact?: boolean
}) {
  const displayModes = displayModesForAccess(canAccessFantasyProjections)

  return (
    <label className={compact ? "block w-24" : "block w-[174px] max-w-[44vw]"}>
      <span className="sr-only">Display</span>
      <select
        value={displayMode}
        onChange={(event) => onDisplayModeChange(event.target.value as DisplayMode)}
        className={`${compact ? "text-[10px]" : "text-[11px]"} w-full rounded-md border border-emerald-300/35 bg-nrl-panel/90 px-2 py-1.5 font-semibold text-nrl-text shadow-[0_8px_18px_rgba(0,0,0,0.24)] outline-none backdrop-blur transition-colors hover:border-nrl-accent/50 focus:border-nrl-accent`}
      >
        {displayModes.map((mode) => (
          <option key={mode.key} value={mode.key}>
            {compact ? mode.shortLabel : mode.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function LineupCard({
  match,
  index,
  teamLogos,
  displayMode,
  onDisplayModeChange,
  tryscorerOdds,
  canAccessNotableOuts,
  canAccessFantasyProjections,
  casualtyWardOuts,
  playerAverages,
}: {
  match: LineupMatch
  index: number
  teamLogos: Record<string, string>
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  canAccessNotableOuts: boolean
  canAccessFantasyProjections: boolean
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
  playerAverages: Record<string, Record<AverageStatKey, number>>
}) {
  const homePlayers = match.homeTeam?.players ?? []
  const awayPlayers = match.awayTeam?.players ?? []

  return (
    <details className="group overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel-2" open={index === 0}>
      <summary className="cursor-pointer list-none px-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamBadge team={match.homeTeam} teamLogos={teamLogos} />
          <div className="rounded-full border border-nrl-border bg-nrl-panel px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-nrl-accent">
            vs
          </div>
        <TeamBadge team={match.awayTeam} teamLogos={teamLogos} />
        </div>
        <div className="mt-2 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide text-nrl-accent">{match.round}</div>
          <div className="truncate text-[11px] text-nrl-muted">{formatKickoff(match.kickoffUtc)}{match.venue ? ` · ${match.venue}` : ""}</div>
          <span className="mt-2 inline-flex rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted transition-colors group-hover:text-nrl-text">
            <span className="group-open:hidden">Show lineups</span>
            <span className="hidden group-open:inline">Hide lineups</span>
          </span>
        </div>
      </summary>

      <div className="border-t border-nrl-border px-2 pb-3 sm:px-3">
        <div className="pt-3" />
        <Pitch
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          orientation="portrait"
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          canAccessFantasyProjections={canAccessFantasyProjections}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
        />
        <Pitch
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          orientation="landscape"
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          canAccessFantasyProjections={canAccessFantasyProjections}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <TeamBench team={match.homeTeam} />
          <TeamBench team={match.awayTeam} />
        </div>
        {canAccessNotableOuts ? (
          <NotableOuts
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            casualtyWardOuts={casualtyWardOuts}
          />
        ) : null}
      </div>
    </details>
  )
}

export function LineupsDashboard({
  matches,
  teamLogos,
  tryscorerOdds,
  canAccessNotableOuts,
  canAccessFantasyProjections,
  casualtyWardOuts,
  playerAverages,
}: LineupsDashboardProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>(canAccessFantasyProjections ? "fantasy" : "odds")
  const matchDateGroups = matches.reduce<Array<{ dateKey: string; matches: Array<{ match: LineupMatch; index: number }> }>>(
    (groups, match, index) => {
      const dateKey = matchDateKey(match)
      const currentGroup = groups.at(-1)
      if (currentGroup?.dateKey === dateKey) {
        currentGroup.matches.push({ match, index })
      } else {
        groups.push({ dateKey, matches: [{ match, index }] })
      }
      return groups
    },
    []
  )

  return (
    <div className="space-y-3">
      {matches.length > 0 ? (
        <div className="space-y-6">
          {matchDateGroups.map((group) => (
            <section key={group.dateKey} className="space-y-3">
              <div className="px-1 text-xs font-bold uppercase tracking-[0.18em] text-nrl-accent/90">
                {formatMatchDateHeader(group.dateKey)}
              </div>
              {group.matches.map(({ match, index }) => (
                <LineupCard
                  key={match.matchId}
                  match={match}
                  index={index}
                  teamLogos={teamLogos}
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  tryscorerOdds={tryscorerOdds}
                  canAccessNotableOuts={canAccessNotableOuts}
                  canAccessFantasyProjections={canAccessFantasyProjections}
                  casualtyWardOuts={casualtyWardOuts}
                  playerAverages={playerAverages}
                />
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}

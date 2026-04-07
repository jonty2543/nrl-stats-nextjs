"use client"

import Link from "next/link"
import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolvePlayerImage } from "@/components/views/player-comparison"
import type { Draw2026Data } from "@/lib/draw/types"
import type { FantasyPlayerSnapshot } from "@/lib/fantasy/nrl"
import { buildDraftPricingResult, type DraftPricingMatchup, type DraftPricingPlayer, type DraftPricingResult } from "@/lib/fantasy/draft-pricing"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

type DraftLoadSource = "browser" | "pasted"
type CaptainSelections = Record<string, string | null>
type BannerState = { kind: "error" | "info" | "success"; text: string } | null
type BrowserImportPayload = {
  type: "nrl-draft-import"
  leagueId: string
  round: number
  showRaw: unknown
  rostersRaw: unknown
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "true")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    textarea.style.pointerEvents = "none"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    const copied = document.execCommand("copy")
    document.body.removeChild(textarea)
    return copied
  }
}

function formatScore(value: number | null): string {
  return value == null ? "-" : value.toFixed(1)
}

function formatOdds(value: number): string {
  return value.toFixed(2)
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * absX)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)
  return sign * y
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)))
}

function fairDecimalOdds(probability: number): number {
  const bounded = Math.min(0.985, Math.max(0.015, probability))
  return Math.round((1 / bounded) * 100) / 100
}

function toRound(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
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

async function fetchFantasyBrowserJson(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    })
  } catch {
    throw new Error("Browser import failed before the request completed. On localhost this is usually because fantasy.nrl.com does not allow cross-origin browser reads from your app, even if you are logged in. Use pasted JSON instead.")
  }

  const text = await response.text()
  const trimmed = text.trim()

  if (!trimmed) {
    throw new Error("Fantasy returned an empty response.")
  }

  if (trimmed.startsWith("<")) {
    throw new Error("Fantasy returned HTML instead of JSON. Make sure you are signed into fantasy.nrl.com in this browser and have the league open.")
  }

  let payload: unknown
  try {
    payload = JSON.parse(trimmed)
  } catch {
    throw new Error("Fantasy returned invalid JSON.")
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const errorRows = (payload as { errors?: Array<{ code?: unknown; text?: unknown }> }).errors
    if (Array.isArray(errorRows) && errorRows.length > 0) {
      const authError = errorRows.find((entry) => Number(entry.code) === 401)
      if (authError) {
        throw new Error(
          typeof authError.text === "string"
            ? `Fantasy denied the request: ${authError.text}. Make sure you are logged in and can open that league in the same browser session.`
            : "Fantasy requires authorization for that league. Make sure you are logged in and can open it in the same browser session."
        )
      }
    }
  }

  if (!response.ok) {
    throw new Error(`Fantasy request failed: ${response.status} ${response.statusText}`)
  }

  return payload
}

function buildFantasyImportHelperSnippet({
  leagueId,
  round,
  targetOrigin,
}: {
  leagueId: string
  round: number | null
  targetOrigin: string
}): string {
  return `(async () => {
  const leagueId = ${JSON.stringify(leagueId)};
  const roundOverride = ${round == null ? "null" : String(round)};
  const targetOrigin = ${JSON.stringify(targetOrigin)};
  const targetWindow = window.opener;

  if (!targetWindow) {
    alert("Reopen the Fantasy helper from the NRL app tab so the import can send data back automatically.");
    return;
  }

  const inferRound = (showRaw) => {
    if (!showRaw || typeof showRaw !== "object" || Array.isArray(showRaw)) return null;
    const wrapped = showRaw;
    const root =
      wrapped.result && typeof wrapped.result === "object" && !Array.isArray(wrapped.result)
        ? wrapped.result
        : wrapped;
    const league = root.league && typeof root.league === "object" && !Array.isArray(root.league) ? root.league : root;
    const direct = league.current_round ?? league.round ?? root.current_round ?? root.round;
    const parsed = typeof direct === "number" ? direct : typeof direct === "string" ? Number(direct) : null;
    if (parsed != null && Number.isFinite(parsed)) return Math.trunc(parsed);

    const fixture = league.fixture;
    if (fixture && typeof fixture === "object" && !Array.isArray(fixture)) {
      const rounds = Object.keys(fixture)
        .map((key) => Number(key))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      if (rounds.length > 0) return Math.trunc(rounds[0]);
    }

    return null;
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const text = await response.text();
    const trimmed = text.trim();

    if (!trimmed) throw new Error("Fantasy returned an empty response.");
    if (trimmed.startsWith("<")) {
      throw new Error("Fantasy returned HTML instead of JSON. Make sure you are signed into fantasy.nrl.com in this tab.");
    }

    const payload = JSON.parse(trimmed);
    if (payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.errors) && payload.errors.length > 0) {
      const authError = payload.errors.find((entry) => Number(entry?.code) === 401);
      if (authError) {
        throw new Error(
          typeof authError.text === "string"
            ? "Fantasy denied the request: " + authError.text
            : "Fantasy requires authorization for that league."
        );
      }
    }

    if (!response.ok) {
      throw new Error("Fantasy request failed: " + response.status + " " + response.statusText);
    }

    return payload;
  };

  try {
    const showRaw = await fetchJson("https://fantasy.nrl.com/nrl_draft/api/leagues_draft/show?id=" + encodeURIComponent(leagueId) + "&_=" + Date.now());
    const round = roundOverride ?? inferRound(showRaw);
    if (round == null) throw new Error("Unable to infer the round from the league response. Enter the round manually in the NRL app.");
    const rostersRaw = await fetchJson("https://fantasy.nrl.com/nrl_draft/api/leagues_draft/rosters?league_id=" + encodeURIComponent(leagueId) + "&round=" + round);
    targetWindow.postMessage({ type: "nrl-draft-import", leagueId, round, showRaw, rostersRaw }, targetOrigin);
    alert("Draft data sent back to the NRL app tab.");
    window.close();
  } catch (error) {
    console.error(error);
    alert(error instanceof Error ? error.message : String(error));
  }
})();`
}

function playerImageSources(
  player: DraftPricingPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
): string[] {
  const canonicalName = player.id != null ? fantasyPlayersById.get(player.id)?.name ?? player.name : player.name
  const row = resolvePlayerImage(canonicalName, null, playerImages)
  const out: string[] = []
  const seen = new Set<string>()

  const push = (value: string | null | undefined) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  const pushVariants = (value: string | null | undefined) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed) return
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
  }

  for (const source of [row?.body_image, row?.head_image]) {
    pushVariants(source)
  }
  push("/body-shot.png")
  return out
}

function captainTeamKey(matchupId: string, teamId: string): string {
  return `${matchupId}:${teamId}`
}

function captainPlayerKey(player: DraftPricingPlayer, index: number): string {
  return `${player.id ?? player.name}:${index}`
}

function defaultCaptainKey(players: DraftPricingPlayer[]): string | null {
  let bestIndex = -1
  let bestProjection = -Infinity

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index]
    if (player.isBench || player.isEmergency || player.isBye) continue
    if (player.projection > bestProjection) {
      bestProjection = player.projection
      bestIndex = index
    }
  }

  return bestIndex >= 0 ? captainPlayerKey(players[bestIndex], bestIndex) : null
}

function defaultCaptainSelectionsForResult(result: DraftPricingResult): CaptainSelections {
  const out: CaptainSelections = {}
  for (const matchup of result.matchups) {
    out[captainTeamKey(matchup.id, matchup.homeTeam.id)] = defaultCaptainKey(matchup.homeTeam.players)
    out[captainTeamKey(matchup.id, matchup.awayTeam.id)] = defaultCaptainKey(matchup.awayTeam.players)
  }
  return out
}

function adjustedPlayerProjection(player: DraftPricingPlayer, isCaptain: boolean): number {
  return player.projection + (isCaptain ? player.projection : 0)
}

function adjustedPlayerActual(player: DraftPricingPlayer, isCaptain: boolean): number | null {
  if (player.actualScore == null) return null
  return player.actualScore + (isCaptain ? player.actualScore : 0)
}

function TeamRosterColumn({
  matchupId,
  teamId,
  title,
  coach,
  projected,
  actual,
  players,
  selectedCaptainKey,
  onSelectCaptain,
  fantasyPlayersById,
  playerImages,
}: {
  matchupId: string
  teamId: string
  title: string
  coach: string | null
  projected: number
  actual: number | null
  players: DraftPricingPlayer[]
  selectedCaptainKey: string | null
  onSelectCaptain: (captainKey: string | null) => void
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  playerImages: PlayerImageRecord[]
}) {
  const starters = players.filter((player) => !player.isBench)
  const benchPlayers = players.filter((player) => player.isBench)

  return (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-nrl-text">{title}</div>
          {coach ? <div className="mt-1 text-xs text-nrl-muted">{coach}</div> : null}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-nrl-accent">{formatScore(projected)}</div>
          <div className="text-[11px] text-nrl-muted">Projected</div>
          {actual != null ? <div className="mt-1 text-xs font-semibold text-nrl-text">Live {formatScore(actual)}</div> : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {starters.map((player, index) => {
          const rowCaptainKey = captainPlayerKey(player, index)
          const canCaptain = !player.isEmergency && !player.isBye
          const isCaptain = selectedCaptainKey === rowCaptainKey
          const displayName = player.id != null ? fantasyPlayersById.get(player.id)?.name ?? player.name : player.name
          const sources = playerImageSources(player, fantasyPlayersById, playerImages)
          const playerProjection = adjustedPlayerProjection(player, isCaptain)
          const playerActual = adjustedPlayerActual(player, isCaptain)
          return (
            <div
              key={`${player.id ?? player.name}-${index}`}
              className={`flex items-center gap-3 rounded-lg border px-2.5 py-2 ${
                player.isEmergency
                  ? "border-nrl-border/60 bg-nrl-panel-2/50 opacity-65"
                  : player.isBye
                    ? "border-nrl-border/60 bg-nrl-panel-2/40 opacity-60"
                  : isCaptain
                    ? "border-orange-400/80 bg-orange-500/8 shadow-[0_0_0_1px_rgba(251,146,60,0.35)]"
                    : "border-nrl-border bg-nrl-panel-2"
              }`}
            >
              <div className="flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_18%,rgba(71,255,182,0.14),transparent_48%),linear-gradient(180deg,rgba(33,40,73,0.96),rgba(16,20,39,0.98))]">
                {sources.length > 0 ? (
                  <ImageWithFallback sources={sources} alt={displayName} className="h-full w-full object-contain object-bottom" />
                ) : (
                  <div className="text-[10px] text-nrl-muted">No image</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-nrl-text">{displayName}</div>
                <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-nrl-muted">
                  {player.isEmergency ? <span className="text-amber-300">Emergency</span> : null}
                  {player.isBye ? <span className="text-rose-300">Bye</span> : null}
                  {isCaptain ? <span className="text-orange-300">Captain</span> : null}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-nrl-accent">{formatScore(playerProjection)}</div>
                <div className="text-[10px] text-nrl-muted">Proj</div>
                {playerActual != null ? (
                  <div className="mt-1 text-[11px] font-semibold text-nrl-text">{formatScore(playerActual)}</div>
                ) : null}
              </div>
              {canCaptain ? (
                <button
                  type="button"
                  onClick={() => onSelectCaptain(isCaptain ? null : rowCaptainKey)}
                  className={`cursor-pointer rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                    isCaptain
                      ? "border-orange-400/80 bg-orange-500/12 text-orange-200"
                      : "border-nrl-border bg-nrl-panel text-nrl-muted hover:border-orange-400/70 hover:text-orange-200"
                  }`}
                >
                  C
                </button>
              ) : null}
            </div>
          )
        })}

        {benchPlayers.length > 0 ? (
          <>
            <div className="my-3 border-t border-nrl-border/70 pt-3 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
              Bench
            </div>
            {benchPlayers.map((player, index) => {
              const displayName = player.id != null ? fantasyPlayersById.get(player.id)?.name ?? player.name : player.name
              const sources = playerImageSources(player, fantasyPlayersById, playerImages)
              return (
                <div
                  key={`${matchupId}-${teamId}-bench-${player.id ?? player.name}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-nrl-border/60 bg-nrl-panel-2/40 px-2.5 py-2 opacity-55"
                >
                  <div className="flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_18%,rgba(71,255,182,0.12),transparent_48%),linear-gradient(180deg,rgba(33,40,73,0.9),rgba(16,20,39,0.96))]">
                    {sources.length > 0 ? (
                      <ImageWithFallback sources={sources} alt={displayName} className="h-full w-full object-contain object-bottom grayscale-[0.25]" />
                    ) : (
                      <div className="text-[10px] text-nrl-muted">No image</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-nrl-text">{displayName}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-nrl-muted">
                      <span>Bench</span>
                      {player.isBye ? <span className="text-rose-300">Bye</span> : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-nrl-muted">{formatScore(player.projection)}</div>
                    <div className="text-[10px] text-nrl-muted">Proj</div>
                    {player.actualScore != null ? (
                      <div className="mt-1 text-[11px] font-semibold text-nrl-muted">{formatScore(player.actualScore)}</div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </>
        ) : null}
      </div>
    </div>
  )
}

function MatchupMarketCard({
  matchup,
  captainSelections,
  onSelectCaptain,
  fantasyPlayersById,
  playerImages,
  expanded,
  onToggleExpanded,
}: {
  matchup: DraftPricingMatchup
  captainSelections: CaptainSelections
  onSelectCaptain: (teamSelectionKey: string, captainKey: string | null) => void
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  playerImages: PlayerImageRecord[]
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const homeSelectionKey = captainTeamKey(matchup.id, matchup.homeTeam.id)
  const awaySelectionKey = captainTeamKey(matchup.id, matchup.awayTeam.id)
  const homeCaptainKey = captainSelections[homeSelectionKey] ?? null
  const awayCaptainKey = captainSelections[awaySelectionKey] ?? null

  const adjustedTeamTotals = (team: DraftPricingMatchup["homeTeam"], selectedCaptainKey: string | null) => {
    const starters = team.players.filter((player) => !player.isBench && !player.isEmergency && !player.isBye)
    const selectedPlayer = starters.find((player, index) => captainPlayerKey(player, index) === selectedCaptainKey) ?? null
    const captainProjectionBonus = selectedPlayer?.projection ?? 0
    const captainActualBonus = selectedPlayer?.actualScore ?? null
    return {
      projected: team.projectedTotal + captainProjectionBonus,
      actual: team.actualTotal == null ? null : team.actualTotal + (captainActualBonus ?? 0),
      variance: team.standardDeviation ** 2 + (selectedPlayer ? selectedPlayer.standardDeviation ** 2 : 0),
    }
  }

  const adjustedHome = adjustedTeamTotals(matchup.homeTeam, homeCaptainKey)
  const adjustedAway = adjustedTeamTotals(matchup.awayTeam, awayCaptainKey)
  const marginSd = Math.max(8, Math.sqrt(adjustedHome.variance + adjustedAway.variance))
  const projectedMargin = adjustedHome.projected - adjustedAway.projected
  const homeWinProbability = normalCdf(projectedMargin / marginSd)
  const awayWinProbability = 1 - homeWinProbability
  const homeOdds = fairDecimalOdds(homeWinProbability)
  const awayOdds = fairDecimalOdds(awayWinProbability)

  return (
    <article className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
            {matchup.round != null ? `Round ${matchup.round}` : "Matchup"}
          </div>
          <div className="mt-1 text-lg font-semibold text-nrl-text">
            {matchup.homeTeam.label} vs {matchup.awayTeam.label}
          </div>
          <div className="mt-1 text-xs text-nrl-muted">
            {matchup.homeTeam.coachLabel ?? matchup.homeTeam.label} vs {matchup.awayTeam.coachLabel ?? matchup.awayTeam.label}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border border-nrl-accent/45 bg-nrl-accent/10 px-4 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-nrl-muted">{matchup.homeTeam.label}</div>
            <div className="mt-1 text-lg font-bold text-nrl-accent">
              {formatOdds(homeOdds)}
            </div>
          </div>
          <div className="rounded-md border border-nrl-border bg-nrl-panel-2 px-4 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-nrl-muted">{matchup.awayTeam.label}</div>
            <div className="mt-1 text-lg font-bold text-nrl-text">
              {formatOdds(awayOdds)}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
          >
            {expanded ? "Hide Teams" : "Show Teams"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <TeamRosterColumn
            matchupId={matchup.id}
            teamId={matchup.homeTeam.id}
            title={matchup.homeTeam.label}
            coach={matchup.homeTeam.coachLabel}
            projected={Math.round(adjustedHome.projected * 10) / 10}
            actual={adjustedHome.actual == null ? null : Math.round(adjustedHome.actual * 10) / 10}
            players={matchup.homeTeam.players}
            selectedCaptainKey={homeCaptainKey}
            onSelectCaptain={(captainKey) => onSelectCaptain(homeSelectionKey, captainKey)}
            fantasyPlayersById={fantasyPlayersById}
            playerImages={playerImages}
          />
          <TeamRosterColumn
            matchupId={matchup.id}
            teamId={matchup.awayTeam.id}
            title={matchup.awayTeam.label}
            coach={matchup.awayTeam.coachLabel}
            projected={Math.round(adjustedAway.projected * 10) / 10}
            actual={adjustedAway.actual == null ? null : Math.round(adjustedAway.actual * 10) / 10}
            players={matchup.awayTeam.players}
            selectedCaptainKey={awayCaptainKey}
            onSelectCaptain={(captainKey) => onSelectCaptain(awaySelectionKey, captainKey)}
            fantasyPlayersById={fantasyPlayersById}
            playerImages={playerImages}
          />
        </div>
      ) : null}
    </article>
  )
}

export function FantasyDraftPricingPage({
  playerImages,
  fantasyPlayers,
  coachProjectionsRaw,
  draw2026Data,
}: {
  playerImages: PlayerImageRecord[]
  fantasyPlayers: FantasyPlayerSnapshot[]
  coachProjectionsRaw: unknown
  draw2026Data: Draw2026Data | null
}) {
  const [leagueId, setLeagueId] = useState("62872")
  const [round, setRound] = useState("")
  const [showJsonInput, setShowJsonInput] = useState(false)
  const [showJson, setShowJson] = useState("")
  const [rostersJson, setRostersJson] = useState("")
  const [result, setResult] = useState<DraftPricingResult | null>(null)
  const [banner, setBanner] = useState<BannerState>(null)
  const [expandedMatchups, setExpandedMatchups] = useState<Record<string, boolean>>({})
  const [captainSelections, setCaptainSelections] = useState<CaptainSelections>({})
  const [loadedShowRaw, setLoadedShowRaw] = useState<unknown | null>(null)
  const [loadedRostersRaw, setLoadedRostersRaw] = useState<unknown | null>(null)
  const [loadSource, setLoadSource] = useState<DraftLoadSource | null>(null)
  const [helperSnippet, setHelperSnippet] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeRound = result?.round != null ? String(result.round) : round

  const availableRounds = useMemo(() => result?.availableRounds ?? [], [result])
  const toggleRounds = useMemo(() => {
    if (availableRounds.length === 0) return []
    const active = result?.round ?? null
    if (active == null) return availableRounds.slice(0, 3)
    const startIndex = Math.max(0, availableRounds.indexOf(active))
    return availableRounds.slice(startIndex, startIndex + 3)
  }, [availableRounds, result?.round])
  const fantasyPlayersById = useMemo(() => new Map(fantasyPlayers.map((player) => [player.id, player])), [fantasyPlayers])
  const fantasyPlayerTeams = useMemo(
    () =>
      Object.fromEntries(
        fantasyPlayers.map((player) => [player.id, resolvePlayerImage(player.name, null, playerImages)?.team ?? null])
      ),
    [fantasyPlayers, playerImages]
  )

  const applyResult = (nextResult: DraftPricingResult) => {
    setResult(nextResult)
    setBanner(null)
    setHelperSnippet(null)
    setExpandedMatchups(
      Object.fromEntries(nextResult.matchups.map((matchup) => [matchup.id, true]))
    )
    setCaptainSelections(defaultCaptainSelectionsForResult(nextResult))
  }

  const applyImportedPayload = (payload: BrowserImportPayload) => {
    setLeagueId(payload.leagueId)
    setRound(String(payload.round))
    setLoadedShowRaw(payload.showRaw)
    setLoadedRostersRaw(payload.rostersRaw)
    setLoadSource("browser")
    applyResult(
      buildDraftPricingResult({
        leagueId: payload.leagueId,
        round: payload.round,
        showRaw: payload.showRaw,
        rostersRaw: payload.rostersRaw,
        projectionsRaw: coachProjectionsRaw,
        fantasyPlayers,
        fantasyPlayerTeams,
        draw2026Data,
      })
    )
    setBanner({ kind: "success", text: "Imported draft data from your Fantasy browser session." })
  }

  const handleFantasyImportMessage = useEffectEvent((payload: BrowserImportPayload) => {
    try {
      applyImportedPayload(payload)
    } catch (error) {
      setResult(null)
      setBanner({ kind: "error", text: error instanceof Error ? error.message : String(error) })
    }
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== "https://fantasy.nrl.com") return
      const payload = event.data
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return
      if ((payload as { type?: string }).type !== "nrl-draft-import") return

      handleFantasyImportMessage(payload as BrowserImportPayload)
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const startFantasyHelperImport = async (roundOverride?: string, helperWindow?: Window | null) => {
    const trimmedLeagueId = leagueId.trim()
    if (!trimmedLeagueId) {
      throw new Error("League ID is required.")
    }

    const helperRound = toRound((roundOverride ?? round).trim())
    const snippet = buildFantasyImportHelperSnippet({
      leagueId: trimmedLeagueId,
      round: helperRound,
      targetOrigin: window.location.origin,
    })
    setHelperSnippet(snippet)

    const copied = await copyText(snippet)

    const targetWindow = helperWindow ?? window.open("", "_blank")
    if (targetWindow) {
      targetWindow.location.assign("https://fantasy.nrl.com/nrl_draft/")
    }
    setBanner({
      kind: "info",
      text: targetWindow
        ? copied
          ? "Direct import is blocked here. A Fantasy helper script was copied to your clipboard and a Fantasy tab was opened. Paste into that tab's console and press Enter."
          : "Direct import is blocked here. A Fantasy tab was opened. Copy the helper script below, paste it into that tab's console, and press Enter."
        : "Direct import is blocked here and the helper tab was blocked by the browser. Allow popups for this page, then try again.",
    })
  }

  const prepareHelperWindow = (): Window | null => {
    const host = window.location.hostname
    if (host !== "localhost" && host !== "127.0.0.1") return null
    const helperWindow = window.open("", "_blank")
    if (helperWindow) {
      helperWindow.document.title = "Fantasy Import Helper"
      helperWindow.document.body.innerHTML =
        "<div style='font-family: system-ui; padding: 24px; color: #d7def7; background: #0f1327;'>Preparing Fantasy import helper...</div>"
    }
    return helperWindow
  }

  const rebuildFromRaw = (showRaw: unknown, rostersRaw: unknown, roundValue: number | null) => {
    applyResult(
      buildDraftPricingResult({
        leagueId: leagueId.trim() || "manual",
        round: roundValue,
        showRaw,
        rostersRaw,
        projectionsRaw: coachProjectionsRaw,
        fantasyPlayers,
        fantasyPlayerTeams,
        draw2026Data,
      })
    )
  }

  const loadPricingFromBrowser = async (roundOverride?: string, helperWindow?: Window | null) => {
    setBanner(null)
    const trimmedLeagueId = leagueId.trim()
    try {
      const showRaw = await fetchFantasyBrowserJson(`https://fantasy.nrl.com/nrl_draft/api/leagues_draft/show?id=${encodeURIComponent(trimmedLeagueId)}&_=${Date.now()}`)
      const effectiveRound = toRound((roundOverride ?? round).trim()) ?? inferCurrentRound(showRaw)
      if (effectiveRound == null) {
        throw new Error("Unable to infer the round from the league response. Enter the round manually.")
      }
      const [rostersRaw, projectionsRaw] = await Promise.all([
        fetchFantasyBrowserJson(`https://fantasy.nrl.com/nrl_draft/api/leagues_draft/rosters?league_id=${encodeURIComponent(trimmedLeagueId)}&round=${effectiveRound}`),
        Promise.resolve(coachProjectionsRaw),
      ])

      setLoadedShowRaw(showRaw)
      setLoadedRostersRaw(rostersRaw)
      setLoadSource("browser")
      helperWindow?.close()
      applyResult(
        buildDraftPricingResult({
          leagueId: trimmedLeagueId,
          round: effectiveRound,
          showRaw,
          rostersRaw,
          projectionsRaw,
          fantasyPlayers,
          fantasyPlayerTeams,
          draw2026Data,
        })
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const directImportBlocked =
        message.includes("Browser import failed before the request completed") ||
        message.includes("Failed to fetch")

      if (!directImportBlocked) {
        helperWindow?.close()
        throw error
      }

      await startFantasyHelperImport(roundOverride, helperWindow)
    }
  }

  const loadPricingFromPastedJson = async () => {
    setBanner(null)

    let parsedShow: unknown
    let parsedRosters: unknown

    try {
      parsedShow = JSON.parse(showJson)
    } catch {
      throw new Error("The pasted league show JSON is invalid.")
    }

    try {
      parsedRosters = JSON.parse(rostersJson)
    } catch {
      throw new Error("The pasted roster JSON is invalid.")
    }

    const effectiveRound = toRound(round.trim()) ?? inferCurrentRound(parsedShow)
    setLoadedShowRaw(parsedShow)
    setLoadedRostersRaw(parsedRosters)
    setLoadSource("pasted")
    rebuildFromRaw(parsedShow, parsedRosters, effectiveRound)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/fantasy"
          className="inline-flex items-center rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:text-nrl-accent"
        >
          Back to Fantasy Dashboard
        </Link>
      </div>

      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">Draft Matchup Prices</div>
            <h1 className="mt-1 text-xl font-bold text-nrl-text">Price draft and H2H leagues from live projections</h1>
          </div>

          <form
            className="grid gap-3 sm:grid-cols-[minmax(140px,180px)_120px_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              const helperWindow = prepareHelperWindow()
              startTransition(() => {
                void loadPricingFromBrowser(undefined, helperWindow).catch((loadError) => {
                  setResult(null)
                  setBanner({ kind: "error", text: loadError instanceof Error ? loadError.message : String(loadError) })
                })
              })
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">League ID</span>
              <input
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
                placeholder="62872"
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">Round</span>
              <input
                value={round}
                onChange={(event) => setRound(event.target.value)}
                placeholder="Auto"
                inputMode="numeric"
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
            <button
              type="submit"
              disabled={!leagueId.trim() || isPending}
              className="cursor-pointer rounded-md border border-nrl-accent/45 bg-nrl-accent/10 px-4 py-2 text-sm font-semibold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/16 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Importing..." : "Import From Browser Session"}
            </button>
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJsonInput((current) => !current)}
            className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
          >
            {showJsonInput ? "Hide Manual JSON" : "Use Pasted JSON Instead"}
          </button>
        </div>

        {showJsonInput ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">League Show JSON</span>
              <textarea
                value={showJson}
                onChange={(event) => setShowJson(event.target.value)}
                rows={8}
                placeholder='Paste the response from /nrl_draft/api/leagues_draft/show?...'
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">Roster JSON</span>
              <textarea
                value={rostersJson}
                onChange={(event) => setRostersJson(event.target.value)}
                rows={8}
                placeholder='Paste the response from /nrl_draft/api/leagues_draft/rosters?...'
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
            <div className="xl:col-span-2">
              <button
                type="button"
                disabled={!showJson.trim() || !rostersJson.trim() || isPending}
                onClick={() =>
                  startTransition(() => {
                    void loadPricingFromPastedJson().catch((loadError) => {
                      setResult(null)
                      setBanner({ kind: "error", text: loadError instanceof Error ? loadError.message : String(loadError) })
                    })
                  })
                }
                className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-4 py-2 text-sm font-semibold text-nrl-text transition-colors hover:border-nrl-accent hover:text-nrl-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Building..." : "Build From Pasted JSON"}
              </button>
            </div>
          </div>
        ) : null}

        {banner ? (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              banner.kind === "error"
                ? "border-red-500/35 bg-red-500/10 text-red-300"
                : banner.kind === "success"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-200"
            }`}
          >
            {banner.text}
          </div>
        ) : null}

        {helperSnippet ? (
          <div className="mt-4 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-nrl-muted">Fantasy Helper Script</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void copyText(helperSnippet).then((copied) => {
                      setBanner({
                        kind: copied ? "success" : "error",
                        text: copied ? "Helper script copied." : "Could not copy the helper script automatically. Select and copy it manually.",
                      })
                    })
                  }}
                  className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                >
                  Copy Script
                </button>
                <button
                  type="button"
                  onClick={() => window.open("https://fantasy.nrl.com/nrl_draft/", "_blank")}
                  className="cursor-pointer rounded-md border border-nrl-accent/45 bg-nrl-accent/10 px-3 py-1.5 text-xs font-semibold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/16"
                >
                  Open Fantasy Tab
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={helperSnippet}
              rows={10}
              className="mt-3 w-full rounded-md border border-nrl-border bg-[#0f1327] px-3 py-2 font-mono text-[11px] text-nrl-text outline-none"
            />
          </div>
        ) : null}

        {result ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2 text-[11px] text-nrl-muted">
              <span className="rounded border border-nrl-border bg-nrl-panel-2 px-2.5 py-1">
                {result.leagueName ?? `League ${result.leagueId}`}
              </span>
              {result.leagueType ? (
                <span className="rounded border border-nrl-border bg-nrl-panel-2 px-2.5 py-1">{result.leagueType}</span>
              ) : null}
              {result.generatedAt ? (
                <span className="rounded border border-nrl-border bg-nrl-panel-2 px-2.5 py-1">Updated {new Date(result.generatedAt).toLocaleString("en-AU")}</span>
              ) : null}
            </div>

            {toggleRounds.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">Round</div>
                <div className="flex flex-wrap gap-2">
                  {toggleRounds.map((roundOption) => {
                    const active = String(roundOption) === activeRound
                    return (
                      <button
                        key={roundOption}
                        type="button"
                        onClick={() => {
                          setRound(String(roundOption))
                          const helperWindow = prepareHelperWindow()
                          startTransition(() => {
                            if (loadSource === "pasted" && loadedShowRaw != null && loadedRostersRaw != null) {
                              helperWindow?.close()
                              try {
                                rebuildFromRaw(loadedShowRaw, loadedRostersRaw, roundOption)
                              } catch (loadError) {
                                setBanner({ kind: "error", text: loadError instanceof Error ? loadError.message : String(loadError) })
                              }
                              return
                            }

                            void loadPricingFromBrowser(String(roundOption), helperWindow).catch((loadError) => {
                              setBanner({ kind: "error", text: loadError instanceof Error ? loadError.message : String(loadError) })
                            })
                          })
                        }}
                        className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          active
                            ? "border-nrl-accent bg-nrl-accent/12 text-nrl-accent"
                            : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
                        }`}
                      >
                        {roundOption}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {result.warnings.length > 0 ? (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {result.warnings.join(" ")}
              </div>
            ) : null}

            {result.matchups.length > 0 ? (
              <div className="space-y-4">
                {result.matchups.map((matchup) => (
                  <MatchupMarketCard
                    key={matchup.id}
                    matchup={matchup}
                    captainSelections={captainSelections}
                    onSelectCaptain={(teamSelectionKey, captainKey) =>
                      setCaptainSelections((current) => ({ ...current, [teamSelectionKey]: captainKey }))
                    }
                    fantasyPlayersById={fantasyPlayersById}
                    playerImages={playerImages}
                    expanded={expandedMatchups[matchup.id] ?? true}
                    onToggleExpanded={() =>
                      setExpandedMatchups((current) => ({ ...current, [matchup.id]: !(current[matchup.id] ?? true) }))
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-nrl-border bg-nrl-panel-2 p-4 text-sm text-nrl-muted">
                No matchups were parsed for this league/round yet. The page is ready to iterate once we confirm the exact draft payload shape for a few live leagues.
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}

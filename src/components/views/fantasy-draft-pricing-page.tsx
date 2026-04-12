"use client"

import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { useEffect, useMemo, useState } from "react"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolvePlayerImage } from "@/components/views/player-comparison"
import type { Draw2026Data } from "@/lib/draw/types"
import type { FantasyPlayerSnapshot } from "@/lib/fantasy/nrl"
import {
  buildDraftPricingPlayerPool,
  type DraftPricingHistoricalPlayerSd,
  type DraftPricingHistoricalPositionSd,
  type DraftPricingPlayer,
  type DraftPricingPoolPlayer,
} from "@/lib/fantasy/draft-pricing"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

const DRAFT_SLOT_LABELS = ["HOK", "MID", "MID", "MID", "EDG", "EDG", "HLF", "HLF", "CTR", "CTR", "WFB", "WFB", "WFB"] as const
const H2H_BENCH_SLOT_LABELS = ["BEN", "BEN", "BEN", "BEN"] as const
const H2H_SLOT_LABELS = [...DRAFT_SLOT_LABELS, ...H2H_BENCH_SLOT_LABELS] as const
const DRAFT_PRICER_LOCAL_KEY_PREFIX = "fantasy-draft-pricer"
const DRAFT_PRICER_SAVED_TEAMS_LOCAL_KEY_PREFIX = "fantasy-draft-pricer-teams"

type MatchupMode = "draft" | "h2h"
type CaptainSelections = {
  home: number | null
  away: number | null
}

interface SavedDraftPricerState {
  mode?: MatchupMode
  round: string
  homeLabel: string
  awayLabel: string
  homeSlots: Array<number | null>
  awaySlots: Array<number | null>
  captainSelections: CaptainSelections
}

interface SavedDraftTeamPreset {
  id: string
  name: string
  label: string
  mode?: MatchupMode
  slots: Array<number | null>
  captainId: number | null
  updatedAt: string
}

const LEGACY_DEFAULT_TEAM_LABELS = new Set(["Paradisepalms", "Guns 'R' Us"])

function normaliseDraftTeamLabel(value: string): string {
  return LEGACY_DEFAULT_TEAM_LABELS.has(value.trim()) ? "" : value
}

function slotLabelsForMode(mode: MatchupMode): readonly string[] {
  return mode === "h2h" ? H2H_SLOT_LABELS : DRAFT_SLOT_LABELS
}

function buildEmptySlots(slotCount: number): Array<number | null> {
  return Array.from({ length: slotCount }, () => null)
}

function resizeSlots(values: Array<number | null>, slotCount: number): Array<number | null> {
  const next = values.slice(0, slotCount).map((value) => (typeof value === "number" ? value : null))
  while (next.length < slotCount) {
    next.push(null)
  }
  return next
}

function inferModeFromSlotCount(slotCount: number): MatchupMode {
  return slotCount > DRAFT_SLOT_LABELS.length ? "h2h" : "draft"
}

function matchesSlotLabel(player: DraftPricingPoolPlayer, slotLabel: string): boolean {
  return slotLabel === "BEN" ? true : player.positionLabels.includes(slotLabel)
}

function formatOdds(value: number | null): string {
  return value == null ? "--" : `$${value.toFixed(2)}`
}

function toRound(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function defaultRoundFromDraw(draw2026Data: Draw2026Data | null | undefined): number {
  const now = Date.now()
  const upcomingRound = draw2026Data?.rows.find((row) => {
    const kickoff = Date.parse(row.kickoff)
    return Number.isFinite(kickoff) && kickoff >= now
  })?.round

  return upcomingRound ?? draw2026Data?.rows[0]?.round ?? 1
}

function formatCompactPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return name
  return `${parts[0]?.[0] ?? ""}. ${parts.slice(1).join(" ")}`
}

function buildPlayerOptionLabel(player: DraftPricingPoolPlayer): string {
  return player.name
}

function playerImageSources(
  player: DraftPricingPlayer,
  playerPoolById: Map<number, DraftPricingPoolPlayer>,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
): string[] {
  const canonicalName = player.id != null ? fantasyPlayersById.get(player.id)?.name ?? player.name : player.name
  const teamHint = player.id != null ? playerPoolById.get(player.id)?.team ?? null : null
  const row = resolvePlayerImage(canonicalName, teamHint, playerImages)
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

function adjustedPlayerProjection(player: DraftPricingPlayer, isCaptain: boolean): number {
  return player.projection + (isCaptain ? player.projection : 0)
}

function effectivePlayerScore(player: DraftPricingPlayer, isCaptain: boolean): number {
  if (player.actualScore != null) {
    return player.actualScore * (isCaptain ? 2 : 1)
  }
  return adjustedPlayerProjection(player, isCaptain)
}

function effectivePlayerVariance(player: DraftPricingPlayer, isCaptain: boolean): number {
  if (player.actualScore != null) return 0
  if (Math.abs(player.projection) <= 0) return 0
  const multiplier = isCaptain ? 2 : 1
  return (player.standardDeviation * multiplier) ** 2
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

function resolveCaptainId(
  playerIds: Array<number | null>,
  preferredCaptainId: number | null,
  playerPoolById: Map<number, DraftPricingPoolPlayer>,
): number | null {
  const selectedIds = playerIds.filter((playerId): playerId is number => playerId != null)
  if (selectedIds.length === 0) return null

  if (preferredCaptainId != null && selectedIds.includes(preferredCaptainId)) {
    const preferredPlayer = playerPoolById.get(preferredCaptainId)
    if (preferredPlayer && !preferredPlayer.isBye) {
      return preferredCaptainId
    }
  }

  const bestActive = selectedIds
    .map((playerId) => playerPoolById.get(playerId))
    .filter((player): player is DraftPricingPoolPlayer => player != null)
    .filter((player) => !player.isBye)
    .sort((a, b) => b.projection - a.projection)[0]

  return bestActive?.id ?? selectedIds[0]
}

function buildSlotOptionLists(
  currentSlots: Array<number | null>,
  otherSlots: Array<number | null>,
  playerPool: DraftPricingPoolPlayer[],
  optionLabelById: Map<number, string>,
  slotLabels: readonly string[],
): string[][] {
  const globallySelected = new Set<number>(
    [...currentSlots, ...otherSlots].filter((playerId): playerId is number => playerId != null)
  )

  return currentSlots.map((currentId, index) =>
    playerPool
      .filter((player) => matchesSlotLabel(player, slotLabels[index] ?? ""))
      .filter((player) => !globallySelected.has(player.id) || player.id === currentId)
      .map((player) => optionLabelById.get(player.id))
      .filter((label): label is string => Boolean(label))
  )
}

function buildBoardPlayer(
  playerId: number | null,
  slotLabel: string,
  playerPoolById: Map<number, DraftPricingPoolPlayer>,
): DraftPricingPlayer | null {
  if (playerId == null) return null
  const player = playerPoolById.get(playerId)
  if (!player) return null

  return {
    id: player.id,
    name: player.name,
    projection: player.projection,
    actualScore: player.actualScore,
    standardDeviation: player.standardDeviation,
    slotLabel,
    isBench: slotLabel === "BEN",
    isBye: player.isBye,
    isEmergency: false,
  }
}

function summariseBoardTeam(players: Array<DraftPricingPlayer | null>, captainId: number | null) {
  const activePlayers = players.filter((player): player is DraftPricingPlayer => Boolean(player && !player.isBye))
  const captain = activePlayers.find((player) => player.id === captainId) ?? null
  const total = activePlayers.reduce(
    (sum, player) => sum + effectivePlayerScore(player, player.id === captain?.id),
    0
  )
  const variance = activePlayers.reduce(
    (sum, player) => sum + effectivePlayerVariance(player, player.id === captain?.id),
    0
  )

  return { total, variance, captain }
}

function teamAvatarSources(
  players: Array<DraftPricingPlayer | null>,
  selectedCaptainId: number | null,
  playerPoolById: Map<number, DraftPricingPoolPlayer>,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
): string[] {
  const validPlayers = players.filter((player): player is DraftPricingPlayer => player != null)
  const captain = validPlayers.find((player) => player.id === selectedCaptainId)
  const leadPlayer = captain ?? validPlayers[0] ?? null
  if (!leadPlayer) return ["/body-shot.png"]
  return playerImageSources(leadPlayer, playerPoolById, fantasyPlayersById, playerImages)
}

function ProjectionPill({
  value,
  tone = "default",
  size = "sm",
  blurred = false,
}: {
  value: number | null
  tone?: "default" | "captain" | "played"
  size?: "sm" | "lg"
  blurred?: boolean
}) {
  return (
    <div
      className={`inline-flex flex-col items-center justify-center rounded-full border font-semibold ${
        size === "lg"
          ? "min-w-[54px] px-2 py-1 text-[15px] leading-none md:min-w-[66px] md:px-2.5 md:text-[17px]"
          : "min-w-[36px] px-1.5 py-0.5 text-[10px] leading-none md:min-w-[40px] md:px-2 md:text-[11px]"
      } ${
        tone === "played"
          ? "border-emerald-400 bg-emerald-500/14 text-emerald-200"
          : tone === "captain"
          ? "border-orange-400 bg-orange-500/14 text-orange-200"
          : "border-violet-400/70 bg-[#20284a] text-violet-200"
      }`}
    >
      <span className={blurred ? "blur-[5px] select-none" : undefined}>
        {value == null ? "--" : Math.round(value)}
      </span>
    </div>
  )
}

function TeamHeader({
  side,
  teamLabel,
  onTeamLabelChange,
  players,
  totalSlots,
  playerPoolById,
  fantasyPlayersById,
  playerImages,
  savedTeams,
  onLoadSavedTeam,
  onSaveCurrentTeam,
  onDeleteSavedTeam,
}: {
  side: "left" | "right"
  teamLabel: string
  onTeamLabelChange: (value: string) => void
  players: Array<DraftPricingPlayer | null>
  totalSlots: number
  playerPoolById: Map<number, DraftPricingPoolPlayer>
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  playerImages: PlayerImageRecord[]
  savedTeams: SavedDraftTeamPreset[]
  onLoadSavedTeam: (teamId: string) => void
  onSaveCurrentTeam: () => void
  onDeleteSavedTeam: (teamId: string) => void
}) {
  const selectedPlayers = players.filter((player): player is DraftPricingPlayer => player != null)
  const selectedCount = selectedPlayers.length
  const [selectedSavedTeamId, setSelectedSavedTeamId] = useState("")
  const activeCaptainId =
    selectedPlayers.find((player) => !player.isBye && player.id != null)?.id ?? null
  const avatarSources = teamAvatarSources(players, activeCaptainId, playerPoolById, fantasyPlayersById, playerImages)
  const alignClass = side === "left" ? "items-start text-left" : "items-end text-right"

  return (
    <div className={`flex flex-col ${alignClass}`}>
      <div className="flex h-10 w-10 items-end justify-center overflow-hidden rounded-full border border-nrl-border bg-[linear-gradient(180deg,#243055,#181f39)] shadow-sm md:h-14 md:w-14">
        <ImageWithFallback sources={avatarSources} alt={teamLabel} className="h-full w-full object-cover object-top" />
      </div>
      <div className="mt-1 text-[10px] font-semibold text-nrl-muted md:mt-2 md:text-xs">{selectedCount}/{totalSlots}</div>
      <input
        value={teamLabel}
        onChange={(event) => onTeamLabelChange(event.target.value)}
        className="mt-1 w-full max-w-[140px] border border-nrl-border bg-[#20284a] px-2 py-1 text-[11px] font-bold text-nrl-text outline-none focus:border-fuchsia-400 md:mt-2 md:max-w-[205px] md:px-2 md:text-[13px]"
      />
      <div className="mt-1 flex w-full max-w-[140px] flex-col gap-1.5 md:mt-2 md:max-w-[205px] md:gap-2">
        <select
          value={selectedSavedTeamId}
          onChange={(event) => {
            const selectedId = event.target.value
            setSelectedSavedTeamId(selectedId)
            if (!selectedId) return
            onLoadSavedTeam(selectedId)
          }}
          className="w-full border border-nrl-border bg-[#20284a] px-2 py-1 text-[10px] text-nrl-muted outline-none focus:border-fuchsia-400 md:px-2 md:text-xs"
        >
          <option value="">Saved teams</option>
          {savedTeams.map((savedTeam) => (
            <option key={savedTeam.id} value={savedTeam.id}>
              {savedTeam.name}
            </option>
          ))}
        </select>
        <div className={`flex gap-2 ${side === "right" ? "justify-end" : "justify-start"}`}>
          <button
            type="button"
            onClick={onSaveCurrentTeam}
            className="border border-nrl-border bg-[#20284a] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text md:px-2 md:text-[10px] md:tracking-[0.14em]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedSavedTeamId) return
              onDeleteSavedTeam(selectedSavedTeamId)
              setSelectedSavedTeamId("")
            }}
            disabled={!selectedSavedTeamId}
            className="border border-nrl-border bg-[#20284a] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-nrl-muted transition-colors hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50 md:px-2 md:text-[10px] md:tracking-[0.14em]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function EditableBoardRow({
  slotLabel,
  leftPlayer,
  rightPlayer,
  leftValue,
  rightValue,
  leftOptions,
  rightOptions,
  onLeftChange,
  onRightChange,
  leftCaptainId,
  rightCaptainId,
  onLeftCaptainSelect,
  onRightCaptainSelect,
  blurValues = false,
  playerPoolById,
  fantasyPlayersById,
  playerImages,
}: {
  slotLabel: string
  leftPlayer: DraftPricingPlayer | null
  rightPlayer: DraftPricingPlayer | null
  leftValue: string
  rightValue: string
  leftOptions: string[]
  rightOptions: string[]
  onLeftChange: (value: string) => void
  onRightChange: (value: string) => void
  leftCaptainId: number | null
  rightCaptainId: number | null
  onLeftCaptainSelect: (captainId: number | null) => void
  onRightCaptainSelect: (captainId: number | null) => void
  blurValues?: boolean
  playerPoolById: Map<number, DraftPricingPoolPlayer>
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  playerImages: PlayerImageRecord[]
}) {
  const leftName = leftPlayer ? fantasyPlayersById.get(leftPlayer.id ?? -1)?.name ?? leftPlayer.name : ""
  const rightName = rightPlayer ? fantasyPlayersById.get(rightPlayer.id ?? -1)?.name ?? rightPlayer.name : ""

  return (
    <div className="grid grid-cols-[12px_minmax(0,1fr)_38px_18px_38px_minmax(0,1fr)_12px] items-center gap-1 border-t border-nrl-border px-1.5 py-1.5 first:border-t-0 md:grid-cols-[16px_minmax(0,1fr)_48px_54px_48px_minmax(0,1fr)_16px] md:gap-1.5 md:px-2">
      <div className="text-center text-[8px] font-bold uppercase tracking-[0.1em] text-nrl-muted [writing-mode:vertical-rl] rotate-180 md:text-[10px] md:tracking-[0.12em]">
        {slotLabel}
      </div>

      <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-1 md:grid-cols-[30px_minmax(0,1fr)] md:gap-1.5">
        <div className={`group relative flex h-6 w-6 items-end justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#243055,#181f39)] md:h-8 md:w-8 ${leftPlayer?.id === leftCaptainId ? "border border-orange-400 shadow-[0_0_0_1px_rgba(251,146,60,0.35)]" : ""}`}>
          <ImageWithFallback
            sources={leftPlayer ? playerImageSources(leftPlayer, playerPoolById, fantasyPlayersById, playerImages) : ["/body-shot.png"]}
            alt={leftName || "Player"}
            className="h-full w-full object-cover object-top"
          />
        </div>
        <div className="min-w-0 max-w-[106px] md:max-w-[131px]">
          <div className="truncate text-[10px] font-semibold text-nrl-text md:text-[13px]">
            {leftPlayer ? formatCompactPlayerName(leftName) : "-"}
          </div>
          <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_22px] items-center gap-1 md:grid-cols-[minmax(0,1fr)_24px]">
            <SearchableSelect
              label=""
              value={leftValue}
              options={leftOptions}
              onChange={onLeftChange}
              placeholder={`Select ${slotLabel}`}
            />
            <button
              type="button"
              onClick={() => onLeftCaptainSelect(leftPlayer?.id === leftCaptainId ? null : leftPlayer?.id ?? null)}
              disabled={!leftPlayer || leftPlayer.isBye}
              aria-label={leftPlayer?.id === leftCaptainId ? `Unset ${leftName} as captain` : `Set ${leftName || "player"} as captain`}
              className={`h-[26px] rounded-md border text-[10px] font-bold uppercase leading-none transition-colors md:h-[28px] ${
                leftPlayer?.id === leftCaptainId
                  ? "border-orange-400 bg-orange-500/14 text-orange-200"
                  : "border-nrl-border bg-[#20284a] text-nrl-muted hover:border-orange-400 hover:text-orange-200"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              C
            </button>
          </div>
        </div>
      </div>

        <div className="flex justify-center">
          <ProjectionPill
            value={leftPlayer ? effectivePlayerScore(leftPlayer, leftCaptainId === leftPlayer.id) : null}
            blurred={blurValues}
            tone={
              leftPlayer?.actualScore != null
                ? "played"
              : leftPlayer?.id === leftCaptainId
                ? "captain"
                : "default"
          }
        />
      </div>

      <div className="text-center text-[8px] font-bold uppercase tracking-[0.08em] text-nrl-muted md:text-[9px] md:tracking-[0.16em]">vs</div>

        <div className="flex justify-center">
          <ProjectionPill
            value={rightPlayer ? effectivePlayerScore(rightPlayer, rightCaptainId === rightPlayer.id) : null}
            blurred={blurValues}
            tone={
              rightPlayer?.actualScore != null
                ? "played"
              : rightPlayer?.id === rightCaptainId
                ? "captain"
                : "default"
          }
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1 md:grid-cols-[minmax(0,1fr)_30px] md:gap-1.5">
        <div className="min-w-0 max-w-[106px] justify-self-end text-right md:max-w-[131px]">
          <div className="truncate text-[10px] font-semibold text-nrl-text md:text-[13px]">
            {rightPlayer ? formatCompactPlayerName(rightName) : "-"}
          </div>
          <div className="mt-0.5 grid grid-cols-[22px_minmax(0,1fr)] items-center gap-1 md:grid-cols-[24px_minmax(0,1fr)]">
            <button
              type="button"
              onClick={() => onRightCaptainSelect(rightPlayer?.id === rightCaptainId ? null : rightPlayer?.id ?? null)}
              disabled={!rightPlayer || rightPlayer.isBye}
              aria-label={rightPlayer?.id === rightCaptainId ? `Unset ${rightName} as captain` : `Set ${rightName || "player"} as captain`}
              className={`h-[26px] rounded-md border text-[10px] font-bold uppercase leading-none transition-colors md:h-[28px] ${
                rightPlayer?.id === rightCaptainId
                  ? "border-orange-400 bg-orange-500/14 text-orange-200"
                  : "border-nrl-border bg-[#20284a] text-nrl-muted hover:border-orange-400 hover:text-orange-200"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              C
            </button>
            <SearchableSelect
              label=""
              value={rightValue}
              options={rightOptions}
              onChange={onRightChange}
              placeholder={`Select ${slotLabel}`}
            />
          </div>
        </div>
        <div className={`group relative flex h-6 w-6 items-end justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#243055,#181f39)] md:h-8 md:w-8 ${rightPlayer?.id === rightCaptainId ? "border border-orange-400 shadow-[0_0_0_1px_rgba(251,146,60,0.35)]" : ""}`}>
          <ImageWithFallback
            sources={rightPlayer ? playerImageSources(rightPlayer, playerPoolById, fantasyPlayersById, playerImages) : ["/body-shot.png"]}
            alt={rightName || "Player"}
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>

      <div className="text-center text-[9px] font-bold uppercase tracking-[0.1em] text-nrl-muted [writing-mode:vertical-rl]">
        {slotLabel}
      </div>
    </div>
  )
}

function EditableMatchupBoard({
  matchupMode,
  slotLabels,
  blurValues = false,
  homeLabel,
  awayLabel,
  onHomeLabelChange,
  onAwayLabelChange,
  homeSlots,
  awaySlots,
  captainSelections,
  onCaptainSelectionChange,
  onHomeSlotChange,
  onAwaySlotChange,
  fantasyPlayersById,
  playerImages,
  playerPoolById,
  optionLabelById,
  playerIdByOptionLabel,
  homeSlotOptions,
  awaySlotOptions,
  homePrice,
  awayPrice,
  savedTeams,
  onLoadSavedTeamToSide,
  onSaveSideAsTeam,
  onDeleteSavedTeam,
}: {
  matchupMode: MatchupMode
  slotLabels: readonly string[]
  blurValues?: boolean
  homeLabel: string
  awayLabel: string
  onHomeLabelChange: (value: string) => void
  onAwayLabelChange: (value: string) => void
  homeSlots: Array<number | null>
  awaySlots: Array<number | null>
  captainSelections: CaptainSelections
  onCaptainSelectionChange: (teamId: "home" | "away", captainId: number | null) => void
  onHomeSlotChange: (slotIndex: number, playerId: number | null) => void
  onAwaySlotChange: (slotIndex: number, playerId: number | null) => void
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  playerImages: PlayerImageRecord[]
  playerPoolById: Map<number, DraftPricingPoolPlayer>
  optionLabelById: Map<number, string>
  playerIdByOptionLabel: Map<string, number>
  homeSlotOptions: string[][]
  awaySlotOptions: string[][]
  homePrice: number | null
  awayPrice: number | null
  savedTeams: SavedDraftTeamPreset[]
  onLoadSavedTeamToSide: (side: "home" | "away", teamId: string) => void
  onSaveSideAsTeam: (side: "home" | "away") => void
  onDeleteSavedTeam: (teamId: string) => void
}) {
  const homePlayers = slotLabels.map((slotLabel, index) => buildBoardPlayer(homeSlots[index], slotLabel, playerPoolById))
  const awayPlayers = slotLabels.map((slotLabel, index) => buildBoardPlayer(awaySlots[index], slotLabel, playerPoolById))
  const homeSummary = summariseBoardTeam(homePlayers, captainSelections.home)
  const awaySummary = summariseBoardTeam(awayPlayers, captainSelections.away)

  return (
    <article className="overflow-hidden border border-nrl-border bg-nrl-panel shadow-[0_18px_45px_rgba(8,12,24,0.22)]">
      <div className="border-b border-nrl-border bg-nrl-panel px-2 py-3 md:px-4 md:py-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 md:items-center md:gap-3">
          <TeamHeader
            side="left"
            teamLabel={homeLabel}
            onTeamLabelChange={onHomeLabelChange}
            players={homePlayers}
            totalSlots={slotLabels.length}
            playerPoolById={playerPoolById}
            fantasyPlayersById={fantasyPlayersById}
            playerImages={playerImages}
            savedTeams={savedTeams}
            onLoadSavedTeam={(teamId) => onLoadSavedTeamToSide("home", teamId)}
            onSaveCurrentTeam={() => onSaveSideAsTeam("home")}
            onDeleteSavedTeam={onDeleteSavedTeam}
          />

          <div className="flex min-w-[92px] flex-col items-center md:min-w-[168px]">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-nrl-muted md:text-[10px] md:tracking-[0.18em]">
              Scores
            </div>
            <div className="mt-2 flex items-center gap-1 md:mt-2.5 md:gap-2.5">
              <ProjectionPill value={homeSummary.total} size="lg" blurred={blurValues} />
              <ProjectionPill value={awaySummary.total} size="lg" blurred={blurValues} />
            </div>
            <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-nrl-muted md:mt-4 md:text-[10px] md:tracking-[0.18em]">
              Odds
            </div>
            <div className="mt-2 flex items-center gap-1 md:mt-2 md:gap-2.5">
              <span className={`rounded-full border border-violet-400/70 bg-[#20284a] px-2 py-1 text-[13px] font-bold leading-none text-nrl-text md:px-2.5 md:text-[17px] ${blurValues ? "blur-[5px] select-none" : ""}`}>
                {formatOdds(homePrice)}
              </span>
              <span className={`rounded-full border border-violet-400/70 bg-[#20284a] px-2 py-1 text-[13px] font-bold leading-none text-nrl-text md:px-2.5 md:text-[17px] ${blurValues ? "blur-[5px] select-none" : ""}`}>
                {formatOdds(awayPrice)}
              </span>
            </div>
          </div>

          <TeamHeader
            side="right"
            teamLabel={awayLabel}
            onTeamLabelChange={onAwayLabelChange}
            players={awayPlayers}
            totalSlots={slotLabels.length}
            playerPoolById={playerPoolById}
            fantasyPlayersById={fantasyPlayersById}
            playerImages={playerImages}
            savedTeams={savedTeams}
            onLoadSavedTeam={(teamId) => onLoadSavedTeamToSide("away", teamId)}
            onSaveCurrentTeam={() => onSaveSideAsTeam("away")}
            onDeleteSavedTeam={onDeleteSavedTeam}
          />
        </div>
      </div>

      <div className="bg-[#20284a] px-1 py-1.5 text-[10px] font-semibold text-nrl-muted md:px-3 md:text-[11px]">
        <div className="grid grid-cols-[12px_minmax(0,1fr)_38px_18px_38px_minmax(0,1fr)_12px] items-center gap-1 md:grid-cols-[16px_minmax(0,1fr)_48px_54px_48px_minmax(0,1fr)_16px] md:gap-1.5">
          <div />
          <div>{homeLabel}</div>
          <div className="col-span-3 flex items-center justify-center gap-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-nrl-muted md:text-[10px] md:tracking-[0.16em]">
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-300" />
              <span>Proj</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
              <span>Actual</span>
            </div>
          </div>
          <div className="text-right">{awayLabel}</div>
          <div />
        </div>
      </div>

      <div className="overflow-visible bg-nrl-panel">
        {slotLabels.map((slotLabel, index) => (
          <div key={`row-${slotLabel}-${index}`}>
            {matchupMode === "h2h" && index === DRAFT_SLOT_LABELS.length ? (
              <div className="border-y border-fuchsia-400/25 bg-[linear-gradient(90deg,rgba(34,197,94,0.08),rgba(168,85,247,0.08))] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-nrl-text md:text-[11px]">
                Bench
              </div>
            ) : null}
            <EditableBoardRow
              slotLabel={slotLabel}
              leftPlayer={homePlayers[index]}
              rightPlayer={awayPlayers[index]}
              leftValue={homeSlots[index] != null ? optionLabelById.get(homeSlots[index] ?? -1) ?? "" : ""}
              rightValue={awaySlots[index] != null ? optionLabelById.get(awaySlots[index] ?? -1) ?? "" : ""}
              leftOptions={homeSlotOptions[index] ?? []}
              rightOptions={awaySlotOptions[index] ?? []}
              onLeftChange={(value) => onHomeSlotChange(index, playerIdByOptionLabel.get(value) ?? null)}
              onRightChange={(value) => onAwaySlotChange(index, playerIdByOptionLabel.get(value) ?? null)}
              leftCaptainId={captainSelections.home}
              rightCaptainId={captainSelections.away}
              onLeftCaptainSelect={(captainId) => onCaptainSelectionChange("home", captainId)}
              onRightCaptainSelect={(captainId) => onCaptainSelectionChange("away", captainId)}
              blurValues={blurValues}
              playerPoolById={playerPoolById}
              fantasyPlayersById={fantasyPlayersById}
              playerImages={playerImages}
            />
          </div>
        ))}
      </div>
    </article>
  )
}

export function FantasyDraftPricingPage({
  playerImages,
  fantasyPlayers,
  coachProjectionsRaw,
  draw2026Data,
  playerFantasySdRows,
  positionFantasySdRows,
  locked = false,
}: {
  playerImages: PlayerImageRecord[]
  fantasyPlayers: FantasyPlayerSnapshot[]
  coachProjectionsRaw: unknown
  draw2026Data: Draw2026Data | null
  playerFantasySdRows: DraftPricingHistoricalPlayerSd[]
  positionFantasySdRows: DraftPricingHistoricalPositionSd[]
  locked?: boolean
}) {
  const { isLoaded, userId } = useAuth()
  const currentRound = defaultRoundFromDraw(draw2026Data)
  const [round, setRound] = useState(String(defaultRoundFromDraw(draw2026Data)))
  const [matchupMode, setMatchupMode] = useState<MatchupMode>("draft")
  const [homeLabel, setHomeLabel] = useState("")
  const [awayLabel, setAwayLabel] = useState("")
  const [homeSlots, setHomeSlots] = useState<Array<number | null>>(buildEmptySlots(DRAFT_SLOT_LABELS.length))
  const [awaySlots, setAwaySlots] = useState<Array<number | null>>(buildEmptySlots(DRAFT_SLOT_LABELS.length))
  const [captainSelections, setCaptainSelections] = useState<CaptainSelections>({ home: null, away: null })
  const [savedTeams, setSavedTeams] = useState<SavedDraftTeamPreset[]>([])
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false)

  const fantasyPlayersById = useMemo(() => new Map(fantasyPlayers.map((player) => [player.id, player])), [fantasyPlayers])
  const fantasyPlayerTeams = useMemo(
    () =>
      Object.fromEntries(
        fantasyPlayers.map((player) => [player.id, resolvePlayerImage(player.name, null, playerImages)?.team ?? null])
      ),
    [fantasyPlayers, playerImages]
  )

  const roundValue = toRound(round)
  const slotLabels = useMemo(() => slotLabelsForMode(matchupMode), [matchupMode])
  const storageKey = useMemo(
    () => `${DRAFT_PRICER_LOCAL_KEY_PREFIX}:${userId ?? "guest"}`,
    [userId]
  )
  const savedTeamsStorageKey = useMemo(
    () => `${DRAFT_PRICER_SAVED_TEAMS_LOCAL_KEY_PREFIX}:${userId ?? "guest"}`,
    [userId]
  )
  const roundOptions = useMemo(() => {
    const fromDraw = [...new Set((draw2026Data?.rows ?? []).map((row) => row.round))]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
    if (fromDraw.length > 0) {
      const currentIndex = Math.max(0, fromDraw.findIndex((value) => value >= currentRound))
      return fromDraw.slice(currentIndex, currentIndex + 3).map(String)
    }
    return Array.from({ length: 3 }, (_, index) => String(currentRound + index))
  }, [currentRound, draw2026Data])

  const playerPool = useMemo(
    () =>
      buildDraftPricingPlayerPool({
        round: roundValue,
        projectionsRaw: coachProjectionsRaw,
        fantasyPlayers,
        fantasyPlayerTeams,
        draw2026Data,
        historicalPlayerSdRows: playerFantasySdRows,
        historicalPositionSdRows: positionFantasySdRows,
      }),
    [roundValue, coachProjectionsRaw, fantasyPlayers, fantasyPlayerTeams, draw2026Data, playerFantasySdRows, positionFantasySdRows]
  )

  const playerPoolById = useMemo(() => new Map(playerPool.map((player) => [player.id, player])), [playerPool])
  const optionLabelById = useMemo(
    () => new Map(playerPool.map((player) => [player.id, buildPlayerOptionLabel(player)])),
    [playerPool]
  )
  const playerIdByOptionLabel = useMemo(
    () => new Map(playerPool.map((player) => [buildPlayerOptionLabel(player), player.id])),
    [playerPool]
  )

  const homeSlotOptions = useMemo(
    () => buildSlotOptionLists(homeSlots, awaySlots, playerPool, optionLabelById, slotLabels),
    [homeSlots, awaySlots, playerPool, optionLabelById, slotLabels]
  )
  const awaySlotOptions = useMemo(
    () => buildSlotOptionLists(awaySlots, homeSlots, playerPool, optionLabelById, slotLabels),
    [awaySlots, homeSlots, playerPool, optionLabelById, slotLabels]
  )

  const duplicateSelectedIds = useMemo(() => {
    const counts = new Map<number, number>()
    for (const playerId of [...homeSlots, ...awaySlots]) {
      if (playerId == null) continue
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([playerId]) => playerId))
  }, [homeSlots, awaySlots])

  const effectiveCaptainSelections = useMemo(
    () => ({
      home: resolveCaptainId(homeSlots, captainSelections.home, playerPoolById),
      away: resolveCaptainId(awaySlots, captainSelections.away, playerPoolById),
    }),
    [homeSlots, awaySlots, captainSelections.home, captainSelections.away, playerPoolById]
  )

  const homeComplete = homeSlots.every((playerId) => playerId != null)
  const awayComplete = awaySlots.every((playerId) => playerId != null)

  const marketSummary = useMemo(() => {
    if (!homeComplete || !awayComplete || duplicateSelectedIds.size > 0) return null

    const homePlayers = slotLabels.map((slotLabel, index) => buildBoardPlayer(homeSlots[index], slotLabel, playerPoolById))
    const awayPlayers = slotLabels.map((slotLabel, index) => buildBoardPlayer(awaySlots[index], slotLabel, playerPoolById))
    const homeSummary = summariseBoardTeam(homePlayers, effectiveCaptainSelections.home)
    const awaySummary = summariseBoardTeam(awayPlayers, effectiveCaptainSelections.away)
    const margin = homeSummary.total - awaySummary.total
    const variance = homeSummary.variance + awaySummary.variance

    let homeWinProbability = 0.5
    if (variance <= 0) {
      homeWinProbability = margin > 0 ? 1 : margin < 0 ? 0 : 0.5
    } else {
      homeWinProbability = normalCdf(margin / Math.sqrt(variance))
    }

    return {
      homeOdds: fairDecimalOdds(homeWinProbability),
      awayOdds: fairDecimalOdds(1 - homeWinProbability),
    }
  }, [homeComplete, awayComplete, duplicateSelectedIds, homeSlots, awaySlots, playerPoolById, effectiveCaptainSelections.home, effectiveCaptainSelections.away, slotLabels])

  const homePrice = marketSummary?.homeOdds ?? null
  const awayPrice = marketSummary?.awayOdds ?? null

  useEffect(() => {
    if (!isLoaded) return

    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setHasLoadedSavedState(true)
        return
      }

      const parsed = JSON.parse(raw) as Partial<SavedDraftPricerState>
      const parsedMode = parsed.mode === "h2h" ? "h2h" : "draft"
      const parsedSlotCount = slotLabelsForMode(parsedMode).length
      setMatchupMode(parsedMode)
      if (typeof parsed.round === "string") setRound(parsed.round)
      if (typeof parsed.homeLabel === "string") setHomeLabel(normaliseDraftTeamLabel(parsed.homeLabel))
      if (typeof parsed.awayLabel === "string") setAwayLabel(normaliseDraftTeamLabel(parsed.awayLabel))
      if (Array.isArray(parsed.homeSlots)) {
        setHomeSlots(resizeSlots(parsed.homeSlots, parsedSlotCount))
      }
      if (Array.isArray(parsed.awaySlots)) {
        setAwaySlots(resizeSlots(parsed.awaySlots, parsedSlotCount))
      }
      if (parsed.captainSelections && typeof parsed.captainSelections === "object") {
        setCaptainSelections({
          home: typeof parsed.captainSelections.home === "number" ? parsed.captainSelections.home : null,
          away: typeof parsed.captainSelections.away === "number" ? parsed.captainSelections.away : null,
        })
      }

      const rawSavedTeams = window.localStorage.getItem(savedTeamsStorageKey)
      if (rawSavedTeams) {
        const parsedSavedTeams = JSON.parse(rawSavedTeams)
        if (Array.isArray(parsedSavedTeams)) {
          setSavedTeams(
            parsedSavedTeams.flatMap((row) => {
              if (!row || typeof row !== "object") return []
              const preset = row as Partial<SavedDraftTeamPreset>
              if (typeof preset.id !== "string" || typeof preset.name !== "string" || typeof preset.label !== "string") return []
              if (!Array.isArray(preset.slots)) return []
              const presetMode = preset.mode === "h2h" ? "h2h" : inferModeFromSlotCount(preset.slots.length)
              return [{
                id: preset.id,
                name: preset.name,
                label: preset.label,
                mode: presetMode,
                slots: resizeSlots(preset.slots, slotLabelsForMode(presetMode).length),
                captainId: typeof preset.captainId === "number" ? preset.captainId : null,
                updatedAt: typeof preset.updatedAt === "string" ? preset.updatedAt : new Date(0).toISOString(),
              }]
            })
          )
        }
      }
    } catch {
      // Ignore bad saved payloads and fall back to defaults.
    } finally {
      setHasLoadedSavedState(true)
    }
  }, [isLoaded, savedTeamsStorageKey, storageKey])

  useEffect(() => {
    if (!hasLoadedSavedState) return

    const payload: SavedDraftPricerState = {
      mode: matchupMode,
      round,
      homeLabel,
      awayLabel,
      homeSlots,
      awaySlots,
      captainSelections,
    }

    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  }, [hasLoadedSavedState, storageKey, matchupMode, round, homeLabel, awayLabel, homeSlots, awaySlots, captainSelections])

  useEffect(() => {
    if (!hasLoadedSavedState) return
    window.localStorage.setItem(savedTeamsStorageKey, JSON.stringify(savedTeams))
  }, [hasLoadedSavedState, savedTeams, savedTeamsStorageKey])

  useEffect(() => {
    if (roundOptions.length === 0) return
    if (!roundOptions.includes(round)) {
      setRound(roundOptions[0] ?? String(currentRound))
    }
  }, [currentRound, round, roundOptions])

  const saveSideAsTeam = (side: "home" | "away") => {
    const sourceSlots = side === "home" ? homeSlots : awaySlots
    const sourceLabel = side === "home" ? homeLabel : awayLabel
    const sourceCaptainId = side === "home" ? effectiveCaptainSelections.home : effectiveCaptainSelections.away
    const selectedCount = sourceSlots.filter((playerId) => playerId != null).length
    if (selectedCount === 0) return

    const suggestedName = sourceLabel.trim() || `${side === "home" ? "Home" : "Away"} Team`
    const rawName = window.prompt("Save draft team as", suggestedName)
    const name = rawName?.trim()
    if (!name) return

    setSavedTeams((current) => {
      const existing = current.find((team) => team.name.toLowerCase() === name.toLowerCase())
      const nextPreset: SavedDraftTeamPreset = {
        id: existing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        label: sourceLabel.trim() || name,
        mode: matchupMode,
        slots: [...sourceSlots],
        captainId: sourceCaptainId,
        updatedAt: new Date().toISOString(),
      }

      const next = existing
        ? current.map((team) => (team.id === existing.id ? nextPreset : team))
        : [nextPreset, ...current]

      return [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  }

  const loadSavedTeamToSide = (side: "home" | "away", teamId: string) => {
    const preset = savedTeams.find((team) => team.id === teamId)
    if (!preset) return
    const nextSlots = resizeSlots(preset.slots, slotLabels.length)

    if (side === "home") {
      setHomeLabel(preset.label)
      setHomeSlots(nextSlots)
      setCaptainSelections((current) => ({ ...current, home: preset.captainId }))
      return
    }

    setAwayLabel(preset.label)
    setAwaySlots(nextSlots)
    setCaptainSelections((current) => ({ ...current, away: preset.captainId }))
  }

  const deleteSavedTeam = (teamId: string) => {
    const preset = savedTeams.find((team) => team.id === teamId)
    if (!preset) return
    if (!window.confirm(`Delete saved team "${preset.name}"?`)) return
    setSavedTeams((current) => current.filter((team) => team.id !== teamId))
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
        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent xl:leading-none">Draft / H2H Projection and Odds</div>
            <div className="inline-flex rounded-full border border-nrl-border bg-[#20284a] p-1">
              {([
                ["draft", "Draft"],
                ["h2h", "H2H"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const nextSlotLabels = slotLabelsForMode(value)
                    setMatchupMode(value)
                    setHomeSlots((current) => resizeSlots(current, nextSlotLabels.length))
                    setAwaySlots((current) => resizeSlots(current, nextSlotLabels.length))
                  }}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    matchupMode === value
                      ? "bg-[linear-gradient(135deg,rgba(34,197,94,0.18),rgba(168,85,247,0.22))] text-nrl-text"
                      : "text-nrl-muted hover:text-nrl-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {locked ? (
              <Link
                href="/sign-up"
                className="rounded-full border border-[rgba(0,245,138,0.28)] bg-[linear-gradient(135deg,rgba(91,61,173,0.28),rgba(12,93,74,0.24))] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:border-nrl-accent"
              >
                Sign Up To Pro
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[160px] flex-col">
              <select
                value={round}
                onChange={(event) => setRound(event.target.value)}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
              >
                {roundOptions.map((option) => (
                  <option key={option} value={option}>
                    Round {option}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => {
                setHomeSlots(buildEmptySlots(slotLabels.length))
                setAwaySlots(buildEmptySlots(slotLabels.length))
                setCaptainSelections({ home: null, away: null })
              }}
              className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
            >
              Clear
            </button>
          </div>
        </div>

        <EditableMatchupBoard
          matchupMode={matchupMode}
          slotLabels={slotLabels}
          blurValues={locked}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          onHomeLabelChange={setHomeLabel}
          onAwayLabelChange={setAwayLabel}
          homeSlots={homeSlots}
          awaySlots={awaySlots}
          captainSelections={effectiveCaptainSelections}
          onCaptainSelectionChange={(teamId, captainId) =>
            setCaptainSelections((current) => ({ ...current, [teamId]: captainId }))
          }
          onHomeSlotChange={(slotIndex, playerId) =>
            setHomeSlots((current) => current.map((value, index) => (index === slotIndex ? playerId : value)))
          }
          onAwaySlotChange={(slotIndex, playerId) =>
            setAwaySlots((current) => current.map((value, index) => (index === slotIndex ? playerId : value)))
          }
          fantasyPlayersById={fantasyPlayersById}
          playerImages={playerImages}
          playerPoolById={playerPoolById}
          optionLabelById={optionLabelById}
          playerIdByOptionLabel={playerIdByOptionLabel}
          homeSlotOptions={homeSlotOptions}
          awaySlotOptions={awaySlotOptions}
          homePrice={homePrice}
          awayPrice={awayPrice}
          savedTeams={savedTeams}
          onLoadSavedTeamToSide={loadSavedTeamToSide}
          onSaveSideAsTeam={saveSideAsTeam}
          onDeleteSavedTeam={deleteSavedTeam}
        />

      </section>
    </div>
  )
}

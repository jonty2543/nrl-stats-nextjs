"use client"

import Link from "next/link"
import { SignInButton, useAuth } from "@clerk/nextjs"
import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolvePlayerImage } from "@/components/views/player-comparison"
import type { Draw2026Data } from "@/lib/draw/types"
import {
  getFantasyCoachRoundMetrics,
  type FantasyCoachPlayerSnapshot,
  type FantasyPlayerSnapshot,
  type LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import type { OriginChanceRecord, PlayerImageRecord } from "@/lib/supabase/queries"

const MY_TEAM_MAX_IMAGE_DATA_URL_LENGTH = 650_000
const SCREENSHOT_SLOTS = [
  { key: "top", label: "Screenshot 1", hint: "Top half of My Team with the upper field." },
  { key: "bottom", label: "Screenshot 2", hint: "Scroll down and capture the lower field plus bench." },
  { key: "trades", label: "Trade Screen", hint: "Trade screen showing trades remaining, weekly trades, and bank." },
] as const
const STARTER_ROWS = [
  { slot: "HOK", count: 1 },
  { slot: "MID", count: 3 },
  { slot: "EDG", count: 2 },
  { slot: "HLF", count: 2 },
  { slot: "CTR", count: 2 },
  { slot: "WFB", count: 3 },
] as const
const MY_TEAM_MAJOR_BYE_ROUNDS = [12, 15, 18] as const
const MY_TEAM_PROJECTION_ROUNDS = Array.from({ length: 19 }, (_, index) => index + 1)
const MY_TEAM_AVAILABILITY_SUMMARY_ROUNDS = [12, 13, 15, 16, 18, 19] as const
const MY_TEAM_AI_ENABLED = false
const FANTASY_SQUAD_ID_TO_TEAM: Record<number, string> = {
  500001: "Roosters",
  500002: "Sea Eagles",
  500003: "Knights",
  500004: "Titans",
  500005: "Rabbitohs",
  500010: "Bulldogs",
  500011: "Broncos",
  500012: "Cowboys",
  500013: "Raiders",
  500014: "Panthers",
  500021: "Storm",
  500022: "Dragons",
  500023: "Wests Tigers",
  500028: "Sharks",
  500031: "Eels",
  500032: "Warriors",
  500723: "Dolphins",
}

type ScreenshotSlot = (typeof SCREENSHOT_SLOTS)[number]["key"]
type SquadRole = "starter" | "interchange" | "emergency"

interface TeamScreenshot {
  id: string
  slot: ScreenshotSlot
  name: string
  dataUrl: string
}

interface ExtractedPlayer {
  name?: unknown
  slot?: unknown
  squadRole?: unknown
  benchOrder?: unknown
  isCaptain?: unknown
  isViceCaptain?: unknown
  isBye?: unknown
  status?: unknown
}

interface ExtractedPayload {
  teamName?: unknown
  round?: unknown
  tradesRemaining?: unknown
  bankRemaining?: unknown
  tradesAvailableThisWeek?: unknown
  players?: unknown
}

interface MyTeamPlayer {
  playerId: number | null
  displayName: string
  slot: string
  squadRole: SquadRole
  benchOrder: number | null
  isCaptain: boolean
  isViceCaptain: boolean
  isBye: boolean
  status: "uncertain" | "injured" | "suspended" | null
  tradeReversal?: {
    player: MyTeamPlayer
    outgoingCost: number | null
    incomingCost: number | null
  } | null
}

interface SavedMyTeam {
  teamName: string
  round: string
  tradesRemaining: string
  bankRemaining: string
  tradesAvailableThisWeek: string
  players: MyTeamPlayer[]
}

interface MyTeamPageProps {
  fantasyPlayers: FantasyPlayerSnapshot[]
  fantasyCoachPlayers: FantasyCoachPlayerSnapshot[]
  lineupsProjections: LineupsProjectionSnapshot
  playerImages: PlayerImageRecord[]
  draw2026Data: Draw2026Data | null
  originChances: OriginChanceRecord[]
  locked: boolean
}

interface MyTeamChatMessage {
  role: "user" | "assistant"
  content: string
}

interface IndexedMyTeamPlayer {
  player: MyTeamPlayer
  index: number
}

interface TradeCandidate {
  player: FantasyPlayerSnapshot
  price: number | null
  last3: number | null
  breakEven: number | null
  projection: number | null
  affordable: boolean
}

type MyTeamMajorByeRound = (typeof MY_TEAM_MAJOR_BYE_ROUNDS)[number]
type MyTeamProjectionRound = number

interface RoundAvailabilityBadge {
  round: MyTeamMajorByeRound
  available: boolean
  reason: string
  isBye: boolean
  isOriginRisk: boolean
}

type TeamDropTarget =
  | { kind: "starter"; slot: string; playerIndex: number | null }
  | { kind: "bench"; playerIndex: number }

function isSavedMyTeam(value: unknown): value is SavedMyTeam {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "players" in value &&
    Array.isArray((value as { players?: unknown }).players)
  )
}

function readScreenshotFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("Unable to read image."))
    }
    reader.onerror = () => reject(new Error("Unable to read image."))
    reader.readAsDataURL(file)
  })
}

function loadScreenshotImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Unable to load image."))
    image.src = src
  })
}

async function buildTeamScreenshot(file: File, slot: ScreenshotSlot): Promise<TeamScreenshot> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Upload PNG, JPEG, or WebP screenshots.")
  }

  const sourceDataUrl = await readScreenshotFileAsDataUrl(file)
  const image = await loadScreenshotImage(sourceDataUrl)
  const canvas = document.createElement("canvas")
  const canvasContext = canvas.getContext("2d")
  if (!canvasContext) throw new Error("Unable to process image.")

  let scale = Math.min(1, 900 / image.naturalWidth)
  let dataUrl = ""
  for (const widthScale of [1, 0.82, 0.68, 0.54, 0.42]) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale * widthScale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale * widthScale))
    canvas.width = width
    canvas.height = height
    canvasContext.drawImage(image, 0, 0, width, height)

    for (const quality of [0.78, 0.68, 0.58, 0.48]) {
      dataUrl = canvas.toDataURL("image/jpeg", quality)
      if (dataUrl.length <= MY_TEAM_MAX_IMAGE_DATA_URL_LENGTH) break
    }
    if (dataUrl.length <= MY_TEAM_MAX_IMAGE_DATA_URL_LENGTH) break
    scale *= 0.9
  }

  if (dataUrl.length > MY_TEAM_MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error("That screenshot is too large. Try cropping it or uploading a clearer, smaller screenshot.")
  }

  return {
    id: `${slot}-${file.name}-${file.size}-${file.lastModified}`,
    slot,
    name: file.name,
    dataUrl,
  }
}

function normalisePlayerLookupValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function normaliseTeamKey(value: string | null | undefined): string {
  const key = String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  const aliases: Record<string, string> = {
    "canterbury bankstown bulldogs": "bulldogs",
    "cronulla sutherland sharks": "sharks",
    "gold coast titans": "titans",
    "manly warringah sea eagles": "sea eagles",
    "new zealand": "warriors",
    "new zealand warriors": "warriors",
    nz: "warriors",
    "nz warriors": "warriors",
    nzl: "warriors",
    "north queensland cowboys": "cowboys",
    "parramatta eels": "eels",
    "south sydney rabbitohs": "rabbitohs",
    "st george illawarra dragons": "dragons",
    "sydney roosters": "roosters",
    tigers: "wests tigers",
  }
  return aliases[key] ?? key
}

function teamPlaysInRound(draw2026Data: Draw2026Data | null | undefined, round: number, team: string | null): boolean | null {
  if (!draw2026Data?.rows.length || !team) return null
  const teamKey = normaliseTeamKey(team)
  if (!teamKey) return null
  const roundRows = draw2026Data.rows.filter((row) => row.round === round)
  if (roundRows.length === 0) return null
  return roundRows.some(
    (row) => normaliseTeamKey(row.home) === teamKey || normaliseTeamKey(row.away) === teamKey,
  )
}

function playerNameSignature(value: string): { initial: string; surname: string; full: string } {
  const full = normalisePlayerLookupValue(value)
  const abbreviated = full.match(/^([a-z])\s+(.+)$/)
  if (abbreviated) {
    return { initial: abbreviated[1] ?? "", surname: (abbreviated[2] ?? "").replace(/\s+/g, ""), full }
  }
  const parts = full.split(" ").filter(Boolean)
  const first = parts[0] ?? ""
  return { initial: first.slice(0, 1), surname: parts.slice(1).join(""), full }
}

function fantasyNamesMatch(left: string, right: string): boolean {
  return fantasyPlayerNameMatches(left, right) || fantasyPlayerNameMatches(right, left)
}

function playerDisplayNameForLookup(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): string {
  return player.playerId != null ? fantasyPlayersById.get(player.playerId)?.name ?? player.displayName : player.displayName
}

function resolveMyTeamPlayerTeam(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
): string | null {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) ?? null : null
  if (fantasyPlayer?.squadId != null) {
    return FANTASY_SQUAD_ID_TO_TEAM[fantasyPlayer.squadId] ?? null
  }
  const playerName = playerDisplayNameForLookup(player, fantasyPlayersById)
  const match = playerImages.find((row) => row.team && fantasyNamesMatch(row.player, playerName))
  return match?.team ?? null
}

function isOriginChancePlayer(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  originPlayerNames: Set<string>,
): boolean {
  if (originPlayerNames.size === 0) return false
  const playerName = playerDisplayNameForLookup(player, fantasyPlayersById)
  return [...originPlayerNames].some((originName) => fantasyNamesMatch(originName, playerName))
}

function fantasyPlayerNameMatches(extractedName: string, playerName: string): boolean {
  const extracted = playerNameSignature(extractedName)
  const candidate = playerNameSignature(playerName)
  if (!extracted.full || !candidate.full) return false
  if (extracted.full === candidate.full) return true
  if (!extracted.initial || extracted.initial !== candidate.initial) return false
  if (!extracted.surname || !candidate.surname) return false
  return extracted.surname === candidate.surname || candidate.surname.endsWith(extracted.surname)
}

function findFantasyPlayerMatch(
  displayName: string,
  starterSlot: string,
  fantasyPlayers: FantasyPlayerSnapshot[],
  usedPlayerIds: Set<number>,
): FantasyPlayerSnapshot | null {
  const nameMatch = (player: FantasyPlayerSnapshot) => !usedPlayerIds.has(player.id) && fantasyPlayerNameMatches(displayName, player.name)
  return fantasyPlayers.find((player) => nameMatch(player) && (!starterSlot || player.positionLabels.includes(starterSlot)))
    ?? fantasyPlayers.find(nameMatch)
    ?? null
}

function normaliseSlot(value: unknown): string | null {
  const slot = typeof value === "string" ? value.toUpperCase().replace(/[^A-Z]/g, "") : ""
  if (slot.includes("INT")) return "INT"
  if (slot.includes("EMG")) return "EMG"
  if (slot.includes("HOOK")) return "HOK"
  if (slot.includes("MIDDLE")) return "MID"
  if (slot.includes("EDGE")) return "EDG"
  if (slot.includes("HALF")) return "HLF"
  if (slot.includes("CENTRE") || slot.includes("CENTER")) return "CTR"
  if (slot.includes("WING") || slot.includes("FULLBACK") || slot.includes("FULL")) return "WFB"
  if (["HOK", "MID", "EDG", "HLF", "CTR", "WFB", "INT", "EMG"].includes(slot)) return slot
  return null
}

function normaliseRole(role: unknown, slot: string | null): SquadRole {
  const value = typeof role === "string" ? role.toLowerCase() : ""
  if (value.includes("emerg") || slot === "EMG") return "emergency"
  if (value.includes("inter") || value.includes("bench") || slot === "INT") return "interchange"
  return "starter"
}

function normaliseStatus(value: unknown): MyTeamPlayer["status"] {
  const status = typeof value === "string" ? value.toLowerCase() : ""
  if (status.includes("injur")) return "injured"
  if (status.includes("suspend")) return "suspended"
  if (status.includes("uncertain") || status.includes("question")) return "uncertain"
  return null
}

function statusForTradedFantasyPlayer(player: FantasyPlayerSnapshot): MyTeamPlayer["status"] {
  return normaliseStatus(player.status) ?? (player.isBye ? null : "uncertain")
}

function effectiveIsBye(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): boolean {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  return fantasyPlayer ? fantasyPlayer.isBye : player.isBye
}

function normaliseRoundLabel(value: unknown): string {
  const round = typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
  return round.replace(/^(round\s+)+/i, "")
}

function normaliseOptionalText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
}

function numberParts(value: string): string[] {
  return value.match(/\d+/g) ?? []
}

function normaliseTradeFields(extracted: ExtractedPayload): Pick<SavedMyTeam, "tradesRemaining" | "tradesAvailableThisWeek"> {
  const rawRemaining = normaliseOptionalText(extracted.tradesRemaining)
  const rawAvailable = normaliseOptionalText(extracted.tradesAvailableThisWeek)
  const remainingParts = numberParts(rawRemaining)
  const availableParts = numberParts(rawAvailable)

  return {
    tradesRemaining: remainingParts[0] ?? rawRemaining,
    tradesAvailableThisWeek: remainingParts[1] ?? availableParts[0] ?? rawAvailable,
  }
}

function resolveExtractedTeam(extracted: ExtractedPayload, fantasyPlayers: FantasyPlayerSnapshot[]): SavedMyTeam {
  const usedPlayerIds = new Set<number>()
  const rawPlayers = Array.isArray(extracted.players) ? extracted.players as ExtractedPlayer[] : []
  const tradeFields = normaliseTradeFields(extracted)

  return {
    teamName: typeof extracted.teamName === "string" ? extracted.teamName.trim() : "",
    round: normaliseRoundLabel(extracted.round),
    tradesRemaining: tradeFields.tradesRemaining,
    bankRemaining: normaliseOptionalText(extracted.bankRemaining),
    tradesAvailableThisWeek: tradeFields.tradesAvailableThisWeek,
    players: rawPlayers.flatMap((rawPlayer) => {
      const displayName = typeof rawPlayer.name === "string" ? rawPlayer.name.replace(/\s+/g, " ").trim() : ""
      if (!displayName) return []
      const extractedSlot = normaliseSlot(rawPlayer.slot)
      const squadRole = normaliseRole(rawPlayer.squadRole, extractedSlot)
      const starterSlot = extractedSlot && !["INT", "EMG"].includes(extractedSlot) ? extractedSlot : ""
      const match = findFantasyPlayerMatch(displayName, starterSlot, fantasyPlayers, usedPlayerIds)
      if (match) usedPlayerIds.add(match.id)

      return [{
        playerId: match?.id ?? null,
        displayName,
        slot: starterSlot || (squadRole === "emergency" ? "EMG" : squadRole === "interchange" ? "INT" : ""),
        squadRole,
        benchOrder: typeof rawPlayer.benchOrder === "number" ? rawPlayer.benchOrder : null,
        isCaptain: rawPlayer.isCaptain === true,
        isViceCaptain: false,
        isBye: match?.isBye ?? rawPlayer.isBye === true,
        status: normaliseStatus(rawPlayer.status),
      }]
    }),
  }
}

function remapSavedTeam(team: SavedMyTeam, fantasyPlayers: FantasyPlayerSnapshot[]): SavedMyTeam {
  const usedPlayerIds = new Set<number>()
  const players = team.players.map((player) => {
    const currentFantasyPlayer = player.playerId != null
      ? fantasyPlayers.find((fantasyPlayer) => fantasyPlayer.id === player.playerId) ?? null
      : null
    if (currentFantasyPlayer) {
      usedPlayerIds.add(currentFantasyPlayer.id)
      return { ...player, isBye: currentFantasyPlayer.isBye, isViceCaptain: false }
    }

    const starterSlot = player.squadRole === "starter" ? player.slot : ""
    const match = findFantasyPlayerMatch(player.displayName, starterSlot, fantasyPlayers, usedPlayerIds)
    if (!match) return { ...player, isViceCaptain: false }
    usedPlayerIds.add(match.id)
    return { ...player, playerId: match.id, isBye: match.isBye, isViceCaptain: false }
  })
  const tradeFields = normaliseTradeFields(team)

  return {
    ...team,
    round: normaliseRoundLabel(team.round),
    tradesRemaining: tradeFields.tradesRemaining,
    bankRemaining: normaliseOptionalText(team.bankRemaining),
    tradesAvailableThisWeek: tradeFields.tradesAvailableThisWeek,
    players,
  }
}

function imageSourcesForPlayer(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
): string[] {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  const imageRow = resolvePlayerImage(fantasyPlayer?.name ?? player.displayName, null, playerImages)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  const pushVariants = (value: string | null | undefined) => {
    const trimmed = value?.trim()
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
      if (nested) push(nested.startsWith("http://") ? `https://${nested.slice("http://".length)}` : nested)
    }
    push(trimmed)
  }

  for (const source of [imageRow?.body_image, imageRow?.head_image]) {
    pushVariants(source)
  }
  push("/body-shot.png")
  return out
}

function playerLabelForPrompt(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
  hasFantasyPlotAccess: boolean,
): string {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  const namedInLineups = getLineupsNamedStatus(player, fantasyPlayersById, lineupsProjections)
  const modelProjection =
    fantasyPlayer && hasFantasyPlotAccess
      ? modelProjectionForFantasyPlayer(fantasyPlayer, lineupsProjections, fantasyPlayer.projectedAvg)
      : null
  const byeFromLiveData = effectiveIsBye(player, fantasyPlayersById)
  const parts = [
    fantasyPlayer?.name ?? player.displayName,
    player.slot ? `slot ${player.slot}` : null,
    `role ${player.squadRole}`,
    fantasyPlayer?.positionLabel ? `database positions ${fantasyPlayer.positionLabel}` : null,
    namedInLineups == null ? null : `lineups ${namedInLineups ? "named" : "not named"}`,
    player.isCaptain ? "captain" : null,
    fantasyPlayer ? `live database bye flag ${fantasyPlayer.isBye ? "yes" : "no"}` : null,
    byeFromLiveData ? "bye/DNP marker" : null,
    player.isBye && fantasyPlayer && !fantasyPlayer.isBye ? "screenshot bye marker ignored; live database says not bye" : null,
    player.status ? `status ${player.status}` : null,
    fantasyPlayer?.cost != null ? `price ${fantasyPlayer.cost}` : null,
    fantasyPlayer?.avgPoints != null ? `avg ${fantasyPlayer.avgPoints}` : null,
    hasFantasyPlotAccess && fantasyPlayer?.be != null ? `BE ${fantasyPlayer.be}` : null,
    hasFantasyPlotAccess && modelProjection != null ? `projection ${modelProjection}` : null,
  ].filter(Boolean)
  return parts.join(" | ")
}

function isPromptNonPlayer(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): boolean {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  if (!fantasyPlayer) return player.isBye || player.status === "injured" || player.status === "suspended"
  if (effectiveIsBye(player, fantasyPlayersById)) return true
  if (isFantasyPlayerUnavailableForProjectionFallback(fantasyPlayer)) return true
  if (player.status === "injured" || player.status === "suspended") return true
  return getLineupsNamedStatus(player, fantasyPlayersById, lineupsProjections) === false
}

function promptPlayerName(player: MyTeamPlayer, fantasyPlayersById: Map<number, FantasyPlayerSnapshot>): string {
  return player.playerId != null ? fantasyPlayersById.get(player.playerId)?.name ?? player.displayName : player.displayName
}

function buildLoopCandidateSummary(
  team: SavedMyTeam,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): string {
  const benchPlayers = team.players
    .filter((player) => player.squadRole !== "starter")
    .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99))
  const lines = team.players
    .filter((player) => player.squadRole === "starter" && isPromptNonPlayer(player, fantasyPlayersById, lineupsProjections))
    .flatMap((starter) => {
      const cover = benchPlayers.filter(
        (candidate) =>
          !isPromptNonPlayer(candidate, fantasyPlayersById, lineupsProjections) &&
          playerCanCoverSlot(candidate, starter.slot, fantasyPlayersById),
      )
      if (cover.length < 2) return []
      return [
        `- Non-playing ${starter.slot} starter ${promptPlayerName(starter, fantasyPlayersById)} can create a starter/INT loop with ${cover.slice(0, 4).map((candidate) => `${promptPlayerName(candidate, fantasyPlayersById)} (${candidate.squadRole}${candidate.benchOrder != null ? ` ${candidate.benchOrder}` : ""})`).join(", ")}.`,
      ]
    })

  return lines.length ? `Detected loop candidates:\n${lines.join("\n")}` : ""
}

function buildMyTeamAiPrompt({
  question,
  team,
  fantasyPlayersById,
  lineupsProjections,
  hasFantasyPlotAccess,
  history,
}: {
  question: string
  team: SavedMyTeam
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  lineupsProjections: LineupsProjectionSnapshot
  hasFantasyPlotAccess: boolean
  history: MyTeamChatMessage[]
}): string {
  const starters = team.players.filter((player) => player.squadRole === "starter")
  const interchange = team.players.filter((player) => player.squadRole === "interchange")
  const emergency = team.players.filter((player) => player.squadRole === "emergency")
  const loopCandidateSummary = buildLoopCandidateSummary(team, fantasyPlayersById, lineupsProjections)
  const ownedPlayerNames = team.players
    .map((player) => player.playerId != null ? fantasyPlayersById.get(player.playerId)?.name ?? player.displayName : player.displayName)
    .filter(Boolean)
  const recentHistory = history.slice(-6).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`).join("\n")
  const tradeSuggestorMetricInstructions = hasFantasyPlotAccess
    ? [
      "Use live fantasy data for both buys and sells: weekly ownership change, breakeven, projection, priced at, L3 average, and projection vs priced at. Projection vs priced at is important.",
      "Try to list 3 Sell watch candidates every time. Use owned squad players only, prioritising confirmed injury/unavailability, notable outs from lineups/casualty data, negative ownership change, high BE, projection below priced at, weak L3/projection, poor bye coverage, Origin risk, or a clear cash/squad problem. If fewer than 3 owned players have meaningful sell signals, list fewer rather than inventing names.",
      "Unless a player is injured, out, suspended, not named, misses the target major bye, or has another clear availability problem, their BE must be above priced at before they can be listed in Sell watch.",
      "If projection is 50+ and projection vs priced at is -5.0 or better, do not list them in Sell watch unless there is a clear offsetting issue like injury, not named, missing an upcoming major bye, likely Origin selection, or another serious squad/cash constraint.",
      "Origin players who are likely to miss all three major bye rounds 12, 15 and 18 are priority sell/avoid candidates even if they play the next single round. Treat Tolu Koula-style cases as bad major-bye coverage, not as simply plays next bye.",
      "List an owned player in Sell watch when live data shows their ownership delta is -1.0% or worse, BE is high, projection is below priced at, or they have confirmed injury/unavailability. Discuss whether they are a hard sell, possible sell, or hold using projection, priced at, BE, L3 average, ownership delta, injury/availability markers, and next major bye availability.",
      "If a player is -1.0% or worse in ownership delta but BE is lower than priced at, projection is similar to priced at, L3 is sound, and they play the next major bye, frame them as Hold / Possible sell rather than a hard sell.",
      "Do not say recent form has slipped when L3 average is above priced at.",
      "Describe form as strong only when L3 average supports that versus priced at. If L3 is below priced at, describe the case as projection-backed, role-backed, or avoid saying form.",
      "For each sell or buy, include Ownership change, BE, priced at, L3 average, projection vs priced at, major-bye availability across rounds 12/15/18, and one short reason.",
      "Mention any notable outs from the user's owned team before or inside Sell watch, but only when live lineup/casualty data supports the out.",
      "Use casualty ward and Origin chance context behind ownership, form, value, injury, bye and lineup signals; however, likely Origin players missing multiple major bye rounds should be treated as a major bye-coverage problem, not a minor tie-breaker.",
      "Major-bye trade-count rule for rounds 12, 15 and 18: first count active owned players who play the bye round and have projection >=35. If the user has 13 or more such players, recommend no trade unless there is a clear injury/Origin/high-BE/value problem. If they have 12, recommend one trade to reach 13 or upgrade a sub-35 scorer. If they have 11 or fewer, recommend 2-3 trades to reach 13. If they have 13 active scorers but one or more projected under 35, suggest at most one upgrade rather than forcing multiple trades.",
    ]
    : [
      "For free users, do not use projections, breakevens, projection vs priced at, casualty ward context, or Origin context as trade reasons.",
      "If restricted projection, breakeven, casualty ward, or Origin fields appear anyway, ignore those fields and do not show them in the answer.",
      "For broad trade answers, put this standalone note immediately before the Top 5 Trade Ins heading: Sign up to Pro to access projections and breakevens. Below is based on ownership movement, price, L3/form and bye coverage.",
      "Try to list 3 Sell watch candidates every time. Use owned squad players only, prioritising negative ownership change, weak L3 or season average for the price, poor bye coverage, or awkward cash/squad fit. If fewer than 3 owned players have meaningful sell signals, list fewer rather than inventing names.",
      "List an owned player in Sell watch when live data shows their ownership delta is -1.0% or worse, their recent form is weak for the price, or they have poor bye coverage. Discuss whether they are a hard sell, possible sell, or hold.",
      "If a player is -1.0% or worse in ownership delta but L3 is sound, bye coverage is useful, and there is no visible availability issue, frame them as Hold / Possible sell rather than a hard sell.",
      "Describe form as strong only when recent L3/average form supports that versus price. If recent form is weak for price, do not describe them as in form.",
      "For each sell or buy, include Ownership change, priced at, average/L3 form, next major bye availability, and one short reason. Do not include projections, breakevens, projection vs priced at, casualty ward, or Origin for free users.",
      "Major-bye trade-count rule for rounds 12, 15 and 18: first count owned players who the live database says play the bye round. If the user has 13 or more active players and no clear traded-out/form/bye-fit issue, recommend no trade. If they have 12, recommend one trade to reach 13. If they have 11 or fewer, recommend 2-3 trades to reach 13. Use L3/season average instead of projection thresholds.",
    ]

  return [
    "My Team NRL Fantasy AI request.",
    "You are advising on this user's NRL Fantasy team. Discuss trades, who to start, captaincy, major-bye coverage, looping, and squad structure.",
    "Lines before Team name are instructions only. Never treat instruction text as player names, and never pass instruction text to player lookup/search tools.",
    "This should work like the Fantasy Dashboard Find Trades feature, except the roster is already extracted below instead of coming from screenshots.",
    hasFantasyPlotAccess
      ? "Use internal/live fantasy data where available for projections, breakevens, prices, ownership movement, lineup status, casualty ward, draw and Origin risk. If live data is unavailable, say what you can infer from the supplied team only."
      : "Use internal/live fantasy data where available for prices, ownership movement, recent form, lineup status and draw. Do not use or mention projections, breakevens, casualty ward or Origin context for locked/free users.",
    "Important: live database bye/availability overrides screenshot marker extraction. Do not say a player has a bye or is DNP if the roster line says live database bye flag no, unless a current lineup/casualty tool explicitly confirms they are out. Screenshot bye/DNP markers and yellow question marks can be OCR noise.",
    "A roster line that says lineups not named is live lineup evidence that the player is not playing. Treat that player as a red-dot/DNP even if the live database bye flag says no.",
    "If a roster line says ignore screenshot bye marker; live database says not bye, treat that player as active/available unless another live tool says otherwise. Do not list that player as missing the round.",
    "When writing priced at values, round to the nearest whole number and do not show pricedAt decimals.",
    "For broad trade questions, use live fantasy snapshot data like Find Trades: fetch owned players by playerNames for sell/hold context, then fetch non-owned buy/value candidates. Respect the Pro/free metric rules below.",
    ...tradeSuggestorMetricInstructions,
    "Use the supplied My Team roster as the user's owned players. Do not recommend buying a player already listed as owned.",
    "Owned players to exclude from trade-in recommendations: " + ownedPlayerNames.join(", "),
    "For broad trade questions, return exactly these sections in this order: Top 5 Trade Ins, Sell Watch, Recommended Moves. If fewer than five clear trade-ins exist, list fewer. Rate trade-ins out of 10; do not rate sell/watch players.",
    !hasFantasyPlotAccess
      ? "For free broad trade answers, include the Pro note as plain text immediately before Top 5 Trade Ins; do not put it inside a section heading or inside the first ranked item."
      : null,
    "Use clean section titles only. Do not put ranking explanations, data-source notes, metric lists, or backend selection wording in section headings.",
    "For who-to-play or looping questions, return exactly these sections when relevant: Best 13/17 setup, Loop options, Risks.",
    "Do not use squad placement as a sell reason. Bench, INT, EMG, or emergency status is not bad by itself. Good players can sit anywhere in the squad.",
    hasFantasyPlotAccess
      ? "Sell watch should only include owned players. Prioritise confirmed injury/out/suspension from casualty ward or lineups, Origin-risk players from origin_chance, live confirmed bye/DNP, high BE, poor projection vs pricedAt, highly traded-out/negative ownership delta, or bad major-bye coverage. If a player is a hold, say hold rather than forcing a sale."
      : "Sell watch should only include owned players. Prioritise negative ownership delta, weak L3/season average for the price, poor bye coverage, visible lineup/bye issues, or bad squad/cash fit. If a player is a hold, say hold rather than forcing a sale.",
    hasFantasyPlotAccess
      ? "Trade-ins must be real live-data candidates and not already owned. Prefer players who play as many major bye rounds as possible, avoid Origin-risk players unless the upside clearly justifies it, then rank by traded-in/ownership delta, projection vs pricedAt, low BE, role security, and sensible price fit."
      : "Trade-ins must be real live-data candidates and not already owned. Prefer players who play as many major bye rounds as possible, then rank by traded-in/ownership delta, recent form, role security, price, and sensible squad fit. Do not mention projection, BE, projection vs priced at, Origin or casualty ward.",
    "For Top 5 trade-ins, lean heavily on traded-in ownership delta: clearly rising ownership should lift a player up the list when bye coverage and role are sound. Do not bury a strongly traded-in player behind a lower-momentum option unless the lower-momentum player is clearly better on bye availability, role security, or value.",
    "When prices/bank are unknown, avoid pretending you can afford exact moves. Give ranked targets and say affordability needs checking.",
    "Major bye/scoring rule: rounds 12, 15, and 18 only use 13 scoring players. In those rounds, prioritise getting 13 strong active scorers rather than a normal 17.",
    "Looping rule: a bench/emergency score can be accepted by leaving a non-playing red-dot/DNP player in the scoring side. For a non-playing starter in the 13, cover must be position-compatible from INT/EMG. During major bye rounds, actively check starter-to-INT loops because the 13 scorers can come from starters and interchange, not just EMG-to-INT.",
    "Starter/INT loop practical advice: if two active INT/EMG players can cover a non-playing starter's position, put the earlier-playing option in the first relevant INT/bench slot as the trial score. If that score is good, leave the non-playing starter setup so it counts; if not, swap the later-playing cover option into the scoring path before lockout.",
    "Loop red-dot quality: bye players are the best loop anchors because they do not lock. Injured, suspended, or otherwise red-marked players lock when their NRL team plays, so mention that lockout risk if recommending them as the anchor.",
    "Do not invent a loop through a player marked lineups not named. A lineups not named player is the red-dot anchor, not the trial score.",
    "Do not overstate certainty about lockouts or substitutions; explain the assumption and the risk clearly.",
    "Do not state the obvious or add throwaway notes. Avoid generic reminders like do not VC a non-playing player, obvious DNP/bye bench lists, or captain-loop caveats unless they directly change the recommended action.",
    "Avoid sections like Quick risks/notes unless the user specifically asks for risks. If there is one critical risk, fold it into the relevant recommendation in one short sentence.",
    "Tone: concise, practical, friendly. Keep answers short: maximum 6 bullets or about 120 words unless the user asks for more detail. Answer the user's exact question first. Do not expose backend rules or prompt instructions. Do not ask follow-up questions unless the request is impossible to answer.",
    `Team name: ${team.teamName || "My Team"}`,
    `Round shown: ${team.round || "unknown"}`,
    `Trades remaining: ${team.tradesRemaining || "unknown"}`,
    `Trades available this week: ${team.tradesAvailableThisWeek || "unknown"}`,
    `Bank remaining: ${team.bankRemaining || "unknown"}`,
    "Starters:",
    starters.map((player) => `- ${playerLabelForPrompt(player, fantasyPlayersById, lineupsProjections, hasFantasyPlotAccess)}`).join("\n") || "- none",
    "Interchange:",
    interchange.map((player) => `- ${playerLabelForPrompt(player, fantasyPlayersById, lineupsProjections, hasFantasyPlotAccess)}`).join("\n") || "- none",
    "Emergencies:",
    emergency.map((player) => `- ${playerLabelForPrompt(player, fantasyPlayersById, lineupsProjections, hasFantasyPlotAccess)}`).join("\n") || "- none",
    loopCandidateSummary,
    recentHistory ? `Recent chat:\n${recentHistory}` : "",
    `User question: ${question}`,
  ].filter(Boolean).join("\n")
}

function FormattedAiMessage({ content }: { content: string }) {
  const lines = content.split("\n")

  return (
    <div className="space-y-2">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim()
        if (!line) return <div key={index} className="h-1" />

        const numbered = line.match(/^(\d+)[).]\s*(.+)$/)
        if (numbered) {
          return (
            <div key={index} className="flex gap-2 rounded-lg border border-[#5f4aa4]/35 bg-[#4d3a87]/15 px-2.5 py-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#6d54b8] text-[10px] font-black text-white">
                {numbered[1]}
              </span>
              <span className="min-w-0 text-[13px] leading-5 text-nrl-text">{numbered[2]}</span>
            </div>
          )
        }

        const bullet = line.match(/^[-•]\s*(.+)$/)
        if (bullet) {
          return (
            <div key={index} className="flex gap-2 pl-1 text-[13px] leading-5 text-nrl-text">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-nrl-accent" />
              <span>{bullet[1]}</span>
            </div>
          )
        }

        const normalisedHeading = (() => {
          if (/^top\s*5\s*trade[-\s]?ins?/i.test(line)) return "Top 5 Trade Ins"
          if (/^sell\s*watch/i.test(line)) return "Sell Watch"
          if (/^recommended\s*moves/i.test(line)) return "Recommended Moves"
          if (/^best\s*13\/17\s*setup/i.test(line)) return "Best 13/17 Setup"
          if (/^loop\s*options/i.test(line)) return "Loop Options"
          if (/^risks/i.test(line)) return "Risks"
          if (/^captaincy/i.test(line)) return "Captaincy"
          if (/^trade[-\s]?ins?/i.test(line)) return "Trade Ins"
          if (/^sells?/i.test(line)) return "Sells"
          return null
        })()
        const heading = normalisedHeading != null
        if (heading) {
          return (
            <div key={index} className={index === 0 ? "" : "pt-2"}>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-nrl-accent">{normalisedHeading}</div>
            </div>
          )
        }

        return (
          <p key={index} className="text-[13px] leading-5 text-nrl-text">
            {line}
          </p>
        )
      })}
    </div>
  )
}

function AiTypingDots() {
  return (
    <div className="mr-auto inline-flex max-w-[94%] items-center gap-2 rounded-lg border border-nrl-border bg-[#101936] px-3 py-2 text-sm text-nrl-muted">
      <span>Thinking</span>
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-nrl-accent"
            style={{ animationDelay: `${dot * 120}ms` }}
          />
        ))}
      </span>
    </div>
  )
}

function MagicAiIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 3.5l1.3 4.1 4.2 1.3-4.2 1.3-1.3 4.1-1.3-4.1-4.2-1.3 4.2-1.3L12 3.5ZM18.5 13.5l.7 2.2 2.3.8-2.3.7-.7 2.3-.8-2.3-2.2-.7 2.2-.8.8-2.2ZM5.7 14.3l.6 1.8 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.8Z"
        fill="currentColor"
      />
    </svg>
  )
}

function SendArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 5v14M6.5 10.5 12 5l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  )
}

function MyTeamAiChatPanel({
  team,
  fantasyPlayersById,
  lineupsProjections,
  hasFantasyPlotAccess,
  onClose,
}: {
  team: SavedMyTeam
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  lineupsProjections: LineupsProjectionSnapshot
  hasFantasyPlotAccess: boolean
  onClose?: () => void
}) {
  const [messages, setMessages] = useState<MyTeamChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [scrollOnNextMessage, setScrollOnNextMessage] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    if (isMinimized || !scrollOnNextMessage) return
    const frame = window.requestAnimationFrame(() => {
      const chat = chatScrollRef.current
      if (!chat) return
      chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" })
      setScrollOnNextMessage(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, isMinimized, scrollOnNextMessage])

  const submitQuestion = async (value: string) => {
    const question = value.trim()
    if (!question || isSending) return

    const nextMessages: MyTeamChatMessage[] = [...messages, { role: "user", content: question }]
    setMessages(nextMessages)
    setScrollOnNextMessage(true)
    setDraft("")
    setError(null)
    setIsSending(true)

    try {
      const token = isSignedIn ? await getToken().catch(() => null) : null
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: buildMyTeamAiPrompt({
            question,
            team,
            fantasyPlayersById,
            lineupsProjections,
            hasFantasyPlotAccess,
            history: messages,
          }),
          persist: false,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { assistantMessage?: string; error?: string } | null
      const assistantMessage = payload?.assistantMessage ?? payload?.error
      if (!response.ok || !assistantMessage) {
        throw new Error(assistantMessage ?? "Unable to reach NRL AI.")
      }
      setMessages([...nextMessages, { role: "assistant", content: assistantMessage }])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reach NRL AI.")
      setMessages(messages)
    } finally {
      setIsSending(false)
    }
  }

  const quickQuestions = [
    "What trades should I consider?",
    "Who should I play this week?",
    "Who should I captain this week?",
    "Do I have a loop option?",
  ]

  return (
    <section className="overflow-hidden rounded-xl border border-nrl-border/70 bg-[#111832]/62 shadow-[0_18px_48px_rgba(2,6,23,0.34)] backdrop-blur-[2px]">
      <button
        type="button"
        onClick={() => {
          if (onClose) {
            onClose()
            return
          }
          setIsMinimized((value) => !value)
        }}
        className={`flex w-full items-center justify-between gap-3 bg-[#111832]/58 text-left transition-colors hover:bg-[#151e3d]/72 ${
          onClose ? "px-4 py-4" : "px-4 py-3 lg:px-6 lg:py-4"
        } ${
          isMinimized ? "" : "border-b border-nrl-border"
        }`}
        aria-expanded={!isMinimized}
      >
        <span className="inline-flex items-center gap-2">
          <span className={`grid place-items-center rounded-full ${
            onClose
              ? "h-10 w-10 border border-pink-200/35 bg-[linear-gradient(135deg,#1687ff_0%,#8257ff_48%,#ff4ea0_100%)] text-white shadow-[0_10px_24px_rgba(23,41,140,0.35)]"
              : "h-7 w-7 bg-nrl-accent/15 text-nrl-accent lg:h-9 lg:w-9"
          }`}>
            <MagicAiIcon className={onClose ? "h-5 w-5" : "h-4 w-4 lg:h-5 lg:w-5"} />
          </span>
          <span>
            <span className="block text-xs font-black uppercase tracking-[0.18em] text-nrl-accent lg:text-sm">NRL AI</span>
          </span>
        </span>
        <span className="text-lg font-black leading-none text-nrl-muted lg:text-2xl">{isMinimized ? "+" : "-"}</span>
      </button>

      {!isMinimized ? (
        <>
          <div className="border-b border-nrl-border bg-[#111832] px-4 py-3 lg:px-6 lg:py-4">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    void submitQuestion(question)
                  }}
                  disabled={isSending}
                  className="w-full whitespace-nowrap rounded-full border border-nrl-border bg-[#20284a] px-1.5 py-1.5 text-[8px] font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-50 min-[380px]:px-2 min-[380px]:text-[9px] sm:w-auto sm:px-3 sm:text-[11px] lg:px-4 lg:py-2 lg:text-sm"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 bg-[#111832]/52 px-4 py-4 lg:px-6 lg:py-5">
            {messages.length > 0 || isSending ? (
              <div ref={chatScrollRef} className="max-h-80 space-y-4 overflow-y-auto pr-1">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-lg border px-3 py-2 text-sm leading-6 ${
                      message.role === "user"
                        ? "ml-auto max-w-[88%] border-nrl-accent/35 bg-[#123f3a]/62 text-nrl-text"
                        : "mr-auto max-w-[94%] border-nrl-border/75 bg-[#101936]/70 text-nrl-text"
                    }`}
                  >
                    {message.role === "assistant" ? <FormattedAiMessage content={message.content} /> : message.content}
                  </div>
                ))}
                {isSending ? <AiTypingDots /> : null}
              </div>
            ) : null}

            {error ? <div className="text-xs text-rose-200">{error}</div> : null}

            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault()
                void submitQuestion(draft)
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={1}
                placeholder="Ask about a trade, loop, captaincy or who to play..."
                className="min-h-10 w-full resize-none overflow-hidden whitespace-nowrap rounded-xl border border-nrl-border/75 bg-[#0e1530]/68 py-2.5 pl-3 pr-12 text-[10px] leading-5 text-nrl-text outline-none transition-colors placeholder:text-nrl-muted focus:border-nrl-accent min-[380px]:text-[11px] sm:text-sm lg:min-h-12 lg:py-3 lg:pl-4 lg:pr-14 lg:text-base"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                aria-label="Ask NRL AI"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-nrl-accent/50 bg-nrl-accent text-[#07131f] shadow-[0_8px_18px_rgba(0,245,138,0.22)] transition-opacity disabled:cursor-not-allowed disabled:opacity-45 lg:right-3 lg:h-8 lg:w-8"
              >
                {isSending ? (
                  <span className="inline-flex items-center gap-0.5">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1 w-1 animate-bounce rounded-full bg-[#07131f]"
                        style={{ animationDelay: `${dot * 120}ms` }}
                      />
                    ))}
                  </span>
                ) : (
                  <SendArrowIcon className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  )
}

function MyTeamAiComingSoonPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-nrl-border/70 bg-[#111832]/64 shadow-[0_18px_48px_rgba(2,6,23,0.34)] backdrop-blur-[2px]">
      <button
        type="button"
        onClick={onClose}
        className="flex w-full items-center justify-between gap-3 bg-[#111832]/58 px-4 py-4 text-left transition-colors hover:bg-[#151e3d]/72"
        aria-label="Close NRL AI coming soon"
      >
        <span className="inline-flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-pink-200/35 bg-[linear-gradient(135deg,#1687ff_0%,#8257ff_48%,#ff4ea0_100%)] text-white shadow-[0_10px_24px_rgba(23,41,140,0.35)]">
            <MagicAiIcon className="h-5 w-5" />
          </span>
          <span className="block text-xs font-black uppercase tracking-[0.18em] text-nrl-accent lg:text-sm">NRL AI</span>
        </span>
        <span className="text-lg font-black leading-none text-nrl-muted lg:text-2xl">-</span>
      </button>
      <div className="border-t border-nrl-border/70 bg-[#111832]/52 px-4 py-5 lg:px-6">
        <div className="rounded-xl border border-nrl-border/75 bg-[#0e1530]/68 px-4 py-4 text-sm font-semibold text-nrl-text">
          Coming soon.
        </div>
      </div>
    </section>
  )
}

function ScreenshotUploadPanel({
  screenshots,
  uploadingSlot,
  isSubmitting,
  isAuthLoaded,
  isSignedIn,
  error,
  status,
  isUpdateMode,
  onScreenshotChange,
  onSubmit,
  onClear,
}: {
  screenshots: Record<ScreenshotSlot, TeamScreenshot | null>
  uploadingSlot: ScreenshotSlot | null
  isSubmitting: boolean
  isAuthLoaded: boolean
  isSignedIn: boolean
  error: string | null
  status: string | null
  isUpdateMode: boolean
  onScreenshotChange: (slot: ScreenshotSlot, files: FileList | null) => void
  onSubmit: () => void
  onClear: () => void
}) {
  const hasScreenshot = SCREENSHOT_SLOTS.some((slot) => screenshots[slot.key] != null)
  const showSignInPrompt = isAuthLoaded && !isSignedIn

  return (
    <section className="overflow-hidden rounded-xl border border-nrl-accent/35 bg-[linear-gradient(135deg,rgba(0,245,138,0.12),rgba(124,58,237,0.14))]">
      <div className="grid gap-4 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:p-4">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.16em] text-white">{isUpdateMode ? "Update My Team" : "Build My Team"}</div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-nrl-muted md:text-sm">
            Upload My Team screenshots plus the trade screen and NRL AI will fill your squad, captain, byes, trades, and bank.
          </p>
        </div>
        {showSignInPrompt ? (
          <SignInButton mode="modal">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-nrl-accent/50 bg-[linear-gradient(135deg,#00f58a,#8b5cf6)] px-4 py-2 text-sm font-black text-[#07131f] transition-opacity"
            >
              Sign in to {isUpdateMode ? "update" : "autofill"}
            </button>
          </SignInButton>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!hasScreenshot || !isAuthLoaded || isSubmitting || uploadingSlot != null}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-nrl-accent/50 bg-[linear-gradient(135deg,#00f58a,#8b5cf6)] px-4 py-2 text-sm font-black text-[#07131f] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-1">
                <span>Filling team</span>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07131f]"
                    style={{ animationDelay: `${dot * 120}ms` }}
                  />
                ))}
              </span>
            ) : isUpdateMode ? "Update My Team" : "Autofill My Team"}
          </button>
        )}
      </div>

      <div className="grid gap-3 border-t border-nrl-border/70 bg-nrl-panel/55 p-3 md:grid-cols-3 md:p-4">
        {SCREENSHOT_SLOTS.map((slot) => {
          const screenshot = screenshots[slot.key]
          const uploading = uploadingSlot === slot.key
          return (
            <label
              key={slot.key}
              className="flex min-h-24 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-nrl-accent/35 bg-[#20284a] p-3 transition-colors hover:border-nrl-accent"
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={isSubmitting}
                onChange={(event) => {
                  onScreenshotChange(slot.key, event.currentTarget.files)
                  event.currentTarget.value = ""
                }}
              />
              <span className="flex min-w-0 items-center gap-3">
                {screenshot ? (
                  <span className="flex h-20 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-nrl-border bg-nrl-panel-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshot.dataUrl} alt={`${slot.label} preview`} className="h-full w-full object-contain" />
                  </span>
                ) : null}
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wide text-nrl-accent">{slot.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-nrl-muted">{slot.hint}</span>
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-nrl-border bg-nrl-panel px-2 py-1.5 text-[11px] font-semibold text-nrl-text">
                {uploading ? "Processing..." : screenshot ? "Replace" : "Upload"}
              </span>
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-nrl-border/70 px-3 py-2 text-xs md:px-4">
        <div className={error ? "text-rose-200" : "text-nrl-muted"}>
          {error ?? status ?? (hasScreenshot ? "Ready to fill from screenshots." : "Upload screenshots to build or update your team.")}
        </div>
        <div className="flex items-center gap-2">
          {hasScreenshot ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md border border-nrl-border px-2 py-1 text-[11px] font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
            >
              Clear screenshots
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function normaliseLineupsName(value: string): string {
  const key = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (key === "api koroisau") return "apisai koroisau"
  return key
}

function isFantasyPlayerUnavailableForProjectionFallback(player: FantasyPlayerSnapshot): boolean {
  if (player.isBye) return true
  const status = player.status?.trim().toLowerCase()
  return Boolean(
    status &&
    ["injured", "suspended", "out", "unavailable", "not playing"].some((token) => status.includes(token))
  )
}

function modelProjectionForFantasyPlayer(
  fantasyPlayer: FantasyPlayerSnapshot,
  lineupsProjections: LineupsProjectionSnapshot,
  fallbackProjection: number | null,
): number | null {
  const playerNameKey = normaliseLineupsName(fantasyPlayer.name)

  if (lineupsProjections.source === "lineups") {
    const isNamed =
      lineupsProjections.roleByPlayerId.has(fantasyPlayer.id) ||
      lineupsProjections.roleByPlayerName.has(playerNameKey)

    if (!isNamed) return 0

    return (
      lineupsProjections.projectionByPlayerId.get(fantasyPlayer.id) ??
      lineupsProjections.projectionByPlayerName.get(playerNameKey) ??
      0
    )
  }

  if (lineupsProjections.source === "lineup_unaware") {
    if (isFantasyPlayerUnavailableForProjectionFallback(fantasyPlayer)) return null
    return (
      lineupsProjections.projectionByPlayerId.get(fantasyPlayer.id) ??
      lineupsProjections.projectionByPlayerName.get(playerNameKey) ??
      null
    )
  }

  const nameProjection = lineupsProjections.projectionByPlayerName.get(playerNameKey) ?? null
  return (
    lineupsProjections.projectionByPlayerId.get(fantasyPlayer.id) ??
    (nameProjection != null
      ? isFantasyPlayerUnavailableForProjectionFallback(fantasyPlayer) ? 0 : nameProjection
      : null) ??
    fallbackProjection ??
    fantasyPlayer.projectedAvg ??
    0
  )
}

function getLineupsNamedStatus(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): boolean | null {
  if (lineupsProjections.source !== "lineups") return null
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  if (!fantasyPlayer) return null
  return (
    lineupsProjections.roleByPlayerId.has(fantasyPlayer.id) ||
    lineupsProjections.roleByPlayerName.has(normaliseLineupsName(fantasyPlayer.name))
  )
}

function playerHasCurrentUnavailableStatus(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): boolean {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) ?? null : null
  const liveStatus = fantasyPlayer?.status?.trim().toLowerCase() ?? ""
  return (
    player.status === "injured" ||
    player.status === "suspended" ||
    liveStatus.includes("injur") ||
    liveStatus.includes("suspend") ||
    liveStatus.includes("not-playing") ||
    liveStatus.includes("not playing") ||
    liveStatus === "out"
  )
}

function Marker({
  player,
  fantasyPlayersById,
  lineupsProjections,
  override,
}: {
  player: MyTeamPlayer
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  lineupsProjections: LineupsProjectionSnapshot
  override?: "available" | "unavailable" | "bye" | null
}) {
  if (override === "available") return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#51b847] text-[10px] font-black text-white">✓</span>
  if (override === "unavailable") return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#e54848] text-[10px] font-black text-white">×</span>
  if (override === "bye") return <span className="grid h-4 w-4 place-items-center rounded-full bg-black"><span className="h-1.5 w-1.5 bg-white" /></span>
  if (player.status === "injured") return <span className="grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-black text-white">+</span>
  if (player.status === "suspended") return <span className="h-3.5 w-3.5 rounded-full bg-red-500 ring-2 ring-white" />
  if (effectiveIsBye(player, fantasyPlayersById)) return <span className="grid h-4 w-4 place-items-center rounded-full bg-black"><span className="h-1.5 w-1.5 bg-white" /></span>
  const namedStatus = getLineupsNamedStatus(player, fantasyPlayersById, lineupsProjections)
  if (namedStatus === true) return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#51b847] text-[10px] font-black text-white">✓</span>
  if (namedStatus === false) return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#e54848] text-[10px] font-black text-white">×</span>
  if (player.status === "uncertain") return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#d6cc13] text-[10px] font-black text-white">?</span>
  return null
}

function getRoundAvailability(
  player: MyTeamPlayer,
  round: MyTeamProjectionRound,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
  draw2026Data: Draw2026Data | null,
  originPlayerNames: Set<string>,
): Omit<RoundAvailabilityBadge, "round"> {
  const team = resolveMyTeamPlayerTeam(player, fantasyPlayersById, playerImages)
  const playsRound = teamPlaysInRound(draw2026Data, round, team)

  if (
    MY_TEAM_MAJOR_BYE_ROUNDS.includes(round as MyTeamMajorByeRound) &&
    isOriginChancePlayer(player, fantasyPlayersById, originPlayerNames)
  ) {
    return { available: false, reason: "Origin risk", isBye: false, isOriginRisk: true }
  }

  if (playsRound === false) return { available: false, reason: team ? `${team} bye Rd${round}` : `Bye Rd${round}`, isBye: true, isOriginRisk: false }
  if (playsRound === true) return { available: true, reason: team ? `${team} play Rd${round}` : `Plays Rd${round}`, isBye: false, isOriginRisk: false }
  return { available: false, reason: "Unknown draw", isBye: false, isOriginRisk: false }
}

function getMajorRoundAvailability(
  player: MyTeamPlayer,
  round: MyTeamMajorByeRound,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
  draw2026Data: Draw2026Data | null,
  originPlayerNames: Set<string>,
): RoundAvailabilityBadge {
  return {
    round,
    ...getRoundAvailability(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames),
  }
}

function getMajorRoundAvailabilityBadges(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
  draw2026Data: Draw2026Data | null,
  originPlayerNames: Set<string>,
  currentRound: number | null,
): RoundAvailabilityBadge[] {
  return MY_TEAM_MAJOR_BYE_ROUNDS
    .filter((round) => currentRound == null || round >= currentRound)
    .map((round) =>
      getMajorRoundAvailability(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames),
    )
}

function isAvailableForProjectionRound(
  player: MyTeamPlayer,
  round: MyTeamProjectionRound,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
  draw2026Data: Draw2026Data | null,
  originPlayerNames: Set<string>,
): boolean {
  return getRoundAvailability(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames).available
}

function playerPriceForSort(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): number {
  return player.playerId != null ? fantasyPlayersById.get(player.playerId)?.cost ?? 0 : 0
}

function buildMajorRoundDisplayLineup(
  players: MyTeamPlayer[],
  round: MyTeamProjectionRound | null,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  playerImages: PlayerImageRecord[],
  draw2026Data: Draw2026Data | null,
  originPlayerNames: Set<string>,
) {
  const startersBySlot = new Map<string, IndexedMyTeamPlayer[]>()
  for (const row of STARTER_ROWS) startersBySlot.set(row.slot, [])

  if (round == null) {
    players.forEach((player, index) => {
      if (player.squadRole !== "starter") return
      const slot = STARTER_ROWS.some((row) => row.slot === player.slot) ? player.slot : ""
      if (!slot) return
      startersBySlot.get(slot)?.push({ player, index })
    })
    const benchPlayers = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.squadRole !== "starter")
      .sort((a, b) => (a.player.benchOrder ?? 99) - (b.player.benchOrder ?? 99))
    return {
      startersBySlot,
      benchPlayers,
      scoringIndexes: new Set<number>(),
    }
  }

  const indexedPlayers = players.map((player, index) => ({ player, index }))
  const usedIndexes = new Set<number>()
  const scoringIndexes = new Set<number>()
  const activeScore = ({ player, index }: IndexedMyTeamPlayer) => {
    const active = isAvailableForProjectionRound(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames) ? 1 : 0
    const originalStarter = player.squadRole === "starter" ? 0.4 : 0
    const price = playerPriceForSort(player, fantasyPlayersById)
    return active * 1000 + price / 1000 + originalStarter - index / 10000
  }

  const starterRowsByScarcity = [...STARTER_ROWS].sort((left, right) => {
    const leftCandidates = indexedPlayers.filter(({ player }) =>
      isAvailableForProjectionRound(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames) &&
      playerCanCoverSlot(player, left.slot, fantasyPlayersById),
    ).length
    const rightCandidates = indexedPlayers.filter(({ player }) =>
      isAvailableForProjectionRound(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames) &&
      playerCanCoverSlot(player, right.slot, fantasyPlayersById),
    ).length
    if (leftCandidates !== rightCandidates) return leftCandidates - rightCandidates
    return STARTER_ROWS.findIndex((row) => row.slot === left.slot) - STARTER_ROWS.findIndex((row) => row.slot === right.slot)
  })

  for (const row of starterRowsByScarcity) {
    const slotEntries: IndexedMyTeamPlayer[] = []
    for (let cellIndex = 0; cellIndex < row.count; cellIndex += 1) {
      const activeCover = indexedPlayers
        .filter(({ player, index }) =>
          !usedIndexes.has(index) &&
          isAvailableForProjectionRound(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames) &&
          playerCanCoverSlot(player, row.slot, fantasyPlayersById),
        )
        .sort((a, b) => activeScore(b) - activeScore(a))[0]
      const fallbackStarter = indexedPlayers
        .filter(({ player, index }) => !usedIndexes.has(index) && playerCanCoverSlot(player, row.slot, fantasyPlayersById))
        .sort((a, b) => activeScore(b) - activeScore(a))[0]
      const entry = activeCover ?? fallbackStarter ?? null
      if (!entry) continue
      const entryAvailable = isAvailableForProjectionRound(entry.player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames)
      usedIndexes.add(entry.index)
      if (entryAvailable) scoringIndexes.add(entry.index)
      slotEntries.push({
        index: entry.index,
        player: { ...entry.player, squadRole: "starter", slot: row.slot, benchOrder: null },
      })
    }
    startersBySlot.set(row.slot, slotEntries)
  }

  const remaining = indexedPlayers
    .filter(({ index }) => !usedIndexes.has(index))
    .sort((a, b) => {
      const aAvailable = isAvailableForProjectionRound(a.player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames)
      const bAvailable = isAvailableForProjectionRound(b.player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames)
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1
      const priceDelta = playerPriceForSort(b.player, fantasyPlayersById) - playerPriceForSort(a.player, fantasyPlayersById)
      if (priceDelta !== 0) return priceDelta
      return (a.player.benchOrder ?? 99) - (b.player.benchOrder ?? 99)
    })

  const benchPlayers = remaining.slice(0, 8).map((entry, benchIndex) => {
    const isAvailable = isAvailableForProjectionRound(entry.player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames)
    const isInterchange = benchIndex < 4 && isAvailable
    const squadRole: SquadRole = isInterchange ? "interchange" : "emergency"
    if (isInterchange) scoringIndexes.add(entry.index)
    return {
      index: entry.index,
      player: {
        ...entry.player,
        squadRole,
        slot: isInterchange ? "INT" : "EMG",
        benchOrder: benchIndex + 1,
      },
    }
  })

  return {
    startersBySlot,
    benchPlayers,
    scoringIndexes,
  }
}

function projectionForPlayer(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): number | null {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  if (!fantasyPlayer) return null
  if (fantasyPlayer.isBye || player.status === "injured" || player.status === "suspended") return 0
  const coachPlayer = player.playerId != null ? fantasyCoachPlayersById.get(player.playerId) : null
  const coachProjection = getFantasyCoachRoundMetrics(coachPlayer).projection
  const projection = modelProjectionForFantasyPlayer(fantasyPlayer, lineupsProjections, coachProjection)
  return typeof projection === "number" && Number.isFinite(projection) ? projection : null
}

function effectiveProjectionForPlayer(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): number | null {
  const projection = projectionForPlayer(player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections)
  if (projection == null) return null
  return player.isCaptain ? projection * 2 : projection
}

function actualScoreForPlayerRound(
  player: MyTeamPlayer,
  round: MyTeamProjectionRound | null,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): number | null {
  if (round == null || player.playerId == null) return null
  const fantasyPlayer = fantasyPlayersById.get(player.playerId)
  const score = fantasyPlayer?.scoreHistory?.[String(round)]
  return typeof score === "number" && Number.isFinite(score) ? score : null
}

function playerCanCoverSlot(
  player: MyTeamPlayer,
  slot: string,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): boolean {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  if (fantasyPlayer) return fantasyPlayer.positionLabels.includes(slot)
  return player.slot === slot
}

function playersShareFantasyPosition(
  a: MyTeamPlayer,
  b: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): boolean {
  const aFantasyPlayer = a.playerId != null ? fantasyPlayersById.get(a.playerId) : null
  const bFantasyPlayer = b.playerId != null ? fantasyPlayersById.get(b.playerId) : null
  const aPositions = aFantasyPlayer?.positionLabels.length ? aFantasyPlayer.positionLabels : [a.slot]
  const bPositions = bFantasyPlayer?.positionLabels.length ? bFantasyPlayer.positionLabels : [b.slot]
  return aPositions.some((position) => bPositions.includes(position))
}

function isNonPlayingForProjection(
  player: MyTeamPlayer,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): boolean {
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) : null
  if (!fantasyPlayer) return true
  if (effectiveIsBye(player, fantasyPlayersById) || player.status === "injured" || player.status === "suspended") return true
  if (isFantasyPlayerUnavailableForProjectionFallback(fantasyPlayer)) return true
  if (getLineupsNamedStatus(player, fantasyPlayersById, lineupsProjections) === false) return true
  return projectionForPlayer(player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections) === 0
}

function isPlayableCover(
  player: MyTeamPlayer,
  slot: string,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
): boolean {
  if (!playerCanCoverSlot(player, slot, fantasyPlayersById)) return false
  if (isNonPlayingForProjection(player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections)) return false
  const projection = projectionForPlayer(player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections)
  return projection != null && projection > 0
}

function buildProjectedScoringSide(
  players: MyTeamPlayer[],
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>,
  lineupsProjections: LineupsProjectionSnapshot,
) {
  const benchPool = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.squadRole !== "starter")
    .sort((a, b) => (a.player.benchOrder ?? 99) - (b.player.benchOrder ?? 99))
  const usedCoverPlayerIndexes = new Set<number>()
  const scorers: IndexedMyTeamPlayer[] = []

  for (const row of STARTER_ROWS) {
    const slotStarters = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.squadRole === "starter" && player.slot === row.slot)
    const effectiveStarters = slotStarters.slice(0, row.count).map(({ player: starter, index }) => {
      if (!isNonPlayingForProjection(starter, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections)) {
        return { player: starter, index }
      }

      const cover = benchPool.find(
        ({ player: candidate, index: candidateIndex }) =>
          !usedCoverPlayerIndexes.has(candidateIndex) &&
          isPlayableCover(candidate, row.slot, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections),
      )
      if (!cover) return { player: starter, index }
      usedCoverPlayerIndexes.add(cover.index)
      return { player: cover.player, index: cover.index }
    })

    scorers.push(...effectiveStarters)
  }

  return scorers
}

function placementForPlayer(player: MyTeamPlayer) {
  return {
    squadRole: player.squadRole,
    slot: player.slot,
    benchOrder: player.benchOrder,
  }
}

function swapMyTeamPlayers(
  team: SavedMyTeam,
  sourceIndex: number,
  target: TeamDropTarget,
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>,
): { team: SavedMyTeam | null; error: string | null } {
  const sourcePlayer = team.players[sourceIndex] ?? null
  const targetIndex = target.playerIndex
  const targetPlayer = targetIndex != null ? team.players[targetIndex] ?? null : null
  if (!sourcePlayer || targetIndex === sourceIndex) return { team: null, error: null }
  if (target.kind === "bench" && !targetPlayer) return { team: null, error: null }

  if (target.kind === "starter" && !playerCanCoverSlot(sourcePlayer, target.slot, fantasyPlayersById)) {
    return { team: null, error: `${sourcePlayer.displayName} cannot play ${target.slot}.` }
  }

  if (targetPlayer && sourcePlayer.squadRole === "starter" && !playerCanCoverSlot(targetPlayer, sourcePlayer.slot, fantasyPlayersById)) {
    return { team: null, error: `${targetPlayer.displayName} cannot play ${sourcePlayer.slot}.` }
  }

  const nextPlayers = team.players.map((player) => ({ ...player }))
  const sourcePlacement = placementForPlayer(sourcePlayer)

  if (targetPlayer && targetIndex != null) {
    const targetPlacement = placementForPlayer(targetPlayer)
    nextPlayers[sourceIndex] = { ...nextPlayers[sourceIndex], ...targetPlacement }
    nextPlayers[targetIndex] = { ...nextPlayers[targetIndex], ...sourcePlacement }
  } else if (target.kind === "starter") {
    nextPlayers[sourceIndex] = {
      ...nextPlayers[sourceIndex],
      squadRole: "starter",
      slot: target.slot,
      benchOrder: null,
    }
  }

  return { team: { ...team, players: nextPlayers }, error: null }
}

function dropTargetForPlayer(player: MyTeamPlayer, index: number): TeamDropTarget {
  return player.squadRole === "starter"
    ? { kind: "starter", slot: player.slot, playerIndex: index }
    : { kind: "bench", playerIndex: index }
}

function formatProjection(value: number | null): string {
  return value == null ? "-" : String(Math.round(value))
}

function formatTeamMetaValue(value: string): string {
  return value.trim() || "-"
}

function cleanTradeCount(value: string): string {
  return numberParts(value)[0] ?? value.trim()
}

function formatTradesDisplay(team: SavedMyTeam | null): string {
  const overall = cleanTradeCount(team?.tradesRemaining ?? "")
  const weekly = cleanTradeCount(team?.tradesAvailableThisWeek ?? "")
  if (overall && weekly) return `${overall}(${weekly})`
  return formatTeamMetaValue(overall || weekly)
}

function formatPrice(value: number | null): string {
  return value == null ? "-" : `$${Math.round(value / 1000)}k`
}

function averageLastScores(scoreHistory: Record<string, number>, count: number): number | null {
  const values = Object.entries(scoreHistory)
    .map(([round, score]) => ({ round: Number(round), score }))
    .filter(({ round, score }) => Number.isFinite(round) && Number.isFinite(score))
    .sort((a, b) => b.round - a.round)
    .slice(0, count)
    .map(({ score }) => score)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function parseBankValue(value: string): number {
  const trimmed = value.trim().toLowerCase().replace(/[$,\s]/g, "")
  if (!trimmed) return 0
  const match = trimmed.match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0
  const amount = Number(match[0])
  if (!Number.isFinite(amount)) return 0
  if (trimmed.includes("m")) return Math.round(amount * 1_000_000)
  if (trimmed.includes("k")) return Math.round(amount * 1_000)
  return Math.round(amount)
}

function decrementNumberText(value: string): string {
  const match = value.match(/\d+/)
  if (!match) return value.trim() ? value : "0"
  const current = Number(match[0])
  if (!Number.isFinite(current)) return value
  return value.slice(0, match.index) + String(Math.max(0, current - 1)) + value.slice((match.index ?? 0) + match[0].length)
}

function incrementNumberText(value: string): string {
  const match = value.match(/\d+/)
  if (!match) return value.trim() ? value : "1"
  const current = Number(match[0])
  if (!Number.isFinite(current)) return value
  return value.slice(0, match.index) + String(current + 1) + value.slice((match.index ?? 0) + match[0].length)
}

function firstNumberValue(value: string): number | null {
  const match = value.match(/\d+/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function imageSourcesForFantasyPlayer(
  player: FantasyPlayerSnapshot,
  playerImages: PlayerImageRecord[],
): string[] {
  const imageRow = resolvePlayerImage(player.name, null, playerImages)
  return [
    imageRow?.head_image,
    imageRow?.body_image,
  ].flatMap((value) => {
    const trimmed = value?.trim()
    return trimmed ? [trimmed] : []
  })
}

function buildTradeCandidates({
  selectedPlayer,
  fantasyPlayers,
  fantasyPlayersById,
  fantasyCoachPlayersById,
  lineupsProjections,
  team,
}: {
  selectedPlayer: MyTeamPlayer
  fantasyPlayers: FantasyPlayerSnapshot[]
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>
  lineupsProjections: LineupsProjectionSnapshot
  team: SavedMyTeam
}): TradeCandidate[] {
  const selectedFantasyPlayer = selectedPlayer.playerId != null ? fantasyPlayersById.get(selectedPlayer.playerId) : null
  const budget = (selectedFantasyPlayer?.cost ?? 0) + parseBankValue(team.bankRemaining)
  const ownedIds = new Set(team.players.flatMap((player) => player.playerId == null ? [] : [player.playerId]))

  return fantasyPlayers
    .filter((player) => !ownedIds.has(player.id))
    .filter((player) => selectedPlayer.squadRole !== "starter" || player.positionLabels.includes(selectedPlayer.slot))
    .map((player) => {
      const coachMetrics = getFantasyCoachRoundMetrics(fantasyCoachPlayersById.get(player.id) ?? null)
      const projection = modelProjectionForFantasyPlayer(player, lineupsProjections, coachMetrics.projection)
      return {
        player,
        price: player.cost,
        last3: averageLastScores(player.scoreHistory, 3),
        breakEven: coachMetrics.breakEven ?? player.be ?? null,
        projection,
        affordable: player.cost != null && player.cost <= budget,
      }
    })
    .sort((a, b) => {
      const priceDelta = (b.price ?? -Infinity) - (a.price ?? -Infinity)
      if (priceDelta !== 0) return priceDelta
      return a.player.name.localeCompare(b.player.name)
    })
}

function PlayerToken({
  player,
  playerIndex,
  fantasyPlayersById,
  fantasyCoachPlayersById,
  lineupsProjections,
  playerImages,
  bench = false,
  showProjections = false,
  scoreRound = null,
  showCaptainStyling = true,
  selected = false,
  swapMenuOpen = false,
  majorRoundAvailability = [],
  markerOverride = null,
  eligibleSwapPlayers,
  onSelectPlayer,
  onToggleSwapMenu,
  onToggleTradeMenu,
  onSetCaptain,
  onSwapWithPlayer,
  onReverseTrade,
}: {
  player: MyTeamPlayer | null
  playerIndex: number | null
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>
  lineupsProjections: LineupsProjectionSnapshot
  playerImages: PlayerImageRecord[]
  bench?: boolean
  showProjections?: boolean
  scoreRound?: MyTeamProjectionRound | null
  showCaptainStyling?: boolean
  selected?: boolean
  swapMenuOpen?: boolean
  majorRoundAvailability?: RoundAvailabilityBadge[]
  markerOverride?: "available" | "unavailable" | "bye" | null
  eligibleSwapPlayers: IndexedMyTeamPlayer[]
  onSelectPlayer: (playerIndex: number) => void
  onToggleSwapMenu: () => void
  onToggleTradeMenu: () => void
  onSetCaptain: () => void
  onSwapWithPlayer: (targetIndex: number) => void
  onReverseTrade: () => void
}) {
  if (!player) {
    return (
      <div className="mx-auto flex min-h-[72px] w-full max-w-[6rem] flex-col items-center justify-end opacity-35 lg:min-h-[100px] lg:max-w-[7.75rem]">
        <div className="h-12 w-12 rounded-full border-[3px] border-white bg-white lg:h-20 lg:w-20 lg:border-4" />
        <div className="mt-1 h-2 w-12 rounded bg-slate-300 lg:mt-2 lg:h-2.5 lg:w-20" />
      </div>
    )
  }

  const ring = showCaptainStyling && player.isCaptain
    ? "border-[#f07b2d]"
    : bench
      ? player.squadRole === "emergency" ? "border-[#f16161]" : "border-[#a85db5]"
      : "border-[#f1f3f5]"
  const fantasyPlayer = player.playerId != null ? fantasyPlayersById.get(player.playerId) ?? null : null
  const actualScore = showProjections ? actualScoreForPlayerRound(player, scoreRound, fantasyPlayersById) : null
  const displayedProjection = showProjections
    ? actualScore ?? effectiveProjectionForPlayer(player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections)
    : null

  const content = (
    <>
      {bench ? (
        <span className={`absolute left-[7%] top-[33%] z-20 rounded-l-full px-1.5 py-0.5 text-[8px] font-black text-white lg:px-2 lg:text-[10px] ${player.squadRole === "emergency" ? "bg-[#f16161]" : "bg-[#a85db5]"}`}>
          {player.squadRole === "emergency" ? "EMG" : "INT"}
        </span>
      ) : null}
      <div className={`relative h-16 w-16 overflow-hidden rounded-full border-[3px] bg-white shadow-[0_10px_24px_rgba(10,22,38,0.14)] lg:h-20 lg:w-20 lg:border-4 ${ring}`}>
        <ImageWithFallback
          sources={imageSourcesForPlayer(player, fantasyPlayersById, playerImages)}
          alt={`${player.displayName} player image`}
          className="h-full w-full object-cover object-top"
        />
      </div>
      {player.tradeReversal ? (
        <span className="absolute left-[8%] top-[9%] z-20 grid h-5 w-5 place-items-center rounded-full border border-emerald-200/80 bg-emerald-500 text-[12px] font-black text-[#07131f] shadow-[0_8px_18px_rgba(0,0,0,0.22)] lg:h-6 lg:w-6 lg:text-sm">
          &uarr;
        </span>
      ) : null}
      {showProjections ? (
        <span className={`absolute right-[5%] top-[27%] grid h-6 w-6 place-items-center rounded-full border text-[8px] font-black shadow-[0_8px_18px_rgba(10,22,38,0.22)] lg:h-9 lg:w-9 lg:text-xs ${
          actualScore != null
            ? "border-emerald-200/80 bg-[#159a5a] text-white"
            : showCaptainStyling && player.isCaptain
            ? "border-orange-300/80 bg-[#5a2f1d] text-orange-200"
            : "border-[#c4b5fd]/70 bg-[#31285f] text-[#ede9fe]"
        }`}>
          {formatProjection(displayedProjection)}
        </span>
      ) : null}
      <div className="mt-0.5 flex max-w-full items-center justify-center gap-1 text-[10px] font-black leading-tight text-nrl-text md:text-[11px] lg:mt-1.5 lg:text-sm">
        <Marker player={player} fantasyPlayersById={fantasyPlayersById} lineupsProjections={lineupsProjections} override={markerOverride} />
        <span className="truncate">{player.displayName}</span>
      </div>
      {majorRoundAvailability.length > 0 ? (
        <div className="mt-1 flex max-w-full justify-center gap-0.5 lg:gap-1">
          {majorRoundAvailability.map((badge) => (
            <span
              key={badge.round}
              title={badge.reason}
              className={`rounded px-1 py-0.5 text-[7px] font-black uppercase leading-none text-white lg:text-[8px] ${
                badge.isOriginRisk
                  ? "bg-[linear-gradient(135deg,#7b1734,#1f5ca8)]"
                  : badge.available ? "bg-[#159a5a]" : "bg-[#c43b4b]"
              }`}
            >
              R{badge.round}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )

  const className = `relative mx-auto flex min-h-[72px] w-full max-w-[6rem] flex-col items-center justify-end rounded-md text-center outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-nrl-accent/70 lg:min-h-[100px] lg:max-w-[7.75rem] ${selected ? "ring-2 ring-nrl-accent/70" : ""}`
  if (playerIndex == null) return <div className={className}>{content}</div>

  return (
    <div className="relative" data-my-team-player-interactive="true">
      <button
        type="button"
        onClick={() => onSelectPlayer(playerIndex)}
        className={className}
      >
        {content}
      </button>
      {selected ? (
        <div className={`absolute left-1/2 top-full z-40 mt-2 flex w-72 max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col rounded-lg border border-nrl-border bg-[#0e1530] p-1.5 text-left shadow-[0_18px_34px_rgba(2,6,23,0.48)] sm:w-[22rem] sm:flex-row ${bench ? "lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-x-0 lg:-translate-y-1/2" : "lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-x-0 lg:-translate-y-1/2"}`}>
          <div className="shrink-0 sm:w-40">
            <button
              type="button"
              onClick={onToggleSwapMenu}
              className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-bold text-nrl-text transition-colors hover:bg-nrl-accent/10 hover:text-nrl-accent"
            >
              Swap
            </button>
            {player.tradeReversal ? (
              <button
                type="button"
                onClick={onReverseTrade}
                className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-bold text-nrl-accent transition-colors hover:bg-nrl-accent/10"
              >
                Reverse
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleTradeMenu}
                className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-bold text-nrl-text transition-colors hover:bg-nrl-accent/10 hover:text-nrl-accent"
              >
                Trade
              </button>
            )}
            {showCaptainStyling ? (
              <button
                type="button"
                onClick={onSetCaptain}
                className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-bold text-nrl-text transition-colors hover:bg-nrl-accent/10 hover:text-nrl-accent"
              >
                Captain
              </button>
            ) : null}
            {fantasyPlayer ? (
              <Link
                href={`/dashboard/fantasy/${encodeURIComponent(fantasyPlayerSlug(fantasyPlayer.name))}?from=my-team`}
                className="block rounded-md px-2.5 py-2 text-xs font-bold text-nrl-text transition-colors hover:bg-nrl-accent/10 hover:text-nrl-accent"
              >
                Player Profile
              </Link>
            ) : null}
          </div>
          {swapMenuOpen ? (
            <div className="mt-1 max-h-44 overflow-y-auto border-t border-nrl-border pt-1 sm:ml-1 sm:mt-0 sm:w-44 sm:border-l sm:border-t-0 sm:pl-1 sm:pt-0">
              {eligibleSwapPlayers.length > 0 ? (
                eligibleSwapPlayers.map(({ player: swapPlayer, index }) => {
                  const swapFantasyPlayer = swapPlayer.playerId != null ? fantasyPlayersById.get(swapPlayer.playerId) : null
                  return (
                    <button
                      key={`${swapPlayer.displayName}-${index}`}
                      type="button"
                      onClick={() => onSwapWithPlayer(index)}
                      className="block w-full rounded-md px-2.5 py-2 text-left text-[11px] font-semibold text-nrl-text transition-colors hover:bg-nrl-accent/10 hover:text-nrl-accent"
                    >
                      <span className="block truncate">{swapFantasyPlayer?.name ?? swapPlayer.displayName}</span>
                      <span className="text-[9px] uppercase tracking-wide text-nrl-muted">
                        {swapPlayer.squadRole === "starter" ? swapPlayer.slot : swapPlayer.squadRole}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="px-2.5 py-2 text-[11px] font-semibold text-nrl-muted">
                  No eligible swaps.
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TradeOverlay({
  overlayRef,
  selectedPlayer,
  selectedFantasyPlayer,
  budget,
  candidates,
  playerImages,
  showProjections,
  onClose,
  onTradeForPlayer,
}: {
  overlayRef: RefObject<HTMLDivElement | null>
  selectedPlayer: MyTeamPlayer
  selectedFantasyPlayer: FantasyPlayerSnapshot | null
  budget: number
  candidates: TradeCandidate[]
  playerImages: PlayerImageRecord[]
  showProjections: boolean
  onClose: () => void
  onTradeForPlayer: (player: FantasyPlayerSnapshot) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return candidates
    return candidates.filter((candidate) => {
      const player = candidate.player
      return (
        player.name.toLowerCase().includes(query) ||
        player.positionLabel.toLowerCase().includes(query)
      )
    })
  }, [candidates, searchQuery])

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[80] bg-[#050918]/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-nrl-border bg-[#101936] px-4 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-nrl-muted">Trade Out</div>
            <div className="text-base font-black text-nrl-text">{selectedFantasyPlayer?.name ?? selectedPlayer.displayName}</div>
            <div className="text-xs font-semibold text-nrl-muted">Budget {formatPrice(budget)}</div>
          </div>
          <label className="min-w-[220px] flex-1 sm:max-w-sm">
            <span className="sr-only">Search trade options</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search players or positions"
              className="h-10 w-full rounded-md border border-nrl-border bg-[#0e1530] px-3 text-sm font-semibold text-nrl-text outline-none transition-colors placeholder:text-nrl-muted focus:border-nrl-accent/70"
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-nrl-border bg-[#0e1530] px-3 py-2 text-xs font-bold text-nrl-text transition-colors hover:border-nrl-accent/50"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-[3rem_minmax(0,1.4fr)_0.7fr_0.5fr_0.5fr_0.6fr_0.7fr] gap-2 border-b border-nrl-border px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-nrl-muted">
          <div />
          <div>Player</div>
          <div>Price</div>
          <div>L3</div>
          <div>BE</div>
          <div>Proj</div>
          <div />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredCandidates.length > 0 ? filteredCandidates.map((candidate) => (
            <div
              key={candidate.player.id}
              className={`grid grid-cols-[3rem_minmax(0,1.4fr)_0.7fr_0.5fr_0.5fr_0.6fr_0.7fr] items-center gap-2 border-b border-nrl-border/70 px-4 py-2 ${candidate.affordable ? "text-nrl-text" : "text-nrl-muted opacity-55"}`}
            >
              <div className="h-10 w-10 overflow-hidden rounded-full border border-nrl-border bg-white">
                <ImageWithFallback
                  sources={imageSourcesForFantasyPlayer(candidate.player, playerImages)}
                  alt={`${candidate.player.name} player image`}
                  className="h-full w-full object-cover object-top"
                />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{candidate.player.name}</div>
                <div className="text-[10px] font-semibold text-nrl-muted">{candidate.player.positionLabel}</div>
              </div>
              <div className="text-sm font-bold">{formatPrice(candidate.price)}</div>
              <div className="text-sm font-bold">{formatProjection(candidate.last3)}</div>
              <div className="text-sm font-bold">{formatProjection(candidate.breakEven)}</div>
              <div className="text-sm font-bold">{showProjections ? formatProjection(candidate.projection) : "-"}</div>
              <button
                type="button"
                disabled={!candidate.affordable}
                onClick={() => onTradeForPlayer(candidate.player)}
                className="rounded-md border border-nrl-border bg-[#0e1530] px-2 py-1.5 text-xs font-bold text-nrl-text transition-colors hover:border-nrl-accent/50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {candidate.affordable ? "Trade" : "Locked"}
              </button>
            </div>
          )) : (
            <div className="px-4 py-6 text-sm font-semibold text-nrl-muted">No matching trade candidates.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamBoard({
  team,
  fantasyPlayersById,
  fantasyCoachPlayersById,
  lineupsProjections,
  playerImages,
  draw2026Data,
  originPlayerNames,
  selectedProjectionRound,
  onSelectedProjectionRoundChange,
  showProjections,
  selectedPlayerIndex,
  swapMenuOpen,
  eligibleSwapPlayers,
  onSelectPlayer,
  onToggleSwapMenu,
  onToggleTradeMenu,
  onSetCaptain,
  onSwapWithPlayer,
  onReverseTrade,
  isAiChatOpen,
  onOpenAiChat,
  onCloseAiChat,
  hasFantasyPlotAccess,
}: {
  team: SavedMyTeam | null
  fantasyPlayersById: Map<number, FantasyPlayerSnapshot>
  fantasyCoachPlayersById: Map<number, FantasyCoachPlayerSnapshot>
  lineupsProjections: LineupsProjectionSnapshot
  playerImages: PlayerImageRecord[]
  draw2026Data: Draw2026Data | null
  originPlayerNames: Set<string>
  selectedProjectionRound: MyTeamProjectionRound | null
  onSelectedProjectionRoundChange: (round: MyTeamProjectionRound | null) => void
  showProjections: boolean
  selectedPlayerIndex: number | null
  swapMenuOpen: boolean
  eligibleSwapPlayers: IndexedMyTeamPlayer[]
  onSelectPlayer: (playerIndex: number) => void
  onToggleSwapMenu: () => void
  onToggleTradeMenu: () => void
  onSetCaptain: (playerIndex: number) => void
  onSwapWithPlayer: (targetIndex: number) => void
  onReverseTrade: () => void
  isAiChatOpen: boolean
  onOpenAiChat: () => void
  onCloseAiChat: () => void
  hasFantasyPlotAccess: boolean
}) {
  const players = team?.players ?? []
  const projectedLineup = buildMajorRoundDisplayLineup(
    players,
    selectedProjectionRound,
    fantasyPlayersById,
    playerImages,
    draw2026Data,
    originPlayerNames,
  )
  const { startersBySlot, benchPlayers } = projectedLineup
  const scoringSide = selectedProjectionRound == null
    ? buildProjectedScoringSide(
        players,
        fantasyPlayersById,
        fantasyCoachPlayersById,
        lineupsProjections,
      )
    : players
        .map((player, index) => ({ player, index }))
        .filter(({ index }) => projectedLineup.scoringIndexes.has(index))
  const projectedScore = scoringSide
    .reduce((sum, entry) => sum + (effectiveProjectionForPlayer(entry.player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections) ?? 0), 0)
  const screenshotRoundNumber = Number.parseInt(team?.round ?? "", 10)
  const appRoundNumber = typeof lineupsProjections.round === "number" && Number.isFinite(lineupsProjections.round)
    ? lineupsProjections.round
    : screenshotRoundNumber
  const currentRoundNumber = appRoundNumber
  const currentMajorRound: MyTeamMajorByeRound | null = MY_TEAM_MAJOR_BYE_ROUNDS.includes(currentRoundNumber as MyTeamMajorByeRound)
    ? currentRoundNumber as MyTeamMajorByeRound
    : null
  const currentRoundForHeader = Number.isFinite(currentRoundNumber) && currentRoundNumber >= 1 && currentRoundNumber <= 19
    ? currentRoundNumber
    : null
  const activeHeaderRound = selectedProjectionRound ?? currentRoundForHeader ?? currentMajorRound
  const actualRoundScore = activeHeaderRound == null
    ? 0
    : scoringSide.reduce((sum, entry) => sum + (actualScoreForPlayerRound(entry.player, activeHeaderRound, fantasyPlayersById) ?? 0), 0)
  const showCaptainStyling = selectedProjectionRound == null
  const markerOverrideForIndex = (index: number | null): "available" | "unavailable" | "bye" | null => {
    if (activeHeaderRound == null || index == null) return null
    const player = players[index]
    if (!player) return null
    if (actualScoreForPlayerRound(player, activeHeaderRound, fantasyPlayersById) != null) return "available"
    const availability = getRoundAvailability(player, activeHeaderRound, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames)
    if (availability.isBye) return "bye"
    if (activeHeaderRound === currentRoundForHeader && playerHasCurrentUnavailableStatus(player, fantasyPlayersById)) return "unavailable"
    const namedStatus = activeHeaderRound === currentRoundForHeader
      ? getLineupsNamedStatus(player, fantasyPlayersById, lineupsProjections)
      : null
    if (namedStatus === false) return "unavailable"
    return availability.available ? "available" : "unavailable"
  }
  const availabilityForPlayer = (player: MyTeamPlayer | null) =>
    player
      ? getMajorRoundAvailabilityBadges(player, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames, currentRoundForHeader)
      : []
  const availableHeaderRounds = MY_TEAM_PROJECTION_ROUNDS.filter((round) => round >= (currentRoundForHeader ?? 1))
  const showRoundProjections = showProjections && selectedProjectionRound == null
  const activeHeaderIsMajorRound = activeHeaderRound != null && MY_TEAM_MAJOR_BYE_ROUNDS.includes(activeHeaderRound as MyTeamMajorByeRound)
  const playingTarget = activeHeaderIsMajorRound ? 13 : 17
  const availabilitySummaryRounds =
    team && players.length > 0
      ? MY_TEAM_AVAILABILITY_SUMMARY_ROUNDS.filter((round) => round >= (currentRoundForHeader ?? 1))
      : []
  const availabilitySummary = availabilitySummaryRounds.map((round) => {
    const target = MY_TEAM_MAJOR_BYE_ROUNDS.includes(round as MyTeamMajorByeRound) ? 13 : 17
    const availableCount = players.filter((player) => {
      if (actualScoreForPlayerRound(player, round, fantasyPlayersById) != null) return true
      const availability = getRoundAvailability(player, round, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames)
      if (!availability.available) return false
      if (round === currentRoundForHeader && playerHasCurrentUnavailableStatus(player, fantasyPlayersById)) return false
      const namedStatus = round === currentRoundForHeader ? getLineupsNamedStatus(player, fantasyPlayersById, lineupsProjections) : null
      return namedStatus !== false
    }).length
    return { round, availableCount: Math.min(availableCount, target), target }
  })
  const projectedStarterEntries = [...startersBySlot.values()].flat()
  const projectedIntEntries = benchPlayers.slice(0, 4)
  const selectedRoundPlayingCount = selectedProjectionRound == null
    ? Math.min(
        playingTarget,
        players.filter((player) =>
          !isNonPlayingForProjection(player, fantasyPlayersById, fantasyCoachPlayersById, lineupsProjections),
        ).length,
      )
    : Math.min(
        playingTarget,
        [
          ...projectedStarterEntries,
          ...(activeHeaderIsMajorRound ? [] : projectedIntEntries),
        ].filter(({ player }) =>
          isAvailableForProjectionRound(player, selectedProjectionRound, fantasyPlayersById, playerImages, draw2026Data, originPlayerNames),
        ).length,
      )
  const activeRoundRef = useRef<HTMLButtonElement | null>(null)
  const roundStripDragRef = useRef<{ pointerId: number | null; startX: number; scrollLeft: number; didDrag: boolean } | null>(null)
  const roundStripSnapTimeoutRef = useRef<number | null>(null)
  const selectHeaderRound = (round: MyTeamProjectionRound) => {
    if (roundStripSnapTimeoutRef.current != null) {
      window.clearTimeout(roundStripSnapTimeoutRef.current)
    }
    onSelectedProjectionRoundChange(round === currentRoundForHeader ? null : round)
  }
  const snapRoundStripToMiddle = (strip: HTMLDivElement) => {
    if (roundStripSnapTimeoutRef.current != null) {
      window.clearTimeout(roundStripSnapTimeoutRef.current)
    }

    roundStripSnapTimeoutRef.current = window.setTimeout(() => {
      const stripRect = strip.getBoundingClientRect()
      const stripCenter = stripRect.left + stripRect.width / 2
      let closestRound: MyTeamProjectionRound | null = null
      let closestDistance = Number.POSITIVE_INFINITY
      for (const child of Array.from(strip.querySelectorAll<HTMLButtonElement>("[data-my-team-round]"))) {
        const childRect = child.getBoundingClientRect()
        const childCenter = childRect.left + childRect.width / 2
        const distance = Math.abs(childCenter - stripCenter)
        const round = Number.parseInt(child.dataset.myTeamRound ?? "", 10)
        if (Number.isFinite(round) && distance < closestDistance) {
          closestDistance = distance
          closestRound = round
        }
      }
      if (closestRound != null) selectHeaderRound(closestRound)
    }, 90)
  }

  useEffect(() => {
    activeRoundRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [activeHeaderRound])

  useEffect(() => () => {
    if (roundStripSnapTimeoutRef.current != null) {
      window.clearTimeout(roundStripSnapTimeoutRef.current)
    }
  }, [])

  return (
    <section className="rounded-xl border border-nrl-border bg-nrl-panel text-nrl-text shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
      {availabilitySummary.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto border-b border-nrl-border bg-[#0b1229] p-2 text-center sm:gap-3 sm:p-3">
          {availabilitySummary.map(({ round, availableCount, target }) => {
            const missing = Math.max(0, target - availableCount)
            const countColour = missing === 0
              ? "text-nrl-accent"
              : missing <= 2
                ? "text-[#9af06a]"
                : missing <= 5
                  ? "text-[#f6b73c]"
                  : "text-[#f16161]"
            return (
            <button
              key={round}
              type="button"
              onClick={() => selectHeaderRound(round)}
              className="min-w-[5.5rem] flex-1 rounded-lg border border-nrl-border bg-[#101936] px-3 py-3 transition-colors hover:bg-[#14203f] sm:min-w-[7rem]"
            >
              <div className="text-[8px] font-black uppercase tracking-[0.12em] text-nrl-muted">R{round}</div>
              <div className={`text-[11px] font-black leading-tight sm:text-sm lg:text-base ${countColour}`}>{availableCount}/{target}</div>
            </button>
          )})}
        </div>
      ) : null}
      <div className="relative flex min-h-[72px] items-center justify-center bg-[linear-gradient(135deg,#101936,#123a36)] px-16 py-4 text-center text-2xl font-black italic tracking-wide text-nrl-accent lg:text-2xl">
        {team ? (
          <button
            type="button"
            onClick={onOpenAiChat}
            className={`absolute left-4 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-pink-200/35 bg-[linear-gradient(135deg,#1687ff_0%,#8257ff_48%,#ff4ea0_100%)] text-white shadow-[0_14px_34px_rgba(23,41,140,0.42)] transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200/80 ${isAiChatOpen ? "opacity-0" : ""}`}
            aria-label="Open NRL AI"
            aria-expanded={isAiChatOpen}
          >
            <MagicAiIcon className="h-5 w-5" />
          </button>
        ) : null}
        {team && isAiChatOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-50 cursor-default bg-transparent"
              aria-label="Close NRL AI"
              onClick={onCloseAiChat}
            />
            <div className="absolute inset-x-0 top-0 z-[60] px-0 text-left not-italic tracking-normal sm:px-3">
              {MY_TEAM_AI_ENABLED ? (
                <MyTeamAiChatPanel
                  team={team as SavedMyTeam}
                  fantasyPlayersById={fantasyPlayersById}
                  lineupsProjections={lineupsProjections}
                  hasFantasyPlotAccess={hasFantasyPlotAccess}
                  onClose={onCloseAiChat}
                />
              ) : (
                <MyTeamAiComingSoonPanel onClose={onCloseAiChat} />
              )}
            </div>
          </>
        ) : null}
        <span className="truncate">{team?.teamName || "My Team"}</span>
      </div>
      <div className={`grid border-b border-nrl-border bg-[#111832] text-center ${showRoundProjections ? "grid-cols-5" : "grid-cols-4"}`}>
        <div className="min-w-0 px-1 py-2 sm:px-2 sm:py-3">
          <div className="text-[8px] font-bold uppercase leading-tight text-nrl-muted sm:text-[10px] lg:text-xs">Round Score</div>
          <div className="text-base font-black text-nrl-accent sm:text-lg lg:text-xl">{formatProjection(actualRoundScore)}</div>
        </div>
        {showRoundProjections ? (
          <div className="min-w-0 px-1 py-2 sm:px-2 sm:py-3">
            <div className="text-[8px] font-bold uppercase leading-tight text-nrl-muted sm:text-[10px] lg:text-xs">Projected</div>
            <div className="text-base font-black text-nrl-accent sm:text-lg lg:text-xl">{formatProjection(projectedScore)}</div>
          </div>
        ) : null}
        <div className="min-w-0 px-1 py-2 sm:px-2 sm:py-3">
          <div className="text-[8px] font-bold uppercase leading-tight text-nrl-muted sm:text-[10px] lg:text-xs">Trades</div>
          <div className="truncate text-base font-black text-nrl-accent sm:text-lg lg:text-xl">
            {formatTradesDisplay(team)}
          </div>
        </div>
        <div className="min-w-0 px-1 py-2 sm:px-2 sm:py-3">
          <div className="text-[8px] font-bold uppercase leading-tight text-nrl-muted sm:text-[10px] lg:text-xs">Bank</div>
          <div className="truncate text-base font-black text-nrl-accent sm:text-lg lg:text-xl">{formatTeamMetaValue(team?.bankRemaining ?? "")}</div>
        </div>
        <div className="min-w-0 px-1 py-2 sm:px-2 sm:py-3">
          <div className="text-[8px] font-bold uppercase leading-tight text-nrl-muted sm:text-[10px] lg:text-xs">Playing</div>
          <div className="truncate text-base font-black text-nrl-accent sm:text-lg lg:text-xl">{selectedRoundPlayingCount}/{playingTarget}</div>
        </div>
      </div>
      <div className="relative border-b border-nrl-border bg-[#111832] text-center shadow-[0_12px_22px_rgba(2,6,23,0.22)]">
        <div
          className="flex snap-x snap-mandatory cursor-grab items-center gap-8 overflow-x-auto overscroll-x-contain scroll-smooth px-[42%] py-4 text-xs font-black active:cursor-grabbing sm:gap-14 sm:text-base lg:gap-20 lg:text-xl [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          onScroll={(event) => {
            if (roundStripDragRef.current) return
            snapRoundStripToMiddle(event.currentTarget)
          }}
          onPointerDown={(event) => {
            const target = event.currentTarget
            if (roundStripSnapTimeoutRef.current != null) {
              window.clearTimeout(roundStripSnapTimeoutRef.current)
            }
            roundStripDragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              scrollLeft: target.scrollLeft,
              didDrag: false,
            }
            target.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = roundStripDragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            if (Math.abs(event.clientX - drag.startX) > 4) drag.didDrag = true
            event.currentTarget.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX)
          }}
          onPointerUp={(event) => {
            const drag = roundStripDragRef.current
            if (drag?.pointerId === event.pointerId) {
              roundStripDragRef.current = null
              event.currentTarget.releasePointerCapture(event.pointerId)
              if (drag.didDrag) snapRoundStripToMiddle(event.currentTarget)
            }
          }}
          onPointerCancel={(event) => {
            roundStripDragRef.current = null
            snapRoundStripToMiddle(event.currentTarget)
          }}
        >
          {availableHeaderRounds.map((round) => (
            <button
              key={round}
              ref={activeHeaderRound === round ? activeRoundRef : null}
              type="button"
              data-my-team-round={round}
              onClick={() => selectHeaderRound(round)}
              className={`shrink-0 snap-center py-1 transition-colors ${
                activeHeaderRound === round
                  ? "text-nrl-text"
                  : "text-nrl-muted/35 hover:text-nrl-muted/70"
              }`}
            >
              Round {round}
            </button>
          ))}
        </div>
        {activeHeaderRound != null ? (
          <span
            className="absolute bottom-[-1.05rem] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[1.05rem] border-t-[1.05rem] border-x-transparent border-t-[#111832] drop-shadow-[0_8px_7px_rgba(2,6,23,0.36)]"
          />
        ) : null}
      </div>
      <div className="relative bg-[radial-gradient(circle_at_top,rgba(0,245,138,0.14),transparent_40%),radial-gradient(circle_at_50%_48%,rgba(241,243,245,0.08),transparent_38%),linear-gradient(180deg,#101936,#080d21)] px-3 pb-4 pt-2 lg:px-12 lg:pb-7 lg:pt-4">
        <div className="absolute inset-x-[8%] top-0 bottom-0 skew-x-[-4deg] rounded-b-[2rem] bg-[linear-gradient(180deg,rgba(241,243,245,0.26),rgba(241,243,245,0.13)_42%,rgba(241,243,245,0.07))] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_26px_62px_rgba(2,6,23,0.58),inset_0_18px_42px_rgba(255,255,255,0.08),inset_0_-28px_48px_rgba(2,6,23,0.22)]" />
        <div className="relative mx-auto max-w-[820px] space-y-5 lg:space-y-7">
          {STARTER_ROWS.map((row) => {
            const rowPlayers = startersBySlot.get(row.slot) ?? []
            const cells = Array.from({ length: row.count }, (_, index) => rowPlayers[index] ?? null)
            return (
              <div key={row.slot} className="relative">
                <div className={`grid items-end gap-1 lg:gap-4 ${row.count === 2 ? "mx-auto w-[62%] grid-cols-2" : "grid-cols-3"}`}>
                  {row.count === 1 ? (
                    <>
                      <div />
                      <PlayerToken player={cells[0]?.player ?? null} playerIndex={cells[0]?.index ?? null} fantasyPlayersById={fantasyPlayersById} fantasyCoachPlayersById={fantasyCoachPlayersById} lineupsProjections={lineupsProjections} playerImages={playerImages} showProjections={showRoundProjections} scoreRound={activeHeaderRound} showCaptainStyling={showCaptainStyling} selected={cells[0]?.index === selectedPlayerIndex} swapMenuOpen={swapMenuOpen} majorRoundAvailability={availabilityForPlayer(cells[0]?.player ?? null)} markerOverride={markerOverrideForIndex(cells[0]?.index ?? null)} eligibleSwapPlayers={eligibleSwapPlayers} onSelectPlayer={onSelectPlayer} onToggleSwapMenu={onToggleSwapMenu} onToggleTradeMenu={onToggleTradeMenu} onSetCaptain={() => cells[0]?.index != null ? onSetCaptain(cells[0].index) : undefined} onSwapWithPlayer={onSwapWithPlayer} onReverseTrade={onReverseTrade} />
                      <div />
                    </>
                  ) : row.count === 2 ? (
                    <>
                      <PlayerToken player={cells[0]?.player ?? null} playerIndex={cells[0]?.index ?? null} fantasyPlayersById={fantasyPlayersById} fantasyCoachPlayersById={fantasyCoachPlayersById} lineupsProjections={lineupsProjections} playerImages={playerImages} showProjections={showRoundProjections} scoreRound={activeHeaderRound} showCaptainStyling={showCaptainStyling} selected={cells[0]?.index === selectedPlayerIndex} swapMenuOpen={swapMenuOpen} majorRoundAvailability={availabilityForPlayer(cells[0]?.player ?? null)} markerOverride={markerOverrideForIndex(cells[0]?.index ?? null)} eligibleSwapPlayers={eligibleSwapPlayers} onSelectPlayer={onSelectPlayer} onToggleSwapMenu={onToggleSwapMenu} onToggleTradeMenu={onToggleTradeMenu} onSetCaptain={() => cells[0]?.index != null ? onSetCaptain(cells[0].index) : undefined} onSwapWithPlayer={onSwapWithPlayer} onReverseTrade={onReverseTrade} />
                      <PlayerToken player={cells[1]?.player ?? null} playerIndex={cells[1]?.index ?? null} fantasyPlayersById={fantasyPlayersById} fantasyCoachPlayersById={fantasyCoachPlayersById} lineupsProjections={lineupsProjections} playerImages={playerImages} showProjections={showRoundProjections} scoreRound={activeHeaderRound} showCaptainStyling={showCaptainStyling} selected={cells[1]?.index === selectedPlayerIndex} swapMenuOpen={swapMenuOpen} majorRoundAvailability={availabilityForPlayer(cells[1]?.player ?? null)} markerOverride={markerOverrideForIndex(cells[1]?.index ?? null)} eligibleSwapPlayers={eligibleSwapPlayers} onSelectPlayer={onSelectPlayer} onToggleSwapMenu={onToggleSwapMenu} onToggleTradeMenu={onToggleTradeMenu} onSetCaptain={() => cells[1]?.index != null ? onSetCaptain(cells[1].index) : undefined} onSwapWithPlayer={onSwapWithPlayer} onReverseTrade={onReverseTrade} />
                    </>
                  ) : (
                    cells.map((entry, index) => (
                      <PlayerToken
                        key={`${row.slot}-${index}-${entry?.player.displayName ?? "empty"}`}
                        player={entry?.player ?? null}
                        playerIndex={entry?.index ?? null}
                        fantasyPlayersById={fantasyPlayersById}
                        fantasyCoachPlayersById={fantasyCoachPlayersById}
                        lineupsProjections={lineupsProjections}
                        playerImages={playerImages}
                        showProjections={showRoundProjections}
                        scoreRound={activeHeaderRound}
                        showCaptainStyling={showCaptainStyling}
                        selected={entry?.index === selectedPlayerIndex}
                        swapMenuOpen={swapMenuOpen}
                        majorRoundAvailability={availabilityForPlayer(entry?.player ?? null)}
                        markerOverride={markerOverrideForIndex(entry?.index ?? null)}
                        eligibleSwapPlayers={eligibleSwapPlayers}
                        onSelectPlayer={onSelectPlayer}
                        onToggleSwapMenu={onToggleSwapMenu} onToggleTradeMenu={onToggleTradeMenu}
                        onSetCaptain={() => entry?.index != null ? onSetCaptain(entry.index) : undefined}
                        onSwapWithPlayer={onSwapWithPlayer}
                        onReverseTrade={onReverseTrade}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-[#123a36] px-4 py-3 text-base font-black uppercase text-nrl-accent lg:px-6 lg:py-4 lg:text-xl">Bench ({Math.min(8, benchPlayers.length)}/8)</div>
      <div className="bg-[#101936] px-4 py-5 lg:px-8 lg:py-7">
        <div className="mx-auto grid w-[58%] grid-cols-2 gap-x-0 gap-y-5 lg:w-[46%] lg:max-w-[420px] lg:gap-y-7">
          {Array.from({ length: 8 }, (_, index) => (
            <PlayerToken
              key={`bench-${index}`}
              player={benchPlayers[index]?.player ?? null}
              playerIndex={benchPlayers[index]?.index ?? null}
              fantasyPlayersById={fantasyPlayersById}
              fantasyCoachPlayersById={fantasyCoachPlayersById}
              lineupsProjections={lineupsProjections}
              playerImages={playerImages}
              bench
              showProjections={showRoundProjections}
              scoreRound={activeHeaderRound}
              showCaptainStyling={showCaptainStyling}
              selected={benchPlayers[index]?.index === selectedPlayerIndex}
              swapMenuOpen={swapMenuOpen}
              majorRoundAvailability={availabilityForPlayer(benchPlayers[index]?.player ?? null)}
              markerOverride={markerOverrideForIndex(benchPlayers[index]?.index ?? null)}
              eligibleSwapPlayers={eligibleSwapPlayers}
              onSelectPlayer={onSelectPlayer}
              onToggleSwapMenu={onToggleSwapMenu} onToggleTradeMenu={onToggleTradeMenu}
              onSetCaptain={() => benchPlayers[index]?.index != null ? onSetCaptain(benchPlayers[index].index) : undefined}
              onSwapWithPlayer={onSwapWithPlayer}
              onReverseTrade={onReverseTrade}
            />
          ))}
        </div>
      </div>

      <div className="bg-[#123a36] px-4 py-3 text-base font-black uppercase text-nrl-accent">Key</div>
      <div className="grid gap-2 bg-[#0e1530] px-4 py-5 text-sm font-semibold text-nrl-text sm:grid-cols-2">
        <div className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-[#51b847] text-[10px] font-black text-white">✓</span> Player has been selected</div>
        <div className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-[#e54848] text-[10px] font-black text-white">×</span> Player has not been selected</div>
        <div className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-[#d6cc13] text-[10px] font-black text-white">?</span> Player selection is uncertain</div>
        <div className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-sm bg-[#f07b2d] text-[10px] font-black text-white">C</span> Player is your captain</div>
        <div className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-black"><span className="h-1.5 w-1.5 bg-white" /></span> Player&apos;s club has the bye</div>
      </div>
    </section>
  )
}

export function MyTeamPage({ fantasyPlayers, fantasyCoachPlayers, lineupsProjections, playerImages, draw2026Data, originChances, locked }: MyTeamPageProps) {
  const [screenshots, setScreenshots] = useState<Record<ScreenshotSlot, TeamScreenshot | null>>({ top: null, bottom: null, trades: null })
  const [uploadingSlot, setUploadingSlot] = useState<ScreenshotSlot | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [team, setTeam] = useState<SavedMyTeam | null>(null)
  const [hasLoadedSavedTeam, setHasLoadedSavedTeam] = useState(false)
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false)
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState<number | null>(null)
  const [isSwapMenuOpen, setIsSwapMenuOpen] = useState(false)
  const [isTradeMenuOpen, setIsTradeMenuOpen] = useState(false)
  const [isBackPending, setIsBackPending] = useState(false)
  const [selectedProjectionRound, setSelectedProjectionRound] = useState<MyTeamProjectionRound | null>(null)
  const teamBoardRef = useRef<HTMLDivElement | null>(null)
  const tradeOverlayRef = useRef<HTMLDivElement | null>(null)
  const [isAiChatOpen, setIsAiChatOpen] = useState(false)
  const hasLoadedSavedTeamRef = useRef(false)
  const { getToken: getMyTeamAuthToken, isLoaded: isMyTeamAuthLoaded, isSignedIn: isMyTeamSignedIn } = useAuth()
  const fantasyPlayersById = useMemo(() => new Map(fantasyPlayers.map((player) => [player.id, player])), [fantasyPlayers])
  const fantasyCoachPlayersById = useMemo(() => new Map(fantasyCoachPlayers.map((player) => [player.id, player])), [fantasyCoachPlayers])
  const originPlayerNames = useMemo(
    () => new Set(originChances.map((row) => row.player).filter(Boolean)),
    [originChances],
  )

  useEffect(() => {
    if (selectedPlayerIndex == null) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest("[data-my-team-player-interactive='true']")) return
      if (tradeOverlayRef.current?.contains(event.target as Node)) return
      setSelectedPlayerIndex(null)
      setIsSwapMenuOpen(false)
      setIsTradeMenuOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [selectedPlayerIndex])

  useEffect(() => {
    if (!isMyTeamAuthLoaded) {
      hasLoadedSavedTeamRef.current = false
      setHasLoadedSavedTeam(false)
      return
    }

    hasLoadedSavedTeamRef.current = false
    setHasLoadedSavedTeam(false)

    if (!isMyTeamSignedIn) {
      setTeam(null)
      hasLoadedSavedTeamRef.current = true
      setHasLoadedSavedTeam(true)
      return
    }

    let cancelled = false

    const loadSavedTeam = async () => {
      try {
        const token = await getMyTeamAuthToken().catch(() => null)
        const response = await fetch("/api/user/my-team", {
          cache: "no-store",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (cancelled) return

        if (response.status === 401) {
          setTeam(null)
          return
        }

        const payload = (await response.json().catch(() => null)) as { team?: unknown } | null
        if (response.ok) {
          if (isSavedMyTeam(payload?.team)) {
            const remoteTeam = remapSavedTeam(payload.team, fantasyPlayers)
            setTeam(remoteTeam)
          } else {
            setTeam(null)
          }
          return
        }

        setTeam(null)
      } catch {
        if (!cancelled) setTeam(null)
      } finally {
        if (!cancelled) {
          hasLoadedSavedTeamRef.current = true
          setHasLoadedSavedTeam(true)
        }
      }
    }

    void loadSavedTeam()

    return () => {
      cancelled = true
    }
  }, [fantasyPlayers, getMyTeamAuthToken, isMyTeamAuthLoaded, isMyTeamSignedIn])

  useEffect(() => {
    if (!team || !isMyTeamSignedIn || !hasLoadedSavedTeamRef.current) return

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const token = await getMyTeamAuthToken().catch(() => null)
        const response = await fetch("/api/user/my-team", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ team }),
        signal: controller.signal,
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string; details?: string } | null
          throw new Error(payload?.details ?? payload?.error ?? "Unable to save My Team.")
        }
      })().catch((caught) => {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : "Unable to save My Team.")
      })
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [getMyTeamAuthToken, team, isMyTeamSignedIn])

  const handleScreenshotChange = async (slot: ScreenshotSlot, files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setUploadingSlot(slot)
    setError(null)
    setStatus(null)
    try {
      const screenshot = await buildTeamScreenshot(file, slot)
      setScreenshots((current) => ({ ...current, [slot]: screenshot }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to process screenshot.")
    } finally {
      setUploadingSlot(null)
    }
  }

  const handleClearScreenshots = () => {
    setScreenshots({ top: null, bottom: null, trades: null })
    setError(null)
    setStatus(null)
  }

  const handleAutofill = async () => {
    if (!isMyTeamAuthLoaded || !isMyTeamSignedIn) {
      setError("Sign in to submit screenshots and save your team.")
      return
    }

    const attachments = SCREENSHOT_SLOTS.map((slot) => screenshots[slot.key]).filter((screenshot): screenshot is TeamScreenshot => screenshot != null)
    if (attachments.length === 0) {
      setError("Upload at least one My Team screenshot first.")
      return
    }

    setIsSubmitting(true)
    setError(null)
    setStatus(null)
    try {
      const response = await fetch("/api/fantasy-my-team/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: attachments.map((screenshot) => ({
            name: screenshot.name,
            dataUrl: screenshot.dataUrl,
          })),
        }),
      })
      const payload = (await response.json().catch(() => null)) as { extracted?: ExtractedPayload; error?: string; details?: string } | null
      if (!response.ok) {
        throw new Error(payload?.details ?? payload?.error ?? "Unable to fill team from screenshots.")
      }

      const nextTeam = resolveExtractedTeam(payload?.extracted ?? {}, fantasyPlayers)
      setTeam(nextTeam)
      setIsUpdatingTeam(false)
      setSelectedPlayerIndex(null)
      setIsSwapMenuOpen(false)
      setIsTradeMenuOpen(false)
      setStatus(`Filled ${nextTeam.players.filter((player) => player.playerId != null).length}/${nextTeam.players.length} players.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to fill team from screenshots.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateTeam = () => {
    setIsUpdatingTeam(true)
    setSelectedPlayerIndex(null)
    setIsSwapMenuOpen(false)
    setIsTradeMenuOpen(false)
    setError(null)
    setStatus(null)
  }

  const handleCancelUpdateTeam = () => {
    setIsUpdatingTeam(false)
    setError(null)
    setStatus(null)
  }

  const eligibleSwapPlayers = team && selectedPlayerIndex != null
    ? team.players
      .map((player, index) => ({ player, index }))
      .filter(({ index }) => index !== selectedPlayerIndex)
      .filter(({ player }) => playersShareFantasyPosition(team.players[selectedPlayerIndex], player, fantasyPlayersById))
    : []
  const selectedPlayer = selectedPlayerIndex != null ? team?.players[selectedPlayerIndex] ?? null : null
  const selectedFantasyPlayer = selectedPlayer?.playerId != null ? fantasyPlayersById.get(selectedPlayer.playerId) ?? null : null
  const tradeBudget = selectedPlayer ? (selectedFantasyPlayer?.cost ?? 0) + parseBankValue(team?.bankRemaining ?? "") : 0
  const tradeCandidates = team && selectedPlayerIndex != null
    ? buildTradeCandidates({
      selectedPlayer: team.players[selectedPlayerIndex],
      fantasyPlayers,
      fantasyPlayersById,
      fantasyCoachPlayersById,
      lineupsProjections,
      team,
    })
    : []

  const handleSelectPlayer = (playerIndex: number) => {
    setSelectedPlayerIndex((current) => current === playerIndex ? null : playerIndex)
    setIsSwapMenuOpen(false)
    setIsTradeMenuOpen(false)
    setError(null)
    setStatus(null)
  }

  const handleSwapWithPlayer = (targetIndex: number) => {
    if (!team || selectedPlayerIndex == null) return
    const targetPlayer = team.players[targetIndex]
    if (!targetPlayer) return
    const result = swapMyTeamPlayers(team, selectedPlayerIndex, dropTargetForPlayer(targetPlayer, targetIndex), fantasyPlayersById)
    if (result.error) {
      setError(result.error)
      setStatus(null)
      return
    }
    if (!result.team) return
    setError(null)
    setStatus(null)
    setTeam(result.team)
    setIsSwapMenuOpen(false)
    setIsTradeMenuOpen(false)
  }

  const handleSetCaptain = (captainIndex: number) => {
    if (!team) return
    const captain = team.players[captainIndex]
    if (!captain) return
    setTeam({
      ...team,
      players: team.players.map((player, index) => ({
        ...player,
        isCaptain: index === captainIndex,
        isViceCaptain: false,
      })),
    })
    setError(null)
    setStatus(null)
    setSelectedPlayerIndex(null)
    setIsSwapMenuOpen(false)
    setIsTradeMenuOpen(false)
  }

  const handleTradeForPlayer = (incomingPlayer: FantasyPlayerSnapshot) => {
    if (!team || selectedPlayerIndex == null) return
    const outgoingPlayer = team.players[selectedPlayerIndex]
    if (!outgoingPlayer) return
    const outgoingFantasyPlayer = outgoingPlayer.playerId != null ? fantasyPlayersById.get(outgoingPlayer.playerId) : null
    const budget = (outgoingFantasyPlayer?.cost ?? 0) + parseBankValue(team.bankRemaining)
    const weeklyTradesRemaining = firstNumberValue(team.tradesAvailableThisWeek)

    if (weeklyTradesRemaining != null && weeklyTradesRemaining <= 0) {
      setError("No trades available this week.")
      setStatus(null)
      return
    }

    if (incomingPlayer.cost == null || incomingPlayer.cost > budget) {
      setError(`${incomingPlayer.name} is over your available budget.`)
      setStatus(null)
      return
    }
    if (outgoingPlayer.squadRole === "starter" && !incomingPlayer.positionLabels.includes(outgoingPlayer.slot)) {
      setError(`${incomingPlayer.name} cannot play ${outgoingPlayer.slot}.`)
      setStatus(null)
      return
    }

    const nextPlayers = team.players.map((player, index) => index === selectedPlayerIndex
      ? {
        ...player,
        playerId: incomingPlayer.id,
        displayName: incomingPlayer.name,
        isBye: incomingPlayer.isBye,
        status: statusForTradedFantasyPlayer(incomingPlayer),
        tradeReversal: {
          player: { ...outgoingPlayer, tradeReversal: null },
          outgoingCost: outgoingFantasyPlayer?.cost ?? null,
          incomingCost: incomingPlayer.cost,
        },
      }
      : player
    )

    setTeam({
      ...team,
      tradesRemaining: decrementNumberText(team.tradesRemaining),
      tradesAvailableThisWeek: decrementNumberText(team.tradesAvailableThisWeek),
      bankRemaining: formatPrice(Math.max(0, budget - incomingPlayer.cost)),
      players: nextPlayers,
    })
    setError(null)
    setStatus(null)
    setIsTradeMenuOpen(false)
    setIsSwapMenuOpen(false)
  }

  const handleReverseTrade = () => {
    if (!team || selectedPlayerIndex == null) return
    const currentPlayer = team.players[selectedPlayerIndex]
    const reversal = currentPlayer?.tradeReversal
    if (!currentPlayer || !reversal) return

    const currentBank = parseBankValue(team.bankRemaining)
    const incomingCost = reversal.incomingCost ?? 0
    const outgoingCost = reversal.outgoingCost ?? 0
    const nextBank = currentBank + incomingCost - outgoingCost
    if (nextBank < 0) {
      setError("Cannot reverse this trade because it would put your bank below $0.")
      setStatus(null)
      return
    }

    const restoredPlayer = {
      ...reversal.player,
      slot: currentPlayer.slot,
      squadRole: currentPlayer.squadRole,
      benchOrder: currentPlayer.benchOrder,
      isCaptain: currentPlayer.isCaptain,
      isViceCaptain: currentPlayer.isViceCaptain,
      tradeReversal: null,
    }
    const restoredFantasyPlayer = restoredPlayer.playerId != null ? fantasyPlayersById.get(restoredPlayer.playerId) ?? null : null

    const nextPlayers = team.players.map((player, index) => index === selectedPlayerIndex
      ? {
        ...restoredPlayer,
        isBye: restoredFantasyPlayer?.isBye ?? restoredPlayer.isBye,
      }
      : player
    )

    setTeam({
      ...team,
      tradesRemaining: incrementNumberText(team.tradesRemaining),
      tradesAvailableThisWeek: incrementNumberText(team.tradesAvailableThisWeek),
      bankRemaining: formatPrice(nextBank),
      players: nextPlayers,
    })
    setError(null)
    setStatus(null)
    setIsTradeMenuOpen(false)
    setIsSwapMenuOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/fantasy"
          onClick={() => setIsBackPending(true)}
          className="inline-flex items-center rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:text-nrl-accent"
        >
          Back to Fantasy Dashboard
          {isBackPending ? (
            <span className="ml-2 h-3 w-3 animate-spin rounded-full border-2 border-nrl-accent/25 border-t-nrl-accent" />
          ) : null}
        </Link>
        {team ? (
          <button
            type="button"
            onClick={isUpdatingTeam ? handleCancelUpdateTeam : handleUpdateTeam}
            className="rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:text-nrl-accent"
          >
            {isUpdatingTeam ? "Cancel update" : "Update team"}
          </button>
        ) : null}
      </div>

      {!hasLoadedSavedTeam ? (
        <section className="mx-auto max-w-[760px] rounded-xl border border-nrl-border bg-nrl-panel px-4 py-6 text-center text-sm font-semibold text-nrl-muted lg:max-w-[920px]">
          Loading your team...
        </section>
      ) : null}

      {hasLoadedSavedTeam && (!team || isUpdatingTeam) ? (
        <ScreenshotUploadPanel
          screenshots={screenshots}
          uploadingSlot={uploadingSlot}
          isSubmitting={isSubmitting}
          isAuthLoaded={isMyTeamAuthLoaded}
          isSignedIn={Boolean(isMyTeamSignedIn)}
          error={error}
          status={status}
          isUpdateMode={Boolean(team)}
          onScreenshotChange={(slot, files) => {
            void handleScreenshotChange(slot, files)
          }}
          onSubmit={() => {
            void handleAutofill()
          }}
          onClear={handleClearScreenshots}
        />
      ) : null}

      {isTradeMenuOpen && selectedPlayer ? (
        <TradeOverlay
          overlayRef={tradeOverlayRef}
          selectedPlayer={selectedPlayer}
          selectedFantasyPlayer={selectedFantasyPlayer}
          budget={tradeBudget}
          candidates={tradeCandidates}
          playerImages={playerImages}
          showProjections={!locked}
          onClose={() => setIsTradeMenuOpen(false)}
          onTradeForPlayer={handleTradeForPlayer}
        />
      ) : null}

      {team && error ? (
        <section className="mx-auto max-w-[760px] rounded-xl border border-nrl-border bg-nrl-panel px-4 py-3 lg:max-w-[920px] lg:px-6 lg:py-4">
          <div className="text-xs font-semibold text-rose-200">{error}</div>
        </section>
      ) : null}

      {hasLoadedSavedTeam ? (
        <div ref={teamBoardRef} className="relative mx-auto max-w-[760px] lg:max-w-[920px]">
          <TeamBoard
            team={team}
            fantasyPlayersById={fantasyPlayersById}
            fantasyCoachPlayersById={fantasyCoachPlayersById}
            lineupsProjections={lineupsProjections}
            playerImages={playerImages}
            draw2026Data={draw2026Data}
            originPlayerNames={originPlayerNames}
            selectedProjectionRound={selectedProjectionRound}
            onSelectedProjectionRoundChange={setSelectedProjectionRound}
            showProjections={!locked}
            selectedPlayerIndex={selectedPlayerIndex}
            swapMenuOpen={isSwapMenuOpen}
            eligibleSwapPlayers={eligibleSwapPlayers}
            onSelectPlayer={handleSelectPlayer}
            onToggleSwapMenu={() => {
              setIsTradeMenuOpen(false)
              setIsSwapMenuOpen((current) => !current)
            }}
            onToggleTradeMenu={() => {
              setIsSwapMenuOpen(false)
              setIsTradeMenuOpen((current) => !current)
            }}
            onSetCaptain={handleSetCaptain}
            onSwapWithPlayer={handleSwapWithPlayer}
            onReverseTrade={handleReverseTrade}
            isAiChatOpen={isAiChatOpen}
            onOpenAiChat={() => setIsAiChatOpen(true)}
            onCloseAiChat={() => setIsAiChatOpen(false)}
            hasFantasyPlotAccess={!locked}
          />
        </div>
      ) : null}
    </div>
  )
}

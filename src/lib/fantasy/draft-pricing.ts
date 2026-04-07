import type { Draw2026Data } from "@/lib/draw/types"
import type { FantasyPlayerSnapshot } from "@/lib/fantasy/nrl"

export interface DraftPricingPlayer {
  id: number | null
  name: string
  projection: number
  actualScore: number | null
  standardDeviation: number
  slotLabel: string | null
  isBench: boolean
  isBye: boolean
  isEmergency: boolean
}

export interface DraftPricingTeam {
  id: string
  label: string
  coachLabel: string | null
  projectedTotal: number
  actualTotal: number | null
  standardDeviation: number
  activePlayerCount: number
  players: DraftPricingPlayer[]
}

export interface DraftPricingMatchup {
  id: string
  round: number | null
  homeTeam: DraftPricingTeam
  awayTeam: DraftPricingTeam
  projectedHomeScore: number
  projectedAwayScore: number
  actualHomeScore: number | null
  actualAwayScore: number | null
  projectedMargin: number
  marginStandardDeviation: number
  totalPointsLine: number
  totalPointsStandardDeviation: number
  homeWinProbability: number
  awayWinProbability: number
  homeOdds: number
  awayOdds: number
  spreadLine: number
  favouriteLabel: string
}

export interface DraftPricingResult {
  leagueId: string
  round: number | null
  availableRounds: number[]
  leagueName: string | null
  leagueType: string | null
  teams: DraftPricingTeam[]
  matchups: DraftPricingMatchup[]
  warnings: string[]
  generatedAt: string
}

interface ProjectionPoint {
  id: number | null
  name: string
  projection: number
  actualScore: number | null
  average: number | null
  standardDeviation: number
}

interface FantasyPlayerDirectoryPoint {
  id: number
  name: string
  team: string | null
  squadId: number | null
  positions: number[]
  positionLabels: string[]
  positionLabel: string
  status: string | null
  isBye: boolean
}

interface TeamMatchKey {
  id: string | null
  name: string | null
}

interface FantasyWrappedPayload {
  success?: unknown
  result?: unknown
  errors?: unknown
}

const PLAYER_ARRAY_KEYS = [
  "players",
  "roster",
  "roster_players",
  "lineup",
  "starters",
  "squad",
  "team",
  "active_players",
] as const

const EMERGENCY_PATTERNS = /(emg|emergency|reserve|reserves|red dot|red-dot|non scoring|non-scoring)/i
const BENCH_PATTERNS = /(bench|interchange|int$)/i

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toInt(value: unknown): number | null {
  const num = toNum(value)
  return num == null ? null : Math.trunc(num)
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normaliseText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function teamHasFixtureInRound(draw2026Data: Draw2026Data | null | undefined, round: number | null, team: string | null): boolean | null {
  if (!draw2026Data || round == null || !team) return null
  const teamKey = normaliseText(team)
  if (!teamKey) return null
  const roundRows = draw2026Data.rows.filter((row) => row.round === round)
  if (roundRows.length === 0) return null
  return roundRows.some((row) => normaliseText(row.home) === teamKey || normaliseText(row.away) === teamKey)
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNum(value)
    if (parsed != null) return parsed
  }
  return null
}

function pickFirstText(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = toText(value)
    if (parsed) return parsed
  }
  return null
}

function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
}

function unwrapFantasyPayload<T = unknown>(value: T): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const wrapped = value as FantasyWrappedPayload
  if ("result" in wrapped && wrapped.result != null) {
    return wrapped.result
  }
  return value
}

function parsePlayerName(value: Record<string, unknown>): string | null {
  const direct = pickFirstText(
    value.name,
    value.player_name,
    value.full_name,
    value.display_name,
    (value.player as Record<string, unknown> | undefined)?.name,
    (value.player as Record<string, unknown> | undefined)?.full_name,
    (value.player as Record<string, unknown> | undefined)?.player_name,
  )
  if (direct) return direct

  const first = pickFirstText(
    value.first_name,
    (value.player as Record<string, unknown> | undefined)?.first_name,
  )
  const last = pickFirstText(
    value.last_name,
    (value.player as Record<string, unknown> | undefined)?.last_name,
  )
  const combined = `${first ?? ""} ${last ?? ""}`.trim()
  return combined || null
}

function parseProjectionPoint(raw: unknown, round: number | null, fallbackId?: number | null): ProjectionPoint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = toInt(row.id ?? row.player_id ?? (row.player as Record<string, unknown> | undefined)?.id ?? fallbackId)
  const name = parsePlayerName(row)
  if (id == null && !name) return null

  const stats = (row.stats as Record<string, unknown> | undefined) ?? {}
  const projScores =
    (stats.proj_scores as Record<string, unknown> | undefined) ??
    (row.proj_scores as Record<string, unknown> | undefined) ??
    {}
  const projection =
    pickFirstNumber(
      round != null ? projScores[String(round)] : null,
      stats.projected_score,
      stats.projected_points,
      stats.proj_score,
      stats.proj_points,
      stats.projection,
      stats.proj_avg,
      row.projected_score,
      row.projected_points,
      row.proj_score,
      row.proj_points,
      row.projection,
    ) ?? 0

  const average = pickFirstNumber(stats.avg_points, row.avg_points, row.average, stats.average)
  const actualScore = pickFirstNumber(
    stats.current_score,
    stats.score,
    stats.points,
    stats.round_score,
    stats.live_score,
    row.current_score,
    row.score,
    row.points,
    row.round_score,
    row.live_score,
  )
  const standardDeviation = Math.max(6, Math.abs(projection) * 0.35, Math.abs(average ?? projection) * 0.28)

  return {
    id,
    name: name ?? `Player ${id ?? "?"}`,
    projection,
    actualScore,
    average,
    standardDeviation,
  }
}

function collectProjectionPoints(value: unknown, round: number | null): ProjectionPoint[] {
  const unwrapped = unwrapFantasyPayload(value)

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map((row) => parseProjectionPoint(row, round))
      .filter((row): row is ProjectionPoint => row !== null)
  }

  if (unwrapped && typeof unwrapped === "object") {
    return Object.entries(unwrapped as Record<string, unknown>)
      .map(([key, row]) => parseProjectionPoint(row, round, toInt(key)))
      .filter((point): point is ProjectionPoint => point !== null)
  }

  return []
}

function looksLikePlayer(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    toInt(row.id ?? row.player_id ?? (row.player as Record<string, unknown> | undefined)?.id) != null ||
    parsePlayerName(row) != null
  )
}

function candidatePlayerArrays(value: Record<string, unknown>): unknown[][] {
  const arrays: unknown[][] = []
  for (const key of PLAYER_ARRAY_KEYS) {
    if (Array.isArray(value[key])) arrays.push(value[key] as unknown[])
  }
  for (const [, child] of objectEntries(value)) {
    if (!Array.isArray(child)) continue
    if (child.filter((item) => looksLikePlayer(item)).length >= 5) {
      arrays.push(child)
    }
  }
  return arrays
}

function parseTeamId(value: Record<string, unknown>): string | null {
  const numeric =
    toInt(
      value.league_user_id ??
      value.team_id ??
      value.id ??
      (value.user as Record<string, unknown> | undefined)?.id ??
      (value.owner as Record<string, unknown> | undefined)?.id
    )
  if (numeric != null) return String(numeric)

  const text = pickFirstText(
    value.league_user_id,
    value.team_id,
    value.id,
    (value.user as Record<string, unknown> | undefined)?.id,
    (value.owner as Record<string, unknown> | undefined)?.id,
  )
  return text ? String(text) : null
}

function parseTeamLabel(value: Record<string, unknown>): { label: string | null; coachLabel: string | null } {
  const nestedUser = (value.user as Record<string, unknown> | undefined) ?? null
  const nestedOwner = (value.owner as Record<string, unknown> | undefined) ?? null
  const label = pickFirstText(
    value.team_name,
    value.entry_name,
    value.name,
    value.display_name,
    nestedUser?.team_name,
    nestedOwner?.team_name,
  )
  const coachLabel = pickFirstText(
    value.coach_name,
    value.user_name,
    nestedUser?.name,
    nestedUser?.display_name,
    nestedOwner?.name,
    nestedOwner?.display_name,
  )
  const firstName = pickFirstText(value.firstname, nestedUser?.first_name, nestedOwner?.first_name)
  const lastName = pickFirstText(value.lastname, nestedUser?.last_name, nestedOwner?.last_name)
  const combinedCoach = `${firstName ?? ""} ${lastName ?? ""}`.trim()
  return { label, coachLabel: coachLabel ?? (combinedCoach || null) }
}

function parseSlotLabel(value: Record<string, unknown>): string | null {
  return pickFirstText(
    value.slot_name,
    value.slot,
    value.position,
    value.roster_position,
    value.role,
    (value.player as Record<string, unknown> | undefined)?.position,
  )
}

function parsePlayerId(value: Record<string, unknown>): number | null {
  return toInt(value.player_id ?? value.id ?? (value.player as Record<string, unknown> | undefined)?.id)
}

function buildProjectionLookups(points: ProjectionPoint[]) {
  const byId = new Map<number, ProjectionPoint>()
  const byName = new Map<string, ProjectionPoint>()

  for (const point of points) {
    if (point.id != null) byId.set(point.id, point)
    byName.set(normaliseText(point.name), point)
  }

  return { byId, byName }
}

function buildFantasyPlayerDirectory(points: FantasyPlayerSnapshot[], fantasyPlayerTeams: Record<number, string | null>) {
  const byId = new Map<number, FantasyPlayerDirectoryPoint>()
  const byName = new Map<string, FantasyPlayerDirectoryPoint>()

  for (const point of points) {
    const normalized: FantasyPlayerDirectoryPoint = {
      id: point.id,
      name: point.name,
      team: fantasyPlayerTeams[point.id] ?? null,
      squadId: point.squadId,
      positions: point.positions,
      positionLabels: point.positionLabels,
      positionLabel: point.positionLabel,
      status: point.status,
      isBye: point.isBye,
    }
    byId.set(point.id, normalized)
    byName.set(normaliseText(point.name), normalized)
  }

  return { byId, byName }
}

function parseRosterSlotPlayers(
  row: Record<string, unknown>,
  projections: ReturnType<typeof buildProjectionLookups>,
  fantasyPlayers: ReturnType<typeof buildFantasyPlayerDirectory>,
  draw2026Data: Draw2026Data | null | undefined,
  round: number | null,
): DraftPricingPlayer[] {
  const lineup =
    (row.lineup as Record<string, unknown> | undefined) ??
    (row.roster as Record<string, unknown> | undefined) ??
    row

  const slotEntries = Object.entries(lineup).filter(([, value]) => Array.isArray(value))
  const numericSlotEntries = slotEntries.filter(([, value]) =>
    (value as unknown[]).every((item) => toInt(item) != null)
  )

  if (numericSlotEntries.length < 2) return []

  const buildPlayer = (id: number, slotKey: string, isBenchOverride?: boolean): DraftPricingPlayer => {
    const projectionPoint = projections.byId.get(id)
    const fantasyPlayer = fantasyPlayers.byId.get(id)
    const isBench = isBenchOverride ?? BENCH_PATTERNS.test(slotKey)
    const isEmergency = EMERGENCY_PATTERNS.test(slotKey)
    const roundHasFixture = teamHasFixtureInRound(draw2026Data, round, fantasyPlayer?.team ?? null)
    return {
      id,
      name: fantasyPlayer?.name ?? projectionPoint?.name ?? `Player ${id}`,
      projection: projectionPoint?.projection ?? 0,
      actualScore: projectionPoint?.actualScore ?? null,
      standardDeviation: projectionPoint?.standardDeviation ?? 8,
      slotLabel: slotKey,
      isBench,
      isBye: roundHasFixture == null ? (fantasyPlayer?.isBye ?? false) : !roundHasFixture,
      isEmergency,
    }
  }

  const starterPlayers: DraftPricingPlayer[] = []
  const benchPlayers: DraftPricingPlayer[] = []

  for (const [slotKey, idsRaw] of numericSlotEntries) {
    const ids = (idsRaw as unknown[])
      .map((item) => toInt(item))
      .filter((item): item is number => item != null)

    const target = BENCH_PATTERNS.test(slotKey) ? benchPlayers : starterPlayers
    for (const id of ids) {
      target.push(buildPlayer(id, slotKey))
    }
  }

  const usedBenchPlayerIds = new Set<number>()
  const demotedByeStarters: DraftPricingPlayer[] = []

  const optimisedStarters = starterPlayers.flatMap((starter) => {
    if (!starter.isBye) return [starter]

    const requiredPositionCode = toInt(starter.slotLabel)
    const replacement =
      requiredPositionCode == null
        ? null
        : benchPlayers
            .filter((benchPlayer) => !usedBenchPlayerIds.has(benchPlayer.id ?? -1))
            .map((benchPlayer) => ({
              player: benchPlayer,
              fantasyPlayer: benchPlayer.id != null ? fantasyPlayers.byId.get(benchPlayer.id) : null,
            }))
            .filter(({ player, fantasyPlayer }) => !player.isBye && !player.isEmergency && Boolean(fantasyPlayer?.positions.includes(requiredPositionCode)))
            .sort((a, b) => b.player.projection - a.player.projection)[0]?.player ?? null

    if (!replacement) {
      return [starter]
    }

    if (replacement.id != null) {
      usedBenchPlayerIds.add(replacement.id)
    }

    demotedByeStarters.push({
      ...starter,
      isBench: true,
    })

    return [
      {
        ...replacement,
        slotLabel: starter.slotLabel,
        isBench: false,
      },
    ]
  })

  const remainingBench = benchPlayers.filter((player) => player.id == null || !usedBenchPlayerIds.has(player.id))

  return [...optimisedStarters, ...remainingBench, ...demotedByeStarters]
}

function parseRosterTeams(
  raw: unknown,
  projections: ReturnType<typeof buildProjectionLookups>,
  fantasyPlayers: ReturnType<typeof buildFantasyPlayerDirectory>,
  draw2026Data: Draw2026Data | null | undefined,
  round: number | null,
): DraftPricingTeam[] {
  const seen = new Set<string>()
  const teams: DraftPricingTeam[] = []
  const unwrapped = unwrapFantasyPayload(raw)

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    const row = value as Record<string, unknown>
    const arrays = candidatePlayerArrays(row)
    const slotPlayers = parseRosterSlotPlayers(row, projections, fantasyPlayers, draw2026Data, round)
    if (arrays.length > 0 || slotPlayers.length > 0) {
      const { label, coachLabel } = parseTeamLabel(row)
      const parsedId = parseTeamId(row) ?? normaliseText(label ?? coachLabel ?? `team-${teams.length + 1}`)
      if (parsedId && !seen.has(parsedId)) {
        const players: DraftPricingPlayer[] =
          slotPlayers.length > 0
            ? slotPlayers
            : arrays[0]
                .map((playerValue) => {
                  if (!playerValue || typeof playerValue !== "object" || Array.isArray(playerValue)) return null
                  const player = playerValue as Record<string, unknown>
                  const id = parsePlayerId(player)
                  const name = parsePlayerName(player)
                  const fantasyPlayer = id != null ? fantasyPlayers.byId.get(id) : undefined
                  const roundHasFixture = teamHasFixtureInRound(draw2026Data, round, fantasyPlayer?.team ?? null)
                  const projectionPoint =
                    (id != null ? projections.byId.get(id) : undefined) ??
                    (name ? projections.byName.get(normaliseText(name)) : undefined) ??
                    (fantasyPlayer ? projections.byName.get(normaliseText(fantasyPlayer.name)) : undefined)
                  const slotLabel = parseSlotLabel(player)
                  const isBench = BENCH_PATTERNS.test(slotLabel ?? "")
                  const isEmergency =
                    Boolean(player.is_emergency) ||
                    Boolean(player.emergency) ||
                    Boolean(player.reserve) ||
                    EMERGENCY_PATTERNS.test(slotLabel ?? "")

                  return {
                    id,
                    name: fantasyPlayer?.name ?? name ?? projectionPoint?.name ?? `Player ${id ?? "?"}`,
                    projection: projectionPoint?.projection ?? 0,
                    actualScore:
                      pickFirstNumber(
                        player.current_score,
                        player.score,
                        player.points,
                        player.round_score,
                        (player.player as Record<string, unknown> | undefined)?.current_score,
                        (player.player as Record<string, unknown> | undefined)?.score,
                      ) ?? projectionPoint?.actualScore ?? null,
                    standardDeviation: projectionPoint?.standardDeviation ?? 8,
                    slotLabel,
                    isBench,
                    isBye: roundHasFixture == null ? (fantasyPlayer?.isBye ?? false) : !roundHasFixture,
                    isEmergency,
                  }
                })
                .filter((player): player is DraftPricingPlayer => player !== null)

        const activePlayers = players.filter((player) => !player.isEmergency && !player.isBench && !player.isBye)
        const projectedTotal = activePlayers.reduce((sum, player) => sum + player.projection, 0)
        const activeWithActual = activePlayers.filter((player) => player.actualScore != null)
        const variance = activePlayers.reduce((sum, player) => sum + player.standardDeviation ** 2, 0)

        teams.push({
          id: parsedId,
          label: label ?? coachLabel ?? `Team ${teams.length + 1}`,
          coachLabel,
          projectedTotal,
          actualTotal:
            activeWithActual.length > 0
              ? activeWithActual.reduce((sum, player) => sum + (player.actualScore ?? 0), 0)
              : null,
          standardDeviation: Math.sqrt(variance),
          activePlayerCount: activePlayers.length,
          players,
        })
        seen.add(parsedId)
      }

      // This object is already a roster team row. Do not recurse into its lineup/bench
      // children or they will be misread as additional synthetic teams.
      return
    }

    for (const [, child] of objectEntries(row)) visit(child)
  }

  visit(unwrapped)
  return teams
}

function parseRoundCandidate(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  return toInt(row.round ?? row.current_round ?? row.week ?? row.match_round)
}

function parseParticipantKeys(value: unknown): TeamMatchKey[] {
  if (value == null) return []
  if (typeof value === "string" || typeof value === "number") {
    return [{ id: String(value), name: String(value) }]
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseParticipantKeys(entry))
  }
  if (typeof value !== "object" || Array.isArray(value)) return []
  const row = value as Record<string, unknown>
  return [
    {
      id:
        (toInt(row.id ?? row.team_id ?? row.league_user_id ?? row.user_id) != null
          ? String(toInt(row.id ?? row.team_id ?? row.league_user_id ?? row.user_id))
          : pickFirstText(row.id, row.team_id, row.league_user_id, row.user_id)),
      name: pickFirstText(row.team_name, row.entry_name, row.name, row.display_name, row.user_name),
    },
  ]
}

function teamMatchesKey(team: DraftPricingTeam, key: TeamMatchKey): boolean {
  const teamId = normaliseText(team.id)
  const label = normaliseText(team.label)
  const coach = normaliseText(team.coachLabel)
  return (
    (key.id != null && normaliseText(key.id) === teamId) ||
    (key.name != null && [label, coach, teamId].includes(normaliseText(key.name)))
  )
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2
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

function parseLeagueMeta(showRaw: unknown): { leagueName: string | null; leagueType: string | null; currentRound: number | null } {
  const unwrapped = unwrapFantasyPayload(showRaw)
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) {
    return { leagueName: null, leagueType: null, currentRound: null }
  }

  const root = unwrapped as Record<string, unknown>
  const league = (root.league as Record<string, unknown> | undefined) ?? root
  return {
    leagueName: pickFirstText(league.name, league.league_name, root.name),
    leagueType: pickFirstText(league.league_type, league.format, root.league_type),
    currentRound: parseRoundCandidate(league) ?? parseRoundCandidate(root),
  }
}

function collectAvailableRounds(showRaw: unknown): number[] {
  const found = new Set<number>()
  const unwrapped = unwrapFantasyPayload(showRaw)

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    const row = value as Record<string, unknown>
    const round = parseRoundCandidate(row)
    if (round != null && round > 0 && round < 40) {
      found.add(round)
    }

    const fixture = row.fixture
    if (fixture && typeof fixture === "object" && !Array.isArray(fixture)) {
      for (const key of Object.keys(fixture as Record<string, unknown>)) {
        const fixtureRound = toInt(key)
        if (fixtureRound != null && fixtureRound > 0 && fixtureRound < 40) {
          found.add(fixtureRound)
        }
      }
    }

    for (const [, child] of objectEntries(row)) visit(child)
  }

  visit(unwrapped)
  return [...found].sort((a, b) => a - b)
}

function parseMatchups(showRaw: unknown, teams: DraftPricingTeam[]): Array<{ round: number | null; home: DraftPricingTeam; away: DraftPricingTeam }> {
  const matchups: Array<{ round: number | null; home: DraftPricingTeam; away: DraftPricingTeam }> = []
  const seen = new Set<string>()
  const unwrapped = unwrapFantasyPayload(showRaw)

  function maybePush(round: number | null, homeKey: TeamMatchKey[], awayKey: TeamMatchKey[]) {
    const home = teams.find((team) => homeKey.some((key) => teamMatchesKey(team, key)))
    const away = teams.find((team) => awayKey.some((key) => teamMatchesKey(team, key)))
    if (!home || !away || home.id === away.id) return
    const key = `${round ?? "na"}:${home.id}:${away.id}`
    if (seen.has(key)) return
    seen.add(key)
    matchups.push({ round, home, away })
  }

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    const row = value as Record<string, unknown>
    const round = parseRoundCandidate(row)
    const fixture = row.fixture
    if (fixture && typeof fixture === "object" && !Array.isArray(fixture)) {
      for (const [fixtureRoundKey, pairsRaw] of Object.entries(fixture as Record<string, unknown>)) {
        const fixtureRound = toInt(fixtureRoundKey)
        if (!Array.isArray(pairsRaw)) continue
        for (const pair of pairsRaw) {
          if (!Array.isArray(pair) || pair.length < 2) continue
          const [homeRaw, awayRaw] = pair
          maybePush(fixtureRound, parseParticipantKeys(homeRaw), parseParticipantKeys(awayRaw))
        }
      }
    }
    const candidatePairs: Array<[unknown, unknown]> = [
      [row.home, row.away],
      [row.team1, row.team2],
      [row.team_1, row.team_2],
      [row.user1, row.user2],
      [row.user_1, row.user_2],
      [row.owner_1, row.owner_2],
      [row.owner_1_team, row.owner_2_team],
      [row.league_user_1, row.league_user_2],
      [row.league_user_one, row.league_user_two],
    ]

    for (const [homeRaw, awayRaw] of candidatePairs) {
      if (homeRaw == null || awayRaw == null) continue
      maybePush(round, parseParticipantKeys(homeRaw), parseParticipantKeys(awayRaw))
    }

    for (const [, child] of objectEntries(row)) visit(child)
  }

  visit(unwrapped)

  if (matchups.length === 0 && teams.length === 2) {
    matchups.push({ round: null, home: teams[0], away: teams[1] })
  }

  return matchups
}

export function buildDraftPricingResult(params: {
  leagueId: string
  round: number | null
  showRaw: unknown
  rostersRaw: unknown
  projectionsRaw: unknown
  fantasyPlayers: FantasyPlayerSnapshot[]
  fantasyPlayerTeams: Record<number, string | null>
  draw2026Data: Draw2026Data | null
}): DraftPricingResult {
  const warnings: string[] = []
  const leagueMeta = parseLeagueMeta(params.showRaw)
  const availableRounds = collectAvailableRounds(params.showRaw)
  const round = params.round ?? leagueMeta.currentRound ?? availableRounds[0] ?? null
  const projectionPoints = collectProjectionPoints(params.projectionsRaw, round)
  const projectionLookups = buildProjectionLookups(projectionPoints)
  const fantasyPlayerDirectory = buildFantasyPlayerDirectory(params.fantasyPlayers, params.fantasyPlayerTeams)
  const teams = parseRosterTeams(params.rostersRaw, projectionLookups, fantasyPlayerDirectory, params.draw2026Data, round)
  const rawMatchups = parseMatchups(params.showRaw, teams)
  const matchupsForRequestedRound =
    round == null ? rawMatchups : rawMatchups.filter((matchup) => matchup.round === round)
  const effectiveRawMatchups =
    matchupsForRequestedRound.length > 0 ? matchupsForRequestedRound : rawMatchups

  if (projectionPoints.length === 0) warnings.push("No projection rows were parsed from coach players feed.")
  if (teams.length === 0) warnings.push("No roster teams were parsed from league roster payload.")
  if (rawMatchups.length === 0) {
    warnings.push("No head-to-head matchups were parsed from league draw payload.")
  } else if (round != null && matchupsForRequestedRound.length === 0) {
    warnings.push(`No fixtures were found for round ${round}; showing the parsed fixture rounds that were available instead.`)
  }

  const matchups = effectiveRawMatchups.map(({ round: matchupRound, home, away }) => {
    const marginSd = Math.max(8, Math.sqrt(home.standardDeviation ** 2 + away.standardDeviation ** 2))
    const projectedMargin = home.projectedTotal - away.projectedTotal
    const homeWinProbability = normalCdf(projectedMargin / marginSd)
    const awayWinProbability = 1 - homeWinProbability
    const totalSd = Math.max(10, Math.sqrt(home.standardDeviation ** 2 + away.standardDeviation ** 2))
    const spreadLine = roundToHalf(projectedMargin)

    return {
      id: `${matchupRound ?? "na"}:${home.id}:${away.id}`,
      round: matchupRound,
      homeTeam: home,
      awayTeam: away,
      projectedHomeScore: Math.round(home.projectedTotal * 10) / 10,
      projectedAwayScore: Math.round(away.projectedTotal * 10) / 10,
      actualHomeScore: home.actualTotal == null ? null : Math.round(home.actualTotal * 10) / 10,
      actualAwayScore: away.actualTotal == null ? null : Math.round(away.actualTotal * 10) / 10,
      projectedMargin: Math.round(projectedMargin * 10) / 10,
      marginStandardDeviation: Math.round(marginSd * 10) / 10,
      totalPointsLine: roundToHalf(home.projectedTotal + away.projectedTotal),
      totalPointsStandardDeviation: Math.round(totalSd * 10) / 10,
      homeWinProbability,
      awayWinProbability,
      homeOdds: fairDecimalOdds(homeWinProbability),
      awayOdds: fairDecimalOdds(awayWinProbability),
      spreadLine,
      favouriteLabel: projectedMargin >= 0 ? home.label : away.label,
    }
  })

  return {
    leagueId: params.leagueId,
    round,
    availableRounds,
    leagueName: leagueMeta.leagueName,
    leagueType: leagueMeta.leagueType,
    teams,
    matchups,
    warnings,
    generatedAt: new Date().toISOString(),
  }
}

import type { LineupCasualtyOut, LineupMatch, LineupPlayer, LineupTeam, LineupTryscorerOdds } from "@/lib/lineups/nrl-lineups"

export type MatchupInsightCategory = "Matchup" | "Fantasy" | "Betting" | "Stats" | "Team News"
export type MatchupInsightSeverity = "low" | "medium" | "high"

export type MatchupInsight = {
  category: MatchupInsightCategory
  severity: MatchupInsightSeverity
  title: string
  description: string
  confidence?: number
}

export type LineupAverageStatKey =
  | "Tries"
  | "Try Assists"
  | "All Run Metres"
  | "Post Contact Metres"
  | "Tackles Made"
  | "Tackle Efficiency"
  | "Line Breaks"
  | "Line Break Assists"
  | "Errors"
  | "Missed Tackles"
  | "Tackle Breaks"
  | "Offloads"

type InsightSlot = "FB" | "LW" | "LC" | "RW" | "RC" | "FE" | "HLF" | "LK" | "L2R" | "R2R" | "HK" | "PR"
type PlayerAverages = Record<string, Partial<Record<LineupAverageStatKey, number>>>

type CandidateInsight = MatchupInsight & {
  score: number
}

export interface GenerateMatchupInsightsInput {
  match: LineupMatch
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  casualtyWardOuts?: Record<string, LineupCasualtyOut[]>
  playerAverages?: PlayerAverages
  maxInsights?: number
}

const SEVERITY_SCORE: Record<MatchupInsightSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const PRIORITY_CATEGORY_QUOTAS: Array<{ category: MatchupInsightCategory; quota: number }> = [
  { category: "Betting", quota: 2 },
  { category: "Fantasy", quota: 3 },
  { category: "Stats", quota: 2 },
]

const FANTASY_POSITION_GROUPS: Array<{ label: "halves" | "middle"; slots: InsightSlot[]; threshold: number }> = [
  { label: "halves", slots: ["FE", "HLF"], threshold: 18 },
  { label: "middle", slots: ["PR", "LK"], threshold: 20 },
]

const STAT_RULES: Array<{
  key: LineupAverageStatKey
  category: MatchupInsightCategory
  playerThreshold: number
  highPlayerThreshold: number
  standoutGap: number
  playerTitle: (player: string) => string
  playerDescription: (value: string) => string
}> = [
  {
    key: "Tries",
    category: "Stats",
    playerThreshold: 0.55,
    highPlayerThreshold: 0.8,
    standoutGap: 0.18,
    playerTitle: (player) => `${player} profiles as the strongest try-scoring threat.`,
    playerDescription: (value) => `${value} tries per game leads the named players.`,
  },
  {
    key: "Try Assists",
    category: "Stats",
    playerThreshold: 0.5,
    highPlayerThreshold: 0.75,
    standoutGap: 0.18,
    playerTitle: (player) => `${player} projects as the primary attacking catalyst.`,
    playerDescription: (value) => `${value} try assists per game is the top playmaking signal.`,
  },
  {
    key: "All Run Metres",
    category: "Stats",
    playerThreshold: 150,
    highPlayerThreshold: 180,
    standoutGap: 20,
    playerTitle: (player) => `${player} profiles with the strongest metre base.`,
    playerDescription: (value) => `${value} run metres per game gives a reliable floor.`,
  },
  {
    key: "Tackles Made",
    category: "Stats",
    playerThreshold: 38,
    highPlayerThreshold: 45,
    standoutGap: 5,
    playerTitle: (player) => `${player} profiles with the strongest tackle floor.`,
    playerDescription: (value) => `${value} tackles per game leads this lineup.`,
  },
  {
    key: "Line Breaks",
    category: "Stats",
    playerThreshold: 0.45,
    highPlayerThreshold: 0.75,
    standoutGap: 0.16,
    playerTitle: (player) => `${player} profiles as the game's most dangerous line-break threat.`,
    playerDescription: (value) => `${value} line breaks per game is the strongest break signal.`,
  },
  {
    key: "Line Break Assists",
    category: "Stats",
    playerThreshold: 0.45,
    highPlayerThreshold: 0.7,
    standoutGap: 0.16,
    playerTitle: (player) => `${player} projects as the primary attacking catalyst.`,
    playerDescription: (value) => `${value} line-break assists per game tops this matchup.`,
  },
  {
    key: "Errors",
    category: "Stats",
    playerThreshold: 1.6,
    highPlayerThreshold: 2.2,
    standoutGap: 0.35,
    playerTitle: (player) => `${player} carries the clearest ball-security risk.`,
    playerDescription: (value) => `${value} errors per game is the highest risk marker.`,
  },
  {
    key: "Missed Tackles",
    category: "Stats",
    playerThreshold: 3.2,
    highPlayerThreshold: 4.5,
    standoutGap: 0.8,
    playerTitle: (player) => `${player} profiles as the clearest defensive target.`,
    playerDescription: (value) => `${value} missed tackles per game stands out.`,
  },
  {
    key: "Tackle Breaks",
    category: "Stats",
    playerThreshold: 4,
    highPlayerThreshold: 5.5,
    standoutGap: 1,
    playerTitle: (player) => `${player} profiles with the best tackle-break upside.`,
    playerDescription: (value) => `${value} tackle breaks per game is the top evasion signal.`,
  },
  {
    key: "Offloads",
    category: "Stats",
    playerThreshold: 1.5,
    highPlayerThreshold: 2.3,
    standoutGap: 0.4,
    playerTitle: (player) => `${player} profiles with the clearest offload upside.`,
    playerDescription: (value) => `${value} offloads per game leads this matchup.`,
  },
]

function normaliseKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function projection(player: LineupPlayer): number | null {
  return typeof player.fantasyProjection === "number" && Number.isFinite(player.fantasyProjection)
    ? player.fantasyProjection
    : null
}

function insightSlot(player: LineupPlayer): InsightSlot | null {
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

function namedPlayers(team: LineupTeam | null): LineupPlayer[] {
  return team?.players.filter((player) => insightSlot(player)) ?? []
}

function teamLabel(team: LineupTeam | null): string {
  return team?.team || team?.teamName || "Team"
}

function playerLabel(player: LineupPlayer): string {
  const parts = player.player.split(/\s+/).filter(Boolean)
  return parts.at(-1) ?? player.player
}

function addInsight(
  insights: CandidateInsight[],
  insight: MatchupInsight,
  tieBreaker = 0
) {
  insights.push({
    ...insight,
    score: SEVERITY_SCORE[insight.severity] * 100 + Math.round((insight.confidence ?? 0.65) * 20) + tieBreaker,
  })
}

function rankedInsights(insights: CandidateInsight[]): CandidateInsight[] {
  return insights
    .filter((insight) => insight.severity !== "low")
    .sort((a, b) => b.score - a.score)
}

function selectStrongestInsights(insights: CandidateInsight[], maxInsights: number): CandidateInsight[] {
  const ranked = rankedInsights(insights)
  const selected: CandidateInsight[] = []
  const selectedSet = new Set<CandidateInsight>()

  for (const { category, quota } of PRIORITY_CATEGORY_QUOTAS) {
    for (const insight of ranked.filter((candidate) => candidate.category === category).slice(0, quota)) {
      if (selected.length >= maxInsights) break
      selected.push(insight)
      selectedSet.add(insight)
    }
  }

  for (const insight of ranked) {
    if (selected.length >= maxInsights) break
    if (selectedSet.has(insight)) continue
    selected.push(insight)
  }

  return selected.sort((a, b) => b.score - a.score)
}

function teamOuts(team: LineupTeam | null, casualtyWardOuts?: Record<string, LineupCasualtyOut[]>): LineupCasualtyOut[] {
  if (!team || !casualtyWardOuts) return []

  const namedPlayerKeys = new Set(team.players.map((player) => normaliseKey(player.player)).filter(Boolean))
  const candidates = [team.teamName, team.team]
  for (const candidate of candidates) {
    const outs = casualtyWardOuts[normaliseKey(candidate)]
    if (outs?.length) return outs.filter((out) => !namedPlayerKeys.has(normaliseKey(out.player)))
  }

  return []
}

function describeOuts(outs: LineupCasualtyOut[]): string {
  return outs
    .slice(0, 2)
    .map((out) => `${out.player}${out.injury ? ` (${out.injury})` : ""}`)
    .join(", ")
}

function slotDescription(slot: InsightSlot | null): string {
  if (slot === "LW" || slot === "LC" || slot === "L2R") return "Left-side"
  if (slot === "RW" || slot === "RC" || slot === "R2R") return "Right-side"
  if (slot === "FB") return "Fullback"
  if (slot === "FE" || slot === "HLF" || slot === "HK") return "Spine"
  if (slot === "PR" || slot === "LK") return "Middle"
  return "Anytime"
}

function averageValue(playerAverages: PlayerAverages | undefined, player: LineupPlayer, key: LineupAverageStatKey): number | null {
  const value = playerAverages?.[normaliseKey(player.player)]?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatStatValue(key: LineupAverageStatKey, value: number): string {
  if (key === "All Run Metres" || key === "Post Contact Metres") return value.toFixed(0)
  if (key === "Tackle Efficiency") return `${value.toFixed(1)}%`
  return value.toFixed(1)
}

function projectionTotal(players: LineupPlayer[]): number | null {
  const projections = players.map(projection).filter((value): value is number => value != null)
  if (projections.length === 0) return null
  return projections.reduce((total, value) => total + value, 0)
}

function playersForSlots(team: LineupTeam | null, slots: InsightSlot[]): LineupPlayer[] {
  return namedPlayers(team).filter((player) => {
    const slot = insightSlot(player)
    return slot != null && slots.includes(slot)
  })
}

function topPlayerForSlot(team: LineupTeam | null, slot: InsightSlot): LineupPlayer | null {
  return playersForSlots(team, [slot])
    .sort((a, b) => (projection(b) ?? 0) - (projection(a) ?? 0))[0] ?? null
}

function playerForSlot(team: LineupTeam | null, slot: InsightSlot): LineupPlayer | null {
  return playersForSlots(team, [slot])[0] ?? null
}

function oddsForPlayer(player: LineupPlayer | null, tryscorerOdds: Record<string, LineupTryscorerOdds>): LineupTryscorerOdds | null {
  if (!player) return null
  return tryscorerOdds[normaliseKey(player.player)] ?? null
}

function pricedPlayerForSlot(
  team: LineupTeam | null,
  slot: InsightSlot,
  tryscorerOdds: Record<string, LineupTryscorerOdds>
): { player: LineupPlayer; price: number } | null {
  return playersForSlots(team, [slot])
    .map((player) => ({ player, price: oddsForPlayer(player, tryscorerOdds)?.bestPrice ?? null }))
    .filter((entry): entry is { player: LineupPlayer; price: number } => entry.price != null && entry.price > 1)
    .sort((a, b) => a.price - b.price)[0] ?? null
}

function sideForSlot(slot: InsightSlot | null): "left" | "right" | null {
  if (slot === "LW" || slot === "LC" || slot === "L2R" || slot === "FE") return "left"
  if (slot === "RW" || slot === "RC" || slot === "R2R" || slot === "HLF") return "right"
  return null
}

function oppositeSide(side: "left" | "right"): "left" | "right" {
  return side === "left" ? "right" : "left"
}

function halfEdgeSlots(side: "left" | "right"): InsightSlot[] {
  return side === "left" ? ["FE", "L2R"] : ["HLF", "R2R"]
}

function addStatAverageInsights(
  insights: CandidateInsight[],
  match: LineupMatch,
  playerAverages?: PlayerAverages
) {
  if (!playerAverages) return

  const teams = [match.homeTeam, match.awayTeam]
  const players = teams.flatMap((team) => namedPlayers(team).map((player) => ({ player, team })))
  if (players.length < 12) return

  for (const rule of STAT_RULES) {
    const rankedPlayers = players
      .map(({ player, team }) => ({ player, team, value: averageValue(playerAverages, player, rule.key) }))
      .filter((entry): entry is { player: LineupPlayer; team: LineupTeam | null; value: number } => entry.value != null)
      .sort((a, b) => b.value - a.value)

    const leader = rankedPlayers[0]
    if (leader) {
      const nextValue = rankedPlayers[1]?.value ?? 0
      const gap = leader.value - nextValue
      if (leader.value >= rule.highPlayerThreshold || (leader.value >= rule.playerThreshold && gap >= rule.standoutGap)) {
        addInsight(
          insights,
          {
            category: rule.category,
            severity: leader.value >= rule.highPlayerThreshold ? "high" : "medium",
            title: rule.playerTitle(playerLabel(leader.player)),
            description: rule.playerDescription(formatStatValue(rule.key, leader.value)),
            confidence: leader.value >= rule.highPlayerThreshold ? 0.77 : 0.68,
          },
          Math.min(60, Math.round((leader.value / rule.highPlayerThreshold) * 24 + (gap / rule.standoutGap) * 12))
        )
      }
    }

  }
}

function addPositionGroupInsight(insights: CandidateInsight[], match: LineupMatch) {
  const groups = [
    ...FANTASY_POSITION_GROUPS.map((group) => ({
      ...group,
      players: (team: LineupTeam | null) => playersForSlots(team, group.slots),
    })),
  ]

  for (const group of groups) {
    const homeTotal = projectionTotal(group.players(match.homeTeam))
    const awayTotal = projectionTotal(group.players(match.awayTeam))
    if (homeTotal == null || awayTotal == null) continue

    const diff = Math.abs(homeTotal - awayTotal)
    if (diff < group.threshold) continue

    const favouredTeam = homeTotal > awayTotal ? match.homeTeam : match.awayTeam
    const underdogTeam = homeTotal > awayTotal ? match.awayTeam : match.homeTeam
    const favouredTotal = homeTotal > awayTotal ? homeTotal : awayTotal
    const underdogTotal = homeTotal > awayTotal ? awayTotal : homeTotal
    const severity: MatchupInsightSeverity = diff >= group.threshold * 1.8 ? "high" : "medium"

    const title = `${teamLabel(favouredTeam)} look set to dominate the ${group.label}.`
    const description = group.label === "middle"
      ? `${teamLabel(favouredTeam)} project ${Math.round(favouredTotal)} starting middle fantasy points vs ${teamLabel(underdogTeam)} ${Math.round(underdogTotal)}.`
      : `${teamLabel(favouredTeam)} halves project ${Math.round(favouredTotal)} fantasy points vs ${teamLabel(underdogTeam)} ${Math.round(underdogTotal)}.`

    addInsight(
      insights,
      {
        category: "Fantasy",
        severity,
        title,
        description,
        confidence: severity === "high" ? 0.8 : 0.72,
      },
      80 + Math.round(diff)
    )
  }
}

function addTeamNewsInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  casualtyWardOuts?: Record<string, LineupCasualtyOut[]>
) {
  const homeOuts = teamOuts(match.homeTeam, casualtyWardOuts)
  const awayOuts = teamOuts(match.awayTeam, casualtyWardOuts)
  const teams = [
    { team: match.homeTeam, outs: homeOuts },
    { team: match.awayTeam, outs: awayOuts },
  ].sort((a, b) => b.outs.length - a.outs.length)

  const highest = teams[0]
  if (!highest || highest.outs.length < 3) return

  const names = describeOuts(highest.outs)
  addInsight(
    insights,
    {
      category: "Team News",
      severity: highest.outs.length >= 5 ? "high" : "medium",
      title: `${teamLabel(highest.team)} team news creates role uncertainty.`,
      description: `${highest.outs.length} notable outs sit outside the named 17${names ? `, led by ${names}` : ""}.`,
      confidence: highest.outs.length >= 5 ? 0.8 : 0.72,
    },
    highest.outs.length
  )
}

function addMismatchInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  playerAverages?: PlayerAverages
) {
  if (!playerAverages) return

  const teams = [
    { attack: match.homeTeam, defence: match.awayTeam },
    { attack: match.awayTeam, defence: match.homeTeam },
  ]
  const directSlots: Array<{ attack: InsightSlot; defence: InsightSlot }> = [
    { attack: "LW", defence: "RW" },
    { attack: "RW", defence: "LW" },
    { attack: "LC", defence: "RC" },
    { attack: "RC", defence: "LC" },
    { attack: "L2R", defence: "HLF" },
    { attack: "R2R", defence: "FE" },
    { attack: "L2R", defence: "R2R" },
    { attack: "R2R", defence: "L2R" },
  ]

  const candidates = teams
    .flatMap(({ attack, defence }) => directSlots.map((slots) => ({
      attacker: playerForSlot(attack, slots.attack),
      defender: playerForSlot(defence, slots.defence),
    })))
    .filter((entry): entry is { attacker: LineupPlayer; defender: LineupPlayer } => {
      if (!entry.attacker || !entry.defender) return false
      const tackleBreaks = averageValue(playerAverages, entry.attacker, "Tackle Breaks")
      const missedTackles = averageValue(playerAverages, entry.defender, "Missed Tackles")
      return tackleBreaks != null && tackleBreaks > 3 && missedTackles != null && missedTackles >= 3
    })
    .map((entry) => ({
      ...entry,
      tackleBreaks: averageValue(playerAverages, entry.attacker, "Tackle Breaks") ?? 0,
      missedTackles: averageValue(playerAverages, entry.defender, "Missed Tackles") ?? 0,
    }))
    .sort((a, b) => (b.tackleBreaks + b.missedTackles) - (a.tackleBreaks + a.missedTackles))

  const top = candidates[0]
  if (!top) return

  addInsight(
    insights,
    {
      category: "Stats",
      severity: top.tackleBreaks >= 5 || top.missedTackles >= 4.5 ? "high" : "medium",
      title: `${playerLabel(top.attacker)} vs ${playerLabel(top.defender)} is a mismatch.`,
      description: `${playerLabel(top.attacker)} averages ${top.tackleBreaks.toFixed(1)} tackle breaks; ${playerLabel(top.defender)} averages ${top.missedTackles.toFixed(1)} missed tackles.`,
      confidence: top.tackleBreaks >= 5 || top.missedTackles >= 4.5 ? 0.78 : 0.7,
    },
    Math.round(top.tackleBreaks * 10 + top.missedTackles * 8)
  )
}

function addAttackComboInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  playerAverages?: PlayerAverages
) {
  if (!playerAverages) return

  const pairs: Array<{ passer: InsightSlot; receiver: InsightSlot }> = [
    { passer: "LC", receiver: "LW" },
    { passer: "RC", receiver: "RW" },
    { passer: "FE", receiver: "L2R" },
    { passer: "HLF", receiver: "R2R" },
  ]

  const candidates = [match.homeTeam, match.awayTeam]
    .flatMap((team) => pairs.map((pair) => ({
      passer: playerForSlot(team, pair.passer),
      receiver: playerForSlot(team, pair.receiver),
    })))
    .filter((entry): entry is { passer: LineupPlayer; receiver: LineupPlayer } => {
      if (!entry.passer || !entry.receiver) return false
      const lineBreakAssists = averageValue(playerAverages, entry.passer, "Line Break Assists")
      const lineBreaks = averageValue(playerAverages, entry.receiver, "Line Breaks")
      const tryAssists = averageValue(playerAverages, entry.passer, "Try Assists")
      const tries = averageValue(playerAverages, entry.receiver, "Tries")
      return (
        (lineBreakAssists != null && lineBreakAssists >= 1 && lineBreaks != null && lineBreaks >= 0.8) ||
        (tryAssists != null && tryAssists >= 1 && tries != null && tries >= 1)
      )
    })
    .map((entry) => ({
      ...entry,
      lineBreakAssists: averageValue(playerAverages, entry.passer, "Line Break Assists") ?? 0,
      lineBreaks: averageValue(playerAverages, entry.receiver, "Line Breaks") ?? 0,
      tryAssists: averageValue(playerAverages, entry.passer, "Try Assists") ?? 0,
      tries: averageValue(playerAverages, entry.receiver, "Tries") ?? 0,
    }))
    .sort((a, b) => {
      const aScore = a.lineBreakAssists * 10 + a.lineBreaks * 10 + a.tryAssists * 8 + a.tries * 8
      const bScore = b.lineBreakAssists * 10 + b.lineBreaks * 10 + b.tryAssists * 8 + b.tries * 8
      return bScore - aScore
    })

  const top = candidates[0]
  if (!top) return

  const hasLineBreakCombo = top.lineBreakAssists >= 1 && top.lineBreaks >= 0.8
  const hasTryCombo = top.tryAssists >= 1 && top.tries >= 1
  addInsight(
    insights,
    {
      category: "Stats",
      severity: hasLineBreakCombo && hasTryCombo ? "high" : "medium",
      title: `${playerLabel(top.passer)} and ${playerLabel(top.receiver)} could form a great combo in attack.`,
      description: hasTryCombo
        ? `${playerLabel(top.passer)} averages ${top.tryAssists.toFixed(1)} try assists; ${playerLabel(top.receiver)} averages ${top.tries.toFixed(1)} tries.`
        : `${playerLabel(top.passer)} averages ${top.lineBreakAssists.toFixed(1)} line-break assists; ${playerLabel(top.receiver)} averages ${top.lineBreaks.toFixed(1)} line breaks.`,
      confidence: hasLineBreakCombo && hasTryCombo ? 0.78 : 0.7,
    },
    Math.round(top.lineBreakAssists * 16 + top.lineBreaks * 14 + top.tryAssists * 12 + top.tries * 12)
  )
}

function addMissedTackleTargetInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  playerAverages?: PlayerAverages
) {
  if (!playerAverages) return

  const candidates = [match.homeTeam, match.awayTeam]
    .flatMap((team) => namedPlayers(team).map((player) => ({ player, team, slot: insightSlot(player) })))
    .map((entry) => ({ ...entry, missedTackles: averageValue(playerAverages, entry.player, "Missed Tackles") }))
    .filter((entry): entry is { player: LineupPlayer; team: LineupTeam | null; slot: InsightSlot | null; missedTackles: number } => {
      return entry.missedTackles != null && entry.missedTackles >= 4
    })
    .sort((a, b) => b.missedTackles - a.missedTackles)

  const target = candidates[0]
  if (!target) return

  const targetSide = sideForSlot(target.slot)
  if (!targetSide) return

  const attackingTeam = target.team === match.homeTeam ? match.awayTeam : match.homeTeam
  const attackSide = oppositeSide(targetSide)
  const attackers = halfEdgeSlots(attackSide)
    .map((slot) => topPlayerForSlot(attackingTeam, slot))
    .filter((player): player is LineupPlayer => Boolean(player))

  if (attackers.length < 2) return

  const attackerNames = attackers.map(playerLabel).join(" and ")
  addInsight(
    insights,
    {
      category: "Stats",
      severity: target.missedTackles >= 5 ? "high" : "medium",
      title: `${attackerNames} can target ${playerLabel(target.player)}'s defensive channel.`,
      description: `${playerLabel(target.player)} averages ${target.missedTackles.toFixed(1)} missed tackles; ${teamLabel(attackingTeam)} have the opposite half-edge combo on that side.`,
      confidence: target.missedTackles >= 5 ? 0.78 : 0.7,
    },
    Math.round(target.missedTackles * 12)
  )
}

function addAerialErrorTargetInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  playerAverages?: PlayerAverages
) {
  if (!playerAverages) return

  const candidates = [match.homeTeam, match.awayTeam]
    .flatMap((team) => playersForSlots(team, ["FB", "LW", "RW"]).map((player) => ({ player, team })))
    .map((entry) => ({ ...entry, errors: averageValue(playerAverages, entry.player, "Errors") }))
    .filter((entry): entry is { player: LineupPlayer; team: LineupTeam | null; errors: number } => {
      return entry.errors != null && entry.errors >= 1.7
    })
    .sort((a, b) => b.errors - a.errors)

  const target = candidates[0]
  if (!target) return

  const attackingTeam = target.team === match.homeTeam ? match.awayTeam : match.homeTeam
  addInsight(
    insights,
    {
      category: "Stats",
      severity: target.errors >= 2.5 ? "high" : "medium",
      title: `${teamLabel(attackingTeam)} could target ${playerLabel(target.player)} aerially.`,
      description: `${playerLabel(target.player)} averages ${target.errors.toFixed(1)} errors per game.`,
      confidence: target.errors >= 2.5 ? 0.76 : 0.68,
    },
    Math.round(target.errors * 18)
  )
}

function addSideTryscorerInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  tryscorerOdds: Record<string, LineupTryscorerOdds>
) {
  for (const team of [match.homeTeam, match.awayTeam]) {
    const leftWing = pricedPlayerForSlot(team, "LW", tryscorerOdds)
    const leftCentre = pricedPlayerForSlot(team, "LC", tryscorerOdds)
    const rightWing = pricedPlayerForSlot(team, "RW", tryscorerOdds)
    const rightCentre = pricedPlayerForSlot(team, "RC", tryscorerOdds)
    const leftPair = leftWing && leftCentre ? { side: "left" as const, wing: leftWing, centre: leftCentre } : null
    const rightPair = rightWing && rightCentre ? { side: "right" as const, wing: rightWing, centre: rightCentre } : null
    const leftAverage = leftPair ? (leftPair.wing.price + leftPair.centre.price) / 2 : null
    const rightAverage = rightPair ? (rightPair.wing.price + rightPair.centre.price) / 2 : null

    let backedPair: typeof leftPair | typeof rightPair = null
    if (leftPair && rightPair && leftAverage != null && rightAverage != null) {
      const leftIsShorter = leftPair.wing.price < rightPair.wing.price && leftPair.centre.price < rightPair.centre.price
      const rightIsShorter = rightPair.wing.price < leftPair.wing.price && rightPair.centre.price < leftPair.centre.price
      const averageGap = Math.abs(leftAverage - rightAverage)
      if (leftIsShorter || (!rightIsShorter && leftAverage < rightAverage && averageGap >= 0.25)) backedPair = leftPair
      if (rightIsShorter || (!leftIsShorter && rightAverage < leftAverage && averageGap >= 0.25)) backedPair = rightPair
    } else {
      const onlyPair = leftPair ?? rightPair
      const onlyAverage = leftAverage ?? rightAverage
      if (onlyPair && onlyAverage != null && onlyAverage <= 2.9) backedPair = onlyPair
    }

    if (backedPair) {
      const wingPrice = backedPair.wing.price
      const centrePrice = backedPair.centre.price
      if (Math.min(wingPrice, centrePrice) > 3.6) continue

      addInsight(
        insights,
        {
          category: "Betting",
          severity: Math.min(wingPrice, centrePrice) <= 2.2 ? "high" : "medium",
          title: `${teamLabel(team)} look set to attack down the ${backedPair.side}.`,
          description: `${playerLabel(backedPair.wing.player)} (${wingPrice.toFixed(2)}) and ${playerLabel(backedPair.centre.player)} (${centrePrice.toFixed(2)}) are being well backed in the tryscorer market.`,
          confidence: Math.min(wingPrice, centrePrice) <= 2.2 ? 0.77 : 0.69,
        },
        90 + Math.round((7 - wingPrice - centrePrice) * 10)
      )
    }
  }
}

function addTryscorerInsight(
  insights: CandidateInsight[],
  match: LineupMatch,
  tryscorerOdds: Record<string, LineupTryscorerOdds>
) {
  const pricedPlayers = [match.homeTeam, match.awayTeam]
    .flatMap((team) => namedPlayers(team).map((player) => ({ player, team, slot: insightSlot(player) })))
    .map((entry) => ({ ...entry, odds: tryscorerOdds[normaliseKey(entry.player.player)] }))
    .filter((entry) => entry.odds?.bestPrice != null)
    .sort((a, b) => (a.odds?.bestPrice ?? Infinity) - (b.odds?.bestPrice ?? Infinity))

  const shortest = pricedPlayers[0]
  if (!shortest?.odds?.bestPrice || shortest.odds.bestPrice > 3.2) return

  const price = shortest.odds.bestPrice
  addInsight(
    insights,
    {
      category: "Betting",
      severity: price <= 2.5 ? "high" : "medium",
      title: `${playerLabel(shortest.player)} is priced as the clearest try threat.`,
      description: `${slotDescription(shortest.slot)} ${teamLabel(shortest.team)} option owns the shortest listed anytime price at ${price.toFixed(2)}${shortest.odds.bestBookie ? ` with ${shortest.odds.bestBookie}` : ""}.`,
      confidence: price <= 2.5 ? 0.76 : 0.68,
    },
    Math.round((4 - price) * 10)
  )
}

export function generateMatchupInsights({
  match,
  tryscorerOdds,
  casualtyWardOuts,
  playerAverages,
  maxInsights = 6,
}: GenerateMatchupInsightsInput): MatchupInsight[] {
  const insights: CandidateInsight[] = []

  addPositionGroupInsight(insights, match)
  addTeamNewsInsight(insights, match, casualtyWardOuts)
  addMismatchInsight(insights, match, playerAverages)
  addAttackComboInsight(insights, match, playerAverages)
  addAerialErrorTargetInsight(insights, match, playerAverages)
  addMissedTackleTargetInsight(insights, match, playerAverages)
  addSideTryscorerInsight(insights, match, tryscorerOdds)
  addTryscorerInsight(insights, match, tryscorerOdds)
  addStatAverageInsights(insights, match, playerAverages)

  return selectStrongestInsights(insights, Math.max(0, maxInsights))
    .map((insight) => {
      const result: MatchupInsight = {
        category: insight.category,
        severity: insight.severity,
        title: insight.title,
        description: insight.description,
      }
      if (insight.confidence != null) result.confidence = insight.confidence
      return result
    })
}

import type { LineupMatch, LineupPlayer, LineupTeam, LineupTryscorerOdds } from "@/lib/lineups/nrl-lineups"

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
export type PlayerTryHistory = Record<string, Array<{ team: string; opponent: string | null; tries: number; year: string; round: number }>>

type CandidateInsight = MatchupInsight & {
  score: number
  family?: "win-record" | "try-scorer"
}

export interface GenerateMatchupInsightsInput {
  match: LineupMatch
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages?: PlayerAverages
  playerTryHistory?: PlayerTryHistory
  maxInsights?: number
}

const SEVERITY_SCORE: Record<MatchupInsightSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const PRIORITY_CATEGORY_QUOTAS: Array<{ category: MatchupInsightCategory; quota: number }> = [
  { category: "Stats", quota: 4 },
  { category: "Betting", quota: 3 },
  { category: "Fantasy", quota: 2 },
]

const FANTASY_POSITION_GROUPS: Array<{ label: "halves" | "middle"; slots: InsightSlot[]; threshold: number }> = [
  { label: "halves", slots: ["FE", "HLF"], threshold: 18 },
  { label: "middle", slots: ["PR", "LK"], threshold: 20 },
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

function fullPlayerLabel(player: LineupPlayer): string {
  return player.player || playerLabel(player)
}

function addInsight(
  insights: CandidateInsight[],
  insight: MatchupInsight,
  tieBreaker = 0,
  family?: CandidateInsight["family"]
) {
  insights.push({
    ...insight,
    score: SEVERITY_SCORE[insight.severity] * 100 + Math.round((insight.confidence ?? 0.65) * 20) + tieBreaker,
    family,
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

function limitInsightFamilies(insights: CandidateInsight[]): CandidateInsight[] {
  const limits: Partial<Record<NonNullable<CandidateInsight["family"]>, number>> = {
    "try-scorer": 2,
    "win-record": 2,
  }
  const familyCounts = new Map<NonNullable<CandidateInsight["family"]>, number>()
  const ranked = rankedInsights(insights)
  const selected = new Set<CandidateInsight>()

  for (const insight of ranked) {
    if (!insight.family) {
      selected.add(insight)
      continue
    }

    const limit = limits[insight.family]
    if (limit == null) {
      selected.add(insight)
      continue
    }

    const count = familyCounts.get(insight.family) ?? 0
    if (count >= limit) continue
    familyCounts.set(insight.family, count + 1)
    selected.add(insight)
  }

  return insights.filter((insight) => selected.has(insight))
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffledInsights(insights: CandidateInsight[], seed: string): CandidateInsight[] {
  return [...insights].sort((a, b) => {
    const aHash = hashString(`${seed}:${a.category}:${a.title}:${a.description}`)
    const bHash = hashString(`${seed}:${b.category}:${b.title}:${b.description}`)
    return aHash - bHash
  })
}

function matchShuffleSeed(match: LineupMatch): string {
  return [
    match.matchId,
    match.match,
    match.matchDate,
    match.homeTeam?.team,
    match.awayTeam?.team,
  ].filter(Boolean).join(":")
}

function resultTotal(result: { homeScore: number; awayScore: number }): number {
  return result.homeScore + result.awayScore
}

function resultTeamScore(result: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }, team: LineupTeam | null): number | null {
  if (!team) return null
  const teamKey = normaliseKey(team.team || team.teamName)
  if (!teamKey) return null
  if (normaliseKey(result.homeTeam) === teamKey) return result.homeScore
  if (normaliseKey(result.awayTeam) === teamKey) return result.awayScore
  return null
}

function resultTeamWon(result: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }, team: LineupTeam | null): boolean {
  const score = resultTeamScore(result, team)
  if (score == null) return false
  const opponentScore = normaliseKey(result.homeTeam) === normaliseKey(team?.team || team?.teamName)
    ? result.awayScore
    : result.homeScore
  return score > opponentScore
}

function uniqueRecentResults(results: NonNullable<LineupMatch["homeRecentResults"]>): NonNullable<LineupMatch["homeRecentResults"]> {
  const seen = new Set<string>()
  const unique: NonNullable<LineupMatch["homeRecentResults"]> = []
  for (const result of results) {
    const teams = [normaliseKey(result.homeTeam), normaliseKey(result.awayTeam)].sort().join("/")
    const key = `${result.matchDate.slice(0, 10)}:${teams}:${result.homeScore}-${result.awayScore}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(result)
  }
  return unique
}

function opposingTeam(match: LineupMatch, team: LineupTeam | null): LineupTeam | null {
  if (!team) return null
  const teamKey = normaliseKey(team.team || team.teamName)
  if (teamKey && teamKey === normaliseKey(match.homeTeam?.team || match.homeTeam?.teamName)) return match.awayTeam
  if (teamKey && teamKey === normaliseKey(match.awayTeam?.team || match.awayTeam?.teamName)) return match.homeTeam
  return null
}

function averageValue(playerAverages: PlayerAverages | undefined, player: LineupPlayer, key: LineupAverageStatKey): number | null {
  const value = playerAverages?.[normaliseKey(player.player)]?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
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

function addTeamRecordInsight(
  insights: CandidateInsight[],
  team: LineupTeam | null,
  sample: NonNullable<LineupMatch["homeRecentResults"]>,
  title: string,
  description: (wins: number) => string,
  tieBreaker: number
) {
  if (!team || sample.length < 10) return
  const wins = sample.slice(0, 10).filter((result) => resultTeamWon(result, team)).length
  if (wins < 7) return

  addInsight(
    insights,
    {
      category: "Stats",
      severity: wins >= 8 ? "high" : "medium",
      title,
      description: description(wins),
      confidence: wins >= 8 ? 0.78 : 0.7,
    },
    tieBreaker + wins * 5,
    "win-record"
  )
}

function addTeamRecordTrendInsights(insights: CandidateInsight[], match: LineupMatch) {
  const recordInsights: CandidateInsight[] = []
  const headToHead = uniqueRecentResults(match.recentHeadToHead ?? []).slice(0, 10)
  for (const team of [match.homeTeam, match.awayTeam]) {
    const opponent = opposingTeam(match, team)
    addTeamRecordInsight(
      recordInsights,
      team,
      headToHead,
      `${teamLabel(team)} have had success over ${teamLabel(opponent)} recently.`,
      (wins) => `${teamLabel(team)} have won ${wins} of the last 10 games between the two sides.`,
      82
    )

    const h2hHomeGames = headToHead.filter((result) => normaliseKey(result.homeTeam) === normaliseKey(team?.team || team?.teamName)).slice(0, 10)
    addTeamRecordInsight(
      recordInsights,
      team,
      h2hHomeGames,
      `${teamLabel(team)} have had success over ${teamLabel(opponent)} at home.`,
      (wins) => `${teamLabel(team)} have won ${wins} of their last 10 home games between the two sides.`,
      76
    )
  }

  const teams = [
    { team: match.homeTeam, results: uniqueRecentResults(match.homeRecentResults ?? []) },
    { team: match.awayTeam, results: uniqueRecentResults(match.awayRecentResults ?? []) },
  ]

  for (const { team, results } of teams) {
    addTeamRecordInsight(
      recordInsights,
      team,
      results.slice(0, 10),
      `${teamLabel(team)} are carrying strong recent form.`,
      (wins) => `${teamLabel(team)} have won ${wins} of their last 10 games against all teams.`,
      70
    )

    const homeGames = results
      .filter((result) => normaliseKey(result.homeTeam) === normaliseKey(team?.team || team?.teamName))
      .slice(0, 10)
    addTeamRecordInsight(
      recordInsights,
      team,
      homeGames,
      `${teamLabel(team)} have been hard to beat at home.`,
      (wins) => `${teamLabel(team)} have won ${wins} of their last 10 home games against all teams.`,
      66
    )
  }

  insights.push(...recordInsights.sort((a, b) => b.score - a.score).slice(0, 2))
}

function addMatchTotalPointsTrendInsight(insights: CandidateInsight[], match: LineupMatch) {
  const line = 50.5
  const combinedRecent = uniqueRecentResults([
    ...(match.recentHeadToHead ?? []),
    ...(match.homeRecentResults ?? []),
    ...(match.awayRecentResults ?? []),
  ]).slice(0, 10)
  if (combinedRecent.length < 5) return

  const overCount = combinedRecent.filter((result) => resultTotal(result) > line).length
  const underCount = combinedRecent.length - overCount
  const overRate = overCount / combinedRecent.length
  const underRate = underCount / combinedRecent.length
  if (overRate < 0.7 && underRate < 0.7) return

  const isOver = overRate >= underRate
  const count = isOver ? overCount : underCount
  const title = `${isOver ? "Over" : "Under"} (${line.toFixed(1)}) - Total Match Points`
  const description = `${count} of the last ${combinedRecent.length} recent matches involving ${teamLabel(match.homeTeam)} or ${teamLabel(match.awayTeam)} have finished ${isOver ? "over" : "under"} ${line.toFixed(1)} total points.`

  addInsight(
    insights,
    {
      category: "Betting",
      severity: count >= 8 ? "high" : "medium",
      title,
      description,
      confidence: count >= 8 ? 0.76 : 0.68,
    },
    72 + count * 4
  )
}

function addTeamPointsTrendInsights(insights: CandidateInsight[], match: LineupMatch) {
  const line = 23.5
  const teams = [
    { team: match.homeTeam, results: match.homeRecentResults ?? [] },
    { team: match.awayTeam, results: match.awayRecentResults ?? [] },
  ]

  for (const { team, results } of teams) {
    const sample = results.slice(0, 5)
    if (!team || sample.length < 4) continue

    const scoredAtLeast = sample.filter((result) => {
      const score = resultTeamScore(result, team)
      return score != null && score > line
    }).length
    if (scoredAtLeast < 4) continue

    addInsight(
      insights,
      {
        category: "Betting",
        severity: scoredAtLeast === sample.length ? "high" : "medium",
        title: `${teamLabel(team)} - ${Math.ceil(line)}+ Team Points`,
        description: `${teamLabel(team)} have scored at least ${Math.ceil(line)} points in ${scoredAtLeast} of their last ${sample.length} matches.`,
        confidence: scoredAtLeast === sample.length ? 0.75 : 0.67,
      },
      62 + scoredAtLeast * 5
    )
  }
}

function addPlayerTryMarketTrendInsights(
  insights: CandidateInsight[],
  match: LineupMatch,
  tryscorerOdds: Record<string, LineupTryscorerOdds>,
  playerAverages?: PlayerAverages
) {
  if (!playerAverages) return

  const candidates = [match.homeTeam, match.awayTeam]
    .flatMap((team) => namedPlayers(team).map((player) => ({ player, team, slot: insightSlot(player) })))
    .map((entry) => ({
      ...entry,
      tries: averageValue(playerAverages, entry.player, "Tries"),
      odds: tryscorerOdds[normaliseKey(entry.player.player)] ?? null,
    }))
    .filter((entry): entry is {
      player: LineupPlayer
      team: LineupTeam | null
      slot: InsightSlot | null
      tries: number
      odds: LineupTryscorerOdds
    } => {
      return entry.tries != null && entry.tries >= 0.35 && entry.odds?.bestPrice != null && entry.odds.bestPrice <= 3.75
    })
    .sort((a, b) => {
      const aPrice = a.odds.bestPrice ?? 99
      const bPrice = b.odds.bestPrice ?? 99
      const aScore = a.tries * 80 + Math.max(0, 4.5 - aPrice) * 14
      const bScore = b.tries * 80 + Math.max(0, 4.5 - bPrice) * 14
      return bScore - aScore
    })
    .slice(0, 3)

  for (const candidate of candidates) {
    const price = candidate.odds.bestPrice
    if (!price) continue

    addInsight(
      insights,
      {
        category: "Betting",
        severity: candidate.tries >= 0.7 || price <= 2.2 ? "high" : "medium",
        title: `${fullPlayerLabel(candidate.player)} is a live try-scoring chance.`,
        description: `${fullPlayerLabel(candidate.player)} averages ${candidate.tries.toFixed(1)} tries per game this season and is listed at ${price.toFixed(2)} in the anytime tryscorer market.`,
        confidence: candidate.tries >= 0.7 || price <= 2.2 ? 0.76 : 0.68,
      },
      Math.round(candidate.tries * 44 + Math.max(0, 4.5 - price) * 10),
      "try-scorer"
    )
  }
}

function addPlayerTryRunInsights(
  insights: CandidateInsight[],
  match: LineupMatch,
  playerTryHistory?: PlayerTryHistory
) {
  if (!playerTryHistory) return

  const candidates = [match.homeTeam, match.awayTeam]
    .flatMap((team) => namedPlayers(team).map((player) => ({ player, team, opponent: opposingTeam(match, team) })))

  const recentCandidates: Array<{ player: LineupPlayer; tries: number; sample: number }> = []
  const oppositionCandidates: Array<{ player: LineupPlayer; opponent: LineupTeam | null; tries: number; sample: number }> = []

  for (const candidate of candidates) {
    const history = playerTryHistory[normaliseKey(candidate.player.player)] ?? []
    const recent = history.slice(0, 5)
    if (recent.length >= 5) {
      const tries = recent.reduce((total, row) => total + row.tries, 0)
      if (tries >= 5) recentCandidates.push({ player: candidate.player, tries, sample: recent.length })
    }

    const opponentKey = normaliseKey(candidate.opponent?.team || candidate.opponent?.teamName)
    if (!opponentKey) continue
    const againstOpponent = history
      .filter((row) => normaliseKey(row.opponent) === opponentKey)
      .slice(0, 5)
    if (againstOpponent.length >= 5) {
      const tries = againstOpponent.reduce((total, row) => total + row.tries, 0)
      if (tries >= 5) {
        oppositionCandidates.push({
          player: candidate.player,
          opponent: candidate.opponent,
          tries,
          sample: againstOpponent.length,
        })
      }
    }
  }

  for (const candidate of recentCandidates
    .sort((a, b) => b.tries - a.tries)
    .slice(0, 2)) {
    addInsight(
      insights,
      {
        category: "Stats",
        severity: candidate.tries >= 7 ? "high" : "medium",
        title: `${fullPlayerLabel(candidate.player)} is in fine try-scoring form.`,
        description: `${fullPlayerLabel(candidate.player)} has scored ${candidate.tries} tries in his last ${candidate.sample} games.`,
        confidence: candidate.tries >= 7 ? 0.78 : 0.7,
      },
      86 + candidate.tries * 4,
      "try-scorer"
    )
  }

  for (const candidate of oppositionCandidates
    .sort((a, b) => b.tries - a.tries)
    .slice(0, 2)) {
    addInsight(
      insights,
      {
        category: "Stats",
        severity: candidate.tries >= 7 ? "high" : "medium",
        title: `${fullPlayerLabel(candidate.player)} has enjoyed this matchup.`,
        description: `${fullPlayerLabel(candidate.player)} has scored ${candidate.tries} tries in his last ${candidate.sample} games against ${teamLabel(candidate.opponent)}.`,
        confidence: candidate.tries >= 7 ? 0.78 : 0.7,
      },
      84 + candidate.tries * 4,
      "try-scorer"
    )
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
      title: `${fullPlayerLabel(shortest.player)} is the market's clearest try threat.`,
      description: `${fullPlayerLabel(shortest.player)} owns the shortest listed anytime try price for ${teamLabel(shortest.team)}${shortest.odds.bestBookie ? ` with ${shortest.odds.bestBookie}` : ""}.`,
      confidence: price <= 2.5 ? 0.76 : 0.68,
    },
    Math.round((4 - price) * 10),
    "try-scorer"
  )
}

export function generateMatchupInsights({
  match,
  tryscorerOdds,
  playerAverages,
  playerTryHistory,
  maxInsights = 6,
}: GenerateMatchupInsightsInput): MatchupInsight[] {
  const insights: CandidateInsight[] = []

  addPositionGroupInsight(insights, match)
  addTeamRecordTrendInsights(insights, match)
  addPlayerTryRunInsights(insights, match, playerTryHistory)
  addMatchTotalPointsTrendInsight(insights, match)
  addTeamPointsTrendInsights(insights, match)
  addPlayerTryMarketTrendInsights(insights, match, tryscorerOdds, playerAverages)
  addTryscorerInsight(insights, match, tryscorerOdds)

  return shuffledInsights(selectStrongestInsights(limitInsightFamilies(insights), Math.max(0, maxInsights)), matchShuffleSeed(match))
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

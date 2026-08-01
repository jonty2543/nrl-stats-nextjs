import type { PlayerStat } from "@/lib/data/types";

export const PLAYER_ATTACK_POSITIONS = ["Fullbacks", "Wingers", "Centres", "Halves", "Hookers", "Edges", "Middles"] as const;

export type PlayerAttackPosition = (typeof PLAYER_ATTACK_POSITIONS)[number];
export const PLAYER_BACK_POSITIONS = ["Fullbacks", "Wingers", "Centres", "Halves"] as const satisfies readonly PlayerAttackPosition[];
export const PLAYER_EFFICIENCY_BASE_METRICS = ["Receipts", "Runs", "Passes"] as const;
export const PLAYER_EFFICIENCY_OUTPUT_METRICS = ["Run metres", "Tries", "Try assists", "Offloads", "Tackle breaks", "Line break assists", "Post-contact metres"] as const;
export const PLAYER_ATTACK_COMPARISON_STATS = [
  "Receipts",
  "Runs",
  "Passes",
  "Run metres",
  "Post-contact metres",
  "Points",
  "Tries",
  "Try assists",
  "Line breaks",
  "Line break assists",
  "Offloads",
  "Tackle breaks",
  "Kick return metres",
  "Line engaged runs",
  "Hit ups",
  "Dummy half runs",
  "Dummy half run metres",
  "Kicks",
  "Kicking metres",
  "Forced drop outs",
  "Missed tackles",
  "Penalties",
  "Errors",
] as const;

export type PlayerEfficiencyBaseMetric = (typeof PLAYER_EFFICIENCY_BASE_METRICS)[number];
export type PlayerEfficiencyOutputMetric = (typeof PLAYER_EFFICIENCY_OUTPUT_METRICS)[number];
export type PlayerAttackComparisonStat = (typeof PLAYER_ATTACK_COMPARISON_STATS)[number];
export const PLAYER_ATTACK_STAT_COMPARISON_STATS: readonly PlayerAttackComparisonStat[] = PLAYER_ATTACK_COMPARISON_STATS;
export type PlayerAttackComparisonMode = "per-game" | "team-proportion" | "totals";
export type HalvesPairingSort = "ascending" | "descending";
export type PlayerGameWindow = 3 | 5 | 10 | null;

export interface PlayerAttackPoint {
  id: string;
  player: string;
  team: string;
  position: PlayerAttackPosition;
  games: number;
  volumeValue: number;
  efficiencyValue: number;
  averageMinutes: number;
  usualMinutes: number;
  isPer80: boolean;
}

export interface PlayerDefencePoint {
  id: string;
  player: string;
  team: string;
  position: PlayerAttackPosition;
  games: number;
  tacklesValue: number;
  tackleEfficiency: number;
  averageMinutes: number;
  usualMinutes: number;
  isPer80: boolean;
}

export interface PlayerAttackComparisonPoint {
  id: string;
  player: string;
  team: string;
  position: PlayerAttackPosition;
  games: number;
  xValue: number;
  yValue: number;
}

export interface HalvesPairingPoint {
  id: string;
  team: string;
  leftPlayer: string;
  rightPlayer: string;
  games: number;
  leftValue: number;
  rightValue: number;
  leftShare: number;
  rightShare: number;
  balance: number;
}

const BACK_POSITIONS = new Set<PlayerAttackPosition>(PLAYER_BACK_POSITIONS);

const EFFICIENCY_BASE_FIELDS: Record<PlayerEfficiencyBaseMetric, keyof PlayerStat> = {
  Receipts: "Receipts",
  Runs: "All Runs",
  Passes: "Passes",
};

const EFFICIENCY_OUTPUT_FIELDS: Record<PlayerEfficiencyOutputMetric, keyof PlayerStat> = {
  "Run metres": "All Run Metres",
  Tries: "Tries",
  "Try assists": "Try Assists",
  Offloads: "Offloads",
  "Tackle breaks": "Tackle Breaks",
  "Line break assists": "Line Break Assists",
  "Post-contact metres": "Post Contact Metres",
};

const ATTACK_COMPARISON_FIELDS: Record<PlayerAttackComparisonStat, keyof PlayerStat> = {
  Receipts: "Receipts",
  Runs: "All Runs",
  Passes: "Passes",
  "Run metres": "All Run Metres",
  "Post-contact metres": "Post Contact Metres",
  Points: "Points",
  Tries: "Tries",
  "Try assists": "Try Assists",
  "Line breaks": "Line Breaks",
  "Line break assists": "Line Break Assists",
  Offloads: "Offloads",
  "Tackle breaks": "Tackle Breaks",
  "Kick return metres": "Kick Return Metres",
  "Line engaged runs": "Line Engaged Runs",
  "Hit ups": "Hit Ups",
  "Dummy half runs": "Dummy Half Runs",
  "Dummy half run metres": "Dummy Half Run Metres",
  Kicks: "Kicks",
  "Kicking metres": "Kicking Metres",
  "Forced drop outs": "Forced Drop Outs",
  "Missed tackles": "Missed Tackles",
  Penalties: "Penalties",
  Errors: "Errors",
};

function finite(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function jerseyNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function positionFromNumber(value: unknown): PlayerAttackPosition | null {
  const number = jerseyNumber(value);
  if (number === 1) return "Fullbacks";
  if (number === 2 || number === 5) return "Wingers";
  if (number === 3 || number === 4) return "Centres";
  if (number === 6 || number === 7) return "Halves";
  if (number === 9) return "Hookers";
  if (number === 11 || number === 12) return "Edges";
  if (number === 8 || number === 10 || number === 13) return "Middles";
  return null;
}

function positionFromRow(row: PlayerStat): PlayerAttackPosition | null {
  const position = String(row.Position ?? "").trim().toUpperCase();
  if (["FB", "FULLBACK", "FULL BACK"].includes(position)) return "Fullbacks";
  if (["WG", "W", "WING", "WINGER"].includes(position)) return "Wingers";
  if (["CE", "C", "CTR", "CENTRE", "CENTER"].includes(position)) return "Centres";
  if (["FE", "FIVE-EIGHTH", "FIVE EIGHTH", "HB", "HLF", "HALFBACK", "HALF"].includes(position)) return "Halves";
  if (["HK", "HOK", "HOOKER"].includes(position)) return "Hookers";
  if (["SR", "2RF", "2ND ROW", "2ND-ROW", "SECOND ROW", "SECOND-ROW", "EDG", "EDGE"].includes(position)) return "Edges";
  if (["PR", "PROP", "LK", "LOCK", "MID", "MIDDLE"].includes(position)) return "Middles";

  return position && !["UNKNOWN"].includes(position) ? null : positionFromNumber(row.Number);
}

function halfRoleFromRow(row: PlayerStat): 6 | 7 | null {
  const position = String(row.Position ?? "").trim().toUpperCase();
  if (["FE", "FIVE-EIGHTH", "FIVE EIGHTH"].includes(position)) return 6;
  if (["HB", "HLF", "HALFBACK"].includes(position)) return 7;
  if (position && !["HALF", "UNKNOWN"].includes(position)) return null;
  const number = jerseyNumber(row.Number);
  return number === 6 || number === 7 ? number : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function mostCommonTeam(rows: PlayerStat[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const team = String(row.Team ?? "");
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "";
}

function teamGameKey(row: PlayerStat): string {
  return [row.Year, String(row.Round_Label || row.Round), String(row.Team ?? "").trim().toLowerCase()].join("|");
}

function latestQualifyingRows(rows: PlayerStat[], gameWindow: PlayerGameWindow): PlayerStat[] {
  const sorted = [...rows].sort((left, right) => finite(left.Round) - finite(right.Round));
  if (gameWindow === null) return sorted;
  return sorted.length >= gameWindow ? sorted.slice(-gameWindow) : [];
}

function minimumQualifyingGames(gameWindow: PlayerGameWindow): number {
  return gameWindow ?? 5;
}

export function buildPlayerAttackPoints(
  rows: PlayerStat[],
  position: PlayerAttackPosition,
  baseMetric: PlayerEfficiencyBaseMetric,
  outputMetric: PlayerEfficiencyOutputMetric,
  gameWindow: PlayerGameWindow = null
): PlayerAttackPoint[] {
  const players = new Map<string, PlayerStat[]>();
  for (const row of rows) {
    if (positionFromRow(row) !== position || finite(row["Mins Played"]) <= 0) continue;
    const player = String(row.Name ?? "").trim();
    if (!player) continue;
    players.set(player, [...(players.get(player) ?? []), row]);
  }

  const isPer80 = BACK_POSITIONS.has(position);
  const points: PlayerAttackPoint[] = [];
  for (const [player, positionRows] of players) {
    const usualMinutes = median(positionRows.map((row) => finite(row["Mins Played"])));
    const positionQualifyingRows = isPer80
      ? positionRows
      : positionRows.filter((row) => finite(row["Mins Played"]) >= usualMinutes * 0.6);
    const qualifyingRows = latestQualifyingRows(positionQualifyingRows, gameWindow);
    if (qualifyingRows.length < minimumQualifyingGames(gameWindow)) continue;

    const baseField = EFFICIENCY_BASE_FIELDS[baseMetric];
    const outputField = EFFICIENCY_OUTPUT_FIELDS[outputMetric];
    const totalBase = qualifyingRows.reduce((sum, row) => sum + finite(row[baseField]), 0);
    if (totalBase <= 0) continue;
    const totalOutput = qualifyingRows.reduce((sum, row) => sum + finite(row[outputField]), 0);
    const volumeValue = qualifyingRows.reduce((sum, row) => {
      const value = finite(row[baseField]);
      return sum + (isPer80 ? value * (80 / finite(row["Mins Played"])) : value);
    }, 0) / qualifyingRows.length;

    points.push({
      id: `${player}|${position}`,
      player,
      team: mostCommonTeam(qualifyingRows),
      position,
      games: qualifyingRows.length,
      volumeValue,
      efficiencyValue: totalOutput / totalBase,
      averageMinutes: qualifyingRows.reduce((sum, row) => sum + finite(row["Mins Played"]), 0) / qualifyingRows.length,
      usualMinutes,
      isPer80,
    });
  }

  return points.sort((left, right) => right.volumeValue - left.volumeValue || left.player.localeCompare(right.player));
}

export function buildPlayerAttackComparisonPoints(
  rows: PlayerStat[],
  position: PlayerAttackPosition,
  xStat: PlayerAttackComparisonStat,
  yStat: PlayerAttackComparisonStat,
  mode: PlayerAttackComparisonMode,
  gameWindow: PlayerGameWindow = null
): PlayerAttackComparisonPoint[] {
  const xField = ATTACK_COMPARISON_FIELDS[xStat];
  const yField = ATTACK_COMPARISON_FIELDS[yStat];
  const teamGameTotals = new Map<string, { x: number; y: number }>();
  const players = new Map<string, PlayerStat[]>();

  for (const row of rows) {
    const team = String(row.Team ?? "").trim();
    if (team) {
      const key = teamGameKey(row);
      const totals = teamGameTotals.get(key) ?? { x: 0, y: 0 };
      totals.x += finite(row[xField]);
      totals.y += finite(row[yField]);
      teamGameTotals.set(key, totals);
    }
    if (positionFromRow(row) !== position || finite(row["Mins Played"]) <= 0) continue;
    const player = String(row.Name ?? "").trim();
    if (!player) continue;
    players.set(player, [...(players.get(player) ?? []), row]);
  }

  const points: PlayerAttackComparisonPoint[] = [];
  for (const [player, positionRows] of players) {
    const usualMinutes = median(positionRows.map((row) => finite(row["Mins Played"])));
    const positionQualifyingRows = BACK_POSITIONS.has(position)
      ? positionRows
      : positionRows.filter((row) => finite(row["Mins Played"]) >= usualMinutes * 0.6);
    const modeQualifyingRows = mode === "team-proportion"
      ? positionQualifyingRows.filter((row) => finite(row["Mins Played"]) >= 40)
      : positionQualifyingRows;
    const qualifyingRows = latestQualifyingRows(modeQualifyingRows, gameWindow);
    if (qualifyingRows.length < minimumQualifyingGames(gameWindow)) continue;

    const isPer80 = BACK_POSITIONS.has(position);
    const comparisonXTotal = qualifyingRows.reduce((sum, row) => {
      const value = finite(row[xField]);
      return sum + (isPer80 ? value * (80 / finite(row["Mins Played"])) : value);
    }, 0);
    const comparisonYTotal = qualifyingRows.reduce((sum, row) => {
      const value = finite(row[yField]);
      return sum + (isPer80 ? value * (80 / finite(row["Mins Played"])) : value);
    }, 0);
    const comparisonX = mode === "totals"
      ? qualifyingRows.reduce((sum, row) => sum + finite(row[xField]), 0)
      : comparisonXTotal / qualifyingRows.length;
    const comparisonY = mode === "totals"
      ? qualifyingRows.reduce((sum, row) => sum + finite(row[yField]), 0)
      : comparisonYTotal / qualifyingRows.length;
    const xShares = qualifyingRows.flatMap((row) => {
      const teamTotal = teamGameTotals.get(teamGameKey(row))?.x ?? 0;
      return teamTotal > 0 ? [(finite(row[xField]) / teamTotal) * 100] : [];
    });
    const yShares = qualifyingRows.flatMap((row) => {
      const teamTotal = teamGameTotals.get(teamGameKey(row))?.y ?? 0;
      return teamTotal > 0 ? [(finite(row[yField]) / teamTotal) * 100] : [];
    });
    const averageXShare = xShares.reduce((sum, share) => sum + share, 0) / Math.max(xShares.length, 1);
    const averageYShare = yShares.reduce((sum, share) => sum + share, 0) / Math.max(yShares.length, 1);

    points.push({
      id: `${player}|${position}|${mode}|${xStat}|${yStat}`,
      player,
      team: mostCommonTeam(qualifyingRows),
      position,
      games: qualifyingRows.length,
      xValue: mode === "team-proportion" ? averageXShare : comparisonX,
      yValue: mode === "team-proportion" ? averageYShare : comparisonY,
    });
  }

  return points.sort((left, right) => right.xValue - left.xValue || left.player.localeCompare(right.player));
}

export function buildHalvesPairingPoints(
  rows: PlayerStat[],
  stat: PlayerAttackComparisonStat,
  sort: HalvesPairingSort,
  gameWindow: PlayerGameWindow = null
): HalvesPairingPoint[] {
  const field = ATTACK_COMPARISON_FIELDS[stat];
  const games = new Map<string, PlayerStat[]>();
  for (const row of rows) {
    const team = String(row.Team ?? "").trim();
    if (!team) continue;
    const key = teamGameKey(row);
    games.set(key, [...(games.get(key) ?? []), row]);
  }

  const pairings = new Map<string, {
    team: string;
    playerA: string;
    playerB: string;
    samples: Array<{
      round: number;
      playerAValue: number;
      playerBValue: number;
      playerAIsHalfback: boolean;
    }>;
  }>();

  for (const gameRows of games.values()) {
    const six = gameRows.find((row) => halfRoleFromRow(row) === 6);
    const seven = gameRows.find((row) => halfRoleFromRow(row) === 7);
    if (!six || !seven) continue;
    if (finite(six["Mins Played"]) < 60 || finite(seven["Mins Played"]) < 60) continue;
    const sixName = String(six.Name ?? "").trim();
    const sevenName = String(seven.Name ?? "").trim();
    if (!sixName || !sevenName || sixName === sevenName) continue;

    const [playerARow, playerBRow] = sixName.localeCompare(sevenName) <= 0 ? [six, seven] : [seven, six];
    const playerA = String(playerARow.Name).trim();
    const playerB = String(playerBRow.Name).trim();
    const team = String(playerARow.Team ?? playerBRow.Team ?? "").trim();
    const key = `${team.toLowerCase()}|${playerA.toLowerCase()}|${playerB.toLowerCase()}`;
    const pairing = pairings.get(key) ?? { team, playerA, playerB, samples: [] };
    pairing.samples.push({
      round: finite(playerARow.Round),
      playerAValue: finite(playerARow[field]),
      playerBValue: finite(playerBRow[field]),
      playerAIsHalfback: halfRoleFromRow(playerARow) === 7,
    });
    pairings.set(key, pairing);
  }

  return [...pairings.entries()].flatMap(([id, pairing]): HalvesPairingPoint[] => {
    const sortedSamples = [...pairing.samples].sort((left, right) => left.round - right.round);
    const samples = gameWindow === null
      ? sortedSamples
      : sortedSamples.length >= gameWindow ? sortedSamples.slice(-gameWindow) : [];
    if (samples.length < minimumQualifyingGames(gameWindow)) return [];
    const playerAValue = samples.reduce((sum, sample) => sum + sample.playerAValue, 0);
    const playerBValue = samples.reduce((sum, sample) => sum + sample.playerBValue, 0);
    const playerAHalfbackGames = samples.filter((sample) => sample.playerAIsHalfback).length;
    const playerAIsHalfback = playerAHalfbackGames * 2 >= samples.length;
    const leftPlayer = playerAIsHalfback ? pairing.playerA : pairing.playerB;
    const rightPlayer = playerAIsHalfback ? pairing.playerB : pairing.playerA;
    const leftValue = playerAIsHalfback ? playerAValue : playerBValue;
    const rightValue = playerAIsHalfback ? playerBValue : playerAValue;
    const total = leftValue + rightValue;
    if (total <= 0) return [];
    const leftShare = (leftValue / total) * 100;
    const rightShare = 100 - leftShare;
    return [{
      id,
      team: pairing.team,
      leftPlayer,
      rightPlayer,
      games: samples.length,
      leftValue,
      rightValue,
      leftShare,
      rightShare,
      balance: Math.min(leftShare, rightShare),
    }];
  }).sort((left, right) => {
    const balanceOrder = sort === "ascending" ? left.balance - right.balance : right.balance - left.balance;
    return balanceOrder || right.games - left.games || left.team.localeCompare(right.team);
  });
}

export function buildPlayerDefencePoints(
  rows: PlayerStat[],
  position: PlayerAttackPosition,
  gameWindow: PlayerGameWindow = null
): PlayerDefencePoint[] {
  const players = new Map<string, PlayerStat[]>();
  for (const row of rows) {
    if (positionFromRow(row) !== position || finite(row["Mins Played"]) <= 0) continue;
    const player = String(row.Name ?? "").trim();
    if (!player) continue;
    players.set(player, [...(players.get(player) ?? []), row]);
  }

  const isPer80 = BACK_POSITIONS.has(position);
  const points: PlayerDefencePoint[] = [];
  for (const [player, positionRows] of players) {
    const usualMinutes = median(positionRows.map((row) => finite(row["Mins Played"])));
    const positionQualifyingRows = isPer80
      ? positionRows
      : positionRows.filter((row) => finite(row["Mins Played"]) >= usualMinutes * 0.6);
    const qualifyingRows = latestQualifyingRows(positionQualifyingRows, gameWindow);
    if (qualifyingRows.length < minimumQualifyingGames(gameWindow)) continue;

    const tacklesValue = qualifyingRows.reduce((sum, row) => {
      const tackles = finite(row["Tackles Made"]);
      return sum + (isPer80 ? tackles * (80 / finite(row["Mins Played"])) : tackles);
    }, 0) / qualifyingRows.length;
    const tackleEfficiency = qualifyingRows.reduce((sum, row) => sum + finite(row["Tackle Efficiency"]), 0) / qualifyingRows.length;

    points.push({
      id: `${player}|${position}|defence`,
      player,
      team: mostCommonTeam(qualifyingRows),
      position,
      games: qualifyingRows.length,
      tacklesValue,
      tackleEfficiency,
      averageMinutes: qualifyingRows.reduce((sum, row) => sum + finite(row["Mins Played"]), 0) / qualifyingRows.length,
      usualMinutes,
      isPer80,
    });
  }

  return points.sort((left, right) => right.tacklesValue - left.tacklesValue || left.player.localeCompare(right.player));
}

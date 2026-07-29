import type { TeamStat } from "@/lib/data/types";
import type { DefencePlotMode } from "@/lib/data/defence-ratings";

export const TEAM_ATTACK_COMPARISON_STATS = [
  "Disruptions",
  "Line breaks",
  "Run metres per run",
  "Tries",
  "Points",
  "Run metres",
  "Post-contact metres",
  "Try assists",
  "Offloads",
  "Tackle breaks",
  "Line break assists",
  "Kicks",
  "Kicking metres",
  "Forced drop outs",
  "Missed tackles",
  "Penalties",
  "Errors",
] as const;
export type TeamAttackComparisonStat = (typeof TEAM_ATTACK_COMPARISON_STATS)[number];

export const TEAM_ATTACK_EFFICIENCY_BASE_STATS = ["Receipts", "Runs", "Passes", "Kicks"] as const;
export type TeamAttackEfficiencyBaseStat = (typeof TEAM_ATTACK_EFFICIENCY_BASE_STATS)[number];

export const TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS = [
  "Run metres",
  "Post-contact metres",
  "Line breaks",
  "Line break assists",
  "Tries",
  "Try assists",
  "Disruptions",
  "Offloads",
  "Tackle breaks",
  "Points",
  "Kicks",
  "Kicking metres",
  "Forced drop outs",
] as const;
export type TeamAttackEfficiencyOutputStat = (typeof TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS)[number];

export const TEAM_ATTACK_TOTAL_STATS = [
  "Points",
  "Receipts",
  "Runs",
  "Passes",
  "Run metres",
  "Post-contact metres",
  "Tries",
  "Try assists",
  "Offloads",
  "Tackle breaks",
  "Line breaks",
  "Line break assists",
  "Kicks",
  "Kicking metres",
  "Forced drop outs",
  "Disruptions",
  "Missed tackles",
  "Penalties",
  "Errors",
] as const;
export type TeamAttackTotalStat = (typeof TEAM_ATTACK_TOTAL_STATS)[number];

export interface AttackRatingPoint {
  id: string;
  team: string;
  year: string;
  roundLabel: string;
  opponent: string | null;
  games: number;
  disruptionRate: number;
  lineBreakRate: number;
  runMetresPerRun: number;
  triesPer100Runs: number;
  disruptions: number;
  lineBreaks: number;
  runMetres: number;
  tries: number;
  runs: number;
  totals: Record<TeamAttackTotalStat, number>;
}

function finite(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function roundOrder(label: string): number {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function latestTeamGames(points: AttackRatingPoint[], gameWindow: 5 | 10 | null): AttackRatingPoint[] {
  if (gameWindow === null) return points;
  const groups = new Map<string, AttackRatingPoint[]>();
  for (const point of points) {
    const key = `${point.year}|${normalise(point.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  return [...groups.values()].flatMap((teamPoints) =>
    [...teamPoints].sort((left, right) => roundOrder(left.roundLabel) - roundOrder(right.roundLabel)).slice(-gameWindow)
  );
}

function attackTotals(row: TeamStat): Record<TeamAttackTotalStat, number> {
  const tackleBreaks = finite(row["Tackle Breaks"]);
  const offloads = finite(row.Offloads);
  return {
    Points: finite(row.Points),
    Receipts: finite(row.Receipts),
    Runs: finite(row["All Runs"]),
    Passes: finite(row.Passes),
    "Run metres": finite(row["All Run Metres"]),
    "Post-contact metres": finite(row["Post Contact Metres"]),
    Tries: finite(row.Tries),
    "Try assists": finite(row["Try Assists"]),
    Offloads: offloads,
    "Tackle breaks": tackleBreaks,
    "Line breaks": finite(row["Line Breaks"]),
    "Line break assists": finite(row["Line Break Assists"]),
    Kicks: finite(row.Kicks),
    "Kicking metres": finite(row["Kicking Metres"]),
    "Forced drop outs": finite(row["Forced Drop Outs"]),
    Disruptions: tackleBreaks + offloads,
    "Missed tackles": finite(row["Missed Tackles"]),
    Penalties: finite(row.Penalties),
    Errors: finite(row.Errors),
  };
}

export function buildAttackRatingPoints(rows: TeamStat[], mode: DefencePlotMode, gameWindow: 5 | 10 | null = null): AttackRatingPoint[] {
  const allGames = rows.flatMap((row): AttackRatingPoint[] => {
    const totals = attackTotals(row);
    const runs = totals.Runs;
    if (runs <= 0) return [];
    const disruptions = totals.Disruptions;
    const lineBreaks = totals["Line breaks"];
    const runMetres = totals["Run metres"];
    const tries = totals.Tries;
    return [{
      id: `${row.Year}-${row.Date}-${row.Team}`,
      team: row.Team,
      year: row.Year,
      roundLabel: row.Round_Label || String(row.Round),
      opponent: row.Opponent,
      games: 1,
      disruptionRate: (disruptions / runs) * 100,
      lineBreakRate: (lineBreaks / runs) * 100,
      runMetresPerRun: runMetres / runs,
      triesPer100Runs: (tries / runs) * 100,
      disruptions,
      lineBreaks,
      runMetres,
      tries,
      runs,
      totals,
    }];
  });
  const games = latestTeamGames(allGames, gameWindow);

  if (mode === "games") return games;

  const groups = new Map<string, AttackRatingPoint[]>();
  for (const point of games) {
    const key = `${point.year}|${normalise(point.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  return [...groups.values()].map((points) => {
    const runs = points.reduce((sum, point) => sum + point.runs, 0);
    const disruptions = points.reduce((sum, point) => sum + point.disruptions, 0);
    const lineBreaks = points.reduce((sum, point) => sum + point.lineBreaks, 0);
    const runMetres = points.reduce((sum, point) => sum + point.runMetres, 0);
    const tries = points.reduce((sum, point) => sum + point.tries, 0);
    const totals = Object.fromEntries(TEAM_ATTACK_TOTAL_STATS.map((stat) => [
      stat,
      points.reduce((sum, point) => sum + point.totals[stat], 0),
    ])) as Record<TeamAttackTotalStat, number>;
    return {
      id: `${points[0].year}-${points[0].team}`,
      team: points[0].team,
      year: points[0].year,
      roundLabel: "Season",
      opponent: null,
      games: points.length,
      disruptionRate: runs > 0 ? (disruptions / runs) * 100 : 0,
      lineBreakRate: runs > 0 ? (lineBreaks / runs) * 100 : 0,
      runMetresPerRun: runs > 0 ? runMetres / runs : 0,
      triesPer100Runs: runs > 0 ? (tries / runs) * 100 : 0,
      disruptions,
      lineBreaks,
      runMetres,
      tries,
      runs,
      totals,
    };
  }).sort((left, right) => left.team.localeCompare(right.team));
}

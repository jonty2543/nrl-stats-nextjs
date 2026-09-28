import type { PlayerStat } from "./types";
import { PLAYER_ATTACK_POSITIONS, positionFromRow } from "./player-attack";
import type { TeamAttackEfficiencyBaseStat } from "./attack-ratings";
import { FINALS_MAP } from "./constants";

export const MATCHUP_METRICS = {
  "Run metres": "All Run Metres",
  Runs: "All Runs",
  Receipts: "Receipts",
  Fantasy: "Fantasy",
  Tries: "Tries",
  "Try assists": "Try Assists",
  "Line breaks": "Line Breaks",
  "Tackle breaks": "Tackle Breaks",
  Offloads: "Offloads",
  Points: "Points",
  Conversions: "Conversions",
  "Conversion attempts": "Conversion Attempts",
  "Penalty goals": "Penalty Goals",
  "1 point field goals": "1 Point Field Goals",
  "2 point field goals": "2 Point Field Goals",
  "Post-contact metres": "Post Contact Metres",
  "Kick return metres": "Kick Return Metres",
  "Line break assists": "Line Break Assists",
  "Line engaged runs": "Line Engaged Runs",
  "Hit ups": "Hit Ups",
  "Play the balls": "Play The Ball",
  "Dummy half runs": "Dummy Half Runs",
  "Dummy half run metres": "Dummy Half Run Metres",
  Passes: "Passes",
  "Pass to run ratio": "Passes To Run Ratio",
  "Tackle efficiency": "Tackle Efficiency",
  "Dummy passes": "Dummy Passes",
  "Tackles made": "Tackles Made",
  "Missed tackles": "Missed Tackles",
  "Ineffective tackles": "Ineffective Tackles",
  "One on one steals": "One on One Steal",
  Intercepts: "Intercepts",
  "Kicks defused": "Kicks Defused",
  Kicks: "Kicks",
  "Kicking metres": "Kicking Metres",
  "Forced drop outs": "Forced Drop Outs",
  "Bomb kicks": "Bomb Kicks",
  Grubbers: "Grubbers",
  "40/20s": "40/20",
  "20/40s": "20/40",
  "Cross field kicks": "Cross Field Kicks",
  "Kicked dead": "Kicked Dead",
  Errors: "Errors",
  "Handling errors": "Handling Errors",
  "One on one lost": "One on One Lost",
  Penalties: "Penalties",
  "Ruck infringements": "Ruck Infringements",
  "Inside 10 metres": "Inside 10 Metres",
  "On report": "On Report",
  "Sin bins": "Sin Bins",
  "Send offs": "Send Offs",
} as const satisfies Record<string, keyof PlayerStat>;
export type MatchupMetric = keyof typeof MATCHUP_METRICS;
export type MatchupValueMode = "Average" | "Percentage";
export type MatchupDirection = "attack" | "defense";
export const GROUPED_MATCHUP_POSITIONS = ["Outside Backs", ...PLAYER_ATTACK_POSITIONS.filter((position) => !["Fullbacks", "Wingers", "Centres"].includes(position))] as const;
export type MatchupPosition = (typeof GROUPED_MATCHUP_POSITIONS)[number];

const EFFICIENCY_BASE_FIELDS: Record<TeamAttackEfficiencyBaseStat, keyof PlayerStat> = {
  Receipts: "Receipts",
  Runs: "All Runs",
  Passes: "Passes",
  Kicks: "Kicks",
};

function roundNumber(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "");
  for (const [label, finalsRound] of Object.entries(FINALS_MAP)) {
    if (text.toLowerCase().includes(label.toLowerCase())) return finalsRound;
  }
  const abbreviatedFinals = text.match(/\bFW\s*([1-3])\b/i);
  if (abbreviatedFinals) return 27 + Number(abbreviatedFinals[1]);
  if (/\bGF\b/i.test(text)) return 31;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function buildMatchupHeatmap(rows: PlayerStat[], metric: MatchupMetric, gameWindow: number | null, valueMode: MatchupValueMode = "Average", direction: MatchupDirection = "defense", groupOutsideBacks = false, efficiencyBaseMetric: TeamAttackEfficiencyBaseStat | null = null) {
  const teams = new Map<string, Map<string, { round: number; total: number; totals: Map<string, number>; baseTotals: Map<string, number>; runTotals: Map<string, number> }>>();
  for (const row of rows) {
    const team = direction === "attack" ? row.Team?.trim() : row.Opponent?.trim();
    if (!team) continue;
    const games = teams.get(team) ?? new Map();
    const key = `${row.Year}|${row.Round}|${row.Team}`;
    const value = row[MATCHUP_METRICS[metric]];
    const metricValue = metric === "Pass to run ratio" ? row.Passes : value;
    const baseValue = efficiencyBaseMetric ? row[EFFICIENCY_BASE_FIELDS[efficiencyBaseMetric]] : null;
    const game = games.get(key) ?? { round: roundNumber(row.Round_Label || row.Round), total: 0, totals: new Map<string, number>(), baseTotals: new Map<string, number>(), runTotals: new Map<string, number>() };
    if (typeof metricValue === "number" && Number.isFinite(metricValue)) game.total += metricValue;
    const playerPosition = positionFromRow(row);
    const position = groupOutsideBacks && playerPosition && ["Fullbacks", "Wingers", "Centres"].includes(playerPosition) ? "Outside Backs" : playerPosition;
    if (position && typeof metricValue === "number" && Number.isFinite(metricValue)) {
      game.totals.set(position, (game.totals.get(position) ?? 0) + metricValue);
    }
    if (position && metric === "Pass to run ratio") game.runTotals.set(position, (game.runTotals.get(position) ?? 0) + (Number.isFinite(row["All Runs"]) ? row["All Runs"] : 0));
    if (position && typeof baseValue === "number" && Number.isFinite(baseValue)) {
      game.baseTotals.set(position, (game.baseTotals.get(position) ?? 0) + baseValue);
    }
    games.set(key, game);
    teams.set(team, games);
  }
  return [...teams].map(([team, games]) => {
    const ordered = [...games.values()].sort((a, b) => a.round - b.round);
    const selected = gameWindow ? ordered.slice(-gameWindow) : ordered;
    return {
      team,
      games: selected.length,
      cells: (groupOutsideBacks ? GROUPED_MATCHUP_POSITIONS : PLAYER_ATTACK_POSITIONS).map((position) => {
        const available = selected.filter((game) => game.totals.has(position));
        if (!available.length) return { position, games: 0, value: null };
        const positionTotal = available.reduce((sum, game) => sum + game.totals.get(position)!, 0);
        if (metric === "Pass to run ratio") {
          const runs = available.reduce((sum, game) => sum + (game.runTotals.get(position) ?? 0), 0);
          return { position, games: available.length, value: runs > 0 ? positionTotal / runs : null };
        }
        if (efficiencyBaseMetric) {
          const baseTotal = available.reduce((sum, game) => sum + (game.baseTotals.get(position) ?? 0), 0);
          return { position, games: available.length, value: baseTotal > 0 ? positionTotal / baseTotal : null };
        }
        const teamTotal = selected.reduce((sum, game) => sum + game.total, 0);
        return { position, games: available.length, value: valueMode === "Percentage" ? teamTotal === 0 ? null : (positionTotal / teamTotal) * 100 : positionTotal / Math.max(selected.length, 1) };
      }),
    };
  }).sort((a, b) => a.team.localeCompare(b.team));
}

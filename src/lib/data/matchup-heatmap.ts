import type { PlayerStat } from "./types";
import { PLAYER_ATTACK_POSITIONS, positionFromRow } from "./player-attack";

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
} as const satisfies Record<string, keyof PlayerStat>;
export type MatchupMetric = keyof typeof MATCHUP_METRICS;
export type MatchupValueMode = "Average" | "Percentage";
export type MatchupDirection = "attack" | "defense";

export function buildMatchupHeatmap(rows: PlayerStat[], metric: MatchupMetric, gameWindow: number | null, valueMode: MatchupValueMode = "Average", direction: MatchupDirection = "defense") {
  const teams = new Map<string, Map<string, { round: number; total: number; totals: Map<string, number> }>>();
  for (const row of rows) {
    const team = direction === "attack" ? row.Team?.trim() : row.Opponent?.trim();
    if (!team) continue;
    const games = teams.get(team) ?? new Map();
    const key = `${row.Year}|${row.Round}|${row.Team}`;
    const value = row[MATCHUP_METRICS[metric]];
    const game = games.get(key) ?? { round: Number(row.Round), total: 0, totals: new Map<string, number>() };
    if (typeof value === "number" && Number.isFinite(value)) game.total += value;
    const position = positionFromRow(row);
    if (position && typeof value === "number" && Number.isFinite(value)) {
      game.totals.set(position, (game.totals.get(position) ?? 0) + value);
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
      cells: PLAYER_ATTACK_POSITIONS.map((position) => {
        const available = selected.filter((game) => game.totals.has(position));
        if (!available.length) return { position, games: 0, value: null };
        const positionTotal = available.reduce((sum, game) => sum + game.totals.get(position)!, 0);
        const teamTotal = selected.reduce((sum, game) => sum + game.total, 0);
        return { position, games: available.length, value: valueMode === "Percentage" ? (positionTotal / teamTotal) * 100 : positionTotal / Math.max(selected.length, 1) };
      }),
    };
  }).sort((a, b) => a.team.localeCompare(b.team));
}

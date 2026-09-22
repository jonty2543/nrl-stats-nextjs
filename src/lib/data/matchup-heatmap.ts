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

export function buildMatchupHeatmap(rows: PlayerStat[], metric: MatchupMetric, gameWindow: number | null, valueMode: MatchupValueMode = "Average", direction: MatchupDirection = "defense", groupOutsideBacks = false) {
  const teams = new Map<string, Map<string, { round: number; total: number; totals: Map<string, number> }>>();
  for (const row of rows) {
    const team = direction === "attack" ? row.Team?.trim() : row.Opponent?.trim();
    if (!team) continue;
    const games = teams.get(team) ?? new Map();
    const key = `${row.Year}|${row.Round}|${row.Team}`;
    const value = row[MATCHUP_METRICS[metric]];
    const game = games.get(key) ?? { round: Number(row.Round), total: 0, totals: new Map<string, number>() };
    if (typeof value === "number" && Number.isFinite(value)) game.total += value;
    const playerPosition = positionFromRow(row);
    const position = groupOutsideBacks && playerPosition && ["Fullbacks", "Wingers", "Centres"].includes(playerPosition) ? "Outside Backs" : playerPosition;
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
      cells: (groupOutsideBacks ? GROUPED_MATCHUP_POSITIONS : PLAYER_ATTACK_POSITIONS).map((position) => {
        const available = selected.filter((game) => game.totals.has(position));
        if (!available.length) return { position, games: 0, value: null };
        const positionTotal = available.reduce((sum, game) => sum + game.totals.get(position)!, 0);
        const teamTotal = selected.reduce((sum, game) => sum + game.total, 0);
        return { position, games: available.length, value: valueMode === "Percentage" ? teamTotal === 0 ? null : (positionTotal / teamTotal) * 100 : positionTotal / Math.max(selected.length, 1) };
      }),
    };
  }).sort((a, b) => a.team.localeCompare(b.team));
}

import type { PlayerStat, TeamStat } from "./types";
import { positionFromRow } from "./player-attack";

export const ROUND_BY_ROUND_STATS = {
  "Run metres": "All Run Metres", Runs: "All Runs", Receipts: "Receipts", Passes: "Passes",
  "Post-contact metres": "Post Contact Metres", Points: "Points", Tries: "Tries",
  "Try assists": "Try Assists", "Line breaks": "Line Breaks", "Line break assists": "Line Break Assists",
  "Tackle breaks": "Tackle Breaks", Offloads: "Offloads", Tackles: "Tackles Made",
  "Missed tackles": "Missed Tackles", "Ineffective tackles": "Ineffective Tackles",
  "Kicking metres": "Kicking Metres", Kicks: "Kicks", "Forced drop outs": "Forced Drop Outs",
  Errors: "Errors", Penalties: "Penalties", "Kick return metres": "Kick Return Metres",
} as const satisfies Record<string, keyof PlayerStat & keyof TeamStat>;
export type RoundStat = keyof typeof ROUND_BY_ROUND_STATS;
export type RoundRow = PlayerStat | TeamStat;
const normalise = (value: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildRoundByRound(rows: RoundRow[], entity: "Players" | "Teams", selected: string, stat: RoundStat, against: boolean) {
  const field = ROUND_BY_ROUND_STATS[stat];
  return rows.filter((row) => entity === "Players" ? (row as PlayerStat).Name === selected : row.Team === selected)
    .sort((a, b) => Number(a.Round) - Number(b.Round))
    .map((row) => {
      let sources: RoundRow[] = [row];
      if (against) {
        const position = entity === "Players" ? positionFromRow(row as PlayerStat) : null;
        sources = rows.filter((opponent) => opponent.Year === row.Year && opponent.Round === row.Round
          && normalise(opponent.Team) === normalise(row.Opponent)
          && normalise(opponent.Opponent) === normalise(row.Team)
          && (entity === "Teams" || (position !== null && positionFromRow(opponent as PlayerStat) === position)));
      }
      const values = sources.map((source) => source[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return {
        round: Number(row.Round), label: row.Round_Label || `Round ${row.Round}`, opponent: row.Opponent,
        value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        sample: values.length,
      };
    });
}

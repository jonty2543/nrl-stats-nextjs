import type { PlayerStat } from "@/lib/data/types";

export const TEAM_SHARE_POSITION_GROUPS = ["Fullback", "Wingers", "Centres", "Halves", "Edges", "Middles"] as const;

export const TEAM_SHARE_METRICS = ["Receipts", "Runs", "Tackle Breaks", "Offloads", "Passes", "Tackles"] as const;

export type TeamSharePositionGroup = (typeof TEAM_SHARE_POSITION_GROUPS)[number];
export type TeamShareMetric = (typeof TEAM_SHARE_METRICS)[number];

export interface TeamShareSeries {
  team: string;
  games: number;
  values: Record<TeamSharePositionGroup, number>;
}

const METRIC_FIELDS: Record<TeamShareMetric, keyof PlayerStat> = {
  Receipts: "Receipts",
  Runs: "All Runs",
  "Tackle Breaks": "Tackle Breaks",
  Offloads: "Offloads",
  Passes: "Passes",
  Tackles: "Tackles Made",
};

function finite(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function starterNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const number = Number(match[0]);
  return number >= 1 && number <= 13 ? number : null;
}

function positionGroup(value: unknown, number: number | null): TeamSharePositionGroup | null {
  const key = String(value ?? "").trim().toUpperCase();
  if (["FB", "FULLBACK", "FULL BACK"].includes(key)) return "Fullback";
  if (["WG", "W", "WING", "WINGER"].includes(key)) return "Wingers";
  if (key === "WFB") return number === 1 ? "Fullback" : "Wingers";
  if (["CE", "C", "CTR", "CENTRE", "CENTER"].includes(key)) return "Centres";
  if (["FE", "FIVE-EIGHTH", "FIVE EIGHTH", "HB", "HLF", "HALFBACK", "HALF"].includes(key)) return "Halves";
  if (["SR", "2RF", "2ND ROW", "2ND-ROW", "SECOND ROW", "SECOND-ROW", "EDG", "EDGE"].includes(key)) return "Edges";
  if (["PR", "PROP", "LK", "LOCK", "MID", "MIDDLE"].includes(key)) return "Middles";

  if (key && key !== "UNKNOWN") return null;

  if (number === 1) return "Fullback";
  if (number === 2 || number === 5) return "Wingers";
  if (number === 3 || number === 4) return "Centres";
  if (number === 6 || number === 7) return "Halves";
  if (number === 11 || number === 12) return "Edges";
  if (number === 8 || number === 10 || number === 13) return "Middles";
  return null;
}

function emptyValues(): Record<TeamSharePositionGroup, number> {
  return { Fullback: 0, Wingers: 0, Centres: 0, Halves: 0, Edges: 0, Middles: 0 };
}

export function buildTeamShareSeries(
  rows: PlayerStat[],
  metric: TeamShareMetric,
  gameWindow: 5 | 10 | null = null
): TeamShareSeries[] {
  const field = METRIC_FIELDS[metric];
  const games = new Map<string, PlayerStat[]>();
  for (const row of rows) {
    const key = `${row.Year}|${row.Round}|${row.Team}`;
    games.set(key, [...(games.get(key) ?? []), row]);
  }

  const allGames = [...games.values()];
  const teamGames = new Map<string, PlayerStat[][]>();
  for (const gameRows of allGames) {
    const team = String(gameRows[0]?.Team ?? "");
    teamGames.set(team, [...(teamGames.get(team) ?? []), gameRows]);
  }
  const selectedGames = gameWindow === null
    ? allGames
    : [...teamGames.values()].flatMap((teamGameRows) =>
        [...teamGameRows]
          .sort((left, right) => finite(left[0]?.Round) - finite(right[0]?.Round))
          .slice(-gameWindow)
      );

  const teams = new Map<string, { games: number; totals: Record<TeamSharePositionGroup, number> }>();
  for (const gameRows of selectedGames) {
    const team = String(gameRows[0]?.Team ?? "");
    const teamTotal = gameRows.reduce((sum, row) => sum + finite(row[field]), 0);
    if (!team || teamTotal <= 0) continue;

    const shares = emptyValues();
    for (const row of gameRows) {
      const number = starterNumber(row.Number);
      const group = positionGroup(row.Position, number);
      if (!group) continue;
      shares[group] += (finite(row[field]) / teamTotal) * 100;
    }

    const bucket = teams.get(team) ?? { games: 0, totals: emptyValues() };
    bucket.games += 1;
    for (const group of TEAM_SHARE_POSITION_GROUPS) bucket.totals[group] += shares[group];
    teams.set(team, bucket);
  }

  return [...teams.entries()].map(([team, bucket]) => ({
    team,
    games: bucket.games,
    values: Object.fromEntries(
      TEAM_SHARE_POSITION_GROUPS.map((group) => [group, bucket.games > 0 ? bucket.totals[group] / bucket.games : 0])
    ) as Record<TeamSharePositionGroup, number>,
  })).sort((left, right) => left.team.localeCompare(right.team));
}

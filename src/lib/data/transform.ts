import type { PlayerStat, TeamStat } from "./types";
import { mean, median, min, max, percentileRank } from "./stats";
import { TEAM_STATS } from "./constants";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value
      .trim()
      .replace(/,/g, "")
      .replace(/%$/, "")
      .replace(/s$/, "");
    if (!cleaned || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasPositiveMinutes(row: PlayerStat): boolean {
  const mins = toFiniteNumber(row["Mins Played"]);
  return mins !== null && mins > 0;
}

function isFinalsGame(row: PlayerStat): boolean {
  if (row.Round >= 28) return true;
  const roundLabel = (row.Round_Label ?? "").toString().toUpperCase();
  return roundLabel === "GF" || roundLabel.startsWith("FW") || roundLabel.includes("FINAL");
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Filter rows by position. Pass "All" to skip. */
export function filterByPosition(
  rows: PlayerStat[],
  position: string
): PlayerStat[] {
  if (position === "All") return rows;
  return rows.filter((r) => r.Position === position);
}

/** Filter rows by minutes threshold */
export function filterByMinutes(
  rows: PlayerStat[],
  threshold: number,
  mode: "All" | "Over" | "Under"
): PlayerStat[] {
  const withMinutes = rows.filter(hasPositiveMinutes);
  if (mode === "All" || threshold === 0) return withMinutes;
  if (mode === "Over") {
    return withMinutes.filter((r) => (toFiniteNumber(r["Mins Played"]) ?? 0) >= threshold);
  }
  return withMinutes.filter((r) => (toFiniteNumber(r["Mins Played"]) ?? 0) <= threshold);
}

/** Filter rows by year(s) */
export function filterByYear(
  rows: PlayerStat[],
  years: string[]
): PlayerStat[] {
  if (years.length === 0) return rows.filter(hasPositiveMinutes);
  const set = new Set(years);
  return rows.filter((r) => set.has(r.Year) && hasPositiveMinutes(r));
}

/** Filter rows by finals flag */
export function filterByFinals(
  rows: PlayerStat[],
  mode: "All" | "Yes" | "No"
): PlayerStat[] {
  if (mode === "All") return rows;
  return rows.filter((row) => (mode === "Yes" ? isFinalsGame(row) : !isFinalsGame(row)));
}

// ---------------------------------------------------------------------------
// Teammate filtering (inner/anti join on Team+Round+Year)
// ---------------------------------------------------------------------------

/**
 * Filter a player's rows to only games where they played with/without a teammate.
 * Mirrors Python _filter_by_teammate().
 */
export function filterByTeammate(
  playerRows: PlayerStat[],
  teammateName: string,
  withTeammate: boolean,
  lookupDf: PlayerStat[],
  teammatePosition: string = "All"
): PlayerStat[] {
  if (teammateName === "None") return playerRows;

  // Build set of Team+Round+Year combos where teammate played
  const teammateGames = new Set<string>();
  for (const row of lookupDf) {
    const positionMatch = teammatePosition === "All" || row.Position === teammatePosition;
    if (row.Name === teammateName && positionMatch) {
      teammateGames.add(`${row.Team}|${row.Round}|${row.Year}`);
    }
  }

  return playerRows.filter((row) => {
    const key = `${row.Team}|${row.Round}|${row.Year}`;
    return withTeammate ? teammateGames.has(key) : !teammateGames.has(key);
  });
}

/** Get teammate options for a given player */
export function getTeammateOptions(
  playerName: string,
  sourceDf: PlayerStat[],
  fantasyRank: Map<string, number>
): string[] {
  const teams = new Set(
    sourceDf.filter((r) => r.Name === playerName).map((r) => r.Team)
  );
  const teammates = new Set<string>();
  for (const r of sourceDf) {
    if (teams.has(r.Team) && r.Name !== playerName) {
      teammates.add(r.Name);
    }
  }
  return [...teammates].sort((a, b) => {
    const rankA = -(fantasyRank.get(a) ?? -Infinity);
    const rankB = -(fantasyRank.get(b) ?? -Infinity);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

export interface SummaryRow {
  label: string;
  stat: string;
  avg: number;
  med: number;
  min: number;
  max: number;
}

export function computeSummary(
  name: string,
  rows: PlayerStat[],
  stats: string[]
): SummaryRow[] {
  return stats.map((stat) => {
    const values = rows
      .map((r) => toFiniteNumber(r[stat]))
      .filter((v): v is number => v !== null);
    return {
      label: name,
      stat,
      avg: mean(values),
      med: median(values),
      min: min(values),
      max: max(values),
    };
  });
}

// ---------------------------------------------------------------------------
// Percentile rank across all players/teams
// ---------------------------------------------------------------------------

export interface PercentileResult {
  entity: string;
  stat: string;
  value: number;
  percentile: number;
  rank: number;
  total: number;
}

export function computePercentileRanks(
  name: string,
  entityRows: PlayerStat[],
  allRows: PlayerStat[],
  stats: string[],
  groupCol: "Name" | "Team" = "Name"
): PercentileResult[] {
  // Compute proper averages by entity
  const entitySums = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const row of allRows) {
    const key = row[groupCol] as string;
    if (!entitySums.has(key)) entitySums.set(key, new Map());
    const m = entitySums.get(key)!;
    for (const stat of stats) {
      const val = toFiniteNumber(row[stat]);
      if (val === null) continue;
      const e = m.get(stat) ?? { sum: 0, count: 0 };
      e.sum += val;
      e.count++;
      m.set(stat, e);
    }
  }

  const entityAvgs = new Map<string, Map<string, number>>();
  for (const [key, statsMap] of entitySums) {
    const avgs = new Map<string, number>();
    for (const [stat, { sum, count }] of statsMap) {
      avgs.set(stat, sum / count);
    }
    entityAvgs.set(key, avgs);
  }

  // Compute entity's average
  const entityValues = entityRows
    .filter((r) => r[groupCol] === name);

  const results: PercentileResult[] = [];
  for (const stat of stats) {
    const vals = entityValues
      .map((r) => toFiniteNumber(r[stat]))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) continue;

    const playerAvg = mean(vals);
    const allAvgs: number[] = [];
    for (const avgs of entityAvgs.values()) {
      const avg = avgs.get(stat);
      if (avg !== undefined) allAvgs.push(avg);
    }

    const ranked = [...entityAvgs.entries()]
      .map(([entity, avgs]) => ({
        entity,
        avg: avgs.get(stat),
      }))
      .filter((row): row is { entity: string; avg: number } => row.avg !== undefined)
      .sort((a, b) => {
        if (b.avg !== a.avg) return b.avg - a.avg;
        return a.entity.localeCompare(b.entity);
      });

    const total = ranked.length;
    const rankIdx = ranked.findIndex((row) => row.entity === name);
    if (rankIdx === -1 || total === 0) continue;
    const rank = rankIdx + 1;

    results.push({
      entity: name,
      stat,
      value: playerAvg,
      percentile: percentileRank(playerAvg, allAvgs),
      rank,
      total,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Recent form (last 5 games)
// ---------------------------------------------------------------------------

export interface RecentFormResult {
  entity: string;
  stat: string;
  last5Avg: number;
  overallAvg: number;
  pctChange: number;
}

export function computeRecentForm(
  name: string,
  rows: PlayerStat[],
  stats: string[]
): RecentFormResult[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.Year !== b.Year) return b.Year.localeCompare(a.Year);
    return (b.Round ?? 0) - (a.Round ?? 0);
  });

  return stats.map((stat) => {
    const allVals = rows
      .map((r) => toFiniteNumber(r[stat]))
      .filter((v): v is number => v !== null);
    const last5Vals = sorted
      .slice(0, 5)
      .map((r) => toFiniteNumber(r[stat]))
      .filter((v): v is number => v !== null);

    const overallAvg = mean(allVals);
    const last5Avg = mean(last5Vals);
    const pctChange = overallAvg !== 0
      ? ((last5Avg - overallAvg) / Math.abs(overallAvg)) * 100
      : 0;

    return { entity: name, stat, last5Avg, overallAvg, pctChange };
  });
}

// ---------------------------------------------------------------------------
// Round plot data (group by round, mean per round)
// ---------------------------------------------------------------------------

export interface RoundDataPoint {
  round: number;
  roundLabel: string;
  value: number;
  opponent: string | null;
}

export function computeRoundData(
  rows: PlayerStat[],
  stat: string
): RoundDataPoint[] {
  const groups = new Map<number, { label: string; values: number[]; opponents: Set<string> }>();

  for (const row of rows) {
    if (row.Round == null) continue;
    const val = toFiniteNumber(row[stat]);
    if (val === null) continue;

    if (!groups.has(row.Round)) {
      groups.set(row.Round, { label: row.Round_Label, values: [], opponents: new Set() });
    }
    const group = groups.get(row.Round)!;
    group.values.push(val);
    if (row.Opponent) {
      group.opponents.add(row.Opponent);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, { label, values, opponents }]) => ({
      round,
      roundLabel: label,
      value: mean(values),
      opponent:
        opponents.size === 0
          ? null
          : opponents.size === 1
          ? [...opponents][0]
          : [...opponents].join(" / "),
    }));
}

// ---------------------------------------------------------------------------
// Team aggregation from player stats
// ---------------------------------------------------------------------------

export function aggregateTeamStats(playerRows: PlayerStat[]): TeamStat[] {
  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    {
      team: string;
      year: string;
      round: number;
      roundLabel: string;
      opponent: string | null;
      sums: Record<string, number>;
    }
  >();

  for (const row of playerRows) {
    if (!hasPositiveMinutes(row)) continue;

    const key = `${row.Team}|${row.Round}|${row.Year}`;
    if (!groups.has(key)) {
      groups.set(key, {
        team: row.Team,
        year: row.Year,
        round: row.Round,
        roundLabel: row.Round_Label,
        opponent: row.Opponent,
        sums: {},
      });
    }
    const g = groups.get(key)!;
    for (const stat of TEAM_STATS) {
      const val = toFiniteNumber(row[stat]);
      if (val !== null) {
        g.sums[stat] = (g.sums[stat] ?? 0) + val;
      }
    }
  }

  return [...groups.values()].map((g) => ({
    Team: g.team as TeamStat["Team"],
    Year: g.year,
    Round: g.round,
    Round_Label: g.roundLabel,
    Opponent: g.opponent,
    ...Object.fromEntries(
      TEAM_STATS.map((s) => [s, g.sums[s] ?? 0])
    ),
  })) as TeamStat[];
}

// ---------------------------------------------------------------------------
// Fantasy rank map
// ---------------------------------------------------------------------------

export function buildFantasyRank(rows: PlayerStat[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const val = toFiniteNumber(row.Fantasy);
    if (val === null) continue;
    const e = sums.get(row.Name) ?? { total: 0, count: 0 };
    e.total += val;
    e.count++;
    sums.set(row.Name, e);
  }
  const result = new Map<string, number>();
  for (const [name, { total, count }] of sums) {
    result.set(name, total / count);
  }
  return result;
}

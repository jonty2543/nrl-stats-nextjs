export type PlayerStatsTableGroupBy = "Player" | "Year + Player" | "Team + Player" | "Position + Player";
export type TeamStatsTableGroupBy = "Team" | "Year + Team";

export interface StatsTableAggregateRow {
  key: string;
  year: string | null;
  games: number;
  averages: Record<string, number | null>;
  totals: Record<string, number | null>;
}

export interface PlayerStatsTableAggregateRow extends StatsTableAggregateRow {
  name: string;
  team: string | null;
  position: string | null;
}

export interface TeamStatsTableAggregateRow extends StatsTableAggregateRow {
  team: string;
}

export interface StatsTableFilterOptions {
  teams: string[];
  positions: string[];
}

export interface StatsTableApiResponse<Row> {
  rows: Row[];
  updatedAt: string | null;
  source: "cache" | "fallback";
  filterOptions: StatsTableFilterOptions;
}

export const BETTING_BOOKIE_COLUMNS = [
  "Sportsbet",
  "Pointsbet",
  "Unibet",
  "Palmerbet",
  "Betright",
] as const;

export type BettingBookie = (typeof BETTING_BOOKIE_COLUMNS)[number];
export type BettingOddsTable = "NRL Odds" | "NRL Line Odds" | "NRL Total Odds";
export type BettingMarket = "H2H" | "Line" | "Total";

export interface BettingOddsRow {
  table: BettingOddsTable;
  market: BettingMarket;
  date: string;
  match: string;
  result: string;
  value: number | null;
  model: number | null;
  bestBookie: string | null;
  bestPrice: number | null;
  marketPercentage: number | null;
  Sportsbet: number | null;
  Pointsbet: number | null;
  Unibet: number | null;
  Palmerbet: number | null;
  Betright: number | null;
  Betr: number | null;
}

export interface BettingOddsSnapshot {
  h2h: BettingOddsRow[];
  line: BettingOddsRow[];
  total: BettingOddsRow[];
  generatedAt: string;
}

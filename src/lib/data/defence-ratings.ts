import type { TeamStat } from "@/lib/data/types";
import type { PostMatchTeamMetric } from "@/lib/data/post-match-team-metrics";

export type DefencePlotMode = "games" | "season";

export interface DefenceRatingPoint {
  id: string;
  team: string;
  year: string;
  roundLabel: string;
  opponent: string | null;
  games: number;
  contactRating: number;
  defenseRating: number;
  expectedLineBreaks: number;
  actualLineBreaks: number;
}

interface RawDefencePoint extends Omit<DefenceRatingPoint, "defenseRating"> {
  lineBreaksPrevented: number;
  contactDisruptions: number;
  opponentRuns: number;
}

const FEATURE_KEYS = [
  "Tackle Breaks",
  "Offloads",
  "All Runs",
  "Play The Ball",
  "Possession %",
  "Completion Rate",
] as const satisfies readonly (keyof TeamStat)[];

function finite(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalise(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOrder(label: string): number {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function latestDefenceGames<T extends Pick<DefenceRatingPoint, "team" | "year" | "roundLabel">>(points: T[], gameWindow: 3 | 5 | 10 | null): T[] {
  if (gameWindow === null) return points;
  const groups = new Map<string, T[]>();
  for (const point of points) {
    const key = `${point.year}|${normalise(point.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  return [...groups.values()].flatMap((teamPoints) =>
    [...teamPoints].sort((left, right) => roundOrder(left.roundLabel) - roundOrder(right.roundLabel)).slice(-gameWindow)
  );
}

function standardDeviation(values: number[], average = mean(values)): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    for (let cell = column; cell <= size; cell += 1) augmented[column][cell] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let cell = column; cell <= size; cell += 1) {
        augmented[row][cell] -= factor * augmented[column][cell];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function fitExpectedLineBreaks(rows: TeamStat[]): (row: TeamStat) => number {
  const featureMeans = FEATURE_KEYS.map((key) => mean(rows.map((row) => finite(row[key]))));
  const featureSds = FEATURE_KEYS.map((key, index) =>
    standardDeviation(rows.map((row) => finite(row[key])), featureMeans[index]) || 1
  );
  const features = rows.map((row) => [
    1,
    ...FEATURE_KEYS.map((key, index) => (finite(row[key]) - featureMeans[index]) / featureSds[index]),
  ]);
  const outcomes = rows.map((row) => Math.max(0, finite(row["Line Breaks"])));
  let coefficients = [Math.log(Math.max(mean(outcomes), 0.1)), ...FEATURE_KEYS.map(() => 0)];

  // Poisson regression via iteratively reweighted least squares.
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const size = coefficients.length;
    const matrix = Array.from({ length: size }, () => Array(size).fill(0));
    const vector = Array(size).fill(0);

    for (let rowIndex = 0; rowIndex < features.length; rowIndex += 1) {
      const x = features[rowIndex];
      const eta = Math.max(-8, Math.min(8, x.reduce((sum, value, index) => sum + value * coefficients[index], 0)));
      const fitted = Math.max(Math.exp(eta), 0.001);
      const adjusted = eta + (outcomes[rowIndex] - fitted) / fitted;
      for (let i = 0; i < size; i += 1) {
        vector[i] += fitted * x[i] * adjusted;
        for (let j = 0; j < size; j += 1) matrix[i][j] += fitted * x[i] * x[j];
      }
    }

    for (let index = 1; index < coefficients.length; index += 1) matrix[index][index] += 1e-5;
    const next = solveLinearSystem(matrix, vector);
    if (!next) break;
    const change = Math.max(...next.map((value, index) => Math.abs(value - coefficients[index])));
    coefficients = next;
    if (change < 1e-7) break;
  }

  return (row) => {
    const x = [
      1,
      ...FEATURE_KEYS.map((key, index) => (finite(row[key]) - featureMeans[index]) / featureSds[index]),
    ];
    const eta = Math.max(-8, Math.min(8, x.reduce((sum, value, index) => sum + value * coefficients[index], 0)));
    return Math.exp(eta);
  };
}

function opponentRowFor(row: TeamStat, rows: TeamStat[]): TeamStat | null {
  const opponent = normalise(row.Opponent);
  const team = normalise(row.Team);
  return rows.find((candidate) =>
    candidate.Year === row.Year &&
    candidate.Round === row.Round &&
    candidate.Date === row.Date &&
    normalise(candidate.Team) === opponent &&
    normalise(candidate.Opponent) === team
  ) ?? null;
}

function standardise(points: RawDefencePoint[]): DefenceRatingPoint[] {
  const prevented = points.map((point) => point.lineBreaksPrevented);
  const leagueMean = mean(prevented);
  const leagueSd = standardDeviation(prevented, leagueMean) || 1;
  return points.map((point) => ({
    id: point.id,
    team: point.team,
    year: point.year,
    roundLabel: point.roundLabel,
    opponent: point.opponent,
    games: point.games,
    contactRating: point.contactRating,
    expectedLineBreaks: point.expectedLineBreaks,
    actualLineBreaks: point.actualLineBreaks,
    defenseRating: 50 + 10 * ((point.lineBreaksPrevented - leagueMean) / leagueSd),
  }));
}

function buildDefenceRatingPointsFromMetrics(
  metrics: PostMatchTeamMetric[],
  mode: DefencePlotMode,
  gameWindow: 3 | 5 | 10 | null
): DefenceRatingPoint[] {
  const allGames = metrics.flatMap((metric): DefenceRatingPoint[] => {
    if (metric.contactDisruptionsPer100Runs == null || metric.defenseRating == null) return [];
    return [{
      id: `${metric.url}|${metric.team}|defence`,
      team: metric.team,
      year: String(metric.season),
      roundLabel: metric.round ?? "Match",
      opponent: metric.opponentTeam,
      games: 1,
      contactRating: metric.contactDisruptionsPer100Runs,
      defenseRating: metric.defenseRating,
      expectedLineBreaks: metric.expectedLineBreaksAllowed ?? 0,
      actualLineBreaks: metric.actualLineBreaksAllowed ?? 0,
    }];
  });
  const games = latestDefenceGames(allGames, gameWindow);

  if (mode === "games") return games;

  const groups = new Map<string, DefenceRatingPoint[]>();
  for (const point of games) {
    const key = `${point.year}|${normalise(point.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  return [...groups.values()].map((points) => ({
    id: `${points[0].year}-${points[0].team}-defence`,
    team: points[0].team,
    year: points[0].year,
    roundLabel: "Season",
    opponent: null,
    games: points.length,
    contactRating: mean(points.map((point) => point.contactRating)),
    defenseRating: mean(points.map((point) => point.defenseRating)),
    expectedLineBreaks: points.reduce((sum, point) => sum + point.expectedLineBreaks, 0),
    actualLineBreaks: points.reduce((sum, point) => sum + point.actualLineBreaks, 0),
  })).sort((left, right) => left.team.localeCompare(right.team));
}

export function buildDefenceRatingPoints(
  rows: TeamStat[],
  mode: DefencePlotMode,
  metrics: PostMatchTeamMetric[] = [],
  gameWindow: 3 | 5 | 10 | null = null
): DefenceRatingPoint[] {
  const sourcedPoints = buildDefenceRatingPointsFromMetrics(metrics, mode, gameWindow);
  if (sourcedPoints.length > 0) return sourcedPoints;
  if (rows.length === 0) return [];
  const expectedLineBreaks = fitExpectedLineBreaks(rows);
  const gamePoints: RawDefencePoint[] = [];

  for (const row of rows) {
    const opponent = opponentRowFor(row, rows);
    if (!opponent) continue;
    const opponentRuns = finite(opponent["All Runs"]);
    if (opponentRuns <= 0) continue;
    const expected = expectedLineBreaks(opponent);
    const actual = finite(opponent["Line Breaks"]);
    const contactDisruptions = finite(opponent["Tackle Breaks"]) + finite(opponent.Offloads);
    gamePoints.push({
      id: `${row.Year}-${row.Date}-${row.Team}`,
      team: row.Team,
      year: row.Year,
      roundLabel: row.Round_Label || String(row.Round),
      opponent: row.Opponent,
      games: 1,
      contactRating: (contactDisruptions / opponentRuns) * 100,
      expectedLineBreaks: expected,
      actualLineBreaks: actual,
      lineBreaksPrevented: expected - actual,
      contactDisruptions,
      opponentRuns,
    });
  }

  const filteredGamePoints = latestDefenceGames(gamePoints, gameWindow);
  if (mode === "games") return standardise(filteredGamePoints);

  const groups = new Map<string, RawDefencePoint[]>();
  for (const point of filteredGamePoints) {
    const key = `${point.year}|${normalise(point.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  const seasons = [...groups.values()].map((points): RawDefencePoint => {
    const totalRuns = points.reduce((sum, point) => sum + point.opponentRuns, 0);
    const totalDisruptions = points.reduce((sum, point) => sum + point.contactDisruptions, 0);
    const expected = points.reduce((sum, point) => sum + point.expectedLineBreaks, 0);
    const actual = points.reduce((sum, point) => sum + point.actualLineBreaks, 0);
    return {
      id: `${points[0].year}-${points[0].team}`,
      team: points[0].team,
      year: points[0].year,
      roundLabel: "Season",
      opponent: null,
      games: points.length,
      contactRating: totalRuns > 0 ? (totalDisruptions / totalRuns) * 100 : 0,
      expectedLineBreaks: expected,
      actualLineBreaks: actual,
      lineBreaksPrevented: expected - actual,
      contactDisruptions: totalDisruptions,
      opponentRuns: totalRuns,
    };
  });

  return standardise(seasons).sort((left, right) => left.team.localeCompare(right.team));
}

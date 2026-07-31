import type { DefencePlotMode } from "@/lib/data/defence-ratings";

export interface PostMatchTeamMetric {
  url: string;
  team: string;
  matchDate: string;
  season: number;
  round: string | null;
  opponentTeam: string | null;
  isHome: boolean | null;
  actualPoints: number | null;
  opponentActualPoints: number | null;
  xpoints: number | null;
  opponentXpoints: number | null;
  xpointsMargin: number | null;
  finishingDelta: number | null;
  contactDisruptionsPer100Runs: number | null;
  expectedLineBreaksAllowed: number | null;
  actualLineBreaksAllowed: number | null;
  lineBreaksPrevented: number | null;
  coverDefenseRating: number | null;
  ruckDominanceRating: number | null;
  xpointsModelVersion: string | null;
  coverModelVersion: string | null;
  rdrModelVersion: string | null;
  pipelineVersion: string | null;
  sourceUpdatedAt: string | null;
  calculatedAt: string;
  inputHash: string | null;
}

export interface PostMatchRdrMetric {
  url: string;
  team: string;
  middleRuns: number | null;
  edgeRuns: number | null;
  spineRuns: number | null;
  outsideBackRuns: number | null;
  benchRuns: number | null;
  unclassifiedRuns: number | null;
  positionRunsTotal: number | null;
  positionRunsDifference: number | null;
  hitUpShare: number | null;
  opponentPcmAllowedPerRunPreMatch: number | null;
  opponentPtbAllowedPreMatch: number | null;
  actualPostContactMetres: number | null;
  expectedPostContactMetres: number | null;
  postContactMetresAboveExpected: number | null;
  pcmAboveExpectedPer100Runs: number | null;
  actualPlayTheBallSpeed: number | null;
  expectedPlayTheBallSpeed: number | null;
  playTheBallSpeedAboveExpected: number | null;
  ruckDominanceRating: number | null;
  modelVersion: string | null;
  sourceUpdatedAt: string | null;
  calculatedAt: string | null;
  inputHash: string | null;
}

export interface PostMatchTeamMetricWithRdr extends PostMatchTeamMetric {
  rdr: PostMatchRdrMetric | null;
}

export interface XPointsPlotPoint {
  id: string;
  team: string;
  year: string;
  roundLabel: string;
  opponent: string | null;
  games: number;
  xValue: number;
  yValue: number;
  performanceDelta: number;
}

export type XPointsPerspective = "attack" | "defense";

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function latestTeamMetrics(metrics: PostMatchTeamMetric[], gameWindow: 5 | 10 | null): PostMatchTeamMetric[] {
  if (gameWindow === null) return metrics;
  const groups = new Map<string, PostMatchTeamMetric[]>();
  for (const metric of metrics) {
    const key = `${metric.season}|${normalise(metric.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), metric]);
  }
  return [...groups.values()].flatMap((teamMetrics) =>
    [...teamMetrics].sort((left, right) => left.matchDate.localeCompare(right.matchDate)).slice(-gameWindow)
  );
}

export function buildXPointsPlotPoints(
  metrics: PostMatchTeamMetric[],
  mode: DefencePlotMode,
  perspective: XPointsPerspective,
  gameWindow: 5 | 10 | null = null
): XPointsPlotPoint[] {
  const games = latestTeamMetrics(metrics, gameWindow).flatMap((metric): XPointsPlotPoint[] => {
    const expected = perspective === "attack" ? metric.xpoints : metric.opponentXpoints;
    const actual = perspective === "attack" ? metric.actualPoints : metric.opponentActualPoints;
    if (expected == null || actual == null) return [];
    return [{
      id: `${metric.url}|${metric.team}|xpoints-${perspective}`,
      team: metric.team,
      year: String(metric.season),
      roundLabel: metric.round ?? "Match",
      opponent: metric.opponentTeam,
      games: 1,
      xValue: perspective === "attack" ? expected : actual,
      yValue: perspective === "attack" ? actual : expected,
      performanceDelta: perspective === "attack"
        ? metric.finishingDelta ?? actual - expected
        : expected - actual,
    }];
  });

  if (mode === "games") return games;

  const groups = new Map<string, XPointsPlotPoint[]>();
  for (const point of games) {
    const key = `${point.year}|${normalise(point.team)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  return [...groups.values()].map((points) => ({
    id: `${points[0].year}-${points[0].team}-xpoints-${perspective}`,
    team: points[0].team,
    year: points[0].year,
    roundLabel: "Season",
    opponent: null,
    games: points.length,
    xValue: mean(points.map((point) => point.xValue)),
    yValue: mean(points.map((point) => point.yValue)),
    performanceDelta: mean(points.map((point) => point.performanceDelta)),
  })).sort((left, right) => left.team.localeCompare(right.team));
}

import type { BettingMarket, BettingOddsRow } from "@/lib/betting/types";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026";
import type { Draw2026Data } from "@/lib/draw/types";
import {
  filterByFinals,
  filterByMinutes,
  filterByPosition,
  filterByTeammate,
} from "@/lib/data/transform";
import {
  applyFantasyBreakEvenOffset,
  applyFantasyProjectionOffset,
  buildFantasyOwnershipDeltaByPlayerId,
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
  getFantasyCoachRoundMetrics,
  getTopFantasyOwnershipRise,
} from "@/lib/fantasy/nrl";
import {
  fetchAvailableYears,
  fetchBettingOddsSnapshot,
  fetchMatches,
  fetchPlayerImages,
  fetchPlayerStats,
  fetchTeammateLookupRows,
  fetchTeamStats,
} from "@/lib/supabase/queries";
import { hasAiBettingModelAccess, hasAiPlotAccess, hasAiPremiumDataAccess, hasAiProDataAccess } from "@/lib/ai/access";
import { CAPABILITY_AI_TOOLS } from "@/lib/ai/tools/capabilities";
import type {
  AiTool,
  AiToolAccessPolicy,
  AiToolDefinition,
  AiToolExecutionFailure,
  AiToolExecutionResult,
} from "@/lib/ai/tools/types";

const MAX_YEARS = 6;
const MAX_STAT_KEYS = 8;
const MAX_ENTITY_IDS = 4;
const MAX_RESULT_ROWS = 40;
const MAX_SUGGESTIONS = 5;
const MAX_CHART_POINTS = 24;
const MAX_FANTASY_PLAYERS = 80;
const NAME_TOKEN_ALIASES: Record<string, string[]> = {
  tom: ["thomas"],
  thomas: ["tom"],
  matt: ["matthew"],
  matthew: ["matt"],
  josh: ["joshua"],
  joshua: ["josh"],
  will: ["william"],
  william: ["will"],
};

const PLAYER_DIMENSION_KEYS = new Set([
  "Name",
  "Team",
  "Number",
  "Position",
  "Year",
  "Round",
  "Round_Label",
  "Opponent",
  "Home Team",
  "Away Team",
]);

const TEAM_DIMENSION_KEYS = new Set([
  "Team",
  "Year",
  "Round",
  "Round_Label",
  "Opponent",
]);

const DEFAULT_PLAYER_STAT_KEYS = ["Fantasy", "Mins Played", "Tries", "Try Assists"];
const DEFAULT_TEAM_STAT_KEYS = ["Points", "Tries", "Line Breaks", "Tackles Made"];
const DEFAULT_COMPARE_STAT_KEYS = ["Fantasy", "Mins Played", "Tries"];
const SUPPORTED_CHART_TYPES = ["line", "bar", "table"] as const;
const SUPPORTED_ENTITY_TYPES = ["player", "team"] as const;
const SUPPORTED_BETTING_MARKETS = ["H2H", "Line", "Total", "Tryscorer"] as const;
const PRO_ONLY_PLAYER_STAT_PATTERNS = [/breakeven/i, /\bbev?\b/i, /projection/i, /projected/i];
const FANTASY_MAJOR_BYE_ROUNDS = [12, 15, 18] as const;

const BASE_FANTASY_RATIO_DEFINITION = [
  "floor(All Run Metres / 10)",
  "Tackles Made",
  "floor(Kicking Metres / 30)",
  "Conversions * 2",
] as const;
const PLAYER_STAT_FILTERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "opponent",
    "position",
    "finals",
    "minutesOver",
    "minutesUnder",
    "teammate",
    "teammatePosition",
    "withWithout",
  ],
  properties: {
    opponent: { type: ["string", "null"] },
    position: { type: ["string", "null"] },
    finals: {
      anyOf: [
        {
          type: "string",
          enum: ["Yes", "No"],
        },
        { type: "null" },
      ],
    },
    minutesOver: { type: ["number", "null"] },
    minutesUnder: { type: ["number", "null"] },
    teammate: { type: ["string", "null"] },
    teammatePosition: { type: ["string", "null"] },
    withWithout: {
      anyOf: [
        {
          type: "string",
          enum: ["with", "without"],
        },
        { type: "null" },
      ],
    },
  },
} as const;

type SupportedChartType = (typeof SUPPORTED_CHART_TYPES)[number];
type SupportedChartEntityType = (typeof SUPPORTED_ENTITY_TYPES)[number];
type PlayerRankingAggregation = "avg" | "max" | "total";
type PlayerRankingRateBasis = "per_game" | "per_80";

interface PlayerStatsInput {
  player: string;
  years?: string[];
  statKeys?: string[];
  filters?: PlayerStatFiltersInput | null;
}

interface TeamStatsInput {
  team: string;
  years?: string[];
  statKeys?: string[];
}

interface TeamHomeAwayWinRatesInput {
  team?: string;
  years?: string[];
  limit?: number;
  sortOrder?: "asc" | "desc";
}

interface TeamPossessionBattleRecordsInput {
  team?: string;
  years?: string[];
  limit?: number;
  sortOrder?: "asc" | "desc";
}

interface TeamShortTurnaroundRecordsInput {
  team?: string;
  years?: string[];
  maxDays?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

interface PlayerTeamStatShareInput {
  team?: string;
  years?: string[];
  playerStatKeys?: string[];
  teamStatKey: string;
  minSharePercent?: number | null;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

interface PlayerBaseFantasyRatioInput {
  years?: string[];
  limit?: number;
  minGames?: number | null;
  position?: string | null;
}

interface PlayerStatFiltersInput {
  opponent?: string | null;
  position?: string | null;
  finals?: "Yes" | "No" | null;
  minutesOver?: number | null;
  minutesUnder?: number | null;
  teammate?: string | null;
  teammatePosition?: string | null;
  withWithout?: "with" | "without" | null;
}

interface OverallStatsInput {
  entityType?: SupportedChartEntityType;
  years?: string[];
  statKeys?: string[];
}

interface RankTeamsByStatInput {
  statKey: string;
  years?: string[];
  limit?: number;
  sortOrder?: "asc" | "desc";
}

interface RankPlayersByStatInput {
  statKey: string;
  years?: string[];
  limit?: number;
  sortOrder?: "asc" | "desc";
  aggregation?: PlayerRankingAggregation;
  rateBasis?: PlayerRankingRateBasis | null;
  minGames?: number | null;
  minAverageMinutes?: number | null;
  filters?: PlayerStatFiltersInput | null;
}

interface RankPlayersWhenTeamWinsPossessionInput {
  statKey: string;
  years?: string[];
  limit?: number;
  position?: string | null;
  minGames?: number | null;
}

interface BettingSnapshotInput {
  market?: BettingMarket;
  dateFrom?: string;
  dateTo?: string;
}

interface ComparePlayersInput {
  players: string[];
  stats?: string[];
  years?: string[];
}

interface ChartDatasetInput {
  chartType: SupportedChartType;
  entityType: SupportedChartEntityType;
  entityIds: string[];
  statKey: string;
  years?: string[];
}

interface FantasySnapshotInput {
  round?: number;
  playerNames?: string[];
  positions?: string[];
  priceMax?: number;
  sortBy?:
    | "ownership_delta_desc"
    | "ownership_delta_asc"
    | "avg_points_desc"
    | "projected_avg_desc"
    | "projection_desc"
    | "projection_vs_priced_at_desc"
    | "price_asc";
  requireOwnershipRise?: boolean;
  excludeLocked?: boolean;
  limit?: number;
}

type CanonicalNameResolution =
  | {
      ok: true;
      name: string;
    }
  | {
      ok: false;
      error: string;
      suggestions?: string[];
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeLooseSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}

function normalizeCompactSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function parseNameParts(value: string): { first: string; last: string } {
  const tokens = normalizeLooseSearchValue(value).split(" ").filter(Boolean);
  return {
    first: tokens[0] ?? "",
    last: tokens[tokens.length - 1] ?? "",
  };
}

function getLastSearchToken(value: string): string {
  const tokens = normalizeSearchValue(value).split(" ").filter(Boolean);
  return tokens[tokens.length - 1] ?? "";
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = new Array<number>(right.length + 1)
    .fill(0)
    .map((_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const nextDiagonal = previous[rightIndex] ?? 0;
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      previous[rightIndex] = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + 1,
        diagonal + substitutionCost
      );

      diagonal = nextDiagonal;
    }
  }

  return previous[right.length] ?? Number.MAX_SAFE_INTEGER;
}

type CanonicalCandidateScore = {
  candidate: string;
  distance: number;
  lastNameExact: boolean;
};

function scoreCanonicalCandidates(candidates: string[], searchValue: string): CanonicalCandidateScore[] {
  const queryVariants = expandNameVariants(searchValue);

  return dedupeStrings(candidates)
    .map((candidate) => {
      const candidateCompact = normalizeCompactSearchValue(candidate);
      const candidateLastToken = getLastSearchToken(candidate);
      let bestDistance = Number.MAX_SAFE_INTEGER;
      let hasExactLastName = false;

      queryVariants.forEach((variant) => {
        const distance = levenshteinDistance(
          normalizeCompactSearchValue(variant),
          candidateCompact
        );
        if (distance < bestDistance) {
          bestDistance = distance;
        }

        if (
          candidateLastToken.length > 0 &&
          getLastSearchToken(variant) === candidateLastToken
        ) {
          hasExactLastName = true;
        }
      });

      return {
        candidate,
        distance: bestDistance,
        lastNameExact: hasExactLastName,
      };
    })
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      if (left.lastNameExact !== right.lastNameExact) {
        return left.lastNameExact ? -1 : 1;
      }
      return left.candidate.localeCompare(right.candidate);
    });
}

function expandNameVariants(value: string): string[] {
  const normalized = normalizeSearchValue(value);
  const tokens = normalized.split(" ").filter(Boolean);
  const variants = new Set<string>([normalized]);

  tokens.forEach((token, index) => {
    const aliases = NAME_TOKEN_ALIASES[token] ?? [];
    aliases.forEach((alias) => {
      const nextTokens = [...tokens];
      nextTokens[index] = alias;
      variants.add(nextTokens.join(" "));
    });
  });

  return [...variants];
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseRequiredString(record: Record<string, unknown>, fieldName: string): string {
  const value = record[fieldName];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalString(record: Record<string, unknown>, fieldName: string): string | undefined {
  const value = record[fieldName];
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  return value.trim();
}

function parseOptionalStringArray(
  record: Record<string, unknown>,
  fieldName: string,
  maxItems: number
): string[] | undefined {
  const value = record[fieldName];
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  const items = dedupeStrings(
    value.map((item) => {
      if (typeof item !== "string") {
        throw new Error(`${fieldName} must contain only strings.`);
      }

      return item;
    })
  );

  if (items.length > maxItems) {
    throw new Error(`${fieldName} supports at most ${maxItems} items.`);
  }

  return items.length > 0 ? items : undefined;
}

function parseOptionalInteger(record: Record<string, unknown>, fieldName: string): number | undefined {
  const value = record[fieldName];
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number.`);
  }

  return Math.trunc(value);
}

function parseEnumValue<T extends readonly string[]>(
  record: Record<string, unknown>,
  fieldName: string,
  allowed: T
): T[number] | undefined {
  const value = record[fieldName];
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const match = allowed.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
  if (!match) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }

  return match;
}

function parseRequiredEnumValue<T extends readonly string[]>(
  record: Record<string, unknown>,
  fieldName: string,
  allowed: T
): T[number] {
  const value = parseEnumValue(record, fieldName, allowed);
  if (!value) {
    throw new Error(`${fieldName} is required.`);
  }

  return value;
}

function buildError(error: string, suggestions?: string[]): AiToolExecutionFailure {
  return suggestions && suggestions.length > 0 ? { ok: false, error, suggestions } : { ok: false, error };
}

function isRestrictedPlayerStatKeyForPlan(statKey: string, access: AiToolAccessPolicy): boolean {
  if (hasAiProDataAccess(access.plan)) {
    return false;
  }

  return PRO_ONLY_PLAYER_STAT_PATTERNS.some((pattern) => pattern.test(statKey));
}

function filterPlayerStatKeysForAccess(
  statKeys: string[],
  access: AiToolAccessPolicy
): { allowed: string[]; restricted: string[] } {
  const allowed: string[] = [];
  const restricted: string[] = [];

  statKeys.forEach((statKey) => {
    if (isRestrictedPlayerStatKeyForPlan(statKey, access)) {
      restricted.push(statKey);
      return;
    }

    allowed.push(statKey);
  });

  return { allowed, restricted };
}

function buildPlayerAccessError(access: AiToolAccessPolicy): AiToolExecutionFailure {
  return buildError(
    hasAiPremiumDataAccess(access.plan)
      ? "This player data is not available in the current AI tier."
      : "Sign up to Pro to access projections and breakevens."
  );
}

function buildPlotAccessError(): AiToolExecutionFailure {
  return buildError("Sign up to Pro to access AI plots and charts.");
}

function ensureBettingAccess(
  access: AiToolAccessPolicy,
  market?: BettingMarket
): AiToolExecutionFailure | null {
  void access;
  void market;
  return null;
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function computeBaseFantasyPoints(row: Record<string, unknown>): number {
  const runMetres = typeof row["All Run Metres"] === "number" ? row["All Run Metres"] : 0;
  const tacklesMade = typeof row["Tackles Made"] === "number" ? row["Tackles Made"] : 0;
  const kickingMetres = typeof row["Kicking Metres"] === "number" ? row["Kicking Metres"] : 0;
  const conversions = typeof row.Conversions === "number" ? row.Conversions : 0;

  return (
    Math.floor(runMetres / 10) +
    tacklesMade +
    Math.floor(kickingMetres / 30) +
    conversions * 2
  );
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundToTwoDecimals(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function selectNumericStatKeys<T extends Record<string, unknown>>(
  rows: T[],
  dimensionKeys: Set<string>
): string[] {
  if (rows.length === 0) {
    return [];
  }

  const numericKeys = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (dimensionKeys.has(key) || numericKeys.has(key)) {
        return;
      }

      if (typeof row[key] === "number") {
        numericKeys.add(key);
      }
    });
  });

  return [...numericKeys];
}

function resolveRequestedStatKeys(
  requested: string[] | undefined,
  allowedKeys: string[],
  defaultKeys: string[]
): { selected: string[]; ignored: string[] } {
  const allowedMap = new Map(allowedKeys.map((key) => [normalizeSearchValue(key), key]));
  const selectedFromRequest = (requested ?? [])
    .map((key) => allowedMap.get(normalizeSearchValue(key)))
    .filter((key): key is string => typeof key === "string");
  const ignored = (requested ?? []).filter(
    (key) => !allowedMap.has(normalizeSearchValue(key))
  );

  const selected = dedupeStrings(
    (selectedFromRequest.length > 0 ? selectedFromRequest : defaultKeys.filter((key) => allowedMap.has(normalizeSearchValue(key))))
      .slice(0, MAX_STAT_KEYS)
  );

  return { selected, ignored };
}

function resolveCanonicalName(candidates: string[], searchValue: string): CanonicalNameResolution {
  const queryVariants = expandNameVariants(searchValue);
  const dedupedCandidates = dedupeStrings(candidates);
  const exactMatches = dedupedCandidates.filter(
    (candidate) => queryVariants.includes(normalizeSearchValue(candidate))
  );

  if (exactMatches.length === 1) {
    return { ok: true, name: exactMatches[0] };
  }

  const partialMatches = dedupedCandidates.filter((candidate) =>
    queryVariants.some((variant) => normalizeSearchValue(candidate).includes(variant))
  );

  if (partialMatches.length === 1) {
    return { ok: true, name: partialMatches[0] };
  }

  if (partialMatches.length > 1) {
    return {
      ok: false,
      error: `Multiple matches found for "${searchValue}". Refine the request.`,
      suggestions: partialMatches.slice(0, MAX_SUGGESTIONS),
    };
  }

  const fuzzyMatches = scoreCanonicalCandidates(dedupedCandidates, searchValue);
  const bestFuzzyMatch = fuzzyMatches[0];
  const secondFuzzyMatch = fuzzyMatches[1];
  const bestIsUnambiguous =
    !secondFuzzyMatch ||
    secondFuzzyMatch.distance > bestFuzzyMatch.distance ||
    (bestFuzzyMatch.lastNameExact && !secondFuzzyMatch.lastNameExact);

  if (
    bestFuzzyMatch &&
    bestIsUnambiguous &&
    (
      bestFuzzyMatch.distance <= 1 ||
      (bestFuzzyMatch.lastNameExact && bestFuzzyMatch.distance <= 2)
    )
  ) {
    return { ok: true, name: bestFuzzyMatch.candidate };
  }

  return {
    ok: false,
    error: `No match found for "${searchValue}".`,
    suggestions: fuzzyMatches
      .slice(0, MAX_SUGGESTIONS)
      .map((match) => match.candidate),
  };
}

function summariseStatBlock<T extends Record<string, unknown>>(rows: T[], statKeys: string[]) {
  return Object.fromEntries(
    statKeys.map((statKey) => {
      const values = rows
        .map((row) => row[statKey])
        .filter((value): value is number => typeof value === "number");

      return [
        statKey,
        {
          avg: average(values),
          min: values.length > 0 ? Math.min(...values) : null,
          max: values.length > 0 ? Math.max(...values) : null,
        },
      ];
    })
  );
}

function summariseStatTotals<T extends Record<string, unknown>>(rows: T[], statKeys: string[]) {
  return Object.fromEntries(
    statKeys.map((statKey) => {
      const total = rows
        .map((row) => row[statKey])
        .filter((value): value is number => typeof value === "number")
        .reduce((sum, value) => sum + value, 0);

      return [statKey, roundToTwoDecimals(total)];
    })
  );
}

function summariseStatBlockBySeason<T extends Record<string, unknown> & { Year: string }>(
  rows: T[],
  statKeys: string[]
) {
  const seasonMap = new Map<string, T[]>();

  rows.forEach((row) => {
    const bucket = seasonMap.get(row.Year);
    if (bucket) {
      bucket.push(row);
      return;
    }

    seasonMap.set(row.Year, [row]);
  });

  return [...seasonMap.entries()]
    .sort(([leftYear], [rightYear]) => leftYear.localeCompare(rightYear))
    .map(([year, seasonRows]) => ({
      year,
      rowCount: seasonRows.length,
      summary: {
        stats: summariseStatBlock(seasonRows, statKeys),
      },
    }));
}

function sortRowsBySeasonAndRound<T extends { Year: string; Round: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.Year !== b.Year) return a.Year.localeCompare(b.Year);
    return a.Round - b.Round;
  });
}

function normalizeOpponentValue(value: string | null | undefined): string {
  return normalizeSearchValue(String(value ?? "").replace(/-/g, " "));
}

function hasActivePlayerStatFilters(filters: PlayerStatFiltersInput | null | undefined): boolean {
  if (!filters) return false;

  return Boolean(
    (filters.opponent && filters.opponent !== "All Opponents") ||
      (filters.position && filters.position !== "All" && filters.position !== "All Positions") ||
      filters.finals ||
      (typeof filters.minutesOver === "number" && filters.minutesOver > 0) ||
      (typeof filters.minutesUnder === "number" && filters.minutesUnder > 0) ||
      (filters.teammate && filters.teammate !== "None")
  );
}

async function applyPlayerStatFilters(
  rows: PlayerStat[],
  filters: PlayerStatFiltersInput | null | undefined,
  years?: string[]
): Promise<PlayerStat[]> {
  if (!hasActivePlayerStatFilters(filters)) {
    return rows;
  }

  let nextRows = [...rows];

  nextRows = filterByFinals(nextRows, filters?.finals ?? "Yes");

  const positionFilter = filters?.position ?? "All Positions";
  if (positionFilter !== "All Positions" && positionFilter !== "All") {
    nextRows = filterByPosition(nextRows, positionFilter);
  }

  const opponentFilter = filters?.opponent ?? "All Opponents";
  if (opponentFilter !== "All Opponents") {
    const normalizedOpponent = normalizeOpponentValue(opponentFilter);
    nextRows = nextRows.filter(
      (row) => normalizeOpponentValue(row.Opponent) === normalizedOpponent
    );
  }

  nextRows = filterByMinutes(nextRows, 0, "All");

  const minutesOver = typeof filters?.minutesOver === "number" ? filters.minutesOver : 0;
  const minutesUnder = typeof filters?.minutesUnder === "number" ? filters.minutesUnder : 0;
  if (minutesOver > 0 || minutesUnder > 0) {
    nextRows = nextRows.filter((row) => {
      const mins = typeof row["Mins Played"] === "number" ? row["Mins Played"] : 0;
      if (minutesOver > 0 && mins < minutesOver) return false;
      if (minutesUnder > 0 && mins > minutesUnder) return false;
      return true;
    });
  }

  const teammate = filters?.teammate ?? "None";
  if (teammate !== "None") {
    const teammateLookupRows = await fetchTeammateLookupRows(years);
    const resolvedTeammate = resolveCanonicalName(
      teammateLookupRows.map((row) => row.Name),
      teammate
    );
    nextRows = filterByTeammate(
      nextRows,
      resolvedTeammate.ok ? resolvedTeammate.name : teammate,
      (filters?.withWithout ?? "with") === "with",
      teammateLookupRows,
      filters?.teammatePosition ?? "All"
    );
  }

  return nextRows;
}

function shapePlayerRows(rows: PlayerStat[], statKeys: string[]) {
  return sortRowsBySeasonAndRound(rows)
    .slice(-MAX_RESULT_ROWS)
    .map((row) => ({
      year: row.Year,
      round: row.Round_Label || `R${row.Round}`,
      opponent: row.Opponent,
      team: row.Team,
      position: row.Position,
      minsPlayed: row["Mins Played"],
      homeTeam: row["Home Team"],
      awayTeam: row["Away Team"],
      isHome:
        row["Home Team"] && row["Away Team"]
          ? row.Team === row["Home Team"]
          : null,
      stats: Object.fromEntries(statKeys.map((statKey) => [statKey, row[statKey]])),
    }));
}

function shapeTeamRows(rows: TeamStat[], statKeys: string[]) {
  return sortRowsBySeasonAndRound(rows)
    .slice(-MAX_RESULT_ROWS)
    .map((row) => ({
      year: row.Year,
      round: row.Round_Label || `R${row.Round}`,
      team: row.Team,
      opponent: row.Opponent,
      stats: Object.fromEntries(statKeys.map((statKey) => [statKey, row[statKey]])),
    }));
}

function shapeBettingRows(rows: BettingOddsRow[]) {
  return rows.slice(0, MAX_RESULT_ROWS).map((row) => ({
    date: row.date,
    match: row.match,
    result: row.result,
    bestPrice: row.bestPrice,
    model: row.model,
    value: row.value,
    bestBookie: row.bestBookie,
    marketPercentage: row.marketPercentage,
  }));
}

function shapeBettingRowsForAccess(rows: BettingOddsRow[], access: AiToolAccessPolicy) {
  const baseRows = shapeBettingRows(rows);
  if (hasAiBettingModelAccess(access.plan)) {
    return baseRows;
  }

  return baseRows.map((row) => ({
    date: row.date,
    match: row.match,
    result: row.result,
    bestPrice: row.bestPrice,
    bestBookie: row.bestBookie,
    marketPercentage: row.marketPercentage,
  }));
}

function filterBettingRowsByDate(rows: BettingOddsRow[], dateFrom?: string, dateTo?: string) {
  return rows.filter((row) => {
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    return true;
  });
}

function parsePlayerStatsInput(input: unknown): PlayerStatsInput {
  const record = asObject(input, "toolInput");
  return {
    player: parseRequiredString(record, "player"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    statKeys: parseOptionalStringArray(record, "statKeys", MAX_STAT_KEYS),
    filters: parsePlayerStatFiltersInput(record, "filters"),
  };
}

function parseTeamStatsInput(input: unknown): TeamStatsInput {
  const record = asObject(input, "toolInput");
  return {
    team: parseRequiredString(record, "team"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    statKeys: parseOptionalStringArray(record, "statKeys", MAX_STAT_KEYS),
  };
}

function parseTeamHomeAwayWinRatesInput(input: unknown): TeamHomeAwayWinRatesInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  return {
    team: parseOptionalString(record, "team"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    limit,
    sortOrder: parseEnumValue(record, "sortOrder", ["asc", "desc"] as const),
  };
}

function parseTeamPossessionBattleRecordsInput(input: unknown): TeamPossessionBattleRecordsInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  return {
    team: parseOptionalString(record, "team"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    limit,
    sortOrder: parseEnumValue(record, "sortOrder", ["asc", "desc"] as const),
  };
}

function parseTeamShortTurnaroundRecordsInput(input: unknown): TeamShortTurnaroundRecordsInput {
  const record = asObject(input, "toolInput");
  const maxDays = parseOptionalInteger(record, "maxDays");
  if (maxDays != null && maxDays < 1) {
    throw new Error("maxDays must be at least 1.");
  }

  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  return {
    team: parseOptionalString(record, "team"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    maxDays,
    limit,
    sortOrder: parseEnumValue(record, "sortOrder", ["asc", "desc"] as const),
  };
}

function parsePlayerTeamStatShareInput(input: unknown): PlayerTeamStatShareInput {
  const record = asObject(input, "toolInput");
  const minSharePercent = parseOptionalInteger(record, "minSharePercent");
  if (minSharePercent != null && minSharePercent < 0) {
    throw new Error("minSharePercent must be at least 0.");
  }

  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  return {
    team: parseOptionalString(record, "team"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    playerStatKeys: parseOptionalStringArray(record, "playerStatKeys", MAX_STAT_KEYS),
    teamStatKey: parseRequiredString(record, "teamStatKey"),
    minSharePercent,
    limit,
    sortOrder: parseEnumValue(record, "sortOrder", ["asc", "desc"] as const),
  };
}

function parsePlayerBaseFantasyRatioInput(input: unknown): PlayerBaseFantasyRatioInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  const minGames = parseOptionalInteger(record, "minGames");
  if (minGames != null && minGames < 1) {
    throw new Error("minGames must be at least 1.");
  }
  const minAverageMinutes = parseOptionalInteger(record, "minAverageMinutes");
  if (minAverageMinutes != null && minAverageMinutes < 0) {
    throw new Error("minAverageMinutes must be at least 0.");
  }

  return {
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    limit,
    minGames,
    position: parseOptionalString(record, "position") ?? null,
  };
}

function parseOverallStatsInput(input: unknown): OverallStatsInput {
  const record = asObject(input, "toolInput");
  return {
    entityType: parseEnumValue(record, "entityType", SUPPORTED_ENTITY_TYPES),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    statKeys: parseOptionalStringArray(record, "statKeys", MAX_STAT_KEYS),
  };
}

function parseRankTeamsByStatInput(input: unknown): RankTeamsByStatInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  return {
    statKey: parseRequiredString(record, "statKey"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    limit,
    sortOrder: parseEnumValue(record, "sortOrder", ["asc", "desc"] as const),
  };
}

function parseRankPlayersByStatInput(input: unknown): RankPlayersByStatInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  const minGames = parseOptionalInteger(record, "minGames");
  if (minGames != null && minGames < 1) {
    throw new Error("minGames must be at least 1.");
  }
  const minAverageMinutes = parseOptionalInteger(record, "minAverageMinutes");
  if (minAverageMinutes != null && minAverageMinutes < 0) {
    throw new Error("minAverageMinutes must be at least 0.");
  }

  return {
    statKey: parseRequiredString(record, "statKey"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    limit,
    sortOrder: parseEnumValue(record, "sortOrder", ["asc", "desc"] as const),
    aggregation: parseEnumValue(record, "aggregation", ["avg", "max", "total"] as const),
    rateBasis: parseEnumValue(record, "rateBasis", ["per_game", "per_80"] as const) ?? null,
    minGames,
    minAverageMinutes,
    filters: parsePlayerStatFiltersInput(record, "filters"),
  };
}

function parsePlayerStatFiltersInput(
  record: Record<string, unknown>,
  fieldName: string
): PlayerStatFiltersInput {
  const value = record[fieldName];
  if (value == null) {
    return {
      opponent: null,
      position: null,
      finals: null,
      minutesOver: null,
      minutesUnder: null,
      teammate: null,
      teammatePosition: null,
      withWithout: null,
    };
  }

  const filters = asObject(value, fieldName);
  const finals = parseEnumValue(filters, "finals", ["Yes", "No"] as const);
  const withWithout = parseEnumValue(filters, "withWithout", ["with", "without"] as const);

  return {
    opponent: parseOptionalString(filters, "opponent") ?? null,
    position: parseOptionalString(filters, "position") ?? null,
    finals: finals ?? null,
    minutesOver: parseOptionalInteger(filters, "minutesOver") ?? null,
    minutesUnder: parseOptionalInteger(filters, "minutesUnder") ?? null,
    teammate: parseOptionalString(filters, "teammate") ?? null,
    teammatePosition: parseOptionalString(filters, "teammatePosition") ?? null,
    withWithout: withWithout ?? null,
  };
}

function parseRankPlayersWhenTeamWinsPossessionInput(input: unknown): RankPlayersWhenTeamWinsPossessionInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_RESULT_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_RESULT_ROWS}.`);
  }

  const minGames = parseOptionalInteger(record, "minGames");
  if (minGames != null && minGames < 1) {
    throw new Error("minGames must be at least 1.");
  }

  return {
    statKey: parseRequiredString(record, "statKey"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    limit,
    position: parseOptionalString(record, "position") ?? null,
    minGames,
  };
}

function parseBettingSnapshotInput(input: unknown): BettingSnapshotInput {
  if (input == null) {
    return {};
  }

  const record = asObject(input, "toolInput");
  return {
    market: parseEnumValue(record, "market", SUPPORTED_BETTING_MARKETS) as BettingMarket | undefined,
    dateFrom: parseOptionalString(record, "dateFrom"),
    dateTo: parseOptionalString(record, "dateTo"),
  };
}

function parseComparePlayersInput(input: unknown): ComparePlayersInput {
  const record = asObject(input, "toolInput");
  const players = parseOptionalStringArray(record, "players", MAX_ENTITY_IDS);
  if (!players || players.length < 2) {
    throw new Error("players must contain between 2 and 4 names.");
  }

  return {
    players,
    stats: parseOptionalStringArray(record, "stats", MAX_STAT_KEYS),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
  };
}

function parseChartDatasetInput(input: unknown): ChartDatasetInput {
  const record = asObject(input, "toolInput");
  const entityIds = parseOptionalStringArray(record, "entityIds", MAX_ENTITY_IDS);
  if (!entityIds || entityIds.length === 0) {
    throw new Error("entityIds must contain at least one id.");
  }

  return {
    chartType: parseRequiredEnumValue(record, "chartType", SUPPORTED_CHART_TYPES),
    entityType: parseRequiredEnumValue(record, "entityType", SUPPORTED_ENTITY_TYPES),
    entityIds,
    statKey: parseRequiredString(record, "statKey"),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
  };
}

function parseFantasySnapshotInput(input: unknown): FantasySnapshotInput {
  if (input == null) {
    return {};
  }

  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_FANTASY_PLAYERS)) {
    throw new Error(`limit must be between 1 and ${MAX_FANTASY_PLAYERS}.`);
  }

  return {
    round: parseOptionalInteger(record, "round"),
    playerNames: parseOptionalStringArray(record, "playerNames", 40),
    positions: parseOptionalStringArray(record, "positions", 4),
    priceMax: parseOptionalInteger(record, "priceMax"),
    sortBy:
      parseEnumValue(record, "sortBy", [
        "ownership_delta_desc",
        "ownership_delta_asc",
        "avg_points_desc",
        "projected_avg_desc",
        "projection_desc",
        "projection_vs_priced_at_desc",
        "price_asc",
      ] as const) ?? undefined,
    requireOwnershipRise: typeof record.requireOwnershipRise === "boolean" ? record.requireOwnershipRise : undefined,
    excludeLocked: typeof record.excludeLocked === "boolean" ? record.excludeLocked : undefined,
    limit,
  };
}

function expandFantasyPositionFilters(positions: string[] | undefined): string[] | null {
  if (!positions || positions.length === 0) {
    return null;
  }

  const expanded = new Set<string>();
  positions.forEach((position) => {
    const normalized = normalizeSearchValue(position);

    if (["forward", "forwards", "fwd", "fwds", "pack"].includes(normalized)) {
      ["HOK", "MID", "EDG"].forEach((label) => expanded.add(label));
      return;
    }

    if (["back", "backs"].includes(normalized)) {
      ["CTR", "WFB"].forEach((label) => expanded.add(label));
      return;
    }

    if (["half", "halves", "hlf", "halfback", "half back", "five eighth", "five-eighth", "five eighths", "five-eighths", "5 8", "5/8", "5 eighth", "5-eighth"].includes(normalized)) {
      expanded.add("HLF");
      return;
    }

    if (["hooker", "hookers", "hok"].includes(normalized)) {
      expanded.add("HOK");
      return;
    }

    if (["middle", "middles", "mid", "prop", "props", "front row", "front-row", "frontrow", "lock", "locks"].includes(normalized)) {
      expanded.add("MID");
      return;
    }

    if (["edge", "edges", "2rf", "back row", "back-row", "second row", "second-row", "2nd row", "2nd-row", "backrow"].includes(normalized)) {
      expanded.add("EDG");
      return;
    }

    if (["centre", "centres", "center", "centers", "ctr"].includes(normalized)) {
      expanded.add("CTR");
      return;
    }

    if (["wfb", "fullback", "fullbacks", "winger", "wingers", "wing", "wings"].includes(normalized)) {
      expanded.add("WFB");
      return;
    }

    expanded.add(position.toUpperCase());
  });

  return expanded.size > 0 ? [...expanded] : null;
}

function resolveFantasyPlayerTeam(
  playerName: string,
  playerImages: Awaited<ReturnType<typeof fetchPlayerImages>>
): string | null {
  const target = normalizeLooseSearchValue(playerName);
  const targetParts = parseNameParts(playerName);
  const candidates = playerImages.filter((row) => {
    const rowName = row.player ?? "";
    if (!rowName) return false;
    const rowNorm = normalizeLooseSearchValue(rowName);
    if (rowNorm === target) return true;
    const rowParts = parseNameParts(rowName);
    return Boolean(
      rowParts.last &&
        rowParts.last === targetParts.last &&
        rowParts.first[0] &&
        rowParts.first[0] === targetParts.first[0]
    );
  });

  return candidates[0]?.team ?? null;
}

function matchesRequestedFantasyPlayerName(playerName: string, requestedNames: string[]): boolean {
  const playerNorm = normalizeLooseSearchValue(playerName);
  const playerParts = parseNameParts(playerName);

  return requestedNames.some((requestedName) => {
    const requestedNorm = normalizeLooseSearchValue(requestedName);
    if (!requestedNorm) return false;
    if (playerNorm === requestedNorm) return true;

    const requestedParts = parseNameParts(requestedName);
    return Boolean(
      playerParts.last &&
        requestedParts.last &&
        playerParts.last === requestedParts.last &&
        playerParts.first[0] &&
        requestedParts.first[0] &&
        playerParts.first[0] === requestedParts.first[0]
    );
  });
}

function teamHasDrawFixture(draw2026Data: Draw2026Data | null, round: number, team: string | null): boolean | null {
  if (!draw2026Data || !team) return null;
  const teamKey = normalizeLooseSearchValue(team);
  if (!teamKey) return null;
  const roundRows = draw2026Data.rows.filter((row) => row.round === round);
  if (roundRows.length === 0) return null;
  return roundRows.some(
    (row) => normalizeLooseSearchValue(row.home) === teamKey || normalizeLooseSearchValue(row.away) === teamKey
  );
}

function nextFantasyMajorByeRound(round: number | null): number | null {
  if (round == null) return FANTASY_MAJOR_BYE_ROUNDS[0];
  return FANTASY_MAJOR_BYE_ROUNDS.find((byeRound) => byeRound >= round) ?? null;
}

function getFantasyLastThreeAverage(scoreHistory: Record<string, number>): number | null {
  const scores = Object.entries(scoreHistory)
    .map(([round, score]) => ({ round: Number.parseInt(round, 10), score }))
    .filter((entry) => Number.isFinite(entry.round) && Number.isFinite(entry.score))
    .sort((left, right) => right.round - left.round)
    .slice(0, 3)
    .map((entry) => entry.score);

  if (scores.length === 0) return null;
  return roundToTwoDecimals(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

async function runListAvailableYears(): Promise<AiToolExecutionResult> {
  const years = await fetchAvailableYears();
  return {
    ok: true,
    data: {
      years,
      count: years.length,
    },
  };
}

async function runGetPlayerStats(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parsePlayerStatsInput(input);
  const rows = await fetchPlayerStats(parsed.years);
  const resolved = resolveCanonicalName(
    rows.map((row) => row.Name),
    parsed.player
  );

  if (!resolved.ok) {
    return buildError(resolved.error, resolved.suggestions);
  }

  const matchingRows = rows.filter((row) => row.Name === resolved.name);
  const filteredRows = await applyPlayerStatFilters(matchingRows, parsed.filters, parsed.years);
  if (filteredRows.length === 0) {
    return buildError(`No rows found for "${resolved.name}".`);
  }

  const allowedStatKeys = selectNumericStatKeys(filteredRows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS);
  const accessibleKeys = filterPlayerStatKeysForAccess(allowedStatKeys, access);
  const { selected, ignored } = resolveRequestedStatKeys(
    parsed.statKeys,
    accessibleKeys.allowed,
    DEFAULT_PLAYER_STAT_KEYS
  );

  if (selected.length === 0) {
    return buildPlayerAccessError(access);
  }

  return {
    ok: true,
    data: {
      player: resolved.name,
      years: parsed.years ?? "all",
      statKeys: selected,
      ignoredStatKeys: [...ignored, ...accessibleKeys.restricted],
      rowCount: filteredRows.length,
      filters: parsed.filters ?? null,
      summary: {
        games: filteredRows.length,
        teams: dedupeStrings(filteredRows.map((row) => row.Team)),
        positions: dedupeStrings(filteredRows.map((row) => row.Position)),
        totals: summariseStatTotals(filteredRows as Record<string, unknown>[], selected),
        stats: summariseStatBlock(filteredRows as Record<string, unknown>[], selected),
      },
      seasonSummaries: summariseStatBlockBySeason(filteredRows, selected),
      rows: shapePlayerRows(filteredRows, selected),
    },
  };
}

async function runGetTeamStats(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  void access;
  const parsed = parseTeamStatsInput(input);
  const rows = await fetchTeamStats(parsed.years);
  const resolved = resolveCanonicalName(
    rows.map((row) => row.Team),
    parsed.team
  );

  if (!resolved.ok) {
    return buildError(resolved.error, resolved.suggestions);
  }

  const matchingRows = rows.filter((row) => row.Team === resolved.name);
  if (matchingRows.length === 0) {
    return buildError(`No rows found for "${resolved.name}".`);
  }

  const allowedStatKeys = selectNumericStatKeys(matchingRows as Record<string, unknown>[], TEAM_DIMENSION_KEYS);
  const { selected, ignored } = resolveRequestedStatKeys(
    parsed.statKeys,
    allowedStatKeys,
    DEFAULT_TEAM_STAT_KEYS
  );

  return {
    ok: true,
    data: {
      team: resolved.name,
      years: parsed.years ?? "all",
      statKeys: selected,
      ignoredStatKeys: ignored,
      rowCount: matchingRows.length,
      summary: {
        games: matchingRows.length,
        totals: summariseStatTotals(matchingRows as Record<string, unknown>[], selected),
        stats: summariseStatBlock(matchingRows as Record<string, unknown>[], selected),
      },
      seasonSummaries: summariseStatBlockBySeason(matchingRows, selected),
      rows: shapeTeamRows(matchingRows, selected),
    },
  };
}

async function runGetTeamHomeAwayWinRates(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  void access;
  const parsed = parseTeamHomeAwayWinRatesInput(input);
  const rows = await fetchTeamStats(parsed.years);

  let selectedTeam: string | null = null;
  if (parsed.team) {
    const resolution = resolveCanonicalName(
      [...new Set(rows.map((row) => row.Team))],
      parsed.team
    );
    if (!resolution.ok) {
      return buildError(resolution.error, resolution.suggestions);
    }
    selectedTeam = resolution.name;
  }

  const scopedRows = selectedTeam
    ? rows.filter((row) => row.Team === selectedTeam)
    : rows;

  const perTeam = new Map<
    string,
    {
      homeGames: number;
      homeWins: number;
      awayGames: number;
      awayWins: number;
    }
  >();

  scopedRows.forEach((row) => {
    const bucket = perTeam.get(row.Team) ?? {
      homeGames: 0,
      homeWins: 0,
      awayGames: 0,
      awayWins: 0,
    };
    const split = row["Home/Away"];
    const isWin = row.Result === "Win";

    if (split === "Home") {
      bucket.homeGames += 1;
      if (isWin) {
        bucket.homeWins += 1;
      }
    } else if (split === "Away") {
      bucket.awayGames += 1;
      if (isWin) {
        bucket.awayWins += 1;
      }
    }

    perTeam.set(row.Team, bucket);
  });

  const rankings = [...perTeam.entries()]
    .map(([team, split]) => {
      const homeWinRate =
        split.homeGames > 0 ? roundToTwoDecimals((split.homeWins / split.homeGames) * 100) : null;
      const awayWinRate =
        split.awayGames > 0 ? roundToTwoDecimals((split.awayWins / split.awayGames) * 100) : null;
      const homeAwayGap =
        homeWinRate != null && awayWinRate != null
          ? roundToTwoDecimals(Math.abs(homeWinRate - awayWinRate))
          : null;
      const homeMinusAway =
        homeWinRate != null && awayWinRate != null
          ? roundToTwoDecimals(homeWinRate - awayWinRate)
          : null;

      return {
        team,
        homeGames: split.homeGames,
        homeWins: split.homeWins,
        homeWinRate,
        awayGames: split.awayGames,
        awayWins: split.awayWins,
        awayWinRate,
        homeAwayGap,
        homeMinusAway,
      };
    })
    .filter(
      (entry) =>
        entry.homeWinRate != null &&
        entry.awayWinRate != null &&
        entry.homeAwayGap != null &&
        entry.homeMinusAway != null
    )
    .sort((left, right) => {
      const gapDelta =
        parsed.sortOrder === "asc"
          ? (left.homeAwayGap ?? Infinity) - (right.homeAwayGap ?? Infinity)
          : (right.homeAwayGap ?? -Infinity) - (left.homeAwayGap ?? -Infinity);
      if (gapDelta !== 0) return gapDelta;
      return left.team.localeCompare(right.team);
    });

  return {
    ok: true,
    data: {
      years: parsed.years ?? "all",
      team: selectedTeam,
      rowCount: scopedRows.length,
      rankings: rankings.slice(0, parsed.limit ?? (selectedTeam ? 1 : 5)),
    },
  };
}

async function runGetTeamPossessionBattleRecords(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  void access;
  const parsed = parseTeamPossessionBattleRecordsInput(input);
  const rows = await fetchTeamStats(parsed.years);

  let selectedTeam: string | null = null;
  if (parsed.team) {
    const resolution = resolveCanonicalName(
      [...new Set(rows.map((row) => row.Team))],
      parsed.team
    );
    if (!resolution.ok) {
      return buildError(resolution.error, resolution.suggestions);
    }
    selectedTeam = resolution.name;
  }

  const scopedRows = selectedTeam ? rows.filter((row) => row.Team === selectedTeam) : rows;
  const perTeam = new Map<
    string,
    {
      games: number;
      possessionWins: number;
      possessionLosses: number;
      possessionDraws: number;
      possessionTotal: number;
      opponentPossessionTotal: number;
    }
  >();

  scopedRows.forEach((row) => {
    const possession = row["Possession %"];
    const opponentPossession = row["Opponent Possession %"];
    if (typeof possession !== "number" || typeof opponentPossession !== "number") {
      return;
    }

    const bucket = perTeam.get(row.Team) ?? {
      games: 0,
      possessionWins: 0,
      possessionLosses: 0,
      possessionDraws: 0,
      possessionTotal: 0,
      opponentPossessionTotal: 0,
    };

    bucket.games += 1;
    bucket.possessionTotal = roundToTwoDecimals(bucket.possessionTotal + possession);
    bucket.opponentPossessionTotal = roundToTwoDecimals(bucket.opponentPossessionTotal + opponentPossession);
    if (possession > opponentPossession) {
      bucket.possessionWins += 1;
    } else if (possession < opponentPossession) {
      bucket.possessionLosses += 1;
    } else {
      bucket.possessionDraws += 1;
    }

    perTeam.set(row.Team, bucket);
  });

  const rankings = [...perTeam.entries()]
    .map(([team, record]) => ({
      team,
      games: record.games,
      possessionWins: record.possessionWins,
      possessionLosses: record.possessionLosses,
      possessionDraws: record.possessionDraws,
      possessionWinRate: record.games > 0 ? roundToTwoDecimals((record.possessionWins / record.games) * 100) : null,
      averagePossession: record.games > 0 ? roundToTwoDecimals(record.possessionTotal / record.games) : null,
      averageOpponentPossession: record.games > 0 ? roundToTwoDecimals(record.opponentPossessionTotal / record.games) : null,
    }))
    .filter((entry) => entry.possessionWinRate != null)
    .sort((left, right) => {
      const winRateDelta =
        parsed.sortOrder === "asc"
          ? (left.possessionWinRate ?? Infinity) - (right.possessionWinRate ?? Infinity)
          : (right.possessionWinRate ?? -Infinity) - (left.possessionWinRate ?? -Infinity);
      if (winRateDelta !== 0) return winRateDelta;
      if (left.possessionWins !== right.possessionWins) return right.possessionWins - left.possessionWins;
      return left.team.localeCompare(right.team);
    });

  return {
    ok: true,
    data: {
      years: parsed.years ?? "all",
      team: selectedTeam,
      possessionRule: "Possession % > Opponent Possession %",
      rowCount: scopedRows.length,
      rankings: rankings.slice(0, parsed.limit ?? (selectedTeam ? 1 : 10)),
    },
  };
}

function getUtcDayNumber(dateValue: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
    return null;
  }

  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

async function runGetTeamShortTurnaroundRecords(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  void access;
  const parsed = parseTeamShortTurnaroundRecordsInput(input);
  const matches = await fetchMatches(parsed.years);
  const maxDays = parsed.maxDays ?? 6;

  const teams = [...new Set(matches.flatMap((match) => [match.Home, match.Away]))];
  let selectedTeam: string | null = null;
  if (parsed.team) {
    const resolution = resolveCanonicalName(teams, parsed.team);
    if (!resolution.ok) {
      return buildError(resolution.error, resolution.suggestions);
    }
    selectedTeam = resolution.name;
  }

  const teamGames = new Map<
    string,
    Array<{
      date: string;
      dayNumber: number;
      opponent: string;
      isHome: boolean;
      isWin: boolean;
      isDraw: boolean;
    }>
  >();

  matches.forEach((match) => {
    const dayNumber = getUtcDayNumber(match.Date);
    if (dayNumber == null) return;

    const homeGames = teamGames.get(match.Home) ?? [];
    homeGames.push({
      date: match.Date,
      dayNumber,
      opponent: match.Away,
      isHome: true,
      isWin: match.Home_Score > match.Away_Score,
      isDraw: match.Home_Score === match.Away_Score,
    });
    teamGames.set(match.Home, homeGames);

    const awayGames = teamGames.get(match.Away) ?? [];
    awayGames.push({
      date: match.Date,
      dayNumber,
      opponent: match.Home,
      isHome: false,
      isWin: match.Away_Score > match.Home_Score,
      isDraw: match.Home_Score === match.Away_Score,
    });
    teamGames.set(match.Away, awayGames);
  });

  const rankings = [...teamGames.entries()]
    .filter(([team]) => (selectedTeam ? team === selectedTeam : true))
    .map(([team, games]) => {
      const sortedGames = [...games].sort((left, right) => left.dayNumber - right.dayNumber);
      let wins = 0;
      let losses = 0;
      let draws = 0;
      const shortTurnaroundGames: Array<{
        date: string;
        opponent: string;
        turnaroundDays: number;
        venue: "Home" | "Away";
        result: "Win" | "Loss" | "Draw";
      }> = [];

      for (let index = 1; index < sortedGames.length; index += 1) {
        const current = sortedGames[index];
        const previous = sortedGames[index - 1];
        const turnaroundDays = current.dayNumber - previous.dayNumber;
        if (turnaroundDays > maxDays) {
          continue;
        }

        if (current.isDraw) {
          draws += 1;
        } else if (current.isWin) {
          wins += 1;
        } else {
          losses += 1;
        }

        shortTurnaroundGames.push({
          date: current.date,
          opponent: current.opponent,
          turnaroundDays,
          venue: current.isHome ? "Home" : "Away",
          result: current.isDraw ? "Draw" : current.isWin ? "Win" : "Loss",
        });
      }

      const gamesCount = shortTurnaroundGames.length;
      const winRate = gamesCount > 0 ? roundToTwoDecimals((wins / gamesCount) * 100) : null;

      return {
        team,
        games: gamesCount,
        wins,
        losses,
        draws,
        winRate,
        record: draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`,
        samples: shortTurnaroundGames.slice(0, 5),
      };
    })
    .filter((entry) => entry.games > 0 && entry.winRate != null)
    .sort((left, right) => {
      const winRateDelta =
        parsed.sortOrder === "desc"
          ? (right.winRate ?? -Infinity) - (left.winRate ?? -Infinity)
          : (left.winRate ?? Infinity) - (right.winRate ?? Infinity);
      if (winRateDelta !== 0) return winRateDelta;
      if (left.games !== right.games) return right.games - left.games;
      return left.team.localeCompare(right.team);
    });

  return {
    ok: true,
    data: {
      years: parsed.years ?? "all",
      team: selectedTeam,
      maxDays,
      rankings: rankings.slice(0, parsed.limit ?? (selectedTeam ? 1 : 5)),
    },
  };
}

async function runGetPlayerTeamStatShare(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parsePlayerTeamStatShareInput(input);
  const playerRows = await fetchPlayerStats(parsed.years);
  const teamRows = await fetchTeamStats(parsed.years);

  const playerAllowedStatKeys = selectNumericStatKeys(
    playerRows as Record<string, unknown>[],
    PLAYER_DIMENSION_KEYS
  );
  const accessiblePlayerKeys = filterPlayerStatKeysForAccess(playerAllowedStatKeys, access);
  const { selected: selectedPlayerStatKeys, ignored: ignoredPlayerStatKeys } = resolveRequestedStatKeys(
    parsed.playerStatKeys,
    accessiblePlayerKeys.allowed,
    parsed.playerStatKeys ?? ["Tries", "Try Assists"]
  );

  if (selectedPlayerStatKeys.length === 0) {
    return buildPlayerAccessError(access);
  }

  const teamAllowedStatKeys = selectNumericStatKeys(
    teamRows as Record<string, unknown>[],
    TEAM_DIMENSION_KEYS
  );
  const { selected: selectedTeamStatKeys } = resolveRequestedStatKeys(
    [parsed.teamStatKey],
    teamAllowedStatKeys,
    [parsed.teamStatKey]
  );
  const teamStatKey = selectedTeamStatKeys[0];

  if (!teamStatKey) {
    return buildError(`Unsupported teamStatKey "${parsed.teamStatKey}" for team stat share.`);
  }

  let selectedTeam: string | null = null;
  if (parsed.team) {
    const resolution = resolveCanonicalName(
      [...new Set(playerRows.map((row) => row.Team))],
      parsed.team
    );
    if (!resolution.ok) {
      return buildError(resolution.error, resolution.suggestions);
    }
    selectedTeam = resolution.name;
  }

  const scopedPlayerRows = playerRows.filter((row) => (selectedTeam ? row.Team === selectedTeam : true));
  const scopedTeamRows = teamRows.filter((row) => (selectedTeam ? row.Team === selectedTeam : true));

  const teamTotals = new Map<string, number>();
  scopedTeamRows.forEach((row) => {
    const value = row[teamStatKey];
    if (typeof value !== "number") {
      return;
    }

    const key = `${row.Team}::${row.Year}`;
    teamTotals.set(key, roundToTwoDecimals((teamTotals.get(key) ?? 0) + value));
  });

  const perPlayer = new Map<
    string,
    {
      player: string;
      team: string;
      year: string;
      games: number;
      statTotals: Record<string, number>;
      playerTotal: number;
    }
  >();

  scopedPlayerRows.forEach((row) => {
    const key = `${row.Name}::${row.Team}::${row.Year}`;
    const existing = perPlayer.get(key) ?? {
      player: row.Name,
      team: row.Team,
      year: row.Year,
      games: 0,
      statTotals: Object.fromEntries(selectedPlayerStatKeys.map((statKey) => [statKey, 0])),
      playerTotal: 0,
    };

    existing.games += 1;
    selectedPlayerStatKeys.forEach((statKey) => {
      const value = row[statKey];
      if (typeof value !== "number") {
        return;
      }

      existing.statTotals[statKey] = roundToTwoDecimals((existing.statTotals[statKey] ?? 0) + value);
      existing.playerTotal = roundToTwoDecimals(existing.playerTotal + value);
    });

    perPlayer.set(key, existing);
  });

  const rankings = [...perPlayer.values()]
    .map((entry) => {
      const teamTotal = teamTotals.get(`${entry.team}::${entry.year}`) ?? null;
      const sharePercent =
        teamTotal && teamTotal > 0
          ? roundToTwoDecimals((entry.playerTotal / teamTotal) * 100)
          : null;

      return {
        player: entry.player,
        team: entry.team,
        year: entry.year,
        games: entry.games,
        playerStatKeys: selectedPlayerStatKeys,
        playerStatTotals: entry.statTotals,
        playerTotal: entry.playerTotal,
        teamStatKey,
        teamTotal,
        sharePercent,
      };
    })
    .filter(
      (entry) =>
        entry.teamTotal != null &&
        entry.sharePercent != null &&
        (parsed.minSharePercent == null || entry.sharePercent >= parsed.minSharePercent)
    )
    .sort((left, right) => {
      const shareDelta =
        parsed.sortOrder === "asc"
          ? (left.sharePercent ?? Infinity) - (right.sharePercent ?? Infinity)
          : (right.sharePercent ?? -Infinity) - (left.sharePercent ?? -Infinity);
      if (shareDelta !== 0) return shareDelta;
      return right.playerTotal - left.playerTotal;
    });

  return {
    ok: true,
    data: {
      years: parsed.years ?? "all",
      team: selectedTeam,
      playerStatKeys: selectedPlayerStatKeys,
      teamStatKey,
      minSharePercent: parsed.minSharePercent ?? null,
      rowCount: rankings.length,
      ignoredPlayerStatKeys: [...ignoredPlayerStatKeys, ...accessiblePlayerKeys.restricted],
      rankings: rankings.slice(0, parsed.limit ?? 10),
    },
  };
}

async function runGetOverallStats(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parseOverallStatsInput(input);
  const entityType = parsed.entityType ?? "team";

  if (entityType === "player") {
    const rows = await fetchPlayerStats(parsed.years);
    const allowedStatKeys = selectNumericStatKeys(rows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS);
    const accessibleKeys = filterPlayerStatKeysForAccess(allowedStatKeys, access);
    const { selected, ignored } = resolveRequestedStatKeys(
      parsed.statKeys,
      accessibleKeys.allowed,
      DEFAULT_PLAYER_STAT_KEYS
    );

    if (selected.length === 0) {
      return buildPlayerAccessError(access);
    }

    return {
      ok: true,
      data: {
        entityType,
        years: parsed.years ?? "all",
        statKeys: selected,
        ignoredStatKeys: [...ignored, ...accessibleKeys.restricted],
        rowCount: rows.length,
        summary: {
          rows: rows.length,
          stats: summariseStatBlock(rows as Record<string, unknown>[], selected),
        },
        seasonSummaries: summariseStatBlockBySeason(rows, selected),
      },
    };
  }

  const rows = await fetchTeamStats(parsed.years);
  const allowedStatKeys = selectNumericStatKeys(rows as Record<string, unknown>[], TEAM_DIMENSION_KEYS);
  const { selected, ignored } = resolveRequestedStatKeys(
    parsed.statKeys,
    allowedStatKeys,
    DEFAULT_TEAM_STAT_KEYS
  );

  return {
    ok: true,
    data: {
      entityType,
      years: parsed.years ?? "all",
      statKeys: selected,
      ignoredStatKeys: ignored,
      rowCount: rows.length,
      summary: {
        rows: rows.length,
        stats: summariseStatBlock(rows as Record<string, unknown>[], selected),
      },
      seasonSummaries: summariseStatBlockBySeason(rows, selected),
    },
  };
}

async function runRankTeamsByStat(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  void access;
  const parsed = parseRankTeamsByStatInput(input);
  const rows = await fetchTeamStats(parsed.years);
  const allowedStatKeys = selectNumericStatKeys(rows as Record<string, unknown>[], TEAM_DIMENSION_KEYS);
  const { selected } = resolveRequestedStatKeys([parsed.statKey], allowedStatKeys, [parsed.statKey]);
  const statKey = selected[0];

  if (!statKey) {
    return buildError(`Unsupported statKey "${parsed.statKey}" for team ranking.`);
  }

  const perTeam = new Map<string, number[]>();
  rows.forEach((row) => {
    const value = row[statKey];
    if (typeof value !== "number") {
      return;
    }

    const bucket = perTeam.get(row.Team);
    if (bucket) {
      bucket.push(value);
      return;
    }

    perTeam.set(row.Team, [value]);
  });

  const rankings = [...perTeam.entries()]
    .map(([team, values]) => ({
      team,
      games: values.length,
      avg: average(values),
      total: roundToTwoDecimals(values.reduce((sum, value) => sum + value, 0)),
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
    }))
    .filter((entry) => entry.avg != null)
    .sort((left, right) => {
      const avgDelta =
        parsed.sortOrder === "asc"
          ? (left.avg ?? Infinity) - (right.avg ?? Infinity)
          : (right.avg ?? -Infinity) - (left.avg ?? -Infinity);
      if (avgDelta !== 0) return avgDelta;
      return right.games - left.games;
    });

  return {
    ok: true,
    data: {
      statKey,
      years: parsed.years ?? "all",
      rowCount: rows.length,
      rankings: rankings.slice(0, parsed.limit ?? 5),
    },
  };
}

async function runGetPlayerBaseFantasyRatios(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parsePlayerBaseFantasyRatioInput(input);
  const rows = await fetchPlayerStats(parsed.years);
  const accessibleKeys = filterPlayerStatKeysForAccess(
    selectNumericStatKeys(rows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS),
    access
  );
  const requiredStatKeys = ["All Run Metres", "Tackles Made", "Kicking Metres", "Conversions", "Fantasy"];
  const statResolution = resolveRequestedStatKeys(
    requiredStatKeys,
    accessibleKeys.allowed,
    requiredStatKeys
  );

  if (statResolution.selected.length < requiredStatKeys.length) {
    return buildPlayerAccessError(access);
  }

  const filteredRows = await applyPlayerStatFilters(
    rows,
    {
      opponent: null,
      position: parsed.position ?? null,
      finals: null,
      minutesOver: null,
      minutesUnder: null,
      teammate: null,
      teammatePosition: null,
      withWithout: null,
    },
    parsed.years
  );

  const minGames = parsed.minGames ?? 3;
  const perPlayer = new Map<
    string,
    {
      player: string;
      team: string;
      position: string;
      games: number;
      baseTotal: number;
      fantasyTotal: number;
    }
  >();

  filteredRows.forEach((row) => {
    const fantasyValue = row.Fantasy;
    if (typeof fantasyValue !== "number" || !Number.isFinite(fantasyValue)) {
      return;
    }

    const baseValue = computeBaseFantasyPoints(row);

    const entry = perPlayer.get(row.Name) ?? {
      player: row.Name,
      team: row.Team,
      position: row.Position,
      games: 0,
      baseTotal: 0,
      fantasyTotal: 0,
    };

    entry.games += 1;
    entry.baseTotal = roundToTwoDecimals(entry.baseTotal + baseValue);
    entry.fantasyTotal = roundToTwoDecimals(entry.fantasyTotal + fantasyValue);
    perPlayer.set(row.Name, entry);
  });

  const rankings = [...perPlayer.values()]
    .filter((entry) => entry.games >= minGames && entry.fantasyTotal > 0)
    .map((entry) => {
      const basePerGame = roundToTwoDecimals(entry.baseTotal / entry.games);
      const fantasyPerGame = roundToTwoDecimals(entry.fantasyTotal / entry.games);
      return {
        player: entry.player,
        team: entry.team,
        position: entry.position,
        games: entry.games,
        baseTotal: entry.baseTotal,
        fantasyTotal: entry.fantasyTotal,
        basePerGame,
        fantasyPerGame,
        ratio: roundToTwoDecimals(entry.baseTotal / entry.fantasyTotal),
      };
    })
    .sort((left, right) => {
      const ratioDelta = right.ratio - left.ratio;
      if (ratioDelta !== 0) return ratioDelta;
      return right.games - left.games;
    });

  const limit = parsed.limit ?? 5;

  return {
    ok: true,
    data: {
      years: parsed.years ?? "all",
      minGames,
      position: parsed.position ?? null,
      baseDefinition: [...BASE_FANTASY_RATIO_DEFINITION],
      highest: rankings.slice(0, limit),
      lowest: [...rankings].reverse().slice(0, limit),
      rowCount: rankings.length,
      ignoredStatKeys: accessibleKeys.restricted,
    },
  };
}

async function runRankPlayersByStat(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parseRankPlayersByStatInput(input);
  const rows = await fetchPlayerStats(parsed.years);
  const filteredRows = await applyPlayerStatFilters(rows, parsed.filters, parsed.years);
  const allowedStatKeys = selectNumericStatKeys(filteredRows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS);
  const accessibleKeys = filterPlayerStatKeysForAccess(allowedStatKeys, access);
  const { selected } = resolveRequestedStatKeys([parsed.statKey], accessibleKeys.allowed, [parsed.statKey]);
  const statKey = selected[0];

  if (!statKey) {
    return buildPlayerAccessError(access);
  }

  const aggregation = parsed.aggregation ?? "avg";
  const rateBasis = parsed.rateBasis ?? null;
  const minGames = parsed.minGames ?? null;
  const minAverageMinutes = parsed.minAverageMinutes ?? null;
  const perPlayer = new Map<string, PlayerStat[]>();
  filteredRows.forEach((row) => {
    const value = row[statKey];
    if (typeof value !== "number") {
      return;
    }

    const bucket = perPlayer.get(row.Name);
    if (bucket) {
      bucket.push(row);
      return;
    }

    perPlayer.set(row.Name, [row]);
  });

  const rankings = [...perPlayer.entries()]
    .map(([player, playerRows]) => {
      const values = playerRows
        .map((row) => row[statKey])
        .filter((value): value is number => typeof value === "number");
      if (values.length === 0) {
        return null;
      }

      if (minGames != null && playerRows.length < minGames) {
        return null;
      }

      const bestRow = playerRows.reduce((best, row) => {
        const rowValue = row[statKey];
        const bestValue = best[statKey];
        if (typeof rowValue !== "number") return best;
        if (typeof bestValue !== "number" || rowValue > bestValue) return row;
        return best;
      }, playerRows[0]);

      const avg = average(values);
      const total = roundToTwoDecimals(values.reduce((sum, value) => sum + value, 0));
      const max = roundToTwoDecimals(Math.max(...values));
      const totalMinutes = roundToTwoDecimals(
        playerRows.reduce((sum, row) => sum + (typeof row["Mins Played"] === "number" ? row["Mins Played"] : 0), 0)
      );
      const avgMinutes = values.length > 0 ? roundToTwoDecimals(totalMinutes / values.length) : null;
      if (minAverageMinutes != null && (avgMinutes == null || avgMinutes < minAverageMinutes)) {
        return null;
      }

      const ratePerGame = values.length > 0 ? roundToTwoDecimals(total / values.length) : null;
      const ratePer80 = totalMinutes > 0 ? roundToTwoDecimals((total / totalMinutes) * 80) : null;
      const rankingValue =
        rateBasis === "per_80"
          ? ratePer80
          : rateBasis === "per_game"
            ? ratePerGame
            : aggregation === "max"
              ? max
              : aggregation === "total"
                ? total
                : avg;

      if (rankingValue == null) {
        return null;
      }

      return {
        player,
        team: bestRow.Team,
        position: bestRow.Position,
        games: values.length,
        avg,
        total,
        max,
        totalMinutes,
        avgMinutes,
        ratePerGame,
        ratePer80,
        value: rankingValue,
        bestGame: {
          year: bestRow.Year,
          round: bestRow.Round_Label || `R${bestRow.Round}`,
          opponent: bestRow.Opponent,
          team: bestRow.Team,
          value: typeof bestRow[statKey] === "number" ? bestRow[statKey] : null,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      const valueDelta =
        parsed.sortOrder === "asc"
          ? left.value - right.value
          : right.value - left.value;
      if (valueDelta !== 0) return valueDelta;
      return right.games - left.games;
    });

  return {
    ok: true,
    data: {
      statKey,
      years: parsed.years ?? "all",
      aggregation,
      rateBasis,
      minGames,
      minAverageMinutes,
      rowCount: filteredRows.length,
      filters: parsed.filters ?? null,
      rankings: rankings.slice(0, parsed.limit ?? 5),
      ignoredStatKeys: accessibleKeys.restricted,
    },
  };
}

async function runRankPlayersWhenTeamWinsPossession(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parseRankPlayersWhenTeamWinsPossessionInput(input);
  const [playerRows, teamRows] = await Promise.all([
    fetchPlayerStats(parsed.years),
    fetchTeamStats(parsed.years),
  ]);

  const allowedStatKeys = selectNumericStatKeys(playerRows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS);
  const accessibleKeys = filterPlayerStatKeysForAccess(allowedStatKeys, access);
  const { selected } = resolveRequestedStatKeys([parsed.statKey], accessibleKeys.allowed, [parsed.statKey]);
  const statKey = selected[0];

  if (!statKey) {
    return buildPlayerAccessError(access);
  }

  const possessionWins = new Set(
    teamRows
      .filter((row) => {
        const possession = row["Possession %"];
        const opponentPossession = row["Opponent Possession %"];
        return (
          typeof possession === "number" &&
          typeof opponentPossession === "number" &&
          possession > opponentPossession
        );
      })
      .map((row) => `${row.Team}::${row.Year}::${row.Round}`)
  );

  const filteredRows = playerRows.filter((row) => {
    if (parsed.position && row.Position !== parsed.position) {
      return false;
    }

    return possessionWins.has(`${row.Team}::${row.Year}::${row.Round}`);
  });

  const minGames = parsed.minGames ?? 1;
  const perPlayer = new Map<
    string,
    {
      player: string;
      team: string;
      position: string;
      games: number;
      total: number;
    }
  >();

  filteredRows.forEach((row) => {
    const value = row[statKey];
    if (typeof value !== "number") {
      return;
    }

    const existing = perPlayer.get(row.Name) ?? {
      player: row.Name,
      team: row.Team,
      position: row.Position,
      games: 0,
      total: 0,
    };

    existing.games += 1;
    existing.total = roundToTwoDecimals(existing.total + value);
    perPlayer.set(row.Name, existing);
  });

  const rankings = [...perPlayer.values()]
    .filter((entry) => entry.games >= minGames)
    .map((entry) => ({
      ...entry,
      perGame: roundToTwoDecimals(entry.total / entry.games),
    }))
    .sort((left, right) => {
      const perGameDelta = right.perGame - left.perGame;
      if (perGameDelta !== 0) return perGameDelta;
      const totalDelta = right.total - left.total;
      if (totalDelta !== 0) return totalDelta;
      return left.player.localeCompare(right.player);
    });

  return {
    ok: true,
    data: {
      statKey,
      years: parsed.years ?? "all",
      possessionRule: "Team Possession % > Opponent Possession %",
      position: parsed.position ?? null,
      minGames,
      qualifyingTeamGames: possessionWins.size,
      rowCount: filteredRows.length,
      rankings: rankings.slice(0, parsed.limit ?? 10),
      ignoredStatKeys: accessibleKeys.restricted,
    },
  };
}

async function runGetBettingSnapshot(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parseBettingSnapshotInput(input);
  const accessError = ensureBettingAccess(access, parsed.market);
  if (accessError) {
    return accessError;
  }
  const snapshot = await fetchBettingOddsSnapshot();
  const marketRows = parsed.market
    ? snapshot[parsed.market.toLowerCase() as "h2h" | "line" | "total" | "tryscorer"]
    : hasAiPremiumDataAccess(access.plan)
      ? [...snapshot.h2h, ...snapshot.line, ...snapshot.total, ...snapshot.tryscorer]
      : [...snapshot.h2h];
  const filteredRows = filterBettingRowsByDate(marketRows, parsed.dateFrom, parsed.dateTo);

  return {
    ok: true,
    data: {
      generatedAt: snapshot.generatedAt,
      market: parsed.market ?? "all",
      dateFrom: parsed.dateFrom ?? null,
      dateTo: parsed.dateTo ?? null,
      rowCount: filteredRows.length,
      rows: shapeBettingRowsForAccess(filteredRows, access),
    },
  };
}

async function runComparePlayers(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parseComparePlayersInput(input);
  const rows = await fetchPlayerStats(parsed.years);
  const allowedStatKeys = selectNumericStatKeys(rows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS);
  const accessibleKeys = filterPlayerStatKeysForAccess(allowedStatKeys, access);
  const { selected, ignored } = resolveRequestedStatKeys(
    parsed.stats,
    accessibleKeys.allowed,
    DEFAULT_COMPARE_STAT_KEYS
  );

  if (selected.length === 0) {
    return buildPlayerAccessError(access);
  }

  const comparisons = parsed.players.map((player) => {
    const resolved = resolveCanonicalName(
      rows.map((row) => row.Name),
      player
    );

    if (!resolved.ok) {
      return buildError(resolved.error, resolved.suggestions);
    }

    const matchingRows = rows.filter((row) => row.Name === resolved.name);
    return {
      ok: true as const,
      data: {
        player: resolved.name,
        games: matchingRows.length,
        teams: dedupeStrings(matchingRows.map((row) => row.Team)),
        stats: summariseStatBlock(matchingRows as Record<string, unknown>[], selected),
      },
    };
  });

  const firstError = comparisons.find((result) => !result.ok);
  if (firstError && !firstError.ok) {
    return firstError;
  }

  return {
    ok: true,
    data: {
      years: parsed.years ?? "all",
      statKeys: selected,
      ignoredStatKeys: [...ignored, ...accessibleKeys.restricted],
      comparisons: comparisons.map((result) => (result.ok ? result.data : null)).filter(Boolean),
    },
  };
}

async function runBuildChartDataset(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  if (!hasAiPlotAccess(access.plan)) {
    return buildPlotAccessError();
  }

  const parsed = parseChartDatasetInput(input);

  if (parsed.entityType === "player") {
    const rows = await fetchPlayerStats(parsed.years);
    const allowedStatKeys = selectNumericStatKeys(rows as Record<string, unknown>[], PLAYER_DIMENSION_KEYS);
    const accessibleKeys = filterPlayerStatKeysForAccess(allowedStatKeys, access);
    const { selected } = resolveRequestedStatKeys([parsed.statKey], accessibleKeys.allowed, [parsed.statKey]);
    const statKey = selected[0];

    if (!statKey) {
      return buildPlayerAccessError(access);
    }

    const series = parsed.entityIds.map((entityId) => {
      const resolved = resolveCanonicalName(
        rows.map((row) => row.Name),
        entityId
      );

      if (!resolved.ok) {
        return buildError(resolved.error, resolved.suggestions);
      }

      const entityRows = sortRowsBySeasonAndRound(rows.filter((row) => row.Name === resolved.name)).slice(
        -MAX_CHART_POINTS
      );

      return {
        ok: true as const,
        data: {
          id: resolved.name,
          label: resolved.name,
          points: entityRows.map((row) => ({
            year: row.Year,
            round: row.Round_Label || `R${row.Round}`,
            label: `${row.Year} ${row.Round_Label || `R${row.Round}`}`,
            value: row[statKey],
          })),
        },
      };
    });

    const firstError = series.find((result) => !result.ok);
    if (firstError && !firstError.ok) {
      return firstError;
    }

    return {
      ok: true,
      data: {
        chartType: parsed.chartType,
        entityType: parsed.entityType,
        statKey,
        years: parsed.years ?? "all",
        series: series.map((result) => (result.ok ? result.data : null)).filter(Boolean),
      },
    };
  }

  const rows = await fetchTeamStats(parsed.years);
  const allowedStatKeys = selectNumericStatKeys(rows as Record<string, unknown>[], TEAM_DIMENSION_KEYS);
  const { selected } = resolveRequestedStatKeys([parsed.statKey], allowedStatKeys, [parsed.statKey]);
  const statKey = selected[0];

  if (!statKey) {
    return buildError(`Unsupported statKey "${parsed.statKey}" for team chart dataset.`);
  }

  const series = parsed.entityIds.map((entityId) => {
    const resolved = resolveCanonicalName(
      rows.map((row) => row.Team),
      entityId
    );

    if (!resolved.ok) {
      return buildError(resolved.error, resolved.suggestions);
    }

    const entityRows = sortRowsBySeasonAndRound(rows.filter((row) => row.Team === resolved.name)).slice(
      -MAX_CHART_POINTS
    );

    return {
      ok: true as const,
      data: {
        id: resolved.name,
        label: resolved.name,
        points: entityRows.map((row) => ({
          year: row.Year,
          round: row.Round_Label || `R${row.Round}`,
          label: `${row.Year} ${row.Round_Label || `R${row.Round}`}`,
          value: row[statKey],
        })),
      },
    };
  });

  const firstError = series.find((result) => !result.ok);
  if (firstError && !firstError.ok) {
    return firstError;
  }

  return {
    ok: true,
    data: {
      chartType: parsed.chartType,
      entityType: parsed.entityType,
      statKey,
      years: parsed.years ?? "all",
      series: series.map((result) => (result.ok ? result.data : null)).filter(Boolean),
    },
  };
}

async function runGetFantasySnapshot(
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const parsed = parseFantasySnapshotInput(input);
  const normalizedPositions = expandFantasyPositionFilters(parsed.positions);
  const [fantasyPlayers, lineupsProjections, coachPlayers, ownershipBaseline, playerImages, draw2026Data] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
    fetchPlayerImages(),
    loadDraw2026Data().catch(() => null),
  ]);

  const coachById = new Map(coachPlayers.map((player) => [player.id, player]));
  const ownershipDeltaByPlayerId = buildFantasyOwnershipDeltaByPlayerId(
    fantasyPlayers,
    ownershipBaseline
  );
  const topOwnershipRise = getTopFantasyOwnershipRise(ownershipDeltaByPlayerId);
  // Available rounds are driven by the lineups table (our primary projection source).
  // Fall back to the coach feed rounds if lineups has no data yet.
  const availableRounds = lineupsProjections.round != null
    ? [lineupsProjections.round]
    : [...new Set(coachPlayers.flatMap((player) => [
        ...Object.keys(player.projectedScores ?? {}),
        ...Object.keys(player.breakEvens ?? {}),
      ]))]
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);

  const requestedRound = parsed.round ?? null;
  const roundAvailable = requestedRound == null || availableRounds.includes(requestedRound);
  const fallbackRound = availableRounds[0] ?? null;
  const effectiveRound = roundAvailable ? requestedRound : fallbackRound;
  const includeByeOrUnavailable =
    parsed.sortBy === "ownership_delta_asc" && parsed.requireOwnershipRise === false;
  const requestedPlayerNames = (parsed.playerNames ?? []).filter((name) => normalizeLooseSearchValue(name).length > 0);

  const filtered = fantasyPlayers
    .filter((player) => (parsed.excludeLocked === true ? !player.locked : true))
    .filter((player) =>
      requestedPlayerNames.length > 0
        ? matchesRequestedFantasyPlayerName(player.name, requestedPlayerNames)
        : true
    )
    .filter((player) => (includeByeOrUnavailable ? true : !player.isBye))
    .filter((player) => (parsed.priceMax != null ? (player.cost ?? Number.MAX_SAFE_INTEGER) <= parsed.priceMax : true))
    .filter((player) =>
      normalizedPositions && normalizedPositions.length > 0
        ? player.positionLabels.some((label) =>
            normalizedPositions.some((requested) => normalizeSearchValue(requested) === normalizeSearchValue(label))
          )
        : true
    )
    .map((player) => {
      const coach = coachById.get(player.id);
      const defaultMetrics = getFantasyCoachRoundMetrics(coach);
      const round = effectiveRound ?? lineupsProjections.round ?? defaultMetrics.round;
      // Source projections from nrl.lineups when team lists are available, otherwise
      // from nrl.lineup_unaware_fantasy_projections by player name, matching the dashboard.
      const fallbackProjectionRaw = defaultMetrics.projection ?? player.projectedAvg ?? null;
      const projectionRaw =
        lineupsProjections.source === "lineup_unaware" && player.isBye
          ? null
          : lineupsProjections.projectionByPlayerId.get(player.id) ??
            lineupsProjections.projectionByPlayerName.get(normalizeLooseSearchValue(player.name)) ??
            fallbackProjectionRaw ??
            0;
      const lineupRole =
        lineupsProjections.source === "lineups"
          ? lineupsProjections.roleByPlayerId.get(player.id) ??
            lineupsProjections.roleByPlayerName.get(normalizeLooseSearchValue(player.name)) ??
            null
          : null;
      const breakEvenRaw =
        round != null
          ? (coach?.breakEvens?.[String(round)] ?? coach?.breakEven ?? null)
          : (coach?.breakEven ?? null);
      const ownershipDelta = ownershipDeltaByPlayerId.get(player.id) ?? null;
      const projection = hasAiProDataAccess(access.plan)
        ? applyFantasyProjectionOffset(projectionRaw, ownershipDelta, topOwnershipRise)
        : null;
      const breakEven = hasAiProDataAccess(access.plan)
        ? applyFantasyBreakEvenOffset(breakEvenRaw, player.id, round)
        : null;
      const projectionBaseline = hasAiProDataAccess(access.plan) ? projection : null;
      const team = resolveFantasyPlayerTeam(player.name, playerImages);
      const nextMajorByeRound = nextFantasyMajorByeRound(round);
      const playsNextMajorByeRound =
        nextMajorByeRound != null ? teamHasDrawFixture(draw2026Data, nextMajorByeRound, team) : null;
      const unavailableMajorByeRounds = FANTASY_MAJOR_BYE_ROUNDS.filter(
        (byeRound) => teamHasDrawFixture(draw2026Data, byeRound, team) === false
      );

      return {
        id: player.id,
        name: player.name,
        team,
        positions: player.positionLabels,
        position: player.positionLabel,
        price: player.cost,
        pricedAt: player.pricedAt,
        ownedBy: player.ownedBy,
        ownershipDelta,
        avgPoints: player.avgPoints,
        last3Avg: getFantasyLastThreeAverage(player.scoreHistory),
        projectedAvg: hasAiProDataAccess(access.plan) ? player.projectedAvg : null,
        gamesPlayed: player.gamesPlayed,
        round,
        namedToPlay: lineupRole != null,
        lineupRole,
        nextMajorByeRound,
        playsNextMajorByeRound,
        unavailableMajorByeRounds,
        projection,
        projectionVsPricedAt:
          typeof projectionBaseline === "number" &&
          Number.isFinite(projectionBaseline) &&
          typeof player.pricedAt === "number" &&
          Number.isFinite(player.pricedAt)
            ? roundToTwoDecimals(projectionBaseline - player.pricedAt)
            : null,
        breakEven,
      };
    })
    .filter((player) => (effectiveRound != null ? player.round === effectiveRound : true))
    .sort((a, b) => {
      const sortBy = parsed.sortBy ?? "ownership_delta_desc";
      if (sortBy === "avg_points_desc") {
        const pointsDelta = (b.avgPoints ?? -1) - (a.avgPoints ?? -1);
        if (pointsDelta !== 0) return pointsDelta;
      } else if (sortBy === "projected_avg_desc") {
        const projectionDelta = (b.projectedAvg ?? -1) - (a.projectedAvg ?? -1);
        if (projectionDelta !== 0) return projectionDelta;
      } else if (sortBy === "projection_desc") {
        const projectionDelta = (b.projection ?? -1) - (a.projection ?? -1);
        if (projectionDelta !== 0) return projectionDelta;
      } else if (sortBy === "projection_vs_priced_at_desc") {
        const valueDelta = (b.projectionVsPricedAt ?? -Infinity) - (a.projectionVsPricedAt ?? -Infinity);
        if (valueDelta !== 0) return valueDelta;
      } else if (sortBy === "price_asc") {
        const priceDelta = (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
        if (priceDelta !== 0) return priceDelta;
      } else if (sortBy === "ownership_delta_asc") {
        const aDelta = a.ownershipDelta ?? 0;
        const bDelta = b.ownershipDelta ?? 0;
        if (aDelta !== bDelta) return aDelta - bDelta;
      } else {
        const aDelta = a.ownershipDelta ?? 0;
        const bDelta = b.ownershipDelta ?? 0;
        if (bDelta !== aDelta) return bDelta - aDelta;
      }

      const avgPointsDelta = (b.avgPoints ?? -1) - (a.avgPoints ?? -1);
      if (avgPointsDelta !== 0) return avgPointsDelta;
      return (b.ownedBy ?? -1) - (a.ownedBy ?? -1);
    });

  const ownershipFiltered =
    parsed.requireOwnershipRise === true
      ? filtered.filter((player) => (player.ownershipDelta ?? 0) > 0)
      : filtered;

  const limit = parsed.limit ?? 12;
  const players = ownershipFiltered.slice(0, limit);

  return {
    ok: true,
    data: {
      requestedRound,
      effectiveRound,
      roundAvailable,
      availableRounds,
      drawContext: {
        season: 2026,
        majorByeRounds: FANTASY_MAJOR_BYE_ROUNDS,
      },
      sortBy: parsed.sortBy ?? "ownership_delta_desc",
      requireOwnershipRise: parsed.requireOwnershipRise ?? false,
      excludeLocked: parsed.excludeLocked ?? false,
      rowCount: players.length,
      access: {
        plan: access.plan,
        projectionsEnabled: hasAiProDataAccess(access.plan),
      },
      warnings: [
        ...(!roundAvailable && requestedRound != null
          ? [`Round ${requestedRound} fantasy coach data is not available in the current feed.`]
          : []),
        ...(hasAiProDataAccess(access.plan)
          ? []
          : ["Sign up to Pro to access projections and breakevens."]),
      ],
      players,
    },
  };
}

const CORE_AI_TOOLS: AiTool[] = [
  {
    name: "list_available_years",
    description: "List the available seasons that can be used in bounded AI data queries.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
    execute: () => runListAvailableYears(),
  },
  {
    name: "get_player_stats",
    description: "Fetch bounded player stat rows for one player with overall summaries, season-by-season summaries, totals, and a compact row sample. Returned rows include season, round, opponent, team, position, minutes played, and home/away metadata so the model can compute splits and derived rates such as per-game or per-80. Supports filters for opponent, position, finals, minutes over/under, and teammate with/without splits.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["player", "years", "statKeys", "filters"],
      properties: {
        player: { type: "string" },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        statKeys: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_STAT_KEYS,
        },
        filters: PLAYER_STAT_FILTERS_SCHEMA,
      },
    },
    execute: runGetPlayerStats,
  },
  {
    name: "get_team_stats",
    description: "Fetch bounded team stat rows for one team with overall summaries, season-by-season summaries, totals, and a compact row sample. Useful for team-vs-team comparisons and multi-season average questions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["team", "years", "statKeys"],
      properties: {
        team: { type: "string" },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        statKeys: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_STAT_KEYS,
        },
      },
    },
    execute: runGetTeamStats,
  },
  {
    name: "get_team_home_away_win_rates",
    description: "Return per-team home and away wins, games, win rates, and the gap between them across bounded seasons. Use this for questions about home vs away win-rate differences instead of composing multiple grouped queries.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["team", "years", "limit", "sortOrder"],
      properties: {
        team: { type: ["string", "null"] },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        limit: {
          type: ["number", "null"],
          minimum: 1,
          maximum: MAX_RESULT_ROWS,
        },
        sortOrder: {
          anyOf: [
            {
              type: "string",
              enum: ["asc", "desc"],
            },
            { type: "null" },
          ],
        },
      },
    },
    execute: runGetTeamHomeAwayWinRates,
  },
  {
    name: "get_team_possession_battle_records",
    description: "Return per-team counts and win rates for possession battle wins, defined as Possession % greater than Opponent Possession %. Use this for questions like which teams win the possession battle most often this season.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["team", "years", "limit", "sortOrder"],
      properties: {
        team: { type: ["string", "null"] },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        limit: {
          type: ["number", "null"],
          minimum: 1,
          maximum: MAX_RESULT_ROWS,
        },
        sortOrder: {
          anyOf: [
            {
              type: "string",
              enum: ["asc", "desc"],
            },
            { type: "null" },
          ],
        },
      },
    },
    execute: runGetTeamPossessionBattleRecords,
  },
  {
    name: "get_team_short_turnaround_records",
    description: "Return team records on short turnarounds by deriving the days between each team's consecutive matches from the schedule. Use this for questions like worst record on 6 days or fewer this season.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["team", "years", "maxDays", "limit", "sortOrder"],
      properties: {
        team: { type: ["string", "null"] },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        maxDays: {
          type: ["number", "null"],
          minimum: 1,
        },
        limit: {
          type: ["number", "null"],
          minimum: 1,
          maximum: MAX_RESULT_ROWS,
        },
        sortOrder: {
          anyOf: [
            {
              type: "string",
              enum: ["asc", "desc"],
            },
            { type: "null" },
          ],
        },
      },
    },
    execute: runGetTeamShortTurnaroundRecords,
  },
  {
    name: "get_overall_stats",
    description: "Fetch bounded league-wide player or team stats without requiring a specific player or team, including overall and season-by-season summaries for the requested stat keys.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["entityType", "years", "statKeys"],
      properties: {
        entityType: {
          anyOf: [
            {
              type: "string",
              enum: SUPPORTED_ENTITY_TYPES,
            },
            { type: "null" },
          ],
        },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        statKeys: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_STAT_KEYS,
        },
      },
    },
    execute: runGetOverallStats,
  },
  {
    name: "rank_teams_by_stat",
    description: "Rank teams by average value for a requested stat across bounded seasons, useful for questions like which team averages the most of a metric.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["statKey", "years", "limit", "sortOrder"],
      properties: {
        statKey: { type: "string" },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        limit: {
          type: ["number", "null"],
        },
        sortOrder: {
          anyOf: [
            {
              type: "string",
              enum: ["asc", "desc"],
            },
            { type: "null" },
          ],
        },
      },
    },
    execute: runRankTeamsByStat,
  },
  {
    name: "rank_players_by_stat",
    description: "Rank players by a requested stat across bounded seasons. Supports aggregation by average, total, or single-game max, plus optional derived rate rankings by per-game or per-80 with an optional minimum games threshold. Returns games, totals, minutes, and rate fields so the model can explain the ranking. Supports the same player-log filters as get_player_stats, including opponent, position, finals, minutes, and teammate with/without filters.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["statKey", "years", "limit", "sortOrder", "aggregation", "rateBasis", "minGames", "minAverageMinutes", "filters"],
      properties: {
        statKey: { type: "string" },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        limit: {
          type: ["number", "null"],
        },
        sortOrder: {
          anyOf: [
            {
              type: "string",
              enum: ["asc", "desc"],
            },
            { type: "null" },
          ],
        },
        aggregation: {
          anyOf: [
            {
              type: "string",
              enum: ["avg", "max", "total"],
            },
            { type: "null" },
          ],
        },
        rateBasis: {
          anyOf: [
            {
              type: "string",
              enum: ["per_game", "per_80"],
            },
            { type: "null" },
          ],
        },
        minGames: {
          type: ["number", "null"],
        },
        minAverageMinutes: {
          type: ["number", "null"],
        },
        filters: PLAYER_STAT_FILTERS_SCHEMA,
      },
    },
    execute: runRankPlayersByStat,
  },
  {
    name: "rank_players_when_team_wins_possession",
    description: "Rank players by a player stat only in matches where their own team won the possession battle, defined as team Possession % greater than Opponent Possession %. Use this for questions like which wingers have the best try-scoring record when their team wins possession.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["statKey", "years", "limit", "position", "minGames"],
      properties: {
        statKey: { type: "string" },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        limit: { type: ["number", "null"], minimum: 1, maximum: MAX_RESULT_ROWS },
        position: { type: ["string", "null"] },
        minGames: { type: ["number", "null"], minimum: 1 },
      },
    },
    execute: runRankPlayersWhenTeamWinsPossession,
  },
  {
    name: "get_player_base_fantasy_ratios",
    description: "Return leaguewide player rankings for base-to-fantasy ratio, where base fantasy points are defined as floor(all run metres / 10) + tackles made + floor(kicking metres / 30) + (conversions * 2), divided by fantasy score. Use this for questions about which players have the highest or lowest base-to-fantasy ratio instead of trying to compose the ratio manually.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["years", "limit", "minGames", "position"],
      properties: {
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        limit: {
          type: ["number", "null"],
          minimum: 1,
          maximum: MAX_RESULT_ROWS,
        },
        minGames: {
          type: ["number", "null"],
          minimum: 1,
        },
        position: { type: ["string", "null"] },
      },
    },
    execute: runGetPlayerBaseFantasyRatios,
  },
  {
    name: "get_player_team_stat_share",
    description: "Return each player's share percentage of a team total by comparing summed player stat keys against a summed team stat key across bounded seasons. Use this for questions like which players account for more than X% of team tries, points, or line breaks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["team", "years", "playerStatKeys", "teamStatKey", "minSharePercent", "limit", "sortOrder"],
      properties: {
        team: { type: ["string", "null"] },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        playerStatKeys: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_STAT_KEYS,
        },
        teamStatKey: { type: "string" },
        minSharePercent: { type: ["number", "null"], minimum: 0 },
        limit: { type: ["number", "null"], minimum: 1, maximum: MAX_RESULT_ROWS },
        sortOrder: {
          anyOf: [
            {
              type: "string",
              enum: ["asc", "desc"],
            },
            { type: "null" },
          ],
        },
      },
    },
    execute: runGetPlayerTeamStatShare,
  },
  {
    name: "get_betting_snapshot",
    description: "Fetch a bounded betting snapshot with optional market and date filters.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["market", "dateFrom", "dateTo"],
      properties: {
        market: {
          anyOf: [
            {
              type: "string",
              enum: SUPPORTED_BETTING_MARKETS,
            },
            { type: "null" },
          ],
        },
        dateFrom: { type: ["string", "null"] },
        dateTo: { type: ["string", "null"] },
      },
    },
    execute: runGetBettingSnapshot,
  },
  {
    name: "get_fantasy_snapshot",
    description: "Fetch a bounded fantasy player snapshot for buy/trade/value questions, including price, pricedAt, ownership, average fantasy points, ownership/transfer momentum, 2026 draw major-bye availability, and round-specific projection/breakeven data when the user's plan allows it. Here pricedAt means the fantasy points average implied by the current price (price / 12725), so projection vs pricedAt is a value comparison. Supports position groups like forwards or backs, optional price caps, sorting by positive ownership momentum for buys or negative ownership momentum for sells, average points, projection-vs-pricedAt value edge, optional exclusion of locked players for actionable buy lists, and an optional ownership-rise-only filter when the user explicitly wants trade momentum. Use sortBy projection_desc when the user asks for best/highest projection for a specific round — this sorts by the actual round-specific projection value, not the season average. Use projected_avg_desc only when the user asks about season projected average.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["round", "positions", "priceMax", "sortBy", "requireOwnershipRise", "excludeLocked", "limit"],
      properties: {
        round: { type: ["number", "null"] },
        playerNames: {
          description: "Optional real or screenshot-visible player names to fetch directly. Accepts full names and initial-plus-surname forms like J. Hughes.",
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: 40,
        },
        positions: {
          description: "Fantasy position filters. Use the app's position labels: HOK (hooker), MID (middle/prop/lock), EDG (edge/second row/2RF), HLF (halfback/five-eighth/halves), CTR (centre), WFB (winger/fullback). Group aliases also accepted: 'forwards' (HOK+MID+EDG), 'backs' (CTR+WFB), 'halves' (HLF). Map natural language like 'second row' -> EDG, 'lock' -> MID, 'prop' -> MID, 'hooker' -> HOK.",
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: 4,
        },
        priceMax: { type: ["number", "null"] },
        sortBy: {
          anyOf: [
            {
              type: "string",
              enum: ["ownership_delta_desc", "ownership_delta_asc", "avg_points_desc", "projected_avg_desc", "projection_desc", "projection_vs_priced_at_desc", "price_asc"],
            },
            { type: "null" },
          ],
        },
        requireOwnershipRise: { type: ["boolean", "null"] },
        excludeLocked: { type: ["boolean", "null"] },
        limit: { type: ["number", "null"] },
      },
    },
    execute: runGetFantasySnapshot,
  },
  {
    name: "compare_players",
    description: "Compare 2 to 4 players across a small set of bounded average stat summaries.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["players", "stats", "years"],
      properties: {
        players: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: MAX_ENTITY_IDS,
        },
        stats: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_STAT_KEYS,
        },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
      },
    },
    execute: runComparePlayers,
  },
  {
    name: "build_chart_dataset",
    description: "Build a compact player or team chart dataset with capped point counts for frontend rendering.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["chartType", "entityType", "entityIds", "statKey", "years"],
      properties: {
        chartType: {
          type: "string",
          enum: SUPPORTED_CHART_TYPES,
        },
        entityType: {
          type: "string",
          enum: SUPPORTED_ENTITY_TYPES,
        },
        entityIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_ENTITY_IDS,
        },
        statKey: { type: "string" },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
      },
    },
    execute: runBuildChartDataset,
  },
];

const AI_TOOLS: AiTool[] = [...CAPABILITY_AI_TOOLS, ...CORE_AI_TOOLS];

const AI_TOOL_MAP = new Map(AI_TOOLS.map((tool) => [tool.name, tool]));

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = AI_TOOLS.map(
  ({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })
);

export async function executeAiTool(
  toolName: string,
  input: unknown,
  access: AiToolAccessPolicy
): Promise<AiToolExecutionResult> {
  const tool = AI_TOOL_MAP.get(toolName);

  if (!tool) {
    return buildError(`Unknown AI tool "${toolName}".`);
  }

  try {
    return await tool.execute(input, access);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool execution error.";
    return buildError(message);
  }
}

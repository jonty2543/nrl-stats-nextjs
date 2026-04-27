import { promises as fs } from "node:fs";
import path from "node:path";

import { COLUMN_RENAME_MAP, PLAYER_STATS, TEAM_STATS } from "@/lib/data/constants";
import { fetchAvailableYears, fetchMatches, fetchPlayerStats, fetchTeamStats } from "@/lib/supabase/queries";
import type { AiTool, AiToolExecutionFailure, AiToolExecutionResult } from "@/lib/ai/tools/types";

const MAX_YEARS = 6;
const MAX_FIELDS = 16;
const MAX_FILTERS = 8;
const MAX_GROUP_FIELDS = 4;
const MAX_AGGREGATIONS = 6;
const MAX_SORT_FIELDS = 4;
const MAX_WINDOW_FIELDS = 6;
const MAX_QUERY_ROWS = 40;
const MAX_TRANSFORM_ROWS = 80;
const MAX_SEARCH_RESULTS = 12;
const FINAL_ANSWER_PREFIX = "FINAL ANSWER:";
const SEARCHABLE_CODE_ROOTS = ["src/lib/data", "src/lib/supabase", "src/lib/ai", "src/app/api"];
const SEARCHABLE_EXTENSIONS = new Set([".ts", ".tsx", ".md"]);

const DATASET_NAMES = ["player_stats", "team_stats", "matches"] as const;
const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains",
] as const;
const AGGREGATION_OPERATORS = ["sum", "avg", "min", "max", "count"] as const;
const SORT_DIRECTIONS = ["asc", "desc"] as const;

type DatasetName = (typeof DATASET_NAMES)[number];
type FilterOperator = (typeof FILTER_OPERATORS)[number];
type AggregationOperator = (typeof AGGREGATION_OPERATORS)[number];
type SortDirection = (typeof SORT_DIRECTIONS)[number];
type ScalarValue = string | number | boolean | null;
type RowRecord = Record<string, string | number | boolean | null>;

interface QueryFilterInput {
  field: string;
  op: FilterOperator;
  value?: ScalarValue;
  values?: ScalarValue[];
}

interface QueryAggregationInput {
  field?: string | null;
  op: AggregationOperator;
  as?: string | null;
}

interface QuerySortInput {
  field: string;
  direction?: SortDirection | null;
}

interface QueryLagInput {
  field: string;
  as?: string | null;
  offset?: number | null;
}

interface QueryWindowInput {
  partitionBy?: string[];
  orderBy?: QuerySortInput[];
  lag?: QueryLagInput[];
}

interface QueryDataInput {
  dataset: DatasetName;
  years?: string[];
  fields?: string[];
  filters?: QueryFilterInput[];
  window?: QueryWindowInput | null;
  postFilters?: QueryFilterInput[];
  groupBy?: string[];
  aggregations?: QueryAggregationInput[];
  sort?: QuerySortInput[];
  limit?: number | null;
}

interface TransformCalculationInput {
  field?: string | null;
  op: AggregationOperator;
  as?: string | null;
}

interface RunTransformInput {
  rows: RowRecord[];
  groupBy?: string[];
  calculations?: TransformCalculationInput[];
  sortBy?: string | null;
  sortOrder?: SortDirection | null;
  limit?: number | null;
  addRank?: boolean | null;
}

interface SearchCodebaseInput {
  query: string;
  limit?: number | null;
}

interface SubmitFinalAnswerInput {
  answer: string;
}

interface DatasetDefinition {
  name: DatasetName;
  description: string;
  grain: string;
  sourceType: string;
  yearField: string;
  primaryEntityFields: string[];
  defaultFields: string[];
  dimensionKeys: string[];
  numericKeys: string[];
  manualAliases: Record<string, string>;
  fetchRows: (years?: string[]) => Promise<RowRecord[]>;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function compactSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveSeasonContext(availableYears: string[]): {
  currentSeason: string | null;
  previousSeason: string | null;
} {
  const sortedYears = [...availableYears].sort((a, b) => Number(a) - Number(b));

  return {
    currentSeason: sortedYears[sortedYears.length - 1] ?? null,
    previousSeason: sortedYears.length > 1 ? sortedYears[sortedYears.length - 2] : null,
  };
}

function asObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
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

function parseOptionalBoolean(record: Record<string, unknown>, fieldName: string): boolean | undefined {
  const value = record[fieldName];
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
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

function parseScalarValue(value: unknown, fieldName: string): ScalarValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  throw new Error(`${fieldName} must be a string, number, boolean, or null.`);
}

function parseOptionalFilterArray(
  record: Record<string, unknown>,
  fieldName: string
): QueryFilterInput[] | undefined {
  const value = record[fieldName];
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  if (value.length > MAX_FILTERS) {
    throw new Error(`${fieldName} supports at most ${MAX_FILTERS} filters.`);
  }

  return value.map((item, index) => {
    const filter = asObject(item, `${fieldName}[${index}]`);
    const values = filter.values;

    return {
      field: parseRequiredString(filter, "field"),
      op: parseRequiredEnumValue(filter, "op", FILTER_OPERATORS),
      value: filter.value == null ? undefined : parseScalarValue(filter.value, "value"),
      values:
        values == null
          ? undefined
          : (() => {
              if (!Array.isArray(values)) {
                throw new Error(`values in ${fieldName}[${index}] must be an array.`);
              }

              return values.map((entry) => parseScalarValue(entry, "values"));
            })(),
    };
  });
}

function parseOptionalAggregationArray(
  record: Record<string, unknown>,
  fieldName: string,
  maxItems: number
): QueryAggregationInput[] | undefined {
  const value = record[fieldName];
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  if (value.length > maxItems) {
    throw new Error(`${fieldName} supports at most ${maxItems} items.`);
  }

  return value.map((item, index) => {
    const aggregation = asObject(item, `${fieldName}[${index}]`);
    return {
      field: parseOptionalString(aggregation, "field") ?? null,
      op: parseRequiredEnumValue(aggregation, "op", AGGREGATION_OPERATORS),
      as: parseOptionalString(aggregation, "as") ?? null,
    };
  });
}

function parseOptionalSortArray(
  record: Record<string, unknown>,
  fieldName: string
): QuerySortInput[] | undefined {
  const value = record[fieldName];
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  if (value.length > MAX_SORT_FIELDS) {
    throw new Error(`${fieldName} supports at most ${MAX_SORT_FIELDS} items.`);
  }

  return value.map((item, index) => {
    const sort = asObject(item, `${fieldName}[${index}]`);
    return {
      field: parseRequiredString(sort, "field"),
      direction: parseEnumValue(sort, "direction", SORT_DIRECTIONS) ?? "asc",
    };
  });
}

function parseOptionalWindowInput(record: Record<string, unknown>, fieldName: string): QueryWindowInput | null {
  const value = record[fieldName];
  if (value == null) {
    return null;
  }

  const window = asObject(value, fieldName);
  const lagValue = window.lag;
  if (lagValue != null && !Array.isArray(lagValue)) {
    throw new Error(`${fieldName}.lag must be an array.`);
  }

  const lag = Array.isArray(lagValue)
    ? lagValue.map((item, index) => {
        const lagItem = asObject(item, `${fieldName}.lag[${index}]`);
        const offset = parseOptionalInteger(lagItem, "offset") ?? 1;
        if (offset < 1 || offset > 10) {
          throw new Error(`${fieldName}.lag[${index}].offset must be between 1 and 10.`);
        }

        return {
          field: parseRequiredString(lagItem, "field"),
          as: parseOptionalString(lagItem, "as") ?? null,
          offset,
        };
      })
    : undefined;

  if ((lag?.length ?? 0) > MAX_WINDOW_FIELDS) {
    throw new Error(`${fieldName}.lag supports at most ${MAX_WINDOW_FIELDS} items.`);
  }

  return {
    partitionBy: parseOptionalStringArray(window, "partitionBy", MAX_GROUP_FIELDS),
    orderBy: parseOptionalSortArray(window, "orderBy"),
    lag,
  };
}

function parseRowsJson(value: unknown): RowRecord[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("rowsJson must be a non-empty JSON string.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("rowsJson must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("rowsJson must decode to an array of objects.");
  }

  if (parsed.length > MAX_TRANSFORM_ROWS) {
    throw new Error(`rowsJson supports at most ${MAX_TRANSFORM_ROWS} rows.`);
  }

  return parsed.map((item, index) => {
    const row = asObject(item, `rowsJson[${index}]`);
    return Object.fromEntries(
      Object.entries(row).map(([key, entryValue]) => [key, parseScalarValue(entryValue, key)])
    );
  });
}

function buildError(error: string, suggestions?: string[]): AiToolExecutionFailure {
  return suggestions && suggestions.length > 0 ? { ok: false, error, suggestions } : { ok: false, error };
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundToTwoDecimals(values.reduce((sum, value) => sum + value, 0) / values.length);
}

const REVERSE_COLUMN_RENAME_MAP = Object.entries(COLUMN_RENAME_MAP).reduce<Record<string, string[]>>(
  (accumulator, [rawKey, displayKey]) => {
    const bucket = accumulator[displayKey] ?? [];
    bucket.push(rawKey);
    accumulator[displayKey] = bucket;
    return accumulator;
  },
  {}
);

const DATASET_DEFINITIONS: Record<DatasetName, DatasetDefinition> = {
  player_stats: {
    name: "player_stats",
    description: "Per-player game logs with player, team, opponent, minutes, fantasy, and detailed attacking and defensive stats.",
    grain: "One row per player appearance.",
    sourceType: "Supabase nrl.player_stats table.",
    yearField: "Year",
    primaryEntityFields: ["Name", "Team", "Position"],
    defaultFields: ["Name", "Team", "Position", "Year", "Round", "Fantasy", "Mins Played", "Tries", "Try Assists"],
    dimensionKeys: ["Name", "Team", "Number", "Position", "Year", "Round", "Round_Label", "Opponent", "Home Team", "Away Team"],
    numericKeys: [...PLAYER_STATS],
    manualAliases: {
      player: "Name",
      minutes: "Mins Played",
      min: "Mins Played",
      fantasy_points: "Fantasy",
      "fantasy points": "Fantasy",
      total_points: "Fantasy",
      "total points": "Fantasy",
    },
    fetchRows: async (years?: string[]) => (await fetchPlayerStats(years)) as unknown as RowRecord[],
  },
  team_stats: {
    name: "team_stats",
    description: "Per-team match stats derived from team rows in the matches table, suitable for team totals, averages, and rankings.",
    grain: "One row per team per match.",
    sourceType: "Derived from Supabase nrl.matches rows.",
    yearField: "Year",
    primaryEntityFields: ["Team", "Opponent"],
    defaultFields: ["Team", "Year", "Round", "Date", "Home/Away", "Opponent", "Result", "Points", "Opponent Points", "Margin", "Possession %"],
    dimensionKeys: ["Team", "Year", "Round", "Date", "Round_Label", "Home/Away", "Opponent", "Result"],
    numericKeys: [...TEAM_STATS],
    manualAliases: {
      date: "Date",
      "match date": "Date",
      home: "Home/Away",
      away: "Home/Away",
      is_home: "Home/Away",
      "home away": "Home/Away",
      location: "Home/Away",
      score: "Points",
      "points scored": "Points",
      "opponent score": "Opponent Points",
      "points conceded": "Opponent Points",
      "against": "Opponent Points",
      "score margin": "Margin",
      "winning margin": "Margin",
      "losing margin": "Margin",
      differential: "Point Differential",
      "point difference": "Point Differential",
      "points differential": "Point Differential",
      possession: "Possession %",
      "possession percentage": "Possession %",
      "possession percent": "Possession %",
      "possession pct": "Possession %",
      "possession battle": "Possession %",
      "opponent possession": "Opponent Possession %",
      "opposition possession": "Opponent Possession %",
      "time in possession": "Time In Possession",
      "completion rate": "Completion Rate",
      completions: "Completion Rate",
      linebreaks: "Line Breaks",
      "try assists": "Try Assists",
    },
    fetchRows: async (years?: string[]) => (await fetchTeamStats(years)) as unknown as RowRecord[],
  },
  matches: {
    name: "matches",
    description: "Fixture-level match results with date, home team, away team, and both scores. For team result, record, or margin questions, prefer team_stats because it has one row per team per match with Result and Margin.",
    grain: "One row per match.",
    sourceType: "Paired view built from Supabase nrl.matches rows.",
    yearField: "Year",
    primaryEntityFields: ["Home", "Away"],
    defaultFields: ["Year", "Round", "Date", "Home", "Home_Score", "Away", "Away_Score"],
    dimensionKeys: ["Year", "Round", "Round_Label", "Date", "Home", "Away", "Venue"],
    numericKeys: ["Home_Score", "Away_Score"],
    manualAliases: {
      "home team": "Home",
      "away team": "Away",
      "home score": "Home_Score",
      "away score": "Away_Score",
      "home points": "Home_Score",
      "away points": "Away_Score",
      "match date": "Date",
    },
    fetchRows: async (years?: string[]) => (await fetchMatches(years)) as unknown as RowRecord[],
  },
};

function addAlias(map: Map<string, string>, alias: string, field: string) {
  const normalized = normalizeSearchValue(alias);
  const compact = compactSearchValue(alias);

  if (normalized) {
    map.set(normalized, field);
  }
  if (compact) {
    map.set(compact, field);
  }
}

function buildFieldAliasMap(dataset: DatasetDefinition, availableFields: string[]): Map<string, string> {
  const map = new Map<string, string>();

  availableFields.forEach((field) => {
    addAlias(map, field, field);
    addAlias(map, field.replace(/\s+/g, "_"), field);
    addAlias(map, field.replace(/\s+/g, ""), field);

    const rawAliases = REVERSE_COLUMN_RENAME_MAP[field] ?? [];
    rawAliases.forEach((alias) => addAlias(map, alias, field));
  });

  Object.entries(dataset.manualAliases).forEach(([alias, field]) => {
    if (availableFields.includes(field)) {
      addAlias(map, alias, field);
    }
  });

  return map;
}

function resolveFieldName(
  requestedField: string,
  dataset: DatasetDefinition,
  availableFields: string[]
): string | null {
  const aliasMap = buildFieldAliasMap(dataset, availableFields);
  return (
    aliasMap.get(normalizeSearchValue(requestedField)) ??
    aliasMap.get(compactSearchValue(requestedField)) ??
    null
  );
}

function resolveFieldNames(
  requestedFields: string[] | undefined,
  dataset: DatasetDefinition,
  availableFields: string[],
  fallback: string[]
): { selected: string[]; ignored: string[] } {
  if (!requestedFields || requestedFields.length === 0) {
    return {
      selected: fallback.filter((field) => availableFields.includes(field)),
      ignored: [],
    };
  }

  const selected: string[] = [];
  const ignored: string[] = [];

  requestedFields.forEach((field) => {
    const resolved = resolveFieldName(field, dataset, availableFields);
    if (!resolved) {
      ignored.push(field);
      return;
    }

    if (!selected.includes(resolved)) {
      selected.push(resolved);
    }
  });

  return { selected, ignored };
}

function getAvailableFields(rows: RowRecord[], dataset: DatasetDefinition): string[] {
  const row = rows[0];
  if (row) {
    return Object.keys(row);
  }

  return dedupeStrings([...dataset.dimensionKeys, ...dataset.numericKeys]);
}

function detectColumnType(values: Array<string | number | boolean | null>): string {
  const nonNullValues = values.filter((value) => value != null);
  if (nonNullValues.length === 0) return "unknown";

  if (nonNullValues.every((value) => typeof value === "number")) {
    return "number";
  }

  if (nonNullValues.every((value) => typeof value === "boolean")) {
    return "boolean";
  }

  if (
    nonNullValues.every(
      (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    )
  ) {
    return "date";
  }

  return "string";
}

function buildColumnMetadata(dataset: DatasetDefinition, rows: RowRecord[]) {
  const fields = getAvailableFields(rows, dataset);
  return fields.map((field) => {
    const values = rows.slice(0, 12).map((row) => row[field] ?? null);
    const rawAliases = REVERSE_COLUMN_RENAME_MAP[field] ?? [];
    const aliases = dedupeStrings(
      [field.replace(/\s+/g, "_"), ...rawAliases]
        .concat(
          Object.entries(dataset.manualAliases)
            .filter(([, target]) => target === field)
            .map(([alias]) => alias)
        )
    );

    return {
      name: field,
      type: detectColumnType(values),
      role: dataset.numericKeys.includes(field) ? "metric" : "dimension",
      aliases,
      sampleValues: dedupeStrings(values.map((value) => String(value ?? ""))).slice(0, 3),
    };
  });
}

function compareScalarValues(left: ScalarValue, right: ScalarValue): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;

  const leftNumber =
    typeof left === "number"
      ? left
      : typeof left === "string" && left.trim() !== ""
        ? Number(left)
        : NaN;
  const rightNumber =
    typeof right === "number"
      ? right
      : typeof right === "string" && right.trim() !== ""
        ? Number(right)
        : NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
}

function matchesFilter(rowValue: ScalarValue, filter: QueryFilterInput): boolean {
  const singleValue = filter.value;
  const multiValues = filter.values ?? [];

  switch (filter.op) {
    case "eq":
      return compareScalarValues(rowValue, singleValue ?? null) === 0;
    case "neq":
      return compareScalarValues(rowValue, singleValue ?? null) !== 0;
    case "gt":
      return compareScalarValues(rowValue, singleValue ?? null) > 0;
    case "gte":
      return compareScalarValues(rowValue, singleValue ?? null) >= 0;
    case "lt":
      return compareScalarValues(rowValue, singleValue ?? null) < 0;
    case "lte":
      return compareScalarValues(rowValue, singleValue ?? null) <= 0;
    case "in":
      return multiValues.some((value) => compareScalarValues(rowValue, value) === 0);
    case "not_in":
      return multiValues.every((value) => compareScalarValues(rowValue, value) !== 0);
    case "contains":
      return String(rowValue ?? "")
        .toLowerCase()
        .includes(String(singleValue ?? "").toLowerCase());
    default:
      return false;
  }
}

function applyQueryFilters(
  rows: RowRecord[],
  dataset: DatasetDefinition,
  filters: QueryFilterInput[] | undefined
): { rows: RowRecord[]; ignored: string[] } {
  if (!filters || filters.length === 0) {
    return { rows, ignored: [] };
  }

  const availableFields = getAvailableFields(rows, dataset);
  const ignored: string[] = [];
  let filteredRows = rows;

  filters.forEach((filter) => {
    const resolvedField = resolveFieldName(filter.field, dataset, availableFields);
    if (!resolvedField) {
      ignored.push(filter.field);
      return;
    }

    filteredRows = filteredRows.filter((row) =>
      matchesFilter((row[resolvedField] as ScalarValue | undefined) ?? null, filter)
    );
  });

  return { rows: filteredRows, ignored };
}

function aggregateRows(
  rows: RowRecord[],
  groupBy: string[],
  aggregations: QueryAggregationInput[]
): RowRecord[] {
  const groups = new Map<string, RowRecord[]>();

  rows.forEach((row) => {
    const key = JSON.stringify(groupBy.map((field) => row[field] ?? null));
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(row);
      return;
    }

    groups.set(key, [row]);
  });

  return [...groups.entries()].map(([key, groupedRows]) => {
    const groupValues = JSON.parse(key) as ScalarValue[];
    const nextRow: RowRecord = {};

    groupBy.forEach((field, index) => {
      nextRow[field] = groupValues[index] ?? null;
    });

    aggregations.forEach((aggregation) => {
      const alias =
        aggregation.as?.trim() ||
        `${aggregation.op}_${aggregation.field && aggregation.field.trim().length > 0 ? aggregation.field : "rows"}`;

      const numericValues =
        aggregation.field && aggregation.op !== "count"
          ? groupedRows
              .map((row) => row[aggregation.field ?? ""])
              .filter((value): value is number => typeof value === "number")
          : [];

      switch (aggregation.op) {
        case "count":
          nextRow[alias] = groupedRows.length;
          break;
        case "sum":
          nextRow[alias] = roundToTwoDecimals(
            numericValues.reduce((sum, value) => sum + value, 0)
          );
          break;
        case "avg":
          nextRow[alias] = average(numericValues);
          break;
        case "min":
          nextRow[alias] = numericValues.length > 0 ? Math.min(...numericValues) : null;
          break;
        case "max":
          nextRow[alias] = numericValues.length > 0 ? Math.max(...numericValues) : null;
          break;
      }
    });

    return nextRow;
  });
}

function applyWindowLag(
  rows: RowRecord[],
  dataset: DatasetDefinition,
  window: QueryWindowInput | null | undefined,
  availableFields: string[]
): { rows: RowRecord[]; ignoredWindowFields: string[] } {
  if (!window || !window.lag || window.lag.length === 0) {
    return { rows, ignoredWindowFields: [] };
  }

  const ignoredWindowFields: string[] = [];
  const resolveWindowField = (field: string): string | null => {
    const resolved = resolveFieldName(field, dataset, availableFields);
    if (!resolved) ignoredWindowFields.push(field);
    return resolved;
  };

  const partitionBy = (window.partitionBy ?? [])
    .map(resolveWindowField)
    .filter((field): field is string => field !== null);
  const orderBy = (window.orderBy ?? [])
    .map((sort) => {
      const field = resolveWindowField(sort.field);
      return field ? { field, direction: sort.direction ?? "asc" } : null;
    })
    .filter((sort): sort is { field: string; direction: SortDirection } => sort !== null);
  const lagFields = window.lag
    .map((lag) => {
      const field = resolveWindowField(lag.field);
      if (!field) return null;
      return {
        field,
        as: lag.as?.trim() || `Previous ${field}`,
        offset: lag.offset ?? 1,
      };
    })
    .filter((lag): lag is { field: string; as: string; offset: number } => lag !== null);

  if (orderBy.length === 0 || lagFields.length === 0) {
    return { rows, ignoredWindowFields };
  }

  const partitions = new Map<string, RowRecord[]>();
  rows.forEach((row) => {
    const key = JSON.stringify(partitionBy.map((field) => row[field] ?? null));
    const bucket = partitions.get(key);
    if (bucket) {
      bucket.push(row);
      return;
    }

    partitions.set(key, [row]);
  });

  const indexedRows = new Map<RowRecord, RowRecord>();
  partitions.forEach((partitionRows) => {
    const orderedRows = sortRows(partitionRows, orderBy, "asc");
    orderedRows.forEach((row, index) => {
      const nextRow = { ...row };
      lagFields.forEach((lag) => {
        const priorRow = orderedRows[index - lag.offset];
        nextRow[lag.as] = priorRow ? (priorRow[lag.field] as ScalarValue | undefined) ?? null : null;
      });
      indexedRows.set(row, nextRow);
    });
  });

  return {
    rows: rows.map((row) => indexedRows.get(row) ?? row),
    ignoredWindowFields,
  };
}

function sortRows(
  rows: RowRecord[],
  sorts: QuerySortInput[] | undefined,
  fallbackDirection: SortDirection = "desc"
): RowRecord[] {
  if (!sorts || sorts.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const sort of sorts) {
      const delta = compareScalarValues(
        (left[sort.field] as ScalarValue | undefined) ?? null,
        (right[sort.field] as ScalarValue | undefined) ?? null
      );

      if (delta !== 0) {
        return sort.direction === "desc" ? -delta : delta;
      }
    }

    return fallbackDirection === "desc" ? -1 : 1;
  });
}

function shapeRows(rows: RowRecord[], fields: string[]): RowRecord[] {
  return rows.map((row) =>
    Object.fromEntries(fields.map((field) => [field, row[field] ?? null]))
  );
}

function parseListOrSchemaInput(input: unknown): { dataset?: DatasetName } {
  if (input == null) {
    return {};
  }

  const record = asObject(input, "toolInput");
  return {
    dataset: parseEnumValue(record, "dataset", DATASET_NAMES),
  };
}

function parseQueryDataInput(input: unknown): QueryDataInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_QUERY_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_QUERY_ROWS}.`);
  }

  return {
    dataset: parseRequiredEnumValue(record, "dataset", DATASET_NAMES),
    years: parseOptionalStringArray(record, "years", MAX_YEARS),
    fields: parseOptionalStringArray(record, "fields", MAX_FIELDS),
    filters: parseOptionalFilterArray(record, "filters"),
    window: parseOptionalWindowInput(record, "window"),
    postFilters: parseOptionalFilterArray(record, "postFilters"),
    groupBy: parseOptionalStringArray(record, "groupBy", MAX_GROUP_FIELDS),
    aggregations: parseOptionalAggregationArray(record, "aggregations", MAX_AGGREGATIONS),
    sort: parseOptionalSortArray(record, "sort"),
    limit: limit ?? 10,
  };
}

function parseRunTransformInput(input: unknown): RunTransformInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_QUERY_ROWS)) {
    throw new Error(`limit must be between 1 and ${MAX_QUERY_ROWS}.`);
  }

  return {
    rows: parseRowsJson(record.rowsJson),
    groupBy: parseOptionalStringArray(record, "groupBy", MAX_GROUP_FIELDS),
    calculations: parseOptionalAggregationArray(record, "calculations", MAX_AGGREGATIONS),
    sortBy: parseOptionalString(record, "sortBy") ?? null,
    sortOrder: parseEnumValue(record, "sortOrder", SORT_DIRECTIONS) ?? "desc",
    limit: limit ?? 10,
    addRank: parseOptionalBoolean(record, "addRank") ?? false,
  };
}

function parseSearchCodebaseInput(input: unknown): SearchCodebaseInput {
  const record = asObject(input, "toolInput");
  const limit = parseOptionalInteger(record, "limit");
  if (limit != null && (limit < 1 || limit > MAX_SEARCH_RESULTS)) {
    throw new Error(`limit must be between 1 and ${MAX_SEARCH_RESULTS}.`);
  }

  return {
    query: parseRequiredString(record, "query"),
    limit: limit ?? 8,
  };
}

function parseSubmitFinalAnswerInput(input: unknown): SubmitFinalAnswerInput {
  const record = asObject(input, "toolInput");
  const answer = parseRequiredString(record, "answer");
  if (!answer.toUpperCase().startsWith(FINAL_ANSWER_PREFIX)) {
    throw new Error(`answer must start with "${FINAL_ANSWER_PREFIX}".`);
  }

  return { answer };
}

async function runListDataSources(input: unknown): Promise<AiToolExecutionResult> {
  const parsed = parseListOrSchemaInput(input);
  const selectedDatasets = parsed.dataset
    ? [DATASET_DEFINITIONS[parsed.dataset]]
    : DATASET_NAMES.map((name) => DATASET_DEFINITIONS[name]);

  const availableYears = await fetchAvailableYears();
  const { currentSeason } = resolveSeasonContext(availableYears);

  return {
    ok: true,
    data: {
      currentSeason,
      availableYears,
      datasets: selectedDatasets.map((dataset) => ({
        name: dataset.name,
        description: dataset.description,
        grain: dataset.grain,
        sourceType: dataset.sourceType,
        primaryEntityFields: dataset.primaryEntityFields,
        yearField: dataset.yearField,
        defaultFields: dataset.defaultFields,
        exampleMetricFields: dataset.numericKeys.slice(0, 8),
      })),
    },
  };
}

async function runInspectSchema(input: unknown): Promise<AiToolExecutionResult> {
  const parsed = parseListOrSchemaInput(input);
  if (!parsed.dataset) {
    return buildError(`dataset is required. Use one of: ${DATASET_NAMES.join(", ")}.`);
  }

  const dataset = DATASET_DEFINITIONS[parsed.dataset];
  const rows = await dataset.fetchRows();

  return {
    ok: true,
    data: {
      dataset: dataset.name,
      description: dataset.description,
      grain: dataset.grain,
      sourceType: dataset.sourceType,
      columns: buildColumnMetadata(dataset, rows),
      sampleRows: rows.slice(0, 1).map((row) => shapeRows([row], dataset.defaultFields)[0]),
    },
  };
}

async function runQueryData(input: unknown): Promise<AiToolExecutionResult> {
  const parsed = parseQueryDataInput(input);
  const dataset = DATASET_DEFINITIONS[parsed.dataset];
  const sourceRows = await dataset.fetchRows(parsed.years);
  const availableFields = getAvailableFields(sourceRows, dataset);
  const { rows: filteredRows, ignored: ignoredFilterFields } = applyQueryFilters(
    sourceRows,
    dataset,
    parsed.filters
  );
  const { rows: windowedRows, ignoredWindowFields } = applyWindowLag(
    filteredRows,
    dataset,
    parsed.window,
    availableFields
  );
  const windowedFields = getAvailableFields(windowedRows, dataset);
  const windowedDataset = {
    ...dataset,
    dimensionKeys: [...dataset.dimensionKeys, ...windowedFields.filter((field) => field.startsWith("Previous "))],
  };
  const { rows: postFilteredRows, ignored: ignoredPostFilterFields } = applyQueryFilters(
    windowedRows,
    windowedDataset,
    parsed.postFilters
  );
  const resultAvailableFields = getAvailableFields(postFilteredRows, windowedDataset);
  const { selected: selectedFields, ignored: ignoredFields } = resolveFieldNames(
    parsed.fields,
    windowedDataset,
    resultAvailableFields,
    dataset.defaultFields
  );
  const { selected: groupByFields, ignored: ignoredGroupByFields } = resolveFieldNames(
    parsed.groupBy,
    windowedDataset,
    resultAvailableFields,
    []
  );

  const ignoredAggregationFields: string[] = [];
  const resolvedAggregations =
    parsed.aggregations?.map((aggregation) => {
      if (!aggregation.field || aggregation.op === "count") {
        return aggregation;
      }

      const resolvedField = resolveFieldName(aggregation.field, windowedDataset, resultAvailableFields);
      if (!resolvedField) {
        ignoredAggregationFields.push(aggregation.field);
        return null;
      }

      return {
        ...aggregation,
        field: resolvedField,
      };
    }).filter((aggregation): aggregation is QueryAggregationInput => aggregation !== null) ?? [];

  let resultRows: RowRecord[];
  let resultFields: string[];

  if (groupByFields.length > 0 || resolvedAggregations.length > 0) {
    const aggregations: QueryAggregationInput[] =
      resolvedAggregations.length > 0
        ? resolvedAggregations
        : [{ op: "count", field: null, as: "row_count" }];
    resultRows = aggregateRows(postFilteredRows, groupByFields, aggregations);
    resultFields = getAvailableFields(resultRows, windowedDataset);
  } else {
    resultRows = shapeRows(postFilteredRows, selectedFields);
    resultFields = selectedFields;
  }

  const outputFieldMap = new Map<string, string>();
  resultFields.forEach((field) => {
    addAlias(outputFieldMap, field, field);
  });

  const resolvedSorts = (parsed.sort ?? [])
    .map((sort) => {
      const resolvedField =
        outputFieldMap.get(normalizeSearchValue(sort.field)) ??
        outputFieldMap.get(compactSearchValue(sort.field)) ??
        sort.field;
      return {
        field: resolvedField,
        direction: sort.direction ?? "asc",
      };
    })
    .filter((sort) => resultRows.length === 0 || sort.field in resultRows[0]);

  const sortedRows = sortRows(resultRows, resolvedSorts);
  const limitedRows = sortedRows.slice(0, parsed.limit ?? 10);

  return {
    ok: true,
    data: {
      dataset: dataset.name,
      years: parsed.years ?? "all",
      sourceRowCount: sourceRows.length,
      filteredRowCount: filteredRows.length,
      windowedRowCount: windowedRows.length,
      postFilteredRowCount: postFilteredRows.length,
      returnedRowCount: limitedRows.length,
      window: parsed.window ?? null,
      groupBy: groupByFields,
      aggregations: resolvedAggregations,
      ignoredFields,
      ignoredFilterFields,
      ignoredWindowFields,
      ignoredPostFilterFields,
      ignoredGroupByFields,
      ignoredAggregationFields,
      rows: limitedRows,
    },
  };
}

async function runTransform(input: unknown): Promise<AiToolExecutionResult> {
  const parsed = parseRunTransformInput(input);
  if (parsed.rows.length === 0) {
    return buildError("rows must contain at least one row.");
  }

  const firstRow = parsed.rows[0];
  const availableFields = Object.keys(firstRow);

  const groupByFields = (parsed.groupBy ?? []).filter((field) => availableFields.includes(field));
  const calculations =
    parsed.calculations?.map((calculation) => {
      if (!calculation.field || calculation.op === "count") {
        return calculation;
      }

      return availableFields.includes(calculation.field) ? calculation : null;
    }).filter((calculation): calculation is TransformCalculationInput => calculation !== null) ?? [];

  const rows =
    groupByFields.length > 0 || calculations.length > 0
      ? aggregateRows(parsed.rows, groupByFields, calculations.length > 0 ? calculations : [{ op: "count", field: null, as: "row_count" }])
      : parsed.rows;

  const sortBy =
    parsed.sortBy && rows[0] && parsed.sortBy in rows[0]
      ? parsed.sortBy
      : Object.keys(rows[0] ?? {}).find((field) => !groupByFields.includes(field)) ?? null;

  let transformedRows = sortBy
    ? sortRows(rows, [{ field: sortBy, direction: parsed.sortOrder ?? "desc" }], parsed.sortOrder ?? "desc")
    : rows;

  if (parsed.addRank && sortBy) {
    let previousValue: ScalarValue | undefined;
    let rank = 0;

    transformedRows = transformedRows.map((row, index) => {
      const nextRow = { ...row };
      const currentValue = (row[sortBy] as ScalarValue | undefined) ?? null;
      if (index === 0 || compareScalarValues(currentValue, previousValue ?? null) !== 0) {
        rank = index + 1;
      }
      previousValue = currentValue;
      nextRow.rank = rank;
      return nextRow;
    });
  }

  return {
    ok: true,
    data: {
      inputRowCount: parsed.rows.length,
      returnedRowCount: Math.min(transformedRows.length, parsed.limit ?? 10),
      rows: transformedRows.slice(0, parsed.limit ?? 10),
      groupBy: groupByFields,
      calculations,
      sortBy,
      sortOrder: parsed.sortOrder ?? "desc",
    },
  };
}

let searchableFilesPromise: Promise<string[]> | null = null;

async function collectSearchableFiles(rootDirectory: string): Promise<string[]> {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(rootDirectory, entry.name);
      if (entry.isDirectory()) {
        return collectSearchableFiles(absolutePath);
      }

      if (!SEARCHABLE_EXTENSIONS.has(path.extname(entry.name))) {
        return [];
      }

      return [absolutePath];
    })
  );

  return nested.flat();
}

async function getSearchableFiles(): Promise<string[]> {
  if (!searchableFilesPromise) {
    searchableFilesPromise = Promise.all(
      SEARCHABLE_CODE_ROOTS.map((relativeRoot) =>
        collectSearchableFiles(path.join(process.cwd(), relativeRoot))
      )
    ).then((lists) => lists.flat());
  }

  return searchableFilesPromise;
}

async function runSearchCodebase(input: unknown): Promise<AiToolExecutionResult> {
  const parsed = parseSearchCodebaseInput(input);
  const query = parsed.query.toLowerCase();
  const files = await getSearchableFiles();
  const matches: Array<{ file: string; line: number; excerpt: string }> = [];

  for (const file of files) {
    if (matches.length >= (parsed.limit ?? 8)) {
      break;
    }

    const content = await fs.readFile(file, "utf8");
    const lines = content.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]?.toLowerCase().includes(query)) {
        continue;
      }

      const start = Math.max(0, index - 1);
      const end = Math.min(lines.length, index + 2);
      matches.push({
        file: path.relative(process.cwd(), file),
        line: index + 1,
        excerpt: lines
          .slice(start, end)
          .map((line, lineIndex) => `${start + lineIndex + 1}: ${line}`)
          .join("\n"),
      });

      if (matches.length >= (parsed.limit ?? 8)) {
        break;
      }
    }
  }

  return {
    ok: true,
    data: {
      query: parsed.query,
      searchedRoots: SEARCHABLE_CODE_ROOTS,
      matchCount: matches.length,
      matches,
    },
  };
}

async function runFetchAppContext(): Promise<AiToolExecutionResult> {
  const availableYears = await fetchAvailableYears();
  const { currentSeason, previousSeason } = resolveSeasonContext(availableYears);

  return {
    ok: true,
    data: {
      currentSeason,
      previousSeason,
      availableYears,
      datasets: DATASET_NAMES.map((name) => ({
        name,
        description: DATASET_DEFINITIONS[name].description,
        grain: DATASET_DEFINITIONS[name].grain,
      })),
      conventions: [
        `"this season" resolves to ${currentSeason ?? "the latest available season"}.`,
        `"Fantasy" refers to the player game-log fantasy stat, not trade or ownership context.`,
        `"team_stats" is one row per team per match, so season totals require summing rows and per-game values require averaging rows.`,
        `"team_stats.Home/Away" marks whether the team row is for a home or away match.`,
        `"matches" is one row per match, while "player_stats" is one row per player appearance.`,
        `For "following/after a win/loss" questions, use query_data.window with partitionBy ["Team"], orderBy ["Date"], lag Result as "Previous Result", then postFilters on "Previous Result". Include the prior season if the first requested season needs previous-game context.`,
        `For weekday/weekend or day-of-week questions, use the Date field and calculate the weekday from it. A separate weekday column is not required.`,
      ],
      suggestedWorkflow: [
        "Use list_data_sources to discover the right dataset.",
        "Use inspect_schema if you are unsure which columns exist.",
        "Use query_data for bounded filtering, grouping, and aggregations. Omit limit unless you need fewer rows; if provided it must be between 1 and 40.",
        'For team home/away win-rate questions, use team_stats grouped by Team and "Home/Away", then derive win rates from Result counts.',
        'For previous-game sequence questions, use query_data.window before grouping: lag fields such as Result, Points, Opponent Points, or Point Differential by Team ordered by Date.',
        "For weekday analysis, fetch Date plus the result fields you need, then derive weekday/weekend from Date before ranking or summarising.",
        "Use run_transform for ranking, tie handling, and small reshaping steps.",
        "Use search_codebase only when you need mapping or business-logic confirmation from the repo.",
      ],
    },
  };
}

async function runSubmitFinalAnswer(input: unknown): Promise<AiToolExecutionResult> {
  const parsed = parseSubmitFinalAnswerInput(input);
  return {
    ok: true,
    data: {
      accepted: true,
      answer: parsed.answer,
    },
  };
}

export const CAPABILITY_AI_TOOLS: AiTool[] = [
  {
    name: "list_data_sources",
    description: "List the core NRL datasets available to the AI, including grain, entity fields, default fields, and year coverage.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["dataset"],
      properties: {
        dataset: {
          anyOf: [
            { type: "string", enum: DATASET_NAMES },
            { type: "null" },
          ],
        },
      },
    },
    execute: async (input) => runListDataSources(input),
  },
  {
    name: "inspect_schema",
    description: "Inspect a dataset schema, including columns, types, aliases, and a few sample rows.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["dataset"],
      properties: {
        dataset: { type: "string", enum: DATASET_NAMES },
      },
    },
    execute: async (input) => runInspectSchema(input),
  },
  {
    name: "query_data",
    description: "Run a guarded read-only query over a core dataset with optional filters, window lag columns, post-window filters, grouping, aggregations, sorting, and row limits. Use window lag for previous-game questions such as teams following a loss. Omit limit unless you need fewer rows; if provided it must be between 1 and 40.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["dataset", "years", "fields", "filters", "window", "postFilters", "groupBy", "aggregations", "sort", "limit"],
      properties: {
        dataset: { type: "string", enum: DATASET_NAMES },
        years: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_YEARS,
        },
        fields: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_FIELDS,
        },
        filters: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "value", "values"],
            properties: {
              field: { type: "string" },
              op: { type: "string", enum: FILTER_OPERATORS },
              value: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                ],
              },
              values: {
                anyOf: [
                  {
                    type: "array",
                    items: {
                      anyOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                        { type: "null" },
                      ],
                    },
                  },
                  { type: "null" },
                ],
              },
            },
          },
          maxItems: MAX_FILTERS,
        },
        window: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["partitionBy", "orderBy", "lag"],
              properties: {
                partitionBy: {
                  type: ["array", "null"],
                  items: { type: "string" },
                  maxItems: MAX_GROUP_FIELDS,
                },
                orderBy: {
                  type: ["array", "null"],
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["field", "direction"],
                    properties: {
                      field: { type: "string" },
                      direction: {
                        anyOf: [
                          { type: "string", enum: SORT_DIRECTIONS },
                          { type: "null" },
                        ],
                      },
                    },
                  },
                  maxItems: MAX_SORT_FIELDS,
                },
                lag: {
                  type: ["array", "null"],
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["field", "as", "offset"],
                    properties: {
                      field: { type: "string" },
                      as: { type: ["string", "null"] },
                      offset: { type: ["number", "null"], minimum: 1, maximum: 10 },
                    },
                  },
                  maxItems: MAX_WINDOW_FIELDS,
                },
              },
            },
            { type: "null" },
          ],
        },
        postFilters: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "value", "values"],
            properties: {
              field: { type: "string" },
              op: { type: "string", enum: FILTER_OPERATORS },
              value: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                ],
              },
              values: {
                anyOf: [
                  {
                    type: "array",
                    items: {
                      anyOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                        { type: "null" },
                      ],
                    },
                  },
                  { type: "null" },
                ],
              },
            },
          },
          maxItems: MAX_FILTERS,
        },
        groupBy: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_GROUP_FIELDS,
        },
        aggregations: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "as"],
            properties: {
              field: { type: ["string", "null"] },
              op: { type: "string", enum: AGGREGATION_OPERATORS },
              as: { type: ["string", "null"] },
            },
          },
          maxItems: MAX_AGGREGATIONS,
        },
        sort: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "direction"],
            properties: {
              field: { type: "string" },
              direction: {
                anyOf: [
                  { type: "string", enum: SORT_DIRECTIONS },
                  { type: "null" },
                ],
              },
            },
          },
          maxItems: MAX_SORT_FIELDS,
        },
        limit: { type: ["number", "null"], minimum: 1, maximum: MAX_QUERY_ROWS },
      },
    },
    execute: async (input) => runQueryData(input),
  },
  {
    name: "run_transform",
    description: "Run a small in-memory transform over bounded rows, passed as a JSON string, including aggregation, ranking with ties, and compact reshaping.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["rowsJson", "groupBy", "calculations", "sortBy", "sortOrder", "limit", "addRank"],
      properties: {
        rowsJson: { type: "string" },
        groupBy: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: MAX_GROUP_FIELDS,
        },
        calculations: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "as"],
            properties: {
              field: { type: ["string", "null"] },
              op: { type: "string", enum: AGGREGATION_OPERATORS },
              as: { type: ["string", "null"] },
            },
          },
          maxItems: MAX_AGGREGATIONS,
        },
        sortBy: { type: ["string", "null"] },
        sortOrder: { type: "string", enum: SORT_DIRECTIONS },
        limit: { type: ["number", "null"] },
        addRank: { type: ["boolean", "null"] },
      },
    },
    execute: async (input) => runTransform(input),
  },
  {
    name: "search_codebase",
    description: "Search the repo for data mappings, dataset references, and business-logic clues when schema or naming is unclear.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query", "limit"],
      properties: {
        query: { type: "string" },
        limit: { type: ["number", "null"] },
      },
    },
    execute: async (input) => runSearchCodebase(input),
  },
  {
    name: "fetch_app_context",
    description: "Return app-level context such as current season resolution, team names, stat catalogs, dataset roles, and workflow guidance.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
    execute: async () => runFetchAppContext(),
  },
  {
    name: "submit_final_answer",
    description: 'Submit the final user-facing answer once you have enough tool results. The answer must start with "FINAL ANSWER:". Use this instead of ending with ordinary assistant prose.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["answer"],
      properties: {
        answer: { type: "string" },
      },
    },
    execute: async (input) => runSubmitFinalAnswer(input),
  },
];

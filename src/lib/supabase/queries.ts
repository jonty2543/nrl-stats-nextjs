import { createServerSupabaseClient } from "./client";
import { unstable_cache } from "next/cache";
import {
  COLUMN_RENAME_MAP,
  FINALS_MAP,
  FINALS_LABEL_MAP,
} from "@/lib/data/constants";
import type { PlayerStat, Match, TeamStat, TeammateLookupRow } from "@/lib/data/types";
import {
  filterPlayerStatsRowsByYears,
  readPlayerStatsServerCache,
  readPlayerStatsServerCacheMetadata,
} from "@/lib/data/player-stats-server-cache";
import {
  BETTING_BOOKIE_COLUMNS,
  type BettingBookie,
  type BettingMarket,
  type BettingOddsRow,
  type BettingOddsSnapshot,
  type BettingOddsTable,
} from "@/lib/betting/types";

const PAGE_SIZE = 1000;
const DAILY_REVALIDATE_SECONDS = 86400;
const LINE_MARGIN_SIGMA = 16.85;

export interface PlayerImageRecord {
  player: string;
  team: string | null;
  number: string | null;
  position: string | null;
  head_image: string | null;
  body_image: string | null;
  last_seen_match_date: string | null;
}

export interface PlayerFantasySd5yRecord {
  player: string;
  primary_position: string | null;
  games: number;
  avg_fantasy: number | null;
  fantasy_sd: number | null;
  fantasy_cv: number | null;
  min_score: number | null;
  max_score: number | null;
}

export interface PositionFantasySd5yRecord {
  position: string;
  games: number;
  players: number;
  avg_fantasy: number | null;
  fantasy_sd: number | null;
  fantasy_cv: number | null;
}

export interface CasualtyWardRecord {
  player: string;
  team: string | null;
  position: string | null;
  injury: string | null;
  returnDate: string | null;
  games: number | null;
  averageFantasy: number | null;
  sourceUrl: string | null;
  scrapedAt: string | null;
}

export interface OriginChanceRecord {
  player: string;
  createdAt: string | null;
  updatedAt: string | null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normaliseTeamKey(value: unknown): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalisePlayerAliasKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function casualtyWardPlayerSearchNames(name: string): string[] {
  const names = new Set([name]);
  const key = normalisePlayerAliasKey(name);
  if (key === "apisai koroisau" || key === "api koroisau") {
    names.add("Apisai Koroisau");
    names.add("Api Koroisau");
  }
  return Array.from(names);
}

function relevantOutsTeamGroup(value: string | null | undefined): string | null {
  const key = normaliseTeamKey(value);
  if (!key) return null;
  const aliases: Array<[string, string[]]> = [
    ["broncos", ["broncos", "brisbane broncos"]],
    ["bulldogs", ["bulldogs", "canterbury bankstown bulldogs", "canterbury bulldogs"]],
    ["cowboys", ["cowboys", "north queensland cowboys"]],
    ["dragons", ["dragons", "st george illawarra dragons"]],
    ["dolphins", ["dolphins", "the dolphins"]],
    ["eels", ["eels", "parramatta eels"]],
    ["knights", ["knights", "newcastle knights"]],
    ["panthers", ["panthers", "penrith panthers"]],
    ["rabbitohs", ["rabbitohs", "south sydney rabbitohs", "souths"]],
    ["raiders", ["raiders", "canberra raiders"]],
    ["roosters", ["roosters", "sydney roosters"]],
    ["sea eagles", ["sea eagles", "manly sea eagles", "manly warringah sea eagles", "manly"]],
    ["sharks", ["sharks", "cronulla sharks", "cronulla sutherland sharks"]],
    ["storm", ["storm", "melbourne storm"]],
    ["tigers", ["tigers", "wests tigers"]],
    ["titans", ["titans", "gold coast titans"]],
    ["warriors", ["warriors", "new zealand warriors", "nz warriors"]],
  ];
  for (const [group, names] of aliases) {
    if (names.includes(key)) return group;
  }
  return key;
}

function isRelevantOutsTeamMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftGroup = relevantOutsTeamGroup(left);
  const rightGroup = relevantOutsTeamGroup(right);
  return Boolean(leftGroup && rightGroup && leftGroup === rightGroup);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalisePositionText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function relevantOutsPositionGroup(value: string | null | undefined): string | null {
  const normalised = normalisePositionText(value);
  if (!normalised) return null;
  if (["fullback", "fb"].includes(normalised)) return "fullback";
  if (["wing", "winger", "w"].includes(normalised)) return "wing";
  if (["centre", "center", "ctr"].includes(normalised)) return "centre";
  if (["halfback", "five eighth", "five eighths", "5 8", "58", "half"].includes(normalised)) return "halves";
  if (["lock", "prop", "front row", "front rower"].includes(normalised)) return "middle";
  if (["2nd row", "second row", "second rower", "back row", "back rower"].includes(normalised)) return "second-row";
  if (["hooker", "dummy half"].includes(normalised)) return "hooker";
  return normalised;
}

function isRelevantOutsPositionMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftGroup = relevantOutsPositionGroup(left);
  const rightGroup = relevantOutsPositionGroup(right);
  return Boolean(leftGroup && rightGroup && leftGroup === rightGroup);
}

// ---------------------------------------------------------------------------
// Generic paginated fetch
// ---------------------------------------------------------------------------
interface FetchOptions {
  /** Filter by match_date year(s) — e.g. ["2025"] → gte 2025-01-01, lt 2026-01-01 */
  years?: string[];
  /** Optional projection columns for Supabase select(...) */
  columns?: string;
}

async function fetchAllRowsFromSchema<T extends Record<string, unknown>>(
  schema: string,
  table: string
): Promise<T[]> {
  const supabase = createServerSupabaseClient(schema);
  const allRows: T[] = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select("*").range(start, end);

    if (error) throw new Error(`Supabase fetch ${schema}.${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as T[];
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allRows;
}

async function fetchAllRows<T extends Record<string, unknown>>(
  table: string,
  options?: FetchOptions
): Promise<T[]> {
  const supabase = createServerSupabaseClient();
  const allRows: T[] = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    let query = supabase.from(table).select(options?.columns ?? "*");

    // Apply year filter if provided
    if (options?.years && options.years.length > 0) {
      const sorted = [...options.years].sort();
      const minYear = parseInt(sorted[0], 10);
      const maxYear = parseInt(sorted[sorted.length - 1], 10);
      query = query
        .gte("match_date", `${minYear}-01-01`)
        .lt("match_date", `${maxYear + 1}-01-01`);
    }

    const { data, error } = await query.range(start, end);

    if (error) throw new Error(`Supabase fetch ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as T[];
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allRows;
}

async function fetchPlayerStatsRowsForPlayerFromSupabase(
  playerName: string
): Promise<Record<string, unknown>[]> {
  const supabase = createServerSupabaseClient();
  const allRows: Record<string, unknown>[] = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("player", playerName)
      .range(start, end);

    if (error) throw new Error(`Supabase fetch player_stats for player ${playerName}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allRows;
}

async function fetchTeammateLookupRowsFromSupabaseRaw(
  years?: string[]
): Promise<Record<string, unknown>[]> {
  const supabase = createServerSupabaseClient();
  const allRows: Record<string, unknown>[] = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    let query = supabase
      .from("player_stats")
      .select("player,team,position,match_date,round,total_points,mins_played");

    if (years && years.length > 0) {
      const sorted = [...years].sort();
      const minYear = parseInt(sorted[0], 10);
      const maxYear = parseInt(sorted[sorted.length - 1], 10);
      query = query
        .gte("match_date", `${minYear}-01-01`)
        .lt("match_date", `${maxYear + 1}-01-01`);
    }

    const { data, error } = await query.range(start, end);

    if (error) throw new Error(`Supabase fetch player_stats teammate lookup: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allRows;
}

// ---------------------------------------------------------------------------
// Round helpers (mirrors Python json_to_csv.py _round_to_sort / _round_to_label)
// ---------------------------------------------------------------------------
function roundToSort(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw);
  for (const [key, value] of Object.entries(FINALS_MAP)) {
    if (s.toLowerCase().includes(key.toLowerCase())) return value;
  }
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function roundToLabel(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = String(raw);
  for (const [key, value] of Object.entries(FINALS_LABEL_MAP)) {
    if (s.toLowerCase().includes(key.toLowerCase())) return value;
  }
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
}

// ---------------------------------------------------------------------------
// Fantasy/local name matching helpers (mirrors client logic)
// ---------------------------------------------------------------------------
function normaliseNameForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function parseNameForMatch(value: string): { first: string; last: string } {
  const parts = normaliseNameForMatch(value).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return {
    first: parts[0],
    last: parts[parts.length - 1],
  };
}

function findLocalPlayerMatchForFantasyName(
  fantasyName: string,
  localNames: string[]
): string | null {
  if (!fantasyName || localNames.length === 0) return null;

  const exactMap = new Map(localNames.map((name) => [normaliseNameForMatch(name), name]));
  const exact = exactMap.get(normaliseNameForMatch(fantasyName));
  if (exact) return exact;

  const target = parseNameForMatch(fantasyName);
  const candidates = localNames.filter((name) => {
    const parsed = parseNameForMatch(name);
    return parsed.last && parsed.last === target.last;
  });

  const initialMatches = candidates.filter((name) => {
    const parsed = parseNameForMatch(name);
    return parsed.first[0] && parsed.first[0] === target.first[0];
  });
  if (initialMatches.length === 1) return initialMatches[0];

  const prefixMatches = candidates.filter((name) => {
    const parsed = parseNameForMatch(name);
    return parsed.first.startsWith(target.first) || target.first.startsWith(parsed.first);
  });
  if (prefixMatches.length === 1) return prefixMatches[0];

  return null;
}

// ---------------------------------------------------------------------------
// Time "MM:SS" → float minutes
// ---------------------------------------------------------------------------
function timeToFloat(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const s = String(val);
  if (!s || s === "0") return 0;
  const parts = s.split(":");
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) return mins + secs / 60;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Strip suffix helpers
// ---------------------------------------------------------------------------
function stripSuffix(val: unknown, suffix: string): string {
  if (val == null) return "0";
  const s = String(val);
  return s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;
}

function toNum(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace("-", "0").replace(",", "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function toNullableOdds(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > 1 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return parsed > 1 ? parsed : null;
  }
  return null;
}

function toNullableFinite(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNullableProbability(value: unknown): number | null {
  const numeric = toNullableFinite(value);
  if (numeric == null || numeric < 0) return null;
  if (numeric <= 1) return numeric;
  if (numeric <= 100) return numeric / 100;
  return null;
}

function toIsoDate(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return "";
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return "";
}

function normaliseLookupKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamJoinKey(value: unknown): string {
  const normalized = normaliseLookupKey(value);
  if (!normalized) return "";
  const parts = normalized.split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function matchKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const split = raw.split(/\s+v(?:s)?\.?\s+/i).map((part) => part.trim()).filter(Boolean);
  if (split.length >= 2) {
    const [teamA, teamB] = [teamJoinKey(split[0]), teamJoinKey(split[1])].sort();
    return `${teamA}|${teamB}`;
  }

  return teamJoinKey(raw);
}

function normalCdf(z: number): number {
  // Abramowitz and Stegun approximation for Phi(z).
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erfApprox = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-(x * x));
  return 0.5 * (1 + sign * erfApprox);
}

interface PredictionModelRow extends Record<string, unknown> {
  match_date?: unknown;
  match?: unknown;
  team?: unknown;
  win_prob?: unknown;
  pred_margin?: unknown;
  updated_at?: unknown;
}

interface PredictionLookupEntry {
  winProb: number | null;
  predMargin: number | null;
  updatedAtMs: number;
}

interface PredictionLookupMaps {
  byDateTeam: Map<string, PredictionLookupEntry>;
  byDateMatchTeam: Map<string, PredictionLookupEntry>;
}

function toUpdatedAtMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function choosePredictionEntry(
  existing: PredictionLookupEntry | undefined,
  next: PredictionLookupEntry
): PredictionLookupEntry {
  if (!existing) return next;
  if (next.updatedAtMs > existing.updatedAtMs) return next;
  if (next.updatedAtMs < existing.updatedAtMs) return existing;
  const existingCompleteness = Number(existing.winProb != null) + Number(existing.predMargin != null);
  const nextCompleteness = Number(next.winProb != null) + Number(next.predMargin != null);
  return nextCompleteness >= existingCompleteness ? next : existing;
}

function buildPredictionLookup(rows: PredictionModelRow[]): PredictionLookupMaps {
  const byDateTeam = new Map<string, PredictionLookupEntry>();
  const byDateMatchTeam = new Map<string, PredictionLookupEntry>();

  for (const raw of rows) {
    const date = toIsoDate(raw.match_date);
    const teamKey = teamJoinKey(raw.team);
    if (!date || !teamKey) continue;

    const entry: PredictionLookupEntry = {
      winProb: toNullableProbability(raw.win_prob),
      predMargin: toNullableFinite(raw.pred_margin),
      updatedAtMs: toUpdatedAtMs(raw.updated_at),
    };

    const dateTeamKey = `${date}|${teamKey}`;
    byDateTeam.set(dateTeamKey, choosePredictionEntry(byDateTeam.get(dateTeamKey), entry));

    const normalizedMatchKey = matchKey(raw.match);
    if (!normalizedMatchKey) continue;

    const dateMatchTeamKey = `${date}|${normalizedMatchKey}|${teamKey}`;
    byDateMatchTeam.set(
      dateMatchTeamKey,
      choosePredictionEntry(byDateMatchTeam.get(dateMatchTeamKey), entry)
    );
  }

  return { byDateTeam, byDateMatchTeam };
}

function findPredictionForOddsRow(
  row: BettingOddsRow,
  lookup: PredictionLookupMaps
): PredictionLookupEntry | null {
  const date = toIsoDate(row.date);
  const teamKey = teamJoinKey(row.result);
  if (!date || !teamKey) return null;

  const normalizedMatchKey = matchKey(row.match);
  if (normalizedMatchKey) {
    const byMatch = lookup.byDateMatchTeam.get(`${date}|${normalizedMatchKey}|${teamKey}`);
    if (byMatch) return byMatch;
  }

  return lookup.byDateTeam.get(`${date}|${teamKey}`) ?? null;
}

function applyPredictionModelToRow(row: BettingOddsRow, lookup: PredictionLookupMaps): BettingOddsRow {
  if (row.market !== "H2H" && row.market !== "Line") return row;

  const prediction = findPredictionForOddsRow(row, lookup);
  if (!prediction) {
    return {
      ...row,
      model: null,
    };
  }

  if (row.market === "H2H") {
    return {
      ...row,
      model: prediction.winProb == null ? null : prediction.winProb * 100,
    };
  }

  if (prediction.predMargin == null || row.value == null) {
    return {
      ...row,
      model: null,
    };
  }

  const z = (prediction.predMargin + row.value) / LINE_MARGIN_SIGMA;
  const coverProbability = normalCdf(z);
  return {
    ...row,
    model: coverProbability * 100,
  };
}

function mapBettingMarket(table: BettingOddsTable, rawMarket: unknown): BettingMarket {
  if (typeof rawMarket === "string") {
    const normalized = rawMarket.trim().toLowerCase();
    if (normalized === "line") return "Line";
    if (normalized === "total") return "Total";
    if (normalized === "tryscorer" || normalized === "try scorer") return "Tryscorer";
    if (normalized === "h2h") return "H2H";
  }
  if (table === "NRL Line Odds") return "Line";
  if (table === "NRL Total Odds") return "Total";
  if (table === "NRL Tryscorers") return "Tryscorer";
  return "H2H";
}

function createEmptyBettingBookieFields(): Record<BettingBookie, number | null> {
  return {
    Sportsbet: null,
    Pointsbet: null,
    Unibet: null,
    Palmerbet: null,
    Betright: null,
  };
}

function computeBestBookieFromRow(
  row: Pick<BettingOddsRow, BettingBookie | "bestBookie" | "bestPrice">
): Pick<BettingOddsRow, "bestBookie" | "bestPrice"> {
  if (row.bestBookie != null && row.bestPrice != null) {
    return {
      bestBookie: row.bestBookie,
      bestPrice: row.bestPrice,
    };
  }

  let bestBookie: BettingBookie | null = null;
  let bestPrice: number | null = null;

  for (const bookie of BETTING_BOOKIE_COLUMNS) {
    const price = row[bookie];
    if (price == null) continue;
    if (bestPrice == null || price > bestPrice) {
      bestBookie = bookie;
      bestPrice = price;
    }
  }

  return {
    bestBookie: row.bestBookie ?? bestBookie,
    bestPrice: row.bestPrice ?? bestPrice,
  };
}

function mapLegacyBettingRow(table: BettingOddsTable, raw: Record<string, unknown>): BettingOddsRow {
  const row: BettingOddsRow = {
    table,
    market: mapBettingMarket(table, raw.Market),
    date: toIsoDate(raw.Date),
    match: typeof raw.Match === "string" ? raw.Match : "",
    result: typeof raw.Result === "string" ? raw.Result : "",
    value: toNullableFinite(raw.Value),
    model: toNullableFinite(raw.Model),
    bestBookie: typeof raw["Best Bookie"] === "string" ? raw["Best Bookie"] : null,
    bestPrice: toNullableOdds(raw["Best Price"]),
    marketPercentage: toNullableFinite(raw["Market %"]),
    Sportsbet: toNullableOdds(raw.Sportsbet),
    Pointsbet: toNullableOdds(raw.Pointsbet),
    Unibet: toNullableOdds(raw.Unibet),
    Palmerbet: toNullableOdds(raw.Palmerbet),
    Betright: toNullableOdds(raw.Betright),
    Betr: toNullableOdds(raw.Betr),
  };

  return {
    ...row,
    ...computeBestBookieFromRow(row),
  };
}

function hasBookSpecificOddsColumns(raw: Record<string, unknown>): boolean {
  return BETTING_BOOKIE_COLUMNS.some(
    (bookie) => `${bookie}_odds` in raw || `${bookie}_line` in raw
  );
}

function mapBookSpecificBettingRows(
  table: BettingOddsTable,
  raw: Record<string, unknown>
): BettingOddsRow[] {
  const market = mapBettingMarket(table, raw.Market);
  const date = toIsoDate(raw.Date);
  const match = typeof raw.Match === "string" ? raw.Match : "";
  const result = typeof raw.Result === "string" ? raw.Result : "";
  const model = toNullableFinite(raw.Model);

  return BETTING_BOOKIE_COLUMNS.flatMap((bookie) => {
    const price = toNullableOdds(raw[`${bookie}_odds`]);
    const value = toNullableFinite(raw[`${bookie}_line`]);
    if (price == null || value == null) return [];

    return [{
      table,
      market,
      date,
      match,
      result,
      value,
      model,
      bestBookie: bookie,
      bestPrice: price,
      marketPercentage: null,
      ...createEmptyBettingBookieFields(),
      [bookie]: price,
      Betr: null,
    }];
  });
}

function mapBettingRows(table: BettingOddsTable, raw: Record<string, unknown>): BettingOddsRow[] {
  if ((table === "NRL Line Odds" || table === "NRL Total Odds") && hasBookSpecificOddsColumns(raw)) {
    return mapBookSpecificBettingRows(table, raw);
  }

  return [mapLegacyBettingRow(table, raw)];
}

// ---------------------------------------------------------------------------
// Rename columns on a raw row
// ---------------------------------------------------------------------------
function renameRow(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const renamed = COLUMN_RENAME_MAP[key] ?? key;
    out[renamed] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Clean a single player stat row (type conversions matching Python pipeline)
// ---------------------------------------------------------------------------
function cleanPlayerRow(row: Record<string, unknown>): Record<string, unknown> {
  // Replace dashes with 0
  for (const [k, v] of Object.entries(row)) {
    if (v === "-") row[k] = "0";
  }

  // Strip suffixes
  row["Tackle Efficiency"] = stripSuffix(row["Tackle Efficiency"], "%");
  row["Average Play The Ball Speed"] = stripSuffix(
    row["Average Play The Ball Speed"],
    "s"
  );

  // Time columns → float
  row["Mins Played"] = timeToFloat(row["Mins Played"]);
  row["Stint One"] = timeToFloat(row["Stint One"]);
  row["Stint Two"] = timeToFloat(row["Stint Two"]);

  // Rename Total Points → Fantasy
  if ("Total Points" in row) {
    row["Fantasy"] = toNum(row["Total Points"]);
  }

  // Numeric conversions for all stat columns
  const intCols = [
    "Points", "Tries", "Conversions", "Conversion Attempts", "Penalty Goals",
    "1 Point Field Goals", "2 Point Field Goals", "All Runs", "Line Breaks",
    "Line Break Assists", "Try Assists", "Line Engaged Runs", "Tackle Breaks",
    "Hit Ups", "Dummy Half Runs", "Dummy Half Run Metres", "One on One Steal",
    "Offloads", "Dummy Passes", "Passes", "Intercepts", "Kicks Defused",
    "Kicks", "Forced Drop Outs", "Bomb Kicks", "Grubbers", "Errors",
    "Handling Errors", "One on One Lost", "Penalties", "Ruck Infringements",
    "Inside 10 Metres", "On Report", "Sin Bins", "Send Offs",
    "Goal Conversion Rate", "Receipts", "Tackles Made", "Missed Tackles",
    "Ineffective Tackles", "40/20", "20/40", "Cross Field Kicks", "Kicked Dead",
  ];
  for (const col of intCols) {
    if (col in row) row[col] = Math.round(toNum(row[col]));
  }

  const floatCols = [
    "Mins Played", "All Run Metres", "Kick Return Metres",
    "Post Contact Metres", "Play The Ball", "Average Play The Ball Speed",
    "Passes To Run Ratio", "Tackle Efficiency", "Kicking Metres",
    "Stint One", "Stint Two",
  ];
  for (const col of floatCols) {
    if (col in row) row[col] = toNum(row[col]);
  }

  return row;
}

function buildPlayerStatsRows(
  rawPlayers: Record<string, unknown>[],
  rawMatches: Record<string, unknown>[]
): PlayerStat[] {
  if (rawPlayers.length === 0) return [];

  // Build opponent lookup from matches
  const opponentMap = new Map<string, string>();
  const homeAwayMap = new Map<string, { home: string; away: string }>();
  for (const m of rawMatches) {
    const date = String(m.match_date ?? "");
    const team = String(m.team ?? "");
    const opp = String(m.opponent_team ?? "");
    const isHome = m.is_home === 1;
    opponentMap.set(`${date}|${team}`, opp);

    if (isHome) {
      const home = team.replace(/-/g, " ");
      const away = opp.replace(/-/g, " ");
      homeAwayMap.set(`${date}|${home}`, { home, away });
      homeAwayMap.set(`${date}|${away}`, { home, away });
    }
  }

  // Deduplicate keys for Name+Round+Year
  const seen = new Set<string>();

  const rows: PlayerStat[] = [];
  for (const raw of rawPlayers) {
    const renamed = renameRow(raw);

    // Compute Year, Round, Round_Label from match_date and round
    const matchDate = String(raw.match_date ?? "");
    const year = matchDate ? new Date(matchDate).getFullYear().toString() : "";
    const round = roundToSort(raw.round as string);
    const roundLabel = roundToLabel(raw.round as string);

    renamed["Year"] = year;
    renamed["Round"] = round;
    renamed["Round_Label"] = roundLabel;

    // Opponent lookup
    const team = String(raw.team ?? "");
    renamed["Opponent"] = opponentMap.get(`${matchDate}|${team}`) ?? null;

    // Home/Away team lookup
    const teamClean = team.replace(/-/g, " ");
    const ha = homeAwayMap.get(`${matchDate}|${teamClean}`);
    renamed["Home Team"] = ha?.home ?? null;
    renamed["Away Team"] = ha?.away ?? null;

    // Clean types
    const cleaned = cleanPlayerRow(renamed);

    // Filter: mins_played > 0
    if ((cleaned["Mins Played"] as number) <= 0) continue;

    // Deduplicate
    const dedupeKey = `${cleaned["Name"]}|${cleaned["Round"]}|${cleaned["Year"]}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push(cleaned as unknown as PlayerStat);
  }

  return rows;
}

function buildTeammateLookupRows(rawPlayers: Record<string, unknown>[]): TeammateLookupRow[] {
  const seen = new Set<string>();
  const rows: TeammateLookupRow[] = [];

  for (const raw of rawPlayers) {
    const renamed = renameRow(raw);
    const matchDate = String(raw.match_date ?? "");
    const year = matchDate ? new Date(matchDate).getFullYear().toString() : "";
    const round = roundToSort(raw.round as string) ?? 0;

    renamed["Year"] = year;
    renamed["Round"] = round;

    const cleaned = cleanPlayerRow(renamed);
    if ((cleaned["Mins Played"] as number) <= 0) continue;

    const name = String(cleaned["Name"] ?? "");
    const team = String(cleaned["Team"] ?? "");
    const position = String(cleaned["Position"] ?? "");
    if (!name || !team || !year) continue;

    const dedupeKey = `${name}|${round}|${year}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      Name: name,
      Team: team as TeammateLookupRow["Team"],
      Year: year,
      Round: round,
      Position: position,
      Fantasy: typeof cleaned["Fantasy"] === "number" ? cleaned["Fantasy"] : 0,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// fetchPlayerStats — main entry point
// ---------------------------------------------------------------------------
export async function fetchPlayerStatsFromSupabase(years?: string[]): Promise<PlayerStat[]> {
  const opts = years && years.length > 0 ? { years } : undefined;
  const rawMatches = await fetchAllRows<Record<string, unknown>>("matches", {
    ...opts,
    columns: "match_date,team,opponent_team,is_home",
  });
  const rawPlayers = await fetchAllRows<Record<string, unknown>>("player_stats", opts);
  return buildPlayerStatsRows(rawPlayers, rawMatches);
}

export async function fetchPlayerStats(years?: string[]): Promise<PlayerStat[]> {
  const normalizedYears = (years ?? []).filter(Boolean).sort();
  const key = normalizedYears.length > 0 ? normalizedYears.join(",") : "all";
  const normalizedArg = normalizedYears.length > 0 ? normalizedYears : undefined;
  const serverCache =
    process.env.NODE_ENV !== "production"
      ? await readPlayerStatsServerCache(normalizedArg)
      : await unstable_cache(
          async () => readPlayerStatsServerCache(normalizedArg),
          ["player-stats-server-cache-v1", key],
          { revalidate: DAILY_REVALIDATE_SECONDS }
        )();

  if (serverCache) {
    return filterPlayerStatsRowsByYears(serverCache.rows, normalizedArg);
  }

  if (process.env.NODE_ENV !== "production") {
    return fetchPlayerStatsFromSupabase(normalizedArg);
  }

  const fetchCached = unstable_cache(
    async () => fetchPlayerStatsFromSupabase(normalizedArg),
    ["player-stats-v1", key],
    { revalidate: DAILY_REVALIDATE_SECONDS }
  );

  return fetchCached();
}

function buildTeamStatsRowsFromMatches(rawMatches: Record<string, unknown>[]): TeamStat[] {
  return rawMatches.map((raw) => {
    const matchDate = String(raw.match_date ?? "");
    const year = matchDate ? new Date(matchDate).getFullYear().toString() : "";
    const round = roundToSort(raw.round as string) ?? 0;
    const roundLabel = roundToLabel(raw.round as string);
    const team = String(raw.team ?? "").replace(/-/g, " ");
    const opponent = String(raw.opponent_team ?? "").replace(/-/g, " ").trim() || null;
    const points = Number(raw.score ?? 0);
    const opponentPoints = Number(raw.opponent_score ?? 0);
    const pointDifferential = points - opponentPoints;
    const homeAway = raw.is_home === 1 || raw.is_home === true ? "Home" : "Away";
    const result = pointDifferential > 0 ? "Win" : pointDifferential < 0 ? "Loss" : "Draw";

    return {
      Team: team as TeamStat["Team"],
      Year: year,
      Round: round,
      Date: matchDate,
      Round_Label: roundLabel,
      Opponent: opponent,
      "Home/Away": homeAway,
      Result: result as TeamStat["Result"],
      Points: points,
      "Opponent Points": opponentPoints,
      Margin: Math.abs(pointDifferential),
      "Point Differential": pointDifferential,
      "Possession %": toFiniteNumber(raw.possession_pct) ?? 0,
      "Opponent Possession %": toFiniteNumber(raw.opponent_possession_pct) ?? 0,
      "Time In Possession": toFiniteNumber(raw.time_in_possession) ?? 0,
      "Opponent Time In Possession": toFiniteNumber(raw.opponent_time_in_possession) ?? 0,
      "Completion Rate": toFiniteNumber(raw.completion_rate) ?? 0,
      "Opponent Completion Rate": toFiniteNumber(raw.opponent_completion_rate) ?? 0,
      Tries: Number(raw.tries ?? 0),
      Conversions: Number(raw.conversions_made ?? 0),
      "Conversion Attempts": Number(raw.conversions_attempted ?? 0),
      "Penalty Goals": Number(raw.penalty_goals_made ?? 0),
      "1 Point Field Goals": Number(raw.field_goals_made ?? 0),
      "2 Point Field Goals": 0,
      "All Runs": Number(raw.all_runs ?? 0),
      "All Run Metres": toFiniteNumber(raw.all_run_metres) ?? 0,
      "Kick Return Metres": toFiniteNumber(raw.kick_return_metres) ?? 0,
      "Post Contact Metres": toFiniteNumber(raw.post_contact_metres) ?? 0,
      "Line Breaks": Number(raw.line_breaks ?? 0),
      "Line Break Assists": Number(raw.line_break_assists ?? 0),
      "Try Assists": Number(raw.try_assists ?? 0),
      "Line Engaged Runs": 0,
      "Tackle Breaks": Number(raw.tackle_breaks ?? 0),
      "Hit Ups": 0,
      "Play The Ball": 0,
      "Dummy Half Runs": 0,
      "Dummy Half Run Metres": 0,
      "One on One Steal": 0,
      Offloads: Number(raw.offloads ?? 0),
      "Dummy Passes": Number(raw.dummy_passes ?? 0),
      Passes: Number(raw.total_passes ?? 0),
      Receipts: Number(raw.receipts ?? 0),
      "Tackles Made": Number(raw.tackles_made ?? 0),
      "Missed Tackles": Number(raw.missed_tackles ?? 0),
      "Ineffective Tackles": Number(raw.ineffective_tackles ?? 0),
      Intercepts: Number(raw.intercepts ?? 0),
      "Kicks Defused": 0,
      Kicks: Number(raw.kicks ?? 0),
      "Kicking Metres": toFiniteNumber(raw.kicking_metres) ?? 0,
      "Forced Drop Outs": Number(raw.forced_drop_outs ?? 0),
      "Bomb Kicks": Number(raw.bombs ?? 0),
      Grubbers: Number(raw.grubbers ?? 0),
      "40/20": 0,
      "20/40": 0,
      "Cross Field Kicks": 0,
      "Kicked Dead": 0,
      Errors: Number(raw.errors ?? 0),
      "Handling Errors": 0,
      "One on One Lost": 0,
      Penalties: Number(raw.penalties_conceded ?? 0),
      "Ruck Infringements": Number(raw.ruck_infringements ?? 0),
      "Inside 10 Metres": Number(raw.inside_10_metres ?? 0),
      "On Report": Number(raw.on_reports ?? 0),
      "Sin Bins": Number(raw.sin_bins ?? 0),
      "Send Offs": 0,
    }
  })
}

export async function fetchTeamStatsFromSupabase(years?: string[]): Promise<TeamStat[]> {
  const rawMatches = await fetchAllRows<Record<string, unknown>>("matches", {
    years,
    columns: [
      "match_date",
      "round",
      "team",
      "opponent_team",
      "score",
      "opponent_score",
      "is_home",
      "possession_pct",
      "opponent_possession_pct",
      "time_in_possession",
      "opponent_time_in_possession",
      "completion_rate",
      "opponent_completion_rate",
      "tries",
      "conversions_made",
      "conversions_attempted",
      "penalty_goals_made",
      "field_goals_made",
      "all_runs",
      "all_run_metres",
      "kick_return_metres",
      "post_contact_metres",
      "line_breaks",
      "line_break_assists",
      "try_assists",
      "tackle_breaks",
      "offloads",
      "receipts",
      "total_passes",
      "dummy_passes",
      "kicks",
      "kicking_metres",
      "forced_drop_outs",
      "bombs",
      "grubbers",
      "tackles_made",
      "missed_tackles",
      "intercepts",
      "ineffective_tackles",
      "errors",
      "penalties_conceded",
      "ruck_infringements",
      "inside_10_metres",
      "on_reports",
      "sin_bins",
    ].join(","),
  })

  if (rawMatches.length === 0) return [];

  return buildTeamStatsRowsFromMatches(rawMatches)
    .filter((row) => row.Team && row.Year)
    .sort((a, b) => {
      if (a.Year !== b.Year) return b.Year.localeCompare(a.Year)
      if (a.Round !== b.Round) return (b.Round ?? 0) - (a.Round ?? 0)
      return a.Team.localeCompare(b.Team)
    })
}

export async function fetchTeamStats(years?: string[]): Promise<TeamStat[]> {
  const normalizedYears = (years ?? []).filter(Boolean).sort()
  const key = normalizedYears.length > 0 ? normalizedYears.join(",") : "all"
  const normalizedArg = normalizedYears.length > 0 ? normalizedYears : undefined

  if (process.env.NODE_ENV !== "production") {
    return fetchTeamStatsFromSupabase(normalizedArg)
  }

  const fetchCached = unstable_cache(
    async () => fetchTeamStatsFromSupabase(normalizedArg),
    ["team-stats-v2", key],
    { revalidate: DAILY_REVALIDATE_SECONDS }
  )

  return fetchCached()
}

export async function fetchTeammateLookupRowsFromSupabase(
  years?: string[]
): Promise<TeammateLookupRow[]> {
  const rawPlayers = await fetchTeammateLookupRowsFromSupabaseRaw(years);
  return buildTeammateLookupRows(rawPlayers);
}

export async function fetchTeammateLookupRows(
  years?: string[]
): Promise<TeammateLookupRow[]> {
  const normalizedYears = (years ?? []).filter(Boolean).sort();
  const key = normalizedYears.length > 0 ? normalizedYears.join(",") : "all";
  const normalizedArg = normalizedYears.length > 0 ? normalizedYears : undefined;
  const serverCache =
    process.env.NODE_ENV !== "production"
      ? await readPlayerStatsServerCache(normalizedArg)
      : await unstable_cache(
          async () => readPlayerStatsServerCache(normalizedArg),
          ["teammate-server-cache-v1", key],
          { revalidate: DAILY_REVALIDATE_SECONDS }
        )();

  if (serverCache) {
    return buildTeammateLookupRows(
      filterPlayerStatsRowsByYears(serverCache.rows, normalizedArg).map((row) => ({
        player: row.Name,
        team: row.Team,
        position: row.Position,
        match_date: `${row.Year}-01-01`,
        round: row.Round_Label || row.Round,
        total_points: row.Fantasy,
        mins_played: row["Mins Played"],
      }))
    );
  }

  if (process.env.NODE_ENV !== "production") {
    return fetchTeammateLookupRowsFromSupabase(normalizedArg);
  }

  const fetchCached = unstable_cache(
    async () => fetchTeammateLookupRowsFromSupabase(normalizedArg),
    ["teammate-lookup-v1", key],
    { revalidate: DAILY_REVALIDATE_SECONDS }
  );

  return fetchCached();
}

async function fetchPlayerStatsForLocalNameAllYearsFromSupabase(
  localPlayerName: string
): Promise<PlayerStat[]> {
  const [rawPlayers, rawMatches] = await Promise.all([
    fetchPlayerStatsRowsForPlayerFromSupabase(localPlayerName),
    fetchAllRows<Record<string, unknown>>("matches", {
      columns: "match_date,team,opponent_team,is_home",
    }),
  ]);
  return buildPlayerStatsRows(rawPlayers, rawMatches);
}

export async function fetchFantasyPlayerStatsAllYears(
  fantasyName: string
): Promise<PlayerStat[]> {
  if (!fantasyName.trim()) return [];
  try {
    const serverCache = await readPlayerStatsServerCache();

    if (serverCache) {
      const allRows = serverCache.rows;
      if (allRows.length === 0) return [];

      const localNames = Array.from(new Set(allRows.map((row) => row.Name))).sort();
      const matchedLocalName = findLocalPlayerMatchForFantasyName(fantasyName, localNames);
      if (!matchedLocalName) return [];
      const matchedNameKey = normaliseNameForMatch(matchedLocalName);

      return allRows.filter((row) => normaliseNameForMatch(row.Name) === matchedNameKey);
    }

    const teammateRows = await fetchTeammateLookupRows();
    if (teammateRows.length === 0) return [];
    const localNames = Array.from(new Set(teammateRows.map((row) => row.Name))).sort();
    const matchedLocalName = findLocalPlayerMatchForFantasyName(fantasyName, localNames);
    if (!matchedLocalName) return [];

    return fetchPlayerStatsForLocalNameAllYearsFromSupabase(matchedLocalName);
  } catch (error) {
    console.warn("Unable to fetch fantasy player stats all years; returning empty set.", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// fetchMatches
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// fetchAvailableYears — lightweight query for year list
// ---------------------------------------------------------------------------
export async function fetchAvailableYearsFromSupabase(): Promise<string[]> {
  // Avoid expensive min/max scans on the large player_stats table.
  // matches is much smaller and still covers the available season range.
  const rawMatches = await fetchAllRows<Record<string, unknown>>("matches", {
    columns: "match_date",
  });
  if (rawMatches.length === 0) return [];

  const years = Array.from(
    new Set(
      rawMatches
        .map((row) => {
          const value = String(row.match_date ?? "");
          if (!value) return null;
          const year = new Date(value).getFullYear();
          return Number.isFinite(year) ? String(year) : null;
        })
        .filter((year): year is string => Boolean(year))
    )
  ).sort((a, b) => b.localeCompare(a));

  return years;
}

const fetchAvailableYearsCached = unstable_cache(
  async (): Promise<string[]> => fetchAvailableYearsFromSupabase(),
  ["available-years-v1"],
  { revalidate: DAILY_REVALIDATE_SECONDS }
);

export async function fetchAvailableYears(): Promise<string[]> {
  const serverCacheMeta =
    process.env.NODE_ENV !== "production"
      ? await readPlayerStatsServerCacheMetadata()
      : await unstable_cache(
          async () => readPlayerStatsServerCacheMetadata(),
          ["available-years-server-cache-meta-v1"],
          { revalidate: DAILY_REVALIDATE_SECONDS }
        )();
  if (serverCacheMeta) {
    return serverCacheMeta.years;
  }

  if (process.env.NODE_ENV !== "production") {
    return fetchAvailableYearsFromSupabase();
  }

  return fetchAvailableYearsCached();
}

export async function fetchMatches(years?: string[]): Promise<Match[]> {
  const rawMatches = await fetchAllRows<Record<string, unknown>>("matches", {
    years,
    columns: "match_date,round,team,opponent_team,is_home,score,opponent_score",
  });
  if (rawMatches.length === 0) return [];

  // Only home rows to build match pairs
  const homeRows = rawMatches.filter((m) => m.is_home === 1);
  const seen = new Set<string>();
  const matches: Match[] = [];

  for (const m of homeRows) {
    const matchDate = String(m.match_date ?? "");
    const year = matchDate ? new Date(matchDate).getFullYear().toString() : "";
    const round = roundToSort(m.round as string);
    const roundLabel = roundToLabel(m.round as string);
    const home = String(m.team ?? "").replace(/-/g, " ");
    const away = String(m.opponent_team ?? "").replace(/-/g, " ");

    const dedupeKey = `${matchDate}|${home}|${away}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    matches.push({
      Year: year,
      Round: round ?? 0,
      Round_Label: roundLabel,
      Date: matchDate,
      Home: home,
      Home_Score: Number(m.score ?? 0),
      Away: away,
      Away_Score: Number(m.opponent_score ?? 0),
      Venue: null,
    });
  }

  return matches;
}

async function fetchBettingOddsTableFromSupabase(table: BettingOddsTable): Promise<BettingOddsRow[]> {
  const rawRows = await fetchAllRowsFromSchema<Record<string, unknown>>("public", table);
  return rawRows
    .flatMap((row) => mapBettingRows(table, row))
    .filter((row) => row.match.length > 0 && row.result.length > 0 && row.date.length > 0)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.match !== b.match) return a.match.localeCompare(b.match);
      return a.result.localeCompare(b.result);
    });
}

async function fetchPredictionModelRowsFromSupabase(): Promise<PredictionModelRow[]> {
  const rawRows = await fetchAllRowsFromSchema<Record<string, unknown>>("nrl", "nrl_predictions");
  return rawRows as PredictionModelRow[];
}

export async function fetchBettingOddsSnapshotFromSupabase(): Promise<BettingOddsSnapshot> {
  const [h2hRaw, lineRaw, total, tryscorer, predictionRows] = await Promise.all([
    fetchBettingOddsTableFromSupabase("NRL Odds"),
    fetchBettingOddsTableFromSupabase("NRL Line Odds"),
    fetchBettingOddsTableFromSupabase("NRL Total Odds"),
    fetchBettingOddsTableFromSupabase("NRL Tryscorers"),
    fetchPredictionModelRowsFromSupabase().catch((error) => {
      console.warn("Unable to fetch betting prediction rows; rendering odds without model values.", error);
      return [];
    }),
  ]);
  const predictionLookup = buildPredictionLookup(predictionRows);
  const h2h = h2hRaw.map((row) => applyPredictionModelToRow(row, predictionLookup));
  const line = lineRaw.map((row) => applyPredictionModelToRow(row, predictionLookup));

  return {
    h2h,
    line,
    total,
    tryscorer,
    generatedAt: new Date().toISOString(),
  };
}

const fetchBettingOddsSnapshotCached = unstable_cache(
  async (): Promise<BettingOddsSnapshot> => fetchBettingOddsSnapshotFromSupabase(),
  ["betting-odds-v3"],
  { revalidate: 120 }
);

export async function fetchBettingOddsSnapshot(): Promise<BettingOddsSnapshot> {
  try {
    if (process.env.NODE_ENV !== "production") {
      return await fetchBettingOddsSnapshotFromSupabase();
    }
    return await fetchBettingOddsSnapshotCached();
  } catch (error) {
    console.warn("Unable to fetch betting odds snapshot; using empty odds lists.", error);
    return {
      h2h: [],
      line: [],
      total: [],
      tryscorer: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function fetchCasualtyWardForPlayer(playerName: string): Promise<CasualtyWardRecord[]> {
  const name = playerName.trim();
  if (!name) return [];
  const searchNames = casualtyWardPlayerSearchNames(name);

  const supabase = createServerSupabaseClient("nrl");
  const { data, error } = await supabase
    .from("casualty_ward")
    .select("player, team, injury, return_date, source_url, scraped_at")
    .in("player", searchNames)
    .order("scraped_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn(`Unable to fetch casualty ward rows for ${name}; using empty set.`, error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    player: toNullableString(row.player) ?? name,
    team: toNullableString(row.team),
    position: toNullableString(row.position),
    injury: toNullableString(row.injury),
    returnDate: toNullableString(row.return_date),
    games: toFiniteNumber(row.games),
    averageFantasy: toFiniteNumber(row.average_fantasy),
    sourceUrl: toNullableString(row.source_url),
    scrapedAt: toNullableString(row.scraped_at),
  }));
}

export async function fetchRelevantCasualtyWardOuts({
  team,
  position,
  excludePlayer,
}: {
  team: string | null | undefined;
  position: string | null | undefined;
  excludePlayer?: string | null;
}): Promise<CasualtyWardRecord[]> {
  const teamName = team?.trim();
  const positionName = position?.trim();
  if (!teamName || !positionName) return [];

  const supabase = createServerSupabaseClient("nrl");
  let query = supabase
    .from("casualty_ward")
    .select("player, team, position, injury, return_date, games, average_fantasy, source_url, scraped_at")
    .order("average_fantasy", { ascending: false })
    .limit(200);

  if (excludePlayer?.trim()) {
    query = query.neq("player", excludePlayer.trim());
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`Unable to fetch relevant casualty ward outs for ${teamName} ${positionName}; using empty set.`, error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      player: toNullableString(row.player) ?? "",
      team: toNullableString(row.team),
      position: toNullableString(row.position),
      injury: toNullableString(row.injury),
      returnDate: toNullableString(row.return_date),
      games: toFiniteNumber(row.games),
      averageFantasy: toFiniteNumber(row.average_fantasy),
      sourceUrl: toNullableString(row.source_url),
      scrapedAt: toNullableString(row.scraped_at),
    }))
    .filter((row) => isRelevantOutsTeamMatch(row.team, teamName) && isRelevantOutsPositionMatch(row.position, positionName))
    .slice(0, 8);
}

export async function fetchRelevantCasualtyWardOutCandidates(): Promise<CasualtyWardRecord[]> {
  const supabase = createServerSupabaseClient("nrl");
  const { data, error } = await supabase
    .from("casualty_ward")
    .select("player, team, position, injury, return_date, games, average_fantasy, source_url, scraped_at")
    .order("average_fantasy", { ascending: false })
    .limit(500);

  if (error) {
    console.warn("Unable to fetch relevant casualty ward out candidates; using empty set.", error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    player: toNullableString(row.player) ?? "",
    team: toNullableString(row.team),
    position: toNullableString(row.position),
    injury: toNullableString(row.injury),
    returnDate: toNullableString(row.return_date),
    games: toFiniteNumber(row.games),
    averageFantasy: toFiniteNumber(row.average_fantasy),
    sourceUrl: toNullableString(row.source_url),
    scrapedAt: toNullableString(row.scraped_at),
  }));
}

export async function fetchOriginChances(): Promise<OriginChanceRecord[]> {
  const supabase = createServerSupabaseClient("nrl");
  const { data, error } = await supabase
    .from("origin_chances")
    .select("player, created_at, updated_at")
    .order("player", { ascending: true })
    .limit(1000);

  if (error) {
    console.warn("Unable to fetch Origin chance rows; using empty set.", error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    player: toNullableString(row.player) ?? "",
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  }));
}

export async function fetchPlayerImagesFromSupabase(): Promise<PlayerImageRecord[]> {
  const raw = await fetchAllRows<Record<string, unknown>>("player_images");
  return raw.map((row) => ({
    player: typeof row.player === "string" ? row.player : "",
    team: typeof row.team === "string" ? row.team : null,
    number: row.number == null ? null : String(row.number),
    position: typeof row.position === "string" ? row.position : null,
    head_image: typeof row.head_image === "string" ? row.head_image : null,
    body_image: typeof row.body_image === "string" ? row.body_image : null,
    last_seen_match_date:
      typeof row.last_seen_match_date === "string" ? row.last_seen_match_date : null,
  }));
}

const fetchPlayerImagesCached = unstable_cache(
  async (): Promise<PlayerImageRecord[]> => fetchPlayerImagesFromSupabase(),
  ["player-images-v1"],
  { revalidate: 3600 }
);

export async function fetchPlayerImages(): Promise<PlayerImageRecord[]> {
  try {
    if (process.env.NODE_ENV !== "production") {
      return await fetchPlayerImagesFromSupabase();
    }
    return await fetchPlayerImagesCached();
  } catch (error) {
    console.warn("Unable to fetch player_images; using empty image list.", error);
    return [];
  }
}

export async function fetchPlayerFantasySd5yFromSupabase(): Promise<PlayerFantasySd5yRecord[]> {
  const raw = await fetchAllRowsFromSchema<Record<string, unknown>>("shortside", "player_fantasy_sd_5y");
  return raw.flatMap((row) => {
    const player = typeof row.player === "string" ? row.player.trim() : "";
    const games = toFiniteNumber(row.games);
    if (!player || games == null) return [];

    return [{
      player,
      primary_position: typeof row.primary_position === "string" ? row.primary_position : null,
      games: Math.trunc(games),
      avg_fantasy: toFiniteNumber(row.avg_fantasy),
      fantasy_sd: toFiniteNumber(row.fantasy_sd),
      fantasy_cv: toFiniteNumber(row.fantasy_cv),
      min_score: toFiniteNumber(row.min_score),
      max_score: toFiniteNumber(row.max_score),
    }];
  });
}

export async function fetchPositionFantasySd5yFromSupabase(): Promise<PositionFantasySd5yRecord[]> {
  const raw = await fetchAllRowsFromSchema<Record<string, unknown>>("shortside", "position_fantasy_sd_5y");
  return raw.flatMap((row) => {
    const position = typeof row.position === "string" ? row.position.trim() : "";
    const games = toFiniteNumber(row.games);
    const players = toFiniteNumber(row.players);
    if (!position || games == null || players == null) return [];

    return [{
      position,
      games: Math.trunc(games),
      players: Math.trunc(players),
      avg_fantasy: toFiniteNumber(row.avg_fantasy),
      fantasy_sd: toFiniteNumber(row.fantasy_sd),
      fantasy_cv: toFiniteNumber(row.fantasy_cv),
    }];
  });
}

export async function fetchTeamLogosFromSupabase(): Promise<Record<string, string>> {
  const raw = await fetchAllRows<Record<string, unknown>>("team_logos");
  const logos = new Map<string, string>();

  for (const row of raw) {
    const teamKey = normaliseTeamKey(row.team);
    if (!teamKey) continue;

    const candidates = [
      row.short_side_logo_url,
      row.side_logo_url,
      row.short_logo_url,
      row.logo_url,
    ];
    const logoUrl = candidates.find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    )?.trim();

    if (logoUrl && !logos.has(teamKey)) {
      logos.set(teamKey, logoUrl);
    }
  }

  return Object.fromEntries(logos);
}

const fetchTeamLogosCached = unstable_cache(
  async (): Promise<Record<string, string>> => fetchTeamLogosFromSupabase(),
  ["team-logos-v1"],
  { revalidate: 3600 }
);

export async function fetchTeamLogos(): Promise<Record<string, string>> {
  try {
    if (process.env.NODE_ENV !== "production") {
      return await fetchTeamLogosFromSupabase();
    }
    return await fetchTeamLogosCached();
  } catch (error) {
    console.warn("Unable to fetch team_logos; using empty logo map.", error);
    return {};
  }
}

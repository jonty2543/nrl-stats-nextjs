import { createServerSupabaseClient } from "./client";
import { unstable_cache } from "next/cache";
import {
  COLUMN_RENAME_MAP,
  FINALS_MAP,
  FINALS_LABEL_MAP,
} from "@/lib/data/constants";
import type { PlayerStat, Match, TeamStat, TeammateLookupRow } from "@/lib/data/types";
import type { PlayerTryHistory } from "@/lib/lineups/matchup-insights";
import type {
  LineupCasualtyOut,
  LineupMatch,
  LineupMatchStats,
  LineupRoundOption,
  LineupSportsbetOdds,
  LineupTryscorerOdds,
} from "@/lib/lineups/nrl-lineups";
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
const FALLBACK_LINE_MARGIN_SIGMA = 16.85;
const FALLBACK_TOTAL_POINTS_SIGMA = 16.85;

export interface PlayerImageRecord {
  player: string;
  team: string | null;
  number: string | null;
  position: string | null;
  head_image: string | null;
  body_image: string | null;
  last_seen_match_date: string | null;
}

export interface BettingSummaryGame {
  round: number | null;
  matchDate: string;
  kickoffUtc: string | null;
  releaseAtUtc: string | null;
  matchCentreUrl: string | null;
  match: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamKey: string | null;
  awayTeamKey: string | null;
  matchKey: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
}

export interface BettingTryscorerFormSummary {
  player: string;
  team: string | null;
  position?: string | null;
  gamesPlayed?: number;
  tries2026?: number;
  lastFive: number[];
  average: number;
  headImage?: string | null;
  bodyImage?: string | null;
  teamLogoUrl?: string | null;
}

export interface BettingPageSummary {
  id: string;
  year: number | null;
  games: BettingSummaryGame[];
  teamLogos: Record<string, string>;
  playerTeamsByName: Record<string, string>;
  tryscorerFormByPlayer: Record<string, BettingTryscorerFormSummary>;
  tryscorerKickoffsByMatch: Record<string, string>;
  lineupPlayersByMatch: Record<string, unknown>;
  updatedAt: string | null;
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

export interface FantasyPlayerCardSummary {
  playerId: number | null;
  player: string;
  localName: string | null;
  team: string | null;
  position: string | null;
  weeklyChange: number | null;
  pricedAt: number | null;
  avg2026: number | null;
  last3: number | null;
  ppm: number | null;
  projection: number | null;
  value: number | null;
  breakeven: number | null;
  gamesPlayed: number | null;
  price: number | null;
  ownedBy: number | null;
  nextMajorByeRound: number | null;
  playsNextMajorBye: boolean | null;
  originChance: boolean | null;
  updatedAt: string | null;
}

export interface LineupsPageSummary {
  year: number;
  round: string;
  roundOptions: LineupRoundOption[];
  matches: LineupMatch[];
  matchStats: Record<string, LineupMatchStats>;
  teamLogos: Record<string, string>;
  tryscorerOdds: Record<string, LineupTryscorerOdds>;
  sportsbetOdds: Record<string, LineupSportsbetOdds>;
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>;
  playerAverages: Record<string, Record<string, number>>;
  positionPpmBaselines: Record<string, number>;
  playerTryHistory: PlayerTryHistory;
  updatedAt: string | null;
}

export interface LineupsPageShellSummary {
  year: number;
  round: string;
  roundOptions: LineupRoundOption[];
  matches: LineupMatch[];
  teamLogos: Record<string, string>;
  sportsbetOdds: Record<string, LineupSportsbetOdds>;
  updatedAt: string | null;
}

export interface LineupsMatchDetailSummary {
  match: LineupMatch;
  matchStats: LineupMatchStats | null;
  tryscorerOdds: Record<string, LineupTryscorerOdds>;
  sportsbetOdds: Record<string, LineupSportsbetOdds>;
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>;
  playerAverages: Record<string, Record<string, number>>;
  positionPpmBaselines: Record<string, number>;
  playerTryHistory: PlayerTryHistory;
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

const NRL_TEAM_LOGO_ALIAS_GROUPS: string[][] = [
  ["brisbane broncos", "broncos"],
  ["canberra raiders", "raiders"],
  ["canterbury bankstown bulldogs", "canterbury bulldogs", "bulldogs"],
  ["cronulla sutherland sharks", "cronulla sharks", "sharks"],
  ["dolphins", "the dolphins"],
  ["gold coast titans", "titans"],
  ["manly warringah sea eagles", "manly sea eagles", "sea eagles", "manly"],
  ["melbourne storm", "storm"],
  ["newcastle knights", "knights"],
  ["new zealand warriors", "nz warriors", "warriors"],
  ["north queensland cowboys", "nth queensland cowboys", "north qld cowboys", "cowboys"],
  ["parramatta eels", "eels"],
  ["penrith panthers", "panthers"],
  ["south sydney rabbitohs", "rabbitohs", "souths"],
  ["st george illawarra dragons", "st george dragons", "st george", "dragons"],
  ["sydney roosters", "eastern suburbs roosters", "roosters"],
  ["wests tigers", "west tigers", "tigers"],
];

function teamLogoAliasKeys(value: unknown): string[] {
  const key = normaliseTeamKey(value);
  if (!key) return [];

  const group = NRL_TEAM_LOGO_ALIAS_GROUPS.find((aliases) =>
    aliases.some((alias) => normaliseTeamKey(alias) === key)
  );
  if (!group) return [key];

  return [...new Set(group.map((alias) => normaliseTeamKey(alias)).filter(Boolean))];
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

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string" && value.trim()) {
    const normalised = value.trim().toLowerCase();
    if (["true", "t", "yes", "y", "1"].includes(normalised)) return true;
    if (["false", "f", "no", "n", "0"].includes(normalised)) return false;
  }
  return null;
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
  playerName: string,
  years?: string[]
): Promise<Record<string, unknown>[]> {
  const supabase = createServerSupabaseClient();
  const allRows: Record<string, unknown>[] = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    let query = supabase
      .from("player_stats")
      .select("*")
      .eq("player", playerName);

    if (years && years.length > 0) {
      const sorted = [...years].sort();
      const minYear = parseInt(sorted[0], 10);
      const maxYear = parseInt(sorted[sorted.length - 1], 10);
      query = query
        .gte("match_date", `${minYear}-01-01`)
        .lt("match_date", `${maxYear + 1}-01-01`);
    }

    const { data, error } = await query.range(start, end);

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

function normalInvProbability(p: number): number {
  if (!(p > 0 && p < 1)) return Number.NaN;
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

interface PredictionModelRow extends Record<string, unknown> {
  url?: unknown;
  match_date?: unknown;
  match?: unknown;
  team?: unknown;
  win_prob?: unknown;
  pred_margin?: unknown;
  pred_margin_pre_manual?: unknown;
  updated_at?: unknown;
}

interface TryscorerPredictionRow extends Record<string, unknown> {
  match_date?: unknown;
  match?: unknown;
  player?: unknown;
  anytime_prob?: unknown;
  updated_at?: unknown;
}

interface MarginOverrideRow extends Record<string, unknown> {
  url?: unknown;
  margin_override_points?: unknown;
}

interface PredictionLookupEntry {
  winProb: number | null;
  predMargin: number | null;
  predTotal: number | null;
  updatedAtMs: number;
}

interface PredictionLookupMaps {
  byDateTeam: Map<string, PredictionLookupEntry>;
  byDateMatchTeam: Map<string, PredictionLookupEntry>;
  byDateMatch: Map<string, PredictionLookupEntry>;
}

interface TryscorerPredictionEntry {
  anytimeProb: number | null;
  updatedAtMs: number;
}

interface TryscorerPredictionLookupMaps {
  byDatePlayer: Map<string, TryscorerPredictionEntry>;
  byDateMatchPlayer: Map<string, TryscorerPredictionEntry>;
}

function predictionHomeTeam(raw: PredictionModelRow): string | null {
  const match = typeof raw.match === "string" ? raw.match : "";
  const parts = match.split(/\s+v(?:s)?\.?\s+/i);
  if (parts.length !== 2) return null;
  return teamJoinKey(parts[0]);
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
  const existingCompleteness = Number(existing.winProb != null) + Number(existing.predMargin != null) + Number(existing.predTotal != null);
  const nextCompleteness = Number(next.winProb != null) + Number(next.predMargin != null) + Number(next.predTotal != null);
  return nextCompleteness >= existingCompleteness ? next : existing;
}

function chooseTryscorerPredictionEntry(
  existing: TryscorerPredictionEntry | undefined,
  next: TryscorerPredictionEntry
): TryscorerPredictionEntry {
  if (!existing) return next;
  if (next.updatedAtMs > existing.updatedAtMs) return next;
  if (next.updatedAtMs < existing.updatedAtMs) return existing;
  const existingCompleteness = Number(existing.anytimeProb != null);
  const nextCompleteness = Number(next.anytimeProb != null);
  return nextCompleteness >= existingCompleteness ? next : existing;
}

function buildOverrideLookup(rows: MarginOverrideRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of rows) {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!url) continue;
    const adjustment = toNullableFinite(raw.margin_override_points);
    out.set(url, adjustment ?? 0);
  }
  return out;
}

function inferPredictionSigma(rows: PredictionModelRow[]): number {
  const sigmaValues: number[] = [];
  for (const raw of rows) {
    const predMargin = toNullableFinite(raw.pred_margin);
    const winProb = toNullableProbability(raw.win_prob);
    if (predMargin == null || winProb == null || Math.abs(predMargin) < 0.25) continue;
    const z = normalInvProbability(winProb);
    if (!Number.isFinite(z) || Math.abs(z) < 0.05) continue;
    const sigma = Math.abs(predMargin / z);
    if (Number.isFinite(sigma) && sigma >= 5 && sigma <= 40) {
      sigmaValues.push(sigma);
    }
  }
  if (sigmaValues.length === 0) return FALLBACK_LINE_MARGIN_SIGMA;
  sigmaValues.sort((a, b) => a - b);
  const mid = Math.floor(sigmaValues.length / 2);
  return sigmaValues.length % 2 === 1
    ? sigmaValues[mid]
    : (sigmaValues[mid - 1] + sigmaValues[mid]) / 2;
}

function effectivePredictionMargin(raw: PredictionModelRow, overrides: Map<string, number>): number | null {
  const predMargin = toNullableFinite(raw.pred_margin);
  const preManual = toNullableFinite(raw.pred_margin_pre_manual);
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const override = url ? overrides.get(url) : undefined;

  if (preManual == null || override == null || Math.abs(override) < 1e-9) {
    return predMargin;
  }

  const teamKey = teamJoinKey(raw.team);
  const homeKey = predictionHomeTeam(raw);
  if (!teamKey || !homeKey) return predMargin;

  const signedOverride = teamKey === homeKey ? override : -override;
  return preManual + signedOverride;
}

function buildPredictionLookup(rows: PredictionModelRow[], overrideRows: MarginOverrideRow[] = []): PredictionLookupMaps {
  const byDateTeam = new Map<string, PredictionLookupEntry>();
  const byDateMatchTeam = new Map<string, PredictionLookupEntry>();
  const byDateMatch = new Map<string, PredictionLookupEntry>();
  const overrides = buildOverrideLookup(overrideRows);
  const marginSigma = inferPredictionSigma(rows);

  for (const raw of rows) {
    const date = toIsoDate(raw.match_date);
    const teamKey = teamJoinKey(raw.team);
    if (!date || !teamKey) continue;

    const predMargin = effectivePredictionMargin(raw, overrides);
    const entry: PredictionLookupEntry = {
      winProb: predMargin == null ? toNullableProbability(raw.win_prob) : normalCdf(predMargin / marginSigma),
      predMargin,
      predTotal: toNullableFinite(raw.pred_total),
      updatedAtMs: toUpdatedAtMs(raw.updated_at),
    };

    const dateTeamKey = `${date}|${teamKey}`;
    byDateTeam.set(dateTeamKey, choosePredictionEntry(byDateTeam.get(dateTeamKey), entry));

    const normalizedMatchKey = matchKey(raw.match);
    if (!normalizedMatchKey) continue;

    const dateMatchKey = `${date}|${normalizedMatchKey}`;
    byDateMatch.set(dateMatchKey, choosePredictionEntry(byDateMatch.get(dateMatchKey), entry));

    const dateMatchTeamKey = `${date}|${normalizedMatchKey}|${teamKey}`;
    byDateMatchTeam.set(
      dateMatchTeamKey,
      choosePredictionEntry(byDateMatchTeam.get(dateMatchTeamKey), entry)
    );
  }

  return { byDateTeam, byDateMatchTeam, byDateMatch };
}

function buildTryscorerPredictionLookup(rows: TryscorerPredictionRow[]): TryscorerPredictionLookupMaps {
  const byDatePlayer = new Map<string, TryscorerPredictionEntry>();
  const byDateMatchPlayer = new Map<string, TryscorerPredictionEntry>();

  for (const raw of rows) {
    const date = toIsoDate(raw.match_date);
    const playerKey = normaliseLookupKey(raw.player);
    if (!date || !playerKey) continue;

    const entry: TryscorerPredictionEntry = {
      anytimeProb: toNullableProbability(raw.anytime_prob),
      updatedAtMs: toUpdatedAtMs(raw.updated_at),
    };

    const datePlayerKey = `${date}|${playerKey}`;
    byDatePlayer.set(datePlayerKey, chooseTryscorerPredictionEntry(byDatePlayer.get(datePlayerKey), entry));

    const normalizedMatchKey = matchKey(raw.match);
    if (!normalizedMatchKey) continue;

    const dateMatchPlayerKey = `${date}|${normalizedMatchKey}|${playerKey}`;
    byDateMatchPlayer.set(
      dateMatchPlayerKey,
      chooseTryscorerPredictionEntry(byDateMatchPlayer.get(dateMatchPlayerKey), entry)
    );
  }

  return { byDatePlayer, byDateMatchPlayer };
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

function findPredictionForTotalOddsRow(
  row: BettingOddsRow,
  lookup: PredictionLookupMaps
): PredictionLookupEntry | null {
  const date = toIsoDate(row.date);
  const normalizedMatchKey = matchKey(row.match);
  if (!date || !normalizedMatchKey) return null;

  return lookup.byDateMatch.get(`${date}|${normalizedMatchKey}`) ?? null;
}

function findTryscorerPredictionForOddsRow(
  row: BettingOddsRow,
  lookup: TryscorerPredictionLookupMaps
): TryscorerPredictionEntry | null {
  const date = toIsoDate(row.date);
  const playerKey = normaliseLookupKey(row.result);
  if (!date || !playerKey) return null;

  const normalizedMatchKey = matchKey(row.match);
  if (normalizedMatchKey) {
    const byMatch = lookup.byDateMatchPlayer.get(`${date}|${normalizedMatchKey}|${playerKey}`);
    if (byMatch) return byMatch;
  }

  return lookup.byDatePlayer.get(`${date}|${playerKey}`) ?? null;
}

function applyPredictionModelToRow(row: BettingOddsRow, lookup: PredictionLookupMaps): BettingOddsRow {
  if (row.market !== "H2H" && row.market !== "Line" && row.market !== "Total") return row;

  if (row.market === "Total") {
    const prediction = findPredictionForTotalOddsRow(row, lookup);
    const result = row.result.trim().toLowerCase();
    if (!prediction || prediction.predTotal == null || row.value == null) {
      return {
        ...row,
        model: null,
      };
    }

    const probability = result.startsWith("over")
      ? normalCdf((prediction.predTotal - row.value) / FALLBACK_TOTAL_POINTS_SIGMA)
      : result.startsWith("under")
        ? normalCdf((row.value - prediction.predTotal) / FALLBACK_TOTAL_POINTS_SIGMA)
        : null;

    return {
      ...row,
      model: probability == null ? null : probability * 100,
    };
  }

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

  const z = (prediction.predMargin + row.value) / FALLBACK_LINE_MARGIN_SIGMA;
  const coverProbability = normalCdf(z);
  return {
    ...row,
    model: coverProbability * 100,
  };
}

function applyTryscorerPredictionModelToRow(
  row: BettingOddsRow,
  lookup: TryscorerPredictionLookupMaps
): BettingOddsRow {
  if (row.market !== "Tryscorer") return row;

  const prediction = findTryscorerPredictionForOddsRow(row, lookup);
  if (!prediction) {
    return {
      ...row,
      model: null,
    };
  }

  const targetTries = Math.max(1, Math.round(row.value ?? 1));
  const probability = targetTries <= 1 ? prediction.anytimeProb : null;

  return {
    ...row,
    model: probability == null ? null : probability * 100,
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

function isBettingOddsTable(value: unknown): value is BettingOddsTable {
  return value === "NRL Odds" || value === "NRL Line Odds" || value === "NRL Total Odds" || value === "NRL Tryscorers";
}

function tableForBettingMarket(market: BettingMarket): BettingOddsTable {
  if (market === "Line") return "NRL Line Odds";
  if (market === "Total") return "NRL Total Odds";
  if (market === "Tryscorer") return "NRL Tryscorers";
  return "NRL Odds";
}

function mapBettingSnapshotRow(raw: unknown, fallbackMarket: BettingMarket): BettingOddsRow | null {
  const row = asRecord(raw);
  const table = isBettingOddsTable(row.table) ? row.table : tableForBettingMarket(fallbackMarket);
  const market = mapBettingMarket(table, row.market ?? row.Market);
  const mapped: BettingOddsRow = {
    table,
    market,
    date: toIsoDate(row.date ?? row.Date),
    match: toNullableString(row.match ?? row.Match) ?? "",
    result: toNullableString(row.result ?? row.Result) ?? "",
    value: toNullableFinite(row.value ?? row.Value),
    model: toNullableFinite(row.model ?? row.Model),
    bestBookie: toNullableString(row.bestBookie ?? row.best_bookie ?? row["Best Bookie"]),
    bestPrice: toNullableOdds(row.bestPrice ?? row.best_price ?? row["Best Price"]),
    marketPercentage: toNullableFinite(row.marketPercentage ?? row.market_percentage ?? row["Market %"]),
    Sportsbet: toNullableOdds(row.Sportsbet ?? row.sportsbet),
    Pointsbet: toNullableOdds(row.Pointsbet ?? row.pointsbet),
    Unibet: toNullableOdds(row.Unibet ?? row.unibet),
    Palmerbet: toNullableOdds(row.Palmerbet ?? row.palmerbet),
    Betright: toNullableOdds(row.Betright ?? row.betright),
    Betr: toNullableOdds(row.Betr ?? row.betr),
  };

  if (!mapped.date || !mapped.match || !mapped.result) return null;
  return {
    ...mapped,
    ...computeBestBookieFromRow(mapped),
  };
}

function mapBettingSnapshotRows(raw: unknown, market: BettingMarket): BettingOddsRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((row) => {
      const record = asRecord(row);
      const table = isBettingOddsTable(record.table) ? record.table : tableForBettingMarket(market);
      if ((table === "NRL Line Odds" || table === "NRL Total Odds") && hasBookSpecificOddsColumns(record)) {
        return mapBookSpecificBettingRows(table, record).filter((mapped) => mapped.date && mapped.match && mapped.result);
      }
      const mapped = mapBettingSnapshotRow(record, market);
      return mapped ? [mapped] : [];
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.match !== b.match) return a.match.localeCompare(b.match);
      return a.result.localeCompare(b.result);
    });
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
  localPlayerName: string,
  years?: string[]
): Promise<PlayerStat[]> {
  const [rawPlayers, rawMatches] = await Promise.all([
    fetchPlayerStatsRowsForPlayerFromSupabase(localPlayerName, years),
    fetchAllRows<Record<string, unknown>>("matches", {
      years,
      columns: "match_date,team,opponent_team,is_home",
    }),
  ]);
  return buildPlayerStatsRows(rawPlayers, rawMatches);
}

export async function fetchFantasyPlayerStatsForYears(
  fantasyName: string,
  years?: string[]
): Promise<PlayerStat[]> {
  if (!fantasyName.trim()) return [];
  const normalizedYears = years?.filter(Boolean).sort();
  try {
    const serverCache = await readPlayerStatsServerCache(normalizedYears);

    if (serverCache) {
      const allRows = filterPlayerStatsRowsByYears(serverCache.rows, normalizedYears);
      if (allRows.length === 0) return [];

      const localNames = Array.from(new Set(allRows.map((row) => row.Name))).sort();
      const matchedLocalName = findLocalPlayerMatchForFantasyName(fantasyName, localNames);
      if (!matchedLocalName) return [];
      const matchedNameKey = normaliseNameForMatch(matchedLocalName);

      return allRows.filter((row) => normaliseNameForMatch(row.Name) === matchedNameKey);
    }

    const teammateRows = await fetchTeammateLookupRows(normalizedYears);
    if (teammateRows.length === 0) return [];
    const localNames = Array.from(new Set(teammateRows.map((row) => row.Name))).sort();
    const matchedLocalName = findLocalPlayerMatchForFantasyName(fantasyName, localNames);
    if (!matchedLocalName) return [];

    return fetchPlayerStatsForLocalNameAllYearsFromSupabase(matchedLocalName, normalizedYears);
  } catch (error) {
    console.warn("Unable to fetch fantasy player stats; returning empty set.", error);
    return [];
  }
}

export async function fetchFantasyPlayerStatsAllYears(
  fantasyName: string
): Promise<PlayerStat[]> {
  return fetchFantasyPlayerStatsForYears(fantasyName);
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

async function fetchBettingOddsTableOrEmpty(table: BettingOddsTable): Promise<BettingOddsRow[]> {
  try {
    return await fetchBettingOddsTableFromSupabase(table);
  } catch (error) {
    console.warn(`Unable to fetch ${table}; rendering that betting market empty.`, error);
    return [];
  }
}

function bettingOddsDateRange(rows: BettingOddsRow[]): { minDate: string; maxDate: string } | null {
  const dates = rows
    .map((row) => row.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  return minDate && maxDate ? { minDate, maxDate } : null;
}

async function fetchPredictionModelRowsFromSupabase(rows: BettingOddsRow[]): Promise<PredictionModelRow[]> {
  const dateRange = bettingOddsDateRange(rows);
  if (!dateRange) return [];

  const supabase = createServerSupabaseClient("nrl");
  const allRows: PredictionModelRow[] = [];
  let start = 0;
  let select = "url,match_date,match,team,win_prob,pred_margin,pred_margin_pre_manual,pred_total,updated_at";

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("nrl_predictions")
      .select(select)
      .gte("match_date", dateRange.minDate)
      .lte("match_date", dateRange.maxDate)
      .range(start, end);

    if (error) {
      const message = error.message.toLowerCase();
      if (select.includes("pred_total") && (message.includes("pred_total") || message.includes("column") || message.includes("schema cache"))) {
        select = select.replace(",pred_total", "");
        start = 0;
        allRows.length = 0;
        continue;
      }
      if (select.includes("pred_margin_pre_manual") && (message.includes("pred_margin_pre_manual") || message.includes("column") || message.includes("schema cache"))) {
        select = "url,match_date,match,team,win_prob,pred_margin,updated_at";
        start = 0;
        allRows.length = 0;
        continue;
      }
      throw new Error(`Supabase fetch nrl.nrl_predictions: ${error.message}`);
    }
    const pageRows = (data ?? []) as unknown as PredictionModelRow[];
    if (pageRows.length === 0) break;
    allRows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allRows;
}

async function fetchMarginOverrideRowsFromSupabase(rows: PredictionModelRow[]): Promise<MarginOverrideRow[]> {
  const urls = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.url === "string" ? row.url.trim() : ""))
        .filter(Boolean)
    )
  );
  if (urls.length === 0) return [];

  const supabase = createServerSupabaseClient("nrl");
  const allRows: MarginOverrideRow[] = [];
  for (let start = 0; start < urls.length; start += PAGE_SIZE) {
    const chunk = urls.slice(start, start + PAGE_SIZE);
    const { data, error } = await supabase
      .from("result_margin_overrides")
      .select("url,margin_override_points")
      .in("url", chunk);
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
        return [];
      }
      throw new Error(`Supabase fetch nrl.result_margin_overrides: ${error.message}`);
    }
    allRows.push(...((data ?? []) as unknown as MarginOverrideRow[]));
  }
  return allRows;
}

async function fetchTryscorerPredictionRowsFromSupabase(rows: BettingOddsRow[]): Promise<TryscorerPredictionRow[]> {
  const dateRange = bettingOddsDateRange(rows);
  if (!dateRange) return [];

  const supabase = createServerSupabaseClient("nrl");
  const allRows: TryscorerPredictionRow[] = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("tryscorer_predictions")
      .select("match_date,match,player,anytime_prob,updated_at")
      .gte("match_date", dateRange.minDate)
      .lte("match_date", dateRange.maxDate)
      .range(start, end);

    if (error) {
      throw new Error(`Supabase fetch nrl.tryscorer_predictions: ${error.message}`);
    }

    const pageRows = (data ?? []) as unknown as TryscorerPredictionRow[];
    if (pageRows.length === 0) break;
    allRows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allRows;
}

async function fetchNamedLineupPlayersForTryscorers(rows: BettingOddsRow[]): Promise<Map<string, Set<string>>> {
  const dateRange = bettingOddsDateRange(rows);
  if (!dateRange) return new Map();

  const supabase = createServerSupabaseClient("nrl");
  const namedPlayersByMatch = new Map<string, Set<string>>();
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("lineups")
      .select("match_date,match,player")
      .gte("match_date", dateRange.minDate)
      .lte("match_date", dateRange.maxDate)
      .range(start, end);

    if (error) {
      throw new Error(`Supabase fetch nrl.lineups for betting tryscorers: ${error.message}`);
    }

    const pageRows = (data ?? []) as Array<Record<string, unknown>>;
    if (pageRows.length === 0) break;

    for (const row of pageRows) {
      const date = toIsoDate(row.match_date);
      const match = matchKey(row.match);
      const player = normaliseLookupKey(row.player);
      if (!date || !match || !player) continue;

      const key = `${date}|${match}`;
      const players = namedPlayersByMatch.get(key) ?? new Set<string>();
      players.add(player);
      namedPlayersByMatch.set(key, players);
    }

    if (pageRows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return namedPlayersByMatch;
}

function filterTryscorersToNamedLineups(rows: BettingOddsRow[], namedPlayersByMatch: Map<string, Set<string>>): BettingOddsRow[] {
  if (namedPlayersByMatch.size === 0) return rows;

  return rows.filter((row) => {
    const namedPlayers = namedPlayersByMatch.get(`${row.date}|${matchKey(row.match)}`);
    if (!namedPlayers) return true;
    return namedPlayers.has(normaliseLookupKey(row.result));
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function mapBettingSummaryGame(raw: unknown): BettingSummaryGame | null {
  const row = asRecord(raw);
  const matchDate = typeof row.matchDate === "string" ? row.matchDate : "";
  const match = typeof row.match === "string" ? row.match : "";
  const matchKey = typeof row.matchKey === "string" ? row.matchKey : "";
  if (!matchDate || !match || !matchKey) return null;

  return {
    round: typeof row.round === "number" && Number.isFinite(row.round) ? row.round : null,
    matchDate,
    kickoffUtc: typeof row.kickoffUtc === "string" ? row.kickoffUtc : null,
    releaseAtUtc: typeof row.releaseAtUtc === "string" ? row.releaseAtUtc : null,
    matchCentreUrl: typeof row.matchCentreUrl === "string" ? row.matchCentreUrl : null,
    match,
    homeTeam: typeof row.homeTeam === "string" ? row.homeTeam : "",
    awayTeam: typeof row.awayTeam === "string" ? row.awayTeam : "",
    homeTeamKey: typeof row.homeTeamKey === "string" ? row.homeTeamKey : null,
    awayTeamKey: typeof row.awayTeamKey === "string" ? row.awayTeamKey : null,
    matchKey,
    homeLogoUrl: typeof row.homeLogoUrl === "string" ? row.homeLogoUrl : null,
    awayLogoUrl: typeof row.awayLogoUrl === "string" ? row.awayLogoUrl : null,
  };
}

function mapBettingTryscorerForm(value: unknown): BettingTryscorerFormSummary | null {
  const row = asRecord(value);
  const player = typeof row.player === "string" ? row.player : "";
  if (!player) return null;
  const lastFive = Array.isArray(row.lastFive)
    ? row.lastFive.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];

  return {
    player,
    team: typeof row.team === "string" ? row.team : null,
    position: typeof row.position === "string" ? row.position : null,
    gamesPlayed: typeof row.gamesPlayed === "number" && Number.isFinite(row.gamesPlayed) ? row.gamesPlayed : undefined,
    tries2026: typeof row.tries2026 === "number" && Number.isFinite(row.tries2026) ? row.tries2026 : undefined,
    lastFive,
    average: typeof row.average === "number" && Number.isFinite(row.average) ? row.average : 0,
    headImage: typeof row.headImage === "string" ? row.headImage : null,
    bodyImage: typeof row.bodyImage === "string" ? row.bodyImage : null,
    teamLogoUrl: typeof row.teamLogoUrl === "string" ? row.teamLogoUrl : null,
  };
}

function emptyBettingPageSummary(): BettingPageSummary {
  return {
    id: "current",
    year: null,
    games: [],
    teamLogos: {},
    playerTeamsByName: {},
    tryscorerFormByPlayer: {},
    tryscorerKickoffsByMatch: {},
    lineupPlayersByMatch: {},
    updatedAt: null,
  };
}

export async function fetchBettingPageSummaryFromSupabase(): Promise<BettingPageSummary> {
  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("betting_page_summary")
    .select("id,year,games,team_logos,player_teams_by_name,tryscorer_form_by_player,tryscorer_kickoffs_by_match,lineup_players_by_match,updated_at")
    .eq("id", "current")
    .maybeSingle();

  if (error) throw new Error(`Supabase fetch summary.betting_page_summary: ${error.message}`);
  if (!data) return emptyBettingPageSummary();

  const row = data as Record<string, unknown>;
  const tryscorerFormByPlayer = Object.fromEntries(
    Object.entries(asRecord(row.tryscorer_form_by_player)).flatMap(([key, value]) => {
      const mapped = mapBettingTryscorerForm(value);
      return mapped ? [[key, mapped]] : [];
    })
  );

  return {
    id: typeof row.id === "string" ? row.id : "current",
    year: typeof row.year === "number" && Number.isFinite(row.year) ? row.year : null,
    games: Array.isArray(row.games) ? row.games.flatMap((game) => {
      const mapped = mapBettingSummaryGame(game);
      return mapped ? [mapped] : [];
    }) : [],
    teamLogos: asStringRecord(row.team_logos),
    playerTeamsByName: asStringRecord(row.player_teams_by_name),
    tryscorerFormByPlayer,
    tryscorerKickoffsByMatch: asStringRecord(row.tryscorer_kickoffs_by_match),
    lineupPlayersByMatch: asRecord(row.lineup_players_by_match),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function fetchBettingPageSummary(): Promise<BettingPageSummary> {
  try {
    return await fetchBettingPageSummaryFromSupabase();
  } catch (error) {
    console.warn("Unable to fetch betting page summary; rendering betting page with live odds only.", error);
    return emptyBettingPageSummary();
  }
}

function shouldEnrichBettingSnapshotModels(snapshot: BettingOddsSnapshot): boolean {
  return [...snapshot.h2h, ...snapshot.line, ...snapshot.total, ...snapshot.tryscorer]
    .some((row) => row.model == null);
}

async function enrichBettingSnapshotModels(snapshot: BettingOddsSnapshot): Promise<BettingOddsSnapshot> {
  if (!shouldEnrichBettingSnapshotModels(snapshot)) return snapshot;

  const predictionRows = await fetchPredictionModelRowsFromSupabase([
    ...snapshot.h2h,
    ...snapshot.line,
    ...snapshot.total,
  ]).catch((error) => {
    console.warn("Unable to enrich summary betting odds with prediction rows.", error);
    return [];
  });
  const marginOverrideRows = await fetchMarginOverrideRowsFromSupabase(predictionRows).catch((error) => {
    console.warn("Unable to fetch betting margin overrides for summary enrichment; using saved prediction margins.", error);
    return [];
  });
  const tryscorerPredictionRows = await fetchTryscorerPredictionRowsFromSupabase(snapshot.tryscorer).catch((error) => {
    console.warn("Unable to enrich summary tryscorer odds with prediction rows.", error);
    return [];
  });
  const predictionLookup = buildPredictionLookup(predictionRows, marginOverrideRows);
  const tryscorerPredictionLookup = buildTryscorerPredictionLookup(tryscorerPredictionRows);

  return {
    ...snapshot,
    h2h: snapshot.h2h.map((row) => applyPredictionModelToRow(row, predictionLookup)),
    line: snapshot.line.map((row) => applyPredictionModelToRow(row, predictionLookup)),
    total: snapshot.total.map((row) => applyPredictionModelToRow(row, predictionLookup)),
    tryscorer: snapshot.tryscorer.map((row) => applyTryscorerPredictionModelToRow(row, tryscorerPredictionLookup)),
  };
}

export async function fetchBettingOddsSnapshotFromSummary(): Promise<BettingOddsSnapshot> {
  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("betting_odds_snapshot")
    .select("id,h2h,line,total,tryscorer,generated_at,updated_at")
    .eq("id", "current")
    .maybeSingle();

  if (error) throw new Error(`Supabase fetch summary.betting_odds_snapshot: ${error.message}`);
  if (!data) throw new Error("Supabase fetch summary.betting_odds_snapshot: current row not found");

  const row = data as Record<string, unknown>;
  const snapshot = {
    h2h: mapBettingSnapshotRows(row.h2h, "H2H"),
    line: mapBettingSnapshotRows(row.line, "Line"),
    total: mapBettingSnapshotRows(row.total, "Total"),
    tryscorer: mapBettingSnapshotRows(row.tryscorer, "Tryscorer"),
    generatedAt: toNullableString(row.generated_at) ?? toNullableString(row.updated_at) ?? new Date().toISOString(),
  };
  return enrichBettingSnapshotModels(snapshot);
}

export async function fetchBettingOddsSnapshotFromRawTables(): Promise<BettingOddsSnapshot> {
  const [h2hRaw, lineRaw, totalRaw, tryscorer] = await Promise.all([
    fetchBettingOddsTableOrEmpty("NRL Odds"),
    fetchBettingOddsTableOrEmpty("NRL Line Odds"),
    fetchBettingOddsTableOrEmpty("NRL Total Odds"),
    fetchBettingOddsTableOrEmpty("NRL Tryscorers"),
  ]);
  const predictionRows = await fetchPredictionModelRowsFromSupabase([...h2hRaw, ...lineRaw, ...totalRaw]).catch((error) => {
    console.warn("Unable to fetch betting prediction rows; rendering odds without model values.", error);
    return [];
  });
  const marginOverrideRows = await fetchMarginOverrideRowsFromSupabase(predictionRows).catch((error) => {
    console.warn("Unable to fetch betting margin overrides; using saved prediction margins.", error);
    return [];
  });
  const tryscorerPredictionRows = await fetchTryscorerPredictionRowsFromSupabase(tryscorer).catch((error) => {
    console.warn("Unable to fetch betting tryscorer prediction rows; rendering try scorer odds without model values.", error);
    return [];
  });
  const namedLineupPlayersByMatch = await fetchNamedLineupPlayersForTryscorers(tryscorer).catch((error) => {
    console.warn("Unable to fetch betting lineup players; rendering try scorer odds without lineup filtering.", error);
    return new Map<string, Set<string>>();
  });
  const predictionLookup = buildPredictionLookup(predictionRows, marginOverrideRows);
  const tryscorerPredictionLookup = buildTryscorerPredictionLookup(tryscorerPredictionRows);
  const namedTryscorers = filterTryscorersToNamedLineups(tryscorer, namedLineupPlayersByMatch);
  const h2h = h2hRaw.map((row) => applyPredictionModelToRow(row, predictionLookup));
  const line = lineRaw.map((row) => applyPredictionModelToRow(row, predictionLookup));
  const total = totalRaw.map((row) => applyPredictionModelToRow(row, predictionLookup));

  return {
    h2h,
    line,
    total,
    tryscorer: namedTryscorers.map((row) => applyTryscorerPredictionModelToRow(row, tryscorerPredictionLookup)),
    generatedAt: new Date().toISOString(),
  };
}

export async function fetchBettingOddsSnapshot(): Promise<BettingOddsSnapshot> {
  try {
    return await fetchBettingOddsSnapshotFromSummary();
  } catch (error) {
    console.warn("Unable to fetch summary betting odds snapshot; falling back to raw odds tables.", error);
    try {
      return await fetchBettingOddsSnapshotFromRawTables();
    } catch (rawError) {
      console.warn("Unable to fetch betting odds snapshot; using empty odds lists.", rawError);
      return {
        h2h: [],
        line: [],
        total: [],
        tryscorer: [],
        generatedAt: new Date().toISOString(),
      };
    }
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

function mapFantasyPlayerCardSummary(row: Record<string, unknown>): FantasyPlayerCardSummary | null {
  const player = toNullableString(row.player) ?? toNullableString(row.name);
  if (!player) return null;

  return {
    playerId:
      toFiniteNumber(row.player_id) ??
      toFiniteNumber(row.fantasy_player_id) ??
      toFiniteNumber(row.nrl_fantasy_id),
    player,
    localName: toNullableString(row.local_name) ?? toNullableString(row.stats_player),
    team: toNullableString(row.team),
    position: toNullableString(row.position) ?? toNullableString(row.position_label),
    weeklyChange: toFiniteNumber(row.weekly_change) ?? toFiniteNumber(row.ownership_delta),
    pricedAt: toFiniteNumber(row.priced_at),
    avg2026: toFiniteNumber(row.avg_2026) ?? toFiniteNumber(row.average_2026),
    last3: toFiniteNumber(row.last3) ?? toFiniteNumber(row.last_3) ?? toFiniteNumber(row.l3_average),
    ppm: toFiniteNumber(row.ppm),
    projection: toFiniteNumber(row.projection),
    value: toFiniteNumber(row.value),
    breakeven: toFiniteNumber(row.breakeven) ?? toFiniteNumber(row.be),
    gamesPlayed: toFiniteNumber(row.games_played) ?? toFiniteNumber(row.games),
    price: toFiniteNumber(row.price) ?? toFiniteNumber(row.cost),
    ownedBy: toFiniteNumber(row.owned_by) ?? toFiniteNumber(row.own_percent),
    nextMajorByeRound: toFiniteNumber(row.next_major_bye_round),
    playsNextMajorBye: toNullableBoolean(row.plays_next_major_bye),
    originChance: toNullableBoolean(row.origin_chance),
    updatedAt: toNullableString(row.updated_at),
  };
}

function jsonRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, T> : {};
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

interface FetchFantasyPlayerCardSummariesOptions {
  limit?: number
  orderBy?: "player" | "weeklyChangeDesc"
  requirePositiveWeeklyChange?: boolean
}

async function fetchFantasyPlayerCardSummariesFromSupabase(
  options: FetchFantasyPlayerCardSummariesOptions = {}
): Promise<FantasyPlayerCardSummary[]> {
  const { limit = 1000, orderBy = "player", requirePositiveWeeklyChange = false } = options
  const supabase = createServerSupabaseClient("summary");
  let query = supabase
    .from("fantasy_player_card_summary")
    .select("*")

  if (requirePositiveWeeklyChange) {
    query = query.gt("weekly_change", 0)
  }

  query = orderBy === "weeklyChangeDesc"
    ? query
      .order("weekly_change", { ascending: false, nullsFirst: false })
      .order("price", { ascending: false, nullsFirst: false })
    : query.order("player", { ascending: true })

  const { data, error } = await query.limit(limit);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
      return [];
    }
    throw new Error(`Supabase fetch summary.fantasy_player_card_summary: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapFantasyPlayerCardSummary)
    .filter((row): row is FantasyPlayerCardSummary => row !== null);
}

function mapLineupPlayerTryHistoryRow(row: Record<string, unknown>): [string, PlayerTryHistory[string]] | null {
  const key = toNullableString(row.player_key);
  if (!key || !Array.isArray(row.history)) return null;

  const history = row.history
    .map((entry): PlayerTryHistory[string][number] | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const tries = toFiniteNumber(record.tries);
      const round = toFiniteNumber(record.round);
      return {
        team: toNullableString(record.team) ?? "",
        opponent: toNullableString(record.opponent),
        tries: tries ?? 0,
        year: toNullableString(record.year) ?? "",
        round: round == null ? 0 : Math.trunc(round),
      };
    })
    .filter((entry): entry is PlayerTryHistory[string][number] => entry !== null);

  return [key, history];
}

async function fetchLineupPlayerTryHistorySummaryFromSupabase(): Promise<PlayerTryHistory> {
  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("lineup_player_try_history_summary")
    .select("player_key,history")
    .limit(1000);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
      return {};
    }
    throw new Error(`Supabase fetch summary.lineup_player_try_history_summary: ${error.message}`);
  }

  return Object.fromEntries(
    ((data ?? []) as Record<string, unknown>[])
      .map(mapLineupPlayerTryHistoryRow)
      .filter((entry): entry is [string, PlayerTryHistory[string]] => entry !== null)
  );
}

const fetchLineupPlayerTryHistorySummaryCached = unstable_cache(
  async (): Promise<PlayerTryHistory> => fetchLineupPlayerTryHistorySummaryFromSupabase(),
  ["lineup-player-try-history-summary-v1"],
  { revalidate: 300 }
);

export async function fetchLineupPlayerTryHistorySummary(): Promise<PlayerTryHistory> {
  try {
    if (process.env.NODE_ENV !== "production") {
      return await fetchLineupPlayerTryHistorySummaryFromSupabase();
    }
    return await fetchLineupPlayerTryHistorySummaryCached();
  } catch (error) {
    console.warn("Unable to fetch lineup player try history summary.", error);
    return {};
  }
}

function mapLineupsPageSummary(row: Record<string, unknown>): LineupsPageSummary | null {
  const year = toFiniteNumber(row.year);
  const round = toNullableString(row.round);
  if (year == null || !round) return null;

  return {
    year: Math.trunc(year),
    round,
    roundOptions: jsonArray<LineupRoundOption>(row.round_options),
    matches: jsonArray<LineupMatch>(row.matches),
    matchStats: jsonRecord<LineupMatchStats>(row.match_stats),
    teamLogos: jsonRecord<string>(row.team_logos),
    tryscorerOdds: jsonRecord<LineupTryscorerOdds>(row.tryscorer_odds),
    sportsbetOdds: jsonRecord<LineupSportsbetOdds>(row.sportsbet_odds),
    casualtyWardOuts: jsonRecord<LineupCasualtyOut[]>(row.casualty_ward_outs),
    playerAverages: jsonRecord<Record<string, number>>(row.player_averages),
    positionPpmBaselines: jsonRecord<number>(row.position_ppm_baselines),
    playerTryHistory: jsonRecord<PlayerTryHistory[string]>(row.player_try_history),
    updatedAt: toNullableString(row.updated_at),
  };
}

function mapLineupsPageShellSummary(row: Record<string, unknown>): LineupsPageShellSummary | null {
  const year = toFiniteNumber(row.year);
  const round = toNullableString(row.round);
  if (year == null || !round) return null;

  return {
    year: Math.trunc(year),
    round,
    roundOptions: jsonArray<LineupRoundOption>(row.round_options),
    matches: jsonArray<LineupMatch>(row.matches),
    teamLogos: jsonRecord<string>(row.team_logos),
    sportsbetOdds: jsonRecord<LineupSportsbetOdds>(row.sportsbet_odds),
    updatedAt: toNullableString(row.updated_at),
  };
}

const LINEUPS_PAGE_SHELL_COLUMNS = "year,round,round_options,matches,team_logos,sportsbet_odds,updated_at";

async function fetchLineupsPageSummaryFromSupabase(year: number, round: string): Promise<LineupsPageSummary | null> {
  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("lineups_page_summary")
    .select("*")
    .eq("year", year)
    .eq("round", round)
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
      return null;
    }
    throw new Error(`Supabase fetch summary.lineups_page_summary: ${error.message}`);
  }

  return data ? mapLineupsPageSummary(data as Record<string, unknown>) : null;
}

async function fetchLineupsPageShellSummaryFromSupabase(year: number, round: string): Promise<LineupsPageShellSummary | null> {
  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("lineups_page_summary")
    .select(LINEUPS_PAGE_SHELL_COLUMNS)
    .eq("year", year)
    .eq("round", round)
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
      return null;
    }
    throw new Error(`Supabase fetch summary.lineups_page_summary shell: ${error.message}`);
  }

  return data ? mapLineupsPageShellSummary(data as Record<string, unknown>) : null;
}

async function fetchLatestLineupsPageShellSummaryFromSupabase(year: number): Promise<LineupsPageShellSummary | null> {
  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("lineups_page_summary")
    .select(LINEUPS_PAGE_SHELL_COLUMNS)
    .eq("year", year)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
      return null;
    }
    throw new Error(`Supabase fetch latest summary.lineups_page_summary shell: ${error.message}`);
  }

  return data ? mapLineupsPageShellSummary(data as Record<string, unknown>) : null;
}

export async function fetchLineupsPageSummary(year: number, round: string): Promise<LineupsPageSummary | null> {
  try {
    return await fetchLineupsPageSummaryFromSupabase(year, round);
  } catch (error) {
    console.warn("Unable to fetch lineups page summary.", error);
    return null;
  }
}

export async function fetchLineupsPageShellSummary(year: number, round: string): Promise<LineupsPageShellSummary | null> {
  try {
    return await fetchLineupsPageShellSummaryFromSupabase(year, round);
  } catch (error) {
    console.warn("Unable to fetch lineups page shell summary.", error);
    return null;
  }
}

export async function fetchLatestLineupsPageShellSummary(year: number): Promise<LineupsPageShellSummary | null> {
  try {
    return await fetchLatestLineupsPageShellSummaryFromSupabase(year);
  } catch (error) {
    console.warn("Unable to fetch latest lineups page shell summary.", error);
    return null;
  }
}

function lineupsPlayerKeys(match: LineupMatch): string[] {
  const players = [
    ...(match.homeTeam?.players ?? []),
    ...(match.awayTeam?.players ?? []),
  ];
  return [...new Set(players.map((player) => normaliseLookupKey(player.player)).filter(Boolean))];
}

function filterRecordByKeys<T>(record: Record<string, T>, keys: Iterable<string>): Record<string, T> {
  const filtered: Record<string, T> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) filtered[key] = record[key];
  }
  return filtered;
}

async function fetchLineupPlayerTryHistoryForKeys(playerKeys: string[]): Promise<PlayerTryHistory> {
  const keys = [...new Set(playerKeys)].filter(Boolean);
  if (keys.length === 0) return {};

  const supabase = createServerSupabaseClient("summary");
  const { data, error } = await supabase
    .from("lineup_player_try_history_summary")
    .select("player_key,history")
    .in("player_key", keys);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
      return {};
    }
    throw new Error(`Supabase fetch summary.lineup_player_try_history_summary by keys: ${error.message}`);
  }

  return Object.fromEntries(
    ((data ?? []) as Record<string, unknown>[])
      .map(mapLineupPlayerTryHistoryRow)
      .filter((entry): entry is [string, PlayerTryHistory[string]] => entry !== null)
  );
}

export async function fetchLineupsMatchDetailSummary(
  year: number,
  round: string,
  matchId: string
): Promise<LineupsMatchDetailSummary | null> {
  try {
    const supabase = createServerSupabaseClient("summary");
    const { data, error } = await supabase
      .from("lineups_page_summary")
      .select("matches,match_stats,tryscorer_odds,sportsbet_odds,casualty_ward_outs,player_averages,position_ppm_baselines")
      .eq("year", year)
      .eq("round", round)
      .maybeSingle();

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("relation") || message.includes("schema cache") || message.includes("could not find")) {
        return null;
      }
      throw new Error(`Supabase fetch summary.lineups_page_summary match detail: ${error.message}`);
    }
    if (!data) return null;

    const row = data as Record<string, unknown>;
    const match = jsonArray<LineupMatch>(row.matches).find((candidate) => candidate.matchId === matchId) ?? null;
    if (!match) return null;

    const playerKeys = lineupsPlayerKeys(match);
    const teamKeys = [
      normaliseLookupKey(match.homeTeam?.team),
      normaliseLookupKey(match.homeTeam?.teamName),
      normaliseLookupKey(match.awayTeam?.team),
      normaliseLookupKey(match.awayTeam?.teamName),
    ].filter(Boolean);
    const sportsbetOdds = jsonRecord<LineupSportsbetOdds>(row.sportsbet_odds);
    const matchStats = jsonRecord<LineupMatchStats>(row.match_stats)[matchId] ?? null;

    return {
      match,
      matchStats,
      tryscorerOdds: filterRecordByKeys(jsonRecord<LineupTryscorerOdds>(row.tryscorer_odds), playerKeys),
      sportsbetOdds: Object.fromEntries(
        Object.entries(sportsbetOdds).filter(([key, odds]) =>
          key.includes(String(match.matchDate ?? "").slice(0, 10)) ||
          teamKeys.includes(normaliseLookupKey(odds.team))
        )
      ),
      casualtyWardOuts: filterRecordByKeys(jsonRecord<LineupCasualtyOut[]>(row.casualty_ward_outs), teamKeys),
      playerAverages: filterRecordByKeys(jsonRecord<Record<string, number>>(row.player_averages), playerKeys),
      positionPpmBaselines: jsonRecord<number>(row.position_ppm_baselines),
      playerTryHistory: await fetchLineupPlayerTryHistoryForKeys(playerKeys),
    };
  } catch (error) {
    console.warn("Unable to fetch lineups match detail summary.", error);
    return null;
  }
}

const fetchFantasyPlayerCardSummariesCached = unstable_cache(
  async (): Promise<FantasyPlayerCardSummary[]> => fetchFantasyPlayerCardSummariesFromSupabase(),
  ["fantasy-player-card-summary-v2"],
  { revalidate: 300 }
);

const fetchTopWeeklyFantasyPlayerCardSummariesCached = unstable_cache(
  async (): Promise<FantasyPlayerCardSummary[]> => fetchFantasyPlayerCardSummariesFromSupabase({
    limit: 20,
    orderBy: "weeklyChangeDesc",
  }),
  ["fantasy-player-card-summary-top-weekly-v2"],
  { revalidate: 300 }
);

export async function fetchFantasyPlayerCardSummaries(): Promise<FantasyPlayerCardSummary[]> {
  try {
    if (process.env.NODE_ENV !== "production") {
      return await fetchFantasyPlayerCardSummariesFromSupabase();
    }
    return await fetchFantasyPlayerCardSummariesCached();
  } catch (error) {
    console.warn("Unable to fetch fantasy player card summaries; falling back to derived rows.", error);
    return [];
  }
}

export async function fetchTopWeeklyFantasyPlayerCardSummaries(): Promise<FantasyPlayerCardSummary[]> {
  try {
    if (process.env.NODE_ENV !== "production") {
      return await fetchFantasyPlayerCardSummariesFromSupabase({
        limit: 20,
        orderBy: "weeklyChangeDesc",
      });
    }
    return await fetchTopWeeklyFantasyPlayerCardSummariesCached();
  } catch (error) {
    console.warn("Unable to fetch top weekly fantasy player card summaries; falling back to empty preview.", error);
    return [];
  }
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
    const candidates = [
      row.short_side_logo_url,
      row.side_logo_url,
      row.short_logo_url,
      row.logo_url,
    ];
    const logoUrl = candidates.find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    )?.trim();

    if (!logoUrl) continue;

    const teamNameCandidates = [
      row.team,
      row.team_name,
      row.name,
      row.display_name,
      row.full_name,
      row.short_name,
      row.club,
      row.nickname,
      row.abbreviation,
    ];

    for (const teamKey of teamNameCandidates.flatMap(teamLogoAliasKeys)) {
      if (!logos.has(teamKey)) {
        logos.set(teamKey, logoUrl);
      }
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

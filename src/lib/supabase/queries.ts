import { createServerSupabaseClient } from "./client";
import { unstable_cache } from "next/cache";
import {
  COLUMN_RENAME_MAP,
  FINALS_MAP,
  FINALS_LABEL_MAP,
} from "@/lib/data/constants";
import type { PlayerStat, Match, TeammateLookupRow } from "@/lib/data/types";
import {
  filterPlayerStatsRowsByYears,
  readPlayerStatsServerCache,
  readPlayerStatsServerCacheMetadata,
} from "@/lib/data/player-stats-server-cache";
import type {
  BettingMarket,
  BettingOddsRow,
  BettingOddsSnapshot,
  BettingOddsTable,
} from "@/lib/betting/types";

const PAGE_SIZE = 1000;
const DAILY_REVALIDATE_SECONDS = 86400;

export interface PlayerImageRecord {
  player: string;
  team: string | null;
  number: string | null;
  position: string | null;
  head_image: string | null;
  body_image: string | null;
  last_seen_match_date: string | null;
}

function normaliseTeamKey(value: unknown): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Generic paginated fetch
// ---------------------------------------------------------------------------
interface FetchOptions {
  /** Filter by match_date year(s) — e.g. ["2025"] → gte 2025-01-01, lt 2026-01-01 */
  years?: string[];
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
    const rows = (data ?? []) as T[];
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
    let query = supabase.from(table).select("*");

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
    const rows = (data ?? []) as T[];
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
  if (candidates.length === 1) return candidates[0];

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

function mapBettingMarket(table: BettingOddsTable, rawMarket: unknown): BettingMarket {
  if (typeof rawMarket === "string") {
    const normalized = rawMarket.trim().toLowerCase();
    if (normalized === "line") return "Line";
    if (normalized === "total") return "Total";
    if (normalized === "h2h") return "H2H";
  }
  if (table === "NRL Line Odds") return "Line";
  if (table === "NRL Total Odds") return "Total";
  return "H2H";
}

function mapBettingRow(table: BettingOddsTable, raw: Record<string, unknown>): BettingOddsRow {
  return {
    table,
    market: mapBettingMarket(table, raw.Market),
    date: typeof raw.Date === "string" ? raw.Date : "",
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
  const [rawPlayers, rawMatches] = await Promise.all([
    fetchAllRows<Record<string, unknown>>("player_stats", opts),
    fetchAllRows<Record<string, unknown>>("matches", opts),
  ]);
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
    fetchAllRows<Record<string, unknown>>("matches"),
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

      return allRows.filter((row) => row.Name === matchedLocalName);
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
  const rawMatches = await fetchAllRows<Record<string, unknown>>("matches");
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
  const rawMatches = await fetchAllRows<Record<string, unknown>>("matches");
  if (rawMatches.length === 0) return [];

  // Only home rows to build match pairs
  const homeRows = rawMatches.filter((m) => m.is_home === 1);
  const seen = new Set<string>();
  const matches: Match[] = [];

  for (const m of homeRows) {
    const matchDate = String(m.match_date ?? "");
    const year = matchDate ? new Date(matchDate).getFullYear().toString() : "";
    if (years && years.length > 0 && !years.includes(year)) continue;

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
    .map((row) => mapBettingRow(table, row))
    .filter((row) => row.match.length > 0 && row.result.length > 0 && row.date.length > 0)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.match !== b.match) return a.match.localeCompare(b.match);
      return a.result.localeCompare(b.result);
    });
}

export async function fetchBettingOddsSnapshotFromSupabase(): Promise<BettingOddsSnapshot> {
  const [h2h, line, total] = await Promise.all([
    fetchBettingOddsTableFromSupabase("NRL Odds"),
    fetchBettingOddsTableFromSupabase("NRL Line Odds"),
    fetchBettingOddsTableFromSupabase("NRL Total Odds"),
  ]);

  return {
    h2h,
    line,
    total,
    generatedAt: new Date().toISOString(),
  };
}

const fetchBettingOddsSnapshotCached = unstable_cache(
  async (): Promise<BettingOddsSnapshot> => fetchBettingOddsSnapshotFromSupabase(),
  ["betting-odds-v1"],
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
      generatedAt: new Date().toISOString(),
    };
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

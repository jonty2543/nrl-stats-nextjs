import { createServerSupabaseClient } from "./client";
import { unstable_cache } from "next/cache";
import {
  COLUMN_RENAME_MAP,
  FINALS_MAP,
  FINALS_LABEL_MAP,
} from "@/lib/data/constants";
import type { PlayerStat, Match } from "@/lib/data/types";

const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Generic paginated fetch
// ---------------------------------------------------------------------------
interface FetchOptions {
  /** Filter by match_date year(s) — e.g. ["2025"] → gte 2025-01-01, lt 2026-01-01 */
  years?: string[];
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

// ---------------------------------------------------------------------------
// fetchPlayerStats — main entry point
// ---------------------------------------------------------------------------
export async function fetchPlayerStats(years?: string[]): Promise<PlayerStat[]> {
  const opts = years && years.length > 0 ? { years } : undefined;
  const [rawPlayers, rawMatches] = await Promise.all([
    fetchAllRows<Record<string, unknown>>("player_stats", opts),
    fetchAllRows<Record<string, unknown>>("matches", opts),
  ]);

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

// ---------------------------------------------------------------------------
// fetchMatches
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// fetchAvailableYears — lightweight query for year list
// ---------------------------------------------------------------------------
async function fetchAvailableYearsUncached(): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  // Get distinct years by fetching min and max dates
  const { data: minRow } = await supabase
    .from("player_stats")
    .select("match_date")
    .order("match_date", { ascending: true })
    .limit(1);
  const { data: maxRow } = await supabase
    .from("player_stats")
    .select("match_date")
    .order("match_date", { ascending: false })
    .limit(1);

  if (!minRow?.[0] || !maxRow?.[0]) return [];

  const minYear = new Date(String(minRow[0].match_date)).getFullYear();
  const maxYear = new Date(String(maxRow[0].match_date)).getFullYear();
  const years: string[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(String(y));
  }
  return years;
}

const fetchAvailableYearsCached = unstable_cache(
  async (): Promise<string[]> => fetchAvailableYearsUncached(),
  ["available-years-v1"],
  { revalidate: 3600 }
);

export async function fetchAvailableYears(): Promise<string[]> {
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

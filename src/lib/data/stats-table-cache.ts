import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { PLAYER_STATS, TEAM_STATS } from "@/lib/data/constants";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import type {
  PlayerStatsTableAggregateRow,
  PlayerStatsTableGroupBy,
  StatsTableFilterOptions,
  TeamStatsTableAggregateRow,
  TeamStatsTableGroupBy,
} from "@/lib/data/stats-table-cache-types";

const SERVER_CACHE_RELATIVE_PATH = path.join("data", "cache", "stats-table-aggregates.json");
const DEFAULT_STORAGE_PREFIX = "stats-table-cache";
const STORAGE_FILENAME = "stats-table-aggregates.json.gz";

type StatKey = string;

interface CachedAggregateValues {
  averages: Record<StatKey, number | null>;
  totals: Record<StatKey, number | null>;
  counts: Record<StatKey, number>;
}

interface PlayerStatsTableBaseRow extends CachedAggregateValues {
  key: string;
  year: string;
  name: string;
  team: string;
  position: string;
  games: number;
}

interface TeamStatsTableBaseRow extends CachedAggregateValues {
  key: string;
  year: string;
  team: string;
  games: number;
}

interface StatsTableCacheFile {
  version: 1;
  updatedAt: string;
  years: string[];
  playerRows: PlayerStatsTableBaseRow[];
  teamRows: TeamStatsTableBaseRow[];
}

interface StatsTableCacheMemo {
  mtimeMs: number;
  payload: StatsTableCacheFile;
}

interface StatsTableRowsResult<Row> {
  rows: Row[];
  updatedAt: string | null;
  source: "cache" | "fallback";
  filterOptions: StatsTableFilterOptions;
}

interface PlayerRowsParams {
  years?: string[];
  groupBy: PlayerStatsTableGroupBy;
  team?: string;
  position?: string;
  minGames?: number;
}

interface TeamRowsParams {
  years?: string[];
  groupBy: TeamStatsTableGroupBy;
  team?: string;
}

let localMemo: StatsTableCacheMemo | null = null;

function getCachePath(): string {
  return path.join(process.cwd(), SERVER_CACHE_RELATIVE_PATH);
}

function getStorageBucket(): string | null {
  const bucket = process.env.SUPABASE_STORAGE_CACHE_BUCKET?.trim();
  return bucket ? bucket : null;
}

function getStoragePrefix(): string {
  const prefix = process.env.STATS_TABLE_CACHE_PREFIX?.trim() || DEFAULT_STORAGE_PREFIX;
  return prefix.replace(/^\/+|\/+$/g, "");
}

function getStoragePath(): string {
  return `${getStoragePrefix()}/${STORAGE_FILENAME}`;
}

function sortYearsDesc(years: string[]): string[] {
  return [...new Set(years)].filter(Boolean).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "").replace(/%$/, "").replace(/s$/, "");
    if (!cleaned || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function initValues(statKeys: readonly string[]): CachedAggregateValues {
  return {
    averages: Object.fromEntries(statKeys.map((stat) => [stat, null])),
    totals: Object.fromEntries(statKeys.map((stat) => [stat, null])),
    counts: Object.fromEntries(statKeys.map((stat) => [stat, 0])),
  };
}

function addStatValues(target: CachedAggregateValues, source: Record<string, unknown>, statKeys: readonly string[]): void {
  for (const stat of statKeys) {
    const value = toFiniteNumber(source[stat]);
    if (value === null) continue;
    target.totals[stat] = (target.totals[stat] ?? 0) + value;
    target.counts[stat] = (target.counts[stat] ?? 0) + 1;
  }
}

function addCachedValues(target: CachedAggregateValues, source: CachedAggregateValues, statKeys: readonly string[]): void {
  for (const stat of statKeys) {
    const count = source.counts[stat] ?? 0;
    if (count <= 0) continue;
    target.totals[stat] = (target.totals[stat] ?? 0) + (source.totals[stat] ?? 0);
    target.counts[stat] = (target.counts[stat] ?? 0) + count;
  }
}

function finalizeValues(target: CachedAggregateValues, statKeys: readonly string[]): void {
  for (const stat of statKeys) {
    const count = target.counts[stat] ?? 0;
    target.averages[stat] = count > 0 ? (target.totals[stat] ?? 0) / count : null;
    if (count === 0) target.totals[stat] = null;
  }
}

function pickPrimary(values: Map<string, number>, fallback: string | null): string | null {
  let best = fallback;
  let bestGames = -1;
  for (const [value, games] of values.entries()) {
    if (!value) continue;
    if (games > bestGames || (games === bestGames && value.localeCompare(best ?? "") < 0)) {
      best = value;
      bestGames = games;
    }
  }
  return best;
}

function addWeightedValue(map: Map<string, number>, value: string | null | undefined, games: number): void {
  if (!value) return;
  map.set(value, (map.get(value) ?? 0) + games);
}

function buildPlayerBaseRows(rows: PlayerStat[]): PlayerStatsTableBaseRow[] {
  const byGroup = new Map<string, PlayerStatsTableBaseRow>();
  for (const row of rows) {
    const year = String(row.Year ?? "");
    const team = String(row.Team ?? "");
    const position = String(row.Position ?? "");
    const name = String(row.Name ?? "");
    if (!year || !name) continue;
    const key = JSON.stringify([year, team, position, name]);
    const aggregate =
      byGroup.get(key) ??
      ({
        key,
        year,
        team,
        position,
        name,
        games: 0,
        ...initValues(PLAYER_STATS),
      } satisfies PlayerStatsTableBaseRow);
    aggregate.games += 1;
    addStatValues(aggregate, row, PLAYER_STATS);
    byGroup.set(key, aggregate);
  }

  const out = [...byGroup.values()];
  for (const row of out) finalizeValues(row, PLAYER_STATS);
  return out;
}

function buildTeamBaseRows(rows: TeamStat[]): TeamStatsTableBaseRow[] {
  const byGroup = new Map<string, TeamStatsTableBaseRow>();
  for (const row of rows) {
    const year = String(row.Year ?? "");
    const team = String(row.Team ?? "");
    if (!year || !team) continue;
    const key = JSON.stringify([year, team]);
    const aggregate =
      byGroup.get(key) ??
      ({
        key,
        year,
        team,
        games: 0,
        ...initValues(TEAM_STATS),
      } satisfies TeamStatsTableBaseRow);
    aggregate.games += 1;
    addStatValues(aggregate, row, TEAM_STATS);
    byGroup.set(key, aggregate);
  }

  const out = [...byGroup.values()];
  for (const row of out) finalizeValues(row, TEAM_STATS);
  return out;
}

function filterOptionsFromPlayerRows(rows: PlayerStatsTableBaseRow[]): StatsTableFilterOptions {
  return {
    teams: ["All Teams", ...Array.from(new Set(rows.map((row) => row.team))).filter(Boolean).sort()],
    positions: ["All Positions", ...Array.from(new Set(rows.map((row) => row.position))).filter(Boolean).sort()],
  };
}

function filterOptionsFromTeamRows(rows: TeamStatsTableBaseRow[]): StatsTableFilterOptions {
  return {
    teams: ["All Teams", ...Array.from(new Set(rows.map((row) => row.team))).filter(Boolean).sort()],
    positions: ["All Positions"],
  };
}

export function buildStatsTableCache(
  playerRows: PlayerStat[],
  teamRows: TeamStat[]
): StatsTableCacheFile {
  const years = sortYearsDesc([
    ...playerRows.map((row) => String(row.Year ?? "")),
    ...teamRows.map((row) => String(row.Year ?? "")),
  ]);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    years,
    playerRows: buildPlayerBaseRows(playerRows),
    teamRows: buildTeamBaseRows(teamRows),
  };
}

function selectedYearSet(years?: string[]): Set<string> | null {
  const selected = (years ?? []).filter(Boolean);
  return selected.length > 0 ? new Set(selected) : null;
}

export function selectPlayerStatsTableRows(
  cache: StatsTableCacheFile,
  params: PlayerRowsParams
): StatsTableRowsResult<PlayerStatsTableAggregateRow> {
  const years = selectedYearSet(params.years);
  const baseRows = cache.playerRows.filter((row) => (years ? years.has(row.year) : true));
  const filterOptions = filterOptionsFromPlayerRows(baseRows);
  const filteredRows = baseRows.filter((row) => {
    if (params.team && params.team !== "All Teams" && row.team !== params.team) return false;
    if (params.position && params.position !== "All Positions" && row.position !== params.position) return false;
    return true;
  });

  interface PlayerAccumulator extends CachedAggregateValues {
    key: string;
    year: string | null;
    name: string;
    teamGames: Map<string, number>;
    positionGames: Map<string, number>;
    games: number;
  }

  const byGroup = new Map<string, PlayerAccumulator>();
  for (const row of filteredRows) {
    const keyParts =
      params.groupBy === "Year + Player"
        ? [row.year, row.name]
        : params.groupBy === "Team + Player"
          ? [row.team, row.name]
          : params.groupBy === "Position + Player"
            ? [row.position, row.name]
          : [row.name];
    const key = JSON.stringify(keyParts);
    const aggregate =
      byGroup.get(key) ??
      ({
        key,
        year: params.groupBy === "Year + Player" ? row.year : null,
        name: row.name,
        teamGames: new Map<string, number>(),
        positionGames: new Map<string, number>(),
        games: 0,
        ...initValues(PLAYER_STATS),
      } satisfies PlayerAccumulator);
    aggregate.games += row.games;
    addWeightedValue(aggregate.teamGames, row.team, row.games);
    addWeightedValue(aggregate.positionGames, row.position, row.games);
    addCachedValues(aggregate, row, PLAYER_STATS);
    byGroup.set(key, aggregate);
  }

  const minGames = params.minGames ?? 1;
  const rows = [...byGroup.values()]
    .filter((row) => row.games >= minGames)
    .map((row) => {
      finalizeValues(row, PLAYER_STATS);
      return {
        key: row.key,
        year: row.year,
        name: row.name,
        team: pickPrimary(row.teamGames, null),
        position: pickPrimary(row.positionGames, null),
        games: row.games,
        averages: row.averages,
        totals: row.totals,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.year ?? "").localeCompare(String(b.year ?? "")));

  return { rows, updatedAt: cache.updatedAt, source: "cache", filterOptions };
}

export function selectTeamStatsTableRows(
  cache: StatsTableCacheFile,
  params: TeamRowsParams
): StatsTableRowsResult<TeamStatsTableAggregateRow> {
  const years = selectedYearSet(params.years);
  const baseRows = cache.teamRows.filter((row) => (years ? years.has(row.year) : true));
  const filterOptions = filterOptionsFromTeamRows(baseRows);
  const filteredRows = baseRows.filter((row) => {
    if (params.team && params.team !== "All Teams" && row.team !== params.team) return false;
    return true;
  });

  interface TeamAccumulator extends CachedAggregateValues {
    key: string;
    year: string | null;
    team: string;
    games: number;
  }

  const byGroup = new Map<string, TeamAccumulator>();
  for (const row of filteredRows) {
    const keyParts = params.groupBy === "Year + Team" ? [row.year, row.team] : [row.team];
    const key = JSON.stringify(keyParts);
    const aggregate =
      byGroup.get(key) ??
      ({
        key,
        year: params.groupBy === "Year + Team" ? row.year : null,
        team: row.team,
        games: 0,
        ...initValues(TEAM_STATS),
      } satisfies TeamAccumulator);
    aggregate.games += row.games;
    addCachedValues(aggregate, row, TEAM_STATS);
    byGroup.set(key, aggregate);
  }

  const rows = [...byGroup.values()]
    .map((row) => {
      finalizeValues(row, TEAM_STATS);
      return {
        key: row.key,
        year: row.year,
        team: row.team,
        games: row.games,
        averages: row.averages,
        totals: row.totals,
      };
    })
    .sort((a, b) => a.team.localeCompare(b.team) || String(a.year ?? "").localeCompare(String(b.year ?? "")));

  return { rows, updatedAt: cache.updatedAt, source: "cache", filterOptions };
}

async function downloadStorageObject(objectPath: string): Promise<Buffer | null> {
  const bucket = getStorageBucket();
  if (!bucket) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("not found") || message.includes("no such object")) return null;
    throw new Error(`Supabase storage download ${objectPath}: ${error.message}`);
  }
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadStorageObject(objectPath: string, body: Buffer, contentType: string): Promise<void> {
  const bucket = getStorageBucket();
  if (!bucket) return;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(objectPath, body, {
    upsert: true,
    contentType,
  });
  if (error) throw new Error(`Supabase storage upload ${objectPath}: ${error.message}`);
}

function normalizeCacheFile(parsed: Partial<StatsTableCacheFile>): StatsTableCacheFile | null {
  if (!parsed || !Array.isArray(parsed.playerRows) || !Array.isArray(parsed.teamRows)) return null;
  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    years: Array.isArray(parsed.years) ? sortYearsDesc(parsed.years.filter((year): year is string => typeof year === "string")) : [],
    playerRows: parsed.playerRows as PlayerStatsTableBaseRow[],
    teamRows: parsed.teamRows as TeamStatsTableBaseRow[],
  };
}

async function readLocalStatsTableCache(): Promise<StatsTableCacheFile | null> {
  try {
    const cachePath = getCachePath();
    const fileStats = await stat(cachePath);
    if (localMemo && localMemo.mtimeMs === fileStats.mtimeMs) return localMemo.payload;

    const parsed = JSON.parse(await readFile(cachePath, "utf8")) as Partial<StatsTableCacheFile>;
    const normalized = normalizeCacheFile(parsed);
    if (!normalized) return null;
    localMemo = { mtimeMs: fileStats.mtimeMs, payload: normalized };
    return normalized;
  } catch {
    localMemo = null;
    return null;
  }
}

async function readStorageStatsTableCache(): Promise<StatsTableCacheFile | null> {
  try {
    const compressed = await downloadStorageObject(getStoragePath());
    if (!compressed) return null;
    const parsed = JSON.parse(gunzipSync(compressed).toString("utf8")) as Partial<StatsTableCacheFile>;
    return normalizeCacheFile(parsed);
  } catch {
    return null;
  }
}

export async function readStatsTableCache(): Promise<StatsTableCacheFile | null> {
  const local = await readLocalStatsTableCache();
  if (local) return local;
  return readStorageStatsTableCache();
}

export async function writeStatsTableCache(payload: StatsTableCacheFile): Promise<{
  path: string;
  years: string[];
  playerRowCount: number;
  teamRowCount: number;
  storageBucket: string | null;
  storagePrefix: string | null;
}> {
  const cachePath = getCachePath();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");
  try {
    const fileStats = await stat(cachePath);
    localMemo = { mtimeMs: fileStats.mtimeMs, payload };
  } catch {
    localMemo = null;
  }

  const storageBucket = getStorageBucket();
  if (storageBucket) {
    await uploadStorageObject(
      getStoragePath(),
      gzipSync(Buffer.from(JSON.stringify(payload), "utf8")),
      "application/gzip"
    );
  }

  return {
    path: cachePath,
    years: payload.years,
    playerRowCount: payload.playerRows.length,
    teamRowCount: payload.teamRows.length,
    storageBucket,
    storagePrefix: storageBucket ? getStoragePrefix() : null,
  };
}

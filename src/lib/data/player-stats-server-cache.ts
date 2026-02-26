import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PlayerStat } from "@/lib/data/types";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const SERVER_CACHE_RELATIVE_PATH = path.join("data", "cache", "player-stats-all.json");
const STORAGE_INDEX_FILENAME = "index.json";
const DEFAULT_STORAGE_PREFIX = "player-stats-cache";
const MAX_SUPABASE_STORAGE_OBJECT_BYTES = 50 * 1024 * 1024;

interface PlayerStatsServerCacheFile {
  version: 1;
  updatedAt: string;
  years: string[];
  rows: PlayerStat[];
}

interface PlayerStatsStorageChunkIndex {
  year: string;
  path: string;
  rowCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
}

interface PlayerStatsStorageIndexFile {
  version: 1;
  format: "per-year-json-gzip-v1";
  updatedAt: string;
  years: string[];
  rowCount: number;
  chunks: PlayerStatsStorageChunkIndex[];
}

interface PlayerStatsServerCacheMetadata {
  version: 1;
  updatedAt: string;
  years: string[];
}

function getCachePath(): string {
  return path.join(process.cwd(), SERVER_CACHE_RELATIVE_PATH);
}

function getStorageBucket(): string | null {
  const bucket = process.env.SUPABASE_STORAGE_CACHE_BUCKET?.trim();
  return bucket ? bucket : null;
}

function getStoragePrefix(): string {
  const prefix = process.env.SUPABASE_STORAGE_CACHE_PREFIX?.trim();
  return (prefix || DEFAULT_STORAGE_PREFIX).replace(/^\/+|\/+$/g, "");
}

function getStorageIndexPath(): string {
  return `${getStoragePrefix()}/${STORAGE_INDEX_FILENAME}`;
}

function getStorageYearChunkPath(year: string): string {
  return `${getStoragePrefix()}/years/${year}.json.gz`;
}

function sortYearsDesc(years: string[]): string[] {
  return [...new Set(years)]
    .filter(Boolean)
    .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
}

export function filterPlayerStatsRowsByYears(
  rows: PlayerStat[],
  years?: string[]
): PlayerStat[] {
  if (!years || years.length === 0) return rows;
  const allowed = new Set(years);
  return rows.filter((row) => allowed.has(String(row.Year ?? "")));
}

export function availableYearsFromPlayerStatsRows(rows: PlayerStat[]): string[] {
  return sortYearsDesc(rows.map((row) => String(row.Year ?? "")).filter(Boolean));
}

function normalizeCacheFile(
  parsed: Partial<PlayerStatsServerCacheFile>
): PlayerStatsServerCacheFile | null {
  if (!parsed || !Array.isArray(parsed.rows)) return null;

  const rows = parsed.rows as PlayerStat[];
  const years = Array.isArray(parsed.years)
    ? sortYearsDesc(parsed.years.filter((year): year is string => typeof year === "string"))
    : availableYearsFromPlayerStatsRows(rows);

  return {
    version: 1,
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    years,
    rows,
  };
}

async function readLocalPlayerStatsServerCache(
  years?: string[]
): Promise<PlayerStatsServerCacheFile | null> {
  try {
    const raw = await readFile(getCachePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<PlayerStatsServerCacheFile>;
    const normalized = normalizeCacheFile(parsed);
    if (!normalized) return null;
    return {
      ...normalized,
      rows: filterPlayerStatsRowsByYears(normalized.rows, years),
    };
  } catch {
    return null;
  }
}

async function downloadStorageObject(
  bucket: string,
  objectPath: string
): Promise<Buffer | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) {
    const message = String(error.message ?? "");
    if (
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("no such object")
    ) {
      return null;
    }
    throw new Error(`Supabase storage download ${objectPath}: ${error.message}`);
  }
  if (!data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadStorageObject(
  bucket: string,
  objectPath: string,
  body: Buffer | string,
  contentType: string
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(objectPath, body, {
    upsert: true,
    contentType,
  });
  if (error) {
    throw new Error(`Supabase storage upload ${objectPath}: ${error.message}`);
  }
}

async function readSupabaseStorageIndex(): Promise<PlayerStatsStorageIndexFile | null> {
  const bucket = getStorageBucket();
  if (!bucket) return null;

  try {
    const raw = await downloadStorageObject(bucket, getStorageIndexPath());
    if (!raw) return null;
    const parsed = JSON.parse(raw.toString("utf8")) as Partial<PlayerStatsStorageIndexFile>;
    if (
      !parsed ||
      !Array.isArray(parsed.years) ||
      !Array.isArray(parsed.chunks) ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    const chunks = parsed.chunks.filter(
      (chunk): chunk is PlayerStatsStorageChunkIndex =>
        Boolean(
          chunk &&
            typeof chunk.year === "string" &&
            typeof chunk.path === "string" &&
            typeof chunk.rowCount === "number"
        )
    );

    return {
      version: 1,
      format: "per-year-json-gzip-v1",
      updatedAt: parsed.updatedAt,
      years: sortYearsDesc(parsed.years.filter((year): year is string => typeof year === "string")),
      rowCount:
        typeof parsed.rowCount === "number"
          ? parsed.rowCount
          : chunks.reduce((sum, chunk) => sum + chunk.rowCount, 0),
      chunks,
    };
  } catch {
    return null;
  }
}

async function readSupabaseStoragePlayerStatsServerCache(
  years?: string[]
): Promise<PlayerStatsServerCacheFile | null> {
  const bucket = getStorageBucket();
  if (!bucket) return null;

  const index = await readSupabaseStorageIndex();
  if (!index) return null;

  const allowedYears = years && years.length > 0 ? new Set(years) : null;
  const targetChunks = index.chunks.filter((chunk) =>
    allowedYears ? allowedYears.has(chunk.year) : true
  );

  if (targetChunks.length === 0) {
    return {
      version: 1,
      updatedAt: index.updatedAt,
      years: index.years,
      rows: [],
    };
  }

  let chunkBuffers: PlayerStat[][];
  try {
    chunkBuffers = await Promise.all(
      targetChunks.map(async (chunk) => {
        const compressed = await downloadStorageObject(bucket, chunk.path);
        if (!compressed) {
          throw new Error(`Missing Supabase Storage cache chunk: ${chunk.path}`);
        }
        const uncompressed = gunzipSync(compressed);
        const parsed = JSON.parse(uncompressed.toString("utf8")) as { rows?: PlayerStat[] };
        if (!Array.isArray(parsed.rows)) {
          throw new Error(`Invalid Supabase Storage cache chunk format: ${chunk.path}`);
        }
        return parsed.rows as PlayerStat[];
      })
    );
  } catch (error) {
    console.warn(
      "Unable to read Supabase Storage player stats cache; falling back to database.",
      error
    );
    return null;
  }

  return {
    version: 1,
    updatedAt: index.updatedAt,
    years: index.years,
    rows: chunkBuffers.flat(),
  };
}

export async function readPlayerStatsServerCacheMetadata(): Promise<PlayerStatsServerCacheMetadata | null> {
  const local = await readLocalPlayerStatsServerCache();
  if (local) {
    return {
      version: 1,
      updatedAt: local.updatedAt,
      years: local.years,
    };
  }

  const storageIndex = await readSupabaseStorageIndex();
  if (!storageIndex) return null;
  return {
    version: 1,
    updatedAt: storageIndex.updatedAt,
    years: storageIndex.years,
  };
}

export async function readPlayerStatsServerCache(
  years?: string[]
): Promise<PlayerStatsServerCacheFile | null> {
  const local = await readLocalPlayerStatsServerCache(years);
  if (local) return local;
  return readSupabaseStoragePlayerStatsServerCache(years);
}

export async function writePlayerStatsServerCache(rows: PlayerStat[]): Promise<{
  path: string;
  years: string[];
  rowCount: number;
  storageBucket?: string | null;
  storagePrefix?: string | null;
  storageChunkCount?: number;
}> {
  const cachePath = getCachePath();
  await mkdir(path.dirname(cachePath), { recursive: true });

  const payload: PlayerStatsServerCacheFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    years: availableYearsFromPlayerStatsRows(rows),
    rows,
  };

  await writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");

  const storageBucket = getStorageBucket();
  let storageChunkCount = 0;
  if (storageBucket) {
    const rowsByYear = new Map<string, PlayerStat[]>();
    for (const row of rows) {
      const year = String(row.Year ?? "");
      if (!year) continue;
      const list = rowsByYear.get(year) ?? [];
      list.push(row);
      rowsByYear.set(year, list);
    }

    const chunkEntries: PlayerStatsStorageChunkIndex[] = [];
    for (const year of payload.years) {
      const yearRows = rowsByYear.get(year) ?? [];
      const chunkJson = JSON.stringify({ version: 1, year, updatedAt: payload.updatedAt, rows: yearRows });
      const uncompressedBytes = Buffer.byteLength(chunkJson);
      const compressed = gzipSync(Buffer.from(chunkJson, "utf8"));
      if (compressed.byteLength > MAX_SUPABASE_STORAGE_OBJECT_BYTES) {
        throw new Error(
          `Compressed cache chunk for year ${year} is ${(
            compressed.byteLength /
            (1024 * 1024)
          ).toFixed(2)} MB and exceeds the 50 MB Supabase Storage limit`
        );
      }

      const chunkPath = getStorageYearChunkPath(year);
      await uploadStorageObject(storageBucket, chunkPath, compressed, "application/gzip");

      chunkEntries.push({
        year,
        path: chunkPath,
        rowCount: yearRows.length,
        compressedBytes: compressed.byteLength,
        uncompressedBytes,
      });
    }

    const indexPayload: PlayerStatsStorageIndexFile = {
      version: 1,
      format: "per-year-json-gzip-v1",
      updatedAt: payload.updatedAt,
      years: payload.years,
      rowCount: payload.rows.length,
      chunks: chunkEntries,
    };
    await uploadStorageObject(
      storageBucket,
      getStorageIndexPath(),
      Buffer.from(JSON.stringify(indexPayload), "utf8"),
      "application/json"
    );
    storageChunkCount = chunkEntries.length;
  }

  return {
    path: cachePath,
    years: payload.years,
    rowCount: payload.rows.length,
    storageBucket,
    storagePrefix: storageBucket ? getStoragePrefix() : null,
    storageChunkCount: storageBucket ? storageChunkCount : undefined,
  };
}

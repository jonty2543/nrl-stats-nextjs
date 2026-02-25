import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlayerStat } from "@/lib/data/types";

const SERVER_CACHE_RELATIVE_PATH = path.join("data", "cache", "player-stats-all.json");

interface PlayerStatsServerCacheFile {
  version: 1;
  updatedAt: string;
  years: string[];
  rows: PlayerStat[];
}

function getCachePath(): string {
  return path.join(process.cwd(), SERVER_CACHE_RELATIVE_PATH);
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

export async function readPlayerStatsServerCache(): Promise<PlayerStatsServerCacheFile | null> {
  try {
    const raw = await readFile(getCachePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<PlayerStatsServerCacheFile>;

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
  } catch {
    return null;
  }
}

export async function writePlayerStatsServerCache(rows: PlayerStat[]): Promise<{
  path: string;
  years: string[];
  rowCount: number;
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

  return {
    path: cachePath,
    years: payload.years,
    rowCount: payload.rows.length,
  };
}


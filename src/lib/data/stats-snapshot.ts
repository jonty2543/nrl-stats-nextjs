import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { PlayerStat, TeamStat, TeammateLookupRow } from "./types";
import type { PlayerImageRecord, StatsCompetition } from "@/lib/supabase/queries";
import { playerSlug } from "./player-slug";

export interface StatsSnapshot {
  version: 1;
  updatedAt: string;
  years: string[];
  playerRows: PlayerStat[];
  teamRows: TeamStat[];
}

interface SnapshotIndex {
  version: 1;
  updatedAt: string;
  years: string[];
}

export interface StatsAssetsSnapshot {
  version: 1;
  updatedAt: string;
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
}

const snapshots = new Map<string, { mtime: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

async function readSnapshot<T>(name: string): Promise<T | null> {
  if (process.env.STATS_SNAPSHOT_DISABLED === "1") return null;
  const existing = pending.get(name);
  if (existing) return existing as Promise<T | null>;
  const load = (async () => {
    try {
      const filename = path.join(process.cwd(), "data", "snapshots", `${name}.json.gz`);
      const { mtimeMs } = await stat(filename);
      const memo = snapshots.get(name);
      if (memo?.mtime === mtimeMs) return memo.value as T;
      const value = JSON.parse(gunzipSync(await readFile(filename)).toString("utf8"));
      if (value.version !== 1) return null;
      if (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(name, { mtime: mtimeMs, value });
      return value as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Unable to read ${name} stats snapshot; using database.`, error);
      }
      return null;
    }
  })();
  pending.set(name, load);
  try {
    return await load;
  } finally {
    pending.delete(name);
  }
}

export function readStatsSnapshotMetadata(competition: StatsCompetition = "nrl") {
  return readSnapshot<SnapshotIndex>(competition);
}

export async function readStatsSnapshot(competition: StatsCompetition = "nrl", years?: string[]) {
  const index = await readStatsSnapshotMetadata(competition);
  if (!index || (years?.length && years.some((year) => !index.years.includes(year)))) return null;
  const chunks = await Promise.all((years?.length ? [...new Set(years)] : index.years).map(
    (year) => readSnapshot<StatsSnapshot>(`${competition}-${year}`)
  ));
  if (chunks.some((chunk) => !chunk)) return null;
  return {
    ...index,
    playerRows: chunks.flatMap((chunk) => chunk!.playerRows),
    teamRows: chunks.flatMap((chunk) => chunk!.teamRows),
  };
}

export async function readPlayerStatsSnapshot(playerName: string, competition: StatsCompetition, years?: string[]) {
  const index = await readStatsSnapshotMetadata(competition);
  if (!index || (years?.length && years.some((year) => !index.years.includes(year)))) return null;
  const player = await readSnapshot<{ version: 1; rows: PlayerStat[] }>(`${competition}-player-${playerSlug(playerName)}`);
  if (!player) return null;
  const allowedYears = years?.length ? new Set(years) : null;
  return player.rows.filter((row) => !allowedYears || allowedYears.has(row.Year));
}

export async function readTeammateSnapshot(years?: string[]) {
  const index = await readStatsSnapshotMetadata();
  if (!index || (years?.length && years.some((year) => !index.years.includes(year)))) return null;
  const chunks = await Promise.all((years?.length ? [...new Set(years)] : index.years).map(
    (year) => readSnapshot<{ version: 1; rows: TeammateLookupRow[] }>(`nrl-teammates-${year}`)
  ));
  return chunks.some((chunk) => !chunk) ? null : chunks.flatMap((chunk) => chunk!.rows);
}

export function readStatsAssetsSnapshot() {
  return readSnapshot<StatsAssetsSnapshot>("assets");
}

export function snapshotCoversYears(snapshot: StatsSnapshot, years?: string[]): boolean {
  return !years?.length || years.every((year) => snapshot.years.includes(year));
}

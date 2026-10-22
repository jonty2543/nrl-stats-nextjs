import nextEnv from "@next/env";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { playerSlug } from "../src/lib/data/player-slug";
import {
  fetchAvailableYearsFromSupabase,
  fetchPlayerStatsFromSupabase,
  fetchTeamStatsFromSupabase,
  fetchPlayerImagesFromSupabase,
  fetchTeamLogosFromSupabase,
  type StatsCompetition,
} from "../src/lib/supabase/queries";

nextEnv.loadEnvConfig(process.cwd());
const directory = path.join(process.cwd(), "data", "snapshots");
await mkdir(directory, { recursive: true });

async function save(name: string, payload: unknown) {
  const filename = path.join(directory, `${name}.json.gz`);
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, gzipSync(JSON.stringify(payload)));
  await rename(temporary, filename);
}

const requested = process.argv.slice(2);
const competitions: StatsCompetition[] = ["nrl", "cup", "international", "origin"];
if (requested.some((value) => ![...competitions, "assets"].includes(value))) {
  throw new Error("Usage: npm run snapshot:stats -- [nrl cup international origin assets]");
}

if (!requested.length || requested.includes("assets")) {
  console.log("Refreshing player images and team logos...");
  const [playerImages, teamLogos] = await Promise.all([
    fetchPlayerImagesFromSupabase(), fetchTeamLogosFromSupabase(),
  ]);
  await save("assets", { version: 1, updatedAt: new Date().toISOString(), playerImages, teamLogos });
  console.log(`Saved ${playerImages.length} images and ${Object.keys(teamLogos).length} logos.`);
}

for (const competition of competitions.filter((value) => !requested.length || requested.includes(value))) {
  const years = await fetchAvailableYearsFromSupabase(competition);
  const playerRows = [];
  const teamRows = [];
  for (const year of years) {
    console.log(`Refreshing ${competition} ${year}...`);
    const [players, teams] = await Promise.all([
      fetchPlayerStatsFromSupabase([year], competition),
      fetchTeamStatsFromSupabase([year], competition),
    ]);
    playerRows.push(...players);
    teamRows.push(...teams);
    await save(`${competition}-${year}`, {
      version: 1, updatedAt: new Date().toISOString(), years: [year], playerRows: players, teamRows: teams,
    });
    if (competition === "nrl") {
      const seen = new Set<string>();
      const rows = players.filter((row) => {
        const key = `${row.Name}|${row.Round}|${row.Year}`;
        if (row["Mins Played"] <= 0 || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(({ Name, Team, Year, Round, Position, Fantasy }) => ({ Name, Team, Year, Round, Position, Fantasy }));
      await save(`nrl-teammates-${year}`, { version: 1, rows });
    }
  }
  const playersBySlug = new Map<string, typeof playerRows>();
  for (const row of playerRows) {
    const slug = playerSlug(row.Name);
    const rows = playersBySlug.get(slug) ?? [];
    rows.push(row);
    playersBySlug.set(slug, rows);
  }
  for (const [slug, rows] of playersBySlug) {
    await save(`${competition}-player-${slug}`, { version: 1, rows });
  }
  await save(competition, { version: 1, updatedAt: new Date().toISOString(), years });
  console.log(`Saved ${competition}: ${playerRows.length} player games, ${teamRows.length} team games.`);
}

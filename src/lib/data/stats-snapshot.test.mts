import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import {
  fetchAvailableYears, fetchPlayerStats, fetchTeamStats, fetchPlayerImages,
  fetchPlayerImagesForPlayer, fetchTeamLogos, fetchPlayerStatsForPlayerName,
  fetchTeammateLookupRows,
} from "../supabase/queries";
import { buildStatsTableCache, selectPlayerStatsTableRows } from "./stats-table-cache";
import { readStatsSnapshot, readStatsSnapshotMetadata, snapshotCoversYears } from "./stats-snapshot";

const hasSnapshots = await access("data/snapshots/nrl.json.gz").then(() => true, () => false);

test("stats load from local snapshots without any network requests", { skip: !hasSnapshots }, async (context) => {
  context.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network request"); });
  const startedAt = performance.now();
  const years = await fetchAvailableYears();
  assert.ok(years.length > 0);
  const [players, teams, images, logos] = await Promise.all([
    fetchPlayerStats([years[0]]), fetchTeamStats([years[0]]), fetchPlayerImages(), fetchTeamLogos(),
  ]);
  assert.ok(players.length > 0);
  assert.ok(teams.length > 0);
  assert.ok(images.length > 0);
  assert.ok(Object.keys(logos).length > 0);
  assert.ok(players.every((row) => row.Year === years[0]));
  const summary = selectPlayerStatsTableRows(buildStatsTableCache(players, []), {
    years: [years[0]], groupBy: "Player", team: "All Teams", position: "All Positions", minGames: 1,
  });
  assert.ok(summary.rows.length > 0);
  const detailBytes = Buffer.byteLength(JSON.stringify(players));
  const summaryBytes = Buffer.byteLength(JSON.stringify(summary));
  assert.ok(summaryBytes < detailBytes / 4);
  console.info(`Local stats + assets + summary: ${Math.round(performance.now() - startedAt)}ms; player payload ${detailBytes} -> ${summaryBytes} bytes`);
});

test("player profile and teammates load locally with year filtering", { skip: !hasSnapshots }, async (context) => {
  context.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network request"); });
  const startedAt = performance.now();
  const years = await fetchAvailableYears();
  const players = await fetchPlayerStats([years[0]]);
  const name = players[0].Name;
  const [profile, teammates, images] = await Promise.all([
    fetchPlayerStatsForPlayerName(name, [years[0]]), fetchTeammateLookupRows([years[0]]), fetchPlayerImagesForPlayer(name),
  ]);
  assert.deepEqual(profile, players.filter((row) => row.Name === name));
  assert.ok(teammates.length > 0);
  assert.ok(teammates.every((row) => row.Year === years[0]));
  assert.ok(images.every((row) => row.player.toLowerCase() === name.toLowerCase()));
  console.info(`Local profile + teammates: ${Math.round(performance.now() - startedAt)}ms`);
});

test("competition metadata and coverage checks stay separate", { skip: !hasSnapshots }, async (context) => {
  context.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network request"); });
  for (const competition of ["nrl", "cup", "international", "origin"] as const) {
    const index = await readStatsSnapshotMetadata(competition);
    if (!index) continue;
    assert.deepEqual(await fetchAvailableYears(competition), index.years);
    const players = await fetchPlayerStats([index.years[0]], competition);
    assert.ok(players.length > 0);
    assert.ok(players.every((row) => row.Year === index.years[0]));
  }
  assert.equal(snapshotCoversYears({ version: 1, updatedAt: "", years: ["2026"], playerRows: [], teamRows: [] }, ["2025"]), false);
  assert.equal(await readStatsSnapshot("nrl", ["1900"]), null);
});

test("snapshots can be disabled without changing authentication", async () => {
  const previous = process.env.STATS_SNAPSHOT_DISABLED;
  process.env.STATS_SNAPSHOT_DISABLED = "1";
  try {
    assert.equal(await readStatsSnapshotMetadata(), null);
  } finally {
    if (previous === undefined) delete process.env.STATS_SNAPSHOT_DISABLED;
    else process.env.STATS_SNAPSHOT_DISABLED = previous;
  }
});

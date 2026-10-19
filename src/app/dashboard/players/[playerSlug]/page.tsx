import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { isAccessibleSeason } from "@/lib/access/season-access";
import { PLAYER_STATS } from "@/lib/data/constants";
import { playerSlug as toPlayerSlug } from "@/lib/data/player-slug";
import type { PlayerStat } from "@/lib/data/types";
import {
  fetchAvailableYears,
  fetchPlayerImagesForPlayer,
  fetchPlayerStatsForPlayerName,
  fetchTeammateLookupRows,
  type PlayerImageRecord,
} from "@/lib/supabase/queries";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { PlayerGameLogTable } from "@/components/views/player-game-log-table";

export const dynamic = "force-dynamic";

interface PlayerGameLogPageProps {
  params: Promise<{
    playerSlug: string;
  }>;
  searchParams?: Promise<{
    competition?: string;
  }>;
}

const GAME_LOG_STATS = [
  "Mins Played",
  "All Run Metres",
  "Post Contact Metres",
  "Tackles Made",
  "Missed Tackles",
  "Tackle Breaks",
  "Line Breaks",
  "Try Assists",
  "Tries",
  "Offloads",
  "Kicking Metres",
] as const;

function latestTeam(rows: PlayerStat[]): string | null {
  return rows[0]?.Team ?? null;
}

function latestPosition(rows: PlayerStat[]): string | null {
  return rows[0]?.Position ?? null;
}

function playerImageSources(playerName: string, team: string | null, playerImages: PlayerImageRecord[]): string[] {
  const normalise = (value: string | null | undefined) =>
    String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = normalise(playerName);
  const teamKey = normalise(team);
  const row = playerImages
    .filter((image) => normalise(image.player) === target)
    .sort((a, b) => {
      const aTeamMatch = teamKey && normalise(a.team) === teamKey;
      const bTeamMatch = teamKey && normalise(b.team) === teamKey;
      if (aTeamMatch !== bTeamMatch) return aTeamMatch ? -1 : 1;
      return (b.last_seen_match_date ?? "").localeCompare(a.last_seen_match_date ?? "");
    })[0];

  return row ? [row.body_image, row.head_image].filter((source): source is string => Boolean(source)) : [];
}

function playerNameFromSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export default async function PlayerGameLogPage({ params, searchParams }: PlayerGameLogPageProps) {
  const [{ playerSlug }, resolvedSearchParams, { userId }] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ competition?: string }>({}),
    auth(),
  ]);
  const decodedSlug = decodeURIComponent(playerSlug);
  let competition: "nrl" | "cup" | "international" | "origin" =
    resolvedSearchParams.competition === "cup" || resolvedSearchParams.competition === "international" || resolvedSearchParams.competition === "origin"
      ? resolvedSearchParams.competition
      : "nrl";
  const canAccessLoginSeason = Boolean(userId);
  const [canBypassPlotGate, initialAvailableYears] = await Promise.all([
    getServerProPlotAccess(userId),
    fetchAvailableYears(competition),
  ]);
  if (competition !== "nrl" && !canBypassPlotGate) {
    notFound();
  }

  let availableYears = initialAvailableYears;
  let accessibleYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  );
  let yearPool = accessibleYears.length > 0 ? accessibleYears : availableYears.slice(0, 1);
  let playerName = playerNameFromSlug(decodedSlug);
  let [rows, playerImages] = await Promise.all([
    fetchPlayerStatsForPlayerName(playerName, yearPool, competition),
    fetchPlayerImagesForPlayer(playerName, competition),
  ]);

  if (rows.length === 0 && competition === "nrl") {
    const lookupName = Array.from(new Set((await fetchTeammateLookupRows(yearPool)).map((row) => row.Name))).find(
      (name) => toPlayerSlug(name) === decodedSlug
    );
    if (lookupName && lookupName !== playerName) {
      playerName = lookupName;
      [rows, playerImages] = await Promise.all([
        fetchPlayerStatsForPlayerName(playerName, yearPool, competition),
        fetchPlayerImagesForPlayer(playerName, competition),
      ]);
    }
  }

  if (rows.length === 0 && canBypassPlotGate && competition === "nrl") {
    competition = "cup";
    availableYears = await fetchAvailableYears(competition);
    accessibleYears = availableYears.filter((year) =>
      isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
    );
    yearPool = accessibleYears.length > 0 ? accessibleYears : availableYears.slice(0, 1);
    playerName = playerNameFromSlug(decodedSlug);
    [rows, playerImages] = await Promise.all([
      fetchPlayerStatsForPlayerName(playerName, yearPool, competition),
      fetchPlayerImagesForPlayer(playerName, competition),
    ]);
  }

  if (rows.length === 0 || yearPool.length === 0) {
    notFound();
  }

  rows.sort(
    (a, b) => b.Year.localeCompare(a.Year) || b.Round - a.Round
  );

  if (rows.length === 0) {
    notFound();
  }

  const team = latestTeam(rows);
  const position = latestPosition(rows);
  const imageSources = [...new Set([
    ...rows.flatMap((row) => [row.body_image, row.head_image]).filter((source): source is string => typeof source === "string" && source.length > 0),
    ...playerImageSources(playerName, team, playerImages),
  ])];
  const shownGameLogStats = GAME_LOG_STATS.filter((stat) => PLAYER_STATS.includes(stat));
  const teammateRows = competition === "nrl" ? await fetchTeammateLookupRows(yearPool) : [];

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/players"
        className="inline-flex border-b border-nrl-accent pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-nrl-text transition-colors hover:text-nrl-accent"
      >
        ← Back to player stats
      </Link>

      <section className="border-b border-nrl-border pb-8">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden border border-nrl-border bg-nrl-panel sm:h-28 sm:w-28">
              <ImageWithFallback
                sources={imageSources}
                alt={playerName}
                className="h-full w-full object-cover object-top"
                loading="eager"
                fetchPriority="high"
              />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-nrl-accent">
                {[team, position, "Stats profile"].filter(Boolean).join(" · ")}
              </div>
              <h1 className="mt-2 truncate text-4xl leading-none text-nrl-text sm:text-7xl">{playerName}</h1>
              <div className="mt-3 inline-flex border border-nrl-border bg-nrl-panel-2 px-3 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-nrl-text">
                {yearPool.join(" · ")} season · {rows.length} games
              </div>
            </div>
        </div>
      </section>

      <PlayerGameLogTable
        rows={rows}
        statKeys={shownGameLogStats}
        playerName={playerName}
        teammateRows={teammateRows}
      />
    </div>
  );
}

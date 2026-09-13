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

const SUMMARY_STATS = ["Mins Played", "All Run Metres", "Tackles Made", "Tackle Breaks"] as const;
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

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null): string {
  if (value == null) return "-";
  if (Math.abs(value) >= 10) return Math.round(value).toString();
  return value.toFixed(1).replace(/\.0$/, "");
}

function statAverage(rows: PlayerStat[], stat: string): number | null {
  return average(rows.map((row) => numeric(row[stat])).filter((value): value is number => value != null));
}

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
  let competition: "nrl" | "cup" = resolvedSearchParams.competition === "cup" ? "cup" : "nrl";
  const canAccessLoginSeason = Boolean(userId);
  const [canBypassPlotGate, initialAvailableYears] = await Promise.all([
    getServerProPlotAccess(userId),
    fetchAvailableYears(competition),
  ]);
  if (competition === "cup" && !canBypassPlotGate) {
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
  const imageSources = playerImageSources(playerName, team, playerImages);
  const shownGameLogStats = GAME_LOG_STATS.filter((stat) => PLAYER_STATS.includes(stat));

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/players"
        aria-label="Back to Players"
        title="Back to Players"
        className="inline-grid h-9 w-9 place-items-center rounded-lg border border-nrl-border bg-nrl-panel text-lg font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-accent"
      >
        <span aria-hidden="true">←</span>
      </Link>

      <section className="relative overflow-hidden rounded-xl border border-nrl-border bg-[#111832] p-3 sm:p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(71,255,182,0.13),transparent_32%),radial-gradient(circle_at_82%_76%,rgba(129,92,255,0.14),transparent_36%)]" />
        <div className="relative z-[1] space-y-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel sm:h-16 sm:w-16">
              <ImageWithFallback
                sources={imageSources}
                alt={playerName}
                className="h-full w-full object-cover object-top"
                loading="eager"
                fetchPriority="high"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black tracking-tight text-nrl-text sm:text-2xl">{playerName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-nrl-muted sm:text-xs">
                {team ? <span>{team}</span> : null}
                {position ? (
                  <span className="rounded-md border border-nrl-border bg-[#0f162d] px-1.5 py-0.5">{position}</span>
                ) : null}
                <span className="rounded-md border border-nrl-accent/30 bg-nrl-accent/10 px-1.5 py-0.5 text-nrl-accent">
                  {rows.length} games
                </span>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {SUMMARY_STATS.map((stat) => (
              <div key={stat} className="min-w-0 rounded-lg border border-nrl-border bg-white/[0.035] px-3 py-2.5">
                <div className="truncate text-[8px] font-black uppercase tracking-wide text-nrl-muted">{stat}</div>
                <div className="mt-1 text-lg font-black text-nrl-text sm:text-xl">{formatNumber(statAverage(rows, stat))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PlayerGameLogTable rows={rows} statKeys={shownGameLogStats} />
    </div>
  );
}

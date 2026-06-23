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
  fetchPlayerImages,
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
}

const SUMMARY_STATS = ["Fantasy", "Mins Played", "All Run Metres", "Tackles Made", "Tackle Breaks", "Tries"] as const;
const GAME_LOG_STATS = [
  "Fantasy",
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

export default async function PlayerGameLogPage({ params }: PlayerGameLogPageProps) {
  const { playerSlug } = await params;
  const decodedSlug = decodeURIComponent(playerSlug);
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const canBypassPlotGate = await getServerProPlotAccess(userId);

  const [availableYears, playerImages] = await Promise.all([
    fetchAvailableYears(),
    fetchPlayerImages(),
  ]);
  const accessibleYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  );
  const yearPool = accessibleYears.length > 0 ? accessibleYears : availableYears.slice(0, 1);
  const lookupRows = await fetchTeammateLookupRows(yearPool);
  const playerName = Array.from(new Set(lookupRows.map((row) => row.Name))).find(
    (name) => toPlayerSlug(name) === decodedSlug
  );

  if (!playerName) {
    notFound();
  }

  const rows = (await fetchPlayerStatsForPlayerName(playerName, yearPool)).sort(
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
        className="inline-flex items-center gap-2 text-sm font-semibold text-nrl-muted transition-colors hover:text-nrl-accent"
      >
        <span aria-hidden="true">←</span>
        Back to Players
      </Link>

      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="grid grid-cols-[minmax(8.5rem,10.5rem)_minmax(0,1fr)] gap-4 bg-nrl-panel-2 p-4 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:gap-4">
            <div className="grid h-32 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel md:h-36 md:w-32">
              <ImageWithFallback
                sources={imageSources}
                alt={playerName}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="min-w-0 md:self-center">
              <h1 className="text-xl font-black tracking-tight text-nrl-text md:text-3xl">{playerName}</h1>
              <div className="mt-1 text-sm font-semibold text-nrl-muted">
                {[team, position, `${rows.length} games`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 content-start gap-2 xl:grid-cols-6">
            {SUMMARY_STATS.map((stat) => (
              <div key={stat} className="rounded-md border border-nrl-border bg-nrl-panel px-3 py-2">
                <div className="truncate text-[8px] font-black uppercase tracking-wide text-nrl-muted">{stat}</div>
                <div className="mt-1 text-lg font-black text-nrl-text">{formatNumber(statAverage(rows, stat))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PlayerGameLogTable rows={rows} statKeys={shownGameLogStats} />
    </div>
  );
}

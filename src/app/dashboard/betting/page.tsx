import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { BettingDashboard } from "@/components/views/betting-dashboard";
import { getServerPremiumAccess } from "@/lib/access/pro-access-server";
import { fetchApprovedArticles } from "@/lib/articles";
import { fetchBettingOddsSnapshot, fetchBettingOddsSnapshotFromRawTables, fetchBettingPageSummary, fetchPlayerImages } from "@/lib/supabase/queries";
import type { BettingOddsRow, BettingOddsSnapshot } from "@/lib/betting/types";
import type { BettingSummaryGame } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const SUNDAY_BETTING_RELEASE_UTC_HOUR = 11;
const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalisePlayerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseArticleTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseTeamKey(value: string): string {
  const key = normalisePlayerKey(value);
  if (!key) return "";
  if (key.includes("broncos") || key === "brisbane") return "broncos";
  if (key.includes("raiders") || key === "canberra") return "raiders";
  if (key.includes("bulldogs") || key.includes("canterbury")) return "bulldogs";
  if (key.includes("sharks") || key.includes("cronulla")) return "sharks";
  if (key.includes("dolphins")) return "dolphins";
  if (key.includes("titans") || key.includes("gold coast")) return "titans";
  if (key.includes("sea eagles") || key.includes("manly")) return "sea eagles";
  if (key.includes("storm") || key.includes("melbourne")) return "storm";
  if (key.includes("knights") || key.includes("newcastle")) return "knights";
  if (key.includes("warriors") || key.includes("zealand")) return "warriors";
  if (key.includes("cowboys") || key.includes("north queensland")) return "cowboys";
  if (key.includes("eels") || key.includes("parramatta")) return "eels";
  if (key.includes("panthers") || key.includes("penrith")) return "panthers";
  if (key.includes("rabbitohs") || key.includes("south sydney") || key === "souths") return "rabbitohs";
  if (key.includes("dragons") || key.includes("st george")) return "dragons";
  if (key.includes("roosters") || key.includes("sydney")) return "roosters";
  if (key.includes("tigers") || key.includes("wests")) return "tigers";
  return key;
}

function buildBettingMatchKey(home: string, away: string): string {
  return [normaliseTeamKey(home), normaliseTeamKey(away)].sort().join("|");
}

function parseBettingMatch(match: string): { home: string; away: string } | null {
  const parts = match.split(/\s+v(?:s|\.)?\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { home: parts[0] ?? "", away: parts.slice(1).join(" v ") };
}

function buildGameReleaseLookup(games: BettingSummaryGame[]): { byMatchDate: Map<string, string | null>; byDate: Map<string, string | null> } {
  const byMatchDate = new Map<string, string | null>();
  const byDate = new Map<string, string | null>();

  for (const game of games) {
    byMatchDate.set(`${game.matchDate}|${game.matchKey}`, game.releaseAtUtc);
    if (!byDate.has(game.matchDate)) byDate.set(game.matchDate, game.releaseAtUtc);
  }

  return { byMatchDate, byDate };
}

function releaseAtForBettingRow(row: BettingOddsRow, lookup: ReturnType<typeof buildGameReleaseLookup>): string | null | undefined {
  const match = parseBettingMatch(row.match);
  if (match) {
    const exactReleaseAt = lookup.byMatchDate.get(`${row.date}|${buildBettingMatchKey(match.home, match.away)}`);
    if (exactReleaseAt !== undefined) return exactReleaseAt;
  }
  return lookup.byDate.get(row.date);
}

function bettingReleaseMs(releaseAt: string): number {
  const releaseMs = Date.parse(releaseAt);
  if (!Number.isFinite(releaseMs)) return releaseMs;

  const releaseDate = new Date(releaseMs);
  if (releaseDate.getUTCDay() === 0 && releaseDate.getUTCHours() < SUNDAY_BETTING_RELEASE_UTC_HOUR) {
    releaseDate.setUTCHours(SUNDAY_BETTING_RELEASE_UTC_HOUR, 0, 0, 0);
    return releaseDate.getTime();
  }

  return releaseMs;
}

function filterUnreleasedBettingRounds(
  snapshot: BettingOddsSnapshot,
  games: BettingSummaryGame[],
  now = new Date()
): BettingOddsSnapshot {
  if (games.length === 0) return snapshot;

  const releaseLookup = buildGameReleaseLookup(games);
  const nowMs = now.getTime();
  const filterRows = (rows: BettingOddsRow[]) => rows.filter((row) => {
    const releaseAt = releaseAtForBettingRow(row, releaseLookup);
    if (!releaseAt) return true;
    const releaseMs = bettingReleaseMs(releaseAt);
    return !Number.isFinite(releaseMs) || nowMs >= releaseMs;
  });

  return {
    ...snapshot,
    h2h: filterRows(snapshot.h2h),
    line: filterRows(snapshot.line),
    total: filterRows(snapshot.total),
    tryscorer: filterRows(snapshot.tryscorer),
  };
}

async function isLocalhostRequest(): Promise<boolean> {
  const headerStore = await headers();
  const host = headerStore.get("host")?.split(":")[0].toLowerCase() ?? "";
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(":")[0].toLowerCase() ?? "";
  return LOCALHOST_NAMES.has(host) || LOCALHOST_NAMES.has(forwardedHost);
}

function filterBettingSnapshotToDates(snapshot: BettingOddsSnapshot, dates: Set<string>): BettingOddsSnapshot {
  const filterRows = (rows: BettingOddsRow[]) => rows.filter((row) => dates.has(row.date));
  return {
    ...snapshot,
    h2h: filterRows(snapshot.h2h),
    line: filterRows(snapshot.line),
    total: filterRows(snapshot.total),
    tryscorer: filterRows(snapshot.tryscorer),
  };
}

function bettingSnapshotDates(snapshot: BettingOddsSnapshot): string[] {
  return Array.from(new Set([
    ...snapshot.h2h.map((row) => row.date),
    ...snapshot.line.map((row) => row.date),
    ...snapshot.total.map((row) => row.date),
    ...snapshot.tryscorer.map((row) => row.date),
  ].filter(Boolean))).sort();
}

function bettingSnapshotHasRows(snapshot: BettingOddsSnapshot): boolean {
  return snapshot.h2h.length + snapshot.line.length + snapshot.total.length + snapshot.tryscorer.length > 0;
}

function isoDateDaysBefore(dateIso: string, days: number): string {
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return dateIso;
  return new Date(parsed - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isoDateDaysAfter(dateIso: string, days: number): string {
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return dateIso;
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function localhostScreenshotWindowSnapshot(
  snapshot: BettingOddsSnapshot,
  now = new Date()
): { snapshot: BettingOddsSnapshot; displayTodayIso: string | null; showPastMarkets: boolean } {
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const dates = bettingSnapshotDates(snapshot);
  const completedDates = dates.filter((date) => date <= todayIso);
  const upcomingDates = dates.filter((date) => date > todayIso);
  const selectedDates = new Set<string>();

  const latestCompletedDate = completedDates.at(-1) ?? null;
  if (latestCompletedDate) {
    const completedWindowStart = isoDateDaysBefore(latestCompletedDate, 7);
    for (const date of completedDates) {
      if (date >= completedWindowStart && date <= latestCompletedDate) selectedDates.add(date);
    }
  }

  const firstUpcomingDate = upcomingDates[0] ?? null;
  if (firstUpcomingDate) {
    const upcomingWindowEnd = isoDateDaysAfter(firstUpcomingDate, 7);
    for (const date of upcomingDates) {
      if (date >= firstUpcomingDate && date <= upcomingWindowEnd) selectedDates.add(date);
    }
  }

  if (selectedDates.size === 0) {
    return { snapshot, displayTodayIso: null, showPastMarkets: true };
  }

  const screenshotSnapshot = filterBettingSnapshotToDates(snapshot, selectedDates);
  return {
    snapshot: bettingSnapshotHasRows(screenshotSnapshot) ? screenshotSnapshot : snapshot,
    displayTodayIso: latestCompletedDate ?? firstUpcomingDate,
    showPastMarkets: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function collectLineupPlayerNames(value: unknown, names: Set<string>) {
  if (typeof value === "string") {
    const key = normalisePlayerKey(value);
    if (key) names.add(key);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectLineupPlayerNames(item, names);
    return;
  }

  const row = asRecord(value);
  const player =
    typeof row.player === "string" ? row.player :
      typeof row.playerName === "string" ? row.playerName :
        typeof row.name === "string" ? row.name :
          "";
  if (player) {
    const key = normalisePlayerKey(player);
    if (key) names.add(key);
  }

  for (const key of ["players", "homeTeam", "awayTeam", "home", "away", "lineup"]) {
    if (key in row) collectLineupPlayerNames(row[key], names);
  }
}

function buildLineupPlayersByMatch(summary: Record<string, unknown>, games: BettingSummaryGame[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const gamesByMatchKey = new Map(games.map((game) => [game.matchKey, game]));

  for (const [rawKey, value] of Object.entries(summary)) {
    const players = new Set<string>();
    collectLineupPlayerNames(value, players);
    if (players.size === 0) continue;

    out.set(rawKey, players);
    const normalizedRawKey = normalisePlayerKey(rawKey);
    if (normalizedRawKey) out.set(normalizedRawKey, players);

    const game = gamesByMatchKey.get(rawKey);
    if (game) out.set(`${game.matchDate}|${game.matchKey}`, players);
  }

  return out;
}

function filterTryscorersToLineups(
  snapshot: BettingOddsSnapshot,
  lineupPlayersByMatch: Record<string, unknown>,
  games: BettingSummaryGame[]
): BettingOddsSnapshot {
  const namedPlayersByMatch = buildLineupPlayersByMatch(lineupPlayersByMatch, games);
  if (namedPlayersByMatch.size === 0) return snapshot;

  const tryscorer = snapshot.tryscorer.filter((row) => {
    const match = parseBettingMatch(row.match);
    const matchKey = match ? buildBettingMatchKey(match.home, match.away) : normalisePlayerKey(row.match);
    const namedPlayers =
      namedPlayersByMatch.get(`${row.date}|${matchKey}`) ??
      namedPlayersByMatch.get(matchKey) ??
      namedPlayersByMatch.get(`${row.date}|${normalisePlayerKey(row.match)}`) ??
      namedPlayersByMatch.get(normalisePlayerKey(row.match));

    if (!namedPlayers) return true;
    return namedPlayers.has(normalisePlayerKey(row.result));
  });

  return { ...snapshot, tryscorer };
}

function lineupsMatchAnchorId(game: BettingSummaryGame): string {
  return `lineups-match-${normalisePlayerKey(`${game.matchDate} ${game.matchKey}`).replace(/\s+/g, "-")}`;
}

function buildLineupLinksByMatchKey(games: BettingSummaryGame[]): Record<string, string> {
  return Object.fromEntries(
    games.map((game) => {
      const roundParam = game.round == null ? "" : `?round=${encodeURIComponent(`Round ${game.round}`)}`;
      return [`${game.matchDate}|${game.matchKey}`, `/dashboard/lineups${roundParam}#${lineupsMatchAnchorId(game)}`];
    })
  );
}

export default async function BettingPage() {
  const { userId } = await auth();
  const [snapshot, canAccessPremium, bettingSummary, approvedArticles, playerImages, localhostRequest] = await Promise.all([
    fetchBettingOddsSnapshot(),
    getServerPremiumAccess(userId),
    fetchBettingPageSummary(),
    fetchApprovedArticles(),
    fetchPlayerImages(),
    isLocalhostRequest(),
  ]);
  const marginModelArticle = approvedArticles.find((article) =>
    normaliseArticleTitle(article.title).includes("margin model")
  ) ?? null;
  const tryscorerArticle = approvedArticles.find((article) => {
    const title = normaliseArticleTitle(article.title);
    return (
      article.slug !== marginModelArticle?.slug &&
      (title.includes("tryscorer") || title.includes("try scorer") || title.includes("try scoring") || title.includes("tryscore"))
    );
  }) ?? null;
  const lineupsFilteredSnapshot = filterTryscorersToLineups(
    localhostRequest
      ? await fetchBettingOddsSnapshotFromRawTables().catch((error) => {
          console.warn("Unable to fetch raw betting odds for localhost screenshot mode; using summary snapshot.", error);
          return snapshot;
        })
      : snapshot,
    bettingSummary.lineupPlayersByMatch,
    bettingSummary.games
  );
  const releasedSnapshot = filterUnreleasedBettingRounds(lineupsFilteredSnapshot, bettingSummary.games);
  const localhostSnapshot = localhostRequest
    ? localhostScreenshotWindowSnapshot(lineupsFilteredSnapshot)
    : null;
  const visibleSnapshot = localhostSnapshot?.snapshot ?? releasedSnapshot;

  return (
    <BettingDashboard
      snapshot={visibleSnapshot}
      canAccessPremium={canAccessPremium}
      displayTodayIso={localhostSnapshot?.displayTodayIso ?? undefined}
      showPastMarkets={localhostSnapshot?.showPastMarkets ?? false}
      playerImages={playerImages}
      playerTeamsByName={bettingSummary.playerTeamsByName}
      teamLogos={bettingSummary.teamLogos}
      tryscorerFormByPlayer={bettingSummary.tryscorerFormByPlayer}
      tryscorerLastFiveVsOpponentByMatch={bettingSummary.tryscorerLastFiveVsOpponentByMatch}
      tryscorerKickoffsByMatch={bettingSummary.tryscorerKickoffsByMatch}
      lineupLinksByMatchKey={buildLineupLinksByMatchKey(bettingSummary.games)}
      marginModelArticle={
        marginModelArticle
          ? {
              title: marginModelArticle.title,
              slug: marginModelArticle.slug,
              imageUrls: marginModelArticle.imageUrls,
            }
          : null
      }
      tryscorerArticle={
        tryscorerArticle
          ? {
              title: tryscorerArticle.title,
              slug: tryscorerArticle.slug,
              imageUrls: tryscorerArticle.imageUrls,
            }
          : null
      }
    />
  );
}

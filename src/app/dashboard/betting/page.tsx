import { auth } from "@clerk/nextjs/server";
import { BettingDashboard } from "@/components/views/betting-dashboard";
import { getServerPremiumAccess } from "@/lib/access/pro-access-server";
import { fetchApprovedArticles } from "@/lib/articles";
import { fetchBettingOddsSnapshot, fetchBettingPageSummary } from "@/lib/supabase/queries";
import type { BettingOddsRow, BettingOddsSnapshot } from "@/lib/betting/types";
import type { BettingSummaryGame } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

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
    const releaseMs = Date.parse(releaseAt);
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

export default async function BettingPage() {
  const { userId } = await auth();
  const [snapshot, canAccessPremium, bettingSummary, approvedArticles] = await Promise.all([
    fetchBettingOddsSnapshot(),
    getServerPremiumAccess(userId),
    fetchBettingPageSummary(),
    fetchApprovedArticles(),
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
  const visibleSnapshot = filterUnreleasedBettingRounds(snapshot, bettingSummary.games);

  return (
    <BettingDashboard
      snapshot={visibleSnapshot}
      canAccessPremium={canAccessPremium}
      playerTeamsByName={bettingSummary.playerTeamsByName}
      teamLogos={bettingSummary.teamLogos}
      tryscorerFormByPlayer={bettingSummary.tryscorerFormByPlayer}
      tryscorerKickoffsByMatch={bettingSummary.tryscorerKickoffsByMatch}
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

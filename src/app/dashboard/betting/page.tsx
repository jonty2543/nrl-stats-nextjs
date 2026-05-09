import { auth } from "@clerk/nextjs/server";
import { BettingDashboard } from "@/components/views/betting-dashboard";
import { getServerPremiumAccess } from "@/lib/access/pro-access-server";
import { fetchApprovedArticles } from "@/lib/articles";
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026";
import { fetchBettingOddsSnapshot, fetchPlayerImages, fetchPlayerStats, fetchTeamLogos } from "@/lib/supabase/queries";
import type { PlayerStat } from "@/lib/data/types";
import type { Draw2026Row } from "@/lib/draw/types";

export const dynamic = "force-dynamic";

function normalisePlayerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseArticleTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseTeamKey(value: string): string {
  const key = normalisePlayerKey(value);
  const aliases: Record<string, string> = {
    broncos: "brisbane broncos",
    bulldogs: "canterbury bankstown bulldogs",
    "canterbury bulldogs": "canterbury bankstown bulldogs",
    raiders: "canberra raiders",
    sharks: "cronulla sutherland sharks",
    titans: "gold coast titans",
    "sea eagles": "manly warringah sea eagles",
    storm: "melbourne storm",
    knights: "newcastle knights",
    cowboys: "north queensland cowboys",
    eels: "parramatta eels",
    panthers: "penrith panthers",
    rabbitohs: "south sydney rabbitohs",
    dragons: "st george illawarra dragons",
    roosters: "sydney roosters",
    warriors: "new zealand warriors",
    tigers: "wests tigers",
    dolphins: "dolphins",
  };
  return aliases[key] ?? key;
}

function buildDrawMatchKey(home: string, away: string): string {
  return [normaliseTeamKey(home), normaliseTeamKey(away)].sort().join("|");
}

function buildTryscorerKickoffsByMatch(rows: Draw2026Row[]) {
  return Object.fromEntries(
    rows.flatMap((row) => {
      if (!row.kickoff) return [];
      const date = row.kickoff.slice(0, 10);
      return [[`${date}|${buildDrawMatchKey(row.home, row.away)}`, row.kickoff]];
    })
  );
}

function buildTryscorerFormByPlayer(rows: PlayerStat[]) {
  const byPlayer = new Map<string, PlayerStat[]>();
  for (const row of rows) {
    const key = normalisePlayerKey(row.Name);
    if (!key) continue;
    const existing = byPlayer.get(key);
    if (existing) {
      existing.push(row);
    } else {
      byPlayer.set(key, [row]);
    }
  }

  return Object.fromEntries(
    [...byPlayer.entries()].map(([key, playerRows]) => {
      const sortedRows = playerRows.sort((a, b) => {
          if (a.Year !== b.Year) return b.Year.localeCompare(a.Year);
          return b.Round - a.Round;
        });
      const lastFive = sortedRows
        .slice(0, 5)
        .map((row) => row.Tries);
      const average = lastFive.length > 0
        ? lastFive.reduce((sum, tries) => sum + tries, 0) / lastFive.length
        : 0;
      return [key, { player: sortedRows[0]?.Name ?? "", team: sortedRows[0]?.Team ?? null, lastFive, average }];
    })
  );
}

export default async function BettingPage() {
  const { userId } = await auth();
  const [snapshot, canAccessPremium, playerImages, teamLogos, playerStats, draw2026Data, approvedArticles] = await Promise.all([
    fetchBettingOddsSnapshot(),
    getServerPremiumAccess(userId),
    fetchPlayerImages(),
    fetchTeamLogos(),
    fetchPlayerStats(["2025", "2026"]),
    loadDraw2026Data().catch(() => null),
    fetchApprovedArticles(),
  ]);
  const marginModelArticle = approvedArticles.find((article) =>
    normaliseArticleTitle(article.title).includes("margin model")
  ) ?? null;

  return (
    <BettingDashboard
      snapshot={snapshot}
      canAccessPremium={canAccessPremium}
      playerImages={playerImages}
      teamLogos={teamLogos}
      tryscorerFormByPlayer={buildTryscorerFormByPlayer(playerStats)}
      tryscorerKickoffsByMatch={buildTryscorerKickoffsByMatch(draw2026Data?.rows ?? [])}
      marginModelArticle={
        marginModelArticle
          ? {
              title: marginModelArticle.title,
              slug: marginModelArticle.slug,
              imageUrls: marginModelArticle.imageUrls,
            }
          : null
      }
    />
  );
}

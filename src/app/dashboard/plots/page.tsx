import { auth } from "@clerk/nextjs/server";
import { PlotsDashboard } from "@/components/views/plots-dashboard";
import { isAccessibleSeason } from "@/lib/access/season-access";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { canonicalPlayerName } from "@/lib/data/player-attack";
import { fetchAvailableYears, fetchPlayerImages, fetchPlayerStats, fetchTeamLogos, type PlayerImageRecord } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

function normalisePlayerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseImageUrl(value: string): string {
  const secure = value.trim().replace(/^http:\/\//, "https://");
  return encodeURI(secure).replace(/'/g, "%27");
}

function buildPlayerFaceImages(rows: PlayerImageRecord[]): Record<string, string> {
  const faces: Record<string, string> = {};
  for (const row of [...rows].sort((left, right) => (right.last_seen_match_date ?? "").localeCompare(left.last_seen_match_date ?? ""))) {
    const key = normalisePlayerName(canonicalPlayerName(row.player));
    const source = row.cached_head_image ?? row.head_image ?? row.cached_body_image ?? row.body_image;
    if (key && source && !faces[key]) faces[key] = normaliseImageUrl(source);
  }
  return faces;
}

export default async function PlotsPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const proAccessPromise = getServerProPlotAccess(userId);
  const availableYearsPromise = fetchAvailableYears();
  const cupAvailableYearsPromise = proAccessPromise.then((canAccess) =>
    canAccess ? fetchAvailableYears("cup") : Promise.resolve([])
  );
  const teamLogosPromise = fetchTeamLogos();
  const playerImagesPromise = fetchPlayerImages();
  const [canAccessProSeason, availableYears] = await Promise.all([proAccessPromise, availableYearsPromise]);
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canAccessProSeason)
  );
  const yearOptions = unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1);
  const initialYear = yearOptions[0] ?? "";
  const initialPlayerDataPromise = initialYear ? fetchPlayerStats([initialYear]) : Promise.resolve([]);
  const [teamLogos, playerImages, initialPlayerData, cupAvailableYears] = await Promise.all([
    teamLogosPromise,
    playerImagesPromise,
    initialPlayerDataPromise,
    cupAvailableYearsPromise,
  ]);

  return <PlotsDashboard initialPlayerData={initialPlayerData} availableYears={yearOptions} cupAvailableYears={cupAvailableYears} initialYear={initialYear} teamLogos={teamLogos} playerFaceImages={buildPlayerFaceImages(playerImages)} canAccessModelPlots={canAccessProSeason} canAccessCup={canAccessProSeason} />;
}

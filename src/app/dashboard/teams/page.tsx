import { auth } from "@clerk/nextjs/server";
import { fetchAvailableYears, fetchPlayerStats } from "@/lib/supabase/queries";
import { TeamComparison } from "@/components/views/team-comparison";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { isAccessibleSeason } from "@/lib/access/season-access";

export const dynamic = "force-dynamic";

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length));
}

export default async function TeamsPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const canBypassPlotGate = await getServerProPlotAccess(userId);
  const availableYears = await fetchAvailableYears();
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  );
  const initialYears = defaultRecentYears(
    unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  );
  const initialData = unlockedYears.length > 0 ? await fetchPlayerStats(unlockedYears) : [];

  return (
    <TeamComparison
      initialData={initialData}
      availableYears={availableYears}
      defaultYears={initialYears}
      canBypassPlotGate={canBypassPlotGate}
    />
  );
}

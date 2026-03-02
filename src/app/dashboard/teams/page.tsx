import { auth } from "@clerk/nextjs/server";
import { fetchAvailableYears, fetchPlayerStats } from "@/lib/supabase/queries";
import { TeamComparison } from "@/components/views/team-comparison";
import { isAccessibleSeason } from "@/lib/access/season-access";

export const dynamic = "force-dynamic";
const PREFERRED_DEFAULT_YEARS = ["2026", "2025"] as const;

export default async function TeamsPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const availableYears = await fetchAvailableYears();
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats")
  );
  const defaultYears = PREFERRED_DEFAULT_YEARS.filter((year) => unlockedYears.includes(year));
  const initialYears = defaultYears.length > 0 ? defaultYears : unlockedYears.slice(0, 1);
  const initialData = initialYears.length > 0 ? await fetchPlayerStats(initialYears) : [];

  return (
    <TeamComparison
      initialData={initialData}
      availableYears={availableYears}
      defaultYears={initialYears}
    />
  );
}

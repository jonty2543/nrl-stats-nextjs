import { auth } from "@clerk/nextjs/server";
import { fetchAvailableYears } from "@/lib/supabase/queries";
import { TeamComparison } from "@/components/views/team-comparison";
import { isAccessibleSeason } from "@/lib/access/season-access";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const availableYears = await fetchAvailableYears();
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason)
  );
  const defaultYears = unlockedYears.slice(0, 1);

  return (
    <TeamComparison
      initialData={[]}
      availableYears={availableYears}
      defaultYears={defaultYears}
    />
  );
}

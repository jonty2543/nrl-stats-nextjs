import { auth } from "@clerk/nextjs/server";
import { fetchAvailableYears } from "@/lib/supabase/queries";
import { PlayerComparison } from "@/components/views/player-comparison";
import { isAccessibleSeason } from "@/lib/access/season-access";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const availableYears = await fetchAvailableYears();
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason)
  );
  const defaultYears = unlockedYears.slice(0, 1);

  return (
    <PlayerComparison
      initialData={[]}
      availableYears={availableYears}
      defaultYears={defaultYears}
    />
  );
}

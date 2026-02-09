import { fetchPlayerStats, fetchAvailableYears } from "@/lib/supabase/queries";
import { PlayerComparison } from "@/components/views/player-comparison";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const availableYears = await fetchAvailableYears();
  const defaultYears = availableYears.slice(0, 1); // Latest year only
  const data = await fetchPlayerStats(defaultYears);

  return (
    <PlayerComparison
      initialData={data}
      availableYears={availableYears}
      defaultYears={defaultYears}
    />
  );
}

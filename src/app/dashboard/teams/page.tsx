import { fetchPlayerStats, fetchAvailableYears } from "@/lib/supabase/queries";
import { TeamComparison } from "@/components/views/team-comparison";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const availableYears = await fetchAvailableYears();
  const defaultYears = availableYears.slice(0, 1);
  const data = await fetchPlayerStats(defaultYears);

  return (
    <TeamComparison
      initialData={data}
      availableYears={availableYears}
      defaultYears={defaultYears}
    />
  );
}

import { BettingDashboard } from "@/components/views/betting-dashboard";
import { fetchBettingOddsSnapshot } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function BettingPage() {
  const snapshot = await fetchBettingOddsSnapshot();
  return <BettingDashboard snapshot={snapshot} />;
}

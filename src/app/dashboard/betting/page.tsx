import { auth } from "@clerk/nextjs/server";
import { BettingDashboard } from "@/components/views/betting-dashboard";
import { getServerPremiumAccess } from "@/lib/access/pro-access-server";
import { fetchBettingOddsSnapshot } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function BettingPage() {
  const { userId } = await auth();
  const snapshot = await fetchBettingOddsSnapshot();
  const canAccessPremium = await getServerPremiumAccess(userId);
  return <BettingDashboard snapshot={snapshot} canAccessPremium={canAccessPremium} />;
}

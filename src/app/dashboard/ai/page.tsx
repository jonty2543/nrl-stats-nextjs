import { auth } from "@clerk/nextjs/server";
import { AiChatPage } from "@/components/views/ai-chat-page";
import { getServerAiAccess } from "@/lib/ai/access";
import {
  getAiUsageForUser,
} from "@/lib/ai/persistence";
import { AI_TOOL_DEFINITIONS } from "@/lib/ai/tools";
import { fetchFantasyCoachPlayersSnapshot, getFantasyCoachRoundMetrics } from "@/lib/fantasy/nrl";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const { userId } = await auth();
  const access = await getServerAiAccess(userId);
  const [usage, fantasyCoachPlayers] = await Promise.all([
    getAiUsageForUser(
      userId,
      access.chatLimit,
      access.chatQuotaPeriodDays,
      access.chatQuotaPeriodLabel
    ),
    fetchFantasyCoachPlayersSnapshot(),
  ]);
  const nextUpcomingRound = fantasyCoachPlayers
    .map((player) => getFantasyCoachRoundMetrics(player).round)
    .filter((round): round is number => round != null)
    .sort((a, b) => a - b)[0] ?? null;

  return (
    <AiChatPage
      plan={access.plan}
      chatLimit={access.chatLimit}
      chatQuotaPeriodLabel={access.chatQuotaPeriodLabel}
      chatsUsed={usage.usedInPeriod}
      chatsRemaining={usage.remainingInPeriod}
      usageTrackingAvailable={usage.trackingAvailable}
      initialMessages={[]}
      initialThreadId={null}
      nextUpcomingRound={nextUpcomingRound}
      tools={AI_TOOL_DEFINITIONS}
    />
  );
}

import { auth } from "@clerk/nextjs/server";
import { AiChatPage } from "@/components/views/ai-chat-page";
import { getServerAiAccess } from "@/lib/ai/access";
import {
  getAiUsageForUser,
  loadAiThreadForUser,
  loadAiThreadListForUser,
  loadLatestAiThreadForUser,
  sanitizeAiMessagesForAccess,
} from "@/lib/ai/persistence";
import { AI_TOOL_DEFINITIONS } from "@/lib/ai/tools";
import { fetchFantasyCoachPlayersSnapshot, getFantasyCoachRoundMetrics } from "@/lib/fantasy/nrl";

export const dynamic = "force-dynamic";

interface AiPageProps {
  searchParams: Promise<{
    thread?: string;
    new?: string;
  }>;
}

export default async function AiPage({ searchParams }: AiPageProps) {
  const { userId } = await auth();
  const access = await getServerAiAccess(userId);
  const params = await searchParams;
  const requestedThreadId = typeof params.thread === "string" ? params.thread : null;
  const startNewThread = params.new === "1";
  const [threadList, usage, thread, fantasyCoachPlayers] = await Promise.all([
    loadAiThreadListForUser(userId),
    getAiUsageForUser(
      userId,
      access.chatLimit,
      access.chatQuotaPeriodDays,
      access.chatQuotaPeriodLabel
    ),
    startNewThread
      ? Promise.resolve(null)
      : requestedThreadId
      ? loadAiThreadForUser(userId, requestedThreadId)
      : loadLatestAiThreadForUser(userId),
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
      initialMessages={sanitizeAiMessagesForAccess(thread?.messages ?? [], access.plan)}
      initialThreadId={thread?.threadId ?? null}
      initialThreads={threadList}
      nextUpcomingRound={nextUpcomingRound}
      tools={AI_TOOL_DEFINITIONS}
    />
  );
}

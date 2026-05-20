import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import type { AiPlan } from "@/lib/ai/access";
import { canViewAiRuntimeMetadata, hasAiBettingModelAccess, hasAiPlotAccess } from "@/lib/ai/access";
import type { AiChartArtifact, AiToolActivity } from "@/lib/ai/openai";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const MAX_THREAD_TITLE_LENGTH = 80;
const MAX_THREAD_LIST_ITEMS = 20;
export const MY_TEAM_AI_PROMPT_PREFIX = "My Team NRL Fantasy AI request.";

export interface AiChoiceOption {
  label: string;
  action: string;
  description?: string;
  payload?: Record<string, unknown>;
}

export interface AiUsageSummary {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AiPersistedMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  toolActivity: AiToolActivity[];
  model: string | null;
  usage: AiUsageSummary | null;
  choices: AiChoiceOption[];
  artifacts: AiChartArtifact[];
  createdAt: string;
}

export interface AiThreadSnapshot {
  threadId: string;
  title: string | null;
  messages: AiPersistedMessage[];
}

export interface AiThreadListItem {
  threadId: string;
  title: string | null;
  lastMessageAt: string;
}

export interface AiDailyUsageSnapshot {
  chatLimit: number | null;
  quotaPeriodLabel: string;
  usedInPeriod: number;
  remainingInPeriod: number | null;
  trackingAvailable: boolean;
}

interface AiThreadRow {
  id: string;
  title: string | null;
  last_message_at?: string;
}

interface AiMessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  tool_activity: unknown;
  model: string | null;
  usage: unknown;
  choices: unknown;
  artifacts: unknown;
  created_at: string;
}

interface SaveAiAssistantMessageArgs {
  userId: string | null | undefined;
  threadId: string | null;
  threadTitle?: string | null;
  userMessage: string;
  assistantMessage: string;
  toolActivity: AiToolActivity[];
  model: string | null;
  usage: AiUsageSummary | null;
  choices?: AiChoiceOption[];
  artifacts?: AiChartArtifact[];
}

function getAiSupabaseClient() {
  return createServerSupabaseClient("shortside");
}

function isKnownPersistenceError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network error") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("etimedout") ||
    normalized.includes("relation") ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("permission denied")
  );
}

function buildThreadTitle(message: string): string {
  const compact = message.trim().replace(/\s+/g, " ");
  return compact.length <= MAX_THREAD_TITLE_LENGTH
    ? compact
    : `${compact.slice(0, MAX_THREAD_TITLE_LENGTH - 1)}…`;
}

function isUsageSummary(value: unknown): value is AiUsageSummary {
  return typeof value === "object" && value !== null;
}

function toToolActivity(value: unknown): AiToolActivity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as Record<string, unknown>;
      return {
        toolName: typeof record.toolName === "string" ? record.toolName : "unknown_tool",
        arguments:
          typeof record.arguments === "object" && record.arguments !== null && !Array.isArray(record.arguments)
            ? (record.arguments as Record<string, unknown>)
            : null,
        ok: Boolean(record.ok),
        summary: typeof record.summary === "string" ? record.summary : "",
      };
    })
    .filter((entry): entry is AiToolActivity => entry !== null);
}

function toChoices(value: unknown): AiChoiceOption[] {
  if (!Array.isArray(value)) return [];
  const choices: AiChoiceOption[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "object" || entry === null) return;
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : null;
    const action = typeof record.action === "string" ? record.action : null;
    if (!label || !action) return;

    choices.push({
      label,
      action,
      description: typeof record.description === "string" ? record.description : undefined,
      payload:
        typeof record.payload === "object" && record.payload !== null && !Array.isArray(record.payload)
          ? (record.payload as Record<string, unknown>)
          : undefined,
    });
  });

  return choices;
}

function toUsage(value: unknown): AiUsageSummary | null {
  if (!isUsageSummary(value)) return null;
  const record = value as unknown as Record<string, unknown>;
  return {
    inputTokens: typeof record.inputTokens === "number" ? record.inputTokens : null,
    outputTokens: typeof record.outputTokens === "number" ? record.outputTokens : null,
    totalTokens: typeof record.totalTokens === "number" ? record.totalTokens : null,
  };
}

function toArtifacts(value: unknown): AiChartArtifact[] {
  if (!Array.isArray(value)) return [];
  const artifacts: AiChartArtifact[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "object" || entry === null) return;
    const record = entry as Record<string, unknown>;
    if (record.type !== "line-chart") return;
    if (typeof record.title !== "string" || typeof record.yLabel !== "string") return;
    if (!Array.isArray(record.points)) return;

    const points = record.points
      .map((point) => {
        if (typeof point !== "object" || point === null) return null;
        const pointRecord = point as Record<string, unknown>;
        if (typeof pointRecord.x !== "string" || typeof pointRecord.y !== "number") return null;
        return { x: pointRecord.x, y: pointRecord.y };
      })
      .filter((point): point is { x: string; y: number } => point !== null);

    artifacts.push({
      type: "line-chart",
      title: record.title,
      subtitle: typeof record.subtitle === "string" ? record.subtitle : undefined,
      yLabel: record.yLabel,
      points,
    });
  });

  return artifacts;
}

function mapMessageRow(row: AiMessageRow): AiPersistedMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    toolActivity: toToolActivity(row.tool_activity),
    model: row.model,
    usage: toUsage(row.usage),
    choices: toChoices(row.choices),
    artifacts: toArtifacts(row.artifacts),
    createdAt: row.created_at,
  };
}

function buildAiThreadAccessMessage(plan: AiPlan): string {
  if (plan === "free") {
    return "This saved reply used Pro or Premium AI data and is locked on the Free tier.";
  }

  return "This saved reply used AI data that is locked on your current tier.";
}

function isMessageRestrictedForPlan(message: AiPersistedMessage, plan: AiPlan): boolean {
  if (message.role !== "assistant") return false;

  if (message.artifacts.length > 0 && !hasAiPlotAccess(plan)) {
    return true;
  }

  return message.toolActivity.some((activity) => {
    if (activity.toolName === "get_betting_snapshot") {
      return !hasAiBettingModelAccess(plan);
    }

    if (activity.toolName === "get_fantasy_snapshot") {
      return plan === "free";
    }

    return false;
  });
}

export function sanitizeAiMessagesForAccess(
  messages: AiPersistedMessage[],
  plan: AiPlan
): AiPersistedMessage[] {
  return messages.flatMap((message) => {
    const runtimeMetadataVisible = canViewAiRuntimeMetadata(plan);

    if (isMessageRestrictedForPlan(message, plan)) {
      if (plan === "free") {
        return [];
      }

      return {
        ...message,
        content: buildAiThreadAccessMessage(plan),
        toolActivity: [],
        model: null,
        usage: null,
        choices: [],
        artifacts: [],
      };
    }

    return [{
      ...message,
      model: runtimeMetadataVisible ? message.model : null,
      usage: runtimeMetadataVisible ? message.usage : null,
    }];
  });
}

function getUtcUsageRange(now: Date, periodDays: number) {
  const end = new Date(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, periodDays));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

async function findThreadForUser(userId: string, threadId: string): Promise<AiThreadRow | null> {
  try {
    const supabase = getAiSupabaseClient();
    const { data, error } = await supabase
      .from("ai_threads")
      .select("id,title")
      .eq("id", threadId)
      .eq("clerk_user_id", userId)
      .maybeSingle<AiThreadRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI thread lookup unavailable.", message);
      return null;
    }

    throw error;
  }
}

export async function ensureAiThreadForUser(
  userId: string | null | undefined,
  requestedThreadId: string | null | undefined,
  titleSeed: string
): Promise<string | null> {
  if (!userId) return null;

  try {
    if (requestedThreadId) {
      const existingThread = await findThreadForUser(userId, requestedThreadId);
      if (existingThread) {
        return existingThread.id;
      }
    }

    const supabase = getAiSupabaseClient();
    const { data, error } = await supabase
      .from("ai_threads")
      .insert({
        clerk_user_id: userId,
        title: buildThreadTitle(titleSeed),
      })
      .select("id")
      .single<{ id: string }>();

    if (error) {
      throw new Error(error.message);
    }

    return data.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI thread persistence unavailable.", message);
      return null;
    }

    throw error;
  }
}

export async function loadLatestAiThreadForUser(
  userId: string | null | undefined
): Promise<AiThreadSnapshot | null> {
  if (!userId) return null;

  try {
    const supabase = getAiSupabaseClient();
    const { data: thread, error: threadError } = await supabase
      .from("ai_threads")
      .select("id,title")
      .eq("clerk_user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle<AiThreadRow>();

    if (threadError) {
      throw new Error(threadError.message);
    }

    return thread ? loadAiThreadForUser(userId, thread.id) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI thread history unavailable.", message);
      return null;
    }

    throw error;
  }
}

export async function loadAiThreadListForUser(
  userId: string | null | undefined
): Promise<AiThreadListItem[]> {
  if (!userId) return [];

  try {
    const supabase = getAiSupabaseClient();
    const { data, error } = await supabase
      .from("ai_threads")
      .select("id,title,last_message_at")
      .eq("clerk_user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(MAX_THREAD_LIST_ITEMS)
      .returns<AiThreadRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => ({
      threadId: row.id,
      title: row.title,
      lastMessageAt: typeof row.last_message_at === "string" ? row.last_message_at : "",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("AI thread list unavailable.", message);
    return [];
  }
}

export async function loadAiThreadForUser(
  userId: string | null | undefined,
  threadId: string | null | undefined
): Promise<AiThreadSnapshot | null> {
  if (!userId || !threadId) return null;

  try {
    const thread = await findThreadForUser(userId, threadId);
    if (!thread) {
      return null;
    }

    const supabase = getAiSupabaseClient();
    const { data: messageRows, error: messageError } = await supabase
      .from("ai_messages")
      .select("id,thread_id,role,content,tool_activity,model,usage,choices,artifacts,created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .returns<AiMessageRow[]>();

    if (messageError) {
      throw new Error(messageError.message);
    }

    return {
      threadId: thread.id,
      title: thread.title,
      messages: (messageRows ?? []).map(mapMessageRow),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI thread history unavailable.", message);
      return null;
    }

    throw error;
  }
}

export async function deleteAiThreadForUser(
  userId: string | null | undefined,
  threadId: string | null | undefined
): Promise<boolean> {
  if (!userId || !threadId) return false;

  try {
    const thread = await findThreadForUser(userId, threadId);
    if (!thread) {
      return false;
    }

    const supabase = getAiSupabaseClient();
    const { error: messageError } = await supabase
      .from("ai_messages")
      .delete()
      .eq("thread_id", thread.id);

    if (messageError) {
      throw new Error(messageError.message);
    }

    const { error: threadError } = await supabase
      .from("ai_threads")
      .delete()
      .eq("id", thread.id)
      .eq("clerk_user_id", userId);

    if (threadError) {
      throw new Error(threadError.message);
    }

    revalidateTag(`ai-usage-${userId}`, "max");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI thread deletion unavailable.", message);
      return false;
    }

    throw error;
  }
}

async function countAiMessagesForUserUncached(
  userId: string,
  startIso: string,
  endIso: string
): Promise<number> {
  const supabase = getAiSupabaseClient();
  const { count, error } = await supabase
    .from("ai_messages")
    .select("id,ai_threads!inner(clerk_user_id)", { count: "exact", head: true })
    .eq("role", "user")
    .eq("ai_threads.clerk_user_id", userId)
    .not("content", "like", `${MY_TEAM_AI_PROMPT_PREFIX}%`)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countAiMessagesForUserByPrefixUncached(
  userId: string,
  startIso: string,
  endIso: string,
  messagePrefix: string
): Promise<number> {
  const supabase = getAiSupabaseClient();
  const { count, error } = await supabase
    .from("ai_messages")
    .select("id,ai_threads!inner(clerk_user_id)", { count: "exact", head: true })
    .eq("role", "user")
    .eq("ai_threads.clerk_user_id", userId)
    .like("content", `${messagePrefix}%`)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Cache per-user usage count for 60 seconds — avoids a JOIN query on every AI page load and chat call.
function getCachedAiMessageCount(userId: string, startIso: string, endIso: string) {
  return unstable_cache(
    () => countAiMessagesForUserUncached(userId, startIso, endIso),
    [`ai-usage-${userId}-${startIso}`],
    { revalidate: 60, tags: [`ai-usage-${userId}`] }
  )();
}

function getCachedAiMessageCountByPrefix(
  userId: string,
  startIso: string,
  endIso: string,
  messagePrefix: string
) {
  return unstable_cache(
    () => countAiMessagesForUserByPrefixUncached(userId, startIso, endIso, messagePrefix),
    [`ai-usage-prefix-${userId}-${startIso}-${messagePrefix}`],
    { revalidate: 60, tags: [`ai-usage-${userId}`] }
  )();
}

export async function getAiUsageForUser(
  userId: string | null | undefined,
  chatLimit: number | null,
  quotaPeriodDays: number,
  quotaPeriodLabel: string
): Promise<AiDailyUsageSnapshot> {
  if (!userId) {
    return {
      chatLimit,
      quotaPeriodLabel,
      usedInPeriod: 0,
      remainingInPeriod: chatLimit,
      trackingAvailable: true,
    };
  }

  try {
    const { startIso, endIso } = getUtcUsageRange(new Date(), quotaPeriodDays);
    const usedInPeriod = await getCachedAiMessageCount(userId, startIso, endIso);

    return {
      chatLimit,
      quotaPeriodLabel,
      usedInPeriod,
      remainingInPeriod:
        chatLimit == null ? null : Math.max(chatLimit - usedInPeriod, 0),
      trackingAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI usage counter unavailable.", message);
      return {
        chatLimit,
        quotaPeriodLabel,
        usedInPeriod: 0,
        remainingInPeriod: chatLimit,
        trackingAvailable: false,
      };
    }

    throw error;
  }
}

export async function getAiUsageForUserByMessagePrefix(
  userId: string | null | undefined,
  messagePrefix: string,
  chatLimit: number,
  quotaPeriodDays: number,
  quotaPeriodLabel: string
): Promise<AiDailyUsageSnapshot> {
  if (!userId) {
    return {
      chatLimit,
      quotaPeriodLabel,
      usedInPeriod: 0,
      remainingInPeriod: chatLimit,
      trackingAvailable: true,
    };
  }

  try {
    const { startIso, endIso } = getUtcUsageRange(new Date(), quotaPeriodDays);
    const usedInPeriod = await getCachedAiMessageCountByPrefix(userId, startIso, endIso, messagePrefix);

    return {
      chatLimit,
      quotaPeriodLabel,
      usedInPeriod,
      remainingInPeriod: Math.max(chatLimit - usedInPeriod, 0),
      trackingAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI prefixed usage counter unavailable.", message);
      return {
        chatLimit,
        quotaPeriodLabel,
        usedInPeriod: 0,
        remainingInPeriod: chatLimit,
        trackingAvailable: false,
      };
    }

    throw error;
  }
}

export async function saveAiAssistantTurn({
  userId,
  threadId,
  threadTitle,
  userMessage,
  assistantMessage,
  toolActivity,
  model,
  usage,
  choices = [],
  artifacts = [],
}: SaveAiAssistantMessageArgs): Promise<void> {
  if (!userId || !threadId) return;

  try {
    const supabase = getAiSupabaseClient();
    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabase.from("ai_messages").insert([
      {
        thread_id: threadId,
        role: "user",
        content: userMessage,
      },
      {
        thread_id: threadId,
        role: "assistant",
        content: assistantMessage,
        tool_activity: toolActivity,
        model,
        usage,
        choices,
        artifacts,
      },
    ]);

    if (insertError) {
      throw new Error(insertError.message);
    }

    const { error: updateError } = await supabase
      .from("ai_threads")
      .update({
        ...(threadTitle ? { title: buildThreadTitle(threadTitle) } : {}),
        last_message_at: nowIso,
      })
      .eq("id", threadId)
      .eq("clerk_user_id", userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Bust the per-user usage cache so the next page load reflects the new message.
    revalidateTag(`ai-usage-${userId}`, "max");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isKnownPersistenceError(message)) {
      console.warn("AI message persistence unavailable.", message);
      return;
    }

    throw error;
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canViewAiRuntimeMetadata, getServerAiAccess } from "@/lib/ai/access";
import {
  type AiChoiceOption,
  ensureAiThreadForUser,
  getAiUsageForUser,
  loadAiThreadForUser,
  saveAiAssistantTurn,
  sanitizeAiMessagesForAccess,
} from "@/lib/ai/persistence";
import { AI_TOOL_DEFINITIONS, executeAiTool } from "@/lib/ai/tools";
import {
  generateAiThreadSummary,
  isAiLocalFallbackEnabled,
  isOpenAiConfigured,
  runAiModelChat,
  type AiImageAttachmentInput,
} from "@/lib/ai/openai";

interface AiChatRequestBody {
  message?: string;
  threadId?: string;
  history?: Array<{
    role?: string;
    content?: string;
    artifacts?: unknown;
  }>;
  toolName?: string;
  toolInput?: unknown;
  imageAttachments?: Array<{
    name?: string;
    context?: string;
    mediaType?: string;
    dataUrl?: string;
  }>;
}

interface AiChatApiResponse {
  status: string;
  threadId?: string | null;
  threadTitle?: string | null;
  plan: "free" | "pro" | "premium";
  chatLimit: number | null;
  chatQuotaPeriodLabel: string;
  chatsUsed?: number;
  chatsRemaining?: number | null;
  usageTrackingAvailable?: boolean;
  submittedMessage: string;
  assistantMessage: string;
  guardrails: string[];
  toolActivity?: unknown;
  artifacts?: unknown;
  choices?: AiChoiceOption[];
  model?: string | null;
  usage?: unknown;
  availableTools: Array<{ name: string; description: string }>;
}

type RequestHistoryArtifact = {
  type: "line-chart";
  title: string;
  subtitle?: string;
  yLabel: string;
  points: Array<{ x: string; y: number }>;
};

type RequestHistoryEntry = {
  role: "user" | "assistant";
  content: string;
  artifacts: RequestHistoryArtifact[];
};

export const dynamic = "force-dynamic";

const AI_GUARDRAILS = [
  "Do not send large raw datasets to the model.",
  "Use internal tool calls to design and run bounded queries inside the app.",
  "Return summaries, tables, and chart specs instead of oversized row dumps.",
];

const AI_AUDIT_PREFIX = "[ai-audit]";

function truncateForAudit(text: string, maxLength = 160): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

function getAiRestrictionReason(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("sign up to pro to access projections and breakevens")) {
    return "pro_projection_gate";
  }

  if (
    normalized.includes("sign up to pro to access model predictions and total/line odds") ||
    normalized.includes("sign up to premium to access model predictions and total/line odds") ||
    normalized.includes("sign up to premium to access model predictions")
  ) {
    return "premium_betting_gate";
  }

  if (normalized.includes("sign up to pro to access ai plots and charts")) {
    return "pro_plot_gate";
  }

  if (normalized.includes("this player data is not available in the current ai tier")) {
    return "player_data_tier_gate";
  }

  return null;
}

function logAiAuditEvent(
  event: string,
  payload: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info"
) {
  console[level](
    `${AI_AUDIT_PREFIX} ${JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })}`
  );
}

function buildToolActivityAuditSummary(
  toolActivity: Array<{
    toolName: string;
    ok: boolean;
    summary: string;
  }>
) {
  const failedTools = toolActivity
    .filter((activity) => !activity.ok)
    .map((activity) => ({
      toolName: activity.toolName,
      summary: truncateForAudit(activity.summary, 120),
      restrictionReason: getAiRestrictionReason(activity.summary),
    }));

  return {
    toolCount: toolActivity.length,
    failedToolCount: failedTools.length,
    restrictedToolAttemptCount: failedTools.filter((activity) => activity.restrictionReason !== null).length,
    failedTools,
  };
}

function isClarificationAssistantMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return false;

  const fixedClarificationPrompts = [
    "which kicking metric should i use: kicks, kicking metres, or bomb kicks?",
    "what comparison should i use for this year: last year, the last 2 years average, or career average?",
    "which fantasy lens should i use: ownership delta, price/value, or projection and breakeven?",
    "what should i plot: which player or team, and which stat should i use?",
    "which exact players or teams should i compare, and which stats should i use?",
    "which exact stat should i use, and what comparison period should i use?",
    "what exact metric, entity, or comparison period should i use so i can query the right internal data tool?",
  ];

  if (fixedClarificationPrompts.includes(normalized)) {
    return true;
  }

  if (
    normalized.startsWith("i should use the fantasy stat from the player game log.") &&
    normalized.includes("tell me the exact seasons")
  ) {
    return true;
  }

  return (
    normalized.endsWith("?") &&
    /^(which|what|who|when|where|should i|do you want|do you mean)\b/.test(normalized)
  );
}

function countAssistantClarificationTurns(
  history: Array<{ role: "user" | "assistant"; content: string }>
): number {
  return history.filter(
    (entry) => entry.role === "assistant" && isClarificationAssistantMessage(entry.content)
  ).length;
}

function toRequestHistory(
  value: AiChatRequestBody["history"]
): RequestHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const role: RequestHistoryEntry["role"] | null =
        entry?.role === "user" || entry?.role === "assistant" ? entry.role : null;
      const content = typeof entry?.content === "string" ? entry.content : null;
      if (!role || !content) return null;

      const artifacts: RequestHistoryArtifact[] = [];
      if (Array.isArray(entry.artifacts)) {
        for (const artifact of entry.artifacts) {
          if (typeof artifact !== "object" || artifact === null) continue;
          const record = artifact as Record<string, unknown>;
          if (
            record.type !== "line-chart" ||
            typeof record.title !== "string" ||
            typeof record.yLabel !== "string" ||
            !Array.isArray(record.points)
          ) {
            continue;
          }

          const points = record.points
            .map((point) => {
              if (typeof point !== "object" || point === null) return null;
              const pointRecord = point as Record<string, unknown>;
              return typeof pointRecord.x === "string" && typeof pointRecord.y === "number"
                ? { x: pointRecord.x, y: pointRecord.y }
                : null;
            })
            .filter((point): point is { x: string; y: number } => point !== null);

          artifacts.push({
            type: "line-chart",
            title: record.title,
            subtitle: typeof record.subtitle === "string" ? record.subtitle : undefined,
            yLabel: record.yLabel,
            points,
          });
        }
      }

      return { role, content, artifacts } satisfies RequestHistoryEntry;
    })
    .filter((entry): entry is RequestHistoryEntry => entry !== null);
}

function toImageAttachments(value: AiChatRequestBody["imageAttachments"]): AiImageAttachmentInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 3)
    .map((attachment, index) => {
      const name =
        typeof attachment?.name === "string" && attachment.name.trim()
          ? attachment.name.trim().slice(0, 80)
          : `screenshot-${index + 1}`;
      const mediaType = attachment?.mediaType;
      const dataUrl = attachment?.dataUrl;

      if (
        mediaType !== "image/jpeg" &&
        mediaType !== "image/png" &&
        mediaType !== "image/webp"
      ) {
        return null;
      }

      if (
        typeof dataUrl !== "string" ||
        !dataUrl.startsWith(`data:${mediaType};base64,`) ||
        dataUrl.length > 6_500_000
      ) {
        return null;
      }

      const context = attachment?.context === "betting" ? "betting" : "fantasy";

      return { name, context, mediaType, dataUrl } satisfies AiImageAttachmentInput;
    })
    .filter((attachment): attachment is AiImageAttachmentInput => attachment !== null);
}

function mergeThreadHistory(
  persistedHistory: Array<{
    role: "user" | "assistant";
    content: string;
    artifacts: Array<{
      type: "line-chart";
      title: string;
      subtitle?: string;
      yLabel: string;
      points: Array<{ x: string; y: number }>;
    }>;
  }>,
  requestHistory: Array<{
    role: "user" | "assistant";
    content: string;
    artifacts: Array<{
      type: "line-chart";
      title: string;
      subtitle?: string;
      yLabel: string;
      points: Array<{ x: string; y: number }>;
    }>;
  }>
) {
  if (persistedHistory.length === 0) return requestHistory;
  if (requestHistory.length === 0) return persistedHistory;

  const merged = [...persistedHistory];
  const persistedKeys = new Set(
    persistedHistory.map((entry) => `${entry.role}::${entry.content}::${JSON.stringify(entry.artifacts)}`)
  );

  requestHistory.forEach((entry) => {
    const key = `${entry.role}::${entry.content}::${JSON.stringify(entry.artifacts)}`;
    if (!persistedKeys.has(key)) {
      merged.push(entry);
    }
  });

  return merged;
}

function buildQuotaMessage(
  plan: AiChatApiResponse["plan"],
  chatLimit: number | null,
  periodLabel: string
): string {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  if (chatLimit == null) {
    return `${planLabel} AI access is currently unavailable for additional messages.`;
  }

  return `You have reached the ${planLabel} AI limit of ${chatLimit} message${chatLimit === 1 ? "" : "s"} per ${periodLabel}.`;
}

function buildUsageTrackingMessage(): string {
  return "AI message usage tracking is not available right now, so plan-based message limits cannot be enforced safely.";
}

function isTransientAiProviderError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("temporary processing error") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("an error occurred while processing your request") ||
    normalized.includes("request id req_")
  );
}

function sanitizeRuntimeMetadataForPlan<T extends { model?: string | null; usage?: unknown }>(
  payload: T,
  plan: AiChatApiResponse["plan"]
): T {
  if (canViewAiRuntimeMetadata(plan)) {
    return payload;
  }

  return {
    ...payload,
    model: null,
    usage: null,
  };
}

function getYearsFromToolActivity(toolActivity: Array<{ arguments: Record<string, unknown> | null }>): string[] | null {
  for (const activity of toolActivity) {
    const years = activity.arguments?.years;
    if (Array.isArray(years)) {
      const normalized = years.filter((year): year is string => typeof year === "string");
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
}

function getSeasonPhrase(
  userMessage: string,
  toolActivity: Array<{ arguments: Record<string, unknown> | null }>
): string {
  if (/\bthis season\b/i.test(userMessage)) {
    return "this season";
  }

  const years = getYearsFromToolActivity(toolActivity);
  if (!years || years.length === 0) {
    return "";
  }

  if (years.length === 1) {
    return `in ${years[0]}`;
  }

  return `from ${years[0]} to ${years[years.length - 1]}`;
}

function buildFollowUpChoices(
  userMessage: string,
  toolActivity: Array<{
    toolName: string;
    ok: boolean;
    arguments: Record<string, unknown> | null;
  }>
): AiChoiceOption[] {
  const successfulTools = toolActivity.filter((activity) => activity.ok);
  const toolNames = new Set(successfulTools.map((activity) => activity.toolName));
  const seasonPhrase = getSeasonPhrase(userMessage, successfulTools);
  const seasonSuffix = seasonPhrase ? ` ${seasonPhrase}` : "";

  if (toolNames.has("get_team_short_turnaround_records")) {
    const recordTool = successfulTools.find((activity) => activity.toolName === "get_team_short_turnaround_records");
    const maxDaysValue = recordTool?.arguments?.maxDays;
    const maxDays = typeof maxDaysValue === "number" && Number.isFinite(maxDaysValue) ? Math.trunc(maxDaysValue) : 6;

    return [
      {
        label: "Best Record",
        action: "submit_prompt",
        description: "Flip the ranking to the best teams on short turnarounds.",
        payload: {
          message: `Which teams have the best record when playing on short turnarounds of ${maxDays} days or fewer${seasonSuffix}?`,
        },
      },
      {
        label: "Min 2 Games",
        action: "submit_prompt",
        description: "Filter out teams with only one short-turnaround game.",
        payload: {
          message: `Which teams have the worst record when playing on short turnarounds of ${maxDays} days or fewer${seasonSuffix}, among teams with at least 2 such games?`,
        },
      },
      {
        label: "Show Samples",
        action: "submit_prompt",
        description: "List the actual short-turnaround games behind the ranking.",
        payload: {
          message: `Show the short-turnaround games and results for those teams${seasonSuffix}.`,
        },
      },
    ];
  }

  if (toolNames.has("get_team_home_away_win_rates")) {
    return [
      {
        label: "Best Gap",
        action: "submit_prompt",
        description: "Flip the ranking to the biggest positive split.",
        payload: {
          message: `Which teams have the biggest home vs away win-rate difference${seasonSuffix}?`,
        },
      },
      {
        label: "Smallest Gap",
        action: "submit_prompt",
        description: "See which teams perform most similarly home and away.",
        payload: {
          message: `Which teams have the smallest home vs away win-rate difference${seasonSuffix}?`,
        },
      },
      {
        label: "Show Records",
        action: "submit_prompt",
        description: "List the underlying home and away records and win rates.",
        payload: {
          message: `Show the home and away records and win rates for those teams${seasonSuffix}.`,
        },
      },
    ];
  }

  return [];
}

export async function POST(request: Request) {
  const { userId } = await auth();
  const access = await getServerAiAccess(userId);
  const usage = await getAiUsageForUser(
    userId,
    access.chatLimit,
    access.chatQuotaPeriodDays,
    access.chatQuotaPeriodLabel
  );
  const body = (await request.json().catch(() => ({}))) as AiChatRequestBody;
  const requestStartedAt = Date.now();
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const requestedThreadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const requestHistory = toRequestHistory(body.history);
  const imageAttachments = toImageAttachments(body.imageAttachments);
  const toolName = typeof body.toolName === "string" ? body.toolName.trim() : "";

  if (toolName) {
    const result = await executeAiTool(toolName, body.toolInput, { plan: access.plan });
    const restrictionReason = !result.ok ? getAiRestrictionReason(result.error) : null;
    logAiAuditEvent(
      restrictionReason ? "ai_tool_restricted" : "ai_tool_invocation",
      {
        userId,
        plan: access.plan,
        toolName,
        ok: result.ok,
        durationMs: Date.now() - requestStartedAt,
        restrictionReason,
        error: !result.ok ? truncateForAudit(result.error, 160) : null,
      },
      restrictionReason || !result.ok ? "warn" : "info"
    );

    return NextResponse.json(
      {
        status: result.ok ? "tool_result" : "tool_error",
        plan: access.plan,
        chatLimit: access.chatLimit,
        chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
        chatsUsed: usage.usedInPeriod,
        chatsRemaining: usage.remainingInPeriod,
        usageTrackingAvailable: usage.trackingAvailable,
        submittedMessage: message,
        toolName,
        result,
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: result.ok ? 200 : 400 }
    );
  }

  if (!message) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error: "A message is required.",
      },
      { status: 400 }
    );
  }

  if (Array.isArray(body.imageAttachments) && body.imageAttachments.length > 0 && imageAttachments.length === 0) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error: "Upload up to 3 PNG, JPEG, or WebP screenshots under 6.5 MB each.",
      },
      { status: 400 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      {
        status: "unauthorized",
        plan: access.plan,
        chatLimit: access.chatLimit,
        chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
        chatsUsed: usage.usedInPeriod,
        chatsRemaining: usage.remainingInPeriod,
        usageTrackingAvailable: usage.trackingAvailable,
        submittedMessage: message,
        assistantMessage: "Sign in to use AI chat.",
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: 401 }
    );
  }

  if (access.chatLimit != null && usage.usedInPeriod >= access.chatLimit) {
    logAiAuditEvent("ai_quota_exceeded", {
      userId,
      plan: access.plan,
      usedInPeriod: usage.usedInPeriod,
      chatLimit: access.chatLimit,
    }, "warn");
    return NextResponse.json(
      {
        status: "quota_exceeded",
        plan: access.plan,
        chatLimit: access.chatLimit,
        chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
        chatsUsed: usage.usedInPeriod,
        chatsRemaining: usage.remainingInPeriod,
        usageTrackingAvailable: usage.trackingAvailable,
        submittedMessage: message,
        assistantMessage: buildQuotaMessage(access.plan, access.chatLimit, access.chatQuotaPeriodLabel),
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: 429 }
    );
  }

  if (access.chatLimit != null && !usage.trackingAvailable) {
    logAiAuditEvent("ai_usage_tracking_unavailable", {
      userId,
      plan: access.plan,
      chatLimit: access.chatLimit,
    }, "warn");
    return NextResponse.json(
      {
        status: "usage_unavailable",
        plan: access.plan,
        chatLimit: access.chatLimit,
        chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
        chatsUsed: usage.usedInPeriod,
        chatsRemaining: usage.remainingInPeriod,
        usageTrackingAvailable: usage.trackingAvailable,
        submittedMessage: message,
        assistantMessage: buildUsageTrackingMessage(),
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: 503 }
    );
  }

  if (!isOpenAiConfigured() && !isAiLocalFallbackEnabled()) {
    return NextResponse.json(
      {
        status: "not_configured",
        plan: access.plan,
        chatLimit: access.chatLimit,
        chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
        chatsUsed: usage.usedInPeriod,
        chatsRemaining: usage.remainingInPeriod,
        usageTrackingAvailable: usage.trackingAvailable,
        submittedMessage: message,
        assistantMessage:
          "The AI route is live, but OPENAI_API_KEY is not configured on the server yet.",
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: 503 }
    );
  }

  try {
    const existingThread = requestedThreadId
      ? await loadAiThreadForUser(userId, requestedThreadId)
      : null;
    const visibleThreadMessages = sanitizeAiMessagesForAccess(existingThread?.messages ?? [], access.plan);
    const history = mergeThreadHistory(
      visibleThreadMessages.map((entry) => ({
        role: entry.role,
        content: entry.content,
        artifacts: entry.artifacts,
      })),
      requestHistory
    );
    const clarificationCount = countAssistantClarificationTurns(history);
    const modelResult = await runAiModelChat(message, {
      history,
      access: { plan: access.plan },
      clarificationCount,
      imageInputs: imageAttachments,
    });
    const durationMs = Date.now() - requestStartedAt;
    const toolAuditSummary = buildToolActivityAuditSummary(modelResult.toolActivity);
    const policyRestrictionReason =
      modelResult.model === "policy" ? getAiRestrictionReason(modelResult.assistantMessage) : null;

    if (policyRestrictionReason) {
      logAiAuditEvent("ai_policy_restriction", {
        userId,
        plan: access.plan,
        threadId: requestedThreadId || null,
        clarificationCount,
        durationMs,
        restrictionReason: policyRestrictionReason,
        promptPreview: truncateForAudit(message),
      }, "warn");
    }

    logAiAuditEvent(
      "ai_chat_completed",
      {
        userId,
        plan: access.plan,
        threadId: requestedThreadId || null,
        clarificationCount,
        durationMs,
        model: modelResult.model,
        promptPreview: truncateForAudit(message),
        inputTokens: modelResult.usage.inputTokens,
        outputTokens: modelResult.usage.outputTokens,
        totalTokens: modelResult.usage.totalTokens,
        ...toolAuditSummary,
      },
      toolAuditSummary.failedToolCount > 0 || policyRestrictionReason ? "warn" : "info"
    );

    const choices = buildFollowUpChoices(message, modelResult.toolActivity);
    const continuationThreadId = existingThread?.threadId ?? (requestedThreadId || null);
    const persistedThreadId = await ensureAiThreadForUser(
      userId,
      continuationThreadId,
      message
    );
    const threadTitle = await generateAiThreadSummary(history, message, modelResult.assistantMessage);

    await saveAiAssistantTurn({
      userId,
      threadId: persistedThreadId,
      threadTitle,
      userMessage: message,
      assistantMessage: modelResult.assistantMessage,
      toolActivity: modelResult.toolActivity,
      model: modelResult.model,
      usage: modelResult.usage,
      choices,
      artifacts: modelResult.artifacts,
    });

    return NextResponse.json(sanitizeRuntimeMetadataForPlan({
      status: "completed",
      threadId: persistedThreadId,
      threadTitle,
      plan: access.plan,
      chatLimit: access.chatLimit,
      chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
      chatsUsed: usage.usedInPeriod + 1,
      chatsRemaining:
        access.chatLimit == null ? null : Math.max(access.chatLimit - usage.usedInPeriod - 1, 0),
      usageTrackingAvailable: usage.trackingAvailable,
      submittedMessage: message,
      assistantMessage: modelResult.assistantMessage,
      guardrails: AI_GUARDRAILS,
      toolActivity: modelResult.toolActivity,
      choices,
      artifacts: modelResult.artifacts,
      model: modelResult.model,
      usage: modelResult.usage,
      availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    }, access.plan));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unable to complete the AI request.";
    const isTransientProviderError = isTransientAiProviderError(errorMessage);
    logAiAuditEvent(
      "ai_chat_failed",
      {
        userId,
        plan: access.plan,
        threadId: requestedThreadId || null,
        durationMs: Date.now() - requestStartedAt,
        transientProviderError: isTransientProviderError,
        promptPreview: truncateForAudit(message),
        error: truncateForAudit(errorMessage, 200),
      },
      isTransientProviderError ? "warn" : "error"
    );

    return NextResponse.json(
      {
        status: isTransientProviderError ? "provider_unavailable" : "model_error",
        plan: access.plan,
        chatLimit: access.chatLimit,
        chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
        chatsUsed: usage.usedInPeriod,
        chatsRemaining: usage.remainingInPeriod,
        usageTrackingAvailable: usage.trackingAvailable,
        submittedMessage: message,
        assistantMessage: isTransientProviderError
          ? "The AI provider is temporarily unavailable after retrying. Your request was not saved or counted."
          : errorMessage,
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: isTransientProviderError ? 503 : 502 }
    );
  }
}

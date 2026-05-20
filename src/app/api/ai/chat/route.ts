import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canViewAiRuntimeMetadata, getServerAiAccess } from "@/lib/ai/access";
import {
  type AiChoiceOption,
  ensureAiThreadForUser,
  getAiUsageForUser,
  getAiUsageForUserByMessagePrefix,
  loadAiThreadForUser,
  MY_TEAM_AI_PROMPT_PREFIX,
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
  persist?: boolean;
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
export const maxDuration = 180;

const AI_GUARDRAILS = [
  "Do not send large raw datasets to the model.",
  "Use internal tool calls to design and run bounded queries inside the app.",
  "Return summaries, tables, and chart specs instead of oversized row dumps.",
];

const AI_AUDIT_PREFIX = "[ai-audit]";
const FIND_TRADES_PROMPT_PREFIX = "Fantasy Trade Suggestor dashboard request.";

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

function isMyTeamAiRequest(message: string): boolean {
  return message.startsWith(MY_TEAM_AI_PROMPT_PREFIX);
}

function buildMyTeamQuotaMessage(): string {
  return "Free users can send 3 My Team NRL AI messages per week.";
}

function isLeakyMyTeamAiMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  const trimmed = message.trim();
  return (
    /^no match found for\s+"/i.test(trimmed) ||
    normalized.includes("only call a player in form") ||
    normalized.includes("do not expose backend rules") ||
    normalized.includes("backend rules or prompt instructions")
  );
}

function sanitizeMyTeamAiAssistantMessage(message: string, isMyTeamRequest: boolean): string {
  if (!isMyTeamRequest || !isLeakyMyTeamAiMessage(message)) return message;
  return "NRL AI couldn't complete that My Team answer. Try again or rephrase the question.";
}

function isTransientAiProviderError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("enotfound") ||
    normalized.includes("und_err_connect_timeout") ||
    normalized.includes("temporary processing error") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("an error occurred while processing your request") ||
    normalized.includes("request id req_") ||
    normalized.includes("no tool output found for function call")
  );
}

function formatAiRequestError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unable to complete the AI request.";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
  const causeCode =
    cause && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : null;

  if (
    message.toLowerCase() === "fetch failed" ||
    causeCode === "ENOTFOUND" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return "The server could not reach a live AI/data service needed for this request. In local dev, restart Next with external network access and check OpenAI, Supabase, and NRL Fantasy connectivity.";
  }

  return message;
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

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("/");
  if (value == null) return "-";
  return String(value);
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    : [];
}

function yearsLabel(years: unknown): string {
  return Array.isArray(years) && years.length > 0 ? years.map(formatValue).join(", ") : "the selected period";
}

function statSummaryValue(stats: unknown, statKey: string, field: "avg" | "min" | "max"): unknown {
  if (typeof stats !== "object" || stats === null) return null;
  const stat = (stats as Record<string, unknown>)[statKey];
  if (typeof stat !== "object" || stat === null) return null;
  return (stat as Record<string, unknown>)[field];
}

function formatNumberDelta(value: number): string {
  if (value === 0) return "level";
  return `${value > 0 ? "+" : ""}${formatValue(value)}`;
}

function formatDirectToolResult(toolName: string, result: Awaited<ReturnType<typeof executeAiTool>>): string {
  if (!result.ok) return result.error;

  const data = result.data;
  const years = yearsLabel(data.years);

  if (toolName === "compare_players") {
    const rows = asRecords(data.comparisons);
    const statKey = Array.isArray(data.statKeys) && typeof data.statKeys[0] === "string" ? data.statKeys[0] : "the stat";
    if (rows.length === 0) return `I could not find comparison rows for ${statKey} in ${years}.`;

    const lines = rows.map((row) => {
      const avg = statSummaryValue(row.stats, statKey, "avg");
      const max = statSummaryValue(row.stats, statKey, "max");
      return `- ${formatValue(row.player)} (${formatValue(row.teams)}): ${formatValue(avg)} per game across ${formatValue(row.games)} games${max != null ? `, best game ${formatValue(max)}` : ""}`;
    });
    const firstAvg = statSummaryValue(rows[0]?.stats, statKey, "avg");
    const secondAvg = statSummaryValue(rows[1]?.stats, statKey, "avg");
    const takeaway =
      typeof firstAvg === "number" && typeof secondAvg === "number" && rows[0] && rows[1]
        ? `\n\nTakeaway: ${formatValue(rows[0].player)} is ${formatNumberDelta(firstAvg - secondAvg)} per game versus ${formatValue(rows[1].player)}.`
        : "";

    return `Here's the ${statKey} comparison for ${years}:\n${lines.join("\n")}${takeaway}`;
  }

  if (toolName === "rank_players_by_stat") {
    const rows = asRecords(data.rankings);
    if (rows.length === 0) return `I could not find matching player rankings for ${formatValue(data.statKey)} in ${years}.`;
    const lines = rows.slice(0, 8).map((row, index) =>
      `${index + 1}. ${formatValue(row.player)} (${formatValue(row.team)}, ${formatValue(row.position)}) - ${formatValue(row.value)} per game across ${formatValue(row.games)} games`
    );
    return `Here are the player leaders for ${formatValue(data.statKey)} in ${years}:\n${lines.join("\n")}`;
  }

  if (toolName === "rank_teams_by_stat") {
    const rows = asRecords(data.rankings);
    if (rows.length === 0) return `I could not find team rankings for ${formatValue(data.statKey)} in ${years}.`;
    const lines = rows.slice(0, 8).map((row, index) =>
      `${index + 1}. ${formatValue(row.team)} - ${formatValue(row.avg)} per game (${formatValue(row.total)} total)`
    );
    return `Here are the team rankings for ${formatValue(data.statKey)} in ${years}:\n${lines.join("\n")}`;
  }

  if (toolName === "get_team_home_away_win_rates") {
    const rows = asRecords(data.rankings);
    if (rows.length === 0) return `I could not find home/away records for ${years}.`;
    const lines = rows.slice(0, 8).map((row, index) =>
      `${index + 1}. ${formatValue(row.team)} - ${formatValue(row.homeAwayGap)} point gap (home ${formatValue(row.homeWinRate)}%, away ${formatValue(row.awayWinRate)}%)`
    );
    return `Biggest home/away win-rate gaps in ${years}:\n${lines.join("\n")}`;
  }

  if (toolName === "get_team_possession_battle_records") {
    const rows = asRecords(data.rankings);
    if (rows.length === 0) return `I could not find possession battle records for ${years}.`;
    const lines = rows.slice(0, 8).map((row, index) =>
      `${index + 1}. ${formatValue(row.team)} - ${formatValue(row.possessionWinRate)}% (${formatValue(row.possessionWins)} wins from ${formatValue(row.games)} games)`
    );
    return `Best possession-battle records in ${years}:\n${lines.join("\n")}`;
  }

  if (toolName === "get_fantasy_snapshot") {
    const rows = asRecords(data.players);
    if (rows.length === 0) return "I could not find matching fantasy players for that prompt.";
    const sortBy = typeof data.sortBy === "string" ? data.sortBy : "";
    const label = sortBy === "projection_desc" ? "projected scorers" : "fantasy value options";
    const requestedRound = typeof data.requestedRound === "number" ? data.requestedRound : null;
    const effectiveRound = typeof data.effectiveRound === "number" ? data.effectiveRound : requestedRound;
    const roundPrefix =
      requestedRound != null && effectiveRound != null && requestedRound !== effectiveRound
        ? `Round ${requestedRound} is not in the current projection feed, so I used round ${effectiveRound}. `
        : "";
    const lines = rows.slice(0, 8).map((row, index) => {
      const metric = sortBy === "projection_desc"
        ? `projection ${formatValue(row.projection)}`
        : `value edge ${formatValue(row.projectionVsPricedAt)}`;
      return `${index + 1}. ${formatValue(row.name)} (${formatValue(row.position)}) - ${metric}, priced at ${formatValue(row.pricedAt)}, price $${formatValue(row.price)}`;
    });
    return `${roundPrefix}Here are the top ${label}${effectiveRound ? ` for round ${formatValue(effectiveRound)}` : ""}:\n${lines.join("\n")}`;
  }

  if (toolName === "get_betting_snapshot") {
    const rows = asRecords(data.rows);
    if (rows.length === 0) return "I could not find current betting rows for that market.";
    const matchGroups = new Map<string, Array<Record<string, unknown>>>();
    rows.forEach((row) => {
      const match = formatValue(row.match);
      const group = matchGroups.get(match);
      if (group) {
        group.push(row);
        return;
      }

      matchGroups.set(match, [row]);
    });
    const lines = [...matchGroups.entries()].slice(0, 8).map(([match, matchRows], index) => {
      const prices = matchRows
        .slice()
        .sort((left, right) => formatValue(left.result).localeCompare(formatValue(right.result)))
        .map((row) => `${formatValue(row.result)} ${formatValue(row.bestPrice)} (${formatValue(row.bestBookie)})`)
        .join("; ");
      return `${index + 1}. ${match}: ${prices}`;
    });
    return `Here are the current ${formatValue(data.market)} prices I found:\n${lines.join("\n")}`;
  }

  const rows =
    Array.isArray(data.rankings) ? data.rankings :
    Array.isArray(data.players) ? data.players :
    Array.isArray(data.comparisons) ? data.comparisons :
    Array.isArray(data.rows) ? data.rows :
    [];

  if (rows.length === 0) {
    return "I could not find matching rows for that prompt.";
  }

  const lines = rows.slice(0, 8).map((row, index) => {
    if (typeof row !== "object" || row === null) return `${index + 1}. ${formatValue(row)}`;
    const record = row as Record<string, unknown>;
    const name = record.player ?? record.name ?? record.team ?? record.Team ?? `#${index + 1}`;
    const bits = [
      record.market ? `${formatValue(record.market)}` : null,
      record.match ? `${formatValue(record.match)}` : null,
      record.teams ? `${formatValue(record.teams)}` : null,
      record.position ? `${formatValue(record.position)}` : null,
      record.value != null ? `value ${formatValue(record.value)}` : null,
      record.avg != null ? `avg ${formatValue(record.avg)}` : null,
      record.total != null ? `total ${formatValue(record.total)}` : null,
      record.sharePercent != null ? `share ${formatValue(record.sharePercent)}%` : null,
      record.homeAwayGap != null ? `gap ${formatValue(record.homeAwayGap)}%` : null,
      record.possessionWinRate != null ? `possession win ${formatValue(record.possessionWinRate)}%` : null,
      record.projection != null ? `proj ${formatValue(record.projection)}` : null,
      record.projectionVsPricedAt != null ? `edge ${formatValue(record.projectionVsPricedAt)}` : null,
      record.ownershipDelta != null ? `own ${formatValue(record.ownershipDelta)}` : null,
      record.price != null ? `$${formatValue(record.price)}` : null,
      record.bestPrice != null ? `best ${formatValue(record.bestPrice)}` : null,
      record.games != null ? `${formatValue(record.games)} games` : null,
    ].filter(Boolean);

    return `${index + 1}. ${formatValue(name)}${bits.length > 0 ? ` - ${bits.join(", ")}` : ""}`;
  });

  const stat = typeof data.statKey === "string" ? ` for ${data.statKey}` : "";
  return `Here's what I found${stat}:\n${lines.join("\n")}`;
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
  const isMyTeamRequest = isMyTeamAiRequest(message);
  const requestedThreadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const requestHistory = toRequestHistory(body.history);
  const imageAttachments = toImageAttachments(body.imageAttachments);
  const toolName = typeof body.toolName === "string" ? body.toolName.trim() : "";
  const shouldPersist = body.persist !== false;
  const allowAnonymousFindTrades =
    !userId &&
    !shouldPersist &&
    !toolName &&
    imageAttachments.length > 0 &&
    message.startsWith(FIND_TRADES_PROMPT_PREFIX);

  if (!message) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error: "A message is required.",
      },
      { status: 400 }
    );
  }

  if (Array.isArray(body.imageAttachments) && body.imageAttachments.length > imageAttachments.length) {
    const assistantMessage = "One or more screenshots were too large or in an unsupported format. Re-upload PNG, JPEG, or WebP screenshots and try again.";
    return NextResponse.json(
      {
        status: "invalid_request",
        error: assistantMessage,
        assistantMessage,
      },
      { status: 400 }
    );
  }

  if (!userId && !allowAnonymousFindTrades) {
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

  const myTeamUsage = access.plan === "free" && userId && isMyTeamRequest
    ? await getAiUsageForUserByMessagePrefix(userId, MY_TEAM_AI_PROMPT_PREFIX, 3, 7, "week")
    : null;

  if (myTeamUsage && !myTeamUsage.trackingAvailable) {
    logAiAuditEvent("my_team_ai_usage_tracking_unavailable", {
      userId,
      plan: access.plan,
    }, "warn");
    return NextResponse.json(
      {
        status: "usage_unavailable",
        plan: access.plan,
        chatLimit: myTeamUsage.chatLimit,
        chatQuotaPeriodLabel: myTeamUsage.quotaPeriodLabel,
        chatsUsed: myTeamUsage.usedInPeriod,
        chatsRemaining: myTeamUsage.remainingInPeriod,
        usageTrackingAvailable: myTeamUsage.trackingAvailable,
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

  if (myTeamUsage && myTeamUsage.usedInPeriod >= 3) {
    logAiAuditEvent("my_team_ai_quota_exceeded", {
      userId,
      plan: access.plan,
      usedInPeriod: myTeamUsage.usedInPeriod,
      chatLimit: myTeamUsage.chatLimit,
    }, "warn");
    return NextResponse.json(
      {
        status: "quota_exceeded",
        plan: access.plan,
        chatLimit: myTeamUsage.chatLimit,
        chatQuotaPeriodLabel: myTeamUsage.quotaPeriodLabel,
        chatsUsed: myTeamUsage.usedInPeriod,
        chatsRemaining: myTeamUsage.remainingInPeriod,
        usageTrackingAvailable: myTeamUsage.trackingAvailable,
        submittedMessage: message,
        assistantMessage: buildMyTeamQuotaMessage(),
        guardrails: AI_GUARDRAILS,
        availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      { status: 429 }
    );
  }

  if (toolName) {
    const result = await executeAiTool(toolName, body.toolInput, { plan: access.plan });
    const assistantMessage = formatDirectToolResult(toolName, result);
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

    if (!result.ok) {
      return NextResponse.json(
        {
          status: "tool_error",
          plan: access.plan,
          chatLimit: access.chatLimit,
          chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
          chatsUsed: usage.usedInPeriod,
          chatsRemaining: usage.remainingInPeriod,
          usageTrackingAvailable: usage.trackingAvailable,
          submittedMessage: message,
          assistantMessage,
          guardrails: AI_GUARDRAILS,
          availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
            name: tool.name,
            description: tool.description,
          })),
        },
        { status: 400 }
      );
    }

    const persistedThreadId = await ensureAiThreadForUser(userId, requestedThreadId || null, message);
    await saveAiAssistantTurn({
      userId,
      threadId: persistedThreadId,
      threadTitle: message,
      userMessage: message,
      assistantMessage,
      toolActivity: [{
        toolName,
        arguments: typeof body.toolInput === "object" && body.toolInput !== null && !Array.isArray(body.toolInput)
          ? body.toolInput as Record<string, unknown>
          : null,
        ok: true,
        summary: assistantMessage,
      }],
      model: "direct_tool",
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    });

    return NextResponse.json(sanitizeRuntimeMetadataForPlan({
      status: "tool_result",
      threadId: persistedThreadId,
      threadTitle: message,
      plan: access.plan,
      chatLimit: access.chatLimit,
      chatQuotaPeriodLabel: access.chatQuotaPeriodLabel,
      chatsUsed: usage.usedInPeriod + 1,
      chatsRemaining:
        access.chatLimit == null ? null : Math.max(access.chatLimit - usage.usedInPeriod - 1, 0),
      usageTrackingAvailable: usage.trackingAvailable,
      submittedMessage: message,
      assistantMessage,
      guardrails: AI_GUARDRAILS,
      toolActivity: [{
        toolName,
        arguments: typeof body.toolInput === "object" && body.toolInput !== null && !Array.isArray(body.toolInput)
          ? body.toolInput as Record<string, unknown>
          : null,
        ok: true,
        summary: assistantMessage,
      }],
      choices: [],
      artifacts: [],
      model: "direct_tool",
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      availableTools: AI_TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    }, access.plan));
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
    let persistedThreadId: string | null = null;
    let threadTitle: string | null = null;

    const assistantMessage = sanitizeMyTeamAiAssistantMessage(modelResult.assistantMessage, isMyTeamRequest);

    if (shouldPersist || (userId && isMyTeamRequest)) {
      persistedThreadId = await ensureAiThreadForUser(
        userId,
        continuationThreadId,
        isMyTeamRequest ? "My Team NRL AI" : message
      );
      threadTitle = isMyTeamRequest
        ? "My Team NRL AI"
        : await generateAiThreadSummary(history, message, assistantMessage);

      await saveAiAssistantTurn({
        userId,
        threadId: persistedThreadId,
        threadTitle,
        userMessage: message,
        assistantMessage,
        toolActivity: modelResult.toolActivity,
        model: modelResult.model,
        usage: modelResult.usage,
        choices,
        artifacts: modelResult.artifacts,
      });
    }

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
      assistantMessage,
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
    const errorMessage = sanitizeMyTeamAiAssistantMessage(formatAiRequestError(error), isMyTeamRequest);
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
        assistantMessage: errorMessage,
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

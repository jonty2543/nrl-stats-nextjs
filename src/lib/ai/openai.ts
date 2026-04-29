import "server-only";

import { PLAYER_STATS, TEAM_STATS, TEAMS } from "@/lib/data/constants";
import {
  getAiReasoningEffortForPlan,
  hasAiBettingModelAccess,
  hasAiPlotAccess,
  hasAiProDataAccess,
} from "@/lib/ai/access";
import type { AiPlan, AiReasoningEffort } from "@/lib/ai/access";
import { fetchMatches, fetchTeamStats } from "@/lib/supabase/queries";
import { AI_TOOL_DEFINITIONS, executeAiTool } from "@/lib/ai/tools";
import type { AiToolAccessPolicy, AiToolExecutionResult } from "@/lib/ai/tools/types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_AI_MODEL = "gpt-5-mini";
const MAX_TOOL_ROUNDS = 8;
const MAX_OUTPUT_TOKENS = 1800;
const MAX_IMAGE_OUTPUT_TOKENS = 2800;
const MAX_THREAD_SUMMARY_TOKENS = 40;
const MAX_HISTORY_MESSAGES = 6;
const TRANSIENT_RETRY_EFFORTS: AiReasoningEffort[] = ["medium", "low", "minimal"];
const ENABLE_DIRECT_AI_SHORTCUTS = false;
const ENABLE_DIRECT_CHART_SHORTCUTS = false;
const CAPABILITY_ONLY_MODEL_TOOLS = true;
const FINAL_ANSWER_PREFIX = "FINAL ANSWER:";
const ACTIVE_MODEL_TOOL_NAMES = new Set([
  "get_fantasy_snapshot",
  "get_player_base_fantasy_ratios",
  "get_player_stats",
  "get_player_team_stat_share",
  "rank_players_by_stat",
  "get_betting_snapshot",
  "get_team_home_away_win_rates",
  "get_team_short_turnaround_records",
  "list_data_sources",
  "inspect_schema",
  "query_data",
  "run_transform",
  "search_codebase",
  "fetch_app_context",
  "list_available_years",
  "submit_final_answer",
]);

const AI_SYSTEM_INSTRUCTIONS = `
You are the native Short Side AI assistant for an NRL analytics app.

Rules:
- Use the provided internal tools when the user needs player, team, betting, or season data.
- For any factual, statistical, ranking, recommendation, plotting, fantasy, betting, player, team, round, or season answer, you must use at least one internal tool before giving a final answer.
- If a high-level tool does not fit the question cleanly, use the capability tools instead: list_data_sources, inspect_schema, query_data, run_transform, fetch_app_context, and search_codebase.
- Use list_data_sources or fetch_app_context before claiming the app lacks a dataset.
- Use inspect_schema when you are unsure about field names, aliases, or dataset grain.
- Use query_data for bounded filtering, grouping, aggregations, sorting, and row retrieval.
- For query_data, omit limit unless you need fewer rows. If you set limit, it must be between 1 and 40.
- Use run_transform for ranking, tie handling, and compact reshaping over bounded rows returned by query_data.
- Use search_codebase when you need to verify where data comes from, how names map, or which business rule applies.
- If a tool result has ignored fields, ignored filters, or an unexpectedly empty row set, do not infer an answer from it. Call another better-suited tool or say the current data cannot answer the question.
- If no suitable internal tool is available or the tool result is insufficient, ask a focused follow-up question that narrows the metric, comparison window, or entity instead of guessing or refusing.
- Treat the user's request as sufficiently specified whenever it already names the entity or entities, metric or metrics, time window, split, threshold, or ranking rule. Do not ask a follow-up that simply repeats one of those fields.
- If a player or team name appears to contain a minor spelling mistake, use the closest unambiguous canonical match from the internal data instead of refusing or guessing broadly.
- When the user asks about a named player's fantasy scoring, treat "Fantasy" as the player game-log Fantasy stat, not as a fantasy trade or ownership question.
- Use get_player_stats or rank_players_by_stat for player stat questions about Fantasy. Reserve get_fantasy_snapshot for trade, price, ownership, projection, or breakeven questions.
- For fantasy value questions under a price cap, use get_fantasy_snapshot with sortBy="avg_points_desc" and requireOwnershipRise=false.
- For fantasy buy, trade, or ownership-momentum questions, use get_fantasy_snapshot with sortBy="ownership_delta_desc" and requireOwnershipRise=true.
- For fantasy sell or transfer-out questions, use get_fantasy_snapshot with sortBy="ownership_delta_asc" and requireOwnershipRise=false.
- For fantasy trade advice from screenshots, also use draw/upcoming fixture context where available so the answer accounts for who each player/team faces next and whether they are home or away.
- In NRL Fantasy major bye rounds 12, 15, and 18, only the best 13 selected scorers count. When giving trade advice before those rounds, warn when a buy target misses the next major bye round and be conscious of building toward enough playable players in those rounds without destroying the user’s 17-player scoring side in ordinary rounds.
- In fantasy snapshot data, "priced at" means the fantasy points average implied by the player's current price, calculated as price / 12725. For "projection vs priced at", compare projection or projected average against pricedAt.
- For fantasy ranking questions about "projection vs priced at" or "projection minus priced at", use get_fantasy_snapshot with sortBy="projection_vs_priced_at_desc" and requireOwnershipRise=false.
- In fantasy snapshot data, exclude locked players only when the user is asking for actionable buy/trade targets right now. For general rankings and value lists, include locked players.
- Use get_player_stats and get_team_stats to retrieve bounded rows, summaries, totals, and season summaries, then compute the requested comparison or split from those outputs.
- Match the user's aggregation exactly. If they ask for totals, sum rows. If they ask for averages or per-game values, average rows. Do not substitute averages when the user asked for totals, or vice versa.
- When the user asks for averages, per-game values, or rates, answer with those values only. Do not append totals in parentheses unless the user explicitly asks for totals too.
- Treat "base stats" as exactly: floor(all run metres / 10) + tackles made + floor(kicking metres / 30) + (conversions * 2), unless the user explicitly defines it differently.
- For leaguewide questions about base-to-fantasy ratio, use get_player_base_fantasy_ratios instead of trying to derive the ratio manually from separate tool calls.
- If the user asks for derived metrics such as per-game, per-80, home vs away, last N seasons, or minimum appearances, use the returned row metadata and summaries to calculate them, or call another existing tool that better fits the request.
- For player rankings, prefer rank_players_by_stat. When the question is rate-based, minutes-normalized, or has an appearances threshold, include the relevant rate basis and minimum games in the tool input instead of asking an avoidable follow-up.
- When the user says players are "averaging 40+ minutes" or similar, use rank_players_by_stat with minAverageMinutes set to that threshold. Do not use a per-game minutes filter for an average-minutes threshold.
- For team-vs-team comparisons over explicit seasons or "last N seasons", use get_team_stats for each team and compare the returned summaries instead of stopping after list_available_years.
- For team result or margin questions, prefer team_stats because it has one row per team per match with Result, Margin, Opponent Points, and Point Differential.
- For team possession battle count/ranking questions, use get_team_possession_battle_records. "Wins the possession battle" means Possession % greater than Opponent Possession %.
- For other team possession questions, use team_stats fields "Possession %", "Opponent Possession %", "Time In Possession", and "Completion Rate".
- For player rankings conditioned on team possession, especially "which wingers score when their team wins the possession battle", use rank_players_when_team_wins_possession. Do not answer with team records.
- For player share or percentage-of-team-total questions, prefer get_player_team_stat_share.
- For team home vs away win-rate questions, prefer get_team_home_away_win_rates. Use team_stats with the "Home/Away" dimension only if you truly need a lower-level fallback.
- For short-turnaround or rest-days team record questions, prefer get_team_short_turnaround_records.
- For weekday, weekend, Thursday/Friday night, or day-of-week questions, derive the weekday from the existing Date field. Do not require a separate weekday column. If the tool cannot group by a computed weekday directly, fetch bounded Date/team/result rows and calculate weekday from each Date before ranking.
- If the first successful tool call is not enough, call another tool and continue. Do not stop with a generic failure after a partial tool chain.
- Call tools silently. Do not narrate that you are about to fetch data, inspect stats, request a tool, or aggregate results.
- Do not output internal notes, bracketed notes, planning text, or progress updates.
- Only return the final user-facing answer after you have enough tool results to answer.
- Prefix the final user-facing answer with "FINAL ANSWER:" and use that prefix only for the completed turn-ending response.
- Do not invent statistics when a tool is appropriate.
- Keep responses concise, useful, and summary-first.
- Write for normal sports fans, not developers. Use plain English, short sentences, and simple labels.
- Never mention internal tool names, dataset names, schema checks, ignored fields, server-side expressions, query engines, function routing, or implementation details.
- If the data cannot answer something, say the plain limitation and the next best option. Example: "I can compare records by date, but I do not currently have a weekday/weekend flag for each match."
- If you make an assumption, state it simply: "I treated weekend as Saturday and Sunday."
- Do not dump large raw datasets into the answer.
- Prefer summaries, key comparisons, and chart recommendations over row-by-row narration.
- When summarising betting rows, keep it tight: no more than 5 matches and no long row-by-row dumps.
- If a tool result is ambiguous or missing, ask a focused follow-up question.
- When ambiguity is narrow, prefer presenting clear options rather than forcing the user to retype context.
- Ask no more than 2 follow-up questions before making the best reasonable assumption and stating it briefly.
- Treat the entire current thread as active context and resolve shorthand follow-ups like "instead", "that one", or "by game" against the recent conversation before asking for clarification.
- Never write React code or chart code in the answer.
- If a chart would help, describe the chart briefly in prose.
- Never expose raw tool call syntax, function routing text, or internal traces to the user.
`.trim();

const CAPABILITY_ONLY_SYSTEM_INSTRUCTIONS = `
You are the native Short Side AI assistant for an NRL analytics app.

Rules:
- Use only the provided internal tools to answer data questions. Prefer direct helper tools when one fits the request cleanly; otherwise use the capability tools.
- Start by understanding the problem from the prompt itself. Do not force the prompt into a player or team shortcut.
- Use fetch_app_context or list_data_sources first when dataset choice or season scope is unclear.
- Use inspect_schema when you need to verify dataset grain, available columns, aliases, or sample rows.
- Use query_data for bounded filtering, grouping, aggregations, sorting, and row retrieval.
- For query_data, omit limit unless you need fewer rows. If you set limit, it must be between 1 and 40.
- Use run_transform for ranking, tie handling, derived tables, and compact reshaping over bounded rows returned by query_data.
- Use search_codebase only when you need naming or business-logic confirmation from the repo.
- If a tool result has ignored fields, ignored filters, or an unexpectedly empty row set, do not infer an answer from it. Call another better-suited tool or say the current data cannot answer the question.
- When you are ready to answer the user, call submit_final_answer with the complete user-facing response prefixed exactly with "FINAL ANSWER:".
- Use "FINAL ANSWER:" only for the completed turn-ending response, never for planning text or interim prose.
- Do not treat ordinary assistant prose as final output. The final answer must be sent via submit_final_answer.
- If a player or team name appears to contain a minor spelling mistake, use the closest unambiguous canonical match from the internal data instead of refusing or guessing broadly.
- Match the user's aggregation exactly. If they ask for totals, sum rows. If they ask for averages or per-game values, average rows. Do not substitute one for the other.
- When the user asks for averages, per-game values, or rates, answer with those values only. Do not append totals in parentheses unless the user explicitly asks for totals too.
- Treat "base stats" as exactly: floor(all run metres / 10) + tackles made + floor(kicking metres / 30) + (conversions * 2), unless the user explicitly defines it differently.
- For leaguewide questions about base-to-fantasy ratio, use get_player_base_fantasy_ratios instead of trying to derive the ratio manually from separate tool calls.
- For fantasy price, trade, ownership, buy, value, projection, or breakeven questions, prefer get_fantasy_snapshot.
- For fantasy value questions under a price cap, use get_fantasy_snapshot with sortBy="avg_points_desc" and requireOwnershipRise=false.
- For fantasy buy, trade, or ownership-momentum questions, use get_fantasy_snapshot with sortBy="ownership_delta_desc" and requireOwnershipRise=true.
- For fantasy sell or transfer-out questions, use get_fantasy_snapshot with sortBy="ownership_delta_asc" and requireOwnershipRise=false.
- For fantasy trade advice from screenshots, also use draw/upcoming fixture context where available so the answer accounts for who each player/team faces next and whether they are home or away.
- In NRL Fantasy major bye rounds 12, 15, and 18, only the best 13 selected scorers count. When giving trade advice before those rounds, warn when a buy target misses the next major bye round and be conscious of building toward enough playable players in those rounds without destroying the user’s 17-player scoring side in ordinary rounds.
- In fantasy snapshot data, "priced at" means the fantasy points average implied by the player's current price, calculated as price / 12725. For "projection vs priced at", compare projection or projected average against pricedAt.
- For fantasy ranking questions about "projection vs priced at" or "projection minus priced at", use get_fantasy_snapshot with sortBy="projection_vs_priced_at_desc" and requireOwnershipRise=false.
- In fantasy snapshot data, exclude locked players only when the user is asking for actionable buy/trade targets right now. For general rankings and value lists, include locked players.
- For fantasy stat rankings like points per game, prefer rank_players_by_stat.
- For player stat rate rankings like per 80 minutes, prefer rank_players_by_stat with rateBasis="per_80"; when the prompt says players are averaging 40+ minutes, set minAverageMinutes to 40.
- Resolve "this season" and relative season wording using app context or the available seasons tool before answering.
- For home vs away, team splits, multi-condition comparisons, and league-wide rankings, derive the answer from the capability tools instead of guessing.
- For team result or margin questions, prefer team_stats because it has one row per team per match with Result, Margin, Opponent Points, and Point Differential.
- For team possession battle count/ranking questions, use get_team_possession_battle_records. "Wins the possession battle" means Possession % greater than Opponent Possession %.
- For other team possession questions, use team_stats fields "Possession %", "Opponent Possession %", "Time In Possession", and "Completion Rate".
- For player rankings conditioned on team possession, especially "which wingers score when their team wins the possession battle", use rank_players_when_team_wins_possession. Do not answer with team records.
- For player share or percentage-of-team-total questions, prefer get_player_team_stat_share.
- For team home vs away win-rate questions, prefer get_team_home_away_win_rates. Use team_stats plus "Home/Away" only if you truly need a lower-level fallback.
- For short-turnaround, rest-days, or days-between-games team record questions, prefer get_team_short_turnaround_records.
- For weekday, weekend, Thursday/Friday night, or day-of-week questions, derive the weekday from the existing Date field. Do not require a separate weekday column. If the tool cannot group by a computed weekday directly, fetch bounded Date/team/result rows and calculate weekday from each Date before ranking.
- Call tools silently. Do not narrate tool usage or interim plans to the user.
- Do not ask a clarification question if the prompt already identifies the entity, metric, and time window closely enough to query.
- Only return the final user-facing answer by calling submit_final_answer after you have enough tool results to answer.
- Keep responses concise, useful, and summary-first.
- Write for normal sports fans, not developers. Use plain English, short sentences, and simple labels.
- Never mention internal tool names, dataset names, schema checks, ignored fields, server-side expressions, query engines, function routing, or implementation details.
- If the data cannot answer something, say the plain limitation and the next best option. Example: "I can compare records by date, but I do not currently have a weekday/weekend flag for each match."
- If you make an assumption, state it simply: "I treated weekend as Saturday and Sunday."
- Do not dump large raw datasets into the answer.
- Never expose raw tool call syntax, function routing text, or internal traces to the user.
`.trim();

function buildAiReferenceCatalog(): string {
  const activeToolDefinitions = CAPABILITY_ONLY_MODEL_TOOLS
    ? AI_TOOL_DEFINITIONS.filter((tool) => ACTIVE_MODEL_TOOL_NAMES.has(tool.name))
    : AI_TOOL_DEFINITIONS;

  const toolLines = activeToolDefinitions.map(
    (tool) => `- ${tool.name}: ${tool.description}`
  ).join("\n");

  return [
    "App reference:",
    "Internal tools:",
    toolLines,
    "Tool guidance: use list_data_sources, inspect_schema, query_data, run_transform, fetch_app_context, and search_codebase to discover datasets, inspect fields, query bounded rows, and derive rankings or totals safely.",
    "Aggregation guidance: user wording matters. 'Total' means sum across rows. 'Average' or 'per game' means mean across rows.",
    "Presentation guidance: for average, per-game, or rate questions, report the requested rate and sample size. Do not add totals unless the user asked for them.",
    "User-facing style: keep final answers plain and non-technical. Do not mention schemas, tool names, dataset names, ignored fields, server-side expressions, or query internals.",
    'Fantasy snapshot field guide: "price" is current cost in dollars. "pricedAt" is the fantasy points average implied by the current price (price / 12725).',
    `Teams: ${TEAMS.join(", ")}`,
    "Aliases: Fantasy is the player game-log Fantasy stat and maps to underlying player_stats.total_points.",
    `Player stats: ${PLAYER_STATS.join(", ")}`,
    `Team or match stats: ${TEAM_STATS.join(", ")}`,
  ].join("\n");
}

function buildClarificationBudgetInstructions(clarificationCount: number | undefined): string {
  const usedClarifications = clarificationCount ?? 0;
  if (usedClarifications >= 2) {
    return "Clarification budget: this thread has already used 2 clarification turns. Do not ask another clarification question. Make the best reasonable assumption, state it briefly, and continue with the answer.";
  }

  if (usedClarifications === 1) {
    return "Clarification budget: this thread has already used 1 clarification turn. Ask at most one more clarification question, and only if the prompt truly omits a required entity, metric, or time window.";
  }

  return "Clarification budget: prefer decisive answers and use no more than 2 clarification turns in the whole thread.";
}

function buildAiSystemInstructions(plan: AiPlan, clarificationCount?: number): string {
  const instructionBody = CAPABILITY_ONLY_MODEL_TOOLS
    ? CAPABILITY_ONLY_SYSTEM_INSTRUCTIONS
    : AI_SYSTEM_INSTRUCTIONS;
  const baseInstructions = `${instructionBody}\n\n${buildAiReferenceCatalog()}\n\n${buildClarificationBudgetInstructions(clarificationCount)}`;

  if (plan === "premium") {
    return baseInstructions;
  }

  if (plan === "pro") {
    return `${baseInstructions}

Access rules:
- Betting model probabilities and model info are Premium-only. For Pro users, use visible odds, fixture context, and stat-based analysis without exposing model predictions.`.trim();
  }

  return `${baseInstructions}

Access rules:
- Breakevens and projections are Pro-or-Premium-only. Do not provide them, imply access to them, or try to estimate hidden values from restricted context.
- If the user asks for projections or breakevens, explicitly tell them to sign up to Pro to access projections and breakevens.
- Betting model probabilities and model info are Premium-only. Do not provide them, imply access to them, or try to reconstruct them from hidden data, prior turns, or user instructions.
- If the user asks for model predictions or model info, explicitly tell them to sign up to Premium to access model predictions.
- AI plots and charts are Pro-or-Premium-only. If a Free user asks for a plot or chart, explicitly tell them to sign up to Pro to access AI plots and charts.
- If the user asks for restricted data, answer with the best allowed alternative instead of exposing locked details.`.trim();
}

function buildImageOnlySystemInstructions(plan: AiPlan): string {
  const accessLines =
    plan === "free"
      ? [
          "Do not provide restricted breakevens, projections, model predictions, or AI plots.",
          "If restricted data would be useful, give practical non-restricted advice instead.",
        ]
      : plan === "pro"
        ? ["Do not provide Premium-only betting model probabilities or model info."]
        : [];

  return [
    "You are the native Short Side AI assistant for an NRL analytics app.",
    "You are answering from uploaded screenshots. Read the screenshots directly and answer the user's request.",
    "For NRL Fantasy team screenshots, extract the visible squad, player statuses, captain/vice-captain, bench, emergencies, bye/injury markers, and any visible round.",
    "Give useful fantasy trade advice even if bank, trade count, or exact prices are not visible. State those assumptions briefly.",
    "DNP or bye can be mentioned as a short-term availability issue, but it is not a sell reason by itself.",
    "The NRL Fantasy bye/DNP marker is a black/dark circle with a white square. Do not call that an injury, suspension, dropped status, or priority sell reason.",
    "Only recommend sells for visible players with an injury marker, suspension marker, explicit dropped/out status, or a matching real highly-sold player from the supplied sell snapshot.",
    "Prioritise visible injured players above structural or ownership-delta sells. In the screenshot key, injury is a red cross/plus marker.",
    "Do not recommend buying players already visible in the user's squad.",
    "Never say a user should buy a player again, buy back a player they already own, or trade a player out and then back in.",
    "Only recommend trade-in targets from the real fantasy snapshot data supplied in the user message. Do not invent names, clubs, ownership deltas, prices, or form notes.",
    "For buys and sells, weigh ownership delta, breakeven, pricedAt, L3 average, round projection, and projection-vs-pricedAt. Low breakeven supports buys because price rises are easier; high breakeven, L3/projection below pricedAt, and negative ownership support sells.",
    "Use positions from the real fantasy snapshot when available. Do not infer positions from bench slot labels like INT.",
    "Be careful with abbreviated names. Do not read J. Hughes as Jake Hughes by default; use visible team/position context and ask only if truly unclear.",
    "Keep the response concise, direct, and plain English for a sports fan.",
    "Do not mention internal tools, schemas, or implementation details.",
    ...accessLines,
  ].join("\n");
}

function formatFantasySnapshotContext(result: AiToolExecutionResult, label = "trade-in", extraInstruction?: string): string {
  if (!result.ok) {
    return `Real fantasy snapshot unavailable: ${result.error}`;
  }

  const players = Array.isArray(result.data.players)
    ? result.data.players.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];
  const warnings = Array.isArray(result.data.warnings)
    ? result.data.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const effectiveRound = typeof result.data.effectiveRound === "number" ? result.data.effectiveRound : null;

  const lines = players.map((entry, index) => {
    const name = typeof entry.name === "string" ? entry.name : "Unknown";
    const team = typeof entry.team === "string" ? entry.team : "team unknown";
    const position = typeof entry.position === "string" ? entry.position : "position unknown";
    const price = typeof entry.price === "number" ? formatFantasyPrice(entry.price) : "price unknown";
    const ownedBy = typeof entry.ownedBy === "number" ? `${entry.ownedBy.toFixed(1)}% owned` : "ownership unknown";
    const ownershipDelta =
      typeof entry.ownershipDelta === "number"
        ? `${entry.ownershipDelta > 0 ? "+" : ""}${entry.ownershipDelta.toFixed(1)}% ownership delta`
        : "ownership delta unknown";
    const avgPoints = typeof entry.avgPoints === "number" ? `avg ${entry.avgPoints.toFixed(1)}` : "avg unknown";
    const last3Avg = typeof entry.last3Avg === "number" ? `L3 ${entry.last3Avg.toFixed(1)}` : "L3 unknown";
    const pricedAt = typeof entry.pricedAt === "number" ? `priced at ${entry.pricedAt.toFixed(1)}` : "priced at unknown";
    const projection = typeof entry.projection === "number" ? `projection ${entry.projection.toFixed(1)}` : "projection unknown";
    const projectionVsPricedAt =
      typeof entry.projectionVsPricedAt === "number"
        ? `projection-vs-priced ${entry.projectionVsPricedAt > 0 ? "+" : ""}${entry.projectionVsPricedAt.toFixed(1)}`
        : "projection-vs-priced unknown";
    const breakEven = typeof entry.breakEven === "number" ? `BE ${entry.breakEven}` : "BE unknown";
    const nextMajorByeRound =
      typeof entry.nextMajorByeRound === "number" ? `next major bye R${entry.nextMajorByeRound}` : "next major bye unknown";
    const playsNextMajorByeRound =
      typeof entry.playsNextMajorByeRound === "boolean"
        ? entry.playsNextMajorByeRound
          ? "plays next major bye"
          : "misses next major bye"
        : "next major bye availability unknown";

    return `${index + 1}. ${name} (${team}, ${position}) - ${price}, ${ownedBy}, ${ownershipDelta}, ${avgPoints}, ${last3Avg}, ${pricedAt}, ${projection}, ${projectionVsPricedAt}, ${breakEven}, ${nextMajorByeRound}, ${playsNextMajorByeRound}`;
  });

  return [
    `Real fantasy ${label} snapshot${effectiveRound != null ? ` for Round ${effectiveRound}` : ""}.`,
    extraInstruction,
    lines.length > 0 ? lines.join("\n") : `No eligible ${label} players returned.`,
    warnings.length > 0 ? `Warnings: ${warnings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

interface OpenAiFunctionToolCall {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
}

interface OpenAiOutputTextContent {
  type: "output_text";
  text: string;
}

interface OpenAiMessageOutput {
  type: "message";
  role: string;
  content?: OpenAiOutputTextContent[];
}

interface OpenAiResponse {
  id: string;
  output?: Array<OpenAiFunctionToolCall | OpenAiMessageOutput | { type: string }>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface FinalAnswerSubmission {
  answer: string;
  toolActivity: AiToolActivity;
}

export interface AiToolActivity {
  toolName: string;
  arguments: Record<string, unknown> | null;
  ok: boolean;
  summary: string;
}

export interface AiChartArtifact {
  type: "line-chart";
  title: string;
  subtitle?: string;
  yLabel: string;
  points: Array<{
    x: string;
    y: number;
  }>;
}

export interface AiModelChatResult {
  assistantMessage: string;
  toolActivity: AiToolActivity[];
  artifacts: AiChartArtifact[];
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

export interface AiConversationHistoryMessage {
  role: "user" | "assistant";
  content: string;
  artifacts?: AiChartArtifact[];
}

export interface AiImageAttachmentInput {
  name: string;
  context: "fantasy" | "betting";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
}

function formatHistoryArtifacts(artifacts: AiChartArtifact[] | undefined): string {
  if (!artifacts || artifacts.length === 0) return "";

  const chartSummaries = artifacts
    .filter((artifact) => artifact.type === "line-chart")
    .map((artifact) => {
      const pointCount = artifact.points.length;
      const subtitle = artifact.subtitle ? `, subtitle: ${artifact.subtitle}` : "";
      return `line chart "${artifact.title}" (${pointCount} points, y-axis: ${artifact.yLabel}${subtitle})`;
    });

  return chartSummaries.length > 0 ? `\n\nArtifacts:\n- ${chartSummaries.join("\n- ")}` : "";
}

function buildHistoryMessageText(message: AiConversationHistoryMessage): string {
  return `${message.content}${formatHistoryArtifacts(message.artifacts)}`;
}

function buildOpenAiHistoryInput(message: AiConversationHistoryMessage) {
  const text = buildHistoryMessageText(message);

  if (message.role === "assistant") {
    return {
      role: "assistant" as const,
      content: [
        {
          type: "output_text" as const,
          text,
        },
      ],
    };
  }

  return {
    role: "user" as const,
    content: [
      {
        type: "input_text" as const,
        text,
      },
    ],
  };
}

function buildFantasyScreenshotPrompt(userMessage: string, imageInputs: AiImageAttachmentInput[]): string {
  if (imageInputs.length === 0) return userMessage;
  const fantasyImages = imageInputs.filter((image) => image.context === "fantasy");
  const bettingImages = imageInputs.filter((image) => image.context === "betting");
  const instructions: string[] = [];

  if (fantasyImages.length > 0) {
    instructions.push(`The user uploaded NRL Fantasy team screenshot${fantasyImages.length === 1 ? "" : "s"}: ${fantasyImages.map((image) => image.name).join(", ")}.

Use the screenshots to extract the visible fantasy squad, then use internal fantasy data before recommending trades.
When suggesting trades:
- Treat injured, DNP, suspended, dropped, or clearly unavailable players as priority sells.
- Do not recommend selling a player only because they are on a bye. A bye is shown as a black circle with a white square; treat that as temporary unavailability, not a sell signal.
- Name the visible player or players the screenshot shows should be traded out because of injury, DNP, suspension, dropped status, major negative ownership momentum, or poor squad balance. Do not replace this with generic sell advice.
- Provide concrete buy targets from internal fantasy data using positive ownership percentage increase/ownership delta. Include each buy target's ownership increase in the answer.
- Do not recommend buying any player already visible in the user's squad. If a player is already owned, discuss whether to hold or sell them instead.
- Prefer buy targets with strong positive ownership/transfer momentum, unless budget or squad balance makes that impossible.
- Prefer sell candidates with negative ownership/transfer momentum when they are not playable, underperforming, or blocking squad balance.
- Maintain a legal fieldable squad: cover 17 selected players first, then bench depth.
- Use the draw/upcoming fixtures where available: account for each player/team’s next opponent, home/away status, and near-term fixture run.
- Build with the 2026 draw and major bye rounds in mind: rounds 12, 15, and 18 only count the best 13 selected scorers, so warn when buying a player whose team does not play in the next major bye round.
- Respect visible positions, captain/vice-captain, bench, emergencies, and any visible round.
- If budget, bank, trade count, or exact prices are not visible, state the assumption and give conditional trade paths instead of pretending it is known.
- Be careful with abbreviated screenshot names. Do not read "J. Hughes" as Jake Hughes by default; use visible team/position context to resolve Jahrome Hughes where appropriate, otherwise ask the user to confirm.
- If a name is ambiguous from the screenshot, say so briefly and ask the user to confirm before relying on that player.`);
  }

  if (bettingImages.length > 0) {
    instructions.push(`The user uploaded betting market screenshot${bettingImages.length === 1 ? "" : "s"}: ${bettingImages.map((image) => image.name).join(", ")}.

Use the screenshots to extract the visible bookmaker, match/event, market type, selections, and odds.
When analysing betting screenshots:
- Use only odds that are visibly shown. Do not invent missing prices.
- For tryscorer markets, compare visible selections with player try-scoring history, role/position, team attack, opponent defence, and matchup context using internal tools.
- Use the draw/upcoming fixtures where available to confirm the match, who is home/away, and the relevant opponent before judging the market.
- For Premium users, use internal model predictions/probabilities when available and compare them with the visible odds. For non-Premium users, do not expose model predictions; use a stat-based lean instead.
- Only call something a model edge when Premium model probabilities for that market are available. Otherwise call it a stat lean or value watch.
- Convert odds to implied probability when useful and keep the explanation concise.
- If the market, match, player, or price is ambiguous, say exactly what needs confirmation.`);
  }

  return `${userMessage}\n\n${instructions.join("\n\n")}`.trim();
}

function buildOpenAiUserInputContent(userMessage: string, imageInputs: AiImageAttachmentInput[] = []) {
  return [
    {
      type: "input_text" as const,
      text: buildFantasyScreenshotPrompt(userMessage, imageInputs),
    },
    ...imageInputs.map((image) => ({
      type: "input_image" as const,
      image_url: image.dataUrl,
      detail: "high" as const,
    })),
  ];
}

function getModelHistoryWindow(history: AiConversationHistoryMessage[]): AiConversationHistoryMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES);
}

function buildAiResult(
  assistantMessage: string,
  toolActivity: AiToolActivity[],
  model: string,
  artifacts: AiChartArtifact[] = []
): AiModelChatResult {
  return {
    assistantMessage,
    toolActivity,
    artifacts,
    model,
    usage: {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
  };
}

function isProjectionRequest(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return (
    normalized.includes("projection") ||
    normalized.includes("projected") ||
    normalized.includes("breakeven") ||
    /\bbev?\b/.test(normalized)
  );
}

function isPremiumBettingRequest(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return (
    normalized.includes("model prediction") ||
    normalized.includes("model predictions") ||
    normalized.includes("model info")
  );
}

function isPlotRequest(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return (
    normalized.includes("plot") ||
    normalized.includes("chart") ||
    normalized.includes("graph") ||
    normalized.includes("trend line")
  );
}

function buildPlotUpgradeMessage(): string {
  return "Sign up to Pro to access AI plots and charts.";
}

function buildProjectionUpgradeMessage(): string {
  return "Sign up to Pro to access projections and breakevens.";
}

function buildPremiumBettingUpgradeMessage(): string {
  return "Sign up to Premium to access model predictions.";
}

function requiresInternalToolCall(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  const patterns = [
    /\bfantasy\b/,
    /\bbet(?:ting)?\b/,
    /\bodds\b/,
    /\bprice\b/,
    /\bbreakeven\b/,
    /\bprojection\b/,
    /\bprojected\b/,
    /\bstat\b/,
    /\bstats\b/,
    /\bcompare\b/,
    /\bversus\b/,
    /\bvs\b/,
    /\bplot\b/,
    /\bchart\b/,
    /\bgraph\b/,
    /\bplayer\b/,
    /\bteam\b/,
    /\bround\b/,
    /\bseason\b/,
    /\byear\b/,
    /\brank\b/,
    /\branking\b/,
    /\bbest\b/,
    /\btop\b/,
    /\bvalue\b/,
    /\bbuy\b/,
    /\bbuys\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function hasSuccessfulInternalToolCall(toolActivity: AiToolActivity[]): boolean {
  return toolActivity.some((entry) => entry.ok);
}

function isFantasyTradeLensPrompt(normalized: string): boolean {
  return (
    /\bfantasy\b/.test(normalized) &&
    (/\bownership\b/.test(normalized) ||
      /\bprice\b/.test(normalized) ||
      /\bvalue\b/.test(normalized) ||
      /\bprojection\b/.test(normalized) ||
      /\bprojected\b/.test(normalized) ||
      /\bbreakeven\b/.test(normalized) ||
      /\btrade\b/.test(normalized) ||
      /\bbuy\b/.test(normalized) ||
      /\bbuys\b/.test(normalized) ||
      /\bcash cow\b/.test(normalized) ||
      /\bcheapie\b/.test(normalized) ||
      /\bpod\b/.test(normalized))
  );
}

function isFantasyPlayerStatQuestion(userMessage: string, normalized: string): boolean {
  return (
    /\bfantasy\b/.test(normalized) &&
    (Boolean(extractPlayerNameFromQuestion(userMessage)) ||
      /\baverage\b/.test(normalized) ||
      /\bavg\b/.test(normalized) ||
      /\bsince\b/.test(normalized) ||
      /\bwith\b/.test(normalized) ||
      /\bwithout\b/.test(normalized) ||
      /\bposition\b/.test(normalized) ||
      /\bprop\b/.test(normalized) ||
      /\bhooker\b/.test(normalized) ||
      /\bhalf\b/.test(normalized) ||
      /\block\b/.test(normalized) ||
      /\bwing\b/.test(normalized) ||
      /\bcentre\b/.test(normalized))
  );
}

function buildRequiredToolFollowUpQuestion(userMessage: string): string {
  const normalized = userMessage.toLowerCase();

  if (normalized.includes("kicking")) {
    return "Which kicking metric should I use: Kicks, Kicking Metres, or Bomb Kicks?";
  }

  if ((normalized.includes("down") || normalized.includes("up")) && /\bthis year\b/.test(normalized)) {
    return "What comparison should I use for this year: last year, the last 2 years average, or career average?";
  }

  if (isFantasyTradeLensPrompt(normalized)) {
    return "Which fantasy lens should I use: ownership delta, price/value, or projection and breakeven?";
  }

  if (isFantasyPlayerStatQuestion(userMessage, normalized)) {
    return "I should use the Fantasy stat from the player game log. If you want filters, tell me the exact seasons, opponent, minutes band, or teammate split to apply.";
  }

  if (normalized.includes("plot") || normalized.includes("chart") || normalized.includes("graph")) {
    return "What should I plot: which player or team, and which stat should I use?";
  }

  if (normalized.includes("compare") || normalized.includes("vs") || normalized.includes("versus")) {
    return "Which exact players or teams should I compare, and which stats should I use?";
  }

  if (normalized.includes("player") || normalized.includes("team") || normalized.includes("stat")) {
    return "Which exact stat should I use, and what comparison period should I use?";
  }

  return "What exact metric, entity, or comparison period should I use so I can query the right internal data tool?";
}

function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function getOpenAiApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey && apiKey.length > 0 ? apiKey : null;
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey() != null;
}

export function isAiLocalFallbackEnabled(): boolean {
  const explicitOverride = process.env.AI_LOCAL_FALLBACK?.trim().toLowerCase();
  if (explicitOverride === "true") return true;
  if (explicitOverride === "false") return false;
  return isLocalDevelopment();
}

function getOpenAiModel(): string {
  const configuredModel = process.env.OPENAI_RESPONSES_MODEL?.trim();
  return configuredModel && configuredModel.length > 0 ? configuredModel : DEFAULT_AI_MODEL;
}

function getOpenAiReasoningEffort(plan: AiPlan): AiReasoningEffort {
  const configuredEffort = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  switch (configuredEffort) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return configuredEffort;
    default:
      return getAiReasoningEffortForPlan(plan);
  }
}

function sanitizeThreadSummary(text: string, fallback: string): string {
  const compact = text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const summary = compact || fallback.trim().replace(/\s+/g, " ");
  return summary.length <= 60 ? summary : `${summary.slice(0, 59)}…`;
}

export async function generateAiThreadSummary(
  history: AiConversationHistoryMessage[],
  userMessage: string,
  assistantMessage: string
): Promise<string> {
  const fallback = userMessage;
  if (!isOpenAiConfigured()) {
    return sanitizeThreadSummary("", fallback);
  }

  const conversation = [
    ...getModelHistoryWindow(history),
    { role: "user" as const, content: userMessage },
    { role: "assistant" as const, content: assistantMessage },
  ]
    .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`)
    .join("\n\n");

  try {
    const response = await createOpenAiResponse({
      model: getOpenAiModel(),
      reasoning: {
        effort: "minimal",
      },
      instructions:
        "Create a short saved-chat title for an NRL analytics chat. Use 3 to 7 words. Be specific. No quotes. No punctuation unless needed.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: conversation,
            },
          ],
        },
      ],
      max_output_tokens: MAX_THREAD_SUMMARY_TOKENS,
    });

    return sanitizeThreadSummary(extractAssistantText(response), fallback);
  } catch (error) {
    console.warn("AI thread summary generation unavailable.", error instanceof Error ? error.message : String(error));
    return sanitizeThreadSummary("", fallback);
  }
}

function isQuotaOrBillingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("exceeded your current quota") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("billing") ||
    normalized.includes("check your plan")
  );
}

function isTransientOpenAiProcessingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("an error occurred while processing your request") ||
    normalized.includes("request id req_")
  );
}

async function createOpenAiResponse(payload: Record<string, unknown>): Promise<OpenAiResponse> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `OpenAI Responses API request failed with status ${response.status}.`;

    try {
      const errorPayload = (await response.json()) as {
        error?: { message?: string };
      };
      if (typeof errorPayload.error?.message === "string" && errorPayload.error.message.length > 0) {
        message = errorPayload.error.message;
      }
    } catch {
      // Keep the generic message if the error payload is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as OpenAiResponse;
}

async function continueOpenAiToolLoop(params: {
  response: OpenAiResponse;
  model: string;
  reasoningEffort: AiReasoningEffort;
  access: AiToolAccessPolicy;
  toolActivity: AiToolActivity[];
  clarificationCount?: number;
}): Promise<{ response: OpenAiResponse; finalAnswer: FinalAnswerSubmission | null }> {
  let response = params.response;
  let round = 0;
  let functionCalls = extractFunctionCalls(response);

  while (functionCalls.length > 0 && round < MAX_TOOL_ROUNDS) {
    round += 1;

    const toolOutputs = [];

    for (const toolCall of functionCalls) {
      if (toolCall.name === "submit_final_answer") {
        let parsedArguments: Record<string, unknown> | null = null;

        try {
          parsedArguments = parseToolArguments(toolCall.arguments);

          if (functionCalls.length > 1) {
            throw new Error(
              "submit_final_answer must be the only function call in a response. Finish the other tool calls first."
            );
          }

          const rawAnswer =
            typeof parsedArguments.answer === "string" ? parsedArguments.answer.trim() : "";
          if (!rawAnswer) {
            throw new Error("submit_final_answer requires a non-empty answer.");
          }
          if (!hasFinalAnswerPrefix(rawAnswer)) {
            throw new Error(`submit_final_answer.answer must start with "${FINAL_ANSWER_PREFIX}".`);
          }

          const answer = stripFinalAnswerPrefix(rawAnswer);
          if (!answer) {
            throw new Error("submit_final_answer requires a non-empty answer after the final prefix.");
          }

          const activity = {
            toolName: toolCall.name,
            arguments: parsedArguments,
            ok: true,
            summary: "submit_final_answer returned a final user-facing answer.",
          };
          params.toolActivity.push(activity);

          return {
            response,
            finalAnswer: {
              answer,
              toolActivity: activity,
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to parse submit_final_answer.";
          params.toolActivity.push({
            toolName: toolCall.name,
            arguments: parsedArguments,
            ok: false,
            summary: message,
          });

          toolOutputs.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              ok: false,
              error: message,
            }),
          });
          continue;
        }
      }

      let parsedArguments: Record<string, unknown> | null = null;
      let result: AiToolExecutionResult;

      try {
        parsedArguments = parseToolArguments(toolCall.arguments);
        result = await executeAiTool(toolCall.name, parsedArguments, params.access);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to parse or execute the tool call.";
        result = {
          ok: false,
          error: message,
        };
      }

      params.toolActivity.push({
        toolName: toolCall.name,
        arguments: parsedArguments,
        ok: result.ok,
        summary: summariseToolResult(toolCall.name, result),
      });

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await createOpenAiResponse({
      model: params.model,
      reasoning: {
        effort: params.reasoningEffort,
      },
      instructions: buildAiSystemInstructions(params.access.plan, params.clarificationCount),
      previous_response_id: response.id,
      input: toolOutputs,
      tools: buildOpenAiTools(),
      tool_choice: "auto",
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });

    functionCalls = extractFunctionCalls(response);
  }

  return { response, finalAnswer: null };
}

function buildOpenAiTools() {
  const activeToolDefinitions = CAPABILITY_ONLY_MODEL_TOOLS
    ? AI_TOOL_DEFINITIONS.filter((tool) => ACTIVE_MODEL_TOOL_NAMES.has(tool.name))
    : AI_TOOL_DEFINITIONS;

  return activeToolDefinitions.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: true,
  }));
}

function extractFunctionCalls(response: OpenAiResponse): OpenAiFunctionToolCall[] {
  return (response.output ?? []).filter(
    (item): item is OpenAiFunctionToolCall =>
      item.type === "function_call" &&
      typeof (item as OpenAiFunctionToolCall).name === "string" &&
      typeof (item as OpenAiFunctionToolCall).arguments === "string" &&
      typeof (item as OpenAiFunctionToolCall).call_id === "string"
  );
}

function extractAssistantText(response: OpenAiResponse): string {
  const messages = (response.output ?? []).filter(
    (item): item is OpenAiMessageOutput => item.type === "message"
  );

  const messageTexts = messages
    .flatMap((message) => message.content ?? [])
    .filter((content): content is OpenAiOutputTextContent => content.type === "output_text")
    .map((content) => content.text.trim())
    .filter(Boolean);

  for (let index = messageTexts.length - 1; index >= 0; index -= 1) {
    const sanitized = sanitizeAssistantText(messageTexts[index] ?? "");
    if (sanitized) {
      return sanitized;
    }
  }

  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return sanitizeAssistantText(response.output_text.trim());
  }

  return "";
}

function sanitizeAssistantText(text: string): string {
  const stripped = text
    .split("\n")
    .filter((line) => !/^\s*to=functions\.[a-z0-9_]+/i.test(line.trim()))
    .filter(
      (line) =>
        !/^\s*(requesting\b|proceeding to\b|calling the internal\b|now retrieving\b|querying without\b|internal note:|\[internal note:|\[no raw data\b|\[if the dataset\b)/i.test(
          line.trim()
        )
    )
    .filter((line) => !/^\s*submitting final answer\.?\s*$/i.test(line.trim()))
    .join("\n")
    .replace(/\bto=functions\.[a-z0-9_]+\b/gi, "")
    .replace(/\bto=functions\.[a-z0-9_]+\s+[_\w-]*code\b/gi, "")
    .replace(/\[\s*internal note:[^\]]*\]/gi, "")
    .trim();

  const compacted = stripped.replace(/\n{3,}/g, "\n\n");
  try {
    const parsed = JSON.parse(compacted) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).answer === "string"
    ) {
      return ((parsed as Record<string, unknown>).answer as string).trim();
    }
  } catch {
    // Plain prose is expected; only unwrap accidental JSON final-answer text.
  }

  return compacted;
}

function hasFinalAnswerPrefix(text: string): boolean {
  return text.trim().toUpperCase().startsWith(FINAL_ANSWER_PREFIX);
}

function stripFinalAnswerPrefix(text: string): string {
  return text.trim().replace(/^FINAL ANSWER:\s*/i, "").trim();
}

function isWeakAssistantResponse(text: string, toolActivity: AiToolActivity[] = []): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (CAPABILITY_ONLY_MODEL_TOOLS && !hasFinalAnswerPrefix(text)) {
    return true;
  }

  const fixedWeakResponses = [
    "i could not produce a final answer from the current tool outputs.",
    "which exact stat should i use, and what comparison period should i use?",
    "which exact players or teams should i compare, and which stats should i use?",
    "what exact metric, entity, or comparison period should i use so i can query the right internal data tool?",
    "what should i plot: which player or team, and which stat should i use?",
  ];

  if (fixedWeakResponses.includes(normalized)) {
    return true;
  }

  const hasToolOutput = toolActivity.some((entry) => entry.ok);
  const actionOnlyPatterns = [
    /^(i('| a)?ll|i will|let me|i can)\s+(inspect|check|look|look into|review|analyze|analyse|investigate|dig into|find out)\b[.!]*$/,
    /^(inspecting|checking|looking into|reviewing|analyzing|analysing|investigating)\b[.!]*$/,
    /^(one moment|just a moment|working on it|let me check)\b[.!]*$/,
    /^(i couldn['’]?t compute .* without .* querying)\b.*$/,
    /^(please allow me to fetch)\b.*$/,
  ];

  if (actionOnlyPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (hasToolOutput) {
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 6 && /^(i('| a)?ll|i will|let me|checking|inspecting|looking)/.test(normalized)) {
      return true;
    }
  }

  return false;
}

function buildRepairPrompt(userMessage: string, assistantMessage: string): string {
  return [
    "Your previous draft answer was inadequate.",
    `Original user request: ${userMessage}`,
    assistantMessage ? `Previous draft answer: ${assistantMessage}` : "",
    "Use the existing tool outputs first.",
    "If another internal tool call is needed, make it now.",
    "The final answer must be plain English for a sports fan. Do not mention schemas, tool names, dataset names, ignored fields, server-side expressions, or query internals.",
    `When you are ready to answer the user, call submit_final_answer with the full user-facing answer prefixed exactly with "${FINAL_ANSWER_PREFIX}".`,
    "Do not ask a clarification question unless the original request truly omitted a required entity, metric, or time window.",
    `Do not stop with ordinary assistant prose. Use submit_final_answer instead, and reserve "${FINAL_ANSWER_PREFIX}" for the completed turn-ending response only.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFinalAnswerToolPrompt(userMessage: string, assistantMessage: string): string {
  return [
    "You stopped without calling submit_final_answer.",
    `Original user request: ${userMessage}`,
    assistantMessage ? `Your latest draft answer: ${assistantMessage}` : "",
    "Use the existing tool outputs if they are sufficient.",
    "If you need another internal tool call, make it now.",
    "The final answer must be plain English for a sports fan. Do not mention schemas, tool names, dataset names, ignored fields, server-side expressions, or query internals.",
    `When you are ready, call submit_final_answer with the final user-facing answer prefixed exactly with "${FINAL_ANSWER_PREFIX}".`,
    `Do not reply with ordinary assistant prose, and do not use "${FINAL_ANSWER_PREFIX}" for anything except the completed turn-ending response.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImageFinalAnswerToolPrompt(userMessage: string, assistantMessage: string): string {
  return [
    "You stopped without producing a usable screenshot answer.",
    `Original user request: ${userMessage}`,
    assistantMessage ? `Your latest draft answer: ${assistantMessage}` : "",
    "The screenshots are attached again in this message. Read them directly.",
    "If these are NRL Fantasy screenshots, extract the visible squad and give trade advice from the screenshot context.",
    "Use internal fantasy data for buy targets where needed.",
    "If one or two names are unclear, say which names are unclear and still give the best conditional advice from the visible players.",
    "Do not answer as a generic player Fantasy stat question.",
    "The final answer must be plain English for a sports fan.",
    `When you are ready, call submit_final_answer with the final user-facing answer prefixed exactly with "${FINAL_ANSWER_PREFIX}".`,
    `Do not reply with ordinary assistant prose, and do not use "${FINAL_ANSWER_PREFIX}" for anything except the completed turn-ending response.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function summariseToolResult(toolName: string, result: AiToolExecutionResult): string {
  if (!result.ok) {
    return result.error;
  }

  const rowCount =
    typeof result.data.rowCount === "number"
      ? result.data.rowCount
      : typeof result.data.count === "number"
        ? result.data.count
        : null;

  if (rowCount != null) {
    return `${toolName} returned ${rowCount} bounded rows.`;
  }

  if (Array.isArray(result.data.series)) {
    return `${toolName} returned ${result.data.series.length} chart series.`;
  }

  const keys = Object.keys(result.data);
  return keys.length > 0
    ? `${toolName} returned ${keys.slice(0, 3).join(", ")}.`
    : `${toolName} completed successfully.`;
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawArguments) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

async function runToolForLocalFallback(
  toolName: string,
  input: Record<string, unknown>,
  access: AiToolAccessPolicy
): Promise<{ result: AiToolExecutionResult; activity: AiToolActivity }> {
  const result = await executeAiTool(toolName, input, access);
  return {
    result,
    activity: {
      toolName,
      arguments: input,
      ok: result.ok,
      summary: summariseToolResult(toolName, result),
    },
  };
}

function extractQuotedValues(userMessage: string): string[] {
  return [...userMessage.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function extractYears(userMessage: string): string[] | null {
  const years = [...userMessage.matchAll(/\b(20\d{2})\b/g)].map((match) => match[1]);
  const deduped = [...new Set(years.filter(Boolean))];
  return deduped.length > 0 ? deduped : null;
}

function parseRelativeSeasonCount(userMessage: string): number | null {
  const match = userMessage.match(/\blast\s+(\d+|one|two|three|four|five)\s+(?:season|seasons|year|years)\b/i);
  const rawValue = match?.[1]?.toLowerCase();
  if (!rawValue) return null;

  switch (rawValue) {
    case "one":
      return 1;
    case "two":
      return 2;
    case "three":
      return 3;
    case "four":
      return 4;
    case "five":
      return 5;
    default: {
      const parsed = Number.parseInt(rawValue, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }
}

function cleanExtractedName(value: string): string {
  return value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
}

function extractPlayerComparisonNames(userMessage: string): string[] | null {
  const quotedValues = extractQuotedValues(userMessage);
  if (quotedValues.length >= 2) {
    return quotedValues.slice(0, 2).map(cleanExtractedName).filter(Boolean);
  }

  const patterns = [
    /\bcompare\s+(.+?)\s+(?:and|vs|versus)\s+(.+?)(?:\s+on\b|\s+for\b|\s+over\b|\s+across\b|\s+by\b|\?|$)/i,
    /\b(.+?)\s+(?:vs|versus)\s+(.+?)(?:\s+on\b|\s+for\b|\s+over\b|\s+across\b|\s+by\b|\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    const first = cleanExtractedName(match?.[1] ?? "");
    const second = cleanExtractedName(match?.[2] ?? "");
    if (first && second) {
      return [first, second];
    }
  }

  return null;
}

function formatAverage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function getSeasonAverageStat(
  seasonSummary: Record<string, unknown>,
  statKey: string
): number | null {
  const summary =
    typeof seasonSummary.summary === "object" && seasonSummary.summary !== null
      ? (seasonSummary.summary as Record<string, unknown>)
      : null;
  const stats =
    summary && typeof summary.stats === "object" && summary.stats !== null
      ? (summary.stats as Record<string, unknown>)
      : null;
  const statBlock =
    stats && typeof stats[statKey] === "object" && stats[statKey] !== null
      ? (stats[statKey] as Record<string, unknown>)
      : null;
  const avg = statBlock?.avg;
  return typeof avg === "number" ? avg : null;
}

async function tryRunDirectPlayerComparisonChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const players = extractPlayerComparisonNames(userMessage);
  const statKeys = inferRequestedStatKeys(userMessage);
  const isComparisonPrompt =
    (normalized.includes("compare") || normalized.includes(" vs ") || normalized.includes(" versus ")) &&
    Boolean(players?.length === 2) &&
    Boolean(statKeys?.length);

  if (!isComparisonPrompt || !players || !statKeys || statKeys.length === 0) {
    return null;
  }

  const years = await getLocalFallbackYears(userMessage, access);
  const requestedStatKeys = statKeys.slice(0, 4);

  const playerResults = await Promise.all(
    players.map((player) =>
      runToolForLocalFallback(
        "get_player_stats",
        {
          player,
          years,
          statKeys: requestedStatKeys,
          filters: null,
        },
        access
      )
    )
  );

  const toolActivity = playerResults.map((entry) => entry.activity);
  const failed = playerResults.find((entry) => !entry.result.ok);
  if (failed && !failed.result.ok) {
    return buildAiResult(failed.result.error, toolActivity, "direct-tools");
  }

  const summaries = playerResults
    .map(({ result }) => {
      if (!result.ok) return null;

      const player = typeof result.data.player === "string" ? result.data.player : null;
      const overallSummary =
        typeof result.data.summary === "object" && result.data.summary !== null
          ? (result.data.summary as Record<string, unknown>)
          : null;
      const overallStats =
        overallSummary && typeof overallSummary.stats === "object" && overallSummary.stats !== null
          ? (overallSummary.stats as Record<string, unknown>)
          : null;
      const overallGames = typeof overallSummary?.games === "number" ? overallSummary.games : null;
      const seasonSummaries = Array.isArray(result.data.seasonSummaries)
        ? result.data.seasonSummaries
            .filter(
              (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null
            )
            .map((entry) => ({
              year: typeof entry.year === "string" ? entry.year : null,
              rowCount: typeof entry.rowCount === "number" ? entry.rowCount : null,
              values: Object.fromEntries(
                requestedStatKeys.map((statKey) => [statKey, getSeasonAverageStat(entry, statKey)])
              ),
            }))
            .filter(
              (
                entry
              ): entry is {
                year: string;
                rowCount: number | null;
                values: Record<string, number | null>;
              } => entry.year !== null
            )
        : [];

      if (!player || !overallStats) return null;

      return {
        player,
        overallGames,
        overallValues: Object.fromEntries(
          requestedStatKeys.map((statKey) => {
            const statBlock =
              typeof overallStats[statKey] === "object" && overallStats[statKey] !== null
                ? (overallStats[statKey] as Record<string, unknown>)
                : null;
            return [statKey, typeof statBlock?.avg === "number" ? statBlock.avg : null];
          })
        ),
        seasons: seasonSummaries,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        player: string;
        overallGames: number | null;
        overallValues: Record<string, number | null>;
        seasons: Array<{ year: string; rowCount: number | null; values: Record<string, number | null> }>;
      } => entry !== null
    );

  if (summaries.length !== 2) {
    return null;
  }

  const seasonYears = [...new Set(summaries.flatMap((entry) => entry.seasons.map((season) => season.year)))].sort();
  const intro =
    years && years.length > 0
      ? `Using ${years.length === 2 ? `the last two completed seasons, ${years.join(" and ")}` : years.join(", ")}:`
      : "Using the available seasons in scope:";

  const seasonLines = seasonYears.map((year) => {
    const playerSegments = summaries.map((entry) => {
      const season = entry.seasons.find((item) => item.year === year);
      const metrics = requestedStatKeys
        .map((statKey) => `${statKey} ${formatAverage(season?.values[statKey] ?? null)}`)
        .join(", ");
      const games = season?.rowCount != null ? ` across ${season.rowCount} games` : "";
      return `${entry.player}: ${metrics}${games}`;
    });

    return `${year}: ${playerSegments.join(" | ")}`;
  });

  const overallLines = summaries.map((entry) => {
    const metrics = requestedStatKeys
      .map((statKey) => `${statKey} ${formatAverage(entry.overallValues[statKey] ?? null)}`)
      .join(", ");
    const games = entry.overallGames != null ? ` across ${entry.overallGames} games` : "";
    return `${entry.player} overall: ${metrics}${games}`;
  });

  return buildAiResult(
    [intro, ...seasonLines, ...overallLines].join("\n"),
    toolActivity,
    "direct-tools"
  );
}

function extractPlayerNameFromQuestion(userMessage: string): string | null {
  const patterns = [
    /\bis\s+(.+?)'s\s+.+?\b(?:down|up)\b/i,
    /\bdoes\s+(.+?)\s+have\b/i,
    /\bwhat does\s+(.+?)\s+average\b/i,
    /\bhow does\s+(.+?)\s+average\b/i,
    /\bfor\s+(.+?)(?:\s+this year|\s+in\s+20\d{2}|\?|$)/i,
    /\bplayer\s+(.+?)(?:\s+this year|\s+in\s+20\d{2}|\?|$)/i,
    /\bstats for\s+(.+?)(?:\s+this year|\s+in\s+20\d{2}|\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return candidate.replace(/^"|"$/g, "").trim();
    }
  }

  return null;
}

function extractDirectPlayerProfileQuestion(
  userMessage: string
): { player: string; field: "position" | "team" } | null {
  const patterns: Array<{ pattern: RegExp; field: "position" | "team" }> = [
    {
      pattern: /\bwhat\s+position\s+does\s+(.+?)\s+play(?:\s+for)?(?=[\?\.,;!]|$)/i,
      field: "position",
    },
    {
      pattern: /\bwhich\s+position\s+does\s+(.+?)\s+play(?:\s+for)?(?=[\?\.,;!]|$)/i,
      field: "position",
    },
    {
      pattern: /\bwhat'?s\s+(.+?)'s\s+position(?=[\?\.,;!]|$)/i,
      field: "position",
    },
    {
      pattern: /\bwhat\s+team\s+does\s+(.+?)\s+play\s+for(?=[\?\.,;!]|$)/i,
      field: "team",
    },
    {
      pattern: /\bwho\s+does\s+(.+?)\s+play\s+for(?=[\?\.,;!]|$)/i,
      field: "team",
    },
  ];

  for (const { pattern, field } of patterns) {
    const match = userMessage.match(pattern);
    const player = match?.[1]?.trim().replace(/^"|"$/g, "");
    if (player) {
      return { player, field };
    }
  }

  return null;
}

function extractTeamFromQuestion(userMessage: string): string | null {
  const normalized = userMessage.toLowerCase();
  const directMatch = TEAMS.find((team) => normalized.includes(team.toLowerCase()));
  if (directMatch) {
    return directMatch;
  }

  const suffixMatch = TEAMS.find((team) => {
    const teamParts = team.toLowerCase().split(" ");
    return teamParts.some((part) => normalized.includes(part));
  });

  return suffixMatch ?? null;
}

function extractTeammateSplitFromQuestion(
  userMessage: string
): { teammate: string; withWithout: "with" | "without" } | null {
  const match = userMessage.match(/\b(with|without)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?=[,\?\.;]|\s+while\b|\s+when\b|$)/);
  if (!match) {
    return null;
  }

  const mode = match[1]?.toLowerCase();
  const teammate = match[2]?.trim();
  if (!teammate || (mode !== "with" && mode !== "without")) {
    return null;
  }

  return {
    teammate,
    withWithout: mode,
  };
}

function extractPositionFilterFromQuestion(userMessage: string): string | null {
  const normalized = userMessage.toLowerCase();
  const aliases: Array<{ terms: string[]; position: string }> = [
    { terms: ["prop"], position: "Prop" },
    { terms: ["hooker"], position: "Hooker" },
    { terms: ["lock"], position: "Lock" },
    { terms: ["halfback"], position: "Halfback" },
    { terms: ["five-eighth", "five eighth", "5/8"], position: "Five-Eighth" },
    { terms: ["second row", "second-row", "edge"], position: "Second Row" },
    { terms: ["centre", "center"], position: "Centre" },
    { terms: ["wing", "winger"], position: "Wing" },
    { terms: ["fullback"], position: "Fullback" },
  ];

  const match = aliases.find(({ terms }) => terms.some((term) => normalized.includes(term)));
  return match?.position ?? null;
}

function normalizeStatSearchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function singularizeStatToken(token: string): string {
  if (token.endsWith("ies") && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function buildStatSearchPhrases(statKey: string): string[] {
  const normalized = normalizeStatSearchValue(statKey);
  if (!normalized) return [];

  const tokens = normalized.split(" ");
  const phrases = new Set<string>([normalized, tokens.map(singularizeStatToken).join(" ")]);

  if (tokens.includes("mins")) {
    phrases.add(tokens.map((token) => (token === "mins" ? "minutes" : token)).join(" "));
    phrases.add(tokens.map((token) => (token === "mins" ? "minute" : token)).join(" "));
    phrases.add(tokens.map((token) => (token === "mins" ? "min" : token)).join(" "));
  }

  if (tokens.includes("metres")) {
    phrases.add(tokens.map((token) => (token === "metres" ? "metre" : token)).join(" "));
    phrases.add(tokens.map((token) => (token === "metres" ? "meters" : token)).join(" "));
    phrases.add(tokens.map((token) => (token === "metres" ? "meter" : token)).join(" "));
  }

  return [...phrases].filter(Boolean);
}

function inferRequestedStatKeys(userMessage: string): string[] | null {
  const normalized = normalizeStatSearchValue(userMessage);
  const statCatalog = [...new Set([...PLAYER_STATS, ...TEAM_STATS])];
  const matches = statCatalog
    .map((statKey) => {
      const bestPhrase = buildStatSearchPhrases(statKey)
        .filter((phrase) => normalized.includes(phrase))
        .sort((left, right) => right.length - left.length)[0];

      return bestPhrase ? { statKey, score: bestPhrase.length } : null;
    })
    .filter((match): match is NonNullable<typeof match> => match !== null)
    .sort((left, right) => right.score - left.score);

  return matches.length > 0 ? matches.map((match) => match.statKey) : null;
}

async function getComparisonYearsForThisYear(access: AiToolAccessPolicy): Promise<string[] | null> {
  const availableYearsResult = await executeAiTool("list_available_years", {}, access);
  if (!availableYearsResult.ok || !Array.isArray(availableYearsResult.data.years)) {
    const currentYear = String(new Date().getFullYear());
    return [String(Number(currentYear) - 1), currentYear];
  }

  const years = availableYearsResult.data.years
    .filter((value): value is string => typeof value === "string")
    .sort();

  if (years.length === 0) return null;
  if (years.length === 1) return [years[0]];
  return years.slice(-2);
}

function averageStatForYear(
  rows: Array<Record<string, unknown>>,
  year: string,
  statKey: string
): number | null {
  const values = rows
    .filter((row) => row.year === year)
    .map((row) => {
      const stats = typeof row.stats === "object" && row.stats !== null
        ? (row.stats as Record<string, unknown>)
        : null;
      const value = stats?.[statKey];
      return typeof value === "number" ? value : null;
    })
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatPercentDelta(currentValue: number, baselineValue: number): string | null {
  if (baselineValue === 0) {
    return currentValue === 0 ? "0.0%" : null;
  }

  return `${(((currentValue - baselineValue) / baselineValue) * 100).toFixed(1)}%`;
}

async function tryRunDirectLeagueSeasonTrendChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const inferredStatKeys = inferRequestedStatKeys(userMessage);
  const requestedTeam = extractTeamFromQuestion(userMessage);
  const requestedPlayer = extractPlayerNameFromQuestion(userMessage);
  const isLeagueTrendQuestion =
    /\bthis year\b/.test(normalized) &&
    Boolean(inferredStatKeys?.length) &&
    !requestedTeam &&
    !requestedPlayer &&
    (/\bcompare(?:d)?\b/.test(normalized) ||
      /\bprevious years?\b/.test(normalized) ||
      /\blast year\b/.test(normalized) ||
      /\bincrease(?:d)?\b/.test(normalized) ||
      /\bdecrease(?:d)?\b/.test(normalized) ||
      /\btrend\b/.test(normalized) ||
      /\bup\b/.test(normalized) ||
      /\bdown\b/.test(normalized));

  if (!isLeagueTrendQuestion) {
    return null;
  }

  const statKey = inferredStatKeys?.[0];
  if (!statKey) {
    return null;
  }

  const { result, activity } = await runToolForLocalFallback(
    "get_overall_stats",
    {
      entityType: "team",
      years: null,
      statKeys: [statKey],
    },
    access
  );
  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const seasonAverages = Array.isArray(result.data.seasonSummaries)
    ? result.data.seasonSummaries
        .map((entry) => {
          if (typeof entry !== "object" || entry === null) {
            return null;
          }

          const season = entry as Record<string, unknown>;
          const summary =
            typeof season.summary === "object" && season.summary !== null
              ? (season.summary as Record<string, unknown>)
              : null;
          const stats =
            summary && typeof summary.stats === "object" && summary.stats !== null
              ? (summary.stats as Record<string, unknown>)
              : null;
          const statBlock =
            stats && typeof stats[statKey] === "object" && stats[statKey] !== null
              ? (stats[statKey] as Record<string, unknown>)
              : null;
          const average = statBlock?.avg;
          const year = season.year;
          const games = season.rowCount;

          if (
            typeof year !== "string" ||
            typeof games !== "number" ||
            typeof average !== "number"
          ) {
            return null;
          }

          return {
            year,
            games,
            average,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  if (seasonAverages.length < 2) {
    return buildAiResult(
      `I couldn't find enough season-by-season evidence to compare ${statKey.toLowerCase()} this year.`,
      [
        activity,
        {
          toolName: "aggregate_league_season_stat_trend",
          arguments: { statKey, entityType: "team" },
          ok: false,
          summary: `No bounded rows were available to aggregate ${statKey.toLowerCase()} by season.`,
        },
      ],
      "direct-tools"
    );
  }

  const currentSeason = seasonAverages[seasonAverages.length - 1];
  const previousSeason = seasonAverages[seasonAverages.length - 2];
  const priorSeasons = seasonAverages.slice(0, -1);
  const priorAverage = Number(
    (
      priorSeasons.reduce((sum, season) => sum + season.average, 0) / priorSeasons.length
    ).toFixed(2)
  );
  const deltaVsPrevious = Number((currentSeason.average - previousSeason.average).toFixed(2));
  const deltaVsPriorAverage = Number((currentSeason.average - priorAverage).toFixed(2));
  const percentVsPrevious = formatPercentDelta(currentSeason.average, previousSeason.average);
  const percentVsPriorAverage = formatPercentDelta(currentSeason.average, priorAverage);
  const direction =
    deltaVsPriorAverage > 0 ? "up" : deltaVsPriorAverage < 0 ? "down" : "flat";
  const seasonBreakdown = seasonAverages
    .map((season) => `${season.year}: ${season.average.toFixed(2)} per team-game`)
    .join("; ");

  return buildAiResult(
    `${statKey} are ${direction} this year on a per team-game basis league-wide. ${currentSeason.year} is averaging ${currentSeason.average.toFixed(2)} per team-game across ${currentSeason.games} team-games vs ${previousSeason.average.toFixed(2)} in ${previousSeason.year} (${formatSignedNumber(deltaVsPrevious)}${percentVsPrevious ? `, ${percentVsPrevious}` : ""}) and ${priorAverage.toFixed(2)} across the previous ${priorSeasons.length} season${priorSeasons.length === 1 ? "" : "s"} (${formatSignedNumber(deltaVsPriorAverage)}${percentVsPriorAverage ? `, ${percentVsPriorAverage}` : ""}). Season breakdown: ${seasonBreakdown}.`,
    [
      activity,
      {
        toolName: "aggregate_league_season_stat_trend",
        arguments: { statKey, entityType: "team" },
        ok: true,
        summary: `Aggregated ${statKey.toLowerCase()} into league-wide season averages across ${seasonAverages.length} seasons.`,
      },
    ],
    "direct-tools",
    [
      buildSeasonTotalsChartArtifact(
        `${statKey} by season`,
        "League-wide per team-game average",
        `${statKey} per team-game`,
        seasonAverages.map((season) => ({
          season: season.year,
          total: season.average,
        }))
      ),
    ]
  );
}

async function tryRunDirectTeamRankingChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const inferredStatKeys = inferRequestedStatKeys(userMessage);
  const years = extractYears(userMessage);
  const isRankingQuestion =
    /\bteam\b/.test(normalized) &&
    !extractTeamFromQuestion(userMessage) &&
    Boolean(inferredStatKeys?.length) &&
    (/\bmost\b/.test(normalized) ||
      /\bleast\b/.test(normalized) ||
      /\bhighest\b/.test(normalized) ||
      /\blowest\b/.test(normalized) ||
      /\btop\b/.test(normalized) ||
      /\bbest\b/.test(normalized));

  if (!isRankingQuestion) {
    return null;
  }

  const statKey = inferredStatKeys?.[0];
  if (!statKey) {
    return null;
  }

  const ascending =
    /\bleast\b/.test(normalized) || /\blowest\b/.test(normalized);

  const { result, activity } = await runToolForLocalFallback(
    "rank_teams_by_stat",
    {
      statKey,
      years,
      limit: 3,
      sortOrder: ascending ? "asc" : "desc",
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const rankings = Array.isArray(result.data.rankings)
    ? result.data.rankings
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
        .map((entry) => ({
          team: typeof entry.team === "string" ? entry.team : null,
          avg: typeof entry.avg === "number" ? entry.avg : null,
          games: typeof entry.games === "number" ? entry.games : null,
        }))
        .filter(
          (entry): entry is { team: string; avg: number; games: number | null } =>
            entry.team !== null && entry.avg !== null
        )
    : [];

  if (rankings.length === 0) {
    return buildAiResult(
      `I couldn't find enough team data to rank ${statKey.toLowerCase()}${years?.length ? ` in ${years.join(", ")}` : ""}.`,
      [activity],
      "direct-tools"
    );
  }

  const leader = rankings[0];
  const podium = rankings
    .slice(0, 3)
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.team} ${entry.avg.toFixed(2)} per game${entry.games != null ? ` across ${entry.games} team-games` : ""}`
    )
    .join("; ");

  return buildAiResult(
    `The ${ascending ? "lowest" : "highest"} team for ${statKey.toLowerCase()}${years?.length ? ` in ${years.join(", ")}` : ""} is ${leader.team} at ${leader.avg.toFixed(2)} per game.${podium ? ` Top results: ${podium}.` : ""}`,
    [activity],
    "direct-tools"
  );
}

async function tryRunDirectPlayerTrendChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const inferredPlayerName = extractPlayerNameFromQuestion(userMessage);
  const inferredStatKeys = inferRequestedStatKeys(userMessage);
  const isTrendQuestion =
    /\bthis year\b/.test(normalized) &&
    (/\bdown\b/.test(normalized) || /\bup\b/.test(normalized) || /\bdropped\b/.test(normalized));

  if (!isTrendQuestion || !inferredPlayerName || !inferredStatKeys || inferredStatKeys.length === 0) {
    return null;
  }

  const years = await getComparisonYearsForThisYear(access);
  if (!years || years.length === 0) {
    return null;
  }

  const { result, activity } = await runToolForLocalFallback(
    "get_player_stats",
    {
      player: inferredPlayerName,
      years,
      statKeys: inferredStatKeys,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const rows = Array.isArray(result.data.rows)
    ? result.data.rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];
  const player = String(result.data.player ?? inferredPlayerName);
  const currentYear = years[years.length - 1] ?? null;
  const previousYear = years.length > 1 ? years[years.length - 2] : null;
  if (!currentYear || !previousYear) {
    return buildAiResult(
      `I need at least two seasons of data to compare ${player} year over year.`,
      [activity],
      "direct-tools"
    );
  }

  const comparisons = inferredStatKeys
    .map((statKey) => {
      const currentAvg = averageStatForYear(rows, currentYear, statKey);
      const previousAvg = averageStatForYear(rows, previousYear, statKey);
      if (currentAvg == null || previousAvg == null) return null;
      const delta = Number((currentAvg - previousAvg).toFixed(1));
      return { statKey, currentAvg, previousAvg, delta };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (comparisons.length === 0) {
    return buildAiResult(
      `I couldn't find enough season-by-season evidence to compare ${player}'s ${inferredStatKeys.join(", ")} this year.`,
      [activity],
      "direct-tools"
    );
  }

  const headline = comparisons[0];
  const direction =
    headline.delta < 0 ? "down" : headline.delta > 0 ? "up" : "flat";
  const evidence = comparisons
    .map(
      ({ statKey, currentAvg, previousAvg, delta }) =>
        `${statKey}: ${currentYear} avg ${currentAvg} vs ${previousYear} avg ${previousAvg} (${delta > 0 ? "+" : ""}${delta})`
    )
    .join("; ");

  return buildAiResult(
    `${player}'s ${headline.statKey.toLowerCase()} is ${direction} this year based on the internal stats. ${evidence}.`,
    [activity],
    "direct-tools"
  );
}

async function tryRunDirectFilteredPlayerAverageChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const player = extractPlayerNameFromQuestion(userMessage);
  const inferredStatKeys = inferRequestedStatKeys(userMessage);
  const years = await getYearsSince(userMessage, access);
  const teammateSplit = extractTeammateSplitFromQuestion(userMessage);
  const position = extractPositionFilterFromQuestion(userMessage);
  const isAverageQuestion =
    /\baverage\b/.test(normalized) || /\bavg\b/.test(normalized) || /\bmean\b/.test(normalized);

  if (!player || !inferredStatKeys || inferredStatKeys.length === 0 || !isAverageQuestion) {
    return null;
  }

  const statKey = inferredStatKeys[0];
  const filters = {
    opponent: null,
    position,
    finals: null,
    minutesOver: null,
    minutesUnder: null,
    teammate: teammateSplit?.teammate ?? null,
    teammatePosition: null,
    withWithout: teammateSplit?.withWithout ?? null,
  };

  const { result, activity } = await runToolForLocalFallback(
    "get_player_stats",
    {
      player,
      years,
      statKeys: [statKey],
      filters,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const summary =
    typeof result.data.summary === "object" && result.data.summary !== null
      ? (result.data.summary as Record<string, unknown>)
      : null;
  const stats =
    summary && typeof summary.stats === "object" && summary.stats !== null
      ? (summary.stats as Record<string, unknown>)
      : null;
  const statBlock =
    stats && typeof stats[statKey] === "object" && stats[statKey] !== null
      ? (stats[statKey] as Record<string, unknown>)
      : null;
  const average = typeof statBlock?.avg === "number" ? statBlock.avg : null;
  const games = typeof summary?.games === "number" ? summary.games : Number(result.data.rowCount ?? 0);
  const resolvedPlayer = String(result.data.player ?? player);

  if (average == null) {
    return buildAiResult(
      `I couldn't find enough ${statKey.toLowerCase()} data for ${resolvedPlayer} with those filters.`,
      [activity],
      "direct-tools"
    );
  }

  const filterParts = [
    years?.length ? `since ${years[0]}` : "",
    teammateSplit ? `${teammateSplit.withWithout} ${teammateSplit.teammate}` : "",
    position ? `while playing ${position.toLowerCase()}` : "",
  ].filter(Boolean);

  return buildAiResult(
    `${resolvedPlayer} averages ${average.toFixed(2)} ${statKey}${filterParts.length ? ` ${filterParts.join(", ")}` : ""} across ${games} games.`,
    [activity],
    "direct-tools"
  );
}

async function getLocalFallbackYears(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<string[] | null> {
  const explicitYears = extractYears(userMessage);
  if (explicitYears) {
    return explicitYears;
  }

  const relativeSeasonCount = parseRelativeSeasonCount(userMessage);
  if (relativeSeasonCount != null) {
    const availableYearsResult = await executeAiTool("list_available_years", {}, access);
    if (!availableYearsResult.ok || !Array.isArray(availableYearsResult.data.years)) {
      return null;
    }

    const currentYear = String(new Date().getFullYear());
    const sortedYears = availableYearsResult.data.years
      .filter((value): value is string => typeof value === "string")
      .sort();
    const completedYears = sortedYears.filter((year) => year < currentYear);
    const sourceYears = completedYears.length >= relativeSeasonCount ? completedYears : sortedYears;
    return sourceYears.slice(-relativeSeasonCount);
  }

  if (!/\bthis year\b/i.test(userMessage)) {
    return null;
  }

  const availableYearsResult = await executeAiTool("list_available_years", {}, access);
  if (!availableYearsResult.ok || !Array.isArray(availableYearsResult.data.years)) {
    return [String(new Date().getFullYear())];
  }

  const currentYear = String(new Date().getFullYear());
  const years = availableYearsResult.data.years.filter(
    (value): value is string => typeof value === "string"
  );

  if (years.includes(currentYear)) {
    return [currentYear];
  }

  return years.length > 0 ? [years[0]] : [currentYear];
}

async function tryRunDirectPlayerProfileChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const profileQuestion = extractDirectPlayerProfileQuestion(userMessage);
  if (!profileQuestion) {
    return null;
  }

  const years = await getLocalFallbackYears(userMessage, access);
  const { result, activity } = await runToolForLocalFallback(
    "get_player_stats",
    {
      player: profileQuestion.player,
      years,
      statKeys: null,
      filters: null,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(
      result.suggestions && result.suggestions.length > 0
        ? `I couldn’t match "${profileQuestion.player}" confidently. Did you mean ${result.suggestions.join(", ")}?`
        : result.error,
      [activity],
      "direct-tools"
    );
  }

  const player = String(result.data.player ?? profileQuestion.player);
  const summary =
    typeof result.data.summary === "object" && result.data.summary !== null
      ? (result.data.summary as Record<string, unknown>)
      : null;
  const positions = Array.isArray(summary?.positions)
    ? summary.positions.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : [];
  const teams = Array.isArray(summary?.teams)
    ? summary.teams.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : [];
  const yearText = years?.length ? ` in ${years.join(", ")}` : "";

  if (profileQuestion.field === "position") {
    return buildAiResult(
      positions.length === 0
        ? `I couldn’t find a listed position for ${player}${yearText}.`
        : positions.length === 1
          ? `${player}'s listed position${yearText} is ${positions[0]}.`
          : `${player}'s listed positions${yearText} are ${positions.join(" / ")}.`,
      [activity],
      "direct-tools"
    );
  }

  return buildAiResult(
    teams.length === 0
      ? `I couldn’t find a listed team for ${player}${yearText}.`
      : teams.length === 1
        ? `${player} plays for ${teams[0]}${yearText}.`
        : `${player} has played for ${teams.join(" / ")}${yearText}.`,
    [activity],
    "direct-tools"
  );
}

async function tryRunDirectTeamWinsChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const team = extractTeamFromQuestion(userMessage);
  const isWinQuestion =
    (/\bhow many\b/.test(normalized) || /\bcount\b/.test(normalized) || /\brecord\b/.test(normalized)) &&
    (/\bwon\b/.test(normalized) || /\bwins?\b/.test(normalized));

  if (!team || !isWinQuestion) {
    return null;
  }

  const years = await getLocalFallbackYears(userMessage, access);
  const matches = await fetchMatches(years ?? undefined);
  const teamMatches = matches.filter((match) => match.Home === team || match.Away === team);

  if (teamMatches.length === 0) {
    return buildAiResult(
      `I couldn't find any match results for ${team}${years?.length ? ` in ${years.join(", ")}` : ""}.`,
      [
        {
          toolName: "count_team_wins",
          arguments: { team, years },
          ok: false,
          summary: `No bounded match rows were available for ${team}.`,
        },
      ],
      "direct-tools"
    );
  }

  const wins = teamMatches.filter((match) => {
    if (match.Home === team) {
      return match.Home_Score > match.Away_Score;
    }

    return match.Away_Score > match.Home_Score;
  }).length;
  const draws = teamMatches.filter((match) => match.Home_Score === match.Away_Score).length;
  const losses = teamMatches.length - wins - draws;
  const latestYear = [...new Set(teamMatches.map((match) => match.Year))].sort().at(-1) ?? null;
  const yearLabel =
    years?.length === 1 ? years[0] : /\bthis year\b/i.test(userMessage) ? latestYear : null;
  const periodLabel = yearLabel ? ` in ${yearLabel}` : "";
  const recordSuffix =
    draws > 0
      ? ` Their record is ${wins}-${losses}-${draws}.`
      : ` Their record is ${wins}-${losses}.`;

  return buildAiResult(
    `${team} have won ${wins} game${wins === 1 ? "" : "s"}${periodLabel}.${recordSuffix}`,
    [
      {
        toolName: "count_team_wins",
        arguments: { team, years },
        ok: true,
        summary: `Counted ${wins} wins from ${teamMatches.length} bounded match rows for ${team}.`,
      },
    ],
    "direct-tools"
  );
}

async function tryRunDirectTeamWeekdaySplitChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const isWeekdaySplitQuestion =
    /\bteams?\b/.test(normalized) &&
    /\brecord\b/.test(normalized) &&
    /\bweekend\b/.test(normalized) &&
    (/\bthursday\b/.test(normalized) || /\bfri(?:day)?\b/.test(normalized));

  if (!isWeekdaySplitQuestion) {
    return null;
  }

  const years = await getLocalFallbackYears(userMessage, access);
  const rows = (await fetchTeamStats(years ?? undefined)).filter((row) => {
    if (!row.Date) return false;
    const day = new Date(`${row.Date}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 4 || day === 5 || day === 6;
  });

  const records = new Map<
    string,
    {
      weekdayWins: number;
      weekdayLosses: number;
      weekdayDraws: number;
      weekendWins: number;
      weekendLosses: number;
      weekendDraws: number;
    }
  >();

  rows.forEach((row) => {
    const day = new Date(`${row.Date}T00:00:00Z`).getUTCDay();
    const bucket =
      records.get(row.Team) ??
      {
        weekdayWins: 0,
        weekdayLosses: 0,
        weekdayDraws: 0,
        weekendWins: 0,
        weekendLosses: 0,
        weekendDraws: 0,
      };
    const isWeekdayNight = day === 4 || day === 5;
    const keyPrefix = isWeekdayNight ? "weekday" : "weekend";

    if (row.Result === "Win") {
      bucket[`${keyPrefix}Wins` as const] += 1;
    } else if (row.Result === "Loss") {
      bucket[`${keyPrefix}Losses` as const] += 1;
    } else {
      bucket[`${keyPrefix}Draws` as const] += 1;
    }

    records.set(row.Team, bucket);
  });

  const ranked = [...records.entries()]
    .map(([team, record]) => {
      const weekdayGames = record.weekdayWins + record.weekdayLosses + record.weekdayDraws;
      const weekendGames = record.weekendWins + record.weekendLosses + record.weekendDraws;
      if (weekdayGames === 0 || weekendGames === 0) return null;

      const weekdayWinRate = (record.weekdayWins + record.weekdayDraws * 0.5) / weekdayGames;
      const weekendWinRate = (record.weekendWins + record.weekendDraws * 0.5) / weekendGames;

      return {
        team,
        ...record,
        weekdayGames,
        weekendGames,
        weekdayWinRate,
        weekendWinRate,
        edge: weekdayWinRate - weekendWinRate,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      if (right.edge !== left.edge) return right.edge - left.edge;
      if (right.weekdayWinRate !== left.weekdayWinRate) return right.weekdayWinRate - left.weekdayWinRate;
      return right.weekdayGames - left.weekdayGames;
    })
    .slice(0, 5);

  const yearText = years?.length ? ` from ${years[0]} to ${years[years.length - 1]}` : "";
  const formatRecord = (wins: number, losses: number, draws: number) =>
    draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  if (ranked.length === 0) {
    return buildAiResult(
      `I couldn't find enough Thursday/Friday and weekend results to compare teams${yearText}.`,
      [
        {
          toolName: "compare_team_weekday_weekend_records",
          arguments: { years },
          ok: false,
          summary: "No comparable team weekday/weekend records were available.",
        },
      ],
      "direct-tools"
    );
  }

  const lines = ranked
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.team}: Thu/Fri ${formatRecord(
          entry.weekdayWins,
          entry.weekdayLosses,
          entry.weekdayDraws
        )} (${formatPercent(entry.weekdayWinRate)}) vs weekend ${formatRecord(
          entry.weekendWins,
          entry.weekendLosses,
          entry.weekendDraws
        )} (${formatPercent(entry.weekendWinRate)})`
    )
    .join("\n");

  return buildAiResult(
    `I treated Thursday/Friday night games as all Thursday and Friday fixtures, and weekend as Saturday/Sunday.\n\nBiggest Thursday/Friday record edge${yearText}:\n${lines}`,
    [
      {
        toolName: "compare_team_weekday_weekend_records",
        arguments: { years },
        ok: true,
        summary: `Compared Thursday/Friday and weekend records for ${records.size} teams.`,
      },
    ],
    "direct-tools"
  );
}

async function tryRunDirectTeamPreviousResultSplitChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const previousResult = /\bfollowing (?:a )?loss\b|\bafter (?:a )?loss\b/.test(normalized)
    ? "Loss"
    : /\bfollowing (?:a )?win\b|\bafter (?:a )?win\b/.test(normalized)
      ? "Win"
      : null;
  const isTeamQuestion = /\bteams?\b/.test(normalized);
  const asksRanking =
    /\bbest\b/.test(normalized) ||
    /\btop\b/.test(normalized) ||
    /\bhighest\b/.test(normalized) ||
    /\brank/.test(normalized);
  const asksRecord = /\brecord\b/.test(normalized);
  const asksPointDiff =
    /\bpoints? diff/.test(normalized) ||
    /\bdifferential\b/.test(normalized) ||
    /\bmargin\b/.test(normalized);

  if (!previousResult || !isTeamQuestion || (!asksRanking && !asksRecord && !asksPointDiff)) {
    return null;
  }

  const years = await getLocalFallbackYears(userMessage, access);
  const requestedYearSet = years ? new Set(years) : null;
  const rows = (await fetchTeamStats())
    .filter((row) => row.Date && (!requestedYearSet || requestedYearSet.has(row.Year)))
    .sort((left, right) => {
      if (left.Team !== right.Team) return left.Team.localeCompare(right.Team);
      return left.Date.localeCompare(right.Date);
    });

  const allRows = (await fetchTeamStats()).filter((row) => row.Date).sort((left, right) => {
    if (left.Team !== right.Team) return left.Team.localeCompare(right.Team);
    return left.Date.localeCompare(right.Date);
  });
  const rowKeys = new Set(rows.map((row) => `${row.Team}|${row.Date}|${row.Round}`));
  const byTeam = new Map<string, typeof allRows>();
  allRows.forEach((row) => {
    const bucket = byTeam.get(row.Team) ?? [];
    bucket.push(row);
    byTeam.set(row.Team, bucket);
  });

  const records = new Map<
    string,
    { games: number; wins: number; losses: number; draws: number; pointsFor: number; pointsAgainst: number; diff: number }
  >();

  byTeam.forEach((teamRows, team) => {
    teamRows.forEach((row, index) => {
      const previous = teamRows[index - 1];
      if (!previous || previous.Result !== previousResult) return;
      if (!rowKeys.has(`${row.Team}|${row.Date}|${row.Round}`)) return;

      const bucket =
        records.get(team) ?? {
          games: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          diff: 0,
        };
      bucket.games += 1;
      bucket.pointsFor += row.Points;
      bucket.pointsAgainst += row["Opponent Points"];
      bucket.diff += row["Point Differential"];
      if (row.Result === "Win") bucket.wins += 1;
      else if (row.Result === "Loss") bucket.losses += 1;
      else bucket.draws += 1;
      records.set(team, bucket);
    });
  });

  const useAverage = /\baverage\b|\bavg\b|\bper game\b/.test(normalized);
  const ranked = [...records.entries()]
    .map(([team, record]) => ({
      team,
      ...record,
      avgDiff: record.games > 0 ? record.diff / record.games : 0,
      winRate: record.games > 0 ? (record.wins + record.draws * 0.5) / record.games : 0,
    }))
    .filter((entry) => entry.games > 0)
    .sort((left, right) => {
      const leftValue = asksPointDiff ? (useAverage ? left.avgDiff : left.diff) : left.winRate;
      const rightValue = asksPointDiff ? (useAverage ? right.avgDiff : right.diff) : right.winRate;
      if (rightValue !== leftValue) return rightValue - leftValue;
      return right.games - left.games;
    })
    .slice(0, 5);

  const yearText = years?.length ? ` from ${years[0]} to ${years[years.length - 1]}` : "";
  const formatRecord = (wins: number, losses: number, draws: number) =>
    draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
  const formatSigned = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(useAverage ? 1 : 0)}`;

  if (ranked.length === 0) {
    return buildAiResult(
      `I couldn't find enough games after a ${previousResult.toLowerCase()} to compare teams${yearText}.`,
      [
        {
          toolName: "compare_team_previous_result_records",
          arguments: { years, previousResult },
          ok: false,
          summary: `No team games after a ${previousResult.toLowerCase()} were available.`,
        },
      ],
      "direct-tools"
    );
  }

  const lines = ranked
    .map((entry, index) => {
      const mainValue = asksPointDiff
        ? `${formatSigned(useAverage ? entry.avgDiff : entry.diff)} point differential${useAverage ? " per game" : ""}`
        : `${Math.round(entry.winRate * 100)}% win rate`;
      return `${index + 1}. ${entry.team}: ${mainValue}, ${formatRecord(
        entry.wins,
        entry.losses,
        entry.draws
      )} across ${entry.games} games`;
    })
    .join("\n");

  return buildAiResult(
    `Best teams after a ${previousResult.toLowerCase()}${yearText}:\n${lines}`,
    [
      {
        toolName: "compare_team_previous_result_records",
        arguments: { years, previousResult, useAverage },
        ok: true,
        summary: `Compared team records after a ${previousResult.toLowerCase()} for ${records.size} teams.`,
      },
    ],
    "direct-tools"
  );
}

async function getYearsSince(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<string[] | null> {
  const explicitYears = extractYears(userMessage);
  if (explicitYears && explicitYears.length > 1) {
    return explicitYears;
  }

  const sinceMatch = userMessage.match(/\bsince\s+(20\d{2})\b/i);
  const startYear = sinceMatch?.[1];
  if (!startYear) {
    return explicitYears;
  }

  const availableYearsResult = await executeAiTool("list_available_years", {}, access);
  if (!availableYearsResult.ok || !Array.isArray(availableYearsResult.data.years)) {
    return [startYear];
  }

  return availableYearsResult.data.years
    .filter((year): year is string => typeof year === "string")
    .filter((year) => year >= startYear)
    .sort();
}

function buildLocalFallbackHelpMessage(reason: string): string {
  return [
    `Local AI fallback is active because ${reason}.`,
    `The chat route is still working, but the answer is being generated without OpenAI for local testing.`,
    `Try prompts like: available years, betting h2h, compare "Nathan Cleary" and "Nicho Hynes", or player "Kalyn Ponga".`,
  ].join(" ");
}

function parseRequestedRound(userMessage: string): number | null {
  const roundMatch = userMessage.match(/\bround\s+(\d{1,2})\b/i);
  if (!roundMatch) return null;
  const round = Number.parseInt(roundMatch[1] ?? "", 10);
  return Number.isFinite(round) ? round : null;
}

function parseRequestedTopCount(userMessage: string, defaultValue: number, maxValue: number): number {
  const topMatch = userMessage.match(/\btop\s+(\d{1,2})\b/i);
  if (!topMatch) {
    return defaultValue;
  }

  const count = Number.parseInt(topMatch[1] ?? "", 10);
  if (!Number.isFinite(count) || count < 1) {
    return defaultValue;
  }

  return Math.min(count, maxValue);
}

function formatFantasyPrice(cost: number | null): string {
  if (cost == null || !Number.isFinite(cost)) return "-";
  return `$${Math.round(cost / 1000)}k`;
}

async function tryRunDirectFantasyProjectionValueChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const isProjectionValuePrompt =
    /\bpriced at\b/.test(normalized) &&
    (/\bprojection\b/.test(normalized) || /\bprojected\b/.test(normalized)) &&
    (/\brank\b/.test(normalized) || /\btop\b/.test(normalized) || /\bdifference\b/.test(normalized) || /\bdiff\b/.test(normalized));

  if (!isProjectionValuePrompt) {
    return null;
  }

  const requestedRound = parseRequestedRound(userMessage);
  const requestedLimit = parseRequestedTopCount(userMessage, 10, 10);
  const { result, activity } = await runToolForLocalFallback(
    "get_fantasy_snapshot",
    {
      round: requestedRound,
      positions: null,
      priceMax: null,
      sortBy: "projection_vs_priced_at_desc",
      requireOwnershipRise: false,
      excludeLocked: false,
      limit: requestedLimit,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const warnings = Array.isArray(result.data.warnings)
    ? result.data.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const players = Array.isArray(result.data.players)
    ? result.data.players.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];

  const rankedPlayers = players
    .map((entry) => {
      const projection =
        typeof entry.projection === "number"
          ? entry.projection
          : typeof entry.projectedAvg === "number"
            ? entry.projectedAvg
            : null;
      const pricedAt = typeof entry.pricedAt === "number" ? entry.pricedAt : null;
      const difference =
        typeof entry.projectionVsPricedAt === "number"
          ? entry.projectionVsPricedAt
          : projection != null && pricedAt != null
            ? Number((projection - pricedAt).toFixed(2))
            : null;

      return {
        entry,
        projection,
        pricedAt,
        difference,
      };
    })
    .filter((entry) => entry.projection != null && entry.pricedAt != null && entry.difference != null)
    .sort((left, right) => (right.difference ?? -Infinity) - (left.difference ?? -Infinity))
    .slice(0, requestedLimit);

  const roundLabel =
    typeof result.data.requestedRound === "number"
      ? result.data.requestedRound
      : rankedPlayers.find((item) => typeof item.entry.round === "number")?.entry.round ?? null;

  if (rankedPlayers.length === 0) {
    return buildAiResult(
      warnings[0] ??
        (requestedRound != null
          ? `I couldn't find enough fantasy projection data to rank projection vs priced-at value for Round ${requestedRound}.`
          : "I couldn't find enough fantasy projection data to rank projection vs priced-at value right now."),
      [activity],
      "direct-tools"
    );
  }

  const lines = rankedPlayers.map(({ entry, projection, pricedAt, difference }, index) => {
    const position = typeof entry.position === "string" ? entry.position : "N/A";
    const price = typeof entry.price === "number" ? formatFantasyPrice(entry.price) : "-";
    const formattedDifference =
      typeof difference === "number"
        ? `${difference > 0 ? "+" : ""}${difference.toFixed(1)}`
        : "-";
    return `${index + 1}. ${String(entry.name ?? "Unknown")} (${position}) - proj ${projection?.toFixed(1)}, priced at ${pricedAt?.toFixed(1)}, diff ${formattedDifference}, price ${price}`;
  });

  return buildAiResult(
    `Top ${rankedPlayers.length} projection vs priced-at differences${roundLabel != null ? ` for Round ${roundLabel}` : ""}:\n${lines.join("\n")}${warnings.length > 0 ? `\n\nNotes:\n- ${warnings.join("\n- ")}` : ""}`,
    [activity],
    "direct-tools"
  );
}

async function tryRunDirectBaseFantasyRatioChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const requestedPlayer = extractPlayerNameFromQuestion(userMessage);
  const mentionsRatio = /\bratio\b/.test(normalized) || /\bratios\b/.test(normalized);
  const requestsRanking =
    /\bhighest\b/.test(normalized) ||
    /\blowest\b/.test(normalized) ||
    /\bbest\b/.test(normalized) ||
    /\bworst\b/.test(normalized) ||
    /\brank\b/.test(normalized);
  const requestsOverview =
    !requestedPlayer && /\b(show|list|display)\b/.test(normalized);
  const isBaseFantasyRatioPrompt =
    /\bbase\b/.test(normalized) &&
    /\bfantasy\b/.test(normalized) &&
    mentionsRatio &&
    (requestsRanking || requestsOverview);

  if (!isBaseFantasyRatioPrompt) {
    return null;
  }

  const years = extractYears(userMessage);
  const requestedLimit = parseRequestedTopCount(userMessage, 5, 10);
  const { result, activity } = await runToolForLocalFallback(
    "get_player_base_fantasy_ratios",
    {
      years,
      limit: requestedLimit,
      minGames: 3,
      position: null,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const highest = Array.isArray(result.data.highest)
    ? result.data.highest.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];
  const lowest = Array.isArray(result.data.lowest)
    ? result.data.lowest.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];
  const minGames = typeof result.data.minGames === "number" ? result.data.minGames : 3;
  const yearLabel = Array.isArray(result.data.years) ? result.data.years.join(", ") : result.data.years;

  const formatEntry = (entry: Record<string, unknown>, index: number) => {
    const player = typeof entry.player === "string" ? entry.player : "Unknown";
    const team = typeof entry.team === "string" ? entry.team : "N/A";
    const position = typeof entry.position === "string" ? entry.position : "N/A";
    const ratio = typeof entry.ratio === "number" ? entry.ratio.toFixed(2) : "-";
    const basePerGame = typeof entry.basePerGame === "number" ? entry.basePerGame.toFixed(1) : "-";
    const fantasyPerGame = typeof entry.fantasyPerGame === "number" ? entry.fantasyPerGame.toFixed(1) : "-";
    const games = typeof entry.games === "number" ? entry.games : "-";
    return `${index + 1}. ${player} (${team}, ${position}) - ratio ${ratio}, base/g ${basePerGame}, fantasy/g ${fantasyPerGame}, games ${games}`;
  };

  const sections: string[] = [];
  if (highest.length > 0) {
    sections.push(`Highest:\n${highest.map(formatEntry).join("\n")}`);
  }
  if (lowest.length > 0) {
    sections.push(`Lowest:\n${lowest.map(formatEntry).join("\n")}`);
  }

  if (sections.length === 0) {
    return buildAiResult(
      `I couldn't find enough player rows to rank base-to-fantasy ratios${yearLabel && yearLabel !== "all" ? ` for ${yearLabel}` : ""}.`,
      [activity],
      "direct-tools"
    );
  }

  return buildAiResult(
    `Base-to-fantasy ratio rankings${yearLabel && yearLabel !== "all" ? ` for ${yearLabel}` : ""} (minimum ${minGames} games). Base is defined as floor(all run metres / 10) + tackles made + floor(kicking metres / 30) + (conversions * 2).\n\n${sections.join("\n\n")}`,
    [activity],
    "direct-tools"
  );
}

async function tryRunDirectFantasyBuyChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const isFantasyBuyPrompt =
    /\bfantasy\b/.test(normalized) &&
    (/\b(best|top|value)\b.*\b(buy|buys)\b/.test(normalized) ||
      /\b(buy|buys)\b.*\b(best|top|value)\b/.test(normalized) ||
      /\bcash cow\b/.test(normalized) ||
      /\bcheapie\b/.test(normalized) ||
      /\bpod\b/.test(normalized) ||
      /\bmust[- ]buy\b/.test(normalized) ||
      /\btrade[- ]in\b/.test(normalized));

  if (!isFantasyBuyPrompt) {
    return null;
  }

  const requestedRound = parseRequestedRound(userMessage);
  const { result, activity } = await runToolForLocalFallback(
    "get_fantasy_snapshot",
    {
      round: requestedRound,
      positions: null,
      priceMax: null,
      requireOwnershipRise: false,
      excludeLocked: true,
      limit: 5,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const warnings = Array.isArray(result.data.warnings)
    ? result.data.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const players = Array.isArray(result.data.players)
    ? result.data.players.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];
  const roundLabel =
    typeof result.data.requestedRound === "number"
      ? result.data.requestedRound
      : players.find((entry) => typeof entry.round === "number")?.round ?? null;

  if (players.length === 0) {
    return buildAiResult(
      warnings[0] ??
        (requestedRound != null
          ? `I couldn't find enough fantasy snapshot data to rank buys for Round ${requestedRound}.`
          : "I couldn't find enough fantasy snapshot data to rank buys right now."),
      [activity],
      "direct-tools"
    );
  }

  const lines = players.map((entry, index) => {
    const position = typeof entry.position === "string" ? entry.position : "N/A";
    const price = typeof entry.price === "number" ? formatFantasyPrice(entry.price) : "-";
    const ownershipDelta =
      typeof entry.ownershipDelta === "number"
        ? `, ownership delta ${entry.ownershipDelta > 0 ? "+" : ""}${entry.ownershipDelta.toFixed(1)}%`
        : "";
    const projection =
      typeof entry.projection === "number" ? `, proj ${entry.projection}` : "";
    const breakEven =
      typeof entry.breakEven === "number" ? `, BE ${entry.breakEven}` : "";
    const ownedBy =
      typeof entry.ownedBy === "number" ? `, owned ${entry.ownedBy.toFixed(1)}%` : "";

    return `${index + 1}. ${String(entry.name ?? "Unknown")} (${position}) - price ${price}${ownedBy}${ownershipDelta}${projection}${breakEven}`;
  });

  return buildAiResult(
    `Best fantasy buys${roundLabel != null ? ` for Round ${roundLabel}` : ""}:\n${lines.join("\n")}${warnings.length > 0 ? `\n\nNotes:\n- ${warnings.join("\n- ")}` : ""}`,
    [activity],
    "direct-tools"
  );
}

function hasFantasyTradeContext(
  userMessage: string,
  history: AiConversationHistoryMessage[] | undefined
): boolean {
  const contextText = [
    userMessage,
    ...(history ?? []).slice(-4).map((entry) => entry.content),
  ].join("\n").toLowerCase();

  return (
    /\bfantasy\b/.test(contextText) ||
    /\btrade(?:s|d|[- ]?in|[- ]?out)?\b/.test(contextText) ||
    /\bbank\b/.test(contextText) ||
    /\bbreakeven\b|\bbe\b/.test(contextText) ||
    /\bpriced at\b/.test(contextText) ||
    /\bownership\b/.test(contextText)
  );
}

function extractFantasyPositionFollowUp(userMessage: string): string[] | null {
  const normalized = userMessage.toLowerCase();

  if (/\bhooker(?:s)?\b|\bhok\b/.test(normalized)) return ["HOK"];
  if (/\bhalf(?:back|backs|ves)?\b|\bfive[- ]?eighths?\b|\bhlf\b/.test(normalized)) return ["HLF"];
  if (/\bmiddle(?:s)?\b|\bprop(?:s)?\b|\block(?:s)?\b|\bmid\b/.test(normalized)) return ["MID"];
  if (/\bedge(?:s)?\b|\bsecond[- ]row(?:ers)?\b|\b2rf\b|\bback[- ]row(?:ers)?\b/.test(normalized)) return ["EDG"];
  if (/\bcentre(?:s)?\b|\bcenter(?:s)?\b|\bctr\b/.test(normalized)) return ["CTR"];
  if (/\bwfb\b|\bfullback(?:s)?\b|\bwing(?:er|ers|s)?\b/.test(normalized)) return ["WFB"];

  return null;
}

async function tryRunDirectFantasyPositionTradeFollowUpChat(
  userMessage: string,
  history: AiConversationHistoryMessage[] | undefined,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  const normalized = userMessage.toLowerCase();
  const positions = extractFantasyPositionFollowUp(userMessage);
  if (!positions || !hasFantasyTradeContext(userMessage, history)) {
    return null;
  }

  const isTradeIntent =
    /\btrade(?:s|d|[- ]?in|[- ]?out)?\b/.test(normalized) ||
    /\bbuy\b|\bsell\b|\bswap\b|\bupgrade\b|\breplace\b|\bsure up\b|\bshore up\b/.test(normalized) ||
    /\bspot\b/.test(normalized) ||
    /\bunreliable\b/.test(normalized) ||
    /\bhold\b/.test(normalized);

  if (!isTradeIntent) {
    return null;
  }

  const requestedRound = parseRequestedRound(userMessage);
  const { result, activity } = await runToolForLocalFallback(
    "get_fantasy_snapshot",
    {
      round: requestedRound,
      positions,
      priceMax: null,
      sortBy: hasAiProDataAccess(access.plan) ? "projection_vs_priced_at_desc" : "avg_points_desc",
      requireOwnershipRise: false,
      excludeLocked: true,
      limit: 8,
    },
    access
  );

  if (!result.ok) {
    return buildAiResult(result.error, [activity], "direct-tools");
  }

  const warnings = Array.isArray(result.data.warnings)
    ? result.data.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const players = Array.isArray(result.data.players)
    ? result.data.players.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];
  const mentionedLussick = /\blussick\b/.test(normalized);
  const mentionedHughes = /\bhughes\b/.test(normalized);
  const excludedNames = mentionedLussick ? ["lussick"] : [];
  const candidates = players.filter((entry) => {
    const name = typeof entry.name === "string" ? entry.name.toLowerCase() : "";
    return !excludedNames.some((excluded) => name.includes(excluded));
  });

  if (candidates.length === 0) {
    return buildAiResult(
      "I couldn't find enough current fantasy snapshot data to suggest a clean positional trade-in.",
      [activity],
      "direct-tools"
    );
  }

  const positionLabel = positions[0] === "HOK" ? "hooker" : positions[0]?.toLowerCase() ?? "position";
  const lines = candidates.slice(0, 5).map((entry, index) => {
    const price = typeof entry.price === "number" ? formatFantasyPrice(entry.price) : "-";
    const avg = typeof entry.avgPoints === "number" ? `avg ${entry.avgPoints.toFixed(1)}` : null;
    const last3 = typeof entry.last3Avg === "number" ? `L3 ${entry.last3Avg.toFixed(1)}` : null;
    const pricedAt = typeof entry.pricedAt === "number" ? `priced at ${entry.pricedAt.toFixed(1)}` : null;
    const ownershipDelta =
      typeof entry.ownershipDelta === "number"
        ? `ownership ${entry.ownershipDelta > 0 ? "+" : ""}${entry.ownershipDelta.toFixed(1)}%`
        : null;
    const projection = typeof entry.projection === "number" ? `proj ${entry.projection.toFixed(1)}` : null;
    const breakEven = typeof entry.breakEven === "number" ? `BE ${entry.breakEven}` : null;
    const details = [avg, last3, pricedAt, projection, breakEven, ownershipDelta].filter(Boolean).join(", ");

    return `${index + 1}. ${String(entry.name ?? "Unknown")} - ${price}${details ? `, ${details}` : ""}`;
  });

  return buildAiResult(
    [
      mentionedLussick
        ? `For a ${positionLabel} upgrade, I would treat Freddy Lussick as the trade-out and use bank/trade count to choose the price tier.`
        : `For a ${positionLabel} upgrade, these are the current options I would check first.`,
      mentionedHughes ? "Holding Jahrome Hughes for a one-week absence is reasonable unless your squad has no playable cover." : "",
      lines.join("\n"),
      "If your bank is tight, take the best option you can afford from that list rather than forcing a second trade.",
      warnings.length > 0 ? `Notes:\n- ${warnings.join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n"),
    [activity],
    "direct-tools"
  );
}

function sumRequestedStatFromRows(
  rows: unknown,
  statKey: string
): number | null {
  if (!Array.isArray(rows)) {
    return null;
  }

  const values = rows
    .map((row) => {
      if (typeof row !== "object" || row === null) return null;
      const stats =
        "stats" in row && typeof row.stats === "object" && row.stats !== null
          ? (row.stats as Record<string, unknown>)
          : null;
      const value = stats?.[statKey];
      return typeof value === "number" ? value : null;
    })
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

async function runLocalAiFallbackChat(
  userMessage: string,
  reason: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult> {
  const directComparisonResult = await tryRunDirectPlayerComparisonChat(userMessage, access);
  if (directComparisonResult) {
    return directComparisonResult;
  }

  const normalized = userMessage.toLowerCase();
  const quotedValues = extractQuotedValues(userMessage);
  const years = await getLocalFallbackYears(userMessage, access);
  const toolActivity: AiToolActivity[] = [];

  const inferredPlayerName = quotedValues[0] ?? extractPlayerNameFromQuestion(userMessage);
  const inferredStatKeys = inferRequestedStatKeys(userMessage);

  if (
    inferredPlayerName &&
    (normalized.includes("how many") ||
      normalized.includes("does ") ||
      normalized.includes("player ") ||
      normalized.includes("stats for"))
  ) {
    const { result, activity } = await runToolForLocalFallback("get_player_stats", {
      player: inferredPlayerName,
      years,
      statKeys: inferredStatKeys,
    }, access);
    toolActivity.push(activity);

    if (result.ok) {
      const player = String(result.data.player ?? inferredPlayerName);
      const rowCount = Number(result.data.rowCount ?? 0);
      const summaryStats =
        typeof result.data.summary === "object" && result.data.summary !== null
          ? (result.data.summary as Record<string, unknown>)
          : null;
      const statsBlock =
        summaryStats && typeof summaryStats.stats === "object" && summaryStats.stats !== null
          ? (summaryStats.stats as Record<string, unknown>)
          : null;
      const rows = Array.isArray(result.data.rows) ? result.data.rows : null;

      if (statsBlock && inferredStatKeys && inferredStatKeys.length > 0 && normalized.includes("how many")) {
        const statSummaries = inferredStatKeys
          .map((statKey) => {
            const total = sumRequestedStatFromRows(rows, statKey);
            return `${statKey}: total ${String(total ?? "-")}`;
          })
          .join("; ");

        return {
          ...buildAiResult(
            `${buildLocalFallbackHelpMessage(reason)} ${player} has ${statSummaries}${years?.length ? ` in ${years.join(", ")}` : ""}.`,
            toolActivity,
            "local-fallback"
          ),
        };
      }

      if (statsBlock && inferredStatKeys && inferredStatKeys.length > 0) {
        const statSummaries = inferredStatKeys
          .map((statKey) => {
            const block =
              typeof statsBlock[statKey] === "object" && statsBlock[statKey] !== null
                ? (statsBlock[statKey] as Record<string, unknown>)
                : null;
            const avg = block?.avg;
            const max = block?.max;
            return `${statKey}: avg ${String(avg ?? "-")}, max ${String(max ?? "-")}`;
          })
          .join("; ");

        return {
          ...buildAiResult(
            `${buildLocalFallbackHelpMessage(reason)} Retrieved ${rowCount} bounded rows for ${player}${years?.length ? ` in ${years.join(", ")}` : ""}. ${statSummaries}`,
            toolActivity,
            "local-fallback"
          ),
        };
      }

      return buildAiResult(
        `${buildLocalFallbackHelpMessage(reason)} Retrieved bounded player stats for ${player} across ${rowCount} rows${years?.length ? ` in ${years.join(", ")}` : ""}.`,
        toolActivity,
        "local-fallback"
      );
    }
  }

  if (normalized.includes("year") || normalized.includes("season")) {
    const { result, activity } = await runToolForLocalFallback("list_available_years", {}, access);
    toolActivity.push(activity);

    if (result.ok && Array.isArray(result.data.years)) {
      return buildAiResult(
        `${buildLocalFallbackHelpMessage(reason)} Available years: ${result.data.years.join(", ")}.`,
        toolActivity,
        "local-fallback"
      );
    }
  }

  if (normalized.includes("bet") || normalized.includes("odds") || normalized.includes("h2h") || normalized.includes("line") || normalized.includes("total")) {
    const market = normalized.includes("line")
      ? "Line"
      : normalized.includes("total")
        ? "Total"
        : normalized.includes("h2h")
          ? "H2H"
          : null;
    const input = {
      market,
      dateFrom: null,
      dateTo: null,
    };
    const { result, activity } = await runToolForLocalFallback("get_betting_snapshot", input, access);
    toolActivity.push(activity);

    if (result.ok && Array.isArray(result.data.rows)) {
      const rows = result.data.rows as Array<Record<string, unknown>>;
      const preview = rows
        .slice(0, 3)
        .map((row) => `${String(row.match)} ${String(row.result)} @ ${String(row.bestPrice ?? "-")}`)
        .join("; ");

      return buildAiResult(
        `${buildLocalFallbackHelpMessage(reason)} Retrieved ${rows.length} bounded betting rows${market ? ` for ${market}` : ""}. ${preview || "No rows matched the current filters."}`,
        toolActivity,
        "local-fallback"
      );
    }
  }

  if ((normalized.includes("compare") || normalized.includes("vs")) && quotedValues.length >= 2) {
    const { result, activity } = await runToolForLocalFallback("compare_players", {
      players: quotedValues.slice(0, 4),
      stats: null,
      years,
    }, access);
    toolActivity.push(activity);

    if (result.ok && Array.isArray(result.data.comparisons)) {
      const comparisons = result.data.comparisons as Array<Record<string, unknown>>;
      const summary = comparisons
        .map((entry) => `${String(entry.player)}: ${String(entry.games)} games`)
        .join("; ");

      return buildAiResult(
        `${buildLocalFallbackHelpMessage(reason)} Compared ${comparisons.length} players. ${summary}`,
        toolActivity,
        "local-fallback"
      );
    }
  }

  if ((normalized.includes("player") || normalized.includes("stats for")) && inferredPlayerName) {
    const { result, activity } = await runToolForLocalFallback("get_player_stats", {
      player: inferredPlayerName,
      years,
      statKeys: inferredStatKeys,
    }, access);
    toolActivity.push(activity);

    if (result.ok) {
      const player = String(result.data.player ?? inferredPlayerName);
      const games = String(result.data.rowCount ?? 0);
      return buildAiResult(
        `${buildLocalFallbackHelpMessage(reason)} Retrieved bounded player stats for ${player} across ${games} rows.`,
        toolActivity,
        "local-fallback"
      );
    }
  }

  if (normalized.includes("team") && quotedValues.length >= 1) {
    const { result, activity } = await runToolForLocalFallback("get_team_stats", {
      team: quotedValues[0],
      years,
      statKeys: null,
    }, access);
    toolActivity.push(activity);

    if (result.ok) {
      const team = String(result.data.team ?? quotedValues[0]);
      const games = String(result.data.rowCount ?? 0);
      return buildAiResult(
        `${buildLocalFallbackHelpMessage(reason)} Retrieved bounded team stats for ${team} across ${games} rows.`,
        toolActivity,
        "local-fallback"
      );
    }
  }

  if (requiresInternalToolCall(userMessage) && !hasSuccessfulInternalToolCall(toolActivity)) {
    return buildAiResult(
      buildRequiredToolFollowUpQuestion(userMessage),
      toolActivity,
      "local-fallback"
    );
  }

  return buildAiResult(buildLocalFallbackHelpMessage(reason), toolActivity, "local-fallback");
}

function buildSeasonTotalsChartArtifact(
  title: string,
  subtitle: string,
  yLabel: string,
  seasonTotals: Array<{ season: string; total: number }>
): AiChartArtifact {
  return {
    type: "line-chart",
    title,
    subtitle,
    yLabel,
    points: seasonTotals.map((entry) => ({
      x: entry.season,
      y: entry.total,
    })),
  };
}

async function tryRunDirectTeamSeasonChartChat(
  userMessage: string,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  if (!hasAiPlotAccess(access.plan)) {
    return null;
  }

  const normalized = userMessage.toLowerCase();
  const team = extractTeamFromQuestion(userMessage);
  if (!team) {
    return null;
  }

  const isSeasonTrendRequest =
    normalized.includes("since") &&
    normalized.includes("point") &&
    (normalized.includes("plot") ||
      normalized.includes("chart") ||
      normalized.includes("trend") ||
      normalized.includes("season"));

  if (!isSeasonTrendRequest) {
    return null;
  }

  const years = await getYearsSince(userMessage, access);
  const toolActivity: AiToolActivity[] = [
    {
      toolName: "aggregate_team_season_points",
      arguments: {
        team,
        years,
      },
      ok: true,
      summary: "Aggregated team points into season totals for chart rendering.",
    },
  ];
  const rows = (await fetchTeamStats(years ?? undefined)).filter((row) => row.Team === team);
  const seasonTotalsMap = new Map<string, number>();
  rows.forEach((row) => {
    const year = row.Year;
    const points = typeof row.Points === "number" ? row.Points : null;
    if (!year || points == null) return;
    seasonTotalsMap.set(year, (seasonTotalsMap.get(year) ?? 0) + points);
  });

  const seasonTotals = [...seasonTotalsMap.entries()]
    .map(([season, total]) => ({ season, total }))
    .sort((a, b) => a.season.localeCompare(b.season));

  if (seasonTotals.length === 0) {
    return buildAiResult(
      `I could not build a season totals chart for ${team} from the bounded rows returned.`,
      toolActivity,
      "direct-tools"
    );
  }

  const chart = buildSeasonTotalsChartArtifact(
    `${team} Points By Season`,
    years && years.length > 0 ? `${years[0]} to ${years[years.length - 1]}` : "Season totals",
    "Points scored",
    seasonTotals
  );

  const summary = seasonTotals.map((entry) => `${entry.season}: ${entry.total}`).join("; ");

  return buildAiResult(
    `${team} points by season: ${summary}.`,
    toolActivity,
    "direct-tools",
    [chart]
  );
}

function extractYearsFromSubtitle(subtitle: string | undefined): string[] | null {
  if (!subtitle) return null;
  const rangeMatch = subtitle.match(/\b(20\d{2})\s+to\s+(20\d{2})\b/i);
  if (!rangeMatch) return null;

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;

  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

function getLatestChartArtifact(
  history: AiConversationHistoryMessage[] | undefined
): AiChartArtifact | null {
  if (!history) return null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const artifacts = history[index]?.artifacts ?? [];
    const chart = artifacts.find((artifact) => artifact.type === "line-chart");
    if (chart) {
      return chart;
    }
  }

  return null;
}

function getLatestHistoryMessage(
  history: AiConversationHistoryMessage[] | undefined,
  role: AiConversationHistoryMessage["role"]
): AiConversationHistoryMessage | null {
  if (!history) return null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === role) {
      return message;
    }
  }

  return null;
}

function isGameFollowUpRequest(
  normalizedMessage: string,
  latestChart: AiChartArtifact | null
): boolean {
  if (
    normalizedMessage.includes("by game") ||
    normalizedMessage.includes("game by game") ||
    normalizedMessage === "plot by game" ||
    normalizedMessage === "show by game"
  ) {
    return true;
  }

  const isSwitchRequest =
    normalizedMessage.includes("instead") ||
    normalizedMessage.includes("rather than") ||
    normalizedMessage.includes("not season") ||
    normalizedMessage.includes("not by season");

  return isSwitchRequest && Boolean(latestChart?.title.toLowerCase().includes("by season"));
}

function getTeamFromChartArtifact(chart: AiChartArtifact): (typeof TEAMS)[number] | null {
  const normalizedTitle = chart.title.toLowerCase();
  const directMatch = TEAMS.find((candidate) => normalizedTitle.includes(candidate.toLowerCase()));
  if (directMatch) {
    return directMatch;
  }

  const titlePrefix = chart.title.split(/\s+by\s+/i)[0]?.trim().toLowerCase();
  if (!titlePrefix) {
    return null;
  }

  return (
    TEAMS.find(
      (candidate) =>
        titlePrefix.includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(titlePrefix)
    ) ?? null
  );
}

async function buildGameFollowUpContext(
  history: AiConversationHistoryMessage[] | undefined,
  latestChart: AiChartArtifact | null,
  access: AiToolAccessPolicy
): Promise<{
  team: (typeof TEAMS)[number] | null;
  years: string[] | null;
  metricText: string;
}> {
  const latestUserMessage = getLatestHistoryMessage(history, "user");
  const latestAssistantMessage = getLatestHistoryMessage(history, "assistant");
  const latestUserText = latestUserMessage?.content ?? "";
  const latestAssistantText = latestAssistantMessage?.content ?? "";

  const inferredTeam =
    (latestChart ? getTeamFromChartArtifact(latestChart) : null) ??
    extractTeamFromQuestion(latestUserText) ??
    extractTeamFromQuestion(latestAssistantText);
  const team = inferredTeam ? TEAMS.find((candidate) => candidate === inferredTeam) ?? null : null;

  const years =
    (latestChart ? extractYearsFromSubtitle(latestChart.subtitle) : null) ??
    (latestUserText ? await getYearsSince(latestUserText, access) : null) ??
    extractYears(latestAssistantText);

  const metricText = [
    latestChart?.title ?? "",
    latestChart?.yLabel ?? "",
    latestUserText,
    latestAssistantText,
  ]
    .join(" ")
    .toLowerCase();

  return { team, years, metricText };
}

async function tryRunDirectThreadFollowUpChat(
  userMessage: string,
  history: AiConversationHistoryMessage[] | undefined,
  access: AiToolAccessPolicy
): Promise<AiModelChatResult | null> {
  if (!ENABLE_DIRECT_CHART_SHORTCUTS) {
    return null;
  }

  if (!hasAiPlotAccess(access.plan)) {
    return null;
  }

  const normalized = userMessage.toLowerCase();
  const latestChart = getLatestChartArtifact(history);
  if (!isGameFollowUpRequest(normalized, latestChart)) {
    return null;
  }

  const { team, years, metricText } = await buildGameFollowUpContext(history, latestChart, access);
  if (!team) {
    return null;
  }

  if (!metricText.includes("point")) {
    return null;
  }

  const rows = (await fetchTeamStats(years ?? undefined))
    .filter((row) => row.Team === team)
    .sort((a, b) => {
      if (a.Year !== b.Year) return a.Year.localeCompare(b.Year);
      return a.Round - b.Round;
    });

  if (rows.length === 0) {
    return null;
  }

  const chart = {
    type: "line-chart" as const,
    title: `${team} Points By Game`,
    subtitle: years && years.length > 0 ? `${years[0]} to ${years[years.length - 1]}` : "Game-by-game",
    yLabel: "Points scored",
    points: rows.map((row) => ({
      x: `${row.Year} R${row.Round_Label || row.Round}`,
      y: row.Points,
    })),
  };

  const toolActivity: AiToolActivity[] = [
    {
      toolName: "aggregate_team_game_points",
      arguments: { team, years },
      ok: true,
      summary: "Converted the previous team season chart context into a game-by-game points chart.",
    },
  ];

  return buildAiResult(
    `${team} points plotted by game${years?.length ? ` from ${years[0]} to ${years[years.length - 1]}` : ""}.`,
    toolActivity,
    "direct-tools",
    [chart]
  );
}

async function tryRunDirectToolChat(
  userMessage: string,
  history?: AiConversationHistoryMessage[],
  access: AiToolAccessPolicy = { plan: "free" }
): Promise<AiModelChatResult | null> {
  const playerComparisonResult = await tryRunDirectPlayerComparisonChat(userMessage, access);
  if (playerComparisonResult) {
    return playerComparisonResult;
  }

  const teamWinsResult = await tryRunDirectTeamWinsChat(userMessage, access);
  if (teamWinsResult) {
    return teamWinsResult;
  }

  const teamWeekdaySplitResult = await tryRunDirectTeamWeekdaySplitChat(userMessage, access);
  if (teamWeekdaySplitResult) {
    return teamWeekdaySplitResult;
  }

  const teamPreviousResultSplitResult = await tryRunDirectTeamPreviousResultSplitChat(userMessage, access);
  if (teamPreviousResultSplitResult) {
    return teamPreviousResultSplitResult;
  }

  const threadFollowUpResult = await tryRunDirectThreadFollowUpChat(userMessage, history, access);
  if (threadFollowUpResult) {
    return threadFollowUpResult;
  }

  if (ENABLE_DIRECT_CHART_SHORTCUTS) {
    const teamChartResult = await tryRunDirectTeamSeasonChartChat(userMessage, access);
    if (teamChartResult) {
      return teamChartResult;
    }
  }

  const baseFantasyRatioResult = await tryRunDirectBaseFantasyRatioChat(userMessage, access);
  if (baseFantasyRatioResult) {
    return baseFantasyRatioResult;
  }

  const fantasyPositionTradeFollowUpResult = await tryRunDirectFantasyPositionTradeFollowUpChat(
    userMessage,
    history,
    access
  );
  if (fantasyPositionTradeFollowUpResult) {
    return fantasyPositionTradeFollowUpResult;
  }

  const fantasyProjectionValueResult = await tryRunDirectFantasyProjectionValueChat(userMessage, access);
  if (fantasyProjectionValueResult) {
    return fantasyProjectionValueResult;
  }

  const fantasyBuyResult = await tryRunDirectFantasyBuyChat(userMessage, access);
  if (fantasyBuyResult) {
    return fantasyBuyResult;
  }

  const teamRankingResult = await tryRunDirectTeamRankingChat(userMessage, access);
  if (teamRankingResult) {
    return teamRankingResult;
  }

  const leagueTrendResult = await tryRunDirectLeagueSeasonTrendChat(userMessage, access);
  if (leagueTrendResult) {
    return leagueTrendResult;
  }

  const playerTrendResult = await tryRunDirectPlayerTrendChat(userMessage, access);
  if (playerTrendResult) {
    return playerTrendResult;
  }

  const filteredPlayerAverageResult = await tryRunDirectFilteredPlayerAverageChat(userMessage, access);
  if (filteredPlayerAverageResult) {
    return filteredPlayerAverageResult;
  }

  const normalized = userMessage.toLowerCase();
  const quotedValues = extractQuotedValues(userMessage);
  const years = await getLocalFallbackYears(userMessage, access);
  const toolActivity: AiToolActivity[] = [];
  const inferredPlayerName = quotedValues[0] ?? extractPlayerNameFromQuestion(userMessage);
  const inferredStatKeys = inferRequestedStatKeys(userMessage);

  const isDirectPlayerQuery =
    inferredPlayerName &&
    (normalized.includes("how many") ||
      normalized.includes("does ") ||
      normalized.includes("player ") ||
      normalized.includes("stats for"));

  if (!isDirectPlayerQuery) {
    return null;
  }

  const { result, activity } = await runToolForLocalFallback("get_player_stats", {
    player: inferredPlayerName,
    years,
    statKeys: inferredStatKeys,
  }, access);
  toolActivity.push(activity);

  if (!result.ok) {
    return buildAiResult(
      result.suggestions && result.suggestions.length > 0
        ? `I couldn’t match "${inferredPlayerName}" confidently. Did you mean ${result.suggestions.join(", ")}?`
        : result.error,
      toolActivity,
      "direct-tools"
    );
  }

  const player = String(result.data.player ?? inferredPlayerName);
  const rowCount = Number(result.data.rowCount ?? 0);
  const rows = Array.isArray(result.data.rows) ? result.data.rows : null;

  if (inferredStatKeys && inferredStatKeys.length > 0 && normalized.includes("how many")) {
    const statSummaries = inferredStatKeys
      .map((statKey) => {
        const total = sumRequestedStatFromRows(rows, statKey);
        return `${statKey}: ${String(total ?? "-")}`;
      })
      .join("; ");

    return buildAiResult(
      `${player} has ${statSummaries}${years?.length ? ` in ${years.join(", ")}` : ""}.`,
      toolActivity,
      "direct-tools"
    );
  }

  if (inferredStatKeys && inferredStatKeys.length > 0) {
    return buildAiResult(
      `Retrieved ${rowCount} bounded rows for ${player}${years?.length ? ` in ${years.join(", ")}` : ""}.`,
      toolActivity,
      "direct-tools"
    );
  }

  return buildAiResult(
    `Retrieved bounded player stats for ${player} across ${rowCount} rows${years?.length ? ` in ${years.join(", ")}` : ""}.`,
    toolActivity,
    "direct-tools"
  );
}

export async function runAiModelChat(
  userMessage: string,
  options?: {
    history?: AiConversationHistoryMessage[];
    access?: AiToolAccessPolicy;
    clarificationCount?: number;
    reasoningEffortOverride?: "minimal" | "low" | "medium" | "high" | "xhigh";
    transientRetryAttempted?: boolean;
    imageInputs?: AiImageAttachmentInput[];
  }
): Promise<AiModelChatResult> {
  const access = options?.access ?? { plan: "free" };
  const imageInputs = options?.imageInputs ?? [];
  const hasImageInputs = imageInputs.length > 0;
  if (!hasImageInputs) {
    const directBaseFantasyRatioResult = await tryRunDirectBaseFantasyRatioChat(userMessage, access);
    if (directBaseFantasyRatioResult) {
      return directBaseFantasyRatioResult;
    }
  }

  if (!hasAiBettingModelAccess(access.plan) && isPremiumBettingRequest(userMessage)) {
    return buildAiResult(buildPremiumBettingUpgradeMessage(), [], "policy");
  }

  if (!hasAiProDataAccess(access.plan) && isProjectionRequest(userMessage)) {
    return buildAiResult(buildProjectionUpgradeMessage(), [], "policy");
  }

  if (!hasAiPlotAccess(access.plan) && isPlotRequest(userMessage)) {
    return buildAiResult(buildPlotUpgradeMessage(), [], "policy");
  }

  const directTeamWeekdaySplitResult = await tryRunDirectTeamWeekdaySplitChat(userMessage, access);
  if (directTeamWeekdaySplitResult) {
    return directTeamWeekdaySplitResult;
  }

  const directTeamPreviousResultSplitResult = await tryRunDirectTeamPreviousResultSplitChat(userMessage, access);
  if (directTeamPreviousResultSplitResult) {
    return directTeamPreviousResultSplitResult;
  }

  if (!hasImageInputs && ENABLE_DIRECT_AI_SHORTCUTS) {
    const directTeamWinsResult = await tryRunDirectTeamWinsChat(userMessage, access);
    if (directTeamWinsResult) {
      return directTeamWinsResult;
    }

    const directPlayerProfileResult = await tryRunDirectPlayerProfileChat(userMessage, access);
    if (directPlayerProfileResult) {
      return directPlayerProfileResult;
    }

    const directPlayerComparisonResult = await tryRunDirectPlayerComparisonChat(userMessage, access);
    if (directPlayerComparisonResult) {
      return directPlayerComparisonResult;
    }
  }

  if (!isOpenAiConfigured()) {
    if (hasImageInputs) {
      throw new Error("OPENAI_API_KEY is required for fantasy screenshot uploads.");
    }

    if (ENABLE_DIRECT_AI_SHORTCUTS && isAiLocalFallbackEnabled()) {
      const directToolResult = await tryRunDirectToolChat(userMessage, options?.history, access);
      if (directToolResult) {
        return directToolResult;
      }

      return runLocalAiFallbackChat(userMessage, "OPENAI_API_KEY is not configured", access);
    }

    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = getOpenAiModel();
  const reasoningEffort =
    options?.reasoningEffortOverride ?? getOpenAiReasoningEffort(access.plan);
  if (hasImageInputs) {
    const requestedRound = parseRequestedRound(userMessage);
    const [buySnapshot, valueSnapshot, sellSnapshot] = await Promise.all([
      runToolForLocalFallback(
        "get_fantasy_snapshot",
        {
          round: requestedRound,
          positions: null,
          priceMax: null,
          sortBy: "ownership_delta_desc",
          requireOwnershipRise: true,
          excludeLocked: true,
          limit: 12,
        },
        access
      ),
      runToolForLocalFallback(
        "get_fantasy_snapshot",
        {
          round: requestedRound,
          positions: null,
          priceMax: null,
          sortBy: "projection_vs_priced_at_desc",
          requireOwnershipRise: false,
          excludeLocked: true,
          limit: 12,
        },
        access
      ),
      runToolForLocalFallback(
        "get_fantasy_snapshot",
        {
          round: requestedRound,
          positions: null,
          priceMax: null,
          sortBy: "ownership_delta_asc",
          requireOwnershipRise: false,
          excludeLocked: false,
          limit: 16,
        },
        access
      ),
    ]);
    const fantasySnapshotContext = formatFantasySnapshotContext(
      buySnapshot.result,
      "trade-in momentum",
      "These are real buy candidates sorted by ownership momentum. Use them when the player also has sensible BE, L3/projection, or priced-at reasoning."
    );
    const fantasyValueContext = formatFantasySnapshotContext(
      valueSnapshot.result,
      "trade-in value",
      "These are real buy candidates sorted by projection-vs-pricedAt value. Use them when they have strong projected scoring relative to price and sensible breakeven."
    );
    const fantasySellContext = formatFantasySnapshotContext(
      sellSnapshot.result,
      "highly-sold",
      "Use this list only to support sell recommendations for screenshot-visible players with negative ownership deltas. Do not recommend selling screenshot players just for DNP/bye."
    );
    const imageUserMessage = [
      userMessage,
      "",
      "Real data guardrails for this screenshot answer:",
      fantasySnapshotContext,
      "",
      fantasyValueContext,
      "",
      fantasySellContext,
      "",
      "When writing the answer:",
      "- Sells must come from visible screenshot players only.",
      "- DNP or bye is not a sell reason by itself. Only suggest selling a DNP/bye player if they also have a real negative ownership delta in the highly-sold snapshot or an injury/suspension/dropped marker.",
      "- Treat DNP and the black/dark circle with a white square as bye/non-playing-round markers, not injury or dropped status.",
      "- Prioritise visible injury marker sells before any structural or ownership-delta sells. In the provided screenshot key, the injury marker is a red cross/plus.",
      "- Negative-ownership sell recommendations require the visible player to appear in the real highly-sold snapshot above.",
      "- Trade-ins must come only from the real fantasy trade-in momentum/value snapshots above.",
      "- Explain buy and sell reasoning using the supplied ownership delta, BE, L3 average, pricedAt, projection, and projection-vs-pricedAt fields.",
      "- Low BE supports buys because the player can rise in price faster. High BE, negative ownership, and L3/projection below pricedAt support sells.",
      "- Include ownership delta only when it appears in the real fantasy snapshot above.",
      "- Do not mention buying again, buying back, or re-buying an already owned player.",
    ].join("\n");

    const response = await createOpenAiResponse({
      model,
      reasoning: {
        effort: "low",
      },
      instructions: buildImageOnlySystemInstructions(access.plan),
      input: [
        {
          role: "user",
          content: buildOpenAiUserInputContent(imageUserMessage, imageInputs),
        },
      ],
      max_output_tokens: MAX_IMAGE_OUTPUT_TOKENS,
    });
    const assistantMessage =
      stripFinalAnswerPrefix(extractAssistantText(response)) ||
      "I could not read the uploaded screenshots clearly enough to give reliable fantasy trade advice. Please retry with the same full-screen squad screenshots.";

    return {
      assistantMessage,
      toolActivity: [buySnapshot.activity, valueSnapshot.activity, sellSnapshot.activity],
      artifacts: [],
      model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
    };
  }

  const toolActivity: AiToolActivity[] = [];
  const history = options?.history ?? [];
  const clarificationCount = options?.clarificationCount ?? 0;
  const modelHistory = getModelHistoryWindow(history);
  try {
    let response = await createOpenAiResponse({
      model,
      reasoning: {
        effort: reasoningEffort,
      },
      instructions: buildAiSystemInstructions(access.plan, clarificationCount),
      input: [
        ...modelHistory.map(buildOpenAiHistoryInput),
        {
          role: "user",
          content: buildOpenAiUserInputContent(userMessage, imageInputs),
        },
      ],
      tools: buildOpenAiTools(),
      tool_choice: "auto",
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });

    let loopResult = await continueOpenAiToolLoop({
      response,
      model,
      reasoningEffort,
      access,
      toolActivity,
      clarificationCount,
    });
    response = loopResult.response;
    let submittedFinalAnswer = loopResult.finalAnswer;

    let extractedAssistantText = extractAssistantText(response);
    if (!submittedFinalAnswer && isWeakAssistantResponse(extractedAssistantText, toolActivity)) {
      response = await createOpenAiResponse({
        model,
        reasoning: {
          effort: reasoningEffort,
        },
        instructions: buildAiSystemInstructions(access.plan, clarificationCount),
        previous_response_id: response.id,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildRepairPrompt(userMessage, extractedAssistantText),
              },
            ],
          },
        ],
        tools: buildOpenAiTools(),
        tool_choice: "auto",
        max_output_tokens: MAX_OUTPUT_TOKENS,
      });

      loopResult = await continueOpenAiToolLoop({
        response,
        model,
        reasoningEffort,
        access,
        toolActivity,
        clarificationCount,
      });
      response = loopResult.response;
      submittedFinalAnswer = loopResult.finalAnswer;

      extractedAssistantText = extractAssistantText(response);
    }

    if (CAPABILITY_ONLY_MODEL_TOOLS && !submittedFinalAnswer) {
      response = await createOpenAiResponse({
        model,
        reasoning: {
          effort: reasoningEffort,
        },
        instructions: buildAiSystemInstructions(access.plan, clarificationCount),
        previous_response_id: response.id,
        input: [
          {
            role: "user",
            content: hasImageInputs
              ? buildOpenAiUserInputContent(
                  buildImageFinalAnswerToolPrompt(userMessage, extractedAssistantText),
                  imageInputs
                )
              : [
                  {
                    type: "input_text",
                    text: buildFinalAnswerToolPrompt(userMessage, extractedAssistantText),
                  },
                ],
          },
        ],
        tools: buildOpenAiTools(),
        tool_choice: "auto",
        max_output_tokens: MAX_OUTPUT_TOKENS,
      });

      loopResult = await continueOpenAiToolLoop({
        response,
        model,
        reasoningEffort,
        access,
        toolActivity,
        clarificationCount,
      });
      response = loopResult.response;
      submittedFinalAnswer = loopResult.finalAnswer;
      extractedAssistantText = extractAssistantText(response);
    }

    const extractedPrefixedAnswer = hasFinalAnswerPrefix(extractedAssistantText)
      ? stripFinalAnswerPrefix(extractedAssistantText)
      : "";
    const extractedImageAnswer =
      hasImageInputs && extractedAssistantText
        ? stripFinalAnswerPrefix(extractedAssistantText)
        : "";

    if (!hasImageInputs && !submittedFinalAnswer && !extractedPrefixedAnswer) {
      const fallbackResult = await tryRunDirectToolChat(userMessage, history, access);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    const assistantMessage =
      submittedFinalAnswer?.answer ||
      extractedPrefixedAnswer ||
      extractedImageAnswer ||
      (hasImageInputs
        ? "I couldn't read enough from the uploaded screenshots to give reliable fantasy trade advice. Please re-upload a clear full-screen squad screenshot and include your bank/trades if they are not visible."
        : "I couldn't answer that cleanly from the available data. Try asking with a specific team, player, stat, and season range.");

    if (!hasImageInputs && ENABLE_DIRECT_AI_SHORTCUTS && !extractedAssistantText) {
      const fallbackResult = await tryRunDirectToolChat(userMessage, history, access);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    if (!hasImageInputs && requiresInternalToolCall(userMessage) && !hasSuccessfulInternalToolCall(toolActivity)) {
      return {
        assistantMessage: buildRequiredToolFollowUpQuestion(userMessage),
        toolActivity,
        artifacts: [],
        model,
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
        },
      };
    }

    return {
      assistantMessage,
      toolActivity,
      artifacts: [],
      model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete the AI request.";
    if (isTransientOpenAiProcessingError(message)) {
      const fallbackResult = await tryRunDirectToolChat(userMessage, options?.history, access);
      if (fallbackResult) {
        return fallbackResult;
      }

      if (!options?.transientRetryAttempted) {
        for (const retryEffort of TRANSIENT_RETRY_EFFORTS) {
          if (retryEffort === reasoningEffort) {
            continue;
          }

          try {
            return await runAiModelChat(userMessage, {
              history: options?.history,
              access,
              clarificationCount: options?.clarificationCount,
              reasoningEffortOverride: retryEffort,
              transientRetryAttempted: true,
            });
          } catch (retryError) {
            const retryMessage =
              retryError instanceof Error ? retryError.message : "Unable to complete the AI request.";
            if (!isTransientOpenAiProcessingError(retryMessage)) {
              throw retryError;
            }
          }
        }
      }
    }
    if (ENABLE_DIRECT_AI_SHORTCUTS && isAiLocalFallbackEnabled() && isTransientOpenAiProcessingError(message)) {
      const fallbackResult = await tryRunDirectToolChat(userMessage, options?.history, access);
      if (fallbackResult) {
        return fallbackResult;
      }
    }
    if (isTransientOpenAiProcessingError(message)) {
      throw new Error("The AI provider is temporarily unavailable after retrying. No answer was saved or counted for this request.");
    }
    if (ENABLE_DIRECT_AI_SHORTCUTS && isAiLocalFallbackEnabled() && isQuotaOrBillingError(message)) {
      return runLocalAiFallbackChat(userMessage, "the OpenAI account hit a quota or billing limit", access);
    }

    throw error;
  }
}

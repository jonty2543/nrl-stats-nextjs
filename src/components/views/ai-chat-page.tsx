"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { AiPlan } from "@/lib/ai/access";
import type { AiPersistedMessage } from "@/lib/ai/persistence";
import type { AiToolDefinition } from "@/lib/ai/tools/types";
import { AiLineChart } from "@/components/charts/ai-line-chart";

interface AiChatPageProps {
  plan: AiPlan;
  chatLimit: number | null;
  chatQuotaPeriodLabel: string;
  chatsUsed: number;
  chatsRemaining: number | null;
  usageTrackingAvailable: boolean;
  initialMessages: AiPersistedMessage[];
  initialThreadId: string | null;
  nextUpcomingRound: number | null;
  tools: AiToolDefinition[];
}

interface AiChatApiResponse {
  status: string;
  threadId?: string | null;
  threadTitle?: string | null;
  plan: AiPlan;
  chatLimit: number | null;
  chatQuotaPeriodLabel: string;
  chatsUsed?: number;
  chatsRemaining?: number | null;
  usageTrackingAvailable?: boolean;
  submittedMessage: string;
  assistantMessage: string;
  guardrails: string[];
  toolActivity?: AiPersistedMessage["toolActivity"];
  artifacts?: AiPersistedMessage["artifacts"];
  choices?: AiPersistedMessage["choices"];
  model?: string | null;
  usage?: AiPersistedMessage["usage"];
  availableTools: Array<{ name: string; description: string }>;
}

interface DirectToolRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
}

interface PendingImageAttachment {
  id: string;
  name: string;
  context: "fantasy" | "betting";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
}

const MAX_SCREENSHOTS = 3;
const MAX_IMAGE_DATA_URL_LENGTH = 650_000;

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

async function parseAiChatResponse(response: Response): Promise<AiChatApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();

  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody) as AiChatApiResponse;
  }

  const compactBody = rawBody.replace(/\s+/g, " ").trim();
  const assistantMessage =
    compactBody.startsWith("<!DOCTYPE") || compactBody.startsWith("<html")
      ? "The AI request returned an HTML page instead of JSON. Sign in again and retry."
      : compactBody || "Unable to complete the AI request.";

  return {
    status: response.ok ? "completed" : "invalid_response",
    plan: "free",
    chatLimit: null,
    chatQuotaPeriodLabel: "day",
    submittedMessage: "",
    assistantMessage,
    guardrails: [],
    availableTools: [],
  };
}

function formatPlanLabel(plan: AiPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatLimit(limit: number | null, periodLabel: string): string {
  return limit == null ? "Unlimited" : `${limit} messages / ${periodLabel}`;
}

function formatRemainingChats(remaining: number | null, periodLabel: string): string {
  const periodText = periodLabel === "day" ? "today" : `this ${periodLabel}`;
  return remaining == null ? "Unlimited remaining" : `${remaining} remaining ${periodText}`;
}

function formatQuotaReachedMessage(plan: AiPlan, limit: number | null, periodLabel: string): string {
  const planLabel = formatPlanLabel(plan);
  const limitText = limit == null ? "your AI message limit" : `${limit} message${limit === 1 ? "" : "s"}`;
  const periodText = periodLabel === "day" ? "today" : `this ${periodLabel}`;
  return `${planLabel} limit reached: ${limitText} ${periodText}.`;
}

function buildLocalMessage(
  role: "user" | "assistant",
  content: string,
  threadId: string | null,
  options?: {
    toolActivity?: AiPersistedMessage["toolActivity"];
    artifacts?: AiPersistedMessage["artifacts"];
    choices?: AiPersistedMessage["choices"];
    model?: string | null;
    usage?: AiPersistedMessage["usage"];
  }
): AiPersistedMessage {
  return {
    id: `${role}-${crypto.randomUUID()}`,
    threadId: threadId ?? "local",
    role,
    content,
    toolActivity: options?.toolActivity ?? [],
    model: options?.model ?? null,
    usage: options?.usage ?? null,
    choices: options?.choices ?? [],
    artifacts: options?.artifacts ?? [],
    createdAt: new Date().toISOString(),
  };
}

function UploadGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-nrl-muted"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function AssistantMessageCard({
  message,
  onChoice,
  isSubmitting,
}: {
  message: AiPersistedMessage;
  onChoice: (choice: AiPersistedMessage["choices"][number]) => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="min-w-0 px-1 py-4">
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-nrl-text">
        {message.content}
      </div>

      {message.artifacts.map((artifact, index) =>
        artifact.type === "line-chart" ? (
          <div key={`${message.id}-artifact-${index}`} className="mt-4">
            <AiLineChart
              title={artifact.title}
              subtitle={artifact.subtitle}
              yLabel={artifact.yLabel}
              points={artifact.points}
            />
          </div>
        ) : null
      )}

      {message.choices.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
            {message.choices.map((choice, index) => (
              <button
                key={`${message.id}-choice-${index}`}
                type="button"
                onClick={() => onChoice(choice)}
                disabled={isSubmitting}
                className="rounded-full border border-nrl-border bg-nrl-panel px-3 py-2 text-xs font-semibold text-nrl-text transition-colors hover:border-nrl-accent hover:text-nrl-accent disabled:cursor-not-allowed disabled:opacity-50"
                title={choice.description}
              >
                {choice.label}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

const LOADING_STAGE_MS = 4500;
const RUNNER_LOADING_IMAGES = [
  "/runner/Boyd_running.png",
  "/runner/bai_running.png",
  "/runner/cleary_running.png",
  "/runner/cook_running.png",
  "/runner/cows_running.png",
  "/runner/herbie_running.png",
  "/runner/hughes_running.png",
  "/runner/luai_running.png",
  "/runner/moses_running.png",
  "/runner/noah_martin_running.png",
  "/runner/ponga_running.png",
  "/runner/saab_running.png",
  "/runner/sloan_running.png",
  "/runner/talakai_running.png",
  "/runner/tracey_running.png",
  "/runner/walker_running.png",
  "/runner/walsh_running.png",
];

const PROMPT_VARIABLE_OPTIONS = {
  player: ["Nathan Cleary", "Reece Walsh", "Kalyn Ponga", "Jahrome Hughes", "Mitchell Moses", "Jason Saab"],
  player2: ["Nicholas Hynes", "Tom Dearden", "Daly Cherry-Evans", "Matt Burton", "Cameron Munster", "Jarome Luai"],
  team: ["Broncos", "Bulldogs", "Cowboys", "Dolphins", "Panthers", "Sea Eagles", "Storm", "Warriors"],
  team2: ["Raiders", "Rabbitohs", "Roosters", "Sharks", "Titans", "Wests Tigers", "Knights", "Eels"],
  stat: ["Tries", "Try Assists", "All Run Metres", "Tackle Breaks", "Missed Tackles", "Errors", "Fantasy"],
  teamStat: ["Points", "Possession %", "All Run Metres", "Line Breaks", "Tackles Made", "Errors"],
  position: ["Halfback", "Five-Eighth", "Winger", "Centre", "Fullback", "Prop", "Lock", "Hooker", "2nd Row"],
  season: ["2026", "2025", "2024", "2023"],
  minGames: ["3", "5", "6", "8", "10"],
  minMinutes: ["20", "30", "40", "50", "60"],
  round: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
} as const;

type PromptVariableKey = keyof typeof PROMPT_VARIABLE_OPTIONS;
type PromptVariables = Partial<Record<PromptVariableKey, string>>;
type DirectPromptTool = {
  name: string;
  input: Record<string, unknown>;
};

const DEFAULT_PROMPTS: Array<{
  id: string;
  label: string;
  template: string;
  variables: PromptVariableKey[];
  getTool: (values: PromptVariables) => DirectPromptTool;
}> = [
  {
    id: "player-stat-leaders",
    label: "Player stat leaders",
    template: "Which [position]s average the most [stat] in [season], minimum [minGames] games?",
    variables: ["position", "stat", "season", "minGames"],
    getTool: (values) => ({
      name: "rank_players_by_stat",
      input: {
        statKey: values.stat,
        years: [values.season],
        limit: 8,
        sortOrder: "desc",
        aggregation: "avg",
        rateBasis: "per_game",
        minGames: Number(values.minGames),
        minAverageMinutes: null,
        filters: { opponent: null, position: values.position, finals: null, minutesOver: null, minutesUnder: null, teammate: null, teammatePosition: null, withWithout: null },
      },
    }),
  },
  {
    id: "player-stat-lowest",
    label: "Lowest player rates",
    template: "Among [position]s with [minGames]+ games in [season], who has the lowest [stat] per game?",
    variables: ["position", "minGames", "season", "stat"],
    getTool: (values) => ({
      name: "rank_players_by_stat",
      input: {
        statKey: values.stat,
        years: [values.season],
        limit: 8,
        sortOrder: "asc",
        aggregation: "avg",
        rateBasis: "per_game",
        minGames: Number(values.minGames),
        minAverageMinutes: null,
        filters: { opponent: null, position: values.position, finals: null, minutesOver: null, minutesUnder: null, teammate: null, teammatePosition: null, withWithout: null },
      },
    }),
  },
  {
    id: "minutes-filter",
    label: "Minutes filter",
    template: "Among [position]s averaging [minMinutes]+ minutes in [season], who has the best [stat] per game?",
    variables: ["position", "minMinutes", "season", "stat"],
    getTool: (values) => ({
      name: "rank_players_by_stat",
      input: {
        statKey: values.stat,
        years: [values.season],
        limit: 8,
        sortOrder: "desc",
        aggregation: "avg",
        rateBasis: "per_game",
        minGames: 3,
        minAverageMinutes: Number(values.minMinutes),
        filters: { opponent: null, position: values.position, finals: null, minutesOver: null, minutesUnder: null, teammate: null, teammatePosition: null, withWithout: null },
      },
    }),
  },
  {
    id: "team-stat-rank",
    label: "Team stat ranking",
    template: "Rank teams by average [teamStat] in [season].",
    variables: ["teamStat", "season"],
    getTool: (values) => ({
      name: "rank_teams_by_stat",
      input: { statKey: values.teamStat, years: [values.season], limit: 8, sortOrder: "desc" },
    }),
  },
  {
    id: "team-home-away",
    label: "Home vs away",
    template: "Which teams have the biggest home vs away win-rate gap in [season]?",
    variables: ["season"],
    getTool: (values) => ({
      name: "get_team_home_away_win_rates",
      input: { team: null, years: [values.season], limit: 8, sortOrder: "desc" },
    }),
  },
  {
    id: "possession-records",
    label: "Possession records",
    template: "Which teams win the possession battle most often in [season]?",
    variables: ["season"],
    getTool: (values) => ({
      name: "get_team_possession_battle_records",
      input: { team: null, years: [values.season], limit: 8, sortOrder: "desc" },
    }),
  },
  {
    id: "player-vs-player",
    label: "Player comparison",
    template: "Compare [player] and [player2] for [stat] in [season].",
    variables: ["player", "player2", "stat", "season"],
    getTool: (values) => ({
      name: "compare_players",
      input: { players: [values.player, values.player2], stats: [values.stat], years: [values.season] },
    }),
  },
  {
    id: "fantasy-value",
    label: "Fantasy value",
    template: "Which [position]s look best for fantasy value in round [round]?",
    variables: ["position", "round"],
    getTool: (values) => ({
      name: "get_fantasy_snapshot",
      input: { round: Number(values.round), positions: [values.position ?? ""], priceMax: null, sortBy: "projection_vs_priced_at_desc", requireOwnershipRise: false, excludeLocked: true, limit: 8 },
    }),
  },
  {
    id: "fantasy-projection",
    label: "Fantasy projections",
    template: "Which [position]s have the best fantasy projection in round [round]?",
    variables: ["position", "round"],
    getTool: (values) => ({
      name: "get_fantasy_snapshot",
      input: { round: Number(values.round), positions: [values.position ?? ""], priceMax: null, sortBy: "projection_desc", requireOwnershipRise: false, excludeLocked: true, limit: 8 },
    }),
  },
  {
    id: "betting-market",
    label: "H2H prices",
    template: "What are the best H2H prices this week?",
    variables: [],
    getTool: () => ({
      name: "get_betting_snapshot",
      input: { market: "H2H", dateFrom: null, dateTo: null },
    }),
  },
];

function buildPromptFromTemplate(template: string, values: Partial<Record<PromptVariableKey, string>>) {
  return template.replace(/\[([a-zA-Z0-9]+)\]/g, (match, key: string) => {
    const value = values[key as PromptVariableKey];
    return value || match;
  });
}

function getLoadingStages(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  if (/\b(bet|betting|odds|line|total|market|price|spread)\b/.test(lowerPrompt)) {
    return ["Checking the markets...", "Comparing the prices...", "Writing the answer..."];
  }

  if (/\b(fantasy|projection|breakeven|break even|price rise|price drop)\b/.test(lowerPrompt)) {
    return ["Reviewing fantasy data...", "Comparing the players...", "Writing the answer..."];
  }

  if (/\b(team|player|stat|record|rank|best|most|least|average|season|game)\b/.test(lowerPrompt)) {
    return ["Checking the numbers...", "Comparing the results...", "Writing the answer..."];
  }

  return ["Reading your question...", "Thinking it through...", "Writing the answer..."];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image."));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = src;
  });
}

async function buildPendingImageAttachment(
  file: File,
  uploadContext: PendingImageAttachment["context"]
): Promise<PendingImageAttachment> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Upload PNG, JPEG, or WebP screenshots.");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadHtmlImage(sourceDataUrl);
  const maxWidth = 900;
  const canvas = document.createElement("canvas");
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Unable to process image.");
  }

  let scale = Math.min(1, maxWidth / image.naturalWidth);
  let dataUrl = "";
  for (const widthScale of [1, 0.82, 0.68, 0.54, 0.42]) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale * widthScale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale * widthScale));
    canvas.width = width;
    canvas.height = height;
    canvasContext.drawImage(image, 0, 0, width, height);

    for (const quality of [0.78, 0.68, 0.58, 0.48]) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) break;
    }

    if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) break;
    scale *= 0.9;
  }

  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error("That screenshot is too large to upload. Try cropping it or uploading fewer screenshots.");
  }

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    context: uploadContext,
    mediaType: "image/jpeg",
    dataUrl,
  };
}

function RugbyLoadingMessage({ status, runnerImageSrc }: { status: string; runnerImageSrc: string }) {
  return (
    <div className="px-1 py-4">
      <div className="max-w-lg">
        <div className="rugby-loader" aria-hidden="true">
          <div className="rugby-loader__track">
            <div className="rugby-loader__runner">
              <Image
                className="rugby-loader__figure"
                src={runnerImageSrc}
                alt=""
                fill
                sizes="126px"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 text-sm font-medium text-nrl-text">{status}</div>
      </div>
    </div>
  );
}

function NrlAiTitle({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold text-nrl-text ${className}`}>
      NRL <span className="font-semibold italic text-nrl-accent">AI</span>
      <span className="rounded-full bg-nrl-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-nrl-accent">
        Beta
      </span>
    </span>
  );
}

export function AiChatPage({
  plan,
  chatLimit,
  chatQuotaPeriodLabel,
  chatsUsed,
  chatsRemaining,
  usageTrackingAvailable,
  initialMessages,
  initialThreadId,
  nextUpcomingRound,
  tools,
}: AiChatPageProps) {
  const { isLoaded: isAuthLoaded, userId } = useAuth();
  const { user } = useUser();
  const profileImageUrl = user?.imageUrl ?? null;
  const profileInitials =
    [user?.firstName, user?.lastName]
      .map((name) => name?.trim()[0])
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    user?.fullName?.trim().slice(0, 2).toUpperCase() ||
    user?.primaryEmailAddress?.emailAddress.trim().slice(0, 2).toUpperCase() ||
    "SS";
  const [message, setMessage] = useState("");
  const [pendingDirectTool, setPendingDirectTool] = useState<DirectToolRequest | null>(null);
  const [messages, setMessages] = useState<AiPersistedMessage[]>(initialMessages);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [usedInPeriod, setUsedInPeriod] = useState(chatsUsed);
  const [remainingInPeriod, setRemainingInPeriod] = useState<number | null>(chatsRemaining);
  const [isUsageTrackingAvailable, setIsUsageTrackingAvailable] = useState(usageTrackingAvailable);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState<string | null>(null);
  const [loadingRunnerImageSrc, setLoadingRunnerImageSrc] = useState(RUNNER_LOADING_IMAGES[0]);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImageAttachment[]>([]);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bettingFileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMenuRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const quotaReached =
    isUsageTrackingAvailable && (remainingInPeriod != null && remainingInPeriod <= 0);

  useEffect(() => {
    setMessages(initialMessages);
    setThreadId(initialThreadId);
    setMessage("");
    setError(null);
    setPendingImages([]);
    setIsUploadMenuOpen(false);
    setIsSidebarOpen(false);
  }, [initialMessages, initialThreadId]);

  useEffect(() => {
    setUsedInPeriod(chatsUsed);
    setRemainingInPeriod(chatsRemaining);
    setIsUsageTrackingAvailable(usageTrackingAvailable);
  }, [chatsRemaining, chatsUsed, usageTrackingAvailable]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isSubmitting]);

  useEffect(() => {
    if (!isSubmitting || !loadingPrompt) return;

    const stages = getLoadingStages(loadingPrompt);
    const intervalId = window.setInterval(() => {
      setLoadingStageIndex((current) => Math.min(current + 1, stages.length - 1));
    }, LOADING_STAGE_MS);

    return () => window.clearInterval(intervalId);
  }, [isSubmitting, loadingPrompt]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 144);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? "auto" : "hidden";
  }, [message]);

  useEffect(() => {
    if (!isUploadMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || uploadMenuRef.current?.contains(target)) return;

      setIsUploadMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isUploadMenuOpen]);

  useEffect(() => {
    if (!isSubmitting) {
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      return;
    }

    let cancelled = false;

    const requestWakeLock = async () => {
      const wakeLock = "wakeLock" in navigator
        ? (navigator.wakeLock as { request?: (type: "screen") => Promise<WakeLockSentinelLike> })
        : null;
      if (!wakeLock?.request || document.visibilityState !== "visible") return;

      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
          }
        });
      } catch {
        wakeLockRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [isSubmitting]);

  const handleScreenshotUpload = async (
    files: FileList | null,
    context: PendingImageAttachment["context"]
  ) => {
    if (!files || files.length === 0) return;

    try {
      const slots = Math.max(0, MAX_SCREENSHOTS - pendingImages.length);
      const selectedFiles = Array.from(files).slice(0, slots);
      if (selectedFiles.length === 0) {
        setError(`Upload up to ${MAX_SCREENSHOTS} screenshots.`);
        return;
      }

      const images = await Promise.all(selectedFiles.map((file) => buildPendingImageAttachment(file, context)));
      setPendingImages((current) => [...current, ...images].slice(0, MAX_SCREENSHOTS));
      setError(null);
      setIsUploadMenuOpen(false);
      setMessage((current) =>
        current ||
        (context === "fantasy"
          ? "Suggest trades for my fantasy team this week."
          : "Analyse these betting markets and find the best value.")
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload screenshots.");
    } finally {
      if (bettingFileInputRef.current) bettingFileInputRef.current.value = "";
    }
  };

  const submitPrompt = async (overrideMessage?: string, directTool?: DirectToolRequest) => {
    const submittedImages = overrideMessage ? [] : pendingImages;
    const hasBettingImages = submittedImages.some((image) => image.context === "betting");
    const fallbackMessage =
      submittedImages.length > 0
        ? hasBettingImages
          ? "Analyse these betting market screenshots and find the best value."
          : "Suggest trades for my fantasy team this week from the uploaded fantasy screenshots."
        : "";
    const trimmed = (overrideMessage ?? message).trim() || fallbackMessage;
    if (!trimmed || quotaReached) return;
    if (isAuthLoaded && !userId) {
      setError("Sign in to use AI chat.");
      setIsUploadMenuOpen(false);
      return;
    }

    const requestHistory = messages;
    const imageNote =
      submittedImages.length > 0
        ? `\n\nUploaded screenshot${submittedImages.length === 1 ? "" : "s"}: ${submittedImages.map((image) => `${image.name} (${image.context})`).join(", ")}`
        : "";
    const localUserMessage = buildLocalMessage("user", `${trimmed}${imageNote}`, threadId);
    setIsSubmitting(true);
    setLoadingPrompt(trimmed);
    setLoadingRunnerImageSrc(RUNNER_LOADING_IMAGES[Math.floor(Math.random() * RUNNER_LOADING_IMAGES.length)]);
    setLoadingStageIndex(0);
    setError(null);
    setIsUploadMenuOpen(false);
    setMessages((current) => [...current, localUserMessage]);
    if (!overrideMessage) {
      setMessage("");
      setPendingDirectTool(null);
      setPendingImages([]);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await fetch("/api/ai/chat", {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          threadId,
          history: requestHistory.map((entry) => ({
            role: entry.role,
            content: entry.content,
            artifacts: entry.artifacts,
          })),
          imageAttachments: submittedImages.map((image) => ({
            name: image.name,
            context: image.context,
            mediaType: image.mediaType,
            dataUrl: image.dataUrl,
          })),
          toolName: directTool?.toolName ?? pendingDirectTool?.toolName,
          toolInput: directTool?.toolInput ?? pendingDirectTool?.toolInput,
        }),
      });

      const payload = await parseAiChatResponse(result);
      setUsedInPeriod(payload.chatsUsed ?? usedInPeriod);
      setRemainingInPeriod(payload.chatsRemaining ?? remainingInPeriod);
      setIsUsageTrackingAvailable(payload.usageTrackingAvailable ?? isUsageTrackingAvailable);
      if (!result.ok) {
        throw new Error(payload.assistantMessage || "Unable to complete the AI request.");
      }

      const nextThreadId = payload.threadId ?? threadId;
      setThreadId(nextThreadId);
      setMessages((current) => [
        ...current.map((entry) =>
          entry.id === localUserMessage.id ? { ...entry, threadId: nextThreadId ?? entry.threadId } : entry
        ),
        buildLocalMessage("assistant", payload.assistantMessage, nextThreadId, {
          toolActivity: payload.toolActivity,
          artifacts: payload.artifacts,
          choices: payload.choices,
          model: payload.model ?? null,
          usage: payload.usage ?? null,
        }),
      ]);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setMessages((current) => current.filter((entry) => entry.id !== localUserMessage.id));
        setMessage(trimmed);
        setPendingDirectTool(directTool ?? pendingDirectTool);
        setPendingImages(submittedImages);
        return;
      }

      const errorMessage = caught instanceof Error ? caught.message : "";
      setError(
        errorMessage === "Failed to fetch" || errorMessage === "fetch failed"
          ? "The AI request could not reach the server. Please try again."
          : errorMessage || "Unable to send request."
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsSubmitting(false);
      setLoadingPrompt(null);
    }
  };

  const stopCurrentRequest = () => {
    abortControllerRef.current?.abort();
  };

  const handleChoice = (choice: AiPersistedMessage["choices"][number]) => {
    if (choice.action !== "submit_prompt") {
      return;
    }

    const nextMessage = typeof choice.payload?.message === "string" ? choice.payload.message : "";
    if (!nextMessage) {
      return;
    }

    void submitPrompt(nextMessage);
  };

  void tools;

  const hasConversation = messages.length > 0 || isSubmitting;
  const buildRandomPrompt = () => {
    const prompt = DEFAULT_PROMPTS[Math.floor(Math.random() * DEFAULT_PROMPTS.length)];
    const values = Object.fromEntries(
      prompt.variables.map((variable) => {
        const options = PROMPT_VARIABLE_OPTIONS[variable] as readonly string[];
        const value =
          variable === "season"
            ? "2026"
            : variable === "round" && nextUpcomingRound != null
              ? String(nextUpcomingRound)
            : options[Math.floor(Math.random() * options.length)];
        return [variable, value];
      })
    ) as PromptVariables;

    return {
      message: buildPromptFromTemplate(prompt.template, values),
      tool: prompt.getTool(values),
    };
  };

  const submitRandomPrompt = () => {
    const prompt = buildRandomPrompt();
    setMessage(prompt.message);
    setPendingDirectTool({
      toolName: prompt.tool.name,
      toolInput: prompt.tool.input,
    });
  };

  return (
    <div className="relative left-1/2 -mb-[5.25rem] -mt-2 h-[calc(100dvh-2.75rem)] min-h-[30rem] w-screen -translate-x-1/2 overflow-hidden border-t border-nrl-border sm:-mb-[5.5rem] sm:-mt-3 lg:-mb-24 lg:-mt-4">
      <div className="mx-auto flex h-full w-[calc(100%_-_2rem)] max-w-[76rem] overflow-hidden sm:w-[calc(100%_-_3rem)] lg:w-[calc(100%_-_4rem)]">
      {isSidebarOpen ? (
        <button
          type="button"
          aria-label="Close saved chats"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-x-0 bottom-0 top-[7.25rem] z-30 bg-black/45 lg:hidden"
        />
      ) : null}

      <aside
        className={`absolute inset-y-0 left-0 z-40 flex w-[18rem] max-w-[88vw] -translate-x-full flex-col border-r border-nrl-border bg-nrl-panel transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0 shadow-2xl shadow-black/40" : ""
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="text-sm">
            <NrlAiTitle />
          </div>
          <button
            type="button"
            aria-label="Close saved chats"
            onClick={() => setIsSidebarOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full text-lg text-nrl-muted transition-colors hover:bg-nrl-panel-2 hover:text-nrl-text lg:hidden"
          >
            x
          </button>
        </div>

        <div className="px-3">
          <Link
            href="/dashboard/ai?new=1"
            onClick={() => setIsSidebarOpen(false)}
            className="flex items-center gap-3 rounded-xl bg-nrl-panel-2 px-3 py-3 text-sm font-semibold text-nrl-text transition-colors hover:bg-nrl-border/45"
          >
            <span className="text-lg leading-none">+</span>
            New chat
          </Link>
        </div>

        <div className="flex-1" />

        <div className="border-t border-nrl-border px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-nrl-accent bg-cover bg-center text-xs font-bold text-nrl-bg"
              style={profileImageUrl ? { backgroundImage: `url("${profileImageUrl}")` } : undefined}
              aria-label="User profile photo"
            >
              {!profileImageUrl ? profileInitials : null}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-nrl-text">{formatPlanLabel(plan)}</div>
              <div className="truncate text-xs text-nrl-muted">{formatLimit(chatLimit, chatQuotaPeriodLabel)}</div>
            </div>
          </div>
          {isUsageTrackingAvailable ? (
            <div className="mt-3 text-xs text-nrl-muted">
              {usedInPeriod} message{usedInPeriod === 1 ? "" : "s"} used,{" "}
              {formatRemainingChats(remainingInPeriod, chatQuotaPeriodLabel)}
            </div>
          ) : (
            <div className="mt-3 text-xs text-amber-300">Usage tracking unavailable</div>
          )}
        </div>
      </aside>

      <section className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-nrl-border px-4 backdrop-blur sm:px-5">
          <div
            className={`flex items-center gap-3 transition-transform duration-200 lg:translate-x-0 ${
              isSidebarOpen ? "translate-x-[18rem]" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className={`grid h-9 w-9 place-items-center rounded-full text-xl text-nrl-muted transition-colors hover:bg-nrl-panel hover:text-nrl-text lg:hidden ${
                isSidebarOpen ? "pointer-events-none opacity-0" : ""
              }`}
              aria-label="Open chats"
              aria-hidden={isSidebarOpen}
            >
              =
            </button>
            <div className={`text-lg lg:block ${isSidebarOpen ? "hidden" : ""}`}>
              <NrlAiTitle />
            </div>
          </div>
          <div className="hidden text-xs text-nrl-muted sm:block">
            {formatRemainingChats(remainingInPeriod, chatQuotaPeriodLabel)}
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-44 pt-6 sm:px-6">
            {error ? (
              <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex flex-1 -translate-y-28 flex-col items-center justify-center text-center">
                <h1 className="text-3xl font-semibold text-nrl-text sm:text-4xl">Ready when you are.</h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-nrl-muted">
                  Ask about NRL players, teams, fantasy, betting, form, or matchup trends.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((entry) =>
                  entry.role === "user" ? (
                    <div key={entry.id} className="flex justify-end py-3">
                      <div className="min-w-0 max-w-[85%] rounded-2xl bg-nrl-panel-2 px-4 py-3 text-[15px] leading-7 text-nrl-text shadow-sm">
                        {entry.content}
                      </div>
                    </div>
                  ) : (
                    <AssistantMessageCard
                      key={entry.id}
                      message={entry}
                      onChoice={handleChoice}
                      isSubmitting={isSubmitting}
                    />
                  )
                )}
                {isSubmitting ? (
                  <RugbyLoadingMessage
                    runnerImageSrc={loadingRunnerImageSrc}
                    status={loadingPrompt ? getLoadingStages(loadingPrompt)[loadingStageIndex] ?? "" : ""}
                  />
                ) : null}
                <div ref={bottomRef} className="h-32 sm:h-36" />
              </div>
            )}
          </div>
        </div>

        <div
          className={`pointer-events-none z-20 ${
            hasConversation
              ? "fixed inset-x-0 bottom-0 bg-nrl-bg/98 px-0 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 shadow-[0_-24px_36px_rgba(2,5,23,0.92)] sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:absolute"
              : "absolute inset-x-0 top-[calc(50%-1.75rem)] -translate-y-1/2"
          }`}
        >
          <div className={`mx-auto w-full max-w-3xl px-4 sm:px-6 ${hasConversation ? "" : "pb-4 sm:pb-6"}`}>
            {quotaReached ? (
              <div className="pointer-events-auto mb-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-xs font-medium text-amber-100">
                {formatQuotaReachedMessage(plan, chatLimit, chatQuotaPeriodLabel)}{" "}
                <Link href="/dashboard/billing" className="font-semibold text-nrl-accent underline underline-offset-2">
                  Upgrade plan
                </Link>
              </div>
            ) : null}
            <div className="pointer-events-auto rounded-[1.75rem] border border-nrl-border bg-nrl-panel/95 p-2 shadow-2xl shadow-black/30 backdrop-blur">
              {pendingImages.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2 px-2 pt-1">
                  {pendingImages.map((image) => (
                    <div
                      key={image.id}
                      className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-nrl-border bg-nrl-panel-2 px-3 py-1 text-xs text-nrl-text"
                    >
                      <span className="truncate">{image.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingImages((current) => current.filter((entry) => entry.id !== image.id))}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-nrl-muted transition-colors hover:bg-nrl-border/60 hover:text-nrl-text"
                        aria-label={`Remove ${image.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <div ref={uploadMenuRef} className="relative shrink-0">
                  <input
                    ref={bettingFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="sr-only"
                    id="ai-betting-screenshot-upload"
                    onChange={(event) => void handleScreenshotUpload(event.target.files, "betting")}
                  />
                  <button
                    type="button"
                    onClick={() => setIsUploadMenuOpen((current) => !current)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-nrl-muted transition-colors hover:bg-nrl-panel-2 hover:text-nrl-text"
                    aria-label="Open upload options"
                    aria-expanded={isUploadMenuOpen}
                  >
                    +
                  </button>
                  {isUploadMenuOpen ? (
                    <div className="absolute bottom-12 left-0 w-72 rounded-2xl border border-nrl-border bg-nrl-panel p-2 shadow-2xl shadow-black/40">
                      <label
                        htmlFor="ai-betting-screenshot-upload"
                        className="flex w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left text-sm font-semibold text-nrl-text transition-colors hover:bg-nrl-panel-2"
                      >
                        <UploadGlyph />
                        <span>Upload betting screenshots</span>
                      </label>
                    </div>
                  ) : null}
                </div>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setPendingDirectTool(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitPrompt();
                    }
                  }}
                  placeholder="Ask anything"
                  disabled={quotaReached}
                  rows={1}
                  className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-nrl-text outline-none placeholder:text-nrl-muted disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={submitRandomPrompt}
                  disabled={isSubmitting || quotaReached}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-nrl-muted transition-colors hover:bg-nrl-panel-2 hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Random prompt"
                  title="Random prompt"
                >
                  🎲
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isSubmitting) {
                      stopCurrentRequest();
                    } else if (message.trim() || pendingImages.length > 0) {
                      void submitPrompt();
                    }
                  }}
                  disabled={!isSubmitting && ((!message.trim() && pendingImages.length === 0) || quotaReached)}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSubmitting
                      ? "border border-rose-400/45 text-sm text-rose-200 hover:bg-rose-500/15"
                      : "bg-nrl-accent text-nrl-bg"
                  }`}
                  aria-label={isSubmitting ? "Stop response" : "Send message"}
                  title={isSubmitting ? "Stop response" : "Send message"}
                >
                  {isSubmitting ? "■" : "↑"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}

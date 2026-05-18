"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useMemo, useState, useCallback, useEffect } from "react";
import type { PlayerStat } from "@/lib/data/types";
import type { PlayerImageRecord } from "@/lib/supabase/queries";
import { PLAYER_STATS } from "@/lib/data/constants";
import {
  filterByFinals,
  filterByYear,
  filterByTeammate,
  getTeammateOptions,
  computeSummary,
  computePercentileRanks,
  computeRecentForm,
  computeRoundData,
  buildFantasyRank,
} from "@/lib/data/transform";
import { FilterBar } from "@/components/filters/filter-bar";
import { ProfileCard } from "@/components/summary/profile-card";
import { StatsTable } from "@/components/summary/stats-table";
import { PercentileRanks } from "@/components/summary/percentile-ranks";
import { RecentForm } from "@/components/summary/recent-form";
import { ChartPanelGrid } from "@/components/charts/chart-panel-grid";
import { ScatterCorrelation } from "@/components/charts/scatter-correlation";
import { KDEDistribution } from "@/components/charts/kde-distribution";
import { WithWithoutLine } from "@/components/charts/with-without-line";
import { WithWithoutKDE } from "@/components/charts/with-without-kde";
import { OpponentAverageHeatmap } from "@/components/charts/opponent-average-heatmap";
import { FantasyGameLogTrendBrush } from "@/components/charts/fantasy-game-log-trend-brush";
import { PillRadio } from "@/components/ui/pill-radio";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SectionDivider } from "@/components/ui/section-divider";
import { hasProPlotAccess } from "@/lib/access/pro-access";
import { isAccessibleSeason } from "@/lib/access/season-access";

interface PlayerComparisonProps {
  initialData: PlayerStat[];
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
  availableYears: string[];
  defaultYears: string[];
  initialCanAccessLoginSeason?: boolean;
  canBypassPlotGate?: boolean;
}

type PlayerStatsTableSortDirection = "asc" | "desc";
type PlayerStatsTableValueMode = "Average" | "Total";
type PlayerStatsTableStatKey = (typeof PLAYER_STATS)[number];
type PlayerStatsTableSortKey =
  | "name"
  | "team"
  | "position"
  | "games"
  | `stat:${PlayerStatsTableStatKey}`;

interface PlayerStatsTableRow {
  name: string;
  team: string | null;
  position: string | null;
  imageRow: PlayerImageRecord | null;
  games: number;
  averages: Partial<Record<PlayerStatsTableStatKey, number | null>>;
  totals: Partial<Record<PlayerStatsTableStatKey, number | null>>;
}

const DEFAULT_PLAYER_1_CANDIDATES = ["Nathan Cleary"];
const DEFAULT_PLAYER_2_CANDIDATES = ["Nicholas Hynes", "Nicho Hynes"];
const DEFAULT_STATS_TABLE_YEAR = "2026";

const PLAYER_STATS_TABLE_COLUMNS = PLAYER_STATS;
const PLAYER_STATS_TABLE_BASE_COLUMNS: Array<{
  key: PlayerStatsTableSortKey;
  label: string;
  align?: "left" | "center" | "right";
}> = [
  { key: "name", label: "Player", align: "left" },
  { key: "team", label: "Team", align: "center" },
  { key: "position", label: "Pos", align: "center" },
  { key: "games", label: "Games", align: "center" },
];

const MINUTES_FILTER_OPTIONS = [
  "Any",
  "10 Mins",
  "20 Mins",
  "30 Mins",
  "40 Mins",
  "50 Mins",
  "60 Mins",
  "70 Mins",
  "80 Mins",
] as const;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value
      .trim()
      .replace(/,/g, "")
      .replace(/%$/, "")
      .replace(/s$/, "");
    if (!cleaned || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function averageNumbers(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatTableNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function getPlayerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase();
}

function withPositionLabel(name: string, position: string): string {
  if (!name || name === "None" || position === "All") return name;
  return `${name} (${position})`;
}

function parseMinutesFilterOption(value: string): number {
  if (!value || value === "Any") return 0;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalisePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveTeamLogoUrl(
  teamName: string | null | undefined,
  teamLogos: Record<string, string>
): string | null {
  const key = normaliseTeamKey(teamName);
  if (!key) return null;
  if (teamLogos[key]) return teamLogos[key];

  const aliases: Record<string, string[]> = {
    broncos: ["brisbane broncos"],
    bulldogs: ["canterbury bulldogs", "canterbury bankstown bulldogs"],
    raiders: ["canberra raiders"],
    sharks: ["cronulla sharks", "cronulla sutherland sharks"],
    titans: ["gold coast titans"],
    "sea eagles": ["manly sea eagles", "manly warringah sea eagles"],
    storm: ["melbourne storm"],
    knights: ["newcastle knights"],
    cowboys: ["north queensland cowboys"],
    eels: ["parramatta eels"],
    panthers: ["penrith panthers"],
    rabbitohs: ["south sydney rabbitohs"],
    dragons: ["st george illawarra dragons", "st george dragons"],
    roosters: ["sydney roosters", "eastern suburbs roosters"],
    warriors: ["new zealand warriors"],
    tigers: ["wests tigers"],
    dolphins: ["the dolphins", "dolphins"],
  };

  for (const alias of aliases[key] ?? []) {
    if (teamLogos[alias]) return teamLogos[alias];
  }

  const entries = Object.entries(teamLogos);
  const partial = entries.find(([logoKey]) => logoKey.endsWith(` ${key}`) || logoKey.includes(key));
  return partial?.[1] ?? null;
}

function parsePersonName(value: string): { first: string; last: string } {
  const parts = normalisePersonName(value).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

const preferredImageIndexByCandidatesKey = new Map<string, number>();
const PLAYER_IMAGE_FALLBACK_URL = "/body-shot.png";

function buildPlayerImageCandidates(imageRow: PlayerImageRecord | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (value: string | null | undefined) => {
    if (!value || typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  const normalizeRemoteAxd = (value: string): string[] => {
    const variants: string[] = [];
    const seenVariants = new Set<string>();
    const pushVariant = (candidate: string | null | undefined) => {
      if (!candidate) return;
      const trimmed = candidate.trim();
      if (!trimmed || seenVariants.has(trimmed)) return;
      seenVariants.add(trimmed);
      variants.push(trimmed);
    };

    if (value.startsWith("http://")) {
      pushVariant(`https://${value.slice("http://".length)}`);
    }
    if (value.includes("/remote.axd?http://")) {
      pushVariant(value.replace("/remote.axd?http://", "/remote.axd?https://"));
    }
    const marker = "/remote.axd?";
    const idx = value.indexOf(marker);
    if (idx >= 0) {
      const nested = value.slice(idx + marker.length);
      if (nested) {
        const httpsNested = nested.startsWith("http://")
          ? `https://${nested.slice("http://".length)}`
          : nested;
        pushVariant(httpsNested);
      }
    }
    pushVariant(value);
    return variants;
  };

  for (const source of [imageRow?.body_image, imageRow?.head_image]) {
    if (!source) continue;
    for (const variant of normalizeRemoteAxd(source)) {
      push(variant);
    }
  }

  push(PLAYER_IMAGE_FALLBACK_URL);
  return out;
}

export function resolvePlayerImage(
  playerName: string,
  teamHint: string | null,
  rows: PlayerImageRecord[]
): PlayerImageRecord | null {
  if (!playerName) return null;
  const targetNorm = normalisePersonName(playerName);
  const targetParsed = parsePersonName(playerName);
  const teamNorm = teamHint ? normalisePersonName(teamHint) : "";

  const candidates = rows.filter((row) => {
    const rowName = row.player ?? "";
    if (!rowName) return false;
    const rowNorm = normalisePersonName(rowName);
    if (rowNorm === targetNorm) return true;
    const parsed = parsePersonName(rowName);
    return (
      parsed.last &&
      parsed.last === targetParsed.last &&
      parsed.first[0] &&
      parsed.first[0] === targetParsed.first[0]
    );
  });

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aTeamMatch = teamNorm && a.team ? normalisePersonName(a.team) === teamNorm : false;
    const bTeamMatch = teamNorm && b.team ? normalisePersonName(b.team) === teamNorm : false;
    if (aTeamMatch !== bTeamMatch) return aTeamMatch ? -1 : 1;

    const aHasBody = Boolean(a.body_image);
    const bHasBody = Boolean(b.body_image);
    if (aHasBody !== bHasBody) return aHasBody ? -1 : 1;

    const aImg = Boolean(a.body_image || a.head_image);
    const bImg = Boolean(b.body_image || b.head_image);
    if (aImg !== bImg) return aImg ? -1 : 1;

    const aDate = a.last_seen_match_date ?? "";
    const bDate = b.last_seen_match_date ?? "";
    return bDate.localeCompare(aDate);
  });

  return sorted[0] ?? null;
}

export function primaryTeamForRows(rows: PlayerStat[]): string | null {
  if (rows.length === 0) return null;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const team = typeof row.Team === "string" ? row.Team : "";
    if (!team) continue;
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function primaryPositionForRows(rows: PlayerStat[]): string | null {
  if (rows.length === 0) return null;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const position = typeof row.Position === "string" ? row.Position : "";
    if (!position) continue;
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function sortYearsDesc(years: string[]): string[] {
  return [...years].sort((a, b) => {
    const aNum = Number.parseInt(a, 10);
    const bNum = Number.parseInt(b, 10);
    if (Number.isNaN(aNum) && Number.isNaN(bNum)) return b.localeCompare(a);
    if (Number.isNaN(aNum)) return 1;
    if (Number.isNaN(bNum)) return -1;
    return bNum - aNum;
  });
}

function primaryValueForLatestSelectedYear(
  rows: PlayerStat[],
  selectedYears: string[],
  key: "Team" | "Position"
): string | null {
  if (rows.length === 0) return null;
  for (const year of sortYearsDesc(selectedYears)) {
    const yearRows = rows.filter((row) => row.Year === year);
    if (yearRows.length === 0) continue;
    return key === "Team" ? primaryTeamForRows(yearRows) : primaryPositionForRows(yearRows);
  }
  return key === "Team" ? primaryTeamForRows(rows) : primaryPositionForRows(rows);
}

function formatFantasyPositionBadge(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "POS";
  const lower = raw.toLowerCase();
  if (lower.includes("fullback")) return "WFB";
  if (lower.includes("wing")) return "WFB";
  if (lower.includes("centre") || lower.includes("center")) return "CTR";
  if (lower.includes("five")) return "HLF";
  if (lower.includes("half")) return "HLF";
  if (lower.includes("hooker")) return "HOK";
  if (lower.includes("prop")) return "MID";
  if (lower.includes("lock")) return "MID";
  if (lower.includes("2nd")) return "EDG";
  if (lower.includes("2rf")) return "EDG";
  if (lower.includes("back row")) return "EDG";
  if (lower.includes("second")) return "EDG";
  if (lower.includes("edge")) return "EDG";
  if (lower.includes("interchange")) return "INT";
  if (raw.length <= 4) return raw.toUpperCase();
  return raw.toUpperCase().slice(0, 4);
}

export function PlayerImageCard({
  title,
  playerName,
  imageRow,
  teamLogoUrl,
  fantasyPosition,
  compact = false,
  frameless = false,
  priority = false,
}: {
  title?: string;
  playerName: string;
  imageRow: PlayerImageRecord | null;
  teamLogoUrl?: string | null;
  fantasyPosition?: string | null;
  compact?: boolean;
  frameless?: boolean;
  priority?: boolean;
}) {
  const imageCandidates = useMemo(() => buildPlayerImageCandidates(imageRow), [imageRow]);
  const imageCandidatesKey = imageCandidates.join("|");
  const [imageAttemptState, setImageAttemptState] = useState<{ key: string; index: number }>({
    key: "",
    index: 0,
  });
  const cachedPreferredIndex = preferredImageIndexByCandidatesKey.get(imageCandidatesKey) ?? 0;
  const initialIndex = Math.max(0, Math.min(cachedPreferredIndex, Math.max(0, imageCandidates.length - 1)));
  const imageIndex =
    imageAttemptState.key === imageCandidatesKey ? imageAttemptState.index : initialIndex;
  const imageUrl = imageCandidates[imageIndex] ?? null;

  useEffect(() => {
    if (imageCandidates.length <= 1) return;
    const preloadUrls = new Set<string>();
    if (imageCandidates[0]) preloadUrls.add(imageCandidates[0]);
    if (imageCandidates[1]) preloadUrls.add(imageCandidates[1]);
    if (imageCandidates[initialIndex]) preloadUrls.add(imageCandidates[initialIndex]);

    const preloaded: HTMLImageElement[] = [];
    for (const url of preloadUrls) {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      preloaded.push(image);
    }

    return () => {
      for (const image of preloaded) {
        image.src = "";
      }
    };
  }, [imageCandidates, initialIndex]);
  const showStats = !frameless;
  const statSlots = [
    { key: "PAC", value: "--" },
    { key: "DRI", value: "--" },
    { key: "SHO", value: "--" },
    { key: "DEF", value: "--" },
    { key: "PAS", value: "--" },
    { key: "PHY", value: "--" },
  ] as const;
  const positionBadge = formatFantasyPositionBadge(fantasyPosition ?? imageRow?.position);
  const isFramelessCompact = frameless && compact;
  const isFramelessScale = frameless && !compact;
  const nameTextClass = compact
    ? isFramelessCompact
      ? "px-1 text-[5.4px] leading-none tracking-[0.08em]"
      : "text-[10px]"
    : isFramelessScale
      ? "text-[clamp(7.8px,0.6vw,9.8px)]"
      : "text-[clamp(11px,1.4vw,15px)]";
  const teamTextClass = compact
    ? isFramelessCompact
      ? "px-1 text-[3.9px] tracking-[0.18em]"
      : "text-[6px] tracking-[0.12em]"
    : isFramelessScale
      ? "text-[4.5px] tracking-[0.1em]"
      : "text-[8px] tracking-[0.15em]";
  const statGridClass = compact
    ? isFramelessCompact
      ? "mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5"
      : "mt-1 grid grid-cols-2 gap-x-2 gap-y-0"
    : isFramelessScale
      ? "mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5"
      : "mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5";
  const statLabelClass = compact
    ? isFramelessCompact
      ? "text-[7.6px] tracking-[0.08em]"
      : "text-[6.5px] tracking-[0.08em]"
    : isFramelessScale
      ? "text-[5.2px] tracking-[0.08em] md:text-[5.8px] xl:text-[6.1px]"
      : "text-[9px] tracking-[0.1em]";
  const statValueClass = compact
    ? isFramelessCompact
      ? "text-[7.6px]"
      : "text-[6.5px]"
    : isFramelessScale
      ? "text-[5.2px] md:text-[5.8px] xl:text-[6.1px]"
      : "text-[9px]";
  const panelPaddingClass = compact
    ? isFramelessCompact
      ? "px-2 py-1"
      : "px-2 pt-1.5 pb-1"
    : isFramelessScale
      ? "px-3 py-2"
      : "px-3 pt-2 pb-1.5";
  const teamRowMarginClass = isFramelessCompact ? "mt-0.5" : frameless ? "mt-0" : "mt-0.5";
  const positionTextClass = compact
    ? isFramelessCompact
      ? "text-[10.4px]"
      : "text-[10px]"
    : isFramelessScale
      ? "text-[9px]"
      : "text-[14px]";
  const positionMinWidthClass = compact
    ? isFramelessCompact
      ? "min-w-[1.65rem]"
      : "min-w-[1.8rem]"
    : isFramelessScale
      ? "min-w-[1.95rem]"
      : "min-w-[2.2rem]";
  const infoPanelBoundsClass = isFramelessCompact
    ? "absolute inset-x-[18.5%] top-[58.8%] bottom-[20.8%] z-40 rounded-lg border border-[#1adb70]/15 bg-[#021021]/62"
    : isFramelessScale
      ? "absolute inset-x-[21.2%] top-[60.4%] bottom-[23%] z-40 rounded-lg border border-[#1adb70]/15 bg-[#021021]/62"
      : "absolute inset-x-[20%] top-[47.8%] bottom-[23%] z-40 rounded-lg border border-[#1adb70]/15 bg-[#021021]/62";
  const positionRowClass = isFramelessCompact
    ? "absolute inset-x-0 bottom-[8.8%] z-50 flex justify-center pointer-events-none"
    : isFramelessScale
      ? "absolute inset-x-0 bottom-[8.6%] z-50 flex justify-center pointer-events-none"
      : "absolute inset-x-0 bottom-[8.1%] z-50 flex justify-center pointer-events-none";
  const frameAssetClass = frameless
    ? "absolute inset-[4%] z-20 h-[92%] w-[92%] object-contain pointer-events-none"
    : "absolute inset-[12%] z-20 h-[76%] w-[76%] object-contain pointer-events-none";
  const frameContentClass = frameless
    ? "absolute inset-[4%] z-30"
    : "absolute inset-[12%] z-30";
  const displayPlayerName = playerName || "No player selected";
  const displayTeamName = imageRow?.team ?? "";
  const cardVisual = (
    <div
      className={
        frameless
          ? "mx-auto aspect-square w-full max-w-[26rem] xl:max-w-[30rem]"
          : `mx-auto w-full ${compact ? "max-w-[430px]" : "max-w-[430px]"}`
      }
    >
      <div
        className={
          frameless
            ? "relative h-full w-full"
            : "relative aspect-square rounded-xl border border-nrl-border/60 bg-[#071224]"
        }
      >
        {!frameless ? <div className="absolute inset-4 rounded-xl bg-[#041022]" /> : null}

        {/* frame asset */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/backgrounds_21_TT_A4.png"
          alt=""
          aria-hidden="true"
          className={frameAssetClass}
        />

        {/* Keep all content locked to the card frame bounds */}
        <div className={frameContentClass}>
          {teamLogoUrl ? (
            <div className="absolute left-[22%] top-[11.5%] z-[60] flex h-[8.5%] w-[8.5%] min-h-5 min-w-5 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={teamLogoUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}

          {/* player photo */}
          <div
            className={
              frameless
                ? "absolute inset-x-[10.5%] top-[2.5%] h-[58%] z-50 flex items-end justify-center overflow-hidden rounded-md"
                : "absolute inset-x-[13%] top-[4%] h-[44%] z-50 flex items-end justify-center overflow-hidden rounded-md"
            }
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(29,255,143,0.14),rgba(0,0,0,0)_72%)]" />
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={`${playerName} player image`}
                className={frameless ? "relative z-10 max-h-[99%] w-auto object-contain" : "relative z-10 max-h-[94%] w-auto object-contain"}
                loading="eager"
                fetchPriority={priority ? "high" : "auto"}
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => {
                  preferredImageIndexByCandidatesKey.set(imageCandidatesKey, imageIndex);
                }}
                onError={() => {
                  setImageAttemptState((prev) => ({
                    key: imageCandidatesKey,
                    index: (prev.key === imageCandidatesKey ? prev.index : 0) + 1,
                  }));
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-nrl-muted">
                Image unavailable
              </div>
            )}
          </div>

          {/* Combined name/team + stats panel */}
          <div
            className={`${infoPanelBoundsClass} ${panelPaddingClass}`}
          >
            <div className={showStats ? undefined : "flex h-full flex-col items-center justify-center gap-[1px]"}>
              <div
                className={`text-center font-extrabold tracking-wide text-white ${nameTextClass} ${
                  isFramelessCompact ? "w-full truncate whitespace-nowrap" : "truncate"
                }`}
              >
                {isFramelessCompact ? displayPlayerName.toUpperCase() : displayPlayerName.toUpperCase()}
              </div>
              <div
                className={`${teamRowMarginClass} text-center font-semibold text-[#d7ffe9] drop-shadow-[0_1px_2px_rgba(0,0,0,0.72)] ${teamTextClass} ${
                  isFramelessCompact ? "w-full truncate whitespace-nowrap" : "truncate"
                }`}
              >
                {displayTeamName.toUpperCase()}
              </div>
              {showStats ? (
                <div className={statGridClass}>
                  {statSlots.map((stat) => (
                    <div key={stat.key} className="flex items-center justify-between gap-2">
                      <span className={`font-bold text-[#b8ffe0] drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] ${statLabelClass}`}>
                        {stat.key}
                      </span>
                      <span className={`font-semibold text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${statValueClass}`}>
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Primary fantasy position in the frame's bottom hexagon */}
          <div className={positionRowClass}>
            <div
              className={`text-center font-extrabold tracking-[0.08em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${positionMinWidthClass} ${positionTextClass}`}
            >
              {positionBadge}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (frameless) return cardVisual;

  return (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
      <div className="border-b border-nrl-border bg-nrl-panel-2 px-4 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">{title}</div>
      </div>
      <div className="p-4">{cardVisual}</div>
    </div>
  );
}

export function SimplePlayerPhotoTile({
  playerName,
  imageRow,
  priority = false,
  className,
  imageHeightClass,
}: {
  playerName: string;
  imageRow: PlayerImageRecord | null;
  priority?: boolean;
  className?: string;
  imageHeightClass?: string;
}) {
  const imageCandidates = useMemo(() => buildPlayerImageCandidates(imageRow), [imageRow]);
  const imageCandidatesKey = imageCandidates.join("|");
  const [imageAttemptState, setImageAttemptState] = useState<{ key: string; index: number }>({
    key: "",
    index: 0,
  });
  const cachedPreferredIndex = preferredImageIndexByCandidatesKey.get(imageCandidatesKey) ?? 0;
  const initialIndex = Math.max(0, Math.min(cachedPreferredIndex, Math.max(0, imageCandidates.length - 1)));
  const imageIndex =
    imageAttemptState.key === imageCandidatesKey ? imageAttemptState.index : initialIndex;
  const imageUrl = imageCandidates[imageIndex] ?? null;

  return (
    <div className={`min-w-0 w-full overflow-hidden rounded-2xl border border-[#1d3a63] bg-[#0b1832] shadow-[0_18px_40px_rgba(0,0,0,0.28)] ${className ?? "max-w-[8rem] sm:max-w-[15rem]"}`}>
      <div className={`relative flex items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(92,132,255,0.2),transparent_60%),linear-gradient(180deg,#112347,#0a1327)] ${imageHeightClass ?? "h-[7.5rem] sm:h-[15rem]"}`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(71,255,182,0.22),transparent_34%),radial-gradient(circle_at_74%_78%,rgba(129,92,255,0.24),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
        <div className="pointer-events-none absolute left-[8%] top-[12%] h-20 w-20 rounded-full bg-emerald-300/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-[10%] right-[12%] h-24 w-24 rounded-full bg-violet-400/12 blur-3xl" />
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${playerName} player image`}
            className="relative z-10 max-h-[96%] w-auto object-contain"
            loading="eager"
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => {
              preferredImageIndexByCandidatesKey.set(imageCandidatesKey, imageIndex);
            }}
            onError={() => {
              setImageAttemptState((prev) => ({
                key: imageCandidatesKey,
                index: (prev.key === imageCandidatesKey ? prev.index : 0) + 1,
              }));
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-nrl-muted">
            Image unavailable
          </div>
        )}
      </div>
      <div className="border-t border-[#1d3a63] px-2.5 py-2 text-center sm:px-4 sm:py-3">
        <div className="truncate text-[12px] font-semibold text-white sm:text-sm">{playerName || "No player selected"}</div>
      </div>
    </div>
  );
}

function PlayerStatsTableThumbnail({
  name,
  imageRow,
}: {
  name: string;
  imageRow: PlayerImageRecord | null;
}) {
  const imageCandidates = useMemo(() => buildPlayerImageCandidates(imageRow), [imageRow]);
  const imageCandidatesKey = imageCandidates.join("|");
  const [imageAttemptState, setImageAttemptState] = useState<{ key: string; index: number }>({
    key: "",
    index: 0,
  });
  const imageIndex = imageAttemptState.key === imageCandidatesKey ? imageAttemptState.index : 0;
  const imageUrl = imageCandidates[imageIndex] ?? null;

  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel-2 text-[10px] text-nrl-muted">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover object-top"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            setImageAttemptState((prev) => ({
              key: imageCandidatesKey,
              index: (prev.key === imageCandidatesKey ? prev.index : 0) + 1,
            }));
          }}
        />
      ) : (
        <span>{getPlayerInitials(name)}</span>
      )}
    </div>
  );
}

export function PlayerComparison({
  initialData,
  playerImages,
  availableYears,
  defaultYears,
  initialCanAccessLoginSeason = false,
  canBypassPlotGate = false,
}: PlayerComparisonProps) {
  type TeammateMode = "both" | "with" | "without";
  type PercentileScope = "Position" | "All Players";
  const { isLoaded: isAuthLoaded, userId } = useAuth();
  const { user } = useUser();
  const canAccessLoginSeason = isAuthLoaded
    ? Boolean(userId)
    : initialCanAccessLoginSeason;
  const hasClientProPlotAccess =
    canBypassPlotGate || hasProPlotAccess(userId, user?.publicMetadata);

  const [allData, setAllData] = useState<PlayerStat[]>(initialData);
  const unlockedYears = useMemo(
    () =>
      availableYears.filter((year) =>
        isAccessibleSeason(year, canAccessLoginSeason, "stats", hasClientProPlotAccess)
      ),
    [availableYears, canAccessLoginSeason, hasClientProPlotAccess]
  );
  const initialYears = useMemo(() => {
    if (unlockedYears.includes(DEFAULT_STATS_TABLE_YEAR)) return [DEFAULT_STATS_TABLE_YEAR];
    const validDefaultYears = defaultYears.filter((year) => unlockedYears.includes(year));
    if (validDefaultYears.length > 0) return validDefaultYears;
    return unlockedYears.slice(0, 1);
  }, [defaultYears, unlockedYears]);
  const [selectedYears, setSelectedYears] = useState<string[]>(initialYears);
  const [statsTableYears, setStatsTableYears] = useState<string[]>(initialYears);
  const [statsTablePosition, setStatsTablePosition] = useState("All Positions");
  const [statsTableTeam, setStatsTableTeam] = useState("All Teams");
  const [statsTableSort, setStatsTableSort] = useState<{
    column: PlayerStatsTableSortKey;
    direction: PlayerStatsTableSortDirection;
  }>({ column: "stat:Fantasy", direction: "desc" });
  const [statsTableValueMode, setStatsTableValueMode] = useState<PlayerStatsTableValueMode>("Average");
  const [loading, setLoading] = useState(
    initialData.length === 0 && initialYears.length > 0
  );
  const filterUnlockedYears = useCallback(
    (years: string[]) => years.filter((year) => unlockedYears.includes(year)),
    [unlockedYears]
  );
  const ensureAtLeastOneUnlockedYear = useCallback(
    (years: string[]) => (years.length > 0 ? years : unlockedYears.slice(0, 1)),
    [unlockedYears]
  );

  const loadedYears = useMemo(
    () => new Set(allData.map((row) => String(row.Year ?? ""))),
    [allData]
  );

  const loadYears = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    if (validYears.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/player-stats?years=${validYears.join(",")}`);
      if (res.ok) {
        const data = (await res.json()) as PlayerStat[];
        const fetchedYears = new Set(validYears);
        setAllData((prev) => [
          ...prev.filter((row) => !fetchedYears.has(String(row.Year ?? ""))),
          ...data,
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears]);

  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    setSelectedYears(validYears);
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears]);
  const handleStatsTableYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    setStatsTableYears(validYears);
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears]);
  const [finalsMode, setFinalsMode] = useState("Yes");
  const [minutesOverFilter, setMinutesOverFilter] = useState<string>("Any");
  const [minutesUnderFilter, setMinutesUnderFilter] = useState<string>("Any");
  const [percentileScope, setPercentileScope] = useState<PercentileScope>("Position");

  // Filter pipeline
  const dfYear = useMemo(
    () => filterByYear(allData, selectedYears),
    [allData, selectedYears]
  );
  const dfYearFinals = useMemo(
    () => filterByFinals(dfYear, finalsMode as "Yes" | "No"),
    [dfYear, finalsMode]
  );
  const plotDfYear = useMemo(
    () => filterByYear(allData, selectedYears),
    [allData, selectedYears]
  );
  const plotDfYearFinals = useMemo(
    () => filterByFinals(plotDfYear, finalsMode as "Yes" | "No"),
    [plotDfYear, finalsMode]
  );
  const filteredByMinutes = useMemo(() => {
    const overThreshold = parseMinutesFilterOption(minutesOverFilter);
    const underThreshold = parseMinutesFilterOption(minutesUnderFilter);
    return dfYearFinals.filter((row) => {
      const mins = toFiniteNumber(row["Mins Played"]) ?? 0;
      if (overThreshold > 0 && mins < overThreshold) return false;
      if (underThreshold > 0 && mins > underThreshold) return false;
      return true;
    });
  }, [dfYearFinals, minutesOverFilter, minutesUnderFilter]);
  const plotFilteredByMinutes = useMemo(() => {
    const overThreshold = parseMinutesFilterOption(minutesOverFilter);
    const underThreshold = parseMinutesFilterOption(minutesUnderFilter);
    return plotDfYearFinals.filter((row) => {
      const mins = toFiniteNumber(row["Mins Played"]) ?? 0;
      if (overThreshold > 0 && mins < overThreshold) return false;
      if (underThreshold > 0 && mins > underThreshold) return false;
      return true;
    });
  }, [plotDfYearFinals, minutesOverFilter, minutesUnderFilter]);
  const df = useMemo(() => filteredByMinutes, [filteredByMinutes]);
  const dfAllPositions = useMemo(() => filteredByMinutes, [filteredByMinutes]);
  const plotDf = useMemo(() => plotFilteredByMinutes, [plotFilteredByMinutes]);

  const positions = useMemo(
    () => [...new Set(dfYearFinals.map((r) => r.Position))].filter(Boolean).sort(),
    [dfYearFinals]
  );

  const fantasyRank = useMemo(() => buildFantasyRank(allData), [allData]);

  const statList = useMemo(
    () =>
      (PLAYER_STATS as unknown as string[]).filter((s) =>
        df.some((r) => r[s] !== undefined)
      ),
    [df]
  );

  const statsTableSourceRows = useMemo(
    () => filterByYear(allData, statsTableYears),
    [allData, statsTableYears]
  );

  const statsTablePositionOptions = useMemo(
    () => ["All Positions", ...Array.from(new Set(statsTableSourceRows.map((row) => row.Position))).filter(Boolean).sort()],
    [statsTableSourceRows]
  );

  const statsTableTeamOptions = useMemo(
    () => ["All Teams", ...Array.from(new Set(statsTableSourceRows.map((row) => row.Team))).filter(Boolean).sort()],
    [statsTableSourceRows]
  );

  const statsTableRows = useMemo<PlayerStatsTableRow[]>(() => {
    const filteredRows = statsTableSourceRows.filter((row) => {
      if (statsTablePosition !== "All Positions" && row.Position !== statsTablePosition) return false;
      if (statsTableTeam !== "All Teams" && row.Team !== statsTableTeam) return false;
      return true;
    });
    const byPlayer = new Map<string, PlayerStat[]>();

    for (const row of filteredRows) {
      const rows = byPlayer.get(row.Name) ?? [];
      rows.push(row);
      byPlayer.set(row.Name, rows);
    }

    return [...byPlayer.entries()].map(([name, rows]) => {
      const averages: Partial<Record<PlayerStatsTableStatKey, number | null>> = {};
      const totals: Partial<Record<PlayerStatsTableStatKey, number | null>> = {};
      for (const stat of PLAYER_STATS_TABLE_COLUMNS) {
        const values = rows.map((row) => toFiniteNumber(row[stat]));
        averages[stat] = averageNumbers(values);
        const validValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
        totals[stat] = validValues.length > 0 ? validValues.reduce((sum, value) => sum + value, 0) : null;
      }

      return {
        name,
        team: primaryTeamForRows(rows),
        position: primaryPositionForRows(rows),
        imageRow: resolvePlayerImage(name, primaryTeamForRows(rows), playerImages),
        games: rows.length,
        averages,
        totals,
      };
    });
  }, [playerImages, statsTablePosition, statsTableSourceRows, statsTableTeam]);

  const sortedStatsTableRows = useMemo(() => {
    const getSortValue = (row: PlayerStatsTableRow): number | string | null => {
      if (statsTableSort.column === "name") return row.name.toLowerCase();
      if (statsTableSort.column === "team") return row.team?.toLowerCase() ?? null;
      if (statsTableSort.column === "position") return row.position?.toLowerCase() ?? null;
      if (statsTableSort.column === "games") return row.games;

      const statKey = statsTableSort.column.slice("stat:".length) as PlayerStatsTableStatKey;
      return statsTableValueMode === "Total" ? row.totals[statKey] ?? null : row.averages[statKey] ?? null;
    };

    return [...statsTableRows].sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);
      if (aValue === null && bValue === null) return a.name.localeCompare(b.name);
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      const direction = statsTableSort.direction === "asc" ? 1 : -1;
      if (typeof aValue === "number" && typeof bValue === "number") {
        if (aValue !== bValue) return (aValue - bValue) * direction;
        return a.name.localeCompare(b.name);
      }

      return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [statsTableRows, statsTableSort, statsTableValueMode]);

  const toggleStatsTableSort = useCallback((column: PlayerStatsTableSortKey) => {
    setStatsTableSort((current) => ({
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  // Player selections
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [player1Position, setPlayer1Position] = useState("All");
  const [player2Position, setPlayer2Position] = useState("All");
  const [teammate1, setTeammate1] = useState("None");
  const [teammate2, setTeammate2] = useState("None");
  const [teammate1Position, setTeammate1Position] = useState("All");
  const [teammate2Position, setTeammate2Position] = useState("All");
  const [teammateMode1, setTeammateMode1] = useState<TeammateMode>("both");
  const [teammateMode2, setTeammateMode2] = useState<TeammateMode>("both");
  const [stat1, setStat1] = useState("All Run Metres");
  const [stat2, setStat2] = useState("Kicking Metres");
  const [wwYear, setWwYear] = useState(selectedYears[0] ?? "");

  useEffect(() => {
    if (selectedYears.length > 0 || unlockedYears.length === 0) return;
    setSelectedYears(unlockedYears.slice(0, 1));
  }, [selectedYears.length, unlockedYears]);

  useEffect(() => {
    if (statsTableYears.length > 0 || unlockedYears.length === 0) return;
    setStatsTableYears(unlockedYears.slice(0, 1));
  }, [statsTableYears.length, unlockedYears]);

  useEffect(() => {
    const neededYears = [...new Set([...selectedYears, ...statsTableYears])];
    const missingSelectedYears = neededYears.filter((year) => !loadedYears.has(year));
    if (missingSelectedYears.length === 0) return;
    void loadYears(missingSelectedYears);
  }, [loadYears, loadedYears, selectedYears, statsTableYears]);

  useEffect(() => {
    const validYears = selectedYears.filter((year) => unlockedYears.includes(year));
    const hasChanged =
      validYears.length !== selectedYears.length ||
      validYears.some((year, index) => year !== selectedYears[index]);
    if (!hasChanged) return;
    void handleYearsChange(validYears);
  }, [handleYearsChange, selectedYears, unlockedYears]);

  useEffect(() => {
    const validYears = statsTableYears.filter((year) => unlockedYears.includes(year));
    const hasChanged =
      validYears.length !== statsTableYears.length ||
      validYears.some((year, index) => year !== statsTableYears[index]);
    if (!hasChanged) return;
    void handleStatsTableYearsChange(validYears);
  }, [handleStatsTableYearsChange, statsTableYears, unlockedYears]);

  useEffect(() => {
    setAllData((prev) => {
      const next = prev.filter((row) => unlockedYears.includes(String(row.Year ?? "")));
      return next.length === prev.length ? prev : next;
    });
  }, [unlockedYears]);

  const sortPlayersByRank = useCallback((names: string[]) => {
    return [...names].sort((a, b) => {
      const ra = -(fantasyRank.get(a) ?? -Infinity);
      const rb = -(fantasyRank.get(b) ?? -Infinity);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }, [fantasyRank]);

  const p1PlayerOptions = useMemo(() => {
    const pool = player1Position === "All"
      ? df
      : df.filter((r) => r.Position === player1Position);
    return sortPlayersByRank([...new Set(pool.map((r) => r.Name))]);
  }, [df, player1Position, sortPlayersByRank]);

  const p2PlayerOptions = useMemo(() => {
    const pool = player2Position === "All"
      ? df
      : df.filter((r) => r.Position === player2Position);
    return sortPlayersByRank([...new Set(pool.map((r) => r.Name))]);
  }, [df, player2Position, sortPlayersByRank]);

  const hasPlayer1 = player1 !== "" && player1 !== "None";
  const hasPlayer2 = player2 !== "None";
  const hasTwoPlayers = hasPlayer1 && hasPlayer2;
  const usePlayer2AsPrimary = !hasPlayer1 && hasPlayer2;

  const effectiveP1 = usePlayer2AsPrimary
    ? player2
    : hasPlayer1
      ? player1
      : p1PlayerOptions[0] || "";
  const effectiveP1Position = usePlayer2AsPrimary ? player2Position : player1Position;
  const effectiveP1Teammate = usePlayer2AsPrimary ? teammate2 : teammate1;
  const effectiveP1TeammatePosition = usePlayer2AsPrimary ? teammate2Position : teammate1Position;
  const effectiveP1TeammateMode = usePlayer2AsPrimary ? teammateMode2 : teammateMode1;

  const effectiveP1Label = withPositionLabel(effectiveP1, effectiveP1Position);
  const player2Label = withPositionLabel(player2, player2Position);
  const teammate1Label = withPositionLabel(effectiveP1Teammate, effectiveP1TeammatePosition);
  const teammate2Label = withPositionLabel(teammate2, teammate2Position);

  const tm1Options = useMemo(
    () =>
      hasPlayer1 && player1
        ? getTeammateOptions(player1, dfYearFinals, fantasyRank)
        : [],
    [hasPlayer1, player1, dfYearFinals, fantasyRank]
  );
  const tm2Options = useMemo(
    () =>
      hasPlayer2
        ? getTeammateOptions(player2, dfYearFinals, fantasyRank)
        : [],
    [hasPlayer2, player2, dfYearFinals, fantasyRank]
  );
  const hasLoadedData = allData.length > 0;

  useEffect(() => {
    if (!hasLoadedData) return;
    const findPreferredPlayer = (options: string[], candidates: string[], exclude?: string) => {
      for (const candidate of candidates) {
        const exact = options.find(
          (name) => name !== exclude && name.toLowerCase() === candidate.toLowerCase()
        );
        if (exact) return exact;
      }
      for (const candidate of candidates) {
        const partial = options.find(
          (name) => name !== exclude && name.toLowerCase().includes(candidate.toLowerCase())
        );
        if (partial) return partial;
      }
      return options.find((name) => name !== exclude) ?? "";
    };

    const nextPlayer1 = p1PlayerOptions.includes(player1)
      ? player1
      : findPreferredPlayer(p1PlayerOptions, DEFAULT_PLAYER_1_CANDIDATES);
    if (nextPlayer1 !== player1) {
      setPlayer1(nextPlayer1);
      return;
    }

    if (player2 === "None") return;
    const nextPlayer2 = p2PlayerOptions.includes(player2)
      ? player2
      : (findPreferredPlayer(p2PlayerOptions, DEFAULT_PLAYER_2_CANDIDATES, nextPlayer1) || "None");
    if (nextPlayer2 !== player2) {
      setPlayer2(nextPlayer2);
    }
  }, [hasLoadedData, p1PlayerOptions, p2PlayerOptions, player1, player2]);

  const handleTeammate1Change = useCallback((value: string) => {
    setTeammate1(value);
    setTeammate1Position("All");
    setTeammateMode1("both");
  }, []);

  const handleTeammate2Change = useCallback((value: string) => {
    setTeammate2(value);
    setTeammate2Position("All");
    setTeammateMode2("both");
  }, []);

  const p1BaseRows = useMemo(
    () =>
      df.filter(
        (r) =>
          r.Name === effectiveP1 &&
          (effectiveP1Position === "All" || r.Position === effectiveP1Position)
      ),
    [df, effectiveP1, effectiveP1Position]
  );
  const p2BaseRows = useMemo(
    () =>
      !hasTwoPlayers
        ? []
        : df.filter(
            (r) =>
              r.Name === player2 &&
              (player2Position === "All" || r.Position === player2Position)
          ),
    [df, hasTwoPlayers, player2, player2Position]
  );
  const p1AllRows = useMemo(
    () =>
      dfAllPositions.filter(
        (r) =>
          r.Name === effectiveP1 &&
          (effectiveP1Position === "All" || r.Position === effectiveP1Position)
      ),
    [dfAllPositions, effectiveP1, effectiveP1Position]
  );
  const p2AllRows = useMemo(
    () =>
      !hasTwoPlayers
        ? []
        : dfAllPositions.filter(
            (r) =>
              r.Name === player2 &&
              (player2Position === "All" || r.Position === player2Position)
          ),
    [dfAllPositions, hasTwoPlayers, player2, player2Position]
  );

  // Filter by teammate
  const p1PlotBaseRows = useMemo(
    () =>
      plotDf.filter(
        (r) =>
          r.Name === effectiveP1 &&
          (effectiveP1Position === "All" || r.Position === effectiveP1Position)
      ),
    [plotDf, effectiveP1, effectiveP1Position]
  );
  const p2PlotBaseRows = useMemo(
    () =>
      !hasTwoPlayers
        ? []
        : plotDf.filter(
            (r) =>
              r.Name === player2 &&
              (player2Position === "All" || r.Position === player2Position)
          ),
    [plotDf, hasTwoPlayers, player2, player2Position]
  );

  const p1Rows = useMemo(() => {
    if (effectiveP1Teammate === "None" || effectiveP1TeammateMode === "both") return p1BaseRows;
    return filterByTeammate(
      p1BaseRows,
      effectiveP1Teammate,
      effectiveP1TeammateMode === "with",
      dfYearFinals,
      effectiveP1TeammatePosition
    );
  }, [p1BaseRows, effectiveP1Teammate, effectiveP1TeammateMode, dfYearFinals, effectiveP1TeammatePosition]);

  const p2Rows = useMemo(() => {
    if (!hasTwoPlayers) return [];
    if (teammate2 === "None" || teammateMode2 === "both") return p2BaseRows;
    return filterByTeammate(
      p2BaseRows,
      teammate2,
      teammateMode2 === "with",
      dfYearFinals,
      teammate2Position
    );
  }, [hasTwoPlayers, p2BaseRows, teammate2, teammateMode2, dfYearFinals, teammate2Position]);
  const p1PlotRows = useMemo(() => {
    if (effectiveP1Teammate === "None" || effectiveP1TeammateMode === "both") return p1PlotBaseRows;
    return filterByTeammate(
      p1PlotBaseRows,
      effectiveP1Teammate,
      effectiveP1TeammateMode === "with",
      plotDfYearFinals,
      effectiveP1TeammatePosition
    );
  }, [effectiveP1Teammate, effectiveP1TeammateMode, effectiveP1TeammatePosition, p1PlotBaseRows, plotDfYearFinals]);
  const p2PlotRows = useMemo(() => {
    if (!hasTwoPlayers) return [];
    if (teammate2 === "None" || teammateMode2 === "both") return p2PlotBaseRows;
    return filterByTeammate(
      p2PlotBaseRows,
      teammate2,
      teammateMode2 === "with",
      plotDfYearFinals,
      teammate2Position
    );
  }, [hasTwoPlayers, p2PlotBaseRows, plotDfYearFinals, teammate2, teammate2Position, teammateMode2]);

  // Stats
  const statsToShow = useMemo(
    () => [stat1, ...(stat2 !== "None" ? [stat2] : [])],
    [stat1, stat2]
  );

  const summaryRows = useMemo(() => {
    const rows = computeSummary(effectiveP1Label, p1Rows, statsToShow);
    if (hasTwoPlayers) {
      rows.push(...computeSummary(player2Label, p2Rows, statsToShow));
    }
    return rows;
  }, [effectiveP1Label, p1Rows, hasTwoPlayers, player2Label, p2Rows, statsToShow]);

  const entities = useMemo(() => {
    const e = [{ name: effectiveP1Label, rows: p1Rows as (PlayerStat)[] }];
    if (hasTwoPlayers) e.push({ name: player2Label, rows: p2Rows as (PlayerStat)[] });
    return e;
  }, [effectiveP1Label, p1Rows, hasTwoPlayers, player2Label, p2Rows]);

  const p1CardTeam = useMemo(
    () => primaryValueForLatestSelectedYear(p1AllRows, selectedYears, "Team"),
    [p1AllRows, selectedYears]
  );
  const p2CardTeam = useMemo(
    () => (hasTwoPlayers ? primaryValueForLatestSelectedYear(p2AllRows, selectedYears, "Team") : null),
    [hasTwoPlayers, p2AllRows, selectedYears]
  );
  const p1CardImage = useMemo(
    () => resolvePlayerImage(effectiveP1, p1CardTeam, playerImages),
    [effectiveP1, p1CardTeam, playerImages]
  );
  const p2CardImage = useMemo(
    () => (hasTwoPlayers ? resolvePlayerImage(player2, p2CardTeam, playerImages) : null),
    [hasTwoPlayers, player2, p2CardTeam, playerImages]
  );

  const percentileResults = useMemo(() => {
    const primaryPosition = (rows: PlayerStat[]): string | null => {
      if (rows.length === 0) return null;
      const counts = new Map<string, number>();
      for (const row of rows) {
        counts.set(row.Position, (counts.get(row.Position) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };

    const percentilePoolForPlayer = (allRowsForPlayer: PlayerStat[]): PlayerStat[] => {
      if (percentileScope === "All Players") return dfAllPositions;
      const pos = primaryPosition(allRowsForPlayer);
      if (!pos) return dfAllPositions;
      return dfAllPositions.filter((r) => r.Position === pos);
    };

    const p1Pool = percentilePoolForPlayer(p1AllRows);
    const results = computePercentileRanks(effectiveP1, p1Rows, p1Pool, statsToShow).map((r) => ({
      ...r,
      entity: effectiveP1Label,
    }));
    if (hasTwoPlayers) {
      const p2Pool = percentilePoolForPlayer(p2AllRows);
      results.push(
        ...computePercentileRanks(player2, p2Rows, p2Pool, statsToShow).map((r) => ({
          ...r,
          entity: player2Label,
        }))
      );
    }
    return results;
  }, [effectiveP1, effectiveP1Label, p1Rows, p1AllRows, hasTwoPlayers, player2, player2Label, p2Rows, p2AllRows, dfAllPositions, percentileScope, statsToShow]);

  const recentFormResults = useMemo(() => {
    const results = computeRecentForm(effectiveP1, p1Rows, statsToShow).map((r) => ({
      ...r,
      entity: effectiveP1Label,
    }));
    if (hasTwoPlayers) {
      results.push(
        ...computeRecentForm(player2, p2Rows, statsToShow).map((r) => ({
          ...r,
          entity: player2Label,
        }))
      );
    }
    return results;
  }, [effectiveP1, effectiveP1Label, p1Rows, hasTwoPlayers, player2, player2Label, p2Rows, statsToShow]);

  // Build chart panels
  const chartPanels = useMemo(() => {
    const panels: { id: string; title: string; content: React.ReactNode; wide?: boolean }[] = [];
    const hasTwoStats = stat2 !== "None";

    // Correlation panels (always half-width)
    if (hasTwoStats) {
      panels.push({
        id: "corr-p1",
        title: `${effectiveP1Label}: ${stat1} vs ${stat2}`,
        content: (
          <ScatterCorrelation
            rows={p1Rows}
            statX={stat1}
            statY={stat2}
            title={`${effectiveP1Label} \u2014 ${stat1} vs ${stat2}`}
            label={effectiveP1Label}
          />
        ),
      });
      if (hasTwoPlayers) {
        panels.push({
          id: "corr-p2",
          title: `${player2Label}: ${stat1} vs ${stat2}`,
          content: (
            <ScatterCorrelation
              rows={p2Rows}
              statX={stat1}
              statY={stat2}
              title={`${player2Label} \u2014 ${stat1} vs ${stat2}`}
              label={player2Label}
            />
          ),
        });
      }
    }

    const stat1Series = [
      { label: effectiveP1, values: p1Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null) },
      ...(hasTwoPlayers
        ? [{ label: player2, values: p2Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
        : []),
    ];
    const stat2Series = hasTwoStats
      ? [
          { label: effectiveP1, values: p1Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null) },
          ...(hasTwoPlayers
            ? [{ label: player2, values: p2Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
            : []),
        ]
      : [];

    const stat1DistTitle = hasTwoPlayers
      ? `${stat1} Distribution`
      : `${effectiveP1Label} ${stat1} Distribution`;
    const stat2DistTitle = hasTwoPlayers
      ? `${stat2} Distribution`
      : `${effectiveP1Label} ${stat2} Distribution`;

    panels.push({
      id: "dist-1",
      title: stat1DistTitle,
      content: (
        <KDEDistribution
          title={stat1DistTitle}
          stat={stat1}
          series={stat1Series}
        />
      ),
    });
    if (hasTwoStats) {
      panels.push({
        id: "dist-2",
        title: stat2DistTitle,
        content: (
          <KDEDistribution
            title={stat2DistTitle}
            stat={stat2}
            series={stat2Series}
          />
        ),
      });
    }

    panels.push({
      id: "rolling-p1",
      title: `${effectiveP1Label}: ${stat1} Rolling Average`,
      wide: true,
      content: (
        <FantasyGameLogTrendBrush
          rows={p1PlotRows}
          headerTitle="Rolling Average Plot"
          valueLabel={stat1}
          primarySeriesLabel={effectiveP1Label}
          valueAccessor={(row) => toFiniteNumber(row[stat1]) ?? 0}
        />
      ),
    });
    if (hasTwoPlayers) {
      panels.push({
        id: "rolling-p2",
        title: `${player2Label}: ${stat1} Rolling Average`,
        wide: true,
        content: (
          <FantasyGameLogTrendBrush
            rows={p2PlotRows}
            headerTitle="Rolling Average Plot"
            valueLabel={stat1}
            primarySeriesLabel={player2Label}
            primaryBarColor="rgba(180, 112, 255, 0.42)"
            valueAccessor={(row) => toFiniteNumber(row[stat1]) ?? 0}
          />
        ),
      });
    }
    if (hasTwoStats) {
      panels.push({
        id: "rolling-p1-stat2",
        title: `${effectiveP1Label}: ${stat2} Rolling Average`,
        wide: true,
        content: (
          <FantasyGameLogTrendBrush
            rows={p1PlotRows}
            headerTitle="Rolling Average Plot"
            valueLabel={stat2}
            primarySeriesLabel={effectiveP1Label}
            valueAccessor={(row) => toFiniteNumber(row[stat2]) ?? 0}
          />
        ),
      });
      if (hasTwoPlayers) {
        panels.push({
          id: "rolling-p2-stat2",
          title: `${player2Label}: ${stat2} Rolling Average`,
          wide: true,
          content: (
            <FantasyGameLogTrendBrush
              rows={p2PlotRows}
              headerTitle="Rolling Average Plot"
              valueLabel={stat2}
              primarySeriesLabel={player2Label}
              primaryBarColor="rgba(180, 112, 255, 0.42)"
              valueAccessor={(row) => toFiniteNumber(row[stat2]) ?? 0}
            />
          ),
        });
      }
    }

    panels.push({
      id: "opp-p1",
      title: `${effectiveP1Label}: ${stat1} Avg vs Opponent`,
      wide: true,
      content: <OpponentAverageHeatmap rows={p1PlotRows} stat={stat1} />,
    });
    if (hasTwoPlayers) {
      panels.push({
        id: "opp-p2",
        title: `${player2Label}: ${stat1} Avg vs Opponent`,
        wide: true,
        content: <OpponentAverageHeatmap rows={p2PlotRows} stat={stat1} />,
      });
    }
    if (hasTwoStats) {
      panels.push({
        id: "opp-p1-stat2",
        title: `${effectiveP1Label}: ${stat2} Avg vs Opponent`,
        wide: true,
        content: <OpponentAverageHeatmap rows={p1PlotRows} stat={stat2} />,
      });
      if (hasTwoPlayers) {
        panels.push({
          id: "opp-p2-stat2",
          title: `${player2Label}: ${stat2} Avg vs Opponent`,
          wide: true,
          content: <OpponentAverageHeatmap rows={p2PlotRows} stat={stat2} />,
        });
      }
    }

    const effectiveWwYear =
      selectedYears.includes(wwYear) ? wwYear : (selectedYears[0] || "");
    const wwLookup = dfYearFinals.filter((r) => r.Year === effectiveWwYear);
    const wwYearPicker = selectedYears.length > 1 ? (
      <div className="mb-3">
        <PillRadio options={selectedYears} value={effectiveWwYear} onChange={setWwYear} />
      </div>
    ) : null;

    const pushWithWithoutPanels = (
      prefix: string,
      playerLabel: string,
      teammateName: string,
      teammateLabel: string,
      teammatePosition: string,
      baseRows: PlayerStat[]
    ) => {
      const wwYearRows = baseRows.filter((r) => r.Year === effectiveWwYear);
      const withRowsYear = filterByTeammate(wwYearRows, teammateName, true, wwLookup, teammatePosition);
      const withoutRowsYear = filterByTeammate(wwYearRows, teammateName, false, wwLookup, teammatePosition);
      const withRowsAllYears = filterByTeammate(baseRows, teammateName, true, dfYearFinals, teammatePosition);
      const withoutRowsAllYears = filterByTeammate(baseRows, teammateName, false, dfYearFinals, teammatePosition);

      panels.push({
        id: `${prefix}ww_round_1`,
        title: `${playerLabel}: ${stat1} With/Without ${teammateLabel} by Round`,
        wide: true,
        content: (
          <div>
            {wwYearPicker}
            <WithWithoutLine
              title={`${playerLabel} \u2014 ${stat1}: With vs Without ${teammateLabel}`}
              stat={stat1}
              withData={computeRoundData(withRowsYear, stat1)}
              withoutData={computeRoundData(withoutRowsYear, stat1)}
            />
          </div>
        ),
      });
      if (stat2 !== "None") {
        panels.push({
          id: `${prefix}ww_round_2`,
          title: `${playerLabel}: ${stat2} With/Without ${teammateLabel} by Round`,
          wide: true,
          content: (
            <div>
              {wwYearPicker}
              <WithWithoutLine
                title={`${playerLabel} \u2014 ${stat2}: With vs Without ${teammateLabel}`}
                stat={stat2}
                withData={computeRoundData(withRowsYear, stat2)}
                withoutData={computeRoundData(withoutRowsYear, stat2)}
              />
            </div>
          ),
        });
      }

      panels.push({
        id: `${prefix}ww_dist_1`,
        title: `${playerLabel}: ${stat1} Distribution With/Without ${teammateLabel}`,
        content: (
          <WithWithoutKDE
            title={`${playerLabel} \u2014 ${stat1}: With vs Without ${teammateLabel} (All Selected Years)`}
            stat={stat1}
            withValues={withRowsAllYears
              .map((r) => toFiniteNumber(r[stat1]))
              .filter((v): v is number => v !== null)}
            withoutValues={withoutRowsAllYears
              .map((r) => toFiniteNumber(r[stat1]))
              .filter((v): v is number => v !== null)}
          />
        ),
      });
      if (stat2 !== "None") {
        panels.push({
          id: `${prefix}ww_dist_2`,
          title: `${playerLabel}: ${stat2} Distribution With/Without ${teammateLabel}`,
          content: (
            <WithWithoutKDE
              title={`${playerLabel} \u2014 ${stat2}: With vs Without ${teammateLabel} (All Selected Years)`}
              stat={stat2}
              withValues={withRowsAllYears
                .map((r) => toFiniteNumber(r[stat2]))
                .filter((v): v is number => v !== null)}
              withoutValues={withoutRowsAllYears
                .map((r) => toFiniteNumber(r[stat2]))
                .filter((v): v is number => v !== null)}
            />
          ),
        });
      }
    };

    if (effectiveP1Teammate !== "None") {
      pushWithWithoutPanels(
        "p1",
        effectiveP1Label,
        effectiveP1Teammate,
        teammate1Label,
        effectiveP1TeammatePosition,
        p1BaseRows
      );
    }

    if (hasTwoPlayers && teammate2 !== "None") {
      pushWithWithoutPanels("p2", player2Label, teammate2, teammate2Label, teammate2Position, p2BaseRows);
    }

    return panels;
  }, [
    effectiveP1, effectiveP1Label, player2, player2Label, stat1, stat2, p1Rows, p2Rows, p1PlotRows, p2PlotRows,
    hasTwoPlayers, effectiveP1Teammate, teammate1Label, teammate2, teammate2Label, effectiveP1TeammatePosition, teammate2Position, dfYearFinals, wwYear, selectedYears,
    p1BaseRows, p2BaseRows,
  ]);

  const filteredChartPanels = useMemo(
    () => chartPanels.filter((panel) => !/Rolling Average|Avg vs Opponent/i.test(panel.title)),
    [chartPanels]
  );

  const historyChartPanels = useMemo(
    () => chartPanels.filter((panel) => /Rolling Average|Avg vs Opponent/i.test(panel.title)),
    [chartPanels]
  );

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex justify-center py-6 md:py-8">
          <span
            aria-label="Loading"
            role="status"
            className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent"
          />
        </div>
      )}
      {!loading && allData.length === 0 && (
        <div className="rounded-lg border border-nrl-border bg-nrl-panel p-6 text-center text-nrl-muted">
          <div>No data available for the selected season.</div>
        </div>
      )}
      {allData.length > 0 && (
        <section className="rounded-xl border border-nrl-border bg-nrl-panel overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-nrl-border bg-nrl-accent/10 px-3 py-2">
            <div className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] items-end gap-2 md:w-auto md:grid-cols-[minmax(220px,320px)_150px_150px]">
              <FilterBar
                years={availableYears}
                selectedYears={statsTableYears}
                onYearsChange={handleStatsTableYearsChange}
                finalsMode="Yes"
                onFinalsModeChange={() => {}}
                minutesThreshold={0}
                onMinutesThresholdChange={() => {}}
                minutesMode="All"
                onMinutesModeChange={() => {}}
                showPosition={false}
                showMinutes={false}
                showPresets={false}
                showFinals={false}
                embedded
                showYear
              />
              <Select
                label="Position"
                value={statsTablePosition}
                options={statsTablePositionOptions}
                onChange={setStatsTablePosition}
              />
              <Select
                label="Team"
                value={statsTableTeam}
                options={statsTableTeamOptions}
                onChange={setStatsTableTeam}
              />
            </div>
            <div className="flex items-end">
              <PillRadio
                options={["Average", "Total"]}
                value={statsTableValueMode}
                onChange={(value) => setStatsTableValueMode(value as PlayerStatsTableValueMode)}
              />
            </div>
          </div>
          <div className="h-[396px] overflow-auto">
            <table className="min-w-[2600px] border-collapse text-left text-xs">
              <thead>
                <tr>
                  <th
                    aria-label="Player photo"
                    className="sticky left-0 top-0 z-[4] w-13 min-w-13 max-w-13 border-b border-r border-nrl-border bg-nrl-panel px-1 py-2"
                  />
                  {PLAYER_STATS_TABLE_BASE_COLUMNS.map((column) => {
                    const active = statsTableSort.column === column.key;
                    return (
                      <th
                        key={column.key}
                        className={`sticky top-0 z-[2] border-b border-r border-nrl-border bg-nrl-panel px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted last:border-r-0 ${column.key === "name" ? "w-44 min-w-44 max-w-44 lg:left-[3.25rem] lg:z-[3]" : ""} ${column.key === "position" ? "w-[88px] min-w-[88px] max-w-[88px]" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleStatsTableSort(column.key)}
                          className={`inline-flex w-full cursor-pointer items-center gap-1 whitespace-nowrap hover:text-nrl-accent ${column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start"}`}
                          title={`Sort by ${column.label}`}
                        >
                          <span>{column.label}</span>
                          {active ? <span>{statsTableSort.direction === "asc" ? "↑" : "↓"}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                  {PLAYER_STATS_TABLE_COLUMNS.map((stat) => {
                    const key = `stat:${stat}` as PlayerStatsTableSortKey;
                    const active = statsTableSort.column === key;
                    return (
                      <th
                        key={stat}
                        className="sticky top-0 z-[2] border-b border-r border-nrl-border bg-nrl-panel px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-nrl-muted last:border-r-0"
                      >
                        <button
                          type="button"
                          onClick={() => toggleStatsTableSort(key)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap hover:text-nrl-accent"
                          title={`Sort by ${stat}`}
                        >
                          <span>{stat}</span>
                          {active ? <span>{statsTableSort.direction === "asc" ? "↑" : "↓"}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedStatsTableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={PLAYER_STATS_TABLE_BASE_COLUMNS.length + PLAYER_STATS_TABLE_COLUMNS.length + 1}
                      className="px-3 py-6 text-center text-xs text-nrl-muted"
                    >
                      No players match the selected filters.
                    </td>
                  </tr>
                ) : (
                  sortedStatsTableRows.map((row) => {
                    return (
                      <tr key={row.name} className="h-12 border-b border-nrl-border/60 transition-colors hover:bg-nrl-panel-2/70">
                        <td className="sticky left-0 z-[1] w-13 min-w-13 max-w-13 border-r border-nrl-border bg-nrl-panel px-1 py-1">
                          <div className="mx-auto grid h-9 w-9 place-items-center">
                            <PlayerStatsTableThumbnail name={row.name} imageRow={row.imageRow} />
                          </div>
                        </td>
                      <td className="w-44 min-w-44 max-w-44 border-r border-nrl-border bg-nrl-panel px-2 py-1 text-xs font-semibold text-nrl-text lg:sticky lg:left-[3.25rem] lg:z-[1]">
                        <span className="block min-w-0 truncate" title={row.name}>{row.name}</span>
                      </td>
                      <td className="border-r border-nrl-border px-3 py-2 text-center text-xs whitespace-nowrap text-nrl-muted">
                        {row.team ?? "-"}
                      </td>
                      <td className="w-[88px] min-w-[88px] max-w-[88px] border-r border-nrl-border px-3 py-2 text-center text-xs whitespace-nowrap text-nrl-muted">
                        {row.position ?? "-"}
                      </td>
                      <td className="border-r border-nrl-border px-3 py-2 text-center text-xs whitespace-nowrap text-nrl-text">
                        {row.games}
                      </td>
                      {PLAYER_STATS_TABLE_COLUMNS.map((stat) => (
                        <td
                          key={`${row.name}-${stat}`}
                          className="border-r border-nrl-border px-3 py-2 text-center text-xs whitespace-nowrap text-nrl-muted last:border-r-0"
                        >
                          {formatTableNumber(
                            statsTableValueMode === "Total" ? row.totals[stat] ?? null : row.averages[stat] ?? null
                          )}
                        </td>
                      ))}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
        <div className="mb-4 text-xs font-bold uppercase tracking-wide text-nrl-accent">Player Comparison</div>
        <div className="grid grid-cols-2 gap-4">
          <SearchableSelect
            label="Player 1"
            value={player1 || p1PlayerOptions[0] || ""}
            options={player2 !== "None" ? ["None", ...p1PlayerOptions] : p1PlayerOptions}
            onChange={setPlayer1}
          />
          <SearchableSelect
            label="Player 2 (Optional)"
            value={player2}
            options={["None", ...p2PlayerOptions]}
            onChange={setPlayer2}
          />
          <SearchableSelect
            label="Stat 1"
            value={stat1}
            options={statList}
            onChange={setStat1}
          />
          <SearchableSelect
            label="Stat 2 (Optional)"
            value={stat2}
            options={["None", ...statList]}
            onChange={setStat2}
          />
        </div>
      </div>
      {allData.length > 0 && (
        <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
            Filters & Analysis
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
              Analysis Filters
            </div>
            <FilterBar
              years={availableYears}
              selectedYears={selectedYears}
              onYearsChange={handleYearsChange}
              finalsMode={finalsMode}
              onFinalsModeChange={setFinalsMode}
              minutesThreshold={0}
              onMinutesThresholdChange={() => {}}
              minutesMode="All"
              onMinutesModeChange={() => {}}
              showPosition={false}
              showMinutes={false}
              showPresets={false}
              embedded
              showYear
              showFinals
              mobileColumns={2}
            />

            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
              <Select
                label="Minutes Over"
                value={minutesOverFilter}
                options={[...MINUTES_FILTER_OPTIONS]}
                onChange={setMinutesOverFilter}
              />
              <Select
                label="Minutes Under"
                value={minutesUnderFilter}
                options={[...MINUTES_FILTER_OPTIONS]}
                onChange={setMinutesUnderFilter}
              />
              <>
                <Select
                  label="Player 1 Position"
                  value={player1Position}
                  options={["All", ...positions]}
                  onChange={setPlayer1Position}
                />
                <SearchableSelect
                  label="Player 1 Teammate"
                  value={teammate1}
                  options={["None", ...tm1Options]}
                  onChange={handleTeammate1Change}
                  disabled={player1 === "None"}
                />
                {teammate1 !== "None" ? (
                  <div className="pb-0.5">
                    <div className="flex flex-col gap-0.5">
                      <div aria-hidden="true" className="invisible text-[8px] font-semibold uppercase tracking-wide">
                        With / Without
                      </div>
                      <div className="min-h-[30px] flex items-center -mt-0.5 lg:-mt-1">
                        <PillRadio
                          options={["Both", "With", "Without"]}
                          value={teammateMode1[0].toUpperCase() + teammateMode1.slice(1)}
                          onChange={(value) => setTeammateMode1(value.toLowerCase() as typeof teammateMode1)}
                          disabled={player1 === "None"}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {teammate1 !== "None" ? (
                  <Select
                    label="Player 1 Tm Position"
                    value={teammate1Position}
                    options={["All", ...positions]}
                    onChange={setTeammate1Position}
                    disabled={player1 === "None"}
                  />
                ) : null}
              </>

              <>
                <Select
                  label="Player 2 Position"
                  value={player2Position}
                  options={["All", ...positions]}
                  onChange={setPlayer2Position}
                />
                <SearchableSelect
                  label="Player 2 Teammate"
                  value={teammate2}
                  options={["None", ...tm2Options]}
                  onChange={handleTeammate2Change}
                  disabled={player2 === "None"}
                />
                {teammate2 !== "None" ? (
                  <div className="pb-0.5">
                    <div className="flex flex-col gap-0.5">
                      <div aria-hidden="true" className="invisible text-[8px] font-semibold uppercase tracking-wide">
                        With / Without
                      </div>
                      <div className="min-h-[30px] flex items-center -mt-0.5 lg:-mt-1">
                        <PillRadio
                          options={["Both", "With", "Without"]}
                          value={teammateMode2[0].toUpperCase() + teammateMode2.slice(1)}
                          onChange={(value) => setTeammateMode2(value.toLowerCase() as typeof teammateMode2)}
                          disabled={player2 === "None"}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {teammate2 !== "None" ? (
                  <Select
                    label="Player 2 Tm Position"
                    value={teammate2Position}
                    options={["All", ...positions]}
                    onChange={setTeammate2Position}
                    disabled={player2 === "None"}
                  />
                ) : null}
              </>
            </div>
          </div>

          <div className="mt-6 border-t border-nrl-border pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
              Summary & Filtered Charts
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="flex h-full flex-col">
                {entities.map((e, i) => (
                  <div key={e.name}>
                    {i > 0 && <SectionDivider />}
                    <ProfileCard name={e.name} rows={e.rows} entity="player" />
                  </div>
                ))}
                <SectionDivider />
                <div
                  className={`mt-2 grid items-center justify-items-center gap-3 ${
                    hasTwoPlayers ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  <div
                    className={`flex h-full w-full items-center justify-center ${
                      hasTwoPlayers ? "" : "mx-auto max-w-[14rem] xl:max-w-[16rem]"
                    }`}
                  >
                    <SimplePlayerPhotoTile
                      playerName={effectiveP1}
                      imageRow={p1CardImage}
                      priority
                    />
                  </div>
                  {hasTwoPlayers ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <SimplePlayerPhotoTile
                        playerName={player2}
                        imageRow={p2CardImage}
                        priority
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <StatsTable rows={summaryRows} />
                <SectionDivider />
                <PercentileRanks
                  results={percentileResults}
                  single={!hasTwoPlayers}
                  mode="percentile"
                  percentileScope={percentileScope}
                  onPercentileScopeChange={setPercentileScope}
                />
                <SectionDivider />
                <RecentForm results={recentFormResults} single={!hasTwoPlayers} />
              </div>
            </div>
            <ChartPanelGrid panels={filteredChartPanels} unlockAll={hasClientProPlotAccess} />
          </div>
        </div>
      )}
      {allData.length > 0 && historyChartPanels.length > 0 && (
        <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
            Full History Plots
          </div>
          <div className="mt-4 text-xs text-nrl-muted">
            Rolling average and avg vs opponent use the selected year range.
          </div>
          <ChartPanelGrid panels={historyChartPanels} unlockAll={hasClientProPlotAccess} />
        </div>
      )}
    </div>
  );
}

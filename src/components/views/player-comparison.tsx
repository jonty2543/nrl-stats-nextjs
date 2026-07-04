"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
import type { PlayerStat } from "@/lib/data/types";
import type { PlayerImageRecord } from "@/lib/supabase/queries";
import type { PlayerStatsTableAggregateRow, StatsTableApiResponse } from "@/lib/data/stats-table-cache-types";
import { PLAYER_STATS } from "@/lib/data/constants";
import { playerSlug } from "@/lib/data/player-slug";
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
import { hasProPlotAccess } from "@/lib/access/pro-access";
import { isAccessibleSeason } from "@/lib/access/season-access";

interface PlayerComparisonProps {
  initialData: PlayerStat[];
  initialStatsTable?: StatsTableApiResponse<PlayerStatsTableAggregateRow>;
  initialStatsTableQueryKey?: string;
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
  availableYears: string[];
  defaultYears: string[];
  initialCanAccessLoginSeason?: boolean;
  canBypassPlotGate?: boolean;
}

type PlayerStatsTableSortDirection = "asc" | "desc";
type PlayerStatsTableValueMode = "Average" | "Total";
type PlayerStatsTableGroupBy = "Player" | "Year + Player" | "Team + Player" | "Position + Player";
type PlayerStatsTableStatKey = (typeof PLAYER_STATS)[number];
type PlayerStatsTableSortKey =
  | "year"
  | "name"
  | "team"
  | "position"
  | "games"
  | `stat:${PlayerStatsTableStatKey}`;

interface PlayerStatsTableRow {
  key: string;
  year: string | null;
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
const PLAYER_COMPARISON_STATE_STORAGE_KEY = "nrl-stats:player-comparison-state:v1";
const STATS_TABLE_MIN_GAMES_OPTIONS = ["1+", "5+", "10+", "20+", "50+", "100+"] as const;
const PLAYER_STATS_TABLE_GROUP_OPTIONS: PlayerStatsTableGroupBy[] = ["Player", "Year + Player", "Team + Player", "Position + Player"];

const PLAYER_STATS_TABLE_COLUMNS = PLAYER_STATS;
const NON_TOTAL_PLAYER_STATS = new Set<PlayerStatsTableStatKey>(
  PLAYER_STATS_TABLE_COLUMNS.filter((stat) =>
    /\b(rate|ratio|efficiency)\b/i.test(stat) || stat.startsWith("Average ")
  )
);
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
const PLAYER_STATS_TABLE_YEAR_COLUMN: {
  key: PlayerStatsTableSortKey;
  label: string;
  align?: "left" | "center" | "right";
} = { key: "year", label: "Year", align: "center" };

function playerStatsTableValue(row: PlayerStatsTableRow, stat: PlayerStatsTableStatKey, mode: PlayerStatsTableValueMode): number | null {
  if (mode === "Total" && !NON_TOTAL_PLAYER_STATS.has(stat)) {
    return row.totals[stat] ?? null;
  }
  return row.averages[stat] ?? null;
}

function statsTablePinnedGroupLabel(row: PlayerStatsTableRow, groupBy: PlayerStatsTableGroupBy): string | null {
  if (groupBy === "Year + Player") return row.year ?? "-";
  if (groupBy === "Team + Player") return row.team ?? "-";
  if (groupBy === "Position + Player") return row.position ?? "-";
  return null;
}

function minGamesValue(option: string): number {
  const parsed = Number.parseInt(option, 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

function statsTableQueryKey({
  years,
  groupBy,
  team,
  position,
  minGames,
}: {
  years: string[];
  groupBy: PlayerStatsTableGroupBy;
  team: string;
  position: string;
  minGames: string;
}): string {
  return new URLSearchParams({
    dataset: "player",
    years: years.join(","),
    groupBy,
    team,
    position,
    minGames: String(minGamesValue(minGames)),
  }).toString();
}

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
const FINALS_MODE_OPTIONS = ["Yes", "No"] as const;

interface PersistedPlayerComparisonState {
  version: 1;
  selectedYears: string[];
  statsTableYears: string[];
  statsTablePosition: string;
  statsTableTeam: string;
  statsTableMinGames: string;
  statsTableGroupBy: PlayerStatsTableGroupBy;
  statsTableSort: {
    column: PlayerStatsTableSortKey;
    direction: PlayerStatsTableSortDirection;
  };
  statsTableValueMode: PlayerStatsTableValueMode;
  finalsMode: string;
  minutesOverFilter: string;
  minutesUnderFilter: string;
  percentileScope: "Position" | "All Players";
  player1: string;
  player2: string;
  player1Position: string;
  player2Position: string;
  teammate1: string;
  teammate2: string;
  teammate1Position: string;
  teammate2Position: string;
  teammateMode1: "both" | "with" | "without";
  teammateMode2: "both" | "with" | "without";
  stat1: string;
  stat2: string;
  wwYear: string;
}

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

function formatTableNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readPersistedPlayerComparisonState(): Partial<PersistedPlayerComparisonState> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PLAYER_COMPARISON_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    return parsed as Partial<PersistedPlayerComparisonState>;
  } catch {
    return null;
  }
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

function playerImageInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function playerLastName(name: string): string {
  return parsePersonName(name).last || name;
}

function buildPlayerImageCandidates(imageRow: PlayerImageRecord | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const upgradeHttp = (value: string) => value.startsWith("http://") ? `https://${value.slice("http://".length)}` : value;
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const push = (value: string | null | undefined) => {
    if (!value || typeof value !== "string") return;
    const trimmed = upgradeHttp(decode(value.trim()));
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

    const marker = "/remote.axd?";
    const idx = value.indexOf(marker);
    if (idx >= 0) {
      const nested = value.slice(idx + marker.length).split("&preset=")[0];
      if (nested) {
        pushVariant(upgradeHttp(decode(nested)));
      }
    }
    pushVariant(value);
    return variants;
  };

  for (const source of [imageRow?.cached_body_image, imageRow?.cached_head_image, imageRow?.body_image, imageRow?.head_image]) {
    if (!source) continue;
    for (const variant of normalizeRemoteAxd(source)) {
      push(variant);
    }
  }

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
    if (!teamNorm) {
      const aImg = Boolean(a.cached_body_image || a.cached_head_image || a.body_image || a.head_image);
      const bImg = Boolean(b.cached_body_image || b.cached_head_image || b.body_image || b.head_image);
      if (aImg !== bImg) return aImg ? -1 : 1;

      const aDate = a.last_seen_match_date ?? "";
      const bDate = b.last_seen_match_date ?? "";
      if (aDate !== bDate) return bDate.localeCompare(aDate);
    }

    const aTeamMatch = teamNorm && a.team ? normalisePersonName(a.team) === teamNorm : false;
    const bTeamMatch = teamNorm && b.team ? normalisePersonName(b.team) === teamNorm : false;
    if (aTeamMatch !== bTeamMatch) return aTeamMatch ? -1 : 1;

    const aHasBody = Boolean(a.cached_body_image || a.body_image);
    const bHasBody = Boolean(b.cached_body_image || b.body_image);
    if (aHasBody !== bHasBody) return aHasBody ? -1 : 1;

    const aImg = Boolean(a.cached_body_image || a.cached_head_image || a.body_image || a.head_image);
    const bImg = Boolean(b.cached_body_image || b.cached_head_image || b.body_image || b.head_image);
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
            ) : null}
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
  showName = true,
}: {
  playerName: string;
  imageRow: PlayerImageRecord | null;
  priority?: boolean;
  className?: string;
  imageHeightClass?: string;
  showName?: boolean;
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
          <span className="relative z-10 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white/55 sm:h-20 sm:w-20 sm:text-xl">
            {playerImageInitials(playerName)}
          </span>
        )}
      </div>
      {showName ? (
        <div className="border-t border-[#1d3a63] px-2.5 py-2 text-center sm:px-4 sm:py-3">
          <div className="truncate text-[12px] font-semibold text-white sm:text-sm">{playerName || "No player selected"}</div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerStatsTableThumbnail({
  name,
  imageRow,
  priority = false,
}: {
  name: string;
  imageRow: PlayerImageRecord | null;
  priority?: boolean;
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
    <div className="flex flex-col items-center gap-0.5 sm:gap-1">
      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel-2 text-[10px] font-black text-nrl-text sm:h-10 sm:w-10">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover object-top"
            loading="eager"
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              setImageAttemptState((prev) => ({
                key: imageCandidatesKey,
                index: (prev.key === imageCandidatesKey ? prev.index : 0) + 1,
              }));
            }}
          />
        ) : (
          <span aria-label={`${name} player image`}>{playerImageInitials(name)}</span>
        )}
      </div>
      <div className="max-w-12 truncate text-[8px] font-black uppercase leading-none tracking-wide text-nrl-text sm:max-w-14">
        {playerLastName(name)}
      </div>
    </div>
  );
}

export function PlayerComparison({
  initialData,
  initialStatsTable,
  initialStatsTableQueryKey,
  playerImages,
  teamLogos,
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
  const loadedYears = useMemo(
    () => new Set(allData.map((row) => String(row.Year ?? ""))),
    [allData]
  );
  const [selectedYears, setSelectedYears] = useState<string[]>(initialYears);
  const [statsTableYears, setStatsTableYears] = useState<string[]>(initialYears);
  const hasLoadedSelectedYears = useMemo(
    () => selectedYears.every((year) => loadedYears.has(year)),
    [loadedYears, selectedYears]
  );
  const [statsTablePosition, setStatsTablePosition] = useState("All Positions");
  const [statsTableTeam, setStatsTableTeam] = useState("All Teams");
  const [statsTableMinGames, setStatsTableMinGames] = useState("1+");
  const [statsTableGroupBy, setStatsTableGroupBy] = useState<PlayerStatsTableGroupBy>("Player");
  const [statsTableSearch, setStatsTableSearch] = useState("");
  const [statsTableFiltersOpen, setStatsTableFiltersOpen] = useState(false);
  const [statsTableAggregateRows, setStatsTableAggregateRows] = useState<PlayerStatsTableRow[]>(
    () => (initialStatsTable?.rows ?? []).map((row) => ({ ...row, imageRow: null }))
  );
  const [statsTableFilterOptions, setStatsTableFilterOptions] = useState({
    positions: initialStatsTable?.filterOptions.positions ?? ["All Positions"],
    teams: initialStatsTable?.filterOptions.teams ?? ["All Teams"],
  });
  const [statsTableRowsLoading, setStatsTableRowsLoading] = useState(false);
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
  const [analysisFiltersOpen, setAnalysisFiltersOpen] = useState(false);
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

  const statsTablePositionOptions = statsTableFilterOptions.positions;
  const statsTableTeamOptions = statsTableFilterOptions.teams;

  const statsTableRows = useMemo<PlayerStatsTableRow[]>(() => {
    const search = statsTableSearch.toLowerCase().trim();
    return statsTableAggregateRows.filter((row) => {
      if (!search) return true;
      return row.name.toLowerCase().includes(search);
    });
  }, [statsTableAggregateRows, statsTableSearch]);

  const statsTableBaseColumns = PLAYER_STATS_TABLE_BASE_COLUMNS;
  const resolveStatsTablePlayerImage = useMemo(() => {
    const imageCache = new Map<string, PlayerImageRecord | null>();
    return (name: string): PlayerImageRecord | null => {
      const cacheKey = normalisePersonName(name);
      if (imageCache.has(cacheKey)) return imageCache.get(cacheKey) ?? null;
      const imageRow = resolvePlayerImage(name, null, playerImages);
      imageCache.set(cacheKey, imageRow);
      return imageRow;
    };
  }, [playerImages]);

  useEffect(() => {
    if (statsTableYears.length === 0) {
      setStatsTableAggregateRows([]);
      return;
    }

    const queryKey = statsTableQueryKey({
      years: statsTableYears,
      groupBy: statsTableGroupBy,
      team: statsTableTeam,
      position: statsTablePosition,
      minGames: statsTableMinGames,
    });

    if (initialStatsTable && queryKey === initialStatsTableQueryKey) {
      setStatsTableRowsLoading(false);
      setStatsTableFilterOptions(initialStatsTable.filterOptions);
      setStatsTableAggregateRows(
        initialStatsTable.rows.map((row) => ({
          ...row,
          imageRow: resolveStatsTablePlayerImage(row.name),
        }))
      );
      return;
    }

    const controller = new AbortController();
    setStatsTableRowsLoading(true);
    fetch(`/api/stats-table?${queryKey}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch stats table");
        return (await res.json()) as StatsTableApiResponse<Omit<PlayerStatsTableRow, "imageRow">>;
      })
      .then((data) => {
        setStatsTableFilterOptions(data.filterOptions);
        setStatsTableAggregateRows(
          data.rows.map((row) => ({
            ...row,
            imageRow: resolveStatsTablePlayerImage(row.name),
          }))
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load player stats table rows:", error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatsTableRowsLoading(false);
      });

    return () => controller.abort();
  }, [
    initialStatsTable,
    initialStatsTableQueryKey,
    resolveStatsTablePlayerImage,
    statsTableGroupBy,
    statsTableMinGames,
    statsTablePosition,
    statsTableTeam,
    statsTableYears,
  ]);

  const sortedStatsTableRows = useMemo(() => {
    const getSortValue = (row: PlayerStatsTableRow): number | string | null => {
      if (statsTableSort.column === "year") return row.year;
      if (statsTableSort.column === "name") return row.name.toLowerCase();
      if (statsTableSort.column === "team") return row.team?.toLowerCase() ?? null;
      if (statsTableSort.column === "position") return row.position?.toLowerCase() ?? null;
      if (statsTableSort.column === "games") return row.games;

      const statKey = statsTableSort.column.slice("stat:".length) as PlayerStatsTableStatKey;
      return playerStatsTableValue(row, statKey, statsTableValueMode);
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
        return a.name.localeCompare(b.name) || String(a.year ?? "").localeCompare(String(b.year ?? ""));
      }

      const valueComparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" }) * direction;
      return valueComparison || a.name.localeCompare(b.name) || String(a.team ?? "").localeCompare(String(b.team ?? ""));
    });
  }, [statsTableRows, statsTableSort, statsTableValueMode]);

  const statsTableColumnCount = statsTableBaseColumns.length + PLAYER_STATS_TABLE_COLUMNS.length + 1;

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
  const [hasRestoredStatsState, setHasRestoredStatsState] = useState(false);

  useEffect(() => {
    if (hasRestoredStatsState || unlockedYears.length === 0) return;

    const saved = readPersistedPlayerComparisonState();
    if (saved) {
      const validSelectedYears = filterUnlockedYears(readStringArray(saved.selectedYears));
      const validStatsTableYears = filterUnlockedYears(readStringArray(saved.statsTableYears));
      const sortColumn = saved.statsTableSort?.column;
      const sortDirection = saved.statsTableSort?.direction;
      const validSortColumns = new Set<string>([
        PLAYER_STATS_TABLE_YEAR_COLUMN.key,
        ...PLAYER_STATS_TABLE_BASE_COLUMNS.map((column) => column.key),
        ...PLAYER_STATS_TABLE_COLUMNS.map((stat) => `stat:${stat}`),
      ]);

      if (validSelectedYears.length > 0) {
        setSelectedYears(ensureAtLeastOneUnlockedYear(validSelectedYears));
      }
      if (validStatsTableYears.length > 0) {
        setStatsTableYears(ensureAtLeastOneUnlockedYear(validStatsTableYears));
      }
      if (typeof saved.statsTablePosition === "string") setStatsTablePosition(saved.statsTablePosition);
      if (typeof saved.statsTableTeam === "string") setStatsTableTeam(saved.statsTableTeam);
      if (STATS_TABLE_MIN_GAMES_OPTIONS.includes(saved.statsTableMinGames as (typeof STATS_TABLE_MIN_GAMES_OPTIONS)[number])) {
        setStatsTableMinGames(saved.statsTableMinGames as (typeof STATS_TABLE_MIN_GAMES_OPTIONS)[number]);
      }
      if (PLAYER_STATS_TABLE_GROUP_OPTIONS.includes(saved.statsTableGroupBy as PlayerStatsTableGroupBy)) {
        setStatsTableGroupBy(saved.statsTableGroupBy as PlayerStatsTableGroupBy);
      }
      if (
        typeof sortColumn === "string" &&
        validSortColumns.has(sortColumn) &&
        (sortDirection === "asc" || sortDirection === "desc")
      ) {
        setStatsTableSort({
          column: sortColumn as PlayerStatsTableSortKey,
          direction: sortDirection,
        });
      }
      if (saved.statsTableValueMode === "Average" || saved.statsTableValueMode === "Total") {
        setStatsTableValueMode(saved.statsTableValueMode);
      }
      if (FINALS_MODE_OPTIONS.includes(saved.finalsMode as (typeof FINALS_MODE_OPTIONS)[number])) {
        setFinalsMode(saved.finalsMode as (typeof FINALS_MODE_OPTIONS)[number]);
      }
      if (MINUTES_FILTER_OPTIONS.includes(saved.minutesOverFilter as (typeof MINUTES_FILTER_OPTIONS)[number])) {
        setMinutesOverFilter(saved.minutesOverFilter as (typeof MINUTES_FILTER_OPTIONS)[number]);
      }
      if (MINUTES_FILTER_OPTIONS.includes(saved.minutesUnderFilter as (typeof MINUTES_FILTER_OPTIONS)[number])) {
        setMinutesUnderFilter(saved.minutesUnderFilter as (typeof MINUTES_FILTER_OPTIONS)[number]);
      }
      if (saved.percentileScope === "Position" || saved.percentileScope === "All Players") {
        setPercentileScope(saved.percentileScope);
      }

      setPlayer1(readString(saved.player1, ""));
      setPlayer2(readString(saved.player2, ""));
      setPlayer1Position(readString(saved.player1Position, "All"));
      setPlayer2Position(readString(saved.player2Position, "All"));
      setTeammate1(readString(saved.teammate1, "None"));
      setTeammate2(readString(saved.teammate2, "None"));
      setTeammate1Position(readString(saved.teammate1Position, "All"));
      setTeammate2Position(readString(saved.teammate2Position, "All"));
      if (saved.teammateMode1 === "both" || saved.teammateMode1 === "with" || saved.teammateMode1 === "without") {
        setTeammateMode1(saved.teammateMode1);
      }
      if (saved.teammateMode2 === "both" || saved.teammateMode2 === "with" || saved.teammateMode2 === "without") {
        setTeammateMode2(saved.teammateMode2);
      }
      setStat1(readString(saved.stat1, "All Run Metres"));
      setStat2(readString(saved.stat2, "Kicking Metres"));
      setWwYear(readString(saved.wwYear, selectedYears[0] ?? ""));
    }

    setHasRestoredStatsState(true);
  }, [
    ensureAtLeastOneUnlockedYear,
    filterUnlockedYears,
    hasRestoredStatsState,
    selectedYears,
    unlockedYears,
  ]);

  useEffect(() => {
    if (!hasRestoredStatsState || statsTableRowsLoading) return;

    if (statsTablePosition !== "All Positions" && !statsTablePositionOptions.includes(statsTablePosition)) {
      setStatsTablePosition("All Positions");
    }
    if (statsTableTeam !== "All Teams" && !statsTableTeamOptions.includes(statsTableTeam)) {
      setStatsTableTeam("All Teams");
    }
  }, [
    hasRestoredStatsState,
    statsTableRowsLoading,
    statsTablePosition,
    statsTablePositionOptions,
    statsTableTeam,
    statsTableTeamOptions,
  ]);

  useEffect(() => {
    if (statsTableGroupBy === "Year + Player" || statsTableSort.column !== "year") return;
    setStatsTableSort({ column: "name", direction: "asc" });
  }, [statsTableGroupBy, statsTableSort.column]);

  useEffect(() => {
    if (!hasRestoredStatsState || !hasLoadedSelectedYears || statList.length === 0) return;

    if (!statList.includes(stat1)) {
      setStat1(statList[0] ?? "All Run Metres");
    }
    if (stat2 !== "None" && !statList.includes(stat2)) {
      setStat2("None");
    }
  }, [hasLoadedSelectedYears, hasRestoredStatsState, stat1, stat2, statList]);

  useEffect(() => {
    if (!hasRestoredStatsState || !hasLoadedSelectedYears) return;

    const validPositions = ["All", ...positions];
    if (!validPositions.includes(player1Position)) setPlayer1Position("All");
    if (!validPositions.includes(player2Position)) setPlayer2Position("All");
    if (!validPositions.includes(teammate1Position)) setTeammate1Position("All");
    if (!validPositions.includes(teammate2Position)) setTeammate2Position("All");
  }, [
    hasLoadedSelectedYears,
    hasRestoredStatsState,
    player1Position,
    player2Position,
    positions,
    teammate1Position,
    teammate2Position,
  ]);

  useEffect(() => {
    if (!hasRestoredStatsState) return;
    if (!selectedYears.includes(wwYear)) {
      setWwYear(selectedYears[0] ?? "");
    }
  }, [hasRestoredStatsState, selectedYears, wwYear]);

  useEffect(() => {
    if (!hasRestoredStatsState || typeof window === "undefined") return;

    const state: PersistedPlayerComparisonState = {
      version: 1,
      selectedYears,
      statsTableYears,
      statsTablePosition,
      statsTableTeam,
      statsTableMinGames,
      statsTableGroupBy,
      statsTableSort,
      statsTableValueMode,
      finalsMode,
      minutesOverFilter,
      minutesUnderFilter,
      percentileScope,
      player1,
      player2,
      player1Position,
      player2Position,
      teammate1,
      teammate2,
      teammate1Position,
      teammate2Position,
      teammateMode1,
      teammateMode2,
      stat1,
      stat2,
      wwYear,
    };

    try {
      window.sessionStorage.setItem(PLAYER_COMPARISON_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors such as private browsing quota failures.
    }
  }, [
    finalsMode,
    hasRestoredStatsState,
    minutesOverFilter,
    minutesUnderFilter,
    percentileScope,
    player1,
    player1Position,
    player2,
    player2Position,
    selectedYears,
    stat1,
    stat2,
    statsTableMinGames,
    statsTableGroupBy,
    statsTablePosition,
    statsTableSort,
    statsTableTeam,
    statsTableValueMode,
    statsTableYears,
    teammate1,
    teammate1Position,
    teammate2,
    teammate2Position,
    teammateMode1,
    teammateMode2,
    wwYear,
  ]);

  useEffect(() => {
    if (selectedYears.length > 0 || unlockedYears.length === 0) return;
    setSelectedYears(unlockedYears.slice(0, 1));
  }, [selectedYears.length, unlockedYears]);

  useEffect(() => {
    if (statsTableYears.length > 0 || unlockedYears.length === 0) return;
    setStatsTableYears(unlockedYears.slice(0, 1));
  }, [statsTableYears.length, unlockedYears]);

  useEffect(() => {
    const neededYears = [...new Set(selectedYears)];
    const missingSelectedYears = neededYears.filter((year) => !loadedYears.has(year));
    if (missingSelectedYears.length === 0) return;
    void loadYears(missingSelectedYears);
  }, [loadYears, loadedYears, selectedYears]);

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
    if (!hasRestoredStatsState || !hasLoadedSelectedYears) return;
    if (teammate1 !== "None" && !tm1Options.includes(teammate1)) {
      setTeammate1("None");
      setTeammate1Position("All");
      setTeammateMode1("both");
    }
    if (teammate2 !== "None" && !tm2Options.includes(teammate2)) {
      setTeammate2("None");
      setTeammate2Position("All");
      setTeammateMode2("both");
    }
  }, [hasLoadedSelectedYears, hasRestoredStatsState, teammate1, teammate2, tm1Options, tm2Options]);

  useEffect(() => {
    if (!hasRestoredStatsState || !hasLoadedData || !hasLoadedSelectedYears) return;
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
  }, [
    hasLoadedData,
    hasLoadedSelectedYears,
    hasRestoredStatsState,
    p1PlayerOptions,
    p2PlayerOptions,
    player1,
    player2,
  ]);

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
        <section className="overflow-hidden rounded-2xl border border-nrl-border/90 bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-nrl-border/70 bg-nrl-panel-2 px-5 py-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
              <PillRadio
                options={["Average", "Total"]}
                value={statsTableValueMode}
                onChange={(value) => setStatsTableValueMode(value as PlayerStatsTableValueMode)}
              />
              <div className="w-36 shrink-0">
                <Select
                  label="Group"
                  value={statsTableGroupBy}
                  options={[...PLAYER_STATS_TABLE_GROUP_OPTIONS]}
                  onChange={(value) => setStatsTableGroupBy(value as PlayerStatsTableGroupBy)}
                />
              </div>
              <input
                type="search"
                value={statsTableSearch}
                onChange={(event) => setStatsTableSearch(event.target.value)}
                placeholder="Search players"
                className="h-9 min-w-0 max-w-xs flex-1 rounded-md border border-nrl-border bg-nrl-panel px-3 text-sm font-semibold text-nrl-text outline-none placeholder:text-nrl-muted focus:border-nrl-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => setStatsTableFiltersOpen((open) => !open)}
              className={`relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                statsTableFiltersOpen ||
                statsTablePosition !== "All Positions" ||
                statsTableTeam !== "All Teams" ||
                statsTableMinGames !== "1+" ||
                statsTableGroupBy !== "Player" ||
                statsTableYears.length !== 1 ||
                statsTableYears[0] !== DEFAULT_STATS_TABLE_YEAR
                  ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
                  : "border-nrl-border bg-nrl-panel text-nrl-muted hover:border-nrl-accent hover:text-nrl-accent"
              }`}
              aria-expanded={statsTableFiltersOpen}
              aria-label="Filters"
            >
              <span className="flex flex-col gap-0.5" aria-hidden="true">
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
              </span>
            </button>
          </div>
          {statsTableFiltersOpen ? (
            <div className="grid gap-3 border-b border-nrl-border bg-nrl-accent/10 px-3 py-3 md:grid-cols-[minmax(220px,320px)_150px_150px_130px]">
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
              <Select
                label="Min Games"
                value={statsTableMinGames}
                options={[...STATS_TABLE_MIN_GAMES_OPTIONS]}
                onChange={setStatsTableMinGames}
              />
            </div>
          ) : null}
          <div className="relative h-[396px] overflow-auto pb-3">
            {!statsTableRowsLoading && sortedStatsTableRows.length === 0 ? (
              <div className="pointer-events-none absolute left-0 right-0 top-12 z-[7] flex h-24 items-center justify-center px-4 text-center text-sm font-black text-nrl-accent sm:top-14">
                No players match the selected filters.
              </div>
            ) : null}
            <table className="min-w-[2200px] border-collapse text-left text-xs sm:min-w-[2400px]">
              <thead>
                <tr>
                  <th
                    aria-label="Player photo"
                    className={`sticky left-0 top-0 z-[5] border-b border-r border-nrl-border/70 bg-nrl-panel px-1.5 py-1.5 sm:px-2 sm:py-2 ${
                      statsTableGroupBy === "Player"
                        ? "w-28 min-w-28 max-w-28"
                        : statsTableGroupBy === "Team + Player"
                          ? "w-36 min-w-36 max-w-36"
                          : "w-44 min-w-44 max-w-44"
                    }`}
                  />
                  {statsTableBaseColumns.map((column) => {
                    const active = statsTableSort.column === column.key;
                    return (
                      <th
                        key={column.key}
                        className={`sticky top-0 border-b border-nrl-border/70 bg-nrl-panel px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] last:border-r-0 sm:px-2.5 sm:text-[9px] sm:tracking-[0.16em] ${active ? "z-[6] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.26)] sm:right-0" : "z-[2] text-nrl-text"} ${column.key === "year" ? "w-20 min-w-20 max-w-20 sm:w-[5.5rem] sm:min-w-[5.5rem] sm:max-w-[5.5rem]" : ""} ${column.key === "name" ? "w-44 min-w-44 max-w-44 sm:w-[12.5rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem]" : ""} ${column.key === "position" ? "w-28 min-w-28 max-w-28 sm:w-[5.5rem] sm:min-w-[5.5rem] sm:max-w-[5.5rem]" : ""} ${column.key === "games" ? "w-16 min-w-16 max-w-16 sm:w-[5rem] sm:min-w-[5rem] sm:max-w-[5rem]" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
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
                        className={`sticky top-0 border-b border-nrl-border/70 bg-nrl-panel px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.14em] last:border-r-0 sm:px-2.5 sm:text-[9px] sm:tracking-[0.16em] ${active ? "z-[6] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.26)] sm:right-0" : "z-[2] text-nrl-text"}`}
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
                    <td colSpan={statsTableColumnCount} className="h-24 px-3 py-6" />
                  </tr>
                ) : (
                  <>
                    {sortedStatsTableRows.map((row, index) => {
                      const pinnedGroupLabel = statsTablePinnedGroupLabel(row, statsTableGroupBy);
                      const teamLogoUrl = resolveTeamLogoUrl(row.team, teamLogos);
                      const showTeamGroupLogoOnly = statsTableGroupBy === "Team + Player" && pinnedGroupLabel;
                      return (
                      <tr key={row.key} className="h-16 border-b border-nrl-border/70 transition-colors hover:bg-nrl-panel-2/60 sm:h-[4.5rem]">
                        <td
                          className={`sticky left-0 z-[3] border-r border-nrl-border/70 bg-nrl-panel px-1.5 py-1 sm:px-2 ${
                            pinnedGroupLabel
                              ? showTeamGroupLogoOnly
                                ? "w-36 min-w-36 max-w-36"
                                : "w-44 min-w-44 max-w-44"
                              : "w-28 min-w-28 max-w-28"
                          }`}
                        >
                          <div className="flex h-[3.75rem] items-center gap-1.5 sm:h-[4.25rem]">
                            <div className="w-5 text-center text-xs font-black text-nrl-text sm:w-6 sm:text-sm">
                              {index + 1}
                            </div>
                            <PlayerStatsTableThumbnail name={row.name} imageRow={row.imageRow} priority={index < 24} />
                            {showTeamGroupLogoOnly ? (
                              <div
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-nrl-border bg-nrl-panel-2 p-1"
                                title={pinnedGroupLabel}
                                aria-label={pinnedGroupLabel}
                              >
                                {teamLogoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={teamLogoUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" />
                                ) : null}
                              </div>
                            ) : pinnedGroupLabel ? (
                              <div className="min-w-0 rounded-md border border-nrl-border bg-nrl-panel-2 px-1.5 py-1 text-[10px] font-black uppercase tracking-wide text-nrl-text sm:text-xs">
                                <span className="block max-w-20 truncate">{pinnedGroupLabel}</span>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className={`w-44 min-w-44 max-w-44 px-2 py-1.5 text-sm font-black sm:w-[12.5rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem] sm:px-2.5 sm:text-sm ${statsTableSort.column === "name" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "bg-nrl-panel text-nrl-text"}`}>
                        <Link
                          href={`/dashboard/players/${playerSlug(row.name)}`}
                          className="block min-w-0 truncate transition-colors hover:text-nrl-accent"
                          title={row.name}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap sm:px-2.5 sm:text-[13px] ${statsTableSort.column === "team" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}>
                        <span className="inline-flex min-w-0 items-center justify-center gap-2">
                          {teamLogoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={teamLogoUrl}
                              alt=""
                              aria-hidden="true"
                              className="h-5 w-5 shrink-0 object-contain"
                            />
                          ) : null}
                          <span className="truncate">{row.team ?? "-"}</span>
                        </span>
                      </td>
                      <td className={`w-28 min-w-28 max-w-28 px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap sm:w-[5.5rem] sm:min-w-[5.5rem] sm:max-w-[5.5rem] sm:px-2.5 sm:text-[13px] ${statsTableSort.column === "position" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}>
                        {row.position ?? "-"}
                      </td>
                      <td className={`w-16 min-w-16 max-w-16 px-2 py-1.5 text-center text-xs font-black whitespace-nowrap sm:w-[5rem] sm:min-w-[5rem] sm:max-w-[5rem] sm:px-2.5 sm:text-[13px] ${statsTableSort.column === "games" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}>
                        {row.games}
                      </td>
                      {PLAYER_STATS_TABLE_COLUMNS.map((stat) => {
                        const active = statsTableSort.column === `stat:${stat}`;
                        return (
                          <td
                            key={`${row.key}-${stat}`}
                            className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap last:border-r-0 sm:px-2.5 sm:text-[13px] ${active ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}
                          >
                            {formatTableNumber(
                              playerStatsTableValue(row, stat, statsTableValueMode)
                            )}
                          </td>
                        );
                      })}
                      </tr>
                      );
                    })}
                  </>
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
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
              Filters & Analysis
            </div>
            <button
              type="button"
              onClick={() => setAnalysisFiltersOpen((open) => !open)}
              className={`relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                analysisFiltersOpen ||
                finalsMode !== "Yes" ||
                minutesOverFilter !== "Any" ||
                minutesUnderFilter !== "Any" ||
                player1Position !== "All" ||
                player2Position !== "All" ||
                teammate1 !== "None" ||
                teammate2 !== "None"
                  ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
                  : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-accent"
              }`}
              aria-expanded={analysisFiltersOpen}
              aria-label="Filters"
            >
              <span className="flex flex-col gap-0.5" aria-hidden="true">
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
              </span>
            </button>
          </div>

          {analysisFiltersOpen ? (
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
          ) : null}

          <div className={`${analysisFiltersOpen ? "mt-6 border-t border-nrl-border pt-4" : "mt-4"}`}>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
                  Comparison Snapshot
                </div>
                <div className="mt-1 text-sm font-semibold text-nrl-text">
                  {hasTwoPlayers ? `${effectiveP1Label} vs ${player2Label}` : effectiveP1Label}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="self-start rounded-lg border border-nrl-border bg-nrl-panel p-3">
                <div className={`grid gap-3 ${hasTwoPlayers ? "md:grid-cols-2 xl:grid-cols-1" : ""}`}>
                  {entities.map((e, i) => {
                    const imageRow = i === 0 ? p1CardImage : p2CardImage;
                    const playerName = i === 0 ? effectiveP1 : player2;

                    return (
                      <div
                        key={e.name}
                        className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-nrl-border/70 bg-nrl-panel-2/45 p-2.5"
                      >
                        <SimplePlayerPhotoTile
                          playerName={playerName}
                          imageRow={imageRow}
                          priority
                          showName={false}
                          className="max-w-[5.25rem] rounded-lg shadow-none"
                          imageHeightClass="h-[5.75rem]"
                        />
                        <ProfileCard name={e.name} rows={e.rows} entity="player" />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <StatsTable rows={summaryRows} />
                <PercentileRanks
                  results={percentileResults}
                  single={!hasTwoPlayers}
                  mode="percentile"
                  percentileScope={percentileScope}
                  onPercentileScopeChange={setPercentileScope}
                />
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

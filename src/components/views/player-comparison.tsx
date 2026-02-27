"use client";

import { useAuth } from "@clerk/nextjs";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
import { PlayerSelectors } from "@/components/filters/player-selectors";
import { ProfileCard } from "@/components/summary/profile-card";
import { StatsTable } from "@/components/summary/stats-table";
import { PercentileRanks } from "@/components/summary/percentile-ranks";
import { RecentForm } from "@/components/summary/recent-form";
import { ChartPanelGrid } from "@/components/charts/chart-panel-grid";
import { ScatterCorrelation } from "@/components/charts/scatter-correlation";
import { LineRound } from "@/components/charts/line-round";
import { KDEDistribution } from "@/components/charts/kde-distribution";
import { WithWithoutLine } from "@/components/charts/with-without-line";
import { WithWithoutKDE } from "@/components/charts/with-without-kde";
import { PillRadio } from "@/components/ui/pill-radio";
import { Select } from "@/components/ui/select";
import { SectionDivider } from "@/components/ui/section-divider";
import { isAccessibleSeason } from "@/lib/access/season-access";

interface PlayerComparisonProps {
  initialData: PlayerStat[];
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
  availableYears: string[];
  defaultYears: string[];
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
  const imageCandidates = useMemo(() => {
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

    return out;
  }, [imageRow?.body_image, imageRow?.head_image]);
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
      ? "text-[10.2px]"
      : "text-[10px]"
    : isFramelessScale
      ? "text-[clamp(7.8px,0.6vw,9.8px)]"
      : "text-[clamp(11px,1.4vw,15px)]";
  const teamTextClass = compact
    ? isFramelessCompact
      ? "text-[6.2px] tracking-[0.12em]"
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
      ? "px-2.5 py-1.5"
      : "px-2 pt-1.5 pb-1"
    : isFramelessScale
      ? "px-3 py-2"
      : "px-3 pt-2 pb-1.5";
  const teamRowMarginClass = frameless ? "mt-0" : "mt-0.5";
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
    ? "absolute inset-x-[21%] top-[60.2%] bottom-[22.8%] z-40 rounded-lg border border-[#1adb70]/15 bg-[#021021]/62"
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
            <div className={showStats ? undefined : "flex h-full flex-col items-center justify-center"}>
              <div className={`truncate text-center font-extrabold tracking-wide text-white ${nameTextClass}`}>
                {(playerName || "No player selected").toUpperCase()}
              </div>
              <div className={`${teamRowMarginClass} truncate text-center font-semibold text-[#a9f5cf]/90 ${teamTextClass}`}>
                {(imageRow?.team ?? "").toUpperCase()}
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

export function PlayerComparison({
  initialData,
  playerImages,
  teamLogos,
  availableYears,
  defaultYears,
}: PlayerComparisonProps) {
  type TeammateMode = "both" | "with" | "without";
  type PercentileScope = "Position" | "All Players";
  const { userId } = useAuth();
  const canAccessLoginSeason = Boolean(userId);

  const [allData, setAllData] = useState<PlayerStat[]>(initialData);
  const unlockedYears = useMemo(
    () =>
      availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason, "stats")),
    [availableYears, canAccessLoginSeason]
  );
  const initialYears = useMemo(() => {
    const validDefaultYears = defaultYears.filter((year) => unlockedYears.includes(year));
    if (validDefaultYears.length > 0) return validDefaultYears;
    return unlockedYears.slice(0, 1);
  }, [defaultYears, unlockedYears]);
  const [selectedYears, setSelectedYears] = useState<string[]>(initialYears);
  const [loading, setLoading] = useState(
    initialData.length === 0 && initialYears.length > 0
  );
  const hasBootstrappedFetch = useRef(false);
  const filterUnlockedYears = useCallback(
    (years: string[]) => years.filter((year) => unlockedYears.includes(year)),
    [unlockedYears]
  );
  const ensureAtLeastOneUnlockedYear = useCallback(
    (years: string[]) => (years.length > 0 ? years : unlockedYears.slice(0, 1)),
    [unlockedYears]
  );

  // Re-fetch when years change
  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    setSelectedYears(validYears);
    if (validYears.length === 0) {
      setAllData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/player-stats?years=${validYears.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setAllData(data);
      }
    } finally {
      setLoading(false);
    }
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
  const df = useMemo(() => filteredByMinutes, [filteredByMinutes]);
  const dfAllPositions = useMemo(() => filteredByMinutes, [filteredByMinutes]);

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

  // Player selections
  const [player1, setPlayer1] = useState("Reece Walsh");
  const [player2, setPlayer2] = useState("Kalyn Ponga");
  const [player1Position, setPlayer1Position] = useState("All");
  const [player2Position, setPlayer2Position] = useState("All");
  const [teammate1, setTeammate1] = useState("None");
  const [teammate2, setTeammate2] = useState("None");
  const [teammate1Position, setTeammate1Position] = useState("All");
  const [teammate2Position, setTeammate2Position] = useState("All");
  const [teammateMode1, setTeammateMode1] = useState<TeammateMode>("both");
  const [teammateMode2, setTeammateMode2] = useState<TeammateMode>("both");
  const [stat1, setStat1] = useState("Fantasy");
  const [stat2, setStat2] = useState("All Runs");
  const [wwYear, setWwYear] = useState(selectedYears[0] ?? "");
  const [roundYear, setRoundYear] = useState(selectedYears[0] ?? "");

  const presetPayload = useMemo<Record<string, unknown>>(
    () => ({
      selectedYears,
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
      roundYear,
    }),
    [
      selectedYears,
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
      roundYear,
    ]
  );

  const applyPreset = useCallback(
    async (payload: Record<string, unknown>) => {
      const validYears = Array.isArray(payload.selectedYears)
        ? payload.selectedYears
            .filter((value): value is string => typeof value === "string")
            .filter((year) => unlockedYears.includes(year))
        : [];

      if (validYears.length > 0) {
        await handleYearsChange(validYears);
      }

      const fallbackYear = validYears[0] ?? selectedYears[0] ?? "";

      if (payload.finalsMode === "Yes" || payload.finalsMode === "No") {
        setFinalsMode(payload.finalsMode);
      }
      if (typeof payload.minutesOverFilter === "string") {
        setMinutesOverFilter(payload.minutesOverFilter);
      }
      if (typeof payload.minutesUnderFilter === "string") {
        setMinutesUnderFilter(payload.minutesUnderFilter);
      }
      // Backward compatibility for older presets using single minutes mode/threshold.
      if (
        typeof payload.minMinutes === "number" &&
        Number.isFinite(payload.minMinutes) &&
        (payload.minutesMode === "All" || payload.minutesMode === "Over" || payload.minutesMode === "Under")
      ) {
        const legacyMinutes = Math.max(0, Math.round(payload.minMinutes));
        const legacyValue =
          legacyMinutes <= 0
            ? "Any"
            : [...MINUTES_FILTER_OPTIONS]
                .filter((opt) => opt !== "Any")
                .reduce((best, opt) => {
                  const current = parseMinutesFilterOption(opt);
                  const bestValue = parseMinutesFilterOption(best);
                  return Math.abs(current - legacyMinutes) < Math.abs(bestValue - legacyMinutes) ? opt : best;
                }, "10 Mins");
        if (payload.minutesMode === "All") {
          setMinutesOverFilter("Any");
          setMinutesUnderFilter("Any");
        } else if (payload.minutesMode === "Over") {
          setMinutesOverFilter(legacyValue);
        } else if (payload.minutesMode === "Under") {
          setMinutesUnderFilter(legacyValue);
        }
      }
      if (
        payload.percentileScope === "Position" ||
        payload.percentileScope === "All Players"
      ) {
        setPercentileScope(payload.percentileScope);
      }

      if (typeof payload.player1 === "string") setPlayer1(payload.player1);
      if (typeof payload.player2 === "string") setPlayer2(payload.player2);
      if (typeof payload.player1Position === "string") {
        setPlayer1Position(payload.player1Position);
      }
      if (typeof payload.player2Position === "string") {
        setPlayer2Position(payload.player2Position);
      }
      if (typeof payload.teammate1 === "string") setTeammate1(payload.teammate1);
      if (typeof payload.teammate2 === "string") setTeammate2(payload.teammate2);
      if (typeof payload.teammate1Position === "string") {
        setTeammate1Position(payload.teammate1Position);
      }
      if (typeof payload.teammate2Position === "string") {
        setTeammate2Position(payload.teammate2Position);
      }
      if (
        payload.teammateMode1 === "both" ||
        payload.teammateMode1 === "with" ||
        payload.teammateMode1 === "without"
      ) {
        setTeammateMode1(payload.teammateMode1);
      }
      if (
        payload.teammateMode2 === "both" ||
        payload.teammateMode2 === "with" ||
        payload.teammateMode2 === "without"
      ) {
        setTeammateMode2(payload.teammateMode2);
      }
      if (typeof payload.stat1 === "string") setStat1(payload.stat1);
      if (typeof payload.stat2 === "string") setStat2(payload.stat2);
      if (typeof payload.wwYear === "string") {
        setWwYear(payload.wwYear);
      } else if (fallbackYear) {
        setWwYear(fallbackYear);
      }
      if (typeof payload.roundYear === "string") {
        setRoundYear(payload.roundYear);
      } else if (fallbackYear) {
        setRoundYear(fallbackYear);
      }
    },
    [handleYearsChange, selectedYears, unlockedYears]
  );

  useEffect(() => {
    if (selectedYears.length > 0 || unlockedYears.length === 0) return;
    setSelectedYears(unlockedYears.slice(0, 1));
  }, [selectedYears.length, unlockedYears]);

  useEffect(() => {
    if (hasBootstrappedFetch.current) return;
    if (initialData.length > 0 || allData.length > 0) {
      hasBootstrappedFetch.current = true;
      return;
    }
    if (selectedYears.length === 0) return;
    hasBootstrappedFetch.current = true;
    void handleYearsChange(selectedYears);
  }, [allData.length, handleYearsChange, initialData.length, selectedYears]);

  useEffect(() => {
    const validYears = selectedYears.filter((year) => unlockedYears.includes(year));
    const hasChanged =
      validYears.length !== selectedYears.length ||
      validYears.some((year, index) => year !== selectedYears[index]);
    if (!hasChanged) return;
    void handleYearsChange(validYears);
  }, [handleYearsChange, selectedYears, unlockedYears]);

  useEffect(() => {
    if (selectedYears.length === 0) return;
    if (!selectedYears.includes(roundYear)) {
      setRoundYear(selectedYears[0]);
    }
    if (!selectedYears.includes(wwYear)) {
      setWwYear(selectedYears[0]);
    }
  }, [roundYear, selectedYears, wwYear]);

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
    if (!player1 && p1PlayerOptions.length > 0) {
      setPlayer1(p1PlayerOptions[0]);
    }
  }, [hasLoadedData, player1, p1PlayerOptions]);

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
    [effectiveP1, p1CardTeam, p1AllRows, playerImages]
  );
  const p1CardPosition = useMemo(
    () => primaryValueForLatestSelectedYear(p1AllRows, selectedYears, "Position"),
    [p1AllRows, selectedYears]
  );
  const p2CardImage = useMemo(
    () => (hasTwoPlayers ? resolvePlayerImage(player2, p2CardTeam, playerImages) : null),
    [hasTwoPlayers, player2, p2CardTeam, p2AllRows, playerImages]
  );
  const p2CardPosition = useMemo(
    () => (hasTwoPlayers ? primaryValueForLatestSelectedYear(p2AllRows, selectedYears, "Position") : null),
    [hasTwoPlayers, p2AllRows, selectedYears]
  );
  const p1CardLogoUrl = useMemo(
    () => resolveTeamLogoUrl(p1CardImage?.team ?? p1CardTeam, teamLogos),
    [p1CardImage?.team, p1CardTeam, teamLogos]
  );
  const p2CardLogoUrl = useMemo(
    () =>
      hasTwoPlayers
        ? resolveTeamLogoUrl(p2CardImage?.team ?? p2CardTeam, teamLogos)
        : null,
    [hasTwoPlayers, p2CardImage?.team, p2CardTeam, teamLogos]
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

  // Chart data — filtered to a single year for round charts
  const effectiveRoundYear = roundYear || selectedYears[0] || "";
  const p1RoundRows = useMemo(
    () => p1Rows.filter((r) => r.Year === effectiveRoundYear),
    [p1Rows, effectiveRoundYear]
  );
  const p2RoundRows = useMemo(
    () => p2Rows.filter((r) => r.Year === effectiveRoundYear),
    [p2Rows, effectiveRoundYear]
  );
  const p1RoundData = useMemo(
    () => computeRoundData(p1RoundRows, stat1),
    [p1RoundRows, stat1]
  );
  const p2RoundData = useMemo(
    () => (hasTwoPlayers ? computeRoundData(p2RoundRows, stat1) : []),
    [p2RoundRows, hasTwoPlayers, stat1]
  );
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

    // Round (full-width when 2 stats, since it shows side-by-side)
    const roundYearPicker = selectedYears.length > 1 ? (
      <div className="mb-3">
        <PillRadio options={selectedYears} value={effectiveRoundYear} onChange={setRoundYear} />
      </div>
    ) : null;

    panels.push({
      id: "round-1",
      title: `${stat1}: Stat Comparison by Round`,
      wide: true,
      content: (
        <div>
          {roundYearPicker}
          <LineRound
            title={
              hasTwoPlayers
                ? `${stat1}: ${effectiveP1Label} vs ${player2Label}`
                : `${effectiveP1Label} \u2014 ${stat1} by Round`
            }
            stat={stat1}
            series={
              hasTwoPlayers
                ? [
                    { label: effectiveP1Label, data: p1RoundData },
                    { label: player2Label, data: p2RoundData },
                  ]
                : [{ label: effectiveP1Label, data: p1RoundData }]
            }
            mode={hasTwoPlayers ? "compare" : "single"}
          />
        </div>
      ),
    });
    if (hasTwoStats) {
      const p1Stat2Data = computeRoundData(p1RoundRows, stat2);
      const p2Stat2Data = hasTwoPlayers ? computeRoundData(p2RoundRows, stat2) : [];
      panels.push({
        id: "round-2",
        title: `${stat2}: Stat Comparison by Round`,
        wide: true,
        content: (
          <div>
            {roundYearPicker}
            <LineRound
              title={
                hasTwoPlayers
                  ? `${stat2}: ${effectiveP1Label} vs ${player2Label}`
                  : `${effectiveP1Label} \u2014 ${stat2} by Round`
              }
              stat={stat2}
              series={
                hasTwoPlayers
                  ? [
                      { label: effectiveP1Label, data: p1Stat2Data },
                      { label: player2Label, data: p2Stat2Data },
                    ]
                  : [{ label: effectiveP1Label, data: p1Stat2Data }]
              }
              mode={hasTwoPlayers ? "compare" : "single"}
            />
          </div>
        ),
      });
    }

    const effectiveWwYear = wwYear || selectedYears[0] || "";
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
    effectiveP1, effectiveP1Label, player2, player2Label, stat1, stat2, p1Rows, p2Rows,
    p1RoundData, p2RoundData,
    p1RoundRows, p2RoundRows, effectiveRoundYear, setRoundYear,
    hasTwoPlayers, effectiveP1Teammate, teammate1Label, teammate2, teammate2Label, effectiveP1TeammatePosition, teammate2Position, dfYearFinals, wwYear, selectedYears,
    p1BaseRows, p2BaseRows,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
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

        <div className="mt-4 grid grid-cols-2 gap-4">
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
        </div>

        <div className="mt-6">
          <PlayerSelectors
            positions={positions}
            playerList={p1PlayerOptions}
            player1={player1 || p1PlayerOptions[0] || ""}
            onPlayer1Change={setPlayer1}
            player1Position={player1Position}
            onPlayer1PositionChange={setPlayer1Position}
            teammate1Options={tm1Options}
            teammate1={teammate1}
            onTeammate1Change={handleTeammate1Change}
            teammate1Position={teammate1Position}
            onTeammate1PositionChange={setTeammate1Position}
            teammateMode1={teammateMode1}
            onTeammateMode1Change={setTeammateMode1}
            player2Options={p2PlayerOptions}
            player2={player2}
            onPlayer2Change={setPlayer2}
            player2Position={player2Position}
            onPlayer2PositionChange={setPlayer2Position}
            teammate2Options={tm2Options}
            teammate2={teammate2}
            onTeammate2Change={handleTeammate2Change}
            teammate2Position={teammate2Position}
            onTeammate2PositionChange={setTeammate2Position}
            teammateMode2={teammateMode2}
            onTeammateMode2Change={setTeammateMode2}
            statList={statList}
            stat1={stat1}
            onStat1Change={setStat1}
            stat2={stat2}
            onStat2Change={setStat2}
          />
        </div>

        <div className="mt-6 border-t border-nrl-border pt-3">
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
            presetsScope="player"
            presetPayload={presetPayload}
            onApplyPreset={applyPreset}
            showYear={false}
            showPosition={false}
            showFinals={false}
            showMinutes={false}
            embedded
          />
        </div>
      </div>
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
        <>
          <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
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
                    <PlayerImageCard
                      playerName={effectiveP1}
                      imageRow={p1CardImage}
                      teamLogoUrl={p1CardLogoUrl}
                      fantasyPosition={p1CardPosition}
                      frameless
                      priority
                    />
                  </div>
                  {hasTwoPlayers ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <PlayerImageCard
                        playerName={player2}
                        imageRow={p2CardImage}
                        teamLogoUrl={p2CardLogoUrl}
                        fantasyPosition={p2CardPosition}
                        frameless
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
          </div>

          <ChartPanelGrid panels={chartPanels} />
        </>
      )}
    </div>
  );
}

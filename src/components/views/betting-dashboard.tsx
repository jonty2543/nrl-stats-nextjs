"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { BillingPageLink } from "@/components/billing/billing-page-link";
import { hasPremiumAccess } from "@/lib/access/pro-access";
import type { PlayerImageRecord } from "@/lib/supabase/queries";
import {
  BETTING_BOOKIE_COLUMNS,
  type BettingMarket,
  type BettingBookie,
  type BettingOddsRow,
  type BettingOddsSnapshot,
} from "@/lib/betting/types";

interface BettingDashboardProps {
  snapshot: BettingOddsSnapshot;
  canAccessPremium?: boolean;
  playerImages?: PlayerImageRecord[];
  teamLogos?: Record<string, string>;
  tryscorerFormByPlayer?: Record<string, TryscorerFormSummary>;
  tryscorerKickoffsByMatch?: Record<string, string>;
  marginModelArticle?: BettingArticleLink | null;
}

interface BettingArticleLink {
  title: string;
  slug: string;
  imageUrls: string[];
}

interface BettingPreferences {
  stakingMode: StakingMode;
  bankroll: number;
  percentageStakePct: number;
  targetProfitPct: number;
  kellyScale: number;
  maxEdge: number;
}

interface BookieOffer {
  bookie: BettingBookie;
  price: number;
  value: number | null;
  model: number | null;
}

interface OutcomeRow {
  market: BettingOddsRow["market"];
  result: string;
  bookieOffers: Record<BettingBookie, BookieOffer | null>;
  bestOfferComputed: BookieOffer | null;
  bestPriceComputed: number | null;
  bestValueComputed: number | null;
  bestModelComputed: number | null;
  bestBookiesComputed: BettingBookie[];
}

interface TryscorerFormSummary {
  player: string;
  team: string | null;
  lastFive: number[];
  average: number;
}

interface EventGroup {
  key: string;
  date: string;
  match: string;
  market: BettingOddsRow["market"];
  outcomes: OutcomeRow[];
  marketPctFromBest: number | null;
}

interface BestBetCandidate {
  id: string;
  date: string;
  match: string;
  market: BettingMarket;
  selection: string;
  selectionLabel: string;
  lineValue: number | null;
  bestBookie: BettingBookie;
  bestBookies: BettingBookie[];
  bestBookieCount: number;
  odds: number;
  modelProbability: number;
  impliedProbability: number;
  edgePp: number;
  kellyStake: number;
  score: number;
  marketDisagreementPct: number | null;
  marketEfficiencyPct: number | null;
  tags: string[];
}

interface ArbitrageStake {
  selection: string;
  selectionLabel: string;
  bookies: BettingBookie[];
  odds: number;
  stake: number;
}

interface ArbitrageCandidate {
  id: string;
  date: string;
  match: string;
  market: BettingMarket;
  marketBookPct: number;
  returnPct: number;
  totalStake: number;
  targetPayout: number;
  profit: number;
  score: number;
  stakes: ArbitrageStake[];
}

type StakingMode = "percentage" | "targetProfit" | "kelly";
type TrackedBetStatus = "pending" | "won" | "lost" | "push";

interface TrackedBet {
  id: string;
  market: BettingMarket;
  matchDate: string;
  matchName: string;
  selection: string;
  lineValue: number | null;
  odds: number;
  stake: number;
  modelProb: number | null;
  impliedProb: number | null;
  edgePp: number | null;
  status: TrackedBetStatus;
  profit: number | null;
  placedAt: string;
  settledAt: string | null;
}

interface BetDraft {
  market: BettingMarket;
  matchDate: string;
  matchName: string;
  selection: string;
  lineValue: number | null;
  odds: number;
  stake: number;
  status?: TrackedBetStatus;
  modelProb: number | null;
  impliedProb: number | null;
  edgePp: number | null;
}

interface MobileBetSlip {
  key: string;
  date: string;
  match: string;
  market: BettingMarket;
  selection: string;
  lineValue: number | null;
  odds: number;
  stake: number;
  modelProb: number | null;
}

const MARKET_TABS: BettingMarket[] = ["H2H", "Line", "Total", "Tryscorer"];
const DEFAULT_BETTING_MARKET: BettingMarket = "H2H";
const BETTING_PREFERENCES_LOCAL_KEY = "betting-preferences-local-v1";
const BET_TRACKER_LOCAL_KEY = "bet-tracker-local-v1";
const IMPLIED_LINE_SIGMA = 16.85;
const IMPLIED_TOTAL_SIGMA = 16.85;
const BEST_BETS_CONFIG = {
  maxCards: 6,
  maxArbitrageCards: 5,
  minEdgePp: 0.75,
  minBookies: 2,
  minArbitragePct: 0.05,
  weights: {
    edge: 0.56,
    liquidity: 0.2,
    efficiency: 0.14,
    disagreement: 0.1,
  },
};
const STAKING_OPTIONS: Array<{
  mode: StakingMode;
  label: string;
  description: string;
}> = [
  {
    mode: "percentage",
    label: "Percentage Staking",
    description: "Bet a % of your bankroll.",
  },
  {
    mode: "targetProfit",
    label: "Target Profit Staking",
    description: "Bet a certain amount to achieve a target percentage of your bankroll as profit.",
  },
  {
    mode: "kelly",
    label: "Kelly Staking",
    description: "Bet a percentage of your bankroll based on model edge over bookmaker.",
  },
];
const BOOKIE_LOGO_PATHS: Record<BettingBookie, string> = {
  Sportsbet: "/logos/sportsbet.png",
  Pointsbet: "/logos/pointsbet.png",
  Unibet: "/logos/unibet.png",
  Palmerbet: "/logos/palmerbet.png",
  Betright: "/logos/betright.png",
};

function normaliseLookupKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function areLookupTokensClose(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let edits = 0;
  let left = 0;
  let right = 0;

  while (left < a.length && right < b.length) {
    if (a[left] === b[right]) {
      left += 1;
      right += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    if (a.length === b.length) {
      left += 1;
      right += 1;
    } else if (a.length < b.length) {
      right += 1;
    } else {
      left += 1;
    }
  }

  return edits + Number(left < a.length || right < b.length) <= 1;
}

function normaliseTeamMatchKey(value: string): string {
  const key = normaliseLookupKey(value);
  const aliases: Record<string, string> = {
    broncos: "brisbane broncos",
    bulldogs: "canterbury bankstown bulldogs",
    "canterbury bulldogs": "canterbury bankstown bulldogs",
    raiders: "canberra raiders",
    sharks: "cronulla sutherland sharks",
    titans: "gold coast titans",
    "sea eagles": "manly warringah sea eagles",
    storm: "melbourne storm",
    knights: "newcastle knights",
    cowboys: "north queensland cowboys",
    "nth queensland cowboys": "north queensland cowboys",
    "north qld cowboys": "north queensland cowboys",
    eels: "parramatta eels",
    panthers: "penrith panthers",
    rabbitohs: "south sydney rabbitohs",
    dragons: "st george illawarra dragons",
    roosters: "sydney roosters",
    warriors: "new zealand warriors",
    tigers: "wests tigers",
    dolphins: "dolphins",
  };
  return aliases[key] ?? key;
}

function buildMatchKickoffKey(date: string, match: string): string | null {
  const { home, away } = parseMatch(match);
  if (!home || !away) return null;
  const teamsKey = [normaliseTeamMatchKey(home), normaliseTeamMatchKey(away)].sort().join("|");
  return `${date}|${teamsKey}`;
}

function kickoffSortMs(group: Pick<EventGroup, "date" | "match">, kickoffsByMatch: Record<string, string>): number {
  const kickoffKey = buildMatchKickoffKey(group.date, group.match);
  const kickoff = kickoffKey ? kickoffsByMatch[kickoffKey] : null;
  const parsedKickoff = kickoff ? Date.parse(kickoff) : NaN;
  if (Number.isFinite(parsedKickoff)) return parsedKickoff;

  const parsedDate = Date.parse(group.date);
  return Number.isFinite(parsedDate) ? parsedDate + 24 * 60 * 60 * 1000 - 1 : Number.POSITIVE_INFINITY;
}

function compareGroupsByKickoff(
  a: EventGroup,
  b: EventGroup,
  kickoffsByMatch: Record<string, string>
): number {
  const kickoffDiff = kickoffSortMs(a, kickoffsByMatch) - kickoffSortMs(b, kickoffsByMatch);
  if (kickoffDiff !== 0) return kickoffDiff;
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return a.match.localeCompare(b.match);
}

const NRL_TEAM_LOGO_ALIAS_GROUPS: string[][] = [
  ["brisbane broncos", "broncos"],
  ["canberra raiders", "raiders"],
  ["canterbury bankstown bulldogs", "canterbury bulldogs", "bulldogs"],
  ["cronulla sutherland sharks", "cronulla sharks", "sharks"],
  ["dolphins", "the dolphins"],
  ["gold coast titans", "titans"],
  ["manly warringah sea eagles", "manly sea eagles", "sea eagles", "manly"],
  ["melbourne storm", "storm"],
  ["newcastle knights", "knights"],
  ["new zealand warriors", "nz warriors", "warriors"],
  ["north queensland cowboys", "nth queensland cowboys", "north qld cowboys", "cowboys"],
  ["parramatta eels", "eels"],
  ["penrith panthers", "panthers"],
  ["south sydney rabbitohs", "rabbitohs", "souths"],
  ["st george illawarra dragons", "st george dragons", "st george", "dragons"],
  ["sydney roosters", "eastern suburbs roosters", "roosters"],
  ["wests tigers", "west tigers", "tigers"],
];

function teamLogoAliasKeys(value: string | null | undefined): string[] {
  const key = normaliseLookupKey(stripSelectionLineSuffix(value ?? ""));
  if (!key) return [];

  const group = NRL_TEAM_LOGO_ALIAS_GROUPS.find((aliases) =>
    aliases.some((alias) => normaliseLookupKey(alias) === key)
  );
  if (!group) return [key];

  return [...new Set(group.map((alias) => normaliseLookupKey(alias)).filter(Boolean))];
}

function resolveTeamLogoUrl(teamName: string | null | undefined, teamLogos: Record<string, string>): string | null {
  const keys = teamLogoAliasKeys(teamName);
  if (keys.length === 0) return null;
  for (const key of keys) {
    if (teamLogos[key]) return teamLogos[key];
  }

  return Object.entries(teamLogos).find(([logoKey]) =>
    keys.some((key) => logoKey === key || logoKey.endsWith(` ${key}`) || logoKey.includes(key))
  )?.[1] ?? null;
}

function stripSelectionLineSuffix(selection: string): string {
  return selection.trim().replace(/\s+[+-]?\d+(?:\.\d+)?\s*$/, "").trim();
}

function TeamLogoImage({
  teamName,
  teamLogos,
  className = "h-5 w-5",
}: {
  teamName: string | null | undefined;
  teamLogos: Record<string, string>;
  className?: string;
}) {
  const logoUrl = resolveTeamLogoUrl(teamName, teamLogos);
  if (!logoUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={`shrink-0 object-contain ${className}`}
      loading="lazy"
    />
  );
}

function MatchLogoCluster({
  match,
  teamLogos,
  className = "h-5 w-5",
}: {
  match: string;
  teamLogos: Record<string, string>;
  className?: string;
}) {
  const { home, away } = parseMatch(match);
  const teams = [home, away].filter(Boolean).filter((team) => resolveTeamLogoUrl(team, teamLogos));
  if (teams.length === 0) return null;

  return (
    <span className="inline-flex shrink-0 items-center">
      {teams.slice(0, 2).map((team, index) => (
        <span key={`${match}-${team}`} className={index > 0 ? "-ml-1.5" : ""}>
          <TeamLogoImage
            teamName={team}
            teamLogos={teamLogos}
            className={`${className} rounded-full bg-[#0e1530] ring-1 ring-white/10`}
          />
        </span>
      ))}
    </span>
  );
}

function BettingTeamLogos({
  selection,
  match,
  market,
  teamLogos,
  className = "h-5 w-5",
}: {
  selection: string;
  match: string;
  market: BettingMarket;
  teamLogos: Record<string, string>;
  className?: string;
}) {
  const teamSelection = stripSelectionLineSuffix(selection);
  const selectionLogoUrl = market !== "Total" ? resolveTeamLogoUrl(teamSelection, teamLogos) : null;
  if (selectionLogoUrl) {
    return <TeamLogoImage teamName={teamSelection} teamLogos={teamLogos} className={className} />;
  }

  return <MatchLogoCluster match={match} teamLogos={teamLogos} className={className} />;
}

function TeamNameWithLogo({
  name,
  teamLogos,
  className = "",
  logoClassName = "h-5 w-5",
}: {
  name: string;
  teamLogos: Record<string, string>;
  className?: string;
  logoClassName?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <TeamLogoImage teamName={name} teamLogos={teamLogos} className={logoClassName} />
      <span className="min-w-0">{name}</span>
    </span>
  );
}

function TryscorerForm({ form }: { form: TryscorerFormSummary | null }) {
  if (!form || form.lastFive.length === 0) return null;
  const oldestToNewest = [...form.lastFive].reverse();
  const latestIndex = oldestToNewest.length - 1;
  return (
    <div className="mt-1 flex flex-nowrap items-center gap-1 whitespace-nowrap text-[10px] font-semibold">
      <span className="mr-1 font-medium text-nrl-muted">Last 5:</span>
      {oldestToNewest.map((tries, index) => (
        <span
          key={`${index}-${tries}`}
          className={`inline-flex h-5 min-w-7 items-center justify-center rounded-md px-2 ${
            tries > 0
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-red-500/12 text-red-300"
          } ${index === latestIndex ? (tries > 0 ? "border border-emerald-300" : "border border-red-300") : "border border-transparent"}`}
        >
          {tries}
        </span>
      ))}
      <span className="ml-1 text-nrl-muted">Avg {form.average.toFixed(1)}</span>
    </div>
  );
}

function formatPrice(value: number | null): string {
  if (value == null) return "-";
  return value.toFixed(2);
}

function formatLineValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatBestBetSelection(market: BettingMarket, selection: string, lineValue: number | null): string {
  if (market === "Tryscorer" && lineValue != null) return `${selection} ${lineValue}+`;
  if ((market === "Line" || market === "Total") && lineValue != null) {
    return `${selection} ${formatLineValue(lineValue)}`;
  }
  return selection;
}

function formatPct(value: number | null): string {
  if (value == null) return "-";
  return `${value.toFixed(2)}%`;
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}

function formatStakeMoney(value: number): string {
  return `$${value >= 100 ? value.toFixed(0) : value.toFixed(2)}`;
}

function parseLineValueFromSelection(selection: string): number | null {
  const match = selection.trim().match(/([+-]?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeBetProfit(status: TrackedBetStatus, stake: number, odds: number): number | null {
  if (status === "pending") return null;
  if (status === "push") return 0;
  if (status === "won") return Number((stake * Math.max(0, odds - 1)).toFixed(2));
  return Number((-stake).toFixed(2));
}

function betStatusPillClass(status: TrackedBetStatus): string {
  if (status === "won") return "border-nrl-accent/35 bg-nrl-accent/10 text-nrl-accent";
  if (status === "lost") return "border-red-500/35 bg-red-500/10 text-red-400";
  if (status === "push") return "border-white/12 bg-white/[0.04] text-nrl-muted";
  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

function betStatusIconClass(status: TrackedBetStatus): string {
  if (status === "won") return "bg-nrl-accent text-[#07180f]";
  if (status === "lost") return "bg-red-500 text-white";
  if (status === "push") return "bg-slate-500 text-white";
  return "bg-amber-300 text-[#1f1706]";
}

function betStatusIconLabel(status: TrackedBetStatus): string {
  if (status === "won") return "✓";
  if (status === "lost") return "×";
  if (status === "push") return "=";
  return "•";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseMatch(match: string): { home: string; away: string } {
  const parts = match.split(/\s+v(?:s|\.)?\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { home: parts[0], away: parts.slice(1).join(" v ") };
  }
  return { home: match, away: "" };
}

function formatDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function eventStartMs(
  event: Pick<EventGroup, "date" | "match">,
  kickoffsByMatch: Record<string, string>
): number | null {
  const kickoffKey = buildMatchKickoffKey(event.date, event.match);
  const kickoff = kickoffKey ? kickoffsByMatch[kickoffKey] : null;
  const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;
  if (Number.isFinite(kickoffMs)) return kickoffMs;

  const dateEndMs = Date.parse(`${event.date}T23:59:59`);
  if (Number.isFinite(dateEndMs)) return dateEndMs;

  return null;
}

function formatEventCountdown(
  event: Pick<EventGroup, "date" | "match">,
  kickoffsByMatch: Record<string, string>,
  nowMs: number
): string {
  const startMs = eventStartMs(event, kickoffsByMatch);
  if (startMs == null) return formatDateLabel(event.date);

  const remainingMs = startMs - nowMs;
  if (remainingMs <= 0) return "Live";

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (remainingMs < dayMs) {
    const hours = Math.floor(remainingMs / hourMs);
    const minutes = Math.max(0, Math.floor((remainingMs % hourMs) / minuteMs));
    return `${hours}:${minutes.toString().padStart(2, "0")} til event`;
  }

  const days = Math.ceil(remainingMs / dayMs);
  return `${days}d til event`;
}

function formatBestBetScore(score: number): string {
  return `${(clamp(score, 0, 1) * 10).toFixed(1)}/10`;
}

function createBookieRecord<T>(factory: () => T): Record<BettingBookie, T> {
  return {
    Sportsbet: factory(),
    Pointsbet: factory(),
    Unibet: factory(),
    Palmerbet: factory(),
    Betright: factory(),
  };
}

function inverseNormalCdf(probability: number): number | null {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;

  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (probability < pLow) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (probability > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = probability - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function marketOfferScore(offer: BookieOffer, market: BettingMarket, result: string): number | null {
  const implied = impliedProbability(offer.price);
  const z = implied == null ? null : inverseNormalCdf(implied);
  if (market === "H2H" || market === "Tryscorer") return offer.price;
  if (offer.value == null || z == null) return null;

  if (market === "Line") {
    return offer.value - (IMPLIED_LINE_SIGMA * z);
  }

  const normalizedResult = result.trim().toLowerCase();
  if (normalizedResult.startsWith("over")) {
    return -(offer.value + (IMPLIED_TOTAL_SIGMA * z));
  }
  if (normalizedResult.startsWith("under")) {
    return offer.value - (IMPLIED_TOTAL_SIGMA * z);
  }
  return null;
}

function compareOfferValue(a: number | null, b: number | null, market: BettingMarket, result: string): number {
  if (a == null || b == null) return 0;
  if (market === "Tryscorer") return 0;
  if (market === "Line") return a - b;
  if (market === "Total") {
    const normalizedResult = result.trim().toLowerCase();
    if (normalizedResult.startsWith("over")) return b - a;
    if (normalizedResult.startsWith("under")) return a - b;
  }
  return 0;
}

function compareBookieOffers(a: BookieOffer, b: BookieOffer, market: BettingMarket, result: string): number {
  const aScore = marketOfferScore(a, market, result);
  const bScore = marketOfferScore(b, market, result);
  if (aScore != null || bScore != null) {
    if (aScore == null) return -1;
    if (bScore == null) return 1;
    if (Math.abs(aScore - bScore) > 1e-9) return aScore - bScore;
  }

  const valueComparison = compareOfferValue(a.value, b.value, market, result);
  if (valueComparison !== 0) return valueComparison;
  if (Math.abs(a.price - b.price) > 1e-9) return a.price - b.price;
  return 0;
}

function pickBestOffer(offers: BookieOffer[], market: BettingMarket, result: string): BookieOffer | null {
  if (offers.length === 0) return null;
  return offers.reduce<BookieOffer>((best, offer) => (
    compareBookieOffers(offer, best, market, result) > 0 ? offer : best
  ), offers[0]);
}

function buildEventGroups(
  rows: BettingOddsRow[],
  resolveResult: (result: string, market: BettingMarket) => string = (result) => result
): EventGroup[] {
  const groups = new Map<string, {
    key: string;
    date: string;
    match: string;
    market: BettingOddsRow["market"];
    outcomes: Map<string, {
      market: BettingOddsRow["market"];
      result: string;
      candidateOffers: Record<BettingBookie, BookieOffer[]>;
    }>;
  }>();

  for (const row of rows) {
    if (row.market === "Tryscorer" && row.result.includes(";")) continue;
    const eventKey = `${row.date}|${row.match}|${row.market}`;
    const existingGroup = groups.get(eventKey);
    if (!existingGroup) {
      groups.set(eventKey, {
        key: eventKey,
        date: row.date,
        match: row.match,
        market: row.market,
        outcomes: new Map(),
      });
    }

    const group = groups.get(eventKey);
    if (!group) continue;

    const rowResult = resolveResult(row.result, row.market);
    const outcomeKey = row.market === "Tryscorer" ? `${rowResult}|${row.value ?? ""}` : rowResult;
    const existingOutcome = group.outcomes.get(outcomeKey);
    if (!existingOutcome) {
      group.outcomes.set(outcomeKey, {
        market: row.market,
        result: rowResult,
        candidateOffers: createBookieRecord(() => [] as BookieOffer[]),
      });
    }

    const outcome = group.outcomes.get(outcomeKey);
    if (!outcome) continue;

    for (const bookie of BETTING_BOOKIE_COLUMNS) {
      const price = row[bookie];
      if (price == null) continue;
      outcome.candidateOffers[bookie].push({
        bookie,
        price,
        value: row.value,
        model: row.model,
      });
    }
  }

  const out = [...groups.values()].map((group) => {
    const outcomes = [...group.outcomes.values()].map<OutcomeRow>((outcome) => {
      const bookieOffers = createBookieRecord<BookieOffer | null>(() => null);
      for (const bookie of BETTING_BOOKIE_COLUMNS) {
        bookieOffers[bookie] = pickBestOffer(outcome.candidateOffers[bookie], outcome.market, outcome.result);
      }

      const selectedOffers = BETTING_BOOKIE_COLUMNS
        .map((bookie) => bookieOffers[bookie])
        .filter((offer): offer is BookieOffer => offer != null);
      const bestOffer = selectedOffers.reduce<BookieOffer | null>((best, offer) => {
        if (best == null) return offer;
        return compareBookieOffers(offer, best, outcome.market, outcome.result) > 0 ? offer : best;
      }, null);
      const bestBookies = bestOffer == null
        ? []
        : BETTING_BOOKIE_COLUMNS.filter((bookie) => {
            const offer = bookieOffers[bookie];
            return offer != null
              && offer.price === bestOffer.price
              && offer.value === bestOffer.value;
          });

      return {
        market: outcome.market,
        result: outcome.result,
        bookieOffers,
        bestOfferComputed: bestOffer,
        bestPriceComputed: bestOffer?.price ?? null,
        bestValueComputed: bestOffer?.value ?? null,
        bestModelComputed: bestOffer?.model ?? null,
        bestBookiesComputed: bestBookies,
      };
    });

    const inverseSum = (group.market === "H2H" ? outcomes : [])
      .map((row) => row.bestPriceComputed)
      .filter((value): value is number => value != null)
      .reduce((sum, price) => sum + 1 / price, 0);
    const marketPctFromBest = inverseSum > 0 ? inverseSum * 100 : null;

    return {
      key: group.key,
      date: group.date,
      match: group.match,
      market: group.market,
      outcomes: outcomes.sort((a, b) => {
        if (group.market === "Tryscorer") {
          if (a.bestPriceComputed != null && b.bestPriceComputed != null && a.bestPriceComputed !== b.bestPriceComputed) {
            return a.bestPriceComputed - b.bestPriceComputed;
          }
          if (a.bestPriceComputed == null && b.bestPriceComputed != null) return 1;
          if (a.bestPriceComputed != null && b.bestPriceComputed == null) return -1;
        }
        return a.result.localeCompare(b.result);
      }),
      marketPctFromBest,
    };
  });

  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.match.localeCompare(b.match);
  });
}

function impliedProbability(price: number | null): number | null {
  if (price == null || price <= 1) return null;
  return 1 / price;
}

function kellyFraction(probability: number, price: number): number {
  const b = price - 1;
  if (b <= 0) return 0;
  const q = 1 - probability;
  const f = ((b * probability) - q) / b;
  return Math.max(0, f);
}

function modelPercentToProbability(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (value <= 1) return clamp(value, 0.01, 0.99);
  return clamp(value / 100, 0.01, 0.99);
}

function buildBestBets({
  groups,
  bankroll,
  kellyScale,
  todayIso,
}: {
  groups: EventGroup[];
  bankroll: number;
  kellyScale: number;
  todayIso: string;
}): BestBetCandidate[] {
  const candidates: Array<Omit<BestBetCandidate, "tags">> = [];

  for (const group of groups) {
    if (group.date < todayIso) continue;

    for (const row of group.outcomes) {
      const odds = row.bestPriceComputed;
      const modelProbability = modelPercentToProbability(row.bestModelComputed);
      const implied = impliedProbability(odds);
      const bestBookies = row.bestBookiesComputed.length > 0
        ? row.bestBookiesComputed
        : row.bestOfferComputed
          ? [row.bestOfferComputed.bookie]
          : [];
      const bestBookie = bestBookies[0] ?? null;
      if (
        odds == null ||
        modelProbability == null ||
        implied == null ||
        bestBookie == null ||
        odds <= 1
      ) {
        continue;
      }

      const edgePp = (modelProbability - implied) * 100;
      if (edgePp < BEST_BETS_CONFIG.minEdgePp) continue;

      const offers = BETTING_BOOKIE_COLUMNS
        .map((bookie) => row.bookieOffers[bookie])
        .filter((offer): offer is BookieOffer => offer != null);
      if (offers.length < BEST_BETS_CONFIG.minBookies) continue;

      const prices = offers.map((offer) => offer.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const marketDisagreementPct = minPrice > 0 && maxPrice > minPrice
        ? ((maxPrice / minPrice) - 1) * 100
        : null;
      const liquidityScore = clamp(offers.length / BETTING_BOOKIE_COLUMNS.length, 0, 1);
      const marketEfficiencyPct = group.marketPctFromBest;
      const efficiencyScore = marketEfficiencyPct != null
        ? clamp(1 - Math.max(0, marketEfficiencyPct - 100) / 14, 0, 1)
        : clamp(0.5 + liquidityScore * 0.35, 0, 1);
      const disagreementScore = clamp((marketDisagreementPct ?? 0) / 14, 0, 1);
      const edgeScore = clamp(edgePp / 8, 0, 1);
      const score =
        (edgeScore * BEST_BETS_CONFIG.weights.edge) +
        (liquidityScore * BEST_BETS_CONFIG.weights.liquidity) +
        (efficiencyScore * BEST_BETS_CONFIG.weights.efficiency) +
        (disagreementScore * BEST_BETS_CONFIG.weights.disagreement);
      const fullKelly = kellyFraction(modelProbability, odds);
      const rawKellyStake = Math.max(0, bankroll * fullKelly * kellyScale);
      const kellyStake = rawKellyStake > 0 && rawKellyStake < 1 ? 1 : Math.round(rawKellyStake);

      candidates.push({
        id: `${group.key}|${row.result}|${row.bestValueComputed ?? ""}`,
        date: group.date,
        match: group.match,
        market: group.market,
        selection: row.result,
        selectionLabel: formatBestBetSelection(group.market, row.result, row.bestValueComputed),
        lineValue: row.bestValueComputed,
        bestBookie,
        bestBookies,
        bestBookieCount: bestBookies.length,
        odds,
        modelProbability,
        impliedProbability: implied,
        edgePp,
        kellyStake,
        score,
        marketDisagreementPct,
        marketEfficiencyPct,
      });
    }
  }

  const sorted = candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    return b.edgePp - a.edgePp;
  });
  const biggestEdgeId = [...candidates].sort((a, b) => b.edgePp - a.edgePp)[0]?.id;

  return sorted.slice(0, BEST_BETS_CONFIG.maxCards).map((candidate, index) => {
    const tags: string[] = [];
    if (index === 0) tags.push("Top Rated Bet");
    if (candidate.id === biggestEdgeId) tags.push("Highest Edge");
    if ((candidate.marketDisagreementPct ?? 0) >= 5) tags.push("Best Value");
    if (candidate.modelProbability >= 0.55 && candidate.market !== "Tryscorer") tags.push("Model Favourite");
    if (tags.length === 0) tags.push("Sharp Value");

    return {
      ...candidate,
      tags: [...new Set(tags)].slice(0, 2),
    };
  });
}

function buildArbitrageBets({
  groups,
  bankroll,
  todayIso,
}: {
  groups: EventGroup[];
  bankroll: number;
  todayIso: string;
}): ArbitrageCandidate[] {
  const targetTotalStake = Math.max(20, Math.round((Number.isFinite(bankroll) ? bankroll : 1000) * 0.1));
  const candidates: ArbitrageCandidate[] = [];

  for (const group of groups) {
    if (group.date < todayIso || group.market !== "H2H" || group.marketPctFromBest == null) continue;
    const bookDecimal = group.marketPctFromBest / 100;
    const returnPct = ((1 / bookDecimal) - 1) * 100;
    if (bookDecimal <= 0 || returnPct < BEST_BETS_CONFIG.minArbitragePct) continue;

    const rows = group.outcomes
      .filter((row) => row.bestPriceComputed != null && row.bestPriceComputed > 1 && row.bestBookiesComputed.length > 0);
    if (rows.length < 2) continue;

    const inverseSum = rows.reduce((sum, row) => sum + (row.bestPriceComputed == null ? 0 : 1 / row.bestPriceComputed), 0);
    if (inverseSum <= 0 || inverseSum >= 1) continue;

    const targetPayout = targetTotalStake / inverseSum;
    const stakes = rows.map<ArbitrageStake>((row) => {
      const odds = row.bestPriceComputed ?? 0;
      return {
        selection: row.result,
        selectionLabel: formatBestBetSelection(group.market, row.result, row.bestValueComputed),
        bookies: row.bestBookiesComputed,
        odds,
        stake: targetPayout / odds,
      };
    });
    const profit = targetPayout - targetTotalStake;

    candidates.push({
      id: `${group.key}|arbitrage`,
      date: group.date,
      match: group.match,
      market: group.market,
      marketBookPct: inverseSum * 100,
      returnPct,
      totalStake: targetTotalStake,
      targetPayout,
      profit,
      score: returnPct,
      stakes,
    });
  }

  return candidates
    .sort((a, b) => {
      if (Math.abs(a.returnPct - b.returnPct) > 1e-9) return b.returnPct - a.returnPct;
      return a.marketBookPct - b.marketBookPct;
    })
    .slice(0, BEST_BETS_CONFIG.maxArbitrageCards);
}

function BookieLogo({
  bookie,
  compact = false,
}: {
  bookie: BettingBookie;
  compact?: boolean;
}) {
  const width = compact ? 56 : 76;
  const height = compact ? 18 : 22;
  return (
    <span
      title={bookie}
      aria-label={bookie}
      className="inline-flex items-center justify-center"
    >
      <Image
        src={BOOKIE_LOGO_PATHS[bookie]}
        alt={bookie}
        width={width}
        height={height}
        className={compact ? "h-4 w-auto object-contain" : "h-5 w-auto object-contain"}
      />
    </span>
  );
}

export function BettingDashboard({
  snapshot,
  canAccessPremium = false,
  playerImages = [],
  teamLogos = {},
  tryscorerFormByPlayer = {},
  tryscorerKickoffsByMatch = {},
  marginModelArticle = null,
}: BettingDashboardProps) {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const hasPremiumBettingAccess = canAccessPremium || hasPremiumAccess(userId, user?.publicMetadata);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [bankroll, setBankroll] = useState(1000);
  const [stakingMode, setStakingMode] = useState<StakingMode>("percentage");
  const [percentageStakePct, setPercentageStakePct] = useState(2);
  const [targetProfitPct, setTargetProfitPct] = useState(2);
  const [kellyScale, setKellyScale] = useState(0.5);
  const [maxEdge, setMaxEdge] = useState(0.06);
  const [selectedMarket, setSelectedMarket] = useState<BettingMarket>(DEFAULT_BETTING_MARKET);
  const [stakeOverrides, setStakeOverrides] = useState<Record<string, number>>({});
  const [oddsOverrides, setOddsOverrides] = useState<Record<string, number>>({});
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [bets, setBets] = useState<TrackedBet[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [betsHydrated, setBetsHydrated] = useState(false);
  const [betsError, setBetsError] = useState<string | null>(null);
  const [betAddedMessage, setBetAddedMessage] = useState<string | null>(null);
  const [betRemovedMessage, setBetRemovedMessage] = useState<string | null>(null);
  const [manualMatchDate, setManualMatchDate] = useState(todayIso);
  const [manualMatchName, setManualMatchName] = useState("");
  const [manualSelection, setManualSelection] = useState("");
  const [manualOdds, setManualOdds] = useState("1.90");
  const [manualStake, setManualStake] = useState("10");
  const [manualStatus, setManualStatus] = useState<TrackedBetStatus>("pending");
  const [manualError, setManualError] = useState<string | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const playerTeamsByName = useMemo(() => {
    const out = new Map<string, string>();
    for (const row of playerImages) {
      const key = normaliseLookupKey(row.player);
      if (!key || !row.team || out.has(key)) continue;
      out.set(key, row.team);
    }
    return out;
  }, [playerImages]);
  const resolveTryscorerResult = useMemo(() => {
    const entries = Object.entries(tryscorerFormByPlayer);
    return (result: string, market: BettingMarket) => {
      if (market !== "Tryscorer") return result;
      const key = normaliseLookupKey(result);
      const exact = tryscorerFormByPlayer[key]?.player;
      if (exact) return exact;

      const tokens = key.split(" ");
      const first = tokens[0] ?? "";
      const last = tokens[tokens.length - 1] ?? "";
      if (!first || !last) return result;

      const matched = entries.find(([candidateKey]) => {
        const candidateTokens = candidateKey.split(" ");
        const candidateFirst = candidateTokens[0] ?? "";
        const candidateLast = candidateTokens[candidateTokens.length - 1] ?? "";
        if (!candidateFirst || !candidateLast) return false;
        if (candidateLast === last && candidateFirst.startsWith(first[0] ?? "")) return true;
        return candidateFirst === first && areLookupTokensClose(candidateLast, last);
      });
      return matched?.[1].player || result;
    };
  }, [tryscorerFormByPlayer]);

  const h2hGroups = useMemo(() => buildEventGroups(snapshot.h2h), [snapshot.h2h]);
  const lineGroups = useMemo(() => buildEventGroups(snapshot.line), [snapshot.line]);
  const totalGroups = useMemo(() => buildEventGroups(snapshot.total), [snapshot.total]);
  const tryscorerGroups = useMemo(
    () => buildEventGroups(snapshot.tryscorer, resolveTryscorerResult),
    [resolveTryscorerResult, snapshot.tryscorer]
  );
  const selectedMarketGroups = selectedMarket === "H2H"
    ? h2hGroups
    : selectedMarket === "Line"
      ? lineGroups
      : selectedMarket === "Total"
        ? totalGroups
        : tryscorerGroups;
  const bestBets = useMemo(
    () => buildBestBets({
      groups: [...h2hGroups, ...lineGroups, ...totalGroups, ...tryscorerGroups],
      bankroll,
      kellyScale,
      todayIso,
    }),
    [bankroll, h2hGroups, kellyScale, lineGroups, todayIso, totalGroups, tryscorerGroups]
  );
  const arbitrageBets = useMemo(
    () => buildArbitrageBets({
      groups: h2hGroups,
      bankroll,
      todayIso,
    }),
    [bankroll, h2hGroups, todayIso]
  );

  const handleMarketChange = (value: string) => {
    if (value === "H2H" || value === "Line" || value === "Total" || value === "Tryscorer") {
      setSelectedMarket(value);
    }
  };

  const handleStakingModeChange = (mode: StakingMode) => {
    if (!hasPremiumBettingAccess && mode === "kelly") {
      return;
    }
    setStakingMode(mode);
  };

  useEffect(() => {
    if (!hasPremiumBettingAccess && stakingMode === "kelly") {
      setStakingMode("percentage");
    }
  }, [hasPremiumBettingAccess, stakingMode]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    const applyPreferences = (preferences: BettingPreferences) => {
      setStakingMode(preferences.stakingMode);
      setBankroll(clamp(preferences.bankroll, 0, 1_000_000_000));
      setPercentageStakePct(clamp(preferences.percentageStakePct, 0, 100));
      setTargetProfitPct(clamp(preferences.targetProfitPct, 0, 100));
      setKellyScale(clamp(preferences.kellyScale, 0, 1));
      setMaxEdge(clamp(preferences.maxEdge, 0, 1));
    };

    if (!userId) {
      try {
        const raw = window.localStorage.getItem(BETTING_PREFERENCES_LOCAL_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<BettingPreferences>;
          const mode = parsed.stakingMode;
          applyPreferences({
            stakingMode:
              mode === "kelly" && !hasPremiumBettingAccess
                ? "percentage"
                : mode === "percentage" || mode === "targetProfit" || mode === "kelly"
                  ? mode
                  : "percentage",
            bankroll: Number(parsed.bankroll) || 1000,
            percentageStakePct: Number(parsed.percentageStakePct) || 2,
            targetProfitPct: Number(parsed.targetProfitPct) || 2,
            kellyScale: Number(parsed.kellyScale) || 0.5,
            maxEdge: Number(parsed.maxEdge) || 0.06,
          });
        }
      } catch {
        // Ignore preference storage failures.
      } finally {
        if (!cancelled) setPreferencesHydrated(true);
      }
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const response = await fetch("/api/user/betting-preferences", { method: "GET", cache: "no-store" });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Failed to load betting preferences (${response.status}): ${body}`);
        }
        const payload = (await response.json()) as { preferences?: Partial<BettingPreferences> | null };
        if (!cancelled && payload.preferences) {
          const mode = payload.preferences.stakingMode;
          applyPreferences({
            stakingMode:
              mode === "kelly" && !hasPremiumBettingAccess
                ? "percentage"
                : mode === "percentage" || mode === "targetProfit" || mode === "kelly"
                  ? mode
                  : "percentage",
            bankroll: Number(payload.preferences.bankroll) || 1000,
            percentageStakePct: Number(payload.preferences.percentageStakePct) || 2,
            targetProfitPct: Number(payload.preferences.targetProfitPct) || 2,
            kellyScale: Number(payload.preferences.kellyScale) || 0.5,
            maxEdge: Number(payload.preferences.maxEdge) || 0.06,
          });
        }
      } catch {
        // Keep defaults if preference fetch fails.
      } finally {
        if (!cancelled) setPreferencesHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasPremiumBettingAccess, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded || !preferencesHydrated) return;
    const payload: BettingPreferences = {
      stakingMode: !hasPremiumBettingAccess && stakingMode === "kelly" ? "percentage" : stakingMode,
      bankroll,
      percentageStakePct,
      targetProfitPct,
      kellyScale,
      maxEdge,
    };

    if (!userId) {
      try {
        window.localStorage.setItem(BETTING_PREFERENCES_LOCAL_KEY, JSON.stringify(payload));
      } catch {
        // Ignore preference storage failures.
      }
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch("/api/user/betting-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Ignore transient save errors.
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [
    bankroll,
    hasPremiumBettingAccess,
    isLoaded,
    kellyScale,
    maxEdge,
    percentageStakePct,
    preferencesHydrated,
    stakingMode,
    targetProfitPct,
    userId,
  ]);

  useEffect(() => {
    if (!isLoaded) return;
    setBetsHydrated(false);

    if (!hasPremiumBettingAccess) {
      setBets([]);
      setBetsLoading(false);
      setBetsError(null);
      setBetsHydrated(true);
      return;
    }

    if (!userId) {
      try {
        const raw = window.localStorage.getItem(BET_TRACKER_LOCAL_KEY);
        if (!raw) {
          setBets([]);
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setBets(parsed as TrackedBet[]);
        } else {
          setBets([]);
        }
      } catch {
        setBets([]);
      } finally {
        setBetsLoading(false);
        setBetsError(null);
        setBetsHydrated(true);
      }
      return;
    }

    let cancelled = false;
    setBetsLoading(true);
    setBetsError(null);

    void (async () => {
      try {
        const response = await fetch("/api/user/bets", { method: "GET", cache: "no-store" });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Failed to load bets (${response.status}): ${body}`);
        }
        const payload = (await response.json()) as { bets?: TrackedBet[] };
        if (!cancelled) {
          setBets(Array.isArray(payload.bets) ? payload.bets : []);
        }
      } catch (error) {
        if (!cancelled) {
          setBetsError(error instanceof Error ? error.message : "Failed to load bets");
        }
      } finally {
        if (!cancelled) {
          setBetsLoading(false);
          setBetsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasPremiumBettingAccess, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded || userId || !hasPremiumBettingAccess || !betsHydrated) return;
    try {
      window.localStorage.setItem(BET_TRACKER_LOCAL_KEY, JSON.stringify(bets));
    } catch {
      // Ignore storage failures.
    }
  }, [bets, betsHydrated, hasPremiumBettingAccess, isLoaded, userId]);

  useEffect(() => {
    if (!betAddedMessage) return;
    const timeout = window.setTimeout(() => setBetAddedMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [betAddedMessage]);

  useEffect(() => {
    if (!betRemovedMessage) return;
    const timeout = window.setTimeout(() => setBetRemovedMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [betRemovedMessage]);

  const handleStakeOverride = (key: string, value: number) => {
    setStakeOverrides((prev) => ({
      ...prev,
      [key]: Math.max(0, value),
    }));
  };

  const handleOddsOverride = (key: string, value: number) => {
    setOddsOverrides((prev) => ({
      ...prev,
      [key]: Math.max(0, value),
    }));
  };

  const handleAddBet = async (draft: BetDraft) => {
    if (!hasPremiumBettingAccess) return;
    if (!Number.isFinite(draft.stake) || draft.stake <= 0) return;
    if (!Number.isFinite(draft.odds) || draft.odds <= 1) return;
    const status = draft.status ?? "pending";

    if (!userId) {
      const localBet: TrackedBet = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status,
        profit: computeBetProfit(status, draft.stake, draft.odds),
        placedAt: new Date().toISOString(),
        settledAt: status === "pending" ? null : new Date().toISOString(),
        ...draft,
      };
      setBets((prev) => [localBet, ...prev]);
      setBetAddedMessage("Bet added to bet tracker");
      return;
    }

    try {
      const response = await fetch("/api/user/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, status }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to save bet (${response.status}): ${body}`);
      }
      const payload = (await response.json()) as { bet?: TrackedBet };
      if (payload.bet) {
        setBets((prev) => [payload.bet as TrackedBet, ...prev]);
        setBetAddedMessage("Bet added to bet tracker");
      }
    } catch (error) {
      setBetsError(error instanceof Error ? error.message : "Failed to save bet");
    }
  };

  const handleUpdateBet = async (
    betId: string,
    updates: Partial<Pick<TrackedBet, "stake" | "odds" | "status">>
  ) => {
    if (!hasPremiumBettingAccess) return;
    if (!updates || Object.keys(updates).length === 0) return;

    if (!userId) {
      setBets((prev) =>
        prev.map((bet) => {
          if (bet.id !== betId) return bet;
          const nextOdds = updates.odds ?? bet.odds;
          const nextStake = updates.stake ?? bet.stake;
          const nextStatus = updates.status ?? bet.status;
          if (!Number.isFinite(nextOdds) || nextOdds <= 1) return bet;
          if (!Number.isFinite(nextStake) || nextStake <= 0) return bet;
          return {
            ...bet,
            odds: nextOdds,
            stake: nextStake,
            status: nextStatus,
            profit: computeBetProfit(nextStatus, nextStake, nextOdds),
            settledAt: nextStatus === "pending" ? null : (bet.settledAt ?? new Date().toISOString()),
          };
        })
      );
      return;
    }

    try {
      const response = await fetch("/api/user/bets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: betId, ...updates }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to update bet (${response.status}): ${body}`);
      }
      const payload = (await response.json()) as { bet?: TrackedBet };
      if (payload.bet) {
        setBets((prev) => prev.map((bet) => (bet.id === payload.bet!.id ? payload.bet! : bet)));
      }
    } catch (error) {
      setBetsError(error instanceof Error ? error.message : "Failed to update bet");
    }
  };

  const handleDeleteBet = async (betId: string) => {
    if (!hasPremiumBettingAccess) return;
    if (!userId) {
      setBets((prev) => prev.filter((bet) => bet.id !== betId));
      setBetRemovedMessage("Bet removed from bet tracker");
      return;
    }

    try {
      const response = await fetch("/api/user/bets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: betId }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to delete bet (${response.status}): ${body}`);
      }
      setBets((prev) => prev.filter((bet) => bet.id !== betId));
      setBetRemovedMessage("Bet removed from bet tracker");
    } catch (error) {
      setBetsError(error instanceof Error ? error.message : "Failed to delete bet");
    }
  };

  const handleManualAddBet = async (): Promise<boolean> => {
    if (!hasPremiumBettingAccess) return false;
    setManualError(null);

    if (!manualMatchDate.trim()) {
      setManualError("Date is required.");
      return false;
    }
    if (!manualMatchName.trim()) {
      setManualError("Match is required.");
      return false;
    }
    if (!manualSelection.trim()) {
      setManualError("Selection is required.");
      return false;
    }

    const parsedOdds = Number(manualOdds);
    const parsedStake = Number(manualStake);
    if (!Number.isFinite(parsedOdds) || parsedOdds <= 1) {
      setManualError("Odds must be greater than 1.");
      return false;
    }
    if (!Number.isFinite(parsedStake) || parsedStake <= 0) {
      setManualError("Stake must be greater than 0.");
      return false;
    }

    await handleAddBet({
      market: selectedMarket,
      matchDate: manualMatchDate,
      matchName: manualMatchName.trim(),
      selection: manualSelection.trim(),
      lineValue: parseLineValueFromSelection(manualSelection),
      odds: parsedOdds,
      stake: parsedStake,
      status: manualStatus,
      modelProb: null,
      impliedProb: null,
      edgePp: null,
    });

    setManualMatchName("");
    setManualSelection("");
    setManualOdds("1.90");
    setManualStake("10");
    setManualStatus("pending");
    return true;
  };

  const totalStake = bets.reduce((sum, bet) => sum + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
  const pendingStake = bets
    .filter((bet) => bet.status === "pending")
    .reduce((sum, bet) => sum + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
  const winningBets = bets.filter((bet) => bet.status === "won").length;
  const losingBets = bets.filter((bet) => bet.status === "lost").length;
  const settledNoPush = winningBets + losingBets;
  const winRate = settledNoPush > 0 ? (winningBets / settledNoPush) * 100 : null;
  const profitLoss = bets.reduce((sum, bet) => sum + (bet.profit ?? 0), 0);
  const profitMargin = totalStake > 0 ? (profitLoss / totalStake) * 100 : null;
  const trackerBankroll = bankroll + profitLoss;
  const roiRingPct = Math.max(0, Math.min(100, Math.abs(profitMargin ?? 0)));
  const roiRingDegrees = roiRingPct * 3.6;
  const roiRingBackground = profitMargin != null && profitMargin < 0
    ? `conic-gradient(rgba(148,163,184,0.22) 0deg ${360 - roiRingDegrees}deg, #fca5a5 ${360 - roiRingDegrees}deg 360deg)`
    : `conic-gradient(#38bdf8 0deg ${roiRingDegrees}deg, rgba(148,163,184,0.22) 0)`;
  const sortedBets = useMemo(
    () => [...bets].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    [bets]
  );
  const trackerChart = useMemo(() => {
    const width = 640;
    const height = 154;
    const paddingLeft = 44;
    const paddingRight = 8;
    const paddingTop = 18;
    const paddingBottom = 30;
    let runningProfit = 0;
    const values = [0];
    [...bets]
      .sort((a, b) => a.placedAt.localeCompare(b.placedAt))
      .forEach((bet) => {
        runningProfit += bet.profit ?? 0;
        values.push(Number(runningProfit.toFixed(2)));
      });

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    const chartLeft = paddingLeft;
    const chartRight = width - paddingRight;
    const chartTop = paddingTop;
    const chartBottom = height - paddingBottom;
    const valueToY = (value: number) => chartBottom - ((value - minValue) / range) * (chartBottom - chartTop);
    const chartPoints = values.map((value, index) => {
      const x = values.length === 1
        ? chartLeft
        : chartLeft + (index / (values.length - 1)) * (chartRight - chartLeft);
      const y = valueToY(value);
      return { value, x, y };
    });
    const zeroY = valueToY(0);
    const lineSegments: Array<{ points: string; stroke: string }> = [];
    for (let index = 1; index < chartPoints.length; index += 1) {
      const previous = chartPoints[index - 1];
      const current = chartPoints[index];
      if (previous.value < 0 && current.value < 0) {
        lineSegments.push({
          points: `${previous.x.toFixed(1)},${previous.y.toFixed(1)} ${current.x.toFixed(1)},${current.y.toFixed(1)}`,
          stroke: "#fca5a5",
        });
        continue;
      }
      if (previous.value >= 0 && current.value >= 0) {
        lineSegments.push({
          points: `${previous.x.toFixed(1)},${previous.y.toFixed(1)} ${current.x.toFixed(1)},${current.y.toFixed(1)}`,
          stroke: "#00f58a",
        });
        continue;
      }

      const crossingRatio = (0 - previous.value) / (current.value - previous.value);
      const crossingX = previous.x + (current.x - previous.x) * crossingRatio;
      const crossing = `${crossingX.toFixed(1)},${zeroY.toFixed(1)}`;
      lineSegments.push({
        points: `${previous.x.toFixed(1)},${previous.y.toFixed(1)} ${crossing}`,
        stroke: previous.value < 0 ? "#fca5a5" : "#00f58a",
      });
      lineSegments.push({
        points: `${crossing} ${current.x.toFixed(1)},${current.y.toFixed(1)}`,
        stroke: current.value < 0 ? "#fca5a5" : "#00f58a",
      });
    }
    const points = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`);

    return {
      width,
      height,
      lineSegments,
      areaPoints: `${points.join(" ")} ${chartRight},${chartBottom} ${chartLeft},${chartBottom}`,
      chartLeft,
      chartRight,
      chartTop,
      chartBottom,
      zeroY,
      yLabels: [
        { label: formatMoney(maxValue), y: chartTop },
        { label: formatMoney(0), y: zeroY },
        { label: formatMoney(minValue), y: chartBottom },
      ],
    };
  }, [bets]);
  const stakingPreferencesLoading = !isLoaded || !preferencesHydrated;
  const betTrackerLoading = hasPremiumBettingAccess && (!betsHydrated || betsLoading);

  return (
    <div className="space-y-6">
      <BestBetsHero
        modelBets={bestBets}
        arbitrageBets={arbitrageBets}
        canAccessPremium={hasPremiumBettingAccess}
        teamLogos={teamLogos}
        tryscorerKickoffsByMatch={tryscorerKickoffsByMatch}
        onAddBet={handleAddBet}
      />

      {marginModelArticle ? (
        <Link
          href={`/dashboard/articles/${marginModelArticle.slug}`}
          aria-label={`Read ${marginModelArticle.title}`}
          className="group relative flex min-h-[58px] w-full cursor-pointer overflow-hidden rounded-full border border-[rgba(123,92,255,0.22)] bg-[#20284a]/80 text-white shadow-[0_8px_18px_rgba(8,10,18,0.16)] transition-colors hover:border-nrl-accent/55"
        >
          <div className={`absolute inset-0 grid ${marginModelArticle.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {marginModelArticle.imageUrls.slice(0, 2).map((url, index) => (
              <div key={`${url}-${index}`} className="min-w-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover opacity-45 transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,19,48,0.92),rgba(14,19,48,0.78),rgba(14,19,48,0.56))]" />
          <div className="relative flex min-h-[58px] w-full items-center justify-between gap-3 px-4 py-2">
            <div className="min-w-0">
              <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-nrl-accent/80">
                Article
              </div>
              <div className="mt-0.5 overflow-hidden text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-white/85 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {marginModelArticle.title}
              </div>
            </div>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 bg-nrl-panel-2/60 text-sm text-nrl-text/80">
              →
            </span>
          </div>
        </Link>
      ) : null}

      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-nrl-text">Staking Calculator</h2>
        {stakingPreferencesLoading ? (
          <div className="mt-4 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-4 text-xs text-nrl-muted">
            Loading staking preferences...
          </div>
        ) : (
        <>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {STAKING_OPTIONS.map((option) => {
            const active = option.mode === stakingMode;
            const locked = !hasPremiumBettingAccess && option.mode === "kelly";
            if (locked) {
              return (
                <div
                  key={option.mode}
                  className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-left text-nrl-muted opacity-65"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide">
                    <span>{option.label}</span>
                    <span className="rounded border border-nrl-border px-1.5 py-0.5 text-[9px] text-nrl-muted">
                      Premium
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] leading-snug text-nrl-muted">{option.description}</div>
                  <BillingPageLink className="mt-2 inline-flex rounded border border-nrl-accent/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/10">
                    View plans
                  </BillingPageLink>
                </div>
              );
            }
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => handleStakingModeChange(option.mode)}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                    : "cursor-pointer border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide">
                  <span>{option.label}</span>
                </div>
                <div className="mt-1 text-[10px] leading-snug text-nrl-muted">{option.description}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">Bankroll</span>
            <input
              type="number"
              value={bankroll}
              min={0}
              step={10}
              onChange={(event) => setBankroll(Math.max(0, Number(event.target.value) || 0))}
              className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
            />
          </label>
          {stakingMode === "percentage" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">Stake %</span>
              <input
                type="number"
                value={percentageStakePct}
                min={0}
                max={100}
                step={0.1}
                onChange={(event) => setPercentageStakePct(clamp(Number(event.target.value) || 0, 0, 100))}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
          ) : null}
          {stakingMode === "targetProfit" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">Target Profit %</span>
              <input
                type="number"
                value={targetProfitPct}
                min={0}
                max={100}
                step={0.1}
                onChange={(event) => setTargetProfitPct(clamp(Number(event.target.value) || 0, 0, 100))}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
          ) : null}
          {hasPremiumBettingAccess && stakingMode === "kelly" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">Kelly Fraction</span>
              <input
                type="number"
                value={kellyScale}
                min={0}
                max={1}
                step={0.05}
                onChange={(event) => setKellyScale(clamp(Number(event.target.value) || 0, 0, 1))}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
          ) : null}
          {hasPremiumBettingAccess ? (
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-nrl-muted">Max Edge</span>
              <input
                type="number"
                value={maxEdge}
                min={0}
                max={1}
                step={0.01}
                onChange={(event) => setMaxEdge(clamp(Number(event.target.value) || 0, 0, 1))}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
              />
            </label>
          ) : null}
        </div>
        </>
        )}
      </section>

      {hasPremiumBettingAccess ? (
        <section className="overflow-hidden rounded-xl border border-nrl-border bg-[#10162f]/96 shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
          <div className="border-b border-white/8 bg-[#111936] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-nrl-text">Bet Tracker</div>
                <div className="mt-1 text-xs text-nrl-muted">
                  {bets.length} tracked {bets.length === 1 ? "bet" : "bets"}
                </div>
              </div>
              <button
                type="button"
                aria-label={trackerOpen ? "Collapse bet tracker" : "Expand bet tracker"}
                onClick={() => setTrackerOpen((open) => !open)}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-nrl-accent/45 bg-nrl-accent/10 text-sm font-bold text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/15"
              >
                <span aria-hidden="true">{trackerOpen ? "▴" : "▾"}</span>
              </button>
            </div>

            {betTrackerLoading ? (
              <div className="mt-4 rounded-md border border-white/8 bg-nrl-panel/60 px-3 py-4 text-xs text-nrl-muted">
                Loading bet tracker...
              </div>
            ) : (
              <div className="mt-5 flex items-center justify-start gap-4">
                <div className="grid place-items-center">
                  <div
                    className="grid h-28 w-28 place-items-center rounded-full p-2 sm:h-32 sm:w-32 sm:p-2.5"
                    style={{ background: roiRingBackground }}
                  >
                    <div className="grid h-full w-full place-items-center rounded-full bg-[#111936] text-center">
                      <div>
                        <div className="text-[9px] font-bold uppercase text-nrl-muted">ROI</div>
                        <div className="text-xl font-bold text-white tabular-nums">
                          {profitMargin == null ? "-" : `${profitMargin > 0 ? "+" : ""}${profitMargin.toFixed(1)}%`}
                        </div>
                        <div className="text-[9px] text-nrl-muted">{formatStakeMoney(totalStake)} staked</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-nrl-muted">Total Bankroll</div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-3xl font-bold leading-none text-white tabular-nums">{formatMoney(trackerBankroll).replace("+", "")}</span>
                    <span className="text-sm font-semibold text-nrl-muted tabular-nums">
                      ({formatStakeMoney(pendingStake)} Pending)
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-2">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Win Rate</div>
                      <div className="mt-1 text-sm font-semibold text-nrl-text tabular-nums">{winRate == null ? "-" : `${winRate.toFixed(1)}%`}</div>
                    </div>
                    <div className="rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-2">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Total Profit</div>
                      <div className={`mt-1 text-sm font-semibold tabular-nums ${profitLoss < 0 ? "text-red-300" : profitLoss > 0 ? "text-emerald-300" : "text-nrl-text"}`}>
                        {formatMoney(profitLoss)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!betTrackerLoading && bets.length >= 5 ? (
              <div className="mt-5 rounded-lg border border-white/8 bg-[#0f1732]/70 px-3 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Performance</div>
                  <div className="text-xs font-semibold text-nrl-text tabular-nums">
                    {formatMoney(profitLoss)}
                  </div>
                </div>
                <svg viewBox={`0 0 ${trackerChart.width} ${trackerChart.height}`} className="h-36 w-full overflow-visible md:h-44" preserveAspectRatio="none" role="img" aria-label="Bet tracker profit line chart">
                  <defs>
                    <linearGradient id="tracker-profit-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(0,245,138,0.22)" />
                      <stop offset="100%" stopColor="rgba(0,245,138,0)" />
                    </linearGradient>
                  </defs>
                  {trackerChart.yLabels.map(({ label, y }) => (
                    <g key={`${label}-${y}`}>
                      <text
                        x={trackerChart.chartLeft - 7}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-nrl-muted text-[8px] font-semibold"
                      >
                        {label}
                      </text>
                      <line
                        x1={trackerChart.chartLeft}
                        x2={trackerChart.chartRight}
                        y1={y}
                        y2={y}
                        stroke={Math.abs(y - trackerChart.zeroY) < 0.1 ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.14)"}
                        strokeDasharray={Math.abs(y - trackerChart.zeroY) < 0.1 ? "0" : "3 4"}
                      />
                    </g>
                  ))}
                  {[0.25, 0.5, 0.75].map((ratio) => (
                    <line
                      key={ratio}
                      x1={trackerChart.chartLeft + ((trackerChart.chartRight - trackerChart.chartLeft) * ratio)}
                      x2={trackerChart.chartLeft + ((trackerChart.chartRight - trackerChart.chartLeft) * ratio)}
                      y1={trackerChart.chartTop}
                      y2={trackerChart.chartBottom}
                      stroke="rgba(148,163,184,0.14)"
                      strokeDasharray="3 4"
                    />
                  ))}
                  <line x1={trackerChart.chartLeft} x2={trackerChart.chartLeft} y1={trackerChart.chartTop} y2={trackerChart.chartBottom} stroke="rgba(148,163,184,0.22)" />
                  <line x1={trackerChart.chartLeft} x2={trackerChart.chartRight} y1={trackerChart.chartBottom} y2={trackerChart.chartBottom} stroke="rgba(148,163,184,0.22)" />
                  <polygon points={trackerChart.areaPoints} fill="url(#tracker-profit-fill)" />
                  {trackerChart.lineSegments.map((segment, index) => (
                    <polyline
                      key={`${segment.points}-${index}`}
                      points={segment.points}
                      fill="none"
                      stroke={segment.stroke}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  <text x={trackerChart.chartLeft} y={trackerChart.height - 4} textAnchor="start" className="fill-nrl-muted text-[8px] font-semibold">Start</text>
                  <text x={trackerChart.chartRight} y={trackerChart.height - 4} textAnchor="end" className="fill-nrl-muted text-[8px] font-semibold">Latest</text>
                </svg>
              </div>
            ) : null}

            {betsError && !betTrackerLoading ? (
              <div className="mt-3 text-xs text-red-500">{betsError}</div>
            ) : null}
          </div>

          {trackerOpen && !betTrackerLoading ? (
            <div className="space-y-4 bg-[#0f1732] px-4 py-4 sm:px-5">
              {betsLoading ? (
                <div className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-4 text-xs text-nrl-muted">Loading bets...</div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setManualError(null);
                        setQuickAddOpen(true);
                      }}
                      className="cursor-pointer rounded-md border border-nrl-accent/50 bg-nrl-accent/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/15"
                    >
                      Quick Add
                    </button>
                  </div>

                  {sortedBets.length === 0 ? (
                    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/50">No bets yet.</div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {sortedBets.map((bet) => (
                          <article key={`${bet.id}-card`} className="rounded-lg border border-white/8 bg-[#14213b] p-3 shadow-[0_10px_22px_rgba(0,0,0,0.16)]">
                            <div className="flex items-center gap-3">
                              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-base font-black ${betStatusIconClass(bet.status)}`}>
                                {betStatusIconLabel(bet.status)}
                              </div>
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <BettingTeamLogos selection={bet.selection} match={bet.matchName} market={bet.market} teamLogos={teamLogos} className="h-6 w-6" />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-bold leading-tight text-white">
                                    {bet.selection}{bet.lineValue != null ? ` ${formatLineValue(bet.lineValue)}` : ""}
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] font-semibold text-nrl-muted">
                                    {bet.market} | {bet.matchName}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-nrl-muted">{formatDateLabel(bet.matchDate)}</div>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-bold text-nrl-text tabular-nums">
                                  {bet.profit == null ? "-" : formatMoney(bet.profit)}
                                </div>
                                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-nrl-muted">{bet.status}</div>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Odds</div>
                                <input
                                  type="number"
                                  min={1.01}
                                  step={0.01}
                                  defaultValue={bet.odds.toFixed(2)}
                                  onBlur={(event) => {
                                    const nextOdds = Number(event.target.value);
                                    if (!Number.isFinite(nextOdds) || nextOdds <= 1) {
                                      event.target.value = bet.odds.toFixed(2);
                                      return;
                                    }
                                    void handleUpdateBet(bet.id, { odds: nextOdds });
                                  }}
                                  className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-white outline-none focus:border-nrl-accent"
                                />
                              </div>
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Stake</div>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  defaultValue={bet.stake.toFixed(2)}
                                  onBlur={(event) => {
                                    const nextStake = Number(event.target.value);
                                    if (!Number.isFinite(nextStake) || nextStake <= 0) {
                                      event.target.value = bet.stake.toFixed(2);
                                      return;
                                    }
                                    void handleUpdateBet(bet.id, { stake: nextStake });
                                  }}
                                  className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-white outline-none focus:border-nrl-accent"
                                />
                              </div>
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Profit</div>
                                <div className="mt-1 flex h-8 items-center rounded-md border border-white/8 bg-[#0e1530] px-2 font-semibold text-nrl-text tabular-nums">
                                  {bet.profit == null ? "-" : formatMoney(bet.profit)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <select
                                value={bet.status}
                                onChange={(event) => void handleUpdateBet(bet.id, { status: event.target.value as TrackedBetStatus })}
                                className={`h-8 rounded-md border px-2 text-xs font-semibold outline-none focus:border-nrl-accent ${betStatusPillClass(bet.status)}`}
                              >
                                <option value="pending">pending</option>
                                <option value="won">won</option>
                                <option value="lost">lost</option>
                                <option value="push">push</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => void handleDeleteBet(bet.id)}
                                aria-label="Delete bet"
                                title="Delete bet"
                                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-red-500/35 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                              >
                                🗑️
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>

                    </>
                  )}
                </>
              )}
                {!userId && isLoaded ? (
                  <div className="text-[10px] text-nrl-muted">Sign in to save bets across sessions.</div>
                ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
          <div className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-3 text-sm text-nrl-muted">
            <div>Bet tracker is Premium-only.</div>
          </div>
        </section>
      )}

      {quickAddOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6">
          <div className="w-full max-w-2xl rounded-xl border border-nrl-border bg-[#10162f] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-nrl-accent">Quick Add</div>
                <div className="mt-1 text-sm font-semibold text-nrl-text">Add a bet to the tracker</div>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddOpen(false)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                aria-label="Close quick add"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Date</span>
                <input
                  type="date"
                  value={manualMatchDate}
                  onChange={(event) => setManualMatchDate(event.target.value)}
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Market</span>
                <select
                  value={selectedMarket}
                  onChange={(event) => handleMarketChange(event.target.value)}
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
                >
                  {MARKET_TABS.map((marketOption) => (
                    <option key={marketOption} value={marketOption}>{marketOption}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Match</span>
                <input
                  type="text"
                  value={manualMatchName}
                  onChange={(event) => setManualMatchName(event.target.value)}
                  placeholder="Team A vs Team B"
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Selection</span>
                <input
                  type="text"
                  value={manualSelection}
                  onChange={(event) => setManualSelection(event.target.value)}
                  placeholder="Selection"
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Odds</span>
                <input
                  type="number"
                  value={manualOdds}
                  min={1.01}
                  step={0.01}
                  onChange={(event) => setManualOdds(event.target.value)}
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Stake</span>
                <input
                  type="number"
                  value={manualStake}
                  min={0}
                  step={1}
                  onChange={(event) => setManualStake(event.target.value)}
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Status</span>
                <select
                  value={manualStatus}
                  onChange={(event) => setManualStatus(event.target.value as TrackedBetStatus)}
                  className={`h-9 rounded-md border px-2 text-xs font-semibold outline-none focus:border-nrl-accent ${betStatusPillClass(manualStatus)}`}
                >
                  <option value="pending">pending</option>
                  <option value="won">won</option>
                  <option value="lost">lost</option>
                  <option value="push">push</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Projected P/L</span>
                <div className="flex h-9 items-center rounded-md border border-white/8 bg-[#0e1530] px-2 text-xs font-semibold text-nrl-text">
                  {(() => {
                    const odds = Number(manualOdds);
                    const stake = Number(manualStake);
                    if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake <= 0) return "-";
                    const profit = computeBetProfit(manualStatus, stake, odds);
                    return profit == null ? "-" : formatMoney(profit);
                  })()}
                </div>
              </div>
            </div>

            {manualError ? (
              <div className="mt-3 text-[11px] font-semibold text-red-500">{manualError}</div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickAddOpen(false)}
                className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:border-white/20 hover:text-nrl-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const added = await handleManualAddBet();
                    if (added) setQuickAddOpen(false);
                  })();
                }}
                className="cursor-pointer rounded-md border border-nrl-accent/55 bg-nrl-accent/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-accent transition-colors hover:border-nrl-accent hover:bg-nrl-accent/15"
              >
                Add Bet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {betAddedMessage ? (
        <div className="fixed bottom-4 right-4 z-[120] rounded-md border border-nrl-accent/40 bg-nrl-panel px-3 py-2 text-xs font-semibold text-nrl-accent shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          {betAddedMessage}
        </div>
      ) : null}

      {betRemovedMessage ? (
        <div className="fixed bottom-16 right-4 z-[120] rounded-md border border-red-500/40 bg-nrl-panel px-3 py-2 text-xs font-semibold text-red-400 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          {betRemovedMessage}
        </div>
      ) : null}

      <div className="space-y-7">
        <div className="flex flex-wrap gap-2">
          {MARKET_TABS.map((tab) => {
            const active = tab === selectedMarket;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleMarketChange(tab)}
                className={`rounded-md border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                    : "cursor-pointer border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>{tab}</span>
                </span>
              </button>
            );
          })}
        </div>
        <section className="min-w-0">
          <MarketSection
            groups={selectedMarketGroups}
            canAccessPremium={hasPremiumBettingAccess}
            bankroll={bankroll}
            stakingMode={stakingMode}
            percentageStakePct={percentageStakePct}
            targetProfitPct={targetProfitPct}
            kellyScale={kellyScale}
            maxEdge={maxEdge}
            stakeOverrides={stakeOverrides}
            oddsOverrides={oddsOverrides}
            playerTeamsByName={playerTeamsByName}
            teamLogos={teamLogos}
            tryscorerFormByPlayer={tryscorerFormByPlayer}
            tryscorerKickoffsByMatch={tryscorerKickoffsByMatch}
            market={selectedMarket}
            onStakeOverride={handleStakeOverride}
            onOddsOverride={handleOddsOverride}
            onAddBet={handleAddBet}
          />
        </section>
      </div>
    </div>
  );
}

function BestBetsHero({
  modelBets,
  arbitrageBets,
  canAccessPremium,
  teamLogos,
  tryscorerKickoffsByMatch,
  onAddBet,
}: {
  modelBets: BestBetCandidate[];
  arbitrageBets: ArbitrageCandidate[];
  canAccessPremium: boolean;
  teamLogos: Record<string, string>;
  tryscorerKickoffsByMatch: Record<string, string>;
  onAddBet: (draft: BetDraft) => void | Promise<void>;
}) {
  const [category, setCategory] = useState<"model" | "arbitrage">("model");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [bestBetSlip, setBestBetSlip] = useState<{
    bet: BestBetCandidate;
    odds: number;
    stake: number;
  } | null>(null);
  const queueViewportRef = useRef<HTMLDivElement | null>(null);
  const isArbitrage = category === "arbitrage";
  const ratedModelBets = useMemo(
    () => [...modelBets].sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
      return b.edgePp - a.edgePp;
    }),
    [modelBets]
  );
  const ratedArbitrageBets = useMemo(
    () => [...arbitrageBets].sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
      return a.marketBookPct - b.marketBookPct;
    }),
    [arbitrageBets]
  );
  const activeItems = isArbitrage ? ratedArbitrageBets : ratedModelBets;
  const featuredItem = activeItems[0] ?? null;
  const queueItems = activeItems.slice(1);
  const activeTheme = isArbitrage
    ? {
        label: "Arbitrage",
        pill: "border-violet-400/40 bg-violet-500/10 text-violet-200",
        activeBorder: "border-violet-400/45",
        activeShadow: "shadow-[0_14px_30px_rgba(139,92,246,0.08)]",
        metric: "text-violet-300 drop-shadow-[0_0_10px_rgba(139,92,246,0.24)]",
      }
    : {
        label: "Model Value",
        pill: "border-nrl-accent/35 bg-nrl-accent/8 text-nrl-accent",
        activeBorder: "border-nrl-accent/35",
        activeShadow: "shadow-[0_14px_30px_rgba(0,245,138,0.06)]",
        metric: "text-nrl-accent drop-shadow-[0_0_10px_rgba(0,245,138,0.22)]",
      };
  const bestBetSlipImplied = bestBetSlip ? impliedProbability(bestBetSlip.odds) : null;
  const bestBetSlipEdgePp = bestBetSlip && bestBetSlipImplied != null
    ? (bestBetSlip.bet.modelProbability - bestBetSlipImplied) * 100
    : null;
  const canConfirmBestBetSlip = bestBetSlip != null
    && bestBetSlip.odds > 1
    && Number.isFinite(bestBetSlip.stake)
    && bestBetSlip.stake > 0;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleCategoryChange = (nextCategory: "model" | "arbitrage") => {
    setCategory(nextCategory);
    window.requestAnimationFrame(() => {
      if (queueViewportRef.current) queueViewportRef.current.scrollTop = 0;
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border border-nrl-border bg-[#10162f]/96 shadow-[0_14px_36px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-nrl-text">
          Today&apos;s Best Bets
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleCategoryChange("model")}
            className={`rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
              category === "model"
                ? "border-nrl-accent/55 bg-nrl-accent/10 text-nrl-accent"
                : "cursor-pointer border-white/10 bg-white/[0.03] text-nrl-muted hover:border-nrl-accent/35 hover:text-nrl-text"
            }`}
          >
            Model Value <span className="ml-1 text-nrl-muted">{modelBets.length}</span>
          </button>
          <button
            type="button"
            onClick={() => handleCategoryChange("arbitrage")}
            className={`rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
              category === "arbitrage"
                ? "border-violet-400/60 bg-violet-500/12 text-violet-200"
                : "cursor-pointer border-white/10 bg-white/[0.03] text-nrl-muted hover:border-violet-400/35 hover:text-nrl-text"
            }`}
          >
            Arbitrage <span className="ml-1 text-nrl-muted">{arbitrageBets.length}</span>
          </button>
        </div>
      </div>

      {activeItems.length === 0 ? (
        <div className="border-t border-white/8 px-4 py-2.5 text-sm text-nrl-muted sm:px-5">
          {isArbitrage ? "No arbitrage markets currently identified." : "No strong model value currently identified."}
        </div>
      ) : featuredItem ? (
        <div className="space-y-3 p-3">
          <article className={`rounded-lg border bg-[#14213b] px-3 py-3 sm:px-4 ${activeTheme.activeBorder} ${activeTheme.activeShadow}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-sm border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${activeTheme.pill}`}>
                    {activeTheme.label}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                    {isArbitrage ? "H2H" : (featuredItem as BestBetCandidate).market}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                    {formatEventCountdown(featuredItem, tryscorerKickoffsByMatch, nowMs)}
                  </span>
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-2 text-xl font-semibold leading-tight text-white sm:text-2xl">
                  {isArbitrage ? (
                    <MatchLogoCluster match={(featuredItem as ArbitrageCandidate).match} teamLogos={teamLogos} className="h-7 w-7" />
                  ) : (
                    <BettingTeamLogos
                      selection={(featuredItem as BestBetCandidate).selection}
                      match={(featuredItem as BestBetCandidate).match}
                      market={(featuredItem as BestBetCandidate).market}
                      teamLogos={teamLogos}
                      className="h-7 w-7"
                    />
                  )}
                  <span className="min-w-0 truncate">
                    {isArbitrage ? (featuredItem as ArbitrageCandidate).match : (featuredItem as BestBetCandidate).selectionLabel}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-nrl-muted">
                  {isArbitrage
                    ? `Market book ${formatPct((featuredItem as ArbitrageCandidate).marketBookPct)}`
                    : (featuredItem as BestBetCandidate).match}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {!isArbitrage ? (
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                    Score <span className="text-nrl-text">{formatBestBetScore((featuredItem as BestBetCandidate).score)}</span>
                  </div>
                ) : null}
                <div className={`text-3xl font-bold leading-none sm:text-4xl ${activeTheme.metric}`}>
                  {isArbitrage
                    ? `+${(featuredItem as ArbitrageCandidate).returnPct.toFixed(2)}%`
                    : `+${(featuredItem as BestBetCandidate).edgePp.toFixed(2)}%`}
                </div>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                  {isArbitrage ? "return" : "edge"}
                </div>
              </div>
            </div>

            {isArbitrage ? (
              <div className="mt-3 border-t border-white/8 pt-3">
                <div className="grid gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Total stake</div>
                    <div className="mt-0.5 text-base font-semibold text-white">
                      {formatStakeMoney((featuredItem as ArbitrageCandidate).totalStake)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Matched payout</div>
                    <div className="mt-0.5 text-base font-semibold text-white">
                      {formatStakeMoney((featuredItem as ArbitrageCandidate).targetPayout)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Locked profit</div>
                    <div className="mt-0.5 text-base font-semibold text-violet-200">
                      {formatMoney((featuredItem as ArbitrageCandidate).profit)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {(featuredItem as ArbitrageCandidate).stakes.map((stake) => (
                    <div
                      key={`${(featuredItem as ArbitrageCandidate).id}-${stake.selection}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <BettingTeamLogos
                            selection={stake.selection}
                            match={(featuredItem as ArbitrageCandidate).match}
                            market={(featuredItem as ArbitrageCandidate).market}
                            teamLogos={teamLogos}
                            className="h-4 w-4"
                          />
                          <div className="truncate font-semibold text-white">{stake.selectionLabel}</div>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-nrl-muted">
                          {stake.bookies.slice(0, 2).map((bookie) => (
                            <BookieLogo key={`${stake.selection}-${bookie}`} bookie={bookie} compact />
                          ))}
                          <span>{formatPrice(stake.odds)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Stake</div>
                        <div className="font-semibold text-white">{formatStakeMoney(stake.stake)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 pt-3 text-xs">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Best odds</div>
                    <div className="mt-0.5 flex items-center gap-2 text-white">
                      <div className="flex items-center gap-1">
                        {(featuredItem as BestBetCandidate).bestBookies.slice(0, 3).map((bookie) => (
                          <BookieLogo key={`${(featuredItem as BestBetCandidate).id}-${bookie}`} bookie={bookie} compact />
                        ))}
                      </div>
                      <span className="text-base font-bold">{formatPrice((featuredItem as BestBetCandidate).odds)}</span>
                      {(featuredItem as BestBetCandidate).bestBookieCount > 3 ? (
                        <span className="text-[10px] text-nrl-muted">+{(featuredItem as BestBetCandidate).bestBookieCount - 3} books</span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Model / implied</div>
                    <div className="mt-0.5 font-semibold text-nrl-text">
                      <span className="text-white">{formatPct((featuredItem as BestBetCandidate).modelProbability * 100)}</span>
                      <span className="mx-1.5 text-nrl-muted">vs</span>
                      <span>{formatPct((featuredItem as BestBetCandidate).impliedProbability * 100)}</span>
                    </div>
                  </div>
                </div>

                {(featuredItem as BestBetCandidate).marketEfficiencyPct != null ? (
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-nrl-muted">
                    Market {formatPct((featuredItem as BestBetCandidate).marketEfficiencyPct)}
                  </div>
                ) : null}

                {canAccessPremium ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const bet = featuredItem as BestBetCandidate;
                        setBestBetSlip({
                          bet,
                          odds: bet.odds,
                          stake: bet.kellyStake,
                        });
                      }}
                      className="w-full cursor-pointer rounded-md border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-nrl-text transition-colors hover:border-nrl-accent/55 hover:bg-nrl-accent/10 hover:text-nrl-accent"
                    >
                      Add To Bet Tracker
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </article>

          {queueItems.length > 0 ? (
            <div>
              <div className="relative rounded-lg border border-white/8 bg-[#0f1732]/70">
                <div
                  ref={queueViewportRef}
                  className={`max-h-[176px] space-y-1.5 overflow-y-auto overscroll-contain p-2 pr-1 [scrollbar-color:rgba(148,163,184,0.32)_transparent] ${!canAccessPremium ? "pointer-events-none select-none blur-[5px]" : ""}`}
                >
                {queueItems.map((item) => {
                  const isLocked = !canAccessPremium;
                  const rowContent = (
                    <div className={`flex min-h-[38px] items-center justify-between gap-3 rounded-md border border-white/8 bg-nrl-panel/72 px-2.5 py-1.5 text-left transition-colors ${canAccessPremium ? "hover:border-white/20" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-sm border px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] ${activeTheme.pill}`}>
                            {isLocked ? "Premium" : activeTheme.label}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                            {isArbitrage ? "H2H" : isLocked ? "Locked" : (item as BestBetCandidate).market}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                            {formatEventCountdown(item, tryscorerKickoffsByMatch, nowMs)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-white">
                          {!isLocked && isArbitrage ? (
                            <MatchLogoCluster match={(item as ArbitrageCandidate).match} teamLogos={teamLogos} className="h-4 w-4" />
                          ) : !isLocked ? (
                            <BettingTeamLogos
                              selection={(item as BestBetCandidate).selection}
                              match={(item as BestBetCandidate).match}
                              market={(item as BestBetCandidate).market}
                              teamLogos={teamLogos}
                              className="h-4 w-4"
                            />
                          ) : null}
                          <span className="truncate">
                          {isLocked
                            ? "Selection hidden"
                            : isArbitrage
                              ? (item as ArbitrageCandidate).match
                              : (item as BestBetCandidate).selectionLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-semibold text-nrl-muted">
                          {isLocked ? (
                            <span>Odds hidden</span>
                          ) : isArbitrage ? (
                            <>
                              {(item as ArbitrageCandidate).stakes.slice(0, 2).map((stake) => (
                                <span key={`${item.id}-${stake.selection}`} className="inline-flex items-center gap-0.5">
                                  {stake.bookies.slice(0, 1).map((bookie) => (
                                    <BookieLogo key={`${item.id}-${stake.selection}-${bookie}`} bookie={bookie} compact />
                                  ))}
                                  <span>{formatPrice(stake.odds)}</span>
                                </span>
                              ))}
                            </>
                          ) : (
                            <>
                              {(item as BestBetCandidate).bestBookies.slice(0, 2).map((bookie) => (
                                <BookieLogo key={`${item.id}-${bookie}`} bookie={bookie} compact />
                              ))}
                              <span className="text-nrl-text">{formatPrice((item as BestBetCandidate).odds)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {!isLocked && !isArbitrage ? (
                          <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                            {formatBestBetScore((item as BestBetCandidate).score)}
                          </div>
                        ) : null}
                        <div className={`text-base font-bold leading-none ${isLocked ? "text-nrl-muted" : activeTheme.metric}`}>
                          {isLocked
                            ? isArbitrage ? "ARB" : "+EV"
                            : isArbitrage
                              ? `+${(item as ArbitrageCandidate).returnPct.toFixed(2)}%`
                              : `+${(item as BestBetCandidate).edgePp.toFixed(2)}%`}
                        </div>
                        <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                          {isArbitrage ? "return" : "edge"}
                        </div>
                      </div>
                    </div>
                  );

                  return isLocked ? (
                    <div key={item.id} className="relative overflow-hidden rounded-md">
                      {rowContent}
                    </div>
                  ) : (
                    <div key={item.id} className="block w-full">
                      {rowContent}
                    </div>
                  );
                })}
                </div>
                {!canAccessPremium ? (
                  <div className="absolute inset-0 z-10 grid place-items-center bg-[#080d1f]/30 px-3 backdrop-blur-[1px]">
                    <BillingPageLink className="rounded-xl bg-[linear-gradient(135deg,rgba(141,99,255,0.95),rgba(0,245,138,0.95))] p-[1px] shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]">
                      <div className="rounded-[calc(0.75rem-1px)] bg-slate-950/85 px-4 py-2 text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                          Sign Up To Premium
                        </div>
                      </div>
                    </BillingPageLink>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {bestBetSlip ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6">
          <div className="w-full max-w-md rounded-xl border border-nrl-border bg-[#10162f] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-nrl-accent">
                  Add To Bet Tracker
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-semibold text-nrl-text">
                  <BettingTeamLogos
                    selection={bestBetSlip.bet.selection}
                    match={bestBetSlip.bet.match}
                    market={bestBetSlip.bet.market}
                    teamLogos={teamLogos}
                    className="h-5 w-5"
                  />
                  <span className="truncate">{bestBetSlip.bet.selectionLabel}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-nrl-muted">{bestBetSlip.bet.match}</div>
              </div>
              <button
                type="button"
                onClick={() => setBestBetSlip(null)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                aria-label="Close bet slip"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Odds</span>
                <input
                  type="number"
                  min={1.01}
                  step={0.01}
                  value={Number.isFinite(bestBetSlip.odds) ? bestBetSlip.odds : ""}
                  onChange={(event) => {
                    const nextOdds = Number(event.target.value);
                    setBestBetSlip((current) => current ? {
                      ...current,
                      odds: Number.isFinite(nextOdds) ? nextOdds : 0,
                    } : current);
                  }}
                  className="mt-1 w-full rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Stake</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(bestBetSlip.stake) ? bestBetSlip.stake : 0}
                  onChange={(event) => {
                    const nextStake = Math.max(0, Number(event.target.value) || 0);
                    setBestBetSlip((current) => current ? { ...current, stake: nextStake } : current);
                  }}
                  className="mt-1 w-full rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Implied</div>
                <div className="mt-0.5 font-semibold text-nrl-text">{formatPct(bestBetSlipImplied == null ? null : bestBetSlipImplied * 100)}</div>
              </div>
              <div className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Edge</div>
                <div className="mt-0.5 font-semibold text-nrl-accent">
                  {bestBetSlipEdgePp == null ? "-" : `${bestBetSlipEdgePp >= 0 ? "+" : ""}${bestBetSlipEdgePp.toFixed(2)}`}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBestBetSlip(null)}
                className="cursor-pointer rounded-md border border-nrl-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirmBestBetSlip}
                onClick={() => {
                  if (!bestBetSlip || !canConfirmBestBetSlip) return;
                  void onAddBet({
                    market: bestBetSlip.bet.market,
                    matchDate: bestBetSlip.bet.date,
                    matchName: bestBetSlip.bet.match,
                    selection: bestBetSlip.bet.selection,
                    lineValue: bestBetSlip.bet.lineValue,
                    odds: bestBetSlip.odds,
                    stake: bestBetSlip.stake,
                    modelProb: bestBetSlip.bet.modelProbability,
                    impliedProb: bestBetSlipImplied,
                    edgePp: bestBetSlipEdgePp,
                  });
                  setBestBetSlip(null);
                }}
                className={`rounded-md border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  canConfirmBestBetSlip
                    ? "cursor-pointer border-nrl-accent bg-nrl-accent/15 text-nrl-accent hover:bg-nrl-accent/25"
                    : "cursor-not-allowed border-nrl-border text-nrl-muted opacity-60"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MarketSection({
  groups,
  canAccessPremium,
  bankroll,
  stakingMode,
  percentageStakePct,
  targetProfitPct,
  kellyScale,
  maxEdge,
  stakeOverrides,
  oddsOverrides,
  playerTeamsByName,
  teamLogos,
  tryscorerFormByPlayer,
  tryscorerKickoffsByMatch,
  market,
  onStakeOverride,
  onOddsOverride,
  onAddBet,
}: {
  groups: EventGroup[];
  canAccessPremium: boolean;
  bankroll?: number;
  stakingMode: StakingMode;
  percentageStakePct?: number;
  targetProfitPct?: number;
  kellyScale?: number;
  maxEdge?: number;
  stakeOverrides: Record<string, number>;
  oddsOverrides: Record<string, number>;
  playerTeamsByName: Map<string, string>;
  teamLogos: Record<string, string>;
  tryscorerFormByPlayer: Record<string, TryscorerFormSummary>;
  tryscorerKickoffsByMatch: Record<string, string>;
  market: BettingMarket;
  onStakeOverride: (key: string, value: number) => void;
  onOddsOverride: (key: string, value: number) => void;
  onAddBet: (draft: BetDraft) => void | Promise<void>;
}) {
  const [tryscorerValueByGroup, setTryscorerValueByGroup] = useState<Record<string, number>>({});
  const [collapsedTryscorerGroups, setCollapsedTryscorerGroups] = useState<Record<string, boolean>>({});
  const [mobileBetSlip, setMobileBetSlip] = useState<MobileBetSlip | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeGroups = groups
    .filter((group) => {
      if (group.market !== "Tryscorer") return true;
      const kickoffKey = buildMatchKickoffKey(group.date, group.match);
      const kickoff = kickoffKey ? tryscorerKickoffsByMatch[kickoffKey] : null;
      if (!kickoff) {
        const groupDateMs = Date.parse(`${group.date}T23:59:59`);
        return !Number.isFinite(groupDateMs) || nowMs <= groupDateMs;
      }
      const kickoffMs = Date.parse(kickoff);
      return !Number.isFinite(kickoffMs) || nowMs < kickoffMs + 5 * 60 * 1000;
    })
    .sort((a, b) => compareGroupsByKickoff(a, b, tryscorerKickoffsByMatch));

  if (activeGroups.length === 0) {
    return (
      <div>
        <p className="mt-2 text-sm text-nrl-muted">
          {market === "Tryscorer" ? "No try scorer markets available." : "No odds found."}
        </p>
      </div>
    );
  }

  const groupsByDate = activeGroups.reduce((acc, group) => {
    const existing = acc.get(group.date);
    if (existing) {
      existing.push(group);
      return acc;
    }
    acc.set(group.date, [group]);
    return acc;
  }, new Map<string, EventGroup[]>());
  const mobileSlipImplied = mobileBetSlip ? impliedProbability(mobileBetSlip.odds) : null;
  const mobileSlipEdgePp = mobileBetSlip?.modelProb != null && mobileSlipImplied != null
    ? (mobileBetSlip.modelProb - mobileSlipImplied) * 100
    : null;
  const canConfirmMobileSlip = mobileBetSlip != null
    && mobileBetSlip.odds > 1
    && Number.isFinite(mobileBetSlip.stake)
    && mobileBetSlip.stake > 0;

  return (
    <div className="space-y-7">
      {[...groupsByDate.entries()].map(([date, dateGroups]) => (
        <section key={date} className="space-y-7 rounded-xl border border-nrl-border bg-nrl-panel p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-sm font-bold uppercase tracking-[0.12em] text-nrl-accent sm:text-base">
              {formatDateLabel(date)}
            </h2>
            <div className="h-px flex-1 bg-nrl-border/70" />
          </div>
          {dateGroups.map((group, groupIndex) => {
            const { home, away } = parseMatch(group.match);
            const showModelColumns = group.market !== "Tryscorer";
            const blurPremiumColumns = !canAccessPremium && showModelColumns;
            const collapsed = group.market === "Tryscorer" && collapsedTryscorerGroups[group.key] === true;
            const selectedTryscorerValue = tryscorerValueByGroup[group.key] ?? 1;
            const visibleOutcomes = group.market === "Tryscorer"
              ? group.outcomes.filter((row) => row.bestValueComputed === selectedTryscorerValue)
              : group.outcomes;
            const visibleBookieColumns = BETTING_BOOKIE_COLUMNS.filter((bookie) =>
              visibleOutcomes.some((row) => row.bookieOffers[bookie] != null)
            );
            return (
              <article
                key={group.key}
                className={`${groupIndex === 0 ? "" : "border-t border-nrl-border/70 pt-8"} md:rounded-xl md:border md:border-nrl-border md:bg-nrl-panel-2/35 md:p-4`}
              >
                <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-nrl-text sm:text-lg">
                      <TeamNameWithLogo name={home} teamLogos={teamLogos} logoClassName="h-5 w-5 sm:h-6 sm:w-6" />
                      {away ? (
                        <>
                          <span className="text-nrl-muted">vs</span>
                          <TeamNameWithLogo name={away} teamLogos={teamLogos} logoClassName="h-5 w-5 sm:h-6 sm:w-6" />
                        </>
                      ) : null}
                    </div>
                    <div className="text-xs text-nrl-muted">{group.market}</div>
                  </div>
                  {group.market === "Tryscorer" ? (
                    <button
                      type="button"
                      aria-label={collapsed ? "Expand game" : "Collapse game"}
                      onClick={() => setCollapsedTryscorerGroups((current) => ({
                        ...current,
                        [group.key]: !current[group.key],
                      }))}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                    >
                      <span aria-hidden="true">{collapsed ? "▾" : "▴"}</span>
                    </button>
                  ) : group.marketPctFromBest != null ? (
                    <div className="text-xs text-nrl-muted">
                      Best-book market %:{" "}
                      <span className="font-semibold text-nrl-text">{formatPct(group.marketPctFromBest)}</span>
                    </div>
                  ) : null}
                </div>
                {group.market === "Tryscorer" ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[1, 2, 3].map((value) => {
                      const active = selectedTryscorerValue === value;
                      const hasRows = group.outcomes.some((row) => row.bestValueComputed === value);
                      return (
                        <button
                          key={`${group.key}-try-${value}`}
                          type="button"
                          disabled={!hasRows}
                          onClick={() => setTryscorerValueByGroup((current) => ({ ...current, [group.key]: value }))}
                          className={`rounded-md border px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                            active
                              ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                              : hasRows
                                ? "cursor-pointer border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
                                : "cursor-not-allowed border-nrl-border bg-nrl-panel-2 text-nrl-muted opacity-45"
                          }`}
                        >
                          {value}+
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {collapsed ? null : (
                  <>
                    <div className="space-y-3 md:hidden">
                  {visibleOutcomes.length === 0 ? (
                    <div className="rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-4 text-sm text-nrl-muted">
                      No odds found for {selectedTryscorerValue}+.
                    </div>
                  ) : visibleOutcomes.map((row) => {
                    const betRowKey = `${group.date}|${group.match}|${group.market}|${row.result}|${row.bestValueComputed ?? ""}`;
                    const oddsValue = oddsOverrides[betRowKey] ?? row.bestPriceComputed;
                    const implied = impliedProbability(oddsValue);
                    const modelProbability = showModelColumns
                      ? modelPercentToProbability(row.bestModelComputed)
                      : null;
                    const edgeDecimal = modelProbability != null && implied != null
                      ? modelProbability - implied
                      : null;
                    const edgePp = edgeDecimal == null ? null : edgeDecimal * 100;
                    const hasPositiveEdge = edgeDecimal != null && edgeDecimal > 0;
                    const overEdgeCliff = edgeDecimal != null && edgeDecimal > (maxEdge ?? 0.06);
                    const bankrollValue = bankroll ?? 0;
                    const percentageStakeDecimal = clamp((percentageStakePct ?? 0) / 100, 0, 1);
                    const targetProfitDecimal = clamp((targetProfitPct ?? 0) / 100, 0, 1);
                    const fullKelly = modelProbability != null && oddsValue != null
                      ? kellyFraction(modelProbability, oddsValue)
                      : null;
                    let scaledStake: number | null = null;
                    if (!canAccessPremium && oddsValue != null && oddsValue > 1) {
                      if (stakingMode === "percentage") {
                        scaledStake = bankrollValue * percentageStakeDecimal;
                      } else if (stakingMode === "targetProfit") {
                        scaledStake = (bankrollValue * targetProfitDecimal) / (oddsValue - 1);
                      }
                    } else if (!showModelColumns && oddsValue != null && oddsValue > 1) {
                      if (stakingMode === "percentage") {
                        scaledStake = bankrollValue * percentageStakeDecimal;
                      } else if (stakingMode === "targetProfit") {
                        scaledStake = (bankrollValue * targetProfitDecimal) / (oddsValue - 1);
                      }
                    } else if (modelProbability != null && oddsValue != null && oddsValue > 1) {
                      if (!hasPositiveEdge || overEdgeCliff) {
                        scaledStake = 0;
                      } else if (stakingMode === "percentage") {
                        scaledStake = bankrollValue * percentageStakeDecimal;
                      } else if (stakingMode === "targetProfit") {
                        scaledStake = (bankrollValue * targetProfitDecimal) / (oddsValue - 1);
                      } else if (fullKelly != null) {
                        scaledStake = bankrollValue * fullKelly * (kellyScale ?? 0);
                      }
                    }
                    const edgeClass =
                      !canAccessPremium
                        ? "text-nrl-text"
                        : edgePp == null
                        ? "text-nrl-text"
                        : edgePp < 0
                          ? "text-red-500"
                          : overEdgeCliff
                            ? "text-orange-500"
                            : "text-nrl-accent";
                    const recommendedStake = Math.max(0, Math.round(scaledStake ?? 0));
                    const stakeValue = stakeOverrides[betRowKey] ?? recommendedStake;
                    const canOpenMobileBet = oddsValue != null
                      && oddsValue > 1
                      && (!showModelColumns || modelProbability != null);
                    const tryscorerForm = group.market === "Tryscorer"
                      ? tryscorerFormByPlayer[normaliseLookupKey(row.result)] ?? null
                      : null;
                    const playerTeam = group.market === "Tryscorer"
                      ? tryscorerForm?.team ?? playerTeamsByName.get(normaliseLookupKey(row.result)) ?? null
                      : null;
                    const outcomeLogoTeam = group.market === "Tryscorer" ? playerTeam : row.result;

                    return (
                      <div key={`${group.key}-mobile-${row.result}-${row.bestValueComputed ?? ""}`} className="border-t border-nrl-border/60 py-4 first:border-t-0 first:pt-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-1.5">
                            <TeamLogoImage teamName={outcomeLogoTeam} teamLogos={teamLogos} className="mt-0.5 h-4 w-4" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-nrl-text">{row.result}</div>
                              <TryscorerForm form={tryscorerForm} />
                            </div>
                          </div>
                          {canAccessPremium ? (
                            <button
                              type="button"
                              disabled={!canOpenMobileBet}
                              aria-label="Add bet"
                              onClick={() => {
                                if (!canOpenMobileBet || oddsValue == null) return;
                                setMobileBetSlip({
                                  key: betRowKey,
                                  date: group.date,
                                  match: group.match,
                                  market: group.market,
                                  selection: row.result,
                                  lineValue: row.bestValueComputed,
                                  odds: oddsValue,
                                  stake: stakeValue,
                                  modelProb: modelProbability,
                                });
                              }}
                              className={`shrink-0 rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${
                                canOpenMobileBet
                                  ? "cursor-pointer border-nrl-accent/60 bg-nrl-accent/12 text-nrl-accent hover:bg-nrl-accent/20"
                                  : "cursor-not-allowed border-nrl-border text-nrl-muted opacity-60"
                              }`}
                            >
                              +
                            </button>
                          ) : (
                            <BillingPageLink className="shrink-0 rounded border border-nrl-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted opacity-75 transition-colors hover:border-nrl-accent hover:text-nrl-text">
                              Locked
                            </BillingPageLink>
                          )}
                        </div>

                        <div
                          className="mt-3 grid items-stretch gap-1.5 text-[11px]"
                          style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleBookieColumns.length)}, minmax(0, 1fr))` }}
                        >
                          {visibleBookieColumns.map((bookie) => {
                            const offer = row.bookieOffers[bookie];
                            const isBest = offer != null
                              && row.bestBookiesComputed.includes(bookie)
                              && row.bestPriceComputed === offer.price
                              && row.bestValueComputed === offer.value;
                            return (
                              <div
                                key={`${group.key}-mobile-${row.result}-${bookie}`}
                                className={`flex min-h-[34px] min-w-0 flex-col justify-center gap-1 rounded px-1.5 py-1 ${
                                  isBest ? "bg-nrl-accent/12 text-nrl-accent" : "text-nrl-text"
                                }`}
                              >
                                <div className="flex h-4 items-center opacity-90">
                                  <BookieLogo bookie={bookie} compact />
                                </div>
                                <div className="truncate text-xs font-semibold leading-none tabular-nums">
                                  {offer == null ? "-" : formatPrice(offer.price)}
                                </div>
                                {offer != null && (group.market === "Line" || group.market === "Total") && offer.value != null ? (
                                  <div className="truncate text-[9px] leading-none text-nrl-muted tabular-nums">{formatLineValue(offer.value)}</div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <div className={`mt-3 grid ${showModelColumns ? "grid-cols-4" : "grid-cols-2"} gap-x-3 gap-y-2 text-[10px]`}>
                          <div className="min-w-0">
                            <div className="font-bold uppercase tracking-[0.08em] text-nrl-muted">Best</div>
                            <div className="mt-1 truncate text-xs font-bold leading-none text-nrl-accent tabular-nums">
                              {formatPrice(row.bestPriceComputed)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold uppercase tracking-[0.08em] text-nrl-muted">Imp</div>
                            <div className="mt-1 truncate text-xs font-semibold leading-none text-nrl-text tabular-nums">{formatPct(implied == null ? null : implied * 100)}</div>
                          </div>
                          {showModelColumns ? (
                            <>
                              <div className="min-w-0">
                                <div className="font-bold uppercase tracking-[0.08em] text-nrl-muted">Model</div>
                                <div className="mt-1 truncate text-xs font-semibold leading-none text-nrl-text tabular-nums">
                                  <span className={blurPremiumColumns ? "inline-block blur-[4px] select-none" : ""}>
                                    {formatPct(modelProbability == null ? null : modelProbability * 100)}
                                  </span>
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold uppercase tracking-[0.08em] text-nrl-muted">Edge</div>
                                <div className={`mt-1 truncate text-xs font-semibold leading-none tabular-nums ${edgeClass}`}>
                                  <span className={blurPremiumColumns ? "inline-block blur-[4px] select-none" : ""}>
                                    {edgePp == null ? "-" : `${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(2)}`}
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>

                      </div>
                    );
                  })}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                  <table className={`${group.market === "Tryscorer" ? "w-auto min-w-max lg:w-full lg:min-w-[1100px]" : "w-full min-w-[1000px]"} border-collapse text-xs`}>
                    <thead>
                      <tr className="border-b border-nrl-border text-left text-nrl-muted">
                        <th className={`${group.market === "Tryscorer" ? "whitespace-nowrap pr-6 lg:w-[330px]" : "pr-3"} py-2 font-semibold`}>Outcome</th>
                        {visibleBookieColumns.map((bookie, bookieIndex) => (
                          <th
                            key={`${group.key}-head-${bookie}`}
                            className={`py-2 pr-3 font-semibold ${group.market === "Tryscorer" && bookieIndex === 0 ? "pl-5" : ""}`}
                          >
                            <BookieLogo bookie={bookie} />
                          </th>
                        ))}
                        <th className="py-2 pr-3 font-semibold">Best</th>
                        <th className="py-2 pr-3 font-semibold">Implied</th>
                        {showModelColumns ? (
                          <>
                            <th className="py-2 pr-3 font-semibold">Model</th>
                            <th className="py-2 pr-3 font-semibold">Edge</th>
                          </>
                        ) : null}
                        <th className="py-2 pr-3 font-semibold">Odds</th>
                        <th className="py-2 pr-0 font-semibold">Stake</th>
                        <th className="py-2 pl-3 pr-0 font-semibold">Bet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOutcomes.length === 0 ? (
                        <tr>
                          <td
                            colSpan={visibleBookieColumns.length + (showModelColumns ? 8 : 6)}
                            className="py-4 text-sm text-nrl-muted"
                          >
                            No odds found for {selectedTryscorerValue}+.
                          </td>
                        </tr>
                      ) : visibleOutcomes.map((row) => {
                        const betRowKey = `${group.date}|${group.match}|${group.market}|${row.result}|${row.bestValueComputed ?? ""}`;
                        const oddsValue = oddsOverrides[betRowKey] ?? row.bestPriceComputed;
                        const implied = impliedProbability(oddsValue);
                        const supabaseModelProbability = showModelColumns
                          ? modelPercentToProbability(row.bestModelComputed)
                          : null;
                        const modelProbability = supabaseModelProbability;
                        const edgeDecimal = modelProbability != null && implied != null
                          ? modelProbability - implied
                          : null;
                        const edgePp = edgeDecimal == null ? null : edgeDecimal * 100;
                        const hasPositiveEdge = edgeDecimal != null && edgeDecimal > 0;
                        const overEdgeCliff = edgeDecimal != null && edgeDecimal > (maxEdge ?? 0.06);
                        const bankrollValue = bankroll ?? 0;
                        const percentageStakeDecimal = clamp((percentageStakePct ?? 0) / 100, 0, 1);
                        const targetProfitDecimal = clamp((targetProfitPct ?? 0) / 100, 0, 1);
                        const fullKelly = modelProbability != null && oddsValue != null
                          ? kellyFraction(modelProbability, oddsValue)
                          : null;
                        let scaledStake: number | null = null;
                        if (!canAccessPremium && oddsValue != null && oddsValue > 1) {
                          if (stakingMode === "percentage") {
                            scaledStake = bankrollValue * percentageStakeDecimal;
                          } else if (stakingMode === "targetProfit") {
                            scaledStake = (bankrollValue * targetProfitDecimal) / (oddsValue - 1);
                          }
                        } else if (!showModelColumns && oddsValue != null && oddsValue > 1) {
                          if (stakingMode === "percentage") {
                            scaledStake = bankrollValue * percentageStakeDecimal;
                          } else if (stakingMode === "targetProfit") {
                            scaledStake = (bankrollValue * targetProfitDecimal) / (oddsValue - 1);
                          }
                        } else if (modelProbability != null && oddsValue != null && oddsValue > 1) {
                          if (!hasPositiveEdge || overEdgeCliff) {
                            scaledStake = 0;
                          } else if (stakingMode === "percentage") {
                            scaledStake = bankrollValue * percentageStakeDecimal;
                          } else if (stakingMode === "targetProfit") {
                            scaledStake = (bankrollValue * targetProfitDecimal) / (oddsValue - 1);
                          } else if (fullKelly != null) {
                            scaledStake = bankrollValue * fullKelly * (kellyScale ?? 0);
                          }
                        }
                        const edgeClass =
                          !canAccessPremium
                            ? "text-nrl-text"
                            : edgePp == null
                            ? "text-nrl-text"
                            : edgePp < 0
                              ? "text-red-500"
                              : overEdgeCliff
                                ? "text-orange-500"
                                : "text-nrl-accent";
                        const outcomeLabel = row.result;
                        const recommendedStake = Math.max(0, Math.round(scaledStake ?? 0));
                        const stakeValue = stakeOverrides[betRowKey] ?? recommendedStake;
                        const canPlaceBet = canAccessPremium
                          && (!showModelColumns || modelProbability != null)
                          && implied != null
                          && oddsValue != null
                          && oddsValue > 1
                          && Number.isFinite(stakeValue)
                          && stakeValue > 0;
                        const tryscorerForm = group.market === "Tryscorer"
                          ? tryscorerFormByPlayer[normaliseLookupKey(row.result)] ?? null
                          : null;
                        const playerTeam = group.market === "Tryscorer"
                          ? tryscorerForm?.team ?? playerTeamsByName.get(normaliseLookupKey(row.result)) ?? null
                          : null;
                        const outcomeLogoTeam = group.market === "Tryscorer" ? playerTeam : row.result;

                        return (
                          <tr key={`${group.key}-${row.result}-${row.bestValueComputed ?? ""}`} className="border-b border-nrl-border/50">
                            <td className="py-2 pr-3 font-medium text-nrl-text">
                              <span className="inline-flex min-w-0 items-center gap-2">
                                <TeamLogoImage teamName={outcomeLogoTeam} teamLogos={teamLogos} />
                                <span className="min-w-0">
                                  <span className="block whitespace-nowrap">{outcomeLabel}</span>
                                  <TryscorerForm form={tryscorerForm} />
                                </span>
                              </span>
                            </td>
                            {visibleBookieColumns.map((bookie, bookieIndex) => {
                              const offer = row.bookieOffers[bookie];
                              const isBest = offer != null
                                && row.bestBookiesComputed.includes(bookie)
                                && row.bestPriceComputed === offer.price
                                && row.bestValueComputed === offer.value;
                              return (
                                <td
                                  key={`${group.key}-${row.result}-${bookie}`}
                                  className={`py-2 pr-3 ${group.market === "Tryscorer" && bookieIndex === 0 ? "pl-5" : ""} ${isBest ? "font-semibold text-nrl-accent" : "text-nrl-text"}`}
                                >
                                  {offer == null ? "-" : (
                                    <div className="leading-tight">
                                      <div>{formatPrice(offer.price)}</div>
                                      {(group.market === "Line" || group.market === "Total") && offer.value != null ? (
                                        <div className="text-[10px] text-nrl-muted">
                                          {formatLineValue(offer.value)}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-2 pr-3 text-nrl-text">
                              <div className="flex items-center gap-2">
                                <div className="leading-tight">
                                  <div>{formatPrice(row.bestPriceComputed)}</div>
                                  {(group.market === "Line" || group.market === "Total") && row.bestValueComputed != null ? (
                                    <div className="text-[10px] text-nrl-muted">
                                      {formatLineValue(row.bestValueComputed)}
                                    </div>
                                  ) : null}
                                </div>
                                {row.bestBookiesComputed.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {row.bestBookiesComputed.map((bookie) => (
                                      <BookieLogo
                                        key={`${group.key}-${row.result}-best-${bookie}`}
                                        bookie={bookie}
                                        compact
                                      />
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-nrl-text">{formatPct(implied == null ? null : implied * 100)}</td>
                            {showModelColumns ? (
                              <>
                                <td className="py-2 pr-3 text-nrl-text">
                                  <span className={blurPremiumColumns ? "inline-block blur-[4px] select-none" : ""}>
                                    {formatPct(modelProbability == null ? null : modelProbability * 100)}
                                  </span>
                                </td>
                                <td className={`py-2 pr-3 ${edgeClass}`}>
                                  <span className={blurPremiumColumns ? "inline-block blur-[4px] select-none" : ""}>
                                    {edgePp == null ? "-" : `${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(2)}`}
                                  </span>
                                </td>
                              </>
                            ) : null}
                            <td className="py-2 pr-3 text-nrl-text">
                              <input
                                type="number"
                                min={1.01}
                                step={0.01}
                                value={oddsValue == null || !Number.isFinite(oddsValue) ? "" : oddsValue}
                                onChange={(event) => onOddsOverride(betRowKey, Number(event.target.value))}
                                onBlur={(event) => {
                                  const nextOdds = Number(event.target.value);
                                  if (Number.isFinite(nextOdds) && nextOdds > 1) return;
                                  onOddsOverride(betRowKey, row.bestPriceComputed ?? 0);
                                }}
                                className="w-20 rounded border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                              />
                            </td>
                            <td className="py-2 pr-0 text-nrl-text">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={Number.isFinite(stakeValue) ? stakeValue : 0}
                                onChange={(event) => onStakeOverride(betRowKey, Math.max(0, Number(event.target.value) || 0))}
                                className="w-20 rounded border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                              />
                            </td>
                            <td className="py-2 pl-3 pr-0">
                              {canAccessPremium ? (
                                <button
                                  type="button"
                                  disabled={!canPlaceBet}
                                  onClick={() => {
                                    if (!canPlaceBet || oddsValue == null) return;
                                    void onAddBet({
                                      market: group.market,
                                      matchDate: group.date,
                                      matchName: group.match,
                                      selection: row.result,
                                      lineValue: row.bestValueComputed,
                                      odds: oddsValue,
                                      stake: stakeValue,
                                      modelProb: modelProbability,
                                      impliedProb: implied,
                                      edgePp,
                                    });
                                  }}
                                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                    canPlaceBet
                                      ? "cursor-pointer border-nrl-accent bg-nrl-accent/15 text-nrl-accent hover:bg-nrl-accent/25"
                                      : "cursor-not-allowed border-nrl-border text-nrl-muted opacity-60"
                                  }`}
                                >
                                  Bet
                                </button>
                              ) : (
                                <BillingPageLink className="inline-flex rounded-md border border-nrl-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted opacity-75 transition-colors hover:border-nrl-accent hover:text-nrl-text">
                                  Locked
                                </BillingPageLink>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      ))}
      {mobileBetSlip ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 px-3 py-4 md:hidden">
          <div className="w-full rounded-xl border border-nrl-border bg-[#10162f] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-nrl-accent">
                  Add To Bets
                </div>
                <div className="mt-1 truncate text-base font-semibold text-nrl-text">
                  {formatBestBetSelection(mobileBetSlip.market, mobileBetSlip.selection, mobileBetSlip.lineValue)}
                </div>
                <div className="mt-0.5 truncate text-xs text-nrl-muted">{mobileBetSlip.match}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileBetSlip(null)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                aria-label="Close bet slip"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Odds</span>
                <input
                  type="number"
                  min={1.01}
                  step={0.01}
                  value={Number.isFinite(mobileBetSlip.odds) ? mobileBetSlip.odds : ""}
                  onChange={(event) => {
                    const nextOdds = Number(event.target.value);
                    setMobileBetSlip((current) => current ? {
                      ...current,
                      odds: Number.isFinite(nextOdds) ? nextOdds : 0,
                    } : current);
                  }}
                  className="mt-1 w-full rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Stake</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(mobileBetSlip.stake) ? mobileBetSlip.stake : 0}
                  onChange={(event) => {
                    const nextStake = Math.max(0, Number(event.target.value) || 0);
                    setMobileBetSlip((current) => current ? { ...current, stake: nextStake } : current);
                  }}
                  className="mt-1 w-full rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Implied</div>
                <div className="mt-0.5 font-semibold text-nrl-text">{formatPct(mobileSlipImplied == null ? null : mobileSlipImplied * 100)}</div>
              </div>
              <div className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Edge</div>
                <div className="mt-0.5 font-semibold text-nrl-accent">
                  {mobileSlipEdgePp == null ? "-" : `${mobileSlipEdgePp >= 0 ? "+" : ""}${mobileSlipEdgePp.toFixed(2)}`}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMobileBetSlip(null)}
                className="cursor-pointer rounded-md border border-nrl-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirmMobileSlip}
                onClick={() => {
                  if (!mobileBetSlip || !canConfirmMobileSlip) return;
                  onOddsOverride(mobileBetSlip.key, mobileBetSlip.odds);
                  onStakeOverride(mobileBetSlip.key, mobileBetSlip.stake);
                  void onAddBet({
                    market: mobileBetSlip.market,
                    matchDate: mobileBetSlip.date,
                    matchName: mobileBetSlip.match,
                    selection: mobileBetSlip.selection,
                    lineValue: mobileBetSlip.lineValue,
                    odds: mobileBetSlip.odds,
                    stake: mobileBetSlip.stake,
                    modelProb: mobileBetSlip.modelProb,
                    impliedProb: mobileSlipImplied,
                    edgePp: mobileSlipEdgePp,
                  });
                  setMobileBetSlip(null);
                }}
                className={`rounded-md border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  canConfirmMobileSlip
                    ? "cursor-pointer border-nrl-accent bg-nrl-accent/15 text-nrl-accent hover:bg-nrl-accent/25"
                    : "cursor-not-allowed border-nrl-border text-nrl-muted opacity-60"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

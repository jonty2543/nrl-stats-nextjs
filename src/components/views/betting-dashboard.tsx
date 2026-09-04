"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { BillingPageLink } from "@/components/billing/billing-page-link";
import { PlayerImageWithFallback } from "@/components/ui/player-image-with-fallback";
import { hasPremiumAccess } from "@/lib/access/pro-access";
import {
  BET_SCORE_SUSPICIOUS_EDGE_THRESHOLD_PP,
  buildBetRatingMarketSignals,
  calculateBetRatingScore,
  earlyMarketTimingScore,
  todayIsoInBrisbane,
} from "@/lib/betting/bet-rating";
import type { PlayerImageRecord } from "@/lib/supabase/queries";
import {
  BETTING_BOOKIE_COLUMNS,
  type BettingMarket,
  type BettingBookie,
  type BettingOddsRow,
  type BettingOddsSnapshot,
} from "@/lib/betting/types";
import { calculateEdgePercentagePoints } from "@/lib/betting/calculations";

interface BettingDashboardProps {
  snapshot: BettingOddsSnapshot;
  canAccessPremium?: boolean;
  displayTodayIso?: string;
  showPastMarkets?: boolean;
  playerImages?: PlayerImageRecord[];
  playerTeamsByName?: Record<string, string>;
  teamLogos?: Record<string, string>;
  tryscorerFormByPlayer?: Record<string, TryscorerFormSummary>;
  tryscorerLastFiveVsOpponentByMatch?: Record<string, unknown>;
  tryscorerKickoffsByMatch?: Record<string, string>;
  lineupPlayersByMatch?: Record<string, unknown>;
  lineupLinksByMatchKey?: Record<string, string>;
  teamFormByMatchKey?: Record<string, string[]>;
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

type TryscorerSortKey = "betRating" | "edge" | "odds";
type TryscorerSortDirection = "best" | "worst";
type BestBetMarketFilter = BettingMarket | "All";

const TRYS_CORER_SORT_OPTIONS: { key: TryscorerSortKey; label: string }[] = [
  { key: "betRating", label: "Bet Rating" },
  { key: "edge", label: "Edge" },
  { key: "odds", label: "Odds" },
];

interface TryscorerFormSummary {
  player: string;
  team: string | null;
  position?: string | null;
  gamesPlayed?: number;
  tries2026?: number;
  lastFive: number[];
  opponentLastFive?: number[];
  average: number;
  headImage?: string | null;
  bodyImage?: string | null;
  teamLogoUrl?: string | null;
}

interface TryscorerProfileSelection {
  form: TryscorerFormSummary;
  opponentLastFive: number[];
  bestPrice: number | null;
  bestBookies: BettingBookie[];
  modelProbability: number | null;
  match: string;
  opponent: string | null;
}

interface TryscorerResolvedProfile {
  form: TryscorerFormSummary | null;
  image: string | null;
  team: string | null;
}

interface BestBetBookiePrice {
  bookie: BettingBookie;
  price: number;
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
  otherBookiePrices: BestBetBookiePrice[];
  odds: number;
  modelProbability: number;
  impliedProbability: number;
  edgePp: number;
  kellyStake: number;
  score: number;
  marketDisparityPp: number | null;
  marketEfficiencyPct: number | null;
  tags: string[];
}

interface BettingMarketJumpTarget {
  id: number;
  market: BettingMarket;
  date: string;
  match: string;
  lineValue: number | null;
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
type TrackedBetType = "single" | "multi" | "sgm";
type BettingTourTarget = "best-bets" | "staking-calculator" | "bet-tracker" | "main-dashboard";

interface BetLeg {
  market: BettingMarket;
  matchDate: string;
  matchName: string;
  selection: string;
  lineValue: number | null;
  odds: number;
  bookie: string | null;
  autoResult: boolean;
}

interface ManualBetLegDraft {
  id: string;
  market: BettingMarket;
  matchDate: string;
  matchName: string;
  selection: string;
  lineValue: string;
  odds: string;
  bookie: string;
  autoResult?: boolean;
}

interface TrackedBet {
  id: string;
  betType?: TrackedBetType;
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
  legs?: BetLeg[];
  autoSettle: boolean;
}

interface BetDraft {
  betType?: TrackedBetType;
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
  legs?: BetLeg[];
  autoSettle?: boolean;
}

interface BookieBetSlipSelection {
  bookie: BettingBookie;
  market: BettingMarket;
  matchDate: string;
  matchName: string;
  selection: string;
  lineValue: number | null;
  odds: number;
  stake?: number;
  modelProbability?: number | null;
}

function BufferedSlipInput({
  value,
  onCommit,
  ariaLabel,
  type = "text",
  placeholder,
  min,
  step,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel?: string;
  type?: "text" | "number";
  placeholder?: string;
  min?: number;
  step?: number;
  className: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type={type}
      aria-label={ariaLabel}
      defaultValue={value}
      placeholder={placeholder}
      min={min}
      step={step}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={className}
    />
  );
}

const MARKET_TABS: BettingMarket[] = ["Tryscorer", "H2H", "Line", "Margin", "Total"];
const BEST_BET_MODEL_MARKETS: BettingMarket[] = ["Tryscorer", "H2H", "Line", "Margin", "Total"];
const DEFAULT_BETTING_MARKET: BettingMarket = "Tryscorer";
const TOTAL_MODEL_BETA_MARKET: BettingMarket = "Total";
const DEFAULT_MAX_EDGE = 0.08;
const SUSPICIOUS_EDGE_WARNING_COPY =
  "If the model has an edge > 8% on the market, this may be suspicious and suggest the market knows something the model doesn't";
const BETTING_PREFERENCES_LOCAL_KEY = "betting-preferences-local-v1";
const BET_TRACKER_LOCAL_KEY = "bet-tracker-local-v1";
const BET_TRACKER_INITIAL_VISIBLE_BETS = 6;
const WEEKLY_FREE_BET_LOCAL_KEY_PREFIX = "weekly-free-bet-v1";
const WEEKLY_FREE_BET_NONE_VALUE = "none";
const FREE_BET_MIN_EDGE_PP = 3;
const FREE_BET_MAX_EDGE_PP = 6;
const BEST_BETS_TRYSCORER_MAX_ODDS = 8;
const BEST_BETS_MIN_PREMIUM_STAR_RATING = 1.5;
const BETTING_PANEL_HEADER_CLASS = "text-[10px] font-bold uppercase tracking-[0.22em]";
const BETTING_TOUR_HIGHLIGHT_CLASS = "relative z-[140] ring-2 ring-emerald-300/75 shadow-[0_20px_55px_rgba(0,0,0,0.38)]";
const BETTING_TOUR_STEPS: Array<{
  target: BettingTourTarget;
  title: string;
  body: string;
}> = [
  {
    target: "best-bets",
    title: "Best Bets",
    body: "See the top rated bets scored by model edge, market disagreement, and proximity to event.",
  },
  {
    target: "staking-calculator",
    title: "Staking Calculator",
    body: "Set your bankroll and staking method here so suggested stakes match the way you want to manage risk.",
  },
  {
    target: "bet-tracker",
    title: "Bet Tracker",
    body: "Track your placed bets, update results, and monitor bankroll, ROI, win rate, and profit over time.",
  },
  {
    target: "main-dashboard",
    title: "Main Dashboard",
    body: "Use the market tabs and odds tables here to compare bookies, model probabilities, edge, and staking outputs.",
  },
];

function countBestBetsByMarket(bets: BestBetCandidate[]): Record<BettingMarket, number> {
  const counts: Record<BettingMarket, number> = {
    H2H: 0,
    Line: 0,
    Margin: 0,
    Total: 0,
    Tryscorer: 0,
  };
  for (const bet of bets) {
    counts[bet.market] += 1;
  }
  return counts;
}

function hasMarketOdds(groups: EventGroup[]): boolean {
  return groups.some((group) => group.outcomes.length > 0);
}

function orderMarketsByAvailability(
  markets: BettingMarket[],
  groupsByMarket: Record<BettingMarket, EventGroup[]>,
  bestBetCountsByMarket: Record<BettingMarket, number>
): BettingMarket[] {
  return [...markets].sort((a, b) => {
    const aUnavailable = !hasMarketOdds(groupsByMarket[a]) || bestBetCountsByMarket[a] === 0;
    const bUnavailable = !hasMarketOdds(groupsByMarket[b]) || bestBetCountsByMarket[b] === 0;
    if (aUnavailable === bUnavailable) return markets.indexOf(a) - markets.indexOf(b);
    return aUnavailable ? 1 : -1;
  });
}
const IMPLIED_LINE_SIGMA = 16.85;
const IMPLIED_TOTAL_SIGMA = 16.85;
const BEST_BETS_CONFIG = {
  maxCards: 6,
  maxArbitrageCards: 5,
  minEdgePp: 0.75,
  minBookies: 2,
  minArbitragePct: 0.05,
};
const BEST_BETS_FEATURED_OVERRIDE = {
  from: "2026-05-25",
  to: "2026-05-31",
  preferredSelectionKeys: ["north queensland cowboys", "nth queensland cowboys", "cowboys"],
  blockedTopSelectionKeys: ["st george illawarra dragons", "st george dragons", "dragons"],
};
const STAKING_OPTIONS: Array<{
  mode: StakingMode;
  label: string;
}> = [
  {
    mode: "percentage",
    label: "Percentage Staking",
  },
  {
    mode: "targetProfit",
    label: "Target Profit Staking",
  },
  {
    mode: "kelly",
    label: "Kelly Staking",
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
    .replace(/['\u2018\u2019`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lookupNameParts(value: string | null | undefined): { first: string; last: string } {
  const parts = normaliseLookupKey(value).split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts.at(-1) ?? "",
  };
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
  if (!key) return "";
  if (key.includes("broncos") || key === "brisbane") return "broncos";
  if (key.includes("raiders") || key === "canberra") return "raiders";
  if (key.includes("bulldogs") || key.includes("canterbury")) return "bulldogs";
  if (key.includes("sharks") || key.includes("cronulla")) return "sharks";
  if (key.includes("dolphins")) return "dolphins";
  if (key.includes("titans") || key.includes("gold coast")) return "titans";
  if (key.includes("sea eagles") || key.includes("manly")) return "sea eagles";
  if (key.includes("storm") || key.includes("melbourne")) return "storm";
  if (key.includes("knights") || key.includes("newcastle")) return "knights";
  if (key.includes("warriors") || key.includes("zealand")) return "warriors";
  if (key.includes("cowboys") || key.includes("north queensland") || key.includes("north qld") || key.includes("nth queensland")) return "cowboys";
  if (key.includes("eels") || key.includes("parramatta")) return "eels";
  if (key.includes("panthers") || key.includes("penrith")) return "panthers";
  if (key.includes("rabbitohs") || key.includes("south sydney") || key === "souths") return "rabbitohs";
  if (key.includes("dragons") || key.includes("st george")) return "dragons";
  if (key.includes("roosters") || key.includes("sydney")) return "roosters";
  if (key.includes("tigers") || key.includes("wests")) return "tigers";
  return key;
}

function buildMatchKickoffKey(date: string, match: string): string | null {
  const { home, away } = parseMatch(match);
  if (!home || !away) return null;
  const teamsKey = [normaliseTeamMatchKey(home), normaliseTeamMatchKey(away)].sort().join("|");
  return `${date}|${teamsKey}`;
}

function buildMatchGroupKey(match: string): string {
  const { home, away } = parseMatch(match);
  if (!home || !away) return normaliseLookupKey(match);
  return [normaliseTeamMatchKey(home), normaliseTeamMatchKey(away)].sort().join("|");
}

function hasLineupPlayers(value: unknown): boolean {
  if (typeof value === "string") return normaliseLookupKey(value).length > 0;
  if (Array.isArray(value)) return value.some((item) => hasLineupPlayers(item));
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  const player =
    typeof row.player === "string" ? row.player :
      typeof row.playerName === "string" ? row.playerName :
        typeof row.name === "string" ? row.name :
          "";
  if (normaliseLookupKey(player)) return true;

  return ["players", "homeTeam", "awayTeam", "home", "away", "lineup"].some((key) => hasLineupPlayers(row[key]));
}

function hasAnnouncedLineupsForGroup(group: EventGroup, lineupPlayersByMatch: Record<string, unknown>): boolean {
  const matchKey = buildMatchGroupKey(group.match);
  const lookupKeys = [
    `${group.date}|${matchKey}`,
    matchKey,
    `${group.date}|${normaliseLookupKey(group.match)}`,
    normaliseLookupKey(group.match),
    group.match,
  ].filter(Boolean);

  return lookupKeys.some((key) => hasLineupPlayers(lineupPlayersByMatch[key]));
}

function teamListsAnnouncementMs(matchDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(matchDate);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dayOfMonth = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, dayOfMonth));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== dayOfMonth
  ) return null;

  const daysSinceTuesday = (date.getUTCDay() - 2 + 7) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceTuesday);
  date.setUTCHours(6, 0, 0, 0); // 4:00 pm in Australia/Brisbane (UTC+10).
  return date.getTime();
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
  return selection
    .trim()
    .replace(/\s+(?:1\s*[-–]\s*12|13\s*\+)\s*$/i, "")
    .replace(/\s+[+-]?\d+(?:\.\d+)?\s*$/, "")
    .trim();
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

function teamInitials(teamName: string | null | undefined): string {
  return String(teamName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "?";
}

function TeamLogoBadge({
  teamName,
  teamLogos,
}: {
  teamName: string | null | undefined;
  teamLogos: Record<string, string>;
}) {
  const logoUrl = resolveTeamLogoUrl(teamName, teamLogos);
  if (logoUrl) {
    return <TeamLogoImage teamName={teamName} teamLogos={teamLogos} className="h-7 w-7 rounded-full bg-[#0e1530] p-0.5 ring-1 ring-white/10" />;
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nrl-panel-2 text-[9px] font-bold text-nrl-muted ring-1 ring-white/10">
      {teamInitials(teamName)}
    </span>
  );
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

function modelPriceLabel(probability: number | null): string | null {
  if (probability == null || !Number.isFinite(probability) || probability <= 0) return null;
  return (1 / probability).toFixed(2);
}

function shortTeamName(value: string | null): string {
  const key = normaliseTeamMatchKey(value ?? "");
  const labels: Record<string, string> = {
    broncos: "Broncos",
    raiders: "Raiders",
    bulldogs: "Bulldogs",
    sharks: "Sharks",
    dolphins: "Dolphins",
    titans: "Titans",
    "sea eagles": "Sea Eagles",
    storm: "Storm",
    knights: "Knights",
    warriors: "Warriors",
    cowboys: "Cowboys",
    eels: "Eels",
    panthers: "Panthers",
    rabbitohs: "Rabbitohs",
    dragons: "Dragons",
    roosters: "Roosters",
    tigers: "Tigers",
  };
  return labels[key] ?? value ?? "Opponent";
}

function opponentForTryscorer(match: string, team: string | null): string | null {
  if (!team) return null;
  const { home, away } = parseMatch(match);
  const teamKey = normaliseLookupKey(team);
  if (teamKey && normaliseLookupKey(home).includes(teamKey)) return away || null;
  if (teamKey && normaliseLookupKey(away).includes(teamKey)) return home || null;
  if (home && away) return null;
  return null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tryNumberArray(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const values = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    return values.length > 0 ? values : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = objectRecord(value);
  for (const key of ["lastFive", "last_five", "tries", "values", "history"]) {
    const nested = tryNumberArray(record[key]);
    if (nested) return nested;
  }
  return null;
}

function lookupTryscorerVsOpponentLastFive({
  source,
  date,
  match,
  player,
  opponent,
}: {
  source: Record<string, unknown>;
  date: string;
  match: string;
  player: string;
  opponent: string | null;
}): number[] {
  const matchKeys = [
    `${date}|${buildMatchGroupKey(match)}`,
    `${date}|${normaliseLookupKey(match)}`,
    buildMatchGroupKey(match),
    normaliseLookupKey(match),
    match,
  ].filter(Boolean);
  const playerKeys = [normaliseLookupKey(player), player].filter(Boolean);
  const opponentKeys = [shortTeamName(opponent), normaliseLookupKey(opponent), opponent ?? ""].filter(Boolean);

  const readNode = (node: unknown): number[] | null => {
    const direct = tryNumberArray(node);
    if (direct) return direct;
    const record = objectRecord(node);
    for (const playerKey of playerKeys) {
      const playerNode = record[playerKey];
      const playerDirect = tryNumberArray(playerNode);
      if (playerDirect) return playerDirect;
      const playerRecord = objectRecord(playerNode);
      for (const opponentKey of opponentKeys) {
        const opponentDirect = tryNumberArray(playerRecord[opponentKey]);
        if (opponentDirect) return opponentDirect;
      }
    }
    return null;
  };

  for (const matchKey of matchKeys) {
    const byMatch = readNode(source[matchKey]);
    if (byMatch) return byMatch.slice(0, 5);
    for (const playerKey of playerKeys) {
      const composite = readNode(source[`${matchKey}|${playerKey}`]);
      if (composite) return composite.slice(0, 5);
    }
  }

  for (const playerKey of playerKeys) {
    const playerRecord = objectRecord(source[playerKey]);
    for (const matchKey of matchKeys) {
      const byPlayerMatch = readNode(playerRecord[matchKey]);
      if (byPlayerMatch) return byPlayerMatch.slice(0, 5);
    }
  }

  return [];
}

function normalizePlayerImageUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const upgradeHttp = (source: string) => source.startsWith("http://") ? `https://${source.slice("http://".length)}` : source;
  const encode = (source: string) => encodeURI(source).replace(/'/g, "%27");
  const decode = (source: string) => {
    try {
      return decodeURIComponent(source);
    } catch {
      return source;
    }
  };
  const marker = "/remote.axd?";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length).split("&preset=")[0];
    if (nested) return encode(upgradeHttp(decode(nested)));
  }
  return encode(upgradeHttp(decode(trimmed)));
}

function PlayerProfileImage({
  image,
  name,
  className = "h-10 w-10 p-0.5",
  reveal = true,
}: {
  image?: string | null;
  name: string;
  className?: string;
  reveal?: boolean;
}) {
  return (
    <PlayerImageWithFallback
      sources={[image ?? ""]}
      alt={name}
      className={`${className} shrink-0 rounded-full border border-white/10 bg-nrl-panel object-cover transition-opacity duration-150 ${reveal ? "opacity-100" : "opacity-0"}`}
      loading="eager"
      fetchPriority="high"
    />
  );
}

function useBatchedImagePreload(sources: string[], timeoutMs = 900) {
  const [preloadState, setPreloadState] = useState({ sourceKey: "", ready: false });
  const sourceKey = sources.join("\n");

  useEffect(() => {
    const sourceList = sourceKey ? sourceKey.split("\n") : [];
    if (sourceList.length === 0) {
      return;
    }

    let cancelled = false;
    const settle = () => {
      if (!cancelled) setPreloadState({ sourceKey, ready: true });
    };
    const timerId = window.setTimeout(settle, timeoutMs);

    Promise.all(sourceList.map((source) => new Promise<void>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = source;
    }))).then(settle);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [sourceKey, timeoutMs]);

  return sourceKey.length === 0 || (preloadState.sourceKey === sourceKey && preloadState.ready);
}

function playerImageSeenMs(row: PlayerImageRecord): number {
  const parsed = row.last_seen_match_date ? Date.parse(row.last_seen_match_date) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function teamMatchesHint(rowTeam: string | null | undefined, teamHint: string | null | undefined): boolean {
  const rowKey = normaliseTeamMatchKey(rowTeam ?? "");
  const hintKey = normaliseTeamMatchKey(teamHint ?? "");
  return Boolean(rowKey && hintKey && rowKey === hintKey);
}

function teamIsInMatch(rowTeam: string | null | undefined, match: string): boolean {
  const rowKey = normaliseTeamMatchKey(rowTeam ?? "");
  if (!rowKey) return false;
  const { home, away } = parseMatch(match);
  return rowKey === normaliseTeamMatchKey(home) || rowKey === normaliseTeamMatchKey(away);
}

function findLatestPlayerImage(
  playerName: string,
  playerImages: PlayerImageRecord[],
  teamHint: string | null = null,
  match = ""
): PlayerImageRecord | null {
  const targetKey = normaliseLookupKey(playerName);
  if (!targetKey) return null;
  const targetParts = lookupNameParts(playerName);
  const matchingRows = playerImages
    .filter((row) => {
      const rowKey = normaliseLookupKey(row.player);
      if (!rowKey) return false;
      if (rowKey === targetKey) return true;
      const rowParts = lookupNameParts(row.player);
      return Boolean(
        rowParts.last &&
          rowParts.last === targetParts.last &&
          rowParts.first[0] &&
          rowParts.first[0] === targetParts.first[0]
      );
    })
    .filter((row) => row.cached_head_image || row.cached_body_image || row.head_image || row.body_image)
    .sort((left, right) => {
      const leftTeamMatch = teamMatchesHint(left.team, teamHint);
      const rightTeamMatch = teamMatchesHint(right.team, teamHint);
      if (leftTeamMatch !== rightTeamMatch) return leftTeamMatch ? -1 : 1;

      const leftMatchTeam = teamIsInMatch(left.team, match);
      const rightMatchTeam = teamIsInMatch(right.team, match);
      if (leftMatchTeam !== rightMatchTeam) return leftMatchTeam ? -1 : 1;

      const leftHasHead = Boolean(left.cached_head_image || left.head_image);
      const rightHasHead = Boolean(right.cached_head_image || right.head_image);
      if (leftHasHead !== rightHasHead) return leftHasHead ? -1 : 1;

      return playerImageSeenMs(right) - playerImageSeenMs(left);
    });

  return matchingRows[0] ?? null;
}

function mergeTryscorerFormWithLatestImage(
  form: TryscorerFormSummary | null,
  playerName: string,
  playerImages: PlayerImageRecord[],
  teamHint: string | null,
  match: string
): TryscorerFormSummary | null {
  if (!form) return null;
  const latestImage = findLatestPlayerImage(form.player || playerName, playerImages, teamHint ?? form.team ?? null, match);
  if (!latestImage) return form;
  return {
    ...form,
    headImage: latestImage.cached_head_image ?? latestImage.head_image ?? null,
    bodyImage: latestImage.cached_body_image ?? latestImage.body_image ?? null,
    team: form.team ?? latestImage.team ?? null,
    position: form.position ?? latestImage.position ?? null,
  };
}

function findTryscorerForm(
  playerName: string,
  tryscorerFormByPlayer: Record<string, TryscorerFormSummary>
): TryscorerFormSummary | null {
  const key = normaliseLookupKey(playerName);
  const exact = tryscorerFormByPlayer[key];
  if (exact) return exact;

  const target = lookupNameParts(playerName);
  if (!target.first || !target.last) return null;

  return Object.entries(tryscorerFormByPlayer).find(([candidateKey, form]) => {
    const candidate = lookupNameParts(form.player || candidateKey);
    if (!candidate.first || !candidate.last) return false;
    if (candidate.last === target.last && candidate.first[0] === target.first[0]) return true;
    return candidate.first === target.first && areLookupTokensClose(candidate.last, target.last);
  })?.[1] ?? null;
}

function resolveTryscorerProfile({
  playerName,
  match,
  tryscorerFormByPlayer,
  playerTeamsByName,
  playerImages,
}: {
  playerName: string;
  match: string;
  tryscorerFormByPlayer: Record<string, TryscorerFormSummary>;
  playerTeamsByName: Map<string, string>;
  playerImages: PlayerImageRecord[];
}): TryscorerResolvedProfile {
  const key = normaliseLookupKey(playerName);
  const form = findTryscorerForm(playerName, tryscorerFormByPlayer);
  const teamHint = form?.team ?? playerTeamsByName.get(key) ?? null;
  const imageRow = findLatestPlayerImage(form?.player || playerName, playerImages, teamHint, match);
  const mergedForm = mergeTryscorerFormWithLatestImage(form, playerName, playerImages, teamHint, match);
  const image =
    imageRow?.cached_head_image ??
    imageRow?.cached_body_image ??
    imageRow?.head_image ??
    imageRow?.body_image ??
    mergedForm?.headImage ??
    mergedForm?.bodyImage ??
    null;

  return {
    form: mergedForm,
    image,
    team: mergedForm?.team ?? teamHint ?? imageRow?.team ?? null,
  };
}

function TryFormDots({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const displayValues = [...values].reverse();
  return (
    <div className="flex items-center gap-1">
      {displayValues.map((tries, index) => {
        const isMostRecent = index === displayValues.length - 1;
        return (
          <span
            key={`${index}-${tries}`}
            className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] font-black ${
              tries > 0
                ? isMostRecent
                  ? "border-emerald-300/85 bg-emerald-400/28 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.18)]"
                  : "border-emerald-300/40 bg-emerald-400/15 text-emerald-200"
                : isMostRecent
                  ? "border-red-300/85 bg-red-400/24 text-red-200 shadow-[0_0_12px_rgba(248,113,113,0.18)]"
                  : "border-red-300/45 bg-red-400/12 text-red-200"
            }`}
            title={`${isMostRecent ? "Most recent: " : ""}${tries > 0 ? `${tries} ${tries === 1 ? "try" : "tries"}` : "No try"}`}
          >
            {tries}
          </span>
        );
      })}
    </div>
  );
}

function TryOpponentForm({ opponent, values }: { opponent: string | null; values: number[] }) {
  if (!opponent) return null;
  return (
    <div>
      <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-nrl-muted">Vs {shortTeamName(opponent)}</div>
      {values.length > 0 ? (
        <TryFormDots values={values} />
      ) : (
        <span className="inline-flex h-5 items-center rounded-full border border-white/10 bg-white/[0.04] px-2 text-[9px] font-black uppercase tracking-[0.08em] text-nrl-muted">
          Unavailable
        </span>
      )}
    </div>
  );
}

function BetRatingExplainerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="bet-rating-explainer-title" onClick={onClose}>
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-blue-300/20 bg-[#071024] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-blue-300/15 bg-[#0b1630] px-4 py-3">
          <div>
            <h2 id="bet-rating-explainer-title" className="text-base font-bold text-nrl-text">How bet rating works</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-lg font-bold leading-none text-nrl-muted transition-colors hover:text-nrl-text" aria-label="Close bet rating explanation">
            ×
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs leading-relaxed text-nrl-muted">
          <p>
            The bet rating is centred around model edge: the predicted probability of a tryscorer using a machine-learning model versus the probability implied by the best bookmaker price. The rating is then influenced by these four factors:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="font-bold text-emerald-300">1. Market efficiency</div>
              <p className="mt-1">If bookmaker odds are dispersed—meaning there is disagreement between bookmakers—the bet rating is increased.</p>
              <p className="mt-2">For H2H and margin markets, we calculate market percentage by summing the implied probability of each outcome. If bookmakers disagree heavily and this falls below 100%, it is a positive expected-value market and the bet rating will be high.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="font-bold text-emerald-300">2. Time to event</div>
              <p className="mt-1">The market usually becomes more efficient and harder to beat closer to the event. The timing effect stays close to 1 through most of the week, then drops rapidly in the final hours: it is 0.5 three hours before kickoff and reaches its minimum of 0.3 at kickoff. Within hours of the event, there is often too much wisdom of the crowd priced into the market to profit—unless betting around late team news.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="font-bold text-emerald-300">3. Team-list announcement</div>
              <p className="mt-1">Once announced team lists are factored into the model, bet ratings receive a boost.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="font-bold text-emerald-300">4. Edge drop-off</div>
              <p className="mt-1">If edge becomes too high, it is likely a sign the model is missing information already processed by the market. The edge becomes less trustworthy, so the bet rating starts to diminish above 8 percentage points.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TryscorerProfileDialog({ selection, onClose }: { selection: TryscorerProfileSelection | null; onClose: () => void }) {
  if (!selection) return null;
  const { form, opponentLastFive, bestPrice, bestBookies, modelProbability, match, opponent } = selection;
  const image = form.headImage ?? form.bodyImage ?? null;
  const l5Scored = form.lastFive.filter((tries) => tries > 0).length;
  const l5Tries = form.lastFive.reduce((total, tries) => total + tries, 0);
  const modelPrice = modelPriceLabel(modelProbability);
  const modelPriceValue = modelPrice == null ? null : Number(modelPrice);
  const modelPriceClass =
    modelPriceValue == null || bestPrice == null
      ? "text-nrl-muted"
      : modelPriceValue > bestPrice
        ? "text-red-300/80"
        : "text-emerald-300/85";
  const opponentLabel = shortTeamName(opponent);

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-blue-300/20 bg-[#071024] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-blue-300/15 bg-[#0b1630] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <PlayerProfileImage image={image} name={form.player} className="h-14 w-14" />
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-nrl-text">{form.player}</div>
              <div className="mt-0.5 text-xs text-nrl-muted">{[form.team, form.position].filter(Boolean).join(" · ") || match}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-lg font-bold leading-none text-nrl-muted transition-colors hover:text-nrl-text" aria-label="Close try form">
            ×
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-4 gap-4 border-b border-blue-300/10 pb-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">Last 5</div>
              <div className="mt-1 text-xl font-black text-emerald-300">{l5Tries}</div>
              <div className="text-[10px] font-semibold text-nrl-muted">{l5Scored}/{form.lastFive.length} games</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">Season</div>
              <div className="mt-1 text-xl font-black text-nrl-text">{form.tries2026 ?? "-"}</div>
              <div className="text-[10px] font-semibold text-nrl-muted">{form.gamesPlayed ?? "-"} games</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">Best</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-black text-nrl-text">
                <span>{formatPrice(bestPrice)}</span>
                {bestBookies[0] ? <BookieLogo bookie={bestBookies[0]} compact /> : null}
              </div>
              <div className="text-[10px] font-semibold text-nrl-muted">anytime</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">Model</div>
              <div className={`mt-1 text-xl font-black ${modelPriceClass}`}>{modelPrice ?? "-"}</div>
              <div className="text-[10px] font-semibold text-nrl-muted">anytime</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-nrl-muted">Recent tries</div>
              <TryFormDots values={form.lastFive} />
            </div>
            {opponent && opponentLastFive.length > 0 ? (
              <div>
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-nrl-muted">Vs {opponentLabel}</div>
                <TryFormDots values={opponentLastFive} />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
            {form.position ? <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Starts: {form.position}</span> : null}
            {form.gamesPlayed != null ? <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Games: {form.gamesPlayed}</span> : null}
            <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Avg tries: {form.average.toFixed(2)}</span>
          </div>
        </div>
      </div>
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

function formatMarketLineValue(market: BettingMarket, value: number): string {
  return market === "Total" ? `${value}` : formatLineValue(value);
}

function formatBestBetSelection(market: BettingMarket, selection: string, lineValue: number | null): string {
  if (market === "Tryscorer" && lineValue != null) return `${selection} ${lineValue}+`;
  if ((market === "Line" || market === "Total") && lineValue != null) {
    return `${selection} ${formatMarketLineValue(market, lineValue)}`;
  }
  return selection;
}

function formatPct(value: number | null): string {
  if (value == null) return "-";
  return `${value.toFixed(2)}%`;
}

function formatEdge(value: number | null): string {
  if (value == null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
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

function createManualLegDraft(todayIso: string): ManualBetLegDraft {
  return {
    id: `leg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    market: "H2H",
    matchDate: todayIso,
    matchName: "",
    selection: "",
    lineValue: "",
    odds: "1.90",
    bookie: "",
    autoResult: false,
  };
}

function parseManualLegs(legs: ManualBetLegDraft[]): BetLeg[] {
  return legs.flatMap((leg) => {
    const odds = Number(leg.odds);
    const lineValue = leg.lineValue.trim() ? Number(leg.lineValue) : null;
    if (!leg.matchDate.trim() || !leg.matchName.trim() || !leg.selection.trim() || !Number.isFinite(odds) || odds <= 1) {
      return [];
    }
    if (lineValue != null && !Number.isFinite(lineValue)) return [];
    return [{
      market: leg.market,
      matchDate: leg.matchDate.trim(),
      matchName: leg.matchName.trim(),
      selection: leg.selection.trim(),
      lineValue,
      odds,
      bookie: leg.bookie.trim() || null,
      autoResult: leg.autoResult === true,
    }];
  });
}

function canAutoSettleTrackedLeg(leg: BetLeg): boolean {
  if (!leg.autoResult) return false;
  if ((leg.market === "Line" || leg.market === "Total") && leg.lineValue == null) return false;
  if (leg.market === "Margin" && !/^(.*?)\s+(1\s*[-–]\s*12|13\s*\+)\s*$/i.test(leg.selection)) return false;
  if (leg.market === "Tryscorer" && /\b(first|last)\b/i.test(leg.selection)) return false;
  return true;
}

function combinedMultiOdds(legs: BetLeg[]): number | null {
  if (legs.length < 2) return null;
  const product = legs.reduce((value, leg) => value * leg.odds, 1);
  return Number.isFinite(product) && product > 1 ? Number(product.toFixed(2)) : null;
}

function betSlipLegIdentity(leg: Pick<ManualBetLegDraft, "market" | "matchDate" | "matchName" | "selection" | "lineValue">): string {
  return [leg.market, leg.matchDate, normaliseMatchLabel(leg.matchName), normaliseLookupKey(leg.selection), leg.lineValue].join("|");
}

function normaliseMatchLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function betTypeLabel(type: TrackedBetType | undefined): string {
  if (type === "multi") return "Multi";
  if (type === "sgm") return "SGM";
  return "Single";
}

function betStatusPillClass(status: TrackedBetStatus): string {
  if (status === "won") return "border-emerald-300/40 bg-emerald-400/12 text-emerald-300";
  if (status === "lost") return "border-red-500/35 bg-red-500/10 text-red-400";
  if (status === "push") return "border-white/12 bg-white/[0.04] text-nrl-muted";
  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

function betStatusIconClass(status: TrackedBetStatus): string {
  if (status === "won") return "bg-emerald-300 text-[#07180f]";
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

function formatCompactDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}`;
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

function betScoreStarValue(scoreOutOfTen: number): number {
  return clamp(scoreOutOfTen, 0, 10) * 0.3;
}

function betScoreStarColor(rating: number): string {
  if (rating <= 1) {
    const progress = clamp(rating, 0, 1);
    return `hsl(${Math.round(0 + progress * 28)} 88% 62%)`;
  }
  if (rating <= 2) {
    const progress = clamp(rating - 1, 0, 1);
    return `hsl(${Math.round(28 + progress * 22)} 90% 62%)`;
  }
  const progress = clamp(rating - 2, 0, 1);
  const saturation = Math.round(36 + progress * 56);
  const lightness = Math.round(44 + progress * 8);
  return `hsl(148 ${saturation}% ${lightness}%)`;
}

function betScoreStarRating(score: number | null): { rating: number; color: string; label: string } {
  if (score == null || !Number.isFinite(score)) {
    return { rating: 0, color: "rgb(148 163 184)", label: "No rating" };
  }
  const scoreOutOfTen = clamp(score, 0, 1) * 10;
  const rating = clamp(betScoreStarValue(scoreOutOfTen), 0, 3);
  return { rating, color: betScoreStarColor(rating), label: `${rating.toFixed(1)} out of 3 stars, ${scoreOutOfTen.toFixed(1)} out of 10` };
}

function BetScoreStars({
  score,
  blurred,
  className = "text-[13px]",
}: {
  score: number | null;
  blurred: boolean;
  className?: string;
}) {
  if (blurred) {
    return (
      <span className="inline-flex items-center gap-1" aria-label="Rating locked" title="Rating locked">
        {[0, 1, 2].map((index) => (
          <svg key={index} viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 text-nrl-border">
            <path
              d="M12 3.2 14.8 8.9 21.1 9.8 16.6 14.2 17.7 20.5 12 17.5 6.3 20.5 7.4 14.2 2.9 9.8 9.2 8.9 12 3.2Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </span>
    );
  }

  const rating = betScoreStarRating(score);
  return (
    <span
      className={`inline-flex items-center gap-0.5 leading-none ${className}`}
      style={{ color: rating.color }}
      aria-label={rating.label}
      title={rating.label}
    >
      {[0, 1, 2].map((index) => {
        const fill = clamp(rating.rating - index, 0, 1);
        return (
          <span key={index} className="relative inline-grid h-[1em] w-[1em]" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-[1em] w-[1em] opacity-25">
              <path
                d="M12 3.2 14.8 8.9 21.1 9.8 16.6 14.2 17.7 20.5 12 17.5 6.3 20.5 7.4 14.2 2.9 9.8 9.2 8.9 12 3.2Z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 24 24" className="h-[1em] w-[1em]">
                <path
                  d="M12 3.2 14.8 8.9 21.1 9.8 16.6 14.2 17.7 20.5 12 17.5 6.3 20.5 7.4 14.2 2.9 9.8 9.2 8.9 12 3.2Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function lookupTeamLastFiveForm({
  formByMatchKey,
  date,
  match,
  selection,
}: {
  formByMatchKey: Record<string, string[]>;
  date: string;
  match: string;
  selection: string;
}): string[] {
  const teamKey = normaliseTeamMatchKey(stripSelectionLineSuffix(selection));
  if (!teamKey) return [];
  const matchKey = buildMatchGroupKey(match);
  const exact = formByMatchKey[`${date}|${matchKey}|${teamKey}`];
  if (exact) return exact;
  return Object.entries(formByMatchKey).find(([key]) => key.endsWith(`|${matchKey}|${teamKey}`))?.[1] ?? [];
}

function TeamLastFivePills({ values }: { values: string[] }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.08em] text-nrl-muted">
      L5:
      <span className="inline-flex items-center gap-1">
        {values.length === 0 ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-nrl-muted">
            unavailable
          </span>
        ) : values.slice(0, 5).map((value, index) => {
          const isWin = value === "W";
          const isLoss = value === "L";
          const stateClass = isWin
            ? "bg-emerald-400 text-emerald-950"
            : isLoss
              ? "bg-red-400 text-red-950"
              : "bg-white/15 text-nrl-text";
          return (
            <span
              key={`${value}-${index}`}
              className={`grid h-4 w-4 place-items-center rounded-full text-[8px] font-black leading-none ${stateClass} ${
                index === 0 ? "ring-2 ring-white/45 ring-offset-1 ring-offset-[#141c37]" : "opacity-75"
              }`}
              title={`${index === 0 ? "Most recent: " : ""}${value}`}
            >
              {value}
            </span>
          );
        })}
      </span>
    </span>
  );
}

function isSuspiciousEdge(edgePp: number | null): boolean {
  return edgePp != null && edgePp > BET_SCORE_SUSPICIOUS_EDGE_THRESHOLD_PP;
}

function formatBestBetMarketLabel(market: BettingMarket): string {
  return market === "Tryscorer" ? "Tryscorers" : market;
}

function TotalModelBetaBadge() {
  return (
    <span className="rounded-full bg-nrl-accent/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-nrl-accent">
      Beta
    </span>
  );
}

function SuspiciousEdgeCaution() {
  return (
    <span
      title={SUSPICIOUS_EDGE_WARNING_COPY}
      aria-label={SUSPICIOUS_EDGE_WARNING_COPY}
      className="text-[11px] leading-none"
    >
      ⚠️
    </span>
  );
}

function PremiumValueMask({ className = "w-12" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 rounded-full bg-white/22 blur-[2px] ${className}`}
    />
  );
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
  if (market === "H2H" || market === "Margin" || market === "Tryscorer") return offer.price;
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
    const eventKey = `${row.date}|${buildMatchGroupKey(row.match)}|${row.market}`;
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

    const inverseSum = (group.market === "H2H" || group.market === "Margin" ? outcomes : [])
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

function buildMarketSignals(row: OutcomeRow, marketEfficiencyPct: number | null) {
  const offers = BETTING_BOOKIE_COLUMNS
    .map((bookie) => row.bookieOffers[bookie])
    .filter((offer): offer is BookieOffer => offer != null);
  const ratingSignals = buildBetRatingMarketSignals({
    prices: offers.map((offer) => offer.price),
    bestPrice: row.bestPriceComputed,
    marketEfficiencyPct,
  });

  return {
    offerCount: offers.length,
    marketEfficiencyPct,
    ...ratingSignals,
  };
}

function calculateBetScore({
  edgePp,
  eventDate,
  eventKickoff,
  nowMs,
  todayIso,
  efficiencyScore,
  disagreementScore,
  teamListsProcessed,
}: {
  edgePp: number;
  eventDate: string;
  eventKickoff: string | null;
  nowMs: number;
  todayIso: string;
  efficiencyScore: number;
  disagreementScore: number;
  teamListsProcessed: boolean;
}): number {
  return calculateBetRatingScore({
    edgePp,
    eventDate,
    eventKickoff,
    nowMs,
    todayIso,
    efficiencyScore,
    disagreementScore,
    teamListsProcessed,
  });
}

function adjustedKellyProbability({
  modelProbability,
  impliedProbability,
  eventDate,
  todayIso,
  liquidityScore,
  efficiencyScore,
  disagreementScore,
}: {
  modelProbability: number;
  impliedProbability: number;
  eventDate: string;
  todayIso: string;
  liquidityScore: number;
  efficiencyScore: number;
  disagreementScore: number;
}): number {
  const edge = modelProbability - impliedProbability;
  if (edge <= 0) return modelProbability;

  const timingScore = earlyMarketTimingScore(eventDate, todayIso);
  const marketMaturityPressure = clamp(
    (liquidityScore * 0.55) +
    (efficiencyScore * 0.35) +
    ((1 - disagreementScore) * 0.1),
    0,
    1
  );
  const edgeWeight = clamp(1 - ((1 - timingScore) * marketMaturityPressure * 0.9), 0.25, 1);
  return clamp(impliedProbability + (edge * edgeWeight), 0.01, 0.99);
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

function bestBetSelectionMatches(
  candidate: Pick<BestBetCandidate, "selection" | "selectionLabel">,
  selectionKeys: string[]
): boolean {
  const candidateKeys = [
    candidate.selection,
    candidate.selectionLabel,
    stripSelectionLineSuffix(candidate.selection),
    stripSelectionLineSuffix(candidate.selectionLabel),
  ].map((value) => normaliseTeamMatchKey(value));

  const targetKeys = selectionKeys.map((value) => normaliseTeamMatchKey(value));
  return candidateKeys.some((candidateKey) => targetKeys.includes(candidateKey));
}

function applyFeaturedBestBetOverride(
  sortedCandidates: Array<Omit<BestBetCandidate, "tags">>,
  todayIso: string
): Array<Omit<BestBetCandidate, "tags">> {
  if (
    todayIso < BEST_BETS_FEATURED_OVERRIDE.from ||
    todayIso > BEST_BETS_FEATURED_OVERRIDE.to ||
    sortedCandidates.length < 2 ||
    !bestBetSelectionMatches(sortedCandidates[0], BEST_BETS_FEATURED_OVERRIDE.blockedTopSelectionKeys)
  ) {
    return sortedCandidates;
  }

  const preferredIndex = sortedCandidates.findIndex((candidate) =>
    candidate.date >= BEST_BETS_FEATURED_OVERRIDE.from &&
    candidate.date <= BEST_BETS_FEATURED_OVERRIDE.to &&
    bestBetSelectionMatches(candidate, BEST_BETS_FEATURED_OVERRIDE.preferredSelectionKeys)
  );
  if (preferredIndex <= 0) return sortedCandidates;

  const preferredCandidate = sortedCandidates[preferredIndex];
  if (!preferredCandidate) return sortedCandidates;

  return [
    preferredCandidate,
    ...sortedCandidates.slice(0, preferredIndex),
    ...sortedCandidates.slice(preferredIndex + 1),
  ];
}

function buildBestBets({
  groups,
  bankroll,
  kellyScale,
  todayIso,
  lineupPlayersByMatch,
  kickoffsByMatch,
  nowMs,
}: {
  groups: EventGroup[];
  bankroll: number;
  kellyScale: number;
  todayIso: string;
  lineupPlayersByMatch: Record<string, unknown>;
  kickoffsByMatch: Record<string, string>;
  nowMs: number;
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
      const otherBookiePrices = BETTING_BOOKIE_COLUMNS
        .map((bookie) => row.bookieOffers[bookie])
        .filter((offer): offer is BookieOffer => offer != null && !bestBookies.includes(offer.bookie))
        .sort((a, b) => b.price - a.price)
        .map(({ bookie, price }) => ({ bookie, price }));
      if (
        odds == null ||
        modelProbability == null ||
        implied == null ||
        bestBookie == null ||
        odds <= 1 ||
        (group.market === "Tryscorer" && odds > BEST_BETS_TRYSCORER_MAX_ODDS)
      ) {
        continue;
      }

      const edgePp = calculateEdgePercentagePoints(modelProbability, odds);
      if (edgePp == null) continue;
      if (edgePp < BEST_BETS_CONFIG.minEdgePp) continue;

      const signals = buildMarketSignals(row, group.marketPctFromBest);
      if (signals.offerCount < BEST_BETS_CONFIG.minBookies) continue;
      const kickoffKey = buildMatchKickoffKey(group.date, group.match);

      const score = calculateBetScore({
        edgePp,
        eventDate: group.date,
        eventKickoff: kickoffKey ? kickoffsByMatch[kickoffKey] ?? null : null,
        nowMs,
        todayIso,
        efficiencyScore: signals.efficiencyScore,
        disagreementScore: signals.disagreementScore,
        teamListsProcessed: hasAnnouncedLineupsForGroup(group, lineupPlayersByMatch),
      });
      const kellyProbability = adjustedKellyProbability({
        modelProbability,
        impliedProbability: implied,
        eventDate: group.date,
        todayIso,
        liquidityScore: signals.liquidityScore,
        efficiencyScore: signals.efficiencyScore,
        disagreementScore: signals.disagreementScore,
      });
      const fullKelly = kellyFraction(kellyProbability, odds);
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
        otherBookiePrices,
        odds,
        modelProbability,
        impliedProbability: implied,
        edgePp,
        kellyStake,
        score,
        marketDisparityPp: signals.marketDisparityPp,
        marketEfficiencyPct: signals.marketEfficiencyPct,
      });
    }
  }

  const sorted = candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    return b.edgePp - a.edgePp;
  });

  return BEST_BET_MODEL_MARKETS.flatMap((market) => {
    const marketCandidates = sorted.filter((candidate) => candidate.market === market);
    const displaySorted = applyFeaturedBestBetOverride(marketCandidates, todayIso);
    const biggestEdgeId = [...marketCandidates].sort((a, b) => b.edgePp - a.edgePp)[0]?.id;
    const premiumCandidates = displaySorted.filter(
      (candidate) => betScoreStarRating(candidate.score).rating >= BEST_BETS_MIN_PREMIUM_STAR_RATING
    );
    const displayCandidates = market === "Tryscorer"
      ? premiumCandidates
      : premiumCandidates.slice(0, BEST_BETS_CONFIG.maxCards);

    return displayCandidates.map((candidate, index) => {
      const tags: string[] = [];
      if (index === 0) tags.push("Top Rated Bet");
      if (candidate.id === biggestEdgeId) tags.push("Highest Edge");
      if ((candidate.marketDisparityPp ?? 0) >= 3) tags.push("Best Value");
      if (candidate.modelProbability >= 0.55 && candidate.market !== "Tryscorer") tags.push("Model Favourite");
      if (tags.length === 0) tags.push("Sharp Value");

      return {
        ...candidate,
        tags: [...new Set(tags)].slice(0, 2),
      };
    });
  });
}

function localIsoDateFromMs(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weeklyFreeBetKey(nowMs: number, market: BestBetMarketFilter): string {
  const date = new Date(localIsoDateFromMs(nowMs));
  const day = date.getDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return `${WEEKLY_FREE_BET_LOCAL_KEY_PREFIX}:${localIsoDateFromMs(date.getTime())}:${market}`;
}

function isWeekendBet(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function isBestBetExpired(
  bet: BestBetCandidate,
  kickoffsByMatch: Record<string, string>,
  nowMs: number
): boolean {
  const startMs = eventStartMs(bet, kickoffsByMatch);
  return startMs != null && startMs <= nowMs;
}

function weeklyFreeBetCandidates(
  bets: BestBetCandidate[],
  kickoffsByMatch: Record<string, string>,
  nowMs: number
): BestBetCandidate[] {
  return bets.filter((bet) => isWeeklyFreeBetEligible(bet, kickoffsByMatch, nowMs));
}

function isWeeklyFreeBetEligible(
  bet: BestBetCandidate,
  kickoffsByMatch: Record<string, string>,
  nowMs: number
): boolean {
  return bet.edgePp > FREE_BET_MIN_EDGE_PP &&
    bet.edgePp < FREE_BET_MAX_EDGE_PP &&
    (bet.market !== "Tryscorer" || bet.odds <= BEST_BETS_TRYSCORER_MAX_ODDS) &&
    !isBestBetExpired(bet, kickoffsByMatch, nowMs);
}

function chooseWeeklyFreeBetId(candidates: BestBetCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const weekendCandidates = candidates.filter((bet) => isWeekendBet(bet.date));
  const pool = weekendCandidates.length > 0 ? weekendCandidates : candidates;
  return pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
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

function OtherBookiePrices({ prices }: { prices: BestBetBookiePrice[] }) {
  return (
    <div className="mt-0.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-nrl-muted">
      {prices.length > 0 ? prices.slice(0, 4).map(({ bookie, price }) => (
        <span key={`${bookie}-${price}`} className="inline-flex items-center gap-1 whitespace-nowrap">
          <BookieLogo bookie={bookie} compact />
          <span className="tabular-nums">{formatPrice(price)}</span>
        </span>
      )) : (
        <span>None available</span>
      )}
    </div>
  );
}

export function BettingDashboard({
  snapshot,
  canAccessPremium = false,
  displayTodayIso,
  showPastMarkets = false,
  playerImages = [],
  playerTeamsByName: playerTeamsByNameProp = {},
  teamLogos = {},
  tryscorerFormByPlayer = {},
  tryscorerLastFiveVsOpponentByMatch = {},
  tryscorerKickoffsByMatch = {},
  lineupPlayersByMatch = {},
  lineupLinksByMatchKey = {},
  teamFormByMatchKey = {},
}: BettingDashboardProps) {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const hasPremiumBettingAccess = canAccessPremium || hasPremiumAccess(userId, user?.publicMetadata);
  const todayIso = useMemo(() => displayTodayIso ?? todayIsoInBrisbane(), [displayTodayIso]);
  const [bankroll, setBankroll] = useState(1000);
  const [stakingMode, setStakingMode] = useState<StakingMode>("percentage");
  const [percentageStakePct, setPercentageStakePct] = useState(2);
  const [targetProfitPct, setTargetProfitPct] = useState(2);
  const [kellyScale, setKellyScale] = useState(0.5);
  const [maxEdge, setMaxEdge] = useState(DEFAULT_MAX_EDGE);
  const [selectedMarket, setSelectedMarket] = useState<BettingMarket>(DEFAULT_BETTING_MARKET);
  const [stakeOverrides, setStakeOverrides] = useState<Record<string, number>>({});
  const [oddsOverrides, setOddsOverrides] = useState<Record<string, number>>({});
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerShowAll, setTrackerShowAll] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [bets, setBets] = useState<TrackedBet[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [betsHydrated, setBetsHydrated] = useState(false);
  const [betsError, setBetsError] = useState<string | null>(null);
  const [betAddedMessage, setBetAddedMessage] = useState<string | null>(null);
  const [betRemovedMessage, setBetRemovedMessage] = useState<string | null>(null);
  const [manualBetType, setManualBetType] = useState<TrackedBetType>("single");
  const [manualLegs, setManualLegs] = useState<ManualBetLegDraft[]>(() => [
    createManualLegDraft(todayIso),
    createManualLegDraft(todayIso),
  ]);
  const [manualOddsEdited, setManualOddsEdited] = useState(false);
  const [manualMatchDate, setManualMatchDate] = useState(todayIso);
  const [manualMatchName, setManualMatchName] = useState("");
  const [manualSelection, setManualSelection] = useState("");
  const [manualOdds, setManualOdds] = useState("1.90");
  const [manualStake, setManualStake] = useState("10");
  const [manualStatus, setManualStatus] = useState<TrackedBetStatus>("pending");
  const [manualError, setManualError] = useState<string | null>(null);
  const [bookieSlipOpen, setBookieSlipOpen] = useState(false);
  const [bookieSlipType, setBookieSlipType] = useState<TrackedBetType>("single");
  const [bookieSlipBookie, setBookieSlipBookie] = useState<BettingBookie>("Sportsbet");
  const [bookieSlipSeed, setBookieSlipSeed] = useState<BookieBetSlipSelection | null>(null);
  const [bookieSlipLegs, setBookieSlipLegs] = useState<ManualBetLegDraft[]>([]);
  const [bookieSlipOdds, setBookieSlipOdds] = useState("");
  const [bookieSlipOddsEdited, setBookieSlipOddsEdited] = useState(false);
  const [bookieSlipStake, setBookieSlipStake] = useState("10");
  const [bookieSlipStatus, setBookieSlipStatus] = useState<TrackedBetStatus>("pending");
  const [bookieSlipError, setBookieSlipError] = useState<string | null>(null);
  const [bookieSlipExpandedMarkets, setBookieSlipExpandedMarkets] = useState<Partial<Record<BettingMarket, boolean>>>({});
  const [bookieSlipExpandedMatches, setBookieSlipExpandedMatches] = useState<Record<string, boolean>>({});
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [marketJumpTarget, setMarketJumpTarget] = useState<BettingMarketJumpTarget | null>(null);
  const hasAutoSelectedMarketRef = useRef(false);
  const [tourStepIndex, setTourStepIndex] = useState<number | null>(null);
  const [tourTargetRect, setTourTargetRect] = useState<DOMRect | null>(null);
  const [teamListStatusNowMs, setTeamListStatusNowMs] = useState(() => Date.now());
  const [betRatingExplainerOpen, setBetRatingExplainerOpen] = useState(false);
  useEffect(() => {
    const intervalId = window.setInterval(() => setTeamListStatusNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const playerTeamsByName = useMemo(() => {
    const out = new Map<string, string>();
    for (const [key, team] of Object.entries(playerTeamsByNameProp)) {
      const normalisedKey = normaliseLookupKey(key);
      if (normalisedKey && team) out.set(normalisedKey, team);
    }
    for (const row of playerImages) {
      const key = normaliseLookupKey(row.player);
      if (!key || !row.team || out.has(key)) continue;
      out.set(key, row.team);
    }
    return out;
  }, [playerImages, playerTeamsByNameProp]);
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
  const marginGroups = useMemo(() => buildEventGroups(snapshot.margin), [snapshot.margin]);
  const totalGroups = useMemo(() => buildEventGroups(snapshot.total), [snapshot.total]);
  const tryscorerGroups = useMemo(
    () => buildEventGroups(snapshot.tryscorer, resolveTryscorerResult),
    [resolveTryscorerResult, snapshot.tryscorer]
  );
  const selectedMarketGroups = selectedMarket === "H2H"
    ? h2hGroups
    : selectedMarket === "Line"
      ? lineGroups
      : selectedMarket === "Margin"
        ? marginGroups
      : selectedMarket === "Total"
        ? totalGroups
        : tryscorerGroups;
  const hasTeamListsInModel = selectedMarketGroups.some((group) =>
    hasAnnouncedLineupsForGroup(group, lineupPlayersByMatch)
  );
  const teamListsAnnouncementPassed = selectedMarketGroups.some((group) => {
    const announcementMs = teamListsAnnouncementMs(group.date);
    return announcementMs != null && teamListStatusNowMs >= announcementMs;
  });
  const bestBets = useMemo(
    () => buildBestBets({
      groups: [...h2hGroups, ...lineGroups, ...marginGroups, ...totalGroups, ...tryscorerGroups],
      bankroll,
      kellyScale,
      todayIso,
      lineupPlayersByMatch,
      kickoffsByMatch: tryscorerKickoffsByMatch,
      nowMs: teamListStatusNowMs,
    }),
    [bankroll, h2hGroups, kellyScale, lineGroups, lineupPlayersByMatch, marginGroups, teamListStatusNowMs, todayIso, totalGroups, tryscorerGroups, tryscorerKickoffsByMatch]
  );
  const bestBetCountsByMarket = useMemo(() => countBestBetsByMarket(bestBets), [bestBets]);
  const marketGroupsByMarket = useMemo<Record<BettingMarket, EventGroup[]>>(() => ({
    H2H: h2hGroups,
    Line: lineGroups,
    Margin: marginGroups,
    Total: totalGroups,
    Tryscorer: tryscorerGroups,
  }), [h2hGroups, lineGroups, marginGroups, totalGroups, tryscorerGroups]);
  const orderedMarkets = useMemo(
    () => orderMarketsByAvailability(MARKET_TABS, marketGroupsByMarket, bestBetCountsByMarket),
    [bestBetCountsByMarket, marketGroupsByMarket]
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
    if (value === "H2H" || value === "Line" || value === "Margin" || value === "Total" || value === "Tryscorer") {
      if (window.location.hash.startsWith("#betting-game-")) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      setSelectedMarket(value);
    }
  };

  const handleBestBetMarketOpen = (bet: BestBetCandidate) => {
    setSelectedMarket(bet.market);
    setMarketJumpTarget({
      id: Date.now(),
      market: bet.market,
      date: bet.date,
      match: bet.match,
      lineValue: bet.lineValue,
    });
  };

  useEffect(() => {
    let autoSelectTimeoutId: number | null = null;
    const firstAvailableMarket = orderedMarkets.find((market) =>
      hasMarketOdds(marketGroupsByMarket[market]) && bestBetCountsByMarket[market] > 0
    );
    if (
      !hasAutoSelectedMarketRef.current &&
      firstAvailableMarket &&
      firstAvailableMarket !== selectedMarket &&
      (!hasMarketOdds(marketGroupsByMarket[selectedMarket]) || bestBetCountsByMarket[selectedMarket] === 0)
    ) {
      hasAutoSelectedMarketRef.current = true;
      autoSelectTimeoutId = window.setTimeout(() => setSelectedMarket(firstAvailableMarket), 0);
    }

    const scrollToGameHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith("betting-game-")) return;

      const hashMarket = MARKET_TABS.find((market) =>
        hash.endsWith(`-${normaliseLookupKey(market).replace(/\s+/g, "-")}`)
      );
      if (hashMarket && hashMarket !== selectedMarket) {
        setSelectedMarket(hashMarket);
        return;
      }

      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    };

    scrollToGameHash();
    window.addEventListener("hashchange", scrollToGameHash);
    return () => {
      if (autoSelectTimeoutId != null) window.clearTimeout(autoSelectTimeoutId);
      window.removeEventListener("hashchange", scrollToGameHash);
    };
  }, [bestBetCountsByMarket, marketGroupsByMarket, orderedMarkets, selectedMarket, selectedMarketGroups]);

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
            maxEdge: Number(parsed.maxEdge) || DEFAULT_MAX_EDGE,
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
            maxEdge: Number(payload.preferences.maxEdge) || DEFAULT_MAX_EDGE,
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

  const activeTourStep = tourStepIndex == null ? null : BETTING_TOUR_STEPS[tourStepIndex] ?? null;
  const tourIsOpen = activeTourStep != null;
  const tourPopupStyle = useMemo(() => {
    if (!tourTargetRect || typeof window === "undefined") {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const popupWidth = Math.min(360, window.innerWidth - 32);
    const left = Math.min(
      Math.max(16, tourTargetRect.left),
      Math.max(16, window.innerWidth - popupWidth - 16)
    );
    const hasRoomBelow = tourTargetRect.bottom + 210 < window.innerHeight;
    const top = hasRoomBelow
      ? tourTargetRect.bottom + 16
      : Math.max(16, tourTargetRect.top - 196);

    return {
      left,
      top,
      width: popupWidth,
    };
  }, [tourTargetRect]);

  const startBettingTour = () => {
    setTourStepIndex(0);
  };

  const closeBettingTour = () => {
    setTourStepIndex(null);
    setTourTargetRect(null);
  };

  const showNextTourStep = () => {
    if (tourStepIndex == null || tourStepIndex >= BETTING_TOUR_STEPS.length - 1) {
      closeBettingTour();
      return;
    }
    setTourStepIndex(tourStepIndex + 1);
  };

  const showPreviousTourStep = () => {
    if (tourStepIndex == null || tourStepIndex <= 0) return;
    setTourStepIndex(tourStepIndex - 1);
  };

  useEffect(() => {
    if (!activeTourStep) return;

    let scrollTimeoutId: number | null = null;
    let measureFrameId: number | null = null;

    const measureTarget = () => {
      const target = document.querySelector<HTMLElement>(`[data-betting-tour="${activeTourStep.target}"]`);
      setTourTargetRect(target ? target.getBoundingClientRect() : null);
    };

    const scrollToTarget = () => {
      const target = document.querySelector<HTMLElement>(`[data-betting-tour="${activeTourStep.target}"]`);
      if (!target) {
        setTourTargetRect(null);
        return;
      }

      if (activeTourStep.target === "main-dashboard") {
        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: Math.max(0, targetTop - 220),
          behavior: "smooth",
        });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      measureTarget();
      scrollTimeoutId = window.setTimeout(measureTarget, 260);
    };

    measureFrameId = window.requestAnimationFrame(scrollToTarget);
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      if (measureFrameId != null) window.cancelAnimationFrame(measureFrameId);
      if (scrollTimeoutId != null) window.clearTimeout(scrollTimeoutId);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [activeTourStep]);

  useEffect(() => {
    if (!tourIsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBettingTour();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tourIsOpen]);

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

  const parsedManualLegs = useMemo(() => parseManualLegs(manualLegs), [manualLegs]);
  const manualMultiOdds = useMemo(() => combinedMultiOdds(parsedManualLegs), [parsedManualLegs]);
  const parsedBookieSlipLegs = useMemo(() => parseManualLegs(bookieSlipLegs), [bookieSlipLegs]);
  const bookieSlipMultiOdds = useMemo(() => combinedMultiOdds(parsedBookieSlipLegs), [parsedBookieSlipLegs]);

  useEffect(() => {
    if (manualBetType !== "multi" || manualOddsEdited || manualMultiOdds == null) return;
    setManualOdds(manualMultiOdds.toFixed(2));
  }, [manualBetType, manualMultiOdds, manualOddsEdited]);

  useEffect(() => {
    if (bookieSlipType !== "multi" || bookieSlipOddsEdited) return;
    setBookieSlipOdds(bookieSlipMultiOdds?.toFixed(2) ?? "");
  }, [bookieSlipMultiOdds, bookieSlipOddsEdited, bookieSlipType]);

  const updateManualLeg = (id: string, updates: Partial<ManualBetLegDraft>) => {
    setManualLegs((prev) => prev.map((leg) => (leg.id === id ? { ...leg, ...updates } : leg)));
  };

  const addManualLeg = () => {
    setManualLegs((prev) => [...prev, createManualLegDraft(todayIso)]);
  };

  const removeManualLeg = (id: string) => {
    setManualLegs((prev) => (prev.length <= 2 ? prev : prev.filter((leg) => leg.id !== id)));
  };

  const updateBookieSlipLeg = (id: string, updates: Partial<ManualBetLegDraft>) => {
    setBookieSlipLegs((current) => current.map((leg) => leg.id === id ? { ...leg, ...updates } : leg));
    setBookieSlipError(null);
  };

  const addManualBookieSlipLeg = () => {
    setBookieSlipLegs((current) => {
      const draft = createManualLegDraft(todayIso);
      const firstLeg = current[0];
      return [
        ...current,
        {
          ...draft,
          matchDate: bookieSlipType === "sgm" && firstLeg ? firstLeg.matchDate : draft.matchDate,
          matchName: bookieSlipType === "sgm" && firstLeg ? firstLeg.matchName : draft.matchName,
          bookie: bookieSlipBookie,
        },
      ];
    });
    setBookieSlipOpen(true);
    setBookieSlipError(null);
  };

  const openBookieBetComposer = (selection: BookieBetSlipSelection) => {
    const initialLeg: ManualBetLegDraft = {
      id: `bookie-slip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      market: selection.market,
      matchDate: selection.matchDate,
      matchName: selection.matchName,
      selection: selection.selection,
      lineValue: selection.lineValue == null ? "" : String(selection.lineValue),
      odds: selection.odds.toFixed(2),
      bookie: selection.bookie,
      autoResult: true,
    };
    setBookieSlipSeed(selection);
    setBookieSlipType("single");
    setBookieSlipBookie(selection.bookie);
    setBookieSlipLegs([initialLeg]);
    setBookieSlipOdds(selection.odds.toFixed(2));
    setBookieSlipOddsEdited(false);
    setBookieSlipStake(String(selection.stake != null && Number.isFinite(selection.stake) && selection.stake > 0 ? selection.stake : 10));
    setBookieSlipStatus("pending");
    setBookieSlipExpandedMarkets({ [selection.market]: true });
    const seedGroup = marketGroupsByMarket[selection.market].find((group) =>
      group.date === selection.matchDate && buildMatchGroupKey(group.match) === buildMatchGroupKey(selection.matchName)
    );
    setBookieSlipExpandedMatches(selection.market === "Tryscorer" && seedGroup ? { [seedGroup.key]: true } : {});
    setBookieSlipError(null);
    setBookieSlipOpen(true);
  };

  const addScrapedOfferToBookieSlip = (selection: BookieBetSlipSelection) => {
    const nextLeg: ManualBetLegDraft = {
      id: `bookie-slip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      market: selection.market,
      matchDate: selection.matchDate,
      matchName: selection.matchName,
      selection: selection.selection,
      lineValue: selection.lineValue == null ? "" : String(selection.lineValue),
      odds: selection.odds.toFixed(2),
      bookie: selection.bookie,
      autoResult: true,
    };

    setBookieSlipOpen(true);
    setBookieSlipError(null);
    if (bookieSlipLegs.length === 0) {
      setBookieSlipBookie(selection.bookie);
    } else if (selection.bookie !== bookieSlipBookie) {
      setBookieSlipError(`This slip uses ${bookieSlipBookie}. Clear its legs before selecting ${selection.bookie}.`);
      return;
    }

    if (bookieSlipLegs.some((leg) => betSlipLegIdentity(leg) === betSlipLegIdentity(nextLeg))) {
      setBookieSlipError("That selection is already in the slip.");
      return;
    }

    const matchKey = `${selection.matchDate}|${normaliseMatchLabel(selection.matchName)}`;
    const existingMatchKeys = new Set(bookieSlipLegs.map((leg) => `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}`));
    if (bookieSlipType === "multi" && existingMatchKeys.has(matchKey)) {
      setBookieSlipError("Use an SGM slip for selections from the same game.");
      return;
    }
    if (bookieSlipType === "sgm" && existingMatchKeys.size > 0 && !existingMatchKeys.has(matchKey)) {
      setBookieSlipError("SGM legs must be from the same game.");
      return;
    }

    setBookieSlipLegs((current) => [...current, nextLeg]);
  };

  const findBookieSelectionForLeg = (
    leg: Pick<ManualBetLegDraft, "market" | "matchDate" | "matchName" | "selection" | "lineValue">,
    bookie: BettingBookie
  ): BookieBetSlipSelection | null => {
    const group = marketGroupsByMarket[leg.market].find((candidate) =>
      candidate.date === leg.matchDate && buildMatchGroupKey(candidate.match) === buildMatchGroupKey(leg.matchName)
    );
    if (!group) return null;
    const requestedValue = leg.lineValue.trim() ? Number(leg.lineValue) : null;
    const candidates = group.outcomes.filter((outcome) => normaliseLookupKey(outcome.result) === normaliseLookupKey(leg.selection));
    const outcome = candidates.find((candidate) => {
      const offer = candidate.bookieOffers[bookie];
      if (!offer) return false;
      return leg.market !== "Tryscorer" || requestedValue == null || offer.value === requestedValue;
    }) ?? candidates.find((candidate) => candidate.bookieOffers[bookie] != null);
    const offer = outcome?.bookieOffers[bookie] ?? null;
    if (!outcome || !offer) return null;
    return {
      bookie,
      market: leg.market,
      matchDate: group.date,
      matchName: group.match,
      selection: outcome.result,
      lineValue: offer.value,
      odds: offer.price,
      modelProbability: modelPercentToProbability(offer.model),
    };
  };

  const bookieSlipMarketOptions = useMemo(() => {
    if (!bookieSlipOpen || bookieSlipType === "single") return [];
    const seedMatchKey = bookieSlipSeed
      ? `${bookieSlipSeed.matchDate}|${normaliseMatchLabel(bookieSlipSeed.matchName)}`
      : null;

    return MARKET_TABS.flatMap((marketOption) => {
      const eligibleGroups = marketGroupsByMarket[marketOption].filter((group) => {
        if (bookieSlipType !== "sgm") return true;
        return seedMatchKey === `${group.date}|${normaliseMatchLabel(group.match)}`;
      }).flatMap((group) => {
        const outcomes = group.outcomes.flatMap((row) => {
          const offer = row.bookieOffers[bookieSlipBookie];
          return offer ? [{ row, offer }] : [];
        });
        return outcomes.length > 0 ? [{ group, outcomes }] : [];
      });
      const availableCount = eligibleGroups.reduce((count, entry) => count + entry.outcomes.length, 0);
      return availableCount > 0 ? [{ marketOption, eligibleGroups, availableCount }] : [];
    });
  }, [bookieSlipBookie, bookieSlipOpen, bookieSlipSeed, bookieSlipType, marketGroupsByMarket]);

  const bookieSlipAvailableBookies = bookieSlipSeed
    ? BETTING_BOOKIE_COLUMNS.filter((bookie) => {
      const seedDraft: ManualBetLegDraft = {
        id: "bookie-slip-seed-option",
        market: bookieSlipSeed.market,
        matchDate: bookieSlipSeed.matchDate,
        matchName: bookieSlipSeed.matchName,
        selection: bookieSlipSeed.selection,
        lineValue: bookieSlipSeed.lineValue == null ? "" : String(bookieSlipSeed.lineValue),
        odds: bookieSlipSeed.odds.toFixed(2),
        bookie: bookieSlipSeed.bookie,
      };
      return findBookieSelectionForLeg(seedDraft, bookie) != null;
    })
    : [...BETTING_BOOKIE_COLUMNS];

  const changeBookieSlipBookie = (bookie: BettingBookie) => {
    const nextLegs = bookieSlipLegs.flatMap((leg) => {
      if (leg.id.startsWith("leg-")) return [{ ...leg, bookie }];
      const selection = findBookieSelectionForLeg(leg, bookie);
      if (!selection) return [];
      return [{
        ...leg,
        lineValue: selection.lineValue == null ? "" : String(selection.lineValue),
        odds: selection.odds.toFixed(2),
        bookie,
      }];
    });
    const removedCount = bookieSlipLegs.length - nextLegs.length;
    setBookieSlipBookie(bookie);
    setBookieSlipLegs(nextLegs);
    if (bookieSlipSeed) {
      const seedDraft: ManualBetLegDraft = {
        id: "bookie-slip-seed",
        market: bookieSlipSeed.market,
        matchDate: bookieSlipSeed.matchDate,
        matchName: bookieSlipSeed.matchName,
        selection: bookieSlipSeed.selection,
        lineValue: bookieSlipSeed.lineValue == null ? "" : String(bookieSlipSeed.lineValue),
        odds: bookieSlipSeed.odds.toFixed(2),
        bookie: bookieSlipSeed.bookie,
      };
      const nextSeed = findBookieSelectionForLeg(seedDraft, bookie);
      if (nextSeed) setBookieSlipSeed({ ...nextSeed, stake: bookieSlipSeed.stake });
    }
    setBookieSlipOddsEdited(false);
    if (bookieSlipType === "single") {
      const price = Number(nextLegs[0]?.odds);
      setBookieSlipOdds(Number.isFinite(price) ? price.toFixed(2) : "");
    } else if (bookieSlipType === "sgm") {
      setBookieSlipOdds("");
    }
    setBookieSlipError(removedCount > 0 ? `${removedCount} unavailable ${removedCount === 1 ? "leg was" : "legs were"} removed for ${bookie}.` : null);
  };

  const changeBookieSlipType = (type: TrackedBetType) => {
    setBookieSlipType(type);
    setBookieSlipOddsEdited(false);
    setBookieSlipError(null);
    if (type === "single") {
      const seedLeg = bookieSlipSeed ? {
        id: `bookie-slip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        market: bookieSlipSeed.market,
        matchDate: bookieSlipSeed.matchDate,
        matchName: bookieSlipSeed.matchName,
        selection: bookieSlipSeed.selection,
        lineValue: bookieSlipSeed.lineValue == null ? "" : String(bookieSlipSeed.lineValue),
        odds: bookieSlipSeed.odds.toFixed(2),
        bookie: bookieSlipSeed.bookie,
      } : null;
      const selected = seedLeg ? findBookieSelectionForLeg(seedLeg, bookieSlipBookie) : null;
      if (seedLeg && selected) {
        const nextLeg = {
          ...seedLeg,
          lineValue: selected.lineValue == null ? "" : String(selected.lineValue),
          odds: selected.odds.toFixed(2),
          bookie: bookieSlipBookie,
        };
        setBookieSlipLegs([nextLeg]);
        setBookieSlipOdds(selected.odds.toFixed(2));
      }
      return;
    }
    if (type === "sgm" && bookieSlipSeed) {
      const seedMatchKey = `${bookieSlipSeed.matchDate}|${normaliseMatchLabel(bookieSlipSeed.matchName)}`;
      setBookieSlipLegs((current) => current.filter((leg) => `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}` === seedMatchKey));
      setBookieSlipOdds("");
      return;
    }
    const seenGames = new Set<string>();
    const multiLegs = bookieSlipLegs.filter((leg) => {
      const key = `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}`;
      if (seenGames.has(key)) return false;
      seenGames.add(key);
      return true;
    });
    setBookieSlipLegs(multiLegs);
    setBookieSlipOdds(combinedMultiOdds(parseManualLegs(multiLegs))?.toFixed(2) ?? "");
  };

  const clearBookieSlip = () => {
    setBookieSlipLegs([]);
    setBookieSlipOdds("");
    setBookieSlipOddsEdited(false);
    setBookieSlipError(null);
  };

  const handleBookieSlipSubmit = async () => {
    setBookieSlipError(null);
    if (bookieSlipType === "single") {
      const leg = parsedBookieSlipLegs[0];
      const odds = Number(bookieSlipOdds);
      const stake = Number(bookieSlipStake);
      if (!leg) {
        setBookieSlipError("Choose a valid selection.");
        return;
      }
      if (!Number.isFinite(odds) || odds <= 1) {
        setBookieSlipError("Odds must be greater than 1.");
        return;
      }
      if (!Number.isFinite(stake) || stake <= 0) {
        setBookieSlipError("Stake must be greater than 0.");
        return;
      }
      const implied = impliedProbability(odds);
      const modelProbability = bookieSlipSeed?.modelProbability ?? null;
      const added = await handleAddBet({
        betType: "single",
        market: leg.market,
        matchDate: leg.matchDate,
        matchName: leg.matchName,
        selection: leg.selection,
        lineValue: leg.lineValue,
        odds,
        stake,
        status: bookieSlipStatus,
        modelProb: modelProbability,
        impliedProb: implied,
        edgePp: modelProbability != null && implied != null ? (modelProbability - implied) * 100 : null,
        legs: [{ ...leg, odds, bookie: bookieSlipBookie }],
        autoSettle: canAutoSettleTrackedLeg(leg),
      });
      if (!added) {
        setBookieSlipError("The bet could not be saved. Check the tracker error and try again.");
        return;
      }
      clearBookieSlip();
      setBookieSlipSeed(null);
      setBookieSlipStatus("pending");
      setBookieSlipOpen(false);
      return;
    }

    if (parsedBookieSlipLegs.length !== bookieSlipLegs.length) {
      setBookieSlipError("Each leg needs a date, match, selection, and odds greater than 1.");
      return;
    }
    if (parsedBookieSlipLegs.length < 2) {
      setBookieSlipError(`${bookieSlipType === "sgm" ? "SGM" : "Multi"} bets need at least 2 legs.`);
      return;
    }

    const matchKeys = new Set(parsedBookieSlipLegs.map((leg) => `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}`));
    if (bookieSlipType === "multi" && matchKeys.size !== parsedBookieSlipLegs.length) {
      setBookieSlipError("Use an SGM slip for selections from the same game.");
      return;
    }
    if (bookieSlipType === "sgm" && matchKeys.size !== 1) {
      setBookieSlipError("SGM legs must be from the same game.");
      return;
    }

    const odds = Number(bookieSlipOdds);
    const stake = Number(bookieSlipStake);
    if (!Number.isFinite(odds) || odds <= 1) {
      setBookieSlipError(`${bookieSlipType === "sgm" ? "Enter the final SGM" : "Multi"} odds greater than 1.`);
      return;
    }
    if (!Number.isFinite(stake) || stake <= 0) {
      setBookieSlipError("Stake must be greater than 0.");
      return;
    }

    const firstLeg = parsedBookieSlipLegs[0];
    const added = await handleAddBet({
      betType: bookieSlipType,
      market: firstLeg.market,
      matchDate: firstLeg.matchDate,
      matchName: bookieSlipType === "multi" ? "Multiple games" : firstLeg.matchName,
      selection: `${parsedBookieSlipLegs.length}-leg ${bookieSlipType === "multi" ? "Multi" : "SGM"}`,
      lineValue: null,
      odds,
      stake,
      status: bookieSlipStatus,
      modelProb: null,
      impliedProb: null,
      edgePp: null,
      legs: parsedBookieSlipLegs.map((leg) => ({ ...leg, bookie: bookieSlipBookie })),
      autoSettle: parsedBookieSlipLegs.every(canAutoSettleTrackedLeg),
    });
    if (!added) {
      setBookieSlipError("The bet could not be saved. Check the tracker error and try again.");
      return;
    }
    clearBookieSlip();
    setBookieSlipSeed(null);
    setBookieSlipStake("10");
    setBookieSlipStatus("pending");
    setBookieSlipOpen(false);
  };

  const handleAddBet = async (draft: BetDraft): Promise<boolean> => {
    if (!hasPremiumBettingAccess) return false;
    if (!Number.isFinite(draft.stake) || draft.stake <= 0) return false;
    if (!Number.isFinite(draft.odds) || draft.odds <= 1) return false;
    const status = draft.status ?? "pending";

    if (!userId) {
      const localBet: TrackedBet = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        betType: draft.betType ?? "single",
        legs: draft.legs ?? [],
        status,
        profit: computeBetProfit(status, draft.stake, draft.odds),
        placedAt: new Date().toISOString(),
        settledAt: status === "pending" ? null : new Date().toISOString(),
        autoSettle: draft.autoSettle === true,
        ...draft,
      };
      setBets((prev) => [localBet, ...prev]);
      setBetAddedMessage("Bet added to bet tracker");
      return true;
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
        return true;
      }
      return false;
    } catch (error) {
      setBetsError(error instanceof Error ? error.message : "Failed to save bet");
      return false;
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

    if (manualBetType !== "single") {
      const expectedLegs = manualLegs.length;
      const validLegs = parsedManualLegs;
      if (validLegs.length !== expectedLegs) {
        setManualError("Each leg needs a date, match, selection, and odds greater than 1.");
        return false;
      }
      if (validLegs.length < 2) {
        setManualError(`${manualBetType === "sgm" ? "SGM" : "Multi"} bets need at least 2 legs.`);
        return false;
      }
      if (manualBetType === "multi") {
        const gameKeys = new Set(validLegs.map((leg) => `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}`));
        if (gameKeys.size !== validLegs.length) {
          setManualError("Use SGM for legs from the same game. Multis must use different games.");
          return false;
        }
      }
      if (manualBetType === "sgm") {
        const gameKeys = new Set(validLegs.map((leg) => `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}`));
        if (gameKeys.size !== 1) {
          setManualError("SGM legs must be from the same game.");
          return false;
        }
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
      const firstLeg = validLegs[0];
      const selectionLabel = manualBetType === "multi"
        ? `${validLegs.length}-leg Multi`
        : `${validLegs.length}-leg SGM`;
      const matchLabel = manualBetType === "multi" ? "Multiple games" : firstLeg.matchName;

      const added = await handleAddBet({
        betType: manualBetType,
        market: firstLeg.market,
        matchDate: firstLeg.matchDate,
        matchName: matchLabel,
        selection: selectionLabel,
        lineValue: null,
        odds: parsedOdds,
        stake: parsedStake,
        status: manualStatus,
        modelProb: null,
        impliedProb: null,
        edgePp: null,
        legs: validLegs,
        autoSettle: false,
      });
      if (!added) {
        setManualError("The bet could not be saved. Check the tracker error and try again.");
        return false;
      }

      setManualLegs([createManualLegDraft(todayIso), createManualLegDraft(todayIso)]);
      setManualOdds(manualBetType === "multi" ? "1.90" : "");
      setManualStake("10");
      setManualStatus("pending");
      setManualOddsEdited(false);
      return true;
    }

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

    const added = await handleAddBet({
      betType: "single",
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
      autoSettle: false,
    });
    if (!added) {
      setManualError("The bet could not be saved. Check the tracker error and try again.");
      return false;
    }

    setManualMatchName("");
    setManualSelection("");
    setManualOdds("1.90");
    setManualStake("10");
    setManualStatus("pending");
    setManualOddsEdited(false);
    return true;
  };

  const totalStake = bets.reduce((sum, bet) => sum + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
  const pendingStake = bets
    .filter((bet) => bet.status === "pending")
    .reduce((sum, bet) => sum + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
  const manualPendingBets = bets.filter((bet) => bet.status === "pending" && !bet.autoSettle);
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
  const visibleTrackerBets = trackerShowAll
    ? sortedBets
    : sortedBets.slice(0, BET_TRACKER_INITIAL_VISIBLE_BETS);
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
    const latestValue = values[values.length - 1] ?? 0;
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
      areaFillFrom: latestValue < 0 ? "rgba(252,165,165,0.2)" : "rgba(0,245,138,0.22)",
      areaFillTo: latestValue < 0 ? "rgba(252,165,165,0)" : "rgba(0,245,138,0)",
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
      <div className="flex justify-start">
        <div className="relative">
          <button
            type="button"
            onClick={startBettingTour}
            aria-label="Open betting guide"
            title="Open betting guide"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-emerald-300/40 bg-emerald-400/12 text-sm font-black lowercase text-emerald-300 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/18"
          >
            i
          </button>
        </div>
      </div>

      <BestBetsHero
        modelBets={bestBets}
        arbitrageBets={arbitrageBets}
        orderedMarkets={orderedMarkets}
        canAccessPremium={hasPremiumBettingAccess}
        teamLogos={teamLogos}
        tryscorerKickoffsByMatch={tryscorerKickoffsByMatch}
        onOpenMarket={handleBestBetMarketOpen}
        onOpenBetComposer={openBookieBetComposer}
        isTourActive={activeTourStep?.target === "best-bets"}
      />

      <section
        data-betting-tour="staking-calculator"
        className={`scroll-mt-24 rounded-xl border border-nrl-border bg-[#10162f]/96 p-4 sm:p-5 ${
          activeTourStep?.target === "staking-calculator" ? BETTING_TOUR_HIGHLIGHT_CLASS : ""
        }`}
      >
        <h2 className={`${BETTING_PANEL_HEADER_CLASS} text-nrl-text`}>Staking Calculator</h2>
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
                  className="rounded-md border border-nrl-border bg-[#10162f]/96 px-3 py-2 text-left text-nrl-muted opacity-65"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide">
                    <span>{option.label}</span>
                    <span className="rounded border border-nrl-border px-1.5 py-0.5 text-[9px] text-nrl-muted">
                      Premium
                    </span>
                  </div>
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
                    ? "border-emerald-300/40 bg-[#10162f]/96 text-emerald-300"
                    : "cursor-pointer border-nrl-border bg-[#10162f]/96 text-nrl-muted hover:border-emerald-300/40 hover:text-nrl-text"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide">
                  <span>{option.label}</span>
                </div>
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
              className="rounded-md border border-nrl-border bg-[#10162f]/96 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-emerald-300/40"
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
                className="rounded-md border border-nrl-border bg-[#10162f]/96 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-emerald-300/40"
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
                className="rounded-md border border-nrl-border bg-[#10162f]/96 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-emerald-300/40"
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
                className="rounded-md border border-nrl-border bg-[#10162f]/96 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-emerald-300/40"
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
                className="rounded-md border border-nrl-border bg-[#10162f]/96 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-emerald-300/40"
              />
            </label>
          ) : null}
        </div>
        </>
        )}
      </section>

      {hasPremiumBettingAccess ? (
        <section
          data-betting-tour="bet-tracker"
          className={`scroll-mt-24 overflow-hidden rounded-xl border border-nrl-border bg-[#10162f]/96 shadow-[0_18px_42px_rgba(0,0,0,0.24)] ${
            activeTourStep?.target === "bet-tracker" ? BETTING_TOUR_HIGHLIGHT_CLASS : ""
          }`}
        >
          <div className="border-b border-white/8 bg-[#10162f]/96 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className={`${BETTING_PANEL_HEADER_CLASS} text-nrl-text`}>Bet Tracker</div>
                <div className="mt-1 text-xs text-nrl-muted">
                  {bets.length} tracked {bets.length === 1 ? "bet" : "bets"}
                </div>
              </div>
              <button
                type="button"
                aria-label={trackerOpen ? "Collapse bet tracker" : "Expand bet tracker"}
                onClick={() => {
                  if (trackerOpen) setTrackerShowAll(false);
                  setTrackerOpen((open) => !open);
                }}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-emerald-300/40 bg-emerald-400/12 text-sm font-bold text-emerald-300 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/12"
              >
                <span aria-hidden="true">{trackerOpen ? "▴" : "▾"}</span>
              </button>
            </div>

            {!betTrackerLoading && manualPendingBets.length > 0 ? (
              <div className="mt-4 w-fit max-w-full rounded-md border border-amber-300/30 bg-amber-400/10 px-3 py-2.5 text-[11px] font-bold text-amber-100">
                {manualPendingBets.length} manual pending {manualPendingBets.length === 1 ? "bet" : "bets"}
              </div>
            ) : null}

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

            {trackerOpen && !betTrackerLoading && bets.length >= 5 ? (
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
                      <stop offset="0%" stopColor={trackerChart.areaFillFrom} />
                      <stop offset="100%" stopColor={trackerChart.areaFillTo} />
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
                        setManualBetType("single");
                        setManualOdds("1.90");
                        setManualOddsEdited(false);
                        setQuickAddOpen(true);
                      }}
                      className="cursor-pointer rounded-md border border-emerald-300/40 bg-emerald-400/12 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/12"
                    >
                      Quick Add
                    </button>
                  </div>

                  {sortedBets.length === 0 ? (
                    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/50">No bets yet.</div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {visibleTrackerBets.map((bet) => (
                          <article key={`${bet.id}-card`} className="rounded-lg border border-white/8 bg-[#14213b] p-3 shadow-[0_10px_22px_rgba(0,0,0,0.16)]">
                            <div className="flex items-center gap-3">
                              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-base font-black ${betStatusIconClass(bet.status)}`}>
                                {betStatusIconLabel(bet.status)}
                              </div>
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                {(bet.betType ?? "single") === "single" ? (
                                  <BettingTeamLogos selection={bet.selection} match={bet.matchName} market={bet.market} teamLogos={teamLogos} className="h-6 w-6" />
                                ) : null}
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-bold leading-tight text-white">
                                    {bet.selection}{bet.lineValue != null ? ` ${formatMarketLineValue(bet.market, bet.lineValue)}` : ""}
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] font-semibold text-nrl-muted">
                                    {betTypeLabel(bet.betType)} | {bet.matchName}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-nrl-muted">{formatDateLabel(bet.matchDate)}</div>
                                  {bet.status === "pending" && !bet.autoSettle ? (
                                    <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-200">Manual result required</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-bold text-nrl-text tabular-nums">
                                  {bet.profit == null ? "-" : formatMoney(bet.profit)}
                                </div>
                                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-nrl-muted">{bet.status}</div>
                              </div>
                            </div>
                            {(bet.betType === "multi" || bet.betType === "sgm") && (bet.legs?.length ?? 0) > 0 ? (
                              <div className="mt-3 space-y-1 rounded-md border border-white/8 bg-[#0e1530]/70 px-2.5 py-2">
                                {bet.legs!.map((leg, index) => (
                                  <div key={`${bet.id}-leg-${index}`} className="flex items-start justify-between gap-2 text-[10px] text-nrl-muted">
                                    <div className="min-w-0">
                                      <span className="font-semibold text-nrl-text">{index + 1}. {leg.selection}</span>
                                      {leg.lineValue != null ? <span> {formatMarketLineValue(leg.market, leg.lineValue)}</span> : null}
                                      <span> | {leg.market} | {leg.matchName}</span>
                                    </div>
                                    <div className="shrink-0 text-right tabular-nums">
                                      <div className="font-semibold text-nrl-text">{formatPrice(leg.odds)}</div>
                                      {leg.bookie ? <div>{leg.bookie}</div> : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
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
                                  className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-white outline-none focus:border-emerald-300/40"
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
                                  className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-white outline-none focus:border-emerald-300/40"
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
                                className={`h-8 rounded-md border px-2 text-xs font-semibold outline-none focus:border-emerald-300/40 ${betStatusPillClass(bet.status)}`}
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
                      {sortedBets.length > BET_TRACKER_INITIAL_VISIBLE_BETS ? (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setTrackerShowAll((showAll) => !showAll)}
                            className="cursor-pointer rounded-md border border-emerald-300/35 bg-emerald-400/[0.08] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:border-emerald-300/55 hover:bg-emerald-400/[0.14]"
                          >
                            {trackerShowAll ? "See less" : `See more (${sortedBets.length - BET_TRACKER_INITIAL_VISIBLE_BETS})`}
                          </button>
                        </div>
                      ) : null}
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
      ) : null}

      {quickAddOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-nrl-border bg-[#10162f] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Quick Add</div>
                <div className="mt-1 text-sm font-semibold text-nrl-text">Add a bet to the tracker</div>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddOpen(false)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-emerald-300/40 hover:text-nrl-text"
                aria-label="Close quick add"
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex rounded-md border border-white/10 bg-[#0e1530] p-1">
              {(["single", "multi", "sgm"] as TrackedBetType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={manualBetType === type}
                  onClick={() => {
                    setManualBetType(type);
                    setManualError(null);
                    setManualOddsEdited(false);
                    setManualOdds(
                      type === "multi"
                        ? (manualMultiOdds?.toFixed(2) ?? "1.90")
                        : type === "sgm"
                          ? ""
                          : "1.90"
                    );
                  }}
                  className={`h-8 flex-1 cursor-pointer rounded px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    manualBetType === type
                      ? "bg-emerald-400/12 text-emerald-300"
                      : "text-nrl-muted hover:bg-white/[0.04] hover:text-nrl-text"
                  }`}
                >
                  {betTypeLabel(type)}
                </button>
              ))}
            </div>

            {manualBetType === "single" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Date</span>
                  <input
                    type="date"
                    value={manualMatchDate}
                    onChange={(event) => setManualMatchDate(event.target.value)}
                    className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Market</span>
                  <select
                    value={selectedMarket}
                    onChange={(event) => handleMarketChange(event.target.value)}
                    className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs font-semibold text-nrl-text outline-none focus:border-emerald-300/40"
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
                    className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Selection</span>
                  <input
                    type="text"
                    value={manualSelection}
                    onChange={(event) => setManualSelection(event.target.value)}
                    placeholder="Selection"
                    className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {manualBetType === "multi" ? (
                  <div className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-nrl-muted">
                    Multi odds are multiplied from leg odds. Bookie is optional, and you can still edit the final odds.
                  </div>
                ) : (
                  <div className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-nrl-muted">
                    SGM prices are not calculated here. Enter the final SGM odds from your bookie.
                  </div>
                )}
                {manualLegs.map((leg, index) => (
                  <div key={leg.id} className="rounded-lg border border-white/8 bg-[#0e1530] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Leg {index + 1}</div>
                      <button
                        type="button"
                        onClick={() => removeManualLeg(leg.id)}
                        disabled={manualLegs.length <= 2}
                        className="cursor-pointer rounded border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input type="date" value={leg.matchDate} onChange={(event) => updateManualLeg(leg.id, { matchDate: event.target.value })} className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                      <select value={leg.market} onChange={(event) => updateManualLeg(leg.id, { market: event.target.value as BettingMarket })} className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs font-semibold text-nrl-text outline-none focus:border-emerald-300/40">
                        {MARKET_TABS.map((marketOption) => <option key={marketOption} value={marketOption}>{marketOption}</option>)}
                      </select>
                      <input type="text" value={leg.matchName} onChange={(event) => updateManualLeg(leg.id, { matchName: event.target.value })} placeholder="Match" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40 sm:col-span-2" />
                      <input type="text" value={leg.selection} onChange={(event) => updateManualLeg(leg.id, { selection: event.target.value })} placeholder="Selection" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                      <input type="number" value={leg.lineValue} onChange={(event) => updateManualLeg(leg.id, { lineValue: event.target.value })} placeholder="Line" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                      <input type="number" value={leg.odds} min={1.01} step={0.01} onChange={(event) => updateManualLeg(leg.id, { odds: event.target.value })} placeholder="Leg odds" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                      <input type="text" value={leg.bookie} onChange={(event) => updateManualLeg(leg.id, { bookie: event.target.value })} placeholder="Bookie optional" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addManualLeg} className="cursor-pointer rounded-md border border-emerald-300/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:bg-emerald-400/12">
                  Add Leg
                </button>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">
                  {manualBetType === "sgm" ? "SGM Odds" : manualBetType === "multi" ? "Multi Odds" : "Odds"}
                </span>
                <input
                  type="number"
                  value={manualOdds}
                  min={1.01}
                  step={0.01}
                  onChange={(event) => {
                    setManualOdds(event.target.value);
                    setManualOddsEdited(true);
                  }}
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40"
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
                  className="h-9 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Status</span>
                <select
                  value={manualStatus}
                  onChange={(event) => setManualStatus(event.target.value as TrackedBetStatus)}
                  className={`h-9 rounded-md border px-2 text-xs font-semibold outline-none focus:border-emerald-300/40 ${betStatusPillClass(manualStatus)}`}
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
                className="cursor-pointer rounded-md border border-emerald-300/40 bg-emerald-400/12 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/12"
              >
                Add Bet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bookieSlipOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 px-3 py-4 sm:px-6">
        <section className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-emerald-300/35 bg-[#10162f] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.55)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Bookie Bet Slip</div>
              <div className="mt-1 text-sm font-semibold text-nrl-text">
                {bookieSlipLegs.length} {bookieSlipLegs.length === 1 ? "leg" : "legs"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBookieSlipOpen(false)}
              aria-label="Close bookie bet slip"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-emerald-300/40 hover:text-nrl-text"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 rounded-md border border-white/10 bg-[#0e1530] p-1">
            {(["single", "multi", "sgm"] as TrackedBetType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={bookieSlipType === type}
                onClick={() => changeBookieSlipType(type)}
                className={`h-8 cursor-pointer rounded px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                  bookieSlipType === type
                    ? "bg-emerald-400/12 text-emerald-300"
                    : "text-nrl-muted hover:bg-white/[0.04] hover:text-nrl-text"
                }`}
              >
                {betTypeLabel(type)}
              </button>
            ))}
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Bookie</span>
            <select
              value={bookieSlipBookie}
              onChange={(event) => changeBookieSlipBookie(event.target.value as BettingBookie)}
              className="h-10 rounded-md border border-white/10 bg-[#0e1530] px-2 text-xs font-semibold text-nrl-text outline-none focus:border-emerald-300/40"
            >
              {bookieSlipAvailableBookies.map((bookie) => <option key={bookie} value={bookie}>{bookie}</option>)}
            </select>
            <span className="text-[9px] text-nrl-muted">Only markets and prices available from this bookie are shown below.</span>
          </label>

          <div className="mt-4 space-y-2">
            {bookieSlipLegs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.025] px-3 py-5 text-center text-xs text-nrl-muted">
                Click a bookmaker price in the odds tables, or add a leg manually.
              </div>
            ) : bookieSlipLegs.map((leg, index) => (
              <div key={leg.id} className="rounded-lg border border-white/8 bg-[#0e1530] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Leg {index + 1}</span>
                    <BookieLogo bookie={bookieSlipBookie} compact />
                  </div>
                  <button
                    type="button"
                    disabled={bookieSlipType === "single"}
                    onClick={() => {
                      setBookieSlipLegs((current) => current.filter((candidate) => candidate.id !== leg.id));
                      setBookieSlipError(null);
                    }}
                    className="cursor-pointer rounded border border-red-400/25 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-red-300 transition-colors hover:bg-red-400/10 disabled:hidden"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="date" aria-label={`Leg ${index + 1} date`} value={leg.matchDate} onChange={(event) => updateBookieSlipLeg(leg.id, { matchDate: event.target.value })} className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                  <select aria-label={`Leg ${index + 1} market`} value={leg.market} onChange={(event) => updateBookieSlipLeg(leg.id, { market: event.target.value as BettingMarket })} className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs font-semibold text-nrl-text outline-none focus:border-emerald-300/40">
                    {MARKET_TABS.map((marketOption) => <option key={marketOption} value={marketOption}>{marketOption}</option>)}
                  </select>
                  <BufferedSlipInput ariaLabel={`Leg ${index + 1} match`} value={leg.matchName} onCommit={(value) => updateBookieSlipLeg(leg.id, { matchName: value })} placeholder="Match" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40 sm:col-span-2" />
                  <BufferedSlipInput ariaLabel={`Leg ${index + 1} selection`} value={leg.selection} onCommit={(value) => updateBookieSlipLeg(leg.id, { selection: value })} placeholder="Selection" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                  <BufferedSlipInput type="number" ariaLabel={`Leg ${index + 1} line`} value={leg.lineValue} onCommit={(value) => updateBookieSlipLeg(leg.id, { lineValue: value })} placeholder="Line optional" className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-nrl-muted">Leg Price</span>
                    <BufferedSlipInput type="number" ariaLabel={`Leg ${index + 1} price`} value={leg.odds} min={1.01} step={0.01} onCommit={(value) => updateBookieSlipLeg(leg.id, { odds: value })} className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {bookieSlipType !== "single" ? (
            <div className="mt-5">
              <div className="mb-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-text">Add Legs</div>
                <div className="mt-1 text-[10px] text-nrl-muted">
                  {bookieSlipType === "sgm"
                    ? `Only ${bookieSlipSeed?.matchName ?? "the selected game"} is available for this SGM.`
                    : "Choose one selection per game. Prices come from the selected bookie."}
                </div>
              </div>
              <div className="space-y-2">
                {bookieSlipMarketOptions.map(({ marketOption, eligibleGroups, availableCount }) => {
                  const expanded = bookieSlipExpandedMarkets[marketOption] === true;
                  return (
                    <div key={`bookie-slip-market-${marketOption}`} className="overflow-hidden rounded-lg border border-white/10 bg-[#0e1530]">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setBookieSlipExpandedMarkets((current) => ({ ...current, [marketOption]: !expanded }))}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.035]"
                      >
                        <span className="text-xs font-bold text-nrl-text">{marketOption}</span>
                        <span className="flex items-center gap-2 text-[10px] font-semibold text-nrl-muted">
                          {availableCount} available <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
                        </span>
                      </button>
                      {expanded ? (
                        <div className="space-y-3 border-t border-white/8 p-3">
                          {eligibleGroups.map(({ group, outcomes }) => {
                            const matchExpanded = bookieSlipExpandedMatches[group.key] === true;
                            const showOutcomes = marketOption !== "Tryscorer" || matchExpanded;
                            return (
                            <div
                              key={`bookie-slip-group-${marketOption}-${group.key}`}
                              className={marketOption === "Tryscorer" ? "overflow-hidden rounded-md border border-white/10 bg-white/[0.02]" : ""}
                            >
                              {marketOption === "Tryscorer" ? (
                                <button
                                  type="button"
                                  aria-expanded={matchExpanded}
                                  onClick={() => setBookieSlipExpandedMatches((current) => ({ ...current, [group.key]: !matchExpanded }))}
                                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.035]"
                                >
                                  <span className="min-w-0 truncate text-[10px] font-semibold text-nrl-muted">
                                    {formatDateLabel(group.date)} · {group.match}
                                  </span>
                                  <span className="flex shrink-0 items-center gap-2 text-[9px] font-semibold text-nrl-muted">
                                    {outcomes.length} <span aria-hidden="true">{matchExpanded ? "▴" : "▾"}</span>
                                  </span>
                                </button>
                              ) : (
                                <div className="mb-2 text-[10px] font-semibold text-nrl-muted">
                                  {formatDateLabel(group.date)} · {group.match}
                                </div>
                              )}
                              {showOutcomes ? <div className={`grid gap-2 sm:grid-cols-2 ${marketOption === "Tryscorer" ? "border-t border-white/8 p-2.5" : ""}`}>
                                {outcomes.map(({ row, offer }) => {
                                  const candidate: BookieBetSlipSelection = {
                                    bookie: bookieSlipBookie,
                                    market: marketOption,
                                    matchDate: group.date,
                                    matchName: group.match,
                                    selection: row.result,
                                    lineValue: offer.value,
                                    odds: offer.price,
                                    modelProbability: modelPercentToProbability(offer.model),
                                  };
                                  const candidateDraft: ManualBetLegDraft = {
                                    id: "candidate",
                                    market: candidate.market,
                                    matchDate: candidate.matchDate,
                                    matchName: candidate.matchName,
                                    selection: candidate.selection,
                                    lineValue: candidate.lineValue == null ? "" : String(candidate.lineValue),
                                    odds: candidate.odds.toFixed(2),
                                    bookie: candidate.bookie,
                                  };
                                  const selectedLeg = bookieSlipLegs.find((leg) => betSlipLegIdentity(leg) === betSlipLegIdentity(candidateDraft));
                                  const candidateMatchKey = `${candidate.matchDate}|${normaliseMatchLabel(candidate.matchName)}`;
                                  const sameGameAlreadyUsed = bookieSlipType === "multi" && bookieSlipLegs.some((leg) =>
                                    `${leg.matchDate}|${normaliseMatchLabel(leg.matchName)}` === candidateMatchKey && leg.id !== selectedLeg?.id
                                  );
                                  return (
                                    <button
                                      key={`${group.key}-${row.result}-${offer.value ?? ""}`}
                                      type="button"
                                      disabled={!selectedLeg && sameGameAlreadyUsed}
                                      aria-pressed={selectedLeg != null}
                                      onClick={() => {
                                        if (selectedLeg) {
                                          setBookieSlipLegs((current) => current.filter((leg) => leg.id !== selectedLeg.id));
                                          setBookieSlipError(null);
                                        } else {
                                          addScrapedOfferToBookieSlip(candidate);
                                        }
                                      }}
                                      className={`flex min-h-12 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                                        selectedLeg
                                          ? "cursor-pointer border-emerald-300/55 bg-emerald-400/12 text-emerald-200"
                                          : sameGameAlreadyUsed
                                            ? "cursor-not-allowed border-white/5 text-nrl-muted opacity-40"
                                            : "cursor-pointer border-white/10 bg-white/[0.025] text-nrl-text hover:border-emerald-300/40 hover:bg-emerald-400/[0.06]"
                                      }`}
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate text-[11px] font-semibold">{formatBestBetSelection(marketOption, row.result, offer.value)}</span>
                                        <span className="mt-0.5 block text-[9px] text-nrl-muted">{bookieSlipBookie}</span>
                                      </span>
                                      <span className="shrink-0 text-xs font-bold tabular-nums">{formatPrice(offer.price)}</span>
                                    </button>
                                  );
                                })}
                              </div> : null}
                            </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {bookieSlipType !== "single" ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={addManualBookieSlipLeg} className="cursor-pointer rounded-md border border-emerald-300/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300 transition-colors hover:bg-emerald-400/12">
              Add Manual Leg
            </button>
            {bookieSlipLegs.length > 0 ? (
              <button type="button" onClick={clearBookieSlip} className="cursor-pointer px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-nrl-muted transition-colors hover:text-red-300">
                Clear All
              </button>
            ) : null}
          </div> : null}

          <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.025] p-3">
            {bookieSlipType === "multi" ? (
              <div className="mb-3 text-[10px] text-nrl-muted">
                Multiplied leg price: <span className="font-semibold text-nrl-text">{bookieSlipMultiOdds == null ? "-" : bookieSlipMultiOdds.toFixed(2)}</span>. You can adjust the final price below.
              </div>
            ) : bookieSlipType === "sgm" ? (
              <div className="mb-3 text-[10px] text-nrl-muted">Enter the final SGM price shown by {bookieSlipBookie}.</div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">{bookieSlipType === "multi" ? "Multi Odds" : bookieSlipType === "sgm" ? "Final SGM Odds" : "Odds"}</span>
                <BufferedSlipInput
                  type="number"
                  value={bookieSlipOdds}
                  min={1.01}
                  step={0.01}
                  placeholder={bookieSlipType === "sgm" ? "Enter bookie price" : "-"}
                  onCommit={(value) => {
                    setBookieSlipOdds(value);
                    setBookieSlipOddsEdited(true);
                  }}
                  className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40"
                />
                {bookieSlipType === "multi" && bookieSlipOddsEdited && bookieSlipMultiOdds != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBookieSlipOddsEdited(false);
                      setBookieSlipOdds(bookieSlipMultiOdds.toFixed(2));
                    }}
                    className="self-start text-[9px] font-semibold text-emerald-300 hover:underline"
                  >
                    Use multiplied price
                  </button>
                ) : null}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Stake</span>
                <BufferedSlipInput type="number" value={bookieSlipStake} min={0} step={1} onCommit={setBookieSlipStake} className="h-9 rounded-md border border-white/10 bg-[#10162f] px-2 text-xs text-nrl-text outline-none focus:border-emerald-300/40" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Status</span>
                <select value={bookieSlipStatus} onChange={(event) => setBookieSlipStatus(event.target.value as TrackedBetStatus)} className={`h-9 rounded-md border px-2 text-xs font-semibold outline-none focus:border-emerald-300/40 ${betStatusPillClass(bookieSlipStatus)}`}>
                  <option value="pending">pending</option>
                  <option value="won">won</option>
                  <option value="lost">lost</option>
                  <option value="push">push</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">Projected P/L</span>
                <div className="flex h-9 items-center rounded-md border border-white/8 bg-[#10162f] px-2 text-xs font-semibold text-nrl-text">
                  {(() => {
                    const odds = Number(bookieSlipOdds);
                    const stake = Number(bookieSlipStake);
                    if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake <= 0) return "-";
                    const profit = computeBetProfit(bookieSlipStatus, stake, odds);
                    return profit == null ? "-" : formatMoney(profit);
                  })()}
                </div>
              </div>
            </div>
          </div>

          {bookieSlipError ? <div className="mt-3 text-[11px] font-semibold text-red-400">{bookieSlipError}</div> : null}

          <button
            type="button"
            onClick={() => void handleBookieSlipSubmit()}
            className="mt-4 w-full cursor-pointer rounded-md border border-emerald-300/45 bg-emerald-400/14 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:border-emerald-300/65 hover:bg-emerald-400/20"
          >
            Add {betTypeLabel(bookieSlipType)} to Tracker
          </button>
        </section>
        </div>
      ) : null}

      {betAddedMessage ? (
        <div className="fixed bottom-4 right-4 z-[120] rounded-md border border-emerald-300/40 bg-nrl-panel px-3 py-2 text-xs font-semibold text-emerald-300 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          {betAddedMessage}
        </div>
      ) : null}

      {betRemovedMessage ? (
        <div className="fixed bottom-16 right-4 z-[120] rounded-md border border-red-500/40 bg-nrl-panel px-3 py-2 text-xs font-semibold text-red-400 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          {betRemovedMessage}
        </div>
      ) : null}

      <div
        data-betting-tour="main-dashboard"
        className={`scroll-mt-24 space-y-7 rounded-xl ${bookieSlipOpen ? "hidden" : ""} ${
          activeTourStep?.target === "main-dashboard" ? BETTING_TOUR_HIGHLIGHT_CLASS : ""
        }`}
      >
        <MarketTabsRail orderedMarkets={orderedMarkets} selectedMarket={selectedMarket} onMarketChange={handleMarketChange} />
        {selectedMarketGroups.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {hasTeamListsInModel ? (
              <div className="w-fit max-w-full rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[10px] font-semibold text-emerald-300 sm:text-xs">
                <span aria-hidden="true">🟢</span> Team lists processed by model.
              </div>
            ) : teamListsAnnouncementPassed ? (
              <div className="rounded-lg border border-orange-400/30 bg-orange-400/[0.06] px-3 py-2 text-[10px] font-semibold text-orange-300 sm:text-xs">
                <span aria-hidden="true">🟠</span> Team list info will be processed by the model shortly.
              </div>
            ) : (
              <div className="rounded-lg border border-nrl-border bg-white/[0.03] px-3 py-2 text-[10px] font-semibold text-nrl-muted sm:text-xs">
                Note: edge and ratings are more accurate once team lists have been announced.
              </div>
            )}
            <button
              type="button"
              onClick={() => setBetRatingExplainerOpen(true)}
              className="rounded-lg border border-blue-300/25 bg-blue-300/[0.06] px-3 py-2 text-[10px] font-semibold text-blue-200 transition-colors hover:border-blue-300/45 hover:bg-blue-300/[0.1] sm:text-xs"
            >
              Bet rating explained
            </button>
          </div>
        ) : null}
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
            playerImages={playerImages}
            teamLogos={teamLogos}
            tryscorerFormByPlayer={tryscorerFormByPlayer}
            tryscorerLastFiveVsOpponentByMatch={tryscorerLastFiveVsOpponentByMatch}
            tryscorerKickoffsByMatch={tryscorerKickoffsByMatch}
            lineupPlayersByMatch={lineupPlayersByMatch}
            lineupLinksByMatchKey={lineupLinksByMatchKey}
            teamFormByMatchKey={teamFormByMatchKey}
            market={selectedMarket}
            todayIso={todayIso}
            jumpTarget={marketJumpTarget}
            showPastMarkets={showPastMarkets}
            onStakeOverride={handleStakeOverride}
            onOddsOverride={handleOddsOverride}
            onOpenBetComposer={openBookieBetComposer}
          />
        </section>
        <BetRatingExplainerDialog open={betRatingExplainerOpen} onClose={() => setBetRatingExplainerOpen(false)} />
      </div>

      {tourIsOpen && activeTourStep ? (
        <>
          <div className="fixed inset-0 z-[130] bg-black/75" onClick={closeBettingTour} />
          <div
            className="fixed z-[150] w-[calc(100vw-2rem)] max-w-[360px] rounded-xl border border-emerald-300/35 bg-[#10162f] p-4 text-nrl-text shadow-[0_24px_80px_rgba(0,0,0,0.56)]"
            style={tourPopupStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="betting-tour-title"
          >
            <h2 id="betting-tour-title" className="text-base font-bold text-white">
              {tourStepIndex == null ? 1 : tourStepIndex + 1}. {activeTourStep.title}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-nrl-muted">
              {activeTourStep.body}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={showPreviousTourStep}
                  disabled={tourStepIndex == null || tourStepIndex === 0}
                  className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:border-white/20 hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={showNextTourStep}
                  className="cursor-pointer rounded-md border border-emerald-300/40 bg-emerald-400/12 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/18"
                >
                  {tourStepIndex === BETTING_TOUR_STEPS.length - 1 ? "Done" : "Next"}
                </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function BestBetsHero({
  modelBets,
  arbitrageBets,
  orderedMarkets,
  canAccessPremium,
  teamLogos,
  tryscorerKickoffsByMatch,
  onOpenMarket,
  onOpenBetComposer,
  isTourActive = false,
}: {
  modelBets: BestBetCandidate[];
  arbitrageBets: ArbitrageCandidate[];
  orderedMarkets: BettingMarket[];
  canAccessPremium: boolean;
  teamLogos: Record<string, string>;
  tryscorerKickoffsByMatch: Record<string, string>;
  onOpenMarket: (bet: BestBetCandidate) => void;
  onOpenBetComposer: (selection: BookieBetSlipSelection) => void;
  isTourActive?: boolean;
}) {
  const [category, setCategory] = useState<"model" | "arbitrage">("model");
  const [selectedModelMarket, setSelectedModelMarket] = useState<BestBetMarketFilter>("All");
  const [selectedBestBetIds, setSelectedBestBetIds] = useState<Partial<Record<"model" | "arbitrage", string>>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [weeklyFreeBetId, setWeeklyFreeBetId] = useState<string | null | undefined>(undefined);
  const queueViewportRef = useRef<HTMLDivElement | null>(null);
  const hasAutoSelectedModelMarketRef = useRef(false);
  const isArbitrage = category === "arbitrage";
  const ratedArbitrageBets = useMemo(
    () => [...arbitrageBets].sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
      return a.marketBookPct - b.marketBookPct;
    }),
    [arbitrageBets]
  );
  const modelBetCountsByMarket = useMemo(() => {
    const counts: Record<BettingMarket, number> = {
      H2H: 0,
      Line: 0,
      Margin: 0,
      Total: 0,
      Tryscorer: 0,
    };
    for (const bet of modelBets) {
      counts[bet.market] += 1;
    }
    return counts;
  }, [modelBets]);
  const selectedModelBets = useMemo(
    () => selectedModelMarket === "All"
      ? [...modelBets].sort((a, b) => {
          if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
          return b.edgePp - a.edgePp;
        })
      : modelBets.filter((bet) => bet.market === selectedModelMarket),
    [modelBets, selectedModelMarket]
  );
  const freeBetSelectionBets = useMemo(
    () => selectedModelMarket === "All"
      ? selectedModelBets.filter((bet) => bet.market !== "Total")
      : selectedModelBets,
    [selectedModelBets, selectedModelMarket]
  );
  const weeklyFreeBetCandidatesList = useMemo(
    () => canAccessPremium ? [] : weeklyFreeBetCandidates(freeBetSelectionBets, tryscorerKickoffsByMatch, nowMs),
    [canAccessPremium, freeBetSelectionBets, nowMs, tryscorerKickoffsByMatch]
  );
  const weeklyFreeBet = useMemo(() => {
    if (canAccessPremium) return null;
    if (weeklyFreeBetId == null) return null;
    const bet = freeBetSelectionBets.find((candidate) => candidate.id === weeklyFreeBetId) ?? null;
    if (!bet || !isWeeklyFreeBetEligible(bet, tryscorerKickoffsByMatch, nowMs)) return null;
    return bet;
  }, [canAccessPremium, freeBetSelectionBets, nowMs, tryscorerKickoffsByMatch, weeklyFreeBetId]);
  const activeSelectedBestBetId = selectedBestBetIds[category];
  const activeItems = useMemo(() => {
    if (!isArbitrage) {
      const sortedItems = weeklyFreeBet
        ? [
            weeklyFreeBet,
            ...selectedModelBets.filter((bet) => bet.id !== weeklyFreeBet.id),
          ]
        : selectedModelBets;
      if (!canAccessPremium || !activeSelectedBestBetId) return sortedItems;

      const selectedIndex = sortedItems.findIndex((item) => item.id === activeSelectedBestBetId);
      if (selectedIndex <= 0) return sortedItems;

      const selectedItem = sortedItems[selectedIndex];
      if (!selectedItem) return sortedItems;

      return [
        selectedItem,
        ...sortedItems.slice(0, selectedIndex),
        ...sortedItems.slice(selectedIndex + 1),
      ];
    }

    const sortedItems = isArbitrage ? ratedArbitrageBets : selectedModelBets;
    if (!activeSelectedBestBetId) return sortedItems;

    const selectedIndex = sortedItems.findIndex((item) => item.id === activeSelectedBestBetId);
    if (selectedIndex <= 0) return sortedItems;

    const selectedItem = sortedItems[selectedIndex];
    if (!selectedItem) return sortedItems;

    return [
      selectedItem,
      ...sortedItems.slice(0, selectedIndex),
      ...sortedItems.slice(selectedIndex + 1),
    ];
  }, [activeSelectedBestBetId, canAccessPremium, isArbitrage, ratedArbitrageBets, selectedModelBets, weeklyFreeBet]);
  const hasFeaturedItem = isArbitrage || weeklyFreeBet != null || (!isArbitrage && canAccessPremium && activeItems.length > 0);
  const featuredItem = hasFeaturedItem ? activeItems[0] ?? null : null;
  const queueItems = hasFeaturedItem ? activeItems.slice(1) : activeItems;
  const activeTheme = isArbitrage
    ? {
        label: "Arbitrage",
        pill: "border-violet-400/40 bg-violet-500/10 text-violet-200",
        activeBorder: "border-violet-400/45",
        activeShadow: "shadow-[0_14px_30px_rgba(139,92,246,0.08)]",
        metric: "text-violet-300 drop-shadow-[0_0_10px_rgba(139,92,246,0.24)]",
      }
    : {
        label: canAccessPremium ? "Best Bet" : "Free Bet",
        pill: "border-nrl-accent/45 bg-nrl-accent/12 text-nrl-accent",
        activeBorder: "border-nrl-accent/45",
        activeShadow: "shadow-[0_14px_30px_rgba(0,245,138,0.08)]",
        metric: "text-nrl-accent drop-shadow-[0_0_10px_rgba(0,245,138,0.22)]",
      };

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (selectedModelMarket === "All" || hasAutoSelectedModelMarketRef.current || isArbitrage || modelBetCountsByMarket[selectedModelMarket] > 0) return;
    const firstMarketWithBets = orderedMarkets.find((market) => modelBetCountsByMarket[market] > 0);
    if (!firstMarketWithBets || firstMarketWithBets === selectedModelMarket) return;

    hasAutoSelectedModelMarketRef.current = true;
    const timeoutId = window.setTimeout(() => setSelectedModelMarket(firstMarketWithBets), 0);
    return () => window.clearTimeout(timeoutId);
  }, [isArbitrage, modelBetCountsByMarket, orderedMarkets, selectedModelMarket]);

  useEffect(() => {
    if (isArbitrage || canAccessPremium) return;
    let cancelled = false;
    const key = weeklyFreeBetKey(nowMs, selectedModelMarket);
    const storedValue = window.localStorage.getItem(key);
    let nextId: string | null = null;
    if (storedValue) {
      nextId = storedValue === WEEKLY_FREE_BET_NONE_VALUE ? null : storedValue;
      if (
        (nextId == null && weeklyFreeBetCandidatesList.length > 0) ||
        (nextId != null && !weeklyFreeBetCandidatesList.some((bet) => bet.id === nextId))
      ) {
        nextId = chooseWeeklyFreeBetId(weeklyFreeBetCandidatesList);
        window.localStorage.setItem(key, nextId ?? WEEKLY_FREE_BET_NONE_VALUE);
      }
    } else {
      nextId = chooseWeeklyFreeBetId(weeklyFreeBetCandidatesList);
      window.localStorage.setItem(key, nextId ?? WEEKLY_FREE_BET_NONE_VALUE);
    }

    window.setTimeout(() => {
      if (!cancelled) setWeeklyFreeBetId(nextId);
    }, 0);
    return () => {
      cancelled = true;
    };
  }, [canAccessPremium, isArbitrage, nowMs, selectedModelMarket, weeklyFreeBetCandidatesList]);

  const handleCategoryChange = (nextCategory: "model" | "arbitrage") => {
    setCategory(nextCategory);
    window.requestAnimationFrame(() => {
      if (queueViewportRef.current) queueViewportRef.current.scrollTop = 0;
    });
  };

  const handleModelMarketChange = (market: BestBetMarketFilter) => {
    setSelectedModelMarket(market);
    window.requestAnimationFrame(() => {
      if (queueViewportRef.current) queueViewportRef.current.scrollTop = 0;
    });
  };

  const handleBestBetSelect = (itemId: string) => {
    setSelectedBestBetIds((current) => ({
      ...current,
      [category]: itemId,
    }));
    window.requestAnimationFrame(() => {
      if (queueViewportRef.current) queueViewportRef.current.scrollTop = 0;
    });
  };

  const openBestBetComposer = (bet: BestBetCandidate) => {
    onOpenBetComposer({
      bookie: bet.bestBookie,
      market: bet.market,
      matchDate: bet.date,
      matchName: bet.match,
      selection: bet.selection,
      lineValue: bet.lineValue,
      odds: bet.odds,
      stake: bet.kellyStake,
      modelProbability: bet.modelProbability,
    });
  };

  return (
    <section
      data-betting-tour="best-bets"
      className={`scroll-mt-24 overflow-hidden rounded-lg border border-nrl-border bg-[#10162f]/96 shadow-[0_14px_36px_rgba(0,0,0,0.22)] ${
        isTourActive ? BETTING_TOUR_HIGHLIGHT_CLASS : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className={`${BETTING_PANEL_HEADER_CLASS} text-nrl-text`}>
          Best Bets
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleCategoryChange("model")}
            className={`rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
              category === "model"
                ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                : "cursor-pointer border-white/10 bg-white/[0.03] text-nrl-muted hover:border-emerald-300/40 hover:text-nrl-text"
            }`}
          >
            Best Bets <span className="ml-1 text-nrl-muted">{modelBets.length}</span>
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

      {!isArbitrage ? (
        <div className="flex gap-2 overflow-x-auto border-b border-white/8 px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => handleModelMarketChange("All")}
            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] transition-colors ${
              selectedModelMarket === "All"
                ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                : "cursor-pointer border-white/10 bg-white/[0.03] text-nrl-muted hover:border-emerald-300/40 hover:text-nrl-text"
            }`}
          >
            All <span className="ml-1 text-nrl-muted">{modelBets.length}</span>
          </button>
          {orderedMarkets.map((market) => {
            const active = selectedModelMarket === market;
            return (
              <button
                key={`best-bets-market-${market}`}
                type="button"
                onClick={() => handleModelMarketChange(market)}
                className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                    : "cursor-pointer border-white/10 bg-white/[0.03] text-nrl-muted hover:border-emerald-300/40 hover:text-nrl-text"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{formatBestBetMarketLabel(market)}</span>
                  {market === TOTAL_MODEL_BETA_MARKET ? <TotalModelBetaBadge /> : null}
                </span>
                <span className="ml-1 text-nrl-muted">{modelBetCountsByMarket[market]}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {activeItems.length === 0 ? (
        <div className="border-t border-white/8 px-4 py-2.5 text-sm text-nrl-muted sm:px-5">
          {isArbitrage
            ? "No arbitrage markets currently identified."
            : !canAccessPremium
              ? "No free bets available"
              : selectedModelMarket === "All"
                ? "No strong model value currently identified."
                : `No strong ${formatBestBetMarketLabel(selectedModelMarket).toLowerCase()} model value currently identified.`}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {featuredItem ? (
            <>
          {!isArbitrage ? (
            <div className="flex items-center justify-between gap-3 px-1 py-1.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-nrl-text">
                {canAccessPremium ? "Best Bet" : "Free Bet"}
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-nrl-muted">
                {formatBestBetMarketLabel((featuredItem as BestBetCandidate).market)}
              </div>
            </div>
          ) : null}
          <article
            onClick={!isArbitrage ? () => onOpenMarket(featuredItem as BestBetCandidate) : undefined}
            className={`rounded-lg border bg-[#14213b] px-3 py-3 sm:px-4 ${activeTheme.activeBorder} ${activeTheme.activeShadow} ${!isArbitrage ? "mb-8 cursor-pointer transition-colors hover:bg-[#172743]" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {isArbitrage ? (
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${activeTheme.pill}`}>
                      {activeTheme.label}
                    </span>
                  ) : null}
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
              <div className="flex w-auto shrink-0 justify-end sm:w-52 sm:justify-center">
                {isArbitrage ? (
                  <>
                    <div className={`text-3xl font-bold leading-none sm:text-4xl ${activeTheme.metric}`}>
                      +{(featuredItem as ArbitrageCandidate).returnPct.toFixed(2)}%
                    </div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                      return
                    </div>
                  </>
                ) : (
                  <>
                    {canAccessPremium ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const bet = featuredItem as BestBetCandidate;
                          openBestBetComposer(bet);
                        }}
                        aria-label="Add to bet tracker"
                        className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-emerald-300/35 bg-emerald-400/10 text-emerald-300 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/16 hover:text-emerald-200 sm:hidden"
                      >
                        <span aria-hidden="true" className="absolute h-4 w-0.5 rounded-full bg-current" />
                        <span aria-hidden="true" className="absolute h-0.5 w-4 rounded-full bg-current" />
                      </button>
                    ) : null}
                    <div className="hidden flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 shadow-[0_8px_18px_rgba(2,6,23,0.16)] sm:inline-flex">
                      <BetScoreStars
                        score={(featuredItem as BestBetCandidate).score}
                        blurred={false}
                        className="text-2xl sm:text-3xl"
                      />
                      <span className="inline-flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-nrl-muted">
                        Edge <span className="text-nrl-text">+{(featuredItem as BestBetCandidate).edgePp.toFixed(2)}%</span>
                        {isSuspiciousEdge((featuredItem as BestBetCandidate).edgePp) ? <SuspiciousEdgeCaution /> : null}
                      </span>
                    </div>
                  </>
                )}
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
                <div className="relative border-t border-white/8 pt-3 text-xs">
                  <div className="flex max-w-[11.5rem] flex-col items-start gap-y-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:pr-52">
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
                      <OtherBookiePrices prices={(featuredItem as BestBetCandidate).otherBookiePrices} />
                    </div>
                  </div>
                  {canAccessPremium ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const bet = featuredItem as BestBetCandidate;
                        openBestBetComposer(bet);
                      }}
                      aria-label="Add to bet tracker"
                      className="absolute right-0 top-3 hidden h-8 w-52 cursor-pointer place-items-center text-emerald-300 sm:grid"
                    >
                      <span className="relative grid h-8 w-8 place-items-center rounded-full border border-emerald-300/35 bg-emerald-400/10 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/16 hover:text-emerald-200">
                        <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                        <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                      </span>
                    </button>
                  ) : null}
                  <div className="absolute right-2 top-5 flex justify-end sm:hidden">
                    <div className="inline-flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 shadow-[0_8px_18px_rgba(2,6,23,0.16)]">
                      <BetScoreStars
                        score={(featuredItem as BestBetCandidate).score}
                        blurred={false}
                        className="text-2xl"
                      />
                      <span className="inline-flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-nrl-muted">
                        Edge <span className="text-nrl-text">+{(featuredItem as BestBetCandidate).edgePp.toFixed(2)}%</span>
                        {isSuspiciousEdge((featuredItem as BestBetCandidate).edgePp) ? <SuspiciousEdgeCaution /> : null}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </article>
            </>
          ) : null}

          {queueItems.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div className={`text-[9px] font-bold uppercase tracking-[0.16em] ${isArbitrage ? "text-violet-200" : "text-nrl-text"}`}>
                  {isArbitrage ? "More Arbitrage" : "Premium Bets"}
                </div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-nrl-muted">
                  {queueItems.length} {queueItems.length === 1 ? "pick" : "picks"}
                </div>
              </div>
              <div className="relative rounded-lg border border-white/8 bg-[#0f1732]/70">
                <div
                  ref={queueViewportRef}
                  className={`${!canAccessPremium ? "h-12 select-none opacity-75" : isArbitrage ? "max-h-[176px] space-y-1.5" : "max-h-[236px] space-y-3"} overflow-y-auto overscroll-contain p-2 pr-1 [scrollbar-color:rgba(148,163,184,0.32)_transparent]`}
                >
                {!canAccessPremium ? (
                  <div className="grid h-full place-items-center">
                    <BillingPageLink
                      className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted transition-colors hover:border-emerald-300/35 hover:text-nrl-text"
                      aria-label="View premium billing"
                    >
                      <span aria-hidden="true" className="grayscale">🔒</span>
                      Premium
                    </BillingPageLink>
                  </div>
                ) : queueItems.map((item) => {
                  const isLocked = !canAccessPremium;
                  const rowContent = isArbitrage ? (
                    <div className={`flex min-h-[38px] items-center justify-between gap-3 rounded-md border border-white/8 bg-nrl-panel/72 px-2.5 py-1.5 text-left transition-colors ${canAccessPremium ? "hover:border-white/20" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-sm border px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] ${activeTheme.pill}`}>
                            {activeTheme.label}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">H2H</span>
                          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                            {formatEventCountdown(item, tryscorerKickoffsByMatch, nowMs)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-white">
                          {!isLocked ? (
                            <MatchLogoCluster match={(item as ArbitrageCandidate).match} teamLogos={teamLogos} className="h-4 w-4" />
                          ) : null}
                          <span className="truncate">{isLocked ? "Selection hidden" : (item as ArbitrageCandidate).match}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-semibold text-nrl-muted">
                          {isLocked ? (
                            <span>Odds hidden</span>
                          ) : (
                            (item as ArbitrageCandidate).stakes.slice(0, 2).map((stake) => (
                              <span key={`${item.id}-${stake.selection}`} className="inline-flex items-center gap-0.5">
                                {stake.bookies.slice(0, 1).map((bookie) => (
                                  <BookieLogo key={`${item.id}-${stake.selection}-${bookie}`} bookie={bookie} compact />
                                ))}
                                <span>{formatPrice(stake.odds)}</span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {isLocked ? (
                          <div className="text-base font-bold leading-none text-nrl-muted">ARB</div>
                        ) : (
                          <>
                            <div className={`text-base font-bold leading-none ${activeTheme.metric}`}>
                              +{(item as ArbitrageCandidate).returnPct.toFixed(2)}%
                            </div>
                            <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-nrl-muted">return</div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={`rounded-lg border border-white/8 bg-[#14213b] px-3 py-3 text-left transition-colors ${canAccessPremium ? "hover:border-emerald-300/35 hover:bg-[#172743]" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                              {isLocked ? "Locked" : (item as BestBetCandidate).market}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">
                              {formatEventCountdown(item, tryscorerKickoffsByMatch, nowMs)}
                            </span>
                          </div>
                          <div className="mt-2 flex min-w-0 items-center gap-2 text-lg font-semibold leading-tight text-white">
                            {!isLocked ? (
                              <BettingTeamLogos
                                selection={(item as BestBetCandidate).selection}
                                match={(item as BestBetCandidate).match}
                                market={(item as BestBetCandidate).market}
                                teamLogos={teamLogos}
                                className="h-6 w-6"
                              />
                            ) : null}
                            <span className="min-w-0 truncate">
                              {isLocked ? "Selection hidden" : (item as BestBetCandidate).selectionLabel}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-xs text-nrl-muted">
                            {isLocked ? "Match hidden" : (item as BestBetCandidate).match}
                          </div>
                        </div>
                        <div className="flex w-auto shrink-0 justify-end sm:w-52 sm:justify-center">
                          {isLocked ? (
                            <div className="text-lg font-bold leading-none text-nrl-muted">+EV</div>
                          ) : (
                            <>
                              {!isLocked && canAccessPremium ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const bet = item as BestBetCandidate;
                                    openBestBetComposer(bet);
                                  }}
                                  aria-label="Add to bet tracker"
                                  className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-emerald-300/35 bg-emerald-400/10 text-emerald-300 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/16 hover:text-emerald-200 sm:hidden"
                                >
                                  <span aria-hidden="true" className="absolute h-4 w-0.5 rounded-full bg-current" />
                                  <span aria-hidden="true" className="absolute h-0.5 w-4 rounded-full bg-current" />
                                </button>
                              ) : null}
                              <div className="hidden flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 shadow-[0_8px_18px_rgba(2,6,23,0.16)] sm:inline-flex">
                                <BetScoreStars score={(item as BestBetCandidate).score} blurred={false} className="text-xl" />
                                <span className="inline-flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted">
                                  Edge <span className="text-nrl-text">+{(item as BestBetCandidate).edgePp.toFixed(2)}%</span>
                                  {isSuspiciousEdge((item as BestBetCandidate).edgePp) ? <SuspiciousEdgeCaution /> : null}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="relative mt-3 border-t border-white/8 pt-3 text-xs">
                        <div className="flex max-w-[11.5rem] flex-col items-start gap-y-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:pr-52">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-nrl-muted">Best odds</div>
                            <div className="mt-0.5 flex items-center gap-2 text-white">
                              {isLocked ? (
                                <span className="font-semibold text-nrl-muted">Hidden</span>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1">
                                    {(item as BestBetCandidate).bestBookies.slice(0, 3).map((bookie) => (
                                      <BookieLogo key={`${item.id}-${bookie}`} bookie={bookie} compact />
                                    ))}
                                  </div>
                                  <span className="text-base font-bold">{formatPrice((item as BestBetCandidate).odds)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mt-0.5">
                              {isLocked ? (
                                <span className="text-nrl-muted">Hidden</span>
                              ) : (
                                <OtherBookiePrices prices={(item as BestBetCandidate).otherBookiePrices} />
                              )}
                            </div>
                          </div>
                        </div>
                        {!isLocked && canAccessPremium ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const bet = item as BestBetCandidate;
                              openBestBetComposer(bet);
                            }}
                            aria-label="Add to bet tracker"
                            className="absolute right-0 top-3 hidden h-8 w-52 cursor-pointer place-items-center text-emerald-300 sm:grid"
                          >
                            <span className="relative grid h-8 w-8 place-items-center rounded-full border border-emerald-300/35 bg-emerald-400/10 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/16 hover:text-emerald-200">
                              <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                              <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                            </span>
                          </button>
                        ) : null}
                        {!isLocked ? (
                          <div className="absolute right-2 top-5 flex justify-end sm:hidden">
                            <div className="inline-flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 shadow-[0_8px_18px_rgba(2,6,23,0.16)]">
                              <BetScoreStars score={(item as BestBetCandidate).score} blurred={false} className="text-2xl" />
                              <span className="inline-flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-nrl-muted">
                                Edge <span className="text-nrl-text">+{(item as BestBetCandidate).edgePp.toFixed(2)}%</span>
                                {isSuspiciousEdge((item as BestBetCandidate).edgePp) ? <SuspiciousEdgeCaution /> : null}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );

                  return isLocked ? (
                    <div key={item.id} className="relative overflow-hidden rounded-md">
                      {rowContent}
                    </div>
                  ) : isArbitrage ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleBestBetSelect(item.id)}
                      className="block w-full cursor-pointer"
                    >
                      {rowContent}
                    </button>
                  ) : (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenMarket(item as BestBetCandidate)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenMarket(item as BestBetCandidate);
                        }
                      }}
                      className="block w-full cursor-pointer"
                    >
                      {rowContent}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function gameJumpAnchorId(group: EventGroup): string {
  return `betting-game-${normaliseLookupKey(`${group.date} ${group.match} ${group.market}`).replace(/\s+/g, "-")}`;
}

function MarketTabsRail({
  orderedMarkets,
  selectedMarket,
  onMarketChange,
}: {
  orderedMarkets: BettingMarket[];
  selectedMarket: BettingMarket;
  onMarketChange: (market: BettingMarket) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [pinState, setPinState] = useState({
    pinned: false,
    height: 0,
    left: 0,
    top: 0,
    width: 0,
  });

  useEffect(() => {
    const updatePinState = () => {
      const sentinel = sentinelRef.current;
      const rail = railRef.current;
      const container = sentinel?.parentElement;
      if (!sentinel || !rail || !container) return;

      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const top = Math.max(0, Math.round(headerBottom));
      const containerRect = container.getBoundingClientRect();
      const pinned = sentinel.getBoundingClientRect().top <= top;
      const next = {
        pinned,
        height: rail.offsetHeight,
        left: containerRect.left,
        top,
        width: containerRect.width,
      };

      setPinState((current) => (
        current.pinned === next.pinned &&
        current.height === next.height &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width
          ? current
          : next
      ));
    };

    updatePinState();
    window.addEventListener("scroll", updatePinState, { passive: true });
    window.addEventListener("resize", updatePinState);
    return () => {
      window.removeEventListener("scroll", updatePinState);
      window.removeEventListener("resize", updatePinState);
    };
  }, []);

  return (
    <div className="min-w-0">
      <div ref={sentinelRef} aria-hidden="true" className="h-0" />
      {pinState.pinned ? <div aria-hidden="true" style={{ height: pinState.height }} /> : null}
      <div
        ref={railRef}
        data-betting-market-tabs
        className="z-50 flex flex-wrap gap-2 rounded-xl border border-nrl-border bg-nrl-panel/95 p-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.22)] backdrop-blur"
        style={pinState.pinned ? {
          left: pinState.left,
          position: "fixed",
          top: pinState.top,
          width: pinState.width,
        } : undefined}
      >
        {orderedMarkets.map((tab) => {
          const active = tab === selectedMarket;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onMarketChange(tab)}
              className={`rounded-md border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-300"
                  : "cursor-pointer border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-emerald-300/40 hover:text-nrl-text"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{tab}</span>
                {tab === TOTAL_MODEL_BETA_MARKET ? <TotalModelBetaBadge /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameJumpSidebar({
  groups,
  teamLogos,
}: {
  groups: EventGroup[];
  teamLogos: Record<string, string>;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const [pinState, setPinState] = useState({
    pinned: false,
    height: 0,
    left: 0,
    top: 0,
    width: 0,
  });

  const groupsByDate = groups.reduce((acc, group) => {
    const existing = acc.get(group.date);
    if (existing) {
      existing.push(group);
      return acc;
    }
    acc.set(group.date, [group]);
    return acc;
  }, new Map<string, EventGroup[]>());

  useEffect(() => {
    const updatePinState = () => {
      const sentinel = sentinelRef.current;
      const rail = railRef.current;
      const container = sentinel?.parentElement;
      if (!sentinel || !rail || !container) return;

      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const marketTabsBottom = document.querySelector("[data-betting-market-tabs]")?.getBoundingClientRect().bottom ?? 0;
      const top = Math.max(0, Math.round(Math.max(headerBottom, marketTabsBottom)));
      const containerRect = container.getBoundingClientRect();
      const pinned = sentinel.getBoundingClientRect().top <= top;
      const next = {
        pinned,
        height: rail.offsetHeight,
        left: containerRect.left,
        top,
        width: containerRect.width,
      };

      setPinState((current) => (
        current.pinned === next.pinned &&
        current.height === next.height &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width
          ? current
          : next
      ));
    };

    updatePinState();
    window.addEventListener("scroll", updatePinState, { passive: true });
    window.addEventListener("resize", updatePinState);
    return () => {
      window.removeEventListener("scroll", updatePinState);
      window.removeEventListener("resize", updatePinState);
    };
  }, []);

  if (groups.length <= 1) return null;

  return (
    <div className="min-w-0">
      <div ref={sentinelRef} aria-hidden="true" className="h-0" />
      {pinState.pinned ? <div aria-hidden="true" style={{ height: pinState.height }} /> : null}
      <aside
        ref={railRef}
        className="z-40 min-w-0"
        style={pinState.pinned ? {
          left: pinState.left,
          position: "fixed",
          top: pinState.top,
          width: pinState.width,
        } : undefined}
      >
        <div className="flex gap-6 overflow-x-auto rounded-xl border border-nrl-border bg-nrl-panel p-2 shadow-[0_10px_26px_rgba(0,0,0,0.22)] [scrollbar-width:thin] sm:gap-7">
          {[...groupsByDate.entries()].map(([date, dateGroups]) => (
            <div key={`jump-date-${date}`} className="flex shrink-0 gap-1.5 rounded-lg border border-nrl-border/60 bg-nrl-panel-2/45 p-1.5">
              <div className="flex w-6 shrink-0 rotate-180 items-center justify-center rounded bg-nrl-panel text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-300 [writing-mode:vertical-rl] xl:h-auto xl:w-auto xl:rotate-0 xl:px-1.5 xl:py-1 xl:[writing-mode:horizontal-tb]">
                {formatCompactDateLabel(date)}
              </div>
              <div className="flex gap-1.5">
                {dateGroups.map((group) => {
                  const { home, away } = parseMatch(group.match);
                  const label = `${home}${away ? ` vs ${away}` : ""} - ${formatDateLabel(group.date)}`;

                  return (
                    <button
                      key={`jump-${group.key}`}
                      type="button"
                      title={label}
                      aria-label={`Skip to ${label}`}
                      onClick={() => document.getElementById(gameJumpAnchorId(group))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="flex min-w-[82px] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-nrl-border bg-nrl-panel-2 px-2 py-2 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/10"
                    >
                      <TeamLogoBadge teamName={home || group.match} teamLogos={teamLogos} />
                      {away ? (
                        <>
                          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-nrl-muted xl:leading-none">vs</span>
                          <TeamLogoBadge teamName={away} teamLogos={teamLogos} />
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
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
  playerImages,
  teamLogos,
  tryscorerFormByPlayer,
  tryscorerLastFiveVsOpponentByMatch,
  tryscorerKickoffsByMatch,
  lineupPlayersByMatch,
  lineupLinksByMatchKey,
  teamFormByMatchKey,
  market,
  todayIso,
  jumpTarget,
  showPastMarkets,
  onStakeOverride,
  onOddsOverride,
  onOpenBetComposer,
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
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
  tryscorerFormByPlayer: Record<string, TryscorerFormSummary>;
  tryscorerLastFiveVsOpponentByMatch: Record<string, unknown>;
  tryscorerKickoffsByMatch: Record<string, string>;
  lineupPlayersByMatch: Record<string, unknown>;
  lineupLinksByMatchKey: Record<string, string>;
  teamFormByMatchKey: Record<string, string[]>;
  market: BettingMarket;
  todayIso: string;
  jumpTarget: BettingMarketJumpTarget | null;
  showPastMarkets?: boolean;
  onStakeOverride: (key: string, value: number) => void;
  onOddsOverride: (key: string, value: number) => void;
  onOpenBetComposer: (selection: BookieBetSlipSelection) => void;
}) {
  const [tryscorerValueByGroup, setTryscorerValueByGroup] = useState<Record<string, number>>({});
  const [collapsedTryscorerGroups, setCollapsedTryscorerGroups] = useState<Record<string, boolean>>({});
  const [tryscorerSortKey, setTryscorerSortKey] = useState<TryscorerSortKey>("betRating");
  const [tryscorerSortDirection, setTryscorerSortDirection] = useState<TryscorerSortDirection>("best");
  const [selectedTryscorerProfile, setSelectedTryscorerProfile] = useState<TryscorerProfileSelection | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const processedMarketJumpIdRef = useRef<number | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeGroups = groups
    .filter((group) => {
      if (showPastMarkets) return true;
      const kickoffKey = buildMatchKickoffKey(group.date, group.match);
      const kickoff = kickoffKey ? tryscorerKickoffsByMatch[kickoffKey] : null;
      if (!kickoff) {
        const groupDateMs = Date.parse(`${group.date}T23:59:59`);
        return !Number.isFinite(groupDateMs) || nowMs <= groupDateMs;
      }
      const kickoffMs = Date.parse(kickoff);
      return !Number.isFinite(kickoffMs) || nowMs < kickoffMs;
    })
    .sort((a, b) => compareGroupsByKickoff(a, b, tryscorerKickoffsByMatch));

  useEffect(() => {
    if (!jumpTarget || jumpTarget.market !== market) return;
    if (processedMarketJumpIdRef.current === jumpTarget.id) return;

    const targetGroup = activeGroups.find((group) =>
      group.market === jumpTarget.market &&
      group.date === jumpTarget.date &&
      buildMatchGroupKey(group.match) === buildMatchGroupKey(jumpTarget.match)
    );
    if (!targetGroup) return;
    processedMarketJumpIdRef.current = jumpTarget.id;

    window.requestAnimationFrame(() => {
      if (market === "Tryscorer" && jumpTarget.lineValue != null) {
        setTryscorerValueByGroup((current) =>
          current[targetGroup.key] === jumpTarget.lineValue
            ? current
            : { ...current, [targetGroup.key]: jumpTarget.lineValue ?? 1 }
        );
        setCollapsedTryscorerGroups((current) =>
          current[targetGroup.key] === false
            ? current
            : { ...current, [targetGroup.key]: false }
        );
      }

      window.requestAnimationFrame(() => {
        document.getElementById(gameJumpAnchorId(targetGroup))?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [activeGroups, jumpTarget, market]);

  const defaultExpandedTryscorerGroupKey = market === "Tryscorer"
    ? activeGroups.find((group) => group.market === "Tryscorer")?.key ?? null
    : null;

  const visibleTryscorerImageSources = useMemo(() => {
    if (market !== "Tryscorer") return [];
    const sources = new Set<string>();
    activeGroups.forEach((group) => {
      if (group.market !== "Tryscorer") return;
      const collapsed = collapsedTryscorerGroups[group.key] ?? group.key !== defaultExpandedTryscorerGroupKey;
      if (collapsed) return;
      const selectedTryscorerValue = tryscorerValueByGroup[group.key] ?? 1;
      group.outcomes
        .filter((row) => row.bestValueComputed === selectedTryscorerValue)
        .forEach((row) => {
          const profile = resolveTryscorerProfile({
            playerName: row.result,
            match: group.match,
            tryscorerFormByPlayer,
            playerTeamsByName,
            playerImages,
          });
          const source = normalizePlayerImageUrl(profile.image);
          if (source) sources.add(source);
        });
    });
    return [...sources];
  }, [activeGroups, collapsedTryscorerGroups, defaultExpandedTryscorerGroupKey, market, playerImages, playerTeamsByName, tryscorerFormByPlayer, tryscorerValueByGroup]);
  const visibleTryscorerImagesReady = useBatchedImagePreload(visibleTryscorerImageSources);

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
  const showGameJumpSidebar = activeGroups.length > 1;

  return (
    <div className="space-y-4">
      <TryscorerProfileDialog selection={selectedTryscorerProfile} onClose={() => setSelectedTryscorerProfile(null)} />
      {showGameJumpSidebar ? <GameJumpSidebar groups={activeGroups} teamLogos={teamLogos} /> : null}
      <div className="space-y-7">
        {[...groupsByDate.entries()].map(([date, dateGroups]) => (
          <section key={date} className="space-y-7 rounded-xl border border-nrl-border bg-nrl-panel p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <h2 className={`${BETTING_PANEL_HEADER_CLASS} shrink-0 text-white`}>
              {formatDateLabel(date)}
            </h2>
            <div className="h-px flex-1 bg-nrl-border/70" />
          </div>
          {dateGroups.map((group, groupIndex) => {
            const { home, away } = parseMatch(group.match);
            const lineupHref = lineupLinksByMatchKey[`${group.date}|${buildMatchGroupKey(group.match)}`] ?? null;
            const teamListsProcessed = hasAnnouncedLineupsForGroup(group, lineupPlayersByMatch);
            const kickoffKey = buildMatchKickoffKey(group.date, group.match);
            const eventKickoff = kickoffKey ? tryscorerKickoffsByMatch[kickoffKey] ?? null : null;
            const showModelColumns = group.market !== "Tryscorer" || group.outcomes.some((row) => row.bestModelComputed != null);
            const blurPremiumColumns = !canAccessPremium && showModelColumns;
            const collapsed = group.market === "Tryscorer" && (
              collapsedTryscorerGroups[group.key] ?? group.key !== defaultExpandedTryscorerGroupKey
            );
            const selectedTryscorerValue = tryscorerValueByGroup[group.key] ?? 1;
            const filteredOutcomes = collapsed
              ? []
              : group.market === "Tryscorer"
              ? group.outcomes.filter((row) => row.bestValueComputed === selectedTryscorerValue)
              : group.outcomes;
            const effectiveTryscorerSortKey = canAccessPremium ? tryscorerSortKey : "odds";
            const sortMetric = (row: OutcomeRow, sortKey: TryscorerSortKey): number | null => {
              const betRowKey = `${group.date}|${group.match}|${group.market}|${row.result}|${row.bestValueComputed ?? ""}`;
              const oddsValue = oddsOverrides[betRowKey] ?? row.bestPriceComputed;
              if (sortKey === "odds") return oddsValue;
              const implied = impliedProbability(oddsValue);
              const modelProbability = showModelColumns ? modelPercentToProbability(row.bestModelComputed) : null;
              const edgePp = modelProbability != null && implied != null ? (modelProbability - implied) * 100 : null;
              if (sortKey === "edge") return edgePp;
              if (edgePp == null) return null;
              const marketSignals = buildMarketSignals(row, group.marketPctFromBest);
              return calculateBetScore({
                edgePp,
                eventDate: group.date,
                eventKickoff,
                nowMs,
                todayIso,
                efficiencyScore: marketSignals.efficiencyScore,
                disagreementScore: marketSignals.disagreementScore,
                teamListsProcessed,
              });
            };
            const visibleOutcomes = group.market === "Tryscorer"
              ? [...filteredOutcomes].sort((left, right) => {
                  const leftValue = sortMetric(left, effectiveTryscorerSortKey);
                  const rightValue = sortMetric(right, effectiveTryscorerSortKey);
                  if (leftValue == null && rightValue == null) return left.result.localeCompare(right.result);
                  if (leftValue == null) return 1;
                  if (rightValue == null) return -1;
                  const comparison = effectiveTryscorerSortKey === "odds"
                    ? leftValue - rightValue
                    : rightValue - leftValue;
                  return tryscorerSortDirection === "best"
                    ? comparison || left.result.localeCompare(right.result)
                    : -comparison || left.result.localeCompare(right.result);
                })
              : filteredOutcomes;
            const visibleBookieColumns = BETTING_BOOKIE_COLUMNS.filter((bookie) =>
              visibleOutcomes.some((row) => row.bookieOffers[bookie] != null)
            );
            return (
              <article
                id={gameJumpAnchorId(group)}
                key={group.key}
                className={`scroll-mt-24 ${groupIndex === 0 ? "" : "border-t border-nrl-border/70 pt-8"} md:rounded-xl md:border md:border-nrl-border md:bg-nrl-panel-2/35 md:p-4`}
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
                  <div className="flex items-center gap-2">
                    {lineupHref ? (
                      <Link
                        href={lineupHref}
                        className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-nrl-muted transition-colors hover:border-emerald-300/40 hover:text-nrl-text"
                      >
                        Matches
                      </Link>
                    ) : null}
                    {group.market === "Tryscorer" ? (
                      <button
                        type="button"
                        aria-label={collapsed ? "Expand game" : "Collapse game"}
                        onClick={() => setCollapsedTryscorerGroups((current) => ({
                          ...current,
                          [group.key]: !collapsed,
                        }))}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-emerald-300/40 hover:text-nrl-text"
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
                </div>
                {group.market === "Tryscorer" ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
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
                                ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-300"
                                : hasRows
                                  ? "cursor-pointer border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-emerald-300/40 hover:text-nrl-text"
                                  : "cursor-not-allowed border-nrl-border bg-nrl-panel-2 text-nrl-muted opacity-45"
                            }`}
                          >
                            {value}+
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg border border-nrl-border bg-nrl-panel-2 p-1">
                      <label className="flex items-center gap-1.5">
                        <span className="px-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-nrl-muted">Sort</span>
                        <select
                          value={canAccessPremium ? tryscorerSortKey : "odds"}
                          onChange={(event) => setTryscorerSortKey(event.target.value as TryscorerSortKey)}
                          className="h-6 rounded-md border border-nrl-border bg-nrl-panel px-2 text-[10px] font-black uppercase tracking-[0.08em] text-nrl-text outline-none transition-colors hover:border-emerald-300/40 focus:border-nrl-accent"
                        >
                          {TRYS_CORER_SORT_OPTIONS.map((option) => (
                            <option key={`${group.key}-sort-${option.key}`} value={option.key} disabled={!canAccessPremium && option.key !== "odds"}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        aria-label={tryscorerSortDirection === "best" ? "Sort worst to best" : "Sort best to worst"}
                        title={tryscorerSortDirection === "best" ? "Best to worst" : "Worst to best"}
                        onClick={() => setTryscorerSortDirection((current) => current === "best" ? "worst" : "best")}
                        className="grid h-6 w-6 place-items-center rounded-md border border-nrl-border text-[11px] font-black text-nrl-muted transition-colors hover:border-emerald-300/40 hover:text-nrl-text"
                      >
                        {tryscorerSortDirection === "best" ? "↓" : "↑"}
                      </button>
                    </div>
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
                    const overEdgeCliff = edgeDecimal != null && edgeDecimal > (maxEdge ?? DEFAULT_MAX_EDGE);
                    const suspiciousEdge = isSuspiciousEdge(edgePp);
                    const marketSignals = buildMarketSignals(row, group.marketPctFromBest);
                    const betScore = edgePp == null ? null : calculateBetScore({
                      edgePp,
                      eventDate: group.date,
                      eventKickoff,
                      nowMs,
                      todayIso,
                      efficiencyScore: marketSignals.efficiencyScore,
                      disagreementScore: marketSignals.disagreementScore,
                      teamListsProcessed,
                    });
                    const kellyProbability = modelProbability != null && implied != null
                      ? adjustedKellyProbability({
                          modelProbability,
                          impliedProbability: implied,
                          eventDate: group.date,
                          todayIso,
                          liquidityScore: marketSignals.liquidityScore,
                          efficiencyScore: marketSignals.efficiencyScore,
                          disagreementScore: marketSignals.disagreementScore,
                        })
                      : null;
                    const bankrollValue = bankroll ?? 0;
                    const percentageStakeDecimal = clamp((percentageStakePct ?? 0) / 100, 0, 1);
                    const targetProfitDecimal = clamp((targetProfitPct ?? 0) / 100, 0, 1);
                    const fullKelly = kellyProbability != null && oddsValue != null
                      ? kellyFraction(kellyProbability, oddsValue)
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
                    const recommendedStake = Math.max(0, Math.round(scaledStake ?? 0));
                    const stakeValue = stakeOverrides[betRowKey] ?? recommendedStake;
                    const canOpenMobileBet = oddsValue != null && oddsValue > 1;
                    const tryscorerProfile = group.market === "Tryscorer"
                      ? resolveTryscorerProfile({
                          playerName: row.result,
                          match: group.match,
                          tryscorerFormByPlayer,
                          playerTeamsByName,
                          playerImages,
                        })
                      : null;
                    const tryscorerForm = tryscorerProfile?.form ?? null;
                    const playerTeam = tryscorerProfile?.team ?? null;
                    const outcomeLogoTeam = group.market === "Tryscorer" ? playerTeam : row.result;
                    const tryscorerOpponent = group.market === "Tryscorer" ? opponentForTryscorer(group.match, playerTeam) : null;
                    const opponentLastFive = group.market === "Tryscorer"
                      ? lookupTryscorerVsOpponentLastFive({
                          source: tryscorerLastFiveVsOpponentByMatch,
                          date: group.date,
                          match: group.match,
                          player: row.result,
                          opponent: tryscorerOpponent,
                        })
                      : [];
                    const openTryscorerProfile = tryscorerForm
                      ? () => setSelectedTryscorerProfile({
                          form: tryscorerForm,
                          opponentLastFive,
                          bestPrice: row.bestPriceComputed,
                          bestBookies: row.bestBookiesComputed,
                          modelProbability: canAccessPremium ? modelProbability : null,
                          match: group.match,
                          opponent: tryscorerOpponent,
                        })
                      : undefined;
                    const teamLastFive = group.market === "Tryscorer"
                      ? []
                      : lookupTeamLastFiveForm({
                          formByMatchKey: teamFormByMatchKey,
                          date: group.date,
                          match: group.match,
                          selection: row.result,
                        });
                    const mobileBetAction = canAccessPremium ? (
                      <button
                        type="button"
                        disabled={!canOpenMobileBet}
                        aria-label="Add bet"
                        onClick={(event) => {
                          event.stopPropagation();
                          const bookie = row.bestOfferComputed?.bookie;
                          if (!canOpenMobileBet || oddsValue == null || !bookie) return;
                          onOpenBetComposer({
                            bookie,
                            market: group.market,
                            matchDate: group.date,
                            matchName: group.match,
                            selection: row.result,
                            lineValue: row.bestValueComputed,
                            odds: oddsValue,
                            stake: stakeValue,
                            modelProbability,
                          });
                        }}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-base font-black leading-none ${
                          canOpenMobileBet
                            ? "cursor-pointer border-nrl-accent/55 bg-nrl-accent/12 text-nrl-accent hover:bg-nrl-accent/18"
                            : "cursor-not-allowed border-nrl-border text-nrl-muted opacity-60"
                        }`}
                      >
                        +
                      </button>
                    ) : null;

                    return (
                      <div
                        key={`${group.key}-mobile-${row.result}-${row.bestValueComputed ?? ""}`}
                        role={openTryscorerProfile ? "button" : undefined}
                        tabIndex={openTryscorerProfile ? 0 : undefined}
                        onClick={openTryscorerProfile}
                        onKeyDown={(event) => {
                          if (!openTryscorerProfile || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          openTryscorerProfile();
                        }}
                        className={`rounded-lg border border-nrl-border/70 bg-nrl-panel-2/45 px-3 py-4 shadow-[0_10px_24px_rgba(2,6,23,0.12)] ${openTryscorerProfile ? "cursor-pointer transition-colors hover:border-emerald-300/35" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-3.5">
                            {group.market === "Tryscorer" ? (
                              <PlayerProfileImage
                                image={tryscorerProfile?.image ?? null}
                                name={row.result}
                                className="mt-0.5 h-9 w-9 p-0.5"
                                reveal={visibleTryscorerImagesReady}
                              />
                            ) : (
                              <TeamLogoImage teamName={outcomeLogoTeam} teamLogos={teamLogos} className="mt-0.5 h-4 w-4" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-y-3 text-xs font-semibold text-nrl-text">
                                <span className="min-w-0 truncate pr-1">{row.result}</span>
                                <div className="flex flex-col gap-3.5">
                                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-nrl-muted">
                                      Best:
                                      <span className="text-nrl-text tabular-nums">{formatPrice(row.bestPriceComputed)}</span>
                                      <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
                                        {row.bestBookiesComputed.map((bookie) => (
                                          <BookieLogo key={`${group.key}-mobile-${row.result}-best-${bookie}`} bookie={bookie} compact />
                                        ))}
                                      </span>
                                    </span>
                                    {showModelColumns ? (
                                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-nrl-muted">
                                        Edge:
                                        {blurPremiumColumns ? (
                                          <span aria-hidden="true" className="text-[9px] opacity-55 grayscale">🔒</span>
                                        ) : null}
                                        {blurPremiumColumns ? (
                                          <PremiumValueMask className="w-10" />
                                        ) : (
                                          <span
                                            className={`tabular-nums ${
                                              edgePp == null
                                                ? "text-nrl-muted"
                                                : edgePp < 0
                                                  ? "text-red-400"
                                                  : "text-nrl-accent"
                                            }`}
                                          >
                                            {formatEdge(edgePp)}
                                          </span>
                                        )}
                                        {!blurPremiumColumns && suspiciousEdge ? <SuspiciousEdgeCaution /> : null}
                                      </span>
                                    ) : null}
                                  </div>
                                  {showModelColumns ? (
                                    <div className="flex min-w-0 items-center gap-2 pt-1">
                                      <div className="flex min-w-0 items-center gap-1">
                                        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-nrl-muted">Bet Rating:</span>
                                        {blurPremiumColumns ? (
                                          <span aria-hidden="true" className="text-[9px] opacity-55 grayscale">🔒</span>
                                        ) : null}
                                        <BetScoreStars score={betScore} blurred={blurPremiumColumns} className="text-base" />
                                      </div>
                                      {mobileBetAction}
                                    </div>
                                  ) : null}
                                  {group.market === "Tryscorer" && tryscorerForm?.lastFive.length ? (
                                    <div className="grid grid-cols-2 items-start gap-4 pt-3">
                                      <div className="min-w-0">
                                        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-nrl-muted">L5</div>
                                        <TryFormDots values={tryscorerForm.lastFive} />
                                      </div>
                                      {tryscorerOpponent ? (
                                        <TryOpponentForm opponent={tryscorerOpponent} values={opponentLastFive} />
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="min-w-0 pt-1">
                                      <TeamLastFivePills values={teamLastFive} />
                                    </div>
                                  )}
                                  {!showModelColumns && mobileBetAction ? (
                                    <div className="pt-1">{mobileBetAction}</div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          className="mt-5 grid items-stretch gap-1.5 text-[11px]"
                          style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleBookieColumns.length)}, minmax(0, 1fr))` }}
                        >
                          {visibleBookieColumns.map((bookie) => {
                            const offer = row.bookieOffers[bookie];
                            return (
                              <div
                                key={`${group.key}-mobile-${row.result}-${bookie}`}
                                className="flex min-h-[34px] min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-nrl-text"
                              >
                                <div className="flex h-4 shrink-0 items-center opacity-90">
                                  <BookieLogo bookie={bookie} compact />
                                </div>
                                <div className="min-w-0 leading-none">
                                  <div className="truncate text-xs font-semibold tabular-nums">
                                  {offer == null ? "-" : formatPrice(offer.price)}
                                  </div>
                                  {offer != null && (group.market === "Line" || group.market === "Total") && offer.value != null ? (
                                    <div className="mt-1 truncate text-[9px] leading-none text-nrl-muted tabular-nums">{formatMarketLineValue(group.market, offer.value)}</div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    );
                  })}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                  <table className={`${group.market === "Tryscorer" ? "w-auto min-w-max lg:w-full lg:min-w-[1100px]" : "w-full min-w-[1000px]"} border-collapse text-xs`}>
                    <thead>
                      <tr className="border-b border-nrl-border text-left text-nrl-muted">
                        <th className={`${group.market === "Tryscorer" ? "whitespace-nowrap pr-3 lg:w-[220px]" : "pr-3"} py-2 font-semibold`}>Outcome</th>
                        {visibleBookieColumns.map((bookie) => (
                          <th
                            key={`${group.key}-head-${bookie}`}
                            className={`${group.market === "Tryscorer" ? "pr-2" : "pr-3"} py-2 font-semibold`}
                          >
                            <BookieLogo bookie={bookie} />
                          </th>
                        ))}
                        <th className={`${group.market === "Tryscorer" ? "pr-8" : "pr-3"} py-2 font-semibold`}>Best</th>
                        <th className="py-2 pr-3 font-semibold">Implied</th>
                        {showModelColumns ? (
                          <>
                            <th className="py-2 pr-3 font-semibold">Model</th>
                            <th className="py-2 pr-5 font-semibold">Edge</th>
                            <th className="py-2 pr-5 font-semibold">Rating</th>
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
                            colSpan={visibleBookieColumns.length + (showModelColumns ? 9 : 6)}
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
                        const overEdgeCliff = edgeDecimal != null && edgeDecimal > (maxEdge ?? DEFAULT_MAX_EDGE);
                        const suspiciousEdge = isSuspiciousEdge(edgePp);
                        const marketSignals = buildMarketSignals(row, group.marketPctFromBest);
                        const betScore = edgePp == null ? null : calculateBetScore({
                          edgePp,
                          eventDate: group.date,
                          eventKickoff,
                          nowMs,
                          todayIso,
                          efficiencyScore: marketSignals.efficiencyScore,
                          disagreementScore: marketSignals.disagreementScore,
                          teamListsProcessed,
                        });
                        const kellyProbability = modelProbability != null && implied != null
                          ? adjustedKellyProbability({
                              modelProbability,
                              impliedProbability: implied,
                              eventDate: group.date,
                              todayIso,
                              liquidityScore: marketSignals.liquidityScore,
                              efficiencyScore: marketSignals.efficiencyScore,
                              disagreementScore: marketSignals.disagreementScore,
                            })
                          : null;
                        const bankrollValue = bankroll ?? 0;
                        const percentageStakeDecimal = clamp((percentageStakePct ?? 0) / 100, 0, 1);
                        const targetProfitDecimal = clamp((targetProfitPct ?? 0) / 100, 0, 1);
                        const fullKelly = kellyProbability != null && oddsValue != null
                          ? kellyFraction(kellyProbability, oddsValue)
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
                        const canPlaceBet = canAccessPremium && oddsValue != null && oddsValue > 1;
                        const tryscorerProfile = group.market === "Tryscorer"
                          ? resolveTryscorerProfile({
                              playerName: row.result,
                              match: group.match,
                              tryscorerFormByPlayer,
                              playerTeamsByName,
                              playerImages,
                            })
                          : null;
                        const tryscorerForm = tryscorerProfile?.form ?? null;
                        const playerTeam = tryscorerProfile?.team ?? null;
                        const outcomeLogoTeam = group.market === "Tryscorer" ? playerTeam : row.result;
                        const tryscorerOpponent = group.market === "Tryscorer" ? opponentForTryscorer(group.match, playerTeam) : null;
                        const opponentLastFive = group.market === "Tryscorer"
                          ? lookupTryscorerVsOpponentLastFive({
                              source: tryscorerLastFiveVsOpponentByMatch,
                              date: group.date,
                              match: group.match,
                              player: row.result,
                              opponent: tryscorerOpponent,
                            })
                          : [];
                        const openTryscorerProfile = tryscorerForm
                          ? () => setSelectedTryscorerProfile({
                              form: tryscorerForm,
                              opponentLastFive,
                              bestPrice: row.bestPriceComputed,
                              bestBookies: row.bestBookiesComputed,
                              modelProbability: canAccessPremium ? modelProbability : null,
                              match: group.match,
                              opponent: tryscorerOpponent,
                            })
                          : undefined;

                        return (
                          <tr
                            key={`${group.key}-${row.result}-${row.bestValueComputed ?? ""}`}
                            onClick={openTryscorerProfile}
                            className={`border-b border-nrl-border/50 ${openTryscorerProfile ? "cursor-pointer transition-colors hover:bg-emerald-400/5" : ""}`}
                          >
                            <td className="py-2 pr-3 font-medium text-nrl-text">
                              <span className="inline-flex min-w-0 items-center gap-4">
                                {group.market === "Tryscorer" ? (
                                  <PlayerProfileImage
                                    image={tryscorerProfile?.image ?? null}
                                    name={outcomeLabel}
                                    reveal={visibleTryscorerImagesReady}
                                  />
                                ) : (
                                  <TeamLogoImage teamName={outcomeLogoTeam} teamLogos={teamLogos} />
                                )}
                                <span className="min-w-0">
                                  <span className="block whitespace-nowrap">{outcomeLabel}</span>
                                  {group.market === "Tryscorer" && tryscorerForm?.lastFive.length ? (
                                    <div className="mt-1 grid w-[27rem] grid-cols-[13rem_minmax(0,1fr)] gap-x-3 gap-y-1">
                                      <div>
                                        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-nrl-muted">Last 5</div>
                                        <TryFormDots values={tryscorerForm.lastFive} />
                                      </div>
                                      <TryOpponentForm opponent={tryscorerOpponent} values={opponentLastFive} />
                                    </div>
                                  ) : null}
                                </span>
                              </span>
                            </td>
                            {visibleBookieColumns.map((bookie) => {
                              const offer = row.bookieOffers[bookie];
                              const isBest = offer != null
                                && row.bestBookiesComputed.includes(bookie)
                                && row.bestPriceComputed === offer.price
                                && row.bestValueComputed === offer.value;
                              return (
                                <td
                                  key={`${group.key}-${row.result}-${bookie}`}
                                  className={`py-2 ${group.market === "Tryscorer" ? "pr-2" : "pr-3"} ${isBest ? "font-semibold text-nrl-accent" : "text-nrl-text"}`}
                                >
                                  {offer == null ? "-" : (
                                    <div className="leading-tight">
                                      <div>{formatPrice(offer.price)}</div>
                                      {(group.market === "Line" || group.market === "Total") && offer.value != null ? (
                                        <div className="text-[10px] text-nrl-muted">
                                          {formatMarketLineValue(group.market, offer.value)}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className={`${group.market === "Tryscorer" ? "pr-8" : "pr-3"} py-2 text-nrl-text`}>
                              <div className="flex items-center gap-2">
                                <div className="leading-tight">
                                  <div>{formatPrice(row.bestPriceComputed)}</div>
                                  {(group.market === "Line" || group.market === "Total") && row.bestValueComputed != null ? (
                                    <div className="text-[10px] text-nrl-muted">
                                      {formatMarketLineValue(group.market, row.bestValueComputed)}
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
                                  {blurPremiumColumns ? (
                                    <PremiumValueMask className="w-14" />
                                  ) : (
                                    <span>{formatPct(modelProbability == null ? null : modelProbability * 100)}</span>
                                  )}
                                </td>
                                <td className={`py-2 pr-5 ${edgeClass}`}>
                                  <span className="inline-flex items-center gap-1.5">
                                    {blurPremiumColumns ? (
                                      <PremiumValueMask className="w-10" />
                                    ) : (
                                      <span>{edgePp == null ? "-" : `${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(2)}`}</span>
                                    )}
                                    {!blurPremiumColumns && suspiciousEdge ? <SuspiciousEdgeCaution /> : null}
                                  </span>
                                </td>
                                <td className="py-2 pr-5">
                                  {betScore == null ? (
                                    <span className="text-nrl-muted">-</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="text-[9px] font-black uppercase tracking-[0.08em] text-nrl-muted">Bet Rating</span>
                                      <BetScoreStars score={betScore} blurred={blurPremiumColumns} className="text-sm" />
                                    </span>
                                  )}
                                </td>
                              </>
                            ) : null}
                            <td className="py-2 pr-3 text-nrl-text">
                              <input
                                type="number"
                                min={1.01}
                                step={0.01}
                                value={oddsValue == null || !Number.isFinite(oddsValue) ? "" : oddsValue}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => onOddsOverride(betRowKey, Number(event.target.value))}
                                onBlur={(event) => {
                                  const nextOdds = Number(event.target.value);
                                  if (Number.isFinite(nextOdds) && nextOdds > 1) return;
                                  onOddsOverride(betRowKey, row.bestPriceComputed ?? 0);
                                }}
                                className="w-20 rounded border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-emerald-300/40"
                              />
                            </td>
                            <td className="py-2 pr-0 text-nrl-text">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={Number.isFinite(stakeValue) ? stakeValue : 0}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => onStakeOverride(betRowKey, Math.max(0, Number(event.target.value) || 0))}
                                className="w-20 rounded border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-emerald-300/40"
                              />
                            </td>
                            <td className="py-2 pl-3 pr-0">
                              {canAccessPremium ? (
                                <button
                                  type="button"
                                  disabled={!canPlaceBet}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const bookie = row.bestOfferComputed?.bookie;
                                    if (!canPlaceBet || oddsValue == null || !bookie) return;
                                    onOpenBetComposer({
                                      bookie,
                                      market: group.market,
                                      matchDate: group.date,
                                      matchName: group.match,
                                      selection: row.result,
                                      lineValue: row.bestValueComputed,
                                      odds: oddsValue,
                                      stake: stakeValue,
                                      modelProbability,
                                    });
                                  }}
                                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                    canPlaceBet
                                      ? "cursor-pointer border-nrl-accent/55 bg-nrl-accent/12 text-nrl-accent hover:bg-nrl-accent/18"
                                      : "cursor-not-allowed border-nrl-border text-nrl-muted opacity-60"
                                  }`}
                                >
                                  Bet
                                </button>
                              ) : (
                                <BillingPageLink className="inline-flex rounded-md border border-nrl-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted opacity-75 transition-colors hover:border-emerald-300/40 hover:text-nrl-text">
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
      </div>
    </div>
  );
}

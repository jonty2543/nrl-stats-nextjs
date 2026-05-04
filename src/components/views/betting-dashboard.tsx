"use client";

import { useEffect, useMemo, useState } from "react";
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

const MARKET_TABS: BettingMarket[] = ["H2H", "Line", "Total", "Tryscorer"];
const PREMIUM_ONLY_MARKETS = new Set<BettingMarket>(["Line", "Total", "Tryscorer"]);
const BETTING_PREFERENCES_LOCAL_KEY = "betting-preferences-local-v1";
const BET_TRACKER_LOCAL_KEY = "bet-tracker-local-v1";
const IMPLIED_LINE_SIGMA = 16.85;
const IMPLIED_TOTAL_SIGMA = 16.85;
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

function normaliseTeamMatchKey(value: string): string {
  const key = normaliseLookupKey(value);
  const aliases: Record<string, string> = {
    broncos: "brisbane broncos",
    bulldogs: "canterbury bankstown bulldogs",
    raiders: "canberra raiders",
    sharks: "cronulla sutherland sharks",
    titans: "gold coast titans",
    "sea eagles": "manly warringah sea eagles",
    storm: "melbourne storm",
    knights: "newcastle knights",
    cowboys: "north queensland cowboys",
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

function resolveTeamLogoUrl(teamName: string | null | undefined, teamLogos: Record<string, string>): string | null {
  const key = normaliseLookupKey(teamName);
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

  return Object.entries(teamLogos).find(([logoKey]) => logoKey.endsWith(` ${key}`) || logoKey.includes(key))?.[1] ?? null;
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

function formatPct(value: number | null): string {
  if (value == null) return "-";
  return `${value.toFixed(2)}%`;
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
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

function betStatusClass(status: TrackedBetStatus): string {
  if (status === "won") return "text-nrl-accent";
  if (status === "lost") return "text-red-500";
  if (status === "push") return "text-nrl-muted";
  return "text-nrl-text";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseMatch(match: string): { home: string; away: string } {
  const parts = match.split(/\s+v\s+/i).map((part) => part.trim()).filter(Boolean);
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
  const [selectedMarket, setSelectedMarket] = useState<BettingMarket>("H2H");
  const [stakeOverrides, setStakeOverrides] = useState<Record<string, number>>({});
  const [oddsOverrides, setOddsOverrides] = useState<Record<string, number>>({});
  const [trackerOpen, setTrackerOpen] = useState(false);
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
        return candidateLast === last && candidateFirst.startsWith(first[0] ?? "");
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

  const handleMarketChange = (value: string) => {
    if (!hasPremiumBettingAccess && (value === "Line" || value === "Total")) {
      return;
    }
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
    if (!hasPremiumBettingAccess && PREMIUM_ONLY_MARKETS.has(selectedMarket)) {
      setSelectedMarket("H2H");
    }
  }, [hasPremiumBettingAccess, selectedMarket]);

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

  const handleManualAddBet = async () => {
    if (!hasPremiumBettingAccess) return;
    setManualError(null);

    if (!manualMatchDate.trim()) {
      setManualError("Date is required.");
      return;
    }
    if (!manualMatchName.trim()) {
      setManualError("Match is required.");
      return;
    }
    if (!manualSelection.trim()) {
      setManualError("Selection is required.");
      return;
    }

    const parsedOdds = Number(manualOdds);
    const parsedStake = Number(manualStake);
    if (!Number.isFinite(parsedOdds) || parsedOdds <= 1) {
      setManualError("Odds must be greater than 1.");
      return;
    }
    if (!Number.isFinite(parsedStake) || parsedStake <= 0) {
      setManualError("Stake must be greater than 0.");
      return;
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
  };

  const settledBets = bets.filter((bet) => bet.status !== "pending");
  const winningBets = settledBets.filter((bet) => bet.status === "won").length;
  const losingBets = settledBets.filter((bet) => bet.status === "lost").length;
  const pushedBets = settledBets.filter((bet) => bet.status === "push").length;
  const settledNoPush = winningBets + losingBets;
  const winRate = settledNoPush > 0 ? (winningBets / settledNoPush) * 100 : null;
  const totalStake = bets.reduce((sum, bet) => sum + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
  const profitLoss = bets.reduce((sum, bet) => sum + (bet.profit ?? 0), 0);
  const profitMargin = totalStake > 0 ? (profitLoss / totalStake) * 100 : null;
  const sortedBets = useMemo(
    () => [...bets].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    [bets]
  );
  const stakingPreferencesLoading = !isLoaded || !preferencesHydrated;
  const betTrackerLoading = hasPremiumBettingAccess && (!betsHydrated || betsLoading);

  return (
    <div className="space-y-6">
      {marginModelArticle ? (
        <Link
          href={`/dashboard/articles/${marginModelArticle.slug}`}
          className="group block overflow-hidden rounded-xl border border-[rgba(123,92,255,0.35)] bg-[#20284a] shadow-[0_0_0_1px_rgba(0,245,138,0.05),0_16px_36px_rgba(8,10,18,0.28)] transition-colors hover:border-nrl-accent/70"
        >
          <div className={`relative grid h-28 ${marginModelArticle.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            <span className="absolute left-2 top-2 z-10 rounded-md border border-white/15 bg-[#0e1330]/85 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur">
              Article
            </span>
            {marginModelArticle.imageUrls.slice(0, 2).map((url, index) => (
              <div key={url} className="min-w-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${marginModelArticle.title} header ${index + 1}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                {marginModelArticle.title}
              </div>
            </div>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-nrl-panel-2 text-base text-nrl-text">
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
        <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
          <div className="space-y-3 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-nrl-text">
                Bet Tracker ({bets.length})
              </span>
              <button
                type="button"
                aria-label={trackerOpen ? "Collapse bet tracker" : "Expand bet tracker"}
                onClick={() => setTrackerOpen((open) => !open)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-nrl-border bg-nrl-panel text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
              >
                <span aria-hidden="true">{trackerOpen ? "▴" : "▾"}</span>
              </button>
            </div>

            {betTrackerLoading ? (
              <div className="rounded border border-nrl-border bg-nrl-panel px-3 py-4 text-xs text-nrl-muted">
                Loading bet tracker...
              </div>
            ) : (
            <div className="grid grid-cols-[0.8fr_1fr_1fr_1.1fr_1.2fr_0.8fr] gap-2">
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-nrl-muted">Bets</div>
                <div className="text-sm font-semibold text-nrl-text">{bets.length}</div>
              </div>
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-nrl-muted">Win %</div>
                <div className="text-sm font-semibold text-nrl-text">{winRate == null ? "-" : `${winRate.toFixed(1)}%`}</div>
              </div>
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-nrl-muted">P/L</div>
                <div className={`text-sm font-semibold ${profitLoss >= 0 ? "text-nrl-accent" : "text-red-500"}`}>{formatMoney(profitLoss)}</div>
              </div>
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-nrl-muted">Staked</div>
                <div className="text-sm font-semibold text-nrl-text">${totalStake.toFixed(2)}</div>
              </div>
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-nrl-muted">Margin</div>
                <div className={`text-sm font-semibold ${profitMargin != null && profitMargin < 0 ? "text-red-500" : "text-nrl-text"}`}>
                  {profitMargin == null ? "-" : `${profitMargin.toFixed(1)}%`}
                </div>
              </div>
              <div className="rounded border border-nrl-border bg-nrl-panel px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-nrl-muted">W/L/P</div>
                <div className="text-sm font-semibold text-nrl-text">
                  {winningBets}/{losingBets}/{pushedBets}
                </div>
              </div>
            </div>
            )}

            {betsError && !betTrackerLoading ? (
              <div className="text-xs text-red-500">{betsError}</div>
            ) : null}

            {trackerOpen && !betTrackerLoading ? (
              <div className="space-y-3 border-t border-nrl-border pt-3">
                {betsLoading ? (
                  <div className="text-xs text-nrl-muted">Loading bets...</div>
                ) : (
                  <div className="max-h-[460px] overflow-auto">
                    <table className="w-full min-w-[960px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-nrl-border text-left text-nrl-muted">
                        <th className="py-2 pr-2 font-semibold">Date</th>
                        <th className="py-2 pr-2 font-semibold">Match</th>
                        <th className="py-2 pr-2 font-semibold">Selection</th>
                        <th className="py-2 pr-2 font-semibold">Odds</th>
                        <th className="py-2 pr-2 font-semibold">Stake</th>
                        <th className="py-2 pr-2 font-semibold">Status</th>
                        <th className="py-2 pr-2 font-semibold">Profit</th>
                        <th className="py-2 pr-0 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-nrl-border/60 bg-nrl-panel/70">
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            value={manualMatchDate}
                            onChange={(event) => setManualMatchDate(event.target.value)}
                            className="w-full rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={manualMatchName}
                            onChange={(event) => setManualMatchName(event.target.value)}
                            placeholder="Team A vs Team B"
                            className="w-full rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={manualSelection}
                            onChange={(event) => setManualSelection(event.target.value)}
                            placeholder="Selection"
                            className="w-full rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={manualOdds}
                            min={1.01}
                            step={0.01}
                            onChange={(event) => setManualOdds(event.target.value)}
                            className="w-24 rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={manualStake}
                            min={0}
                            step={1}
                            onChange={(event) => setManualStake(event.target.value)}
                            className="w-24 rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={manualStatus}
                            onChange={(event) => setManualStatus(event.target.value as TrackedBetStatus)}
                            className="rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] font-semibold text-nrl-text outline-none focus:border-nrl-accent"
                          >
                            <option value="pending">pending</option>
                            <option value="won">won</option>
                            <option value="lost">lost</option>
                            <option value="push">push</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2 font-semibold text-nrl-text">
                          {(() => {
                            const odds = Number(manualOdds);
                            const stake = Number(manualStake);
                            if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake <= 0) return "-";
                            const profit = computeBetProfit(manualStatus, stake, odds);
                            return profit == null ? "-" : formatMoney(profit);
                          })()}
                        </td>
                        <td className="py-2 pr-0">
                          <button
                            type="button"
                            onClick={() => void handleManualAddBet()}
                            className="rounded border border-nrl-accent bg-nrl-accent/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-nrl-accent hover:bg-nrl-accent/25"
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                      {manualError ? (
                        <tr>
                          <td colSpan={8} className="py-2 text-[10px] text-red-500">
                            {manualError}
                          </td>
                        </tr>
                      ) : null}
                      {sortedBets.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-3 text-nrl-muted">No bets yet.</td>
                        </tr>
                      ) : sortedBets.map((bet) => (
                        <tr key={bet.id} className="border-b border-nrl-border/50">
                          <td className="py-2 pr-2 text-nrl-text">{formatDateLabel(bet.matchDate)}</td>
                          <td className="py-2 pr-2 text-nrl-text">{bet.matchName}</td>
                          <td className="py-2 pr-2 text-nrl-text">
                            {bet.selection}
                            {bet.lineValue != null ? ` ${formatLineValue(bet.lineValue)}` : ""}
                          </td>
                          <td className="py-2 pr-2">
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
                              className="w-20 rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                            />
                          </td>
                          <td className="py-2 pr-2">
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
                              className="w-20 rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] text-nrl-text outline-none focus:border-nrl-accent"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              value={bet.status}
                              onChange={(event) => void handleUpdateBet(bet.id, { status: event.target.value as TrackedBetStatus })}
                              className={`rounded border border-nrl-border bg-nrl-panel px-2 py-1 text-[11px] font-semibold outline-none focus:border-nrl-accent ${betStatusClass(bet.status)}`}
                            >
                              <option value="pending">pending</option>
                              <option value="won">won</option>
                              <option value="lost">lost</option>
                              <option value="push">push</option>
                            </select>
                          </td>
                          <td
                            className={`py-2 pr-2 font-semibold ${
                              bet.profit == null
                                ? "text-nrl-text"
                                : bet.profit < 0
                                  ? "text-red-500"
                                  : "text-nrl-accent"
                            }`}
                          >
                            {bet.profit == null ? "-" : formatMoney(bet.profit)}
                          </td>
                          <td className="py-2 pr-0">
                            <button
                              type="button"
                              onClick={() => void handleDeleteBet(bet.id)}
                              aria-label="Delete bet"
                              title="Delete bet"
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-500/40 text-red-400 hover:bg-red-500/10"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                )}
                {!userId && isLoaded ? (
                  <div className="text-[10px] text-nrl-muted">Sign in to save bets across sessions.</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
          <div className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-3 text-sm text-nrl-muted">
            <div>Bet tracker is Premium-only.</div>
          </div>
        </section>
      )}

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

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {MARKET_TABS.map((tab) => {
            const active = tab === selectedMarket;
            const locked = !hasPremiumBettingAccess && PREMIUM_ONLY_MARKETS.has(tab);
            if (locked) {
              return (
                <BillingPageLink
                  key={tab}
                  className="rounded-md border border-nrl-border bg-nrl-panel-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-nrl-muted opacity-65 transition-colors hover:border-nrl-accent hover:text-nrl-text"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{tab}</span>
                    <span className="rounded border border-nrl-border px-1.5 py-0.5 text-[9px] text-nrl-muted">
                      Premium
                    </span>
                  </span>
                </BillingPageLink>
              );
            }
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
        <section className="min-w-0 rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
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
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeGroups = groups.filter((group) => {
    if (group.market !== "Tryscorer") return true;
    const kickoffKey = buildMatchKickoffKey(group.date, group.match);
    const kickoff = kickoffKey ? tryscorerKickoffsByMatch[kickoffKey] : null;
    if (!kickoff) return true;
    const kickoffMs = Date.parse(kickoff);
    return !Number.isFinite(kickoffMs) || nowMs < kickoffMs + 5 * 60 * 1000;
  });

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

  return (
    <div className="space-y-6">
      {[...groupsByDate.entries()].map(([date, dateGroups]) => (
        <div key={date} className="space-y-3">
          <h2 className="text-base font-semibold text-nrl-text">{formatDateLabel(date)}</h2>
          {dateGroups.map((group) => {
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
              <article key={group.key} className="rounded-xl border border-nrl-border bg-nrl-panel p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-nrl-text">
                      {home}
                      {away ? ` vs ${away}` : ""}
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
                <div className="overflow-x-auto">
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
                        const teamLogoUrl = resolveTeamLogoUrl(playerTeam, teamLogos);

                        return (
                          <tr key={`${group.key}-${row.result}-${row.bestValueComputed ?? ""}`} className="border-b border-nrl-border/50">
                            <td className="py-2 pr-3 font-medium text-nrl-text">
                              <span className="inline-flex min-w-0 items-center gap-2">
                                {teamLogoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={teamLogoUrl}
                                    alt=""
                                    className="h-5 w-5 shrink-0 object-contain"
                                    loading="lazy"
                                  />
                                ) : null}
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
                )}
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
}

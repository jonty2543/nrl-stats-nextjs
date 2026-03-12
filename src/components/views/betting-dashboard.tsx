"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  BETTING_BOOKIE_COLUMNS,
  type BettingMarket,
  type BettingBookie,
  type BettingOddsRow,
  type BettingOddsSnapshot,
} from "@/lib/betting/types";

interface BettingDashboardProps {
  snapshot: BettingOddsSnapshot;
}

interface OutcomeRow extends BettingOddsRow {
  bookiePrices: Record<BettingBookie, number | null>;
  bestPriceComputed: number | null;
  bestBookiesComputed: BettingBookie[];
}

interface EventGroup {
  key: string;
  date: string;
  match: string;
  market: BettingOddsRow["market"];
  value: number | null;
  outcomes: OutcomeRow[];
  marketPctFromBest: number | null;
}

const MARKET_TABS: BettingMarket[] = ["Line", "H2H", "Total"];
const LINE_CLOSE_DIFF = 2;
const BOOKIE_LOGO_PATHS: Record<BettingBookie, string> = {
  Sportsbet: "/logos/sportsbet.png",
  Pointsbet: "/logos/pointsbet.png",
  Unibet: "/logos/unibet.png",
  Palmerbet: "/logos/palmerbet.png",
  Betright: "/logos/betright.png",
  Betr: "/logos/betr.png",
};

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

function computeBestPrices(row: BettingOddsRow): {
  bookiePrices: Record<BettingBookie, number | null>;
  bestPrice: number | null;
  bestBookies: BettingBookie[];
} {
  const bookiePrices = {
    Sportsbet: row.Sportsbet,
    Pointsbet: row.Pointsbet,
    Unibet: row.Unibet,
    Palmerbet: row.Palmerbet,
    Betright: row.Betright,
    Betr: row.Betr,
  };

  let bestPrice: number | null = null;
  const bestBookies: BettingBookie[] = [];

  for (const bookie of BETTING_BOOKIE_COLUMNS) {
    const price = bookiePrices[bookie];
    if (price == null) continue;
    if (bestPrice == null || price > bestPrice) {
      bestPrice = price;
      bestBookies.length = 0;
      bestBookies.push(bookie);
      continue;
    }
    if (price === bestPrice) {
      bestBookies.push(bookie);
    }
  }

  return { bookiePrices, bestPrice, bestBookies };
}

function getEventGroupingValue(row: BettingOddsRow): number | null {
  if (row.value == null) return null;
  if (row.market === "Line") return Math.abs(row.value);
  return row.value;
}

function buildEventGroups(rows: BettingOddsRow[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();

  for (const row of rows) {
    const groupingValue = getEventGroupingValue(row);
    const eventKey = `${row.date}|${row.match}|${row.market}|${groupingValue ?? ""}`;
    const existing = groups.get(eventKey);
    const { bookiePrices, bestPrice, bestBookies } = computeBestPrices(row);

    const outcome: OutcomeRow = {
      ...row,
      bookiePrices,
      bestPriceComputed: bestPrice,
      bestBookiesComputed: bestBookies,
    };

    if (!existing) {
      groups.set(eventKey, {
        key: eventKey,
        date: row.date,
        match: row.match,
        market: row.market,
        value: groupingValue,
        outcomes: [outcome],
        marketPctFromBest: null,
      });
      continue;
    }

    existing.outcomes.push(outcome);
  }

  const out = [...groups.values()].map((group) => {
    const inverseSum = group.outcomes
      .map((row) => row.bestPriceComputed)
      .filter((value): value is number => value != null)
      .reduce((sum, price) => sum + 1 / price, 0);
    const marketPctFromBest = inverseSum > 0 ? inverseSum * 100 : null;

    return {
      ...group,
      outcomes: [...group.outcomes].sort((a, b) => a.result.localeCompare(b.result)),
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

export function BettingDashboard({ snapshot }: BettingDashboardProps) {
  const [bankroll, setBankroll] = useState(1000);
  const [kellyScale, setKellyScale] = useState(0.5);
  const [maxEdge, setMaxEdge] = useState(0.06);
  const [selectedMarket, setSelectedMarket] = useState<BettingMarket>("Line");

  const h2hGroups = useMemo(() => buildEventGroups(snapshot.h2h), [snapshot.h2h]);
  const lineGroups = useMemo(() => buildEventGroups(snapshot.line), [snapshot.line]);
  const totalGroups = useMemo(() => buildEventGroups(snapshot.total), [snapshot.total]);
  const selectedMarketGroups = selectedMarket === "H2H"
    ? h2hGroups
    : selectedMarket === "Line"
      ? lineGroups
      : totalGroups;

  const handleMarketChange = (value: string) => {
    if (value === "H2H" || value === "Line" || value === "Total") {
      setSelectedMarket(value);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
        <h1 className="text-xl font-bold text-nrl-text">Betting</h1>
        <p className="mt-2 text-sm text-nrl-muted">
          Best prices are recomputed from available bookie odds for each outcome. Market %
          below is derived from those best selections.
        </p>
        <p className="mt-1 text-xs text-nrl-muted/80">
          Snapshot generated: {formatDateLabel(snapshot.generatedAt)}
        </p>
      </section>

      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
        <h2 className="text-base font-semibold text-nrl-text">Model + Kelly (Prototype)</h2>
        <p className="mt-1 text-xs text-nrl-muted">
          H2H uses prediction <code>win_prob</code>. Line uses <code>pred_margin</code> with sigma 16.85 for cover probability. Edges above Max Edge are treated as invalid and staked at $0.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {MARKET_TABS.map((tab) => {
            const active = tab === selectedMarket;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleMarketChange(tab)}
                className={`cursor-pointer rounded-md border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent"
                    : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-text"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <section className="min-w-0 rounded-xl border border-nrl-border bg-nrl-panel p-4 sm:p-5">
          <MarketSection
            groups={selectedMarketGroups}
            bankroll={bankroll}
            kellyScale={kellyScale}
            maxEdge={maxEdge}
          />
        </section>
      </div>
    </div>
  );
}

function MarketSection({
  groups,
  bankroll,
  kellyScale,
  maxEdge,
}: {
  groups: EventGroup[];
  bankroll?: number;
  kellyScale?: number;
  maxEdge?: number;
}) {
  const lineOutcomeIndex = useMemo(() => {
    const index = new Map<string, OutcomeRow[]>();
    for (const group of groups) {
      if (group.market !== "Line") continue;
      for (const row of group.outcomes) {
        if (row.value == null) continue;
        const key = `${group.date}|${group.match}|${row.result}`;
        const list = index.get(key);
        if (list) {
          list.push(row);
          continue;
        }
        index.set(key, [row]);
      }
    }
    return index;
  }, [groups]);

  if (groups.length === 0) {
    return (
      <div>
        <p className="mt-2 text-sm text-nrl-muted">No odds found.</p>
      </div>
    );
  }

  const groupsByDate = groups.reduce((acc, group) => {
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
            const showModelColumns = group.market === "Line" || group.market === "H2H";
            return (
              <article key={group.key} className="rounded-xl border border-nrl-border bg-nrl-panel p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-nrl-text">
                      {home}
                      {away ? ` vs ${away}` : ""}
                    </div>
                    <div className="text-xs text-nrl-muted">
                      {group.market}
                      {group.value != null ? ` ${group.value > 0 ? `${group.value}` : group.value}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-nrl-muted">
                    Best-book market %:{" "}
                    <span className="font-semibold text-nrl-text">{formatPct(group.marketPctFromBest)}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-nrl-border text-left text-nrl-muted">
                        <th className="py-2 pr-3 font-semibold">Outcome</th>
                        {BETTING_BOOKIE_COLUMNS.map((bookie) => (
                          <th key={`${group.key}-head-${bookie}`} className="py-2 pr-3 font-semibold">
                            <BookieLogo bookie={bookie} />
                          </th>
                        ))}
                        <th className="py-2 pr-3 font-semibold">Best</th>
                        <th className="py-2 pr-3 font-semibold">Implied</th>
                        {showModelColumns ? (
                          <>
                            <th className="py-2 pr-3 font-semibold">Model</th>
                            <th className="py-2 pr-3 font-semibold">Edge</th>
                            <th className="py-2 pr-0 font-semibold">Stake</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {group.outcomes.map((row) => {
                        const implied = impliedProbability(row.bestPriceComputed);
                        const supabaseModelProbability = showModelColumns
                          ? modelPercentToProbability(row.model)
                          : null;
                        const modelProbability = supabaseModelProbability;
                        const edgeDecimal = modelProbability != null && implied != null
                          ? modelProbability - implied
                          : null;
                        const edgePp = edgeDecimal == null ? null : edgeDecimal * 100;
                        const overEdgeCliff = edgeDecimal != null && edgeDecimal > (maxEdge ?? 0.06);
                        const fullKelly = modelProbability != null && row.bestPriceComputed != null
                          ? kellyFraction(modelProbability, row.bestPriceComputed)
                          : null;
                        const scaledStake = fullKelly != null
                          ? (bankroll ?? 0) * (overEdgeCliff ? 0 : fullKelly) * (kellyScale ?? 0)
                          : null;
                        const edgeClass =
                          edgePp == null
                            ? "text-nrl-text"
                            : edgePp < 0
                              ? "text-red-500"
                              : overEdgeCliff
                                ? "text-orange-500"
                                : "text-nrl-accent";
                        const outcomeLabel = group.market === "Line" && row.value != null
                          ? `${row.result} ${row.value > 0 ? `+${row.value}` : row.value}`
                          : row.result;

                        return (
                          <tr key={`${group.key}-${row.result}`} className="border-b border-nrl-border/50">
                            <td className="py-2 pr-3 font-medium text-nrl-text">{outcomeLabel}</td>
                            {BETTING_BOOKIE_COLUMNS.map((bookie) => {
                              const directPrice = row.bookiePrices[bookie];
                              const outcomeKey = `${group.date}|${group.match}|${row.result}`;
                              const lineAnchor = group.value ?? (row.value == null ? null : Math.abs(row.value));
                              const candidates = directPrice == null && group.market === "Line" && lineAnchor != null
                                ? (lineOutcomeIndex.get(outcomeKey) ?? [])
                                    .map((candidate) => {
                                      const candidatePrice = candidate.bookiePrices[bookie];
                                      if (candidatePrice == null || candidate.value == null) return null;
                                      const diff = Math.abs(Math.abs(candidate.value) - lineAnchor);
                                      return {
                                        price: candidatePrice,
                                        value: candidate.value,
                                        diff,
                                      };
                                    })
                                    .filter((candidate): candidate is { price: number; value: number; diff: number } => candidate != null)
                                    .sort((a, b) => {
                                      if (a.diff !== b.diff) return a.diff - b.diff;
                                      return b.price - a.price;
                                    })
                                : [];
                              const closeCandidates = candidates.filter((candidate) => candidate.diff <= LINE_CLOSE_DIFF);
                              const bestAlt = closeCandidates[0] ?? null;
                              const displayPrice = directPrice ?? bestAlt?.price ?? null;
                              const isAltLine = directPrice == null && bestAlt != null;
                              const isBest = !isAltLine && row.bestBookiesComputed.includes(bookie);
                              const altTitle = isAltLine
                                ? `${bookie} nearby lines: ${closeCandidates
                                    .slice(0, 3)
                                    .map((candidate) => `${formatLineValue(candidate.value)} @ ${candidate.price.toFixed(2)}`)
                                    .join(" | ")}`
                                : undefined;
                              return (
                                <td
                                  key={`${group.key}-${row.result}-${bookie}`}
                                  title={altTitle}
                                  className={`py-2 pr-3 ${isBest ? "font-semibold text-nrl-accent" : "text-nrl-text"}`}
                                >
                                  {displayPrice == null ? "-" : (
                                    <div className="leading-tight">
                                      <div>{formatPrice(displayPrice)}</div>
                                      {isAltLine ? (
                                        <div className="text-[10px] text-nrl-muted">
                                          {formatLineValue(bestAlt.value)}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-2 pr-3 text-nrl-text">
                              <div className="flex items-center gap-2">
                                <span>{formatPrice(row.bestPriceComputed)}</span>
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
                                  {formatPct(modelProbability == null ? null : modelProbability * 100)}
                                </td>
                                <td className={`py-2 pr-3 ${edgeClass}`}>
                                  {edgePp == null ? "-" : `${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(2)}`}
                                </td>
                                <td className="py-2 pr-0 text-nrl-text">
                                  {scaledStake == null ? "-" : `$${scaledStake.toFixed(2)}`}
                                </td>
                              </>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
}

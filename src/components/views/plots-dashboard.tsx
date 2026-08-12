"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { buildAttackRatingPoints, buildConcededRatingPoints, TEAM_ATTACK_COMPARISON_STATS, TEAM_ATTACK_EFFICIENCY_BASE_STATS, TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS, TEAM_DEFENCE_CONCEDED_STATS, type AttackRatingPoint, type TeamAttackComparisonStat, type TeamAttackEfficiencyBaseStat, type TeamAttackEfficiencyOutputStat, type TeamAttackTotalStat, type TeamDefenceConcededStat } from "@/lib/data/attack-ratings";
import { buildDefenceRatingPoints, type DefencePlotMode } from "@/lib/data/defence-ratings";
import { buildTeamShareSeries, TEAM_SHARE_METRICS, type TeamShareMetric } from "@/lib/data/receipt-share";
import { buildHalvesPairingPoints, buildPlayerAttackComparisonPoints, buildPlayerAttackPoints, buildPlayerDefencePoints, PLAYER_ATTACK_COMPARISON_STATS, PLAYER_ATTACK_POSITIONS, PLAYER_ATTACK_STAT_COMPARISON_STATS, PLAYER_BACK_POSITIONS, PLAYER_EFFICIENCY_BASE_METRICS, PLAYER_EFFICIENCY_OUTPUT_METRICS, type HalvesPairingSort, type PlayerAttackComparisonStat, type PlayerAttackPosition, type PlayerEfficiencyBaseMetric, type PlayerEfficiencyOutputMetric, type PlayerGameWindow, type PlayerPlotMode } from "@/lib/data/player-attack";
import { buildTeamPostMatchStatPoints, buildXPointsPlotPoints, type PostMatchTeamMetricWithRdr, type TeamPostMatchStatPoint } from "@/lib/data/post-match-team-metrics";
import type { QuadrantLabels, TeamQuadrantPoint } from "@/components/charts/defence-scatter";
import { HalvesPairingBars } from "@/components/charts/halves-pairing-bars";
import { BillingPageLink } from "@/components/billing/billing-page-link";
import { PillRadio } from "@/components/ui/pill-radio";
import { Select } from "@/components/ui/select";

const TeamQuadrantScatter = dynamic(
  () => import("@/components/charts/defence-scatter").then((module) => module.TeamQuadrantScatter),
  {
    ssr: false,
    loading: () => <div className="aspect-[45/28] w-full" aria-label="Loading team plot" />,
  }
);

const ReceiptShareLines = dynamic(
  () => import("@/components/charts/receipt-share-lines").then((module) => module.ReceiptShareLines),
  { ssr: false, loading: () => <div className="min-h-96" aria-label="Loading receipt share plot" /> }
);

function comparisonQuadrants(xStat: string, yStat: string, suffix = "", xHigherOnRight = true): QuadrantLabels {
  const x = `${xStat.toUpperCase()}${suffix}`;
  const y = `${yStat.toUpperCase()}${suffix}`;
  const leftX = xHigherOnRight ? `LOW ${x}` : `HIGH ${x}`;
  const rightX = xHigherOnRight ? `HIGH ${x}` : `LOW ${x}`;
  return {
    topLeft: [leftX, `HIGH ${y}`],
    topRight: [rightX, `HIGH ${y}`],
    bottomLeft: [leftX, `LOW ${y}`],
    bottomRight: [rightX, `LOW ${y}`],
  };
}

function GameWindowButtons({ value, onChange }: { value: PlayerGameWindow; onChange: (value: PlayerGameWindow) => void }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Sample</span>
      <div className="flex h-8 rounded-md border border-nrl-border bg-nrl-panel-2 p-0.5" aria-label="Qualifying game window">
        {([{ label: "All", value: null }, { label: "L3", value: 3 }, { label: "L5", value: 5 }, { label: "L10", value: 10 }] as const).map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors ${value === option.value ? "bg-nrl-accent text-[#07111f]" : "text-nrl-muted hover:text-nrl-text"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlotSummary({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-nrl-border px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-black text-nrl-text sm:text-base">{title}</h2>
        <p className="mt-1 text-[10px] font-semibold text-nrl-muted">{detail}</p>
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

function FiltersButton({ open, onClick, controls }: { open: boolean; onClick: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? "Hide filters" : "Show filters"}
      title={open ? "Hide filters" : "Show filters"}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border transition-colors ${open ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent" : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:text-nrl-text"}`}
    >
      <span aria-hidden="true" className="flex w-3.5 flex-col gap-[3px]">
        <span className="h-px w-full rounded-full bg-current" />
        <span className="h-px w-full rounded-full bg-current" />
        <span className="h-px w-full rounded-full bg-current" />
      </span>
    </button>
  );
}

function VolumeAxisToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 text-[9px] font-black uppercase tracking-wide text-nrl-muted transition-colors hover:text-nrl-text">
      <span>Volume axis</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full border text-[10px] leading-none ${checked ? "border-nrl-accent bg-nrl-accent text-[#07111f]" : "border-nrl-muted/70 bg-transparent"}`}>
        {checked ? "✓" : ""}
      </span>
    </label>
  );
}

const LOWER_IS_BETTER_STATS = new Set(["Missed tackles", "Penalties", "Errors", "PTB"]);
const LOCKED_TEAM_STATS = new Set(["Attacking Ruck Rating", "Defensive Ruck Rating", "Ruck Dominance Rating", "PTB Rating", "Defense Rating"]);
const DEFENSIVE_RATING_STATS = new Set(["Contact Rating", "Defense Rating", "Defensive Ruck Rating"]);
const TEAM_FOR_AGAINST_STATS = TEAM_ATTACK_COMPARISON_STATS.filter((stat) => !LOCKED_TEAM_STATS.has(stat));
const CURRENT_GAME_WINDOW_YEAR = "2026";
type PlayerStatsAggregation = "Per game" | "Season total";

type TeamStatsComparisonStat = TeamAttackComparisonStat | TeamDefenceConcededStat;
type TeamStatsRatingPoint = AttackRatingPoint & Pick<TeamPostMatchStatPoint, "attackingRuckRating" | "defensiveRuckRating" | "ruckDominanceRating" | "ptbRating" | "contactRating" | "defenseRating">;

function teamStatSelectOptions(stats: readonly TeamStatsComparisonStat[], canAccessModelPlots: boolean) {
  return stats.map((stat) => {
    if (stat === "PTB") return { value: stat, label: "Play-the-ball time (PTB)" };
    return !canAccessModelPlots && LOCKED_TEAM_STATS.has(stat)
      ? { value: stat, label: `🔒 ${stat}` }
      : stat;
  });
}

function teamStatHigherIsBetter(stat: TeamStatsComparisonStat, conceded: boolean): boolean {
  if (!conceded) return !LOWER_IS_BETTER_STATS.has(stat);
  return stat === "PTB" || stat === "Defense Rating" || stat === "Defensive Ruck Rating";
}

function defenceStatLabel(stat: TeamDefenceConcededStat): string {
  if (stat === "Possession") return "Opponent possession";
  if (stat === "Time in possession") return "Opponent time in possession";
  if (stat === "PTB") return "Opponent play-the-ball time";
  return DEFENSIVE_RATING_STATS.has(stat) ? stat : `${stat} conceded`;
}

function defenceStatAxisLabel(stat: TeamDefenceConcededStat, axisLabel: string): string {
  if (stat === "Possession" || stat === "Time in possession") return `OPPONENT ${axisLabel}`;
  return `${axisLabel}${DEFENSIVE_RATING_STATS.has(stat) ? "" : " CONCEDED"}`;
}

function perGameAttackStat(stat: TeamAttackTotalStat) {
  return {
    axisLabel: `${stat.toUpperCase()} PER GAME`,
    metricLabel: `${stat}/game`,
    description: `Average ${stat.toLowerCase()} per game.`,
    minPadding: stat.includes("metres") ? 5 : 0.5,
    value: (point: AttackRatingPoint) => point.games > 0 ? point.totals[stat] / point.games : 0,
  };
}

const TEAM_ATTACK_STAT_META: Record<TeamStatsComparisonStat, {
  axisLabel: string;
  metricLabel: string;
  description: string;
  minPadding: number;
  value: (point: TeamStatsRatingPoint) => number | null;
}> = {
  Disruptions: perGameAttackStat("Disruptions"),
  "Line breaks": perGameAttackStat("Line breaks"),
  "Run metres per run": {
    axisLabel: "RUN METRES PER RUN",
    metricLabel: "Run metres/run",
    description: "All run metres divided by runs.",
    minPadding: 0.25,
    value: (point) => point.runMetresPerRun,
  },
  Tries: perGameAttackStat("Tries"),
  Points: perGameAttackStat("Points"),
  Possession: {
    axisLabel: "POSSESSION",
    metricLabel: "Possession",
    description: "Average possession percentage per game.",
    minPadding: 1,
    value: (point) => point.games > 0 ? point.totals.Possession / point.games : 0,
  },
  "Time in possession": {
    axisLabel: "TIME IN POSSESSION PER GAME (MIN)",
    metricLabel: "Time in possession/game",
    description: "Average minutes in possession per game.",
    minPadding: 1,
    value: (point) => point.games > 0 ? point.totals["Time in possession"] / point.games : 0,
  },
  Runs: perGameAttackStat("Runs"),
  Passes: perGameAttackStat("Passes"),
  Receipts: perGameAttackStat("Receipts"),
  "Run metres": perGameAttackStat("Run metres"),
  "Post-contact metres": perGameAttackStat("Post-contact metres"),
  "Try assists": perGameAttackStat("Try assists"),
  Offloads: perGameAttackStat("Offloads"),
  "Tackle breaks": perGameAttackStat("Tackle breaks"),
  "Line break assists": perGameAttackStat("Line break assists"),
  Kicks: perGameAttackStat("Kicks"),
  "Kicking metres": perGameAttackStat("Kicking metres"),
  "Forced drop outs": perGameAttackStat("Forced drop outs"),
  PTB: {
    axisLabel: "AVERAGE PTB SPEED",
    metricLabel: "PTB",
    description: "Average play-the-ball speed in seconds.",
    minPadding: 0.1,
    value: (point) => point.ptb > 0 ? point.ptb : null,
  },
  "Attacking Ruck Rating": {
    axisLabel: "ATTACKING RUCK RATING",
    metricLabel: "Attacking Ruck Rating",
    description: "Measures how much more post-contact metres and faster play-the-balls a team produces than the model expects for its carry mix and opposition. It weights post-contact metres 75% and play-the-ball speed 25%.",
    minPadding: 2,
    value: (point) => point.attackingRuckRating,
  },
  "Defensive Ruck Rating": {
    axisLabel: "DEFENSIVE RUCK RATING",
    metricLabel: "Defensive Ruck Rating",
    description: "Measures how well a team suppresses opponent post-contact metres, slows play-the-balls and prevents tackle breaks and offloads. Those components are weighted 60%, 25% and 15%.",
    minPadding: 2,
    value: (point) => point.defensiveRuckRating,
  },
  "PTB Rating": {
    axisLabel: "PTB RATING",
    metricLabel: "PTB Rating",
    description: "Expected PTB seconds minus actual PTB seconds. Positive is faster than expected.",
    minPadding: 0.1,
    value: (point) => point.ptbRating,
  },
  "Contact Rating": {
    axisLabel: "CONTACT RATING",
    metricLabel: "Contact Rating",
    description: "Opponent tackle breaks and offloads per 100 opponent runs.",
    minPadding: 1,
    value: (point) => point.contactRating ?? point.disruptionRate,
  },
  "Defense Rating": {
    axisLabel: "DEFENSE RATING",
    metricLabel: "Defense Rating",
    description: "Context-adjusted defense rating, centred on 50.",
    minPadding: 2,
    value: (point) => point.defenseRating,
  },
  "Missed tackles": perGameAttackStat("Missed tackles"),
  Penalties: perGameAttackStat("Penalties"),
  Errors: perGameAttackStat("Errors"),
};

const DEFENCE_QUADRANTS: QuadrantLabels = {
  topLeft: ["CONTACT LEAKS", "STRONG DEFENSE"],
  topRight: ["STRONG CONTACT", "STRONG DEFENSE"],
  bottomLeft: ["CONTACT LEAKS", "DEFENSE LEAKS"],
  bottomRight: ["STRONG CONTACT", "DEFENSE LEAKS"],
};

const XPOINTS_QUADRANTS: QuadrantLabels = {
  topLeft: ["LOW XPOINTS", "HIGH ACTUAL"],
  topRight: ["HIGH XPOINTS", "HIGH ACTUAL"],
  bottomLeft: ["LOW XPOINTS", "LOW ACTUAL"],
  bottomRight: ["HIGH XPOINTS", "LOW ACTUAL"],
};

const XPOINTS_CONCEDED_QUADRANTS: QuadrantLabels = {
  topLeft: ["LOW ACTUAL CONCEDED", "HIGH EXPECTED CONCEDED"],
  topRight: ["HIGH ACTUAL CONCEDED", "HIGH EXPECTED CONCEDED"],
  bottomLeft: ["LOW ACTUAL CONCEDED", "LOW EXPECTED CONCEDED"],
  bottomRight: ["HIGH ACTUAL CONCEDED", "LOW EXPECTED CONCEDED"],
};

const PLAYER_EFFICIENCY_QUADRANTS: QuadrantLabels = {
  topLeft: ["LOW EFFICIENCY", "HIGH VOLUME"],
  topRight: ["HIGH EFFICIENCY", "HIGH VOLUME"],
  bottomLeft: ["LOW EFFICIENCY", "LOWER VOLUME"],
  bottomRight: ["HIGH EFFICIENCY", "LOWER VOLUME"],
};

const DEFENSIVE_EFFICIENCY_QUADRANTS: QuadrantLabels = {
  topLeft: ["LOW EFFICIENCY", "HIGH VOLUME"],
  topRight: ["HIGH EFFICIENCY", "HIGH VOLUME"],
  bottomLeft: ["LOW EFFICIENCY", "LOWER VOLUME"],
  bottomRight: ["HIGH EFFICIENCY", "LOWER VOLUME"],
};

const PLAYER_TACKLE_QUADRANTS: QuadrantLabels = {
  topLeft: ["LOW TACKLES", "HIGH EFFICIENCY"],
  topRight: ["HIGH TACKLES", "HIGH EFFICIENCY"],
  bottomLeft: ["LOW TACKLES", "LOW EFFICIENCY"],
  bottomRight: ["HIGH TACKLES", "LOW EFFICIENCY"],
};

type TeamSection = "Attack" | "Defense" | "Other";
type AttackPlot = "Stats" | "Efficiency" | "xPoints vs actual points";
type DefencePlot = "Contact vs defense rating" | "Stats Conceded" | "Defensive Efficiency" | "Actual points conceded vs xPoints conceded";
type EfficiencyView = "Efficiency" | "Volume axis";
type TeamOtherPlot = "For vs Against" | "Team Share by Position" | "Ruck Dominance Rating";
type PlayerAttackPlot = "Stats" | "Efficiency" | "Team Proportion";
type PlayerSection = "Attack" | "Defense" | "Other";
type OptionalPlayerComparisonStat = PlayerAttackComparisonStat | "None";
type OptionalTeamAttackComparisonStat = TeamAttackComparisonStat | "None";
type OptionalTeamDefenceComparisonStat = TeamDefenceConcededStat | "None";
type PlotViewId =
  | "player_attack_stats"
  | "player_attack_efficiency"
  | "player_attack_share"
  | "player_defense_tackles"
  | "player_combinations_halves"
  | "team_attack_stats"
  | "team_attack_efficiency"
  | "team_attack_xpoints"
  | "team_defense_stats"
  | "team_defense_efficiency"
  | "team_defense_contact"
  | "team_defense_xpoints"
  | "team_context_for_against"
  | "team_context_position_share"
  | "team_context_ruck";
const HALVES_PAIRING_SORT_OPTIONS = ["Ascending · most different", "Descending · closest to 50/50"] as const;
type HalvesPairingSortLabel = (typeof HALVES_PAIRING_SORT_OPTIONS)[number];

type PlotFinderAction =
  | { kind: "player-stats"; position: PlayerAttackPosition; primary: PlayerAttackComparisonStat; comparison: OptionalPlayerComparisonStat }
  | { kind: "player-efficiency"; position: PlayerAttackPosition; output: PlayerEfficiencyOutputMetric; base: PlayerEfficiencyBaseMetric; volumeAxis: boolean }
  | { kind: "player-share"; position: PlayerAttackPosition; primary: PlayerAttackComparisonStat; comparison: OptionalPlayerComparisonStat }
  | { kind: "player-defense"; position: PlayerAttackPosition }
  | { kind: "player-halves"; stat: PlayerAttackComparisonStat }
  | { kind: "team-stats"; defensive: boolean; primary: TeamStatsComparisonStat; comparison: TeamStatsComparisonStat | "None" }
  | { kind: "team-efficiency"; defensive: boolean; output: TeamAttackEfficiencyOutputStat; base: TeamAttackEfficiencyBaseStat; volumeAxis: boolean };

type PlotDiscoveryOption = {
  id: string;
  sentence: string;
  category: string;
  keywords: string;
  view: PlotViewId;
  preset?: string;
  locked?: boolean;
  action?: PlotFinderAction;
};

const PLOT_DISCOVERY_OPTIONS: PlotDiscoveryOption[] = [
  { id: "player-metres", sentence: "Who gains the most run metres?", category: "Players · Attack", keywords: "player running carries fullback winger centre", view: "player_attack_stats", preset: "player_metres" },
  { id: "player-efficiency", sentence: "Which players combine run volume and efficiency?", category: "Players · Attack", keywords: "player metres per run output middle forward", view: "player_attack_efficiency", preset: "player_efficiency" },
  { id: "player-team-role", sentence: "Who contributes the largest share of their team's output?", category: "Players · Attack", keywords: "player team role proportion share receipts runs metres", view: "player_attack_share", preset: "player_team_role" },
  { id: "player-defence", sentence: "Who tackles most effectively?", category: "Players · Defense", keywords: "player defence defense tackles tackle efficiency middles", view: "player_defense_tackles", preset: "player_defence" },
  { id: "player-halves", sentence: "How do each team's halves split kicking metres?", category: "Players · Combinations", keywords: "halfback five eighth halves pairing kicks contribution", view: "player_combinations_halves", preset: "player_halves" },
  { id: "team-metres", sentence: "Which teams gain the most run metres?", category: "Teams · Attack", keywords: "team attack running carries", view: "team_attack_stats", preset: "team_metres" },
  { id: "team-efficiency", sentence: "Which attacks combine run volume and efficiency?", category: "Teams · Attack", keywords: "team metres per run output", view: "team_attack_efficiency", preset: "team_efficiency" },
  { id: "team-xpoints", sentence: "Which teams score more points than expected?", category: "Teams · Attack", keywords: "team attack actual expected xpoints overperform", view: "team_attack_xpoints", locked: true },
  { id: "team-defence", sentence: "Which defenses concede the fewest points?", category: "Teams · Defense", keywords: "team defence defense points allowed", view: "team_defense_stats", preset: "team_defence" },
  { id: "team-defence-efficiency", sentence: "Which defenses limit attacking output most efficiently?", category: "Teams · Defense", keywords: "team defence defense opponent runs metres volume", view: "team_defense_efficiency" },
  { id: "team-contact", sentence: "Which teams combine strong contact and defense ratings?", category: "Teams · Defense", keywords: "team defence tackle breaks offloads rating", view: "team_defense_contact", locked: true },
  { id: "team-xpoints-against", sentence: "Which teams concede fewer points than expected?", category: "Teams · Defense", keywords: "team defence actual expected xpoints against overperform", view: "team_defense_xpoints", locked: true },
  { id: "team-for-against", sentence: "Which teams score most and concede least?", category: "Teams · Team context", keywords: "team points for against attack defence balance", view: "team_context_for_against", preset: "team_for_against" },
  { id: "team-position-share", sentence: "Which starting positions drive each team's runs?", category: "Teams · Team context", keywords: "team player position share fullback winger centres halves edges middles", view: "team_context_position_share", preset: "team_position_share" },
  { id: "team-ruck", sentence: "Which teams dominate the ruck?", category: "Teams · Team context", keywords: "team ruck dominance rating play the ball ptb", view: "team_context_ruck", locked: true },
];
const POPULAR_PLOT_DISCOVERY_IDS = ["player-metres", "team-metres", "team-defence", "team-for-against", "player-efficiency"];

type ProModelPlotId = "expected-points" | "expected-points-conceded" | "attacking-ruck" | "defensive-ruck" | "ruck-dominance" | "ptb-rating" | "contact-defense" | "defense-rating";

type ProModelPlot = {
  id: ProModelPlotId;
  title: string;
  description: string;
  category: string;
};

const PRO_MODEL_PLOTS: ProModelPlot[] = [
  {
    id: "expected-points",
    title: "Expected vs actual points",
    description: "Compare modelled scoring expectation with the final scoreboard.",
    category: "Attack",
  },
  {
    id: "expected-points-conceded",
    title: "Actual vs expected conceded",
    description: "See which defenses concede fewer points than opponent xPoints predicts.",
    category: "Defense",
  },
  {
    id: "attacking-ruck",
    title: "Attacking ruck rating",
    description: "Measure post-contact metres and play-the-ball speed against expectation.",
    category: "Attack",
  },
  {
    id: "defensive-ruck",
    title: "Defensive ruck rating",
    description: "Rate how well defenses suppress post-contact output and slow the ruck.",
    category: "Defense",
  },
  {
    id: "ruck-dominance",
    title: "Ruck dominance rating",
    description: "Combine attacking and defensive ruck performance into one rating.",
    category: "Team context",
  },
  {
    id: "ptb-rating",
    title: "Play-the-ball rating",
    description: "Compare actual play-the-ball time with the modelled expectation.",
    category: "Attack",
  },
  {
    id: "contact-defense",
    title: "Contact vs defense rating",
    description: "Compare contact outcomes with the broader modelled defense rating.",
    category: "Defense",
  },
  {
    id: "defense-rating",
    title: "Defense rating",
    description: "Compare teams using the post-match model's overall defensive rating.",
    category: "Defense",
  },
];

const PLOT_SEARCH_STOP_WORDS = new Set(["a", "an", "and", "are", "do", "does", "for", "how", "i", "in", "is", "me", "of", "show", "the", "their", "to", "want", "which", "who"]);

const POSITION_SEARCH_ALIASES: Array<{ position: PlayerAttackPosition; aliases: string[] }> = [
  { position: "Fullbacks", aliases: ["fullback", "fullbacks", "number 1"] },
  { position: "Wingers", aliases: ["wing", "winger", "wingers"] },
  { position: "Centres", aliases: ["centre", "centres", "center", "centers"] },
  { position: "Halves", aliases: ["half", "halves", "halfback", "five eighth", "five-eighth"] },
  { position: "Hookers", aliases: ["hooker", "hookers", "dummy half"] },
  { position: "Edges", aliases: ["edge", "edges", "second row", "second-row"] },
  { position: "Middles", aliases: ["middle", "middles", "prop", "props", "lock forward"] },
];

const STAT_SEARCH_ALIASES: Record<string, string[]> = {
  Runs: ["run", "runs", "carry", "carries"],
  Receipts: ["receipt", "receipts", "touch", "touches"],
  Passes: ["pass", "passes"],
  "Run metres": ["run metre", "run metres", "running metre", "running metres", "run meter", "run meters"],
  "Post-contact metres": ["post contact metre", "post contact metres", "post-contact metre", "post-contact metres", "pcm"],
  "Kick return metres": ["kick return metre", "kick return metres"],
  "Dummy half run metres": ["dummy half run metre", "dummy half run metres"],
  Points: ["point", "points", "score", "scoring"],
  Tries: ["try", "tries"],
  "Try assists": ["try assist", "try assists"],
  "Line breaks": ["line break", "line breaks"],
  "Line break assists": ["line break assist", "line break assists"],
  Offloads: ["offload", "offloads"],
  "Tackle breaks": ["tackle break", "tackle breaks", "broken tackle", "broken tackles"],
  Kicks: ["kick", "kicks"],
  "Kicking metres": ["kicking metre", "kicking metres", "kick metre", "kick metres"],
  "Forced drop outs": ["forced drop out", "forced drop outs", "repeat set", "repeat sets"],
  "Missed tackles": ["missed tackle", "missed tackles"],
  Penalties: ["penalty", "penalties"],
  Errors: ["error", "errors"],
  PTB: ["ptb", "play the ball", "play-the-ball", "ruck speed"],
  "Attacking Ruck Rating": ["attacking ruck rating", "attacking ruck", "attack ruck", "ruck attack"],
  "Defensive Ruck Rating": ["defensive ruck rating", "defensive ruck", "defence ruck", "ruck defence"],
  "Ruck Dominance Rating": ["ruck dominance rating", "ruck dominance", "dominate the ruck", "dominant ruck"],
  "PTB Rating": ["ptb rating", "play the ball rating", "play-the-ball rating", "ruck speed rating"],
  "Contact Rating": ["contact rating", "contact defence", "contact defense"],
  "Defense Rating": ["defence rating", "defense rating"],
};

function plotSearchTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((token) => token && !PLOT_SEARCH_STOP_WORDS.has(token));
}

function plotSuggestionScore(option: PlotDiscoveryOption, query: string) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return 0;
  const sentence = option.sentence.toLowerCase();
  const haystackTokens = new Set(plotSearchTokens(`${option.sentence} ${option.category} ${option.keywords}`));
  const queryTokens = plotSearchTokens(query);
  let score = sentence.includes(normalizedQuery) ? 12 : 0;
  for (const token of queryTokens) {
    if (haystackTokens.has(token)) score += 4;
    else if ([...haystackTokens].some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) score += 2;
  }
  return score;
}

function normalizePlotSearch(value: string) {
  return value.toLowerCase().replace(/defense/g, "defence").replace(/meters/g, "metres").replace(/[^a-z0-9]+/g, " ").trim();
}

function findRequestedPosition(query: string): PlayerAttackPosition | null {
  const normalized = ` ${normalizePlotSearch(query)} `;
  return POSITION_SEARCH_ALIASES.find(({ aliases }) => aliases.some((alias) => normalized.includes(` ${normalizePlotSearch(alias)} `)))?.position ?? null;
}

function findRequestedStat<T extends string>(query: string, stats: readonly T[]): T | null {
  const normalized = ` ${normalizePlotSearch(query)} `;
  let best: { stat: T; length: number } | null = null;
  for (const stat of stats) {
    const aliases = STAT_SEARCH_ALIASES[stat] ?? [stat];
    for (const alias of aliases) {
      const normalizedAlias = normalizePlotSearch(alias);
      if (normalized.includes(` ${normalizedAlias} `) && (!best || normalizedAlias.length > best.length)) {
        best = { stat, length: normalizedAlias.length };
      }
    }
  }
  return best?.stat ?? null;
}

function statUnit(stat: string) {
  return stat === "Runs" ? "run" : stat === "Passes" ? "pass" : stat === "Receipts" ? "receipt" : stat.toLowerCase();
}

function comparisonRequestParts(normalizedQuery: string) {
  const vsParts = normalizedQuery.split(/\b(?:vs|versus)\b/).filter(Boolean);
  if (vsParts.length > 1) return vsParts;
  if (/\b(?:compare|comparison)\b/.test(normalizedQuery)) {
    const comparedParts = normalizedQuery.split(/\b(?:and|with|to)\b/).filter(Boolean);
    if (comparedParts.length > 1) return comparedParts;
  }
  return [normalizedQuery];
}

function teamStatQuestion(stat: TeamStatsComparisonStat, defensive: boolean) {
  if (stat === "PTB") {
    return defensive ? "Which teams make opponents play the ball most slowly?" : "Which teams play the ball fastest?";
  }
  const higherIsBetter = teamStatHigherIsBetter(stat, defensive);
  if (stat.endsWith("Rating")) {
    return `Which teams have the ${higherIsBetter ? "highest" : "lowest"} ${stat.toLowerCase()}?`;
  }
  if (defensive) {
    return higherIsBetter
      ? `Which teams allow the highest opponent ${stat.toLowerCase()}?`
      : `Which teams concede the fewest ${stat.toLowerCase()}?`;
  }
  return higherIsBetter
    ? `Which teams record the most ${stat.toLowerCase()}?`
    : `Which teams record the fewest ${stat.toLowerCase()}?`;
}

function teamStatRequestLabel(stat: TeamStatsComparisonStat) {
  return stat === "PTB" ? "Play-the-ball time" : stat;
}

function buildPlotRequestSuggestions(query: string): PlotDiscoveryOption[] {
  const normalized = normalizePlotSearch(query);
  if (!normalized) return [];

  const position = findRequestedPosition(query) ?? "Fullbacks";
  const mentionsPlayer = /\b(player|players)\b/.test(normalized) || findRequestedPosition(query) !== null;
  const mentionsTeam = /\b(team|teams)\b/.test(normalized);
  const wantsDefence = /\b(defence|defensive|concede|concedes|conceded|against|opponent)\b/.test(normalized)
    || /\btackl(?:e|es|ing)\b.*\b(?:efficiency|efficient|effective|effectively)\b/.test(normalized);
  const wantsShare = /\b(share|proportion|percentage|role)\b/.test(normalized);
  const wantsHalves = /\b(halves|halfback|pairing|combination|split)\b/.test(normalized);
  const perSample = /\bper (?:game|match|80|eighty|minute|minutes)\b/.test(normalized);
  const wantsEfficiency = /\b(efficiency|efficient)\b/.test(normalized) || (/\bper\b/.test(normalized) && !perSample);
  const wantsVolumeAxis = /\b(vs|versus|volume)\b/.test(normalized);
  const perParts = normalized.split(/\bper\b/);
  const comparisonParts = comparisonRequestParts(normalized);
  const suggestions: PlotDiscoveryOption[] = [];
  const add = (option: PlotDiscoveryOption) => {
    if (!suggestions.some((existing) => existing.sentence === option.sentence)) suggestions.push(option);
  };

  if (/\b(?:expected|xpoints)\b/.test(normalized) && !mentionsPlayer) {
    const defensiveExpected = wantsDefence;
    add({
      id: `request-team-expected-${defensiveExpected}`,
      sentence: defensiveExpected ? "Which teams concede fewer points than expected?" : "Which teams score more points than expected?",
      category: `Teams · ${defensiveExpected ? "Defense" : "Attack"}`,
      keywords: normalized,
      view: defensiveExpected ? "team_defense_xpoints" : "team_attack_xpoints",
      locked: true,
    });
  }

  if ((/\bfor\b.*\b(?:vs|versus)\b.*\bagainst\b/.test(normalized) || (/\b(?:score|scoring|points)\b/.test(normalized) && /\b(?:concede|concedes|conceded|against)\b/.test(normalized))) && !mentionsPlayer) {
    add({ id: "request-team-for-against", sentence: "Which teams score most and concede least?", category: "Teams · Team context", keywords: normalized, view: "team_context_for_against", preset: "team_for_against" });
  }

  if ((mentionsTeam && wantsShare && /\b(?:position|positions)\b/.test(normalized)) || (/\b(?:position|positions)\b/.test(normalized) && /\b(?:drive|drives|contribute|contribution)\b/.test(normalized))) {
    add({ id: "request-team-position-share", sentence: "Which starting positions drive each team's runs?", category: "Teams · Team context", keywords: normalized, view: "team_context_position_share", preset: "team_position_share" });
  }

  if (wantsHalves && !mentionsTeam) {
    const stat = findRequestedStat(query, PLAYER_ATTACK_COMPARISON_STATS) ?? "Kicking metres";
    add({ id: `request-player-halves-${stat}`, sentence: `How do each team's halves split ${stat.toLowerCase()}?`, category: "Players · Combinations", keywords: normalized, view: "player_combinations_halves", action: { kind: "player-halves", stat } });
  }

  if (!mentionsTeam) {
    const primary = findRequestedStat(query, PLAYER_ATTACK_STAT_COMPARISON_STATS);
    const outputQuery = perParts.length > 1 ? perParts[0] : query;
    const baseQuery = perParts.length > 1 ? perParts.slice(1).join(" ") : query;
    const output = findRequestedStat(outputQuery, PLAYER_EFFICIENCY_OUTPUT_METRICS) ?? (wantsEfficiency ? findRequestedStat(query, PLAYER_EFFICIENCY_OUTPUT_METRICS) : null);
    const base = findRequestedStat(baseQuery, PLAYER_EFFICIENCY_BASE_METRICS) ?? (wantsEfficiency ? "Runs" : null);

    if (wantsDefence && /\btackl(?:e|es|ing)\b/.test(normalized)) {
      add({ id: `request-player-defense-${position}`, sentence: `Which ${position.toLowerCase()} tackle most effectively?`, category: "Players · Defense", keywords: normalized, view: "player_defense_tackles", action: { kind: "player-defense", position } });
    }

    if (wantsEfficiency && output && base) {
      add({ id: `request-player-efficiency-${position}-${output}-${base}`, sentence: `Which ${position.toLowerCase()} average the most ${output.toLowerCase()} per ${statUnit(base)}?`, category: "Players · Attack", keywords: normalized, view: "player_attack_efficiency", action: { kind: "player-efficiency", position, output, base, volumeAxis: wantsVolumeAxis } });
    }

    if (wantsShare && primary) {
      add({ id: `request-player-share-${position}-${primary}`, sentence: `Which ${position.toLowerCase()} contribute the largest share of their team's ${primary.toLowerCase()}?`, category: "Players · Attack", keywords: normalized, view: "player_attack_share", action: { kind: "player-share", position, primary, comparison: "None" } });
    }

    if (comparisonParts.length > 1) {
      const left = findRequestedStat(comparisonParts[0], PLAYER_ATTACK_STAT_COMPARISON_STATS);
      const right = findRequestedStat(comparisonParts.slice(1).join(" "), PLAYER_ATTACK_STAT_COMPARISON_STATS);
      if (left && right) {
        add({ id: `request-player-vs-${position}-${left}-${right}`, sentence: `${left} vs ${right.toLowerCase()} for ${position.toLowerCase()}`, category: "Players · Attack", keywords: normalized, view: "player_attack_stats", action: { kind: "player-stats", position, primary: left, comparison: right } });
      }
    }

    if (primary) {
      add({ id: `request-player-stat-${position}-${primary}`, sentence: `Which ${position.toLowerCase()} record the most ${primary.toLowerCase()}?`, category: "Players · Attack", keywords: normalized, view: "player_attack_stats", action: { kind: "player-stats", position, primary, comparison: "None" } });
    }
  }

  if (!mentionsPlayer) {
    const teamStats = wantsDefence ? TEAM_DEFENCE_CONCEDED_STATS : TEAM_ATTACK_COMPARISON_STATS;
    const primary = findRequestedStat(query, teamStats);
    const outputQuery = perParts.length > 1 ? perParts[0] : query;
    const baseQuery = perParts.length > 1 ? perParts.slice(1).join(" ") : query;
    const output = findRequestedStat(outputQuery, TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS) ?? (wantsEfficiency ? findRequestedStat(query, TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS) : null);
    const base = findRequestedStat(baseQuery, TEAM_ATTACK_EFFICIENCY_BASE_STATS) ?? (wantsEfficiency ? "Runs" : null);

    if (wantsEfficiency && output && base) {
      add({ id: `request-team-efficiency-${wantsDefence}-${output}-${base}`, sentence: wantsDefence ? `Which teams concede the fewest ${output.toLowerCase()} per ${statUnit(base)} faced?` : `Which teams produce the most ${output.toLowerCase()} per ${statUnit(base)}?`, category: `Teams · ${wantsDefence ? "Defense" : "Attack"}`, keywords: normalized, view: wantsDefence ? "team_defense_efficiency" : "team_attack_efficiency", action: { kind: "team-efficiency", defensive: wantsDefence, output, base, volumeAxis: wantsVolumeAxis } });
    }

    if (comparisonParts.length > 1) {
      const left = findRequestedStat(comparisonParts[0], teamStats);
      const right = findRequestedStat(comparisonParts.slice(1).join(" "), teamStats);
      if (left && right) {
        const leftLabel = teamStatRequestLabel(left);
        const rightLabel = teamStatRequestLabel(right).toLowerCase();
        add({ id: `request-team-vs-${wantsDefence}-${left}-${right}`, sentence: `${leftLabel} vs ${rightLabel} for ${wantsDefence ? "team defenses" : "teams"}`, category: `Teams · ${wantsDefence ? "Defense" : "Attack"}`, keywords: normalized, view: wantsDefence ? "team_defense_stats" : "team_attack_stats", locked: LOCKED_TEAM_STATS.has(left) || LOCKED_TEAM_STATS.has(right), action: { kind: "team-stats", defensive: wantsDefence, primary: left, comparison: right } });
      }
    }

    if (primary) {
      add({ id: `request-team-stat-${wantsDefence}-${primary}`, sentence: teamStatQuestion(primary, wantsDefence), category: `Teams · ${wantsDefence ? "Defense" : "Attack"}`, keywords: normalized, view: wantsDefence ? "team_defense_stats" : "team_attack_stats", locked: LOCKED_TEAM_STATS.has(primary), action: { kind: "team-stats", defensive: wantsDefence, primary, comparison: "None" } });
    }
  }

  return suggestions.slice(0, 5);
}

interface PlotsDashboardProps {
  initialPlayerData: PlayerStat[];
  availableYears: string[];
  initialYear: string;
  teamLogos: Record<string, string>;
  playerFaceImages: Record<string, string>;
  canAccessModelPlots: boolean;
}

function normalisePlayerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function teamModelPointKey(team: string, year: string, roundLabel: string): string {
  const roundNumber = roundLabel.match(/\d+/)?.[0] ?? normalisePlayerName(roundLabel);
  return `${year}|${normalisePlayerName(team)}|${roundNumber}`;
}

function coefficientOfDetermination(points: TeamQuadrantPoint[]): number | null {
  const valid = points.filter((point) => Number.isFinite(point.xValue) && Number.isFinite(point.yValue));
  if (valid.length < 2) return null;
  const xMean = valid.reduce((sum, point) => sum + point.xValue, 0) / valid.length;
  const yMean = valid.reduce((sum, point) => sum + point.yValue, 0) / valid.length;
  const covariance = valid.reduce((sum, point) => sum + (point.xValue - xMean) * (point.yValue - yMean), 0);
  const xVariance = valid.reduce((sum, point) => sum + (point.xValue - xMean) ** 2, 0);
  const yVariance = valid.reduce((sum, point) => sum + (point.yValue - yMean) ** 2, 0);
  if (xVariance <= 0 || yVariance <= 0) return null;
  return (covariance ** 2) / (xVariance * yVariance);
}

const EFFICIENCY_BASE_UNITS: Record<PlayerEfficiencyBaseMetric, string> = {
  Receipts: "receipt",
  Runs: "run",
  Passes: "pass",
};

const TEAM_EFFICIENCY_BASE_TOTALS: Record<TeamAttackEfficiencyBaseStat, TeamAttackTotalStat> = {
  Receipts: "Receipts",
  Runs: "Runs",
  Passes: "Passes",
  Kicks: "Kicks",
};

const TEAM_EFFICIENCY_BASE_UNITS: Record<TeamAttackEfficiencyBaseStat, string> = {
  Receipts: "receipt",
  Runs: "run",
  Passes: "pass",
  Kicks: "kick",
};

function InfoCircleButton({ open, onClick, controls }: { open: boolean; onClick: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? "Hide plot information" : "Show plot information"}
      title={open ? "Hide plot information" : "Show plot information"}
      onClick={onClick}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black transition-colors ${open ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent" : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent/70 hover:text-nrl-accent"}`}
    >
      i
    </button>
  );
}

function ModelPlotLock({ plotName }: { plotName: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-xl border border-white/8 bg-white/[0.02] p-6 text-center">
      <BillingPageLink className="rounded-[1rem] bg-[linear-gradient(135deg,rgba(141,99,255,0.95),rgba(0,245,138,0.95))] p-[1px] shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]">
        <div className="rounded-[calc(1rem-1px)] bg-slate-950/90 px-5 py-4 backdrop-blur-sm">
          <div aria-hidden="true" className="text-lg grayscale">🔒</div>
          <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-slate-100">Pro model plot</div>
          <div className="mt-1 max-w-56 text-[10px] leading-relaxed text-slate-400">Unlock {plotName} and all model-powered stats plots.</div>
        </div>
      </BillingPageLink>
    </div>
  );
}

export function PlotsDashboard({ initialPlayerData, availableYears, initialYear, teamLogos, playerFaceImages, canAccessModelPlots }: PlotsDashboardProps) {
  const [entity, setEntity] = useState("Players");
  const [teamSection, setTeamSection] = useState<TeamSection>("Attack");
  const [playerSection, setPlayerSection] = useState<PlayerSection>("Attack");
  const [playerAttackPlot, setPlayerAttackPlot] = useState<PlayerAttackPlot>("Stats");
  const [playerEfficiencyBaseMetric, setPlayerEfficiencyBaseMetric] = useState<PlayerEfficiencyBaseMetric>("Runs");
  const [playerEfficiencyOutputMetric, setPlayerEfficiencyOutputMetric] = useState<PlayerEfficiencyOutputMetric>("Run metres");
  const [playerEfficiencyView, setPlayerEfficiencyView] = useState<EfficiencyView>("Efficiency");
  const [playerComparisonXStat, setPlayerComparisonXStat] = useState<PlayerAttackComparisonStat>("Run metres");
  const [playerComparisonYStat, setPlayerComparisonYStat] = useState<OptionalPlayerComparisonStat>("None");
  const [playerStatsAggregation, setPlayerStatsAggregation] = useState<PlayerStatsAggregation>("Per game");
  const [playerTeamProportionXStat, setPlayerTeamProportionXStat] = useState<PlayerAttackComparisonStat>("Receipts");
  const [playerTeamProportionYStat, setPlayerTeamProportionYStat] = useState<OptionalPlayerComparisonStat>("Run metres");
  const [halvesPairingStat, setHalvesPairingStat] = useState<PlayerAttackComparisonStat>("Kicking metres");
  const [halvesPairingSort, setHalvesPairingSort] = useState<HalvesPairingSort>("ascending");
  const [playerPosition, setPlayerPosition] = useState<PlayerAttackPosition>("Fullbacks");
  const [playerPlotMode, setPlayerPlotMode] = useState<PlayerPlotMode>("players");
  const [gameWindow, setGameWindow] = useState<PlayerGameWindow>(null);
  const [playerInfoOpen, setPlayerInfoOpen] = useState(false);
  const [teamInfoOpen, setTeamInfoOpen] = useState(false);
  const [playerFiltersOpen, setPlayerFiltersOpen] = useState(false);
  const [teamFiltersOpen, setTeamFiltersOpen] = useState(false);
  const [plotFinderOpen, setPlotFinderOpen] = useState(false);
  const [plotFinderQuery, setPlotFinderQuery] = useState("");
  const plotFinderRef = useRef<HTMLDivElement>(null);
  const plotFinderInputRef = useRef<HTMLInputElement>(null);
  const [attackPlot, setAttackPlot] = useState<AttackPlot>("Stats");
  const [teamAttackXStat, setTeamAttackXStat] = useState<TeamAttackComparisonStat>("Run metres");
  const [teamAttackYStat, setTeamAttackYStat] = useState<OptionalTeamAttackComparisonStat>("None");
  const [teamEfficiencyBaseMetric, setTeamEfficiencyBaseMetric] = useState<TeamAttackEfficiencyBaseStat>("Runs");
  const [teamEfficiencyOutputMetric, setTeamEfficiencyOutputMetric] = useState<TeamAttackEfficiencyOutputStat>("Run metres");
  const [teamEfficiencyView, setTeamEfficiencyView] = useState<EfficiencyView>("Efficiency");
  const [teamDefenceXStat, setTeamDefenceXStat] = useState<TeamDefenceConcededStat>("Run metres");
  const [teamDefenceYStat, setTeamDefenceYStat] = useState<OptionalTeamDefenceComparisonStat>("None");
  const [teamDefenceEfficiencyBaseMetric, setTeamDefenceEfficiencyBaseMetric] = useState<TeamAttackEfficiencyBaseStat>("Runs");
  const [teamDefenceEfficiencyOutputMetric, setTeamDefenceEfficiencyOutputMetric] = useState<TeamAttackEfficiencyOutputStat>("Run metres");
  const [teamDefenceEfficiencyView, setTeamDefenceEfficiencyView] = useState<EfficiencyView>("Efficiency");
  const [defencePlot, setDefencePlot] = useState<DefencePlot>("Contact vs defense rating");
  const [teamOtherPlot, setTeamOtherPlot] = useState<TeamOtherPlot>("Team Share by Position");
  const [teamForStat, setTeamForStat] = useState<TeamAttackComparisonStat>("Points");
  const [teamAgainstStat, setTeamAgainstStat] = useState<TeamAttackComparisonStat>("Points");
  const [teamShareMetric, setTeamShareMetric] = useState<TeamShareMetric>("Runs");
  const [mode, setMode] = useState<DefencePlotMode>("season");
  const [year, setYear] = useState(initialYear);
  const [proPlot, setProPlot] = useState<ProModelPlotId>("expected-points");
  const [proMode, setProMode] = useState<DefencePlotMode>("season");
  const [proYear, setProYear] = useState(initialYear);
  const [proGameWindow, setProGameWindow] = useState<PlayerGameWindow>(null);
  const [proInfoOpen, setProInfoOpen] = useState(false);
  const [proFiltersOpen, setProFiltersOpen] = useState(false);
  const [proLoading, setProLoading] = useState(false);
  const [rowsByYear, setRowsByYear] = useState<Record<string, TeamStat[]>>({});
  const [postMatchMetricsByYear, setPostMatchMetricsByYear] = useState<Record<string, PostMatchTeamMetricWithRdr[]>>({});
  const [playerRowsByYear, setPlayerRowsByYear] = useState<Record<string, PlayerStat[]>>({ [initialYear]: initialPlayerData });
  const [loading, setLoading] = useState(false);
  const plotFinderSuggestions = useMemo(() => {
    const popular = POPULAR_PLOT_DISCOVERY_IDS
      .map((id) => PLOT_DISCOVERY_OPTIONS.find((option) => option.id === id))
      .filter((option): option is PlotDiscoveryOption => Boolean(option));
    if (!plotFinderQuery.trim()) return popular;

    const requestSuggestions = buildPlotRequestSuggestions(plotFinderQuery);
    if (requestSuggestions.length > 0) return requestSuggestions;

    const matches = PLOT_DISCOVERY_OPTIONS
      .map((option, index) => ({ option, index, score: plotSuggestionScore(option, plotFinderQuery) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 5)
      .map(({ option }) => option);
    return matches.length > 0 ? matches : popular;
  }, [plotFinderQuery]);

  useEffect(() => {
    if (!plotFinderOpen) return;
    plotFinderInputRef.current?.focus();

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!plotFinderRef.current?.contains(event.target as Node)) setPlotFinderOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlotFinderOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [plotFinderOpen]);

  useEffect(() => {
    if (!canAccessModelPlots || postMatchMetricsByYear[proYear]) return;
    let cancelled = false;
    setProLoading(true);
    void fetch(`/api/post-match-team-metrics?years=${encodeURIComponent(proYear)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const metrics = await response.json() as PostMatchTeamMetricWithRdr[];
        if (!cancelled) setPostMatchMetricsByYear((current) => ({ ...current, [proYear]: metrics }));
      })
      .finally(() => {
        if (!cancelled) setProLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canAccessModelPlots, postMatchMetricsByYear, proYear]);

  const currentRows = useMemo(() => rowsByYear[year] ?? [], [rowsByYear, year]);
  const currentPostMatchMetrics = useMemo(() => postMatchMetricsByYear[year] ?? [], [postMatchMetricsByYear, year]);
  const defencePoints = useMemo(() => buildDefenceRatingPoints(entity === "Teams" ? currentRows : [], mode, currentPostMatchMetrics, gameWindow), [currentPostMatchMetrics, currentRows, entity, gameWindow, mode]);
  const attackPoints = useMemo(() => buildAttackRatingPoints(entity === "Teams" ? currentRows : [], mode, gameWindow), [currentRows, entity, gameWindow, mode]);
  const concededPoints = useMemo(() => buildConcededRatingPoints(entity === "Teams" ? currentRows : [], mode, gameWindow), [currentRows, entity, gameWindow, mode]);
  const isAttack = teamSection === "Attack";
  const isDefense = teamSection === "Defense";
  const isOther = teamSection === "Other";
  const isAttackXPoints = isAttack && attackPlot === "xPoints vs actual points";
  const isTeamAttackEfficiency = isAttack && attackPlot === "Efficiency";
  const teamEfficiencyShowsVolume = isTeamAttackEfficiency && teamEfficiencyView === "Volume axis";
  const isTeamAttackStatComparison = isAttack && attackPlot === "Stats";
  const isTeamDefenceStatsConceded = isDefense && defencePlot === "Stats Conceded";
  const isTeamDefenceEfficiency = isDefense && defencePlot === "Defensive Efficiency";
  const teamDefenceEfficiencyShowsVolume = isTeamDefenceEfficiency && teamDefenceEfficiencyView === "Volume axis";
  const isRuckDominancePlot = isOther && teamOtherPlot === "Ruck Dominance Rating";
  const isForVsAgainstPlot = isOther && teamOtherPlot === "For vs Against";
  const isTeamSharePlot = isOther && teamOtherPlot === "Team Share by Position";
  const activePlotView: PlotViewId = entity === "Players"
    ? playerSection === "Defense"
      ? "player_defense_tackles"
      : playerSection === "Other"
        ? "player_combinations_halves"
        : playerAttackPlot === "Efficiency"
          ? "player_attack_efficiency"
          : playerAttackPlot === "Team Proportion"
            ? "player_attack_share"
            : "player_attack_stats"
    : isDefense
      ? defencePlot === "Defensive Efficiency"
        ? "team_defense_efficiency"
        : defencePlot === "Contact vs defense rating"
          ? "team_defense_contact"
          : defencePlot === "Actual points conceded vs xPoints conceded"
            ? "team_defense_xpoints"
            : "team_defense_stats"
      : isOther
        ? teamOtherPlot === "For vs Against"
          ? "team_context_for_against"
          : teamOtherPlot === "Ruck Dominance Rating"
            ? "team_context_ruck"
            : "team_context_position_share"
        : attackPlot === "Efficiency"
          ? "team_attack_efficiency"
          : attackPlot === "xPoints vs actual points"
            ? "team_attack_xpoints"
            : "team_attack_stats";
  const isTeamStatsComparison = isTeamAttackStatComparison || isTeamDefenceStatsConceded;
  const isTeamEfficiency = isTeamAttackEfficiency || isTeamDefenceEfficiency;
  const isDefenseXPoints = isDefense && defencePlot === "Actual points conceded vs xPoints conceded";
  const isXPoints = isAttackXPoints || isDefenseXPoints;
  const isModelPlot = isXPoints || isRuckDominancePlot || (isDefense && defencePlot === "Contact vs defense rating");
  const teamAttackXMeta = TEAM_ATTACK_STAT_META[teamAttackXStat];
  const effectiveTeamAttackYStat = teamAttackYStat === "None" ? teamAttackXStat : teamAttackYStat;
  const teamAttackYMeta = TEAM_ATTACK_STAT_META[effectiveTeamAttackYStat];
  const teamAttackXHigherIsBetter = teamStatHigherIsBetter(teamAttackXStat, false);
  const teamAttackYHigherIsBetter = teamStatHigherIsBetter(effectiveTeamAttackYStat, false);
  const teamForMeta = TEAM_ATTACK_STAT_META[teamForStat];
  const teamAgainstMeta = TEAM_ATTACK_STAT_META[teamAgainstStat];
  const teamForHigherIsBetter = teamStatHigherIsBetter(teamForStat, false);
  const teamAgainstHigherIsBetter = teamStatHigherIsBetter(teamAgainstStat, true);
  const teamForAgainstQuadrants = useMemo(() => comparisonQuadrants(`${teamForStat} for`, `${teamAgainstStat} against`, "", teamForHigherIsBetter), [teamAgainstStat, teamForHigherIsBetter, teamForStat]);
  const teamAttackQuadrants = useMemo(() => comparisonQuadrants(teamAttackXStat, effectiveTeamAttackYStat, "", teamAttackXHigherIsBetter), [effectiveTeamAttackYStat, teamAttackXHigherIsBetter, teamAttackXStat]);
  const activeTeamXStat = isTeamDefenceStatsConceded ? teamDefenceXStat : teamAttackXStat;
  const activeTeamYStat = isTeamDefenceStatsConceded ? teamDefenceYStat : teamAttackYStat;
  const isTeamSingleStat = isRuckDominancePlot || (isTeamAttackEfficiency && !teamEfficiencyShowsVolume) || (isTeamDefenceEfficiency && !teamDefenceEfficiencyShowsVolume) || (isTeamStatsComparison && activeTeamYStat === "None");
  const effectiveTeamYStat = activeTeamYStat === "None" ? activeTeamXStat : activeTeamYStat;
  const teamXValueSuffix = isForVsAgainstPlot
    ? teamForStat === "Possession" ? "%" : ""
    : isTeamStatsComparison && activeTeamXStat === "Possession" ? "%" : "";
  const teamYValueSuffix = isForVsAgainstPlot
    ? teamAgainstStat === "Possession" ? "%" : ""
    : isTeamStatsComparison && effectiveTeamYStat === "Possession" ? "%" : "";
  const activeTeamXMeta = TEAM_ATTACK_STAT_META[activeTeamXStat];
  const activeTeamYMeta = TEAM_ATTACK_STAT_META[effectiveTeamYStat];
  const activeTeamXHigherIsBetter = teamStatHigherIsBetter(activeTeamXStat, isTeamDefenceStatsConceded);
  const activeTeamYHigherIsBetter = teamStatHigherIsBetter(effectiveTeamYStat, isTeamDefenceStatsConceded);
  const selectedModelStatLocked = isTeamStatsComparison && (
    LOCKED_TEAM_STATS.has(activeTeamXStat) ||
    (activeTeamYStat !== "None" && LOCKED_TEAM_STATS.has(activeTeamYStat))
  );
  const modelPlotLocked = (isModelPlot || selectedModelStatLocked) && !canAccessModelPlots;
  const selectedModelStatName = [activeTeamXStat, activeTeamYStat === "None" ? null : activeTeamYStat]
    .filter((stat): stat is TeamStatsComparisonStat => stat !== null && LOCKED_TEAM_STATS.has(stat))
    .join(" and ");
  const activeTeamXDisplayName = isTeamDefenceStatsConceded ? defenceStatLabel(activeTeamXStat as TeamDefenceConcededStat) : activeTeamXStat === "PTB" ? "Average play-the-ball time" : activeTeamXStat;
  const activeTeamYDisplayName = isTeamDefenceStatsConceded ? defenceStatLabel(effectiveTeamYStat as TeamDefenceConcededStat) : effectiveTeamYStat === "PTB" ? "Average play-the-ball time" : effectiveTeamYStat;
  const activeTeamEfficiencyBaseMetric = isTeamDefenceEfficiency ? teamDefenceEfficiencyBaseMetric : teamEfficiencyBaseMetric;
  const activeTeamEfficiencyOutputMetric = isTeamDefenceEfficiency ? teamDefenceEfficiencyOutputMetric : teamEfficiencyOutputMetric;
  const activeTeamEfficiencyShowsVolume = isTeamDefenceEfficiency ? teamDefenceEfficiencyShowsVolume : teamEfficiencyShowsVolume;
  const teamDefenceQuadrants = useMemo(() => comparisonQuadrants(teamDefenceXStat, teamDefenceYStat === "None" ? teamDefenceXStat : teamDefenceYStat, "", activeTeamXHigherIsBetter), [activeTeamXHigherIsBetter, teamDefenceXStat, teamDefenceYStat]);
  const teamEfficiencyUnit = TEAM_EFFICIENCY_BASE_UNITS[activeTeamEfficiencyBaseMetric];
  const teamEfficiencyYDecimals = activeTeamEfficiencyOutputMetric.includes("metres")
    ? 1
    : (["Tries", "Try assists", "Line breaks", "Line break assists", "Forced drop outs"] as TeamAttackEfficiencyOutputStat[]).includes(activeTeamEfficiencyOutputMetric) ? 3 : 2;
  const playerUsesPer80 = (PLAYER_BACK_POSITIONS as readonly PlayerAttackPosition[]).includes(playerPosition);
  const isPlayerEfficiency = playerAttackPlot === "Efficiency";
  const playerEfficiencyShowsVolume = isPlayerEfficiency && playerEfficiencyView === "Volume axis";
  const isPlayerTeamProportion = playerAttackPlot === "Team Proportion";
  const isPlayerGameMode = playerPlotMode === "games";
  const isPlayerStatsTotals = !isPlayerGameMode && playerAttackPlot === "Stats" && playerStatsAggregation === "Season total";
  const activePlayerComparisonXStat = isPlayerTeamProportion ? playerTeamProportionXStat : playerComparisonXStat;
  const activePlayerComparisonYStat = isPlayerTeamProportion ? playerTeamProportionYStat : playerComparisonYStat;
  const isPlayerSingleStat = playerSection === "Attack" && ((isPlayerEfficiency && !playerEfficiencyShowsVolume) || (!isPlayerEfficiency && activePlayerComparisonYStat === "None"));
  const effectivePlayerComparisonYStat = activePlayerComparisonYStat === "None" ? activePlayerComparisonXStat : activePlayerComparisonYStat;
  const playerComparisonXHigherIsBetter = !LOWER_IS_BETTER_STATS.has(activePlayerComparisonXStat);
  const playerComparisonYHigherIsBetter = !LOWER_IS_BETTER_STATS.has(effectivePlayerComparisonYStat);
  const playerComparisonQuadrants = useMemo(
    () => comparisonQuadrants(activePlayerComparisonXStat, effectivePlayerComparisonYStat, isPlayerTeamProportion ? " %" : ""),
    [activePlayerComparisonXStat, effectivePlayerComparisonYStat, isPlayerTeamProportion]
  );
  const playerEfficiencyUnit = EFFICIENCY_BASE_UNITS[playerEfficiencyBaseMetric];
  const playerEfficiencyMinYPadding = playerEfficiencyOutputMetric.includes("metres") ? 0.2 : 0.01;
  const playerEfficiencyYDecimals = playerEfficiencyOutputMetric.includes("metres")
    ? 1
    : (["Tries", "Try assists", "Line breaks", "Line break assists", "Forced drop outs"] as PlayerEfficiencyOutputMetric[]).includes(playerEfficiencyOutputMetric) ? 3 : 2;
  const teamShareSeries = useMemo(
    () => entity === "Teams" && isTeamSharePlot
      ? buildTeamShareSeries(playerRowsByYear[year] ?? [], teamShareMetric, gameWindow)
      : [],
    [entity, gameWindow, isTeamSharePlot, playerRowsByYear, teamShareMetric, year]
  );
  const xPointsData = useMemo(
    () => entity === "Teams" && isXPoints
      ? buildXPointsPlotPoints(currentPostMatchMetrics, mode, isDefenseXPoints ? "defense" : "attack", gameWindow)
      : [],
    [currentPostMatchMetrics, entity, gameWindow, isDefenseXPoints, isXPoints, mode]
  );
  const xPointsScatterPoints = useMemo<TeamQuadrantPoint[]>(() => xPointsData.map((point) => ({
    id: point.id,
    team: point.team,
    year: point.year,
    roundLabel: point.roundLabel,
    opponent: point.opponent,
    games: point.games,
    xValue: point.xValue,
    yValue: point.yValue,
    detail: `${isDefenseXPoints ? "Defensive" : "Finishing"} delta ${point.performanceDelta >= 0 ? "+" : ""}${point.performanceDelta.toFixed(1)}`,
  })), [isDefenseXPoints, xPointsData]);
  const teamModelStats = useMemo(() => ({
    attack: new Map(buildTeamPostMatchStatPoints(entity === "Teams" ? currentPostMatchMetrics : [], mode, "attack", gameWindow).map((point) => [
      teamModelPointKey(point.team, point.year, point.roundLabel),
      point,
    ])),
    defense: new Map(buildTeamPostMatchStatPoints(entity === "Teams" ? currentPostMatchMetrics : [], mode, "defense", gameWindow).map((point) => [
      teamModelPointKey(point.team, point.year, point.roundLabel),
      point,
    ])),
  }), [currentPostMatchMetrics, entity, gameWindow, mode]);
  const activeProPlot = PRO_MODEL_PLOTS.find((plot) => plot.id === proPlot) ?? PRO_MODEL_PLOTS[0];
  const proMetrics = useMemo(() => postMatchMetricsByYear[proYear] ?? [], [postMatchMetricsByYear, proYear]);
  const proModelStats = useMemo(() => ({
    attack: buildTeamPostMatchStatPoints(proMetrics, proMode, "attack", proGameWindow),
    defense: buildTeamPostMatchStatPoints(proMetrics, proMode, "defense", proGameWindow),
  }), [proGameWindow, proMetrics, proMode]);
  const proPlotPoints = useMemo<TeamQuadrantPoint[]>(() => {
    if (proPlot === "expected-points" || proPlot === "expected-points-conceded") {
      const defense = proPlot === "expected-points-conceded";
      return buildXPointsPlotPoints(proMetrics, proMode, defense ? "defense" : "attack", proGameWindow).map((point) => ({
        id: point.id,
        team: point.team,
        year: point.year,
        roundLabel: point.roundLabel,
        opponent: point.opponent,
        games: point.games,
        xValue: point.xValue,
        yValue: point.yValue,
        detail: `${defense ? "Defensive" : "Finishing"} delta ${point.performanceDelta >= 0 ? "+" : ""}${point.performanceDelta.toFixed(1)}`,
      }));
    }

    const source = proPlot === "contact-defense" || proPlot === "defense-rating" ? proModelStats.defense : proModelStats.attack;
    return source.flatMap((point): TeamQuadrantPoint[] => {
      const xValue = proPlot === "attacking-ruck"
        ? point.attackingRuckRating
        : proPlot === "defensive-ruck"
          ? point.defensiveRuckRating
          : proPlot === "ruck-dominance"
            ? point.ruckDominanceRating
            : proPlot === "ptb-rating"
              ? point.ptbRating
              : proPlot === "defense-rating"
                ? point.defenseRating
                : point.contactRating;
      const yValue = proPlot === "contact-defense" ? point.defenseRating : xValue;
      if (xValue === null || yValue === null) return [];
      return [{
        id: `${point.year}|${point.team}|${point.roundLabel}|${proPlot}`,
        team: point.team,
        year: point.year,
        roundLabel: point.roundLabel,
        opponent: point.opponent,
        games: point.games,
        xValue,
        yValue,
        detail: activeProPlot.description,
      }];
    });
  }, [activeProPlot.description, proGameWindow, proMetrics, proMode, proModelStats.attack, proModelStats.defense, proPlot]);
  const proIsXPoints = proPlot === "expected-points" || proPlot === "expected-points-conceded";
  const proIsConceded = proPlot === "expected-points-conceded";
  const proIsContactDefense = proPlot === "contact-defense";
  const proIsSingleAxis = !proIsXPoints && !proIsContactDefense;
  const proMetricName = proPlot === "attacking-ruck"
    ? "Attacking ruck rating"
    : proPlot === "defensive-ruck"
      ? "Defensive ruck rating"
      : proPlot === "ruck-dominance"
        ? "Ruck dominance rating"
        : proPlot === "ptb-rating"
          ? "Play-the-ball rating"
          : "Defense rating";
  const proXAxisLabel = proPlot === "expected-points"
    ? proMode === "season" ? "AVERAGE XPOINTS PER GAME →" : "XPOINTS →"
    : proPlot === "expected-points-conceded"
      ? proMode === "season" ? "AVERAGE ACTUAL POINTS CONCEDED PER GAME →" : "ACTUAL POINTS CONCEDED →"
      : proPlot === "contact-defense"
        ? "CONTACT DISRUPTIONS ALLOWED PER 100 RUNS · BETTER ←"
        : `${proMetricName.toUpperCase()} · BETTER ${proPlot === "ptb-rating" ? "←" : "→"}`;
  const proYAxisLabel = proPlot === "expected-points"
    ? proMode === "season" ? "AVERAGE ACTUAL POINTS PER GAME ↑" : "ACTUAL POINTS ↑"
    : proPlot === "expected-points-conceded"
      ? proMode === "season" ? "AVERAGE XPOINTS CONCEDED PER GAME ↑" : "XPOINTS CONCEDED ↑"
      : proPlot === "contact-defense"
        ? "DEFENSE RATING · BETTER ↑"
        : "";
  const playerAttackData = useMemo(
    () => entity === "Players" && playerSection === "Attack" && isPlayerEfficiency
      ? buildPlayerAttackPoints(playerRowsByYear[year] ?? [], playerPosition, playerEfficiencyBaseMetric, playerEfficiencyOutputMetric, gameWindow, playerPlotMode)
      : [],
    [entity, gameWindow, isPlayerEfficiency, playerEfficiencyBaseMetric, playerEfficiencyOutputMetric, playerPlotMode, playerPosition, playerRowsByYear, playerSection, year]
  );
  const playerAttackComparisonData = useMemo(
    () => entity === "Players" && playerSection === "Attack" && !isPlayerEfficiency
      ? buildPlayerAttackComparisonPoints(
          playerRowsByYear[year] ?? [],
          playerPosition,
          activePlayerComparisonXStat,
          effectivePlayerComparisonYStat,
          isPlayerTeamProportion ? "team-proportion" : isPlayerStatsTotals ? "totals" : "per-game",
          gameWindow,
          playerPlotMode
        )
      : [],
    [activePlayerComparisonXStat, effectivePlayerComparisonYStat, entity, gameWindow, isPlayerEfficiency, isPlayerStatsTotals, isPlayerTeamProportion, playerPlotMode, playerPosition, playerRowsByYear, playerSection, year]
  );
  const playerDefenceData = useMemo(
    () => entity === "Players" && playerSection === "Defense"
      ? buildPlayerDefencePoints(playerRowsByYear[year] ?? [], playerPosition, gameWindow, playerPlotMode)
      : [],
    [entity, gameWindow, playerPlotMode, playerPosition, playerRowsByYear, playerSection, year]
  );
  const halvesPairings = useMemo(
    () => entity === "Players" && playerSection === "Other"
      ? buildHalvesPairingPoints(playerRowsByYear[year] ?? [], halvesPairingStat, halvesPairingSort, gameWindow)
      : [],
    [entity, gameWindow, halvesPairingSort, halvesPairingStat, playerRowsByYear, playerSection, year]
  );
  const playerAttackPoints = useMemo<TeamQuadrantPoint[]>(() => playerAttackData.map((point) => ({
    id: point.id,
    team: point.player,
    year,
    roundLabel: point.roundLabel,
    opponent: point.opponent,
    games: point.games,
    xValue: point.efficiencyValue,
    yValue: playerEfficiencyShowsVolume ? point.volumeValue : point.efficiencyValue,
    detail: isPlayerGameMode ? `${point.team} · ${point.averageMinutes.toFixed(0)} mins` : `${point.team} · ${point.averageMinutes.toFixed(1)} avg mins${point.isPer80 ? "" : ` · ${point.usualMinutes.toFixed(1)} usual mins`}`,
  })), [isPlayerGameMode, playerAttackData, playerEfficiencyShowsVolume, year]);
  const playerAttackComparisonPoints = useMemo<TeamQuadrantPoint[]>(() => playerAttackComparisonData.map((point) => ({
    id: point.id,
    team: point.player,
    year,
    roundLabel: point.roundLabel,
    opponent: point.opponent,
    games: point.games,
    xValue: point.xValue,
    yValue: point.yValue,
    detail: point.team,
  })), [playerAttackComparisonData, year]);
  const playerDefencePoints = useMemo<TeamQuadrantPoint[]>(() => playerDefenceData.map((point) => ({
    id: point.id,
    team: point.player,
    year,
    roundLabel: point.roundLabel,
    opponent: point.opponent,
    games: point.games,
    xValue: point.tacklesValue,
    yValue: point.tackleEfficiency,
    detail: isPlayerGameMode ? `${point.team} · ${point.averageMinutes.toFixed(0)} mins` : `${point.team} · ${point.averageMinutes.toFixed(1)} avg mins${point.isPer80 ? "" : ` · ${point.usualMinutes.toFixed(1)} usual mins`}`,
  })), [isPlayerGameMode, playerDefenceData, year]);
  const playerPointImages = useMemo(() => Object.fromEntries(
    [...playerAttackData, ...playerAttackComparisonData, ...playerDefenceData].flatMap((point) => {
      const image = playerFaceImages[normalisePlayerName(point.player)];
      return image ? [[point.id, image]] : [];
    })
  ), [playerAttackComparisonData, playerAttackData, playerDefenceData, playerFaceImages]);
  const points = useMemo<TeamQuadrantPoint[]>(() => {
    if (isAttack || isTeamDefenceStatsConceded || isTeamDefenceEfficiency) {
      const sourcePoints = isAttack ? attackPoints : concededPoints;
      const modelPoints = isAttack ? teamModelStats.attack : teamModelStats.defense;
      return sourcePoints.flatMap((point): TeamQuadrantPoint[] => {
        const modelPoint = modelPoints.get(teamModelPointKey(point.team, point.year, point.roundLabel));
        const statsPoint: TeamStatsRatingPoint = {
          ...point,
          attackingRuckRating: modelPoint?.attackingRuckRating ?? null,
          defensiveRuckRating: modelPoint?.defensiveRuckRating ?? null,
          ruckDominanceRating: modelPoint?.ruckDominanceRating ?? null,
          ptbRating: modelPoint?.ptbRating ?? null,
          contactRating: modelPoint?.contactRating ?? null,
          defenseRating: modelPoint?.defenseRating ?? null,
        };
        const efficiencyBase = point.totals[TEAM_EFFICIENCY_BASE_TOTALS[activeTeamEfficiencyBaseMetric]];
        const efficiencyOutput = point.totals[activeTeamEfficiencyOutputMetric];
        const efficiencyValue = efficiencyBase > 0 ? efficiencyOutput / efficiencyBase : 0;
        const xValue = isTeamEfficiency ? efficiencyValue : activeTeamXMeta.value(statsPoint);
        const yValue = isTeamEfficiency && activeTeamEfficiencyShowsVolume ? efficiencyBase / point.games : isTeamEfficiency ? efficiencyValue : activeTeamYMeta.value(statsPoint);
        if (xValue === null || yValue === null) return [];
        return [{
          id: point.id,
          team: point.team,
          year: point.year,
          roundLabel: point.roundLabel,
          opponent: point.opponent,
          games: point.games,
          xValue,
          yValue,
          detail: `${point.runs.toFixed(0)} ${isAttack ? "team" : "opponent"} runs`,
        }];
      });
    }
    if (isRuckDominancePlot) {
      return [...teamModelStats.attack.values()].flatMap((point): TeamQuadrantPoint[] => point.ruckDominanceRating === null ? [] : [{
        id: `${point.year}|${point.team}|${point.roundLabel}|ruck-dominance`,
        team: point.team,
        year: point.year,
        roundLabel: point.roundLabel,
        opponent: point.opponent,
        games: point.games,
        xValue: point.ruckDominanceRating,
        yValue: point.ruckDominanceRating,
        detail: "Combined attacking and defensive ruck performance",
      }]);
    }
    if (isForVsAgainstPlot) {
      const againstById = new Map(concededPoints.map((point) => [point.id, point]));
      return attackPoints.flatMap((forPoint): TeamQuadrantPoint[] => {
        const againstPoint = againstById.get(forPoint.id);
        if (!againstPoint) return [];
        const xValue = teamForMeta.value(forPoint as TeamStatsRatingPoint);
        const yValue = teamAgainstMeta.value(againstPoint as TeamStatsRatingPoint);
        if (xValue === null || yValue === null) return [];
        return [{
          id: `${forPoint.id}|for-against`,
          team: forPoint.team,
          year: forPoint.year,
          roundLabel: forPoint.roundLabel,
          opponent: forPoint.opponent,
          games: forPoint.games,
          xValue,
          yValue,
          detail: `${teamForStat} for · ${teamAgainstStat} against`,
        }];
      });
    }
    return defencePoints.map((point) => ({
      id: point.id,
      team: point.team,
      year: point.year,
      roundLabel: point.roundLabel,
      opponent: point.opponent,
      games: point.games,
      xValue: point.contactRating,
      yValue: point.defenseRating,
      detail: `Expected LB ${point.expectedLineBreaks.toFixed(1)} · Allowed ${point.actualLineBreaks.toFixed(1)}`,
    }));
  }, [activeTeamEfficiencyBaseMetric, activeTeamEfficiencyOutputMetric, activeTeamEfficiencyShowsVolume, activeTeamXMeta, activeTeamYMeta, attackPoints, concededPoints, defencePoints, isAttack, isForVsAgainstPlot, isRuckDominancePlot, isTeamDefenceEfficiency, isTeamDefenceStatsConceded, isTeamEfficiency, teamAgainstMeta, teamAgainstStat, teamForMeta, teamForStat, teamModelStats.attack, teamModelStats.defense]);
  const plottedTeamPoints = isXPoints ? xPointsScatterPoints : points;
  const teamScatterAriaLabel = isAttackXPoints
    ? "Expected points against actual points scatter plot"
    : isDefenseXPoints
      ? "Actual points conceded against expected points conceded scatter plot"
      : isTeamDefenceEfficiency
        ? teamDefenceEfficiencyShowsVolume
          ? `${activeTeamEfficiencyOutputMetric} conceded per ${teamEfficiencyUnit} against ${activeTeamEfficiencyBaseMetric} volume defensive efficiency scatter plot`
          : `${activeTeamEfficiencyOutputMetric} conceded per ${teamEfficiencyUnit} defensive efficiency dot plot`
      : isTeamAttackEfficiency
        ? teamEfficiencyShowsVolume
          ? `${activeTeamEfficiencyOutputMetric} per ${teamEfficiencyUnit} against ${activeTeamEfficiencyBaseMetric} volume attacking efficiency scatter plot`
          : `${activeTeamEfficiencyOutputMetric} per ${teamEfficiencyUnit} attacking efficiency dot plot`
        : isRuckDominancePlot
          ? "Ruck Dominance Rating dot plot"
        : isForVsAgainstPlot
          ? `${teamForStat} for against ${teamAgainstStat} against scatter plot`
        : isTeamSingleStat
          ? `${activeTeamXDisplayName} dot plot`
          : isTeamDefenceStatsConceded
            ? `${activeTeamXDisplayName} against ${activeTeamYDisplayName} scatter plot`
            : isAttack
              ? `${teamAttackXStat} against ${effectiveTeamAttackYStat} scatter plot`
            : "Contact disruptions against defense rating scatter plot";
  const teamXAxisLabel = isAttackXPoints
    ? mode === "season" ? "AVERAGE XPOINTS PER GAME →" : "XPOINTS →"
    : isDefenseXPoints
      ? mode === "season" ? "AVERAGE ACTUAL POINTS CONCEDED PER GAME →" : "ACTUAL POINTS CONCEDED →"
      : isTeamDefenceEfficiency
        ? `${activeTeamEfficiencyOutputMetric.toUpperCase()} CONCEDED PER ${teamEfficiencyUnit.toUpperCase()} · BETTER →`
      : isTeamAttackEfficiency
        ? `${activeTeamEfficiencyOutputMetric.toUpperCase()} PER ${teamEfficiencyUnit.toUpperCase()} · BETTER →`
        : isRuckDominancePlot
          ? "RUCK DOMINANCE RATING · BETTER →"
        : isForVsAgainstPlot
          ? `${teamForMeta.axisLabel} FOR · ${teamForHigherIsBetter ? "BETTER →" : "BETTER ←"}`
        : isTeamDefenceStatsConceded
          ? `${defenceStatAxisLabel(activeTeamXStat as TeamDefenceConcededStat, activeTeamXMeta.axisLabel)} · BETTER →`
          : isAttack
            ? `${teamAttackXMeta.axisLabel} · BETTER ${teamAttackXHigherIsBetter ? "→" : "←"}`
            : "CONTACT DISRUPTIONS ALLOWED PER 100 RUNS · BETTER →";
  const teamYAxisLabel = isAttackXPoints
    ? mode === "season" ? "AVERAGE ACTUAL POINTS PER GAME ↑" : "ACTUAL POINTS ↑"
    : isDefenseXPoints
      ? mode === "season" ? "AVERAGE XPOINTS CONCEDED PER GAME ↑" : "XPOINTS CONCEDED ↑"
      : isTeamSingleStat
        ? ""
        : isTeamEfficiency
        ? `${activeTeamEfficiencyBaseMetric.toUpperCase()} ${isTeamDefenceEfficiency ? "FACED " : ""}PER GAME · MORE ↑`
        : isRuckDominancePlot
          ? "Ruck Dominance Rating"
        : isForVsAgainstPlot
          ? `${teamAgainstMeta.axisLabel} AGAINST · ${teamAgainstHigherIsBetter ? "BETTER ↑" : "BETTER ↓"}`
        : isTeamDefenceStatsConceded
          ? `${defenceStatAxisLabel(effectiveTeamYStat as TeamDefenceConcededStat, activeTeamYMeta.axisLabel)} · BETTER ${activeTeamYHigherIsBetter ? "↑" : "↓"}`
          : isAttack
            ? `${teamAttackYMeta.axisLabel} · BETTER ${teamAttackYHigherIsBetter ? "↑" : "↓"}`
            : "DEFENSE RATING · BETTER ↑";
  const teamXMetricLabel = isAttackXPoints
    ? "xPoints"
    : isDefenseXPoints
      ? "Actual conceded"
      : isTeamDefenceEfficiency
        ? `${activeTeamEfficiencyOutputMetric} conceded/${teamEfficiencyUnit}`
      : isTeamAttackEfficiency
        ? `${activeTeamEfficiencyOutputMetric}/${teamEfficiencyUnit}`
        : isForVsAgainstPlot
          ? `${teamForMeta.metricLabel} for`
        : isTeamDefenceStatsConceded
          ? activeTeamXDisplayName
          : isAttack ? teamAttackXMeta.metricLabel : "Contact";
  const teamYMetricLabel = isAttackXPoints
    ? "Actual points"
    : isDefenseXPoints
      ? "xPoints conceded"
      : isTeamSingleStat
        ? ""
        : isTeamEfficiency
        ? `${activeTeamEfficiencyBaseMetric}${isTeamDefenceEfficiency ? " faced" : ""}/game`
        : isForVsAgainstPlot
          ? `${teamAgainstMeta.metricLabel} against`
        : isTeamDefenceStatsConceded
          ? activeTeamYDisplayName
          : isAttack ? teamAttackYMeta.metricLabel : "Defense rating";
  const teamGameRSquared = useMemo(
    () => mode === "games" && !isTeamSingleStat ? coefficientOfDetermination(plottedTeamPoints) : null,
    [isTeamSingleStat, mode, plottedTeamPoints]
  );

  const loadTeamYear = async (targetYear: string, manageLoading = true, includeMetrics = false, refreshMetrics = false) => {
    if (rowsByYear[targetYear] && (!includeMetrics || !canAccessModelPlots || (postMatchMetricsByYear[targetYear] && !refreshMetrics))) return;
    if (manageLoading) setLoading(true);
    try {
      const [teamResponse, metricsResponse] = await Promise.all([
        rowsByYear[targetYear] ? null : fetch(`/api/team-stats?years=${encodeURIComponent(targetYear)}`),
        !includeMetrics || !canAccessModelPlots || (postMatchMetricsByYear[targetYear] && !refreshMetrics)
          ? null
          : fetch(`/api/post-match-team-metrics?years=${encodeURIComponent(targetYear)}`, { cache: "no-store" }),
      ]);
      if (teamResponse?.ok) {
        const rows = await teamResponse.json() as TeamStat[];
        setRowsByYear((current) => ({ ...current, [targetYear]: rows }));
      }
      if (metricsResponse?.ok) {
        const metrics = await metricsResponse.json() as PostMatchTeamMetricWithRdr[];
        setPostMatchMetricsByYear((current) => ({ ...current, [targetYear]: metrics }));
      }
    } finally {
      if (manageLoading) setLoading(false);
    }
  };

  const loadPlayerYear = async (targetYear: string, manageLoading = true) => {
    if (playerRowsByYear[targetYear]) return;
    if (manageLoading) setLoading(true);
    try {
      const response = await fetch(`/api/player-stats?years=${encodeURIComponent(targetYear)}`);
      if (!response.ok) return;
      const rows = await response.json() as PlayerStat[];
      setPlayerRowsByYear((current) => ({ ...current, [targetYear]: rows }));
    } finally {
      if (manageLoading) setLoading(false);
    }
  };

  const refreshSelectedTeamModelStat = (stat: string) => {
    if (canAccessModelPlots && LOCKED_TEAM_STATS.has(stat)) {
      void loadTeamYear(year, true, true, true);
    }
  };

  const loadOtherYear = async (targetYear: string, includeMetrics = false) => {
    if (playerRowsByYear[targetYear] && rowsByYear[targetYear] && (!includeMetrics || !canAccessModelPlots || postMatchMetricsByYear[targetYear])) return;
    setLoading(true);
    try {
      await Promise.all([loadPlayerYear(targetYear, false), loadTeamYear(targetYear, false, includeMetrics)]);
    } finally {
      setLoading(false);
    }
  };

  const changeYear = async (nextYear: string) => {
    if (nextYear !== CURRENT_GAME_WINDOW_YEAR && gameWindow !== null) {
      setGameWindow(null);
    }
    setYear(nextYear);
    if (entity === "Players") {
      await loadPlayerYear(nextYear);
      return;
    }
    if (isOther) {
      await loadOtherYear(nextYear, isRuckDominancePlot);
      return;
    }
    await loadTeamYear(nextYear, true, isModelPlot || selectedModelStatLocked);
  };

  const changeGameWindow = async (nextWindow: PlayerGameWindow) => {
    setGameWindow(nextWindow);
    if (nextWindow !== null && year !== CURRENT_GAME_WINDOW_YEAR) {
      await changeYear(CURRENT_GAME_WINDOW_YEAR);
    }
  };

  const changeProYear = (nextYear: string) => {
    if (nextYear !== CURRENT_GAME_WINDOW_YEAR && proGameWindow !== null) setProGameWindow(null);
    setProYear(nextYear);
  };

  const changeProGameWindow = (nextWindow: PlayerGameWindow) => {
    setProGameWindow(nextWindow);
    if (nextWindow !== null && proYear !== CURRENT_GAME_WINDOW_YEAR) setProYear(CURRENT_GAME_WINDOW_YEAR);
  };

  const changePlotView = (value: string) => {
    const view = value as PlotViewId;

    if (view.startsWith("player_")) {
      setEntity("Players");
      setPlayerInfoOpen(false);
      setPlayerFiltersOpen(false);
      void loadPlayerYear(year);

      switch (view) {
        case "player_attack_stats":
          setPlayerSection("Attack");
          setPlayerAttackPlot("Stats");
          break;
        case "player_attack_efficiency":
          setPlayerSection("Attack");
          setPlayerAttackPlot("Efficiency");
          break;
        case "player_attack_share":
          setPlayerSection("Attack");
          setPlayerAttackPlot("Team Proportion");
          break;
        case "player_defense_tackles":
          setPlayerSection("Defense");
          break;
        case "player_combinations_halves":
          setPlayerSection("Other");
          break;
      }
      return;
    }

    setEntity("Teams");
    setTeamInfoOpen(false);
    setTeamFiltersOpen(false);

    switch (view) {
      case "team_attack_stats":
        setTeamSection("Attack");
        setAttackPlot("Stats");
        void loadTeamYear(year, true, LOCKED_TEAM_STATS.has(teamAttackXStat) || (teamAttackYStat !== "None" && LOCKED_TEAM_STATS.has(teamAttackYStat)));
        break;
      case "team_attack_efficiency":
        setTeamSection("Attack");
        setAttackPlot("Efficiency");
        void loadTeamYear(year);
        break;
      case "team_attack_xpoints":
        setTeamSection("Attack");
        setAttackPlot("xPoints vs actual points");
        void loadTeamYear(year, true, true);
        break;
      case "team_defense_stats":
        setTeamSection("Defense");
        setDefencePlot("Stats Conceded");
        void loadTeamYear(year, true, LOCKED_TEAM_STATS.has(teamDefenceXStat) || (teamDefenceYStat !== "None" && LOCKED_TEAM_STATS.has(teamDefenceYStat)));
        break;
      case "team_defense_efficiency":
        setTeamSection("Defense");
        setDefencePlot("Defensive Efficiency");
        void loadTeamYear(year);
        break;
      case "team_defense_contact":
        setTeamSection("Defense");
        setDefencePlot("Contact vs defense rating");
        void loadTeamYear(year, true, true);
        break;
      case "team_defense_xpoints":
        setTeamSection("Defense");
        setDefencePlot("Actual points conceded vs xPoints conceded");
        void loadTeamYear(year, true, true);
        break;
      case "team_context_for_against":
        setTeamSection("Other");
        setTeamOtherPlot("For vs Against");
        void loadOtherYear(year);
        break;
      case "team_context_position_share":
        setTeamSection("Other");
        setTeamOtherPlot("Team Share by Position");
        void loadOtherYear(year);
        break;
      case "team_context_ruck":
        setTeamSection("Other");
        setTeamOtherPlot("Ruck Dominance Rating");
        void loadOtherYear(year, true);
        break;
    }
  };

  const applyGuidedView = (preset: string) => {
    if (!preset) return;

    if (preset.startsWith("player_")) {
      setEntity("Players");
      setPlayerInfoOpen(false);
      setPlayerFiltersOpen(false);
      setPlayerPlotMode("players");
      void loadPlayerYear(year);

      switch (preset) {
        case "player_metres":
          setPlayerSection("Attack");
          setPlayerAttackPlot("Stats");
          setPlayerComparisonXStat("Run metres");
          setPlayerComparisonYStat("None");
          setPlayerPosition("Fullbacks");
          setPlayerStatsAggregation("Per game");
          break;
        case "player_efficiency":
          setPlayerSection("Attack");
          setPlayerAttackPlot("Efficiency");
          setPlayerEfficiencyBaseMetric("Runs");
          setPlayerEfficiencyOutputMetric("Run metres");
          setPlayerEfficiencyView("Volume axis");
          setPlayerPosition("Middles");
          break;
        case "player_team_role":
          setPlayerSection("Attack");
          setPlayerAttackPlot("Team Proportion");
          setPlayerTeamProportionXStat("Run metres");
          setPlayerTeamProportionYStat("None");
          setPlayerPosition("Fullbacks");
          break;
        case "player_defence":
          setPlayerSection("Defense");
          setPlayerPosition("Middles");
          break;
        case "player_halves":
          setPlayerSection("Other");
          setHalvesPairingStat("Kicking metres");
          setHalvesPairingSort("descending");
          break;
      }
      return;
    }

    setEntity("Teams");
    setTeamInfoOpen(false);
    setTeamFiltersOpen(false);
    setMode("season");

    switch (preset) {
      case "team_metres":
        setTeamSection("Attack");
        setAttackPlot("Stats");
        setTeamAttackXStat("Run metres");
        setTeamAttackYStat("None");
        void loadTeamYear(year);
        break;
      case "team_efficiency":
        setTeamSection("Attack");
        setAttackPlot("Efficiency");
        setTeamEfficiencyBaseMetric("Runs");
        setTeamEfficiencyOutputMetric("Run metres");
        setTeamEfficiencyView("Volume axis");
        void loadTeamYear(year);
        break;
      case "team_defence":
        setTeamSection("Defense");
        setDefencePlot("Stats Conceded");
        setTeamDefenceXStat("Points");
        setTeamDefenceYStat("None");
        void loadTeamYear(year);
        break;
      case "team_for_against":
        setTeamSection("Other");
        setTeamOtherPlot("For vs Against");
        setTeamForStat("Points");
        setTeamAgainstStat("Points");
        void loadOtherYear(year);
        break;
      case "team_position_share":
        setTeamSection("Other");
        setTeamOtherPlot("Team Share by Position");
        setTeamShareMetric("Runs");
        void loadOtherYear(year);
        break;
    }
  };

  const selectPlotSuggestion = (option: PlotDiscoveryOption) => {
    if (option.action) {
      const action = option.action;
      switch (action.kind) {
        case "player-stats":
          setEntity("Players");
          setPlayerSection("Attack");
          setPlayerAttackPlot("Stats");
          setPlayerPosition(action.position);
          setPlayerComparisonXStat(action.primary);
          setPlayerComparisonYStat(action.comparison);
          setPlayerStatsAggregation("Per game");
          setPlayerPlotMode("players");
          void loadPlayerYear(year);
          break;
        case "player-efficiency":
          setEntity("Players");
          setPlayerSection("Attack");
          setPlayerAttackPlot("Efficiency");
          setPlayerPosition(action.position);
          setPlayerEfficiencyOutputMetric(action.output);
          setPlayerEfficiencyBaseMetric(action.base);
          setPlayerEfficiencyView(action.volumeAxis ? "Volume axis" : "Efficiency");
          setPlayerPlotMode("players");
          void loadPlayerYear(year);
          break;
        case "player-share":
          setEntity("Players");
          setPlayerSection("Attack");
          setPlayerAttackPlot("Team Proportion");
          setPlayerPosition(action.position);
          setPlayerTeamProportionXStat(action.primary);
          setPlayerTeamProportionYStat(action.comparison);
          setPlayerPlotMode("players");
          void loadPlayerYear(year);
          break;
        case "player-defense":
          setEntity("Players");
          setPlayerSection("Defense");
          setPlayerPosition(action.position);
          setPlayerPlotMode("players");
          void loadPlayerYear(year);
          break;
        case "player-halves":
          setEntity("Players");
          setPlayerSection("Other");
          setHalvesPairingStat(action.stat);
          void loadPlayerYear(year);
          break;
        case "team-stats":
          setEntity("Teams");
          setTeamSection(action.defensive ? "Defense" : "Attack");
          if (action.defensive) {
            setDefencePlot("Stats Conceded");
            setTeamDefenceXStat(action.primary as TeamDefenceConcededStat);
            setTeamDefenceYStat(action.comparison as OptionalTeamDefenceComparisonStat);
          } else {
            setAttackPlot("Stats");
            setTeamAttackXStat(action.primary as TeamAttackComparisonStat);
            setTeamAttackYStat(action.comparison as OptionalTeamAttackComparisonStat);
          }
          setMode("season");
          void loadTeamYear(year, true, LOCKED_TEAM_STATS.has(action.primary) || (action.comparison !== "None" && LOCKED_TEAM_STATS.has(action.comparison)));
          break;
        case "team-efficiency":
          setEntity("Teams");
          setTeamSection(action.defensive ? "Defense" : "Attack");
          if (action.defensive) {
            setDefencePlot("Defensive Efficiency");
            setTeamDefenceEfficiencyOutputMetric(action.output);
            setTeamDefenceEfficiencyBaseMetric(action.base);
            setTeamDefenceEfficiencyView(action.volumeAxis ? "Volume axis" : "Efficiency");
          } else {
            setAttackPlot("Efficiency");
            setTeamEfficiencyOutputMetric(action.output);
            setTeamEfficiencyBaseMetric(action.base);
            setTeamEfficiencyView(action.volumeAxis ? "Volume axis" : "Efficiency");
          }
          setMode("season");
          void loadTeamYear(year);
          break;
      }
    } else if (option.preset) applyGuidedView(option.preset);
    else changePlotView(option.view);
    setPlayerInfoOpen(false);
    setTeamInfoOpen(false);
    setPlayerFiltersOpen(false);
    setTeamFiltersOpen(false);
    setPlotFinderOpen(false);
    setPlotFinderQuery("");
  };

  const sampleSummary = gameWindow === null ? "All games" : `Last ${gameWindow} games`;
  const playerPlotTitle = playerSection === "Other"
    ? `${halvesPairingStat} contribution — halves pairings`
    : playerSection === "Defense"
      ? `Tackles vs tackle efficiency — ${playerPosition}`
      : isPlayerEfficiency
        ? playerEfficiencyShowsVolume
          ? `${playerEfficiencyOutputMetric} efficiency vs ${playerEfficiencyBaseMetric} volume — ${playerPosition}`
          : `${playerEfficiencyOutputMetric} per ${playerEfficiencyUnit} — ${playerPosition}`
        : isPlayerTeamProportion
          ? activePlayerComparisonYStat === "None"
            ? `${activePlayerComparisonXStat} team share — ${playerPosition}`
            : `${activePlayerComparisonXStat} vs ${effectivePlayerComparisonYStat} team share — ${playerPosition}`
          : activePlayerComparisonYStat === "None"
            ? `${activePlayerComparisonXStat} — ${playerPosition}`
            : `${activePlayerComparisonXStat} vs ${effectivePlayerComparisonYStat} — ${playerPosition}`;
  const playerPlotDetail = `${year} season · ${sampleSummary} · ${playerSection === "Other" ? "One bar per pairing" : isPlayerGameMode ? "One point per game" : "One point per player"}${playerSection === "Attack" && playerAttackPlot === "Stats" && !isPlayerGameMode ? ` · ${isPlayerStatsTotals ? "Season totals" : playerUsesPer80 ? "Rates per 80 minutes" : "Rates per qualifying game"}` : ""}`;
  const teamPlotTitle = isOther
    ? isForVsAgainstPlot
      ? `${teamForStat} for vs ${teamAgainstStat} against`
      : isTeamSharePlot
        ? `${teamShareMetric} share by starting position`
        : "Ruck dominance rating"
    : isAttack
      ? isAttackXPoints
        ? "Expected points vs actual points"
        : isTeamAttackEfficiency
          ? `${activeTeamEfficiencyOutputMetric} per ${teamEfficiencyUnit}`
          : activeTeamYStat === "None"
            ? activeTeamXDisplayName
            : `${activeTeamXDisplayName} vs ${activeTeamYDisplayName}`
      : isDefenseXPoints
        ? "Actual points conceded vs expected points conceded"
        : isTeamDefenceEfficiency
          ? `${activeTeamEfficiencyOutputMetric} conceded per ${teamEfficiencyUnit} faced`
          : isTeamDefenceStatsConceded
            ? activeTeamYStat === "None"
              ? activeTeamXDisplayName
              : `${activeTeamXDisplayName} vs ${activeTeamYDisplayName}`
            : "Contact vs defense rating";
  const teamPlotDetail = `${year} season · ${sampleSummary} · ${isTeamSharePlot ? "Team profiles" : mode === "season" ? "One point per team" : "One point per game"}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-end gap-3">
        <div ref={plotFinderRef} className="relative col-start-2 row-start-1 min-w-0">
          <label htmlFor="plot-finder-input" className="sr-only">Find a plot</label>
          <input
            ref={plotFinderInputRef}
            id="plot-finder-input"
            type="text"
            value={plotFinderQuery}
            onFocus={() => setPlotFinderOpen(true)}
            onChange={(event) => {
              setPlotFinderQuery(event.target.value);
              setPlotFinderOpen(true);
            }}
            placeholder="Describe the plot you want…"
            autoComplete="off"
            className="h-8 w-full rounded-xl border border-nrl-border bg-nrl-panel-2 px-3 text-[10px] text-nrl-text outline-none placeholder:text-nrl-muted/70 focus:border-nrl-accent"
          />
          {plotFinderOpen && plotFinderQuery.trim() ? (
            <div
              id="plot-finder-suggestions"
              className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 rounded-2xl border border-nrl-border bg-nrl-panel p-3 shadow-[0_18px_48px_rgba(2,6,23,0.48)]"
            >
              <div className="space-y-1">
                {plotFinderSuggestions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectPlotSuggestion(option)}
                    className="block w-full rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-nrl-border hover:bg-nrl-panel-2 focus-visible:border-nrl-accent focus-visible:bg-nrl-panel-2 focus-visible:outline-none"
                  >
                    <span className="block text-[8px] font-bold uppercase tracking-[0.1em] text-nrl-muted">
                      {option.locked && !canAccessModelPlots ? "🔒 " : ""}{option.category}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-nrl-text">{option.sentence}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="col-start-1 row-start-1 min-w-0">
          <Select
            label="View"
            compact
            value={activePlotView}
            options={[
              { label: "Players · Attack", options: [
                { value: "player_attack_stats", label: "Player stats" },
                { value: "player_attack_efficiency", label: "Player efficiency" },
                { value: "player_attack_share", label: "Player team share" },
              ] },
              { label: "Players · Defense", options: [
                { value: "player_defense_tackles", label: "Tackling effectiveness" },
              ] },
              { label: "Players · Combinations", options: [
                { value: "player_combinations_halves", label: "Halves contribution split" },
              ] },
              { label: "Teams · Attack", options: [
                { value: "team_attack_stats", label: "Team stats" },
                { value: "team_attack_efficiency", label: "Team efficiency" },
                { value: "team_attack_xpoints", label: canAccessModelPlots ? "Expected vs actual points" : "🔒 Expected vs actual points" },
              ] },
              { label: "Teams · Defense", options: [
                { value: "team_defense_stats", label: "Stats conceded" },
                { value: "team_defense_efficiency", label: "Defensive efficiency" },
                { value: "team_defense_contact", label: canAccessModelPlots ? "Contact vs defense rating" : "🔒 Contact vs defense rating" },
                { value: "team_defense_xpoints", label: canAccessModelPlots ? "Actual vs expected conceded" : "🔒 Actual vs expected conceded" },
              ] },
              { label: "Teams · Team context", options: [
                { value: "team_context_for_against", label: "For vs against" },
                { value: "team_context_position_share", label: "Share by starting position" },
                { value: "team_context_ruck", label: canAccessModelPlots ? "Ruck dominance rating" : "🔒 Ruck dominance rating" },
              ] },
            ]}
            onChange={changePlotView}
          />
        </div>
      </div>

      {entity === "Players" ? (
        <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          {playerSection === "Other" ? (
            <>
              <div className="flex items-end gap-3 border-b border-nrl-border px-4 py-3">
                <div className="flex min-w-0 flex-1 items-end gap-2 overflow-x-auto [scrollbar-width:thin]">
                  <div className="w-32 shrink-0"><Select label="Stat" compact value={halvesPairingStat} options={[...PLAYER_ATTACK_COMPARISON_STATS]} onChange={(value) => setHalvesPairingStat(value as PlayerAttackComparisonStat)} /></div>
                  <div className="w-48 shrink-0"><Select label="Sort" compact value={halvesPairingSort === "ascending" ? "Ascending · most different" : "Descending · closest to 50/50"} options={[...HALVES_PAIRING_SORT_OPTIONS]} onChange={(value) => setHalvesPairingSort((value as HalvesPairingSortLabel).startsWith("Ascending") ? "ascending" : "descending")} /></div>
                </div>
              </div>
              <PlotSummary title={playerPlotTitle} detail={playerPlotDetail}>
                <InfoCircleButton open={playerInfoOpen} onClick={() => setPlayerInfoOpen((current) => !current)} controls="player-plot-info" />
                <FiltersButton open={playerFiltersOpen} onClick={() => setPlayerFiltersOpen((current) => !current)} controls="player-plot-filters" />
              </PlotSummary>
              {playerFiltersOpen ? (
                <div id="player-plot-filters" className="flex items-end gap-3 overflow-x-auto border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 [scrollbar-width:thin]">
                  <GameWindowButtons value={gameWindow} onChange={(value) => void changeGameWindow(value)} />
                  <div className="w-20 shrink-0"><Select label="Season" compact value={year} options={availableYears} onChange={(value) => void changeYear(value)} /></div>
                </div>
              ) : null}
              <div className="relative">
                {loading ? (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
                    <span aria-label="Loading season" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent" />
                  </div>
                ) : null}
                <HalvesPairingBars pairings={halvesPairings} stat={halvesPairingStat} playerFaceImages={playerFaceImages} minimumGames={gameWindow ?? 4} />
              </div>
              {playerInfoOpen ? (
                <div id="player-plot-info" className="grid gap-3 border-t border-nrl-border bg-nrl-panel-2 px-4 py-4 text-[10px] leading-relaxed text-nrl-muted md:grid-cols-3">
                  <div><span className="font-black text-nrl-text">Pairing sample</span><br />The recorded five-eighth and halfback from the same team-game, with both playing at least 60 minutes. Jersey 6 and 7 are used only when position data is unavailable. A pairing needs at least {gameWindow ?? 4} qualifying shared games in the selected season.</div>
                  <div><span className="font-black text-nrl-text">Contribution split</span><br />Each player&apos;s selected-stat total across shared games is divided by the pair&apos;s combined total. The most common halfback is blue on the left; the most common five-eighth is green on the right.</div>
                  <div><span className="font-black text-nrl-text">Sorting</span><br />Ascending puts the most uneven pairings first. Descending puts the pairings closest to a 50/50 split first.</div>
                  <div><span className="font-black text-nrl-text">Game window</span><br />{gameWindow === null ? "All qualifying shared games are included." : `L${gameWindow} uses each pairing's latest ${gameWindow} qualifying shared games from 2026 and requires that full sample.`}</div>
                </div>
              ) : null}
            </>
          ) : playerSection === "Attack" || playerSection === "Defense" ? (
            <>
              <div className="flex items-end gap-3 border-b border-nrl-border px-4 py-3">
                <div className="flex min-w-0 flex-1 items-end gap-3 overflow-x-auto [scrollbar-width:thin]">
                  {playerSection === "Attack" && isPlayerEfficiency ? <div className="w-24"><Select label="Per" compact value={playerEfficiencyBaseMetric} options={[...PLAYER_EFFICIENCY_BASE_METRICS]} onChange={(value) => setPlayerEfficiencyBaseMetric(value as PlayerEfficiencyBaseMetric)} /></div> : null}
                  {playerSection === "Attack" && isPlayerEfficiency ? <div className="w-36"><Select label="Output stat" compact value={playerEfficiencyOutputMetric} options={[...PLAYER_EFFICIENCY_OUTPUT_METRICS]} onChange={(value) => setPlayerEfficiencyOutputMetric(value as PlayerEfficiencyOutputMetric)} /></div> : null}
                  {playerSection === "Attack" && !isPlayerEfficiency ? <div className="w-32"><Select label="Primary stat" compact value={activePlayerComparisonXStat} options={[...(isPlayerTeamProportion ? PLAYER_ATTACK_COMPARISON_STATS : PLAYER_ATTACK_STAT_COMPARISON_STATS)]} onChange={(value) => isPlayerTeamProportion ? setPlayerTeamProportionXStat(value as PlayerAttackComparisonStat) : setPlayerComparisonXStat(value as PlayerAttackComparisonStat)} /></div> : null}
                  {playerSection === "Attack" && !isPlayerEfficiency ? <div className="w-36"><Select label="Comparison stat" compact value={activePlayerComparisonYStat} options={isPlayerTeamProportion ? [{ value: "None", label: "+ Add comparison" }, ...PLAYER_ATTACK_COMPARISON_STATS] : [{ value: "None", label: "+ Add comparison" }, ...PLAYER_ATTACK_STAT_COMPARISON_STATS]} onChange={(value) => isPlayerTeamProportion ? setPlayerTeamProportionYStat(value as OptionalPlayerComparisonStat) : setPlayerComparisonYStat(value as OptionalPlayerComparisonStat)} /></div> : null}
                  <div className="w-24"><Select label="Position" compact value={playerPosition} options={[...PLAYER_ATTACK_POSITIONS]} onChange={(value) => setPlayerPosition(value as PlayerAttackPosition)} /></div>
                </div>
              </div>
              <PlotSummary title={playerPlotTitle} detail={playerPlotDetail}>
                <InfoCircleButton open={playerInfoOpen} onClick={() => setPlayerInfoOpen((current) => !current)} controls="player-plot-info" />
                <FiltersButton open={playerFiltersOpen} onClick={() => setPlayerFiltersOpen((current) => !current)} controls="player-plot-filters" />
              </PlotSummary>
              {playerFiltersOpen ? (
                <div id="player-plot-filters" className="flex items-end gap-3 overflow-x-auto border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 [scrollbar-width:thin]">
                  <div className="w-32 shrink-0"><Select label="Plot points" compact value={isPlayerGameMode ? "Games" : "Player"} options={[{ value: "Player", label: "One per player" }, { value: "Games", label: "One per game" }]} onChange={(value) => setPlayerPlotMode(value === "Games" ? "games" : "players")} /></div>
                  {playerSection === "Attack" && isPlayerEfficiency ? <VolumeAxisToggle checked={playerEfficiencyShowsVolume} onChange={(checked) => setPlayerEfficiencyView(checked ? "Volume axis" : "Efficiency")} /> : null}
                  <GameWindowButtons value={gameWindow} onChange={(value) => void changeGameWindow(value)} />
                  {playerSection === "Attack" && playerAttackPlot === "Stats" && !isPlayerGameMode ? (
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Values</span>
                      <PillRadio options={["Per game", "Season total"]} value={playerStatsAggregation} onChange={(value) => setPlayerStatsAggregation(value as PlayerStatsAggregation)} />
                    </div>
                  ) : null}
                  <div className="w-20 shrink-0"><Select label="Season" compact value={year} options={availableYears} onChange={(value) => void changeYear(value)} /></div>
                </div>
              ) : null}
              <div className="relative p-2 sm:p-4">
                {loading ? (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
                    <span aria-label="Loading season" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent" />
                  </div>
                ) : null}
                <TeamQuadrantScatter
                  key={`${playerSection}-${playerAttackPlot}-${playerPlotMode}-${playerStatsAggregation}-${playerEfficiencyBaseMetric}-${playerEfficiencyOutputMetric}-${playerEfficiencyView}-${activePlayerComparisonXStat}-${activePlayerComparisonYStat}-${playerPosition}-${year}`}
                  points={playerSection === "Defense" ? playerDefencePoints : isPlayerEfficiency ? playerAttackPoints : playerAttackComparisonPoints}
                  teamLogos={{}}
                  useLogos={false}
                  pointImages={isPlayerGameMode ? undefined : playerPointImages}
                  searchEntityLabel="players"
                  emptyMessage={`No ${playerPosition.toLowerCase()} have ${gameWindow ?? 4} qualifying games this season.`}
                  ariaLabel={playerSection === "Defense"
                    ? `${playerPosition} tackles against tackle efficiency scatter plot`
                    : isPlayerEfficiency
                      ? playerEfficiencyShowsVolume
                        ? `${playerPosition} ${playerEfficiencyOutputMetric.toLowerCase()} per ${playerEfficiencyUnit} efficiency against ${playerEfficiencyBaseMetric.toLowerCase()} volume scatter plot`
                        : `${playerPosition} ${playerEfficiencyOutputMetric.toLowerCase()} per ${playerEfficiencyUnit} efficiency dot plot`
                      : isPlayerSingleStat
                        ? `${playerPosition} ${activePlayerComparisonXStat.toLowerCase()} ${isPlayerTeamProportion ? "team proportion" : isPlayerStatsTotals ? "totals" : playerUsesPer80 ? "per 80 minutes" : "per qualifying game"} dot plot`
                        : `${playerPosition} ${activePlayerComparisonXStat.toLowerCase()} against ${effectivePlayerComparisonYStat.toLowerCase()} ${isPlayerTeamProportion ? "team proportion" : isPlayerStatsTotals ? "totals" : playerUsesPer80 ? "per 80 minutes" : "per qualifying game"} scatter plot`}
                  xAxisLabel={playerSection === "Defense"
                    ? playerUsesPer80 ? "TACKLES PER 80 MINUTES · MORE →" : "TACKLES PER QUALIFYING GAME · MORE →"
                    : isPlayerEfficiency
                      ? `${playerEfficiencyOutputMetric.toUpperCase()} PER ${playerEfficiencyUnit.toUpperCase()} · BETTER →`
                      : `${activePlayerComparisonXStat.toUpperCase()} ${isPlayerTeamProportion ? "TEAM SHARE · %" : isPlayerStatsTotals ? "TOTAL" : `PER ${playerUsesPer80 ? "80 MINUTES" : "QUALIFYING GAME"}`} →`}
                  yAxisLabel={playerSection === "Defense" ? "TACKLE EFFICIENCY · BETTER ↑" : isPlayerSingleStat ? "" : isPlayerEfficiency ? `${playerEfficiencyBaseMetric.toUpperCase()} PER ${playerUsesPer80 ? "80 MINUTES" : "QUALIFYING GAME"} · MORE ↑` : `${effectivePlayerComparisonYStat.toUpperCase()} ${isPlayerTeamProportion ? "TEAM SHARE · %" : isPlayerStatsTotals ? "TOTAL" : `PER ${playerUsesPer80 ? "80 MINUTES" : "QUALIFYING GAME"}`} ↑`}
                  xMetricLabel={playerSection === "Defense" ? playerUsesPer80 ? "Tackles/80" : "Tackles/game" : isPlayerEfficiency ? `${playerEfficiencyOutputMetric}/${playerEfficiencyUnit}` : `${activePlayerComparisonXStat}${isPlayerTeamProportion ? " share" : isPlayerStatsTotals ? " total" : playerUsesPer80 ? "/80" : "/game"}`}
                  yMetricLabel={playerSection === "Defense" ? "Tackle efficiency" : isPlayerEfficiency ? `${playerEfficiencyBaseMetric}/${playerUsesPer80 ? "80" : "game"}` : isPlayerSingleStat ? "" : `${effectivePlayerComparisonYStat}${isPlayerTeamProportion ? " share" : isPlayerStatsTotals ? " total" : playerUsesPer80 ? "/80" : "/game"}`}
                  xValueSuffix={isPlayerTeamProportion ? "%" : ""}
                  yValueSuffix={playerSection === "Defense" || isPlayerTeamProportion ? "%" : ""}
                  xValueDecimals={isPlayerEfficiency ? playerEfficiencyYDecimals : isPlayerStatsTotals ? 0 : 1}
                  yValueDecimals={playerSection === "Defense" ? 1 : isPlayerEfficiency ? 1 : isPlayerStatsTotals ? 0 : 1}
                  xHigherIsBetter={playerSection !== "Attack" || isPlayerEfficiency || playerComparisonXHigherIsBetter}
                  yHigherIsBetter={playerSection !== "Attack" || isPlayerEfficiency || playerComparisonYHigherIsBetter}
                  quadrants={playerSection === "Defense" ? PLAYER_TACKLE_QUADRANTS : isPlayerEfficiency ? PLAYER_EFFICIENCY_QUADRANTS : playerComparisonQuadrants}
                  minXPadding={isPlayerEfficiency ? playerEfficiencyMinYPadding : isPlayerTeamProportion ? 0.5 : 1}
                  minYPadding={playerSection === "Defense" ? 2 : isPlayerEfficiency && playerEfficiencyShowsVolume ? 1 : isPlayerEfficiency ? playerEfficiencyMinYPadding : isPlayerTeamProportion ? 0.5 : 1}
                  singleAxis={isPlayerSingleStat}
                />
              </div>
              {playerInfoOpen ? (
                <div id="player-plot-info" className="grid gap-3 border-t border-nrl-border bg-nrl-panel-2 px-4 py-4 text-[10px] leading-relaxed text-nrl-muted md:grid-cols-2">
                  <div><span className="font-black text-nrl-text">Position sample</span><br />{playerPosition} with at least {gameWindow ?? 4} qualifying games in position. Recorded positions are used, with jersey number only used when position data is unavailable.</div>
                  <div><span className="font-black text-nrl-text">Player / Games</span><br />Player mode combines each player&apos;s qualifying sample into one point. Games mode shows every game from that same sample as its own point.</div>
                  <div><span className="font-black text-nrl-text">Game window</span><br />{gameWindow === null ? "All qualifying games are included for players with at least four appearances." : `L${gameWindow} uses each player's latest ${gameWindow} qualifying games from 2026 and requires that full sample.`}</div>
                  <div><span className="font-black text-nrl-text">Minutes adjustment</span><br />{
                    isPlayerGameMode
                      ? playerSection === "Defense"
                        ? "Each point shows that game's tackle efficiency, with tackles normalised per 80 minutes for backs. Forwards exclude games below 60% of the player's median minutes in that position."
                        : isPlayerEfficiency
                          ? `Each point shows that game's ${playerEfficiencyOutputMetric.toLowerCase()} divided by ${playerEfficiencyBaseMetric.toLowerCase()}. Volume is normalised per 80 minutes for backs and uses the game total for forwards.`
                          : isPlayerTeamProportion
                            ? "Each point shows the player's selected-stat share of their team's total in that game. Appearances below 40 minutes are excluded."
                            : "Each point shows that game's selected stats, normalised per 80 minutes for backs and using the game total for forwards."
                    : playerSection === "Defense"
                      ? "Backs are normalised to tackles per 80 minutes; tackle efficiency is averaged across qualifying games. Forwards exclude games below 60% of the player's median minutes in that position."
                      : isPlayerEfficiency
                        ? playerEfficiencyShowsVolume
                          ? `${playerEfficiencyBaseMetric} are normalised per 80 minutes for backs and per qualifying game for forwards. Efficiency is total ${playerEfficiencyOutputMetric.toLowerCase()} divided by total ${playerEfficiencyBaseMetric.toLowerCase()}. Forwards exclude games below 60% of the player's median minutes in that position.`
                          : `Efficiency is total ${playerEfficiencyOutputMetric.toLowerCase()} divided by total ${playerEfficiencyBaseMetric.toLowerCase()}. Enable Volume axis to compare it with ${playerEfficiencyBaseMetric.toLowerCase()} per ${playerUsesPer80 ? "80 minutes" : "qualifying game"}. Forwards exclude games below 60% of the player's median minutes in that position.`
                        : isPlayerTeamProportion
                          ? isPlayerSingleStat
                            ? `For each qualifying appearance of at least 40 minutes, the player's ${activePlayerComparisonXStat.toLowerCase()} are divided by their team's total from that same game. The game-level percentages are then averaged. Games where the team recorded zero are excluded. Forwards also exclude games below 60% of the player's median minutes in that position.`
                            : `For each qualifying appearance of at least 40 minutes, the player's ${activePlayerComparisonXStat.toLowerCase()} and ${activePlayerComparisonYStat.toLowerCase()} are divided by their team's totals from that same game. The game-level percentages are then averaged. Games where the team recorded zero for a selected stat are excluded from that stat's average. Forwards also exclude games below 60% of the player's median minutes in that position.`
                          : isPlayerStatsTotals
                            ? "Each selected stat is summed across the qualifying sample. Forwards exclude games below 60% of the player's median minutes in that position."
                            : `Each selected stat is normalised per 80 minutes for backs and per qualifying game for forwards. Forwards exclude games below 60% of the player's median minutes in that position.`
                  }</div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid min-h-80 place-items-center p-6 text-center text-sm font-black text-nrl-muted">{playerSection} player plots are next.</div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          {isTeamStatsComparison || isTeamEfficiency || isForVsAgainstPlot || isTeamSharePlot ? (
            <div className="flex items-end gap-3 border-b border-nrl-border px-4 py-3">
              <div className="flex min-w-0 flex-1 items-end gap-2 overflow-x-auto [scrollbar-width:thin]">
                {isTeamStatsComparison ? <div className="w-36 shrink-0"><Select label="Primary stat" compact value={activeTeamXStat} options={teamStatSelectOptions(isTeamDefenceStatsConceded ? TEAM_DEFENCE_CONCEDED_STATS : TEAM_ATTACK_COMPARISON_STATS, canAccessModelPlots)} onChange={(value) => { if (isTeamDefenceStatsConceded) setTeamDefenceXStat(value as TeamDefenceConcededStat); else setTeamAttackXStat(value as TeamAttackComparisonStat); refreshSelectedTeamModelStat(value); }} /></div> : null}
                {isTeamStatsComparison ? <div className="w-40 shrink-0"><Select label="Comparison stat" compact value={activeTeamYStat} options={[{ value: "None", label: "+ Add comparison" }, ...teamStatSelectOptions(isTeamDefenceStatsConceded ? TEAM_DEFENCE_CONCEDED_STATS : TEAM_ATTACK_COMPARISON_STATS, canAccessModelPlots)]} onChange={(value) => { if (isTeamDefenceStatsConceded) setTeamDefenceYStat(value as OptionalTeamDefenceComparisonStat); else setTeamAttackYStat(value as OptionalTeamAttackComparisonStat); refreshSelectedTeamModelStat(value); }} /></div> : null}
                {isTeamEfficiency ? <div className="w-24 shrink-0"><Select label="Per" compact value={activeTeamEfficiencyBaseMetric} options={[...TEAM_ATTACK_EFFICIENCY_BASE_STATS]} onChange={(value) => isTeamDefenceEfficiency ? setTeamDefenceEfficiencyBaseMetric(value as TeamAttackEfficiencyBaseStat) : setTeamEfficiencyBaseMetric(value as TeamAttackEfficiencyBaseStat)} /></div> : null}
                {isTeamEfficiency ? <div className="w-32 shrink-0"><Select label="Output stat" compact value={activeTeamEfficiencyOutputMetric} options={[...TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS]} onChange={(value) => isTeamDefenceEfficiency ? setTeamDefenceEfficiencyOutputMetric(value as TeamAttackEfficiencyOutputStat) : setTeamEfficiencyOutputMetric(value as TeamAttackEfficiencyOutputStat)} /></div> : null}
                {isForVsAgainstPlot ? <div className="w-36 shrink-0"><Select label="For stat" compact value={teamForStat} options={[...TEAM_FOR_AGAINST_STATS]} onChange={(value) => setTeamForStat(value as TeamAttackComparisonStat)} /></div> : null}
                {isForVsAgainstPlot ? <div className="w-36 shrink-0"><Select label="Against stat" compact value={teamAgainstStat} options={[...TEAM_FOR_AGAINST_STATS]} onChange={(value) => setTeamAgainstStat(value as TeamAttackComparisonStat)} /></div> : null}
                {isTeamSharePlot ? <div className="w-28 shrink-0"><Select label="Stat" compact value={teamShareMetric} options={[...TEAM_SHARE_METRICS]} onChange={(value) => setTeamShareMetric(value as TeamShareMetric)} /></div> : null}
              </div>
            </div>
          ) : null}

          <PlotSummary title={teamPlotTitle} detail={teamPlotDetail}>
            <InfoCircleButton open={teamInfoOpen} onClick={() => setTeamInfoOpen((current) => !current)} controls="team-plot-info" />
            <FiltersButton open={teamFiltersOpen} onClick={() => setTeamFiltersOpen((current) => !current)} controls="team-plot-filters" />
          </PlotSummary>
          {teamFiltersOpen ? (
            <div id="team-plot-filters" className="flex items-end gap-3 overflow-x-auto border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 [scrollbar-width:thin]">
              {!isOther || isRuckDominancePlot || isForVsAgainstPlot ? <div className="w-32 shrink-0"><Select label="Plot points" compact value={mode === "season" ? "Team" : "Games"} options={[{ value: "Team", label: "One per team" }, { value: "Games", label: "One per game" }]} onChange={(value) => setMode(value === "Team" ? "season" : "games")} /></div> : null}
              {isTeamAttackEfficiency ? <VolumeAxisToggle checked={teamEfficiencyShowsVolume} onChange={(checked) => setTeamEfficiencyView(checked ? "Volume axis" : "Efficiency")} /> : null}
              {isTeamDefenceEfficiency ? <VolumeAxisToggle checked={teamDefenceEfficiencyShowsVolume} onChange={(checked) => setTeamDefenceEfficiencyView(checked ? "Volume axis" : "Efficiency")} /> : null}
              <GameWindowButtons value={gameWindow} onChange={(value) => void changeGameWindow(value)} />
              <div className="w-20 shrink-0"><Select label="Season" compact value={year} options={availableYears} onChange={(value) => void changeYear(value)} /></div>
            </div>
          ) : null}

          <div className="relative p-2 sm:p-4">
            {loading ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
                <span aria-label="Loading season" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent" />
              </div>
            ) : null}
            {modelPlotLocked ? (
              <ModelPlotLock plotName={isXPoints ? "xPoints" : isRuckDominancePlot ? "Ruck Dominance Rating" : selectedModelStatName || "contact and defense rating"} />
            ) : isTeamSharePlot ? (
              <ReceiptShareLines series={teamShareSeries} metric={teamShareMetric} />
            ) : (
              <TeamQuadrantScatter
                points={plottedTeamPoints}
                teamLogos={teamLogos}
                ariaLabel={teamScatterAriaLabel}
                xAxisLabel={teamXAxisLabel}
                yAxisLabel={teamYAxisLabel}
                xMetricLabel={teamXMetricLabel}
                yMetricLabel={teamYMetricLabel}
                xValueSuffix={teamXValueSuffix}
                yValueSuffix={teamYValueSuffix}
                xValueDecimals={isTeamEfficiency ? teamEfficiencyYDecimals : isForVsAgainstPlot && teamForStat === "PTB" ? 2 : isTeamStatsComparison && activeTeamXStat === "PTB" ? 2 : 1}
                yValueDecimals={isForVsAgainstPlot && teamAgainstStat === "PTB" ? 2 : isTeamStatsComparison && effectiveTeamYStat === "PTB" ? 2 : 1}
                comparisonLine={isXPoints}
                rSquared={teamGameRSquared}
                colorByQuadrant={isAttack || isTeamDefenceStatsConceded || isTeamDefenceEfficiency || isForVsAgainstPlot}
                xHigherIsBetter={isXPoints || isRuckDominancePlot || isTeamAttackEfficiency || (isForVsAgainstPlot && teamForHigherIsBetter) || (isTeamStatsComparison && activeTeamXHigherIsBetter)}
                yHigherIsBetter={isForVsAgainstPlot ? teamAgainstHigherIsBetter : isTeamStatsComparison ? activeTeamYHigherIsBetter : true}
                quadrants={isXPoints ? XPOINTS_QUADRANTS : isForVsAgainstPlot ? teamForAgainstQuadrants : isTeamDefenceEfficiency ? DEFENSIVE_EFFICIENCY_QUADRANTS : isTeamAttackEfficiency ? PLAYER_EFFICIENCY_QUADRANTS : isTeamDefenceStatsConceded ? teamDefenceQuadrants : isAttack ? teamAttackQuadrants : DEFENCE_QUADRANTS}
                minXPadding={isXPoints ? 2 : isForVsAgainstPlot ? teamForMeta.minPadding : isTeamEfficiency ? activeTeamEfficiencyOutputMetric.includes("metres") ? 0.2 : 0.01 : isTeamStatsComparison ? activeTeamXMeta.minPadding : 2}
                minYPadding={isXPoints ? 2 : isForVsAgainstPlot ? teamAgainstMeta.minPadding : isTeamEfficiency && activeTeamEfficiencyShowsVolume ? 1 : isTeamEfficiency ? activeTeamEfficiencyOutputMetric.includes("metres") ? 0.2 : 0.01 : isTeamStatsComparison ? activeTeamYMeta.minPadding : 3}
                singleAxis={isTeamSingleStat}
              />
            )}
          </div>

          {teamInfoOpen ? <div id="team-plot-info" className="grid gap-3 border-t border-nrl-border bg-nrl-panel-2 px-4 py-4 text-[10px] leading-relaxed text-nrl-muted md:grid-cols-2">
            <div><span className="font-black text-nrl-text">Game window</span><br />{gameWindow === null ? "All team games in the selected season are included." : `L${gameWindow} uses each team's latest ${gameWindow} games from 2026. Season mode aggregates that sample; Team Games mode shows those individual games.`}</div>
            {isTeamSharePlot ? (
              <>
                <div><span className="font-black text-nrl-text">Starter groups</span><br />Recorded starting positions are used. Each position group&apos;s share of team {teamShareMetric.toLowerCase()}. Fullback, Wingers, Centres, Halves, Edges and Middles are included; Hooker and interchange are excluded.</div>
                <div><span className="font-black text-nrl-text">Average {teamShareMetric.toLowerCase()} share</span><br />Position-group starter {teamShareMetric.toLowerCase()} ÷ all team {teamShareMetric.toLowerCase()} × 100 for each game, averaged across the season.</div>
                <div><span className="font-black text-nrl-text">Interaction</span><br />Hover or focus a team to isolate its {teamShareMetric.toLowerCase()} profile.</div>
              </>
            ) : isForVsAgainstPlot ? (
              <>
                <div><span className="font-black text-nrl-text">For stat</span><br />The horizontal axis shows each team&apos;s average {teamForStat.toLowerCase()} produced per game.</div>
                <div><span className="font-black text-nrl-text">Against stat</span><br />The vertical axis shows average opponent {teamAgainstStat.toLowerCase()} produced against that team per game.</div>
                <div><span className="font-black text-nrl-text">Aggregation</span><br />Team mode averages the selected sample for each team. Games mode shows each individual matchup.</div>
              </>
            ) : isRuckDominancePlot ? (
              <>
                <div><span className="font-black text-nrl-text">Ruck Dominance Rating</span><br />A 50/50 blend of the attacking and defensive ratings, showing a team&apos;s overall control of the ruck. The baseline average is 50 and every 10 points represents one standard deviation. Higher is better.</div>
              </>
            ) : isXPoints ? (
              <>
                <div><span className="font-black text-nrl-text">{isDefenseXPoints ? "Defensive expectation" : "xPoints"}</span><br />{isDefenseXPoints ? "The horizontal axis is actual points conceded; the vertical axis is opponent xPoints. This mirror keeps defensive outperformance above the equality line." : "Expected points scored from the post-match model. Season mode shows each team's average per game."}</div>
                <div><span className="font-black text-nrl-text">Performance</span><br />{isDefenseXPoints ? "Green means fewer points were conceded than expected; red means more were conceded than expected." : "Green means actual points exceeded xPoints; red means actual points finished below xPoints."}</div>
                <div><span className="font-black text-nrl-text">Equality line</span><br />Points on the diagonal matched model expectation exactly.</div>
              </>
            ) : isAttack ? (
              isTeamAttackEfficiency ? (
                teamEfficiencyShowsVolume ? (
                  <>
                    <div><span className="font-black text-nrl-text">Efficiency</span><br />The horizontal axis is total {teamEfficiencyOutputMetric.toLowerCase()} divided by total {teamEfficiencyBaseMetric.toLowerCase()} in the selected sample.</div>
                    <div><span className="font-black text-nrl-text">Volume</span><br />The vertical axis is average team {teamEfficiencyBaseMetric.toLowerCase()} per game.</div>
                    <div><span className="font-black text-nrl-text">Profiles</span><br />League averages split teams by attacking volume and efficiency.</div>
                  </>
                ) : (
                  <div><span className="font-black text-nrl-text">Efficiency</span><br />Total {teamEfficiencyOutputMetric.toLowerCase()} divided by total {teamEfficiencyBaseMetric.toLowerCase()} in the selected sample. Enable Volume axis to compare efficiency with team volume per game.</div>
                )
              ) : isTeamSingleStat ? (
                <>
                  <div><span className="font-black text-nrl-text">{activeTeamXStat}{isTeamDefenceStatsConceded ? " conceded" : ""}</span><br />{isTeamDefenceStatsConceded ? activeTeamXMeta.description.replace("Average", "Average opponent") : activeTeamXMeta.description} {isTeamDefenceStatsConceded || !teamAttackXHigherIsBetter ? "Lower" : "Higher"} is better.</div>
                </>
              ) : (
                <>
                  <div><span className="font-black text-nrl-text">{teamAttackXStat}</span><br />{teamAttackXMeta.description} {teamAttackXHigherIsBetter ? "Higher" : "Lower"} is better.</div>
                  <div><span className="font-black text-nrl-text">{effectiveTeamAttackYStat}</span><br />{teamAttackYMeta.description} {teamAttackYHigherIsBetter ? "Higher" : "Lower"} is better.</div>
                  <div><span className="font-black text-nrl-text">Profiles</span><br />Choose either metric for each axis. League averages split the four attacking profiles.</div>
                </>
              )
            ) : isTeamDefenceEfficiency ? (
              teamDefenceEfficiencyShowsVolume ? (
                <>
                  <div><span className="font-black text-nrl-text">Defensive efficiency</span><br />The horizontal axis is total opponent {activeTeamEfficiencyOutputMetric.toLowerCase()} divided by total opponent {activeTeamEfficiencyBaseMetric.toLowerCase()} in the selected sample. Lower is better.</div>
                  <div><span className="font-black text-nrl-text">Volume faced</span><br />The vertical axis is average opponent {activeTeamEfficiencyBaseMetric.toLowerCase()} per game against each defense.</div>
                  <div><span className="font-black text-nrl-text">Profiles</span><br />League averages split teams by opponent volume and defensive efficiency.</div>
                </>
              ) : (
                <div><span className="font-black text-nrl-text">Defensive efficiency</span><br />Total opponent {activeTeamEfficiencyOutputMetric.toLowerCase()} divided by total opponent {activeTeamEfficiencyBaseMetric.toLowerCase()} in the selected sample. Lower is better. Enable Volume axis to compare efficiency with opponent volume per game.</div>
              )
            ) : isTeamDefenceStatsConceded && isTeamSingleStat ? (
              <>
                <div><span className="font-black text-nrl-text">{activeTeamXDisplayName}</span><br />{DEFENSIVE_RATING_STATS.has(activeTeamXStat) ? activeTeamXMeta.description : activeTeamXMeta.description.replace("Average", "Average opponent")} {activeTeamXHigherIsBetter ? "Higher" : "Lower"} is better.</div>
              </>
            ) : isTeamDefenceStatsConceded ? (
              <>
                <div><span className="font-black text-nrl-text">{activeTeamXDisplayName}</span><br />{DEFENSIVE_RATING_STATS.has(activeTeamXStat) ? activeTeamXMeta.description : activeTeamXMeta.description.replace("Average", "Average opponent")} {activeTeamXHigherIsBetter ? "Higher" : "Lower"} is better.</div>
                <div><span className="font-black text-nrl-text">{activeTeamYDisplayName}</span><br />{DEFENSIVE_RATING_STATS.has(effectiveTeamYStat) ? activeTeamYMeta.description : activeTeamYMeta.description.replace("Average", "Average opponent")} {activeTeamYHigherIsBetter ? "Higher" : "Lower"} is better.</div>
                <div><span className="font-black text-nrl-text">Profiles</span><br />Opponent match stats are attributed to the defending team. League averages split the four defensive profiles.</div>
              </>
            ) : (
              <>
                <div><span className="font-black text-nrl-text">Contact rating</span><br />(Opponent tackle breaks + opponent offloads) ÷ opponent runs × 100. Lower is better.</div>
                <div><span className="font-black text-nrl-text">Defense rating</span><br />Sourced from nrl.post_match_team_metrics. Higher is better.</div>
                <div><span className="font-black text-nrl-text">Profiles</span><br />League averages split the four defensive profiles. Contact improves right; defense improves up.</div>
              </>
            )}
          </div> : null}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
        <div className="flex items-end justify-between gap-3 border-b border-nrl-border px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1 sm:max-w-80">
            <Select
              label="Pro model plot"
              value={proPlot}
              options={["Attack", "Defense", "Team context"].map((category) => ({
                label: category,
                options: PRO_MODEL_PLOTS.filter((plot) => plot.category === category).map((plot) => ({ value: plot.id, label: plot.title })),
              }))}
              onChange={(value) => {
                setProPlot(value as ProModelPlotId);
                setProInfoOpen(false);
              }}
            />
          </div>
          <span className="mb-1 shrink-0 rounded-full border border-violet-300/35 bg-violet-400/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-violet-200">Pro</span>
        </div>

        <PlotSummary
          title={activeProPlot.title}
          detail={`${proYear} season · ${proGameWindow === null ? "All games" : `Last ${proGameWindow} games`} · ${proMode === "season" ? "One point per team" : "One point per game"}`}
        >
          <InfoCircleButton open={proInfoOpen} onClick={() => setProInfoOpen((current) => !current)} controls="pro-plot-info" />
          <FiltersButton open={proFiltersOpen} onClick={() => setProFiltersOpen((current) => !current)} controls="pro-plot-filters" />
        </PlotSummary>

        {proFiltersOpen ? (
          <div id="pro-plot-filters" className="flex items-end gap-3 overflow-x-auto border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 [scrollbar-width:thin]">
            <div className="w-32 shrink-0"><Select label="Plot points" compact value={proMode === "season" ? "Team" : "Games"} options={[{ value: "Team", label: "One per team" }, { value: "Games", label: "One per game" }]} onChange={(value) => setProMode(value === "Team" ? "season" : "games")} /></div>
            <GameWindowButtons value={proGameWindow} onChange={changeProGameWindow} />
            <div className="w-20 shrink-0"><Select label="Season" compact value={proYear} options={availableYears} onChange={changeProYear} /></div>
          </div>
        ) : null}

        <div className="relative p-2 sm:p-4">
          {proLoading ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
              <span aria-label="Loading Pro model plot" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-300/25 border-t-violet-300" />
            </div>
          ) : null}
          {!canAccessModelPlots ? (
            <ModelPlotLock plotName={activeProPlot.title} />
          ) : (
            <TeamQuadrantScatter
              key={`${proPlot}-${proMode}-${proYear}-${proGameWindow ?? "all"}`}
              points={proPlotPoints}
              teamLogos={teamLogos}
              emptyMessage="No model data is available for this selection."
              ariaLabel={`${activeProPlot.title} ${proIsSingleAxis ? "dot" : "scatter"} plot`}
              xAxisLabel={proXAxisLabel}
              yAxisLabel={proYAxisLabel}
              xMetricLabel={proIsXPoints ? proIsConceded ? "Actual points conceded" : "xPoints" : proIsContactDefense ? "Contact disruptions allowed" : proMetricName}
              yMetricLabel={proIsXPoints ? proIsConceded ? "xPoints conceded" : "Actual points" : proIsContactDefense ? "Defense rating" : ""}
              xValueDecimals={1}
              yValueDecimals={1}
              comparisonLine={proIsXPoints}
              colorByQuadrant={proIsXPoints || proIsContactDefense}
              xHigherIsBetter={!proIsConceded && !proIsContactDefense && proPlot !== "ptb-rating"}
              yHigherIsBetter={!proIsConceded}
              quadrants={proIsConceded ? XPOINTS_CONCEDED_QUADRANTS : proIsXPoints ? XPOINTS_QUADRANTS : proIsContactDefense ? DEFENCE_QUADRANTS : comparisonQuadrants(proMetricName, proMetricName)}
              minXPadding={proIsXPoints || proIsContactDefense ? 2 : 1}
              minYPadding={proIsXPoints || proIsContactDefense ? 2 : 1}
              singleAxis={proIsSingleAxis}
            />
          )}
        </div>

        {proInfoOpen ? (
          <div id="pro-plot-info" className="grid gap-3 border-t border-nrl-border bg-nrl-panel-2 px-4 py-4 text-[10px] leading-relaxed text-nrl-muted md:grid-cols-2">
            <div><span className="font-black text-nrl-text">{activeProPlot.title}</span><br />{activeProPlot.description}</div>
            <div><span className="font-black text-nrl-text">Aggregation</span><br />Team mode averages the selected sample for each team. Games mode plots every individual matchup.</div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

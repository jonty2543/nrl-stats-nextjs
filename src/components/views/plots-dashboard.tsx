"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { buildAttackRatingPoints, buildConcededRatingPoints, TEAM_ATTACK_COMPARISON_STATS, TEAM_ATTACK_EFFICIENCY_BASE_STATS, TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS, TEAM_DEFENCE_CONCEDED_STATS, type AttackRatingPoint, type TeamAttackComparisonStat, type TeamAttackEfficiencyBaseStat, type TeamAttackEfficiencyOutputStat, type TeamAttackTotalStat, type TeamDefenceConcededStat } from "@/lib/data/attack-ratings";
import { buildDefenceRatingPoints, type DefencePlotMode } from "@/lib/data/defence-ratings";
import { buildTeamShareSeries, TEAM_SHARE_METRICS, type TeamShareMetric } from "@/lib/data/receipt-share";
import { buildHalvesPairingPoints, buildPlayerAttackComparisonPoints, buildPlayerAttackPoints, buildPlayerDefencePoints, PLAYER_ATTACK_COMPARISON_STATS, PLAYER_ATTACK_POSITIONS, PLAYER_ATTACK_STAT_COMPARISON_STATS, PLAYER_BACK_POSITIONS, PLAYER_EFFICIENCY_BASE_METRICS, PLAYER_EFFICIENCY_OUTPUT_METRICS, type HalvesPairingSort, type PlayerAttackComparisonStat, type PlayerAttackPosition, type PlayerEfficiencyBaseMetric, type PlayerEfficiencyOutputMetric, type PlayerGameWindow } from "@/lib/data/player-attack";
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
    <div className="flex shrink-0 rounded-md border border-nrl-border bg-nrl-panel-2 p-0.5" aria-label="Qualifying game window">
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
const LOCKED_TEAM_STATS = new Set(["Attacking Ruck Rating", "Defensive Ruck Rating", "Ruck Dominance Rating", "PTB Rating", "Cover Rating"]);
const DEFENSIVE_RATING_STATS = new Set(["Contact Rating", "Cover Rating", "Defensive Ruck Rating"]);
const CURRENT_GAME_WINDOW_YEAR = "2026";
type PlayerStatsAggregation = "Per game" | "Totals";

type TeamStatsComparisonStat = TeamAttackComparisonStat | TeamDefenceConcededStat;
type TeamStatsRatingPoint = AttackRatingPoint & Pick<TeamPostMatchStatPoint, "attackingRuckRating" | "defensiveRuckRating" | "ruckDominanceRating" | "ptbRating" | "contactRating" | "coverRating">;

function teamStatSelectOptions(stats: readonly TeamStatsComparisonStat[], canAccessModelPlots: boolean) {
  return stats.map((stat) => !canAccessModelPlots && LOCKED_TEAM_STATS.has(stat)
    ? { value: stat, label: `🔒 ${stat}` }
    : stat);
}

function teamStatHigherIsBetter(stat: TeamStatsComparisonStat, conceded: boolean): boolean {
  if (!conceded) return !LOWER_IS_BETTER_STATS.has(stat);
  return stat === "PTB" || stat === "Cover Rating" || stat === "Defensive Ruck Rating";
}

function defenceStatLabel(stat: TeamDefenceConcededStat): string {
  return DEFENSIVE_RATING_STATS.has(stat) ? stat : `${stat} conceded`;
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
  "Cover Rating": {
    axisLabel: "COVER RATING",
    metricLabel: "Cover Rating",
    description: "Context-adjusted cover-defence rating, centred on 50.",
    minPadding: 2,
    value: (point) => point.coverRating,
  },
  "Missed tackles": perGameAttackStat("Missed tackles"),
  Penalties: perGameAttackStat("Penalties"),
  Errors: perGameAttackStat("Errors"),
};

const DEFENCE_QUADRANTS: QuadrantLabels = {
  topLeft: ["CONTACT LEAKS", "STRONG COVER"],
  topRight: ["STRONG CONTACT", "STRONG COVER"],
  bottomLeft: ["CONTACT LEAKS", "COVER LEAKS"],
  bottomRight: ["STRONG CONTACT", "COVER LEAKS"],
};

const XPOINTS_QUADRANTS: QuadrantLabels = {
  topLeft: ["LOW XPOINTS", "HIGH ACTUAL"],
  topRight: ["HIGH XPOINTS", "HIGH ACTUAL"],
  bottomLeft: ["LOW XPOINTS", "LOW ACTUAL"],
  bottomRight: ["HIGH XPOINTS", "LOW ACTUAL"],
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
type DefencePlot = "Contact vs cover defence" | "Stats Conceded" | "Defensive Efficiency" | "Actual points conceded vs xPoints conceded";
type EfficiencyView = "Efficiency" | "Volume axis";
type TeamOtherPlot = "Team Share by Position" | "Ruck Dominance Rating";
type PlayerAttackPlot = "Stats" | "Efficiency" | "Team Proportion";
type PlayerSection = "Attack" | "Defense" | "Other";
type OptionalPlayerComparisonStat = PlayerAttackComparisonStat | "None";
type OptionalTeamAttackComparisonStat = TeamAttackComparisonStat | "None";
type OptionalTeamDefenceComparisonStat = TeamDefenceConcededStat | "None";
const HALVES_PAIRING_SORT_OPTIONS = ["Ascending · most different", "Descending · closest to 50/50"] as const;
type HalvesPairingSortLabel = (typeof HALVES_PAIRING_SORT_OPTIONS)[number];

interface PlotsDashboardProps {
  initialData: TeamStat[];
  initialPlayerData: PlayerStat[];
  initialPostMatchMetrics: PostMatchTeamMetricWithRdr[];
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

export function PlotsDashboard({ initialData, initialPlayerData, initialPostMatchMetrics, availableYears, initialYear, teamLogos, playerFaceImages, canAccessModelPlots }: PlotsDashboardProps) {
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
  const [gameWindow, setGameWindow] = useState<PlayerGameWindow>(null);
  const [playerInfoOpen, setPlayerInfoOpen] = useState(false);
  const [teamInfoOpen, setTeamInfoOpen] = useState(false);
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
  const [defencePlot, setDefencePlot] = useState<DefencePlot>("Contact vs cover defence");
  const [teamOtherPlot, setTeamOtherPlot] = useState<TeamOtherPlot>("Team Share by Position");
  const [teamShareMetric, setTeamShareMetric] = useState<TeamShareMetric>("Runs");
  const [mode, setMode] = useState<DefencePlotMode>("season");
  const [year, setYear] = useState(initialYear);
  const [rowsByYear, setRowsByYear] = useState<Record<string, TeamStat[]>>({ [initialYear]: initialData });
  const [postMatchMetricsByYear, setPostMatchMetricsByYear] = useState<Record<string, PostMatchTeamMetricWithRdr[]>>({ [initialYear]: initialPostMatchMetrics });
  const [playerRowsByYear, setPlayerRowsByYear] = useState<Record<string, PlayerStat[]>>({ [initialYear]: initialPlayerData });
  const [loading, setLoading] = useState(false);
  const currentRows = useMemo(() => rowsByYear[year] ?? [], [rowsByYear, year]);
  const currentPostMatchMetrics = useMemo(() => postMatchMetricsByYear[year] ?? [], [postMatchMetricsByYear, year]);
  const defencePoints = useMemo(() => buildDefenceRatingPoints(currentRows, mode, currentPostMatchMetrics, gameWindow), [currentPostMatchMetrics, currentRows, gameWindow, mode]);
  const attackPoints = useMemo(() => buildAttackRatingPoints(currentRows, mode, gameWindow), [currentRows, gameWindow, mode]);
  const concededPoints = useMemo(() => buildConcededRatingPoints(currentRows, mode, gameWindow), [currentRows, gameWindow, mode]);
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
  const isTeamStatsComparison = isTeamAttackStatComparison || isTeamDefenceStatsConceded;
  const isTeamEfficiency = isTeamAttackEfficiency || isTeamDefenceEfficiency;
  const isDefenseXPoints = isDefense && defencePlot === "Actual points conceded vs xPoints conceded";
  const isXPoints = isAttackXPoints || isDefenseXPoints;
  const isModelPlot = isXPoints || isRuckDominancePlot || (isDefense && defencePlot === "Contact vs cover defence");
  const teamAttackXMeta = TEAM_ATTACK_STAT_META[teamAttackXStat];
  const effectiveTeamAttackYStat = teamAttackYStat === "None" ? teamAttackXStat : teamAttackYStat;
  const teamAttackYMeta = TEAM_ATTACK_STAT_META[effectiveTeamAttackYStat];
  const teamAttackXHigherIsBetter = teamStatHigherIsBetter(teamAttackXStat, false);
  const teamAttackYHigherIsBetter = teamStatHigherIsBetter(effectiveTeamAttackYStat, false);
  const teamAttackQuadrants = useMemo(() => comparisonQuadrants(teamAttackXStat, effectiveTeamAttackYStat, "", teamAttackXHigherIsBetter), [effectiveTeamAttackYStat, teamAttackXHigherIsBetter, teamAttackXStat]);
  const activeTeamXStat = isTeamDefenceStatsConceded ? teamDefenceXStat : teamAttackXStat;
  const activeTeamYStat = isTeamDefenceStatsConceded ? teamDefenceYStat : teamAttackYStat;
  const isTeamSingleStat = isRuckDominancePlot || (isTeamAttackEfficiency && !teamEfficiencyShowsVolume) || (isTeamDefenceEfficiency && !teamDefenceEfficiencyShowsVolume) || (isTeamStatsComparison && activeTeamYStat === "None");
  const effectiveTeamYStat = activeTeamYStat === "None" ? activeTeamXStat : activeTeamYStat;
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
  const activeTeamXDisplayName = isTeamDefenceStatsConceded ? defenceStatLabel(activeTeamXStat as TeamDefenceConcededStat) : activeTeamXStat;
  const activeTeamYDisplayName = isTeamDefenceStatsConceded ? defenceStatLabel(effectiveTeamYStat as TeamDefenceConcededStat) : effectiveTeamYStat;
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
  const isPlayerStatsTotals = playerAttackPlot === "Stats" && playerStatsAggregation === "Totals";
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
    : (["Tries", "Try assists", "Line break assists"] as PlayerEfficiencyOutputMetric[]).includes(playerEfficiencyOutputMetric) ? 3 : 2;
  const teamShareSeries = useMemo(
    () => buildTeamShareSeries(playerRowsByYear[year] ?? [], teamShareMetric, gameWindow),
    [gameWindow, playerRowsByYear, teamShareMetric, year]
  );
  const xPointsData = useMemo(
    () => buildXPointsPlotPoints(currentPostMatchMetrics, mode, isDefenseXPoints ? "defense" : "attack", gameWindow),
    [currentPostMatchMetrics, gameWindow, isDefenseXPoints, mode]
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
    attack: new Map(buildTeamPostMatchStatPoints(currentPostMatchMetrics, mode, "attack", gameWindow).map((point) => [
      teamModelPointKey(point.team, point.year, point.roundLabel),
      point,
    ])),
    defense: new Map(buildTeamPostMatchStatPoints(currentPostMatchMetrics, mode, "defense", gameWindow).map((point) => [
      teamModelPointKey(point.team, point.year, point.roundLabel),
      point,
    ])),
  }), [currentPostMatchMetrics, gameWindow, mode]);
  const playerAttackData = useMemo(
    () => buildPlayerAttackPoints(playerRowsByYear[year] ?? [], playerPosition, playerEfficiencyBaseMetric, playerEfficiencyOutputMetric, gameWindow),
    [gameWindow, playerEfficiencyBaseMetric, playerEfficiencyOutputMetric, playerPosition, playerRowsByYear, year]
  );
  const playerAttackComparisonData = useMemo(
    () => buildPlayerAttackComparisonPoints(
      playerRowsByYear[year] ?? [],
      playerPosition,
      activePlayerComparisonXStat,
      effectivePlayerComparisonYStat,
      isPlayerTeamProportion ? "team-proportion" : isPlayerStatsTotals ? "totals" : "per-game",
      gameWindow
    ),
    [activePlayerComparisonXStat, effectivePlayerComparisonYStat, gameWindow, isPlayerStatsTotals, isPlayerTeamProportion, playerPosition, playerRowsByYear, year]
  );
  const playerDefenceData = useMemo(
    () => buildPlayerDefencePoints(playerRowsByYear[year] ?? [], playerPosition, gameWindow),
    [gameWindow, playerPosition, playerRowsByYear, year]
  );
  const halvesPairings = useMemo(
    () => buildHalvesPairingPoints(playerRowsByYear[year] ?? [], halvesPairingStat, halvesPairingSort, gameWindow),
    [gameWindow, halvesPairingSort, halvesPairingStat, playerRowsByYear, year]
  );
  const playerAttackPoints = useMemo<TeamQuadrantPoint[]>(() => playerAttackData.map((point) => ({
    id: point.id,
    team: point.player,
    year,
    roundLabel: "",
    opponent: null,
    games: point.games,
    xValue: point.efficiencyValue,
    yValue: playerEfficiencyShowsVolume ? point.volumeValue : point.efficiencyValue,
    detail: `${point.team} · ${point.averageMinutes.toFixed(1)} avg mins${point.isPer80 ? "" : ` · ${point.usualMinutes.toFixed(1)} usual mins`}`,
  })), [playerAttackData, playerEfficiencyShowsVolume, year]);
  const playerAttackComparisonPoints = useMemo<TeamQuadrantPoint[]>(() => playerAttackComparisonData.map((point) => ({
    id: point.id,
    team: point.player,
    year,
    roundLabel: "",
    opponent: null,
    games: point.games,
    xValue: point.xValue,
    yValue: point.yValue,
    detail: point.team,
  })), [playerAttackComparisonData, year]);
  const playerDefencePoints = useMemo<TeamQuadrantPoint[]>(() => playerDefenceData.map((point) => ({
    id: point.id,
    team: point.player,
    year,
    roundLabel: "",
    opponent: null,
    games: point.games,
    xValue: point.tacklesValue,
    yValue: point.tackleEfficiency,
    detail: `${point.team} · ${point.averageMinutes.toFixed(1)} avg mins${point.isPer80 ? "" : ` · ${point.usualMinutes.toFixed(1)} usual mins`}`,
  })), [playerDefenceData, year]);
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
          coverRating: modelPoint?.coverRating ?? null,
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
    return defencePoints.map((point) => ({
      id: point.id,
      team: point.team,
      year: point.year,
      roundLabel: point.roundLabel,
      opponent: point.opponent,
      games: point.games,
      xValue: point.contactRating,
      yValue: point.coverRating,
      detail: `Expected LB ${point.expectedLineBreaks.toFixed(1)} · Allowed ${point.actualLineBreaks.toFixed(1)}`,
    }));
  }, [activeTeamEfficiencyBaseMetric, activeTeamEfficiencyOutputMetric, activeTeamEfficiencyShowsVolume, activeTeamXMeta, activeTeamYMeta, attackPoints, concededPoints, defencePoints, isAttack, isRuckDominancePlot, isTeamDefenceEfficiency, isTeamDefenceStatsConceded, isTeamEfficiency, teamModelStats.attack, teamModelStats.defense]);
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
        : isTeamSingleStat
          ? `${activeTeamXDisplayName} dot plot`
          : isTeamDefenceStatsConceded
            ? `${activeTeamXDisplayName} against ${activeTeamYDisplayName} scatter plot`
            : isAttack
              ? `${teamAttackXStat} against ${effectiveTeamAttackYStat} scatter plot`
            : "Contact defence against cover defence scatter plot";
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
        : isTeamDefenceStatsConceded
          ? `${activeTeamXMeta.axisLabel}${DEFENSIVE_RATING_STATS.has(activeTeamXStat) ? "" : " CONCEDED"} · BETTER →`
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
        : isTeamDefenceStatsConceded
          ? `${activeTeamYMeta.axisLabel}${DEFENSIVE_RATING_STATS.has(effectiveTeamYStat) ? "" : " CONCEDED"} · BETTER ${activeTeamYHigherIsBetter ? "↑" : "↓"}`
          : isAttack
            ? `${teamAttackYMeta.axisLabel} · BETTER ${teamAttackYHigherIsBetter ? "↑" : "↓"}`
            : "COVER DEFENCE RATING · BETTER ↑";
  const teamXMetricLabel = isAttackXPoints
    ? "xPoints"
    : isDefenseXPoints
      ? "Actual conceded"
      : isTeamDefenceEfficiency
        ? `${activeTeamEfficiencyOutputMetric} conceded/${teamEfficiencyUnit}`
      : isTeamAttackEfficiency
        ? `${activeTeamEfficiencyOutputMetric}/${teamEfficiencyUnit}`
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
        : isTeamDefenceStatsConceded
          ? activeTeamYDisplayName
          : isAttack ? teamAttackYMeta.metricLabel : "Cover";
  const teamGameRSquared = useMemo(
    () => mode === "games" && !isTeamSingleStat ? coefficientOfDetermination(plottedTeamPoints) : null,
    [isTeamSingleStat, mode, plottedTeamPoints]
  );

  const loadTeamYear = async (targetYear: string, manageLoading = true, refreshMetrics = false) => {
    if (rowsByYear[targetYear] && (!canAccessModelPlots || (postMatchMetricsByYear[targetYear] && !refreshMetrics))) return;
    if (manageLoading) setLoading(true);
    try {
      const [teamResponse, metricsResponse] = await Promise.all([
        rowsByYear[targetYear] ? null : fetch(`/api/team-stats?years=${encodeURIComponent(targetYear)}`),
        !canAccessModelPlots || (postMatchMetricsByYear[targetYear] && !refreshMetrics)
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
      void loadTeamYear(year, true, true);
    }
  };

  const loadOtherYear = async (targetYear: string) => {
    if (playerRowsByYear[targetYear] && rowsByYear[targetYear] && (!canAccessModelPlots || postMatchMetricsByYear[targetYear])) return;
    setLoading(true);
    try {
      await Promise.all([loadPlayerYear(targetYear, false), loadTeamYear(targetYear, false)]);
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
      await loadOtherYear(nextYear);
      return;
    }
    await loadTeamYear(nextYear);
  };

  const changeGameWindow = async (nextWindow: PlayerGameWindow) => {
    setGameWindow(nextWindow);
    if (nextWindow !== null && year !== CURRENT_GAME_WINDOW_YEAR) {
      await changeYear(CURRENT_GAME_WINDOW_YEAR);
    }
  };

  const changeTeamSection = (section: TeamSection) => {
    setTeamSection(section);
    if (section === "Defense") {
      setDefencePlot("Stats Conceded");
    }
    if (section === "Other") {
      void loadOtherYear(year);
    } else {
      void loadTeamYear(year);
    }
  };

  const changeEntity = (nextEntity: string) => {
    setEntity(nextEntity);
    if (nextEntity === "Players") {
      void loadPlayerYear(year);
    } else {
      setTeamSection("Attack");
      setAttackPlot("Stats");
      setTeamAttackXStat("Run metres");
      setTeamAttackYStat("None");
      void loadTeamYear(year);
    }
  };

  const changePlayerSection = (section: PlayerSection) => {
    setPlayerSection(section);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-nrl-border bg-nrl-panel p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-nrl-accent">Plots</div>
          <PillRadio variant="outline" options={["Players", "Teams"]} value={entity} onChange={changeEntity} />
        </div>
      </section>

      {entity === "Players" ? (
        <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 overflow-x-auto border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 [scrollbar-width:thin]">
            {(["Attack", "Defense", "Other"] as PlayerSection[]).map((section) => (
              <button
                key={section}
                type="button"
                aria-pressed={playerSection === section}
                onClick={() => changePlayerSection(section)}
                className={`rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${playerSection === section ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent" : "border-nrl-border text-nrl-muted hover:text-nrl-text"}`}
              >
                {section}
              </button>
            ))}
            <div className="ml-1 w-44 shrink-0">
              {playerSection === "Attack" ? (
                <Select label="Plot" hideLabel compact value={playerAttackPlot} options={["Stats", "Efficiency", "Team Proportion"]} onChange={(value) => setPlayerAttackPlot(value as PlayerAttackPlot)} />
              ) : playerSection === "Defense" ? (
                <Select label="Plot" hideLabel compact value="Tackles vs tackle efficiency" options={["Tackles vs tackle efficiency"]} onChange={() => undefined} />
              ) : (
                <Select label="Plot" hideLabel compact value="Halves Pairings" options={["Halves Pairings"]} onChange={() => undefined} />
              )}
            </div>
          </div>

          {playerSection === "Other" ? (
            <>
              <div className="flex items-end gap-2 overflow-x-auto border-b border-nrl-border px-4 py-3 [scrollbar-width:thin]">
                <InfoCircleButton open={playerInfoOpen} onClick={() => setPlayerInfoOpen((current) => !current)} controls="player-plot-info" />
                <div className="w-32 shrink-0"><Select label="Stat" hideLabel compact value={halvesPairingStat} options={[...PLAYER_ATTACK_COMPARISON_STATS]} onChange={(value) => setHalvesPairingStat(value as PlayerAttackComparisonStat)} /></div>
                <div className="w-48 shrink-0"><Select label="Sort" hideLabel compact value={halvesPairingSort === "ascending" ? "Ascending · most different" : "Descending · closest to 50/50"} options={[...HALVES_PAIRING_SORT_OPTIONS]} onChange={(value) => setHalvesPairingSort((value as HalvesPairingSortLabel).startsWith("Ascending") ? "ascending" : "descending")} /></div>
                <GameWindowButtons value={gameWindow} onChange={(value) => void changeGameWindow(value)} />
                <div className="w-20 shrink-0"><Select label="Season" hideLabel compact value={year} options={availableYears} onChange={(value) => void changeYear(value)} /></div>
              </div>
              <div className="relative">
                {loading ? (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
                    <span aria-label="Loading season" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent" />
                  </div>
                ) : null}
                <HalvesPairingBars pairings={halvesPairings} stat={halvesPairingStat} playerFaceImages={playerFaceImages} />
              </div>
              {playerInfoOpen ? (
                <div id="player-plot-info" className="grid gap-3 border-t border-nrl-border bg-nrl-panel-2 px-4 py-4 text-[10px] leading-relaxed text-nrl-muted md:grid-cols-3">
                  <div><span className="font-black text-nrl-text">Pairing sample</span><br />The recorded five-eighth and halfback from the same team-game, with both playing at least 60 minutes. Jersey 6 and 7 are used only when position data is unavailable. A pairing needs at least five qualifying shared games in the selected season.</div>
                  <div><span className="font-black text-nrl-text">Contribution split</span><br />Each player&apos;s selected-stat total across shared games is divided by the pair&apos;s combined total. The most common halfback is blue on the left; the most common five-eighth is green on the right.</div>
                  <div><span className="font-black text-nrl-text">Sorting</span><br />Ascending puts the most uneven pairings first. Descending puts the pairings closest to a 50/50 split first.</div>
                  <div><span className="font-black text-nrl-text">Game window</span><br />{gameWindow === null ? "All qualifying shared games are included." : `L${gameWindow} uses each pairing's latest ${gameWindow} qualifying shared games from 2026 and requires that full sample.`}</div>
                </div>
              ) : null}
            </>
          ) : playerSection === "Attack" || playerSection === "Defense" ? (
            <>
              <div className="flex items-end gap-3 overflow-x-auto border-b border-nrl-border px-4 py-3 [scrollbar-width:thin]">
                <div />
                <div className="ml-auto flex shrink-0 items-end gap-3">
                  <InfoCircleButton open={playerInfoOpen} onClick={() => setPlayerInfoOpen((current) => !current)} controls="player-plot-info" />
                  {playerSection === "Attack" && isPlayerEfficiency ? <div className="w-24"><Select label="Efficiency metric" hideLabel compact value={playerEfficiencyBaseMetric} options={[...PLAYER_EFFICIENCY_BASE_METRICS]} onChange={(value) => setPlayerEfficiencyBaseMetric(value as PlayerEfficiencyBaseMetric)} /></div> : null}
                  {playerSection === "Attack" && isPlayerEfficiency ? <div className="w-36"><Select label="Measurable stat" hideLabel compact value={playerEfficiencyOutputMetric} options={[...PLAYER_EFFICIENCY_OUTPUT_METRICS]} onChange={(value) => setPlayerEfficiencyOutputMetric(value as PlayerEfficiencyOutputMetric)} /></div> : null}
                  {playerSection === "Attack" && isPlayerEfficiency ? <VolumeAxisToggle checked={playerEfficiencyShowsVolume} onChange={(checked) => setPlayerEfficiencyView(checked ? "Volume axis" : "Efficiency")} /> : null}
                  {playerSection === "Attack" && !isPlayerEfficiency ? <div className="w-32"><Select label="X axis stat" hideLabel compact value={activePlayerComparisonXStat} options={[...(isPlayerTeamProportion ? PLAYER_ATTACK_COMPARISON_STATS : PLAYER_ATTACK_STAT_COMPARISON_STATS)]} onChange={(value) => isPlayerTeamProportion ? setPlayerTeamProportionXStat(value as PlayerAttackComparisonStat) : setPlayerComparisonXStat(value as PlayerAttackComparisonStat)} /></div> : null}
                  {playerSection === "Attack" && !isPlayerEfficiency ? <div className="w-32"><Select label="Y axis stat" hideLabel compact value={activePlayerComparisonYStat} options={isPlayerTeamProportion ? ["None", ...PLAYER_ATTACK_COMPARISON_STATS] : ["None", ...PLAYER_ATTACK_STAT_COMPARISON_STATS]} onChange={(value) => isPlayerTeamProportion ? setPlayerTeamProportionYStat(value as OptionalPlayerComparisonStat) : setPlayerComparisonYStat(value as OptionalPlayerComparisonStat)} /></div> : null}
                  <div className="w-24"><Select label="Position" hideLabel compact value={playerPosition} options={[...PLAYER_ATTACK_POSITIONS]} onChange={(value) => setPlayerPosition(value as PlayerAttackPosition)} /></div>
                  <GameWindowButtons value={gameWindow} onChange={(value) => void changeGameWindow(value)} />
                  {playerSection === "Attack" && playerAttackPlot === "Stats" ? <PillRadio options={["Per game", "Totals"]} value={playerStatsAggregation} onChange={(value) => setPlayerStatsAggregation(value as PlayerStatsAggregation)} /> : null}
                  <div className="w-20"><Select label="Season" hideLabel compact value={year} options={availableYears} onChange={(value) => void changeYear(value)} /></div>
                </div>
              </div>
              <div className="relative p-2 sm:p-4">
                {loading ? (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
                    <span aria-label="Loading season" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent" />
                  </div>
                ) : null}
                <TeamQuadrantScatter
                  key={`${playerSection}-${playerAttackPlot}-${playerStatsAggregation}-${playerEfficiencyBaseMetric}-${playerEfficiencyOutputMetric}-${playerEfficiencyView}-${activePlayerComparisonXStat}-${activePlayerComparisonYStat}-${playerPosition}-${year}`}
                  points={playerSection === "Defense" ? playerDefencePoints : isPlayerEfficiency ? playerAttackPoints : playerAttackComparisonPoints}
                  teamLogos={{}}
                  useLogos={false}
                  pointImages={playerPointImages}
                  emptyMessage={`No ${playerPosition.toLowerCase()} have five qualifying games this season.`}
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
                  <div><span className="font-black text-nrl-text">Position sample</span><br />{playerPosition} with at least five qualifying games in position. Recorded positions are used, with jersey number only used when position data is unavailable.</div>
                  <div><span className="font-black text-nrl-text">Game window</span><br />{gameWindow === null ? "All qualifying games are included." : `L${gameWindow} uses each player's latest ${gameWindow} qualifying games from 2026 and requires that full sample.`}</div>
                  <div><span className="font-black text-nrl-text">Minutes adjustment</span><br />{
                    playerSection === "Defense"
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
          <div className="flex items-center gap-2 overflow-x-auto border-b border-nrl-border bg-nrl-panel-2 px-4 py-3 [scrollbar-width:thin]">
            {(["Attack", "Defense", "Other"] as TeamSection[]).map((section) => (
              <button
                key={section}
                type="button"
                aria-pressed={teamSection === section}
                onClick={() => changeTeamSection(section)}
                className={`rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${teamSection === section ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent" : "border-nrl-border text-nrl-muted hover:text-nrl-text"}`}
              >
                {section}
              </button>
            ))}
            <div className="ml-1 w-56 shrink-0">
              {isAttack ? (
                <Select
                  label="Plot"
                  hideLabel
                  compact
                  value={attackPlot}
                  options={["Stats", "Efficiency", canAccessModelPlots ? "xPoints vs actual points" : { value: "xPoints vs actual points", label: "🔒 xPoints vs actual points" }]}
                  onChange={(value) => setAttackPlot(value as AttackPlot)}
                />
              ) : isDefense ? (
                <Select
                  label="Plot"
                  hideLabel
                  compact
                  value={defencePlot}
                  options={canAccessModelPlots
                    ? ["Stats Conceded", "Defensive Efficiency", "Contact vs cover defence", "Actual points conceded vs xPoints conceded"]
                    : [
                        "Stats Conceded",
                        "Defensive Efficiency",
                        { value: "Contact vs cover defence", label: "🔒 Contact vs cover defence" },
                        { value: "Actual points conceded vs xPoints conceded", label: "🔒 Actual points conceded vs xPoints conceded" },
                      ]}
                  onChange={(value) => setDefencePlot(value as DefencePlot)}
                />
              ) : (
                <Select
                  label="Plot"
                  hideLabel
                  compact
                  value={teamOtherPlot}
                  options={canAccessModelPlots
                    ? ["Team Share by Position", "Ruck Dominance Rating"]
                    : ["Team Share by Position", { value: "Ruck Dominance Rating", label: "🔒 Ruck Dominance Rating" }]}
                  onChange={(value) => setTeamOtherPlot(value as TeamOtherPlot)}
                />
              )}
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 border-b border-nrl-border px-4 py-3">
            <div className={`flex min-w-0 items-end gap-2 overflow-x-auto [scrollbar-width:thin] ${isOther ? "" : "w-full"}`}>
              <InfoCircleButton open={teamInfoOpen} onClick={() => setTeamInfoOpen((current) => !current)} controls="team-plot-info" />
              {isTeamStatsComparison ? <div className="w-36 shrink-0"><Select label="X axis stat" hideLabel compact value={activeTeamXStat} options={teamStatSelectOptions(isTeamDefenceStatsConceded ? TEAM_DEFENCE_CONCEDED_STATS : TEAM_ATTACK_COMPARISON_STATS, canAccessModelPlots)} onChange={(value) => { if (isTeamDefenceStatsConceded) setTeamDefenceXStat(value as TeamDefenceConcededStat); else setTeamAttackXStat(value as TeamAttackComparisonStat); refreshSelectedTeamModelStat(value); }} /></div> : null}
              {isTeamStatsComparison ? <div className="w-36 shrink-0"><Select label="Y axis stat" hideLabel compact value={activeTeamYStat} options={["None", ...teamStatSelectOptions(isTeamDefenceStatsConceded ? TEAM_DEFENCE_CONCEDED_STATS : TEAM_ATTACK_COMPARISON_STATS, canAccessModelPlots)]} onChange={(value) => { if (isTeamDefenceStatsConceded) setTeamDefenceYStat(value as OptionalTeamDefenceComparisonStat); else setTeamAttackYStat(value as OptionalTeamAttackComparisonStat); refreshSelectedTeamModelStat(value); }} /></div> : null}
              {isTeamEfficiency ? <div className="w-24 shrink-0"><Select label="Efficiency metric" hideLabel compact value={activeTeamEfficiencyBaseMetric} options={[...TEAM_ATTACK_EFFICIENCY_BASE_STATS]} onChange={(value) => isTeamDefenceEfficiency ? setTeamDefenceEfficiencyBaseMetric(value as TeamAttackEfficiencyBaseStat) : setTeamEfficiencyBaseMetric(value as TeamAttackEfficiencyBaseStat)} /></div> : null}
              {isTeamEfficiency ? <div className="w-32 shrink-0"><Select label="Measurable stat" hideLabel compact value={activeTeamEfficiencyOutputMetric} options={[...TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS]} onChange={(value) => isTeamDefenceEfficiency ? setTeamDefenceEfficiencyOutputMetric(value as TeamAttackEfficiencyOutputStat) : setTeamEfficiencyOutputMetric(value as TeamAttackEfficiencyOutputStat)} /></div> : null}
              {isTeamAttackEfficiency ? <VolumeAxisToggle checked={teamEfficiencyShowsVolume} onChange={(checked) => setTeamEfficiencyView(checked ? "Volume axis" : "Efficiency")} /> : null}
              {isTeamDefenceEfficiency ? <VolumeAxisToggle checked={teamDefenceEfficiencyShowsVolume} onChange={(checked) => setTeamDefenceEfficiencyView(checked ? "Volume axis" : "Efficiency")} /> : null}
              {!isOther || isRuckDominancePlot ? <div className="w-24 shrink-0"><Select label="Aggregation" hideLabel compact value={mode === "season" ? "Season" : "Team games"} options={["Season", "Team games"]} onChange={(value) => setMode(value === "Season" ? "season" : "games")} /></div> : null}
              {isOther && !isRuckDominancePlot ? <div className="w-28 shrink-0"><Select label="Stat" hideLabel compact value={teamShareMetric} options={[...TEAM_SHARE_METRICS]} onChange={(value) => setTeamShareMetric(value as TeamShareMetric)} /></div> : null}
              <GameWindowButtons value={gameWindow} onChange={(value) => void changeGameWindow(value)} />
              <div className="w-20 shrink-0"><Select label="Season" hideLabel compact value={year} options={availableYears} onChange={(value) => void changeYear(value)} /></div>
            </div>
          </div>

          <div className="relative p-2 sm:p-4">
            {loading ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-nrl-panel">
                <span aria-label="Loading season" role="status" className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent" />
              </div>
            ) : null}
            {modelPlotLocked ? (
              <ModelPlotLock plotName={isXPoints ? "xPoints" : isRuckDominancePlot ? "Ruck Dominance Rating" : selectedModelStatName || "contact and cover defence"} />
            ) : isOther && !isRuckDominancePlot ? (
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
                xValueDecimals={isTeamEfficiency ? teamEfficiencyYDecimals : isTeamStatsComparison && activeTeamXStat === "PTB" ? 2 : 1}
                yValueDecimals={isTeamStatsComparison && effectiveTeamYStat === "PTB" ? 2 : 1}
                comparisonLine={isXPoints}
                rSquared={teamGameRSquared}
                colorByQuadrant={isAttack || isTeamDefenceStatsConceded || isTeamDefenceEfficiency}
                xHigherIsBetter={isXPoints || isRuckDominancePlot || isTeamAttackEfficiency || (isTeamStatsComparison && activeTeamXHigherIsBetter)}
                yHigherIsBetter={isTeamStatsComparison ? activeTeamYHigherIsBetter : true}
                quadrants={isXPoints ? XPOINTS_QUADRANTS : isTeamDefenceEfficiency ? DEFENSIVE_EFFICIENCY_QUADRANTS : isTeamAttackEfficiency ? PLAYER_EFFICIENCY_QUADRANTS : isTeamDefenceStatsConceded ? teamDefenceQuadrants : isAttack ? teamAttackQuadrants : DEFENCE_QUADRANTS}
                minXPadding={isXPoints ? 2 : isTeamEfficiency ? activeTeamEfficiencyOutputMetric.includes("metres") ? 0.2 : 0.01 : isTeamStatsComparison ? activeTeamXMeta.minPadding : 2}
                minYPadding={isXPoints ? 2 : isTeamEfficiency && activeTeamEfficiencyShowsVolume ? 1 : isTeamEfficiency ? activeTeamEfficiencyOutputMetric.includes("metres") ? 0.2 : 0.01 : isTeamStatsComparison ? activeTeamYMeta.minPadding : 3}
                singleAxis={isTeamSingleStat}
                singleAxisStackLimit={mode === "games" ? 20 : 8}
              />
            )}
          </div>

          {teamInfoOpen ? <div id="team-plot-info" className="grid gap-3 border-t border-nrl-border bg-nrl-panel-2 px-4 py-4 text-[10px] leading-relaxed text-nrl-muted md:grid-cols-2">
            <div><span className="font-black text-nrl-text">Game window</span><br />{gameWindow === null ? "All team games in the selected season are included." : `L${gameWindow} uses each team's latest ${gameWindow} games from 2026. Season mode aggregates that sample; Team Games mode shows those individual games.`}</div>
            {isOther && !isRuckDominancePlot ? (
              <>
                <div><span className="font-black text-nrl-text">Starter groups</span><br />Recorded starting positions are used. Each position group&apos;s share of team {teamShareMetric.toLowerCase()}. Fullback, Wingers, Centres, Halves, Edges and Middles are included; Hooker and interchange are excluded.</div>
                <div><span className="font-black text-nrl-text">Average {teamShareMetric.toLowerCase()} share</span><br />Position-group starter {teamShareMetric.toLowerCase()} ÷ all team {teamShareMetric.toLowerCase()} × 100 for each game, averaged across the season.</div>
                <div><span className="font-black text-nrl-text">Interaction</span><br />Hover or focus a team to isolate its {teamShareMetric.toLowerCase()} profile.</div>
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
                <div><span className="font-black text-nrl-text">Cover rating</span><br />Sourced from the post-match cover model in nrl.post_match_team_metrics. Higher is better.</div>
                <div><span className="font-black text-nrl-text">Profiles</span><br />League averages split the four defensive profiles. Contact improves right; cover improves up.</div>
              </>
            )}
          </div> : null}
        </section>
      )}
    </div>
  );
}

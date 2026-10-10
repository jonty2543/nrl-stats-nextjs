"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { PlayerStat } from "@/lib/data/types";
import { PLAYER_ATTACK_POSITIONS } from "@/lib/data/player-attack";
import { buildMatchupHeatmap, GROUPED_MATCHUP_POSITIONS, MATCHUP_METRICS, type MatchupPosition, type MatchupDirection, type MatchupMetric, type MatchupValueMode } from "@/lib/data/matchup-heatmap";
import { TEAM_ATTACK_EFFICIENCY_BASE_STATS, TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS, type TeamAttackEfficiencyBaseStat } from "@/lib/data/attack-ratings";
import { FINALS_MAP } from "@/lib/data/constants";
import { Select } from "@/components/ui/select";
import { singleAxisHeatColor } from "@/lib/data/heat-colors";

const playerRowsCache = new Map<string, PlayerStat[]>();
const LOWER_IS_BETTER_MATCHUP_METRICS = new Set<MatchupMetric>([
  "Missed tackles",
  "Ineffective tackles",
  "Errors",
  "Penalties",
  "Handling errors",
  "One on one lost",
  "Ruck infringements",
  "Inside 10 metres",
  "On report",
  "Sin bins",
  "Send offs",
  "Kicked dead",
]);

function logoFor(team: string, logos: Record<string, string>): string | undefined {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = normalise(team);
  const aliases: Record<string, string[]> = {
    brisbanebroncos: ["broncos"], canterburybankstownbulldogs: ["bulldogs", "canterburybulldogs"],
    canberraraiders: ["raiders"], cronullasutherlandsharks: ["sharks", "cronullasharks"],
    goldcoasttitans: ["titans"], manlywarringahseaeagles: ["seaeagles", "manlyseaeagles"],
    melbournestorm: ["storm"], newcastleknights: ["knights"],
    northqueenslandcowboys: ["cowboys", "northqueenslandcowboys"], parramattaeels: ["eels"],
    penrithpanthers: ["panthers"], southsydneyrabbitohs: ["rabbitohs"],
    stgeorgeillawarradragons: ["dragons", "stgeorgedragons"], sydneyroosters: ["roosters"],
    newzealandwarriors: ["warriors"], weststigers: ["tigers"], thedolphins: ["dolphins"],
  };
  const candidates = [key, ...(aliases[key] ?? [])];
  for (const candidate of candidates) {
    const match = Object.entries(logos).find(([name]) => normalise(name) === candidate);
    if (match) return match[1];
  }
  return Object.entries(logos).find(([name]) => {
    const logoKey = normalise(name);
    return candidates.some((candidate) => logoKey.includes(candidate) || candidate.includes(logoKey));
  })?.[1];
}

function isRabbitohs(team: string): boolean {
  return /rabbitoh|south\s*sydney/i.test(team);
}

function roundNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "");
  for (const [label, finalsRound] of Object.entries(FINALS_MAP)) {
    if (text.toLowerCase().includes(label.toLowerCase())) return finalsRound;
  }
  const abbreviatedFinals = text.match(/\bFW\s*([1-3])\b/i);
  if (abbreviatedFinals) return 27 + Number(abbreviatedFinals[1]);
  if (/\bGF\b/i.test(text)) return 31;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function matchesRound(row: PlayerStat, selectedRound: string): boolean {
  if (selectedRound === "all") return true;
  const requestedRound = roundNumber(selectedRound);
  if (requestedRound === null) return false;
  return roundNumber(row.Round_Label) === requestedRound || roundNumber(row.Round) === requestedRound;
}

function maxRoundFromRows(rows: PlayerStat[] | undefined): number {
  return Math.max(0, ...(rows ?? []).map((row) => roundNumber(row.Round_Label) ?? roundNumber(row.Round) ?? 0));
}

function maxRoundFromOptions(options: { value: string; label: string }[]): number {
  return Math.max(0, ...options.map((option) => roundNumber(option.label) ?? roundNumber(option.value) ?? 0));
}

export function MatchupHeatmap({ year, competition, round, roundOptions, gameWindow, teamLogos, initialRows, direction = "defense", efficiency = false, onRoundChange, onDirectionChange }: {
  teamLogos: Record<string, string>; year: string; competition: "nrl" | "cup" | "international" | "origin"; round: string; roundOptions: { value: string; label: string }[]; gameWindow: number | null; initialRows?: PlayerStat[]; direction?: MatchupDirection; efficiency?: boolean; onRoundChange: (round: string) => void; onDirectionChange: (direction: MatchupDirection) => void;
}) {
  const [metric, setMetric] = useState<MatchupMetric>("Run metres");
  const [efficiencyBaseMetric, setEfficiencyBaseMetric] = useState<TeamAttackEfficiencyBaseStat>("Runs");
  const [valueMode, setValueMode] = useState<MatchupValueMode>("Average");
  const [sortPosition, setSortPosition] = useState<MatchupPosition | "Team">("Team");
  const [groupOutsideBacks, setGroupOutsideBacks] = useState(false);
  const positions: readonly MatchupPosition[] = groupOutsideBacks ? GROUPED_MATCHUP_POSITIONS : PLAYER_ATTACK_POSITIONS;
  const [sortAscending, setSortAscending] = useState(false);
  const [source, setSource] = useState<{ key: string; rows: PlayerStat[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadedLogos, setLoadedLogos] = useState<Record<string, string> | null>(null);
  const logos = useMemo(() => ({ ...teamLogos, ...loadedLogos }), [teamLogos, loadedLogos]);
  const key = `${competition}:${year}:${attempt}`;
  const dataKey = `${competition}:${year}`;
  const cachedRows = playerRowsCache.get(dataKey);
  const immediateRows = initialRows ?? cachedRows;
  const sourceRows = source?.key === key ? source.rows : null;
  const activeRows = sourceRows ?? immediateRows;
  const shouldFetchRows = !sourceRows && (!immediateRows || maxRoundFromRows(immediateRows) < maxRoundFromOptions(roundOptions));
  const metricOptions = useMemo(() => (
    efficiency
      ? TEAM_ATTACK_EFFICIENCY_OUTPUT_STATS.filter((option) => option in MATCHUP_METRICS) as MatchupMetric[]
      : Object.keys(MATCHUP_METRICS) as MatchupMetric[]
  ), [efficiency]);
  const effectiveMetric = efficiency && !metricOptions.includes(metric) ? "Run metres" : metric;
  useEffect(() => {
    if (!shouldFetchRows) return;
    const controller = new AbortController();
    const fresh = immediateRows ? "&fresh=1" : "";
    fetch(`/api/player-stats?years=${encodeURIComponent(year)}${competition === "nrl" ? "" : `&competition=${competition}`}${fresh}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load matchup data.");
        const rows = await response.json() as PlayerStat[];
        if (!controller.signal.aborted) { playerRowsCache.set(dataKey, rows); setSource({ key, rows }); setError(null); }
      })
      .catch(() => { if (!controller.signal.aborted) setError(key); });
    return () => controller.abort();
  }, [competition, year, key, dataKey, immediateRows, shouldFetchRows]);
  const teams = useMemo(() => buildMatchupHeatmap(
    (activeRows ?? []).filter((row) => matchesRound(row, round)),
    effectiveMetric, round === "all" ? gameWindow : null, valueMode, direction, groupOutsideBacks, efficiency ? efficiencyBaseMetric : null
  ), [activeRows, round, effectiveMetric, gameWindow, valueMode, direction, groupOutsideBacks, efficiency, efficiencyBaseMetric]);
  const seasonTeams = useMemo(() => buildMatchupHeatmap(
    activeRows ?? [],
    effectiveMetric, null, valueMode, direction, groupOutsideBacks, efficiency ? efficiencyBaseMetric : null
  ), [activeRows, effectiveMetric, valueMode, direction, groupOutsideBacks, efficiency, efficiencyBaseMetric]);
  const hasRowsSource = Boolean(activeRows);
  const missingLogos = teams.some((team) => !logoFor(team.team, logos));
  useEffect(() => {
    if (!missingLogos || loadedLogos !== null) return;
    const controller = new AbortController();
    fetch("/api/team-logos", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load team logos");
        const result = await response.json() as Record<string, string>;
        if (!controller.signal.aborted) setLoadedLogos(result);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadedLogos({}); });
    return () => controller.abort();
  }, [missingLogos, loadedLogos]);
  const columnRanges = useMemo(
    () => positions.map((_, index) => {
      const values = teams.flatMap((team) => {
        const value = team.cells[index]?.value;
        return value == null ? [] : [value];
      });
      return { min: Math.min(...values), max: Math.max(...values) };
    }),
    [teams, positions]
  );
  const higherIsGood = direction === "attack"
    ? !LOWER_IS_BETTER_MATCHUP_METRICS.has(effectiveMetric)
    : LOWER_IS_BETTER_MATCHUP_METRICS.has(effectiveMetric);
  const sortedTeams = useMemo(() => {
    if (sortPosition === "Team") return teams;
    const positionIndex = positions.indexOf(sortPosition);
    if (positionIndex === -1) return teams;
    return [...teams].sort((left, right) => {
      const leftValue = left.cells[positionIndex]?.value;
      const rightValue = right.cells[positionIndex]?.value;
      if (leftValue == null && rightValue == null) return left.team.localeCompare(right.team);
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      return (sortAscending ? leftValue - rightValue : rightValue - leftValue) || left.team.localeCompare(right.team);
    });
  }, [sortPosition, sortAscending, teams, positions]);
  const summarySourceTeams = round === "all" ? sortedTeams : seasonTeams;
  const summaryCells = useMemo(() => positions.map((position, index) => {
    const values = summarySourceTeams.flatMap((team) => {
      const value = team.cells[index]?.value;
      return value == null ? [] : [value];
    });
    return {
      position,
      avg: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  }), [positions, summarySourceTeams]);
  const summaryScopeLabel = round === "all" ? "visible teams" : "season";

  return <div className="space-y-3">
    <div className="flex flex-nowrap items-end gap-3 overflow-x-auto [scrollbar-width:thin]">
      <div className="w-24 shrink-0"><Select label="For / Against" compact value={direction === "defense" ? "Against" : "For"} options={["For", "Against"]} onChange={(value) => onDirectionChange(value === "Against" ? "defense" : "attack")} /></div>
      <div className="w-36 shrink-0"><Select label="Stat" compact value={effectiveMetric} options={metricOptions} onChange={(value) => setMetric(value as MatchupMetric)} /></div>
      {efficiency ? <div className="w-22 shrink-0"><Select label="Per" compact value={efficiencyBaseMetric} options={[...TEAM_ATTACK_EFFICIENCY_BASE_STATS]} onChange={(value) => setEfficiencyBaseMetric(value as TeamAttackEfficiencyBaseStat)} /></div> : null}
      {!efficiency ? <div className="w-28 shrink-0"><Select label="Display" compact value={valueMode} options={["Average", "Total", "Percentage"]} onChange={(value) => setValueMode(value as MatchupValueMode)} /></div> : null}
      <div className="w-24 shrink-0"><Select label="Round" compact value={round} options={roundOptions} onChange={onRoundChange} /></div>
      <button type="button" aria-pressed={groupOutsideBacks} className={`min-h-[34px] rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-nrl-accent ${groupOutsideBacks ? "border-nrl-accent bg-nrl-accent/15 text-nrl-accent" : "border-nrl-border bg-nrl-panel-2 text-nrl-text"}`} onClick={() => {
        setGroupOutsideBacks(!groupOutsideBacks);
        if (!groupOutsideBacks && ["Fullbacks", "Wingers", "Centres"].includes(sortPosition)) setSortPosition("Outside Backs");
        else if (groupOutsideBacks && sortPosition === "Outside Backs") setSortPosition("Fullbacks");
      }}>Group OB</button>
    </div>
    {error === key ? <div role="alert">Unable to load matchup data. <button className="text-nrl-accent underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>
      : !hasRowsSource ? <div role="status" className="p-8 text-center text-nrl-muted">Loading matchup data…</div>
      : !teams.length ? <div className="p-8 text-center text-nrl-muted">No matchup data for this selection.</div>
      : <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-[11px]">
            <caption className="sr-only">Team {effectiveMetric.toLowerCase()} {efficiency ? `per ${efficiencyBaseMetric.toLowerCase()}` : valueMode.toLowerCase()} by position</caption>
            <thead><tr><th scope="col" className="sticky left-0 z-20 w-14 min-w-14 bg-nrl-panel px-2 shadow-[8px_0_0_var(--color-nrl-panel)]"><button type="button" onClick={() => setSortPosition("Team")} title="Restore team order" className="rounded py-2 focus-visible:outline-2 focus-visible:outline-nrl-accent">Team</button></th>{positions.map((position) => <th scope="col" key={position} aria-sort={sortPosition === position ? sortAscending ? "ascending" : "descending" : "none"} className="px-1.5 py-2">
              <button type="button" className={`w-full whitespace-nowrap rounded py-1 focus-visible:outline-2 focus-visible:outline-nrl-accent ${sortPosition === position ? "text-nrl-accent" : "hover:text-nrl-accent"}`} onClick={() => {
                setSortAscending(sortPosition === position ? !sortAscending : false);
                setSortPosition(position);
              }} title={`Sort ${position} ${sortPosition === position && !sortAscending ? "lowest" : "highest"} first`}>
                {position}
              </button>
            </th>)}</tr></thead>
            <tbody>{sortedTeams.map((team) => <tr key={team.team}>
              <th scope="row" className="sticky left-0 z-10 w-14 min-w-14 bg-nrl-panel px-2 shadow-[8px_0_0_var(--color-nrl-panel)]" title={`${team.team} · ${team.games} games`}>
                {logoFor(team.team, logos) ? <Image src={logoFor(team.team, logos)!} alt={team.team} width={28} height={28} unoptimized data-team-logo={isRabbitohs(team.team) ? "rabbitohs" : undefined} className={`mx-auto h-7 w-7 object-contain ${isRabbitohs(team.team) ? "team-logo-rabbitohs" : ""}`} /> : <span aria-label={team.team} className="text-nrl-muted">{team.team.slice(0, 3).toUpperCase()}</span>}
              </th>
              {team.cells.map((cell, index) => {
                const range = columnRanges[index];
                const fraction = cell.value == null || !Number.isFinite(range.min) || range.max === range.min
                  ? 0.5
                  : (cell.value - range.min) / (range.max - range.min);
                const colorRatio = higherIsGood ? fraction : 1 - fraction;
                const valueSuffix = effectiveMetric === "Tackle efficiency" ? "%" : !efficiency && valueMode === "Percentage" ? "%" : "";
                const decimals = efficiency ? 2 : 1;
                return <td key={cell.position} className={`rounded px-1.5 py-1.5 text-center font-bold ${cell.value === null ? "text-nrl-muted" : "text-nrl-bg"}`} style={cell.value === null ? undefined : { backgroundColor: `color-mix(in srgb, ${singleAxisHeatColor(colorRatio)} 82%, var(--color-nrl-panel))` }} title={`${team.team} vs ${cell.position}: ${cell.value?.toFixed(decimals) ?? "No data"}${valueSuffix}${effectiveMetric === "Tackle efficiency" ? " tackle efficiency" : efficiency ? ` ${effectiveMetric.toLowerCase()} per ${efficiencyBaseMetric.toLowerCase()}` : valueMode === "Percentage" ? " share" : valueMode === "Total" ? ` total ${effectiveMetric.toLowerCase()}` : ` ${effectiveMetric.toLowerCase()} per game`} (${cell.games} games)`}>{cell.value?.toFixed(decimals) ?? "—"}{cell.value == null ? "" : valueSuffix}</td>;
              })}
            </tr>)}</tbody>
            <tfoot>{[
              { label: "AVG", key: "avg" as const, title: `Average across ${summaryScopeLabel}` },
              { label: "MIN", key: "min" as const, title: `Minimum across ${summaryScopeLabel}` },
              { label: "MAX", key: "max" as const, title: `Maximum across ${summaryScopeLabel}` },
            ].map((row) => (
              <tr key={row.key}>
                <th scope="row" className="sticky left-0 z-10 bg-nrl-panel px-2 py-2 text-center font-black text-nrl-accent shadow-[8px_0_0_var(--color-nrl-panel)]" title={row.title}>{row.label}</th>
                {summaryCells.map((cell) => {
                  const value = cell[row.key];
                  return <td key={`${row.key}-${cell.position}`} className="rounded bg-nrl-panel-2 px-1.5 py-1.5 text-center font-black text-nrl-accent" title={`${cell.position} ${row.title.toLowerCase()}`}>{value == null ? "—" : `${value.toFixed(efficiency ? 2 : 1)}${effectiveMetric === "Tackle efficiency" || (!efficiency && valueMode === "Percentage") ? "%" : ""}`}</td>;
                })}
              </tr>
            ))}</tfoot>
          </table>
        </div>
      </>}
  </div>;
}

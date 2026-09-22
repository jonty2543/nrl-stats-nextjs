"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { PlayerStat } from "@/lib/data/types";
import { PLAYER_ATTACK_POSITIONS, type PlayerAttackPosition } from "@/lib/data/player-attack";
import { buildMatchupHeatmap, MATCHUP_METRICS, type MatchupDirection, type MatchupMetric, type MatchupValueMode } from "@/lib/data/matchup-heatmap";
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

export function MatchupHeatmap({ year, competition, round, roundOptions, gameWindow, teamLogos, initialRows, direction = "defense", onRoundChange, onDirectionChange }: {
  teamLogos: Record<string, string>; year: string; competition: "nrl" | "cup"; round: string; roundOptions: { value: string; label: string }[]; gameWindow: number | null; initialRows?: PlayerStat[]; direction?: MatchupDirection; onRoundChange: (round: string) => void; onDirectionChange: (direction: MatchupDirection) => void;
}) {
  const [metric, setMetric] = useState<MatchupMetric>("Run metres");
  const [valueMode, setValueMode] = useState<MatchupValueMode>("Average");
  const [sortPosition, setSortPosition] = useState<PlayerAttackPosition | "Team">("Team");
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
  useEffect(() => {
    if (immediateRows) return;
    const controller = new AbortController();
    fetch(`/api/player-stats?years=${encodeURIComponent(year)}${competition === "cup" ? "&competition=cup" : ""}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load matchup data.");
        const rows = await response.json() as PlayerStat[];
        if (!controller.signal.aborted) { playerRowsCache.set(dataKey, rows); setSource({ key, rows }); setError(null); }
      })
      .catch(() => { if (!controller.signal.aborted) setError(key); });
    return () => controller.abort();
  }, [competition, year, key, dataKey, immediateRows]);
  const teams = useMemo(() => buildMatchupHeatmap(
    (immediateRows ?? (source?.key === key ? source.rows : [])).filter((row) => round === "all" || String(row.Round) === round),
    metric, round === "all" ? gameWindow : null, valueMode, direction
  ), [immediateRows, source, key, round, metric, gameWindow, valueMode, direction]);
  const hasRowsSource = Boolean(immediateRows) || source?.key === key;
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
    () => PLAYER_ATTACK_POSITIONS.map((_, index) => {
      const values = teams.flatMap((team) => {
        const value = team.cells[index]?.value;
        return value == null ? [] : [value];
      });
      return { min: Math.min(...values), max: Math.max(...values) };
    }),
    [teams]
  );
  const higherIsGood = direction === "attack"
    ? !LOWER_IS_BETTER_MATCHUP_METRICS.has(metric)
    : LOWER_IS_BETTER_MATCHUP_METRICS.has(metric);
  const sortedTeams = useMemo(() => {
    if (sortPosition === "Team") return teams;
    const positionIndex = PLAYER_ATTACK_POSITIONS.indexOf(sortPosition);
    if (positionIndex === -1) return teams;
    return [...teams].sort((left, right) => {
      const leftValue = left.cells[positionIndex]?.value;
      const rightValue = right.cells[positionIndex]?.value;
      if (leftValue == null && rightValue == null) return left.team.localeCompare(right.team);
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      return (sortAscending ? leftValue - rightValue : rightValue - leftValue) || left.team.localeCompare(right.team);
    });
  }, [sortPosition, sortAscending, teams]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-24 shrink-0"><Select label="For / Against" compact value={direction === "defense" ? "Against" : "For"} options={["For", "Against"]} onChange={(value) => onDirectionChange(value === "Against" ? "defense" : "attack")} /></div>
      <div className="w-36 shrink-0"><Select label="Stat" compact value={metric} options={Object.keys(MATCHUP_METRICS)} onChange={(value) => setMetric(value as MatchupMetric)} /></div>
      <div className="w-28 shrink-0"><Select label="Display" compact value={valueMode} options={["Average", "Percentage"]} onChange={(value) => setValueMode(value as MatchupValueMode)} /></div>
      <div className="w-24 shrink-0"><Select label="Round" compact value={round} options={roundOptions} onChange={onRoundChange} /></div>
    </div>
    {error === key ? <div role="alert">Unable to load matchup data. <button className="text-nrl-accent underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>
      : !hasRowsSource ? <div role="status" className="p-8 text-center text-nrl-muted">Loading matchup data…</div>
      : !teams.length ? <div className="p-8 text-center text-nrl-muted">No matchup data for this selection.</div>
      : <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-[11px]">
            <caption className="sr-only">Team {metric.toLowerCase()} {valueMode.toLowerCase()} by position</caption>
            <thead><tr><th scope="col" className="sticky left-0 z-20 w-14 min-w-14 bg-nrl-panel px-2 shadow-[8px_0_0_var(--color-nrl-panel)]"><button type="button" onClick={() => setSortPosition("Team")} title="Restore team order" className="rounded py-2 focus-visible:outline-2 focus-visible:outline-nrl-accent">Team</button></th>{PLAYER_ATTACK_POSITIONS.map((position) => <th scope="col" key={position} aria-sort={sortPosition === position ? sortAscending ? "ascending" : "descending" : "none"} className="px-1.5 py-2">
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
                return <td key={cell.position} className={`rounded px-1.5 py-1.5 text-center font-bold ${cell.value === null ? "text-nrl-muted" : "text-nrl-bg"}`} style={cell.value === null ? undefined : { backgroundColor: `color-mix(in srgb, ${singleAxisHeatColor(colorRatio)} 82%, var(--color-nrl-panel))` }} title={`${team.team} vs ${cell.position}: ${cell.value?.toFixed(1) ?? "No data"}${valueMode === "Percentage" ? "%" : ` ${metric.toLowerCase()} per game`} (${cell.games} games)`}>{cell.value?.toFixed(1) ?? "—"}{cell.value === null || valueMode === "Average" ? "" : "%"}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </>}
  </div>;
}

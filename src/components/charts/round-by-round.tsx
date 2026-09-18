"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { buildRoundByRound, ROUND_BY_ROUND_STATS, type RoundRow, type RoundStat } from "@/lib/data/round-by-round";
import type { PlayerStat } from "@/lib/data/types";

const rowsCache = new Map<string, RoundRow[]>();

export function RoundByRound({ entity, competition, year, years, initialRows, onYearChange }: {
  entity: "Players" | "Teams"; competition: "nrl" | "cup"; year: string; years: string[]; initialRows?: RoundRow[]; onYearChange: (year: string) => void;
}) {
  const [stat, setStat] = useState<RoundStat>("Run metres");
  const [selected, setSelected] = useState("");
  const [direction, setDirection] = useState("For");
  const [attempt, setAttempt] = useState(0);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [source, setSource] = useState<{ key: string; rows: RoundRow[] } | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${entity}:${competition}:${year}:${attempt}`;
  const dataKey = `${entity}:${competition}:${year}`;
  const cachedRows = rowsCache.get(dataKey);
  const immediateRows = initialRows?.length ? initialRows : cachedRows;
  useEffect(() => {
    if (immediateRows) return;
    const controller = new AbortController();
    const endpoint = entity === "Players" ? "player-stats" : "team-stats";
    fetch(`/api/${endpoint}?years=${encodeURIComponent(year)}&competition=${competition}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load rounds");
        const rows = await response.json() as RoundRow[];
        if (!controller.signal.aborted) { rowsCache.set(dataKey, rows); setSource({ key, rows }); setError(null); }
      }).catch(() => { if (!controller.signal.aborted) setError(key); });
    return () => controller.abort();
  }, [entity, competition, year, key, dataKey, immediateRows]);
  const rows = useMemo(() => immediateRows ?? (source?.key === key ? source.rows : []), [immediateRows, source, key]);
  const hasRowsSource = Boolean(immediateRows) || source?.key === key;
  const options = useMemo(() => [...new Set(rows.map((row) => entity === "Players" ? (row as PlayerStat).Name : row.Team))].filter(Boolean).sort(), [rows, entity]);
  const effectiveSelected = options.includes(selected) ? selected : options[0] ?? "";
  const selectedInputValue = selected || effectiveSelected;
  const effectiveDirection = entity === "Teams" ? direction : "For";
  const points = useMemo(() => buildRoundByRound(rows, entity, effectiveSelected, stat, effectiveDirection === "Against"), [rows, entity, effectiveSelected, stat, effectiveDirection]);
  const rounds = [...new Set(rows.map((row) => Number(row.Round)))].filter(Number.isFinite).sort((a, b) => a - b);
  const min = Math.min(0, ...points.flatMap((point) => point.value === null ? [] : [point.value]));
  const max = Math.max(1, ...points.flatMap((point) => point.value === null ? [] : [point.value]));
  const width = Math.max(720, rounds.length * 34 + 64), height = 300;
  const top = 20, bottom = 252, left = 48, innerWidth = width - left - 16;
  const step = innerWidth / Math.max(rounds.length, 1);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  useEffect(() => {
    const container = chartScrollRef.current;
    if (container) container.scrollLeft = container.scrollWidth;
  }, [effectiveSelected, stat, direction, points.length, year]);

  return <section className="space-y-4 rounded-2xl border border-nrl-border bg-nrl-panel p-4">
    <div className="flex flex-nowrap items-end gap-3 overflow-x-auto [scrollbar-width:thin]">
      {entity === "Players" ? (
        <label className="flex w-40 shrink-0 flex-col gap-0.5">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Player</span>
          <input list="round-by-round-players" value={selectedInputValue} placeholder="Search player" onChange={(event) => setSelected(event.target.value)} className="h-8 rounded-md border border-nrl-border bg-nrl-panel px-2.5 text-[10px] text-nrl-text outline-none focus:border-nrl-accent" />
          <datalist id="round-by-round-players">{options.map((option) => <option key={option} value={option} />)}</datalist>
        </label>
      ) : <div className="w-40 shrink-0"><Select label="Team" compact value={effectiveSelected} options={options} onChange={setSelected} /></div>}
      {entity === "Teams" ? <div className="w-28"><Select label="For / Against" compact value={direction} options={["For", "Against"]} onChange={setDirection} /></div> : null}
      <div className="w-32"><Select label="Stat" compact value={stat} options={Object.keys(ROUND_BY_ROUND_STATS)} onChange={(value) => setStat(value as RoundStat)} /></div>
      <div className="w-20"><Select label="Season" compact value={year} options={years} onChange={onYearChange} /></div>
    </div>
    <h2 className="text-sm font-bold">Round by Round · {effectiveSelected} · {stat} {effectiveDirection.toLowerCase()}</h2>
    {error === key ? <div role="alert">Unable to load rounds. <button className="text-nrl-accent underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>
      : !hasRowsSource ? <p role="status" className="py-12 text-center text-nrl-muted">Loading rounds…</p>
      : !points.length ? <p className="py-12 text-center text-nrl-muted">No games available for this selection.</p>
      : <div ref={chartScrollRef} className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${effectiveSelected}: ${stat} ${effectiveDirection.toLowerCase()} by round`} className="h-auto w-full" style={{ minWidth: width }}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = min + (max - min) * ratio;
          return <g key={ratio}><line x1={left} x2={width - 16} y1={y(value)} y2={y(value)} stroke="var(--color-nrl-border)" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fill="var(--color-nrl-muted)" fontSize={10}>{value.toFixed(max < 10 ? 1 : 0)}</text></g>;
        })}
        {rounds.map((round, index) => {
          const point = points.find((item) => item.round === round);
          const x = left + (index + 0.5) * step;
          return <g key={round} tabIndex={0} role="button" onClick={() => setSelectedRound(round)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedRound(round); } }} aria-pressed={selectedRound === round} aria-label={`${point?.label ?? `Round ${round}`}: ${point?.value == null ? "No data" : point.value.toFixed(1)}${point?.opponent ? ` vs ${point.opponent}` : ""}`}>
            <title>{point ? `${point.label} vs ${point.opponent ?? "unknown"}: ${point.value?.toFixed(1) ?? "No data"}` : `Round ${round}: no game recorded`}</title>
            {point?.value != null ? <rect x={x - Math.min(16, step * 0.5) / 2} y={Math.min(y(point.value), y(0))} width={Math.min(16, step * 0.5)} height={Math.max(Math.abs(y(point.value) - y(0)), 2)} rx={3} fill="var(--color-nrl-accent)" opacity={selectedRound === round ? 1 : 0.78} stroke={selectedRound === round ? "var(--color-nrl-text)" : "none"} strokeWidth={2} /> : <text x={x} y={bottom - 5} textAnchor="middle" fill="var(--color-nrl-muted)" fontSize={10}>—</text>}
            <text x={x} y={bottom + 18} textAnchor="middle" fill="var(--color-nrl-muted)" fontSize={10}>R{round}</text>
          </g>;
        })}
      </svg></div>}
  </section>;
}

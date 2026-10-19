"use client";

import { useMemo, useState } from "react";
import type { PlayerStat, TeammateLookupRow } from "@/lib/data/types";
import { filterByTeammate } from "@/lib/data/transform";

interface PlayerGameLogTableProps {
  rows: PlayerStat[];
  statKeys: readonly string[];
  playerName: string;
  teammateRows: TeammateLookupRow[];
}

const INITIAL_ROW_COUNT = 12;

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null): string {
  if (value == null) return "-";
  if (Math.abs(value) >= 10) return Math.round(value).toString();
  return value.toFixed(1).replace(/\.0$/, "");
}

function average(rows: PlayerStat[], key: string): number | null {
  const values = rows.map((row) => numeric(row[key])).filter((value): value is number => value != null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function PlayerGameLogTable({ rows, statKeys, playerName, teammateRows }: PlayerGameLogTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const years = useMemo(() => Array.from(new Set(rows.map((row) => row.Year))).sort((a, b) => b.localeCompare(a)), [rows]);
  const opponents = useMemo(
    () => Array.from(new Set(rows.map((row) => row.Opponent).filter((value): value is string => Boolean(value)))).sort(),
    [rows]
  );
  const [selectedYear, setSelectedYear] = useState("All Years");
  const [selectedOpponent, setSelectedOpponent] = useState("All Opponents");
  const [selectedVenue, setSelectedVenue] = useState("Home + away");
  const [selectedTeammate, setSelectedTeammate] = useState("All Teammates");
  const [teammateMode, setTeammateMode] = useState<"with" | "without">("with");
  const [minimumMinutes, setMinimumMinutes] = useState("");
  const [maximumMinutes, setMaximumMinutes] = useState("");
  const teammateOptions = useMemo(() => {
    const teams = new Set(rows.map((row) => row.Team));
    return Array.from(new Set(
      teammateRows
        .filter((row) => teams.has(row.Team) && row.Name !== playerName)
        .map((row) => row.Name)
    )).sort();
  }, [playerName, rows, teammateRows]);

  const filteredRows = useMemo(() => {
    const baseRows = rows.filter((row) => {
        if (selectedYear !== "All Years" && row.Year !== selectedYear) return false;
        if (selectedOpponent !== "All Opponents" && row.Opponent !== selectedOpponent) return false;
        const homeAway = row["Home Team"] === row.Team ? "Home" : row["Away Team"] === row.Team ? "Away" : null;
        if (selectedVenue !== "Home + away" && homeAway !== selectedVenue) return false;
        const minutes = numeric(row["Mins Played"]);
        if (minimumMinutes && (minutes == null || minutes < Number(minimumMinutes))) return false;
        if (maximumMinutes && (minutes == null || minutes > Number(maximumMinutes))) return false;
        return true;
      });
    if (selectedTeammate === "All Teammates") return baseRows;
    return filterByTeammate(baseRows, selectedTeammate, teammateMode === "with", teammateRows);
  }, [maximumMinutes, minimumMinutes, rows, selectedOpponent, selectedTeammate, selectedVenue, selectedYear, teammateMode, teammateRows]);

  const filtersActive = selectedYear !== "All Years" || selectedOpponent !== "All Opponents" || selectedVenue !== "Home + away" || selectedTeammate !== "All Teammates" || minimumMinutes !== "" || maximumMinutes !== "";
  const shouldCollapse = filteredRows.length > INITIAL_ROW_COUNT;
  const visibleRows = isExpanded ? filteredRows : filteredRows.slice(0, INITIAL_ROW_COUNT);

  return (
    <section className="overflow-hidden border border-nrl-border bg-[#111832]">
      <div className="border-b border-nrl-border px-4 py-6 sm:px-5 sm:py-8">
        <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-nrl-accent">
          Regular season game log
        </div>
        <h2 className="mt-2 text-5xl leading-none text-nrl-text sm:text-6xl">Game Log</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-nrl-muted sm:text-base">
          Filter every available match by opponent, venue, minutes and who took the field alongside {playerName}
        </p>
      </div>

        <div className="grid gap-3 border-b border-nrl-border px-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Opponent</span>
            <select
              value={selectedOpponent}
              onChange={(event) => {
                setSelectedOpponent(event.target.value);
                setIsExpanded(false);
              }}
              className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option>All Opponents</option>
              {opponents.map((opponent) => (
                <option key={opponent}>{opponent}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Venue</span>
            <select
              value={selectedVenue}
              onChange={(event) => {
                setSelectedVenue(event.target.value);
                setIsExpanded(false);
              }}
              className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option>Home + away</option>
              <option>Home</option>
              <option>Away</option>
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Year</span>
            <select
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setIsExpanded(false);
              }}
              className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option>All Years</option>
              {years.map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Teammate</span>
            <select
              value={selectedTeammate}
              onChange={(event) => {
                setSelectedTeammate(event.target.value);
                setIsExpanded(false);
              }}
              className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option>All Teammates</option>
              {teammateOptions.map((teammate) => <option key={teammate}>{teammate}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Teammate games</span>
            <select
              value={teammateMode}
              disabled={selectedTeammate === "All Teammates"}
              onChange={(event) => setTeammateMode(event.target.value as "with" | "without")}
              className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent disabled:opacity-45"
            >
              <option value="with">Played with</option>
              <option value="without">Played without</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0">
              <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Min mins</span>
              <input type="number" min="0" max="80" value={minimumMinutes} onChange={(event) => setMinimumMinutes(event.target.value)} placeholder="Any" className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs text-nrl-text outline-none focus:border-nrl-accent" />
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[8px] font-black tracking-wide text-nrl-muted">Max mins</span>
              <input type="number" min="0" max="120" value={maximumMinutes} onChange={(event) => setMaximumMinutes(event.target.value)} placeholder="Any" className="h-11 w-full border border-nrl-border bg-nrl-panel px-3 text-xs text-nrl-text outline-none focus:border-nrl-accent" />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedYear("All Years");
              setSelectedOpponent("All Opponents");
              setSelectedVenue("Home + away");
              setSelectedTeammate("All Teammates");
              setTeammateMode("with");
              setMinimumMinutes("");
              setMaximumMinutes("");
              setIsExpanded(false);
            }}
            className="h-11 border border-nrl-accent/45 bg-nrl-accent/10 px-4 text-[9px] font-black uppercase tracking-[0.12em] text-nrl-accent transition-colors hover:bg-nrl-accent hover:text-nrl-bg"
          >
            Clear filters
          </button>
          <div className="flex items-end pb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-nrl-muted">
            {filteredRows.length} games{filtersActive ? " · filtered" : ""}
          </div>
        </div>

      <div className="grid grid-cols-2 border-b border-nrl-border sm:grid-cols-4">
        {[
          ["Games", filteredRows.length.toString()],
          ["Minutes", formatNumber(average(filteredRows, "Mins Played"))],
          ["Run metres", formatNumber(average(filteredRows, "All Run Metres"))],
          ["Tackles", formatNumber(average(filteredRows, "Tackles Made"))],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-r border-nrl-border px-4 py-4 last:border-r-0 sm:border-b-0">
            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-nrl-muted">{label}</div>
            <div className="mt-2 font-[family-name:var(--font-landing-display)] text-3xl font-black text-nrl-text">{value}</div>
          </div>
        ))}
      </div>

      <div className="relative overflow-x-auto">
        <table className="min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr>
              {["Season", "Rnd", "Opponent", "Position", ...statKeys, "Team"].map((label) => (
                <th
                  key={label}
                  className="border-b border-r border-nrl-border bg-nrl-panel-2 px-2.5 py-2 text-[10px] font-semibold tracking-wide text-nrl-muted last:border-r-0"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={statKeys.length + 5} className="px-3 py-6 text-center text-sm text-nrl-muted">
                  No games match the selected filters.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={`${row.Year}-${row.Round}-${row.Team}`} className="border-b border-nrl-border/60 hover:bg-nrl-panel-2/60">
                  <td className="border-r border-nrl-border px-2.5 py-2 font-semibold text-nrl-text">{row.Year}</td>
                  <td className="border-r border-nrl-border px-2.5 py-2 text-nrl-muted">{row.Round_Label || `R${row.Round}`}</td>
                  <td className="border-r border-nrl-border px-2.5 py-2 text-nrl-muted">{row.Opponent ?? "-"}</td>
                  <td className="border-r border-nrl-border px-2.5 py-2 text-nrl-muted">{row.Position || "-"}</td>
                  {statKeys.map((stat) => (
                    <td key={stat} className="border-r border-nrl-border px-2.5 py-2 text-right text-nrl-text last:border-r-0">
                      {formatNumber(numeric(row[stat]))}
                    </td>
                  ))}
                  <td className="px-2.5 py-2 text-nrl-muted">{row.Team}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {shouldCollapse && !isExpanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-gradient-to-b from-transparent via-[#111832]/70 to-[#111832] pb-2">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center text-nrl-muted transition-colors hover:text-nrl-accent"
              aria-label="Expand player game log"
            >
              <span aria-hidden="true">⌄</span>
            </button>
          </div>
        ) : null}
      </div>
      {shouldCollapse && isExpanded ? (
        <div className="flex justify-center border-t border-nrl-border bg-nrl-panel-2 py-1.5">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="inline-flex h-8 w-8 items-center justify-center text-nrl-muted transition-colors hover:text-nrl-accent"
            aria-label="Collapse player game log"
          >
            <span aria-hidden="true">⌃</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

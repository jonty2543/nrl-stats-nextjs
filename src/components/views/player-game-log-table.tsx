"use client";

import { useMemo, useState } from "react";
import type { PlayerStat } from "@/lib/data/types";

interface PlayerGameLogTableProps {
  rows: PlayerStat[];
  statKeys: readonly string[];
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

export function PlayerGameLogTable({ rows, statKeys }: PlayerGameLogTableProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const years = useMemo(() => Array.from(new Set(rows.map((row) => row.Year))).sort((a, b) => b.localeCompare(a)), [rows]);
  const opponents = useMemo(
    () => Array.from(new Set(rows.map((row) => row.Opponent).filter((value): value is string => Boolean(value)))).sort(),
    [rows]
  );
  const [selectedYear, setSelectedYear] = useState("All Years");
  const [selectedOpponent, setSelectedOpponent] = useState("All Opponents");

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (selectedYear !== "All Years" && row.Year !== selectedYear) return false;
        if (selectedOpponent !== "All Opponents" && row.Opponent !== selectedOpponent) return false;
        return true;
      }),
    [rows, selectedOpponent, selectedYear]
  );

  const filtersActive = selectedYear !== "All Years" || selectedOpponent !== "All Opponents";
  const shouldCollapse = filteredRows.length > INITIAL_ROW_COUNT;
  const visibleRows = isExpanded ? filteredRows : filteredRows.slice(0, INITIAL_ROW_COUNT);

  return (
    <section className="overflow-hidden rounded-xl border border-nrl-border bg-[#111832]">
      <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-nrl-border bg-nrl-panel-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wide text-nrl-accent">Player Game Log</div>
          <div className="mt-0.5 text-[10px] text-nrl-muted">
            {filteredRows.length} games{filtersActive ? " · filtered" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className={`relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
            filtersOpen || filtersActive
              ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
              : "border-nrl-border bg-nrl-panel text-nrl-muted hover:border-nrl-accent hover:text-nrl-accent"
          }`}
          aria-expanded={filtersOpen}
          aria-label="Game log filters"
        >
          <span className="flex flex-col gap-0.5" aria-hidden="true">
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
          </span>
        </button>
      </div>

      {filtersOpen ? (
        <div className="grid gap-3 border-b border-nrl-border bg-nrl-accent/10 px-3 py-3 sm:grid-cols-2">
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-nrl-muted">Year</span>
            <select
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setIsExpanded(false);
              }}
              className="h-9 w-full rounded-md border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option>All Years</option>
              {years.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-nrl-muted">Opponent</span>
            <select
              value={selectedOpponent}
              onChange={(event) => {
                setSelectedOpponent(event.target.value);
                setIsExpanded(false);
              }}
              className="h-9 w-full rounded-md border border-nrl-border bg-nrl-panel px-3 text-xs font-semibold text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option>All Opponents</option>
              {opponents.map((opponent) => (
                <option key={opponent}>{opponent}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

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

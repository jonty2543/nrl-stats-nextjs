"use client";

import { useMemo } from "react";

type StatRow = {
  Year: string;
  Round?: number | null;
  Opponent?: string | null;
  [key: string]: string | number | null | undefined;
};

interface OpponentAverageHeatmapProps<T extends StatRow> {
  rows: T[];
  stat: string;
}

interface HeatmapCell {
  average: number | null;
  games: number;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "").replace(/%$/, "");
    if (!trimmed || trimmed === "-") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOpponent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "-" ? trimmed : null;
}

function getHeatColorForAverage(value: number, min: number, mid: number, max: number): string {
  const clamped = Math.max(min, Math.min(max, value));

  if (clamped <= mid) {
    const ratio = (clamped - min) / (mid - min || 1);
    const red = Math.round(37 + ratio * (51 - 37));
    const green = Math.round(48 + ratio * (111 - 48));
    const blue = Math.round(78 + ratio * (155 - 78));
    const alpha = 0.25 + ratio * 0.22;
    return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
  }

  const ratio = (clamped - mid) / (max - mid || 1);
  const red = Math.round(51 + ratio * (38 - 51));
  const green = Math.round(111 + ratio * (201 - 111));
  const blue = Math.round(155 + ratio * (133 - 155));
  const alpha = 0.47 + ratio * 0.2;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

export function OpponentAverageHeatmap<T extends StatRow>({
  rows,
  stat,
}: OpponentAverageHeatmapProps<T>) {
  const heatmap = useMemo(() => {
    const opponents = new Set<string>();
    const seasons = new Set<string>();
    const seasonOpponent = new Map<string, { sum: number; count: number }>();
    const allOpponent = new Map<string, { sum: number; count: number }>();

    for (const row of rows) {
      const opponent = normalizeOpponent(row.Opponent);
      const value = toFiniteNumber(row[stat]);
      if (!opponent || value === null) continue;

      const season = String(row.Year ?? "").trim() || "Unknown";
      seasons.add(season);
      opponents.add(opponent);

      const seasonKey = `${season}|||${opponent}`;
      const seasonCurrent = seasonOpponent.get(seasonKey) ?? { sum: 0, count: 0 };
      seasonCurrent.sum += value;
      seasonCurrent.count += 1;
      seasonOpponent.set(seasonKey, seasonCurrent);

      const allCurrent = allOpponent.get(opponent) ?? { sum: 0, count: 0 };
      allCurrent.sum += value;
      allCurrent.count += 1;
      allOpponent.set(opponent, allCurrent);
    }

    const seasonList = [...seasons].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const referenceSeason = seasonList[0] ?? null;
    const opponentFirstRound = new Map<string, number>();

    if (referenceSeason) {
      for (const row of rows) {
        const opponent = normalizeOpponent(row.Opponent);
        const season = String(row.Year ?? "").trim() || "Unknown";
        const round = typeof row.Round === "number" && Number.isFinite(row.Round) ? row.Round : null;
        if (!opponent || season !== referenceSeason || round === null) continue;
        const current = opponentFirstRound.get(opponent);
        if (current === undefined || round < current) {
          opponentFirstRound.set(opponent, round);
        }
      }
    }

    const columns = [...opponents].sort((a, b) => {
      const aRound = opponentFirstRound.get(a);
      const bRound = opponentFirstRound.get(b);
      if (aRound != null && bRound != null && aRound !== bRound) return aRound - bRound;
      if (aRound != null) return -1;
      if (bRound != null) return 1;
      return a.localeCompare(b);
    });

    const rowsOut = [
      {
        label: "All",
        cells: columns.map((opponent): HeatmapCell => {
          const total = allOpponent.get(opponent);
          if (!total || total.count === 0) return { average: null, games: 0 };
          return { average: total.sum / total.count, games: total.count };
        }),
      },
      ...seasonList.map((season) => ({
        label: season,
        cells: columns.map((opponent): HeatmapCell => {
          const total = seasonOpponent.get(`${season}|||${opponent}`);
          if (!total || total.count === 0) return { average: null, games: 0 };
          return { average: total.sum / total.count, games: total.count };
        }),
      })),
    ];

    return {
      columns: columns.map((opponent) => ({
        opponent,
        round: opponentFirstRound.get(opponent) ?? null,
      })),
      rows: rowsOut,
      values: rowsOut.flatMap((row) =>
        row.cells
          .map((cell) => cell.average)
          .filter((value): value is number => value !== null)
      ),
    };
  }, [rows, stat]);

  if (heatmap.columns.length === 0) {
    return <div className="text-sm text-nrl-muted">No opponent data available for this selection.</div>;
  }

  const scale = (() => {
    const values = heatmap.values;
    if (values.length === 0) {
      return { min: 0, mid: 0.5, max: 1 };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max <= min) {
      return { min, mid: min, max: min + 1 };
    }

    return {
      min,
      mid: min + (max - min) / 2,
      max,
    };
  })();

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-nrl-muted">
        Scale: {scale.min.toFixed(1)} low · {scale.mid.toFixed(1)} mid · {scale.max.toFixed(1)} high
      </div>
      <div className="max-h-[24rem] overflow-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-nrl-border bg-nrl-panel-2 px-2 py-1 text-left text-[10px] uppercase tracking-wide text-nrl-muted">
                Season
              </th>
              {heatmap.columns.map((column) => (
                <th
                  key={`heat-head-${column.opponent}`}
                  className="border-b border-nrl-border px-2 py-1 text-center text-[10px] uppercase tracking-wide text-nrl-muted whitespace-nowrap"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] font-semibold tracking-normal text-nrl-accent">
                      {column.round != null ? `R${column.round}` : "-"}
                    </span>
                    <span>{column.opponent}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.rows.map((row) => (
              <tr key={`heat-row-${row.label}`} className="border-t border-nrl-border/60">
                <th className="sticky left-0 z-10 border-r border-nrl-border bg-nrl-panel-2 px-2 py-1 text-left text-[10px] font-semibold text-nrl-text whitespace-nowrap">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={`heat-cell-${row.label}-${heatmap.columns[index]?.opponent ?? index}`}
                    className="min-w-[74px] border-l border-nrl-border/60 px-2 py-1.5 text-center"
                    style={
                      cell.average === null
                        ? undefined
                        : {
                            backgroundColor: getHeatColorForAverage(
                              cell.average,
                              scale.min,
                              scale.mid,
                              scale.max
                            ),
                          }
                    }
                  >
                    {cell.average === null ? (
                      <span className="text-[10px] text-nrl-muted">-</span>
                    ) : (
                      <div>
                        <div className="text-xs font-semibold text-nrl-text">{cell.average.toFixed(1)}</div>
                        <div className="text-[9px] text-nrl-muted">n={cell.games}</div>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

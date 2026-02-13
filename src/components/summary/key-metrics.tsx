"use client";

import { SectionHeader } from "@/components/ui/section-header";
import { mean } from "@/lib/data/stats";
import type { PlayerStat, TeamStat } from "@/lib/data/types";

type StatCol = [string, string]; // [column, label]

const DEFAULT_PLAYER_STATS: StatCol[] = [
  ["Fantasy", "Fantasy Avg"],
  ["Tackles Made", "Tackles/Game"],
  ["All Run Metres", "Run Metres/Game"],
  ["Post Contact Metres", "PCM/Game"],
  ["Errors", "Errors/Game"],
  ["Offloads", "Offloads/Game"],
  ["Try Assists", "Try Assists/Game"],
  ["Line Breaks", "Line Breaks/Game"],
  ["Tackle Breaks", "Tackle Breaks/Game"],
];

function percentileColor(pct: number): string {
  if (pct >= 75) return "var(--color-percentile-top)";
  if (pct >= 50) return "var(--color-percentile-high)";
  if (pct >= 25) return "var(--color-percentile-mid)";
  return "var(--color-percentile-low)";
}

interface EntityData {
  name: string;
  rows: (PlayerStat | TeamStat)[];
}

interface KeyMetricsProps {
  entities: EntityData[];
  statCols?: StatCol[];
  allRows?: (PlayerStat | TeamStat)[];
  groupCol?: "Name" | "Team";
}

export function KeyMetrics({
  entities,
  statCols = DEFAULT_PLAYER_STATS,
  allRows,
  groupCol = "Name",
}: KeyMetricsProps) {
  const single = entities.length === 1;
  const showPct = single && allRows && allRows.length > 0;

  // Pre-compute entity averages across all data
  let allEntityAvgs: Map<string, Map<string, number>> | null = null;
  if (showPct && allRows) {
    const sums = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const row of allRows) {
      const key = row[groupCol] as string;
      if (!sums.has(key)) sums.set(key, new Map());
      const m = sums.get(key)!;
      for (const [col] of statCols) {
        const val = row[col as keyof typeof row];
        if (typeof val !== "number" || isNaN(val)) continue;
        const e = m.get(col) ?? { sum: 0, count: 0 };
        e.sum += val;
        e.count++;
        m.set(col, e);
      }
    }
    allEntityAvgs = new Map();
    for (const [key, statsMap] of sums) {
      const avgs = new Map<string, number>();
      for (const [stat, { sum, count }] of statsMap) {
        avgs.set(stat, sum / count);
      }
      allEntityAvgs.set(key, avgs);
    }
  }

  return (
    <div>
      <SectionHeader title="Key Metrics" />
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-0.5 text-left text-[0.7rem] text-nrl-muted border-b border-nrl-border">
              Metric
            </th>
            {single ? (
              <>
                <th className="p-0.5 text-right text-[0.7rem] text-nrl-muted border-b border-nrl-border">
                  Value
                </th>
                {showPct && (
                  <th className="p-0.5 text-right text-[0.7rem] text-nrl-muted border-b border-nrl-border">
                    Pctl
                  </th>
                )}
              </>
            ) : (
              entities.map((e) => (
                <th
                  key={e.name}
                  className="p-0.5 text-right text-[0.7rem] text-nrl-muted border-b border-nrl-border"
                >
                  {e.name.length > 14 ? e.name.split(" ").pop() : e.name}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {statCols.map(([col, label]) => (
            <tr key={col}>
              <td className="p-0.5 text-[0.72rem] text-nrl-muted">{label}</td>
              {entities.map((entity) => {
                const vals = entity.rows
                  .map((r) => r[col as keyof typeof r])
                  .filter(
                    (v): v is number => typeof v === "number" && !isNaN(v)
                  );
                const avg = vals.length > 0 ? mean(vals) : null;

                return (
                  <td
                    key={entity.name}
                    className="p-0.5 text-right text-[0.72rem] text-nrl-text"
                  >
                    {avg !== null ? avg.toFixed(1) : "\u2014"}
                  </td>
                );
              })}
              {showPct && allEntityAvgs && (() => {
                const vals = entities[0].rows
                  .map((r) => r[col as keyof typeof r])
                  .filter(
                    (v): v is number => typeof v === "number" && !isNaN(v)
                  );
                const avg = vals.length > 0 ? mean(vals) : null;

                if (avg === null) {
                  return (
                    <td className="p-0.5 text-right text-[0.72rem] text-nrl-muted">
                      {"\u2014"}
                    </td>
                  );
                }

                const allAvgs: number[] = [];
                for (const avgs of allEntityAvgs!.values()) {
                  const a = avgs.get(col);
                  if (a !== undefined) allAvgs.push(a);
                }
                const pct =
                  allAvgs.length > 0
                    ? (allAvgs.filter((a) => a < avg).length / allAvgs.length) *
                      100
                    : 0;
                const pctColor = percentileColor(pct);

                return (
                  <td
                    className="p-0.5 text-right text-[0.72rem] font-bold"
                    style={{ color: pctColor }}
                  >
                    {pct.toFixed(0)}th
                  </td>
                );
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

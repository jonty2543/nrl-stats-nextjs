import type { RecentFormResult } from "@/lib/data/transform";
import { SectionHeader } from "@/components/ui/section-header";

interface RecentFormProps {
  results: RecentFormResult[];
  single?: boolean;
}

export function RecentForm({ results, single = false }: RecentFormProps) {
  if (results.length === 0) return null;

  const dense = !single && results.length > 2;
  const rowSpacing = single ? "gap-1.5" : dense ? "gap-1.5" : "gap-2";

  return (
    <div className="rounded-lg border border-nrl-border bg-nrl-panel p-3">
      <SectionHeader title="Recent Form (Last 5 Avg)" />
      <div className={`grid ${rowSpacing}`}>
        {results.map((r, i) => {
          const arrow = r.pctChange > 0 ? "\u25b2" : r.pctChange < 0 ? "\u25bc" : "\u2014";
          const color =
            r.pctChange > 0
              ? "text-chart-primary"
              : r.pctChange < 0
              ? "text-chart-trendline"
              : "text-nrl-muted";
          const label = single
            ? r.stat
            : `${r.entity} \u2014 ${r.stat}`;
          const signedChange = `${r.pctChange > 0 ? "+" : r.pctChange < 0 ? "-" : ""}${Math.abs(r.pctChange).toFixed(1)}%`;

          return (
            <div
              key={`${label}-${i}`}
              className="flex flex-col gap-1 rounded-md border border-nrl-border/70 bg-nrl-panel-2/45 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 truncate text-[0.72rem] font-medium text-nrl-muted" title={label}>
                {label}
              </span>
              <span className={`shrink-0 text-[0.74rem] font-bold ${color}`}>
                {arrow} {signedChange}
                <span className="ml-1 font-semibold text-nrl-muted">
                  {r.last5Avg.toFixed(1)} last 5 vs {r.overallAvg.toFixed(1)} avg
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

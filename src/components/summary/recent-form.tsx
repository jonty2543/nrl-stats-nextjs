import type { RecentFormResult } from "@/lib/data/transform";
import { SectionHeader } from "@/components/ui/section-header";

interface RecentFormProps {
  results: RecentFormResult[];
  single?: boolean;
}

export function RecentForm({ results, single = false }: RecentFormProps) {
  if (results.length === 0) return null;

  const dense = !single && results.length > 2;
  const rowSpacing = single ? "mb-0.5" : dense ? "mb-0.5" : "mb-2";

  return (
    <div>
      <SectionHeader title="Recent Form (Last 5 Avg)" />
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

        return (
          <div key={i} className={`flex justify-between text-[0.72rem] ${rowSpacing}`}>
            <span className="text-nrl-muted">{label}</span>
            <span className={`font-bold ${color}`}>
              {arrow} {Math.abs(r.pctChange).toFixed(1)}% ({r.last5Avg.toFixed(1)}{" "}
              vs {r.overallAvg.toFixed(1)})
            </span>
          </div>
        );
      })}
    </div>
  );
}

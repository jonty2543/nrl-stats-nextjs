import type { PercentileResult } from "@/lib/data/transform";
import { SectionHeader } from "@/components/ui/section-header";

type PercentileScope = "Position" | "All Players";

function percentileColor(pct: number): string {
  if (pct >= 75) return "var(--color-percentile-top)";
  if (pct >= 50) return "var(--color-percentile-high)";
  if (pct >= 25) return "var(--color-percentile-mid)";
  return "var(--color-percentile-low)";
}

interface PercentileRanksProps {
  results: PercentileResult[];
  single?: boolean;
  percentileScope?: PercentileScope;
  onPercentileScopeChange?: (scope: PercentileScope) => void;
}

export function PercentileRanks({
  results,
  single = false,
  percentileScope,
  onPercentileScopeChange,
}: PercentileRanksProps) {
  if (results.length === 0) return null;

  const dense = !single && results.length > 2;
  const rowSpacing = single ? "mb-1.5" : dense ? "mb-1.5" : "mb-3";
  const barHeight = single ? "h-1.5" : dense ? "h-1.5" : "h-2";
  const showScopeToggle = !!percentileScope && !!onPercentileScopeChange;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <SectionHeader title="Percentile Rank" />
        {showScopeToggle && (
          <div className="inline-flex rounded-md border border-nrl-border bg-nrl-panel-2 p-0.5">
            {(["Position", "All Players"] as const).map((scope) => {
              const active = percentileScope === scope;
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => onPercentileScopeChange(scope)}
                  className={`rounded px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide transition-colors ${
                    active
                      ? "bg-nrl-accent/20 text-nrl-accent"
                      : "text-nrl-muted hover:text-nrl-text"
                  }`}
                >
                  {scope === "All Players" ? "All" : "Position"}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {results.map((r, i) => {
        const color = percentileColor(r.percentile);
        const label = single
          ? r.stat
          : `${r.entity} \u2014 ${r.stat}`;

        return (
          <div key={i} className={rowSpacing}>
            <div className="flex justify-between text-[0.68rem] text-nrl-muted mb-px">
              <span>{label}</span>
              <span style={{ color, fontWeight: 700 }}>
                {r.percentile.toFixed(0)}th
              </span>
            </div>
            <div className={`bg-nrl-panel-2 rounded-sm overflow-hidden ${barHeight}`}>
              <div
                className="h-full rounded-sm transition-all"
                style={{
                  width: `${r.percentile}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

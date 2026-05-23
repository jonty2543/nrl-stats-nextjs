import type { PercentileResult } from "@/lib/data/transform";
import { SectionHeader } from "@/components/ui/section-header";

type PercentileScope = "Position" | "All Players";

function percentileColor(pct: number): string {
  if (pct >= 75) return "var(--color-percentile-top)";
  if (pct >= 50) return "var(--color-percentile-high)";
  if (pct >= 25) return "var(--color-percentile-mid)";
  return "var(--color-percentile-low)";
}

function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  const mod10 = rank % 10;
  if (mod10 === 1) return `${rank}st`;
  if (mod10 === 2) return `${rank}nd`;
  if (mod10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

interface PercentileRanksProps {
  results: PercentileResult[];
  single?: boolean;
  mode?: "percentile" | "rank";
  percentileScope?: PercentileScope;
  onPercentileScopeChange?: (scope: PercentileScope) => void;
}

export function PercentileRanks({
  results,
  single = false,
  mode = "percentile",
  percentileScope,
  onPercentileScopeChange,
}: PercentileRanksProps) {
  if (results.length === 0) return null;

  const dense = !single && results.length > 2;
  const rowSpacing = single ? "gap-1.5" : dense ? "gap-1.5" : "gap-2";
  const barHeight = single ? "h-2" : dense ? "h-2" : "h-2.5";
  const showScopeToggle = mode === "percentile" && !!percentileScope && !!onPercentileScopeChange;

  return (
    <div className="rounded-lg border border-nrl-border bg-nrl-panel p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <SectionHeader title={mode === "rank" ? "Rank (1 = Best)" : "Percentile Rank"} />
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
      <div className={`grid ${rowSpacing}`}>
        {results.map((r, i) => {
          const barValue =
            mode === "rank"
              ? (r.total <= 1 ? 100 : ((r.total - r.rank) / (r.total - 1)) * 100)
              : r.percentile;
          const color = percentileColor(barValue);
          const label = single
            ? r.stat
            : `${r.entity} \u2014 ${r.stat}`;

          return (
            <div key={`${label}-${i}`} className="rounded-md border border-nrl-border/70 bg-nrl-panel-2/45 px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[0.72rem]">
                <span className="min-w-0 truncate font-medium text-nrl-muted" title={label}>{label}</span>
                <span className="shrink-0 text-sm font-bold" style={{ color }}>
                  {mode === "rank" ? ordinal(r.rank) : `${r.percentile.toFixed(0)}th`}
                </span>
              </div>
              <div className={`overflow-hidden rounded-full bg-nrl-border/50 ${barHeight}`}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barValue}%`,
                    background: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

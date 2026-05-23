import type { SummaryRow } from "@/lib/data/transform";

interface StatsTableProps {
  rows: SummaryRow[];
  showLabel?: boolean;
}

export function StatsTable({ rows, showLabel = true }: StatsTableProps) {
  if (rows.length === 0) return null;

  const labelOrder = Array.from(new Set(rows.map((r) => r.label)));
  const statOrder = Array.from(new Set(rows.map((r) => r.stat)));
  const sortedRows = [...rows].sort((a, b) => {
    const statA = statOrder.indexOf(a.stat);
    const statB = statOrder.indexOf(b.stat);
    if (statA !== statB) return statA - statB;

    const labelA = labelOrder.indexOf(a.label);
    const labelB = labelOrder.indexOf(b.label);
    return labelA - labelB;
  });

  // Check if all labels are the same (single entity)
  const labels = new Set(sortedRows.map((r) => r.label));
  const hideLabelCol = labels.size <= 1;

  return (
    <div className="overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse">
          <thead className="bg-nrl-panel-2">
            <tr>
              {showLabel && !hideLabelCol && (
                <th className="border-b border-nrl-border px-3 py-2 text-left text-[0.68rem] font-bold uppercase tracking-wide text-nrl-muted">
                  Player
                </th>
              )}
              <th className="border-b border-nrl-border px-3 py-2 text-left text-[0.68rem] font-bold uppercase tracking-wide text-nrl-muted">
                Stat
              </th>
              <th className="border-b border-nrl-border px-3 py-2 text-right text-[0.68rem] font-bold uppercase tracking-wide text-nrl-muted">
                Avg
              </th>
              <th className="border-b border-nrl-border px-3 py-2 text-right text-[0.68rem] font-bold uppercase tracking-wide text-nrl-muted">
                Median
              </th>
              <th className="border-b border-nrl-border px-3 py-2 text-right text-[0.68rem] font-bold uppercase tracking-wide text-nrl-muted">
                Low
              </th>
              <th className="border-b border-nrl-border px-3 py-2 text-right text-[0.68rem] font-bold uppercase tracking-wide text-nrl-muted">
                High
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={`${row.label}-${row.stat}-${i}`} className="odd:bg-white/[0.015]">
                {showLabel && !hideLabelCol && (
                  <td className="border-t border-nrl-border/60 px-3 py-2 text-[0.75rem] font-medium text-nrl-text">
                    {row.label}
                  </td>
                )}
                <td className="border-t border-nrl-border/60 px-3 py-2 text-[0.75rem] text-nrl-text">
                  {row.stat}
                </td>
                <td className="border-t border-nrl-border/60 px-3 py-2 text-right text-[0.75rem] font-semibold text-nrl-text">
                  {row.avg.toFixed(1)}
                </td>
                <td className="border-t border-nrl-border/60 px-3 py-2 text-right text-[0.75rem] text-nrl-text">
                  {row.med.toFixed(1)}
                </td>
                <td className="border-t border-nrl-border/60 px-3 py-2 text-right text-[0.75rem] text-nrl-muted">
                  {row.min.toFixed(1)}
                </td>
                <td className="border-t border-nrl-border/60 px-3 py-2 text-right text-[0.75rem] text-nrl-muted">
                  {row.max.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

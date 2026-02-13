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
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {showLabel && !hideLabelCol && (
            <th className="p-1 text-left text-[0.75rem] text-nrl-muted border-b border-nrl-border">
              Player
            </th>
          )}
          <th className="p-1 text-left text-[0.75rem] text-nrl-muted border-b border-nrl-border">
            Stat
          </th>
          <th className="p-1 text-right text-[0.75rem] text-nrl-muted border-b border-nrl-border">
            Average
          </th>
          <th className="p-1 text-right text-[0.75rem] text-nrl-muted border-b border-nrl-border">
            Median
          </th>
          <th className="p-1 text-right text-[0.75rem] text-nrl-muted border-b border-nrl-border">
            Min
          </th>
          <th className="p-1 text-right text-[0.75rem] text-nrl-muted border-b border-nrl-border">
            Max
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row, i) => (
          <tr key={i}>
            {showLabel && !hideLabelCol && (
              <td className="p-1 text-[0.75rem] text-nrl-text">{row.label}</td>
            )}
            <td className="p-1 text-[0.75rem] text-nrl-text">{row.stat}</td>
            <td className="p-1 text-right text-[0.75rem] text-nrl-text">
              {row.avg.toFixed(2)}
            </td>
            <td className="p-1 text-right text-[0.75rem] text-nrl-text">
              {row.med.toFixed(2)}
            </td>
            <td className="p-1 text-right text-[0.75rem] text-nrl-text">
              {row.min.toFixed(2)}
            </td>
            <td className="p-1 text-right text-[0.75rem] text-nrl-text">
              {row.max.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

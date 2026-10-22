// Match context includes the whole season. Only send dates shown in the odds
// snapshot, while preserving legacy undated lookup keys used by the client.
export function selectBettingMatchContext<T>(
  context: Record<string, T>,
  dates: ReadonlySet<string>,
): Record<string, T> {
  return Object.fromEntries(Object.entries(context).filter(([key]) =>
    !/^\d{4}-\d{2}-\d{2}\|/.test(key) || dates.has(key.slice(0, 10))
  ));
}

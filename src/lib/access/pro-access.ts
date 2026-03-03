function parseAllowlistedUserIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function hasProPlotAccess(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowlistedUserIds = parseAllowlistedUserIds(
    process.env.PRO_PLOT_UNLOCK_USER_IDS ?? process.env.NEXT_PUBLIC_PRO_PLOT_UNLOCK_USER_IDS
  );
  return allowlistedUserIds.has(userId);
}

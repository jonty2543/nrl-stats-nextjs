const FREE_ACCESS_START_YEAR = 2025;
const STATS_PRO_LOCK_START_YEAR = 2024;

export const TEMP_ALLOW_HISTORICAL_TESTING = false;

type SeasonAccessScope = "default" | "stats";

export function isAccessibleSeason(
  year: string,
  canAccessLoginSeason: boolean,
  scope: SeasonAccessScope = "default"
): boolean {
  const parsedYear = Number.parseInt(year, 10);
  if (Number.isNaN(parsedYear)) return false;
  if (TEMP_ALLOW_HISTORICAL_TESTING) return true;
  if (scope === "stats" && parsedYear < STATS_PRO_LOCK_START_YEAR) return false;
  if (parsedYear < FREE_ACCESS_START_YEAR && !canAccessLoginSeason) return false;
  return true;
}

export function getSeasonLockReason(
  year: string,
  canAccessLoginSeason: boolean,
  scope: SeasonAccessScope = "default"
): string | null {
  const parsedYear = Number.parseInt(year, 10);
  if (Number.isNaN(parsedYear)) return null;
  if (TEMP_ALLOW_HISTORICAL_TESTING) return null;
  if (scope === "stats" && parsedYear < STATS_PRO_LOCK_START_YEAR) return "Pro";
  if (parsedYear < FREE_ACCESS_START_YEAR && !canAccessLoginSeason) return "Login";
  return null;
}

export function hasProLockedHistoricalSeasons(
  years: string[],
  scope: SeasonAccessScope = "default"
): boolean {
  if (TEMP_ALLOW_HISTORICAL_TESTING || scope !== "stats") return false;
  return years.some((year) => {
    const parsedYear = Number.parseInt(year, 10);
    return !Number.isNaN(parsedYear) && parsedYear < STATS_PRO_LOCK_START_YEAR;
  });
}

export function requiresLoginFor2024(
  years: string[],
  canAccessLoginSeason: boolean,
  scope: SeasonAccessScope = "default"
): boolean {
  if (TEMP_ALLOW_HISTORICAL_TESTING) return false;
  return !canAccessLoginSeason && years.some((year) => {
    const parsedYear = Number.parseInt(year, 10);
    if (Number.isNaN(parsedYear)) return false;
    if (scope === "stats") return parsedYear === 2024;
    return parsedYear < FREE_ACCESS_START_YEAR;
  });
}

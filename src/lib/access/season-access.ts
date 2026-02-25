const FREE_ACCESS_START_YEAR = 2025;

export const TEMP_ALLOW_HISTORICAL_TESTING = false;

export function isAccessibleSeason(
  year: string,
  canAccessLoginSeason: boolean
): boolean {
  const parsedYear = Number.parseInt(year, 10);
  if (Number.isNaN(parsedYear)) return false;
  if (TEMP_ALLOW_HISTORICAL_TESTING) return true;
  if (parsedYear < FREE_ACCESS_START_YEAR && !canAccessLoginSeason) return false;
  return true;
}

export function getSeasonLockReason(
  year: string,
  canAccessLoginSeason: boolean
): string | null {
  const parsedYear = Number.parseInt(year, 10);
  if (Number.isNaN(parsedYear)) return null;
  if (TEMP_ALLOW_HISTORICAL_TESTING) return null;
  if (parsedYear < FREE_ACCESS_START_YEAR && !canAccessLoginSeason) return "Login";
  return null;
}

export function hasProLockedHistoricalSeasons(years: string[]): boolean {
  void years;
  return false;
}

export function requiresLoginFor2024(
  years: string[],
  canAccessLoginSeason: boolean
): boolean {
  if (TEMP_ALLOW_HISTORICAL_TESTING) return false;
  return !canAccessLoginSeason && years.some((year) => {
    const parsedYear = Number.parseInt(year, 10);
    return !Number.isNaN(parsedYear) && parsedYear < FREE_ACCESS_START_YEAR;
  });
}

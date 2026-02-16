const PRO_SEASON_CUTOFF_YEAR = 2024;
const LOGIN_REQUIRED_SEASON = 2024;

export const TEMP_ALLOW_HISTORICAL_TESTING = false;

export function isAccessibleSeason(
  year: string,
  canAccessLoginSeason: boolean
): boolean {
  const parsedYear = Number.parseInt(year, 10);
  if (Number.isNaN(parsedYear)) return false;
  if (TEMP_ALLOW_HISTORICAL_TESTING) return true;
  if (parsedYear < PRO_SEASON_CUTOFF_YEAR) return false;
  if (parsedYear === LOGIN_REQUIRED_SEASON && !canAccessLoginSeason) return false;
  return true;
}

export function getSeasonLockReason(
  year: string,
  canAccessLoginSeason: boolean
): string | null {
  const parsedYear = Number.parseInt(year, 10);
  if (Number.isNaN(parsedYear)) return null;
  if (TEMP_ALLOW_HISTORICAL_TESTING) return null;
  if (parsedYear < PRO_SEASON_CUTOFF_YEAR) return "Pro";
  if (parsedYear === LOGIN_REQUIRED_SEASON && !canAccessLoginSeason) return "Login";
  return null;
}

export function hasProLockedHistoricalSeasons(years: string[]): boolean {
  if (TEMP_ALLOW_HISTORICAL_TESTING) return false;
  return years.some((year) => {
    const parsedYear = Number.parseInt(year, 10);
    return !Number.isNaN(parsedYear) && parsedYear < PRO_SEASON_CUTOFF_YEAR;
  });
}

export function requiresLoginFor2024(
  years: string[],
  canAccessLoginSeason: boolean
): boolean {
  if (TEMP_ALLOW_HISTORICAL_TESTING) return false;
  return !canAccessLoginSeason && years.includes(String(LOGIN_REQUIRED_SEASON));
}

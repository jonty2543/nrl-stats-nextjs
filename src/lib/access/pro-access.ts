function parseAllowlistedUserIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const PREVIEW_UNLOCK_BRANCH_NAMES = new Set(["betting/testing"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasPreviewFeatureUnlock(): boolean {
  const envBranch =
    process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null;
  if (envBranch && PREVIEW_UNLOCK_BRANCH_NAMES.has(envBranch)) {
    return true;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("betting-testing")) {
      return true;
    }
  }

  return false;
}

function getProPlotAllowlist(): Set<string> {
  return parseAllowlistedUserIds(
    process.env.PRO_PLOT_UNLOCK_USER_IDS ?? process.env.NEXT_PUBLIC_PRO_PLOT_UNLOCK_USER_IDS
  );
}

function getPremiumAllowlist(): Set<string> {
  return parseAllowlistedUserIds(
    process.env.PREMIUM_UNLOCK_USER_IDS ?? process.env.NEXT_PUBLIC_PREMIUM_UNLOCK_USER_IDS
  );
}

export function hasEntitledSubscriptionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ENTITLED_SUBSCRIPTION_STATUSES.has(status);
}

export function hasProAccessFromMetadata(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false;

  const explicitValue = metadata.shortsideIsPro;
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  const explicitPremiumValue = metadata.shortsideIsPremium;
  if (explicitPremiumValue === true) {
    return true;
  }

  const statusValue = metadata.shortsideSubscriptionStatus;
  if (typeof statusValue === "string") {
    return hasEntitledSubscriptionStatus(statusValue);
  }

  const tierValue = metadata.shortsideTier;
  if (typeof tierValue === "string" && /^(pro|premium)$/i.test(tierValue)) {
    return true;
  }

  const planValue = metadata.shortsidePlan;
  return typeof planValue === "string" && /(pro|premium)/i.test(planValue);
}

export function hasPremiumAccessFromMetadata(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false;

  const explicitValue = metadata.shortsideIsPremium;
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  const tierValue = metadata.shortsideTier;
  if (typeof tierValue === "string" && tierValue.toLowerCase() === "premium") {
    return true;
  }

  const planValue = metadata.shortsidePlan;
  return typeof planValue === "string" && /premium/i.test(planValue);
}

export function hasProPlotAccess(
  userId: string | null | undefined,
  metadata?: unknown
): boolean {
  if (hasPreviewFeatureUnlock()) return true;
  if (!userId) return false;
  const allowlistedUserIds = getProPlotAllowlist();
  if (allowlistedUserIds.has(userId)) return true;
  if (getPremiumAllowlist().has(userId)) return true;
  return hasProAccessFromMetadata(metadata);
}

export function hasPremiumAccess(
  userId: string | null | undefined,
  metadata?: unknown
): boolean {
  if (hasPreviewFeatureUnlock()) return true;
  if (!userId) return false;
  const allowlistedUserIds = getPremiumAllowlist();
  if (allowlistedUserIds.has(userId)) return true;
  if (getProPlotAllowlist().has(userId)) return true;
  return hasPremiumAccessFromMetadata(metadata);
}

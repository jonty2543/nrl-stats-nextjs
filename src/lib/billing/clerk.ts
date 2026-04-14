import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { hasEntitledSubscriptionStatus } from "@/lib/access/pro-access";
import { resolveShortSideTierFromPriceId } from "@/lib/billing/stripe";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toIsoTimestamp(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export function getPrimaryEmailAddress(
  user: {
    primaryEmailAddress?: { emailAddress?: string | null } | null;
    emailAddresses?: Array<{ emailAddress?: string | null }>;
  } | null | undefined
): string | null {
  const primaryEmail = user?.primaryEmailAddress?.emailAddress?.trim();
  if (primaryEmail) return primaryEmail;

  const fallbackEmail = user?.emailAddresses?.[0]?.emailAddress?.trim();
  return fallbackEmail || null;
}

export function getStripeCustomerIdFromPrivateMetadata(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata.stripeCustomerId;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function setStripeCustomerIdForUser(
  clerkUserId: string,
  stripeCustomerId: string
): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);

  await client.users.updateUserMetadata(clerkUserId, {
    privateMetadata: {
      ...(isRecord(user.privateMetadata) ? user.privateMetadata : {}),
      stripeCustomerId,
    },
  });
}

interface StripeSubscriptionSyncPayload {
  clerkUserId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string | null;
  priceId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export async function syncStripeSubscriptionToClerk(
  payload: StripeSubscriptionSyncPayload
): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(payload.clerkUserId);
  const publicMetadata = isRecord(user.publicMetadata) ? user.publicMetadata : {};
  const privateMetadata = isRecord(user.privateMetadata) ? user.privateMetadata : {};
  const tier = resolveShortSideTierFromPriceId(payload.priceId);
  const hasActiveSubscription = hasEntitledSubscriptionStatus(payload.status);

  await client.users.updateUserMetadata(payload.clerkUserId, {
    publicMetadata: {
      ...publicMetadata,
      shortsideIsPro: hasActiveSubscription,
      shortsideIsPremium: hasActiveSubscription && tier === "premium",
      shortsideSubscriptionStatus: payload.status,
      shortsideTier: tier,
      shortsidePlan: payload.priceId,
      shortsideCurrentPeriodEnd: toIsoTimestamp(payload.currentPeriodEnd),
      shortsideCancelAtPeriodEnd: payload.cancelAtPeriodEnd,
    },
    privateMetadata: {
      ...privateMetadata,
      stripeCustomerId: payload.customerId ?? privateMetadata.stripeCustomerId ?? null,
      shortsideStripeSubscriptionId: payload.subscriptionId,
    },
  });
}

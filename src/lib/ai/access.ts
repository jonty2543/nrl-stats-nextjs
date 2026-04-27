import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  hasEntitledSubscriptionStatus,
  hasPremiumAccess,
  hasProPlotAccess,
} from "@/lib/access/pro-access";
import { getStripe, resolveShortSideTierFromPriceId } from "@/lib/billing/stripe";

export type AiPlan = "free" | "pro" | "premium";
export type AiReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export const AI_CHAT_QUOTAS: Record<AiPlan, { limit: number | null; periodDays: number; periodLabel: string }> = {
  free: { limit: 1, periodDays: 1, periodLabel: "day" },
  pro: { limit: 50, periodDays: 7, periodLabel: "week" },
  premium: { limit: 200, periodDays: 7, periodLabel: "week" },
};

const AI_REASONING_EFFORTS: Record<AiPlan, AiReasoningEffort> = {
  free: "medium",
  pro: "medium",
  premium: "high",
};

export interface AiAccessState {
  plan: AiPlan;
  chatLimit: number | null;
  chatQuotaPeriodDays: number;
  chatQuotaPeriodLabel: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringMetadataValue(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function hasAiProDataAccess(plan: AiPlan): boolean {
  return plan === "pro" || plan === "premium";
}

export function hasAiPlotAccess(plan: AiPlan): boolean {
  return plan === "pro" || plan === "premium";
}

export function hasAiPremiumDataAccess(plan: AiPlan): boolean {
  return plan === "premium";
}

export function hasAiBettingModelAccess(plan: AiPlan): boolean {
  return plan === "premium";
}

export function canViewAiRuntimeMetadata(plan: AiPlan): boolean {
  return plan === "premium";
}

export function getAiReasoningEffortForPlan(plan: AiPlan): AiReasoningEffort {
  return AI_REASONING_EFFORTS[plan];
}

function resolveAiPlan(userId: string | null | undefined, metadata?: unknown): AiPlan {
  if (hasPremiumAccess(userId, metadata)) return "premium";
  if (hasProPlotAccess(userId, metadata)) return "pro";
  return "free";
}

async function resolveAiPlanFromStripe(privateMetadata: unknown): Promise<AiPlan | null> {
  const subscriptionId = getStringMetadataValue(privateMetadata, "shortsideStripeSubscriptionId");

  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    if (hasEntitledSubscriptionStatus(subscription.status)) {
      const tier = resolveShortSideTierFromPriceId(subscription.items.data[0]?.price.id ?? null);
      return tier ?? "pro";
    }
  }

  const customerId = getStringMetadataValue(privateMetadata, "stripeCustomerId");
  if (!customerId) {
    return null;
  }

  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  for (const subscription of subscriptions.data) {
    if (!hasEntitledSubscriptionStatus(subscription.status)) {
      continue;
    }

    const tier = resolveShortSideTierFromPriceId(subscription.items.data[0]?.price.id ?? null);
    return tier ?? "pro";
  }

  return null;
}

export async function getServerAiAccess(
  userId: string | null | undefined
): Promise<AiAccessState> {
  if (!userId) {
    return {
      plan: "free",
      chatLimit: AI_CHAT_QUOTAS.free.limit,
      chatQuotaPeriodDays: AI_CHAT_QUOTAS.free.periodDays,
      chatQuotaPeriodLabel: AI_CHAT_QUOTAS.free.periodLabel,
    };
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    let plan = resolveAiPlan(userId, user.publicMetadata);
    if (plan === "free") {
      try {
        plan = (await resolveAiPlanFromStripe(user.privateMetadata)) ?? plan;
      } catch (error) {
        console.warn("Unable to resolve Stripe-backed AI access for user.", error);
      }
    }
    return {
      plan,
      chatLimit: AI_CHAT_QUOTAS[plan].limit,
      chatQuotaPeriodDays: AI_CHAT_QUOTAS[plan].periodDays,
      chatQuotaPeriodLabel: AI_CHAT_QUOTAS[plan].periodLabel,
    };
  } catch (error) {
    console.warn("Unable to resolve Clerk user for AI access check.", error);
    const plan = resolveAiPlan(userId);
    return {
      plan,
      chatLimit: AI_CHAT_QUOTAS[plan].limit,
      chatQuotaPeriodDays: AI_CHAT_QUOTAS[plan].periodDays,
      chatQuotaPeriodLabel: AI_CHAT_QUOTAS[plan].periodLabel,
    };
  }
}

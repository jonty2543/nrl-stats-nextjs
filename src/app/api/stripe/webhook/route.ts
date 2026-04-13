import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { setStripeCustomerIdForUser, syncStripeSubscriptionToClerk } from "@/lib/billing/clerk";
import { getStripe, getStripeWebhookSecret } from "@/lib/billing/stripe";

export const runtime = "nodejs";

function getExpandableId(
  value: string | Stripe.Customer | Stripe.Subscription | Stripe.DeletedCustomer | null
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if ("id" in value && typeof value.id === "string") return value.id;
  return null;
}

function getSubscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price.id ?? null;
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const values = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return null;
  return Math.max(...values);
}

async function getClerkUserIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;

  const customer = await getStripe().customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) {
    return null;
  }

  const clerkUserId = customer.metadata?.clerkUserId?.trim();
  return clerkUserId || null;
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId = getExpandableId(subscription.customer);
  const clerkUserId =
    subscription.metadata?.clerkUserId?.trim() || (await getClerkUserIdFromCustomer(customerId));

  if (!clerkUserId) {
    console.warn(
      "Stripe webhook received a subscription without a linked Clerk user.",
      subscription.id
    );
    return;
  }

  await syncStripeSubscriptionToClerk({
    clerkUserId,
    customerId,
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: getSubscriptionPriceId(subscription),
    currentPeriodEnd: getSubscriptionCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function syncCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const clerkUserId =
    session.client_reference_id?.trim() || session.metadata?.clerkUserId?.trim() || null;
  const customerId = getExpandableId(session.customer);

  if (!clerkUserId) return;

  if (customerId) {
    await setStripeCustomerIdForUser(clerkUserId, customerId);
  }

  const subscriptionId = getExpandableId(session.subscription);
  if (!subscriptionId) return;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret()
    );
  } catch (error) {
    console.error("Unable to verify Stripe webhook signature:", error);
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await syncCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("Error processing Stripe webhook event:", event.type, error);
    return NextResponse.json(
      { error: "Stripe webhook processing failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

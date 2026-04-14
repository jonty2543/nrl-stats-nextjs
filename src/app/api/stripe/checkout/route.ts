import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getPrimaryEmailAddress, getStripeCustomerIdFromPrivateMetadata, setStripeCustomerIdForUser } from "@/lib/billing/clerk";
import { getRequestBaseUrl, getStripe, getStripeProPriceId } from "@/lib/billing/stripe";

export const runtime = "nodejs";

async function resolveStripeCustomerId(
  clerkUserId: string,
  email: string | null,
  existingCustomerId: string | null
): Promise<string> {
  const stripe = getStripe();

  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.update(existingCustomerId, {
        email: email ?? undefined,
        metadata: { clerkUserId },
      });
      return customer.id;
    } catch (error) {
      console.warn("Unable to reuse Stripe customer; creating a new customer.", error);
    }
  }

  if (email) {
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    const matchedCustomer = existingCustomers.data[0];
    if (matchedCustomer) {
      await stripe.customers.update(matchedCustomer.id, {
        email,
        metadata: {
          ...matchedCustomer.metadata,
          clerkUserId,
        },
      });
      return matchedCustomer.id;
    }
  }

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { clerkUserId },
  });

  return customer.id;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = getRequestBaseUrl(request);
    const email = getPrimaryEmailAddress(user);
    const customerId = await resolveStripeCustomerId(
      userId,
      email,
      getStripeCustomerIdFromPrivateMetadata(user.privateMetadata)
    );

    await setStripeCustomerIdForUser(userId, customerId);

    const proPriceId = await getStripeProPriceId();
    const billingReturnBaseUrl = `${baseUrl}/dashboard/billing/return`;

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      allow_promotion_codes: true,
      line_items: [
        {
          price: proPriceId,
          quantity: 1,
        },
      ],
      metadata: {
        clerkUserId: userId,
      },
      subscription_data: {
        metadata: {
          clerkUserId: userId,
        },
      },
      success_url: `${billingReturnBaseUrl}?billing=success`,
      cancel_url: `${billingReturnBaseUrl}?billing=cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Unable to create a Stripe Checkout session."
        : error instanceof Error
          ? error.message
          : "Unable to create a Stripe Checkout session.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

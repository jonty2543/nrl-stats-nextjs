import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStripeCustomerIdFromPrivateMetadata } from "@/lib/billing/clerk";
import { getRequestBaseUrl, getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

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
    const customerId = getStripeCustomerIdFromPrivateMetadata(user?.privateMetadata);

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer is linked to this user." },
        { status: 409 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getRequestBaseUrl(request)}/dashboard/billing/return`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating Stripe billing portal session:", error);
    return NextResponse.json(
      { error: "Unable to open the Stripe billing portal." },
      { status: 500 }
    );
  }
}

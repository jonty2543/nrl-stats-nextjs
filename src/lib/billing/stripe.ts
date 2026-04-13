import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return stripeSingleton;
}

export function getStripeWebhookSecret(): string {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

async function resolvePriceIdFromEnv(...names: string[]): Promise<string> {
  const configuredValue = names
    .map((name) => process.env[name]?.trim())
    .find((value): value is string => Boolean(value));

  if (!configuredValue) {
    throw new Error(`Missing required environment variable: ${names[0]}`);
  }

  if (configuredValue.startsWith("price_")) {
    return configuredValue;
  }

  if (!configuredValue.startsWith("prod_")) {
    throw new Error(
      `Expected Stripe price ID for ${names.join(" or ")}, received: ${configuredValue}`
    );
  }

  const product = await getStripe().products.retrieve(configuredValue);
  const defaultPrice = product.default_price;

  if (typeof defaultPrice === "string" && defaultPrice.startsWith("price_")) {
    return defaultPrice;
  }

  if (defaultPrice && typeof defaultPrice === "object" && "id" in defaultPrice) {
    const priceId = defaultPrice.id;
    if (typeof priceId === "string" && priceId.startsWith("price_")) {
      return priceId;
    }
  }

  throw new Error(
    `Stripe product ${configuredValue} does not have a default price. Set ${names[0]} to a price_ ID or configure a default price on the product.`
  );
}

export async function getStripeProPriceId(): Promise<string> {
  return resolvePriceIdFromEnv("STRIPE_PRICE_ID_PRO_MONTHLY", "STRIPE_PRICE_ID_PRO");
}

function getOptionalPriceIds(...names: string[]): string[] {
  return names
    .map((name) => process.env[name]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function getStripePremiumPriceIds(): string[] {
  return getOptionalPriceIds(
    "STRIPE_PRICE_ID_PREMIUM_MONTHLY",
    "STRIPE_PRICE_ID_PREMIUM",
    "STRIPE_PRICE_ID_PREMIUM_YEARLY"
  );
}

export function resolveShortSideTierFromPriceId(priceId: string | null | undefined): "premium" | "pro" | null {
  if (!priceId) return null;

  if (getStripePremiumPriceIds().includes(priceId)) {
    return "premium";
  }

  const proPriceIds = getOptionalPriceIds("STRIPE_PRICE_ID_PRO_MONTHLY", "STRIPE_PRICE_ID_PRO");
  if (proPriceIds.includes(priceId)) {
    return "pro";
  }

  if (/premium/i.test(priceId)) return "premium";
  if (/pro/i.test(priceId)) return "pro";
  return null;
}

export function getRequestBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const originHeader = request.headers.get("origin")?.trim();
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      return `${originUrl.protocol}//${originUrl.host}`;
    } catch {
      // Ignore malformed Origin headers and fall through to forwarded/request URLs.
    }
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return `${url.protocol}//${url.host}`;
}

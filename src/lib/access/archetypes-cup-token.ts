import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_PURPOSE = "archetypes-cup";

function getSigningSecret(): string | null {
  return process.env.CLERK_SECRET_KEY ?? null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createArchetypesCupToken(): string | null {
  const secret = getSigningSecret();
  if (!secret) return null;

  const payload = Buffer.from(
    JSON.stringify({ purpose: TOKEN_PURPOSE, expiresAt: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function isValidArchetypesCupToken(token: string | null): boolean {
  const secret = getSigningSecret();
  if (!token || !secret) return false;

  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return false;

  const expectedSignature = sign(payload, secret);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      purpose?: unknown;
      expiresAt?: unknown;
    };
    return value.purpose === TOKEN_PURPOSE && typeof value.expiresAt === "number" && value.expiresAt > Date.now();
  } catch {
    return false;
  }
}

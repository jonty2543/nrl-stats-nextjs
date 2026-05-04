import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { hasPremiumAccess, hasProPlotAccess, isLocalhostName } from "@/lib/access/pro-access";

async function hasLocalhostAccess(): Promise<boolean> {
  const headerStore = await headers();
  const host = headerStore.get("host")?.split(":")[0] ?? null;
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(":")[0] ?? null;
  return isLocalhostName(host) || isLocalhostName(forwardedHost);
}

export async function getServerProPlotAccess(
  userId: string | null | undefined
): Promise<boolean> {
  if (await hasLocalhostAccess()) return true;
  if (!userId) return hasProPlotAccess(userId);
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return hasProPlotAccess(userId, user.publicMetadata);
  } catch (error) {
    console.warn("Unable to resolve Clerk user for Pro access check.", error);
    return hasProPlotAccess(userId);
  }
}

export async function getServerPremiumAccess(
  userId: string | null | undefined
): Promise<boolean> {
  if (await hasLocalhostAccess()) return true;
  if (!userId) return hasPremiumAccess(userId);
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return hasPremiumAccess(userId, user.publicMetadata);
  } catch (error) {
    console.warn("Unable to resolve Clerk user for Premium access check.", error);
    return hasPremiumAccess(userId);
  }
}

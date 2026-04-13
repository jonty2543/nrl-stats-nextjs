import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { hasPremiumAccess, hasProPlotAccess } from "@/lib/access/pro-access";

export async function getServerProPlotAccess(
  userId: string | null | undefined
): Promise<boolean> {
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

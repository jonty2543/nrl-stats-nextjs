import { auth } from "@clerk/nextjs/server";
import { ArchetypesFrame } from "@/components/views/archetypes-frame";
import { createArchetypesCupToken } from "@/lib/access/archetypes-cup-token";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";

export const dynamic = "force-dynamic";

export default async function ArchetypesPage() {
  const { userId } = await auth();
  const canAccessCup = await getServerProPlotAccess(userId);

  return <ArchetypesFrame cupAccessToken={canAccessCup ? createArchetypesCupToken() : null} />;
}

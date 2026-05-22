import { auth } from "@clerk/nextjs/server"
import { MyTeamPage } from "@/components/views/my-team-page"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import { fetchFantasyCoachPlayersSnapshot, fetchFantasyPlayersSnapshot, fetchLineupsProjectionsByPlayerId } from "@/lib/fantasy/nrl"
import { fetchOriginChances, fetchPlayerImages } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

export default async function MyTeamRoutePage() {
  const { userId } = await auth()
  const locked = !(await getServerProPlotAccess(userId))
  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, playerImages, draw2026Data, originChances] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchPlayerImages(),
    loadDraw2026Data().catch(() => null),
    fetchOriginChances(),
  ])

  return (
    <MyTeamPage
      fantasyPlayers={fantasyPlayers}
      fantasyCoachPlayers={fantasyCoachPlayers}
      lineupsProjections={lineupsProjections}
      playerImages={playerImages}
      draw2026Data={draw2026Data}
      originChances={originChances}
      locked={locked}
    />
  )
}

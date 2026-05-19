import { auth } from "@clerk/nextjs/server"
import { MyTeamPage } from "@/components/views/my-team-page"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { fetchFantasyCoachPlayersSnapshot, fetchFantasyPlayersSnapshot, fetchLineupsProjectionsByPlayerId } from "@/lib/fantasy/nrl"
import { fetchPlayerImages } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

export default async function MyTeamRoutePage() {
  const { userId } = await auth()
  const locked = !(await getServerProPlotAccess(userId))
  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, playerImages] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchPlayerImages(),
  ])

  return (
    <MyTeamPage
      fantasyPlayers={fantasyPlayers}
      fantasyCoachPlayers={fantasyCoachPlayers}
      lineupsProjections={lineupsProjections}
      playerImages={playerImages}
      locked={locked}
    />
  )
}

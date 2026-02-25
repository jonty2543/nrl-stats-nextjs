import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { isAccessibleSeason } from "@/lib/access/season-access"
import { fetchFantasyPlayersSnapshot } from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchAvailableYears,
  fetchFantasyPlayerStatsAllYears,
  fetchPlayerImages,
  fetchTeamLogos,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

interface FantasyPlayerPageProps {
  params: Promise<{
    playerSlug: string
  }>
}

export default async function FantasyPlayerPage({ params }: FantasyPlayerPageProps) {
  const { playerSlug } = await params
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)

  const [fantasyPlayers, availableYears, draw2026Data, playerImages, teamLogos] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchAvailableYears(),
    loadDraw2026Data(),
    fetchPlayerImages(),
    fetchTeamLogos(),
  ])

  const selectedPlayer = fantasyPlayers.find(
    (player) => fantasyPlayerSlug(player.name) === decodeURIComponent(playerSlug)
  )

  if (!selectedPlayer) {
    notFound()
  }

  const unlockedYears = canAccessLoginSeason
    ? availableYears
    : availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
  const defaultYear = unlockedYears.includes("2025") ? "2025" : unlockedYears[0] ?? ""
  const initialPlayerStats = await fetchFantasyPlayerStatsAllYears(selectedPlayer.name)

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/dashboard/fantasy"
          className="inline-flex items-center rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:text-nrl-accent"
        >
          Back to Fantasy Ownership
        </Link>
      </div>

      <FantasyDashboard
        fantasyPlayers={fantasyPlayers}
        availableYears={unlockedYears}
        defaultYear={defaultYear}
        initialPlayerStats={initialPlayerStats}
        canAccessLoginSeason={canAccessLoginSeason}
        preloadedPlayerAllYears
        draw2026Data={draw2026Data}
        playerImages={playerImages}
        teamLogos={teamLogos}
        initialSelectedFantasyName={selectedPlayer.name}
        showOwnedCards={false}
        playerRouteBasePath="/dashboard/fantasy"
      />
    </div>
  )
}

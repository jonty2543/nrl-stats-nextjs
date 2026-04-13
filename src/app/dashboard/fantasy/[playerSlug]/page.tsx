import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { isAccessibleSeason } from "@/lib/access/season-access"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
} from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchAvailableYears,
  fetchFantasyPlayerStatsAllYears,
  fetchPlayerImages,
  fetchTeamLogos,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

interface FantasyPlayerPageProps {
  params: Promise<{
    playerSlug: string
  }>
}

export default async function FantasyPlayerPage({ params }: FantasyPlayerPageProps) {
  const { playerSlug } = await params
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [fantasyPlayers, fantasyCoachPlayers, availableYears, draw2026Data, playerImages, teamLogos, ownershipBaselineSnapshot] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchAvailableYears(),
    loadDraw2026Data(),
    fetchPlayerImages(),
    fetchTeamLogos(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
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
  const initialYears = defaultRecentYears(
    unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  )
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
        fantasyCoachPlayers={fantasyCoachPlayers}
        availableYears={unlockedYears}
        defaultYears={initialYears}
        initialPlayerStats={initialPlayerStats}
        canAccessLoginSeason={canAccessLoginSeason}
        canBypassPlotGate={canBypassPlotGate}
        preloadedPlayerAllYears
        draw2026Data={draw2026Data}
        playerImages={playerImages}
        teamLogos={teamLogos}
        initialSelectedFantasyName={selectedPlayer.name}
        showOwnedCards={false}
        playerRouteBasePath="/dashboard/fantasy"
        ownershipBaselineSnapshot={ownershipBaselineSnapshot}
      />
    </div>
  )
}

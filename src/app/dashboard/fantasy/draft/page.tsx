import { FantasyDraftPricingPage } from "@/components/views/fantasy-draft-pricing-page"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import { fetchFantasyPlayersSnapshot } from "@/lib/fantasy/nrl"
import { fetchPlayerImages } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

async function fetchCoachProjectionsRaw(): Promise<unknown> {
  const response = await fetch("https://fantasy.nrl.com/data/nrl/coach/players.json", {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "shortside/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(`Coach projections fetch failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export default async function FantasyDraftPricingRoutePage() {
  const [playerImages, fantasyPlayers, coachProjectionsRaw, draw2026Data] = await Promise.all([
    fetchPlayerImages(),
    fetchFantasyPlayersSnapshot(),
    fetchCoachProjectionsRaw(),
    loadDraw2026Data().catch(() => null),
  ])

  return (
    <FantasyDraftPricingPage
      playerImages={playerImages}
      fantasyPlayers={fantasyPlayers}
      coachProjectionsRaw={coachProjectionsRaw}
      draw2026Data={draw2026Data}
    />
  )
}

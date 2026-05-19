import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerSupabaseClient } from "@/lib/supabase/client"

type SquadRole = "starter" | "interchange" | "emergency"
type PlayerStatus = "uncertain" | "injured" | "suspended" | null

interface MyTeamPlayer {
  playerId: number | null
  displayName: string
  slot: string
  squadRole: SquadRole
  benchOrder: number | null
  isCaptain: boolean
  isViceCaptain: boolean
  isBye: boolean
  status: PlayerStatus
}

interface SavedMyTeam {
  teamName: string
  round: string
  players: MyTeamPlayer[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSquadRole(value: unknown): value is SquadRole {
  return value === "starter" || value === "interchange" || value === "emergency"
}

function isPlayerStatus(value: unknown): value is PlayerStatus {
  return value === null || value === "uncertain" || value === "injured" || value === "suspended"
}

function isMyTeamPlayer(value: unknown): value is MyTeamPlayer {
  if (!isRecord(value)) return false
  return (
    (typeof value.playerId === "number" || value.playerId === null) &&
    typeof value.displayName === "string" &&
    typeof value.slot === "string" &&
    isSquadRole(value.squadRole) &&
    (typeof value.benchOrder === "number" || value.benchOrder === null) &&
    typeof value.isCaptain === "boolean" &&
    typeof value.isViceCaptain === "boolean" &&
    typeof value.isBye === "boolean" &&
    isPlayerStatus(value.status)
  )
}

function isSavedMyTeam(value: unknown): value is SavedMyTeam {
  if (!isRecord(value)) return false
  return (
    typeof value.teamName === "string" &&
    typeof value.round === "string" &&
    Array.isArray(value.players) &&
    value.players.every(isMyTeamPlayer)
  )
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .schema("shortside")
    .from("user_my_teams")
    .select("payload, updated_at")
    .eq("clerk_user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("Error fetching My Team:", error)
    return NextResponse.json({ error: "Failed to fetch My Team", details: error.message }, { status: 500 })
  }

  return NextResponse.json({
    team: isSavedMyTeam(data?.payload) ? data.payload : null,
    updatedAt: data?.updated_at ?? null,
  })
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const team = isRecord(body) ? body.team : undefined
  if (!isSavedMyTeam(team)) {
    return NextResponse.json({ error: "Body 'team' must be a valid My Team payload" }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .schema("shortside")
    .from("user_my_teams")
    .upsert(
      {
        clerk_user_id: userId,
        payload: team,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id" },
    )

  if (error) {
    console.error("Error saving My Team:", error)
    return NextResponse.json({ error: "Failed to save My Team", details: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .schema("shortside")
    .from("user_my_teams")
    .delete()
    .eq("clerk_user_id", userId)

  if (error) {
    console.error("Error clearing My Team:", error)
    return NextResponse.json({ error: "Failed to clear My Team", details: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

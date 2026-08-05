import { NextResponse } from "next/server"
import { fetchFantasyPlayerCardSummaries } from "@/lib/supabase/queries"

export async function GET() {
  const rows = await fetchFantasyPlayerCardSummaries()
  return NextResponse.json(rows)
}

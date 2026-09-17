import { NextResponse } from "next/server";
import { fetchTeamLogos } from "@/lib/supabase/queries";

export async function GET() {
  const logos = await fetchTeamLogos();
  if (!Object.keys(logos).length) {
    return NextResponse.json({ error: "Team logos are temporarily unavailable" }, { status: 503 });
  }
  return NextResponse.json(logos, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const getPlayerAges = unstable_cache(async () => {
  const client = createServerSupabaseClient("nrl");
  const ages: Record<string, number> = {};
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("player_ages")
      .select("player_key,year,age_at_july_1")
      .not("age_at_july_1", "is", null)
      .order("player_key").order("year")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data) {
      ages[`${row.player_key.trim().toLowerCase()} (${row.year})`] = row.age_at_july_1;
    }
    if (data.length < pageSize) break;
  }
  return ages;
}, ["archetype-player-ages"], { revalidate: 3600 });

export async function GET() {
  try {
    return NextResponse.json(await getPlayerAges());
  } catch (error) {
    console.error("Failed to load archetype player ages:", error);
    return NextResponse.json({ error: "Player ages unavailable" }, { status: 503 });
  }
}

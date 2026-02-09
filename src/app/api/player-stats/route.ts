import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerStats } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const yearsParam = searchParams.get("years");
    const years = yearsParam ? yearsParam.split(",") : undefined;

    const data = await fetchPlayerStats(years);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching player stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch player stats" },
      { status: 500 }
    );
  }
}

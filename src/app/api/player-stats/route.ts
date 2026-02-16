import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchAvailableYears, fetchPlayerStats } from "@/lib/supabase/queries";
import { isAccessibleSeason } from "@/lib/access/season-access";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    const canAccessLoginSeason = Boolean(userId);
    const { searchParams } = request.nextUrl;
    const yearsParam = searchParams.get("years");
    const requestedYears = yearsParam
      ? yearsParam
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : null;

    const allowedYears = requestedYears
      ? requestedYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
      : (await fetchAvailableYears()).filter((year) =>
          isAccessibleSeason(year, canAccessLoginSeason)
        );

    if (allowedYears.length === 0) {
      return NextResponse.json([]);
    }

    const data = await fetchPlayerStats(allowedYears);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching player stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch player stats" },
      { status: 500 }
    );
  }
}

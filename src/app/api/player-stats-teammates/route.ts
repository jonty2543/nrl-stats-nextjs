import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAccessibleSeason } from "@/lib/access/season-access";
import { fetchAvailableYears, fetchTeammateLookupRows } from "@/lib/supabase/queries";

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

    const teammateRows = await fetchTeammateLookupRows(allowedYears);
    return NextResponse.json(teammateRows);
  } catch (error) {
    console.error("Error fetching teammate lookup rows:", error);
    return NextResponse.json(
      { error: "Failed to fetch teammate lookup rows" },
      { status: 500 }
    );
  }
}

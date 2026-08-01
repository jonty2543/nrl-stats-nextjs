import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { isAccessibleSeason } from "@/lib/access/season-access";
import { fetchAvailableYears, fetchPostMatchTeamMetricsWithRdr } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    const canAccessLoginSeason = Boolean(userId);
    const canAccessProSeason = await getServerProPlotAccess(userId);
    if (!canAccessProSeason) {
      return NextResponse.json({ error: "Pro access required" }, { status: 403 });
    }
    const yearsParam = request.nextUrl.searchParams.get("years");
    const requestedYears = yearsParam
      ? yearsParam.split(",").map((value) => value.trim()).filter(Boolean)
      : null;
    const allowedYears = requestedYears
      ? requestedYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason, "stats", canAccessProSeason))
      : (await fetchAvailableYears()).filter((year) => isAccessibleSeason(year, canAccessLoginSeason, "stats", canAccessProSeason));

    if (allowedYears.length === 0) return NextResponse.json([]);
    return NextResponse.json(await fetchPostMatchTeamMetricsWithRdr(allowedYears));
  } catch (error) {
    console.error("Error fetching post-match team metrics:", error);
    return NextResponse.json({ error: "Failed to fetch post-match team metrics" }, { status: 500 });
  }
}

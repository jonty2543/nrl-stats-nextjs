import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";

type StakingMode = "percentage" | "targetProfit" | "kelly";

interface UserBettingPreferencesRow {
  clerk_user_id: string;
  staking_mode: StakingMode;
  bankroll: number;
  percentage_stake_pct: number;
  target_profit_pct: number;
  kelly_scale: number;
  max_edge: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStakingMode(value: unknown): value is StakingMode {
  return value === "percentage" || value === "targetProfit" || value === "kelly";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  return isFiniteNumber(value) ? clamp(value, min, max) : fallback;
}

function mapRowToResponse(row: UserBettingPreferencesRow | null) {
  if (!row) return null;
  return {
    stakingMode: row.staking_mode,
    bankroll: row.bankroll,
    percentageStakePct: row.percentage_stake_pct,
    targetProfitPct: row.target_profit_pct,
    kellyScale: row.kelly_scale,
    maxEdge: row.max_edge,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("user_betting_preferences")
    .select("clerk_user_id, staking_mode, bankroll, percentage_stake_pct, target_profit_pct, kelly_scale, max_edge")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch betting preferences", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ preferences: mapRowToResponse((data as UserBettingPreferencesRow | null) ?? null) });
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const stakingMode = payload.stakingMode;
  if (!isStakingMode(stakingMode)) {
    return NextResponse.json({ error: "stakingMode must be percentage, targetProfit, or kelly" }, { status: 400 });
  }

  const row = {
    clerk_user_id: userId,
    staking_mode: stakingMode,
    bankroll: sanitizeNumber(payload.bankroll, 1000, 0, 1_000_000_000),
    percentage_stake_pct: sanitizeNumber(payload.percentageStakePct, 2, 0, 100),
    target_profit_pct: sanitizeNumber(payload.targetProfitPct, 2, 0, 100),
    kelly_scale: sanitizeNumber(payload.kellyScale, 0.5, 0, 1),
    max_edge: sanitizeNumber(payload.maxEdge, 0.06, 0, 1),
    updated_at: new Date().toISOString(),
  };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .schema("shortside")
    .from("user_betting_preferences")
    .upsert(row, { onConflict: "clerk_user_id" });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save betting preferences", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

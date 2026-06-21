import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const INTEREST_OPTIONS = new Set(["Fantasy", "Draft", "Betting", "Lineups", "Stats"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const rating = body.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be an integer from 1 to 5" }, { status: 400 });
  }

  const interest = cleanString(body.interest, 40);
  if (!interest || !INTEREST_OPTIONS.has(interest)) {
    return NextResponse.json({ error: "Interest must be Fantasy, Draft, Betting, Lineups, or Stats" }, { status: 400 });
  }

  const changeRequest = cleanString(body.changeRequest, 1000);
  const path = cleanString(body.path, 240);
  const { userId } = await auth();

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .schema("shortside")
    .from("user_feedback")
    .insert([
      {
        clerk_user_id: userId,
        rating,
        interest,
        change_request: changeRequest,
        path,
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        created_at: new Date().toISOString(),
      },
    ]);

  if (error) {
    return NextResponse.json(
      { error: "Failed to save feedback", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

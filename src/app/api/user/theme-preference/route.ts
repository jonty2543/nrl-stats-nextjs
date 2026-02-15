import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";

type AppTheme = "dark" | "light";

function isTheme(value: unknown): value is AppTheme {
  return value === "dark" || value === "light";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("user_preferences")
    .select("theme")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching theme preference:", error);
    return NextResponse.json(
      { error: "Failed to fetch theme preference", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ theme: isTheme(data?.theme) ? data.theme : null });
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

  const theme =
    body && typeof body === "object" && "theme" in body
      ? (body as { theme?: unknown }).theme
      : undefined;

  if (!isTheme(theme)) {
    return NextResponse.json(
      { error: "Theme must be 'dark' or 'light'" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .schema("shortside")
    .from("user_preferences")
    .upsert(
      {
        clerk_user_id: userId,
        theme,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id" }
    );

  if (error) {
    console.error("Error saving theme preference:", error);
    return NextResponse.json(
      { error: "Failed to save theme preference", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

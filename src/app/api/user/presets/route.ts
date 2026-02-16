import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";

type PresetScope = "player" | "team";

function isPresetScope(value: unknown): value is PresetScope {
  return value === "player" || value === "team";
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopeParam = request.nextUrl.searchParams.get("scope");
  if (!isPresetScope(scopeParam)) {
    return NextResponse.json(
      { error: "Query param 'scope' must be 'player' or 'team'" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("saved_presets")
    .select("id, name, payload, updated_at")
    .eq("clerk_user_id", userId)
    .eq("scope", scopeParam)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching presets:", error);
    return NextResponse.json(
      { error: "Failed to fetch presets", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ presets: data ?? [] });
}

export async function POST(request: NextRequest) {
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

  const scope =
    isJsonObject(body) && "scope" in body
      ? (body as { scope?: unknown }).scope
      : undefined;
  const name =
    isJsonObject(body) && "name" in body
      ? (body as { name?: unknown }).name
      : undefined;
  const payload =
    isJsonObject(body) && "payload" in body
      ? (body as { payload?: unknown }).payload
      : undefined;

  if (!isPresetScope(scope)) {
    return NextResponse.json(
      { error: "Body 'scope' must be 'player' or 'team'" },
      { status: 400 }
    );
  }

  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 60) {
    return NextResponse.json(
      { error: "Body 'name' must be 1-60 characters" },
      { status: 400 }
    );
  }

  if (!isJsonObject(payload)) {
    return NextResponse.json(
      { error: "Body 'payload' must be an object" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("saved_presets")
    .upsert(
      {
        clerk_user_id: userId,
        scope,
        name: name.trim(),
        payload,
      },
      { onConflict: "clerk_user_id,scope,name" }
    )
    .select("id, name, payload, updated_at")
    .single();

  if (error) {
    console.error("Error saving preset:", error);
    return NextResponse.json(
      { error: "Failed to save preset", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ preset: data });
}

export async function DELETE(request: NextRequest) {
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

  const id =
    isJsonObject(body) && "id" in body ? (body as { id?: unknown }).id : undefined;

  if (typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { error: "Body 'id' must be a non-empty string" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .schema("shortside")
    .from("saved_presets")
    .delete()
    .eq("id", id)
    .eq("clerk_user_id", userId);

  if (error) {
    console.error("Error deleting preset:", error);
    return NextResponse.json(
      { error: "Failed to delete preset", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}


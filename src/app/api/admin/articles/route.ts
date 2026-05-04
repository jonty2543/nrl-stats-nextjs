import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ARTICLE_SELECT, isArticleAdmin, isMissingArticlesTableError, mapArticle } from "@/lib/articles";
import { createServerSupabaseClient } from "@/lib/supabase/client";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;

  if (!isArticleAdmin(userId, user?.publicMetadata)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        ...(process.env.NODE_ENV === "development"
          ? {
              debug: {
                userId,
                publicMetadata: user?.publicMetadata ?? null,
                adminUserIds: process.env.SHORTSIDE_ADMIN_USER_IDS ?? null,
                premiumUserIds: process.env.PREMIUM_UNLOCK_USER_IDS ?? null,
                proUserIds: process.env.PRO_PLOT_UNLOCK_USER_IDS ?? null,
              },
            }
          : {}),
      },
      { status: 401 }
    );
  }

  const supabase = createServerSupabaseClient("shortside");
  const { data, error, count } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT, { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingArticlesTableError(error)) {
      return NextResponse.json({ isAdmin: true, pendingCount: 0, pendingArticles: [] });
    }

    console.error("Error fetching pending article count:", error);
    return NextResponse.json({ error: "Failed to fetch pending article count.", details: error.message }, { status: 500 });
  }

  return NextResponse.json({
    isAdmin: true,
    pendingCount: count ?? 0,
    pendingArticles: ((data ?? []) as Parameters<typeof mapArticle>[0][]).map(mapArticle),
  });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;

  if (!isArticleAdmin(userId, user?.publicMetadata)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isJsonObject(body)) {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;

  if (!id || !status) {
    return NextResponse.json({ error: "Article id and valid status are required." }, { status: 400 });
  }

  const updates =
    status === "approved"
      ? { status, approved_at: new Date().toISOString(), approved_by: userId, rejection_reason: null }
      : { status, approved_at: null, approved_by: null, rejection_reason: "Not approved for publication." };

  const supabase = createServerSupabaseClient("shortside");
  const { error } = await supabase.from("articles").update(updates).eq("id", id).eq("status", "pending");

  if (error) {
    console.error("Error moderating article:", error);
    return NextResponse.json({ error: "Failed to update article.", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

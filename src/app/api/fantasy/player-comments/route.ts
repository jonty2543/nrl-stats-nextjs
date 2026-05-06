import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const MAX_COMMENT_LENGTH = 1000;
const COMMENTS_PAGE_SIZE = 100;

interface FantasyPlayerCommentRow {
  id: string;
  player_id: number;
  player_name: string;
  player_slug: string;
  clerk_user_id: string;
  display_name: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

interface CommentUserProfile {
  displayName: string | null;
  avatarUrl: string | null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeCommentBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_COMMENT_LENGTH) return null;
  return trimmed;
}

function normalizePlayerSlug(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function displayNameForUser(user: Awaited<ReturnType<typeof currentUser>>): string {
  return (
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    "Shortside user"
  );
}

function avatarUrlForUser(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return user?.imageUrl?.trim() || null;
}

async function loadCommentUserProfiles(userIds: string[]): Promise<Map<string, CommentUserProfile>> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const profiles = new Map<string, CommentUserProfile>();
  if (uniqueUserIds.length === 0) return profiles;

  try {
    const client = await clerkClient();
    await Promise.all(
      uniqueUserIds.map(async (id) => {
        try {
          const user = await client.users.getUser(id);
          profiles.set(id, {
            displayName: displayNameForUser(user),
            avatarUrl: avatarUrlForUser(user),
          });
        } catch {
          profiles.set(id, { displayName: null, avatarUrl: null });
        }
      })
    );
  } catch (error) {
    console.warn("Unable to load Clerk profiles for comments.", error);
  }

  return profiles;
}

function mapComment(
  row: FantasyPlayerCommentRow,
  userId: string | null,
  profiles: Map<string, CommentUserProfile> = new Map()
) {
  const profile = profiles.get(row.clerk_user_id) ?? null;
  return {
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name,
    playerSlug: row.player_slug,
    displayName: profile?.displayName || row.display_name || "Shortside user",
    avatarUrl: profile?.avatarUrl ?? null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canDelete: Boolean(userId && row.clerk_user_id === userId),
  };
}

export async function GET(request: NextRequest) {
  const playerSlug = normalizePlayerSlug(request.nextUrl.searchParams.get("playerSlug") ?? "");
  if (!playerSlug) {
    return NextResponse.json({ error: "Query param 'playerSlug' is required" }, { status: 400 });
  }

  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const { data, error, count } = await supabase
    .schema("shortside")
    .from("fantasy_player_comments")
    .select("id, player_id, player_name, player_slug, clerk_user_id, display_name, body, created_at, updated_at", {
      count: "exact",
    })
    .eq("player_slug", playerSlug)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(0, COMMENTS_PAGE_SIZE - 1);

  if (error) {
    console.error("Error fetching fantasy player comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments", details: error.message },
      { status: 500 }
    );
  }

  const rows = (data as FantasyPlayerCommentRow[] | null) ?? [];
  const profiles = await loadCommentUserProfiles(rows.map((row) => row.clerk_user_id));
  const comments = rows.map((row) => mapComment(row, userId, profiles));
  return NextResponse.json({ comments, count: count ?? comments.length });
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

  if (!isJsonObject(body)) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const playerSlug = typeof body.playerSlug === "string" ? normalizePlayerSlug(body.playerSlug) : "";
  if (!playerSlug) {
    return NextResponse.json({ error: "Body 'playerSlug' is required" }, { status: 400 });
  }

  const playerId = typeof body.playerId === "number" && Number.isInteger(body.playerId) ? body.playerId : null;
  const playerName = typeof body.playerName === "string" ? body.playerName.trim() : "";
  if (!playerId || playerId < 1 || !playerName || fantasyPlayerSlug(playerName) !== playerSlug) {
    return NextResponse.json({ error: "Invalid fantasy player" }, { status: 400 });
  }

  const commentBody = sanitizeCommentBody(body.body);
  if (!commentBody) {
    return NextResponse.json(
      { error: `Body 'body' must be 1-${MAX_COMMENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  const user = await currentUser();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("fantasy_player_comments")
    .insert({
      player_id: playerId,
      player_name: playerName,
      player_slug: playerSlug,
      clerk_user_id: userId,
      display_name: displayNameForUser(user),
      body: commentBody,
    })
    .select("id, player_id, player_name, player_slug, clerk_user_id, display_name, body, created_at, updated_at")
    .single();

  if (error) {
    console.error("Error saving fantasy player comment:", error);
    return NextResponse.json(
      { error: "Failed to save comment", details: error.message },
      { status: 500 }
    );
  }

  const profiles = new Map<string, CommentUserProfile>([
    [userId, { displayName: displayNameForUser(user), avatarUrl: avatarUrlForUser(user) }],
  ]);

  return NextResponse.json({ comment: mapComment(data as FantasyPlayerCommentRow, userId, profiles) }, { status: 201 });
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

  const id = isJsonObject(body) && typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Body 'id' is required" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .schema("shortside")
    .from("fantasy_player_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clerk_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error("Error deleting fantasy player comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

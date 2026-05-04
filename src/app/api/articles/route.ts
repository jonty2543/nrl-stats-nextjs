import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ARTICLE_IMAGE_BUCKET, ARTICLE_SELECT, isArticleAdmin, mapArticle, slugifyArticleTitle } from "@/lib/articles";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 12000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function displayNameForUser(user: Awaited<ReturnType<typeof currentUser>>): string {
  return (
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    "Shortside user"
  );
}

function safeFileExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function ensureArticlesTable(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { error } = await supabase.from("articles").select("id", { head: true }).limit(1);
  if (!error) return null;

  if (error.code === "PGRST205" || error.message.toLowerCase().includes("could not find the table")) {
    return "Articles database table is not set up yet. Run sql/shortside_articles.sql in Supabase, then try again.";
  }

  return `Unable to check articles table: ${error.message}`;
}

async function ensureArticleImageBucket(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data, error } = await supabase.storage.getBucket(ARTICLE_IMAGE_BUCKET);
  if (data && !error) return null;

  const missingBucket =
    error &&
    (error.message.toLowerCase().includes("not found") ||
      error.message.toLowerCase().includes("does not exist") ||
      "statusCode" in error && error.statusCode === "404");

  if (!missingBucket && error) {
    return `Unable to check article image bucket: ${error.message}`;
  }

  const { error: createError } = await supabase.storage.createBucket(ARTICLE_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
  });

  return createError ? `Unable to create article image bucket: ${createError.message}` : null;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const authorMode = String(formData.get("authorMode") ?? "profile");
  const isAnonymous = authorMode === "anonymous";
  const images = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (!title || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Title must be 1-${MAX_TITLE_LENGTH} characters.` }, { status: 400 });
  }

  if (!body || body.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Body must be 1-${MAX_BODY_LENGTH} characters.` }, { status: 400 });
  }

  if (images.length < 1 || images.length > 2) {
    return NextResponse.json({ error: "Upload 1 or 2 header images." }, { status: 400 });
  }

  for (const image of images) {
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json({ error: "Images must be JPEG, PNG or WebP." }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Each image must be 4MB or smaller." }, { status: 400 });
    }
  }

  const supabase = createServerSupabaseClient("shortside");
  const tableSetupError = await ensureArticlesTable(supabase);
  if (tableSetupError) {
    return NextResponse.json({ error: tableSetupError }, { status: 503 });
  }

  const bucketSetupError = await ensureArticleImageBucket(supabase);
  if (bucketSetupError) {
    return NextResponse.json({ error: bucketSetupError }, { status: 503 });
  }

  const imagePaths: string[] = [];

  for (const image of images) {
    const extension = safeFileExtension(image);
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(ARTICLE_IMAGE_BUCKET).upload(path, Buffer.from(await image.arrayBuffer()), {
      contentType: image.type,
      upsert: false,
    });

    if (error) {
      console.error("Error uploading article image:", error);
      return NextResponse.json({ error: "Failed to upload article image.", details: error.message }, { status: 500 });
    }

    imagePaths.push(path);
  }

  const user = await currentUser();
  const isAdmin = isArticleAdmin(userId, user?.publicMetadata);
  const postAsShortSide = !isAnonymous && isAdmin;
  const approvedAt = isAdmin ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("articles")
    .insert({
      clerk_user_id: userId,
      display_name: isAnonymous ? "Anonymous" : postAsShortSide ? "Short Side" : displayNameForUser(user),
      title,
      slug: `${slugifyArticleTitle(title)}-${crypto.randomUUID().slice(0, 8)}`,
      body,
      status: isAdmin ? "approved" : "pending",
      header_image_1: imagePaths[0] ?? null,
      header_image_2: imagePaths[1] ?? null,
      approved_at: approvedAt,
      approved_by: isAdmin ? userId : null,
    })
    .select(ARTICLE_SELECT)
    .single();

  if (error) {
    console.error("Error saving article:", error);
    return NextResponse.json({ error: "Failed to save article.", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: mapArticle(data), ok: true }, { status: 201 });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
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
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const articleBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "Article id is required." }, { status: 400 });
  }

  if (!title || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Title must be 1-${MAX_TITLE_LENGTH} characters.` }, { status: 400 });
  }

  if (!articleBody || articleBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `Body must be 1-${MAX_BODY_LENGTH} characters.` }, { status: 400 });
  }

  const user = await currentUser();
  const isAdmin = isArticleAdmin(userId, user?.publicMetadata);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient("shortside");
  const { data: article, error: fetchError } = await supabase
    .from("articles")
    .select("id, clerk_user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: "Failed to find article.", details: fetchError.message }, { status: 500 });
  }

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  if (article.clerk_user_id !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("articles")
    .update({ title, body: articleBody })
    .eq("id", id)
    .select(ARTICLE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update article.", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: mapArticle(data), ok: true });
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
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = isJsonObject(body) && typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Article id is required." }, { status: 400 });
  }

  const user = await currentUser();
  const isAdmin = isArticleAdmin(userId, user?.publicMetadata);
  const supabase = createServerSupabaseClient("shortside");
  const { data: article, error: fetchError } = await supabase
    .from("articles")
    .select("id, clerk_user_id, header_image_1, header_image_2")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: "Failed to find article.", details: fetchError.message }, { status: 500 });
  }

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  if (!isAdmin && article.clerk_user_id !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const imagePaths = [article.header_image_1, article.header_image_2].filter(
    (path): path is string => typeof path === "string" && path.length > 0
  );
  if (imagePaths.length > 0) {
    await supabase.storage.from(ARTICLE_IMAGE_BUCKET).remove(imagePaths);
  }

  const { error: deleteError } = await supabase.from("articles").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete article.", details: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

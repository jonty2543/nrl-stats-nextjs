import { createServerSupabaseClient } from "@/lib/supabase/client";

export const ARTICLE_IMAGE_BUCKET = "article-images";
export const ARTICLE_SELECT =
  "id, clerk_user_id, display_name, title, slug, body, status, header_image_1, header_image_2, rejection_reason, created_at, updated_at, approved_at, approved_by";
const ARTICLE_LINK_SELECT = "title, slug, header_image_1, header_image_2";

export type ArticleStatus = "pending" | "approved" | "rejected";

interface ArticleRow {
  id: string;
  clerk_user_id: string;
  display_name: string | null;
  author_image_url?: string | null;
  is_anonymous?: boolean | null;
  title: string;
  slug: string;
  body: string;
  status: ArticleStatus;
  header_image_1: string | null;
  header_image_2: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

interface ArticleLinkRow {
  title: string;
  slug: string;
  header_image_1: string | null;
  header_image_2: string | null;
}

export interface Article {
  id: string;
  authorId: string;
  displayName: string;
  authorImageUrl: string | null;
  isAnonymous: boolean;
  title: string;
  slug: string;
  body: string;
  status: ArticleStatus;
  imageUrls: string[];
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface ArticleLink {
  title: string;
  slug: string;
  imageUrls: string[];
}

type Metadata = Record<string, unknown> | null | undefined;

function parseUserIdList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getPublicImageUrl(path: string | null): string | null {
  if (!path) return null;
  const supabase = createServerSupabaseClient("shortside");
  return supabase.storage.from(ARTICLE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function mapArticle(row: ArticleRow): Article {
  const isAnonymous = Boolean(row.is_anonymous) || row.display_name === "Anonymous";
  const isShortSide = row.display_name === "Short Side";

  return {
    id: row.id,
    authorId: row.clerk_user_id,
    displayName: isAnonymous ? "Anonymous" : row.display_name || "Shortside user",
    authorImageUrl: isAnonymous ? null : isShortSide ? "/logo-mark.svg" : row.author_image_url ?? null,
    isAnonymous,
    title: row.title,
    slug: row.slug,
    body: row.body,
    status: row.status,
    imageUrls: [getPublicImageUrl(row.header_image_1), getPublicImageUrl(row.header_image_2)].filter(
      (url): url is string => Boolean(url)
    ),
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
  };
}

function mapArticleLink(row: ArticleLinkRow): ArticleLink {
  return {
    title: row.title,
    slug: row.slug,
    imageUrls: [getPublicImageUrl(row.header_image_1), getPublicImageUrl(row.header_image_2)].filter(
      (url): url is string => Boolean(url)
    ),
  };
}

export function slugifyArticleTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || "article";
}

export function isArticleAdmin(userId: string | null | undefined, metadata?: Metadata): boolean {
  if (!userId) return false;

  const allowlist = new Set(
    [
      ...parseUserIdList(process.env.SHORTSIDE_ADMIN_USER_IDS),
      ...parseUserIdList(process.env.PREMIUM_UNLOCK_USER_IDS ?? process.env.NEXT_PUBLIC_PREMIUM_UNLOCK_USER_IDS),
      ...parseUserIdList(process.env.PRO_PLOT_UNLOCK_USER_IDS ?? process.env.NEXT_PUBLIC_PRO_PLOT_UNLOCK_USER_IDS),
    ]
  );

  if (allowlist.has(userId)) return true;
  return Boolean(
    metadata?.shortsideIsAdmin ||
      metadata?.role === "admin" ||
      metadata?.shortsideIsPremium ||
      metadata?.shortsideIsPro ||
      metadata?.shortsideTier === "premium" ||
      metadata?.shortsideTier === "pro" ||
      metadata?.shortsidePlan === "premium" ||
      metadata?.shortsidePlan === "pro"
  );
}

export function isMissingArticlesTableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    Boolean(error.message?.toLowerCase().includes("could not find the table"))
  );
}

export async function fetchApprovedArticles(): Promise<Article[]> {
  const supabase = createServerSupabaseClient("shortside");
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingArticlesTableError(error)) {
      console.warn("Unable to fetch approved articles.");
    }
    return [];
  }

  return ((data as ArticleRow[] | null) ?? []).map(mapArticle);
}

export async function fetchApprovedArticleLinks(): Promise<ArticleLink[]> {
  const supabase = createServerSupabaseClient("shortside");
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_LINK_SELECT)
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingArticlesTableError(error)) {
      console.warn("Unable to fetch approved article links.");
    }
    return [];
  }

  return ((data as ArticleLinkRow[] | null) ?? []).map(mapArticleLink);
}

export async function fetchUserArticles(userId: string | null | undefined): Promise<Article[]> {
  if (!userId) return [];

  const supabase = createServerSupabaseClient("shortside");
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (!isMissingArticlesTableError(error)) {
      console.warn("Unable to fetch user articles.");
    }
    return [];
  }

  return ((data as ArticleRow[] | null) ?? []).map(mapArticle);
}

export async function fetchPendingArticles(isAdmin: boolean): Promise<Article[]> {
  if (!isAdmin) return [];

  const supabase = createServerSupabaseClient("shortside");
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    if (!isMissingArticlesTableError(error)) {
      console.warn("Unable to fetch pending articles.");
    }
    return [];
  }

  return ((data as ArticleRow[] | null) ?? []).map(mapArticle);
}

export async function fetchArticleBySlug(
  slug: string,
  userId: string | null | undefined,
  isAdmin: boolean
): Promise<Article | null> {
  const supabase = createServerSupabaseClient("shortside");
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    if (!isMissingArticlesTableError(error)) {
      console.warn("Unable to fetch article.");
    }
    return null;
  }

  if (!data) return null;
  const article = mapArticle(data as ArticleRow);
  if (article.status === "approved" || isAdmin || article.authorId === userId) return article;
  return null;
}

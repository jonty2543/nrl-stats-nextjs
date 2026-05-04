"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { SignInButton, useAuth, useUser } from "@clerk/nextjs";
import type { Article } from "@/lib/articles";

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 12000;

interface ArticlesPageClientProps {
  approvedArticles: Article[];
  userArticles: Article[];
  pendingArticles: Article[];
  isSignedIn: boolean;
  isAdmin: boolean;
}

function formatArticleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function displayNameForUser(user: ReturnType<typeof useUser>["user"]): string {
  return (
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    "Shortside user"
  );
}

function stripMarkdownForPreview(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function articlePreviewParagraphs(body: string, wordLimit: number): string[] {
  let remainingWords = wordLimit;
  const previewParagraphs: string[] = [];
  const previewBody = stripMarkdownForPreview(body);

  for (const paragraph of previewBody.split(/\r?\n\s*\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    if (remainingWords <= 0) break;

    const words = paragraph.split(/\s+/).filter(Boolean);
    const isTruncated = words.length > remainingWords;
    previewParagraphs.push(isTruncated ? `${words.slice(0, remainingWords).join(" ")}...` : paragraph);
    remainingWords -= words.length;

    if (isTruncated) break;
  }

  return previewParagraphs;
}

function ArticleCard({ article, compact = false }: { article: Article; compact?: boolean }) {
  const previewParagraphs = articlePreviewParagraphs(article.body, compact ? 45 : 80);

  return (
    <article className="overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel">
      {article.imageUrls.length > 0 ? (
        <div className={`grid ${article.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {article.imageUrls.map((url, index) => (
            <div key={url} className={compact ? "relative h-36" : "relative h-52 sm:h-64"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${article.title} header ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-3 p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            {article.authorImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.authorImageUrl}
                alt=""
                className="h-6 w-6 rounded-full border border-white/10 object-cover"
              />
            ) : null}
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-nrl-muted">
              {article.displayName} · {formatArticleDate(article.approvedAt ?? article.createdAt)}
            </div>
          </div>
          <h2 className="mt-2 text-xl font-bold text-nrl-text sm:text-2xl">{article.title}</h2>
        </div>
        <div className="space-y-3 text-sm leading-6 text-nrl-text/88">
          {previewParagraphs.map((paragraph, index) => (
            <p key={`${article.id}-preview-${index}`}>{paragraph}</p>
          ))}
        </div>
        <Link
          href={`/dashboard/articles/${article.slug}`}
          aria-label={compact ? `Read and review ${article.title}` : `Read ${article.title}`}
          className="inline-grid h-8 w-8 place-items-center rounded-md border border-nrl-border bg-nrl-panel-2 text-lg font-bold leading-none text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35"
        >
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export function ArticlesPageClient({
  approvedArticles,
  userArticles,
  pendingArticles,
  isSignedIn,
  isAdmin,
}: ArticlesPageClientProps) {
  const router = useRouter();
  const { isLoaded: isAuthLoaded, userId } = useAuth();
  const { user } = useUser();
  const [resolvedIsAdmin, setResolvedIsAdmin] = useState(isAdmin);
  const [resolvedPendingArticles, setResolvedPendingArticles] = useState(pendingArticles);
  const [resolvedUserArticles, setResolvedUserArticles] = useState(userArticles);
  const profileDisplayName = resolvedIsAdmin ? "Short Side" : displayNameForUser(user);
  const profileImageUrl = resolvedIsAdmin ? "/logo-mark.svg" : user?.imageUrl ?? null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [confirmDeleteArticle, setConfirmDeleteArticle] = useState<Article | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedIsAdmin(isAdmin);
    setResolvedPendingArticles(pendingArticles);
    setResolvedUserArticles(userArticles);
  }, [isAdmin, pendingArticles, userArticles]);

  useEffect(() => {
    if (!isAuthLoaded || !userId) return;

    let cancelled = false;

    async function loadAdminArticles() {
      try {
        const response = await fetch("/api/admin/articles", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as {
          isAdmin?: boolean;
          pendingArticles?: Article[];
        } | null;

        if (!cancelled && payload?.isAdmin) {
          setResolvedIsAdmin(true);
          setResolvedPendingArticles(payload.pendingArticles ?? []);
        }
      } catch {
        // Non-admins receive 401 here; no UI change needed.
      }
    }

    void loadAdminArticles();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoaded, userId]);

  async function submitArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const form = event.currentTarget;
      const response = await fetch("/api/articles", {
        method: "POST",
        body: new FormData(form),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to submit article.");
      }

      form.reset();
      setMessage(resolvedIsAdmin ? "Article published." : "Article submitted for approval.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit article.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteArticle(id: string) {
    if (deletingArticleId) return;

    setDeletingArticleId(id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/articles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to delete article.");
      }

      setResolvedUserArticles((current) => current.filter((article) => article.id !== id));
      setResolvedPendingArticles((current) => current.filter((article) => article.id !== id));
      setConfirmDeleteArticle(null);
      setMessage("Article deleted.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete article.");
    } finally {
      setDeletingArticleId(null);
    }
  }

  function openEditArticle(article: Article) {
    setEditingArticle(article);
    setEditTitle(article.title);
    setEditBody(article.body);
    setMessage(null);
    setError(null);
  }

  async function saveArticleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingArticle || isSavingEdit) return;

    setIsSavingEdit(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/articles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingArticle.id, title: editTitle, body: editBody }),
      });
      const payload = (await response.json().catch(() => null)) as { article?: Article; error?: string } | null;

      if (!response.ok || !payload?.article) {
        throw new Error(payload?.error ?? "Unable to update article.");
      }

      setResolvedUserArticles((current) =>
        current.map((article) => (article.id === payload.article?.id ? payload.article : article))
      );
      setResolvedPendingArticles((current) =>
        current.map((article) => (article.id === payload.article?.id ? payload.article : article))
      );
      setEditingArticle(null);
      setMessage("Article updated.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update article.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold uppercase tracking-[0.08em] text-nrl-accent sm:text-3xl">
          Articles
        </h1>
        <button
          type="button"
          onClick={() => setShowSubmitForm((current) => !current)}
          aria-label="Create new article"
          aria-expanded={showSubmitForm}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-nrl-border bg-nrl-panel text-2xl leading-none text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-panel-2"
        >
          +
        </button>
      </section>

      {message ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {showSubmitForm ? (
        <section className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-nrl-text">Submit article</h2>
          {!resolvedIsAdmin ? (
            <p className="mt-2 text-xs leading-5 text-nrl-muted">
              Articles must be submitted for approval by an admin before they are displayed publicly.
            </p>
          ) : null}
          {isSignedIn ? (
            <form onSubmit={submitArticle} className="mt-4 space-y-3">
              <input
                name="title"
                maxLength={MAX_TITLE_LENGTH}
                required
                placeholder="Title"
                className="w-full rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none placeholder:text-nrl-muted focus:border-nrl-accent"
              />
              <textarea
                name="body"
                maxLength={MAX_BODY_LENGTH}
                required
                rows={9}
                placeholder="Body"
                className="w-full resize-y rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm leading-6 text-nrl-text outline-none placeholder:text-nrl-muted focus:border-nrl-accent"
              />
              <div className="space-y-2 rounded-md border border-nrl-border bg-nrl-panel-2 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-nrl-muted">
                  Display as
                </div>
                <label className="flex items-center gap-3 rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text">
                  <input
                    type="radio"
                    name="authorMode"
                    value="profile"
                    defaultChecked
                    className="accent-nrl-accent"
                  />
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profileImageUrl}
                      alt=""
                      className="h-7 w-7 rounded-full border border-white/10 object-cover"
                    />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-nrl-panel-2 text-[10px] font-bold uppercase text-nrl-muted">
                      {profileDisplayName.slice(0, 2)}
                    </span>
                  )}
                  <span className="min-w-0 truncate">{profileDisplayName}</span>
                </label>
                <label className="flex items-center gap-3 rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-sm text-nrl-text">
                  <input
                    type="radio"
                    name="authorMode"
                    value="anonymous"
                    className="accent-nrl-accent"
                  />
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-nrl-panel-2 text-[10px] font-bold uppercase text-nrl-muted">
                    AN
                  </span>
                  <span>Anonymous</span>
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-nrl-muted">
                  Header photos
                </label>
                <input
                  name="images"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  required
                  className="block w-full text-xs text-nrl-muted file:mr-3 file:rounded-md file:border file:border-nrl-border file:bg-nrl-panel-2 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-nrl-text"
                />
                <p className="text-[11px] leading-5 text-nrl-muted">Upload 1 or 2 images. JPEG, PNG or WebP.</p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-md border border-nrl-border bg-nrl-panel-2 px-4 py-2 text-sm font-bold text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : resolvedIsAdmin ? "Publish article" : "Submit for approval"}
              </button>
            </form>
          ) : (
            <div className="mt-4 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
              <p className="text-sm text-nrl-muted">Sign in to submit an article.</p>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="mt-3 rounded-md border border-nrl-border px-3 py-1.5 text-xs font-semibold text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35"
                >
                  Sign in
                </button>
              </SignInButton>
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-6">
        <div className="grid gap-5 xl:grid-cols-2">
          {approvedArticles.length === 0 ? (
            <div className="rounded-lg border border-nrl-border bg-nrl-panel p-6 text-sm text-nrl-muted xl:col-span-2">
              No approved articles yet.
            </div>
          ) : (
            approvedArticles.map((article) => <ArticleCard key={article.id} article={article} />)
          )}
        </div>

        {resolvedUserArticles.length > 0 ? (
          <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-nrl-text">Your articles</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {resolvedUserArticles.map((article) => (
                <div key={article.id} className="rounded-md border border-nrl-border bg-nrl-panel-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-nrl-text">{article.title}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-nrl-muted">
                        {article.status}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {resolvedIsAdmin ? (
                        <button
                          type="button"
                          onClick={() => openEditArticle(article)}
                          aria-label={`Edit ${article.title}`}
                          className="grid h-8 w-8 place-items-center rounded-md border border-nrl-border text-nrl-text transition-colors hover:bg-nrl-border/35"
                        >
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteArticle(article)}
                        disabled={deletingArticleId === article.id}
                        aria-label={`Delete ${article.title}`}
                        className="grid h-8 w-8 place-items-center rounded-md border border-red-400/40 text-red-200 transition-colors hover:bg-red-500/10 disabled:opacity-60"
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M6 6l1 14h10l1-14" />
                          <path d="M10 10v6" />
                          <path d="M14 10v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {article.rejectionReason ? (
                    <div className="mt-2 text-xs text-red-200">{article.rejectionReason}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {resolvedIsAdmin ? (
        <section className="space-y-4 rounded-lg border border-nrl-border bg-nrl-panel p-4 sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-nrl-accent">Admin</p>
            <h2 className="mt-1 text-xl font-bold text-nrl-text">Pending articles</h2>
          </div>
          {resolvedPendingArticles.length === 0 ? (
            <div className="text-sm text-nrl-muted">No articles waiting for approval.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {resolvedPendingArticles.map((article) => (
                <div key={article.id} className="space-y-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                  <div className="rounded-md border border-nrl-border bg-nrl-panel px-3 py-2 text-xs text-nrl-muted">
                    Submitted as {article.displayName}
                  </div>
                  <ArticleCard article={article} compact />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {confirmDeleteArticle ? (
        <div className="fixed inset-0 z-[400] grid place-items-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-lg border border-nrl-border bg-nrl-panel p-4 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-nrl-text">Delete article?</h2>
            <p className="mt-3 text-sm leading-6 text-nrl-muted">
              This will permanently delete “{confirmDeleteArticle.title}”.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteArticle(null)}
                disabled={Boolean(deletingArticleId)}
                className="flex-1 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs font-bold text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteArticle(confirmDeleteArticle.id)}
                disabled={Boolean(deletingArticleId)}
                className="flex-1 rounded-md border border-red-400/40 px-3 py-2 text-xs font-bold text-red-200 transition-colors hover:bg-red-500/10 disabled:opacity-60"
              >
                {deletingArticleId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingArticle ? (
        <div className="fixed inset-0 z-[400] grid place-items-center overflow-y-auto bg-black/60 px-4 py-6">
          <div className="w-full max-w-2xl rounded-lg border border-nrl-border bg-nrl-panel p-4 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-nrl-text">Edit article</h2>
            <form onSubmit={saveArticleEdit} className="mt-4 space-y-3">
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                maxLength={MAX_TITLE_LENGTH}
                required
                className="w-full rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
              />
              <textarea
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                maxLength={MAX_BODY_LENGTH}
                required
                rows={14}
                className="w-full resize-y rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm leading-6 text-nrl-text outline-none focus:border-nrl-accent"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingArticle(null)}
                  disabled={isSavingEdit}
                  className="flex-1 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs font-bold text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs font-bold text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35 disabled:opacity-60"
                >
                  {isSavingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

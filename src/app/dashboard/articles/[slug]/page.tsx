import { notFound } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ArticleModerationActions } from "@/components/articles/article-moderation-actions";
import { BackToArticlesLink } from "@/components/articles/back-to-articles-link";
import { MarkdownContent } from "@/components/articles/markdown-content";
import { fetchArticleBySlug, isArticleAdmin } from "@/lib/articles";

export const dynamic = "force-dynamic";

interface ArticleDetailPageProps {
  params: Promise<{ slug: string }>;
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

export default async function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { slug } = await params;
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const isAdmin = isArticleAdmin(userId, user?.publicMetadata);
  const article = await fetchArticleBySlug(slug, userId, isAdmin);

  if (!article) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <BackToArticlesLink />

      {isAdmin && article.status === "pending" ? <ArticleModerationActions articleId={article.id} /> : null}

      <article className="overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel">
        {article.imageUrls.length > 0 ? (
          <div className={`grid ${article.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {article.imageUrls.map((url, index) => (
              <div key={url} className="relative h-52 sm:h-72 lg:h-80">
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

        <div className="space-y-5 p-4 sm:p-6 lg:p-8">
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
            <h1 className="mt-3 text-2xl font-bold text-nrl-text sm:text-3xl">{article.title}</h1>
          </div>

          <MarkdownContent content={article.body} />
        </div>
      </article>
    </div>
  );
}

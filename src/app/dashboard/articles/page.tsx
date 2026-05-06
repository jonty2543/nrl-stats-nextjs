import { auth, currentUser } from "@clerk/nextjs/server";
import { ArticlesPageClient } from "@/components/articles/articles-page-client";
import { fetchApprovedArticles, fetchPendingArticles, fetchUserArticles, isArticleAdmin } from "@/lib/articles";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const isAdmin = isArticleAdmin(userId, user?.publicMetadata);
  const [approvedArticles, userArticles, pendingArticles] = await Promise.all([
    fetchApprovedArticles(),
    fetchUserArticles(userId),
    fetchPendingArticles(isAdmin),
  ]);

  return (
    <ArticlesPageClient
      approvedArticles={approvedArticles}
      userArticles={userArticles}
      pendingArticles={pendingArticles}
      isSignedIn={Boolean(userId)}
      isAdmin={isAdmin}
    />
  );
}

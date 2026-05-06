"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ArticleModerationActionsProps {
  articleId: string;
}

export function ArticleModerationActions({ articleId }: ArticleModerationActionsProps) {
  const router = useRouter();
  const [isModerating, setIsModerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function moderateArticle(status: "approved" | "rejected") {
    if (isModerating) return;

    setIsModerating(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/articles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: articleId, status }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update article.");
      }

      router.push("/dashboard/articles");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update article.");
      setIsModerating(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-nrl-border bg-nrl-panel p-4">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-nrl-accent">Admin review</div>
      {error ? (
        <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void moderateArticle("approved")}
          disabled={isModerating}
          className="flex-1 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-xs font-bold text-nrl-text transition-colors hover:border-white/25 hover:bg-nrl-border/35 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => void moderateArticle("rejected")}
          disabled={isModerating}
          className="flex-1 rounded-md border border-red-400/40 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

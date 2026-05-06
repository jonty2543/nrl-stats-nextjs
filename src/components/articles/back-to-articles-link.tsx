"use client";

import Link from "next/link";
import { useState } from "react";

export function BackToArticlesLink() {
  const [isPending, setIsPending] = useState(false);

  return (
    <Link
      href="/dashboard/articles"
      onClick={() => setIsPending(true)}
      className="relative inline-flex rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-white/25 hover:text-nrl-text"
    >
      Back to articles
      {isPending ? (
        <span className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-nrl-accent/15">
          <span className="block h-full w-full animate-pulse rounded-full bg-nrl-accent" />
        </span>
      ) : null}
    </Link>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard page failed to render.", error);
  }, [error]);

  return (
    <section className="mx-auto mt-10 max-w-2xl rounded-lg border border-nrl-border bg-nrl-panel p-5 shadow-xl shadow-black/10">
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-nrl-accent">Dashboard unavailable</p>
        <h1 className="text-2xl font-black text-nrl-text">We could not load this page.</h1>
        <p className="text-sm font-semibold leading-6 text-nrl-muted">
          The data source may be temporarily unavailable. Try again, or switch to another dashboard section while it recovers.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-nrl-accent px-4 py-2 text-sm font-black text-black transition hover:bg-nrl-accent/90"
        >
          Retry
        </button>
        <Link
          href="/dashboard/fantasy"
          className="rounded-md border border-nrl-border px-4 py-2 text-sm font-black text-nrl-text transition hover:border-nrl-accent hover:text-nrl-accent"
        >
          Fantasy dashboard
        </Link>
      </div>
    </section>
  );
}

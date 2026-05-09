"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

const tools = [
  { label: "Home", href: "/" },
  { label: "Fantasy", href: "/dashboard/fantasy" },
  { label: "Lineups", href: "/dashboard/lineups" },
  { label: "Betting", href: "/dashboard/betting" },
  { label: "Stats", href: "/dashboard/players" },
  { label: "NRL AI", href: "/dashboard/ai" },
  { label: "Articles", href: "/dashboard/articles" },
  { label: "About", href: "/dashboard/about" },
];

interface ToolNavProps {
  className?: string;
}

export function ToolNav({ className }: ToolNavProps) {
  const pathname = usePathname();
  const { isLoaded, userId } = useAuth();
  const [pendingArticleCount, setPendingArticleCount] = useState(0);

  const isStatsRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/leaders");
  const displayedPendingArticleCount = isLoaded && userId ? pendingArticleCount : 0;

  useEffect(() => {
    if (!isLoaded || !userId) {
      return;
    }

    let cancelled = false;

    async function loadPendingArticleCount() {
      try {
        const response = await fetch("/api/admin/articles", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setPendingArticleCount(0);
          return;
        }

        const payload = (await response.json().catch(() => null)) as { pendingCount?: number } | null;
        if (!cancelled && response.ok) {
          setPendingArticleCount(typeof payload?.pendingCount === "number" ? payload.pendingCount : 0);
        }
      } catch {
        if (!cancelled) setPendingArticleCount(0);
      }
    }

    void loadPendingArticleCount();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, pathname, userId]);

  return (
    <>
      <nav
        className={`-mx-1 flex w-full justify-start overflow-x-auto pb-1 [scrollbar-width:none] lg:justify-center lg:overflow-visible [&::-webkit-scrollbar]:hidden sm:mx-0 ${className ?? ""}`}
      >
        <div className="flex w-max min-w-max items-center gap-x-1 rounded-full border border-white/10 bg-[#0e1330]/80 p-1 backdrop-blur sm:w-auto sm:gap-x-2 lg:w-full lg:min-w-0 lg:justify-between lg:gap-x-0">
          {tools.map((tool) => {
            const active = tool.href === "/"
              ? pathname === "/"
              : tool.href === "/dashboard/players"
                ? isStatsRoute
                : pathname === tool.href || pathname.startsWith(`${tool.href}/`);

            return (
              <Link
                key={tool.href}
                href={tool.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`relative whitespace-nowrap rounded-full px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors sm:flex-none sm:px-4 sm:text-xs sm:tracking-[0.18em] ${
                  active
                    ? "bg-nrl-accent/14 text-nrl-accent"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {tool.label}
                {tool.href === "/dashboard/articles" && displayedPendingArticleCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {displayedPendingArticleCount > 9 ? "9+" : displayedPendingArticleCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

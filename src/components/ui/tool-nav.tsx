"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

const tools = [
  { label: "Home", href: "/" },
  { label: "Fantasy", href: "/dashboard/fantasy" },
  { label: "Lineups", href: "/dashboard/lineups" },
  { label: "Betting", href: "/dashboard/betting" },
  { label: "Stats", href: "/dashboard/players" },
  { label: "NRL AI", href: "/dashboard/ai" },
];

const moreTools = [
  { label: "Articles", href: "/dashboard/articles" },
  { label: "About", href: "/dashboard/about" },
];

interface ToolNavProps {
  className?: string;
}

export function ToolNav({ className }: ToolNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [pendingArticleCount, setPendingArticleCount] = useState(0);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const isStatsRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/leaders");
  const displayedPendingArticleCount = isLoaded && userId ? pendingArticleCount : 0;

  useEffect(() => {
    [...tools, ...moreTools].forEach((tool) => {
      router.prefetch(tool.href);
    });
  }, [router]);

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

  useEffect(() => {
    if (!isMoreOpen) return;

    function syncMoreMenuPosition() {
      const rect = moreButtonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 160;
      setMoreMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth)),
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!moreButtonRef.current?.contains(target) && !moreMenuRef.current?.contains(target)) {
        setIsMoreOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
      }
    }

    syncMoreMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", syncMoreMenuPosition);
    window.addEventListener("scroll", syncMoreMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", syncMoreMenuPosition);
      window.removeEventListener("scroll", syncMoreMenuPosition, true);
    };
  }, [isMoreOpen]);

  return (
    <>
      <nav
        className={`-mx-1 flex w-full justify-center overflow-x-auto pb-1 [scrollbar-width:none] lg:overflow-visible [&::-webkit-scrollbar]:hidden sm:mx-0 ${className ?? ""}`}
      >
        <div className="grid w-full min-w-max grid-cols-7 items-center rounded-full border border-white/10 bg-[#0e1330]/80 p-1 backdrop-blur sm:inline-flex sm:w-auto lg:flex lg:w-full lg:min-w-0 lg:justify-between">
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
                prefetch
                aria-current={active ? "page" : undefined}
                className={`w-full whitespace-nowrap rounded-full px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors sm:w-auto sm:flex-none sm:px-4 sm:text-xs sm:tracking-[0.18em] ${
                  active
                    ? "bg-nrl-accent/14 text-nrl-accent"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {tool.label}
              </Link>
            );
          })}
          <div className="relative min-w-0">
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setIsMoreOpen((current) => !current)}
              aria-expanded={isMoreOpen}
              className="relative w-full whitespace-nowrap rounded-full px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55 transition-colors hover:text-white sm:w-auto sm:px-4 sm:text-xs sm:tracking-[0.18em]"
            >
              More
              {displayedPendingArticleCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                  {displayedPendingArticleCount > 9 ? "9+" : displayedPendingArticleCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </nav>

      {isMoreOpen && moreMenuPosition ? (
        <div
          ref={moreMenuRef}
          className="fixed z-[300] min-w-40 overflow-hidden rounded-lg border border-white/10 bg-[#121833] p-1 shadow-xl shadow-black/30"
          style={{ top: moreMenuPosition.top, left: moreMenuPosition.left }}
        >
          {moreTools.map((tool) => {
            const active = pathname === tool.href || pathname.startsWith(`${tool.href}/`);
            return (
              <Link
                key={tool.href}
                href={tool.href}
                prefetch
                onClick={() => setIsMoreOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? "bg-nrl-accent/14 text-nrl-accent"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span>{tool.label}</span>
                  {tool.href === "/dashboard/articles" && displayedPendingArticleCount > 0 ? (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                      {displayedPendingArticleCount > 9 ? "9+" : displayedPendingArticleCount}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

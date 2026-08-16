"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

const tools = [
  { label: "Home", href: "/" },
  { label: "Betting", href: "/dashboard/betting" },
  { label: "Stats", href: "/dashboard/plots" },
  { label: "Fantasy", href: "/dashboard/fantasy" },
  { label: "Matches", href: "/dashboard/lineups" },
  { label: "NRL AI", href: "/dashboard/ai" },
  { label: "Articles", href: "/dashboard/articles" },
  { label: "About", href: "/dashboard/about" },
];

const statsSections = [
  {
    label: "Explore",
    items: [
      { label: "Plots", href: "/dashboard/plots" },
      { label: "Archetypes", href: "/dashboard/archetypes" },
      { label: "Rankings", href: "/dashboard/rankings" },
    ],
  },
  {
    label: "Browse",
    items: [
      { label: "Players", href: "/dashboard/players" },
      { label: "Teams", href: "/dashboard/teams" },
    ],
  },
];

interface ToolNavProps {
  className?: string;
}

function StatsMenuLinks({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {statsSections.map((section) => (
        <div key={section.label}>
          <div className="space-y-1">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`block rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${active ? "bg-nrl-accent/12 text-nrl-accent" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ToolNav({ className }: ToolNavProps) {
  const pathname = usePathname();
  const { isLoaded, userId } = useAuth();
  const [pendingArticleCount, setPendingArticleCount] = useState(0);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [mobileStatsMenuLeft, setMobileStatsMenuLeft] = useState(88);
  const navRootRef = useRef<HTMLDivElement>(null);
  const statsButtonRef = useRef<HTMLButtonElement>(null);

  const isStatsRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/rankings") ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/archetypes") ||
    pathname.startsWith("/dashboard/plots");
  const displayedPendingArticleCount = isLoaded && userId ? pendingArticleCount : 0;

  const toggleStatsMenu = () => {
    const nextOpen = !statsMenuOpen;
    if (nextOpen && navRootRef.current && statsButtonRef.current) {
      const rootRect = navRootRef.current.getBoundingClientRect();
      const buttonRect = statsButtonRef.current.getBoundingClientRect();
      const menuHalfWidth = 88;
      const buttonCenter = buttonRect.left - rootRect.left + buttonRect.width / 2;
      setMobileStatsMenuLeft(Math.min(Math.max(buttonCenter, menuHalfWidth), rootRect.width - menuHalfWidth));
    }
    setStatsMenuOpen(nextOpen);
  };

  useEffect(() => {
    if (!statsMenuOpen) return;

    const closeOnOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      if (!navRootRef.current?.contains(event.target as Node)) {
        setStatsMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatsMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideInteraction);
    document.addEventListener("touchstart", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideInteraction);
      document.removeEventListener("touchstart", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [statsMenuOpen]);

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
    <div ref={navRootRef} className="relative">
      <nav
        className={`-mx-1 flex w-full justify-start overflow-x-auto pb-1 [scrollbar-width:none] lg:justify-center lg:overflow-visible [&::-webkit-scrollbar]:hidden sm:mx-0 ${className ?? ""}`}
      >
        <div className="flex w-max min-w-max items-center gap-x-1 rounded-full border border-white/10 bg-[#151c3a]/92 p-1 backdrop-blur sm:w-auto sm:gap-x-2 lg:w-full lg:min-w-0 lg:justify-between lg:gap-x-0">
          {tools.map((tool) => {
            const active = tool.href === "/"
              ? pathname === "/"
              : tool.href === "/dashboard/plots"
                ? isStatsRoute
                : pathname === tool.href || pathname.startsWith(`${tool.href}/`);

            if (tool.label === "Stats") {
              return (
                <div
                  key={tool.href}
                  className="relative flex-none"
                >
                  <button
                    ref={statsButtonRef}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-expanded={statsMenuOpen}
                    aria-haspopup="true"
                    onClick={toggleStatsMenu}
                    className={`whitespace-nowrap rounded-full px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors sm:px-4 sm:text-xs sm:tracking-[0.18em] ${active ? "bg-nrl-accent/14 text-nrl-accent" : "text-white/55 hover:text-white"}`}
                  >
                    Stats
                  </button>

                  <div className={`absolute left-1/2 top-full z-50 hidden w-44 -translate-x-1/2 pt-2 transition-opacity lg:block ${statsMenuOpen ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}>
                    <div className="rounded-xl border border-white/10 bg-[#111831]/98 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                      <StatsMenuLinks pathname={pathname} onNavigate={() => setStatsMenuOpen(false)} />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={tool.href}
                href={tool.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                onClick={() => setStatsMenuOpen(false)}
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
      {statsMenuOpen ? (
        <div style={{ left: mobileStatsMenuLeft }} className="absolute top-full z-50 mt-2 w-44 -translate-x-1/2 rounded-xl border border-white/10 bg-[#111831]/98 p-2 shadow-[0_14px_32px_rgba(0,0,0,0.4)] backdrop-blur lg:hidden">
          <StatsMenuLinks pathname={pathname} onNavigate={() => setStatsMenuOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

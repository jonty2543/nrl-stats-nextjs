"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const tools = [
  { label: "Home", href: "/" },
  { label: "Betting", href: "/dashboard/betting" },
  { label: "Stats", href: "/dashboard/plots" },
  { label: "Fantasy", href: "/dashboard/fantasy" },
  { label: "Matches", href: "/dashboard/lineups" },
  // Archived: restore this link when NRL AI is ready to return.
  // { label: "NRL AI", href: "/dashboard/ai" },
  { label: "About", href: "/dashboard/about" },
];

const statsSections = [
  {
    label: "Explore",
    items: [
      { label: "Players", href: "/dashboard/players" },
      { label: "Plots", href: "/dashboard/plots" },
      { label: "Archetypes", href: "/dashboard/archetypes" },
      { label: "Rankings", href: "/dashboard/rankings" },
    ],
  },
  {
    label: "Browse",
    items: [
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
                  className={`block px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] transition-colors ${active ? "bg-[#00f58a]/10 text-[#00f58a]" : "text-[#f2f3e9]/65 hover:bg-white/5 hover:text-[#f2f3e9]"}`}
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

  return (
    <div ref={navRootRef} className="relative">
      <nav
        className={`flex w-full justify-start overflow-x-auto [scrollbar-width:none] lg:h-[84px] lg:justify-center lg:overflow-visible [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      >
        <div className="flex min-w-max items-stretch gap-x-5 sm:gap-x-7 lg:h-full lg:gap-x-9">
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
                    className={`h-12 whitespace-nowrap border-b-[3px] px-0 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] transition-colors lg:h-[84px] ${active ? "border-[#00f58a] text-[#00f58a]" : "border-transparent text-[#f2f3e9]/72 hover:text-[#f2f3e9]"}`}
                  >
                    Stats
                  </button>

                  <div className={`absolute left-1/2 top-full z-50 hidden w-44 -translate-x-1/2 pt-2 transition-opacity lg:block ${statsMenuOpen ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}>
                    <div className="border border-white/10 bg-[#111733]/98 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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
                className={`relative flex h-12 items-center whitespace-nowrap border-b-[3px] px-0 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] transition-colors sm:flex-none lg:h-[84px] ${
                  active
                    ? "border-[#00f58a] text-[#00f58a]"
                    : "border-transparent text-[#f2f3e9]/72 hover:text-[#f2f3e9]"
                }`}
              >
                {tool.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {statsMenuOpen ? (
        <div style={{ left: mobileStatsMenuLeft }} className="absolute top-full z-50 mt-2 w-44 -translate-x-1/2 border border-white/10 bg-[#111733]/98 p-2 shadow-[0_14px_32px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden">
          <StatsMenuLinks pathname={pathname} onNavigate={() => setStatsMenuOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

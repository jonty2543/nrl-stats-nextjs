"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Players", href: "/dashboard/players" },
  { label: "Teams", href: "/dashboard/teams" },
  { label: "Stats Hub", href: "/dashboard/stats-hub" },
  { label: "Archetypes", href: "/dashboard/archetypes" },
  { label: "Leaders", href: "/dashboard/leaders" },
];

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  const inStatsSection =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/stats-hub") ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/archetypes") ||
    pathname.startsWith("/dashboard/leaders");

  useEffect(() => {
    if (!inStatsSection) return;
    tabs.forEach((tab) => {
      router.prefetch(tab.href);
    });
  }, [inStatsSection, router]);

  if (!inStatsSection) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-white/8 pt-3">
      <nav
        aria-label="Stats sections"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:inline-flex sm:rounded-lg sm:border sm:border-white/10 sm:bg-white/[0.035] sm:p-1 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={`cursor-pointer whitespace-nowrap rounded-md border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors sm:px-4 sm:text-[11px] ${
                active
                  ? "border-emerald-300/45 bg-emerald-400 text-[#07111f] shadow-[0_0_24px_rgba(16,185,129,0.22)]"
                  : "border-white/8 bg-white/[0.025] text-white/48 hover:border-white/16 hover:bg-white/[0.055] hover:text-white/80"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

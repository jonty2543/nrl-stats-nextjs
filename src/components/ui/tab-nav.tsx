"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Players", href: "/dashboard/players" },
  { label: "Teams", href: "/dashboard/teams" },
  { label: "Leaders", href: "/dashboard/leaders" },
];

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  const inStatsSection =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
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
    <div className="-mx-1 mt-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav className="inline-flex min-w-max gap-1 rounded-full border border-white/10 bg-[#121833]/82 p-1 backdrop-blur">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={`cursor-pointer rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors sm:px-4 sm:text-xs sm:tracking-[0.18em] ${
                active
                  ? "bg-emerald-400/14 text-emerald-300"
                  : "text-white/48 hover:text-white/80"
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

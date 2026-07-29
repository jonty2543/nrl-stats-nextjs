"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Archetypes", href: "/dashboard/archetypes" },
  { label: "Plots", href: "/dashboard/plots" },
  { label: "Rankings", href: "/dashboard/rankings" },
  { label: "Players", href: "/dashboard/players" },
  { label: "Teams", href: "/dashboard/teams" },
  { label: "Leaders", href: "/dashboard/leaders" },
];

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  const inStatsSection =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/rankings") ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/archetypes") ||
    pathname.startsWith("/dashboard/plots") ||
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
    <div className="-mx-1 mt-4 flex overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      <nav
        aria-label="Stats sections"
        className="flex min-w-max gap-2 sm:inline-flex"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={`cursor-pointer whitespace-nowrap rounded border px-3.5 py-2.5 text-xs font-extrabold leading-none transition-colors ${
                active
                  ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
                  : "border-nrl-border bg-nrl-panel text-nrl-muted hover:text-nrl-text"
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

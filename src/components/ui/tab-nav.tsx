"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Players", href: "/dashboard/players" },
  { label: "Teams", href: "/dashboard/teams" },
];

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  const inStatsSection =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams");

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
    <nav className="flex gap-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-nrl-accent/15 text-nrl-accent"
                : "text-nrl-muted hover:text-nrl-text hover:bg-nrl-panel-2"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

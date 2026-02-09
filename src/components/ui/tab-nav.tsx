"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Players", href: "/dashboard/players" },
  { label: "Teams", href: "/dashboard/teams" },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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

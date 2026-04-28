"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const tools = [
  { label: "Home", href: "/" },
  { label: "Fantasy", href: "/dashboard/fantasy" },
  { label: "Betting", href: "/dashboard/betting" },
  { label: "Stats", href: "/dashboard/players" },
  { label: "NRL AI", href: "/dashboard/ai" },
  { label: "About", href: "/dashboard/about" },
];

interface ToolNavProps {
  className?: string;
}

export function ToolNav({ className }: ToolNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isStatsRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/players") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/leaders");

  useEffect(() => {
    tools.forEach((tool) => {
      router.prefetch(tool.href);
    });
  }, [router]);

  return (
    <nav
      className={`-mx-1 flex w-full justify-center overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 ${className ?? ""}`}
    >
      <div className="inline-flex w-full min-w-max rounded-full border border-white/10 bg-[#0e1330]/80 p-1 backdrop-blur sm:w-auto">
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
              className={`flex-1 whitespace-nowrap rounded-full px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors sm:flex-none sm:px-4 sm:text-xs sm:tracking-[0.18em] ${
                active
                  ? "bg-nrl-accent/14 text-nrl-accent"
                  : "text-white/55 hover:text-white"
              }`}
            >
              {tool.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

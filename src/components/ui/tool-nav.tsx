"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const tools = [
  { label: "Home", href: "/" },
  { label: "Fantasy", href: "/dashboard/fantasy" },
  { label: "Betting", href: "/dashboard/betting" },
  { label: "Stats", href: "/dashboard/players" },
  { label: "About", href: "/dashboard/about" },
];

interface ToolNavProps {
  className?: string;
  mobileFullWidth?: boolean;
}

export function ToolNav({ className, mobileFullWidth = false }: ToolNavProps) {
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
      className={`-mx-1 flex w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 ${
        mobileFullWidth ? "justify-stretch" : "justify-center"
      } ${className ?? ""}`}
    >
      <div
        className={`inline-flex rounded-full border border-white/10 bg-[#0e1330]/80 p-1 backdrop-blur lg:min-w-max ${
          mobileFullWidth ? "min-w-full w-full" : "min-w-max"
        }`}
      >
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
              className={`text-center font-semibold uppercase transition-colors ${
                active
                  ? "bg-emerald-400/14 text-emerald-300"
                  : "text-white/55 hover:text-white"
              } ${mobileFullWidth
                ? "flex-1 rounded-full px-2 py-2 text-[10px] tracking-[0.14em] sm:px-3 sm:text-[11px] sm:tracking-[0.16em] lg:flex-none lg:px-4 lg:text-xs lg:tracking-[0.18em]"
                : "rounded-full px-3 py-2 text-[11px] tracking-[0.16em] sm:px-4 sm:text-xs sm:tracking-[0.18em]"
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

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const tools = [
  { label: "Stats", href: "/dashboard/players" },
  { label: "About", href: "/dashboard/about" },
];

export function ToolNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    tools.forEach((tool) => {
      router.prefetch(tool.href);
    });
  }, [router]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  const currentLabel = pathname.startsWith("/dashboard/about") ? "About" : "Stats";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1.5 text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
        aria-label="Open page menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-medium text-nrl-text">{currentLabel}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-44 rounded-md border border-nrl-border bg-nrl-panel p-1 shadow-lg">
          {tools.map((tool) => {
            const active = pathname === tool.href || pathname.startsWith(`${tool.href}/`);
            return (
              <Link
                key={tool.href}
                href={tool.href}
                prefetch
                aria-current={active ? "page" : undefined}
                onClick={() => setIsOpen(false)}
                className={`block rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-nrl-accent/15 text-nrl-accent"
                    : "text-nrl-muted hover:bg-nrl-panel-2 hover:text-nrl-text"
                }`}
              >
                {tool.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

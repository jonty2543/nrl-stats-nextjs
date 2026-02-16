"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ExpanderProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function Expander({ title, defaultExpanded = true, children }: ExpanderProps) {
  void defaultExpanded;
  const [fullscreen, setFullscreen] = useState(false);
  const inlineContentRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  const iconButtonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:text-nrl-text hover:border-nrl-accent hover:bg-nrl-panel";

  return (
    <>
      <div className="rounded-lg border border-nrl-border bg-nrl-panel overflow-hidden">
        <div className="flex items-start justify-between gap-2 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm font-semibold leading-5 text-nrl-text">
            <span
              className="block overflow-hidden break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
              title={title}
            >
              {title}
            </span>
          </div>
        </div>
        <div ref={inlineContentRef} className="px-4 pb-4">
          {children}
          <div className="mt-2 flex items-center justify-end gap-1">
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => setFullscreen(true)}
              title="Expand"
              aria-label="Expand"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6" />
                <path d="M21 3l-7 7" />
                <path d="M9 21H3v-6" />
                <path d="M3 21l7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-black/80 p-3 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1700px] flex-col overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel">
            <div className="flex items-start justify-between gap-3 border-b border-nrl-border px-4 py-3">
              <div className="min-w-0 flex-1 text-sm font-semibold leading-5 text-nrl-text">
                <span
                  className="block overflow-hidden break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                  title={title}
                >
                  {title}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className={iconButtonClass}
                  onClick={() => setFullscreen(false)}
                  title="Close"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div ref={modalContentRef} className="chart-fullscreen flex-1 overflow-auto p-4">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

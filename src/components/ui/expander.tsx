"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

  const filenameBase = useMemo(
    () =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "chart",
    [title]
  );

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

  const getActiveSvg = (): SVGSVGElement | null => {
    const host = fullscreen ? modalContentRef.current : inlineContentRef.current;
    if (!host) return null;
    return host.querySelector("svg");
  };

  const serializeSvg = (svg: SVGSVGElement): string => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    if (!clone.getAttribute("xmlns:xlink")) {
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    }
    if (!clone.getAttribute("width")) {
      clone.setAttribute("width", `${Math.max(1, Math.round(bounds.width))}`);
    }
    if (!clone.getAttribute("height")) {
      clone.setAttribute("height", `${Math.max(1, Math.round(bounds.height))}`);
    }
    return new XMLSerializer().serializeToString(clone);
  };

  const wrapTitleLines = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines = 2
  ): string[] => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = "";
      }

      if (lines.length === maxLines) break;
    }

    if (lines.length < maxLines && current) {
      lines.push(current);
    } else if (current && lines.length > 0) {
      let last = lines[lines.length - 1];
      while (last.length > 0 && ctx.measureText(`${last}...`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = `${last}...`;
    }

    return lines.slice(0, maxLines);
  };

  const downloadPng = () => {
    const svg = getActiveSvg();
    if (!svg) return;
    const svgText = serializeSvg(svg);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = window.devicePixelRatio > 1 ? 2 : 1;
      const width = Math.max(1, Math.round(img.width));
      const height = Math.max(1, Math.round(img.height));
      const titleFontSize = Math.max(10, Math.min(14, Math.round(width * 0.024)));
      const titlePaddingX = Math.max(12, Math.round(width * 0.028));
      const titlePaddingTop = Math.max(8, Math.round(titleFontSize * 0.65));
      const titlePaddingBottom = Math.max(6, Math.round(titleFontSize * 0.45));
      const titleLineHeight = Math.max(12, Math.round(titleFontSize * 1.22));
      const maxTitleWidth = Math.max(1, width - titlePaddingX * 2);
      const maxTitleLines = width < 700 ? 1 : 2;
      const titleFont = `600 ${titleFontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;

      const measureCanvas = document.createElement("canvas");
      const measureCtx = measureCanvas.getContext("2d");
      if (!measureCtx) {
        URL.revokeObjectURL(url);
        return;
      }
      measureCtx.font = titleFont;
      const titleLines = wrapTitleLines(measureCtx, title, maxTitleWidth, maxTitleLines);
      const titleBlockHeight =
        titleLines.length > 0
          ? titlePaddingTop + titleLines.length * titleLineHeight + titlePaddingBottom
          : 0;

      const outputHeight = height + titleBlockHeight;
      canvas.width = width * scale;
      canvas.height = outputHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = "#161c32";
      ctx.fillRect(0, 0, width, outputHeight);

      if (titleLines.length > 0) {
        ctx.font = titleFont;
        ctx.textBaseline = "top";
        ctx.fillStyle = "#d9def1";
        titleLines.forEach((line, idx) => {
          ctx.fillText(line, titlePaddingX, titlePaddingTop + idx * titleLineHeight);
        });
      }

      ctx.drawImage(img, 0, titleBlockHeight, width, height);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `${filenameBase}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const iconButtonClass =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-nrl-border bg-[#121a33cc] text-nrl-muted hover:text-nrl-text hover:border-nrl-accent";

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
              onClick={downloadPng}
              title="Download PNG"
              aria-label="Download PNG"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v11" />
                <path d="m8 10 4 4 4-4" />
                <path d="M4 20h16" />
              </svg>
            </button>
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
                  onClick={downloadPng}
                  title="Download PNG"
                  aria-label="Download PNG"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v11" />
                    <path d="m8 10 4 4 4-4" />
                    <path d="M4 20h16" />
                  </svg>
                </button>
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

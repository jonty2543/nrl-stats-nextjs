"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface YearRangeSliderProps {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
  openFooter?: ReactNode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRange(
  options: string[],
  selectedValues: string[]
): { startIndex: number; endIndex: number } {
  if (options.length === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const selectedIndexes = options
    .map((option, index) => (selectedValues.includes(option) ? index : -1))
    .filter((index) => index >= 0);

  if (selectedIndexes.length === 0) {
    return { startIndex: 0, endIndex: options.length - 1 };
  }

  return {
    startIndex: Math.min(...selectedIndexes),
    endIndex: Math.max(...selectedIndexes),
  };
}

function formatSelectionSummary(selectedYears: string[]): string {
  if (selectedYears.length === 0) return "No seasons available";
  if (selectedYears.length === 1) return selectedYears[0];
  return `${selectedYears[selectedYears.length - 1]}-${selectedYears[0]}`;
}

export function YearRangeSlider({
  label,
  value,
  options,
  onChange,
  openFooter,
}: YearRangeSliderProps) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(() => normalizeRange(options, value));
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedYears = useMemo(
    () => options.slice(draftRange.startIndex, draftRange.endIndex + 1),
    [draftRange.endIndex, draftRange.startIndex, options]
  );

  const committedRange = useMemo(() => normalizeRange(options, value), [options, value]);
  const committedYears = useMemo(
    () => options.slice(committedRange.startIndex, committedRange.endIndex + 1),
    [committedRange.endIndex, committedRange.startIndex, options]
  );
  const maxIndex = Math.max(options.length - 1, 0);
  const fillStartPercent = maxIndex > 0 ? (draftRange.startIndex / maxIndex) * 100 : 0;
  const fillEndPercent = maxIndex > 0 ? (draftRange.endIndex / maxIndex) * 100 : 100;

  const commitDraft = useCallback(() => {
    const nextYears = options.slice(draftRange.startIndex, draftRange.endIndex + 1);
    const currentYears = committedYears;
    const hasChanged =
      nextYears.length !== currentYears.length ||
      nextYears.some((year, index) => year !== currentYears[index]);
    if (hasChanged) {
      onChange(nextYears);
    }
  }, [committedYears, draftRange.endIndex, draftRange.startIndex, onChange, options]);

  const shiftDraftRange = useCallback((direction: -1 | 1) => {
    setDraftRange((prev) => {
      const width = prev.endIndex - prev.startIndex;
      const nextStartIndex = clamp(prev.startIndex + direction, 0, maxIndex - width);
      return {
        startIndex: nextStartIndex,
        endIndex: nextStartIndex + width,
      };
    });
  }, [maxIndex]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!open || !containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        commitDraft();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [commitDraft, open]);

  return (
    <div className={`relative min-w-0 flex flex-col gap-0.5 ${open ? "z-[320]" : "z-0"}`}>
      <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => {
            if (open) {
              commitDraft();
              setOpen(false);
              return;
            }
            setDraftRange(normalizeRange(options, value));
            setOpen(true);
          }}
          aria-expanded={open}
          className="h-[30px] w-full overflow-hidden rounded-md border border-nrl-border bg-nrl-panel-2 text-left sm:h-[26px]"
        >
          <div className="flex h-full items-stretch justify-between">
            <div className="flex min-w-0 flex-1 items-center bg-nrl-accent/10 px-3">
              <span className="text-[10px] font-semibold text-nrl-text">
                {formatSelectionSummary(committedYears)}
              </span>
            </div>
            <div className="flex w-10 shrink-0 items-center justify-center border-l border-nrl-accent/25 bg-nrl-accent/14">
              <span
                className={`text-[9px] text-nrl-accent transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              >
                v
              </span>
            </div>
          </div>
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-[220] mt-1 w-full max-w-[calc(100vw-2rem)] rounded-md border border-nrl-border bg-nrl-panel p-4 shadow-lg sm:right-auto sm:w-[36rem] sm:max-w-[36rem] sm:p-6">
            {options.length > 0 ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-nrl-text">
                    {formatSelectionSummary(selectedYears)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Move year range older"
                      title="Move year range older"
                      disabled={draftRange.endIndex >= maxIndex}
                      onClick={() => shiftDraftRange(1)}
                      className="rounded-sm border border-nrl-border bg-nrl-panel-2 px-2 py-0.5 text-[9px] font-semibold text-nrl-muted transition-colors hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Older
                    </button>
                    <button
                      type="button"
                      aria-label="Move year range newer"
                      title="Move year range newer"
                      disabled={draftRange.startIndex <= 0}
                      onClick={() => shiftDraftRange(-1)}
                      className="rounded-sm border border-nrl-border bg-nrl-panel-2 px-2 py-0.5 text-[9px] font-semibold text-nrl-muted transition-colors hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Newer
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftRange({
                          startIndex: 0,
                          endIndex: 0,
                        })
                      }
                      className="rounded-sm border border-nrl-border bg-nrl-panel-2 px-2 py-0.5 text-[9px] font-semibold text-nrl-muted transition-colors hover:text-nrl-text"
                    >
                      Min
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftRange({ startIndex: 0, endIndex: Math.max(options.length - 1, 0) })
                      }
                      className="rounded-sm border border-nrl-border bg-nrl-panel-2 px-2 py-0.5 text-[9px] font-semibold text-nrl-muted transition-colors hover:text-nrl-text"
                    >
                      Max
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    type="range"
                    min={0}
                    max={maxIndex}
                    step={1}
                    value={draftRange.endIndex}
                    onChange={(event) => {
                      const nextIndex = Number.parseInt(event.target.value, 10);
                      setDraftRange((prev) => ({
                        startIndex: prev.startIndex,
                        endIndex: clamp(nextIndex, prev.startIndex, maxIndex),
                      }));
                    }}
                    className="year-range-slider h-6 w-full appearance-none bg-transparent"
                    style={{
                      backgroundImage: `linear-gradient(to right, rgba(42,51,86,0.95) 0%, rgba(42,51,86,0.95) ${fillStartPercent}%, rgba(0,245,138,0.72) ${fillStartPercent}%, rgba(0,245,138,0.72) ${fillEndPercent}%, rgba(42,51,86,0.95) ${fillEndPercent}%, rgba(42,51,86,0.95) 100%)`,
                      backgroundSize: "100% 0.35rem",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-nrl-muted">
                    <span>{options[draftRange.startIndex]}</span>
                    <span>{options[draftRange.endIndex]}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold">
                  {selectedYears.slice(0, 6).map((year) => (
                    <span
                      key={year}
                      className="rounded-sm border border-nrl-accent/35 bg-nrl-accent/15 px-2 py-1 text-nrl-accent"
                    >
                      {year}
                    </span>
                  ))}
                  {selectedYears.length > 6 ? (
                    <span className="text-nrl-muted">+{selectedYears.length - 6} more</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-nrl-muted">No seasons available.</p>
            )}
            {openFooter && <div className="mt-2 border-t border-nrl-border/70 pt-2">{openFooter}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

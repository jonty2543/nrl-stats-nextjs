"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface YearRangeSliderProps {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
  openFooter?: ReactNode;
}

type RangeHandle = "start" | "end";

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
  const [activeHandle, setActiveHandle] = useState<RangeHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

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

  const indexFromClientX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || maxIndex <= 0) return 0;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return clamp(Math.round(ratio * maxIndex), 0, maxIndex);
  }, [maxIndex]);

  const updateHandle = useCallback((handle: RangeHandle, index: number) => {
    setDraftRange((prev) => {
      if (handle === "start") {
        return { ...prev, startIndex: clamp(index, 0, prev.endIndex) };
      }
      return { ...prev, endIndex: clamp(index, prev.startIndex, maxIndex) };
    });
  }, [maxIndex]);

  const startDrag = useCallback((handle: RangeHandle, clientX: number) => {
    setActiveHandle(handle);
    updateHandle(handle, indexFromClientX(clientX));
  }, [indexFromClientX, updateHandle]);

  const startTrackDrag = useCallback((clientX: number) => {
    const index = indexFromClientX(clientX);
    const startDistance = Math.abs(index - draftRange.startIndex);
    const endDistance = Math.abs(index - draftRange.endIndex);
    const handle: RangeHandle = startDistance <= endDistance ? "start" : "end";
    startDrag(handle, clientX);
  }, [draftRange.endIndex, draftRange.startIndex, indexFromClientX, startDrag]);

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

  useEffect(() => {
    if (!activeHandle) return;

    const onPointerMove = (event: PointerEvent) => {
      updateHandle(activeHandle, indexFromClientX(event.clientX));
    };
    const onPointerUp = () => {
      setActiveHandle(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeHandle, indexFromClientX, updateHandle]);

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
                  <div
                    ref={trackRef}
                    role="presentation"
                    className="relative h-8 touch-none"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      startTrackDrag(event.clientX);
                    }}
                  >
                    <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-nrl-border/90" />
                    <div
                      className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-nrl-accent"
                      style={{
                        left: `${fillStartPercent}%`,
                        width: `${Math.max(fillEndPercent - fillStartPercent, 0)}%`,
                      }}
                    />
                    {(["start", "end"] as const).map((handle) => {
                      const isStart = handle === "start";
                      const percent = isStart ? fillStartPercent : fillEndPercent;
                      return (
                        <button
                          key={handle}
                          type="button"
                          aria-label={isStart ? "Drag newer year" : "Drag older year"}
                          title={isStart ? "Drag newer year" : "Drag older year"}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            startDrag(handle, event.clientX);
                          }}
                          className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-nrl-bg bg-nrl-accent shadow-[0_0_0_1px_rgba(0,245,138,0.6)] transition-transform ${
                            activeHandle === handle ? "scale-110" : "hover:scale-105"
                          }`}
                          style={{ left: `${percent}%`, zIndex: activeHandle === handle ? 2 : isStart ? 1 : 2 }}
                        />
                      );
                    })}
                  </div>
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

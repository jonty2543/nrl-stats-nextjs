"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface MultiSelectProps {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
  disabledOptions?: Record<string, string>;
  openFooter?: ReactNode;
}

export function MultiSelect({
  label,
  value,
  options,
  onChange,
  disabledOptions,
  openFooter,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState<string[]>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const commitDraft = useCallback(() => {
    const normalizedCurrent = options.filter((opt) => value.includes(opt));
    const normalizedDraft = options.filter((opt) => draftValue.includes(opt));
    const hasChanged =
      normalizedCurrent.length !== normalizedDraft.length ||
      normalizedCurrent.some((opt, index) => opt !== normalizedDraft[index]);
    if (hasChanged) {
      onChange(normalizedDraft);
    }
  }, [draftValue, onChange, options, value]);

  const selectedOptions = useMemo(
    () => options.filter((opt) => (open ? draftValue : value).includes(opt)),
    [draftValue, open, options, value]
  );

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!open) return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        commitDraft();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [commitDraft, open]);

  const toggle = (opt: string) => {
    if (disabledOptions?.[opt]) {
      return;
    }
    setDraftValue((prev) =>
      prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt]
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
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
            setDraftValue(value);
            setOpen(true);
          }}
          aria-expanded={open}
          className="w-full rounded-md border border-nrl-border bg-nrl-panel-2 p-1 min-h-[22px] text-left"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex flex-wrap gap-0.5">
              {selectedOptions.length === 0 ? (
                <span className="text-[10px] text-nrl-muted">Select year(s)</span>
              ) : (
                selectedOptions.map((opt) => (
                  <span
                    key={opt}
                    className="rounded-sm px-1.5 py-[1px] text-[9px] font-semibold bg-nrl-accent/20 text-nrl-accent border border-nrl-accent/30"
                  >
                    {opt}
                  </span>
                ))
              )}
            </div>
            <span
              className={`text-[9px] text-nrl-muted transition-transform ${
                open ? "rotate-180" : ""
              }`}
            >
              v
            </span>
          </div>
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-nrl-border bg-nrl-panel p-1 shadow-lg">
            <div className="flex flex-wrap gap-0.5">
              {options.map((opt) => {
                const disabledReason = disabledOptions?.[opt];
                const disabled = typeof disabledReason === "string" && disabledReason.length > 0;
                const selected = draftValue.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    disabled={disabled}
                    title={disabledReason}
                    className={`rounded-sm px-1.5 py-[1px] text-[9px] font-semibold transition-colors ${
                      disabled
                        ? "cursor-not-allowed bg-nrl-panel-2 text-nrl-muted/45 border border-nrl-border/50"
                        : selected
                        ? "bg-nrl-accent/20 text-nrl-accent border border-nrl-accent/30"
                        : "bg-nrl-panel-2 text-nrl-muted border border-nrl-border hover:text-nrl-text"
                    }`}
                  >
                    {opt}
                    {disabled && (
                      <span className="ml-1 text-[8px] font-medium text-nrl-muted/55">
                        {disabledReason}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {openFooter && (
              <div className="mt-1.5 border-t border-nrl-border/70 pt-1">
                {openFooter}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

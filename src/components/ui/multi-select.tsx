"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface MultiSelectProps {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
}

export function MultiSelect({ label, value, options, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOptions = useMemo(
    () => options.filter((opt) => value.includes(opt)),
    [options, value]
  );

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
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
                const selected = value.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`rounded-sm px-1.5 py-[1px] text-[9px] font-semibold transition-colors ${
                      selected
                        ? "bg-nrl-accent/20 text-nrl-accent border border-nrl-accent/30"
                        : "bg-nrl-panel-2 text-nrl-muted border border-nrl-border hover:text-nrl-text"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

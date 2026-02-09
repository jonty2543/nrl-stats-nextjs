"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface SearchableSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Search...",
  disabled = false,
}: SearchableSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [hasTypedSinceOpen, setHasTypedSinceOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setHasTypedSinceOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value);
        setHasTypedSinceOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [value]);

  const filtered = useMemo(() => {
    if (open && !hasTypedSinceOpen) return options;

    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [open, hasTypedSinceOpen, options, query]);

  const selectOption = (opt: string) => {
    onChange(opt);
    setQuery(opt);
    setHasTypedSinceOpen(false);
    setOpen(false);
  };

  const handleBlur = () => {
    // Delay to allow option onMouseDown to run first.
    window.setTimeout(() => {
      setOpen(false);
      setQuery(value);
      setHasTypedSinceOpen(false);
    }, 80);
  };

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label className="text-xs font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setHasTypedSinceOpen(false);
            inputRef.current?.select();
          }}
          onBlur={handleBlur}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            setHasTypedSinceOpen(true);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(value);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const exact = options.find(
                (opt) => opt.toLowerCase() === query.trim().toLowerCase()
              );
              if (exact) {
                selectOption(exact);
                return;
              }
              if (filtered.length > 0) {
                selectOption(filtered[0]);
              } else {
                setQuery(value);
                setOpen(false);
              }
            }
          }}
          className="w-full rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-50"
        />

        {open && !disabled && (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-nrl-border bg-nrl-panel shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-nrl-muted">No matches</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(opt);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                    opt === value
                      ? "bg-nrl-accent/15 text-nrl-accent"
                      : "text-nrl-text hover:bg-nrl-panel-2"
                  }`}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

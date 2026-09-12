"use client";

import { useId } from "react";

type SelectOption = string | { value: string; label: string };
type SelectOptionGroup = { label: string; options: SelectOption[] };

function selectedOptionLabel(options: Array<SelectOption | SelectOptionGroup>, value: string): string {
  for (const entry of options) {
    if (typeof entry === "string") {
      if (entry === value) return entry;
      continue;
    }
    if ("options" in entry) {
      const match = entry.options.find((option) => typeof option === "string" ? option === value : option.value === value);
      if (match) return typeof match === "string" ? match : match.label;
      continue;
    }
    if (entry.value === value) return entry.label;
  }
  return value;
}

interface SelectProps {
  label: string;
  value: string;
  options: Array<SelectOption | SelectOptionGroup>;
  onChange: (value: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  compact?: boolean;
  description?: string;
}

export function Select({ label, value, options, onChange, disabled = false, hideLabel = false, compact = false, description }: SelectProps) {
  const selectId = useId();
  const selectedLabel = selectedOptionLabel(options, value);

  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={selectId} className={hideLabel ? "sr-only" : "text-[8px] font-semibold uppercase tracking-wide text-nrl-muted"}>
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${compact ? "h-8 py-0 pl-2.5 pr-7" : "h-[34px] py-0 pl-3 pr-8"} ${description ? "text-transparent" : "text-nrl-text"} w-full appearance-none rounded-md border border-nrl-border bg-nrl-panel-2 text-[10px] leading-normal outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {options.map((entry, index) => {
            if (typeof entry === "object" && "options" in entry) {
              return (
                <optgroup key={`${entry.label}-${index}`} label={entry.label} className="text-nrl-text">
                  {entry.options.map((opt, optionIndex) => {
                    const option = typeof opt === "string" ? { value: opt, label: opt } : opt;
                    return <option key={`${option.value}-${optionIndex}`} value={option.value} className="text-nrl-text">{option.label}</option>;
                  })}
                </optgroup>
              );
            }

            const option = typeof entry === "string" ? { value: entry, label: entry } : entry;
            return <option key={`${option.value}-${index}`} value={option.value} className="text-nrl-text">{option.label}</option>;
          })}
        </select>
        {description ? (
          <span className="pointer-events-none absolute inset-y-px left-3 right-8 flex min-w-0 items-center gap-2 bg-nrl-panel-2">
            <span className="max-w-[55%] shrink-0 truncate text-[10px] leading-none text-nrl-text">{selectedLabel}</span>
            <span className="min-w-0 truncate text-[8px] leading-none text-nrl-muted">{description}</span>
          </span>
        ) : null}
        <span className={`pointer-events-none absolute ${compact ? "right-2.5" : "right-3"} top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-r border-nrl-text`} />
      </div>
    </div>
  );
}

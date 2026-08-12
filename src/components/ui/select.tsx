"use client";

import { useId } from "react";

type SelectOption = string | { value: string; label: string };
type SelectOptionGroup = { label: string; options: SelectOption[] };

interface SelectProps {
  label: string;
  value: string;
  options: Array<SelectOption | SelectOptionGroup>;
  onChange: (value: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  compact?: boolean;
}

export function Select({ label, value, options, onChange, disabled = false, hideLabel = false, compact = false }: SelectProps) {
  const selectId = useId();

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
          className={`${compact ? "h-8 pl-2.5 pr-7" : "h-[34px] pl-3 pr-8"} w-full appearance-none rounded-md border border-nrl-border bg-nrl-panel-2 py-0 text-[10px] leading-normal text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {options.map((entry, index) => {
            if (typeof entry === "object" && "options" in entry) {
              return (
                <optgroup key={`${entry.label}-${index}`} label={entry.label}>
                  {entry.options.map((opt, optionIndex) => {
                    const option = typeof opt === "string" ? { value: opt, label: opt } : opt;
                    return <option key={`${option.value}-${optionIndex}`} value={option.value}>{option.label}</option>;
                  })}
                </optgroup>
              );
            }

            const option = typeof entry === "string" ? { value: entry, label: entry } : entry;
            return <option key={`${option.value}-${index}`} value={option.value}>{option.label}</option>;
          })}
        </select>
        <span className={`pointer-events-none absolute ${compact ? "right-2.5" : "right-3"} top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-r border-nrl-text`} />
      </div>
    </div>
  );
}

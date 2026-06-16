"use client";

type SelectOption = string | { value: string; label: string };

interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function Select({ label, value, options, onChange, disabled = false }: SelectProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-[34px] w-full appearance-none rounded-md border border-nrl-border bg-nrl-panel-2 py-0 pl-3 pr-8 text-[10px] leading-normal text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((opt, index) => {
            const option = typeof opt === "string" ? { value: opt, label: opt } : opt
            return (
              <option key={`${option.value}-${index}`} value={option.value}>
                {option.label}
              </option>
            )
          })}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-r border-nrl-text" />
      </div>
    </div>
  );
}

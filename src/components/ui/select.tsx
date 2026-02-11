"use client";

interface SelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function Select({ label, value, options, onChange, disabled = false }: SelectProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

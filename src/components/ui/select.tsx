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
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-50"
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

"use client";

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 80,
  step = 5,
}: NumberInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-nrl-muted">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
      />
    </div>
  );
}

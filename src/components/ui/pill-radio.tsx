"use client";

interface PillRadioProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PillRadio({ options, value, onChange, disabled = false }: PillRadioProps) {
  return (
    <div
      className={`inline-flex gap-0.5 rounded-lg border border-nrl-border bg-nrl-panel p-0.5 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
      aria-disabled={disabled}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-all ${
              active
                ? "bg-gradient-to-br from-nrl-accent to-nrl-accent text-black font-extrabold"
                : "text-nrl-muted hover:bg-nrl-panel-2 hover:text-nrl-text"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

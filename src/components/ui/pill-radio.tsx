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
      className={`inline-flex gap-1 rounded-xl border border-nrl-border bg-nrl-panel p-1 ${
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
            className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              active
                ? "bg-gradient-to-br from-nrl-accent to-[#a0e800] text-black font-extrabold"
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

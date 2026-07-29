"use client";

interface PillRadioProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
}

export function PillRadio({ options, value, onChange, disabled = false, variant = "solid" }: PillRadioProps) {
  const outlined = variant === "outline";
  return (
    <div
      className={`inline-flex ${outlined ? "gap-2" : "gap-0.5 rounded-lg border border-nrl-border bg-nrl-panel p-0.5"} ${
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
            className={`rounded-md font-bold uppercase tracking-wide transition-all ${outlined ? "border px-3 py-1.5 text-[10px]" : "px-2 py-1 text-[9px]"} ${
              outlined
                ? active
                  ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
                  : "border-nrl-border text-nrl-muted hover:text-nrl-text"
                : active
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

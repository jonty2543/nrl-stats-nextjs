"use client";

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm"
    >
      <div
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-nrl-accent" : "bg-nrl-border"
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-xs font-semibold uppercase text-nrl-muted">
        {label}
      </span>
    </button>
  );
}

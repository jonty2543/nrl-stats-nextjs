"use client";

interface CompetitionToggleProps {
  value: "nrl" | "cup";
  onChange: (value: "nrl" | "cup") => void;
  canAccessCup: boolean;
}

export function CompetitionToggle({ value, onChange, canAccessCup }: CompetitionToggleProps) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <span className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">Competition</span>
      <div className="flex h-8 rounded-md border border-nrl-border bg-nrl-panel-2 p-0.5">
        {(["nrl", "cup"] as const).map((option) => {
          const locked = option === "cup" && !canAccessCup;
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={locked}
              aria-pressed={active}
              title={locked ? "Cup stats require Pro or Premium access" : undefined}
              onClick={() => onChange(option)}
              className={`rounded px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                active ? "bg-nrl-accent text-[#07111f]" : "text-nrl-muted hover:text-nrl-text"
              }`}
            >
              {option === "nrl" ? "NRL" : locked ? "Cup Lock" : "Cup"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

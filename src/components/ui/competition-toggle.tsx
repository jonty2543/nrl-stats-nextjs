"use client";

interface CompetitionToggleProps {
  value: "nrl" | "cup";
  onChange: (value: "nrl" | "cup") => void;
  canAccessCup: boolean;
  hideLabel?: boolean;
  size?: "default" | "large";
  className?: string;
}

export function CompetitionToggle({ value, onChange, canAccessCup, hideLabel = false, size = "default", className = "" }: CompetitionToggleProps) {
  const large = size === "large";

  return (
    <div className={`flex shrink-0 flex-col gap-0.5 ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-[8px] font-semibold uppercase tracking-wide text-nrl-muted"}>Competition</span>
      <div className={`flex rounded-md border border-nrl-border bg-nrl-panel-2 p-0.5 ${large ? "h-10" : "h-8"}`}>
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
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded border py-1 font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${large ? "px-3 text-[11px]" : "px-2 text-[9px]"} ${
                active ? "border-nrl-accent text-nrl-accent" : "border-transparent text-nrl-muted hover:text-nrl-text"
              }`}
            >
              <span>{option === "nrl" ? "NRL" : "Cup"}</span>
              {locked ? (
                <span
                  aria-hidden="true"
                  className="rounded-sm border border-nrl-accent/60 px-0.5 py-px text-[5px] leading-none tracking-wide text-nrl-accent"
                >
                  Pro
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

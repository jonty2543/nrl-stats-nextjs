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
    <div className={`flex shrink-0 flex-col items-start gap-0.5 pl-2 ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-[8px] font-semibold uppercase tracking-wide text-nrl-muted"}>Competition</span>
      <div
        role="group"
        aria-label="Competition"
        className={`inline-flex w-fit items-stretch gap-6 border-b border-nrl-border/70 ${large ? "h-10" : "h-8"}`}
      >
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
              className={`relative inline-flex min-w-12 items-center justify-center gap-1.5 rounded-t-md border-b-[3px] px-1 font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${large ? "text-[11px]" : "text-[9px]"} ${
                active
                  ? "border-nrl-accent text-nrl-accent"
                  : "border-transparent text-nrl-muted hover:bg-nrl-panel-2/60 hover:text-nrl-text"
              }`}
            >
              <span>{option === "nrl" ? "NRL" : "Cup"}</span>
              {locked ? (
                <span
                  aria-hidden="true"
                  className="rounded-sm bg-nrl-accent px-1 py-0.5 text-[6px] leading-none tracking-wide text-nrl-bg"
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

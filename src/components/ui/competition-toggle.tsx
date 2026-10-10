"use client";

import Image from "next/image";

export type CompetitionToggleValue = "nrl" | "cup" | "international";

interface CompetitionToggleProps<T extends CompetitionToggleValue> {
  value: T;
  onChange: (value: T) => void;
  canAccessCup: boolean;
  showInternational?: boolean;
  hideLabel?: boolean;
  fullWidth?: boolean;
  size?: "default" | "large";
  className?: string;
}

export function CompetitionToggle<T extends CompetitionToggleValue>({ value, onChange, canAccessCup, showInternational = false, hideLabel = false, fullWidth = false, size = "default", className = "" }: CompetitionToggleProps<T>) {
  const large = size === "large";
  const options = (showInternational ? ["nrl", "cup", "international"] : ["nrl", "cup"]) as T[];

  return (
    <div className={`flex shrink-0 flex-col items-start gap-0.5 ${fullWidth ? "w-full" : "pl-2"} ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-[8px] font-semibold uppercase tracking-wide text-nrl-muted"}>Competition</span>
      <div
        role="group"
        aria-label="Competition"
        className={`${fullWidth ? `grid w-full ${showInternational ? "grid-cols-3" : "grid-cols-2"}` : "inline-flex w-fit gap-6"} items-stretch border-b border-nrl-border/70 ${large ? "h-10" : "h-8"}`}
      >
        {options.map((option) => {
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
              className={`relative inline-flex min-w-12 items-center justify-center gap-1.5 rounded-t-md border-b-[3px] border-transparent px-1 pb-1.5 font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${large ? "text-[11px]" : "text-[9px]"} ${
                active
                  ? "text-nrl-accent"
                  : "text-nrl-muted hover:bg-nrl-panel-2/60 hover:text-nrl-text"
              }`}
            >
              {active ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-[10%] -bottom-[3px] h-[3px] bg-nrl-accent" /> : null}
              <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden="true">
                {(option === "nrl"
                  ? ["/images/competitions/nrl.png"]
                  : option === "cup"
                    ? ["/images/competitions/nsw-cup.png", "/images/competitions/qld-cup.png"]
                    : ["/images/international-logos/new-zealand.png", "/images/international-logos/australia.svg"]
                ).map((logo) => (
                  <Image
                    key={logo}
                    src={logo}
                    alt=""
                    width={large ? 24 : 20}
                    height={large ? 24 : 20}
                    className="shrink-0 object-contain"
                  />
                ))}
              </span>
              <span>{option === "nrl" ? "NRL" : option === "cup" ? "Cup" : "Int"}</span>
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

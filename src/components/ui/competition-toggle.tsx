"use client";

import Image from "next/image";

export type CompetitionToggleValue = "nrl" | "cup" | "international" | "origin";

interface CompetitionToggleProps<T extends CompetitionToggleValue> {
  value: T;
  onChange: (value: T) => void;
  canAccessCup: boolean;
  showInternational?: boolean;
  showOrigin?: boolean;
  hideLabel?: boolean;
  fullWidth?: boolean;
  size?: "default" | "large";
  className?: string;
  logoOverrides?: Partial<Record<CompetitionToggleValue, string[]>>;
}

export function CompetitionToggle<T extends CompetitionToggleValue>({ value, onChange, canAccessCup, showInternational = false, showOrigin = false, hideLabel = false, fullWidth = false, size = "default", className = "", logoOverrides }: CompetitionToggleProps<T>) {
  const large = size === "large";
  const options = (["nrl", "cup", ...(showOrigin ? ["origin" as const] : []), ...(showInternational ? ["international" as const] : [])]) as T[];
  const compactTabs = options.length === 4;
  const logoSize = large ? (compactTabs ? 22 : 24) : (compactTabs ? 18 : 20);

  return (
    <div className={`flex shrink-0 flex-col items-start ${fullWidth ? "w-full" : "gap-0.5 pl-2"} ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-[8px] font-semibold uppercase tracking-wide text-nrl-muted"}>Competition</span>
      <div
        role="group"
        aria-label="Competition"
        className={`${fullWidth ? "flex h-[52px] w-full overflow-x-auto border-t" : `inline-flex w-fit gap-6 ${large ? "h-10" : "h-8"}`} items-stretch border-b border-nrl-border/70`}
      >
        {options.map((option) => {
          const locked = option !== "nrl" && !canAccessCup;
          const active = value === option;
          const competitionLabel = option === "cup" ? "Cup" : option === "origin" ? "Origin" : "International";
          return (
            <button
              key={option}
              type="button"
              disabled={locked}
              aria-pressed={active}
              title={locked ? `${competitionLabel} stats require Pro or Premium access` : undefined}
              onClick={() => onChange(option)}
              className={`relative inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${fullWidth ? "gap-1.5 px-[14px] font-[family-name:var(--font-table-sans)] text-[9px] font-bold uppercase tracking-[0.1em] sm:px-[18px]" : `min-w-12 gap-1.5 px-1 font-black uppercase tracking-wide ${large ? compactTabs ? "text-[10px]" : "text-[11px]" : compactTabs ? "text-[8px]" : "text-[9px]"}`} ${
                active
                  ? "bg-nrl-inset text-white"
                  : "text-nrl-muted hover:bg-nrl-panel-2/60 hover:text-nrl-text"
              }`}
            >
              <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden="true">
                {(logoOverrides?.[option] ?? (option === "nrl"
                  ? ["/images/competitions/nrl.png"]
                  : option === "cup"
                    ? ["/images/competitions/nsw-cup.png", "/images/competitions/qld-cup.png"]
                    : option === "origin"
                      ? ["/nsw.png", "/qld.png"]
                    : ["/images/international-logos/new-zealand.png", "/images/international-logos/australia.svg"]
                )).map((logo) => (
                  <Image
                    key={logo}
                    src={logo}
                    alt=""
                    width={logoSize}
                    height={logoSize}
                    className="shrink-0 object-contain"
                  />
                ))}
              </span>
              <span>{option === "nrl" ? "NRL" : option === "cup" ? "Cup" : option === "origin" ? "Origin" : "Int"}</span>
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

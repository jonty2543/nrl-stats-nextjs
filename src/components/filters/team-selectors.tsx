"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";

interface TeamSelectorsProps {
  teamList: string[];
  team1: string;
  onTeam1Change: (t: string) => void;
  team1Perspective: "For" | "Against";
  onTeam1PerspectiveChange: (value: "For" | "Against") => void;
  team2: string;
  onTeam2Change: (t: string) => void;
  team2Perspective: "For" | "Against";
  onTeam2PerspectiveChange: (value: "For" | "Against") => void;
  statList: string[];
  stat1: string;
  onStat1Change: (s: string) => void;
  stat2: string;
  onStat2Change: (s: string) => void;
}

export function TeamSelectors({
  teamList,
  team1,
  onTeam1Change,
  team1Perspective,
  onTeam1PerspectiveChange,
  team2,
  onTeam2Change,
  team2Perspective,
  onTeam2PerspectiveChange,
  statList,
  stat1,
  onStat1Change,
  stat2,
  onStat2Change,
}: TeamSelectorsProps) {
  const renderPerspectiveToggle = (
    label: string,
    value: "For" | "Against",
    onChange: (next: "For" | "Against") => void
  ) => (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">{label}</div>
      <div className="inline-flex rounded-md border border-nrl-border bg-nrl-panel-2 p-1">
        {(["For", "Against"] as const).map((option) => {
          const active = option === value;
          return (
            <button
              key={`${label}-${option}`}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-nrl-accent/15 text-nrl-accent"
                  : "text-nrl-muted hover:text-nrl-text"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5 md:grid-cols-2">
        <SearchableSelect
          label="Team 1"
          value={team1}
          options={teamList}
          onChange={onTeam1Change}
        />
        {renderPerspectiveToggle("Team 1 View", team1Perspective, onTeam1PerspectiveChange)}
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        <SearchableSelect
          label="Team 2 (Optional)"
          value={team2}
          options={["None", ...teamList]}
          onChange={onTeam2Change}
        />
        {renderPerspectiveToggle("Team 2 View", team2Perspective, onTeam2PerspectiveChange)}
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        <SearchableSelect
          label="Stat 1"
          value={stat1}
          options={statList}
          onChange={onStat1Change}
        />
        <SearchableSelect
          label="Stat 2 (Optional)"
          value={stat2}
          options={["None", ...statList]}
          onChange={onStat2Change}
        />
      </div>
    </div>
  );
}

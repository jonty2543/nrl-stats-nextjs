"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";

interface TeamSelectorsProps {
  teamList: string[];
  team1: string;
  onTeam1Change: (t: string) => void;
  team2: string;
  onTeam2Change: (t: string) => void;
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
  team2,
  onTeam2Change,
  statList,
  stat1,
  onStat1Change,
  stat2,
  onStat2Change,
}: TeamSelectorsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <SearchableSelect
          label="Team 1"
          value={team1}
          options={teamList}
          onChange={onTeam1Change}
        />
        <SearchableSelect
          label="Team 2 (Optional)"
          value={team2}
          options={["None", ...teamList]}
          onChange={onTeam2Change}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
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

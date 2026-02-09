"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { PillRadio } from "@/components/ui/pill-radio";
import { Select } from "@/components/ui/select";

type TeammateMode = "both" | "with" | "without";

interface PlayerSelectorsProps {
  positions: string[];
  playerList: string[];
  // Player 1
  player1: string;
  onPlayer1Change: (p: string) => void;
  player1Position: string;
  onPlayer1PositionChange: (position: string) => void;
  teammate1Options: string[];
  teammate1: string;
  onTeammate1Change: (t: string) => void;
  teammate1Position: string;
  onTeammate1PositionChange: (position: string) => void;
  teammateMode1: TeammateMode;
  onTeammateMode1Change: (mode: TeammateMode) => void;
  // Player 2
  player2Options: string[];
  player2: string;
  onPlayer2Change: (p: string) => void;
  player2Position: string;
  onPlayer2PositionChange: (position: string) => void;
  teammate2Options: string[];
  teammate2: string;
  onTeammate2Change: (t: string) => void;
  teammate2Position: string;
  onTeammate2PositionChange: (position: string) => void;
  teammateMode2: TeammateMode;
  onTeammateMode2Change: (mode: TeammateMode) => void;
  // Stats
  statList: string[];
  stat1: string;
  onStat1Change: (s: string) => void;
  stat2: string;
  onStat2Change: (s: string) => void;
}

export function PlayerSelectors({
  positions,
  playerList,
  player1,
  onPlayer1Change,
  player1Position,
  onPlayer1PositionChange,
  teammate1Options,
  teammate1,
  onTeammate1Change,
  teammate1Position,
  onTeammate1PositionChange,
  teammateMode1,
  onTeammateMode1Change,
  player2Options,
  player2,
  onPlayer2Change,
  player2Position,
  onPlayer2PositionChange,
  teammate2Options,
  teammate2,
  onTeammate2Change,
  teammate2Position,
  onTeammate2PositionChange,
  teammateMode2,
  onTeammateMode2Change,
  statList,
  stat1,
  onStat1Change,
  stat2,
  onStat2Change,
}: PlayerSelectorsProps) {
  const teammateModeOptions: TeammateMode[] = ["both", "with", "without"];
  const toDisplay = (mode: TeammateMode) => mode[0].toUpperCase() + mode.slice(1);
  const fromDisplay = (value: string): TeammateMode => value.toLowerCase() as TeammateMode;
  const canSetPlayer1None = player2 !== "None";
  const player1Options = canSetPlayer1None ? ["None", ...playerList] : playerList;

  return (
    <div className="space-y-3">
      {/* Player 1 row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px] gap-3">
          <SearchableSelect
            label="Player 1"
            value={player1}
            options={player1Options}
            onChange={onPlayer1Change}
          />
          <Select
            label="Position"
            value={player1Position}
            options={["All", ...positions]}
            onChange={onPlayer1PositionChange}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-3 items-end">
          <div className="sm:col-span-2">
            <SearchableSelect
              label="Teammate"
              value={teammate1}
              options={["None", ...teammate1Options]}
              onChange={onTeammate1Change}
              disabled={player1 === "None"}
            />
          </div>
          {teammate1 !== "None" && (
            <Select
              label="Tm Position"
              value={teammate1Position}
              options={["All", ...positions]}
              onChange={onTeammate1PositionChange}
              disabled={player1 === "None"}
            />
          )}
          {teammate1 !== "None" && (
            <div className="pb-0.5">
              <PillRadio
                options={teammateModeOptions.map(toDisplay)}
                value={toDisplay(teammateMode1)}
                onChange={(v) => onTeammateMode1Change(fromDisplay(v))}
                disabled={player1 === "None"}
              />
            </div>
          )}
        </div>
      </div>

      {/* Player 2 row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px] gap-3">
          <SearchableSelect
            label="Player 2 (Optional)"
            value={player2}
            options={["None", ...player2Options]}
            onChange={onPlayer2Change}
          />
          <Select
            label="Position"
            value={player2Position}
            options={["All", ...positions]}
            onChange={onPlayer2PositionChange}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-3 items-end">
          <div className="sm:col-span-2">
            <SearchableSelect
              label="Teammate"
              value={teammate2}
              options={["None", ...teammate2Options]}
              onChange={onTeammate2Change}
              disabled={player2 === "None"}
            />
          </div>
          {teammate2 !== "None" && (
            <Select
              label="Tm Position"
              value={teammate2Position}
              options={["All", ...positions]}
              onChange={onTeammate2PositionChange}
              disabled={player2 === "None"}
            />
          )}
          {teammate2 !== "None" && (
            <div className="pb-0.5">
              <PillRadio
                options={teammateModeOptions.map(toDisplay)}
                value={toDisplay(teammateMode2)}
                onChange={(v) => onTeammateMode2Change(fromDisplay(v))}
                disabled={player2 === "None"}
              />
            </div>
          )}
        </div>
      </div>

      {/* Stat selectors */}
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

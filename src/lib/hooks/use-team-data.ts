"use client";

import { useMemo } from "react";
import { usePlayerData } from "./use-player-data";
import { aggregateTeamStats } from "@/lib/data/transform";
import type { PlayerStat, TeamStat } from "@/lib/data/types";

export function useTeamData(initialData?: PlayerStat[]) {
  const { data: playerData, ...rest } = usePlayerData(initialData);

  const teamData: TeamStat[] = useMemo(() => {
    if (!playerData || playerData.length === 0) return [];
    return aggregateTeamStats(playerData);
  }, [playerData]);

  return { data: teamData, ...rest };
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { PlayerStat } from "@/lib/data/types";

async function fetchPlayerData(): Promise<PlayerStat[]> {
  const res = await fetch("/api/player-stats");
  if (!res.ok) throw new Error("Failed to fetch player stats");
  return res.json();
}

export function usePlayerData(initialData?: PlayerStat[]) {
  return useQuery({
    queryKey: ["player-stats"],
    queryFn: fetchPlayerData,
    initialData,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

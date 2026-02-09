import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { mean } from "@/lib/data/stats";

interface ProfileCardProps {
  name: string;
  rows: (PlayerStat | TeamStat)[];
  entity: "player" | "team";
}

export function ProfileCard({ name, rows, entity }: ProfileCardProps) {
  if (rows.length === 0) return null;

  const games = rows.length;
  let detail: string;

  if (entity === "player") {
    const playerRows = rows as PlayerStat[];
    const teamCounts = new Map<string, number>();
    const posCounts = new Map<string, number>();
    for (const r of playerRows) {
      teamCounts.set(r.Team, (teamCounts.get(r.Team) ?? 0) + 1);
      posCounts.set(r.Position, (posCounts.get(r.Position) ?? 0) + 1);
    }
    const team = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "\u2014";
    const position = [...posCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "\u2014";
    const avgMins = mean(playerRows.map((r) => r["Mins Played"]));
    detail = `${team} \u2022 ${position} \u2022 ${games} games \u2022 ${avgMins.toFixed(0)} avg mins`;
  } else {
    const teamRows = rows as TeamStat[];
    const avgPts = mean(teamRows.map((r) => r.Points));
    detail = `${games} matches \u2022 ${avgPts.toFixed(1)} avg pts`;
  }

  return (
    <div className="mb-1">
      <div className="text-sm font-bold uppercase tracking-wide text-chart-primary">
        {name}
      </div>
      <div className="text-[0.72rem] text-nrl-muted mt-0.5">{detail}</div>
    </div>
  );
}

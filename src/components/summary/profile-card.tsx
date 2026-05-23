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
  let details: string[];

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
    details = [team, position, `${games} games`, `${avgMins.toFixed(0)} avg mins`];
  } else {
    const teamRows = rows as TeamStat[];
    const avgPts = mean(teamRows.map((r) => r.Points));
    details = [`${games} matches`, `${avgPts.toFixed(1)} avg pts`];
  }

  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-bold uppercase tracking-wide text-chart-primary">
        {name}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {details.map((detail) => (
          <span
            key={detail}
            className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[0.68rem] font-semibold text-nrl-muted"
          >
            {detail}
          </span>
        ))}
      </div>
    </div>
  );
}

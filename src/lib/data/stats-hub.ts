import type { PlayerStat, TeamStat } from "@/lib/data/types";

export type StatsHubCategory =
  | "Most Surprising Stats"
  | "Statistical Outliers"
  | "Due / Regression Candidates"
  | "This Week's Weird Stats"
  | "Historical Comparisons";

export interface StatsHubInsight {
  id: string;
  category: StatsHubCategory;
  title: string;
  detail: string;
  score: number;
  statLabel: string;
  statValue: string;
  context: string;
  entityType: "player" | "team";
  entityName: string;
  team: string | null;
  visualMode?: "metric" | "narrative";
  metrics?: Array<{ label: string; value: string; tone?: "up" | "down" | "neutral" }>;
}

export interface StatsHubModel {
  year: string;
  round: number | null;
  roundLabel: string;
  generatedAtLabel: string;
  insights: StatsHubInsight[];
  categories: Array<{ category: StatsHubCategory; insights: StatsHubInsight[] }>;
}

const CATEGORY_ORDER: StatsHubCategory[] = [
  "Most Surprising Stats",
  "Statistical Outliers",
  "Due / Regression Candidates",
  "This Week's Weird Stats",
  "Historical Comparisons",
];

const PLAYER_OUTLIER_STATS = [
  { key: "Tackle Breaks", label: "tackle breaks", minAverage: 1 },
  { key: "All Run Metres", label: "run metres", minAverage: 70 },
  { key: "Tackles Made", label: "tackles", minAverage: 18 },
  { key: "Post Contact Metres", label: "post-contact metres", minAverage: 25 },
  { key: "Offloads", label: "offloads", minAverage: 0.7 },
] as const;

const MIN_PRIOR_GAMES = 5;

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 10) return Math.round(value).toString();
  return value.toFixed(1).replace(/\.0$/, "");
}

function insightId(prefix: string, parts: Array<string | number>): string {
  return `${prefix}-${parts.join("-")}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function playerKey(row: PlayerStat): string {
  return `${row.Name}|${row.Year}`;
}

function teamMatchKey(row: Pick<TeamStat, "Team" | "Year" | "Round">): string {
  return `${row.Team}|${row.Year}|${row.Round}`;
}

function roundLabel(year: string, round: number | null, playerRows: PlayerStat[], teamRows: TeamStat[]): string {
  const label =
    playerRows.find((row) => row.Year === year && row.Round === round)?.Round_Label ??
    teamRows.find((row) => row.Year === year && row.Round === round)?.Round_Label;
  if (!label || label === String(round)) return round == null ? "Latest round" : `Round ${round}`;
  return label;
}

function latestRoundForRows(rows: Array<Pick<PlayerStat, "Year" | "Round"> | Pick<TeamStat, "Year" | "Round">>): { year: string; round: number | null } {
  const candidates = rows
    .filter((row) => row.Year && Number.isFinite(row.Round))
    .sort((a, b) => b.Year.localeCompare(a.Year) || numeric(b.Round) - numeric(a.Round));
  const latest = candidates[0];
  return latest ? { year: latest.Year, round: latest.Round } : { year: "", round: null };
}

function buildPlayerGroups(rows: PlayerStat[]): Map<string, PlayerStat[]> {
  const groups = new Map<string, PlayerStat[]>();
  rows.forEach((row) => {
    const key = playerKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  groups.forEach((group) => {
    group.sort((a, b) => a.Round - b.Round);
  });
  return groups;
}

function buildTeamGroups(rows: TeamStat[]): Map<string, TeamStat[]> {
  const groups = new Map<string, TeamStat[]>();
  rows.forEach((row) => {
    const key = `${row.Team}|${row.Year}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  groups.forEach((group) => {
    group.sort((a, b) => a.Round - b.Round);
  });
  return groups;
}

function minimumAverageMinutesForPosition(position: string | null | undefined): number {
  switch ((position ?? "").toLowerCase()) {
    case "prop":
      return 32;
    case "hooker":
      return 45;
    case "lock":
    case "second row":
      return 50;
    case "interchange":
    case "bench":
      return 25;
    case "winger":
    case "centre":
    case "fullback":
    case "halfback":
    case "five-eighth":
      return 65;
    default:
      return 45;
  }
}

function eligiblePriorRows(row: PlayerStat, playerGroups: Map<string, PlayerStat[]>): PlayerStat[] {
  const priorRows = (playerGroups.get(playerKey(row)) ?? []).filter((candidate) => candidate.Round < row.Round);
  if (priorRows.length < MIN_PRIOR_GAMES) return [];
  const averageMinutes = average(priorRows.map((candidate) => numeric(candidate["Mins Played"]))) ?? 0;
  return averageMinutes >= minimumAverageMinutesForPosition(row.Position) ? priorRows : [];
}

function buildOutlierInsights(latestRows: PlayerStat[], playerGroups: Map<string, PlayerStat[]>): StatsHubInsight[] {
  const insights: StatsHubInsight[] = [];

  latestRows.forEach((row) => {
    const priorRows = eligiblePriorRows(row, playerGroups);
    if (priorRows.length === 0) return;

    PLAYER_OUTLIER_STATS.forEach((stat) => {
      const baseline = average(priorRows.map((candidate) => numeric(candidate[stat.key])));
      if (baseline == null || baseline < stat.minAverage) return;

      const value = numeric(row[stat.key]);
      const diff = value - baseline;
      if (diff <= Math.max(4, baseline * 0.25)) return;

      insights.push({
        id: insightId("outlier", [row.Name, stat.key, row.Year, row.Round]),
        category: "Statistical Outliers",
        title: row.Name,
        detail: "",
        score: Math.round(diff),
        statLabel: stat.label,
        statValue: `+${formatNumber(diff)}`,
        context: `${row.Team} ${row.Position}`,
        entityType: "player",
        entityName: row.Name,
        team: row.Team,
        visualMode: "metric",
        metrics: [
          { label: "Last Week", value: `${formatNumber(value)} ${stat.label}`, tone: "up" },
          { label: "Season Prior Average", value: `${formatNumber(baseline)} ${stat.label}` },
          { label: "Difference", value: `+${formatNumber(diff)} ${stat.label}`, tone: "up" },
        ],
      });
    });
  });

  return insights;
}

function buildDueInsights(latestRows: PlayerStat[], playerGroups: Map<string, PlayerStat[]>): StatsHubInsight[] {
  const insights: StatsHubInsight[] = [];

  latestRows.forEach((latestRow) => {
    const priorRows = eligiblePriorRows(latestRow, playerGroups);
    if (priorRows.length === 0) return;
    const rows = playerGroups.get(playerKey(latestRow)) ?? [];
    if (rows.length < 4) return;

    const countDryRounds = (stat: "Tries" | "Line Breaks" | "Fantasy", threshold: number) => {
      let dryRounds = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (numeric(rows[index][stat]) >= threshold) break;
        dryRounds += 1;
      }
      return dryRounds;
    };

    const tryAverage = average(priorRows.map((row) => numeric(row.Tries)));
    const tryDryRounds = countDryRounds("Tries", 1);
    if (tryAverage != null && tryAverage >= 0.15 && tryDryRounds >= 3) {
      insights.push({
        id: insightId("due-tries", [latestRow.Name, latestRow.Year, latestRow.Round]),
        category: "Due / Regression Candidates",
        title: `${latestRow.Name}: overdue try scorer`,
        detail: "",
        score: tryDryRounds * 12 + Math.round(tryAverage * 30),
        statLabel: "try drought",
        statValue: `${tryDryRounds} games`,
        context: `${latestRow.Team} ${latestRow.Position}`,
        entityType: "player",
        entityName: latestRow.Name,
        team: latestRow.Team,
        visualMode: "metric",
        metrics: [
          { label: "Current Drought", value: `${tryDryRounds} games`, tone: "down" },
          { label: "Prior Average", value: `${formatNumber(tryAverage)} tries / game` },
          { label: "Latest Game", value: `${formatNumber(numeric(latestRow.Tries))} tries` },
        ],
      });
    }

    const linebreakAverage = average(priorRows.map((row) => numeric(row["Line Breaks"])));
    const linebreakDryRounds = countDryRounds("Line Breaks", 1);
    if (linebreakAverage != null && linebreakAverage >= 0.12 && linebreakDryRounds >= 3) {
      insights.push({
        id: insightId("due-linebreaks", [latestRow.Name, latestRow.Year, latestRow.Round]),
        category: "Due / Regression Candidates",
        title: `${latestRow.Name}: overdue linebreak`,
        detail: "",
        score: linebreakDryRounds * 10 + Math.round(linebreakAverage * 30),
        statLabel: "LB drought",
        statValue: `${linebreakDryRounds} games`,
        context: `${latestRow.Team} ${latestRow.Position}`,
        entityType: "player",
        entityName: latestRow.Name,
        team: latestRow.Team,
        visualMode: "metric",
        metrics: [
          { label: "Current Drought", value: `${linebreakDryRounds} games`, tone: "down" },
          { label: "Prior Average", value: `${formatNumber(linebreakAverage)} linebreaks / game` },
          { label: "Latest Game", value: `${formatNumber(numeric(latestRow["Line Breaks"]))} linebreaks` },
        ],
      });
    }

    const fantasyAverage = average(priorRows.map((row) => numeric(row.Fantasy)));
    const fantasyDryRounds = countDryRounds("Fantasy", 50);
    if (fantasyAverage != null && fantasyAverage >= 38 && fantasyDryRounds >= 2) {
      insights.push({
        id: insightId("due-fantasy", [latestRow.Name, latestRow.Year, latestRow.Round]),
        category: "Due / Regression Candidates",
        title: `${latestRow.Name}: due a fantasy spike`,
        detail: "",
        score: fantasyDryRounds * 11 + Math.round(fantasyAverage / 2),
        statLabel: "50+ drought",
        statValue: `${fantasyDryRounds} games`,
        context: `${latestRow.Team} ${latestRow.Position}`,
        entityType: "player",
        entityName: latestRow.Name,
        team: latestRow.Team,
        visualMode: "metric",
        metrics: [
          { label: "50+ Score Drought", value: `${fantasyDryRounds} games`, tone: "down" },
          { label: "Season Prior Average", value: `${formatNumber(fantasyAverage)} fantasy` },
          { label: "Latest Game", value: `${formatNumber(numeric(latestRow.Fantasy))} fantasy` },
        ],
      });
    }
  });

  return insights;
}

function buildPlayerTrendInsights(latestRows: PlayerStat[], playerGroups: Map<string, PlayerStat[]>): StatsHubInsight[] {
  const specs = [
    { key: "All Run Metres", label: "run metres", minPrior: 70, minDiff: 35, limit: 4 },
    { key: "Tackle Breaks", label: "tackle breaks", minPrior: 1, minDiff: 2, limit: 4 },
    { key: "Tackles Made", label: "tackles", minPrior: 18, minDiff: 8, limit: 3 },
    { key: "Post Contact Metres", label: "post-contact metres", minPrior: 25, minDiff: 16, limit: 3 },
    { key: "Offloads", label: "offloads", minPrior: 0.7, minDiff: 1.1, limit: 2 },
  ] as const;

  return specs.flatMap((spec) => {
    const candidates = latestRows
      .map((row) => {
        const rows = playerGroups.get(playerKey(row)) ?? [];
        const rowIndex = rows.findIndex((candidate) => candidate.Year === row.Year && candidate.Round === row.Round);
        if (rowIndex < 0) return null;
        const recentRows = rows.slice(Math.max(0, rowIndex - 2), rowIndex + 1);
        const priorRows = rows.slice(0, Math.max(0, rowIndex - 2));
        if (recentRows.length < 3 || priorRows.length < MIN_PRIOR_GAMES) return null;
        const averageMinutes = average(priorRows.map((candidate) => numeric(candidate["Mins Played"]))) ?? 0;
        if (averageMinutes < minimumAverageMinutesForPosition(row.Position)) return null;
        const recentAverage = average(recentRows.map((candidate) => numeric(candidate[spec.key])));
        const priorAverage = average(priorRows.map((candidate) => numeric(candidate[spec.key])));
        if (recentAverage == null || priorAverage == null || priorAverage < spec.minPrior) return null;
        const diff = recentAverage - priorAverage;
        if (diff < spec.minDiff) return null;
        return { row, recentAverage, priorAverage, diff };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, spec.limit);

    return candidates.map(({ row, recentAverage, priorAverage, diff }) => ({
      id: insightId("player-trend", [row.Name, spec.key, row.Year, row.Round]),
      category: "Statistical Outliers" as const,
      title: `${row.Name}: ${spec.label} surge`,
      detail: "",
      score: diff,
      statLabel: spec.label,
      statValue: `+${formatNumber(diff)}`,
      context: `${row.Team} ${row.Position}`,
      entityType: "player" as const,
      entityName: row.Name,
      team: row.Team,
      visualMode: "metric" as const,
      metrics: [
        { label: "Last 3 Avg", value: `${formatNumber(recentAverage)} ${spec.label}`, tone: "up" as const },
        { label: "Season Prior Avg", value: `${formatNumber(priorAverage)} ${spec.label}` },
        { label: "Difference", value: `+${formatNumber(diff)} ${spec.label}`, tone: "up" as const },
      ],
    }));
  });
}

function buildTeamTrendInsights(latestRows: TeamStat[], teamGroups: Map<string, TeamStat[]>): StatsHubInsight[] {
  const specs = [
    { key: "Points", label: "points", minPrior: 12, minDiff: 7, direction: "up", limit: 3 },
    { key: "Tries", label: "tries", minPrior: 2, minDiff: 1.5, direction: "up", limit: 3 },
    { key: "Tackle Breaks", label: "tackle breaks", minPrior: 20, minDiff: 8, direction: "up", limit: 2 },
    { key: "Opponent Points", label: "points conceded", minPrior: 12, minDiff: 8, direction: "down", limit: 3 },
  ] as const;

  return specs.flatMap((spec) => {
    const candidates = latestRows
      .map((row) => {
        const rows = teamGroups.get(`${row.Team}|${row.Year}`) ?? [];
        const rowIndex = rows.findIndex((candidate) => candidate.Round === row.Round);
        if (rowIndex < 0) return null;
        const recentRows = rows.slice(Math.max(0, rowIndex - 2), rowIndex + 1);
        const priorRows = rows.slice(0, Math.max(0, rowIndex - 2));
        if (recentRows.length < 3 || priorRows.length < 5) return null;
        const recentAverage = average(recentRows.map((candidate) => numeric(candidate[spec.key])));
        const priorAverage = average(priorRows.map((candidate) => numeric(candidate[spec.key])));
        if (recentAverage == null || priorAverage == null || priorAverage < spec.minPrior) return null;
        const diff = recentAverage - priorAverage;
        if (Math.abs(diff) < spec.minDiff) return null;
        if (spec.direction === "up" && diff < 0) return null;
        if (spec.direction === "down" && diff < 0) return null;
        return { row, recentAverage, priorAverage, diff };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, spec.limit);

    return candidates.map(({ row, recentAverage, priorAverage, diff }) => {
      const tone = spec.direction === "down" ? "down" as const : "up" as const;
      return {
        id: insightId("team-trend", [row.Team, spec.key, row.Year, row.Round]),
        category: "Most Surprising Stats" as const,
        title: `${row.Team}: ${spec.label} trend`,
        detail: "",
        score: Math.abs(diff) + (row.Result === "Win" ? 4 : 0),
        statLabel: spec.label,
        statValue: `${diff >= 0 ? "+" : ""}${formatNumber(diff)}`,
        context: `${row.Team} ${row.Result.toLowerCase()}`,
        entityType: "team" as const,
        entityName: row.Team,
        team: row.Team,
        visualMode: "metric" as const,
        metrics: [
          { label: "Last 3 Avg", value: `${formatNumber(recentAverage)} ${spec.label}`, tone },
          { label: "Season Prior Avg", value: `${formatNumber(priorAverage)} ${spec.label}` },
          { label: "Difference", value: `${diff >= 0 ? "+" : ""}${formatNumber(diff)} ${spec.label}`, tone },
        ],
      };
    });
  });
}

function buildWeirdTeamInsights(latestRows: TeamStat[]): StatsHubInsight[] {
  const insights: StatsHubInsight[] = [];

  latestRows.forEach((row) => {
    const opponentRow = latestRows.find((candidate) => candidate.Team === row.Opponent && candidate.Opponent === row.Team && candidate.Year === row.Year && candidate.Round === row.Round);

    if (row.Result === "Win" && numeric(row["Possession %"]) <= 40) {
      insights.push({
        id: insightId("low-possession-win", [row.Team, row.Year, row.Round]),
        category: "This Week's Weird Stats",
        title: `${row.Team} won with only ${formatNumber(numeric(row["Possession %"]))}% possession.`,
        detail: `${row.Team} beat ${row.Opponent ?? "their opponent"} despite losing the possession count ${formatNumber(numeric(row["Possession %"]))}% to ${formatNumber(numeric(row["Opponent Possession %"]))}%.`,
        score: 95 - numeric(row["Possession %"]) + Math.abs(numeric(row.Margin)),
        statLabel: "possession",
        statValue: `${formatNumber(numeric(row["Possession %"]))}%`,
        context: `${row.Team} ${row.Result.toLowerCase()} by ${Math.abs(numeric(row.Margin))}`,
        entityType: "team",
        entityName: row.Team,
        team: row.Team,
      });
    }

    if (row.Result === "Loss" && numeric(row.Tries) >= 5) {
      insights.push({
        id: insightId("five-tries-loss", [row.Team, row.Year, row.Round]),
        category: "Most Surprising Stats",
        title: `${row.Team} scored ${numeric(row.Tries)} tries and still lost.`,
        detail: `${row.Team} put ${numeric(row.Tries)} tries on ${row.Opponent ?? "their opponent"} but finished ${Math.abs(numeric(row.Margin))} points short.`,
        score: numeric(row.Tries) * 18 + Math.abs(numeric(row.Margin)),
        statLabel: "tries",
        statValue: formatNumber(numeric(row.Tries)),
        context: `${row.Team} loss`,
        entityType: "team",
        entityName: row.Team,
        team: row.Team,
      });
    }

    if (row.Result === "Loss" && opponentRow && numeric(row.Tries) > numeric(opponentRow.Tries)) {
      insights.push({
        id: insightId("tries-loss", [row.Team, row.Year, row.Round]),
        category: "Most Surprising Stats",
        title: `${row.Team} lost despite scoring more tries.`,
        detail: `${row.Team} scored ${numeric(row.Tries)} tries to ${row.Opponent ?? "their opponent"}'s ${numeric(opponentRow.Tries)}, but still lost by ${Math.abs(numeric(row.Margin))}.`,
        score: 90 + (numeric(row.Tries) - numeric(opponentRow.Tries)) * 14,
        statLabel: "try edge",
        statValue: `+${formatNumber(numeric(row.Tries) - numeric(opponentRow.Tries))}`,
        context: `${row.Team} loss`,
        entityType: "team",
        entityName: row.Team,
        team: row.Team,
      });
    }

    const opponentMetres = opponentRow?.["All Run Metres"];
    if (row.Result === "Win" && typeof opponentMetres === "number" && numeric(row["All Run Metres"]) + 100 < opponentMetres && numeric(row.Margin) >= 12) {
      insights.push({
        id: insightId("metres-win", [row.Team, row.Year, row.Round]),
        category: "This Week's Weird Stats",
        title: `${row.Team} won by ${numeric(row.Margin)} despite losing the run metre battle.`,
        detail: `${row.Team} ran for ${formatNumber(numeric(row["All Run Metres"]))}m, ${formatNumber(opponentMetres - numeric(row["All Run Metres"]))}m fewer than ${row.Opponent ?? "their opponent"}.`,
        score: numeric(row.Margin) * 2 + (opponentMetres - numeric(row["All Run Metres"])) / 10,
        statLabel: "metre gap",
        statValue: `-${formatNumber(opponentMetres - numeric(row["All Run Metres"]))}m`,
        context: `${row.Team} win`,
        entityType: "team",
        entityName: row.Team,
        team: row.Team,
      });
    }
  });

  return insights;
}

function buildScoringStreakInsights(latestRows: PlayerStat[], allRows: PlayerStat[], teamRows: TeamStat[]): StatsHubInsight[] {
  const resultByTeamRound = new Map(teamRows.map((row) => [teamMatchKey(row), row.Result]));
  const insights: StatsHubInsight[] = [];

  latestRows
    .filter((row) => numeric(row.Tries) > 0)
    .forEach((latestRow) => {
      if (resultByTeamRound.get(teamMatchKey(latestRow)) !== "Win") return;
      const scoringRows = allRows
        .filter((row) => row.Name === latestRow.Name && numeric(row.Tries) > 0)
        .sort((a, b) => b.Year.localeCompare(a.Year) || b.Round - a.Round);
      let streak = 0;
      for (const row of scoringRows) {
        if (resultByTeamRound.get(teamMatchKey(row)) !== "Win") break;
        streak += 1;
      }
      if (streak >= 4) {
        insights.push({
          id: insightId("scoring-win-streak", [latestRow.Name, latestRow.Year, latestRow.Round]),
          category: "Most Surprising Stats",
          title: `${latestRow.Team} have won ${streak} straight when ${latestRow.Name} scores.`,
          detail: `${latestRow.Name} crossed again this round, and ${latestRow.Team} kept their scoring-game win streak alive.`,
          score: streak * 18 + numeric(latestRow.Tries) * 10,
          statLabel: "streak",
          statValue: `${streak} wins`,
          context: `${latestRow.Name} try games`,
          entityType: "player",
          entityName: latestRow.Name,
          team: latestRow.Team,
        });
      }
    });

  return insights;
}

function buildHistoricalInsights(latestRows: PlayerStat[], allRows: PlayerStat[], latestTeamRows: TeamStat[], allTeamRows: TeamStat[]): StatsHubInsight[] {
  const insights: StatsHubInsight[] = [];

  latestRows.forEach((row) => {
    const checks = [
      {
        ok: numeric(row["Tackle Breaks"]) >= 10 && numeric(row.Tries) >= 2,
        label: "10 tackle breaks and 2 tries",
        value: `${formatNumber(numeric(row["Tackle Breaks"]))} TB, ${formatNumber(numeric(row.Tries))} tries`,
        description: `${row.Name} had ${formatNumber(numeric(row["Tackle Breaks"]))} tackle breaks and ${formatNumber(numeric(row.Tries))} tries in the same game.`,
        score: 92,
      },
      {
        ok: numeric(row["All Run Metres"]) >= 300,
        label: "300+ run metres",
        value: `${formatNumber(numeric(row["All Run Metres"]))}m`,
        description: `${row.Name} cracked 300 run metres, one of the clearest rare base-stat games.`,
        score: numeric(row["All Run Metres"]) / 3,
      },
    ];

    checks.forEach((check) => {
      if (!check.ok) return;
      const previous = allRows
        .filter((candidate) => candidate.Name !== row.Name || candidate.Year !== row.Year || candidate.Round !== row.Round)
        .filter((candidate) => {
          if (check.label === "10 tackle breaks and 2 tries") return numeric(candidate["Tackle Breaks"]) >= 10 && numeric(candidate.Tries) >= 2;
          return numeric(candidate["All Run Metres"]) >= 300;
        })
        .filter((candidate) => candidate.Year !== row.Year || candidate.Round < row.Round - 1)
        .sort((a, b) => b.Year.localeCompare(a.Year) || b.Round - a.Round)[0];

      insights.push({
        id: insightId("historical", [check.label, row.Name, row.Year, row.Round]),
        category: "Historical Comparisons",
        title: previous
          ? `${row.Name} joined a rare ${check.label} list.`
          : `${row.Name} produced a rare ${check.label}.`,
        detail: previous
          ? `${check.description} The previous loaded example was ${previous.Name} in ${previous.Round_Label || `Round ${previous.Round}`}, ${previous.Year}.`
          : `${check.description} No earlier loaded example appears in this dataset.`,
        score: check.score,
        statLabel: check.label,
        statValue: check.value,
        context: `${row.Team} ${row.Position}`,
        entityType: "player",
        entityName: row.Name,
        team: row.Team,
      });
    });
  });

  latestTeamRows
    .filter((row) => row.Result === "Win" && numeric(row["Opponent Points"]) >= 30)
    .forEach((row) => {
      const previous = allTeamRows
        .filter((candidate) => candidate.Team !== row.Team || candidate.Year !== row.Year || candidate.Round !== row.Round)
        .filter((candidate) => candidate.Result === "Win" && numeric(candidate["Opponent Points"]) >= 30)
        .sort((a, b) => b.Year.localeCompare(a.Year) || b.Round - a.Round)[0];
      insights.push({
        id: insightId("historical-team-defense", [row.Team, row.Year, row.Round]),
        category: "Historical Comparisons",
        title: previous ? `${row.Team} joined ${previous.Team} in a rare shootout win.` : `${row.Team} won while conceding 30+.`,
        detail: previous
          ? `Last loaded team to win while conceding 30+ was ${previous.Team} in ${previous.Round_Label || `Round ${previous.Round}`}, ${previous.Year}.`
          : `${row.Team} conceded ${numeric(row["Opponent Points"])} and still beat ${row.Opponent ?? "their opponent"}.`,
        score: 70 + numeric(row["Opponent Points"]) - numeric(row.Margin),
        statLabel: "points conceded",
        statValue: formatNumber(numeric(row["Opponent Points"])),
        context: `${row.Team} win`,
        entityType: "team",
        entityName: row.Team,
        team: row.Team,
      });
    });

  return insights;
}

function buildPlayerLeaderInsights(latestRows: PlayerStat[], playerGroups: Map<string, PlayerStat[]>): StatsHubInsight[] {
  const specs = [
    { key: "All Run Metres", label: "run metres", min: 155, minDiff: 45, limit: 3 },
    { key: "Tackle Breaks", label: "tackle breaks", min: 5, minDiff: 3, limit: 3 },
    { key: "Tackles Made", label: "tackles", min: 38, minDiff: 10, limit: 2 },
    { key: "Post Contact Metres", label: "post-contact metres", min: 55, minDiff: 22, limit: 2 },
    { key: "Offloads", label: "offloads", min: 3, minDiff: 1.8, limit: 2 },
  ] as const;

  return specs.flatMap((spec) => {
    const candidates = latestRows
      .map((row) => {
        const priorRows = eligiblePriorRows(row, playerGroups);
        const baseline = average(priorRows.map((candidate) => numeric(candidate[spec.key])));
        const value = numeric(row[spec.key]);
        const diff = baseline == null ? 0 : value - baseline;
        return { row, baseline, value, diff };
      })
      .filter((candidate) =>
        candidate.baseline != null &&
        candidate.baseline > 0 &&
        candidate.value >= spec.min &&
        candidate.diff >= spec.minDiff
      )
      .sort((a, b) => b.diff - a.diff)
      .slice(0, spec.limit);

    return candidates.map(({ row, baseline, value, diff }) => {
      const pctAbove = baseline && baseline > 0 ? (diff / baseline) * 100 : 0;
      return {
        id: insightId("outlier", [row.Name, spec.key, row.Year, row.Round]),
        category: "Statistical Outliers" as const,
        title: row.Name,
        detail: "",
        score: diff + pctAbove / 5,
        statLabel: spec.label,
        statValue: `+${formatNumber(diff)}`,
        context: `${row.Team} ${row.Position}`,
        entityType: "player",
        entityName: row.Name,
        team: row.Team,
        visualMode: "metric" as const,
        metrics: [
          { label: "Last Week", value: `${formatNumber(value)} ${spec.label}`, tone: "up" as const },
          { label: "Season Prior Average", value: `${formatNumber(baseline ?? 0)} ${spec.label}` },
          { label: "Difference", value: `+${formatNumber(diff)} ${spec.label}`, tone: "up" as const },
        ],
      };
    });
  });
}

function categoryGroups(insights: StatsHubInsight[]): StatsHubModel["categories"] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    insights: insights.filter((insight) => insight.category === category).slice(0, 6),
  })).filter((group) => group.insights.length > 0);
}

export function buildStatsHubModel(playerRows: PlayerStat[], teamRows: TeamStat[]): StatsHubModel {
  const latestPlayer = latestRoundForRows(playerRows);
  const latestTeam = latestRoundForRows(teamRows);
  const displayRound =
    latestTeam.round != null &&
    (latestPlayer.round == null || latestTeam.year.localeCompare(latestPlayer.year) > 0 || (latestTeam.year === latestPlayer.year && latestTeam.round > latestPlayer.round))
      ? latestTeam
      : latestPlayer;
  const playerStatsAreCurrentRound = latestPlayer.year === displayRound.year && latestPlayer.round === displayRound.round;
  const latestPlayerRows = playerStatsAreCurrentRound
    ? playerRows.filter((row) => row.Year === displayRound.year && row.Round === displayRound.round)
    : [];
  const latestAvailablePlayerRows = playerRows.filter((row) => row.Year === latestPlayer.year && row.Round === latestPlayer.round);
  const latestTeamRows = teamRows.filter((row) => row.Year === displayRound.year && row.Round === displayRound.round);
  const playerGroups = buildPlayerGroups(playerRows.filter((row) => row.Year === latestPlayer.year));
  const teamGroups = buildTeamGroups(teamRows.filter((row) => row.Year === displayRound.year));

  const allInsights = [
    ...buildTeamTrendInsights(latestTeamRows, teamGroups),
    ...buildOutlierInsights(latestPlayerRows, playerGroups),
    ...buildPlayerLeaderInsights(latestPlayerRows, playerGroups),
    ...buildPlayerTrendInsights(latestAvailablePlayerRows, playerGroups),
    ...buildDueInsights(latestAvailablePlayerRows, playerGroups),
    ...buildWeirdTeamInsights(latestTeamRows),
    ...buildScoringStreakInsights(latestPlayerRows, playerRows, teamRows),
    ...buildHistoricalInsights(latestPlayerRows, playerRows, latestTeamRows, teamRows),
  ];

  const deduped = Array.from(new Map(allInsights.map((insight) => [insight.id, insight])).values())
    .sort((a, b) => b.score - a.score);

  return {
    year: displayRound.year,
    round: displayRound.round,
    roundLabel: roundLabel(displayRound.year, displayRound.round, latestPlayerRows, latestTeamRows),
    generatedAtLabel: new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date()),
    insights: deduped.slice(0, 36),
    categories: categoryGroups(deduped),
  };
}

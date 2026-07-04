"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { TEAM_STATS } from "@/lib/data/constants";
import {
  computeSummary,
  computePercentileRanks,
  computeRecentForm,
} from "@/lib/data/transform";
import { FilterBar } from "@/components/filters/filter-bar";
import { TeamSelectors } from "@/components/filters/team-selectors";
import { Select } from "@/components/ui/select";
import { PillRadio } from "@/components/ui/pill-radio";
import { SummaryPanel } from "@/components/summary/summary-panel";
import { ChartPanelGrid } from "@/components/charts/chart-panel-grid";
import { ScatterCorrelation } from "@/components/charts/scatter-correlation";
import { KDEDistribution } from "@/components/charts/kde-distribution";
import { OpponentAverageHeatmap } from "@/components/charts/opponent-average-heatmap";
import { FantasyGameLogTrendBrush } from "@/components/charts/fantasy-game-log-trend-brush";
import { hasProPlotAccess } from "@/lib/access/pro-access";
import { isAccessibleSeason } from "@/lib/access/season-access";
import { resolveTeamLogoUrl } from "@/components/views/player-comparison";

interface TeamComparisonProps {
  initialData: TeamStat[];
  availableYears: string[];
  defaultYears: string[];
  teamLogos: Record<string, string>;
  canBypassPlotGate?: boolean;
}

type TeamPerspective = "For" | "Against";
type TeamStatsTableSortDirection = "asc" | "desc";
type TeamStatsTableValueMode = "Average" | "Total";
type TeamStatsTableGroupBy = "Team" | "Year + Team";
type TeamStatsTableStatKey = (typeof TEAM_STATS)[number];
type TeamStatsTableSortKey = "year" | "team" | "games" | `stat:${TeamStatsTableStatKey}`;

interface TeamStatsTableRow {
  key: string;
  year: string | null;
  team: string;
  logoUrl: string | null;
  games: number;
  averages: Partial<Record<TeamStatsTableStatKey, number | null>>;
  totals: Partial<Record<TeamStatsTableStatKey, number | null>>;
}

const TEAM_STATS_TABLE_COLUMNS = TEAM_STATS;
const TEAM_STATS_TABLE_GROUP_OPTIONS: TeamStatsTableGroupBy[] = ["Team", "Year + Team"];
const TEAM_STATS_TABLE_BASE_COLUMNS: Array<{ key: TeamStatsTableSortKey; label: string; align?: "left" | "center" | "right" }> = [
  { key: "team", label: "Team", align: "left" },
  { key: "games", label: "Games", align: "center" },
];
const TEAM_STATS_TABLE_YEAR_COLUMN: { key: TeamStatsTableSortKey; label: string; align?: "left" | "center" | "right" } = {
  key: "year",
  label: "Year",
  align: "center",
};

const DEFAULT_TEAM_1_CANDIDATES = ["Broncos", "Brisbane Broncos"];
const DEFAULT_TEAM_2_CANDIDATES = ["Storm", "Melbourne Storm"];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value
      .trim()
      .replace(/,/g, "")
      .replace(/%$/, "")
      .replace(/s$/, "");
    if (!cleaned || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function averageNumbers(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatTableNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function isFinalsGame(row: TeamStat): boolean {
  if (row.Round >= 28) return true;
  const roundLabel = (row.Round_Label ?? "").toString().toUpperCase();
  return roundLabel === "GF" || roundLabel.startsWith("FW") || roundLabel.includes("FINAL");
}

function filterTeamRowsByYear(rows: TeamStat[], years: string[]): TeamStat[] {
  if (years.length === 0) return rows;
  const set = new Set(years);
  return rows.filter((row) => set.has(row.Year));
}

function filterTeamRowsByFinals(rows: TeamStat[], mode: "Yes" | "No"): TeamStat[] {
  if (mode === "Yes") return rows;
  return rows.filter((row) => !isFinalsGame(row));
}

function buildAgainstTeamStats(rows: TeamStat[]): TeamStat[] {
  const rowsByTeamRound = new Map<string, TeamStat>(
    rows.map((row) => [`${row.Year}|${row.Round}|${row.Team}`, row])
  );

  return rows.map((row) => {
    const opponentRow = row.Opponent
      ? rowsByTeamRound.get(`${row.Year}|${row.Round}|${row.Opponent}`)
      : null;
    const againstRow = {
      ...row,
      ...Object.fromEntries(
        (TEAM_STATS as unknown as string[]).map((stat) => [
          stat,
          opponentRow ? (toFiniteNumber(opponentRow[stat]) ?? 0) : 0,
        ])
      ),
    } as TeamStat;

    return againstRow;
  });
}

export function TeamComparison({
  initialData,
  availableYears,
  defaultYears,
  teamLogos,
  canBypassPlotGate = false,
}: TeamComparisonProps) {
  const { userId } = useAuth();
  const { user } = useUser();
  const canAccessLoginSeason = Boolean(userId);
  const hasClientProPlotAccess =
    canBypassPlotGate || hasProPlotAccess(userId, user?.publicMetadata);
  const [allData, setAllData] = useState<TeamStat[]>(initialData);
  const unlockedYears = useMemo(
    () =>
      availableYears.filter((year) =>
        isAccessibleSeason(year, canAccessLoginSeason, "stats", hasClientProPlotAccess)
      ),
    [availableYears, canAccessLoginSeason, hasClientProPlotAccess]
  );
  const initialYears = useMemo(() => {
    const validDefaultYears = defaultYears.filter((year) => unlockedYears.includes(year));
    if (validDefaultYears.length > 0) return validDefaultYears;
    return unlockedYears.slice(0, 1);
  }, [defaultYears, unlockedYears]);
  const [selectedYears, setSelectedYears] = useState<string[]>(initialYears);
  const [teamStatsTableYears, setTeamStatsTableYears] = useState<string[]>(initialYears);
  const [teamStatsTableTeam, setTeamStatsTableTeam] = useState("All Teams");
  const [teamStatsTableGroupBy, setTeamStatsTableGroupBy] = useState<TeamStatsTableGroupBy>("Team");
  const [teamStatsTableSort, setTeamStatsTableSort] = useState<{
    column: TeamStatsTableSortKey;
    direction: TeamStatsTableSortDirection;
  }>({ column: "stat:Points", direction: "desc" });
  const [teamStatsTableValueMode, setTeamStatsTableValueMode] = useState<TeamStatsTableValueMode>("Average");
  const [teamStatsTableFiltersOpen, setTeamStatsTableFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(
    initialData.length === 0 && initialYears.length > 0
  );
  const hasBootstrappedFetch = useRef(false);
  const filterUnlockedYears = useCallback(
    (years: string[]) => years.filter((year) => unlockedYears.includes(year)),
    [unlockedYears]
  );
  const ensureAtLeastOneUnlockedYear = useCallback(
    (years: string[]) => (years.length > 0 ? years : unlockedYears.slice(0, 1)),
    [unlockedYears]
  );

  const loadAllUnlockedYears = useCallback(async () => {
    if (unlockedYears.length === 0) {
      setAllData([]);
      return;
    }
    setLoading(allData.length === 0);
    try {
      const res = await fetch(`/api/team-stats?years=${unlockedYears.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setAllData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [allData.length, unlockedYears]);

  const loadTeamYears = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    if (validYears.length === 0) return;

    const loadedYears = new Set(allData.map((row) => String(row.Year ?? "")));
    const missingYears = validYears.filter((year) => !loadedYears.has(year));
    if (missingYears.length === 0) return;

    setLoading(allData.length === 0);
    try {
      const res = await fetch(`/api/team-stats?years=${missingYears.join(",")}`);
      if (!res.ok) return;
      const data = (await res.json()) as TeamStat[];
      const fetchedYears = new Set(missingYears);
      setAllData((prev) => [
        ...prev.filter((row) => !fetchedYears.has(String(row.Year ?? ""))),
        ...data,
      ]);
    } finally {
      setLoading(false);
    }
  }, [allData, ensureAtLeastOneUnlockedYear, filterUnlockedYears]);

  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    await loadTeamYears(validYears);
    setSelectedYears(validYears);
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears, loadTeamYears]);
  const handleTeamStatsTableYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    await loadTeamYears(validYears);
    setTeamStatsTableYears(validYears);
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears, loadTeamYears]);
  const [finalsMode, setFinalsMode] = useState("Yes");
  const [minMinutes, setMinMinutes] = useState(0);
  const [minutesMode, setMinutesMode] = useState("All");
  const [comparisonFiltersOpen, setComparisonFiltersOpen] = useState(false);

  const dfYear = useMemo(
    () => filterTeamRowsByYear(allData, selectedYears),
    [allData, selectedYears]
  );
  const dfYearFinals = useMemo(
    () => filterTeamRowsByFinals(dfYear, finalsMode as "Yes" | "No"),
    [dfYear, finalsMode]
  );
  const plotDfYear = useMemo(
    () => filterTeamRowsByYear(allData, unlockedYears),
    [allData, unlockedYears]
  );
  const plotDfYearFinals = useMemo(
    () => filterTeamRowsByFinals(plotDfYear, finalsMode as "Yes" | "No"),
    [plotDfYear, finalsMode]
  );
  const teamDf = useMemo(() => dfYearFinals, [dfYearFinals]);
  const plotTeamDf = useMemo(() => plotDfYearFinals, [plotDfYearFinals]);
  const teamAgainstDf = useMemo(() => buildAgainstTeamStats(teamDf), [teamDf]);
  const plotTeamAgainstDf = useMemo(() => buildAgainstTeamStats(plotTeamDf), [plotTeamDf]);

  const teamList = useMemo(
    () => [...new Set(teamDf.map((r) => r.Team))].sort(),
    [teamDf]
  );

  const statList = useMemo(
    () =>
      (TEAM_STATS as unknown as string[]).filter((s) =>
        teamDf.some((r) => r[s] !== undefined)
      ),
    [teamDf]
  );

  const teamStatsTableSourceRows = useMemo(
    () => filterTeamRowsByYear(allData, teamStatsTableYears),
    [allData, teamStatsTableYears]
  );

  const teamStatsTableTeamOptions = useMemo(
    () => ["All Teams", ...Array.from(new Set(teamStatsTableSourceRows.map((row) => row.Team))).filter(Boolean).sort()],
    [teamStatsTableSourceRows]
  );

  const teamStatsTableRows = useMemo<TeamStatsTableRow[]>(() => {
    const filteredRows =
      teamStatsTableTeam === "All Teams"
        ? teamStatsTableSourceRows
        : teamStatsTableSourceRows.filter((row) => row.Team === teamStatsTableTeam);
    const byGroup = new Map<string, TeamStat[]>();

    for (const row of filteredRows) {
      const key = JSON.stringify(teamStatsTableGroupBy === "Year + Team" ? [row.Year, row.Team] : [row.Team]);
      const rows = byGroup.get(key) ?? [];
      rows.push(row);
      byGroup.set(key, rows);
    }

    return [...byGroup.entries()].map(([key, rows]) => {
      const team = rows[0]?.Team ?? "";
      const averages: Partial<Record<TeamStatsTableStatKey, number | null>> = {};
      const totals: Partial<Record<TeamStatsTableStatKey, number | null>> = {};
      for (const stat of TEAM_STATS_TABLE_COLUMNS) {
        const values = rows.map((row) => toFiniteNumber(row[stat]));
        averages[stat] = averageNumbers(values);
        const validValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
        totals[stat] = validValues.length > 0 ? validValues.reduce((sum, value) => sum + value, 0) : null;
      }

      return {
        key,
        year: teamStatsTableGroupBy === "Year + Team" ? rows[0]?.Year ?? null : null,
        team,
        logoUrl: resolveTeamLogoUrl(team, teamLogos),
        games: rows.length,
        averages,
        totals,
      };
    });
  }, [teamLogos, teamStatsTableGroupBy, teamStatsTableSourceRows, teamStatsTableTeam]);

  const teamStatsTableBaseColumns = useMemo(
    () =>
      teamStatsTableGroupBy === "Year + Team"
        ? [TEAM_STATS_TABLE_YEAR_COLUMN, ...TEAM_STATS_TABLE_BASE_COLUMNS]
        : TEAM_STATS_TABLE_BASE_COLUMNS,
    [teamStatsTableGroupBy]
  );

  const sortedTeamStatsTableRows = useMemo(() => {
    const getSortValue = (row: TeamStatsTableRow): number | string | null => {
      if (teamStatsTableSort.column === "year") return row.year;
      if (teamStatsTableSort.column === "team") return row.team.toLowerCase();
      if (teamStatsTableSort.column === "games") return row.games;

      const statKey = teamStatsTableSort.column.slice("stat:".length) as TeamStatsTableStatKey;
      return teamStatsTableValueMode === "Total" ? row.totals[statKey] ?? null : row.averages[statKey] ?? null;
    };

    return [...teamStatsTableRows].sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);
      if (aValue === null && bValue === null) return a.team.localeCompare(b.team);
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      const direction = teamStatsTableSort.direction === "asc" ? 1 : -1;
      if (typeof aValue === "number" && typeof bValue === "number") {
        if (aValue !== bValue) return (aValue - bValue) * direction;
        return a.team.localeCompare(b.team) || String(a.year ?? "").localeCompare(String(b.year ?? ""));
      }

      const valueComparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" }) * direction;
      return valueComparison || a.team.localeCompare(b.team) || String(a.year ?? "").localeCompare(String(b.year ?? ""));
    });
  }, [teamStatsTableRows, teamStatsTableSort, teamStatsTableValueMode]);

  const toggleTeamStatsTableSort = useCallback((column: TeamStatsTableSortKey) => {
    setTeamStatsTableSort((current) => ({
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const [team1, setTeam1] = useState("Broncos");
  const [team2, setTeam2] = useState("Storm");
  const [team1Perspective, setTeam1Perspective] = useState<TeamPerspective>("For");
  const [team2Perspective, setTeam2Perspective] = useState<TeamPerspective>("For");
  const [stat1, setStat1] = useState("Points");
  const [stat2, setStat2] = useState("All Run Metres");

  useEffect(() => {
    if (teamList.length === 0) return;

    const hasTeam = (value: string) => teamList.some((team) => team === value);

    const findTeam = (candidates: string[]) => {
      for (const candidate of candidates) {
        const exact = teamList.find(
          (team) => team.toLowerCase() === candidate.toLowerCase()
        );
        if (exact) return exact;
      }

      for (const candidate of candidates) {
        const partial = teamList.find((team) =>
          team.toLowerCase().includes(candidate.toLowerCase())
        );
        if (partial) return partial;
      }

      return null;
    };

    const defaultTeam1 = findTeam(DEFAULT_TEAM_1_CANDIDATES) ?? teamList[0];

    if (!team1 || !hasTeam(team1)) {
      setTeam1(defaultTeam1);
    }

    if (team2 === "None") {
      const defaultTeam2 = findTeam(DEFAULT_TEAM_2_CANDIDATES);
      if (defaultTeam2 && defaultTeam2 !== defaultTeam1) {
        setTeam2(defaultTeam2);
      }
      return;
    }

    if (!hasTeam(team2) || team2 === defaultTeam1) {
      const defaultTeam2 = findTeam(DEFAULT_TEAM_2_CANDIDATES);
      if (defaultTeam2 && defaultTeam2 !== defaultTeam1) {
        setTeam2(defaultTeam2);
      } else {
        setTeam2("None");
      }
    }
  }, [team1, team2, teamList]);

  useEffect(() => {
    if (selectedYears.length > 0 || unlockedYears.length === 0) return;
    setSelectedYears(unlockedYears.slice(0, 1));
  }, [selectedYears.length, unlockedYears]);

  useEffect(() => {
    if (teamStatsTableYears.length > 0 || unlockedYears.length === 0) return;
    setTeamStatsTableYears(unlockedYears.slice(0, 1));
  }, [teamStatsTableYears.length, unlockedYears]);

  useEffect(() => {
    if (teamStatsTableGroupBy === "Year + Team" || teamStatsTableSort.column !== "year") return;
    setTeamStatsTableSort({ column: "team", direction: "asc" });
  }, [teamStatsTableGroupBy, teamStatsTableSort.column]);

  useEffect(() => {
    if (hasBootstrappedFetch.current) return;
    if (initialData.length > 0 || allData.length > 0) {
      hasBootstrappedFetch.current = true;
      return;
    }
    if (unlockedYears.length === 0) return;
    hasBootstrappedFetch.current = true;
    void loadAllUnlockedYears();
  }, [allData.length, initialData.length, loadAllUnlockedYears, unlockedYears.length]);

  useEffect(() => {
    const validYears = selectedYears.filter((year) => unlockedYears.includes(year));
    const hasChanged =
      validYears.length !== selectedYears.length ||
      validYears.some((year, index) => year !== selectedYears[index]);
    if (!hasChanged) return;
    void handleYearsChange(validYears);
  }, [handleYearsChange, selectedYears, unlockedYears]);

  useEffect(() => {
    const validYears = teamStatsTableYears.filter((year) => unlockedYears.includes(year));
    const hasChanged =
      validYears.length !== teamStatsTableYears.length ||
      validYears.some((year, index) => year !== teamStatsTableYears[index]);
    if (!hasChanged) return;
    void handleTeamStatsTableYearsChange(validYears);
  }, [handleTeamStatsTableYearsChange, teamStatsTableYears, unlockedYears]);

  useEffect(() => {
    const loadedYears = [...new Set(allData.map((row) => row.Year))];
    const missingUnlockedYear = unlockedYears.some((year) => !loadedYears.includes(year));
    const hasLockedYearLoaded = loadedYears.some((year) => !unlockedYears.includes(year));
    if (!missingUnlockedYear && !hasLockedYearLoaded) return;
    void loadAllUnlockedYears();
  }, [allData, loadAllUnlockedYears, unlockedYears]);

  const effectiveT1 = team1 || teamList[0] || "";
  const effectiveT1Label = team1Perspective === "Against" ? `${effectiveT1} Against` : effectiveT1;
  const effectiveT2Label = team2Perspective === "Against" ? `${team2} Against` : team2;
  const t1BaseRows = team1Perspective === "Against" ? teamAgainstDf : teamDf;
  const t2BaseRows = team2Perspective === "Against" ? teamAgainstDf : teamDf;
  const t1PlotBaseRows = team1Perspective === "Against" ? plotTeamAgainstDf : plotTeamDf;
  const t2PlotBaseRows = team2Perspective === "Against" ? plotTeamAgainstDf : plotTeamDf;

  const t1Rows = useMemo(
    () => t1BaseRows.filter((r) => r.Team === effectiveT1),
    [effectiveT1, t1BaseRows]
  );
  const t2Rows = useMemo(
    () => (team2 !== "None" ? t2BaseRows.filter((r) => r.Team === team2) : []),
    [t2BaseRows, team2]
  );
  const t1PlotRows = useMemo(
    () => t1PlotBaseRows.filter((r) => r.Team === effectiveT1),
    [effectiveT1, t1PlotBaseRows]
  );
  const t2PlotRows = useMemo(
    () => (team2 !== "None" ? t2PlotBaseRows.filter((r) => r.Team === team2) : []),
    [t2PlotBaseRows, team2]
  );

  const statsToShow = useMemo(
    () => [stat1, ...(stat2 !== "None" ? [stat2] : [])],
    [stat1, stat2]
  );

  const summaryRows = useMemo(() => {
    const rows = computeSummary(effectiveT1Label, t1Rows as unknown as PlayerStat[], statsToShow);
    if (team2 !== "None") {
      rows.push(...computeSummary(effectiveT2Label, t2Rows as unknown as PlayerStat[], statsToShow));
    }
    return rows;
  }, [effectiveT1Label, effectiveT2Label, t1Rows, team2, t2Rows, statsToShow]);

  const entities = useMemo(() => {
    const e = [{ name: effectiveT1Label, rows: t1Rows as (PlayerStat | TeamStat)[] }];
    if (team2 !== "None") e.push({ name: effectiveT2Label, rows: t2Rows as (PlayerStat | TeamStat)[] });
    return e;
  }, [effectiveT1Label, effectiveT2Label, t1Rows, team2, t2Rows]);

  const percentileResults = useMemo(() => {
    const results = computePercentileRanks(
      effectiveT1,
      t1Rows as unknown as PlayerStat[],
      t1BaseRows as unknown as PlayerStat[],
      statsToShow,
      "Team"
    ).map((result) => ({ ...result, entity: effectiveT1Label }));
    if (team2 !== "None") {
      results.push(
        ...computePercentileRanks(
          team2,
          t2Rows as unknown as PlayerStat[],
          t2BaseRows as unknown as PlayerStat[],
          statsToShow,
          "Team"
        ).map((result) => ({ ...result, entity: effectiveT2Label }))
      );
    }
    return results;
  }, [effectiveT1, effectiveT1Label, effectiveT2Label, t1Rows, t1BaseRows, t2BaseRows, team2, t2Rows, statsToShow]);

  const recentFormResults = useMemo(() => {
    const results = computeRecentForm(effectiveT1Label, t1Rows as unknown as PlayerStat[], statsToShow);
    if (team2 !== "None") {
      results.push(...computeRecentForm(effectiveT2Label, t2Rows as unknown as PlayerStat[], statsToShow));
    }
    return results;
  }, [effectiveT1Label, effectiveT2Label, t1Rows, team2, t2Rows, statsToShow]);

  const chartPanels = useMemo(() => {
    const panels: { id: string; title: string; content: React.ReactNode; wide?: boolean }[] = [];
    const hasTwoTeams = team2 !== "None";
    const hasTwoStats = stat2 !== "None";

    if (hasTwoStats) {
      panels.push({
        id: "corr-t1",
        title: `${effectiveT1Label}: ${stat1} vs ${stat2}`,
        content: (
          <ScatterCorrelation
            rows={t1Rows as unknown as PlayerStat[]}
            statX={stat1}
            statY={stat2}
            title={`${effectiveT1Label} \u2014 ${stat1} vs ${stat2}`}
            label={effectiveT1Label}
          />
        ),
      });
      if (hasTwoTeams) {
        panels.push({
          id: "corr-t2",
          title: `${effectiveT2Label}: ${stat1} vs ${stat2}`,
          content: (
            <ScatterCorrelation
              rows={t2Rows as unknown as PlayerStat[]}
              statX={stat1}
              statY={stat2}
              title={`${effectiveT2Label} \u2014 ${stat1} vs ${stat2}`}
              label={effectiveT2Label}
            />
          ),
        });
      }
    }

    panels.push({
      id: "dist-1",
      title: `${stat1} Distribution`,
      content: (
          <KDEDistribution
            title={`${stat1} Distribution`}
            stat={stat1}
            series={[
              { label: effectiveT1Label, values: t1Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null) },
              ...(hasTwoTeams
                ? [{ label: effectiveT2Label, values: t2Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
                : []),
            ]}
          />
      ),
    });
    if (hasTwoStats) {
      panels.push({
        id: "dist-2",
        title: `${stat2} Distribution`,
        content: (
          <KDEDistribution
            title={`${stat2} Distribution`}
            stat={stat2}
            series={[
              { label: effectiveT1Label, values: t1Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null) },
              ...(hasTwoTeams
                ? [{ label: effectiveT2Label, values: t2Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
                : []),
            ]}
          />
        ),
      });
    }

    panels.push({
      id: "rolling-t1",
      title: `${effectiveT1Label}: ${stat1} Rolling Average`,
      wide: true,
      content: (
        <FantasyGameLogTrendBrush
          rows={t1PlotRows}
          headerTitle="Rolling Average Plot"
          valueLabel={stat1}
          primarySeriesLabel={effectiveT1Label}
          valueAccessor={(row) => toFiniteNumber(row[stat1]) ?? 0}
        />
      ),
    });
    if (hasTwoTeams) {
      panels.push({
        id: "rolling-t2",
        title: `${effectiveT2Label}: ${stat1} Rolling Average`,
        wide: true,
        content: (
          <FantasyGameLogTrendBrush
            rows={t2PlotRows}
            headerTitle="Rolling Average Plot"
            valueLabel={stat1}
            primarySeriesLabel={effectiveT2Label}
            primaryBarColor="rgba(180, 112, 255, 0.42)"
            valueAccessor={(row) => toFiniteNumber(row[stat1]) ?? 0}
          />
        ),
      });
    }
    if (hasTwoStats) {
      panels.push({
        id: "rolling-t1-stat2",
        title: `${effectiveT1Label}: ${stat2} Rolling Average`,
        wide: true,
        content: (
          <FantasyGameLogTrendBrush
            rows={t1PlotRows}
            headerTitle="Rolling Average Plot"
            valueLabel={stat2}
            primarySeriesLabel={effectiveT1Label}
            valueAccessor={(row) => toFiniteNumber(row[stat2]) ?? 0}
          />
        ),
      });
      if (hasTwoTeams) {
        panels.push({
          id: "rolling-t2-stat2",
          title: `${effectiveT2Label}: ${stat2} Rolling Average`,
          wide: true,
          content: (
            <FantasyGameLogTrendBrush
              rows={t2PlotRows}
              headerTitle="Rolling Average Plot"
              valueLabel={stat2}
              primarySeriesLabel={effectiveT2Label}
              primaryBarColor="rgba(180, 112, 255, 0.42)"
              valueAccessor={(row) => toFiniteNumber(row[stat2]) ?? 0}
            />
          ),
        });
      }
    }

    panels.push({
      id: "opp-t1",
      title: `${effectiveT1Label}: ${stat1} Avg vs Opponent`,
      wide: true,
      content: <OpponentAverageHeatmap rows={t1PlotRows} stat={stat1} />,
    });
    if (hasTwoTeams) {
      panels.push({
        id: "opp-t2",
        title: `${effectiveT2Label}: ${stat1} Avg vs Opponent`,
        wide: true,
        content: <OpponentAverageHeatmap rows={t2PlotRows} stat={stat1} />,
      });
    }
    if (hasTwoStats) {
      panels.push({
        id: "opp-t1-stat2",
        title: `${effectiveT1Label}: ${stat2} Avg vs Opponent`,
        wide: true,
        content: <OpponentAverageHeatmap rows={t1PlotRows} stat={stat2} />,
      });
      if (hasTwoTeams) {
        panels.push({
          id: "opp-t2-stat2",
          title: `${effectiveT2Label}: ${stat2} Avg vs Opponent`,
          wide: true,
          content: <OpponentAverageHeatmap rows={t2PlotRows} stat={stat2} />,
        });
      }
    }

    return panels;
  }, [
    effectiveT1Label, effectiveT2Label, team2, stat1, stat2, t1Rows, t2Rows, t1PlotRows, t2PlotRows,
  ]);

  const filteredChartPanels = useMemo(
    () => chartPanels.filter((panel) => !/Rolling Average|Avg vs Opponent/i.test(panel.title)),
    [chartPanels]
  );

  const historyChartPanels = useMemo(
    () => chartPanels.filter((panel) => /Rolling Average|Avg vs Opponent/i.test(panel.title)),
    [chartPanels]
  );

  return (
    <div className="space-y-4">
      {allData.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-nrl-border/90 bg-nrl-panel shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-nrl-border/70 bg-nrl-panel-2 px-5 py-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
              <PillRadio
                options={["Average", "Total"]}
                value={teamStatsTableValueMode}
                onChange={(value) => setTeamStatsTableValueMode(value as TeamStatsTableValueMode)}
              />
              <div className="w-36 shrink-0">
                <Select
                  label="Group"
                  value={teamStatsTableGroupBy}
                  options={[...TEAM_STATS_TABLE_GROUP_OPTIONS]}
                  onChange={(value) => setTeamStatsTableGroupBy(value as TeamStatsTableGroupBy)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTeamStatsTableFiltersOpen((open) => !open)}
              className={`relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                teamStatsTableFiltersOpen ||
                teamStatsTableTeam !== "All Teams" ||
                teamStatsTableYears.length !== initialYears.length ||
                teamStatsTableYears.some((year, index) => year !== initialYears[index])
                  ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
                  : "border-nrl-border bg-nrl-panel text-nrl-muted hover:border-nrl-accent hover:text-nrl-accent"
              }`}
              aria-expanded={teamStatsTableFiltersOpen}
              aria-label="Filters"
            >
              <span className="flex flex-col gap-0.5" aria-hidden="true">
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
              </span>
            </button>
          </div>
          {teamStatsTableFiltersOpen ? (
            <div className="grid gap-3 border-b border-nrl-border bg-nrl-accent/10 px-3 py-3 md:grid-cols-[minmax(220px,320px)_150px]">
              <FilterBar
                years={availableYears}
                selectedYears={teamStatsTableYears}
                onYearsChange={handleTeamStatsTableYearsChange}
                finalsMode="Yes"
                onFinalsModeChange={() => {}}
                minutesThreshold={0}
                onMinutesThresholdChange={() => {}}
                minutesMode="All"
                onMinutesModeChange={() => {}}
                showPosition={false}
                showMinutes={false}
                showPresets={false}
                showFinals={false}
                embedded
                showYear
              />
              <Select
                label="Team"
                value={teamStatsTableTeam}
                options={teamStatsTableTeamOptions}
                onChange={setTeamStatsTableTeam}
              />
            </div>
          ) : null}
          <div className="relative h-[396px] overflow-auto pb-3">
            {sortedTeamStatsTableRows.length === 0 ? (
              <div className="pointer-events-none absolute left-0 right-0 top-12 z-[7] flex h-24 items-center justify-center px-4 text-center text-sm font-black text-nrl-accent sm:top-14">
                No teams match the selected filters.
              </div>
            ) : null}
            <table className="min-w-[2200px] border-collapse text-left text-xs sm:min-w-[2400px]">
              <thead>
                <tr>
                  <th
                    aria-label="Team logo"
                    className="sticky left-0 top-0 z-[5] w-28 min-w-28 max-w-28 border-b border-r border-nrl-border/70 bg-nrl-panel px-1.5 py-1.5 sm:px-2 sm:py-2"
                  />
                  {teamStatsTableBaseColumns.map((column) => {
                    const active = teamStatsTableSort.column === column.key;
                    return (
                      <th
                        key={column.key}
                        className={`sticky top-0 border-b border-nrl-border/70 bg-nrl-panel px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] last:border-r-0 sm:px-2.5 sm:tracking-[0.16em] ${active ? "z-[6] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.26)] sm:right-0" : "z-[2] text-nrl-text"} ${column.key === "year" ? "w-20 min-w-20 max-w-20 sm:w-[5.5rem] sm:min-w-[5.5rem] sm:max-w-[5.5rem]" : ""} ${column.key === "team" ? "w-44 min-w-44 max-w-44 sm:w-[12.5rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem]" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTeamStatsTableSort(column.key)}
                          className={`inline-flex w-full cursor-pointer items-center gap-1 whitespace-nowrap hover:text-nrl-accent ${column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start"}`}
                          title={`Sort by ${column.label}`}
                        >
                          <span>{column.label}</span>
                          {active ? <span>{teamStatsTableSort.direction === "asc" ? "↑" : "↓"}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                  {TEAM_STATS_TABLE_COLUMNS.map((stat) => {
                    const key = `stat:${stat}` as TeamStatsTableSortKey;
                    const active = teamStatsTableSort.column === key;
                    return (
                      <th
                        key={stat}
                        className={`sticky top-0 border-b border-nrl-border/70 bg-nrl-panel px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.14em] last:border-r-0 sm:px-2.5 sm:tracking-[0.16em] ${active ? "z-[6] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.26)] sm:right-0" : "z-[2] text-nrl-text"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTeamStatsTableSort(key)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap hover:text-nrl-accent"
                          title={`Sort by ${stat}`}
                        >
                          <span>{stat}</span>
                          {active ? <span>{teamStatsTableSort.direction === "asc" ? "↑" : "↓"}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedTeamStatsTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={teamStatsTableBaseColumns.length + TEAM_STATS_TABLE_COLUMNS.length + 1} className="h-24 px-3 py-6" />
                  </tr>
                ) : (
                  sortedTeamStatsTableRows.map((row, index) => (
                    <tr key={row.key} className="h-16 border-b border-nrl-border/70 transition-colors hover:bg-nrl-panel-2/60 sm:h-[4.5rem]">
                      <td className="sticky left-0 z-[3] w-28 min-w-28 max-w-28 border-r border-nrl-border/70 bg-nrl-panel px-1.5 py-1 sm:px-2">
                        <div className="flex h-[3.75rem] items-center gap-1.5 sm:h-[4.25rem]">
                          <div className="w-5 text-center text-xs font-black text-nrl-text sm:w-6 sm:text-sm">
                            {index + 1}
                          </div>
                          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-nrl-border bg-nrl-panel-2 sm:h-10 sm:w-10">
                            {row.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.logoUrl}
                                alt=""
                                className="h-7 w-7 object-contain sm:h-8 sm:w-8"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[10px] font-black uppercase text-nrl-text">
                                {row.team.slice(0, 2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {teamStatsTableGroupBy === "Year + Team" ? (
                        <td className={`w-20 min-w-20 max-w-20 px-2 py-1.5 text-center text-xs font-black whitespace-nowrap sm:w-[5.5rem] sm:min-w-[5.5rem] sm:max-w-[5.5rem] sm:px-2.5 sm:text-[13px] ${teamStatsTableSort.column === "year" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}>
                          {row.year ?? "-"}
                        </td>
                      ) : null}
                      <td className={`w-44 min-w-44 max-w-44 px-2 py-1.5 text-sm font-black sm:w-[12.5rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem] sm:px-2.5 ${teamStatsTableSort.column === "team" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "bg-nrl-panel text-nrl-text"}`}>
                        <span className="block min-w-0 truncate" title={row.team}>{row.team}</span>
                      </td>
                      <td className={`px-2 py-1.5 text-center text-xs font-black whitespace-nowrap sm:px-2.5 sm:text-[13px] ${teamStatsTableSort.column === "games" ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}>
                        {row.games}
                      </td>
                      {TEAM_STATS_TABLE_COLUMNS.map((stat) => {
                        const active = teamStatsTableSort.column === `stat:${stat}`;
                        return (
                          <td
                            key={`${row.key}-${stat}`}
                            className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap last:border-r-0 sm:px-2.5 sm:text-[13px] ${active ? "z-[4] bg-nrl-panel-2 text-nrl-accent shadow-[-10px_0_18px_rgba(0,0,0,0.22)] sm:sticky sm:right-0" : "text-nrl-text"}`}
                          >
                            {formatTableNumber(
                              teamStatsTableValueMode === "Total" ? row.totals[stat] ?? null : row.averages[stat] ?? null
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="rounded-md border border-nrl-border bg-nrl-panel p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">Team Comparison</div>
          <button
            type="button"
            onClick={() => setComparisonFiltersOpen((open) => !open)}
            className={`relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
              comparisonFiltersOpen ||
              finalsMode !== "Yes" ||
              minMinutes !== 0 ||
              minutesMode !== "All" ||
              selectedYears.length !== initialYears.length ||
              selectedYears.some((year, index) => year !== initialYears[index])
                ? "border-nrl-accent/60 bg-nrl-accent/10 text-nrl-accent"
                : "border-nrl-border bg-nrl-panel-2 text-nrl-muted hover:border-nrl-accent hover:text-nrl-accent"
            }`}
            aria-expanded={comparisonFiltersOpen}
            aria-label="Filters"
          >
            <span className="flex flex-col gap-0.5" aria-hidden="true">
              <span className="block h-0.5 w-5 rounded-full bg-current" />
              <span className="block h-0.5 w-5 rounded-full bg-current" />
              <span className="block h-0.5 w-5 rounded-full bg-current" />
            </span>
          </button>
        </div>
        {comparisonFiltersOpen ? (
          <div className="mt-3 border-t border-nrl-border pt-3">
            <FilterBar
              years={availableYears}
              selectedYears={selectedYears}
              onYearsChange={handleYearsChange}
              finalsMode={finalsMode}
              onFinalsModeChange={setFinalsMode}
              minutesThreshold={minMinutes}
              onMinutesThresholdChange={setMinMinutes}
              minutesMode={minutesMode}
              onMinutesModeChange={setMinutesMode}
              showPosition={false}
              showMinutes={false}
            />
          </div>
        ) : null}
        <div className="mt-3">
          <TeamSelectors
            teamList={teamList}
            team1={effectiveT1}
            onTeam1Change={setTeam1}
            team1Perspective={team1Perspective}
            onTeam1PerspectiveChange={setTeam1Perspective}
            team2={team2}
            onTeam2Change={setTeam2}
            team2Perspective={team2Perspective}
            onTeam2PerspectiveChange={setTeam2Perspective}
            statList={statList}
            stat1={stat1}
            onStat1Change={setStat1}
            stat2={stat2}
            onStat2Change={setStat2}
          />
        </div>
      </div>
      {loading && (
        <div className="flex justify-center py-6 md:py-8">
          <span
            aria-label="Loading"
            role="status"
            className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent"
          />
        </div>
      )}
      {!loading && allData.length === 0 && (
        <div className="rounded-lg border border-nrl-border bg-nrl-panel p-6 text-center text-nrl-muted">
          <div>No data available for the selected season.</div>
        </div>
      )}
      {allData.length > 0 && (
        <>
          <SummaryPanel
            entities={entities}
            entity="team"
            summaryRows={summaryRows}
            percentileResults={percentileResults}
            recentFormResults={recentFormResults}
            rankingMode="rank"
          />

          <ChartPanelGrid panels={filteredChartPanels} unlockAll={hasClientProPlotAccess} />

          {historyChartPanels.length > 0 ? (
            <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-nrl-accent">
                Full History Plots
              </div>
              <div className="mt-4 text-xs text-nrl-muted">
                Rolling average and avg vs opponent use the full unlocked-year history rather than the filters above.
              </div>
              <ChartPanelGrid panels={historyChartPanels} unlockAll={hasClientProPlotAccess} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

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
import { SummaryPanel } from "@/components/summary/summary-panel";
import { ChartPanelGrid } from "@/components/charts/chart-panel-grid";
import { ScatterCorrelation } from "@/components/charts/scatter-correlation";
import { KDEDistribution } from "@/components/charts/kde-distribution";
import { OpponentAverageHeatmap } from "@/components/charts/opponent-average-heatmap";
import { FantasyGameLogTrendBrush } from "@/components/charts/fantasy-game-log-trend-brush";
import { hasProPlotAccess } from "@/lib/access/pro-access";
import { isAccessibleSeason } from "@/lib/access/season-access";

interface TeamComparisonProps {
  initialData: TeamStat[];
  availableYears: string[];
  defaultYears: string[];
  canBypassPlotGate?: boolean;
}

type TeamPerspective = "For" | "Against";

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
    setLoading(true);
    try {
      const res = await fetch(`/api/team-stats?years=${unlockedYears.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setAllData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [unlockedYears]);

  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    setSelectedYears(validYears);
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears]);
  const [finalsMode, setFinalsMode] = useState("Yes");
  const [minMinutes, setMinMinutes] = useState(0);
  const [minutesMode, setMinutesMode] = useState("All");

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
      <div className="rounded-md border border-nrl-border bg-nrl-panel p-2">
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

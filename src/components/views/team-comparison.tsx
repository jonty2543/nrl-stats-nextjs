"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import { TEAM_STATS } from "@/lib/data/constants";
import {
  filterByPosition,
  filterByMinutes,
  filterByFinals,
  filterByYear,
  aggregateTeamStats,
  computeSummary,
  computePercentileRanks,
  computeRecentForm,
  computeRoundData,
} from "@/lib/data/transform";
import { FilterBar } from "@/components/filters/filter-bar";
import { TeamSelectors } from "@/components/filters/team-selectors";
import { SummaryPanel } from "@/components/summary/summary-panel";
import { ChartPanelGrid } from "@/components/charts/chart-panel-grid";
import { ScatterCorrelation } from "@/components/charts/scatter-correlation";
import { LineRound } from "@/components/charts/line-round";
import { KDEDistribution } from "@/components/charts/kde-distribution";
import { PillRadio } from "@/components/ui/pill-radio";

interface TeamComparisonProps {
  initialData: PlayerStat[];
  availableYears: string[];
  defaultYears: string[];
}

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

export function TeamComparison({
  initialData,
  availableYears,
  defaultYears,
}: TeamComparisonProps) {
  const [allData, setAllData] = useState<PlayerStat[]>(initialData);
  const [selectedYears, setSelectedYears] = useState<string[]>(defaultYears);
  const [loading, setLoading] = useState(false);

  const handleYearsChange = useCallback(async (years: string[]) => {
    setSelectedYears(years);
    if (years.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/player-stats?years=${years.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setAllData(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  const [position, setPosition] = useState("All");
  const [finalsMode, setFinalsMode] = useState("Yes");
  const [minMinutes, setMinMinutes] = useState(0);
  const [minutesMode, setMinutesMode] = useState("All");

  const dfYear = useMemo(
    () => filterByYear(allData, selectedYears),
    [allData, selectedYears]
  );
  const dfYearFinals = useMemo(
    () => filterByFinals(dfYear, finalsMode as "Yes" | "No"),
    [dfYear, finalsMode]
  );
  const dfPosition = useMemo(
    () => filterByPosition(dfYearFinals, position),
    [dfYearFinals, position]
  );
  const df = useMemo(
    () => filterByMinutes(dfPosition, minMinutes, minutesMode as "All" | "Over" | "Under"),
    [dfPosition, minMinutes, minutesMode]
  );

  const teamDf = useMemo(() => aggregateTeamStats(df), [df]);

  const positions = useMemo(
    () => [...new Set(dfYearFinals.map((r) => r.Position))].filter(Boolean).sort(),
    [dfYearFinals]
  );

  const teamList = useMemo(
    () => [...new Set(dfPosition.map((r) => r.Team))].sort(),
    [dfPosition]
  );

  const statList = useMemo(
    () =>
      (TEAM_STATS as unknown as string[]).filter((s) =>
        teamDf.some((r) => r[s] !== undefined)
      ),
    [teamDf]
  );

  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("None");
  const [stat1, setStat1] = useState("Points");
  const [stat2, setStat2] = useState("All Run Metres");
  const [roundYear, setRoundYear] = useState(defaultYears[0] ?? "");

  useEffect(() => {
    if (teamList.length === 0) return;

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

    if (!team1 || !teamList.includes(team1)) {
      setTeam1(defaultTeam1);
    }

    if (team2 === "None") {
      const defaultTeam2 = findTeam(DEFAULT_TEAM_2_CANDIDATES);
      if (defaultTeam2 && defaultTeam2 !== defaultTeam1) {
        setTeam2(defaultTeam2);
      }
      return;
    }

    if (!teamList.includes(team2) || team2 === defaultTeam1) {
      const defaultTeam2 = findTeam(DEFAULT_TEAM_2_CANDIDATES);
      if (defaultTeam2 && defaultTeam2 !== defaultTeam1) {
        setTeam2(defaultTeam2);
      } else {
        setTeam2("None");
      }
    }
  }, [team1, team2, teamList]);

  const presetPayload = useMemo<Record<string, unknown>>(
    () => ({
      selectedYears,
      position,
      finalsMode,
      minMinutes,
      minutesMode,
      team1,
      team2,
      stat1,
      stat2,
      roundYear,
    }),
    [
      selectedYears,
      position,
      finalsMode,
      minMinutes,
      minutesMode,
      team1,
      team2,
      stat1,
      stat2,
      roundYear,
    ]
  );

  const applyPreset = useCallback(
    async (payload: Record<string, unknown>) => {
      const validYears = Array.isArray(payload.selectedYears)
        ? payload.selectedYears
            .filter((value): value is string => typeof value === "string")
            .filter((year) => availableYears.includes(year))
        : [];

      if (validYears.length > 0) {
        await handleYearsChange(validYears);
      }

      const fallbackYear = validYears[0] ?? selectedYears[0] ?? "";

      if (typeof payload.position === "string") setPosition(payload.position);
      if (payload.finalsMode === "Yes" || payload.finalsMode === "No") {
        setFinalsMode(payload.finalsMode);
      }
      if (
        payload.minutesMode === "All" ||
        payload.minutesMode === "Over" ||
        payload.minutesMode === "Under"
      ) {
        setMinutesMode(payload.minutesMode);
      }
      if (
        typeof payload.minMinutes === "number" &&
        Number.isFinite(payload.minMinutes)
      ) {
        setMinMinutes(Math.max(0, payload.minMinutes));
      }
      if (typeof payload.team1 === "string") setTeam1(payload.team1);
      if (typeof payload.team2 === "string") setTeam2(payload.team2);
      if (typeof payload.stat1 === "string") setStat1(payload.stat1);
      if (typeof payload.stat2 === "string") setStat2(payload.stat2);
      if (typeof payload.roundYear === "string") {
        setRoundYear(payload.roundYear);
      } else if (fallbackYear) {
        setRoundYear(fallbackYear);
      }
    },
    [availableYears, handleYearsChange, selectedYears]
  );

  const effectiveT1 = team1 || teamList[0] || "";

  const t1Rows = useMemo(
    () => teamDf.filter((r) => r.Team === effectiveT1),
    [teamDf, effectiveT1]
  );
  const t2Rows = useMemo(
    () => (team2 !== "None" ? teamDf.filter((r) => r.Team === team2) : []),
    [teamDf, team2]
  );

  const statsToShow = useMemo(
    () => [stat1, ...(stat2 !== "None" ? [stat2] : [])],
    [stat1, stat2]
  );

  const summaryRows = useMemo(() => {
    const rows = computeSummary(effectiveT1, t1Rows as unknown as PlayerStat[], statsToShow);
    if (team2 !== "None") {
      rows.push(...computeSummary(team2, t2Rows as unknown as PlayerStat[], statsToShow));
    }
    return rows;
  }, [effectiveT1, t1Rows, team2, t2Rows, statsToShow]);

  const entities = useMemo(() => {
    const e = [{ name: effectiveT1, rows: t1Rows as (PlayerStat | TeamStat)[] }];
    if (team2 !== "None") e.push({ name: team2, rows: t2Rows as (PlayerStat | TeamStat)[] });
    return e;
  }, [effectiveT1, t1Rows, team2, t2Rows]);

  const percentileResults = useMemo(() => {
    const results = computePercentileRanks(
      effectiveT1, t1Rows as unknown as PlayerStat[], teamDf as unknown as PlayerStat[], statsToShow, "Team"
    );
    if (team2 !== "None") {
      results.push(
        ...computePercentileRanks(
          team2, t2Rows as unknown as PlayerStat[], teamDf as unknown as PlayerStat[], statsToShow, "Team"
        )
      );
    }
    return results;
  }, [effectiveT1, t1Rows, team2, t2Rows, teamDf, statsToShow]);

  const recentFormResults = useMemo(() => {
    const results = computeRecentForm(effectiveT1, t1Rows as unknown as PlayerStat[], statsToShow);
    if (team2 !== "None") {
      results.push(...computeRecentForm(team2, t2Rows as unknown as PlayerStat[], statsToShow));
    }
    return results;
  }, [effectiveT1, t1Rows, team2, t2Rows, statsToShow]);

  // Chart data — filtered to a single year for round charts
  const effectiveRoundYear = roundYear || selectedYears[0] || "";
  const t1RoundRows = useMemo(
    () => (t1Rows as unknown as PlayerStat[]).filter((r) => r.Year === effectiveRoundYear),
    [t1Rows, effectiveRoundYear]
  );
  const t2RoundRows = useMemo(
    () => (t2Rows as unknown as PlayerStat[]).filter((r) => r.Year === effectiveRoundYear),
    [t2Rows, effectiveRoundYear]
  );
  const t1RoundData = useMemo(
    () => computeRoundData(t1RoundRows, stat1),
    [t1RoundRows, stat1]
  );
  const t2RoundData = useMemo(
    () => (team2 !== "None" ? computeRoundData(t2RoundRows, stat1) : []),
    [t2RoundRows, team2, stat1]
  );
  const t1Stat2Round = useMemo(
    () => (stat2 !== "None" ? computeRoundData(t1RoundRows, stat2) : []),
    [t1RoundRows, stat2]
  );
  const t2Stat2Round = useMemo(
    () => (team2 !== "None" && stat2 !== "None" ? computeRoundData(t2RoundRows, stat2) : []),
    [t2RoundRows, team2, stat2]
  );

  const chartPanels = useMemo(() => {
    const panels: { id: string; title: string; content: React.ReactNode; wide?: boolean }[] = [];
    const hasTwoTeams = team2 !== "None";
    const hasTwoStats = stat2 !== "None";

    if (hasTwoStats) {
      panels.push({
        id: "corr-t1",
        title: `${effectiveT1}: ${stat1} vs ${stat2}`,
        content: (
          <ScatterCorrelation
            rows={t1Rows as unknown as PlayerStat[]}
            statX={stat1}
            statY={stat2}
            title={`${effectiveT1} \u2014 ${stat1} vs ${stat2}`}
            label={effectiveT1}
          />
        ),
      });
      if (hasTwoTeams) {
        panels.push({
          id: "corr-t2",
          title: `${team2}: ${stat1} vs ${stat2}`,
          content: (
            <ScatterCorrelation
              rows={t2Rows as unknown as PlayerStat[]}
              statX={stat1}
              statY={stat2}
              title={`${team2} \u2014 ${stat1} vs ${stat2}`}
              label={team2}
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
            { label: effectiveT1, values: t1Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null) },
            ...(hasTwoTeams
              ? [{ label: team2, values: t2Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
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
              { label: effectiveT1, values: t1Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null) },
              ...(hasTwoTeams
                ? [{ label: team2, values: t2Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
                : []),
            ]}
          />
        ),
      });
    }

    const roundYearPicker = selectedYears.length > 1 ? (
      <div className="mb-3">
        <PillRadio options={selectedYears} value={effectiveRoundYear} onChange={setRoundYear} />
      </div>
    ) : null;

    panels.push({
      id: "round-1",
      title: `${stat1}: Stat Comparison by Round`,
      wide: true,
      content: (
        <div>
          {roundYearPicker}
          <LineRound
            title={
              hasTwoTeams
                ? `${stat1}: ${effectiveT1} vs ${team2}`
                : `${effectiveT1} \u2014 ${stat1} by Round`
            }
            stat={stat1}
            series={
              hasTwoTeams
                ? [
                    { label: effectiveT1, data: t1RoundData },
                    { label: team2, data: t2RoundData },
                  ]
                : [{ label: effectiveT1, data: t1RoundData }]
            }
            mode={hasTwoTeams ? "compare" : "single"}
          />
        </div>
      ),
    });
    if (hasTwoStats) {
      panels.push({
        id: "round-2",
        title: `${stat2}: Stat Comparison by Round`,
        wide: true,
        content: (
          <div>
            {roundYearPicker}
            <LineRound
              title={
                hasTwoTeams
                  ? `${stat2}: ${effectiveT1} vs ${team2}`
                  : `${effectiveT1} \u2014 ${stat2} by Round`
              }
              stat={stat2}
              series={
                hasTwoTeams
                  ? [
                      { label: effectiveT1, data: t1Stat2Round },
                      { label: team2, data: t2Stat2Round },
                    ]
                  : [{ label: effectiveT1, data: t1Stat2Round }]
              }
              mode={hasTwoTeams ? "compare" : "single"}
            />
          </div>
        ),
      });
    }

    return panels;
  }, [
    effectiveT1, team2, stat1, stat2, t1Rows, t2Rows,
    t1RoundData, t2RoundData, t1Stat2Round, t2Stat2Round,
    effectiveRoundYear, setRoundYear, selectedYears,
  ]);

  if (allData.length === 0 && !loading) {
    return (
      <div className="rounded-lg border border-nrl-border bg-nrl-panel p-6 text-center text-nrl-muted">
        No data available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="rounded-lg border border-nrl-accent/30 bg-nrl-panel p-3 text-center text-sm text-nrl-accent">
          <div className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-nrl-accent/30 border-t-nrl-accent" />
            <span>Loading data...</span>
          </div>
        </div>
      )}
      <FilterBar
        years={availableYears}
        selectedYears={selectedYears}
        onYearsChange={handleYearsChange}
        positions={positions}
        selectedPosition={position}
        onPositionChange={setPosition}
        finalsMode={finalsMode}
        onFinalsModeChange={setFinalsMode}
        minutesThreshold={minMinutes}
        onMinutesThresholdChange={setMinMinutes}
        minutesMode={minutesMode}
        onMinutesModeChange={setMinutesMode}
        presetsScope="team"
        presetPayload={presetPayload}
        onApplyPreset={applyPreset}
        showPosition={false}
        showMinutes={false}
      />

      <div className="rounded-md border border-nrl-border bg-nrl-panel p-2">
        <TeamSelectors
          teamList={teamList}
          team1={effectiveT1}
          onTeam1Change={setTeam1}
          team2={team2}
          onTeam2Change={setTeam2}
          statList={statList}
          stat1={stat1}
          onStat1Change={setStat1}
          stat2={stat2}
          onStat2Change={setStat2}
        />
      </div>

      <SummaryPanel
        entities={entities}
        entity="team"
        summaryRows={summaryRows}
        percentileResults={percentileResults}
        recentFormResults={recentFormResults}
        rankingMode="rank"
      />

      <ChartPanelGrid panels={chartPanels} />
    </div>
  );
}

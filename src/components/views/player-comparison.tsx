"use client";

import { useAuth } from "@clerk/nextjs";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { PlayerStat } from "@/lib/data/types";
import { PLAYER_STATS } from "@/lib/data/constants";
import {
  filterByMinutes,
  filterByFinals,
  filterByYear,
  filterByTeammate,
  getTeammateOptions,
  computeSummary,
  computePercentileRanks,
  computeRecentForm,
  computeRoundData,
  buildFantasyRank,
} from "@/lib/data/transform";
import { FilterBar } from "@/components/filters/filter-bar";
import { PlayerSelectors } from "@/components/filters/player-selectors";
import { SummaryPanel } from "@/components/summary/summary-panel";
import { ChartPanelGrid } from "@/components/charts/chart-panel-grid";
import { ScatterCorrelation } from "@/components/charts/scatter-correlation";
import { LineRound } from "@/components/charts/line-round";
import { KDEDistribution } from "@/components/charts/kde-distribution";
import { WithWithoutLine } from "@/components/charts/with-without-line";
import { WithWithoutKDE } from "@/components/charts/with-without-kde";
import { PillRadio } from "@/components/ui/pill-radio";
import { isAccessibleSeason } from "@/lib/access/season-access";

interface PlayerComparisonProps {
  initialData: PlayerStat[];
  availableYears: string[];
  defaultYears: string[];
}

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

function withPositionLabel(name: string, position: string): string {
  if (!name || name === "None" || position === "All") return name;
  return `${name} (${position})`;
}

export function PlayerComparison({
  initialData,
  availableYears,
  defaultYears,
}: PlayerComparisonProps) {
  type TeammateMode = "both" | "with" | "without";
  type PercentileScope = "Position" | "All Players";
  const { userId } = useAuth();
  const canAccessLoginSeason = Boolean(userId);

  const [allData, setAllData] = useState<PlayerStat[]>(initialData);
  const unlockedYears = useMemo(
    () =>
      availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason)),
    [availableYears, canAccessLoginSeason]
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

  // Re-fetch when years change
  const handleYearsChange = useCallback(async (years: string[]) => {
    const validYears = ensureAtLeastOneUnlockedYear(filterUnlockedYears(years));
    setSelectedYears(validYears);
    if (validYears.length === 0) {
      setAllData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/player-stats?years=${validYears.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setAllData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [ensureAtLeastOneUnlockedYear, filterUnlockedYears]);
  const [finalsMode, setFinalsMode] = useState("Yes");
  const [minMinutes, setMinMinutes] = useState(0);
  const [minutesMode, setMinutesMode] = useState("All");
  const [percentileScope, setPercentileScope] = useState<PercentileScope>("Position");

  // Filter pipeline
  const dfYear = useMemo(
    () => filterByYear(allData, selectedYears),
    [allData, selectedYears]
  );
  const dfYearFinals = useMemo(
    () => filterByFinals(dfYear, finalsMode as "Yes" | "No"),
    [dfYear, finalsMode]
  );
  const df = useMemo(
    () => filterByMinutes(dfYearFinals, minMinutes, minutesMode as "All" | "Over" | "Under"),
    [dfYearFinals, minMinutes, minutesMode]
  );
  const dfAllPositions = useMemo(
    () => filterByMinutes(dfYearFinals, minMinutes, minutesMode as "All" | "Over" | "Under"),
    [dfYearFinals, minMinutes, minutesMode]
  );

  const positions = useMemo(
    () => [...new Set(dfYearFinals.map((r) => r.Position))].filter(Boolean).sort(),
    [dfYearFinals]
  );

  const fantasyRank = useMemo(() => buildFantasyRank(allData), [allData]);

  const statList = useMemo(
    () =>
      (PLAYER_STATS as unknown as string[]).filter((s) =>
        df.some((r) => r[s] !== undefined)
      ),
    [df]
  );

  // Player selections
  const [player1, setPlayer1] = useState("Reece Walsh");
  const [player2, setPlayer2] = useState("Kalyn Ponga");
  const [player1Position, setPlayer1Position] = useState("All");
  const [player2Position, setPlayer2Position] = useState("All");
  const [teammate1, setTeammate1] = useState("None");
  const [teammate2, setTeammate2] = useState("None");
  const [teammate1Position, setTeammate1Position] = useState("All");
  const [teammate2Position, setTeammate2Position] = useState("All");
  const [teammateMode1, setTeammateMode1] = useState<TeammateMode>("both");
  const [teammateMode2, setTeammateMode2] = useState<TeammateMode>("both");
  const [stat1, setStat1] = useState("Fantasy");
  const [stat2, setStat2] = useState("All Runs");
  const [wwYear, setWwYear] = useState(selectedYears[0] ?? "");
  const [roundYear, setRoundYear] = useState(selectedYears[0] ?? "");

  const presetPayload = useMemo<Record<string, unknown>>(
    () => ({
      selectedYears,
      finalsMode,
      minMinutes,
      minutesMode,
      percentileScope,
      player1,
      player2,
      player1Position,
      player2Position,
      teammate1,
      teammate2,
      teammate1Position,
      teammate2Position,
      teammateMode1,
      teammateMode2,
      stat1,
      stat2,
      wwYear,
      roundYear,
    }),
    [
      selectedYears,
      finalsMode,
      minMinutes,
      minutesMode,
      percentileScope,
      player1,
      player2,
      player1Position,
      player2Position,
      teammate1,
      teammate2,
      teammate1Position,
      teammate2Position,
      teammateMode1,
      teammateMode2,
      stat1,
      stat2,
      wwYear,
      roundYear,
    ]
  );

  const applyPreset = useCallback(
    async (payload: Record<string, unknown>) => {
      const validYears = Array.isArray(payload.selectedYears)
        ? payload.selectedYears
            .filter((value): value is string => typeof value === "string")
            .filter((year) => unlockedYears.includes(year))
        : [];

      if (validYears.length > 0) {
        await handleYearsChange(validYears);
      }

      const fallbackYear = validYears[0] ?? selectedYears[0] ?? "";

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
      if (
        payload.percentileScope === "Position" ||
        payload.percentileScope === "All Players"
      ) {
        setPercentileScope(payload.percentileScope);
      }

      if (typeof payload.player1 === "string") setPlayer1(payload.player1);
      if (typeof payload.player2 === "string") setPlayer2(payload.player2);
      if (typeof payload.player1Position === "string") {
        setPlayer1Position(payload.player1Position);
      }
      if (typeof payload.player2Position === "string") {
        setPlayer2Position(payload.player2Position);
      }
      if (typeof payload.teammate1 === "string") setTeammate1(payload.teammate1);
      if (typeof payload.teammate2 === "string") setTeammate2(payload.teammate2);
      if (typeof payload.teammate1Position === "string") {
        setTeammate1Position(payload.teammate1Position);
      }
      if (typeof payload.teammate2Position === "string") {
        setTeammate2Position(payload.teammate2Position);
      }
      if (
        payload.teammateMode1 === "both" ||
        payload.teammateMode1 === "with" ||
        payload.teammateMode1 === "without"
      ) {
        setTeammateMode1(payload.teammateMode1);
      }
      if (
        payload.teammateMode2 === "both" ||
        payload.teammateMode2 === "with" ||
        payload.teammateMode2 === "without"
      ) {
        setTeammateMode2(payload.teammateMode2);
      }
      if (typeof payload.stat1 === "string") setStat1(payload.stat1);
      if (typeof payload.stat2 === "string") setStat2(payload.stat2);
      if (typeof payload.wwYear === "string") {
        setWwYear(payload.wwYear);
      } else if (fallbackYear) {
        setWwYear(fallbackYear);
      }
      if (typeof payload.roundYear === "string") {
        setRoundYear(payload.roundYear);
      } else if (fallbackYear) {
        setRoundYear(fallbackYear);
      }
    },
    [handleYearsChange, selectedYears, unlockedYears]
  );

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
    if (selectedYears.length === 0) return;
    hasBootstrappedFetch.current = true;
    void handleYearsChange(selectedYears);
  }, [allData.length, handleYearsChange, initialData.length, selectedYears]);

  useEffect(() => {
    const validYears = selectedYears.filter((year) => unlockedYears.includes(year));
    const hasChanged =
      validYears.length !== selectedYears.length ||
      validYears.some((year, index) => year !== selectedYears[index]);
    if (!hasChanged) return;
    void handleYearsChange(validYears);
  }, [handleYearsChange, selectedYears, unlockedYears]);

  useEffect(() => {
    if (selectedYears.length === 0) return;
    if (!selectedYears.includes(roundYear)) {
      setRoundYear(selectedYears[0]);
    }
    if (!selectedYears.includes(wwYear)) {
      setWwYear(selectedYears[0]);
    }
  }, [roundYear, selectedYears, wwYear]);

  const sortPlayersByRank = useCallback((names: string[]) => {
    return [...names].sort((a, b) => {
      const ra = -(fantasyRank.get(a) ?? -Infinity);
      const rb = -(fantasyRank.get(b) ?? -Infinity);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }, [fantasyRank]);

  const p1PlayerOptions = useMemo(() => {
    const pool = player1Position === "All"
      ? df
      : df.filter((r) => r.Position === player1Position);
    return sortPlayersByRank([...new Set(pool.map((r) => r.Name))]);
  }, [df, player1Position, sortPlayersByRank]);

  const p2PlayerOptions = useMemo(() => {
    const pool = player2Position === "All"
      ? df
      : df.filter((r) => r.Position === player2Position);
    return sortPlayersByRank([...new Set(pool.map((r) => r.Name))]);
  }, [df, player2Position, sortPlayersByRank]);

  const hasPlayer1 = player1 !== "" && player1 !== "None";
  const hasPlayer2 = player2 !== "None";
  const hasTwoPlayers = hasPlayer1 && hasPlayer2;
  const usePlayer2AsPrimary = !hasPlayer1 && hasPlayer2;

  const effectiveP1 = usePlayer2AsPrimary
    ? player2
    : hasPlayer1
      ? player1
      : p1PlayerOptions[0] || "";
  const effectiveP1Position = usePlayer2AsPrimary ? player2Position : player1Position;
  const effectiveP1Teammate = usePlayer2AsPrimary ? teammate2 : teammate1;
  const effectiveP1TeammatePosition = usePlayer2AsPrimary ? teammate2Position : teammate1Position;
  const effectiveP1TeammateMode = usePlayer2AsPrimary ? teammateMode2 : teammateMode1;

  const effectiveP1Label = withPositionLabel(effectiveP1, effectiveP1Position);
  const player2Label = withPositionLabel(player2, player2Position);
  const teammate1Label = withPositionLabel(effectiveP1Teammate, effectiveP1TeammatePosition);
  const teammate2Label = withPositionLabel(teammate2, teammate2Position);

  const tm1Options = useMemo(
    () =>
      hasPlayer1 && player1
        ? getTeammateOptions(player1, dfYearFinals, fantasyRank)
        : [],
    [hasPlayer1, player1, dfYearFinals, fantasyRank]
  );
  const tm2Options = useMemo(
    () =>
      hasPlayer2
        ? getTeammateOptions(player2, dfYearFinals, fantasyRank)
        : [],
    [hasPlayer2, player2, dfYearFinals, fantasyRank]
  );

  useEffect(() => {
    if (!player1 && p1PlayerOptions.length > 0) {
      setPlayer1(p1PlayerOptions[0]);
    }
  }, [player1, p1PlayerOptions]);

  useEffect(() => {
    if (!player1) return;

    if (player1 === "None") {
      if (!hasPlayer2) {
        setPlayer1(p1PlayerOptions[0] || "");
      }
      if (teammate1 !== "None") setTeammate1("None");
      if (teammate1Position !== "All") setTeammate1Position("All");
      if (teammateMode1 !== "both") setTeammateMode1("both");
      return;
    }

    if (!p1PlayerOptions.includes(player1)) {
      if (hasPlayer2) {
        setPlayer1("None");
      } else {
        setPlayer1(p1PlayerOptions[0] || "");
      }
    }
  }, [player1, p1PlayerOptions, hasPlayer2, teammate1, teammate1Position, teammateMode1]);

  useEffect(() => {
    if (hasPlayer2 && !p2PlayerOptions.includes(player2)) {
      setPlayer2("None");
      setTeammate2("None");
      setTeammate2Position("All");
      setTeammateMode2("both");
    }
  }, [hasPlayer2, player2, p2PlayerOptions]);

  // Keep teammate selections valid when player choices change.
  useEffect(() => {
    if (teammate1 !== "None" && !tm1Options.includes(teammate1)) {
      setTeammate1("None");
      setTeammate1Position("All");
      setTeammateMode1("both");
    }
  }, [teammate1, tm1Options]);

  useEffect(() => {
    if (!hasPlayer2) {
      if (teammate2 !== "None") setTeammate2("None");
      if (teammate2Position !== "All") setTeammate2Position("All");
      if (teammateMode2 !== "both") setTeammateMode2("both");
      return;
    }

    if (teammate2 !== "None" && !tm2Options.includes(teammate2)) {
      setTeammate2("None");
      setTeammate2Position("All");
      setTeammateMode2("both");
    }
  }, [hasPlayer2, teammate2, teammate2Position, tm2Options, teammateMode2]);

  const handleTeammate1Change = useCallback((value: string) => {
    setTeammate1(value);
    setTeammate1Position("All");
    setTeammateMode1("both");
  }, []);

  const handleTeammate2Change = useCallback((value: string) => {
    setTeammate2(value);
    setTeammate2Position("All");
    setTeammateMode2("both");
  }, []);

  const p1BaseRows = useMemo(
    () =>
      df.filter(
        (r) =>
          r.Name === effectiveP1 &&
          (effectiveP1Position === "All" || r.Position === effectiveP1Position)
      ),
    [df, effectiveP1, effectiveP1Position]
  );
  const p2BaseRows = useMemo(
    () =>
      !hasTwoPlayers
        ? []
        : df.filter(
            (r) =>
              r.Name === player2 &&
              (player2Position === "All" || r.Position === player2Position)
          ),
    [df, hasTwoPlayers, player2, player2Position]
  );
  const p1AllRows = useMemo(
    () =>
      dfAllPositions.filter(
        (r) =>
          r.Name === effectiveP1 &&
          (effectiveP1Position === "All" || r.Position === effectiveP1Position)
      ),
    [dfAllPositions, effectiveP1, effectiveP1Position]
  );
  const p2AllRows = useMemo(
    () =>
      !hasTwoPlayers
        ? []
        : dfAllPositions.filter(
            (r) =>
              r.Name === player2 &&
              (player2Position === "All" || r.Position === player2Position)
          ),
    [dfAllPositions, hasTwoPlayers, player2, player2Position]
  );

  // Filter by teammate
  const p1Rows = useMemo(() => {
    if (effectiveP1Teammate === "None" || effectiveP1TeammateMode === "both") return p1BaseRows;
    return filterByTeammate(
      p1BaseRows,
      effectiveP1Teammate,
      effectiveP1TeammateMode === "with",
      dfYearFinals,
      effectiveP1TeammatePosition
    );
  }, [p1BaseRows, effectiveP1Teammate, effectiveP1TeammateMode, dfYearFinals, effectiveP1TeammatePosition]);

  const p2Rows = useMemo(() => {
    if (!hasTwoPlayers) return [];
    if (teammate2 === "None" || teammateMode2 === "both") return p2BaseRows;
    return filterByTeammate(
      p2BaseRows,
      teammate2,
      teammateMode2 === "with",
      dfYearFinals,
      teammate2Position
    );
  }, [hasTwoPlayers, p2BaseRows, teammate2, teammateMode2, dfYearFinals, teammate2Position]);

  // Stats
  const statsToShow = useMemo(
    () => [stat1, ...(stat2 !== "None" ? [stat2] : [])],
    [stat1, stat2]
  );

  const summaryRows = useMemo(() => {
    const rows = computeSummary(effectiveP1Label, p1Rows, statsToShow);
    if (hasTwoPlayers) {
      rows.push(...computeSummary(player2Label, p2Rows, statsToShow));
    }
    return rows;
  }, [effectiveP1Label, p1Rows, hasTwoPlayers, player2Label, p2Rows, statsToShow]);

  const entities = useMemo(() => {
    const e = [{ name: effectiveP1Label, rows: p1Rows as (PlayerStat)[] }];
    if (hasTwoPlayers) e.push({ name: player2Label, rows: p2Rows as (PlayerStat)[] });
    return e;
  }, [effectiveP1Label, p1Rows, hasTwoPlayers, player2Label, p2Rows]);

  const percentileResults = useMemo(() => {
    const primaryPosition = (rows: PlayerStat[]): string | null => {
      if (rows.length === 0) return null;
      const counts = new Map<string, number>();
      for (const row of rows) {
        counts.set(row.Position, (counts.get(row.Position) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };

    const percentilePoolForPlayer = (allRowsForPlayer: PlayerStat[]): PlayerStat[] => {
      if (percentileScope === "All Players") return dfAllPositions;
      const pos = primaryPosition(allRowsForPlayer);
      if (!pos) return dfAllPositions;
      return dfAllPositions.filter((r) => r.Position === pos);
    };

    const p1Pool = percentilePoolForPlayer(p1AllRows);
    const results = computePercentileRanks(effectiveP1, p1Rows, p1Pool, statsToShow).map((r) => ({
      ...r,
      entity: effectiveP1Label,
    }));
    if (hasTwoPlayers) {
      const p2Pool = percentilePoolForPlayer(p2AllRows);
      results.push(
        ...computePercentileRanks(player2, p2Rows, p2Pool, statsToShow).map((r) => ({
          ...r,
          entity: player2Label,
        }))
      );
    }
    return results;
  }, [effectiveP1, effectiveP1Label, p1Rows, p1AllRows, hasTwoPlayers, player2, player2Label, p2Rows, p2AllRows, dfAllPositions, percentileScope, statsToShow]);

  const recentFormResults = useMemo(() => {
    const results = computeRecentForm(effectiveP1, p1Rows, statsToShow).map((r) => ({
      ...r,
      entity: effectiveP1Label,
    }));
    if (hasTwoPlayers) {
      results.push(
        ...computeRecentForm(player2, p2Rows, statsToShow).map((r) => ({
          ...r,
          entity: player2Label,
        }))
      );
    }
    return results;
  }, [effectiveP1, effectiveP1Label, p1Rows, hasTwoPlayers, player2, player2Label, p2Rows, statsToShow]);

  // Chart data — filtered to a single year for round charts
  const effectiveRoundYear = roundYear || selectedYears[0] || "";
  const p1RoundRows = useMemo(
    () => p1Rows.filter((r) => r.Year === effectiveRoundYear),
    [p1Rows, effectiveRoundYear]
  );
  const p2RoundRows = useMemo(
    () => p2Rows.filter((r) => r.Year === effectiveRoundYear),
    [p2Rows, effectiveRoundYear]
  );
  const p1RoundData = useMemo(
    () => computeRoundData(p1RoundRows, stat1),
    [p1RoundRows, stat1]
  );
  const p2RoundData = useMemo(
    () => (hasTwoPlayers ? computeRoundData(p2RoundRows, stat1) : []),
    [p2RoundRows, hasTwoPlayers, stat1]
  );
  // Build chart panels
  const chartPanels = useMemo(() => {
    const panels: { id: string; title: string; content: React.ReactNode; wide?: boolean }[] = [];
    const hasTwoStats = stat2 !== "None";

    // Correlation panels (always half-width)
    if (hasTwoStats) {
      panels.push({
        id: "corr-p1",
        title: `${effectiveP1Label}: ${stat1} vs ${stat2}`,
        content: (
          <ScatterCorrelation
            rows={p1Rows}
            statX={stat1}
            statY={stat2}
            title={`${effectiveP1Label} \u2014 ${stat1} vs ${stat2}`}
            label={effectiveP1Label}
          />
        ),
      });
      if (hasTwoPlayers) {
        panels.push({
          id: "corr-p2",
          title: `${player2Label}: ${stat1} vs ${stat2}`,
          content: (
            <ScatterCorrelation
              rows={p2Rows}
              statX={stat1}
              statY={stat2}
              title={`${player2Label} \u2014 ${stat1} vs ${stat2}`}
              label={player2Label}
            />
          ),
        });
      }
    }

    const stat1Series = [
      { label: effectiveP1, values: p1Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null) },
      ...(hasTwoPlayers
        ? [{ label: player2, values: p2Rows.map((r) => toFiniteNumber(r[stat1])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
        : []),
    ];
    const stat2Series = hasTwoStats
      ? [
          { label: effectiveP1, values: p1Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null) },
          ...(hasTwoPlayers
            ? [{ label: player2, values: p2Rows.map((r) => toFiniteNumber(r[stat2])).filter((v): v is number => v !== null), color: "var(--color-chart-secondary)" }]
            : []),
        ]
      : [];

    const stat1DistTitle = hasTwoPlayers
      ? `${stat1} Distribution`
      : `${effectiveP1Label} ${stat1} Distribution`;
    const stat2DistTitle = hasTwoPlayers
      ? `${stat2} Distribution`
      : `${effectiveP1Label} ${stat2} Distribution`;

    panels.push({
      id: "dist-1",
      title: stat1DistTitle,
      content: (
        <KDEDistribution
          title={stat1DistTitle}
          stat={stat1}
          series={stat1Series}
        />
      ),
    });
    if (hasTwoStats) {
      panels.push({
        id: "dist-2",
        title: stat2DistTitle,
        content: (
          <KDEDistribution
            title={stat2DistTitle}
            stat={stat2}
            series={stat2Series}
          />
        ),
      });
    }

    // Round (full-width when 2 stats, since it shows side-by-side)
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
              hasTwoPlayers
                ? `${stat1}: ${effectiveP1Label} vs ${player2Label}`
                : `${effectiveP1Label} \u2014 ${stat1} by Round`
            }
            stat={stat1}
            series={
              hasTwoPlayers
                ? [
                    { label: effectiveP1Label, data: p1RoundData },
                    { label: player2Label, data: p2RoundData },
                  ]
                : [{ label: effectiveP1Label, data: p1RoundData }]
            }
            mode={hasTwoPlayers ? "compare" : "single"}
          />
        </div>
      ),
    });
    if (hasTwoStats) {
      const p1Stat2Data = computeRoundData(p1RoundRows, stat2);
      const p2Stat2Data = hasTwoPlayers ? computeRoundData(p2RoundRows, stat2) : [];
      panels.push({
        id: "round-2",
        title: `${stat2}: Stat Comparison by Round`,
        wide: true,
        content: (
          <div>
            {roundYearPicker}
            <LineRound
              title={
                hasTwoPlayers
                  ? `${stat2}: ${effectiveP1Label} vs ${player2Label}`
                  : `${effectiveP1Label} \u2014 ${stat2} by Round`
              }
              stat={stat2}
              series={
                hasTwoPlayers
                  ? [
                      { label: effectiveP1Label, data: p1Stat2Data },
                      { label: player2Label, data: p2Stat2Data },
                    ]
                  : [{ label: effectiveP1Label, data: p1Stat2Data }]
              }
              mode={hasTwoPlayers ? "compare" : "single"}
            />
          </div>
        ),
      });
    }

    const effectiveWwYear = wwYear || selectedYears[0] || "";
    const wwLookup = dfYearFinals.filter((r) => r.Year === effectiveWwYear);
    const wwYearPicker = selectedYears.length > 1 ? (
      <div className="mb-3">
        <PillRadio options={selectedYears} value={effectiveWwYear} onChange={setWwYear} />
      </div>
    ) : null;

    const pushWithWithoutPanels = (
      prefix: string,
      playerLabel: string,
      teammateName: string,
      teammateLabel: string,
      teammatePosition: string,
      baseRows: PlayerStat[]
    ) => {
      const wwYearRows = baseRows.filter((r) => r.Year === effectiveWwYear);
      const withRowsYear = filterByTeammate(wwYearRows, teammateName, true, wwLookup, teammatePosition);
      const withoutRowsYear = filterByTeammate(wwYearRows, teammateName, false, wwLookup, teammatePosition);
      const withRowsAllYears = filterByTeammate(baseRows, teammateName, true, dfYearFinals, teammatePosition);
      const withoutRowsAllYears = filterByTeammate(baseRows, teammateName, false, dfYearFinals, teammatePosition);

      panels.push({
        id: `${prefix}ww_round_1`,
        title: `${playerLabel}: ${stat1} With/Without ${teammateLabel} by Round`,
        wide: true,
        content: (
          <div>
            {wwYearPicker}
            <WithWithoutLine
              title={`${playerLabel} \u2014 ${stat1}: With vs Without ${teammateLabel}`}
              stat={stat1}
              withData={computeRoundData(withRowsYear, stat1)}
              withoutData={computeRoundData(withoutRowsYear, stat1)}
            />
          </div>
        ),
      });
      if (stat2 !== "None") {
        panels.push({
          id: `${prefix}ww_round_2`,
          title: `${playerLabel}: ${stat2} With/Without ${teammateLabel} by Round`,
          wide: true,
          content: (
            <div>
              {wwYearPicker}
              <WithWithoutLine
                title={`${playerLabel} \u2014 ${stat2}: With vs Without ${teammateLabel}`}
                stat={stat2}
                withData={computeRoundData(withRowsYear, stat2)}
                withoutData={computeRoundData(withoutRowsYear, stat2)}
              />
            </div>
          ),
        });
      }

      panels.push({
        id: `${prefix}ww_dist_1`,
        title: `${playerLabel}: ${stat1} Distribution With/Without ${teammateLabel}`,
        content: (
          <WithWithoutKDE
            title={`${playerLabel} \u2014 ${stat1}: With vs Without ${teammateLabel} (All Selected Years)`}
            stat={stat1}
            withValues={withRowsAllYears
              .map((r) => toFiniteNumber(r[stat1]))
              .filter((v): v is number => v !== null)}
            withoutValues={withoutRowsAllYears
              .map((r) => toFiniteNumber(r[stat1]))
              .filter((v): v is number => v !== null)}
          />
        ),
      });
      if (stat2 !== "None") {
        panels.push({
          id: `${prefix}ww_dist_2`,
          title: `${playerLabel}: ${stat2} Distribution With/Without ${teammateLabel}`,
          content: (
            <WithWithoutKDE
              title={`${playerLabel} \u2014 ${stat2}: With vs Without ${teammateLabel} (All Selected Years)`}
              stat={stat2}
              withValues={withRowsAllYears
                .map((r) => toFiniteNumber(r[stat2]))
                .filter((v): v is number => v !== null)}
              withoutValues={withoutRowsAllYears
                .map((r) => toFiniteNumber(r[stat2]))
                .filter((v): v is number => v !== null)}
            />
          ),
        });
      }
    };

    if (effectiveP1Teammate !== "None") {
      pushWithWithoutPanels(
        "p1",
        effectiveP1Label,
        effectiveP1Teammate,
        teammate1Label,
        effectiveP1TeammatePosition,
        p1BaseRows
      );
    }

    if (hasTwoPlayers && teammate2 !== "None") {
      pushWithWithoutPanels("p2", player2Label, teammate2, teammate2Label, teammate2Position, p2BaseRows);
    }

    return panels;
  }, [
    effectiveP1, effectiveP1Label, player2, player2Label, stat1, stat2, p1Rows, p2Rows,
    p1RoundData, p2RoundData,
    p1RoundRows, p2RoundRows, effectiveRoundYear, setRoundYear,
    hasTwoPlayers, effectiveP1Teammate, teammate1Label, teammate2, teammate2Label, effectiveP1TeammatePosition, teammate2Position, dfYearFinals, wwYear, selectedYears,
    p1BaseRows, p2BaseRows,
  ]);

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
        presetsScope="player"
        presetPayload={presetPayload}
        onApplyPreset={applyPreset}
        showPosition={false}
      />
      <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
        <PlayerSelectors
          positions={positions}
          playerList={p1PlayerOptions}
          player1={player1 || p1PlayerOptions[0] || ""}
          onPlayer1Change={setPlayer1}
          player1Position={player1Position}
          onPlayer1PositionChange={setPlayer1Position}
          teammate1Options={tm1Options}
          teammate1={teammate1}
          onTeammate1Change={handleTeammate1Change}
          teammate1Position={teammate1Position}
          onTeammate1PositionChange={setTeammate1Position}
          teammateMode1={teammateMode1}
          onTeammateMode1Change={setTeammateMode1}
          player2Options={p2PlayerOptions}
          player2={player2}
          onPlayer2Change={setPlayer2}
          player2Position={player2Position}
          onPlayer2PositionChange={setPlayer2Position}
          teammate2Options={tm2Options}
          teammate2={teammate2}
          onTeammate2Change={handleTeammate2Change}
          teammate2Position={teammate2Position}
          onTeammate2PositionChange={setTeammate2Position}
          teammateMode2={teammateMode2}
          onTeammateMode2Change={setTeammateMode2}
          statList={statList}
          stat1={stat1}
          onStat1Change={setStat1}
          stat2={stat2}
          onStat2Change={setStat2}
        />
      </div>
      {loading && (
        <div className="rounded-lg border border-nrl-accent/30 bg-nrl-panel p-3 text-center text-sm text-nrl-accent">
          <div className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-nrl-accent/30 border-t-nrl-accent" />
            <span>Loading section...</span>
          </div>
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
            entity="player"
            summaryRows={summaryRows}
            percentileResults={percentileResults}
            recentFormResults={recentFormResults}
            rankingMode="percentile"
            percentileScope={percentileScope}
            onPercentileScopeChange={setPercentileScope}
          />

          <ChartPanelGrid panels={chartPanels} />
        </>
      )}
    </div>
  );
}

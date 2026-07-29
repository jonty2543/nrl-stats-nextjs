"use client";

import { useMemo, useState } from "react";
import { TEAM_SHARE_POSITION_GROUPS, type TeamShareMetric, type TeamShareSeries } from "@/lib/data/receipt-share";

interface ReceiptShareLinesProps {
  series: TeamShareSeries[];
  metric: TeamShareMetric;
}

const COLORS = [
  "#10f08b", "#5cc8ff", "#ffcc4d", "#ff6b6b", "#b388ff", "#ff8bd1",
  "#4dd0a8", "#ff9f43", "#6c8cff", "#e8f05a", "#67d5e8", "#c084fc",
  "#fb7185", "#34d399", "#f59e0b", "#60a5fa", "#f472b6",
] as const;

const WIDTH = 900;
const HEIGHT = 500;
const MARGIN = { top: 28, right: 30, bottom: 68, left: 72 };

function teamColor(index: number): string {
  return COLORS[index % COLORS.length];
}

export function ReceiptShareLines({ series, metric }: ReceiptShareLinesProps) {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const chart = useMemo(() => {
    const ranks = new Map<string, number>();
    for (const group of TEAM_SHARE_POSITION_GROUPS) {
      [...series]
        .sort((left, right) => right.values[group] - left.values[group])
        .forEach((team, index) => ranks.set(`${team.team}|${group}`, index + 1));
    }
    const maximum = Math.max(...series.flatMap((team) => TEAM_SHARE_POSITION_GROUPS.map((group) => team.values[group])), 0);
    const yMax = metric === "Receipts" ? 30 : Math.max(30, Math.ceil(maximum / 10) * 10);
    return { yMax, ticks: Array.from({ length: 6 }, (_, index) => (yMax / 5) * index), ranks };
  }, [metric, series]);

  if (series.length === 0) {
    return <div className="grid min-h-96 place-items-center text-sm text-nrl-muted">Loading team shares…</div>;
  }

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xScale = (index: number) => MARGIN.left + (index / (TEAM_SHARE_POSITION_GROUPS.length - 1)) * plotWidth;
  const yScale = (value: number) => MARGIN.top + plotHeight - (Math.min(value, chart.yMax) / chart.yMax) * plotHeight;
  const hovered = series.find((team) => team.team === hoveredTeam) ?? null;

  return (
    <div>
      <div className="flex min-h-10 items-center px-2 text-[10px] text-nrl-muted">
        {hovered ? (
          <div><span className="font-black text-nrl-text">{hovered.team}</span></div>
        ) : null}
      </div>

      <svg className="h-auto w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Average starter ${metric.toLowerCase()} share by position for all teams`}>
        <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} rx="8" fill="var(--color-nrl-bg)" />
        {chart.ticks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line x1={MARGIN.left} y1={y} x2={MARGIN.left + plotWidth} y2={y} stroke="var(--color-nrl-border)" opacity="0.45" />
              <text x={MARGIN.left - 12} y={y + 4} textAnchor="end" fill="var(--color-nrl-muted)" fontSize="12">{tick.toFixed(0)}%</text>
            </g>
          );
        })}
        {TEAM_SHARE_POSITION_GROUPS.map((group, index) => {
          const x = xScale(index);
          return (
            <g key={group}>
              <line x1={x} y1={MARGIN.top} x2={x} y2={MARGIN.top + plotHeight} stroke="var(--color-nrl-border)" opacity="0.25" />
              <text x={x} y={MARGIN.top + plotHeight + 28} textAnchor="middle" fill="var(--color-nrl-text)" fontSize="13" fontWeight="800">{group}</text>
            </g>
          );
        })}

        {series.map((team, teamIndex) => {
          const color = teamColor(teamIndex);
          const path = TEAM_SHARE_POSITION_GROUPS.map((group, index) => `${index === 0 ? "M" : "L"} ${xScale(index)} ${yScale(team.values[group])}`).join(" ");
          const active = hoveredTeam === team.team;
          const dimmed = hoveredTeam !== null && !active;
          return (
            <g
              key={team.team}
              tabIndex={0}
              role="button"
              aria-label={`${team.team}: ${TEAM_SHARE_POSITION_GROUPS.map((group) => `${group} ${team.values[group].toFixed(1)} percent, rank ${chart.ranks.get(`${team.team}|${group}`) ?? "-"}`).join(", ")}`}
              onMouseEnter={() => setHoveredTeam(team.team)}
              onMouseLeave={() => setHoveredTeam(null)}
              onFocus={() => setHoveredTeam(team.team)}
              onBlur={() => setHoveredTeam(null)}
              className="cursor-pointer outline-none"
              opacity={dimmed ? 0.12 : active ? 1 : 0.68}
            >
              <path d={path} fill="none" stroke={color} strokeWidth={active ? 4 : 2} strokeLinejoin="round" strokeLinecap="round" />
              {TEAM_SHARE_POSITION_GROUPS.map((group, index) => {
                const x = xScale(index);
                const y = yScale(team.values[group]);
                return (
                  <g key={group}>
                    <circle cx={x} cy={y} r={active ? 5 : 3.5} fill={color} stroke="var(--color-nrl-bg)" strokeWidth="1.5" />
                    {active ? (
                      <text x={x} y={y < MARGIN.top + 24 ? y + 20 : y - 11} textAnchor="middle" fill={color} fontSize="13" fontWeight="900">#{chart.ranks.get(`${team.team}|${group}`)}</text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}

        <text transform={`translate(20 ${MARGIN.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill="var(--color-nrl-text)" fontSize="15" fontWeight="900">AVERAGE {metric.toUpperCase()} SHARE · %</text>
      </svg>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-2 pb-2 sm:grid-cols-3 lg:grid-cols-6">
        {series.map((team, index) => (
          <button
            key={team.team}
            type="button"
            onMouseEnter={() => setHoveredTeam(team.team)}
            onMouseLeave={() => setHoveredTeam(null)}
            onFocus={() => setHoveredTeam(team.team)}
            onBlur={() => setHoveredTeam(null)}
            className={`flex min-w-0 items-center gap-1.5 text-left text-[9px] transition-opacity ${hoveredTeam && hoveredTeam !== team.team ? "opacity-30" : "opacity-100"}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: teamColor(index) }} />
            <span className="truncate text-nrl-muted">{team.team}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

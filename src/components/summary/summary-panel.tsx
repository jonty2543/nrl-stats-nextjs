"use client";

import type { ReactNode } from "react";
import type { PlayerStat, TeamStat } from "@/lib/data/types";
import type { SummaryRow, PercentileResult, RecentFormResult } from "@/lib/data/transform";
import { ProfileCard } from "./profile-card";
import { StatsTable } from "./stats-table";
import { PercentileRanks } from "./percentile-ranks";
import { RecentForm } from "./recent-form";
import { SectionDivider } from "@/components/ui/section-divider";

interface EntityInfo {
  name: string;
  rows: (PlayerStat | TeamStat)[];
}

interface SummaryPanelProps {
  entities: EntityInfo[];
  entity: "player" | "team";
  summaryRows: SummaryRow[];
  percentileResults: PercentileResult[];
  recentFormResults: RecentFormResult[];
  rankingMode?: "percentile" | "rank";
  percentileScope?: "Position" | "All Players";
  onPercentileScopeChange?: (scope: "Position" | "All Players") => void;
  rightPanelContent?: ReactNode;
  moveAnalyticsBelowTable?: boolean;
}

export function SummaryPanel({
  entities,
  entity,
  summaryRows,
  percentileResults,
  recentFormResults,
  rankingMode = "percentile",
  percentileScope,
  onPercentileScopeChange,
  rightPanelContent,
  moveAnalyticsBelowTable = false,
}: SummaryPanelProps) {
  const single = entities.length === 1;
  const analyticsSection = (
    <>
      <PercentileRanks
        results={percentileResults}
        single={single}
        mode={rankingMode}
        percentileScope={percentileScope}
        onPercentileScopeChange={onPercentileScopeChange}
      />
      <SectionDivider />
      <RecentForm results={recentFormResults} single={single} />
    </>
  );

  return (
    <div className="rounded-lg border border-nrl-border bg-nrl-panel p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Profile + Summary Table */}
        <div>
          {entities.map((e, i) => (
            <div key={e.name}>
              {i > 0 && <SectionDivider />}
              <ProfileCard name={e.name} rows={e.rows} entity={entity} />
            </div>
          ))}
          <SectionDivider />
          <StatsTable rows={summaryRows} />
          {moveAnalyticsBelowTable && (
            <>
              <SectionDivider />
              {analyticsSection}
            </>
          )}
        </div>

        {/* Right: analytics (default) or custom content */}
        <div>
          {rightPanelContent ?? (!moveAnalyticsBelowTable ? analyticsSection : null)}
        </div>
      </div>
    </div>
  );
}

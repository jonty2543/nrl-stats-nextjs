"use client";

import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";

interface FilterBarProps {
  years: string[];
  selectedYears: string[];
  onYearsChange: (years: string[]) => void;
  positions?: string[];
  selectedPosition?: string;
  onPositionChange?: (position: string) => void;
  minutesThreshold: number;
  onMinutesThresholdChange: (value: number) => void;
  minutesMode: string;
  onMinutesModeChange: (mode: string) => void;
  showPosition?: boolean;
}

export function FilterBar({
  years,
  selectedYears,
  onYearsChange,
  positions,
  selectedPosition,
  onPositionChange,
  minutesThreshold,
  onMinutesThresholdChange,
  minutesMode,
  onMinutesModeChange,
  showPosition = true,
}: FilterBarProps) {
  const canShowPosition =
    showPosition &&
    Array.isArray(positions) &&
    typeof selectedPosition === "string" &&
    typeof onPositionChange === "function";

  return (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel p-4 mb-4">
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${canShowPosition ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-4`}>
        <MultiSelect
          label="Year"
          value={selectedYears}
          options={years}
          onChange={onYearsChange}
        />
        {canShowPosition && (
          <Select
            label="Position"
            value={selectedPosition}
            options={["All", ...positions]}
            onChange={onPositionChange}
          />
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-nrl-muted">
            Minutes
          </label>
          <div className="grid grid-cols-[minmax(120px,160px)_1fr] gap-2">
            <select
              value={minutesMode}
              onChange={(e) => onMinutesModeChange(e.target.value)}
              className="rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent"
            >
              {["All", "Over", "Under"].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={minutesThreshold}
              onChange={(e) => onMinutesThresholdChange(parseFloat(e.target.value) || 0)}
              min={0}
              max={80}
              step={5}
              disabled={minutesMode === "All"}
              className="rounded-lg border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

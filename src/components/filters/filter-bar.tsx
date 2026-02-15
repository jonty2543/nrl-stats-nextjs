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
  finalsMode: string;
  onFinalsModeChange: (mode: string) => void;
  minutesThreshold: number;
  onMinutesThresholdChange: (value: number) => void;
  minutesMode: string;
  onMinutesModeChange: (mode: string) => void;
  showPosition?: boolean;
  showFinals?: boolean;
  showMinutes?: boolean;
}

export function FilterBar({
  years,
  selectedYears,
  onYearsChange,
  positions,
  selectedPosition,
  onPositionChange,
  finalsMode,
  onFinalsModeChange,
  minutesThreshold,
  onMinutesThresholdChange,
  minutesMode,
  onMinutesModeChange,
  showPosition = true,
  showFinals = true,
  showMinutes = true,
}: FilterBarProps) {
  const canShowPosition =
    showPosition &&
    Array.isArray(positions) &&
    typeof selectedPosition === "string" &&
    typeof onPositionChange === "function";
  const canShowFinals =
    showFinals &&
    typeof finalsMode === "string" &&
    typeof onFinalsModeChange === "function";
  const canShowMinutes = showMinutes;
  const fieldCount =
    1 + Number(canShowPosition) + Number(canShowFinals) + Number(canShowMinutes);
  const gridColumns =
    fieldCount >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : fieldCount === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : fieldCount === 2
          ? "sm:grid-cols-2 lg:grid-cols-2"
          : "sm:grid-cols-1 lg:grid-cols-1";

  return (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel p-4 mb-4">
      <div className={`grid grid-cols-1 ${gridColumns} gap-5`}>
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
        {canShowFinals && (
          <Select
            label="Include Finals"
            value={finalsMode}
            options={["Yes", "No"]}
            onChange={onFinalsModeChange}
          />
        )}
        {canShowMinutes && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-semibold uppercase tracking-wide text-nrl-muted">
              Minutes
            </label>
            <div className="grid grid-cols-[minmax(80px,110px)_1fr] gap-1.5">
              <select
                value={minutesMode}
                onChange={(e) => onMinutesModeChange(e.target.value)}
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
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
                className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

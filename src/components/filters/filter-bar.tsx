"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";

type PresetScope = "player" | "team";

interface SavedPreset {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  updated_at: string;
}

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
  presetsScope?: PresetScope;
  presetPayload?: Record<string, unknown>;
  onApplyPreset?: (payload: Record<string, unknown>) => void | Promise<void>;
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
  presetsScope,
  presetPayload,
  onApplyPreset,
  showPosition = true,
  showFinals = true,
  showMinutes = true,
}: FilterBarProps) {
  const { isLoaded, userId } = useAuth();
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetStatus, setPresetStatus] = useState<string | null>(null);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  const [isDeletingPreset, setIsDeletingPreset] = useState(false);

  const canUsePresets =
    typeof presetsScope === "string" &&
    typeof onApplyPreset === "function" &&
    typeof presetPayload === "object" &&
    presetPayload !== null;

  const loadPresets = useCallback(async () => {
    if (!canUsePresets || !userId || !presetsScope) return;
    try {
      const res = await fetch(
        `/api/user/presets?scope=${encodeURIComponent(presetsScope)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const bodyText = await res.text();
        console.error("Failed to fetch presets:", res.status, bodyText);
        return;
      }
      const data = (await res.json()) as { presets?: SavedPreset[] };
      setPresets(Array.isArray(data.presets) ? data.presets : []);
    } catch (error) {
      console.error("Failed to fetch presets:", error);
    }
  }, [canUsePresets, presetsScope, userId]);

  useEffect(() => {
    if (!canUsePresets || !isLoaded || !userId) {
      setPresets([]);
      setSelectedPresetId("");
      return;
    }
    void loadPresets();
  }, [canUsePresets, isLoaded, loadPresets, userId]);

  const handleSavePreset = async () => {
    if (!canUsePresets || !presetsScope || !presetPayload) return;
    const name = presetName.trim();
    if (!name) {
      setPresetStatus("Enter a preset name first.");
      return;
    }

    setIsSavingPreset(true);
    setPresetStatus(null);
    try {
      const res = await fetch("/api/user/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: presetsScope,
          name,
          payload: presetPayload,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        console.error("Failed to save preset:", res.status, bodyText);
        setPresetStatus("Could not save preset.");
        return;
      }

      const data = (await res.json()) as { preset?: SavedPreset };
      if (data.preset?.id) {
        setSelectedPresetId(data.preset.id);
      }
      setPresetName("");
      setPresetStatus("Preset saved.");
      await loadPresets();
    } catch (error) {
      console.error("Failed to save preset:", error);
      setPresetStatus("Could not save preset.");
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleApplyPreset = async () => {
    if (!canUsePresets || !onApplyPreset || !selectedPresetId) return;
    const selectedPreset = presets.find((p) => p.id === selectedPresetId);
    if (!selectedPreset) {
      setPresetStatus("Choose a preset to apply.");
      return;
    }

    setIsApplyingPreset(true);
    setPresetStatus(null);
    try {
      await onApplyPreset(selectedPreset.payload);
      setPresetStatus("Preset applied.");
    } catch (error) {
      console.error("Failed to apply preset:", error);
      setPresetStatus("Could not apply preset.");
    } finally {
      setIsApplyingPreset(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return;
    setIsDeletingPreset(true);
    setPresetStatus(null);
    try {
      const res = await fetch("/api/user/presets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedPresetId }),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        console.error("Failed to delete preset:", res.status, bodyText);
        setPresetStatus("Could not delete preset.");
        return;
      }

      setSelectedPresetId("");
      setPresetStatus("Preset deleted.");
      await loadPresets();
    } catch (error) {
      console.error("Failed to delete preset:", error);
      setPresetStatus("Could not delete preset.");
    } finally {
      setIsDeletingPreset(false);
    }
  };

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
      {canUsePresets && isLoaded && userId && (
        <div className="mt-4 border-t border-nrl-border pt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-nrl-muted">
            Saved Presets
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(170px,240px)_1fr_auto_auto]">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
            />
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="rounded-md border border-nrl-border bg-nrl-panel-2 px-2 py-1 text-[10px] text-nrl-text outline-none focus:border-nrl-accent"
            >
              <option value="">Select preset...</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSavePreset}
              disabled={isSavingPreset}
              className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1 text-[10px] font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyPreset}
                disabled={!selectedPresetId || isApplyingPreset}
                className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1 text-[10px] font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleDeletePreset}
                disabled={!selectedPresetId || isDeletingPreset}
                className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1 text-[10px] font-semibold text-nrl-muted transition-colors hover:border-[#ff4d7d] hover:text-[#ff4d7d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
          {presetStatus && (
            <div className="mt-2 text-[10px] text-nrl-muted">{presetStatus}</div>
          )}
        </div>
      )}
    </div>
  );
}

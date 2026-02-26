"use client";

import { type ReactNode } from "react";
import { Expander } from "@/components/ui/expander";

interface ChartPanel {
  id: string;
  title: string;
  content: ReactNode;
  wide?: boolean;
  proLocked?: boolean;
}

interface ChartPanelGridProps {
  panels: ChartPanel[];
}

function ProLockedChart({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[240px]">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] opacity-35">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="rounded-lg border border-nrl-accent/30 bg-nrl-panel/90 px-4 py-2 text-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold text-nrl-accent">Pro coming soon</div>
        </div>
      </div>
    </div>
  );
}

function isDistributionPanel(panel: ChartPanel) {
  return /distribution/i.test(panel.title);
}

export function ChartPanelGrid({ panels }: ChartPanelGridProps) {
  const orderedPanels = [
    ...panels.filter(isDistributionPanel),
    ...panels.filter((panel) => !isDistributionPanel(panel)),
  ];
  // Separate wide panels from normal panels
  const widePanels = orderedPanels.filter((p) => p.wide);
  const normalPanels = orderedPanels.filter((p) => !p.wide);

  // Pair normal panels into rows of 2
  const rows: ChartPanel[][] = [];
  for (let i = 0; i < normalPanels.length; i += 2) {
    rows.push(normalPanels.slice(i, i + 2));
  }

  return (
    <div className="space-y-4 mt-4">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`grid gap-4 ${
            row.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
          }`}
        >
          {row.map((panel) => (
            <Expander key={panel.id} title={panel.title}>
              {panel.proLocked ?? !isDistributionPanel(panel) ? (
                <ProLockedChart>{panel.content}</ProLockedChart>
              ) : (
                panel.content
              )}
            </Expander>
          ))}
        </div>
      ))}
      {/* Wide panels always full-width */}
      {widePanels.map((panel) => (
        <Expander key={panel.id} title={panel.title}>
          {panel.proLocked ?? !isDistributionPanel(panel) ? (
            <ProLockedChart>{panel.content}</ProLockedChart>
          ) : (
            panel.content
          )}
        </Expander>
      ))}
    </div>
  );
}

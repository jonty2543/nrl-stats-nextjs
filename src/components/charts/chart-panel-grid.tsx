"use client";

import { type ReactNode } from "react";
import { Expander } from "@/components/ui/expander";

interface ChartPanel {
  id: string;
  title: string;
  content: ReactNode;
  wide?: boolean;
}

interface ChartPanelGridProps {
  panels: ChartPanel[];
}

export function ChartPanelGrid({ panels }: ChartPanelGridProps) {
  // Separate wide panels from normal panels
  const widePanels = panels.filter((p) => p.wide);
  const normalPanels = panels.filter((p) => !p.wide);

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
              {panel.content}
            </Expander>
          ))}
        </div>
      ))}
      {/* Wide panels always full-width */}
      {widePanels.map((panel) => (
        <Expander key={panel.id} title={panel.title}>
          {panel.content}
        </Expander>
      ))}
    </div>
  );
}

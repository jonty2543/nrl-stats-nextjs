"use client";

import { type ReactNode } from "react";
import { BillingPageLink } from "@/components/billing/billing-page-link";
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
  unlockAll?: boolean;
}

function ProLockedChart({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[200px] sm:min-h-[240px]">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] opacity-35">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl">
        <BillingPageLink
          className="rounded-[1rem] bg-[linear-gradient(135deg,rgba(141,99,255,0.95),rgba(0,245,138,0.95))] p-[1px] shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]"
        >
          <div className="rounded-[calc(1rem-1px)] bg-slate-950/80 px-4 py-3 text-center backdrop-blur-[2px]">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-100">
              Sign Up To Pro
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Unlock all stats plots.
            </div>
          </div>
        </BillingPageLink>
      </div>
    </div>
  );
}

function isDistributionPanel(panel: ChartPanel) {
  return /distribution/i.test(panel.title);
}

export function ChartPanelGrid({ panels, unlockAll = false }: ChartPanelGridProps) {
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
              {(unlockAll ? false : (panel.proLocked ?? !isDistributionPanel(panel))) ? (
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
          {(unlockAll ? false : (panel.proLocked ?? !isDistributionPanel(panel))) ? (
            <ProLockedChart>{panel.content}</ProLockedChart>
          ) : (
            panel.content
          )}
        </Expander>
      ))}
    </div>
  );
}

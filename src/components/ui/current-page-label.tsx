"use client";

import { usePathname } from "next/navigation";

interface CurrentPageLabelProps {
  className?: string;
}

const LABELS: Record<string, string> = {
  dashboard: "Stats",
  players: "Stats",
  teams: "Stats",
  about: "About",
};

function toTitleCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CurrentPageLabel({ className }: CurrentPageLabelProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[1] ?? "dashboard";
  const inferredLabel = LABELS[section] ?? toTitleCase(section);
  const label = inferredLabel || "Stats";

  return <span className={className}>{label}</span>;
}

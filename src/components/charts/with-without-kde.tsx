"use client";

import { KDEDistribution } from "./kde-distribution";

interface WithWithoutKDEProps {
  title: string;
  stat: string;
  withValues: number[];
  withoutValues: number[];
}

export function WithWithoutKDE({
  title,
  stat,
  withValues,
  withoutValues,
}: WithWithoutKDEProps) {
  return (
    <KDEDistribution
      title={title}
      stat={stat}
      series={[
        {
          label: "With",
          values: withValues,
          color: "#A8FF00",
        },
        {
          label: "Without",
          values: withoutValues,
          color: "#FF4D7D",
        },
      ]}
    />
  );
}

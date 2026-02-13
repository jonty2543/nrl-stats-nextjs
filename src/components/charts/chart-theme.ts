export const nrlChartTheme = {
  background: "var(--color-nrl-bg)",
  text: {
    fontSize: 11,
    fill: "var(--color-nrl-text)",
  },
  axis: {
    domain: {
      line: {
        stroke: "var(--color-nrl-border)",
        strokeWidth: 1,
      },
    },
    ticks: {
      text: {
        fontSize: 10,
        fill: "var(--color-nrl-muted)",
      },
      line: {
        stroke: "var(--color-nrl-border)",
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fill: "var(--color-nrl-text)",
        fontWeight: 600,
      },
    },
  },
  grid: {
    line: {
      stroke: "var(--color-nrl-border)",
      strokeWidth: 1,
      strokeDasharray: "4 4",
    },
  },
  legends: {
    text: {
      fontSize: 11,
      fill: "var(--color-nrl-text)",
    },
  },
  tooltip: {
    container: {
      background: "var(--color-nrl-panel)",
      color: "var(--color-nrl-text)",
      fontSize: 12,
      borderRadius: 6,
      border: "1px solid var(--color-nrl-border)",
    },
  },
  crosshair: {
    line: {
      stroke: "var(--color-nrl-muted)",
      strokeWidth: 1,
      strokeOpacity: 0.5,
    },
  },
};

export const CHART_COLORS = {
  primary: "var(--color-chart-primary)",
  secondary: "var(--color-chart-secondary)",
  tertiary: "var(--color-chart-tertiary)",
  trendline: "var(--color-chart-trendline)",
} as const;

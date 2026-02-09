export const nrlChartTheme = {
  background: "#0b1020",
  text: {
    fontSize: 11,
    fill: "#e5e7eb",
  },
  axis: {
    domain: {
      line: {
        stroke: "#2a3356",
        strokeWidth: 1,
      },
    },
    ticks: {
      text: {
        fontSize: 10,
        fill: "#c7d2fe",
      },
      line: {
        stroke: "#2a3356",
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fill: "#cbd5e1",
        fontWeight: 600,
      },
    },
  },
  grid: {
    line: {
      stroke: "#2a3356",
      strokeWidth: 1,
      strokeDasharray: "4 4",
    },
  },
  legends: {
    text: {
      fontSize: 11,
      fill: "#e5e7eb",
    },
  },
  tooltip: {
    container: {
      background: "#161c32",
      color: "#e5e7eb",
      fontSize: 12,
      borderRadius: 6,
      border: "1px solid #2a3356",
    },
  },
  crosshair: {
    line: {
      stroke: "#9aa4bf",
      strokeWidth: 1,
      strokeOpacity: 0.5,
    },
  },
};

export const CHART_COLORS = {
  primary: "#A8FF00",
  secondary: "#41d6f4",
  tertiary: "#FFB347",
  trendline: "#FF4D7D",
} as const;

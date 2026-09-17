function interpolateRgb(start: number[], end: number[], ratio: number): string {
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * boundedRatio));
  return `rgb(${channels.join(", ")})`;
}

export function singleAxisHeatColor(ratio: number): string {
  const red = [255, 83, 100];
  const amber = [246, 196, 69];
  const green = [16, 240, 139];
  if (ratio < 0.32) return interpolateRgb(red, amber, ratio / 0.32);
  if (ratio < 0.62) return interpolateRgb(amber, green, (ratio - 0.32) / 0.3);
  return "rgb(16, 240, 139)";
}

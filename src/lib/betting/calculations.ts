export function calculateEdgePercentagePoints(
  modelProbability: number | null,
  decimalOdds: number | null
): number | null {
  if (modelProbability == null || decimalOdds == null || decimalOdds <= 1) return null;
  return (modelProbability - (1 / decimalOdds)) * 100;
}

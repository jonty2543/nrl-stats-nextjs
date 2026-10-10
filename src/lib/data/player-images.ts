export function isUsablePlayerImageUrl(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && !value.toLowerCase().includes("fallback");
}

export function normalisePlayerImageUrl(value: string): string {
  const trimmed = value.trim();
  const proxyMarker = "/remote.axd?";
  const proxyIndex = trimmed.toLowerCase().indexOf(proxyMarker);
  const source = proxyIndex >= 0
    ? trimmed.slice(proxyIndex + proxyMarker.length)
    : trimmed;
  const secureSource = source.replace(/^http:\/\//i, "https://");
  try {
    return new URL(secureSource).toString().replace(/'/g, "%27");
  } catch {
    return secureSource.replaceAll(" ", "%20").replace(/'/g, "%27");
  }
}

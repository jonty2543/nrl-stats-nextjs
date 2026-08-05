import type { BettingOddsRow } from "./types";

export type DiscreteOutcomeKey = "cover" | "1_12" | "13_plus";

export interface DiscreteMarketProbabilityRow {
  match_date: unknown;
  match: unknown;
  market: unknown;
  selection: unknown;
  outcome_key: unknown;
  line_value: unknown;
  model_probability: unknown;
  generated_at?: unknown;
}

export interface ParsedMarginSelection {
  selection: string;
  outcomeKey: "1_12" | "13_plus";
}

export interface DiscreteProbabilityLookup {
  probabilities: Map<string, number>;
}

const TEAM_ALIAS_GROUPS: string[][] = [
  ["brisbane broncos", "broncos"],
  ["canberra raiders", "raiders"],
  ["canterbury bankstown bulldogs", "canterbury bulldogs", "bulldogs"],
  ["cronulla sutherland sharks", "cronulla sharks", "sharks"],
  ["dolphins", "the dolphins"],
  ["gold coast titans", "titans"],
  ["manly warringah sea eagles", "manly sea eagles", "sea eagles", "manly"],
  ["melbourne storm", "storm"],
  ["newcastle knights", "knights"],
  ["new zealand warriors", "nz warriors", "warriors"],
  ["north queensland cowboys", "nth queensland cowboys", "north qld cowboys", "cowboys"],
  ["parramatta eels", "eels"],
  ["penrith panthers", "panthers"],
  ["south sydney rabbitohs", "rabbitohs", "souths"],
  ["st george illawarra dragons", "st george dragons", "st george", "dragons"],
  ["sydney roosters", "eastern suburbs roosters", "roosters"],
  ["wests tigers", "west tigers", "tigers"],
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

export function normalizeDiscreteTeam(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const groupIndex = TEAM_ALIAS_GROUPS.findIndex((aliases) => aliases.includes(normalized));
  return groupIndex >= 0 ? TEAM_ALIAS_GROUPS[groupIndex][0] : normalized;
}

export function normalizeDiscreteMatch(value: unknown): string {
  const parts = String(value ?? "")
    .split(/\s+v(?:s)?\.?\s+/i)
    .map(normalizeDiscreteTeam)
    .filter(Boolean);
  if (parts.length !== 2) return normalizeText(value);
  return parts.sort().join("|");
}

export function parseMarginSelection(result: string): ParsedMarginSelection | null {
  const match = result.trim().match(/^(.+?)\s+(1\s*[-–]\s*12|13\s*\+)$/i);
  if (!match) return null;
  const selection = match[1].trim();
  if (!selection) return null;
  const suffix = match[2].replace(/\s+/g, "").toLowerCase();
  return {
    selection,
    outcomeKey: suffix === "13+" ? "13_plus" : "1_12",
  };
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function probabilityKey({
  date,
  match,
  market,
  selection,
  outcomeKey,
  lineValue,
}: {
  date: unknown;
  match: unknown;
  market: "Line" | "Margin";
  selection: unknown;
  outcomeKey: DiscreteOutcomeKey;
  lineValue: number | null;
}): string | null {
  const normalizedDate = normalizeDate(date);
  const normalizedMatch = normalizeDiscreteMatch(match);
  const normalizedSelection = normalizeDiscreteTeam(selection);
  if (!normalizedDate || !normalizedMatch || !normalizedSelection) return null;
  if (market === "Line" && lineValue == null) return null;
  const halfPointUnits = market === "Line" ? Math.round((lineValue as number) * 2) : "";
  return [normalizedDate, normalizedMatch, market, normalizedSelection, outcomeKey, halfPointUnits].join("|");
}

export function buildDiscreteProbabilityLookup(rows: DiscreteMarketProbabilityRow[]): DiscreteProbabilityLookup {
  const probabilities = new Map<string, number>();
  const generatedAt = new Map<string, number>();

  for (const row of rows) {
    const market = row.market === "Line" || row.market === "Margin" ? row.market : null;
    const outcomeKey = row.outcome_key === "cover" || row.outcome_key === "1_12" || row.outcome_key === "13_plus"
      ? row.outcome_key
      : null;
    const probability = finiteNumber(row.model_probability);
    const lineValue = market === "Line" ? finiteNumber(row.line_value) : null;
    if (!market || !outcomeKey || probability == null || probability < 0 || probability > 1) continue;
    if ((market === "Line" && outcomeKey !== "cover") || (market === "Margin" && outcomeKey === "cover")) continue;

    const key = probabilityKey({
      date: row.match_date,
      match: row.match,
      market,
      selection: row.selection,
      outcomeKey,
      lineValue,
    });
    if (!key) continue;

    const nextGeneratedAt = typeof row.generated_at === "string" ? Date.parse(row.generated_at) : 0;
    const currentGeneratedAt = generatedAt.get(key) ?? Number.NEGATIVE_INFINITY;
    if (Number.isFinite(nextGeneratedAt) && nextGeneratedAt < currentGeneratedAt) continue;
    probabilities.set(key, probability);
    generatedAt.set(key, Number.isFinite(nextGeneratedAt) ? nextGeneratedAt : 0);
  }

  return { probabilities };
}

export function findDiscreteProbability(
  row: Pick<BettingOddsRow, "date" | "match" | "market" | "result" | "value">,
  lookup: DiscreteProbabilityLookup
): number | null {
  if (row.market === "Line") {
    const key = probabilityKey({
      date: row.date,
      match: row.match,
      market: "Line",
      selection: row.result,
      outcomeKey: "cover",
      lineValue: row.value,
    });
    return key == null ? null : lookup.probabilities.get(key) ?? null;
  }

  if (row.market === "Margin") {
    const parsed = parseMarginSelection(row.result);
    if (!parsed) return null;
    const key = probabilityKey({
      date: row.date,
      match: row.match,
      market: "Margin",
      selection: parsed.selection,
      outcomeKey: parsed.outcomeKey,
      lineValue: null,
    });
    return key == null ? null : lookup.probabilities.get(key) ?? null;
  }

  return null;
}

export function applyDiscreteProbabilityToRow(
  row: BettingOddsRow,
  lookup: DiscreteProbabilityLookup
): BettingOddsRow {
  if (row.market !== "Line" && row.market !== "Margin") return row;
  const probability = findDiscreteProbability(row, lookup);
  return {
    ...row,
    model: probability == null ? null : probability * 100,
  };
}

export function summarizeUnmatchedDiscreteRows(
  rows: BettingOddsRow[],
  lookup: DiscreteProbabilityLookup,
  sampleLimit = 3
): { count: number; samples: string[] } {
  const unmatched = rows.filter((row) => findDiscreteProbability(row, lookup) == null);
  return {
    count: unmatched.length,
    samples: unmatched.slice(0, sampleLimit).map((row) =>
      `${row.date} ${row.match} | ${row.market} | ${row.result}${row.market === "Line" ? ` ${row.value ?? "no-line"}` : ""}`
    ),
  };
}

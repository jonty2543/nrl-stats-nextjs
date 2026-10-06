import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const BETTING_BOOKIE_COLUMNS = ["Sportsbet", "Pointsbet", "Unibet", "Palmerbet", "Betright"];

function loadLocalEnv() {
  try {
    const contents = readFileSync(".env.local", "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Production/CI should provide real environment variables.
  }
}

function requireAnyEnv(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  throw new Error(`Missing required environment variable: one of ${names.join(", ")}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function toIsoDate(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function toNullableString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNullableFinite(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNullableOdds(value) {
  const parsed = toNullableFinite(value);
  return parsed == null || parsed <= 0 ? null : parsed;
}

async function fetchAllRows(supabase, table, select, applyQuery = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = applyQuery(supabase.from(table).select(select).range(from, to));
    const { data, error } = await query;
    if (error) throw new Error(`Fetch ${table} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function computeBestBookie(row) {
  let bestBookie = null;
  let bestPrice = null;
  for (const bookie of BETTING_BOOKIE_COLUMNS) {
    const price = row[bookie];
    if (price == null) continue;
    if (bestPrice == null || price > bestPrice) {
      bestBookie = bookie;
      bestPrice = price;
    }
  }
  return {
    bestBookie: bestBookie ?? row.bestBookie,
    bestPrice: bestPrice ?? row.bestPrice,
  };
}

function isValidTryscorerRow(row) {
  if (!row.date || !row.match || !row.result) return false;
  if (!/[A-Za-z]/.test(row.result)) return false;
  if (row.value == null) return true;
  return Number.isInteger(row.value) && row.value >= 1 && row.value <= 3;
}

function isValidOddsRow(row) {
  return Boolean(row.date && row.match && row.result);
}

function mapOddsMarket(table, rawMarket) {
  if (table.includes("Line")) return "Line";
  if (table.includes("Total")) return "Total";
  if (typeof rawMarket === "string") {
    const normalized = rawMarket.trim().toLowerCase();
    if (normalized === "line") return "Line";
    if (normalized === "total") return "Total";
  }
  return "H2H";
}

function mapLegacyOddsRow(table, raw) {
  const market = mapOddsMarket(table, raw.Market);
  const row = {
    table,
    market,
    date: toIsoDate(raw.Date),
    match: toNullableString(raw.Match) ?? "",
    result: toNullableString(raw.Result) ?? "",
    value: market === "H2H" ? null : toNullableFinite(raw.Value),
    model: toNullableFinite(raw.Model),
    bestBookie: toNullableString(raw["Best Bookie"]),
    bestPrice: toNullableOdds(raw["Best Price"]),
    marketPercentage: toNullableFinite(raw["Market %"]),
    Sportsbet: toNullableOdds(raw.Sportsbet),
    Pointsbet: toNullableOdds(raw.Pointsbet),
    Unibet: toNullableOdds(raw.Unibet),
    Palmerbet: toNullableOdds(raw.Palmerbet),
    Betright: toNullableOdds(raw.Betright),
    Betr: null,
  };
  return {
    ...row,
    ...computeBestBookie(row),
  };
}

function hasBookSpecificOddsColumns(raw) {
  return BETTING_BOOKIE_COLUMNS.some((bookie) => `${bookie}_odds` in raw || `${bookie}_line` in raw);
}

function mapBookSpecificOddsRows(table, raw) {
  const market = mapOddsMarket(table, raw.Market);
  const date = toIsoDate(raw.Date);
  const match = toNullableString(raw.Match) ?? "";
  const result = toNullableString(raw.Result) ?? "";
  const model = toNullableFinite(raw.Model);

  return BETTING_BOOKIE_COLUMNS.flatMap((bookie) => {
    const price = toNullableOdds(raw[`${bookie}_odds`]);
    const value = toNullableFinite(raw[`${bookie}_line`]);
    if (price == null || value == null) return [];
    return [{
      table,
      market,
      date,
      match,
      result,
      value,
      model,
      bestBookie: bookie,
      bestPrice: price,
      marketPercentage: null,
      Sportsbet: null,
      Pointsbet: null,
      Unibet: null,
      Palmerbet: null,
      Betright: null,
      [bookie]: price,
      Betr: null,
    }];
  });
}

function mapOddsRows(table, raw) {
  const market = mapOddsMarket(table, raw.Market);
  if ((market === "Line" || market === "Total") && hasBookSpecificOddsColumns(raw)) {
    return mapBookSpecificOddsRows(table, raw);
  }
  return [mapLegacyOddsRow(table, raw)];
}

function mapTryscorerRow(raw) {
  const row = {
    table: "NRL Tryscorers",
    market: "Tryscorer",
    date: toIsoDate(raw.Date),
    match: toNullableString(raw.Match) ?? "",
    result: toNullableString(raw.Result) ?? "",
    value: toNullableFinite(raw.Value),
    model: toNullableFinite(raw.Model),
    bestBookie: toNullableString(raw["Best Bookie"]),
    bestPrice: toNullableOdds(raw["Best Price"]),
    marketPercentage: toNullableFinite(raw["Market %"]),
    Sportsbet: toNullableOdds(raw.Sportsbet),
    Pointsbet: toNullableOdds(raw.Pointsbet),
    Unibet: toNullableOdds(raw.Unibet),
    Palmerbet: toNullableOdds(raw.Palmerbet),
    Betright: toNullableOdds(raw.Betright),
    Betr: null,
  };
  return {
    ...row,
    ...computeBestBookie(row),
  };
}

function countBookieRows(rows) {
  return Object.fromEntries(
    [...BETTING_BOOKIE_COLUMNS, "Betr"].map((bookie) => [
      bookie,
      rows.filter((row) => row[bookie] != null).length,
    ])
  );
}

function oddsRowKey(row) {
  return [
    row.table,
    row.market,
    row.date,
    row.match,
    row.result,
    row.value ?? "",
    row.bestBookie ?? "",
    row.bestPrice ?? "",
  ].join("|");
}

function mergeSnapshotRows(existing, incoming, internationalTables) {
  const rowsByKey = new Map();
  for (const row of existing ?? []) {
    if (internationalTables.has(row?.table)) continue;
    rowsByKey.set(oddsRowKey(row), row);
  }
  for (const row of incoming) rowsByKey.set(oddsRowKey(row), row);
  return [...rowsByKey.values()];
}

function todayIsoInBrisbane() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  loadLocalEnv();
  const supabaseUrl = requireAnyEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabasePublic = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "public" } });
  const supabaseSummary = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "summary" } });

  const today = todayIsoInBrisbane();
  const rawTryscorers = await fetchAllRows(
    supabasePublic,
    "NRL Tryscorers",
    'Match,Date,Result,Value,Market,"Best Bookie","Best Price","Market %",Sportsbet,Pointsbet,Unibet,Palmerbet,Betright',
    (query) => query.gte("Date", today)
  );
  const [snapshotResponse, rawInternationalH2h, rawInternationalLine, rawInternationalTotal] = await Promise.all([
    supabaseSummary
      .from("betting_odds_snapshot")
      .select("h2h,line,total")
      .eq("id", "current")
      .maybeSingle(),
    fetchAllRows(
      supabasePublic,
      "Rugby League Internationals Odds",
      'Match,Date,Result,"Best Bookie","Best Price","Market %",Sportsbet,Pointsbet,Palmerbet,Betright',
      (query) => query.gte("Date", today)
    ),
    fetchAllRows(
      supabasePublic,
      "Rugby League Internationals Line Odds",
      "Match,Date,Result,Market,Sportsbet_odds,Sportsbet_line,Pointsbet_odds,Pointsbet_line,Palmerbet_odds,Palmerbet_line,Betright_odds,Betright_line",
      (query) => query.gte("Date", today)
    ),
    fetchAllRows(
      supabasePublic,
      "Rugby League Internationals Total Odds",
      "Match,Date,Result,Market,Sportsbet_odds,Sportsbet_line,Pointsbet_odds,Pointsbet_line,Palmerbet_odds,Palmerbet_line,Betright_odds,Betright_line",
      (query) => query.gte("Date", today)
    ),
  ]);
  if (snapshotResponse.error) throw new Error(`Fetch summary.betting_odds_snapshot failed: ${snapshotResponse.error.message}`);

  const internationalH2h = rawInternationalH2h
    .flatMap((row) => mapOddsRows("Rugby League Internationals Odds", row))
    .filter(isValidOddsRow);
  const internationalLine = rawInternationalLine
    .flatMap((row) => mapOddsRows("Rugby League Internationals Line Odds", row))
    .filter(isValidOddsRow);
  const internationalTotal = rawInternationalTotal
    .flatMap((row) => mapOddsRows("Rugby League Internationals Total Odds", row))
    .filter(isValidOddsRow);

  const tryscorer = rawTryscorers
    .map(mapTryscorerRow)
    .filter(isValidTryscorerRow)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.match !== b.match) return a.match.localeCompare(b.match);
      return a.result.localeCompare(b.result);
    });

  const now = new Date().toISOString();
  const currentSnapshot = snapshotResponse.data ?? {};
  const { error } = await supabaseSummary
    .from("betting_odds_snapshot")
    .update({
      h2h: mergeSnapshotRows(
        currentSnapshot.h2h,
        internationalH2h,
        new Set(["Rugby League Internationals Odds"])
      ),
      line: mergeSnapshotRows(
        currentSnapshot.line,
        internationalLine,
        new Set(["Rugby League Internationals Line Odds"])
      ),
      total: mergeSnapshotRows(
        currentSnapshot.total,
        internationalTotal,
        new Set(["Rugby League Internationals Total Odds"])
      ),
      tryscorer,
      generated_at: now,
      updated_at: now,
    })
    .eq("id", "current");
  if (error) throw new Error(`Update summary.betting_odds_snapshot failed: ${error.message}`);

  console.log(`Updated summary.betting_odds_snapshot.tryscorer with ${tryscorer.length} rows.`);
  console.log(`Merged international odds: H2H ${internationalH2h.length}, Line ${internationalLine.length}, Total ${internationalTotal.length}.`);
  console.log(JSON.stringify(countBookieRows(tryscorer), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

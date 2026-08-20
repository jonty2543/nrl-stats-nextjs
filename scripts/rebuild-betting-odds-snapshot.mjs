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
  if (row.bestBookie != null && row.bestPrice != null) {
    return { bestBookie: row.bestBookie, bestPrice: row.bestPrice };
  }

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
    bestBookie: row.bestBookie ?? bestBookie,
    bestPrice: row.bestPrice ?? bestPrice,
  };
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
  const tryscorer = rawTryscorers
    .map(mapTryscorerRow)
    .filter((row) => row.date && row.match && row.result)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.match !== b.match) return a.match.localeCompare(b.match);
      return a.result.localeCompare(b.result);
    });

  const now = new Date().toISOString();
  const { error } = await supabaseSummary
    .from("betting_odds_snapshot")
    .update({ tryscorer, generated_at: now, updated_at: now })
    .eq("id", "current");
  if (error) throw new Error(`Update summary.betting_odds_snapshot failed: ${error.message}`);

  console.log(`Updated summary.betting_odds_snapshot.tryscorer with ${tryscorer.length} rows.`);
  console.log(JSON.stringify(countBookieRows(tryscorer), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

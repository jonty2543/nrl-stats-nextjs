import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const PROJECTION_RANGE_Z_SCORE = 1.6448536269514722;
const FANTASY_POSITION_MAP = {
  1: "HOK",
  2: "MID",
  3: "EDG",
  4: "HLF",
  5: "CTR",
  6: "WFB",
};
const MAJOR_BYE_ROUNDS = [12, 15, 18];
const LINEUPS_AVERAGE_STATS = [
  ["Tries", "tries"],
  ["Try Assists", "try_assists"],
  ["All Run Metres", "all_run_metres"],
  ["Post Contact Metres", "post_contact_metres"],
  ["Tackles Made", "tackles_made"],
  ["Tackle Efficiency", "tackle_efficiency"],
  ["Line Breaks", "line_breaks"],
  ["Line Break Assists", "line_break_assists"],
  ["Errors", "errors"],
  ["Missed Tackles", "missed_tackles"],
  ["Receipts", "receipts"],
  ["Tackle Breaks", "tackle_breaks"],
  ["Offloads", "offloads"],
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireAnyEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${names.join(", ")}`);
}

function toNum(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value) {
  const parsed = toNum(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function normaliseName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fantasyPlayerSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseProjectionPlayerName(value) {
  const key = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (key === "api koroisau") return "apisai koroisau";
  return key;
}

function normaliseTeamKey(value) {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamGroup(value) {
  const key = normaliseTeamKey(value);
  if (!key) return null;
  if (key.includes("broncos") || key === "brisbane") return "broncos";
  if (key.includes("raiders") || key === "canberra") return "raiders";
  if (key.includes("bulldogs") || key.includes("canterbury")) return "bulldogs";
  if (key.includes("sharks") || key.includes("cronulla")) return "sharks";
  if (key.includes("dolphins")) return "dolphins";
  if (key.includes("titans") || key.includes("gold coast")) return "titans";
  if (key.includes("sea eagles") || key.includes("manly")) return "sea eagles";
  if (key.includes("storm") || key.includes("melbourne")) return "storm";
  if (key.includes("knights") || key.includes("newcastle")) return "knights";
  if (key.includes("warriors") || key.includes("zealand")) return "warriors";
  if (key.includes("cowboys") || key.includes("north queensland")) return "cowboys";
  if (key.includes("eels") || key.includes("parramatta")) return "eels";
  if (key.includes("panthers") || key.includes("penrith")) return "panthers";
  if (key.includes("rabbitohs") || key.includes("south sydney") || key === "souths") return "rabbitohs";
  if (key.includes("dragons") || key.includes("st george")) return "dragons";
  if (key.includes("roosters") || key.includes("sydney")) return "roosters";
  if (key.includes("tigers") || key.includes("wests")) return "tigers";
  return key;
}

function normalisePosition(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/five[-\s]?eighth/g, "five eighth")
    .replace(/2nd/g, "second")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function positionGroup(value) {
  const normalised = normalisePosition(value);
  if (!normalised) return null;
  if (["fullback", "fb"].includes(normalised)) return "fullback";
  if (["wing", "winger", "w"].includes(normalised)) return "wing";
  if (["centre", "center", "ctr"].includes(normalised)) return "centre";
  if (["halfback", "five eighth", "five eighths", "5 8", "58", "half", "hlf"].includes(normalised)) return "halves";
  if (["hooker", "dummy half", "hok"].includes(normalised)) return "hooker";
  if (["lock", "prop", "front row", "front rower", "middle", "mid"].includes(normalised)) return "middle";
  if (["second row", "second rower", "back row", "back rower", "2rf", "edg", "edge"].includes(normalised)) return "second-row";
  return normalised;
}

function projectionSigmaPositionKey(value) {
  const normalised = normalisePosition(value);
  if (!normalised) return null;
  if (["global", "__global__"].includes(normalised)) return "__global__";
  if (["bench", "interchange", "reserve", "replacement"].includes(normalised)) return "bench";
  if (["fullback", "fb"].includes(normalised)) return "fullback";
  if (["wing", "winger", "w"].includes(normalised)) return "winger";
  if (["centre", "center", "ctr"].includes(normalised)) return "centre";
  if (["halfback", "five eighth", "five eighths", "5 8", "58", "half", "hlf"].includes(normalised)) return "half";
  if (["hooker", "dummy half", "hok"].includes(normalised)) return "hooker";
  if (["lock", "prop", "front row", "front rower", "middle", "mid"].includes(normalised)) return "middle";
  if (["second row", "second rower", "back row", "back rower", "2rf", "edg", "edge"].includes(normalised)) return "edge";
  return normalised;
}

function positionLabels(positions) {
  return positions.map((code) => FANTASY_POSITION_MAP[code] ?? `POS ${code}`);
}

function extractHistory(input, integer = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [round, value] of Object.entries(input)) {
    const parsed = integer ? toInt(value) : toNum(value);
    if (parsed != null) out[round] = parsed;
  }
  return out;
}

function latestHistoryValue(history, fallback = null) {
  const entries = Object.entries(history)
    .map(([round, value]) => ({ round: Number.parseInt(round, 10), value }))
    .filter((row) => Number.isFinite(row.round))
    .sort((a, b) => b.round - a.round);
  return entries[0]?.value ?? fallback;
}

function nextHistoryValue(history) {
  const entries = Object.entries(history)
    .map(([round, value]) => ({ round: Number.parseInt(round, 10), value }))
    .filter((row) => Number.isFinite(row.round))
    .sort((a, b) => a.round - b.round);
  return entries[0]?.value ?? null;
}

function parseFantasyPlayer(raw) {
  const id = toInt(raw?.id);
  if (id == null) return null;
  const firstName = typeof raw.first_name === "string" ? raw.first_name.trim() : "";
  const lastName = typeof raw.last_name === "string" ? raw.last_name.trim() : "";
  const name = `${firstName} ${lastName}`.trim() || `Player ${id}`;
  const positions = Array.isArray(raw.positions)
    ? raw.positions.map(toInt).filter((value) => value != null)
    : [];
  const priceHistory = extractHistory(raw.stats?.prices, true);
  const scoreHistory = extractHistory(raw.stats?.scores);
  const cost = latestHistoryValue(priceHistory, toInt(raw.cost));

  return {
    id,
    name,
    cost,
    positionLabel: positionLabels(positions).join("/") || "N/A",
    ownedBy: toNum(raw.stats?.owned_by),
    avgPoints: toNum(raw.stats?.avg_points),
    projectedAvg: toNum(raw.stats?.proj_avg),
    gamesPlayed: toInt(raw.stats?.games_played),
    totalPoints: toNum(raw.stats?.total_points),
    tog: toNum(raw.stats?.tog),
    be: toInt(raw.stats?.be) ?? toInt(raw.stats?.break_even) ?? toInt(raw.stats?.breakeven),
    pricedAt: cost != null ? cost / 12725 : null,
    scoreHistory,
  };
}

function parseCoachPlayer(id, raw) {
  return {
    id: Number.parseInt(id, 10),
    projection: toNum(raw?.proj_score) ?? nextHistoryValue(extractHistory(raw?.proj_scores)),
    breakeven: toInt(raw?.break_even) ?? nextHistoryValue(extractHistory(raw?.break_evens, true)),
  };
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
  if (!response.ok) throw new Error(`Fetch failed ${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchFantasyPlayers() {
  const raw = await fetchJson("https://fantasy.nrl.com/data/nrl/players.json");
  if (!Array.isArray(raw)) return [];
  return raw.map(parseFantasyPlayer).filter(Boolean);
}

async function fetchCoachPlayers() {
  const raw = await fetchJson("https://fantasy.nrl.com/data/nrl/coach/players.json", {
    "user-agent": "shortside-summary-rebuild/1.0",
  });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  return new Map(
    Object.entries(raw)
      .map(([id, row]) => parseCoachPlayer(id, row))
      .filter((row) => Number.isFinite(row.id))
      .map((row) => [row.id, row])
  );
}

async function fetchAllRows(supabase, table, select, applyFilters = (query) => query) {
  const out = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await applyFilters(supabase.from(table).select(select)).range(start, end);
    if (error) throw new Error(`Supabase fetch ${table}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

async function fetchPlayerImages(supabase) {
  return fetchAllRows(supabase, "player_images", "player,team,number,position,head_image,body_image,last_seen_match_date");
}

async function fetchTeamLogos(supabase) {
  const rows = await fetchAllRows(supabase, "team_logos", "*");
  const logos = new Map();
  for (const row of rows) {
    const logoUrl = [
      row.short_side_logo_url,
      row.side_logo_url,
      row.short_logo_url,
      row.logo_url,
    ].find((value) => typeof value === "string" && value.trim())?.trim();
    if (!logoUrl) continue;
    for (const candidate of [
      row.team,
      row.team_name,
      row.name,
      row.display_name,
      row.full_name,
      row.short_name,
      row.club,
      row.nickname,
      row.abbreviation,
    ]) {
      const key = teamGroup(candidate) ?? normaliseTeamKey(candidate);
      if (key && !logos.has(key)) logos.set(key, logoUrl);
    }
  }
  return logos;
}

async function fetchCasualtyWardRows(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "casualty_ward",
    "player,team,position,injury,return_date,games,average_fantasy,source_url,scraped_at"
  );
  return rows
    .map((row) => ({
      player: typeof row.player === "string" ? row.player.trim() : "",
      team: typeof row.team === "string" ? row.team.trim() : null,
      position: typeof row.position === "string" ? row.position.trim() : null,
      injury: typeof row.injury === "string" ? row.injury.trim() : null,
      returnDate: typeof row.return_date === "string" ? row.return_date.trim() : null,
      games: toNum(row.games),
      averageFantasy: toNum(row.average_fantasy),
      sourceUrl: typeof row.source_url === "string" ? row.source_url.trim() : null,
      scrapedAt: typeof row.scraped_at === "string" ? row.scraped_at.trim() : null,
    }))
    .filter((row) => row.player);
}

async function fetchProjectionSigmas(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "fantasy_projection_sigmas",
    "position,fallback_position,projection,residual_sigma,normal_low_95_delta,normal_high_95_delta",
    (query) => query.eq("calibration_key", "final_post_opponent_position_v1")
  );
  return rows
    .map((row) => ({
      position: typeof row.position === "string" ? row.position : null,
      residualSigma: toNum(row.residual_sigma),
      normalLow95Delta: toNum(row.normal_low_95_delta),
      normalHigh95Delta: toNum(row.normal_high_95_delta),
    }))
    .filter((row) => row.position);
}

function minutesToNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return toNum(value);
  const text = value.trim();
  const parts = text.split(":").map((part) => Number.parseFloat(part));
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] + parts[1] / 60;
  return toNum(text);
}

async function fetchPlayerStats2026(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "player_stats",
    [
      "player",
      "team",
      "position",
      "number",
      "match_date",
      "round",
      "total_points",
      "mins_played",
      ...LINEUPS_AVERAGE_STATS.map(([, column]) => column),
    ].join(","),
    (query) => query.gte("match_date", "2026-01-01").lt("match_date", "2027-01-01")
  );
  return rows
    .map((row) => ({
      player: typeof row.player === "string" ? row.player.trim() : "",
      team: typeof row.team === "string" ? row.team.trim() : null,
      position: typeof row.position === "string" ? row.position.trim() : null,
      number: toNum(row.number),
      matchDate: typeof row.match_date === "string" ? row.match_date : "",
      round: Number.parseInt(String(row.round ?? "").match(/\d+/)?.[0] ?? "0", 10),
      fantasy: toNum(row.total_points),
      minutes: minutesToNumber(row.mins_played),
      stats: row,
    }))
    .filter((row) => row.player && row.fantasy != null && (row.minutes ?? 0) > 0);
}

function currentYearInBrisbane() {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
  }).format(new Date());
  return Number.parseInt(year, 10);
}

function opponentFromMatch(match, team) {
  if (!match || !team) return null;
  const teams = String(match).split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
  if (teams.length !== 2) return null;
  const teamGroupKey = teamGroup(team);
  const opponent = teams.find((entry) => teamGroup(entry) !== teamGroupKey) ?? null;
  return opponent || null;
}

async function fetchLineupPlayerTryHistoryRows(supabase, endYear) {
  const startYear = endYear - 4;
  const rows = await fetchAllRows(
    supabase,
    "player_stats",
    "player,team,match,match_date,round,tries",
    (query) => query.gte("match_date", `${startYear}-01-01`).lt("match_date", `${endYear + 1}-01-01`)
  );
  return rows
    .map((row) => {
      const player = typeof row.player === "string" ? row.player.trim() : "";
      const team = typeof row.team === "string" ? row.team.trim() : "";
      const matchDate = typeof row.match_date === "string" ? row.match_date : "";
      return {
        player,
        playerKey: normaliseName(player),
        team,
        opponent: opponentFromMatch(row.match, team),
        tries: toNum(row.tries) ?? 0,
        year: matchDate.slice(0, 4),
        round: Number.parseInt(String(row.round ?? "").match(/\d+/)?.[0] ?? "0", 10),
        matchDate,
      };
    })
    .filter((row) => row.playerKey && row.player && row.matchDate);
}

function buildLineupPlayerTryHistorySummary(rows) {
  const byPlayer = new Map();
  for (const row of rows) {
    const bucket = byPlayer.get(row.playerKey) ?? { playerKey: row.playerKey, player: row.player, history: [] };
    bucket.history.push(row);
    byPlayer.set(row.playerKey, bucket);
  }

  const updatedAt = new Date().toISOString();
  return [...byPlayer.values()].map((entry) => ({
    player_key: entry.playerKey,
    player: entry.player,
    history: entry.history
      .sort((a, b) => b.matchDate.localeCompare(a.matchDate) || b.round - a.round)
      .slice(0, 100)
      .map((row) => ({
        team: row.team,
        opponent: row.opponent,
        tries: row.tries,
        year: row.year,
        round: row.round,
      })),
    updated_at: updatedAt,
  }));
}

function buildLineupPlayerTryHistoryObject(rows) {
  return Object.fromEntries(
    buildLineupPlayerTryHistorySummary(rows).map((row) => [row.player_key, row.history])
  );
}

function positionBaselineKey(position, number) {
  const rawNumber = Number(number);
  if (rawNumber === 1) return "FB";
  if (rawNumber === 2 || rawNumber === 5) return "W";
  if (rawNumber === 3 || rawNumber === 4) return "C";
  if (rawNumber === 6) return "FE";
  if (rawNumber === 7) return "HLF";
  if (rawNumber === 8 || rawNumber === 10) return "PR";
  if (rawNumber === 9) return "HK";
  if (rawNumber === 11 || rawNumber === 12) return "2RF";
  if (rawNumber === 13) return "LK";
  const key = normaliseName(position);
  if (key.includes("fullback")) return "FB";
  if (key.includes("wing")) return "W";
  if (key.includes("centre") || key.includes("center")) return "C";
  if (key.includes("five eighth")) return "FE";
  if (key.includes("halfback")) return "HLF";
  if (key.includes("hooker")) return "HK";
  if (key.includes("prop")) return "PR";
  if (key.includes("row")) return "2RF";
  if (key.includes("lock")) return "LK";
  return null;
}

function buildLineupsPlayerAverages(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = normaliseName(row.player);
    if (!key) continue;
    const bucket = totals.get(key) ?? { games: 0, values: Object.fromEntries(LINEUPS_AVERAGE_STATS.map(([label]) => [label, 0])) };
    bucket.games += 1;
    for (const [label, column] of LINEUPS_AVERAGE_STATS) {
      bucket.values[label] += toNum(row.stats?.[column]) ?? 0;
    }
    totals.set(key, bucket);
  }
  return Object.fromEntries(
    [...totals.entries()].map(([key, bucket]) => [
      key,
      Object.fromEntries(LINEUPS_AVERAGE_STATS.map(([label]) => [label, bucket.games > 0 ? bucket.values[label] / bucket.games : 0])),
    ])
  );
}

function buildLineupsPositionPpmBaselines(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = positionBaselineKey(row.position, row.number);
    if (!key || row.minutes == null || row.minutes <= 0 || row.fantasy == null) continue;
    const bucket = totals.get(key) ?? { fantasy: 0, minutes: 0 };
    bucket.fantasy += row.fantasy;
    bucket.minutes += row.minutes;
    totals.set(key, bucket);
  }
  return Object.fromEntries(
    [...totals.entries()].map(([key, bucket]) => [key, bucket.minutes > 0 ? bucket.fantasy / bucket.minutes : 0])
  );
}

function buildStatsByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = normaliseName(row.player);
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function findLocalRows(playerName, statsByName) {
  const exact = statsByName.get(normaliseName(playerName));
  if (exact) return exact;
  const fantasyParts = normaliseName(playerName).split(" ").filter(Boolean);
  const first = fantasyParts[0];
  const last = fantasyParts[fantasyParts.length - 1];
  if (!first || !last) return [];

  const candidates = [];
  for (const [key, rows] of statsByName.entries()) {
    const parts = key.split(" ").filter(Boolean);
    if (parts[parts.length - 1] === last) candidates.push({ key, rows, parts });
  }
  const initialMatches = candidates.filter(({ parts }) => parts[0]?.[0] && parts[0][0] === first[0]);
  if (initialMatches.length === 1) return initialMatches[0].rows;

  const prefixMatches = candidates.filter(({ parts }) => {
    const candidateFirst = parts[0] ?? "";
    return candidateFirst.startsWith(first) || first.startsWith(candidateFirst);
  });
  if (prefixMatches.length === 1) return prefixMatches[0].rows;
  if (candidates.length === 1) return candidates[0].rows;

  return [];
}

function average(values) {
  const valid = values.filter((value) => value != null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function lastFantasyScoresFromHistory(scoreHistory, count) {
  return Object.entries(scoreHistory ?? {})
    .map(([round, value]) => ({ round: Number.parseInt(round, 10), value }))
    .filter((row) => Number.isFinite(row.round) && valueIsFinite(row.value))
    .sort((a, b) => b.round - a.round)
    .slice(0, count)
    .map((row) => row.value);
}

function valueIsFinite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normaliseImageUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  const marker = "/remote.axd?";
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    const nested = trimmed.slice(idx + marker.length);
    if (nested.startsWith("http://")) return `https://${nested.slice("http://".length)}`;
    return nested || null;
  }
  return trimmed;
}

function resolvePlayerImage(playerName, localName, team, playerImages) {
  const nameKeys = [playerName, localName].map(normaliseName).filter(Boolean);
  const teamKey = teamGroup(team);
  const candidates = playerImages.filter((row) => nameKeys.includes(normaliseName(row.player)));
  if (candidates.length === 0) return null;
  return candidates.find((row) => teamKey && teamGroup(row.team) === teamKey) ?? candidates[0] ?? null;
}

function resolveTeamLogo(team, teamLogos) {
  const key = teamGroup(team) ?? normaliseTeamKey(team);
  return key ? teamLogos.get(key) ?? null : null;
}

function resolveProjectionBand(projection, position, sigmas) {
  if (projection == null) return { low: null, high: null };
  const positionKey = projectionSigmaPositionKey(position);
  const globalSigma = sigmas.find((row) => projectionSigmaPositionKey(row.position) === "__global__") ?? null;
  const sigma = sigmas.find((row) => projectionSigmaPositionKey(row.position) === positionKey) ?? globalSigma;
  if (!sigma) return { low: null, high: null };
  const residualSigma =
    sigma.residualSigma ??
    (sigma.normalHigh95Delta != null && sigma.normalLow95Delta != null
      ? (sigma.normalHigh95Delta - sigma.normalLow95Delta) / 3.92
      : null);
  if (residualSigma == null || residualSigma <= 0) return { low: null, high: null };
  return {
    low: projection - residualSigma * PROJECTION_RANGE_Z_SCORE,
    high: projection + residualSigma * PROJECTION_RANGE_Z_SCORE,
  };
}

function formatCasualtyRow(row) {
  return {
    player: row.player,
    team: row.team,
    position: row.position,
    injury: row.injury,
    returnDate: row.returnDate,
    games: row.games,
    averageFantasy: row.averageFantasy,
    sourceUrl: row.sourceUrl,
    scrapedAt: row.scrapedAt,
  };
}

function primaryTeam(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!row.team) continue;
    counts.set(row.team, (counts.get(row.team) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function latestPosition(rows) {
  return [...rows].sort((a, b) => b.matchDate.localeCompare(a.matchDate) || b.round - a.round)[0]?.position ?? null;
}

function getProjectionFixtureCutoffUtc() {
  return new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
}

function parseRoundNumber(value) {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const round = Number.parseInt(match[0], 10);
  return Number.isFinite(round) ? round : null;
}

function isZeroProjectionPosition(value) {
  const position = normaliseTeamKey(value);
  return position === "reserve" || position === "replacement";
}

async function fetchLineupProjectionSnapshot(supabase) {
  const cutoffUtc = getProjectionFixtureCutoffUtc();
  const empty = {
    source: "none",
    round: null,
    projectionByPlayerId: new Map(),
    projectionByPlayerName: new Map(),
    roleByPlayerId: new Map(),
    roleByPlayerName: new Map(),
  };

  const { data: upcoming } = await supabase
    .from("lineups")
    .select("round")
    .gte("match_date", cutoffUtc)
    .order("match_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!upcoming?.round) {
    return fetchLineupUnawareProjectionSnapshot(supabase, cutoffUtc, empty);
  }

  const roundLabel = upcoming.round;
  const { data, error } = await supabase
    .from("lineups")
    .select("match_id,player,player_id,model_projection,position,team,number,is_on_field")
    .eq("round", roundLabel);
  if (error || !data) return fetchLineupUnawareProjectionSnapshot(supabase, cutoffUtc, empty);

  const matchIds = [...new Set(data.map((row) => String(row.match_id ?? "")).filter(Boolean))];
  const playerIds = [...new Set(data.map((row) => String(row.player_id ?? "")).filter(Boolean))];
  const overrideByKey = new Map();
  if (matchIds.length > 0 && playerIds.length > 0) {
    const { data: overrides, error: overrideError } = await supabase
      .from("fantasy_projection_overrides")
      .select("match_id,player_id,projection_override_points")
      .in("match_id", matchIds)
      .in("player_id", playerIds);
    if (!overrideError) {
      for (const row of overrides ?? []) {
        const delta = toNum(row.projection_override_points);
        if (delta != null) overrideByKey.set(`${row.match_id ?? ""}:${row.player_id ?? ""}`, delta);
      }
    }
  }

  const snapshot = { ...empty, source: "lineups", round: parseRoundNumber(roundLabel) };
  for (const row of data) {
    const id = row.player_id == null ? null : Number(row.player_id);
    const nameKey = normaliseProjectionPlayerName(row.player);
    const modelProjection = toNum(row.model_projection);
    const manualDelta = overrideByKey.get(`${row.match_id ?? ""}:${row.player_id ?? ""}`) ?? 0;
    const projection = isZeroProjectionPosition(row.position)
      ? 0
      : modelProjection == null
        ? null
        : modelProjection + manualDelta;
    const role = {
      position: typeof row.position === "string" ? row.position : null,
      team: typeof row.team === "string" ? row.team : null,
      isOnField: Boolean(row.is_on_field),
    };
    if (projection != null) {
      if (id != null) snapshot.projectionByPlayerId.set(id, projection);
      if (nameKey) snapshot.projectionByPlayerName.set(nameKey, projection);
    }
    if (id != null) snapshot.roleByPlayerId.set(id, role);
    if (nameKey) snapshot.roleByPlayerName.set(nameKey, role);
  }

  return snapshot;
}

async function fetchLineupUnawareProjectionSnapshot(supabase, cutoffUtc, empty) {
  const { data, error } = await supabase
    .from("lineup_unaware_fantasy_projections")
    .select("round,player,team,assumed_jersey,assumed_position,projection,model_projection,kickoff_utc")
    .gte("kickoff_utc", cutoffUtc)
    .order("kickoff_utc", { ascending: true });
  if (error || !data) return empty;

  const firstKickoffMs = data
    .map((row) => Date.parse(String(row.kickoff_utc ?? "")))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const rows = firstKickoffMs == null
    ? data
    : data.filter((row) => {
      const kickoffMs = Date.parse(String(row.kickoff_utc ?? ""));
      return Number.isFinite(kickoffMs) && kickoffMs >= firstKickoffMs && kickoffMs < firstKickoffMs + 6 * 24 * 60 * 60 * 1000;
    });

  const snapshot = { ...empty, source: "lineup_unaware", round: parseRoundNumber(rows[0]?.round) };
  for (const row of rows) {
    const nameKey = normaliseProjectionPlayerName(row.player);
    const projection = toNum(row.projection) ?? toNum(row.model_projection);
    if (nameKey && projection != null) snapshot.projectionByPlayerName.set(nameKey, projection);
    if (nameKey) {
      snapshot.roleByPlayerName.set(nameKey, {
        position: typeof row.assumed_position === "string" ? row.assumed_position : null,
        team: typeof row.team === "string" ? row.team : null,
        isOnField: true,
      });
    }
  }
  return snapshot;
}

async function fetchOwnershipBaseline(supabase) {
  const { data, error } = await supabase
    .from("fantasy_ownership_snapshots")
    .select("snapshot_data")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !Array.isArray(data?.snapshot_data)) return new Map();

  const map = new Map();
  for (const point of data.snapshot_data) {
    if (typeof point?.playerId !== "number") continue;
    map.set(point.playerId, toNum(point.ownedBy));
  }
  return map;
}

async function fetchOriginChanceNames(supabase) {
  const { data, error } = await supabase.from("origin_chances").select("player").limit(1000);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => normaliseProjectionPlayerName(row.player)).filter(Boolean));
}

async function loadDrawRows() {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "draw_2026.csv"), "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .flatMap((line) => {
        const [round, kickoff, matchCentreUrl, home, away] = line.split(",");
        const roundNum = Number.parseInt(round ?? "", 10);
        return Number.isFinite(roundNum) ? [{ round: roundNum, kickoff, matchCentreUrl, home, away }] : [];
      });
  } catch {
    return [];
  }
}

function teamPlaysInRound(drawRows, round, team) {
  if (!round || !team || drawRows.length === 0) return null;
  const key = teamGroup(team);
  if (!key) return null;
  return drawRows.some((row) => row.round === round && (teamGroup(row.home) === key || teamGroup(row.away) === key));
}

function getNextMajorByeRound(currentRound) {
  const round = typeof currentRound === "number" && Number.isFinite(currentRound) ? currentRound : 1;
  return MAJOR_BYE_ROUNDS.find((byeRound) => byeRound >= round) ?? null;
}

function majorByeTags(drawRows, nextMajorByeRound, team) {
  if (nextMajorByeRound == null) return [];
  return MAJOR_BYE_ROUNDS
    .filter((round) => round >= nextMajorByeRound)
    .map((round) => ({
      round,
      plays: teamPlaysInRound(drawRows, round, team),
    }));
}

function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function nullableText(value) {
  const valueText = text(value);
  return valueText || null;
}

function booleanValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") return ["true", "t", "yes", "y", "1"].includes(value.trim().toLowerCase());
  return false;
}

function nominalSide(number) {
  if (number == null || number >= 14) return "bench";
  if (number === 5 || number === 4 || number === 11 || number === 6) return "left";
  if (number === 2 || number === 3 || number === 12 || number === 7) return "right";
  if (number === 9 || number === 1) return "spine";
  if (number === 8 || number === 10 || number === 13) return "middle";
  return "unknown";
}

function currentRoundOption(options, preferredRoundNumber = null) {
  if (options.length === 0) return null;
  if (preferredRoundNumber != null) {
    const preferredRound = options.find((option) => option.roundNumber === preferredRoundNumber);
    if (preferredRound) return preferredRound;
  }
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const activeRound = options.find((option) => today >= option.startDate && today <= option.endDate);
  if (activeRound) return activeRound;
  return options.find((option) => option.startDate >= today) ?? options.findLast((option) => option.startDate <= today) ?? options[0] ?? null;
}

function matchMergeKey(matchDate, homeTeam, awayTeam) {
  return [String(matchDate ?? "").slice(0, 10), teamGroup(homeTeam), teamGroup(awayTeam)].join("|");
}

function matchTeams(match) {
  const home = match.homeTeam?.team ?? String(match.match ?? "").split(/\s+vs\s+/i)[0]?.trim();
  const away = match.awayTeam?.team ?? String(match.match ?? "").split(/\s+vs\s+/i)[1]?.trim();
  return { home, away };
}

function resultIncludesTeam(result, team) {
  const key = teamGroup(team);
  return Boolean(key && (teamGroup(result.homeTeam) === key || teamGroup(result.awayTeam) === key));
}

function resultIncludesMatchup(result, homeTeam, awayTeam) {
  return resultIncludesTeam(result, homeTeam) && resultIncludesTeam(result, awayTeam);
}

function resultBeforeMatch(result, matchDate) {
  const resultDate = String(result.matchDate ?? "").slice(0, 10);
  const currentDate = String(matchDate ?? "").slice(0, 10);
  return Boolean(resultDate && currentDate && resultDate < currentDate);
}

async function loadDraw2026Rows() {
  const drawPath = path.join(process.cwd(), "data", "draw_2026.csv");
  const raw = await readFile(drawPath, "utf8");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [round, kickoff, matchCentreUrl, home, away] = line.split(",");
    const roundNumber = Number.parseInt(round ?? "", 10);
    if (!Number.isFinite(roundNumber)) continue;
    rows.push({
      round: roundNumber,
      kickoff: kickoff ?? "",
      matchCentreUrl: matchCentreUrl ?? "",
      home: home ?? "",
      away: away ?? "",
    });
  }
  return rows.sort((a, b) => a.round - b.round || a.kickoff.localeCompare(b.kickoff));
}

function addLineupRoundOption(options, round, roundNumber, matchDate) {
  if (!round || !matchDate) return;
  const current = options.get(round) ?? {
    value: round,
    label: round,
    roundNumber,
    startDate: matchDate,
    endDate: matchDate,
  };
  current.roundNumber = Number.isFinite(current.roundNumber) ? current.roundNumber : roundNumber;
  if (matchDate < current.startDate) current.startDate = matchDate;
  if (matchDate > current.endDate) current.endDate = matchDate;
  options.set(round, current);
}

function drawRowsForRound(rows, round) {
  const roundNumber = Number.parseInt(String(round ?? "").match(/\d+/)?.[0] ?? "", 10);
  if (!Number.isFinite(roundNumber)) return [];
  return rows.filter((row) => row.round === roundNumber);
}

function drawMatchId(row) {
  return `draw-2026-${row.round}-${teamGroup(row.home)}-${teamGroup(row.away)}`;
}

function matchFromDrawRow(row) {
  const matchDate = String(row.kickoff ?? "").slice(0, 10);
  return {
    matchId: drawMatchId(row),
    matchDate,
    kickoffUtc: row.kickoff || null,
    round: `Round ${row.round}`,
    venue: null,
    match: `${row.home} vs ${row.away}`,
    matchUrl: row.matchCentreUrl || null,
    homeTeam: { team: row.home, teamName: row.home, teamId: null, teamType: "Home", players: [] },
    awayTeam: { team: row.away, teamName: row.away, teamId: null, teamType: "Away", players: [] },
    homeScore: null,
    awayScore: null,
  };
}

function addRecentResults(match, results) {
  const { home, away } = matchTeams(match);
  if (!home || !away) return match;
  const previousResults = results.filter((result) => resultBeforeMatch(result, match.matchDate));
  return {
    ...match,
    recentHeadToHead: previousResults.filter((result) => resultIncludesMatchup(result, home, away)).slice(0, 30),
    homeRecentResults: previousResults.filter((result) => resultIncludesTeam(result, home)).slice(0, 30),
    awayRecentResults: previousResults.filter((result) => resultIncludesTeam(result, away)).slice(0, 30),
  };
}

async function fetchRecentMatchResultsSummary(supabase, year) {
  const rows = await fetchAllRows(
    supabase,
    "matches",
    "match_date,round,team,opponent_team,score,opponent_score,is_home",
    (query) => query.lt("match_date", `${year + 1}-01-01`).not("score", "is", null).not("opponent_score", "is", null).order("match_date", { ascending: false })
  );
  const results = new Map();
  for (const row of rows) {
    const matchDate = text(row.match_date);
    const team = text(row.team);
    const opponent = text(row.opponent_team);
    const score = toNum(row.score);
    const opponentScore = toNum(row.opponent_score);
    if (!matchDate || !team || !opponent || score == null || opponentScore == null) continue;
    const isHome = booleanValue(row.is_home);
    const result = {
      matchDate,
      round: nullableText(row.round),
      homeTeam: isHome ? team : opponent,
      awayTeam: isHome ? opponent : team,
      homeScore: isHome ? score : opponentScore,
      awayScore: isHome ? opponentScore : score,
    };
    const key = [matchDate.slice(0, 10), teamGroup(result.homeTeam), teamGroup(result.awayTeam)].sort().join("|");
    results.set(key, result);
  }
  return [...results.values()];
}

async function fetchLineupRoundOptionsSummary(supabase, year) {
  const matchRows = await fetchAllRows(
    supabase,
    "matches",
    "round,round_number,match_date",
    (query) => query.gte("match_date", `${year}-01-01`).lt("match_date", `${year + 1}-01-01`).order("match_date", { ascending: true })
  );
  const lineupRows = await fetchAllRows(
    supabase,
    "lineups",
    "round,match_date,kickoff_utc",
    (query) => query.gte("match_date", `${year}-01-01`).lt("match_date", `${year + 1}-01-01`).order("match_date", { ascending: true })
  );
  const byRound = new Map();
  for (const row of matchRows) {
    const round = text(row.round);
    if (!round) continue;
    const current = byRound.get(round) ?? {
      value: round,
      label: round,
      roundNumber: toNum(row.round_number) ?? Number.parseInt(round.match(/\d+/)?.[0] ?? "0", 10),
      startDate: text(row.match_date).slice(0, 10),
      endDate: text(row.match_date).slice(0, 10),
    };
    const date = text(row.match_date).slice(0, 10);
    addLineupRoundOption(byRound, round, current.roundNumber, date);
  }
  for (const row of lineupRows) {
    const round = text(row.round);
    if (!round) continue;
    const date = text(row.match_date || row.kickoff_utc).slice(0, 10);
    addLineupRoundOption(byRound, round, parseRoundNumber(round), date);
  }
  if (year === 2026) {
    const drawRows = await loadDraw2026Rows();
    for (const row of drawRows) {
      addLineupRoundOption(byRound, `Round ${row.round}`, row.round, String(row.kickoff ?? "").slice(0, 10));
    }
  }
  return [...byRound.values()].sort((a, b) => a.roundNumber - b.roundNumber);
}

async function fetchLineupMatchesSummary(supabase, round, year) {
  const rows = await fetchAllRows(
    supabase,
    "lineups",
    [
      "match_id",
      "match_date",
      "kickoff_utc",
      "round",
      "venue",
      "match",
      "match_url",
      "team",
      "team_name",
      "team_id",
      "team_type",
      "number",
      "position",
      "player",
      "player_id",
      "is_captain",
      "is_on_field",
      "head_image",
      "body_image",
      "model_projection",
    ].join(","),
    (query) => query.eq("round", round).gte("match_date", `${year}-01-01`).lt("match_date", `${year + 1}-01-01`).order("match_date", { ascending: true }).order("number", { ascending: true })
  );
  const matchIds = [...new Set(rows.map((row) => text(row.match_id)).filter(Boolean))];
  const playerIds = [...new Set(rows.map((row) => text(row.player_id)).filter(Boolean))];
  const overrideByKey = new Map();
  if (matchIds.length > 0 && playerIds.length > 0) {
    const { data: overrides, error } = await supabase
      .from("fantasy_projection_overrides")
      .select("match_id,player_id,projection_override_points")
      .in("match_id", matchIds)
      .in("player_id", playerIds);
    if (!error) {
      for (const row of overrides ?? []) {
        const delta = toNum(row.projection_override_points);
        if (delta != null) overrideByKey.set(`${row.match_id ?? ""}:${row.player_id ?? ""}`, delta);
      }
    }
  }
  const byMatch = new Map();
  for (const row of rows) {
    const matchId = text(row.match_id);
    if (!matchId) continue;
    const group = byMatch.get(matchId) ?? { base: row, players: [] };
    const number = toNum(row.number);
    const modelProjection = toNum(row.model_projection);
    const projectionDelta = overrideByKey.get(`${row.match_id ?? ""}:${row.player_id ?? ""}`) ?? 0;
    group.players.push({
      matchId,
      team: text(row.team),
      teamName: text(row.team_name) || text(row.team),
      teamId: toNum(row.team_id),
      teamType: text(row.team_type),
      number,
      position: text(row.position),
      player: text(row.player),
      playerId: toNum(row.player_id),
      isCaptain: booleanValue(row.is_captain),
      isOnField: booleanValue(row.is_on_field),
      headImage: nullableText(row.head_image),
      bodyImage: nullableText(row.body_image),
      fantasyProjection: isZeroProjectionPosition(row.position)
        ? 0
        : modelProjection == null
          ? null
          : modelProjection + projectionDelta,
      side: nominalSide(number),
      sideSource: "nominal",
    });
    byMatch.set(matchId, group);
  }
  return [...byMatch.values()].map(({ base, players }) => {
    const homePlayers = players.filter((player) => player.teamType.toLowerCase() === "home");
    const awayPlayers = players.filter((player) => player.teamType.toLowerCase() === "away");
    const teamFromPlayers = (teamPlayers, teamType) => teamPlayers.length === 0 ? null : {
      team: teamPlayers[0].team,
      teamName: teamPlayers[0].teamName,
      teamId: teamPlayers[0].teamId,
      teamType,
      players: teamPlayers.sort((a, b) => (a.number ?? 99) - (b.number ?? 99)),
    };
    return {
      matchId: text(base.match_id),
      matchDate: text(base.match_date),
      kickoffUtc: nullableText(base.kickoff_utc),
      round: text(base.round),
      venue: nullableText(base.venue),
      match: text(base.match),
      matchUrl: nullableText(base.match_url),
      homeTeam: teamFromPlayers(homePlayers, "Home"),
      awayTeam: teamFromPlayers(awayPlayers, "Away"),
    };
  });
}

async function fetchFixtureMatchesSummary(supabase, round, year, drawRows = []) {
  const rows = await fetchAllRows(
    supabase,
    "matches",
    "url,match_date,round,team,opponent_team,is_home,score,opponent_score",
    (query) => query.eq("round", round).gte("match_date", `${year}-01-01`).lt("match_date", `${year + 1}-01-01`).order("match_date", { ascending: true })
  );
  const matches = rows
    .filter((row) => booleanValue(row.is_home))
    .map((row) => {
      const matchDate = text(row.match_date);
      const homeTeam = text(row.team);
      const awayTeam = text(row.opponent_team);
      const matchId = matchMergeKey(matchDate, homeTeam, awayTeam);
      return {
        matchId,
        matchDate,
        kickoffUtc: null,
        round: text(row.round) || round,
        venue: null,
        match: `${homeTeam} vs ${awayTeam}`,
        matchUrl: nullableText(row.url),
        homeTeam: { team: homeTeam, teamName: homeTeam, teamId: null, teamType: "Home", players: [] },
        awayTeam: { team: awayTeam, teamName: awayTeam, teamId: null, teamType: "Away", players: [] },
        homeScore: toNum(row.score),
        awayScore: toNum(row.opponent_score),
      };
    })
    .filter((match) => match.matchDate && match.homeTeam.team && match.awayTeam.team);
  const seenKeys = new Set(matches.map((match) => matchMergeKey(match.matchDate, match.homeTeam.team, match.awayTeam.team)));
  for (const drawRow of drawRowsForRound(drawRows, round)) {
    const key = matchMergeKey(drawRow.kickoff, drawRow.home, drawRow.away);
    if (!seenKeys.has(key)) {
      matches.push(matchFromDrawRow(drawRow));
      seenKeys.add(key);
    }
  }
  return matches.sort((a, b) => a.matchDate.localeCompare(b.matchDate) || String(a.kickoffUtc ?? "").localeCompare(String(b.kickoffUtc ?? "")));
}

function mergeFixtureAndLineupMatches(fixtureMatches, lineupMatches) {
  const byKey = new Map();
  for (const match of fixtureMatches) {
    const { home, away } = matchTeams(match);
    if (!home || !away) continue;
    byKey.set(matchMergeKey(match.matchDate, home, away), match);
  }
  for (const match of lineupMatches) {
    const { home, away } = matchTeams(match);
    if (!home || !away) continue;
    const key = matchMergeKey(match.matchDate, home, away);
    const fixture = byKey.get(key);
    byKey.set(key, fixture ? { ...fixture, ...match, homeScore: fixture.homeScore, awayScore: fixture.awayScore } : match);
  }
  return [...byKey.values()].sort((a, b) => a.matchDate.localeCompare(b.matchDate) || String(a.kickoffUtc ?? "").localeCompare(String(b.kickoffUtc ?? "")));
}

async function fetchLineupsSummaryTeamLogos(supabase) {
  const rows = await fetchAllRows(supabase, "team_logos", "team,team_name,name,short_name,logo_url,short_side_logo_url,side_logo_url,short_logo_url");
  const logos = new Map();
  for (const row of rows) {
    const logo = nullableText(row.short_side_logo_url) ?? nullableText(row.side_logo_url) ?? nullableText(row.short_logo_url) ?? nullableText(row.logo_url);
    if (!logo) continue;
    for (const name of [row.team, row.team_name, row.name, row.short_name]) {
      for (const key of [normaliseName(text(name)), normaliseTeamKey(name), teamGroup(name)]) {
        if (key && !logos.has(key)) logos.set(key, logo);
      }
    }
  }
  return Object.fromEntries(logos);
}

async function fetchLineupsSummaryTryscorerOdds(supabase, today) {
  const rows = await fetchAllRows(
    supabase,
    "NRL Tryscorers",
    "*",
    (query) => query.gte("Date", today).eq("Value", 1)
  );
  const odds = new Map();
  for (const row of rows) {
    const player = text(row.Result);
    const bestPrice = toNum(row["Best Price"]);
    const key = normaliseName(player);
    if (!key || bestPrice == null) continue;
    const current = odds.get(key);
    if (current?.bestPrice != null && current.bestPrice >= bestPrice) continue;
    odds.set(key, { player, bestBookie: nullableText(row["Best Bookie"]), bestPrice });
  }
  return Object.fromEntries(odds);
}

async function fetchLineupsSummarySportsbetOdds(supabase, today) {
  const rows = await fetchAllRows(supabase, "NRL Odds", "*", (query) => query.gte("Date", today));
  const odds = new Map();
  for (const row of rows) {
    const market = text(row.Market).toLowerCase();
    if (market && market !== "h2h") continue;
    const team = text(row.Result);
    const price = toNum(row.Sportsbet ?? row.SportsBet ?? row.sportsbet);
    const date = text(row.Date).slice(0, 10);
    if (!team || price == null || price <= 1 || !date) continue;
    const entry = { team, matchDate: date, match: text(row.Match), price };
    const teamKey = normaliseName(team);
    if (teamKey && !odds.has(teamKey)) odds.set(teamKey, entry);
    const datedKey = `${date}|${teamKey}`;
    if (teamKey && !odds.has(datedKey)) odds.set(datedKey, entry);
  }
  return Object.fromEntries(odds);
}

async function fetchLineupsSummaryCasualtyOuts(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "casualty_ward",
    "team,player,injury,return_date",
    (query) => query.eq("competition_id", 111).order("team", { ascending: true }).order("player", { ascending: true })
  );
  const byTeam = new Map();
  for (const row of rows) {
    const team = text(row.team);
    const player = text(row.player);
    const key = normaliseName(team);
    if (!team || !player || !key) continue;
    const outs = byTeam.get(key) ?? [];
    outs.push({ team, player, injury: nullableText(row.injury), returnDate: nullableText(row.return_date) });
    byTeam.set(key, outs);
  }
  return Object.fromEntries(byTeam);
}

function getTodayInBrisbane() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const supabaseUrl = requireAnyEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseNrl = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "nrl" } });
  const supabasePublic = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "public" } });
  const supabaseSummary = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "summary" } });
  const supabaseShortside = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "shortside" } });
  const currentYear = currentYearInBrisbane();

  const [
    fantasyPlayers,
    coachPlayersById,
    playerStats2026,
    lineups,
    ownershipBaselineById,
    originChanceNames,
    drawRows,
    playerImages,
    teamLogos,
    casualtyRows,
    projectionSigmas,
    playerTryHistoryRows,
  ] = await Promise.all([
    fetchFantasyPlayers(),
    fetchCoachPlayers(),
    fetchPlayerStats2026(supabaseNrl),
    fetchLineupProjectionSnapshot(supabaseNrl),
    fetchOwnershipBaseline(supabaseShortside),
    fetchOriginChanceNames(supabaseNrl),
    loadDrawRows(),
    fetchPlayerImages(supabaseNrl).catch((error) => {
      console.warn("Unable to fetch player images for page summary.", error);
      return [];
    }),
    fetchTeamLogos(supabaseNrl).catch((error) => {
      console.warn("Unable to fetch team logos for page summary.", error);
      return new Map();
    }),
    fetchCasualtyWardRows(supabaseNrl).catch((error) => {
      console.warn("Unable to fetch casualty ward rows for page summary.", error);
      return [];
    }),
    fetchProjectionSigmas(supabaseNrl).catch((error) => {
      console.warn("Unable to fetch projection sigmas for page summary.", error);
      return [];
    }),
    fetchLineupPlayerTryHistoryRows(supabaseNrl, currentYear).catch((error) => {
      console.warn("Unable to fetch player try history summary rows.", error);
      return [];
    }),
  ]);

  const statsByName = buildStatsByName(playerStats2026);
  const namedLineupPlayers = new Set(lineups.roleByPlayerName.keys());
  const cardRows = [];
  const pageRows = [];
  const tryHistoryRows = buildLineupPlayerTryHistorySummary(playerTryHistoryRows);
  const playerTryHistory = buildLineupPlayerTryHistoryObject(playerTryHistoryRows);
  const lineupsRoundOptions = await fetchLineupRoundOptionsSummary(supabaseNrl, currentYear).catch((error) => {
    console.warn("Unable to fetch lineups round options for page summary.", error);
    return [];
  });
  const draw2026Rows = currentYear === 2026 ? await loadDraw2026Rows().catch((error) => {
    console.warn("Unable to load 2026 draw for lineups page summary.", error);
    return [];
  }) : [];
  const lineupsRound = currentRoundOption(lineupsRoundOptions, lineups.round);
  const today = getTodayInBrisbane();
  const lineupsPageSummaryRow = lineupsRound ? await Promise.all([
    fetchLineupMatchesSummary(supabaseNrl, lineupsRound.value, currentYear).catch((error) => {
      console.warn("Unable to fetch lineups matches for page summary.", error);
      return [];
    }),
    fetchFixtureMatchesSummary(supabaseNrl, lineupsRound.value, currentYear, draw2026Rows).catch((error) => {
      console.warn("Unable to fetch fixture matches for lineups page summary.", error);
      return [];
    }),
    fetchRecentMatchResultsSummary(supabaseNrl, currentYear).catch((error) => {
      console.warn("Unable to fetch recent results for lineups page summary.", error);
      return [];
    }),
    fetchLineupsSummaryTeamLogos(supabaseNrl).catch(() => ({})),
    fetchLineupsSummaryTryscorerOdds(supabasePublic, today).catch(() => ({})),
    fetchLineupsSummarySportsbetOdds(supabasePublic, today).catch(() => ({})),
    fetchLineupsSummaryCasualtyOuts(supabaseNrl).catch(() => ({})),
  ]).then(([lineupMatches, fixtureMatches, recentResults, lineupsTeamLogos, tryscorerOdds, sportsbetOdds, casualtyWardOuts]) => {
    const matches = mergeFixtureAndLineupMatches(fixtureMatches, lineupMatches).map((match) => addRecentResults(match, recentResults));
    return matches.length === 0 ? null : {
    year: currentYear,
    round: lineupsRound.value,
    round_options: lineupsRoundOptions,
    matches,
    match_stats: {},
    team_logos: lineupsTeamLogos,
    tryscorer_odds: tryscorerOdds,
    sportsbet_odds: sportsbetOdds,
    casualty_ward_outs: casualtyWardOuts,
    player_averages: buildLineupsPlayerAverages(playerStats2026),
    position_ppm_baselines: buildLineupsPositionPpmBaselines(playerStats2026),
    player_try_history: playerTryHistory,
    updated_at: new Date().toISOString(),
    };
  }) : null;
  for (const player of fantasyPlayers) {
    const localRows = findLocalRows(player.name, statsByName);
    const latestRows = [...localRows].sort((a, b) => b.matchDate.localeCompare(a.matchDate) || b.round - a.round);
    const fantasyScores = localRows.map((row) => row.fantasy);
    const minutes = localRows.map((row) => row.minutes);
    const totalFantasy = fantasyScores.reduce((sum, value) => sum + (value ?? 0), 0);
    const totalMinutes = minutes.reduce((sum, value) => sum + (value ?? 0), 0);
    const last3 =
      average(latestRows.slice(0, 3).map((row) => row.fantasy)) ??
      average(lastFantasyScoresFromHistory(player.scoreHistory, 3));
    const nameKey = normaliseProjectionPlayerName(player.name);
    const coach = coachPlayersById.get(player.id);
    const role = lineups.roleByPlayerId.get(player.id) ?? lineups.roleByPlayerName.get(nameKey) ?? null;
    const lineupProjection =
      lineups.projectionByPlayerId.get(player.id) ??
      lineups.projectionByPlayerName.get(nameKey) ??
      null;
    const isNamedInCurrentLineups =
      lineups.roleByPlayerId.has(player.id) ||
      lineups.roleByPlayerName.has(nameKey);
    const projection = lineups.source === "lineups"
      ? isNamedInCurrentLineups
        ? lineupProjection ?? 0
        : null
      : lineupProjection ??
        coach?.projection ??
        player.projectedAvg ??
        player.avgPoints ??
        null;
    const breakeven = coach?.breakeven ?? player.be ?? null;
    const weeklyChange =
      player.ownedBy == null || ownershipBaselineById.get(player.id) == null
        ? null
        : player.ownedBy - ownershipBaselineById.get(player.id);
    const projectionTeam = role?.team ?? primaryTeam(localRows);
    const effectivePosition = role?.position ?? latestPosition(localRows) ?? player.positionLabel;
    const nextMajorByeRound = getNextMajorByeRound(lineups.round);
    const playsNextMajorBye = teamPlaysInRound(drawRows, nextMajorByeRound, projectionTeam);
    const projectionBand = resolveProjectionBand(projection, effectivePosition, projectionSigmas);
    const playerImage = resolvePlayerImage(player.name, localRows[0]?.player ?? null, projectionTeam, playerImages);
    const playerCasualtyRows = casualtyRows
      .filter((row) => normaliseProjectionPlayerName(row.player) === nameKey)
      .slice(0, 5)
      .map(formatCasualtyRow);
    const relevantOuts =
      role?.isOnField && role.team && role.position
        ? casualtyRows
          .filter((row) =>
            normaliseProjectionPlayerName(row.player) !== nameKey &&
            !namedLineupPlayers.has(normaliseProjectionPlayerName(row.player)) &&
            teamGroup(row.team) === teamGroup(role.team) &&
            positionGroup(row.position) === positionGroup(role.position)
          )
          .sort((a, b) => (b.averageFantasy ?? -Infinity) - (a.averageFantasy ?? -Infinity))
          .slice(0, 8)
          .map(formatCasualtyRow)
        : [];
    const updatedAt = new Date().toISOString();

    cardRows.push({
      player_id: player.id,
      player: player.name,
      local_name: localRows[0]?.player ?? null,
      team: projectionTeam,
      position: effectivePosition,
      weekly_change: weeklyChange,
      priced_at: player.pricedAt,
      avg_2026: average(fantasyScores) ?? player.avgPoints,
      last3,
      ppm: totalMinutes > 0
        ? totalFantasy / totalMinutes
        : player.tog != null && player.tog > 0 && player.totalPoints != null
          ? player.totalPoints / player.tog
          : null,
      projection,
      value: projection == null || player.pricedAt == null ? null : Math.round(projection) - Math.round(player.pricedAt),
      breakeven,
      games_played: localRows.length || player.gamesPlayed || 0,
      price: player.cost,
      owned_by: player.ownedBy,
      next_major_bye_round: nextMajorByeRound,
      plays_next_major_bye: playsNextMajorBye,
      origin_chance: originChanceNames.has(nameKey),
      updated_at: updatedAt,
    });

    pageRows.push({
      player_id: player.id,
      player_slug: fantasyPlayerSlug(player.name),
      player: player.name,
      local_name: localRows[0]?.player ?? null,
      team: projectionTeam,
      position: effectivePosition,
      lineup_position: role?.position ?? null,
      lineup_team: role?.team ?? null,
      is_on_field: role?.isOnField ?? null,
      price: player.cost,
      owned_by: player.ownedBy,
      weekly_change: weeklyChange,
      priced_at: player.pricedAt,
      avg_2026: average(fantasyScores) ?? player.avgPoints,
      last3,
      ppm: totalMinutes > 0
        ? totalFantasy / totalMinutes
        : player.tog != null && player.tog > 0 && player.totalPoints != null
          ? player.totalPoints / player.tog
          : null,
      games_played: localRows.length || player.gamesPlayed || 0,
      projection,
      projection_low_5: projectionBand.low,
      projection_high_5: projectionBand.high,
      breakeven,
      projection_round: lineups.round,
      value: projection == null || player.pricedAt == null ? null : Math.round(projection) - Math.round(player.pricedAt),
      next_major_bye_round: nextMajorByeRound,
      plays_next_major_bye: playsNextMajorBye,
      major_bye_tags: majorByeTags(drawRows, nextMajorByeRound, projectionTeam),
      origin_chance: originChanceNames.has(nameKey),
      head_image: normaliseImageUrl(playerImage?.head_image),
      body_image: normaliseImageUrl(playerImage?.body_image),
      team_logo_url: resolveTeamLogo(playerImage?.team ?? projectionTeam, teamLogos),
      casualty_status: playerCasualtyRows,
      relevant_outs: relevantOuts,
      updated_at: updatedAt,
    });
  }

  for (let start = 0; start < cardRows.length; start += 500) {
    const chunk = cardRows.slice(start, start + 500);
    const { error } = await supabaseSummary
      .from("fantasy_player_card_summary")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) throw new Error(`Upsert fantasy_player_card_summary failed: ${error.message}`);
  }

  for (let start = 0; start < pageRows.length; start += 500) {
    const chunk = pageRows.slice(start, start + 500);
    const { error } = await supabaseSummary
      .from("fantasy_player_page_summary")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) throw new Error(`Upsert fantasy_player_page_summary failed: ${error.message}`);
  }

  for (let start = 0; start < tryHistoryRows.length; start += 500) {
    const chunk = tryHistoryRows.slice(start, start + 500);
    const { error } = await supabaseSummary
      .from("lineup_player_try_history_summary")
      .upsert(chunk, { onConflict: "player_key" });
    if (error) throw new Error(`Upsert lineup_player_try_history_summary failed: ${error.message}`);
  }

  if (lineupsPageSummaryRow) {
    const { error } = await supabaseSummary
      .from("lineups_page_summary")
      .upsert(lineupsPageSummaryRow, { onConflict: "year,round" });
    if (error) throw new Error(`Upsert lineups_page_summary failed: ${error.message}`);
  }

  console.log(`Rebuilt summary.fantasy_player_card_summary with ${cardRows.length} rows.`);
  console.log(`Rebuilt summary.fantasy_player_page_summary with ${pageRows.length} rows.`);
  console.log(`Rebuilt summary.lineup_player_try_history_summary with ${tryHistoryRows.length} rows.`);
  console.log(`Rebuilt summary.lineups_page_summary with ${lineupsPageSummaryRow ? 1 : 0} rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

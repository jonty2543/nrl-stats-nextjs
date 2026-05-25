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
    "player,team,position,match_date,round,total_points,mins_played",
    (query) => query.gte("match_date", "2026-01-01").lt("match_date", "2027-01-01")
  );
  return rows
    .map((row) => ({
      player: typeof row.player === "string" ? row.player.trim() : "",
      team: typeof row.team === "string" ? row.team.trim() : null,
      position: typeof row.position === "string" ? row.position.trim() : null,
      matchDate: typeof row.match_date === "string" ? row.match_date : "",
      round: Number.parseInt(String(row.round ?? "").match(/\d+/)?.[0] ?? "0", 10),
      fantasy: toNum(row.total_points),
      minutes: minutesToNumber(row.mins_played),
    }))
    .filter((row) => row.player && row.fantasy != null && (row.minutes ?? 0) > 0);
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

  const snapshot = { ...empty, round: parseRoundNumber(roundLabel) };
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

  const snapshot = { ...empty, round: parseRoundNumber(rows[0]?.round) };
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

async function main() {
  const supabaseUrl = requireAnyEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseNrl = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "nrl" } });
  const supabaseShortside = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "shortside" } });

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
  ]);

  const statsByName = buildStatsByName(playerStats2026);
  const namedLineupPlayers = new Set(lineups.roleByPlayerName.keys());
  const cardRows = [];
  const pageRows = [];
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
    const projection =
      lineups.projectionByPlayerId.get(player.id) ??
      lineups.projectionByPlayerName.get(nameKey) ??
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
    const { error } = await supabaseNrl
      .from("fantasy_player_card_summary")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) throw new Error(`Upsert fantasy_player_card_summary failed: ${error.message}`);
  }

  for (let start = 0; start < pageRows.length; start += 500) {
    const chunk = pageRows.slice(start, start + 500);
    const { error } = await supabaseNrl
      .from("fantasy_player_page_summary")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) throw new Error(`Upsert fantasy_player_page_summary failed: ${error.message}`);
  }

  console.log(`Rebuilt nrl.fantasy_player_card_summary with ${cardRows.length} rows.`);
  console.log(`Rebuilt nrl.fantasy_player_page_summary with ${pageRows.length} rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

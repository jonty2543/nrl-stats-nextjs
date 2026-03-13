import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";

type BetMarket = "H2H" | "Line" | "Total";
type BetStatus = "pending" | "won" | "lost" | "push";

interface UserBetRow {
  id: string;
  clerk_user_id: string;
  market: BetMarket;
  match_date: string;
  match_name: string;
  selection: string;
  line_value: number | null;
  odds: number;
  stake: number;
  model_prob: number | null;
  implied_prob: number | null;
  edge_pp: number | null;
  status: BetStatus;
  profit: number | null;
  placed_at: string;
  settled_at: string | null;
}

interface MatchResult {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normaliseTeam(value: string): string {
  return value
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lastWord(value: string): string {
  const parts = normaliseTeam(value).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function teamMatches(selection: string, team: string): boolean {
  const fullSelection = normaliseTeam(selection);
  const fullTeam = normaliseTeam(team);
  if (fullSelection && fullSelection === fullTeam) return true;
  return lastWord(selection) !== "" && lastWord(selection) === lastWord(team);
}

function parseMatchTeams(match: string): { home: string; away: string } | null {
  const parts = match
    .split(/\s+(?:v(?:s)?|-)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;
  return { home: parts[0], away: parts.slice(1).join(" ") };
}

function canonicalMatchKey(home: string, away: string): string {
  const a = normaliseTeam(home);
  const b = normaliseTeam(away);
  return [a, b].sort().join("|");
}

function mapRowToResponse(row: UserBetRow) {
  return {
    id: row.id,
    market: row.market,
    matchDate: row.match_date,
    matchName: row.match_name,
    selection: row.selection,
    lineValue: row.line_value,
    odds: row.odds,
    stake: row.stake,
    modelProb: row.model_prob,
    impliedProb: row.implied_prob,
    edgePp: row.edge_pp,
    status: row.status,
    profit: row.profit,
    placedAt: row.placed_at,
    settledAt: row.settled_at,
  };
}

function settleBet(row: UserBetRow, result: MatchResult, nowIso: string): Pick<UserBetRow, "status" | "profit" | "settled_at"> {
  const selection = row.selection;
  const lineValue = row.line_value;
  const totalPoints = result.homeScore + result.awayScore;
  let status: BetStatus = "pending";

  if (row.market === "H2H") {
    if (result.homeScore === result.awayScore) {
      status = "push";
    } else if (teamMatches(selection, result.home)) {
      status = result.homeScore > result.awayScore ? "won" : "lost";
    } else if (teamMatches(selection, result.away)) {
      status = result.awayScore > result.homeScore ? "won" : "lost";
    }
  } else if (row.market === "Line" && lineValue != null) {
    let adjustedMargin: number | null = null;
    if (teamMatches(selection, result.home)) {
      adjustedMargin = (result.homeScore - result.awayScore) + lineValue;
    } else if (teamMatches(selection, result.away)) {
      adjustedMargin = (result.awayScore - result.homeScore) + lineValue;
    }

    if (adjustedMargin != null) {
      if (adjustedMargin > 0) status = "won";
      else if (adjustedMargin < 0) status = "lost";
      else status = "push";
    }
  } else if (row.market === "Total" && lineValue != null) {
    const normalizedSelection = normaliseTeam(selection);
    const isOver = normalizedSelection.includes("over");
    const isUnder = normalizedSelection.includes("under");
    if (isOver) {
      if (totalPoints > lineValue) status = "won";
      else if (totalPoints < lineValue) status = "lost";
      else status = "push";
    } else if (isUnder) {
      if (totalPoints < lineValue) status = "won";
      else if (totalPoints > lineValue) status = "lost";
      else status = "push";
    }
  }

  if (status === "pending") {
    return {
      status: row.status,
      profit: row.profit,
      settled_at: row.settled_at,
    };
  }

  const stake = Number.isFinite(row.stake) ? row.stake : 0;
  const odds = Number.isFinite(row.odds) ? row.odds : 0;
  const profit = status === "won"
    ? Number((stake * Math.max(0, odds - 1)).toFixed(2))
    : status === "lost"
      ? Number((-stake).toFixed(2))
      : 0;

  return {
    status,
    profit,
    settled_at: nowIso,
  };
}

async function buildMatchResultMap(dates: string[]): Promise<Map<string, MatchResult>> {
  if (dates.length === 0) return new Map<string, MatchResult>();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("matches")
    .select("match_date,team,opponent_team,is_home,score,opponent_score")
    .in("match_date", dates);

  if (error) {
    throw new Error(`Failed to fetch match results: ${error.message}`);
  }

  const out = new Map<string, MatchResult>();
  for (const raw of data ?? []) {
    const isHome = raw.is_home === 1 || raw.is_home === true;
    if (!isHome) continue;

    const date = String(raw.match_date ?? "");
    const home = String(raw.team ?? "").replace(/-/g, " ").trim();
    const away = String(raw.opponent_team ?? "").replace(/-/g, " ").trim();
    const homeScore = toFinite(raw.score);
    const awayScore = toFinite(raw.opponent_score);
    if (!date || !home || !away || homeScore == null || awayScore == null) continue;

    const key = `${date}|${canonicalMatchKey(home, away)}`;
    out.set(key, { date, home, away, homeScore, awayScore });
  }

  return out;
}

async function settlePendingBets(rows: UserBetRow[], userId: string): Promise<UserBetRow[]> {
  const pendingRows = rows.filter((row) => row.status === "pending");
  if (pendingRows.length === 0) return rows;

  const dates = Array.from(new Set(pendingRows.map((row) => row.match_date).filter(Boolean)));
  const resultMap = await buildMatchResultMap(dates);
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const updates: Array<{ id: string; status: BetStatus; profit: number; settled_at: string }> = [];

  for (const row of pendingRows) {
    const teams = parseMatchTeams(row.match_name);
    if (!teams) continue;
    const key = `${row.match_date}|${canonicalMatchKey(teams.home, teams.away)}`;
    const result = resultMap.get(key);
    if (!result) continue;

    // Avoid settling clearly future fixtures with placeholder 0-0 scores.
    if (result.homeScore === 0 && result.awayScore === 0 && row.match_date >= today) {
      continue;
    }

    const settled = settleBet(row, result, nowIso);
    if (settled.status === "pending" || settled.profit == null || !settled.settled_at) continue;

    updates.push({
      id: row.id,
      status: settled.status,
      profit: settled.profit,
      settled_at: settled.settled_at,
    });
  }

  if (updates.length === 0) return rows;

  const supabase = createServerSupabaseClient();
  const updateById = new Map(updates.map((update) => [update.id, update]));

  await Promise.all(
    updates.map(async (update) => {
      const { error } = await supabase
        .schema("shortside")
        .from("user_bets")
        .update({
          status: update.status,
          profit: update.profit,
          settled_at: update.settled_at,
        })
        .eq("id", update.id)
        .eq("clerk_user_id", userId);

      if (error) {
        throw new Error(`Failed to settle bet ${update.id}: ${error.message}`);
      }
    })
  );

  return rows.map((row) => {
    const update = updateById.get(row.id);
    if (!update) return row;
    return {
      ...row,
      status: update.status,
      profit: update.profit,
      settled_at: update.settled_at,
    };
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .schema("shortside")
      .from("user_bets")
      .select("id, clerk_user_id, market, match_date, match_name, selection, line_value, odds, stake, model_prob, implied_prob, edge_pp, status, profit, placed_at, settled_at")
      .eq("clerk_user_id", userId)
      .order("placed_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch bets", details: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as UserBetRow[];
    const settledRows = await settlePendingBets(rows, userId);
    return NextResponse.json({ bets: settledRows.map(mapRowToResponse) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch bets", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isJsonObject(body)) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const market = body.market;
  const matchDate = body.matchDate;
  const matchName = body.matchName;
  const selection = body.selection;
  const lineValue = body.lineValue;
  const odds = body.odds;
  const stake = body.stake;
  const modelProb = body.modelProb;
  const impliedProb = body.impliedProb;
  const edgePp = body.edgePp;

  if (market !== "H2H" && market !== "Line" && market !== "Total") {
    return NextResponse.json({ error: "market must be H2H, Line, or Total" }, { status: 400 });
  }
  if (typeof matchDate !== "string" || matchDate.trim().length === 0) {
    return NextResponse.json({ error: "matchDate is required" }, { status: 400 });
  }
  if (typeof matchName !== "string" || matchName.trim().length === 0) {
    return NextResponse.json({ error: "matchName is required" }, { status: 400 });
  }
  if (typeof selection !== "string" || selection.trim().length === 0) {
    return NextResponse.json({ error: "selection is required" }, { status: 400 });
  }

  const parsedOdds = toFinite(odds);
  const parsedStake = toFinite(stake);
  if (parsedOdds == null || parsedOdds <= 1) {
    return NextResponse.json({ error: "odds must be > 1" }, { status: 400 });
  }
  if (parsedStake == null || parsedStake <= 0) {
    return NextResponse.json({ error: "stake must be > 0" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("user_bets")
    .insert({
      clerk_user_id: userId,
      market,
      match_date: matchDate,
      match_name: matchName,
      selection,
      line_value: toFinite(lineValue),
      odds: parsedOdds,
      stake: parsedStake,
      model_prob: toFinite(modelProb),
      implied_prob: toFinite(impliedProb),
      edge_pp: toFinite(edgePp),
      status: "pending",
      profit: null,
      placed_at: new Date().toISOString(),
      settled_at: null,
    })
    .select("id, clerk_user_id, market, match_date, match_name, selection, line_value, odds, stake, model_prob, implied_prob, edge_pp, status, profit, placed_at, settled_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save bet", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ bet: mapRowToResponse(data as UserBetRow) });
}

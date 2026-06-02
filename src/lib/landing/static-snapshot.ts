import type { Article } from "@/lib/articles"
import type { BettingOddsRow, BettingOddsSnapshot } from "@/lib/betting/types"
import type { Draw2026Data } from "@/lib/draw/types"
import type {
  FantasyCoachPlayerSnapshot,
  FantasyPlayerSnapshot,
  LineupsPlayerRole,
  LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import type { LineupMatch, LineupPlayer, LineupTryscorerOdds } from "@/lib/lineups/nrl-lineups"
import type { PlayerImageRecord } from "@/lib/supabase/queries"

type LandingLineupsProjectionData = Omit<
  LineupsProjectionSnapshot,
  "projectionByPlayerId" | "projectionByPlayerName" | "roleByPlayerId" | "roleByPlayerName"
> & {
  projectionByPlayerId: Array<[number, number]>
  projectionByPlayerName: Array<[string, number]>
  roleByPlayerId: Array<[number, LineupsPlayerRole]>
  roleByPlayerName: Array<[string, LineupsPlayerRole]>
}

interface LandingStaticSnapshotData {
  fantasyPlayers: FantasyPlayerSnapshot[]
  fantasyCoachPlayers: FantasyCoachPlayerSnapshot[]
  lineupsProjections: LandingLineupsProjectionData
  availableYears: string[]
  bettingSnapshot: BettingOddsSnapshot
  playerImages: PlayerImageRecord[]
  approvedArticles: Article[]
  teamLogos: Record<string, string>
  draw2026Data: Draw2026Data
  lineups: LineupMatch[]
  tryscorerOdds: Record<string, LineupTryscorerOdds>
}

export interface LandingStaticSnapshot extends Omit<LandingStaticSnapshotData, "lineupsProjections"> {
  lineupsProjections: LineupsProjectionSnapshot
}

const SNAPSHOT_GENERATED_AT = "2026-05-29T00:00:00+10:00"

function fantasyPlayer(
  values: Pick<FantasyPlayerSnapshot, "id" | "firstName" | "lastName" | "name" | "positionLabel"> &
    Partial<FantasyPlayerSnapshot>,
): FantasyPlayerSnapshot {
  const cost = values.cost ?? null
  return {
    squadId: null,
    cost,
    status: null,
    positions: [],
    positionLabels: [values.positionLabel],
    ownedBy: null,
    selections: null,
    avgPoints: null,
    projectedAvg: null,
    gamesPlayed: null,
    totalPoints: null,
    tog: null,
    be: null,
    pricedAt: cost != null ? cost / 12725 : null,
    isBye: false,
    locked: false,
    priceHistory: {},
    scoreHistory: {},
    ...values,
  }
}

function coachPlayer(id: number, projection: number, breakEven: number): FantasyCoachPlayerSnapshot {
  return {
    id,
    projectedScore: projection,
    projectedScores: { "13": projection },
    breakEven,
    breakEvens: { "13": breakEven },
  }
}

function oddsRow(values: Partial<BettingOddsRow> & Pick<BettingOddsRow, "date" | "match" | "result">): BettingOddsRow {
  return {
    table: "NRL Odds",
    market: "H2H",
    value: 1,
    model: null,
    bestBookie: null,
    bestPrice: null,
    marketPercentage: null,
    Sportsbet: null,
    Pointsbet: null,
    Unibet: null,
    Palmerbet: null,
    Betright: null,
    Betr: null,
    ...values,
  }
}

function lineupPlayer(values: Partial<LineupPlayer> & Pick<LineupPlayer, "team" | "teamName" | "teamType" | "number" | "position" | "player">): LineupPlayer {
  return {
    matchId: "landing-r13-panthers-warriors",
    teamId: null,
    playerId: null,
    isCaptain: false,
    isOnField: true,
    headImage: null,
    bodyImage: null,
    fantasyProjection: null,
    side: "unknown",
    sideSource: "unknown",
    ...values,
  }
}

function nrlPlayerImage(sourceUrl: string): string {
  return `https://www.nrl.com/remote.axd?${encodeURIComponent(sourceUrl)}&preset=player-profile-large`
}

const PLAYER_IMAGES = {
  dylanEdwards: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Dylan Edwards _260123_Panthers_MK2086.png?center=0.5,0.5"),
  thomasJenkins: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Tom Jenkins _260123_Panthers_MK004.png?center=0.5,0.5"),
  izackTago: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Izack Tago _260123_Panthers_MK1983.png?center=0.5,0.5"),
  lukeGarner: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Luke Garner _260123_Panthers_MK1889.png?center=0.5,0.5"),
  paulAlamoti: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Paul Alamoti _260123_Panthers_MK1222.png?center=0.5,0.5"),
  blaizeTalagi: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Blaize Talagi _260123_Panthers_MK1291.png?center=0.5,0.5"),
  mosesLeota: nrlPlayerImage("https://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500014/Moses Leota _260123_Panthers_MK2424.png?center=0.5,0.5"),
  taineTuaupiki: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Taine Tuaupiki-003.png?center=0.5,0.5"),
  dallinWateneZelezniak: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Dallin Watene-Zelezniak-003.png?center=0.5,0.5"),
  aliLeiataua: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Ali Leiataua-003.png?center=0.5,0.5"),
  adamPompey: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Adam Pompey-004.png?center=0.5,0.5"),
  alofianaKhanPereira: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Alofiana Khan-Pereira-003.png?center=0.5,0.5"),
  chanelHarrisTavita: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Chanel Harris-Tavita_003.png?center=0.5,0.5"),
  teMaireMartin: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/Te Maire Martin-004.png?center=0.5,0.5"),
  jamesFisherHarris: nrlPlayerImage("http://rugbyimages.statsperform.com/Player Bodyshots/111/2026/500032/James Fisher-Harris-003.png?center=0.5,0.5"),
} as const

const STATIC_DATA: LandingStaticSnapshotData = {
  fantasyPlayers: [
    fantasyPlayer({ id: 1, firstName: "Nathan", lastName: "Cleary", name: "Nathan Cleary", positionLabel: "HLF", cost: 987000, ownedBy: 28.4, selections: 104200, avgPoints: 71.2, projectedAvg: 74.1, gamesPlayed: 9, totalPoints: 641, be: 82 }),
    fantasyPlayer({ id: 2, firstName: "Nicholas", lastName: "Hynes", name: "Nicholas Hynes", positionLabel: "HLF", cost: 948000, ownedBy: 21.7, selections: 79800, avgPoints: 68.5, projectedAvg: 70.8, gamesPlayed: 10, totalPoints: 685, be: 77 }),
    fantasyPlayer({ id: 3, firstName: "Payne", lastName: "Haas", name: "Payne Haas", positionLabel: "MID", cost: 901000, ownedBy: 34.8, selections: 127500, avgPoints: 66.3, projectedAvg: 67.5, gamesPlayed: 10, totalPoints: 663, be: 69 }),
    fantasyPlayer({ id: 4, firstName: "Harry", lastName: "Grant", name: "Harry Grant", positionLabel: "HOK", cost: 872000, ownedBy: 31.1, selections: 114000, avgPoints: 64.8, projectedAvg: 65.2, gamesPlayed: 10, totalPoints: 648, be: 61 }),
    fantasyPlayer({ id: 5, firstName: "Dylan", lastName: "Edwards", name: "Dylan Edwards", positionLabel: "WFB", cost: 759000, ownedBy: 19.5, selections: 71600, avgPoints: 58.2, projectedAvg: 60.1, gamesPlayed: 10, totalPoints: 582, be: 54 }),
    fantasyPlayer({ id: 6, firstName: "Kalyn", lastName: "Ponga", name: "Kalyn Ponga", positionLabel: "WFB", cost: 744000, ownedBy: 25.2, selections: 92300, avgPoints: 57.7, projectedAvg: 59.4, gamesPlayed: 9, totalPoints: 519, be: 49 }),
    fantasyPlayer({ id: 7, firstName: "Tom", lastName: "Dearden", name: "Tom Dearden", positionLabel: "HLF", cost: 651000, ownedBy: 12.9, selections: 47300, avgPoints: 52.6, projectedAvg: 55.8, gamesPlayed: 10, totalPoints: 526, be: 38 }),
    fantasyPlayer({ id: 8, firstName: "Isaah", lastName: "Yeo", name: "Isaah Yeo", positionLabel: "MID", cost: 640000, ownedBy: 16.8, selections: 61600, avgPoints: 53.4, projectedAvg: 54.2, gamesPlayed: 10, totalPoints: 534, be: 46 }),
  ],
  fantasyCoachPlayers: [
    coachPlayer(1, 74, 82),
    coachPlayer(2, 71, 77),
    coachPlayer(3, 68, 69),
    coachPlayer(4, 65, 61),
    coachPlayer(5, 60, 54),
    coachPlayer(6, 59, 49),
    coachPlayer(7, 56, 38),
    coachPlayer(8, 54, 46),
  ],
  lineupsProjections: {
    round: 13,
    source: "lineups",
    lineupsAvailable: true,
    projectionByPlayerId: [[1, 76], [2, 70], [3, 69], [4, 66], [5, 62], [6, 59], [7, 57], [8, 55]],
    projectionByPlayerName: [["nathan cleary", 76], ["nicholas hynes", 70], ["payne haas", 69], ["harry grant", 66], ["dylan edwards", 62], ["kalyn ponga", 59], ["tom dearden", 57], ["isaah yeo", 55]],
    roleByPlayerId: [[1, { position: "Halfback", team: "Panthers", number: 7, isOnField: true }]],
    roleByPlayerName: [["nathan cleary", { position: "Halfback", team: "Panthers", number: 7, isOnField: true }]],
  },
  availableYears: ["2026", "2025", "2024"],
  bettingSnapshot: {
    generatedAt: SNAPSHOT_GENERATED_AT,
    h2h: [
      oddsRow({ date: "2026-05-29", match: "Panthers v Eels", result: "Panthers", model: 0.62, bestBookie: "Sportsbet", bestPrice: 1.62, Sportsbet: 1.62, Pointsbet: 1.6, Unibet: 1.61 }),
      oddsRow({ date: "2026-05-29", match: "Panthers v Eels", result: "Eels", model: 0.38, bestBookie: "Pointsbet", bestPrice: 2.35, Sportsbet: 2.28, Pointsbet: 2.35, Unibet: 2.32 }),
      oddsRow({ date: "2026-05-30", match: "Storm v Broncos", result: "Storm", model: 0.58, bestBookie: "Unibet", bestPrice: 1.72, Sportsbet: 1.7, Pointsbet: 1.71, Unibet: 1.72 }),
      oddsRow({ date: "2026-05-30", match: "Storm v Broncos", result: "Broncos", model: 0.42, bestBookie: "Sportsbet", bestPrice: 2.14, Sportsbet: 2.14, Pointsbet: 2.1, Unibet: 2.12 }),
    ],
    line: [],
    total: [],
    tryscorer: [],
  },
  playerImages: [
    { player: "Nathan Cleary", team: "Panthers", number: "23", position: "HLF", head_image: null, body_image: "/body-shot.png", last_seen_match_date: "2026-05-31" },
    { player: "Nicholas Hynes", team: "Sharks", number: "7", position: "HLF", head_image: null, body_image: "/body-shot.png", last_seen_match_date: "2026-05-29" },
    { player: "Payne Haas", team: "Broncos", number: "10", position: "MID", head_image: null, body_image: "/body-shot.png", last_seen_match_date: "2026-05-29" },
    { player: "Harry Grant", team: "Storm", number: "9", position: "HOK", head_image: null, body_image: "/body-shot.png", last_seen_match_date: "2026-05-29" },
    { player: "Dylan Edwards", team: "Panthers", number: "1", position: "WFB", head_image: null, body_image: PLAYER_IMAGES.dylanEdwards, last_seen_match_date: "2026-05-31" },
    { player: "Kalyn Ponga", team: "Knights", number: "1", position: "WFB", head_image: null, body_image: "/body-shot.png", last_seen_match_date: "2026-05-29" },
  ],
  approvedArticles: [
    {
      id: "landing-article-1",
      authorId: "static",
      displayName: "Short Side",
      authorImageUrl: null,
      isAnonymous: false,
      title: "Round 13 fantasy roles to watch",
      slug: "round-13-fantasy-roles-to-watch",
      body: "A compact look at the teams, roles, and price points that matter most for the current week.",
      status: "approved",
      imageUrls: [],
      rejectionReason: null,
      createdAt: "2026-05-29T00:00:00+10:00",
      updatedAt: "2026-05-29T00:00:00+10:00",
      approvedAt: "2026-05-29T00:00:00+10:00",
    },
    {
      id: "landing-article-2",
      authorId: "static",
      displayName: "Short Side",
      authorImageUrl: null,
      isAnonymous: false,
      title: "Market watch: best prices and model edges",
      slug: "market-watch-best-prices-and-model-edges",
      body: "This weekly preview tracks matchup prices, model lean, and where prices have moved across books.",
      status: "approved",
      imageUrls: [],
      rejectionReason: null,
      createdAt: "2026-05-29T00:00:00+10:00",
      updatedAt: "2026-05-29T00:00:00+10:00",
      approvedAt: "2026-05-29T00:00:00+10:00",
    },
  ],
  teamLogos: {},
  draw2026Data: {
    teamLogos: {},
    rows: [
      { round: 13, kickoff: "2026-05-31T08:15:00.000Z", matchCentreUrl: "", home: "Panthers", away: "Warriors" },
      { round: 14, kickoff: "2026-06-05T10:00:00.000Z", matchCentreUrl: "", home: "Panthers", away: "Storm" },
      { round: 15, kickoff: "2026-06-12T10:00:00.000Z", matchCentreUrl: "", home: "Broncos", away: "Panthers" },
    ],
  },
  lineups: [
    {
      matchId: "landing-r13-panthers-warriors",
      matchDate: "2026-05-31",
      kickoffUtc: "2026-05-31T08:15:00.000Z",
      round: "Round 13",
      venue: "CommBank Stadium",
      match: "Panthers v Warriors",
      matchUrl: null,
      homeTeam: {
        team: "Panthers",
        teamName: "Panthers",
        teamId: null,
        teamType: "Home",
        players: [
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 1, position: "Fullback", player: "Dylan Edwards", playerId: 5, bodyImage: PLAYER_IMAGES.dylanEdwards, fantasyProjection: 62 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 2, position: "Winger", player: "Thomas Jenkins", bodyImage: PLAYER_IMAGES.thomasJenkins, fantasyProjection: 49 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 3, position: "Centre", player: "Izack Tago", bodyImage: PLAYER_IMAGES.izackTago, fantasyProjection: 42 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 4, position: "Centre", player: "Luke Garner", bodyImage: PLAYER_IMAGES.lukeGarner, fantasyProjection: 37 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 5, position: "Winger", player: "Paul Alamoti", bodyImage: PLAYER_IMAGES.paulAlamoti, fantasyProjection: 38 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 6, position: "Five-eighth", player: "Blaize Talagi", bodyImage: PLAYER_IMAGES.blaizeTalagi, fantasyProjection: 51 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 7, position: "Halfback", player: "Jack Cogger", fantasyProjection: 36 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 8, position: "Prop", player: "Moses Leota", bodyImage: PLAYER_IMAGES.mosesLeota, fantasyProjection: 42 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 14, position: "Interchange", player: "Jack Cole", isOnField: false, fantasyProjection: 25 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 15, position: "Interchange", player: "Scott Sorensen", isOnField: false, fantasyProjection: 36 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 16, position: "Interchange", player: "Billy Phillips", isOnField: false, fantasyProjection: 22 }),
          lineupPlayer({ team: "Panthers", teamName: "Panthers", teamType: "Home", number: 17, position: "Interchange", player: "Luron Patea", isOnField: false, fantasyProjection: 21 }),
        ],
      },
      awayTeam: {
        team: "Warriors",
        teamName: "Warriors",
        teamId: null,
        teamType: "Away",
        players: [
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 1, position: "Fullback", player: "Taine Tuaupiki", bodyImage: PLAYER_IMAGES.taineTuaupiki, fantasyProjection: 47 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 2, position: "Winger", player: "Dallin Watene-Zelezniak", bodyImage: PLAYER_IMAGES.dallinWateneZelezniak, fantasyProjection: 44 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 3, position: "Centre", player: "Ali Leiataua", bodyImage: PLAYER_IMAGES.aliLeiataua, fantasyProjection: 36 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 4, position: "Centre", player: "Adam Pompey", bodyImage: PLAYER_IMAGES.adamPompey, fantasyProjection: 38 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 5, position: "Winger", player: "Alofiana Khan-Pereira", bodyImage: PLAYER_IMAGES.alofianaKhanPereira, fantasyProjection: 41 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 6, position: "Five-eighth", player: "Chanel Harris-Tavita", bodyImage: PLAYER_IMAGES.chanelHarrisTavita, fantasyProjection: 42 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 7, position: "Halfback", player: "Te Maire Martin", bodyImage: PLAYER_IMAGES.teMaireMartin, fantasyProjection: 39 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 8, position: "Prop", player: "James Fisher-Harris", bodyImage: PLAYER_IMAGES.jamesFisherHarris, fantasyProjection: 51, isCaptain: true }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 14, position: "Interchange", player: "Sam Healey", isOnField: false, fantasyProjection: 25 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 15, position: "Interchange", player: "Tanner Stowers-Smith", isOnField: false, fantasyProjection: 30 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 16, position: "Interchange", player: "Demitric Vaimauga", isOnField: false, fantasyProjection: 27 }),
          lineupPlayer({ team: "Warriors", teamName: "Warriors", teamType: "Away", number: 17, position: "Interchange", player: "Marata Niukore", isOnField: false, fantasyProjection: 37 }),
        ],
      },
    },
  ],
  tryscorerOdds: {
    "dylan edwards": { player: "Dylan Edwards", bestBookie: "Sportsbet", bestPrice: 2.45 },
    "thomas jenkins": { player: "Thomas Jenkins", bestBookie: "Unibet", bestPrice: 2.1 },
    "dallin watene zelezniak": { player: "Dallin Watene-Zelezniak", bestBookie: "Pointsbet", bestPrice: 2.25 },
    "alofiana khan pereira": { player: "Alofiana Khan-Pereira", bestBookie: "Sportsbet", bestPrice: 2.35 },
  },
}

export function getLandingStaticSnapshot(): LandingStaticSnapshot {
  return {
    ...STATIC_DATA,
    lineupsProjections: {
      ...STATIC_DATA.lineupsProjections,
      projectionByPlayerId: new Map(STATIC_DATA.lineupsProjections.projectionByPlayerId),
      projectionByPlayerName: new Map(STATIC_DATA.lineupsProjections.projectionByPlayerName),
      roleByPlayerId: new Map(STATIC_DATA.lineupsProjections.roleByPlayerId),
      roleByPlayerName: new Map(STATIC_DATA.lineupsProjections.roleByPlayerName),
    },
  }
}

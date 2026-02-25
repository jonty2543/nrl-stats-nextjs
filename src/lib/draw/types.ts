export interface Draw2026Row {
  round: number
  kickoff: string
  matchCentreUrl: string
  home: string
  away: string
}

export interface Draw2026Data {
  rows: Draw2026Row[]
  teamLogos: Record<string, string>
}


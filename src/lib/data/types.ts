import type { TeamName } from "./constants";

/** A single row from the player_stats table (after rename + transform) */
export interface PlayerStat {
  Name: string;
  Team: TeamName;
  Number: string;
  Position: string;
  Year: string;
  Round: number;
  Round_Label: string;
  Opponent: string | null;
  "Home Team": string | null;
  "Away Team": string | null;

  // Numeric stats
  "Mins Played": number;
  Points: number;
  Tries: number;
  Conversions: number;
  "Conversion Attempts": number;
  "Penalty Goals": number;
  "Goal Conversion Rate": number;
  "1 Point Field Goals": number;
  "2 Point Field Goals": number;
  Fantasy: number;
  "All Runs": number;
  "All Run Metres": number;
  "Kick Return Metres": number;
  "Post Contact Metres": number;
  "Line Breaks": number;
  "Line Break Assists": number;
  "Try Assists": number;
  "Line Engaged Runs": number;
  "Tackle Breaks": number;
  "Hit Ups": number;
  "Play The Ball": number;
  "Average Play The Ball Speed": number;
  "Dummy Half Runs": number;
  "Dummy Half Run Metres": number;
  "One on One Steal": number;
  Offloads: number;
  "Dummy Passes": number;
  Passes: number;
  Receipts: number;
  "Passes To Run Ratio": number;
  "Tackle Efficiency": number;
  "Tackles Made": number;
  "Missed Tackles": number;
  "Ineffective Tackles": number;
  Intercepts: number;
  "Kicks Defused": number;
  Kicks: number;
  "Kicking Metres": number;
  "Forced Drop Outs": number;
  "Bomb Kicks": number;
  Grubbers: number;
  "40/20": number;
  "20/40": number;
  "Cross Field Kicks": number;
  "Kicked Dead": number;
  Errors: number;
  "Handling Errors": number;
  "One on One Lost": number;
  Penalties: number;
  "Ruck Infringements": number;
  "Inside 10 Metres": number;
  "On Report": number;
  "Sin Bins": number;
  "Send Offs": number;
  "Stint One": number;
  "Stint Two": number;

  [key: string]: string | number | null;
}

/** A single match row */
export interface Match {
  Year: string;
  Round: number;
  Round_Label: string;
  Date: string;
  Home: string;
  Home_Score: number;
  Away: string;
  Away_Score: number;
  Venue: string | null;
}

/** Team-aggregated stat row */
export interface TeamStat {
  Team: TeamName;
  Year: string;
  Round: number;
  Round_Label: string;
  Opponent: string | null;

  Points: number;
  Tries: number;
  Conversions: number;
  "Conversion Attempts": number;
  "Penalty Goals": number;
  "1 Point Field Goals": number;
  "2 Point Field Goals": number;
  "All Runs": number;
  "All Run Metres": number;
  "Kick Return Metres": number;
  "Post Contact Metres": number;
  "Line Breaks": number;
  "Line Break Assists": number;
  "Try Assists": number;
  "Line Engaged Runs": number;
  "Tackle Breaks": number;
  "Hit Ups": number;
  "Dummy Half Runs": number;
  "Dummy Half Run Metres": number;
  "One on One Steal": number;
  Offloads: number;
  "Dummy Passes": number;
  Passes: number;
  Receipts: number;
  "Tackles Made": number;
  "Missed Tackles": number;
  "Ineffective Tackles": number;
  Intercepts: number;
  "Kicks Defused": number;
  Kicks: number;
  "Kicking Metres": number;
  "Forced Drop Outs": number;
  "Bomb Kicks": number;
  Grubbers: number;
  "40/20": number;
  "20/40": number;
  "Cross Field Kicks": number;
  "Kicked Dead": number;
  Errors: number;
  "Handling Errors": number;
  "One on One Lost": number;
  Penalties: number;
  "Ruck Infringements": number;
  "Inside 10 Metres": number;
  "On Report": number;
  "Sin Bins": number;
  "Send Offs": number;

  [key: string]: string | number | null;
}

/** Filter state synced to URL params */
export interface FilterState {
  year: string;
  position: string;
  minMinutes: number;
  player1: string;
  player2: string;
  team1: string;
  team2: string;
  stat1: string;
  stat2: string;
  teammate: string;
  withWithout: "with" | "without";
}

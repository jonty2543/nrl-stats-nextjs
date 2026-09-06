create schema if not exists nrl;

create index if not exists state_cup_player_stats_competition_season_round_match_idx
  on nrl.state_cup_player_stats (competition_id, season, round, match_date, kickoff_utc, match_id, team_type, number);

create index if not exists state_cup_player_stats_competition_season_home_fullback_idx
  on nrl.state_cup_player_stats (competition_id, season, match_date, round)
  where team_type = 'Home' and number = 1;

create index if not exists state_cup_matches_competition_season_round_match_idx
  on nrl.state_cup_matches (competition_id, season, round, match_date, kickoff_utc, match_id);

create index if not exists state_cup_matches_competition_season_result_idx
  on nrl.state_cup_matches (competition_id, season, match_date)
  where home_score is not null and away_score is not null;

-- summary schema: precomputed fantasy dashboard player-card values
-- Run in Supabase SQL editor, then populate from the fantasy/player-stats pipeline.

create schema if not exists summary;

create table if not exists summary.fantasy_player_card_summary (
  player_id integer primary key,
  player text not null,
  local_name text,
  team text,
  position text,
  weekly_change numeric,
  priced_at numeric,
  avg_2026 numeric,
  last3 numeric,
  ppm numeric,
  projection numeric,
  value numeric,
  breakeven numeric,
  games_played integer,
  price integer,
  owned_by numeric,
  next_major_bye_round integer,
  plays_next_major_bye boolean,
  origin_chance boolean,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists fantasy_player_card_summary_player_idx
  on summary.fantasy_player_card_summary (player);

create index if not exists fantasy_player_card_summary_position_idx
  on summary.fantasy_player_card_summary (position);

create index if not exists fantasy_player_card_summary_updated_at_idx
  on summary.fantasy_player_card_summary (updated_at desc);

grant usage on schema summary to anon, authenticated, service_role;
grant select on table summary.fantasy_player_card_summary to anon, authenticated;
grant select, insert, update, delete on table summary.fantasy_player_card_summary to service_role;

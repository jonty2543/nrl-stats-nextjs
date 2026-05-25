-- summary schema: wide precomputed fantasy player detail page summary
-- Run in Supabase SQL editor. Updated by scripts/rebuild-fantasy-player-card-summary.mjs.

create schema if not exists summary;

create table if not exists summary.fantasy_player_page_summary (
  player_id integer primary key,
  player_slug text unique not null,
  player text not null,
  local_name text,
  team text,
  position text,
  lineup_position text,
  lineup_team text,
  is_on_field boolean,

  price integer,
  owned_by numeric,
  weekly_change numeric,
  priced_at numeric,
  avg_2026 numeric,
  last3 numeric,
  ppm numeric,
  games_played integer,

  projection numeric,
  projection_low_5 numeric,
  projection_high_5 numeric,
  breakeven numeric,
  projection_round integer,
  value numeric,

  next_major_bye_round integer,
  plays_next_major_bye boolean,
  major_bye_tags jsonb not null default '[]'::jsonb,

  origin_chance boolean not null default false,

  head_image text,
  body_image text,
  team_logo_url text,

  casualty_status jsonb not null default '[]'::jsonb,
  relevant_outs jsonb not null default '[]'::jsonb,

  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists fantasy_player_page_summary_player_idx
  on summary.fantasy_player_page_summary (player);

create index if not exists fantasy_player_page_summary_team_idx
  on summary.fantasy_player_page_summary (team);

create index if not exists fantasy_player_page_summary_updated_at_idx
  on summary.fantasy_player_page_summary (updated_at desc);

grant usage on schema summary to anon, authenticated, service_role;
grant select on table summary.fantasy_player_page_summary to anon, authenticated;
grant select, insert, update, delete on table summary.fantasy_player_page_summary to service_role;

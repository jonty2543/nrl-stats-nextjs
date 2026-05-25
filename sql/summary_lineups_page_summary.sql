-- summary schema: precomputed non-live data for the lineups page
-- One row per season year + round. Live match data can still be fetched separately.

create schema if not exists summary;

create table if not exists summary.lineups_page_summary (
  year integer not null,
  round text not null,

  round_options jsonb not null default '[]'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  match_stats jsonb not null default '{}'::jsonb,

  team_logos jsonb not null default '{}'::jsonb,
  tryscorer_odds jsonb not null default '{}'::jsonb,
  sportsbet_odds jsonb not null default '{}'::jsonb,
  casualty_ward_outs jsonb not null default '{}'::jsonb,

  player_averages jsonb not null default '{}'::jsonb,
  position_ppm_baselines jsonb not null default '{}'::jsonb,
  player_try_history jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default timezone('utc', now()),

  primary key (year, round)
);

create index if not exists lineups_page_summary_updated_at_idx
  on summary.lineups_page_summary (updated_at desc);

grant usage on schema summary to anon, authenticated, service_role;
grant select on table summary.lineups_page_summary to anon, authenticated;
grant select, insert, update, delete on table summary.lineups_page_summary to service_role;

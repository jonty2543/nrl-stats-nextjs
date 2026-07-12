-- summary schema: precomputed non-live data for the betting page

create schema if not exists summary;

create table if not exists summary.betting_page_summary (
  id text primary key default 'current',
  year integer,

  games jsonb not null default '[]'::jsonb,
  team_logos jsonb not null default '{}'::jsonb,
  player_teams_by_name jsonb not null default '{}'::jsonb,
  tryscorer_form_by_player jsonb not null default '{}'::jsonb,
  tryscorer_last_five_vs_opponent_by_match jsonb not null default '{}'::jsonb,
  tryscorer_kickoffs_by_match jsonb not null default '{}'::jsonb,
  lineup_players_by_match jsonb not null default '{}'::jsonb,
  team_last_five_by_match jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default timezone('utc', now())
);

alter table summary.betting_page_summary
  add column if not exists team_last_five_by_match jsonb not null default '{}'::jsonb;

create index if not exists betting_page_summary_updated_at_idx
  on summary.betting_page_summary (updated_at desc);

grant usage on schema summary to anon, authenticated, service_role;
revoke select on table summary.betting_page_summary from anon, authenticated;
grant select, insert, update, delete on table summary.betting_page_summary to service_role;

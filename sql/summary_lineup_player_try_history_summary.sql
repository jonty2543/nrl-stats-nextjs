-- summary schema: compact try-scoring history for lineups matchup insights
-- Updated by scripts/rebuild-fantasy-player-card-summary.mjs.

create schema if not exists summary;

create table if not exists summary.lineup_player_try_history_summary (
  player_key text primary key,
  player text not null,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lineup_player_try_history_summary_player_idx
  on summary.lineup_player_try_history_summary (player);

create index if not exists lineup_player_try_history_summary_updated_at_idx
  on summary.lineup_player_try_history_summary (updated_at desc);

grant usage on schema summary to anon, authenticated, service_role;
grant select on table summary.lineup_player_try_history_summary to anon, authenticated;
grant select, insert, update, delete on table summary.lineup_player_try_history_summary to service_role;

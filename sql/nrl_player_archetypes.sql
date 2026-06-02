create schema if not exists nrl;
create extension if not exists pgcrypto;

create table if not exists nrl.player_archetypes (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  year integer not null check (year between 1900 and 2200),
  position text not null,
  source_position text not null,
  archetype text not null,
  cluster_id integer not null,
  games integer not null check (games >= 0),
  minutes numeric,
  total_minutes numeric,
  pc1 numeric,
  pc2 numeric,
  pc3 numeric,
  pc1_name text,
  pc2_name text,
  pc3_name text,
  centroid_distance numeric,
  second_centroid_distance numeric,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  key_stats jsonb not null default '{}'::jsonb,
  key_stat_percentiles jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_archetypes_player_year_position_key unique (player, year, position)
);

create index if not exists player_archetypes_year_position_idx
  on nrl.player_archetypes (year, position);

create index if not exists player_archetypes_archetype_idx
  on nrl.player_archetypes (archetype);

create index if not exists player_archetypes_key_stats_gin_idx
  on nrl.player_archetypes using gin (key_stats);

create index if not exists player_archetypes_key_stat_percentiles_gin_idx
  on nrl.player_archetypes using gin (key_stat_percentiles);

create or replace function nrl.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_player_archetypes_updated_at on nrl.player_archetypes;

create trigger set_player_archetypes_updated_at
before update on nrl.player_archetypes
for each row
execute function nrl.set_updated_at();

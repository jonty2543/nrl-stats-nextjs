-- One-off migration for the unified NRL and State Cup archetype store.
-- Existing rows are preserved as NRL rows for the All period.

begin;

alter table nrl.player_archetypes
  add column if not exists competition text not null default 'nrl';

alter table nrl.player_archetypes
  add column if not exists decade text not null default 'All';

alter table nrl.player_archetypes
  add column if not exists model_version text not null default 'v1';

update nrl.player_archetypes
set
  competition = coalesce(nullif(competition, ''), 'nrl'),
  decade = coalesce(nullif(decade, ''), 'All'),
  model_version = coalesce(nullif(model_version, ''), 'v1');

alter table nrl.player_archetypes
  drop constraint if exists player_archetypes_player_year_position_key;

alter table nrl.player_archetypes
  drop constraint if exists player_archetypes_player_year_position_decade_key;

alter table nrl.player_archetypes
  drop constraint if exists player_archetypes_identity_key;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'nrl'
      and table_name = 'player_archetypes'
      and column_name = 'stat_mode'
  ) then
    execute 'delete from nrl.player_archetypes where stat_mode <> ''production''';
  end if;
end
$$;

alter table nrl.player_archetypes
  drop constraint if exists player_archetypes_stat_mode_check;

alter table nrl.player_archetypes
  drop column if exists stat_mode;

alter table nrl.player_archetypes
  drop constraint if exists player_archetypes_competition_check;

alter table nrl.player_archetypes
  add constraint player_archetypes_competition_check
  check (competition in ('nrl', 'cup'));

alter table nrl.player_archetypes
  add constraint player_archetypes_identity_key
  unique (competition, player, year, position, decade);

drop index if exists nrl.player_archetypes_decade_year_position_idx;

create index player_archetypes_decade_year_position_idx
  on nrl.player_archetypes (competition, decade, year, position);

commit;

select
  competition,
  decade,
  count(*) as archetype_rows
from nrl.player_archetypes
group by competition, decade
order by competition, decade;

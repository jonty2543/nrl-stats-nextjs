-- shortside schema: scheduled fantasy ownership baseline snapshots
-- Run in Supabase SQL editor.

create schema if not exists shortside;

create table if not exists shortside.fantasy_ownership_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text,
  snapshot_week_brisbane date,
  snapshot_data jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table shortside.fantasy_ownership_snapshots
  add column if not exists snapshot_type text;

alter table shortside.fantasy_ownership_snapshots
  add column if not exists snapshot_week_brisbane date;

update shortside.fantasy_ownership_snapshots
set snapshot_type = 'weekly_monday_10am_brisbane'
where snapshot_type is null;

update shortside.fantasy_ownership_snapshots
set snapshot_week_brisbane = (captured_at at time zone 'Australia/Brisbane')::date
where snapshot_week_brisbane is null;

alter table shortside.fantasy_ownership_snapshots
  alter column snapshot_type set not null;

alter table shortside.fantasy_ownership_snapshots
  alter column snapshot_week_brisbane set not null;

with ranked as (
  select
    id,
    row_number() over (
      partition by snapshot_type, snapshot_week_brisbane
      order by captured_at desc, created_at desc, id desc
    ) as rn
  from shortside.fantasy_ownership_snapshots
)
delete from shortside.fantasy_ownership_snapshots t
using ranked r
where t.id = r.id
  and r.rn > 1;

create unique index if not exists fantasy_ownership_snapshots_unique_type_week_idx
  on shortside.fantasy_ownership_snapshots (snapshot_type, snapshot_week_brisbane);

create index if not exists fantasy_ownership_snapshots_type_captured_idx
  on shortside.fantasy_ownership_snapshots (snapshot_type, captured_at desc);

create or replace function shortside.set_updated_at_fantasy_ownership_snapshots()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_fantasy_ownership_snapshots_updated_at
  on shortside.fantasy_ownership_snapshots;
create trigger trg_fantasy_ownership_snapshots_updated_at
before update on shortside.fantasy_ownership_snapshots
for each row
execute procedure shortside.set_updated_at_fantasy_ownership_snapshots();

alter table shortside.fantasy_ownership_snapshots enable row level security;

-- API route uses service_role.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.fantasy_ownership_snapshots to service_role;

alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;

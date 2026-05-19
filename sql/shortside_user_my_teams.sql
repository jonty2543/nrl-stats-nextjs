-- shortside schema: user-scoped fantasy My Team saves
-- Run in Supabase SQL editor.

create table if not exists shortside.user_my_teams (
  clerk_user_id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function shortside.set_updated_at_user_my_teams()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_my_teams_updated_at on shortside.user_my_teams;
create trigger trg_user_my_teams_updated_at
before update on shortside.user_my_teams
for each row
execute procedure shortside.set_updated_at_user_my_teams();

alter table shortside.user_my_teams enable row level security;

-- API route uses service_role.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.user_my_teams to service_role;

alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;

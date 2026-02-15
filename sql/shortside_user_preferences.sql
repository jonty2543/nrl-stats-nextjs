-- shortside schema: user theme preference
-- Run in Supabase SQL editor.

create table if not exists shortside.user_preferences (
  clerk_user_id text primary key,
  theme text not null check (theme in ('dark', 'light')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function shortside.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_preferences_updated_at on shortside.user_preferences;
create trigger trg_user_preferences_updated_at
before update on shortside.user_preferences
for each row
execute procedure shortside.set_updated_at();

alter table shortside.user_preferences enable row level security;

-- Allow API calls using service_role to access this schema/table.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.user_preferences to service_role;

-- Keep future tables usable by service_role without manual grants.
alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;

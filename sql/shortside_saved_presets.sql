-- shortside schema: saved filter presets
-- Run in Supabase SQL editor.

create table if not exists shortside.saved_presets (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  scope text not null check (scope in ('player', 'team')),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint saved_presets_unique_user_scope_name unique (clerk_user_id, scope, name)
);

create index if not exists saved_presets_user_scope_idx
  on shortside.saved_presets (clerk_user_id, scope);

create or replace function shortside.set_updated_at_saved_presets()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_saved_presets_updated_at on shortside.saved_presets;
create trigger trg_saved_presets_updated_at
before update on shortside.saved_presets
for each row
execute procedure shortside.set_updated_at_saved_presets();

alter table shortside.saved_presets enable row level security;

-- API route uses service_role.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.saved_presets to service_role;

alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;


-- shortside schema: fantasy player page comments
-- Run in Supabase SQL editor.

create table if not exists shortside.fantasy_player_comments (
  id uuid primary key default gen_random_uuid(),
  player_id integer not null,
  player_name text not null,
  player_slug text not null,
  clerk_user_id text not null,
  display_name text,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists fantasy_player_comments_player_slug_created_at_idx
  on shortside.fantasy_player_comments (player_slug, created_at desc)
  where deleted_at is null;

create index if not exists fantasy_player_comments_user_idx
  on shortside.fantasy_player_comments (clerk_user_id);

create or replace function shortside.set_updated_at_fantasy_player_comments()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_fantasy_player_comments_updated_at on shortside.fantasy_player_comments;
create trigger trg_fantasy_player_comments_updated_at
before update on shortside.fantasy_player_comments
for each row
execute procedure shortside.set_updated_at_fantasy_player_comments();

alter table shortside.fantasy_player_comments enable row level security;

-- API route uses service_role.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.fantasy_player_comments to service_role;

-- shortside schema: AI chat persistence
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create or replace function shortside.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists shortside.ai_threads (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_at timestamptz not null default timezone('utc', now())
);

create table if not exists shortside.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references shortside.ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_activity jsonb,
  model text,
  usage jsonb,
  choices jsonb,
  artifacts jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_threads_user_last_message
  on shortside.ai_threads (clerk_user_id, last_message_at desc);

create index if not exists idx_ai_messages_thread_created
  on shortside.ai_messages (thread_id, created_at asc);

drop trigger if exists trg_ai_threads_updated_at on shortside.ai_threads;
create trigger trg_ai_threads_updated_at
before update on shortside.ai_threads
for each row
execute procedure shortside.set_updated_at();

alter table shortside.ai_threads enable row level security;
alter table shortside.ai_messages enable row level security;

grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.ai_threads to service_role;
grant select, insert, update, delete on table shortside.ai_messages to service_role;

alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;

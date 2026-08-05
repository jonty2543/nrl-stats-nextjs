-- shortside schema: user bet tracker
-- Run in Supabase SQL editor.

create table if not exists shortside.user_bets (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  bet_type text not null default 'single' check (bet_type in ('single', 'multi', 'sgm')),
  market text not null check (market in ('H2H', 'Line', 'Margin', 'Total', 'Tryscorer')),
  match_date date not null,
  match_name text not null,
  selection text not null,
  line_value numeric(7, 2) null,
  odds numeric(8, 4) not null check (odds > 1),
  stake numeric(12, 2) not null check (stake > 0),
  model_prob numeric(8, 6) null,
  implied_prob numeric(8, 6) null,
  edge_pp numeric(9, 4) null,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'push')),
  profit numeric(12, 2) null,
  placed_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz null,
  legs jsonb not null default '[]'::jsonb check (jsonb_typeof(legs) = 'array'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_bets_user_placed_idx
  on shortside.user_bets (clerk_user_id, placed_at desc);

create index if not exists user_bets_user_match_idx
  on shortside.user_bets (clerk_user_id, match_date, match_name);

alter table shortside.user_bets
add column if not exists bet_type text not null default 'single';

alter table shortside.user_bets
add column if not exists legs jsonb not null default '[]'::jsonb;

alter table shortside.user_bets
drop constraint if exists user_bets_bet_type_check;

alter table shortside.user_bets
add constraint user_bets_bet_type_check
check (bet_type in ('single', 'multi', 'sgm'));

alter table shortside.user_bets
drop constraint if exists user_bets_legs_check;

alter table shortside.user_bets
add constraint user_bets_legs_check
check (jsonb_typeof(legs) = 'array');

alter table shortside.user_bets
drop constraint if exists user_bets_market_check;

alter table shortside.user_bets
add constraint user_bets_market_check
check (market in ('H2H', 'Line', 'Margin', 'Total', 'Tryscorer'));

create or replace function shortside.set_updated_at_user_bets()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_bets_updated_at on shortside.user_bets;
create trigger trg_user_bets_updated_at
before update on shortside.user_bets
for each row
execute procedure shortside.set_updated_at_user_bets();

alter table shortside.user_bets enable row level security;

-- API route uses service_role.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.user_bets to service_role;

alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;

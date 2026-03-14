-- shortside schema: user betting preferences
-- Run in Supabase SQL editor.

create schema if not exists shortside;

create table if not exists shortside.user_betting_preferences (
  clerk_user_id text primary key,
  staking_mode text not null default 'percentage'
    check (staking_mode in ('percentage', 'targetProfit', 'kelly')),
  bankroll numeric(12, 2) not null default 1000 check (bankroll >= 0),
  percentage_stake_pct numeric(6, 3) not null default 2 check (percentage_stake_pct >= 0 and percentage_stake_pct <= 100),
  target_profit_pct numeric(6, 3) not null default 2 check (target_profit_pct >= 0 and target_profit_pct <= 100),
  kelly_scale numeric(6, 4) not null default 0.5 check (kelly_scale >= 0 and kelly_scale <= 1),
  max_edge numeric(8, 6) not null default 0.06 check (max_edge >= 0 and max_edge <= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function shortside.set_updated_at_user_betting_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_betting_preferences_updated_at on shortside.user_betting_preferences;
create trigger trg_user_betting_preferences_updated_at
before update on shortside.user_betting_preferences
for each row
execute procedure shortside.set_updated_at_user_betting_preferences();

alter table shortside.user_betting_preferences enable row level security;

-- API route uses service_role.
grant usage on schema shortside to service_role;
grant select, insert, update, delete on table shortside.user_betting_preferences to service_role;

alter default privileges in schema shortside
grant select, insert, update, delete on tables to service_role;

-- public schema: NRL tryscorer odds
-- Run in Supabase SQL editor.

create table if not exists public."NRL Tryscorers" (
  "Match" text not null,
  "Date" date not null,
  "Result" text not null,
  "Value" double precision not null,
  "Market" text null default 'Tryscorer'::text,
  "Best Bookie" text null,
  "Best Price" double precision null,
  "Market %" double precision null,
  "Sportsbet" double precision null,
  "Pointsbet" double precision null,
  "Unibet" double precision null,
  "Palmerbet" double precision null,
  "Betright" double precision null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint nrl_tryscorers_match_date_result_value_key unique ("Match", "Date", "Result", "Value")
);

create index if not exists idx_nrl_tryscorers_match_date
  on public."NRL Tryscorers" using btree ("Match", "Date");

create index if not exists idx_nrl_tryscorers_result
  on public."NRL Tryscorers" using btree ("Result");

create or replace function public.set_nrl_tryscorers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nrl_tryscorers_updated_at on public."NRL Tryscorers";
create trigger trg_nrl_tryscorers_updated_at
before update on public."NRL Tryscorers"
for each row
execute function public.set_nrl_tryscorers_updated_at();

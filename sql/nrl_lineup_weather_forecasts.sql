-- nrl schema: cached match weather forecasts for lineups and model features
-- Run in Supabase SQL editor.

create table if not exists nrl.lineup_weather_forecasts (
  match_id text primary key,
  kickoff_utc timestamptz null,
  venue text null,
  location text null,
  provider text not null default 'Open-Meteo',
  forecast_time_utc timestamptz not null,
  weather_code integer null,
  condition text null,
  temperature_c numeric(6, 2) null,
  apparent_temperature_c numeric(6, 2) null,
  precipitation_probability_pct numeric(6, 2) null,
  precipitation_mm numeric(8, 3) null,
  wind_kmh numeric(7, 2) null,
  gust_kmh numeric(7, 2) null,
  fetched_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lineup_weather_forecasts_kickoff_idx
  on nrl.lineup_weather_forecasts (kickoff_utc desc);

create index if not exists lineup_weather_forecasts_fetched_idx
  on nrl.lineup_weather_forecasts (fetched_at desc);

create or replace function nrl.set_updated_at_lineup_weather_forecasts()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_lineup_weather_forecasts_updated_at on nrl.lineup_weather_forecasts;
create trigger trg_lineup_weather_forecasts_updated_at
before update on nrl.lineup_weather_forecasts
for each row
execute procedure nrl.set_updated_at_lineup_weather_forecasts();

grant usage on schema nrl to service_role;
grant select, insert, update, delete on table nrl.lineup_weather_forecasts to service_role;

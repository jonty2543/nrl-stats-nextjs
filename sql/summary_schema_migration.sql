-- Move existing precomputed summary tables out of nrl into summary.
-- Run once in Supabase SQL editor before the next hourly rebuild.

create schema if not exists summary;

alter table if exists nrl.fantasy_player_card_summary set schema summary;
alter table if exists nrl.fantasy_player_page_summary set schema summary;

grant usage on schema summary to anon, authenticated, service_role;

grant select on table summary.fantasy_player_card_summary to anon, authenticated;
grant select, insert, update, delete on table summary.fantasy_player_card_summary to service_role;

grant select on table summary.fantasy_player_page_summary to anon, authenticated;
grant select, insert, update, delete on table summary.fantasy_player_page_summary to service_role;

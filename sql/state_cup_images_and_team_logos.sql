create schema if not exists nrl;

alter table nrl.state_cup_player_stats
    add column if not exists head_image text,
    add column if not exists body_image text;

alter table nrl.state_cup_player_info
    add column if not exists head_image text,
    add column if not exists body_image text,
    add column if not exists background_image text;

create table if not exists nrl.state_cup_team_logos (
    competition_id integer not null,
    competition text not null,
    team_id bigint not null,
    team text,
    team_name text,
    team_url text,
    theme_key text,
    logo_url text not null,
    logos jsonb not null default '{}'::jsonb,
    last_seen_match_date date,
    scraped_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    primary key (competition_id, team_id)
);

alter table nrl.state_cup_team_logos
    add column if not exists competition_id integer,
    add column if not exists competition text,
    add column if not exists team_id bigint,
    add column if not exists team text,
    add column if not exists team_name text,
    add column if not exists team_url text,
    add column if not exists theme_key text,
    add column if not exists logo_url text,
    add column if not exists logos jsonb not null default '{}'::jsonb,
    add column if not exists last_seen_match_date date,
    add column if not exists scraped_at timestamptz not null default now(),
    add column if not exists created_at timestamptz not null default now();

create index if not exists state_cup_team_logos_team_idx
    on nrl.state_cup_team_logos (team);
